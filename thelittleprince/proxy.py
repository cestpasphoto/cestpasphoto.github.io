"""
Bridge between the web page (common/game.js + thelittleprince/tlp.js) and the
Little Prince engine, running inside Pyodide.

Python owns the game state AND the interaction state (selected market card or
stack); JS only mirrors the JSON returned by get_render_state() and sends clicks
back through handle_action().

Frames. Actions are relative to the actor (designated seat = actor + delta) but
Board._apply() takes the actor's absolute seat, so every move is applied in the
ABSOLUTE frame, like Arena does: board rows p = seat p. Only the AI search works
in the canonical frame (game.js calls g.getCanonicalForm).

Turn. The first player of a turn chooses a stack (action n*n + t): n cards of
that type are drawn. Each player takes one card and designates who plays next
among those who have not played this turn. Board.make_move() resolves every
decision with a single legal option (last card of a turn, last stack type left);
_play() replays that loop move by move so that the journal shows them.

Undo. A snapshot is taken before each human card take, never before a stack
choice: undo never lets a human redraw the cards of the turn being played.
"""
import base64
import json
import zlib
import numpy as np

from MCTS import MCTS
from TLPGame import TLPGame as Game, NUMBER_PLAYERS
from TLPLogicNumba import (Board, my_unpackbits, int8_to_uint, slots_in_planet, np_all_cards,
                           FACE_DOWN, BAOBAB, VOLCANO, SUNSET, ROSE, LAMPPOST, BOX, BIG_STAR, ELEPHANT,
                           SNAKE, SHEEP_WHITE, SHEEP_GREY, SHEEP_BROWN, CARD_TYPE, EMPTY, CORNER, NB_CARD_TYPES)


# MCTS arguments of the page: common part, then one profile per value of NUMBER_PLAYERS (checked by make_web_py.py)
MCTS_COMMON = dict(prob_fullMCTS=1., forced_playouts=False, no_mem_optim=False)
MCTS_PROFILES = {
    3: dict(fpu=0.1, fpu_root=0., cpuct=1.25, universes=1),
    4: dict(fpu=0.1, fpu_root=0., cpuct=1.25, universes=1),
    5: dict(fpu=0.1, fpu_root=0., cpuct=1.25, universes=1),
}


class dotdict(dict):
    def __getattr__(self, name):
        return self[name]


P = NUMBER_PLAYERS
NN = P * P                     # first stack action
N_ROUNDS = 16 * P              # one card per player and per turn, 16 turns
MAX_EVENTS = 150
CORNERS = (0, 3, 12, 15)
STACK_ICON = ['◼', '◢', '◣', '👤']
STACK_NAME = ['Center', 'Uphill edge', 'Downhill edge', 'Character']
CHAR_EMOJI = ['', '🎩', '🗺️', '🔭', '👑', '🕯️', '🏹', '🍷', '💼', '💼', '💼', '🧑‍🌾', '🌠', '🤴']

g = None             # Game; g.board is the scratch board of MCTS, never read here
board = None         # current state, absolute frame
player = 0           # seat that must act next
ply = 0              # count of actions submitted to Game.getNextState so far, == Arena's `it`
mcts = None
eng = rd = None      # scratch boards owned by this module
history = []         # snapshots taken before each human card take
events = []          # journal, see _ev()
next_id = 1
marks = [0] * P      # per seat: last event id after that seat's latest card take
sel = None           # ('card', market slot) or ('stack', t) or None
end_announced = False


# =============================================================================
# Entry points called by game.js
# =============================================================================

def init_game(numMCTSSims):
    global g, board, player, ply, mcts, eng, rd, history, events, next_id, marks, sel, end_announced
    g = Game()
    eng, rd = Board(P), Board(P)
    board = np.copy(g.getInitBoard())   # empty market: seat 0 opens by choosing a stack
    player = 0
    ply = 0
    mcts_args = dotdict(MCTS_COMMON, numMCTSSims=numMCTSSims, **MCTS_PROFILES[NUMBER_PLAYERS])
    mcts = MCTS(g, None, mcts_args)
    history, events, next_id, marks, sel, end_announced = [], [], 1, [0] * P, None, False
    _ev('— New game —', k='turn')
    return get_render_state()


def changeDifficulty(numMCTSSims):
    if mcts is not None:
        mcts.args.numMCTSSims = numMCTSSims


def set_edit_mode(mode):
    return get_render_state()   # no edit mode for The Little Prince


def getNextState(action):
    # AI move (game.js): no snapshot
    global sel
    _play(int(action))
    sel = None
    return get_render_state()


def handle_action(action_name, *args):
    global sel
    if g is None:
        return json.dumps({"viewData": {}, "extra": {}})
    args = [a.to_py() if hasattr(a, 'to_py') else a for a in args]

    if action_name == 'undo':
        _undo()
    elif _ended():
        pass
    elif action_name == 'select':
        item = (str(args[0]), int(args[1]))
        sel = None if item == sel else item
    elif action_name == 'cancel':
        sel = None
    elif action_name == 'play':
        a = int(args[0])
        if _legal(a):
            if a < NN:
                _snapshot()
            _play(a)
            sel = None
    return get_render_state()


# =============================================================================
# Playing a decision
# =============================================================================

def _valids():
    rd.copy_state(board, False)
    return rd.valid_moves(player)


def _legal(a):
    return 0 <= a < NN + NB_CARD_TYPES and bool(_valids()[a])


def _ended():
    rd.copy_state(board, False)
    return bool(np.any(rd.check_end_game()))


def _play(action):
    """Apply one decision, then the forced ones exactly as Board.make_move() does,
    describing each of them in the journal."""
    global board, player, ply
    eng.copy_state(board, True)
    who, move = player, action
    for _guard in range(4 * N_ROUNDS):
        before = np.copy(eng.get_state())
        nxt = int(eng._apply(move, who, 0))              # random_seed 0 = true randomness
        _describe(who, move, before, np.copy(eng.get_state()), nxt)
        who = nxt
        if eng.get_round() >= N_ROUNDS:
            break
        valids = eng.valid_moves(who)
        if valids.sum() != 1:
            break
        move = int(np.flatnonzero(valids)[0])
    board = np.copy(eng.get_state())
    player = who
    ply += 1                                             # one submitted action == one Arena `it`
    _announce_end()


# =============================================================================
# Undo
# =============================================================================

def _snapshot():
    history.append((np.copy(board), player, ply, [dict(e) for e in events], next_id, list(marks), end_announced))


def _undo():
    global board, player, ply, events, next_id, marks, end_announced, sel
    if history:
        board, player, ply, events, next_id, marks, end_announced = history.pop()
    sel = None


# =============================================================================
# Scores
# =============================================================================

def _planet(st, p):
    return st[2 * P + 1 + 16 * p: 2 * P + 1 + 16 * (p + 1)]


def _market(st):
    return st[1:P + 1]


def _score(st, p):
    rd.copy_state(st, False)
    return int(rd.get_score(p))


def _breakdown(st, p):
    """Points of each character of seat p, in planet order, then the volcano
    penalty: [[character, points], ..., ['vol', points]]. Same rules as
    Board._update_score(); the sum equals Board.get_score()."""
    cards = _planet(st, p)
    s = [int(x) for x in cards.sum(axis=0)]
    sheep = [s[SHEEP_WHITE], s[SHEEP_GREY], s[SHEEP_BROWN]]
    out = []
    for slot in CORNERS:
        ch = max(int(cards[slot, CARD_TYPE]) - CORNER, 0)
        if ch == 0:
            continue
        if ch == 1:    v = 4 * s[SNAKE]
        elif ch == 2:  v = sum(1 for k in range(16) if k not in CORNERS and cards[k, CARD_TYPE] != EMPTY and cards[k, VOLCANO] == 0)
        elif ch == 3:  v = 2 * s[SUNSET]
        elif ch == 4:  v = [0, 14, 7, 0][min(s[ROSE], 3)]
        elif ch == 5:  v = s[LAMPPOST]
        elif ch == 6:  v = 3 * (s[SNAKE] > 0) + 3 * (s[ELEPHANT] > 0) + 3 * (sum(sheep) > 0)
        elif ch == 7:  v = 3 * s[FACE_DOWN]
        elif ch == 8:  v = 2 * s[SHEEP_WHITE]
        elif ch == 9:  v = 3 * s[SHEEP_GREY]
        elif ch == 10: v = 5 * s[SHEEP_BROWN]
        elif ch == 11: v = 7 * s[BAOBAB]
        elif ch == 12: v = s[BIG_STAR]
        else:          v = 3 * sum(1 for x in sheep if x > 0) + s[BOX]
        out.append([ch, int(v)])
    vols = [int(_planet(st, q)[:, VOLCANO].sum()) for q in range(P)]
    out.append(['vol', -max(vols) if vols[p] == max(vols) else 0])
    return out


def _why(b0, b1):
    """'🔭 +2 · 🌋 −1': per-source differences between two breakdowns of a seat.
    Entries are matched by (source, rank among equal sources): a character taken
    meanwhile is the one entry missing from b0."""
    def keyed(b):
        seen, out = {}, {}
        for k, v in b:
            r = seen[k] = seen.get(k, -1) + 1
            out[(k, r)] = v
        return out
    k0, parts = keyed(b0), []
    for (k, r), v in keyed(b1).items():
        d = v - k0.get((k, r), 0)
        if d:
            parts.append(f"{'🌋' if k == 'vol' else CHAR_EMOJI[k]} {_signed(d)}")
    return ' · '.join(parts)


def _signed(d):
    return f'+{d}' if d > 0 else (f'−{-d}' if d < 0 else '±0')


def _take_preview(i):
    """Score change of the player to move if they take market card i: (delta, why)."""
    eng.copy_state(board, True)
    eng._take_card(i, player)
    eng._update_score(player)
    after = np.copy(eng.get_state())
    return _score(after, player) - _score(board, player), _why(_breakdown(board, player), _breakdown(after, player))


# =============================================================================
# Journal
# =============================================================================

def _ev(text, **kw):
    global next_id
    e = dict(id=next_id, t=text)
    e.update({k: v for k, v in kw.items() if v is not None})
    events.append(e)
    next_id += 1
    if len(events) > MAX_EVENTS:
        del events[0]
    return e


def _card(row):
    return [int(x) for x in row]


def _describe(who, move, before, after, nxt):
    if move >= NN:
        t = move - NN
        rd.copy_state(after, False)
        _ev(f'— Turn {int(rd.get_round()) // P + 1}: @{who} chose {STACK_ICON[t]} {STACK_NAME[t]} —', k='turn')
        drawn = [_card(r) for r in _market(after) if r[CARD_TYPE] != EMPTY]
        _ev('Drawn: ' + ' '.join(f'%c{i}' for i in range(len(drawn))), c=drawn)
        return
    i = move // P
    d = _score(after, who) - _score(before, who)
    text = f'@{who} took %c0 <b>{_signed(d)}</b>'
    others = [(q, _score(after, q) - _score(before, q)) for q in range(P) if q != who]
    text += ''.join(f' · @{q} 🌋{_signed(x)}' for q, x in others if x)
    rd.copy_state(after, False)
    if nxt != who:
        text += f' → @{nxt}'
    elif int(rd.get_round()) < N_ROUNDS:
        text += ' · opens the next turn'
    _ev(text, c=[_card(_market(before)[i])])
    if _planet(after, who)[:, FACE_DOWN].sum() > _planet(before, who)[:, FACE_DOWN].sum():
        _ev(f'🌳🌳🌳 @{who}: baobab cards turn face down')
    marks[who] = next_id - 1          # this seat's journal restarts here


def _announce_end():
    global end_announced
    if end_announced or not _ended():
        return
    end_announced = True
    rd.copy_state(board, False)
    res = rd.check_end_game()
    for p in range(P):
        if res[p] > 0:
            _ev(f'🏆 @{p} wins with {_score(board, p)} points', k='turn')


# =============================================================================
# Rendering
# =============================================================================

def _state_id():
    """Same wire format as Arena.playGame's `initial_state` (pit.py --state / -s):
    raw board bytes (absolute frame, int8) + current player (1 byte) + ply count
    (2 bytes, big-endian), deflated (wbits=-15) and base64-encoded."""
    data = board.tobytes() + bytes([int(player) & 0xFF]) + int(ply & 0xFFFF).to_bytes(2, 'big')
    co = zlib.compressobj(9, zlib.DEFLATED, -15)
    raw = co.compress(data) + co.flush()
    return base64.b64encode(raw).decode('ascii')


def _who_can_play(st):
    return [int(x) for x in my_unpackbits(int8_to_uint(st[0, 2]))[:P]]


def _available():
    rd.copy_state(board, False)
    return rd._available_cards()


def _room(t):
    """Free slots of stack type t (0-3) on a planet: the same for every seat."""
    cards = _planet(board, player)
    return sum(1 for k in slots_in_planet((t + 1) * 25) if cards[k, CARD_TYPE] == EMPTY)


def _view():
    rd.copy_state(board, False)
    vols = [int(_planet(board, q)[:, VOLCANO].sum()) for q in range(P)]
    can = _who_can_play(board)
    players = []
    for p in range(P):
        players.append(dict(
            score=_score(board, p),
            breakdown=_breakdown(board, p),
            planet=[_card(r) for r in _planet(board, p)],
            vol=vols[p], volMax=vols[p] == max(vols) and max(vols) > 0,
            played=not can[p],
        ))
    rd.copy_state(board, False)
    avail = _available()
    return dict(
        players=players,
        market=[_card(r) for r in _market(board)],
        stacksLeft=[int(avail[20 * t:20 * (t + 1)].sum()) for t in range(NB_CARD_TYPES)],
        round=int(rd.get_round()),
        events=events,
        marks=list(marks),
        stateId=_state_id(),
    )


def _choice(label, action, *args, color='', seat=None):
    c = dict(l=label, a=action, x=list(args), c=color)
    if seat is not None:
        c['s'] = int(seat)
    return c


def _stack_content(t):
    """What is still in stack t: characters with their count, or attribute totals."""
    avail = _available()
    left = [np_all_cards[t][k] for k in range(20) if avail[20 * t + k]]
    if t == NB_CARD_TYPES - 1:
        cnt = {}
        for c in left:
            ch = int(c[CARD_TYPE]) - CORNER
            cnt[ch] = cnt.get(ch, 0) + 1
        return dict(chars=[[k, cnt[k]] for k in sorted(cnt)])
    return dict(attrs=[int(sum(int(c[a]) for c in left)) for a in range(14)])


def _extra():
    global sel
    ex = dict(prompt='', choices=[], phase='', market=[], stacks=[], sel=None)
    if _ended():
        sel = None
        return ex
    valids = _valids()
    legal = set(int(a) for a in np.flatnonzero(valids))
    covered = set()
    choices = ex['choices']
    rd.copy_state(board, False)

    if rd._market_is_empty():
        ex['phase'] = 'stack'
        ex['prompt'] = 'open the turn: pick a stack'
        left = [int(x) for x in _view_stacks_left()]
        for t in range(NB_CARD_TYPES):
            ok = NN + t in legal
            ex['stacks'].append(dict(t=t, left=left[t], ok=ok))
            covered.add(NN + t)
        if sel and (sel[0] != 'stack' or NN + sel[1] not in legal):
            sel = None
        if sel:
            t = sel[1]
            ex['sel'] = dict(kind='stack', t=t, left=left[t], room=_room(t), **_stack_content(t))
            choices.append(_choice(f'Draw {P} {STACK_ICON[t]}', 'play', NN + t, color='green'))
            choices.append(_choice('Cancel', 'cancel', color='basic'))
    else:
        ex['phase'] = 'take'
        ex['prompt'] = 'take a card, then pick who plays next'
        for i, row in enumerate(_market(board)):
            if row[CARD_TYPE] == EMPTY:
                ex['market'].append(dict(card=None))
                continue
            takes = [i * P + dlt for dlt in range(P) if i * P + dlt in legal]
            covered.update(takes)
            d, why = _take_preview(i)
            ex['market'].append(dict(card=_card(row), delta=d, why=why, ok=bool(takes)))
        if sel and (sel[0] != 'card' or not ex['market'][sel[1]].get('ok')):
            sel = None
        if sel:
            i = sel[1]
            m = ex['market'][i]
            ex['sel'] = dict(kind='card', i=i, card=m['card'], delta=m['delta'], why=m['why'])
            for dlt in range(P):
                a = i * P + dlt
                if a in legal:
                    q = (player + dlt) % P
                    choices.append(_choice(f'Take · @{q} next', 'play', a, seat=q))
            choices.append(_choice('Cancel', 'cancel', color='basic'))

    # safety net: any legal move the widgets above cannot reach becomes a button
    if not sel:
        for a in sorted(legal - covered):
            choices.append(_choice(_label(a), 'play', a, color='basic'))
    return ex


def _view_stacks_left():
    avail = _available()
    return [avail[20 * t:20 * (t + 1)].sum() for t in range(NB_CARD_TYPES)]


def _label(a):
    if a >= NN:
        return f'Stack {STACK_ICON[a - NN]}'
    i, dlt = divmod(a, P)
    return f'Card {i + 1} · @{(player + dlt) % P} next'


def get_render_state():
    if g is None or board is None:
        return json.dumps({"viewData": {}, "extra": {}})
    rd.copy_state(board, False)
    end = rd.check_end_game()
    ended = bool(np.any(end))
    extra = _extra()
    return json.dumps({
        "viewData": _view(),
        "extra": extra,
        "statusMessage": extra['prompt'],
        "currentPlayer": int(player),
        "gameEnded": ended,
        "winners": [int(p) for p in range(P) if end[p] > 0] if ended else [],
        "canUndo": len(history) > 0,
        "editMode": 0,
    })

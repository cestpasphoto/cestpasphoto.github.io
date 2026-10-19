"""
Bridge between the web page (common/game.js + minivilles/minivilles.js) and the
Minivilles (Machi Koro) engine, running inside Pyodide.

Python owns the game state AND the interaction state (selected card); JS only
mirrors the JSON returned by get_render_state() and sends clicks back through
handle_action().

Frames. Actions do not depend on the seat, and the engine is frame-invariant
(ties are broken in seat order after the roller), so every move is applied in
the ABSOLUTE frame, like Arena does: board row p = seat p. Only the AI search
works in the canonical frame (game.js calls g.getCanonicalForm).

Dice. The roll of a turn is resolved inside the previous make_move() (or by the
Train Station choice, actions 21/22, or the Radio Tower reroll, action 19).
Board keeps in column 1 the state just before the latest roll, so the journal
reads every roll's income as column 0 - column 1.

Undo. A snapshot is taken before each human buy/pass (actions 0-18, 20), i.e.
after the human's own roll: undo never lets a human redraw the dice of the turn
being played.
"""
import base64
import json
import zlib
import numpy as np

from MCTS import MCTS
from MinivillesGame import MinivillesGame as Game, NUMBER_PLAYERS
from MinivillesLogicNumba import Board, cards_cost, monuments_cost


# MCTS arguments of the page: common part, then one profile per value of NUMBER_PLAYERS (checked by make_web_py.py)
MCTS_COMMON = dict(prob_fullMCTS=1., forced_playouts=False, no_mem_optim=False)
MCTS_PROFILES = {
    2: dict(fpu=0.1, fpu_root=0., cpuct=1.25, universes=1),
    3: dict(fpu=0.1, fpu_root=0., cpuct=1.25, universes=1),
    4: dict(fpu=0.1, fpu_root=0., cpuct=1.25, universes=1),
}


class dotdict(dict):
    def __getattr__(self, name):
        return self[name]


P = NUMBER_PLAYERS
N_CARDS, N_LANDMARKS = 15, 4
A_LANDMARK, A_REROLL, A_PASS, A_ONE_DIE, A_TWO_DICE = 15, 19, 20, 21, 22
STATION, MALL, PARK, RADIO = 0, 1, 2, 3
MAX_EVENTS = 150

CARD_EMOJI = ['🌾', '🐄', '🥖', '☕', '🏪', '🌲', '🏟️', '🏢', '📺', '🧀', '🪑', '⛏️', '🍝', '🍎', '🧺']
CARD_NAMES = ['Wheat Field', 'Ranch', 'Bakery', 'Cafe', 'Convenience Store', 'Forest', 'Stadium',
              'Business Center', 'TV Station', 'Cheese Factory', 'Furniture Factory', 'Mine',
              'Family Restaurant', 'Apple Orchard', 'Fruit Market']
# Activation numbers and colour: b = anyone's roll, g/p = owner's roll, r = another player's roll
CARD_DICE = [(1,), (2,), (2, 3), (3,), (4,), (5,), (6,), (6,), (6,), (7,), (8,), (9,), (9, 10), (10,), (11, 12)]
CARD_COLOR = 'bbgrgbpppggbrbg'
PURPLE = (6, 7, 8)
LM_EMOJI = ['🚉', '🛍️', '🎡', '📡']
LM_NAMES = ['Train Station', 'Shopping Mall', 'Amusement Park', 'Radio Tower']

g = None             # Game; g.board is the scratch board of MCTS, never read here
board = None         # current state, absolute frame
player = 0           # seat that must act next
ply = 0              # count of actions submitted to Game.getNextState so far, == Arena's `it`
mcts = None
eng = rd = None      # scratch boards owned by this module
history = []         # snapshots taken before each human buy/pass
events = []          # journal, see _ev()
next_id = 1
marks = [0] * P      # per seat: last event id before that seat ended its previous turn
sel = -1             # selected row of the table: card 0-14, landmark 15-18, or -1
end_announced = False


# =============================================================================
# Entry points called by game.js
# =============================================================================

def init_game(numMCTSSims):
    global g, board, player, ply, mcts, eng, rd, history, events, next_id, marks, sel, end_announced
    g = Game()
    eng, rd = Board(P), Board(P)
    board = np.copy(g.getInitBoard())   # first roll of seat 0 already resolved (no Train Station yet)
    player = 0
    ply = 0
    mcts_args = dotdict(MCTS_COMMON, numMCTSSims=numMCTSSims, **MCTS_PROFILES[NUMBER_PLAYERS])
    mcts = MCTS(g, None, mcts_args)
    history, events, next_id, marks, sel, end_announced = [], [], 1, [0] * P, -1, False
    _ev('— New game —', k='turn')
    _ev(f'— Turn 1: @0 —', k='turn')
    _describe_roll(0, board)
    return get_render_state()


def changeDifficulty(numMCTSSims):
    if mcts is not None:
        mcts.args.numMCTSSims = numMCTSSims


def set_edit_mode(mode):
    return get_render_state()   # no edit mode for Minivilles


def getNextState(action):
    # AI move (game.js): no snapshot
    global sel
    _play(int(action))
    sel = -1
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
        i = int(args[0])
        sel = -1 if (i == sel or not 0 <= i < N_CARDS + N_LANDMARKS) else i
    elif action_name == 'cancel':
        sel = -1
    elif action_name == 'play':
        a = int(args[0])
        if _legal(a):
            if a < A_REROLL or a == A_PASS:
                _snapshot()
            _play(a)
            sel = -1
    return get_render_state()


# =============================================================================
# Playing a decision
# =============================================================================

def _valids():
    rd.copy_state(board, False)
    return rd.valid_moves(player)


def _legal(a):
    return 0 <= a < 23 and bool(_valids()[a])


def _ended():
    rd.copy_state(board, False)
    return bool(np.any(rd.check_end_game()))


def _play(action):
    global board, player, ply
    actor = player
    before = np.copy(board)
    eng.copy_state(board, True)
    nxt = int(eng.make_move(action, actor, 0))     # random_seed 0 = true randomness
    board = np.copy(eng.get_state())
    player = nxt
    ply += 1                                         # one submitted action == one Arena `it`
    _describe(actor, action, before, board, nxt)
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
    sel = -1


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


def _money(st, p, col=0):
    return int(st[18 + p, col])


def _cards(st, p, col=0):
    return [int(x) for x in st[18 + P + 15 * p: 18 + P + 15 * (p + 1), col]]


def _landmarks(st, p, col=0):
    return [int(x) for x in st[18 + 16 * P + 4 * p: 18 + 16 * P + 4 * (p + 1), col]]


def _triggered(st, p, roller, d):
    """Cards of seat p activated by roller's roll of d, as '🐄×3 🥖'."""
    out = []
    for i, n in enumerate(_cards(st, p, 1)):
        if n == 0 or d not in CARD_DICE[i]:
            continue
        c = CARD_COLOR[i]
        if c == 'b' or (c in 'gp' and p == roller) or (c == 'r' and p != roller):
            out.append(CARD_EMOJI[i] + (f'×{n}' if n > 1 else ''))
    return ' '.join(out)


def _describe_roll(roller, st, reroll=False):
    """Roll event of `roller`, reading column 1 (just before the roll) against column 0."""
    d, n = int(st[1, 0]), int(st[1, 1])
    if d == 0:
        return
    double = bool(st[2, 0] & 2)
    how = ' with 2 dice' if n == 2 else ''
    _ev(f'@{roller} {"rerolled" if reroll else "rolled"} 🎲 {d}{how}{" (double)" if double else ""}', k='roll', d=d)
    for q in [roller] + [(roller + k) % P for k in range(1, P)]:
        delta = _money(st, q, 0) - _money(st, q, 1)
        why = _triggered(st, q, roller, d)
        if delta or why:
            _ev(f'@{q} {"+" if delta >= 0 else "−"}{abs(delta)}🪙' + (f' · {why}' if why else ''))
    # Business Center: an establishment changed hands
    changed = [q for q in range(P) if _cards(st, q, 0) != _cards(st, q, 1)]
    if len(changed) == 2 and roller in changed:
        target = changed[0] if changed[1] == roller else changed[1]
        diff = [a - b for a, b in zip(_cards(st, roller, 0), _cards(st, roller, 1))]
        got = [i for i in range(N_CARDS) if diff[i] > 0]
        gave = [i for i in range(N_CARDS) if diff[i] < 0]
        if got and gave:
            _ev(f'🏢 @{roller} swapped {CARD_EMOJI[gave[0]]} for {CARD_EMOJI[got[0]]} of @{target}')


def _describe(who, move, before, after, nxt):
    w = f'@{who}'
    if move < N_CARDS:
        _ev(f'{w} bought {CARD_EMOJI[move]} {CARD_NAMES[move]}')
    elif move < A_REROLL:
        m = move - A_LANDMARK
        _ev(f'{w} built {LM_EMOJI[m]} {LM_NAMES[m]}')
    elif move == A_PASS:
        _ev(f'{w} bought nothing')
    if move in (A_REROLL, A_ONE_DIE, A_TWO_DICE):
        _describe_roll(who, after, reroll=(move == A_REROLL))
        return
    # the turn ended: maybe again (double + park), then the next seat's roll
    marks[who] = next_id - 1          # this seat's journal restarts here
    if nxt == who:
        _ev(f'🎡 Double: {w} plays again')
    rd.copy_state(after, False)
    if rd.check_end_game().any():
        return
    _ev(f'— Turn {int(after[0, 0]) + 1}: @{nxt} —', k='turn')
    if after[2, 0] & 4:
        _ev(f'@{nxt} chooses 1 or 2 dice')
    else:
        _describe_roll(nxt, after)


def _announce_end():
    global end_announced
    if end_announced or not _ended():
        return
    end_announced = True
    rd.copy_state(board, False)
    res = rd.check_end_game()
    for p in range(P):
        if res[p] > 0:
            done = sum(_landmarks(board, p))
            _ev(f'🏆 @{p} wins' + (' with all 4 landmarks' if done == N_LANDMARKS else ''), k='turn')


# =============================================================================
# Income by roll
# =============================================================================

def _income_table():
    """For each seat p: coins p would get on its own roll of d (None if impossible),
    and [min, max] on another seat's roll of d (None if no other seat can roll d).
    Computed by applying the engine's own dice effect to copies of the current state."""
    gains = {}                                     # (roller, d) -> money delta of every seat
    for r in range(P):
        top = 12 if _landmarks(board, r)[STATION] else 6
        for d in range(1, top + 1):
            eng.copy_state(board, True)
            eng._dice_effect(d, player_who_rolled=r)
            gains[(r, d)] = [int(eng.players_money[q, 0]) - _money(board, q) for q in range(P)]
    table = []
    for p in range(P):
        own = [gains[(p, d)][p] if (p, d) in gains else None for d in range(1, 13)]
        others = []
        for d in range(1, 13):
            vals = [gains[(r, d)][p] for r in range(P) if r != p and (r, d) in gains]
            others.append([min(vals), max(vals)] if vals else None)
        table.append(dict(own=own, others=others))
    return table


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


def _view():
    rd.copy_state(board, False)
    players = []
    for p in range(P):
        players.append(dict(
            money=_money(board, p), cards=_cards(board, p), landmarks=_landmarks(board, p),
            score=int(rd.get_score(p)),
        ))
    st = int(board[2, 0])
    return dict(
        market=[int(x) for x in board[3:18, 0]],
        players=players,
        turn=int(board[0, 0]) + 1,
        dice=int(board[1, 0]),                 # 0 while awaiting the dice choice
        nDice=int(board[1, 1]),
        double=bool(st & 2),
        rerolled=bool(st & 1),
        awaiting=bool(st & 4),
        gained=_money(board, player, 0) - _money(board, player, 1),   # income of the current roll
        income=_income_table(),
        events=events,
        marks=list(marks),
        stateId=_state_id(),
    )


def _choice(label, action, *args, color=''):
    return dict(l=label, a=action, x=list(args), c=color)


def _why_not(i):
    """Why row i (card 0-14, landmark 15-18) cannot be bought now."""
    if board[2, 0] & 4:
        return 'Roll the dice first'
    money = _money(board, player)
    if i < N_CARDS:
        if board[3 + i, 0] == 0:
            return 'Sold out'
        if i in PURPLE and _cards(board, player)[i] > 0:
            return 'Only one per city'
        cost = int(cards_cost[i])
    else:
        if _landmarks(board, player)[i - N_CARDS] > 0:
            return 'Already built'
        cost = int(monuments_cost[i - N_CARDS])
    if money < cost:
        return f'Not enough coins: {money} of {cost}🪙'
    return ''


def _extra():
    ex = dict(prompt='', choices=[], act=[-1] * (N_CARDS + N_LANDMARKS), sel=sel, selWhy='', selAct=-1)
    if _ended():
        return ex
    valids = _valids()
    for i in range(N_CARDS + N_LANDMARKS):
        if valids[i]:
            ex['act'][i] = i
    choices = ex['choices']
    if board[2, 0] & 4:
        ex['prompt'] = 'Roll 1 or 2 dice'
        choices.append(_choice('🎲 1 die', 'play', A_ONE_DIE, color='primary'))
        choices.append(_choice('🎲🎲 2 dice', 'play', A_TWO_DICE, color='primary'))
        if sel >= 0:
            ex['selWhy'] = _why_not(sel)
        return ex

    if sel >= 0:
        cost = int(cards_cost[sel]) if sel < N_CARDS else int(monuments_cost[sel - N_CARDS])
        if valids[sel]:
            ex['selAct'] = sel
            verb = 'Buy' if sel < N_CARDS else 'Build'
            choices.append(_choice(f'{verb} for {cost}🪙', 'play', sel, color='green'))
        else:
            ex['selWhy'] = _why_not(sel)
        choices.append(_choice('Cancel', 'cancel', color='basic'))
    else:
        ex['prompt'] = 'Tap a row to see it, then buy · or pass'
        if valids[A_REROLL]:
            choices.append(_choice('📡 Reroll', 'play', A_REROLL, color='teal'))
        if valids[A_PASS]:
            choices.append(_choice('Pass', 'play', A_PASS, color='basic'))
    return ex


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

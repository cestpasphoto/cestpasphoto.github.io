"""
Bridge between the web page (common/game.js + botanik/botanik.js) and the
Botanik engine, running inside Pyodide.

Python owns the game state AND the interaction state (selected card, previewed
destination, orientation); JS only mirrors the JSON returned by
get_render_state() and sends clicks back through handle_action().

Frames. Board.make_move(move, player) takes the actor's absolute seat, so every
move is applied in the ABSOLUTE frame, like Arena does. Only the AI search works
in the canonical frame (game.js calls g.getCanonicalForm); an action means the
same thing in both frames (it only names the actor's own register, freed cards
and machine), so game.js hands it to getNextState() unchanged.

Turn. The main player puts one arrival card in their register or on the middle
row. A register card that no longer shares its colour or its type with the
middle card above it is freed; each freed card goes into its owner's machine,
a freed mecabot is first swapped with a middle card. The engine resolves none
of these decisions automatically, and neither does this page: a decision with a
single legal option is still asked.

Interaction. An arrival card is played as soon as a legal slot is tapped (tap
the card, then the slot). The other decisions are previewed before they are
played: tap a destination, then "Place". In the machine, tapping the
previewed cell again turns the card to its next legal orientation; tapping
another legal cell moves the preview and keeps the orientation when it is legal
there; tapping anywhere else cancels the preview.

Undo. A snapshot is taken before each human decision. Undoing the move that
emptied the arrival zone also undoes the draw: replaying it draws new cards.
"""
import base64
import json
import zlib
import numpy as np

from MCTS import MCTS
from BotanikGame import BotanikGame as Game, NUMBER_PLAYERS
from BotanikLogicNumba import Board, action_size, my_unpackbits, int8_to_packedUint, _reachable_from_source
from BotanikConstants import *


# MCTS arguments of the page: common part, then one profile per value of NUMBER_PLAYERS (checked by make_web_py.py)
MCTS_COMMON = dict(prob_fullMCTS=1., forced_playouts=False, no_mem_optim=False)
MCTS_PROFILES = {
    2: dict(fpu=0.1, fpu_root=0., cpuct=1.25, universes=1),
}


class dotdict(dict):
    def __getattr__(self, name):
        return self[name]


P = NUMBER_PLAYERS
N = MACHINE_SIZE
MM = N * N
A_MIDDLE, A_SWAP, A_EXPAND = 15, 30, 35
A_THROW = action_size() - 1
MAX_EVENTS = 150
EXPAND_PHASES = (MAINPL_TO_EXPAND_MACHINE, OTHERP_TO_EXPAND_MACHINE)
SWAP_PHASES = (MAINPL_TO_SWAP_MECABOT, OTHERP_TO_SWAP_MECABOT)

g = None             # Game; g.board is the scratch board of MCTS, never read here
board = None         # current state, absolute frame
player = 0           # seat that must act next
ply = 0              # count of actions submitted to Game.getNextState so far, == Arena's `it`
mcts = None
eng = rd = None      # scratch boards owned by this module
history = []         # snapshots taken before each human decision
events = []          # journal, see _ev()
next_id = 1
marks = [0] * P      # per seat: last event id before that seat's latest decision
last = []            # overlay keys touched by the latest decision (any seat)
ui = {}              # interaction state, see _reset_ui()
end_announced = False


# =============================================================================
# Entry points called by game.js
# =============================================================================

def init_game(numMCTSSims):
    global g, board, player, ply, mcts, eng, rd, history, events, next_id, marks, last, end_announced
    g = Game()
    eng, rd = Board(P), Board(P)
    board = np.copy(g.getInitBoard())
    player = 0
    ply = 0
    mcts_args = dotdict(MCTS_COMMON, numMCTSSims=numMCTSSims, **MCTS_PROFILES[NUMBER_PLAYERS])
    mcts = MCTS(g, None, mcts_args)
    history, events, next_id, marks, last, end_announced = [], [], 1, [0] * P, [], False
    _reset_ui()
    _ev('— New game —', k='turn')
    _ev('Arrival: %c0 %c1 %c2', c=[_card(r) for r in _arrival(board)])
    return get_render_state()


def changeDifficulty(numMCTSSims):
    if mcts is not None:
        mcts.args.numMCTSSims = numMCTSSims


def set_edit_mode(mode):
    return get_render_state()   # no edit mode for Botanik


def getNextState(action):
    # AI move (game.js): no snapshot
    _play(int(action))
    _reset_ui()
    return get_render_state()


def handle_action(action_name, *args):
    if g is None:
        return json.dumps({"viewData": {}, "extra": {}})
    args = [a.to_py() if hasattr(a, 'to_py') else a for a in args]

    if action_name == 'undo':
        _undo()
    elif _ended():
        pass
    elif action_name == 'arrival':
        _tap_arrival(int(args[0]))
    elif action_name == 'slot':
        _tap_slot(str(args[0]), int(args[1]), int(args[2]))
    elif action_name == 'freed':
        _tap_freed(int(args[0]), int(args[1]))
    elif action_name == 'cell':
        _tap_cell(int(args[0]), int(args[1]))
    elif action_name == 'place':
        a = _pending_action()
        if a >= 0 and _legal(a):
            _human(a)
    elif action_name == 'cancel':
        _reset_ui()
    elif action_name == 'play':                     # throw away, safety net
        a = int(args[0])
        if _legal(a):
            _human(a)
    return get_render_state()


# =============================================================================
# State accessors (absolute frame)
# =============================================================================

def _misc(st): return st[0]
def _arrival(st): return st[1, :3]
def _register(st, p): return st[2 + p]
def _middle(st): return st[4]
def _freed(st, p): return st[5, 2 * p:2 * p + 2]
def _phase(st): return int(st[0, 0, 1])
def _main(st): return int(st[0, 0, 2])
def _empty(card): return int(card[0]) == EMPTY
def _card(row): return [int(x) for x in row]


def _machine(st, p):
    rd.copy_state(st, False)
    return rd.p0_machine if p == 0 else rd.p1_machine


def _score(st, p):
    rd.copy_state(st, False)
    return int(rd.get_score(p))


def _deck_left(st):
    bits = st[0, 3:5, :5].astype(np.uint8)
    return int(sum(int(my_unpackbits(int8_to_packedUint(bits[:, c])).sum()) for c in range(5)))


# =============================================================================
# Playing a decision
# =============================================================================

def _valids():
    rd.copy_state(board, False)
    return rd.valid_moves(player)


def _legal(a):
    return 0 <= a < action_size() and bool(_valids()[a])


def _ended():
    rd.copy_state(board, False)
    return bool(np.any(rd.check_end_game(player)))


def _play(action):
    global board, player, ply, last
    before = np.copy(board)
    eng.copy_state(board, True)
    nxt = int(eng.make_move(action, player, 0))         # random_seed 0 = true randomness
    board = np.copy(eng.get_state())
    who, player = player, nxt
    ply += 1                                            # one submitted action == one Arena `it`
    _describe(who, action, before, board)
    _announce_end()


def _human(a):
    _snapshot()
    _play(a)
    _reset_ui()


# =============================================================================
# Interaction: taps build a preview, "Place" plays it
# =============================================================================

def _reset_ui():
    global ui
    keep = ui.get('orient') if ui else None
    ui = dict(src=None, dst=None, orient=keep)


def _register_actions(src):
    """{('reg' | 'mid', slot): action} for arrival card `src`."""
    valids = _valids()
    out = {}
    for s in range(5):
        if valids[src * 5 + s]:
            out[('reg', s)] = src * 5 + s
        if valids[A_MIDDLE + src * 5 + s]:
            out[('mid', s)] = A_MIDDLE + src * 5 + s
    return out


def _expand_base(c):
    return A_EXPAND + 4 * MM * c


def _orients(c, cell):
    valids = _valids()
    b = _expand_base(c) + 4 * cell
    return [o for o in range(4) if valids[b + o]]


def _freed_ok(c):
    return not _empty(_freed(board, player)[c]) and any(
        _valids()[_expand_base(c):_expand_base(c) + 4 * MM])


def _src_freed():
    """Freed card being placed: the selected one, else the first that has room."""
    if ui['src'] is not None and _freed_ok(ui['src']):
        return ui['src']
    for c in range(2):
        if _freed_ok(c):
            return c
    return None


def _tap_arrival(i):
    if _phase(board) != PLAYER_TO_PUT_TO_REGISTER or _empty(_arrival(board)[i]):
        return
    if ui['src'] == i:
        _reset_ui()
        return
    ui['src'] = i


def _tap_slot(row, p, s):
    ph = _phase(board)
    if ph == PLAYER_TO_PUT_TO_REGISTER:
        # no preview for an arrival card: a legal slot plays it at once
        if ui['src'] is None or (row == 'reg' and p != player):
            return
        a = _register_actions(ui['src']).get((row, s), -1)
        if a >= 0:
            _human(a)
    elif ph in SWAP_PHASES:
        ui['dst'] = s if row == 'mid' and _valids()[A_SWAP + s] else None


def _tap_freed(p, c):
    if _phase(board) in EXPAND_PHASES and p == player and _freed_ok(c):
        ui['src'] = c
        if ui['dst'] is not None and not _orients(c, ui['dst']):
            ui['dst'] = None


def _tap_cell(p, cell):
    if _phase(board) not in EXPAND_PHASES or p != player:
        return
    c = _src_freed()
    if c is None:
        return
    ui['src'] = c
    opts = _orients(c, cell)
    if not opts:
        ui['dst'] = None                                # tap outside the legal cells = cancel
    elif ui['dst'] == cell:
        o = ui['orient'] if ui['orient'] in opts else opts[0]
        ui['orient'] = opts[(opts.index(o) + 1) % len(opts)]
    else:
        ui['dst'] = cell
        if ui['orient'] not in opts:
            ui['orient'] = opts[0]


def _pending_action():
    ph = _phase(board)
    if ph in SWAP_PHASES and ui['dst'] is not None:
        return A_SWAP + ui['dst']
    if ph in EXPAND_PHASES and ui['dst'] is not None:
        c = _src_freed()
        if c is not None and ui['orient'] in _orients(c, ui['dst']):
            return _expand_base(c) + 4 * ui['dst'] + ui['orient']
    return -1


def _freed_by(st0, st1):
    """[(seat, slot, card)] of register cards that left their register between
    two states, i.e. that were freed."""
    out = []
    for q in range(P):
        for s in range(5):
            if not _empty(_register(st0, q)[s]) and _empty(_register(st1, q)[s]):
                out.append((q, s, _card(_register(st0, q)[s])))
    return out


def _simulate(a):
    """State after action a, without the arrival draw (no randomness)."""
    eng.copy_state(board, True)
    try:
        if a < A_MIDDLE:
            eng._move_to_register(a, player)
        elif a < A_SWAP:
            eng._move_to_middle_row_and_unlink(a, player)
        elif a < A_EXPAND:
            eng._swap_mecabot(a, player)
        elif a < A_THROW:
            eng._expand_machine(a, player)
    except Exception:
        return None
    return np.copy(eng.get_state())


def _rotated(card, o):
    c = _card(card)
    c[NORTH:] = [int(v) for v in np.roll(np.array(c[NORTH:]), o)]
    return c


# =============================================================================
# Undo
# =============================================================================

def _snapshot():
    history.append((np.copy(board), player, ply, [dict(e) for e in events], next_id, list(marks), list(last), end_announced))


def _undo():
    global board, player, ply, events, next_id, marks, last, end_announced
    if history:
        board, player, ply, events, next_id, marks, last, end_announced = history.pop()
    _reset_ui()


# =============================================================================
# Scores
# =============================================================================

def _groups(st, p):
    """[[colour, cards, flowers, points]] of seat p's scoring groups, best first.
    Same rules as _compute_score(): cards connected to the source; pipe-connected
    groups of one colour score their cards (if 3 or more) plus their flowers."""
    m = np.copy(_machine(st, p))
    reach = _reachable_from_source(m)
    done = np.zeros((N, N), dtype=bool)
    out = []
    for y0 in range(N):
        for x0 in range(N):
            if not reach[y0, x0] or done[y0, x0] or m[y0, x0, 0] == SOURCE:
                continue
            col, cards, fl = int(m[y0, x0, 0]), 0, 0
            done[y0, x0] = True
            stack = [(y0, x0)]
            while stack:
                y, x = stack.pop()
                cards, fl = cards + 1, fl + int(m[y, x, 1])
                for d, (dy, dx) in enumerate(((-1, 0), (0, 1), (1, 0), (0, -1))):
                    ny, nx = y + dy, x + dx
                    if 0 <= ny < N and 0 <= nx < N and m[y, x, NORTH + d] > 0 and reach[ny, nx] \
                            and not done[ny, nx] and m[ny, nx, 0] == col:
                        done[ny, nx] = True
                        stack.append((ny, nx))
            pts = cards + fl if cards >= 3 else fl
            out.append([col, cards, fl, pts])
    out.sort(key=lambda g_: -g_[3])
    return out


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


def _signed(d):
    return f'+{d}' if d > 0 else (f'−{-d}' if d < 0 else '±0')


def _describe(who, move, before, after):
    global last
    marks[who] = next_id - 1          # this seat's journal restarts at its latest decision
    w = f'@{who}'
    if move < A_MIDDLE:
        i, s = divmod(move, 5)
        _ev(f'{w} put %c0 in their register, slot {s + 1}', c=[_card(_arrival(before)[i])])
        last = [f'reg.{who}.{s}']
    elif move < A_SWAP:
        i, s = divmod(move - A_MIDDLE, 5)
        _ev(f'{w} put %c0 on middle slot {s + 1}, discarding %c1',
            c=[_card(_arrival(before)[i]), _card(_middle(before)[s])])
        last = [f'mid.{s}']
    elif move < A_EXPAND:
        s = move - A_SWAP
        _ev(f'{w} swapped their %c0 with %c1 of middle slot {s + 1}',
            c=[_card(_freed(before, who)[0]), _card(_middle(before)[s])])
        last = [f'mid.{s}']
    elif move < A_THROW:
        c, rest = divmod(move - A_EXPAND, 4 * MM)
        cell, o = divmod(rest, 4)
        d = _score(after, who) - _score(before, who)
        y, x = divmod(cell, N)
        _ev(f'{w} placed %c0 in their machine <b>{_signed(d)}</b>',
            c=[_card(_machine(after, who)[y, x])])
        last = [f'cell.{who}.{cell}']
    else:
        thrown = [_card(r) for r in _freed(before, who) if not _empty(r)]
        _ev(f'{w} threw away ' + ' '.join(f'%c{i}' for i in range(len(thrown))) + ' (no room)', c=thrown)
        last = []
    for q, s, card in _freed_by(before, after):
        if move < A_MIDDLE and q == who:
            continue
        _ev(f'@{q}: %c0 is freed', c=[card])
    rd.copy_state(after, False)
    if _phase(after) == PLAYER_TO_PUT_TO_REGISTER and not np.any(rd.check_end_game(_main(after))):
        _ev(f'— Round {int(rd.get_round()) + 1}: @{_main(after)} —', k='turn')
        left = sum(1 for r in _arrival(before) if not _empty(r)) - (1 if move < A_SWAP else 0)
        if left == 0:                     # the arrival zone was refilled from the deck
            _ev('New arrival: ' + ' '.join(f'%c{i}' for i in range(3)), c=[_card(r) for r in _arrival(after)])


def _announce_end():
    global end_announced
    if end_announced or not _ended():
        return
    end_announced = True
    rd.copy_state(board, False)
    res = rd.check_end_game(player)
    if res[0] > 0 and res[1] > 0:
        _ev(f'🤝 Tie: {_score(board, 0)} points each, same number of connected cards', k='turn')
        return
    for p in range(P):
        if res[p] > 0:
            tie = ' (more connected cards)' if _score(board, 0) == _score(board, 1) else ''
            _ev(f'🏆 @{p} wins with {_score(board, p)} points{tie}', k='turn')


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
    players = []
    for p in range(P):
        m = _machine(board, p)
        reach = _reachable_from_source(np.copy(m))
        players.append(dict(
            score=_score(board, p),
            groups=_groups(board, p),
            register=[_card(r) for r in _register(board, p)],
            freed=[_card(r) for r in _freed(board, p)],
            machine=[_card(m[y, x]) for y in range(N) for x in range(N)],
            reach=[int(reach[y, x]) for y in range(N) for x in range(N)],
        ))
    rd.copy_state(board, False)
    return dict(
        players=players,
        middle=[_card(r) for r in _middle(board)],
        arrival=[_card(r) for r in _arrival(board)],
        deck=_deck_left(board),
        round=int(rd.get_round()) + 1,
        main=_main(board),
        events=events,
        marks=list(marks),
        last=list(last),
        stateId=_state_id(),
    )


def _choice(label, action, *args, color=''):
    return dict(l=label, a=action, x=list(args), c=color)


def _extra():
    """Prompt, choices and the overlay: {key: {m: mode, g: ghost card}} with keys
    'arr.i', 'mid.s', 'reg.p.s', 'freed.p.c', 'cell.p.k'. Modes: sel, legal,
    ghost (previewed destination, g = card shown there), warn (would be freed)."""
    ex = dict(prompt='', sel='', c=[], choices=[], ov={}, canPlace=False,
              canCancel=ui['src'] is not None or ui['dst'] is not None)
    if _ended():
        return ex
    ov, cards = ex['ov'], ex['c']
    ph, me = _phase(board), player
    valids = _valids()
    legal = set(int(a) for a in np.flatnonzero(valids))
    covered = set()

    def put(key, mode, ghost=None):
        ov[key] = dict(m=mode, g=ghost)

    def cref(card):
        cards.append(_card(card))
        return f'%c{len(cards) - 1}'

    def frees(st1):
        out = _freed_by(board, st1)
        for q, s, card in out:
            put(f'reg.{q}.{s}', 'warn')
        return ''.join(f' Frees @{q}\'s {cref(card)}.' for q, s, card in out)

    if ph == PLAYER_TO_PUT_TO_REGISTER:
        covered.update(a for a in legal if a < A_SWAP)
        for i in range(3):
            if any(a // 5 == i for a in legal if a < A_MIDDLE) or any((a - A_MIDDLE) // 5 == i for a in legal if A_MIDDLE <= a < A_SWAP):
                put(f'arr.{i}', 'sel' if ui['src'] == i else 'ok')
        if ui['src'] is None:
            ex['prompt'] = 'pick an arrival card'
        else:
            acts = _register_actions(ui['src'])
            for (row, s), a in acts.items():
                put(f'reg.{me}.{s}' if row == 'reg' else f'mid.{s}', 'legal')
            card = _arrival(board)[ui['src']]
            ex['prompt'] = 'tap a highlighted slot: the card is played at once'
            ex['sel'] = f'{cref(card)} selected: your register keeps it, a middle slot discards its card ' \
                        'and may free register cards. Tap the card again to deselect.'

    elif ph in SWAP_PHASES:
        covered.update(a for a in legal if A_SWAP <= a < A_EXPAND)
        bot = _freed(board, me)[0]
        put(f'freed.{me}.0', 'sel')
        for s in range(5):
            if A_SWAP + s in legal:
                put(f'mid.{s}', 'legal')
        ex['prompt'] = f'your {cref(bot)} is freed: tap a middle card to swap it with'
        if ui['dst'] is not None:
            s = ui['dst']
            put(f'mid.{s}', 'ghost', _card(bot))
            put(f'freed.{me}.0', 'ghost', _card(_middle(board)[s]))
            st1 = _simulate(A_SWAP + s)
            ex['sel'] = f'{cref(bot)} ↔ {cref(_middle(board)[s])} of middle slot {s + 1}: ' \
                        f'you then place {cref(_middle(board)[s])} in your machine.' \
                        + (frees(st1) if st1 is not None else '')
            ex['prompt'] = 'tap ✓ Place, or another middle card'
            ex['canPlace'] = True

    elif ph in EXPAND_PHASES:
        covered.update(a for a in legal if A_EXPAND <= a < A_THROW)
        c = _src_freed()
        if c is None:
            ex['prompt'] = 'no room in your machine: throw your freed cards away'
            if A_THROW in legal:
                ex['choices'].append(_choice('🗑️ Throw away', 'play', A_THROW, color='red'))
                covered.add(A_THROW)
        else:
            for k in range(2):
                if _freed_ok(k):
                    put(f'freed.{me}.{k}', 'sel' if k == c else 'ok')
            base = _expand_base(c)
            for cell in range(MM):
                if any(valids[base + 4 * cell:base + 4 * cell + 4]):
                    put(f'cell.{me}.{cell}', 'legal')
            card = _freed(board, me)[c]
            n_freed = sum(1 for k in range(2) if _freed_ok(k))
            if ui['dst'] is None:
                ex['prompt'] = 'place your freed card: tap a highlighted cell of your machine' \
                               + (' (tap the other freed card to switch)' if n_freed > 1 else '')
            else:
                opts = _orients(c, ui['dst'])
                o = ui['orient'] if ui['orient'] in opts else opts[0]
                ui['orient'] = o
                rot = _rotated(card, o)
                put(f'cell.{me}.{ui["dst"]}', 'ghost', rot)
                st1 = _simulate(base + 4 * ui['dst'] + o)
                d = (_score(st1, me) - _score(board, me)) if st1 is not None else 0
                y, x = divmod(ui['dst'], N)
                turn = f'turned {opts.index(o) + 1}/{len(opts)}, tap the cell again to rotate' if len(opts) > 1 \
                    else 'single legal orientation here'
                ex['sel'] = f'{cref(card)} → row {y + 1}, column {x + 1}: <b>{_signed(d)}</b> ({turn}).'
                ex['prompt'] = 'tap ✓ Place, or another cell'
                ex['canPlace'] = True

    # safety net: any legal move the widgets above cannot reach becomes a button
    for a in sorted(legal - covered):
        ex['choices'].append(_choice(f'Action {a}', 'play', a, color='basic'))
    return ex


def get_render_state():
    if g is None or board is None:
        return json.dumps({"viewData": {}, "extra": {}})
    rd.copy_state(board, False)
    end = rd.check_end_game(player)
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

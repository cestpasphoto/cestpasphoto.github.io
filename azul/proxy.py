"""
Bridge between the web page (common/game.js + azul/azul.js) and the Azul
engine, running inside Pyodide.

Python owns the game state AND the interaction state (selected source and
colour); JS only mirrors the JSON returned by get_render_state() and sends
clicks back through handle_action().

Frames. Actions (source, colour, line) do not depend on the seat, so every move
is applied in the ABSOLUTE frame, like Arena does: board rows of player p =
seat p. Only the AI search works in the canonical frame (game.js calls
g.getCanonicalForm), and its action is valid as is in the absolute frame.

Floor. The engine only counts the tiles of each floor line; their colours are
followed here, from the moves, for display (5 = first-player token).

Undo. A snapshot is taken before each human move. The factories of a round are
drawn when the previous round ends, so undoing the move that ended a round
draws them again (true randomness), as in the other games.
"""
import base64
import json
import zlib
import numpy as np

from MCTS import MCTS
from AzulGame import AzulGame as Game, NUMBER_PLAYERS
from AzulLogicNumba import Board, num_factories


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
F = int(num_factories(P))
N_ACTIONS = (F + 1) * 30
FLOOR = 5
TOKEN = 5
PEN = [1, 1, 2, 2, 2, 3, 3]
MAX_EVENTS = 150
TILE = ['🟦', '🟨', '🟥', '⬛', '⬜']
COLOUR = ['blue', 'yellow', 'red', 'black', 'white']

g = None             # Game; g.board is the scratch board of MCTS, never read here
board = None         # current state, absolute frame
player = 0           # seat that must act next
ply = 0              # count of actions submitted to Game.getNextState so far, == Arena's `it`
mcts = None
eng = rd = None      # scratch boards owned by this module
floors = [[] for _ in range(P)]   # colours on each floor line, TOKEN for the first-player token
history = []         # snapshots taken before each human move
events = []          # journal, see _ev()
next_id = 1
marks = [0] * P      # per seat: last event id before that seat's previous move
sel = None           # (source, colour): source 0 = centre, 1..F = factory
end_announced = False


# =============================================================================
# Entry points called by game.js
# =============================================================================

def init_game(numMCTSSims):
    global g, board, player, ply, mcts, eng, rd, floors, history, events, next_id, marks, sel, end_announced
    g = Game()
    eng, rd = Board(P), Board(P)
    board = np.copy(g.getInitBoard())
    player = 0
    ply = 0
    mcts_args = dotdict(MCTS_COMMON, numMCTSSims=numMCTSSims, **MCTS_PROFILES[NUMBER_PLAYERS])
    mcts = MCTS(g, None, mcts_args)
    floors = [[] for _ in range(P)]
    history, events, next_id, marks, sel, end_announced = [], [], 1, [0] * P, None, False
    _ev('— New game: round 1, @0 starts —', k='turn')
    return get_render_state()


def changeDifficulty(numMCTSSims):
    if mcts is not None:
        mcts.args.numMCTSSims = numMCTSSims


def set_edit_mode(mode):
    return get_render_state()   # no edit mode for Azul


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
    elif action_name == 'pick':
        # 1st tap: select every tile of that colour in that source; again = cancel
        s, c = int(args[0]), int(args[1])
        if sel == (s, c):
            sel = None
        elif any(_legal(s * 30 + c * 6 + l) for l in range(6)):
            sel = (s, c)
    elif action_name == 'place':
        # 2nd tap: the destination line (0-4) or the floor (5)
        if sel is not None:
            a = sel[0] * 30 + sel[1] * 6 + int(args[0])
            if _legal(a):
                _human(a)
    elif action_name == 'cancel':
        sel = None
    elif action_name == 'play':
        a = int(args[0])
        if _legal(a):
            _human(a)
    return get_render_state()


# =============================================================================
# Playing a decision
# =============================================================================

def _valids():
    rd.copy_state(board, False)
    return rd.valid_moves(player)


def _legal(a):
    return 0 <= a < N_ACTIONS and bool(_valids()[a])


def _ended():
    rd.copy_state(board, False)
    return bool(np.any(rd.check_end_game()))


def _human(a):
    global sel
    _snapshot()
    _play(a)
    sel = None


def _play(action):
    global board, player, ply
    actor = player
    before = np.copy(board)
    eng.copy_state(board, True)
    nxt = int(eng.make_move(action, actor, 0))     # random_seed 0 = true randomness
    board = np.copy(eng.get_state())
    player = nxt
    ply += 1                                         # one submitted action == one Arena `it`
    _describe(actor, action, before, board)
    _announce_end()


# =============================================================================
# Undo
# =============================================================================

def _snapshot():
    history.append((np.copy(board), player, ply, [list(f) for f in floors], [dict(e) for e in events],
                    next_id, list(marks), end_announced))


def _undo():
    global board, player, ply, floors, events, next_id, marks, end_announced, sel
    if history:
        board, player, ply, floors, events, next_id, marks, end_announced = history.pop()
    sel = None


# =============================================================================
# State access (absolute frame)
# =============================================================================

def _b(st):
    rd.copy_state(st, False)
    return rd


def _pattern(st, p):
    b = _b(st)
    return [[int(b.player_colours[p, r]), int(b.player_row_numbers[p, r])] for r in range(5)]


def _wall(st, p):
    b = _b(st)
    return [[int(x) for x in b.player_walls[5 * p + r, :5]] for r in range(5)]


def _source(st, s):
    """Tile counts per colour of a source (0 = centre, 1..F = factory)."""
    b = _b(st)
    row = b.centre[0] if s == 0 else b.factories[s - 1]
    return [int(x) for x in row[:5]]


def _round(st):
    return int(_b(st).scores[0, P])


def _pen(n):
    return sum(PEN[:min(n, 7)])


def _gain(wall, r, c):
    """Points of a tile laid at (r, c) on a wall that does not hold it yet (Board.score_change)."""
    def has(rr, cc):
        return 0 <= rr < 5 and 0 <= cc < 5 and wall[rr][cc] == 1

    def run(dr, dc):
        k, rr, cc = 0, r + dr, c + dc
        while has(rr, cc):
            k, rr, cc = k + 1, rr + dr, cc + dc
        return k

    ra, ca = has(r, c - 1) or has(r, c + 1), has(r - 1, c) or has(r + 1, c)
    if not ra and not ca:
        return 1
    return (1 + run(0, -1) + run(0, 1) if ra else 0) + (1 + run(-1, 0) + run(1, 0) if ca else 0)


def _bonus(wall):
    """(complete rows, complete columns, complete colours) of a wall (Board.score_bonuses)."""
    rows = sum(1 for r in range(5) if all(wall[r]))
    cols = sum(1 for c in range(5) if all(wall[r][c] for r in range(5)))
    colours = sum(1 for i in range(5) if all(wall[j][(j + i) % 5] for j in range(5)))
    return rows, cols, colours


def _bonus_points(wall):
    rows, cols, colours = _bonus(wall)
    return 2 * rows + 7 * cols + 10 * colours


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


def _describe(who, move, before, after):
    s, c, line = move // 30, (move % 30) // 6, move % 6
    src = _source(before, s)
    k = src[c]
    if line == FLOOR:
        over = k
    else:
        over = k - min(line + 1 - _pattern(before, who)[line][1], k)
    token = s == 0 and int(_b(before).centre[0, 5]) == 1
    floors[who].extend([c] * over)
    if token:
        floors[who].insert(0, TOKEN)
    where = 'the centre' if s == 0 else f'factory {s}'
    text = f'@{who} took {k}{TILE[c]} from {where} → ' + ('the floor' if line == FLOOR else f'row {line + 1}')
    if line != FLOOR and over:
        text += f', {over} to the floor'
    if token:
        text += ' + first-player token'
    if s:
        rest = ''.join(TILE[x] * src[x] for x in range(5) if x != c)
        if rest:
            text += f'; {rest} to the centre'
    e = _ev(text, p=who, r=line)
    marks[who] = e['id']                           # this seat's journal restarts after its move

    if _round(after) != _round(before):
        _describe_round(before, after, who, move)


def _describe_round(before, after, who, move):
    """End of round: wall tiling and floor penalty of every seat. Pattern lines
    and floors are read from `before` with the last move replayed by hand (the
    engine scores the round inside the same make_move)."""
    s, c, line = move // 30, (move % 30) // 6, move % 6
    pats = [_pattern(before, p) for p in range(P)]
    nfloor = [int(_b(before).player_row_numbers[p, 5]) for p in range(P)]
    k = _source(before, s)[c]
    if line == FLOOR:
        nfloor[who] += k
    else:
        put = min(line + 1 - pats[who][line][1], k)
        pats[who][line] = [c, pats[who][line][1] + put]
        nfloor[who] += k - put
    if s == 0 and int(_b(before).centre[0, 5]) == 1:
        nfloor[who] += 1
    over = bool(np.any(_b(after).check_end_game()))
    _ev(f'— End of round {_round(before)} —', k='turn')
    for p in range(P):
        wall = _wall(before, p)
        got, laid = 0, ''
        for r in range(5):
            col, cnt = pats[p][r]
            if col >= 0 and cnt == r + 1:
                got += _gain(wall, r, (col + r) % 5)
                wall[r][(col + r) % 5] = 1
                laid += TILE[col]
        lost = _pen(nfloor[p])
        score = int(_b(after).scores[0, p])
        if over:
            score = max(score - _bonus_points(_wall(after, p)), 0)
        parts = ([f'laid {laid} +{got}'] if laid else []) + ([f'floor −{lost}'] if lost else [])
        _ev(f'@{p}: {", ".join(parts) or "nothing"} → {score}', p=p, r=-1)
    for p in range(P):
        floors[p] = []
    if not over:
        _ev(f'— Round {_round(after)}: @{player} starts —', k='turn')


def _announce_end():
    global end_announced
    if end_announced or not _ended():
        return
    end_announced = True
    rd.copy_state(board, False)
    res = [float(x) for x in rd.check_end_game()]
    for p in range(P):
        rows, cols, colours = _bonus(_wall(board, p))
        if rows or cols or colours:
            bits = [f'{n} {name} +{n * pts}' for n, name, pts in
                    ((rows, 'row(s)', 2), (cols, 'column(s)', 7), (colours, 'colour(s)', 10)) if n]
            _ev(f'@{p} bonus: {", ".join(bits)} → {int(_b(board).scores[0, p])}')
    best = [p for p in range(P) if res[p] > 0]
    if best:
        score = int(_b(board).scores[0, best[0]])
        _ev('🏆 ' + ' & '.join(f'@{p}' for p in best) + (' tie' if len(best) > 1 else ' won') + f' with {score}', k='turn')


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
    b = _b(board)
    factories = []
    for f in range(F):
        cnt = [int(x) for x in b.factories[f, :5]]
        factories.append([c for c in range(5) for _ in range(cnt[c])])
    centre = [int(x) for x in b.centre[0, :5]]
    token = int(b.centre[0, 5]) == 1
    bag, lid = int(b.bag[0, :5].sum()), int(b.discards[0, :5].sum())
    rnd = int(b.scores[0, P])
    scores = [int(b.scores[0, p]) for p in range(P)]
    players = []
    for p in range(P):
        n_floor = int(_b(board).player_row_numbers[p, 5])
        fl = list(floors[p])
        # the engine is the reference for the count; colours are cosmetic
        fl = (fl + [-1] * n_floor)[:n_floor] if len(fl) < n_floor else fl[:n_floor]
        players.append(dict(
            score=scores[p], pat=_pattern(board, p), wall=_wall(board, p),
            floor=fl, floorPen=_pen(n_floor),
        ))
    return dict(factories=factories, centre=centre, token=token, bag=bag, lid=lid, round=rnd,
                players=players, events=events, marks=list(marks), stateId=_state_id())


def _extra():
    ex = dict(prompt='', choices=[], pick=[], sel=None, lines=[None] * 6)
    if _ended():
        return ex
    valids = _valids()
    legal = set(int(a) for a in np.flatnonzero(valids))
    covered = set()
    # sources: which (source, colour) can be picked
    pick = []
    for s in range(F + 1):
        row = []
        for c in range(5):
            ok = any(s * 30 + c * 6 + l in legal for l in range(6))
            row.append(ok)
            if ok:
                covered.update(a for a in range(s * 30 + c * 6, s * 30 + c * 6 + 6) if a in legal)
        pick.append(row)
    ex['pick'] = pick

    if sel is not None:
        s, c = sel
        k = _source(board, s)[c]
        token = s == 0 and _b(board).centre[0, 5] == 1
        pat = _pattern(board, player)
        f0 = int(_b(board).player_row_numbers[player, 5])
        for l in range(6):
            a = s * 30 + c * 6 + l
            if a not in legal:
                continue
            if l == FLOOR:
                put, cap, cnt = 0, 0, 0
                over = k + token
            else:
                cap, cnt = l + 1, pat[l][1]
                put = min(cap - cnt, k)
                over = k - put + token
            loss = _pen(f0 + over) - _pen(f0)
            txt = '' if l == FLOOR else f'{cnt + put}/{cap}'
            if loss:
                txt = (txt + ' · ' if txt else '') + f'−{loss}'
            ex['lines'][l] = dict(a=a, t=txt, full=(l != FLOOR and cnt + put == cap), loss=loss)
        ex['sel'] = dict(s=s, c=c, k=k, token=bool(token))
        where = 'the centre' if s == 0 else f'factory {s}'
        ex['prompt'] = f'Take {k} {TILE[c]} from {where}' + (' + 1️⃣' if token else '') + ': tap a row or the floor'
        ex['choices'].append(_choice('Cancel', 'cancel', color='basic'))
    else:
        ex['prompt'] = 'Tap a tile in a factory or the centre'

    # safety net: any legal move the widgets above cannot reach becomes a button
    for a in sorted(legal - covered):
        ex['choices'].append(_choice(f'Action {a}', 'play', a, color='basic'))
    return ex


def _choice(label, action, *args, color=''):
    return dict(l=label, a=action, x=list(args), c=color)


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

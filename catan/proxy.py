"""
Bridge between the web page (common/game.js + catan/catan.js) and the Catan
engine, running inside Pyodide.

Python owns the game state AND the interaction state (pending sub-choice, trade
draft); JS only mirrors the JSON returned by get_render_state() and sends back
clicks through handle_action().

Frames. `board` is kept in the ABSOLUTE frame (row p = seat p). Every decision
is applied in the CANONICAL frame of the player who takes it (that player at
index 0), exactly as MCTS simulates the game, then rotated back.

Hidden information. The JSON carries every hand: the true state already lives
in the page (Pyodide's memory), so masking is a display matter, done by
catan.js according to who is human. Events carry their private part apart
(`pt`, visible to the seats in `ps` only).
"""
import json
import numpy as np

from MCTS import MCTS
from CatanGame import CatanGame as Game
from CatanLogicNumba import Board
from CatanConstants import *


class dotdict(dict):
    def __getattr__(self, name):
        return self[name]


P = N_PLAYERS
MAX_EVENTS = 150
RES = ['🧱', '🌲', '⛰️', '🌾', '🐑']
DEV_EMOJI = ['⚔️', '⭐', '🛣️', '💰', '🎁']
DEV_NAMES = ['Knight', 'Victory Point', 'Road Building', 'Monopoly', 'Year of Plenty']

g = None             # Game; g.board is the scratch board of MCTS, never read here
board = None         # current state, absolute frame
player = 0           # seat that must act next
mcts = None
eng = rot = rd = None   # scratch boards owned by this module
history = []         # snapshots taken before each human decision
events = []          # journal, see _ev()
next_id = 1
marks = [0] * P      # per seat: last event id before that seat ended its previous turn
ui = {}              # interaction state
end_announced = False


# =============================================================================
# Entry points called by game.js
# =============================================================================

def init_game(numMCTSSims):
    global g, board, player, mcts, eng, rot, rd, history, events, next_id, marks, end_announced
    g = Game()
    eng, rot, rd = Board(P), Board(P), Board(P)
    board = np.copy(g.getInitBoard())
    player = 0
    mcts_args = dotdict({            # evaluation profile of pit.py --strict
        'numMCTSSims'      : numMCTSSims,
        'cpuct'            : 1.0,
        'fpu'              : 0.1,
        'fpu_root'         : 0.0,
        'universes'        : 1,
        'prob_fullMCTS'    : 1.,
        'ratio_fullMCTS'   : 1,
        'forced_playouts'  : False,
        'forced_playouts_k': 1.5,
        'no_mem_optim'     : False,
        'dirichletAlpha'   : 0.,
        'temperature'      : [1., 1., 1.],
    })
    mcts = MCTS(g, None, mcts_args)
    history, events, next_id, marks, end_announced = [], [], 1, [0] * P, False
    _reset_ui()
    _ev('— New game: initial placement —', k='turn')
    return get_render_state()


def changeDifficulty(numMCTSSims):
    if mcts is not None:
        mcts.args.numMCTSSims = numMCTSSims


def set_edit_mode(mode):
    return get_render_state()   # no edit mode for Catan


def getNextState(action):
    # AI move (game.js): no snapshot, the journal keeps growing
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
    elif action_name == 'play':
        a = int(args[0])
        if _legal(a):
            _human([a])
    elif action_name == 'hex':                      # robber hex chosen, victim to pick
        opts = _robber_options(int(args[0]))
        if len(opts) == 1:
            _human(opts)
        elif len(opts) > 1:
            ui['pending'] = ('victim', int(args[0]))
    elif action_name == 'dev':                      # dev card whose parameter is chosen next
        k = int(args[0])
        if k == MONOPOLY:
            ui['pending'] = ('monopoly',)
        elif k == YEAR_OF_PLENTY:
            ui['pending'] = ('yop', -1)
    elif action_name == 'yop':
        ui['pending'] = ('yop', int(args[0]))
    elif action_name == 'cancel':
        ui['pending'] = None
    elif action_name == 'trade':
        _trade_action(*args)
    return get_render_state()


# =============================================================================
# Playing a decision
# =============================================================================

def _rotate(state, n):
    """swap_players(n): new[i] = old[(i+n) % P]. n = seat -> that seat at index 0."""
    n %= P
    if n == 0:
        return np.copy(state)
    rot.copy_state(state, True)
    rot.swap_players(n)
    return np.copy(rot.get_state())


def _step(action, actor):
    """Apply one decision in the actor's canonical frame, then replay the
    auto-resolution loop of Board.make_move() so that every forced move is
    recorded. Returns (new absolute board, next seat, trace of absolute
    (seat, move, before, after))."""
    back = (P - actor) % P
    eng.copy_state(_rotate(board, actor), True)
    trace = []

    def apply(move, who):
        before = np.copy(eng.get_state())
        eng._apply(move, who, 0)                       # random_seed 0 = true randomness
        trace.append(((int(who) + actor) % P, int(move), _rotate(before, back), _rotate(eng.get_state(), back)))

    apply(action, 0)
    for _guard in range(4 * MAX_ROUNDS):               # same loop as Board.make_move()
        nxt = int(eng._next_actor())
        if eng.check_end_game(nxt).any():
            break
        idx = np.flatnonzero(eng.valid_moves(nxt))
        if len(idx) != 1:
            break
        apply(int(idx[0]), nxt)
    nxt = int(eng._next_actor())
    return _rotate(eng.get_state(), back), (nxt + actor) % P, trace


def _play(action):
    global board, player
    board, player, trace = _step(action, player)
    for who, move, before, after in trace:
        _describe(who, move, before, after)
    _announce_end()


def _human(actions):
    _snapshot()
    for a in actions:
        _play(a)
    _reset_ui(keep_trade=True)


def _valids():
    eng.copy_state(_rotate(board, player), True)
    return eng.valid_moves(0)


def _legal(a):
    return 0 <= a < N_ACTIONS and bool(_valids()[a])


def _ended():
    rd.copy_state(board, False)
    return bool(rd.check_end_game(player).any())


def _robber_options(h):
    if _ga(board)[GA_PHASE] != PHASE_MOVE_ROBBER:
        return []
    valids = _valids()
    return [A_ROBBER + h * P + t for t in range(P) if valids[A_ROBBER + h * P + t]]


# =============================================================================
# Undo
# =============================================================================

def _snapshot():
    history.append((np.copy(board), player, [dict(e) for e in events], next_id, list(marks), end_announced))


def _undo():
    global board, player, events, next_id, marks, end_announced
    if history:
        board, player, events, next_id, marks, end_announced = history.pop()
    _reset_ui()


def _reset_ui(keep_trade=False):
    global ui
    trade = ui.get('trade') if (keep_trade and ui) else None
    if trade is None or not trade['open']:
        trade = dict(open=False, give=[0] * N_RESOURCES, ask=[0] * N_RESOURCES)
    else:
        trade = dict(open=True, give=[0] * N_RESOURCES, ask=[0] * N_RESOURCES)
    ui = dict(pending=None, trade=trade)


# =============================================================================
# Trade panel
# =============================================================================

def _trade_action(sub, *args):
    t = ui['trade']
    if sub == 'toggle':
        t['open'] = not t['open']
        t['give'], t['ask'] = [0] * N_RESOURCES, [0] * N_RESOURCES
    elif sub == 'reset':
        side = args[0] if args else None
        for s in (['give', 'ask'] if side is None else [side]):
            t[s] = [0] * N_RESOURCES
    elif sub == 'add':
        # +1 per tap; once the limit is reached, the next tap brings it back to 0
        side, r = args[0], int(args[1])
        other = 'ask' if side == 'give' else 'give'
        if t[other][r] == 0:
            cap = min(_hand(board, player)[r], 4 - sum(t['give']) + t['give'][r]) if side == 'give' \
                else 3 - sum(t['ask']) + t['ask'][r]
            t[side][r] = t[side][r] + 1 if t[side][r] < cap else 0
    elif sub == 'bank':
        a, _, _ = _bank_action()
        if a >= 0:
            _human([a])
            ui['trade']['open'] = True
    elif sub == 'offer':
        ok, _ = _offer_check()
        if ok:
            s_ask, s_give = _set_index(t['ask']), _set_index(t['give'])
            _snapshot()
            composer = player
            _play(A_TRADE_RECV + s_ask)
            # the GIVE ply is auto-resolved when it has a single legal option,
            # which is then necessarily this one (_offer_check checked it)
            if _ga(board)[GA_PHASE] == PHASE_TRADE_OFFER and player == composer:
                _play(A_TRADE_GIVE + s_give)
            _reset_ui()


def _set_index(counts):
    for s in range(N_TRADE_SETS):
        if all(int(TRADE_SETS[s, r]) == counts[r] for r in range(N_RESOURCES)):
            return s
    return -1


def _rates(p):
    rd.copy_state(board, False)
    return [int(rd._trade_ratio(p, r)) for r in range(N_RESOURCES)]


def _bank_action():
    """Bank trade matching the draft: `ratio` cards of one resource for 1 card."""
    t = ui['trade']
    gives = [r for r in range(N_RESOURCES) if t['give'][r] > 0]
    asks = [r for r in range(N_RESOURCES) if t['ask'][r] > 0]
    if len(gives) != 1 or len(asks) != 1 or t['ask'][asks[0]] != 1:
        return -1, 0, ''
    gr, gt = gives[0], asks[0]
    ratio = _rates(player)[gr]
    if t['give'][gr] != ratio:
        return -1, ratio, f'Bank: give exactly {ratio} {RES[gr]} for 1 card'
    a = A_BANK_TRADE + gr * 4 + (gt if gt < gr else gt - 1)
    if not _legal(a):
        if _pc(board, player)[PC_TRADES_THIS_TURN] >= MAX_TRADES_PER_TURN:
            return -1, ratio, f'Bank: at most {MAX_TRADES_PER_TURN} trades per turn'
        return -1, ratio, 'The bank is out of that resource'
    return a, ratio, ''


def _offer_check():
    t = ui['trade']
    give, ask = t['give'], t['ask']
    if _gb(board)[GB_PLAYER_TRADE_DONE]:
        return False, 'Only one offer to players per turn'
    if sum(give) == 0 or sum(ask) == 0:
        return False, ''
    if sum(give) > 3 or sum(ask) > 3:
        return False, 'Players: at most 3 cards each way'
    s_ask, s_give = _set_index(ask), _set_index(give)
    if s_ask < 0 or s_give < 0:
        return False, 'Not a legal offer'
    if not _legal(A_TRADE_RECV + s_ask):
        hand, bank = _hand(board, player), _ints(_ga(board)[GA_BANK:GA_BANK + N_RESOURCES])
        for r in range(N_RESOURCES):
            held = BANK_PER_RESOURCE - bank[r] - hand[r]      # public: what the opponents hold together
            if ask[r] > held:
                return False, (f'Opponents hold {held} {RES[r]} in total '
                               f'({BANK_PER_RESOURCE} − {bank[r]} in bank − {hand[r]} yours)')
        return False, 'You must keep a card of a type you do not ask for'
    eng.copy_state(_rotate(board, player), True)
    eng._do_trade_recv(s_ask, 0)
    if not eng._give_is_legal(0, s_give):
        return False, 'Not a legal offer'
    return True, ''


def _trade_state():
    t = ui['trade']
    bank, ratio, bank_hint = _bank_action()
    offer, offer_hint = _offer_check()
    if sum(t['give']) + sum(t['ask']) == 0:
        hint = 'Tap what you give, then what you want'
    elif sum(t['ask']) == 0:
        hint = 'Now tap what you want'
    elif sum(t['give']) == 0:
        hint = 'Now tap what you give'
    elif bank >= 0 or offer:
        hint = ''
    else:
        hint = bank_hint if (bank_hint and (sum(t['give']) > 3 or not offer_hint)) else (offer_hint or bank_hint)
    return dict(open=t['open'], give=list(t['give']), ask=list(t['ask']), bank=int(bank),
                bankLabel=f'Bank {ratio}:1' if ratio else 'Bank', offer=bool(offer), hint=hint,
                rates=_rates(player))


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


def _res_str(counts):
    s = ''.join(RES[r] * int(n) for r, n in enumerate(counts) if n > 0)
    return s or '∅'


def _describe(who, move, before, after):
    w = f'@{who}'
    dh = [[a - b for a, b in zip(_hand(after, p), _hand(before, p))] for p in range(P)]
    if A_ROAD <= move < A_ROAD + N_EDGES:
        _ev(f'{w} built a road', e=[move - A_ROAD])
    elif A_SETTLEMENT <= move < A_SETTLEMENT + N_VERTICES:
        _ev(f'{w} built a settlement', v=[move - A_SETTLEMENT])
        if any(x > 0 for x in dh[who]):
            _ev(f'{w} received {_res_str([max(x, 0) for x in dh[who]])}')
    elif A_CITY <= move < A_CITY + N_VERTICES:
        _ev(f'{w} built a city', v=[move - A_CITY])
    elif move == A_BUY_DEV:
        k = int(np.argmax(_pb(after, who)[PB_DEV_NEW:PB_DEV_NEW + N_DEV_TYPES] - _pb(before, who)[PB_DEV_NEW:PB_DEV_NEW + N_DEV_TYPES]))
        _ev(f'{w} bought a development card', pt=f'{DEV_EMOJI[k]} {DEV_NAMES[k]}', ps=[who])
    elif move == A_PLAY_DEV + 0:
        _ev(f'{w} played a Knight ⚔️')
    elif move == A_PLAY_DEV + 1:
        _ev(f'{w} played Road Building 🛣️')
    elif A_ROBBER <= move < A_ROBBER + N_HEXES * P:
        h, t = divmod(move - A_ROBBER, P)
        _ev(f'{w} moved the robber', h=[h])
        if t:
            victim = (who + t) % P
            lost = [r for r in range(N_RESOURCES) if dh[victim][r] < 0]
            _ev(f'{w} stole a card from @{victim}', pt=RES[lost[0]] if lost else None, ps=[who, victim])
    elif move == A_ROLL:
        d = int(_ga(after)[GA_DICE])
        hexes = [h for h in range(N_HEXES) if TOKEN_VALUES[after[ROW_HEX + h, H_TOKEN]] == d
                 and after[ROW_HEX + h, H_TYPE] != HEX_DESERT]
        _ev(f'{w} rolled 🎲 {d}', h=hexes, k='roll', d=d)
        if d == 7:
            for p in range(P):
                owe = int(_pc(after, p)[PC_DISCARD_LEFT])
                if owe:
                    _ev(f'@{p} must discard {owe}')
        else:
            gains = [(p, dh[p]) for p in range(P) if any(x > 0 for x in dh[p])]
            for p, gp in gains:
                _ev(f'@{p} received {_res_str(gp)}')
            if not gains:
                _ev('No production')
    elif A_MONOPOLY <= move < A_MONOPOLY + N_RESOURCES:
        r = move - A_MONOPOLY
        _ev(f'{w} played Monopoly 💰 on {RES[r]} and took {dh[who][r]}')
    elif A_YEAR_OF_PLENTY <= move < A_YEAR_OF_PLENTY + 15:
        a, b = YOP_PAIRS[move - A_YEAR_OF_PLENTY]
        _ev(f'{w} played Year of Plenty 🎁: {RES[a]}{RES[b]}')
    elif A_BANK_TRADE <= move < A_BANK_TRADE + 20:
        gave = [-min(x, 0) for x in dh[who]]
        got = [max(x, 0) for x in dh[who]]
        _ev(f'{w} traded {_res_str(gave)} → {_res_str(got)} with the bank')
    elif A_DISCARD <= move < A_DISCARD + N_RESOURCES:
        r = move - A_DISCARD
        last = events[-1] if events else None
        if last and last.get('k') == 'discard' and last.get('w') == who:
            dr = list(last['dr'])          # new list: undo snapshots share the old one
            dr[r] += 1
            last['dr'] = dr
            last['t'] = f'{w} discarded {_res_str(dr)}'
        else:
            dr = [0] * N_RESOURCES
            dr[r] = 1
            _ev(f'{w} discarded {_res_str(dr)}', k='discard', w=who, dr=dr)
    elif A_TRADE_GIVE <= move < A_TRADE_GIVE + N_TRADE_SETS:
        d = _pd(after, who)
        _ev(f'{w} offers {_res_str(d[PD_TRADE_GIVE:PD_TRADE_GIVE + N_RESOURCES])} '
            f'for {_res_str(d[PD_TRADE_RECV:PD_TRADE_RECV + N_RESOURCES])}')
    elif move == A_TRADE_OK:
        _ev(f'{w} accepted the trade ✅')
    elif move == A_TRADE_NO:
        _ev(f'{w} declined ❌')
    elif A_TRADE_ACCEPT <= move < A_TRADE_ACCEPT + P:
        t = move - A_TRADE_ACCEPT
        _ev(f'{w} took the counter-offer of @{(who + t) % P}' if t else f'{w} refused every counter-offer')
    elif move == A_END_TURN:
        marks[who] = next_id - 1          # this seat's journal restarts here
        rd.copy_state(after, False)
        _ev(f'— Round {int(rd.get_round())}: @{int(_gb(after)[GB_TURN_PLAYER])} —', k='turn')
    for p in range(P):
        if _pb(after, p)[PB_HAS_ROAD] and not _pb(before, p)[PB_HAS_ROAD]:
            _ev(f'@{p} took the Longest Road 🛣️ ({int(_pb(after, p)[PB_ROAD_LENGTH])})')
        if _pb(after, p)[PB_HAS_ARMY] and not _pb(before, p)[PB_HAS_ARMY]:
            _ev(f'@{p} took the Largest Army ⚔️ ({int(_pb(after, p)[PB_KNIGHTS])})')


def _announce_end():
    global end_announced
    if end_announced or not _ended():
        return
    end_announced = True
    rd.copy_state(board, False)
    res = rd.check_end_game(player)
    for p in range(P):
        if res[p] > 0:
            _ev(f'🏆 @{p} won with {int(rd.get_score(p))} VP', k='turn')


# =============================================================================
# Rendering
# =============================================================================

def _pa(st, p): return st[ROW_PLAYER + 4 * p]
def _pb(st, p): return st[ROW_PLAYER + 4 * p + 1]
def _pc(st, p): return st[ROW_PLAYER + 4 * p + 2]
def _pd(st, p): return st[ROW_PLAYER + 4 * p + 3]
def _ga(st): return st[ROW_GLOBAL]
def _gb(st): return st[ROW_GLOBAL + 1]
def _hand(st, p): return [int(x) for x in st[ROW_PLAYER + 4 * p, PA_RESOURCES:PA_RESOURCES + N_RESOURCES]]
def _ints(a): return [int(x) for x in a]


def _view():
    rd.copy_state(board, False)
    players = []
    for p in range(P):
        a, b, c, d = _pa(board, p), _pb(board, p), _pc(board, p), _pd(board, p)
        st = int(d[PD_TRADE_STATUS])
        players.append(dict(
            vp=int(c[PC_VP_PUBLIC]), vpDev=int(c[PC_VP_DEV]),
            nRes=int(a[PA_TOTAL_RES]), res=_ints(a[PA_RESOURCES:PA_RESOURCES + N_RESOURCES]),
            nDev=int(a[PA_TOTAL_DEV]), dev=_ints(a[PA_DEV_PLAYABLE:PA_DEV_PLAYABLE + N_DEV_TYPES]),
            devNew=_ints(b[PB_DEV_NEW:PB_DEV_NEW + N_DEV_TYPES]),
            knights=int(b[PB_KNIGHTS]), roadLen=int(b[PB_ROAD_LENGTH]),
            road=int(b[PB_HAS_ROAD]), army=int(b[PB_HAS_ARMY]),
            left=[int(b[PB_ROADS_LEFT]), int(b[PB_SETTLEMENTS_LEFT]), int(b[PB_CITIES_LEFT])],
            owe=int(c[PC_DISCARD_LEFT]),
            offer=None if st == TRADE_NONE else dict(
                st=st, ask=_ints(d[PD_TRADE_RECV:PD_TRADE_RECV + N_RESOURCES]),
                give=_ints(d[PD_TRADE_GIVE:PD_TRADE_GIVE + N_RESOURCES])),
        ))
    edges = []
    for e in range(N_EDGES):
        v = EDGE_TO_VERTEX[e, 0]
        k = [kk for kk in range(3) if VERTEX_TO_EDGE[v, kk] == e][0]
        edges.append(int(board[ROW_VERTEX + v, V_EDGE0 + k]) - 1)
    return dict(
        hexes=[[int(board[ROW_HEX + h, H_TYPE]), int(TOKEN_VALUES[board[ROW_HEX + h, H_TOKEN]]),
                int(board[ROW_HEX + h, H_ROBBER])] for h in range(N_HEXES)],
        ports=[int(board[ROW_VERTEX + PORT_VERTICES[p, 0], V_PORT]) for p in range(N_PORTS)],
        verts=[[int(board[ROW_VERTEX + v, V_BUILDING]), int(board[ROW_VERTEX + v, V_OWNER]) - 1]
               for v in range(N_VERTICES)],
        edges=edges,
        bank=_ints(_ga(board)[GA_BANK:GA_BANK + N_RESOURCES]),
        deck=int(rd.dev_deck_size()),
        dice=int(_ga(board)[GA_DICE]),
        phase=int(_ga(board)[GA_PHASE]),
        turn=int(_gb(board)[GB_TURN_PLAYER]),
        round=int(rd.get_round()),
        players=players,
        events=events,
        marks=list(marks),
    )


def _choice(label, action, *args, color=''):
    return dict(l=label, a=action, x=list(args), c=color)


def _extra():
    ex = dict(prompt='', choices=[], vAct=[-1] * N_VERTICES, eAct=[-1] * N_EDGES, hAct=[-1] * N_HEXES,
              dev=[-1] * N_DEV_TYPES, buyDev=-1, endTurn=-1, canTrade=False, trade=None)
    if _ended():
        return ex
    valids = _valids()
    legal = set(int(a) for a in np.flatnonzero(valids))
    covered = set()
    phase = int(_ga(board)[GA_PHASE])
    me = player
    pending = ui.get('pending')

    for e in range(N_EDGES):
        if A_ROAD + e in legal:
            ex['eAct'][e] = A_ROAD + e
            covered.add(A_ROAD + e)
    for v in range(N_VERTICES):
        for a in (A_SETTLEMENT + v, A_CITY + v):
            if a in legal:
                ex['vAct'][v] = a
                covered.add(a)
    if phase == PHASE_MOVE_ROBBER:
        for h in range(N_HEXES):
            opts = [A_ROBBER + h * P + t for t in range(P) if A_ROBBER + h * P + t in legal]
            if len(opts) == 1:
                ex['hAct'][h] = opts[0]
            elif len(opts) > 1:
                ex['hAct'][h] = -2
            covered.update(opts)

    # development cards
    if A_PLAY_DEV + 0 in legal:
        ex['dev'][KNIGHT] = A_PLAY_DEV + 0
    if A_PLAY_DEV + 1 in legal:
        ex['dev'][ROAD_BUILDING] = A_PLAY_DEV + 1
    mono = [A_MONOPOLY + r for r in range(N_RESOURCES) if A_MONOPOLY + r in legal]
    yop = [A_YEAR_OF_PLENTY + i for i in range(15) if A_YEAR_OF_PLENTY + i in legal]
    if mono:
        ex['dev'][MONOPOLY] = -2
    if yop:
        ex['dev'][YEAR_OF_PLENTY] = -2
    covered.update([A_PLAY_DEV, A_PLAY_DEV + 1] + mono + yop)
    if A_BUY_DEV in legal:
        ex['buyDev'] = A_BUY_DEV
        covered.add(A_BUY_DEV)
    if A_END_TURN in legal:
        ex['endTurn'] = A_END_TURN
        covered.add(A_END_TURN)

    # trade panel: bank trades and player offers
    if phase == PHASE_MAIN:
        tr = [a for a in legal if A_BANK_TRADE <= a < A_BANK_TRADE + 20 or A_TRADE_RECV <= a < A_TRADE_RECV + N_TRADE_SETS]
        ex['canTrade'] = bool(tr)
        covered.update(tr)
        if not tr:
            ui['trade']['open'] = False
        ex['trade'] = _trade_state()

    # prompt and choice buttons, by phase
    choices = ex['choices']
    if phase == PHASE_SETUP_SETTLEMENT:
        ex['prompt'] = 'Place a settlement'
    elif phase == PHASE_SETUP_ROAD:
        ex['prompt'] = 'Place a road next to your new settlement'
    elif phase == PHASE_ROLL:
        ex['prompt'] = 'Roll the dice, or play a Knight first'
        if A_ROLL in legal:
            choices.append(_choice('🎲 Roll', 'play', A_ROLL, color='primary'))
            covered.add(A_ROLL)
    elif phase == PHASE_DISCARD:
        ex['prompt'] = f'Discard {int(_pc(board, me)[PC_DISCARD_LEFT])} more card(s)'
        hand = _hand(board, me)
        for r in range(N_RESOURCES):
            if A_DISCARD + r in legal:
                choices.append(_choice(f'{RES[r]} {hand[r]}', 'play', A_DISCARD + r))
                covered.add(A_DISCARD + r)
    elif phase == PHASE_MOVE_ROBBER:
        ex['prompt'] = 'Move the robber: tap a highlighted hex'
        if pending and pending[0] == 'victim':
            h = pending[1]
            ex['prompt'] = 'Rob whom?'
            for t in range(P):
                a = A_ROBBER + h * P + t
                if a in legal:
                    q = (me + t) % P
                    n = int(_pa(board, q)[PA_TOTAL_RES])
                    label = f'@{q} ({n} card{"" if n == 1 else "s"})' if t else 'Nobody'
                    choices.append(_choice(label, 'play', a))
            choices.append(_choice('Cancel', 'cancel', color='basic'))
    elif phase == PHASE_MAIN:
        what = [name for name, lo, n in (('road', A_ROAD, N_EDGES), ('settlement', A_SETTLEMENT, N_VERTICES),
                                         ('city', A_CITY, N_VERTICES)) if any(lo <= a < lo + n for a in legal)]
        ex['prompt'] = (f'Tap a highlighted spot to build a {" / ".join(what)}, or buy, trade, end turn' if what
                        else 'Nothing to build: buy, trade or end your turn')
    elif phase == PHASE_ROAD_BUILDING:
        ex['prompt'] = f'Road Building: place {int(_gb(board)[GB_PENDING_COUNT])} more road(s)'
    elif phase == PHASE_TRADE_ANSWER:
        t = int(_gb(board)[GB_TURN_PLAYER])
        d = _pd(board, t)
        ex['prompt'] = (f'@{t} gives {_res_str(d[PD_TRADE_GIVE:PD_TRADE_GIVE + N_RESOURCES])} '
                        f'and wants {_res_str(d[PD_TRADE_RECV:PD_TRADE_RECV + N_RESOURCES])}')
        if A_TRADE_OK in legal:
            choices.append(_choice('✅ Accept', 'play', A_TRADE_OK, color='green'))
        choices.append(_choice('❌ Decline', 'play', A_TRADE_NO))
        covered.update([A_TRADE_OK, A_TRADE_NO])
    elif phase == PHASE_TRADE_ACCEPT:
        ex['prompt'] = 'Pick a counter-offer'
        for t in range(P):
            a = A_TRADE_ACCEPT + t
            if a in legal:
                choices.append(_choice(f'@{(me + t) % P}' if t else 'Refuse all', 'play', a))
                covered.add(a)
    elif phase == PHASE_TRADE_OFFER:
        ex['prompt'] = 'Complete your offer: what do you give?'
        for s in range(N_TRADE_SETS):
            if A_TRADE_GIVE + s in legal:
                choices.append(_choice(_res_str(TRADE_SETS[s]), 'play', A_TRADE_GIVE + s))
                covered.add(A_TRADE_GIVE + s)

    # sub-choices opened from a development card
    if pending and pending[0] == 'monopoly' and mono:
        ex['prompt'] = 'Monopoly: which resource?'
        choices[:] = [_choice(RES[a - A_MONOPOLY], 'play', a) for a in mono] + [_choice('Cancel', 'cancel', color='basic')]
    elif pending and pending[0] == 'yop' and yop:
        first = pending[1]
        pairs = [(int(YOP_PAIRS[a - A_YEAR_OF_PLENTY, 0]), int(YOP_PAIRS[a - A_YEAR_OF_PLENTY, 1]), a) for a in yop]
        if first < 0:
            ex['prompt'] = 'Year of Plenty: first resource?'
            firsts = sorted({r for x, y, _ in pairs for r in (x, y)})
            choices[:] = [_choice(RES[r], 'yop', r) for r in firsts]
        else:
            ex['prompt'] = f'Year of Plenty: {RES[first]} + which one?'
            choices[:] = [_choice(RES[y if x == first else x], 'play', a) for x, y, a in pairs if first in (x, y)]
        choices.append(_choice('Cancel', 'cancel', color='basic'))

    # safety net: any legal move the widgets above cannot reach becomes a button
    if not pending:
        for a in sorted(legal - covered):
            choices.append(_choice(_label(a), 'play', a, color='basic'))
    return ex


def _label(a):
    if A_ROAD <= a < A_ROAD + N_EDGES: return f'Road {a - A_ROAD}'
    if A_SETTLEMENT <= a < A_SETTLEMENT + N_VERTICES: return f'Settlement {a - A_SETTLEMENT}'
    if A_CITY <= a < A_CITY + N_VERTICES: return f'City {a - A_CITY}'
    if a == A_BUY_DEV: return 'Buy dev card'
    if a == A_PLAY_DEV: return 'Play Knight'
    if a == A_PLAY_DEV + 1: return 'Play Road Building'
    if A_ROBBER <= a < A_ROBBER + N_HEXES * P: return f'Robber {(a - A_ROBBER) // P}'
    if a == A_ROLL: return 'Roll'
    if A_MONOPOLY <= a < A_MONOPOLY + N_RESOURCES: return f'Monopoly {RES[a - A_MONOPOLY]}'
    if A_YEAR_OF_PLENTY <= a < A_YEAR_OF_PLENTY + 15:
        x, y = YOP_PAIRS[a - A_YEAR_OF_PLENTY]
        return f'Year of Plenty {RES[x]}{RES[y]}'
    if A_BANK_TRADE <= a < A_BANK_TRADE + 20: return f'Bank trade {a - A_BANK_TRADE}'
    if A_DISCARD <= a < A_DISCARD + N_RESOURCES: return f'Discard {RES[a - A_DISCARD]}'
    if a == A_END_TURN: return 'End turn'
    if A_TRADE_RECV <= a < A_TRADE_RECV + N_TRADE_SETS: return f'Ask {_res_str(TRADE_SETS[a - A_TRADE_RECV])}'
    if A_TRADE_GIVE <= a < A_TRADE_GIVE + N_TRADE_SETS: return f'Give {_res_str(TRADE_SETS[a - A_TRADE_GIVE])}'
    if a == A_TRADE_OK: return 'Accept'
    if a == A_TRADE_NO: return 'Decline'
    return f'Action {a}'


def get_render_state():
    if g is None or board is None:
        return json.dumps({"viewData": {}, "extra": {}})
    rd.copy_state(board, False)
    end = rd.check_end_game(player)
    ended = bool(end.any())
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

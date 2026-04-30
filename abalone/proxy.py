import json
import numpy as np
from MCTS import MCTS
from AbaloneGame import AbaloneGame as Game
import AbaloneLogicNumba as logic


class dotdict(dict):
    def __getattr__(self, name):
        return self[name]


g = None
board = None
mcts = None
player = 0
history = []
valids = []
game_result = [0] * 2

interaction_step = 0
selected_anchor = None
selected_group_size = 1
selected_group_axis = 0
previous_coords = []
edit_mode = 0


def init_game(numMCTSSims):
    global g, board, mcts, player, history, valids, game_result
    
    g = Game()
    board = g.getInitBoard()

    mcts_args = dotdict({
        'numMCTSSims'    : numMCTSSims,
        'fpu'            : 0.1,
        'cpuct'          : 1.5,
        'prob_fullMCTS'  : 1.,
        'forced_playouts': True,
        'no_mem_optim'   : False,
        'universes'      : 0,
    })

    mcts = MCTS(g, None, mcts_args)
    player = 0
    history = []
    valids = g.getValidMoves(board, player)
    game_result = [0] * 2
    
    _reset_interaction()
    return get_render_state()


def getNextState(action):
    global g, board, mcts, player, history, valids, game_result, previous_coords
    
    history.insert(0, [player, np.copy(board)])
    
    r, q, size, axis, d = logic._decode_action(action)
    previous_coords = []
    for i in range(size):
        m_r = r + i * logic.DIRECTIONS[axis][0] if size > 1 else r
        m_q = q + i * logic.DIRECTIONS[axis][1] if size > 1 else q
        dest_r = m_r + logic.DIRECTIONS[d][0]
        dest_q = m_q + logic.DIRECTIONS[d][1]
        previous_coords.append((dest_r, dest_q))
    
    board, player = g.getNextState(board, player, action)
    game_result = g.getGameEnded(board, player).tolist()
    valids = g.getValidMoves(board, player)
    
    _reset_interaction(full_reset=False)
    return get_render_state()


def changeDifficulty(numMCTSSims):
    global mcts
    mcts.args.numMCTSSims = numMCTSSims


def undo(arePlayersHuman=None):
    global g, board, player, history, valids, game_result
    
    if interaction_step > 0:
        _reset_interaction()
        return get_render_state()

    def pop_one_state():
        global board, player, valids, game_result
        if len(history) > 0:
            prev = history.pop(0)
            player = prev[0]
            board = prev[1]  
            valids = g.getValidMoves(board, player)
            game_result = [0] * 2
            return True
        return False

    if pop_one_state():
        if arePlayersHuman is not None:
            while len(history) > 0 and not arePlayersHuman[player]:
                pop_one_state()

    _reset_interaction()
    return get_render_state()


def set_edit_mode(mode):
    global edit_mode, valids, game_result
    
    edit_mode = 1 if edit_mode == 0 else 0
    if edit_mode == 0:
        valids = g.getValidMoves(board, player)
        game_result = g.getGameEnded(board, player).tolist()
        
    _reset_interaction()
    return get_render_state()


def handle_action(actionName, *args):
    global interaction_step, selected_anchor, selected_group_size, selected_group_axis
    
    if actionName == "undo":
        are_human = args[0] if len(args) > 0 else None
        return undo(are_human)
        
    if actionName == "click_cell":
        r, q = args[0], args[1]

        # When in EDIT mode
        if edit_mode != 0:
            if board[r, q, 0] == 1:
                # Noir -> Blanc
                board[r, q, 0] = 0
                board[r, q, 1] = 1
            elif board[r, q, 1] == 1:
                # Blanc -> Vide
                board[r, q, 0] = 0
                board[r, q, 1] = 0
            else:
                # Vide -> Noir
                board[r, q, 0] = 1
                board[r, q, 1] = 0
            return get_render_state()
        
        is_my_marble = (board[r, q, 0] == 1)
        
        if interaction_step == 0:
            if is_my_marble:
                selected_anchor = (r, q)
                interaction_step = 1

        elif interaction_step == 1:
            if (r, q) == selected_anchor:
                _reset_interaction()
            elif is_my_marble:
                line_info = _get_line_info(selected_anchor[0], selected_anchor[1], r, q)
                if line_info:
                    has_moves = False
                    for a in range(3402):
                        if valids[a]:
                            r_a, q_a, s_a, ax_a, _ = logic._decode_action(a)
                            if (r_a, q_a) == line_info['anchor'] and s_a == line_info['size'] and ax_a == line_info['axis']:
                                has_moves = True
                                break
                    
                    if has_moves:
                        selected_anchor = line_info['anchor']
                        selected_group_size = line_info['size']
                        selected_group_axis = line_info['axis']
                        interaction_step = 2
                    else:
                        selected_anchor = (r, q)
                else:
                    selected_anchor = (r, q)
            else:
                d = _get_direction(selected_anchor[0], selected_anchor[1], r, q)
                if d != -1:
                    action = logic._encode_action(selected_anchor[0], selected_anchor[1], 1, 0, d)
                    if valids[action]:
                        return getNextState(action)
                _reset_interaction()

        elif interaction_step == 2:
            if is_my_marble:
                selected_anchor = (r, q)
                interaction_step = 1
            else:
                for a in range(3402):
                    if valids[a]:
                        r_a, q_a, s_a, ax_a, d_a = logic._decode_action(a)
                        if (r_a, q_a) == selected_anchor and s_a == selected_group_size and ax_a == selected_group_axis:
                            for i in range(s_a):
                                m_r = r_a + i * logic.DIRECTIONS[ax_a][0]
                                m_q = q_a + i * logic.DIRECTIONS[ax_a][1]
                                dest_r = m_r + logic.DIRECTIONS[d_a][0]
                                dest_q = m_q + logic.DIRECTIONS[d_a][1]
                                if dest_r == r and dest_q == q:
                                    return getNextState(a)
                _reset_interaction()
                
        return get_render_state()


def _end_game():
    return max(game_result) > 0


def _reset_interaction(full_reset=True):
    global interaction_step, selected_anchor, selected_group_size, selected_group_axis, previous_coords
    interaction_step = 0
    selected_anchor = None
    selected_group_size = 1
    selected_group_axis = 0
    if full_reset:
        previous_coords = []


def _get_direction(r1, q1, r2, q2):
    dr = r2 - r1
    dq = q2 - q1
    for d in range(6):
        if logic.DIRECTIONS[d][0] == dr and logic.DIRECTIONS[d][1] == dq:
            return d
    return -1


def _get_line_info(r1, q1, r2, q2):
    dr = r2 - r1
    dq = q2 - q1
    
    if dr == 0 and dq != 0:
        axis, steps = 0, abs(dq)
        step_r, step_q = 0, 1 if dq > 0 else -1
    elif dr != 0 and dq == 0:
        axis, steps = 1, abs(dr)
        step_r, step_q = 1 if dr > 0 else -1, 0
    elif dr == -dq and dr != 0:
        axis, steps = 2, abs(dr)
        # CORRECTION ICI: step_q prend correctement le signe inverse
        step_r, step_q = 1 if dr > 0 else -1, 1 if dq > 0 else -1
    else:
        return None
        
    if steps > 2:
        return None
        
    marbles = []
    for i in range(steps + 1):
        curr_r = r1 + i * step_r
        curr_q = q1 + i * step_q
        
        # CORRECTION ICI: Bounds check avant de lire le board
        if not (0 <= curr_r < 9 and 0 <= curr_q < 9):
            return None
        if board[curr_r, curr_q, 0] != 1:
            return None
            
        marbles.append((curr_r, curr_q))
        
    marbles.sort(key=lambda x: (x[0], x[1]))
    return {
        'anchor': marbles[0],
        'size': len(marbles),
        'axis': axis
    }


def get_render_state():
    global board, player, game_result, edit_mode
    global interaction_step, selected_anchor, selected_group_size, selected_group_axis

    if _end_game():
        winners = [i for i, x in enumerate(game_result) if x == max(game_result)]
        status = f"Game Over! Player {winners[0]} wins!" if len(winners) == 1 else "Game Over! Draw!"
    elif edit_mode != 0:
        status = "Edit Mode"
    else:
        p_name = f"Player {player}"
        if interaction_step == 0: status = f"{p_name}: Select marble"
        elif interaction_step == 1: status = f"{p_name}: Extend group or select destination"
        elif interaction_step == 2: status = f"{p_name}: Select destination"
        else: status = p_name

    selectable_mask = np.zeros((9, 9), dtype=bool)
    selected_marbles = []

    if interaction_step == 0:
        for a in range(3402):
            if valids[a]:
                r_a, q_a, s_a, ax_a, _ = logic._decode_action(a)
                for i in range(s_a):
                    m_r = r_a + i * logic.DIRECTIONS[ax_a][0]
                    m_q = q_a + i * logic.DIRECTIONS[ax_a][1]
                    selectable_mask[m_r, m_q] = True
                    
    elif interaction_step == 1:
        selected_marbles.append(selected_anchor)
        for a in range(3402):
            if valids[a]:
                r_a, q_a, s_a, ax_a, d_a = logic._decode_action(a)
                if s_a == 1 and (r_a, q_a) == selected_anchor:
                    dest_r = r_a + logic.DIRECTIONS[d_a][0]
                    dest_q = q_a + logic.DIRECTIONS[d_a][1]
                    if 0 <= dest_r < 9 and 0 <= dest_q < 9:
                        selectable_mask[dest_r, dest_q] = True
                elif s_a > 1:
                    in_group = False
                    for i in range(s_a):
                        m_r = r_a + i * logic.DIRECTIONS[ax_a][0]
                        m_q = q_a + i * logic.DIRECTIONS[ax_a][1]
                        if (m_r, m_q) == selected_anchor:
                            in_group = True
                            break
                    if in_group:
                        for i in range(s_a):
                            m_r = r_a + i * logic.DIRECTIONS[ax_a][0]
                            m_q = q_a + i * logic.DIRECTIONS[ax_a][1]
                            selectable_mask[m_r, m_q] = True

    elif interaction_step == 2:
        for i in range(selected_group_size):
            m_r = selected_anchor[0] + i * logic.DIRECTIONS[selected_group_axis][0]
            m_q = selected_anchor[1] + i * logic.DIRECTIONS[selected_group_axis][1]
            selected_marbles.append((m_r, m_q))
            
        for a in range(3402):
            if valids[a]:
                r_a, q_a, s_a, ax_a, d_a = logic._decode_action(a)
                if (r_a, q_a) == selected_anchor and s_a == selected_group_size and ax_a == selected_group_axis:
                    for i in range(s_a):
                        m_r = r_a + i * logic.DIRECTIONS[ax_a][0]
                        m_q = q_a + i * logic.DIRECTIONS[ax_a][1]
                        dest_r = m_r + logic.DIRECTIONS[d_a][0]
                        dest_q = m_q + logic.DIRECTIONS[d_a][1]
                        if 0 <= dest_r < 9 and 0 <= dest_q < 9:
                            selectable_mask[dest_r, dest_q] = True

    cells = []
    for r in range(9):
        for q in range(9):
            if board[r, q, 2] == 1: 
                # Layer 0 is strictly Player 0, Layer 1 is strictly Player 1
                abs_player = -1
                if board[r, q, 0] == 1: 
                    abs_player = 0
                elif board[r, q, 1] == 1: 
                    abs_player = 1
                
                is_selectable = True if edit_mode != 0 else bool(selectable_mask[r, q])

                cells.append({
                    'r': r,
                    'q': q,
                    'player': abs_player,
                    'isSelected': (r, q) in selected_marbles,
                    'isSelectable': is_selectable,
                    'lastMove': (r, q) in previous_coords
                })

    p0_score = int(board[0, 0, 3] if player == 0 else board[0, 1, 3])
    p1_score = int(board[0, 1, 3] if player == 0 else board[0, 0, 3])
    round_val = int(board[0, 2, 3])

    return json.dumps({
        'viewData': {
            'cells': cells,
        },
        'statusMessage': status,
        'currentPlayer': player,
        'gameEnded': _end_game(),
        'winners': winners if _end_game() else [],
        'editMode': edit_mode,
        'canUndo': (len(history) > 0 or interaction_step > 0),
        'extra': {
            'p0_score': p0_score,
            'p1_score': p1_score,
            'round': round_val
        },
    })
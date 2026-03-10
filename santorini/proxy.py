import json
import numpy as np
from MCTS import MCTS
from SantoriniGame import SantoriniGame as Game
import SantoriniConstants as constants


class dotdict(dict):
    # Allows dot notation access to dictionary attributes
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
selected_worker_pos = None
selected_move_pos = None
selected_build_pos = None
previous_coords = {}
edit_mode = 0
use_power = False


def init_game(numMCTSSims):
    # Initializes the game engine, MCTS, and global state variables
    global g, board, mcts, player, history, valids, game_result
    global interaction_step, selected_worker_pos, selected_move_pos, edit_mode

    mcts_args = dotdict({
        'numMCTSSims': numMCTSSims,
        'fpu': 0.03,
        'cpuct': 2.75,
        'prob_fullMCTS': 1.,
        'forced_playouts': False,
        'no_mem_optim': False,
    })

    g = Game()
    board = g.getInitBoard()
    mcts = MCTS(g, None, mcts_args)
    player = 0
    history = []
    valids = g.getValidMoves(board, player)
    game_result = [0] * 2
    
    _reset_interaction()
    return get_render_state()


def getNextState(action):
    # Applies the chosen action, updates history, and evaluates win conditions
    global g, board, mcts, player, history, valids, game_result, previous_coords
    
    history.insert(0, [player, np.copy(board)])
    previous_coords = _decode_coords_from_action(action)
    
    board, player = g.getNextState(board, player, action)
    game_result = g.getGameEnded(board, player).tolist()
    valids = g.getValidMoves(board, player)
    
    _reset_interaction(full_reset=False)
    return get_render_state()


def changeDifficulty(numMCTSSims):
    # Updates the number of MCTS simulations to adjust AI strength
    global g, board, mcts, player, history
    mcts.args.numMCTSSims = numMCTSSims


def undo(arePlayersHuman=None):
    # Reverts the game state to the previous turn, optionally skipping AI turns
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
    # Toggles the board editing mode
    global edit_mode
    edit_mode = int(mode)
    _reset_interaction()
    return get_render_state()


def handle_action(actionName, *args):
    # Routes UI actions (clicks, power toggles) to the underlying logic
    global interaction_step, selected_worker_pos, selected_move_pos, selected_build_pos, edit_mode, use_power
    
    if actionName == "togglePower":
        use_power = args[0]
        if interaction_step == 3:
            matches = _get_matching_actions(selected_build_pos[0], selected_build_pos[1])
            for action, p_val in matches:
                if p_val == use_power:
                    return getNextState(action)
        return get_render_state()

    if actionName == "click_cell":
        y, x = args[0], args[1]
        
        if interaction_step == 0:
            if _get_worker_id(y, x) != -1 and _has_valid_moves(y, x):
                interaction_step = 1
                selected_worker_pos = (y, x)

        elif interaction_step == 1:
            if _is_valid_move_target(y, x):
                interaction_step = 2
                selected_move_pos = (y, x)
            elif (y, x) == selected_worker_pos:
                _reset_interaction()
            elif _get_worker_id(y, x) != -1 and _has_valid_moves(y, x):
                selected_worker_pos = (y, x)
            else:
                _reset_interaction()

        elif interaction_step == 2:
            if _is_valid_build_target(y, x):
                matches = _get_matching_actions(y, x)
                if len(matches) > 1:
                    interaction_step = 3
                    selected_build_pos = (y, x)
                elif len(matches) == 1:
                    return getNextState(matches[0][0])
            else:
                _reset_interaction()
                
        elif interaction_step == 3:
            if _is_valid_build_target(y, x):
                selected_build_pos = (y, x)
            else:
                _reset_interaction()
                
        return get_render_state()


def _end_game():
    # Checks if any player has met the win conditions
    return max(game_result) > 0


def _reset_interaction(full_reset=True):
    # Clears current turn interaction state variables
    global interaction_step, selected_worker_pos, selected_move_pos, selected_build_pos, previous_coords
    interaction_step = 0
    if full_reset:
        previous_coords = {}
    selected_worker_pos = None
    selected_move_pos = None
    selected_build_pos = None


def _get_worker_id(y, x):
    # Maps the board cell value to a specific worker ID for the current player
    val = board[y, x, 0]
    if player == 0:
        if val == 1: return 0
        if val == 2: return 1
    else:
        if val == -1: return 0
        if val == -2: return 1
    return -1


def _coords_to_direction(from_y, from_x, to_y, to_x):
    # Translates a start and end coordinate into a direction index (0-8)
    diff_y = to_y - from_y
    diff_x = to_x - from_x
    if abs(diff_y) > 1 or abs(diff_x) > 1:
        return -1
    return (diff_y + 1) * 3 + (diff_x + 1)


def _direction_to_coords(from_y, from_x, direction):
    # Reconstructs destination coordinates based on starting position and direction
    if direction == 4:
        return from_y, from_x
    diff_y = (direction // 3) - 1
    diff_x = (direction % 3) - 1
    return from_y + diff_y, from_x + diff_x


def _get_valid_actions_for_worker(y, x):
    # Extracts all legal move/build combinations for a given worker
    w_id = _get_worker_id(y, x)
    if w_id == -1: return []
    
    valid_actions = []
    for action, is_valid in enumerate(valids):
        if is_valid:
            w, p, m_dir, b_dir = constants._decode_action(action)
            if w == w_id:
                valid_actions.append((m_dir, b_dir, bool(p)))
    return valid_actions


def _has_valid_moves(y, x):
    # Checks if a worker has any legal actions available
    return len(_get_valid_actions_for_worker(y, x)) > 0


def _is_valid_move_target(y, x):
    # Validates if the selected worker can move to the target coordinates
    m_dir = _coords_to_direction(selected_worker_pos[0], selected_worker_pos[1], y, x)
    if m_dir == -1: return False
    
    for v_m_dir, v_b_dir, v_p in _get_valid_actions_for_worker(selected_worker_pos[0], selected_worker_pos[1]):
        if v_m_dir == m_dir:
            return True
    return False


def _is_valid_build_target(y, x):
    # Validates if the selected worker can build at the target coordinates after moving
    m_dir = _coords_to_direction(selected_worker_pos[0], selected_worker_pos[1], selected_move_pos[0], selected_move_pos[1])
    b_dir = _coords_to_direction(selected_move_pos[0], selected_move_pos[1], y, x)
    if m_dir == -1 or b_dir == -1: return False
    
    for v_m_dir, v_b_dir, v_p in _get_valid_actions_for_worker(selected_worker_pos[0], selected_worker_pos[1]):
        if v_m_dir == m_dir and v_b_dir == b_dir:
            return True
    return False


def _get_matching_actions(build_y, build_x):
    # Retrieves specific action indices that exactly match the sequence of inputs
    w_id = _get_worker_id(selected_worker_pos[0], selected_worker_pos[1])
    m_dir = _coords_to_direction(selected_worker_pos[0], selected_worker_pos[1], selected_move_pos[0], selected_move_pos[1])
    b_dir = _coords_to_direction(selected_move_pos[0], selected_move_pos[1], build_y, build_x)
    
    matches = []
    for action, is_valid in enumerate(valids):
        if is_valid:
            w, p, v_m, v_b = constants._decode_action(action)
            if w == w_id and v_m == m_dir and v_b == b_dir:
                matches.append((action, bool(p)))
    return matches


def _decode_coords_from_action(action):
    # Converts an action index back into exact board coordinates for UI tracking
    w_id, p, m_dir, b_dir = constants._decode_action(action)
    
    worker_y, worker_x = -1, -1
    target_val = (w_id + 1) if player == 0 else -(w_id + 1)
    
    for y in range(5):
        for x in range(5):
            if board[y, x, 0] == target_val:
                worker_y, worker_x = y, x
                break
        if worker_y != -1:
            break
            
    move_y, move_x = _direction_to_coords(worker_y, worker_x, m_dir)
    build_y, build_x = _direction_to_coords(move_y, move_x, b_dir)
    
    return {
        'from': (worker_y, worker_x),
        'to': (move_y, move_x),
        'build': (build_y, build_x),
        'power': bool(p)
    }


def _can_use_power_context(power_active):
    # Determines if the power toggle buttons should be active based on ambiguity
    if interaction_step == 3:
        matches = _get_matching_actions(selected_build_pos[0], selected_build_pos[1])
        for action, p_val in matches:
            if p_val == power_active: 
                return True
    return False


def get_render_state():
    # Packages the current game state into a JSON payload for Alpine.js rendering
    global g, board, player, game_result, edit_mode
    global interaction_step, selected_worker_pos, selected_move_pos, previous_coords

    if _end_game():
        winners = [i for i, x in enumerate(game_result) if x == max(game_result)]
        if len(winners) == 1:
            status = f"Game Over! Player {winners[0]} wins!"
        else:
            status = f"Game Over! Players {winners} win!"
    elif edit_mode != 0:
        status = "Edit Mode"
    else:
        p_name = f"Player {player}"
        if interaction_step == 0: status = f"{p_name}: Select Worker"
        elif interaction_step == 1: status = f"{p_name}: Move"
        elif interaction_step == 2: status = f"{p_name}: Build"
        else: status = p_name

    cells = [ [_make_cell(r, c, board, interaction_step) for c in range(5)] for r in range(5) ]

    p0_god = int((g.board.gods_power.flat[constants.NB_GODS*0: constants.NB_GODS*1] >= 64).argmax()) if constants.NB_GODS > 1 else 0
    p1_god = int((g.board.gods_power.flat[constants.NB_GODS*1: constants.NB_GODS*2] >= 64).argmax()) if constants.NB_GODS > 1 else 0

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
            'p0_god': p0_god,
            'p1_god': p1_god,
            'isPowerActive': use_power,
            'canSelectPower': _can_use_power_context(True),
            'canSelectNoPower': _can_use_power_context(False),
        },
    })


def _make_cell(r, c, board, interaction_step):
    # Generates the display metadata for a single board cell
    w_val = int(board[r, c, 0])
    lvl   = int(board[r, c, 1])
    cell = {
        'y': r, 'x': c,
        'level': lvl,
        'player': -1 if w_val == 0 else 0 if w_val > 0 else 1,
        'worker': abs(w_val),
        'isSelectable': False,
        'lastWorker': False,
        'lastBuild': False,
    }

    if edit_mode != 0:
        cell['isSelectable'] = True
    elif not _end_game():
        if interaction_step == 0:
            if _get_worker_id(r, c) != -1 and _has_valid_moves(r, c):
                cell['isSelectable'] = True
            if (r, c) == previous_coords.get('from'):
                cell['lastWorker'] = True
            if (r, c) == previous_coords.get('build'):
                cell['lastBuild'] = True
        
        elif interaction_step == 1:
            if _is_valid_move_target(r, c):
                cell['isSelectable'] = True
                
        elif interaction_step == 2:
            if _is_valid_build_target(r, c):
                cell['isSelectable'] = True

        elif interaction_step == 3:
            if _is_valid_build_target(r, c):
                cell['isSelectable'] = True

    return cell
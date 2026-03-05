from MCTS import MCTS
from SantoriniGame import SantoriniGame as Game
import SantoriniConstants as constants
import numpy as np
import json

# ==========================================
# ===== CONSTANTS & CONFIGURATION ==========
# ==========================================

# Helper for MCTS arguments
class dotdict(dict):
    def __getattr__(self, name):
        return self[name]

# ==========================================
# ===== GLOBAL STATE =======================
# ==========================================

g = None
board = None      # Numpy array (5, 5, 3)
mcts = None
player = 0        # 0 or 1, purely for UI display "Player X turn"
history = []      # For Undo
valids = []       # Valid moves bitmask
game_result = [0] * 2 # O if not finished, 1 if wins, -1 if loses, 0.01 if ties

# Interaction State Machine
interaction_step = 0        # 0: Select Worker, 1: Move, 2: Build
selected_worker_pos = None  # (y, x)
selected_move_pos = None    # (y, x)
selected_build_pos = None   # (y, x)
previous_coords = {}        # {'from': (y, x), 'to': (y, x), 'build': (y, x)}
edit_mode = 0               # 0: Play, 1: Levels, 2: Workers
use_power = False           # Nouvel état pour le toggle du pouvoir

# ==========================================
# ===== MAIN INTERFACE FUNCTIONS ===========
# ==========================================

def init_game(numMCTSSims):
    """Initializes the game and returns the initial UI state."""
    global g, board, mcts, player, history, valids, game_result
    global interaction_step, selected_worker_pos, selected_move_pos, edit_mode

    mcts_args = dotdict({
        'numMCTSSims'     : numMCTSSims,
        'fpu'             : 0.03,
        'cpuct'           : 2.75,
        'prob_fullMCTS'   : 1.,
        'forced_playouts' : False,
        'no_mem_optim'    : False,
    })

    g = Game()
    board = g.getInitBoard() # Should return (5, 5, 3)
    mcts = MCTS(g, None, mcts_args)
    player = 0
    history = []
    valids = g.getValidMoves(board, player)
    game_result = [0] * 2
    
    _reset_interaction()
    return get_render_state()

def getNextState(action):
    """Executes an action and returns the new state."""
    global g, board, mcts, player, history, valids, game_result, previous_coords
    
    # Save history (Deep copy of board is important)
    history.insert(0, [player, np.copy(board)])
    previous_coords = _decode_coords_from_action(action)
    
    # Apply move
    board, player = g.getNextState(board, player, action)
    
    # Check end game
    game_result = g.getGameEnded(board, player).tolist()
    
    # Update valid moves for the new state
    valids = g.getValidMoves(board, player)
    
    _reset_interaction(full_reset=False)
    return get_render_state()

def changeDifficulty(numMCTSSims):
    global g, board, mcts, player, history
    mcts.args.numMCTSSims = numMCTSSims
    print('Difficulty changed to', mcts.args.numMCTSSims);

def undo(arePlayersHuman=None):
    """Reverts to the previous state."""
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
    global edit_mode
    edit_mode = int(mode)
    _reset_interaction()
    return get_render_state()

def handle_action(actionName, *args):
    global interaction_step, selected_worker_pos, selected_move_pos, selected_build_pos, edit_mode, use_power
    
    if actionName == "togglePower":
        use_power = args[0]
        # Si on est à l'étape 3, le clic sur le bouton VALIDE le coup
        if interaction_step == 3:
            matches = _get_matching_actions(selected_build_pos[0], selected_build_pos[1])
            for action, p_val in matches:
                if p_val == use_power:
                    return getNextState(action)
        return get_render_state()

    if actionName == "click_cell":
        y, x = args[0], args[1]
        
        # --- Step 0: Select Worker ---
        if interaction_step == 0:
            if _get_worker_id(y, x) != -1 and _has_valid_moves(y, x):
                interaction_step = 1
                selected_worker_pos = (y, x)

        # --- Step 1: Select Move Target ---
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

        # --- Step 2: Select Build Target ---
        elif interaction_step == 2:
            if _is_valid_build_target(y, x):
                matches = _get_matching_actions(y, x)
                # S'il y a ambiguïté (ex: Atlas), on passe à l'étape 3 pour attendre le clic du bouton
                if len(matches) > 1:
                    interaction_step = 3
                    selected_build_pos = (y, x)
                # S'il n'y a qu'une seule façon de jouer ce coup, on l'exécute de suite
                elif len(matches) == 1:
                    return getNextState(matches[0][0])
            else:
                _reset_interaction()
                
        # --- Step 3: Pending Power Validation ---
        elif interaction_step == 3:
            # Permet de changer d'avis sur la case de construction avant de valider
            if _is_valid_build_target(y, x):
                selected_build_pos = (y, x)
            else:
                _reset_interaction()
                
        return get_render_state()

async def run_ai_step():
    canonicalBoard = g.getCanonicalForm(board, player)
    probs, _, _ = await mcts.getActionProb(canonicalBoard, temp=0)
    action = np.argmax(probs)
    print(f"best action = {action}")
    return getNextState(action)

# ==========================================
# ===== LOGIC HELPERS ======================
# ==========================================

def _end_game():
    return max(game_result) > 0

def _reset_interaction(full_reset=True):
    global interaction_step, selected_worker_pos, selected_move_pos, selected_build_pos, previous_coords
    interaction_step = 0
    if full_reset:
        previous_coords = {}
    selected_worker_pos = None
    selected_move_pos = None
    selected_build_pos = None

def _apply_edit(y, x):
    global board, edit_mode
    if edit_mode == 1:
        current_lvl = board[y, x, 1]
        board[y, x, 1] = (current_lvl + 1) % 5
    elif edit_mode == 2:
        val = board[y, x, 0]
        if val > 0: board[y, x, 0] = -1
        elif val < 0: board[y, x, 0] = 0
        else: board[y, x, 0] = 1

def _get_worker_id(y, x):
    val = board[y, x, 0]
    if player == 0:
        if val == 1: return 0
        if val == 2: return 1
    else:
        if val == -1: return 0
        if val == -2: return 1
    return -1

def _coords_to_direction(from_y, from_x, to_y, to_x):
    diff_y = to_y - from_y
    diff_x = to_x - from_x
    if abs(diff_y) > 1 or abs(diff_x) > 1:
        return -1
    return (diff_y + 1) * 3 + (diff_x + 1)

def _direction_to_coords(from_y, from_x, direction):
    if direction == 4:
        return from_y, from_x
    diff_y = (direction // 3) - 1
    diff_x = (direction % 3) - 1
    return from_y + diff_y, from_x + diff_x

def _get_valid_actions_for_worker(y, x):
    """Returns all valid (m_dir, b_dir, p) tuples for a worker, ignoring use_power toggle for visual highlighting."""
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
    return len(_get_valid_actions_for_worker(y, x)) > 0

def _is_valid_move_target(y, x):
    m_dir = _coords_to_direction(selected_worker_pos[0], selected_worker_pos[1], y, x)
    if m_dir == -1: return False
    
    for v_m_dir, v_b_dir, v_p in _get_valid_actions_for_worker(selected_worker_pos[0], selected_worker_pos[1]):
        if v_m_dir == m_dir:
            return True
    return False

def _is_valid_build_target(y, x):
    m_dir = _coords_to_direction(selected_worker_pos[0], selected_worker_pos[1], selected_move_pos[0], selected_move_pos[1])
    b_dir = _coords_to_direction(selected_move_pos[0], selected_move_pos[1], y, x)
    if m_dir == -1 or b_dir == -1: return False
    
    for v_m_dir, v_b_dir, v_p in _get_valid_actions_for_worker(selected_worker_pos[0], selected_worker_pos[1]):
        if v_m_dir == m_dir and v_b_dir == b_dir:
            return True
    return False

def _get_matching_actions(build_y, build_x):
    """Retourne toutes les actions valides qui correspondent EXACTEMENT aux coordonnées cliquées."""
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
    """Contextually checks if the power option is available. 
    Buttons are now strictly enabled ONLY during ambiguity resolution (Step 3)."""
    
    if interaction_step == 3:
        matches = _get_matching_actions(selected_build_pos[0], selected_build_pos[1])
        for action, p_val in matches:
            if p_val == power_active: 
                return True
                
    # Pour toutes les autres étapes (0, 1, 2), l'auto-détection fait le travail, 
    # donc on désactive (grise) les boutons pour ne pas perturber l'utilisateur.
    return False

# ==========================================
# ===== VIEW GENERATION ====================
# ==========================================

def get_render_state():
    global g, board, player, game_result, edit_mode
    global interaction_step, selected_worker_pos, selected_move_pos, previous_coords

    # 1. Status Text
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

    # 2. Grid Construction
    cells = [ [_make_cell(r, c, board, interaction_step) for c in range(5)] for r in range(5) ]

    # 3. Récupération des dieux assignés par la logique (0 si pas de dieux)
    p0_god = int((g.board.gods_power.flat[constants.NB_GODS*0: constants.NB_GODS*1] >= 64).argmax()) if constants.NB_GODS > 1 else 0
    p1_god = int((g.board.gods_power.flat[constants.NB_GODS*1: constants.NB_GODS*2] >= 64).argmax()) if constants.NB_GODS > 1 else 0

    return json.dumps({
        'viewData': {
            'cells': cells,
        },
        'statusMessage': status,
        'currentPlayer': player,
        'gameEnded': _end_game(),
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
    w_val = int(board[r, c, 0])
    lvl   = int(board[r, c, 1])
    cell = {
        'y': r, 'x': c,
        'level': lvl,
        'player': -1 if w_val == 0 else 0 if w_val > 0 else 1, # -1 is empty
        'worker': abs(w_val), # 1 or 2
        'isSelectable': False,
        'isSelected': False,
        'lastWorker': False,
        'lastBuild': False,
    }

    # --- Highlighting Logic ---
    if edit_mode != 0:
        cell['isSelectable'] = True
    elif not _end_game():
        # Step 0: Own Workers
        if interaction_step == 0:
            # FIX: Allow Player 1 to select their workers
            if _get_worker_id(r, c) != -1 and _has_valid_moves(r, c):
                cell['isSelectable'] = True
            if (r, c) == previous_coords.get('from'):
                cell['lastWorker'] = True
            if (r, c) == previous_coords.get('build'):
                cell['lastBuild'] = True
        
        # Step 1: Move Targets
        elif interaction_step == 1:
            # FIX: Make cell selectable IF it's a valid move (even on itself for NO_MOVE)
            if _is_valid_move_target(r, c):
                cell['isSelectable'] = True
            # Visual highlight remains independent
            if (r, c) == selected_worker_pos:
                cell['isSelected'] = True
                
        # Step 2: Build Targets
        elif interaction_step == 2:
            # FIX: Make cell selectable IF it's a valid build (even on itself for NO_BUILD)
            if _is_valid_build_target(r, c):
                cell['isSelectable'] = True
            if (r, c) == selected_move_pos:
                cell['isSelected'] = True

        # Step 3: Await Power Validation
        elif interaction_step == 3:
            if _is_valid_build_target(r, c):
                cell['isSelectable'] = True
            if (r, c) == selected_move_pos or (r, c) == selected_build_pos:
                cell['isSelected'] = True

    return cell

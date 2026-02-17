from MCTS import MCTS
from SantoriniGame import SantoriniGame as Game
import numpy as np
import json

# ==========================================
# ===== CONSTANTS & CONFIGURATION ==========
# ==========================================

NB_GODS = 1

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
game_result = [0] * 2

# Interaction State Machine
interaction_step = 0        # 0: Select Worker, 1: Move, 2: Build
selected_worker_pos = None  # (y, x)
selected_move_pos = None    # (y, x)
edit_mode = 0               # 0: Play, 1: Levels, 2: Workers

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
    valids = g.getValidMoves(board, 1) # 1 is always canonical current player
    game_result = [0] * 2
    
    _reset_interaction()
    return get_render_state()

def getNextState(action):
    """Executes an action and returns the new state."""
    global g, board, mcts, player, history, valids, game_result
    
    # Save history (Deep copy of board is important)
    history.insert(0, [player, np.copy(board)])
    
    # Apply move. 
    # Logic: Game.getNextState usually flips the board perspective.
    board, player = g.getNextState(board, 1, action)
    
    # Check end game
    game_result = g.getGameEnded(board, 1).tolist()
    
    # Update valid moves for the new state
    valids = g.getValidMoves(board, 1)
    
    _reset_interaction()
    return get_render_state()

def undo():
    """Reverts to the previous state."""
    global g, board, player, history, valids, game_result
    
    if interaction_step > 0:
        _reset_interaction()
        return get_render_state()

    if len(history) > 0:
        prev = history.pop(0)
        player = prev[0]
        board = prev[1]
        valids = g.getValidMoves(board, 1)
        game_result = [0] * 2
        _reset_interaction()
    
    return get_render_state()

def set_edit_mode(mode):
    global edit_mode
    edit_mode = int(mode)
    _reset_interaction()
    return get_render_state()

def handle_click(y, x):
    """Main interaction handler."""
    global interaction_step, selected_worker_pos, selected_move_pos, edit_mode
    global g, board, player, game_result
    
    y, x = int(y), int(x)

    if edit_mode != 0:
        _apply_edit(y, x)
        return get_render_state()

    if _end_game():
        return get_render_state()

    # --- Step 0: Select Worker ---
    if interaction_step == 0:
        # Canonical: Current player workers are always positive (1 or 2)
        worker_val = board[y, x, 0]
        if worker_val > 0: 
            if _has_valid_moves(y, x):
                interaction_step = 1
                selected_worker_pos = (y, x)

    # --- Step 1: Select Move Target ---
    elif interaction_step == 1:
        if (y, x) == selected_worker_pos:
            _reset_interaction()
        elif board[y, x, 0] > 0 and _has_valid_moves(y, x):
             # Changed mind: selected another own worker
            selected_worker_pos = (y, x)
        elif _is_valid_move_target(y, x):
            interaction_step = 2
            selected_move_pos = (y, x)
        else:
            _reset_interaction()

    # --- Step 2: Select Build Target ---
    elif interaction_step == 2:
        if (y, x) == selected_worker_pos:
            # Backtrack to move selection
            interaction_step = 1
            selected_move_pos = None
        elif _is_valid_build_target(y, x):
            # === ACTION COMMIT ===
            action = _construct_action_from_selection(y, x)
            return getNextState(action)
        
    return get_render_state()


# ==========================================
# ===== LOGIC HELPERS ======================
# ==========================================

def _end_game():
    return max(game_result) > 0

def _reset_interaction():
    global interaction_step, selected_worker_pos, selected_move_pos
    interaction_step = 0
    selected_worker_pos = None
    selected_move_pos = None

def _apply_edit(y, x):
    global board, edit_mode
    # Layer 0: Workers, Layer 1: Levels
    if edit_mode == 1: # Edit Level
        current_lvl = board[y, x, 1]
        board[y, x, 1] = (current_lvl + 1) % 5
    elif edit_mode == 2: # Edit Worker
        # Cycle: 0 -> 1 -> -1 -> 0 (Simple toggle for UI)
        # Note: This is a bit hacky on a canonical board, but valid for visual setup
        current_w = board[y, x, 0]
        if current_w == 0: board[y, x, 0] = 1
        elif current_w == 1: board[y, x, 0] = 2
        elif current_w == 2: board[y, x, 0] = -1
        elif current_w == -1: board[y, x, 0] = -2
        else: board[y, x, 0] = 0                # Remove

def _get_worker_index(y, x):
    return abs(board[y, x, 0])

def _get_direction(r1, c1, r2, c2):
    """Returns 0-8 direction or -1 if invalid."""
    dr = r2 - r1
    dc = c2 - c1
    if abs(dr) > 1 or abs(dc) > 1 or (dr == 0 and dc == 0):
        return -1
    # Formula: (dy + 1) * 3 + (dx + 1)
    return (dr + 1) * 3 + (dc + 1)

def _get_coords_from_dir(r, c, d):
    dr = (d // 3) - 1
    dc = (d % 3) - 1
    return r + dr, c + dc

# --- Action Encoding / Decoding (As per prompt) ---

def _encode_action(worker_idx, power, move_dir, build_dir):
    # Action = NB_GODS * 9 * 9 * worker + 9 * 9 * power + 9 * move + build
    # NB_GODS = 1, Power = 0 (in No God mode)
    action = (NB_GODS * 81 * worker_idx) + (81 * power) + (9 * move_dir) + build_dir
    return action

def _decode_action(action):
    # worker, action_ = divmod(action, NB_GODS*9*9)
    # power, action_ = divmod(action_, 9*9)
    # move, build = divmod(action_, 9)
    
    worker_idx = action // (NB_GODS * 81)
    rem = action % (NB_GODS * 81)
    
    power = rem // 81
    rem = rem % 81
    
    move_dir = rem // 9
    build_dir = rem % 9
    
    return worker_idx, power, move_dir, build_dir

# --- Validation Logic ---

def _has_valid_moves(y, x):
    w_idx = _get_worker_index(y, x)
    if w_idx == 0: return False
    
    for act, is_valid in enumerate(valids):
        if is_valid:
            aw, ap, am, ab = _decode_action(act)
            if aw == w_idx:
                return True
    return False

def _is_valid_move_target(y, x):
    if selected_worker_pos is None: return False
    wy, wx = selected_worker_pos
    w_idx = _get_worker_index(wy, wx)
    
    # Calculate required direction
    req_dir = _get_direction(wy, wx, y, x)
    if req_dir == 0: return False

    for act, is_valid in enumerate(valids):
        if is_valid:
            aw, ap, am, ab = _decode_action(act)
            if aw == w_idx and am == req_dir:
                return True
    return False

def _is_valid_build_target(y, x):
    if selected_worker_pos is None or selected_move_pos is None: return False
    
    wy, wx = selected_worker_pos
    my, mx = selected_move_pos
    w_idx = _get_worker_index(wy, wx)
    
    move_dir = _get_direction(wy, wx, my, mx)
    build_dir = _get_direction(my, mx, y, x)
    
    if build_dir == -1: return False
    
    for act, is_valid in enumerate(valids):
        if is_valid:
            aw, ap, am, ab = _decode_action(act)
            if aw == w_idx and am == move_dir and ab == build_dir:
                return True
    return False

def _construct_action_from_selection(build_y, build_x):
    wy, wx = selected_worker_pos
    my, mx = selected_move_pos
    
    w_idx = _get_worker_index(wy, wx)
    move_dir = _get_direction(wy, wx, my, mx)
    build_dir = _get_direction(my, mx, build_y, build_x)
    
    # Power is always 0 in No God mode
    return _encode_action(w_idx, 0, move_dir, build_dir)


# ==========================================
# ===== VIEW GENERATION ====================
# ==========================================

def get_render_state():
    global g, board, player, game_result, edit_mode
    global interaction_step, selected_worker_pos, selected_move_pos

    # 1. Status Text
    if _end_game():
        winners = [i for i, x in enumerate(game_result) if x == game_result.max()]
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
    cells = []
    for r in range(5):
        for c in range(5):
            # Read from State (5x5x3)
            # Layer 0: Workers (1, 2, -1, -2)
            # Layer 1: Levels (0-4)
            w_val = int(board[r, c, 0])
            lvl   = int(board[r, c, 1])
            
            cell = {
                'y': r, 'x': c,
                'text': '',
                'colorClass': 'white', # default
                'isSelectable': False,
                'isSelected': False
            }
            
            # --- Text Content ---
            if w_val != 0:
                # Map 1,2 -> P0 | -1,-2 -> P1 (Visual mapping)
                # Since board is canonical (Current=Pos), we need to check 'player' var 
                # to decide how to render "Me" vs "Opponent" visually if we want absolute IDs.
                # BUT, simpler: Positive = Current Turn Player.
                
                # Visual Logic:
                # If player=0 and w_val>0 => P0
                # If player=0 and w_val<0 => P1
                # If player=1 and w_val>0 => P1 (Since board is canonical to P1)
                # If player=1 and w_val<0 => P0
                
                real_p_id = player if w_val > 0 else (1 - player)
                cell['text'] = f"P{real_p_id}"
                if lvl > 0: cell['text'] += f"\n{lvl}"
            elif lvl > 0:
                cell['text'] = str(lvl)

            # --- Highlighting Logic ---
            if edit_mode != 0:
                cell['isSelectable'] = True
                cell['colorClass'] = 'yellow' if edit_mode == 1 else 'orange'
            elif not _end_game():
                # Step 0: Own Workers
                if interaction_step == 0:
                    if w_val > 0 and _has_valid_moves(r, c):
                        cell['isSelectable'] = True
                        cell['colorClass'] = 'blue'
                
                # Step 1: Move Targets
                elif interaction_step == 1:
                    if (r, c) == selected_worker_pos:
                        cell['isSelected'] = True
                        cell['colorClass'] = 'teal'
                    elif _is_valid_move_target(r, c):
                        cell['isSelectable'] = True
                        cell['colorClass'] = 'green'
                
                # Step 2: Build Targets
                elif interaction_step == 2:
                    if (r, c) == selected_worker_pos:
                        cell['isSelected'] = True
                        cell['colorClass'] = 'teal'
                    elif (r, c) == selected_move_pos:
                        cell['isSelected'] = True
                        cell['colorClass'] = 'teal'
                    elif _is_valid_build_target(r, c):
                        cell['isSelectable'] = True
                        cell['colorClass'] = 'red'

            cells.append(cell)

    return json.dumps({
        'cells': cells,
        'statusMessage': status,
        'currentPlayer': player,
        'gameEnded': _end_game(),
        'editMode': edit_mode,
        'canUndo': (len(history) > 0 or interaction_step > 0)
    })
    
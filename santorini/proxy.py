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

def handle_action(action_name, *args):
    """Main interaction handler."""
    global interaction_step, selected_worker_pos, selected_move_pos, edit_mode
    global g, board, player, game_result
    
    if action_name == 'click_cell':
        y, x = int(args[0]), int(args[1])

        if edit_mode != 0:
            _apply_edit(y, x)
            return get_render_state()

        if _end_game():
            return get_render_state()

        # --- Step 0: Select Worker ---
        if interaction_step == 0:
            worker_val = board[y, x, 0]
            if worker_val > 0: 
                if _has_valid_moves(y, x):
                    interaction_step = 1
                    selected_worker_pos = (y, x)

        # --- Step 1: Select Move Target ---
        elif interaction_step == 1:
            # On vérifie D'ABORD si cliquer ici est un mouvement valide (permet le NO_MOVE pour certains dieux)
            if _is_valid_move_target(y, x):
                interaction_step = 2
                selected_move_pos = (y, x)
            elif (y, x) == selected_worker_pos:
                _reset_interaction()
            elif board[y, x, 0] > 0 and _has_valid_moves(y, x):
                # Changed mind: selected another own worker
                selected_worker_pos = (y, x)
            else:
                _reset_interaction()

        # --- Step 2: Select Build Target ---
        elif interaction_step == 2:
            if _is_valid_build_target(y, x):
                # === ACTION COMMIT ===
                action = _construct_action_from_selection(y, x)
                return getNextState(action)
            # Si le clic de construction est invalide, on peut décider de reset ou de rester à l'étape 2
            return get_render_state()
    
    elif actionName == "togglePower":
        use_power = args[0]
        # On réinitialise l'étape à la sélection du mouvement (ou du worker) 
        # pour forcer le joueur à re-sélectionner sa cible avec/sans pouvoir
        if interaction_step > 0:
            interaction_step = 1
            selected_move_pos = None

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
    global interaction_step, selected_worker_pos, selected_move_pos, previous_coords
    interaction_step = 0
    if full_reset:
        previous_coords = {}
    selected_worker_pos = None
    selected_move_pos = None

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

# --- NOUVEAUX HELPERS DYNAMIQUES POUR LES DIEUX ---

def _get_worker_id(y, x):
    """Identifie si le worker cliqué est le worker 0 ou 1 du joueur courant."""
    val = board[y, x, 0]
    if player == 0:
        if val == 1: return 0
        if val == 2: return 1
    else:
        if val == -1: return 0
        if val == -2: return 1
    return -1

def _coords_to_direction(from_y, from_x, to_y, to_x):
    """Convertit deux coordonnées en direction de 0 à 8 (4 = sur place)."""
    diff_y = to_y - from_y
    diff_x = to_x - from_x
    if abs(diff_y) > 1 or abs(diff_x) > 1:
        return -1 # Coordonnées trop éloignées
    return (diff_y + 1) * 3 + (diff_x + 1)

def _get_valid_actions_for_worker(y, x):
    """Récupère toutes les paires (move_dir, build_dir) valides pour un worker donné, selon l'état du bouton 'Power'."""
    w_id = _get_worker_id(y, x)
    if w_id == -1: return []
    
    valid_actions = []
    for action, is_valid in enumerate(valids):
        if is_valid:
            w, p, m_dir, b_dir = constants._decode_action(action)
            # On ne garde que les actions du worker sélectionné ET qui correspondent à l'état du pouvoir
            if w == w_id and bool(p) == use_power:
                valid_actions.append((m_dir, b_dir))
    return valid_actions

def _has_any_valid_move(power_active):
    """Vérifie s'il existe au moins une action valide dans l'absolu avec/sans pouvoir (pour activer les boutons UI)."""
    for action, is_valid in enumerate(valids):
        if is_valid:
            w, p, m_dir, b_dir = constants._decode_action(action)
            if bool(p) == power_active:
                return True
    return False

def _has_valid_moves(y, x):
    """Vérifie si le worker cliqué a des coups jouables."""
    return len(_get_valid_actions_for_worker(y, x)) > 0

def _is_valid_move_target(y, x):
    """Vérifie si la case ciblée correspond à une direction de mouvement valide."""
    m_dir = _coords_to_direction(selected_worker_pos[0], selected_worker_pos[1], y, x)
    if m_dir == -1: return False
    
    valid_actions = _get_valid_actions_for_worker(selected_worker_pos[0], selected_worker_pos[1])
    # S'il existe au moins une action valide qui commence par ce mouvement, c'est bon
    for v_m_dir, v_b_dir in valid_actions:
        if v_m_dir == m_dir:
            return True
    return False

def _is_valid_build_target(y, x):
    """Vérifie si la case ciblée correspond à une direction de construction valide, sachant le mouvement précédent."""
    m_dir = _coords_to_direction(selected_worker_pos[0], selected_worker_pos[1], selected_move_pos[0], selected_move_pos[1])
    b_dir = _coords_to_direction(selected_move_pos[0], selected_move_pos[1], y, x)
    if m_dir == -1 or b_dir == -1: return False
    
    valid_actions = _get_valid_actions_for_worker(selected_worker_pos[0], selected_worker_pos[1])
    # Il faut que le couple exact (mouvement choisi, construction ciblée) soit valide
    for v_m_dir, v_b_dir in valid_actions:
        if v_m_dir == m_dir and v_b_dir == b_dir:
            return True
    return False

def _construct_action_from_selection(build_y, build_x):
    """Encode le choix final du joueur en un entier 'action' compréhensible par le moteur Python/C++."""
    w_id = _get_worker_id(selected_worker_pos[0], selected_worker_pos[1])
    m_dir = _coords_to_direction(selected_worker_pos[0], selected_worker_pos[1], selected_move_pos[0], selected_move_pos[1])
    b_dir = _coords_to_direction(selected_move_pos[0], selected_move_pos[1], build_y, build_x)
    return constants._encode_action(w_id, int(use_power), m_dir, b_dir)

def _direction_to_coords(from_y, from_x, direction):
    """Convertit une direction (0-8) en coordonnées (y, x) d'arrivée."""
    if direction == 4: # Mouvement sur place (NO_MOVE / NO_BUILD)
        return from_y, from_x
    diff_y = (direction // 3) - 1
    diff_x = (direction % 3) - 1
    return from_y + diff_y, from_x + diff_x

def _decode_coords_from_action(action):
    """
    Prend un entier 'action' généré par le moteur et renvoie les coordonnées sous forme de dictionnaire.
    """
    w_id, p, m_dir, b_dir = constants._decode_action(action)
    
    # 1. Retrouver les coordonnées de départ du worker
    worker_y, worker_x = -1, -1
    target_val = (w_id + 1) if player == 0 else -(w_id + 1)
    
    for y in range(5):
        for x in range(5):
            if board[y, x, 0] == target_val:
                worker_y, worker_x = y, x
                break
        if worker_y != -1:
            break
            
    # 2. Calculer la destination du mouvement
    move_y, move_x = _direction_to_coords(worker_y, worker_x, m_dir)
    
    # 3. Calculer la cible de construction
    build_y, build_x = _direction_to_coords(move_y, move_x, b_dir)
    
    # On renvoie le dictionnaire exact attendu par _make_cell
    return {
        'from': (worker_y, worker_x),
        'to': (move_y, move_x),
        'build': (build_y, build_x),
        'power': bool(p)
    }

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
    p0_god = int(g.board.gods_power.ravel()[0]) if constants.NB_GODS > 1 else 0
    p1_god = int(g.board.gods_power.ravel()[1]) if constants.NB_GODS > 1 else 0

    return json.dumps({
        'viewData': {
            'cells': cells,
        },
        'statusMessage': status,
        'currentPlayer': player,
        'gameEnded': _end_game(),
        'editMode': edit_mode,
        'canUndo': (len(history) > 0 or interaction_step > 0),
        'p0_god': p0_god,
        'p1_god': p1_god,
        'isPowerActive': use_power,
        # Les boutons s'activent si le joueur a au moins un coup valide avec/sans pouvoir
        'canSelectPower': _has_any_valid_move(power_active=True),
        'canSelectNoPower': _has_any_valid_move(power_active=False),
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
            if w_val > 0 and _has_valid_moves(r, c):
                cell['isSelectable'] = True
            if (r, c) == previous_coords.get('from'):
                cell['lastWorker'] = True
            if (r, c) == previous_coords.get('build'):
                cell['lastBuild'] = True
        
        # Step 1: Move Targets
        elif interaction_step == 1:
            if (r, c) == selected_worker_pos:
                cell['isSelected'] = True
            elif _is_valid_move_target(r, c):
                cell['isSelectable'] = True
        
        # Step 2: Build Targets
        elif interaction_step == 2:
            if (r, c) == selected_move_pos:
                cell['isSelected'] = True
            elif _is_valid_build_target(r, c):
                cell['isSelectable'] = True

    return cell

from MCTS import MCTS
from SmallworldGame import SmallworldGame as Game
from SmallworldDisplay import move_to_str
from SmallworldConstants import *
from SmallworldMaps import *
import numpy as np
import json

# ==========================================
# ===== CONSTANTS & CONFIGURATION ==========
# ==========================================

# NUMBER_PLAYERS and NB_AREAS are imported from SmallworldConstants/SmallworldMaps

class dotdict(dict):
    def __getattr__(self, name):
        return self[name]

# ==========================================
# ===== GLOBAL STATE =======================
# ==========================================

g = None
board = None
mcts = None
player = 0         # Current player ID
history = []       # History for Undo feature
valids = []        # Valid moves bitmask
game_result = [0] * NUMBER_PLAYERS
action_log = []

# --- UI State Machine ---
selected_area = -1 # -1 means no area is currently selected
edit_mode = 0      # 0: Play, 1: Edit

# ==========================================
# ===== MAIN INTERFACE FUNCTIONS ===========
# ==========================================

def init_game(numMCTSSims):
    global g, board, mcts, player, history, valids, game_result, action_log
    global selected_area, edit_mode

    mcts_args = dotdict({
        'numMCTSSims'     : numMCTSSims,
        'fpu'             : 0.177,
        'cpuct'           : 0.4,
        'prob_fullMCTS'   : 1.,
        'forced_playouts' : True,
        'no_mem_optim'    : False,
        'universes'       : 2,
    })

    g = Game()
    board = g.getInitBoard()
    mcts = MCTS(g, None, mcts_args)
    player = 0
    history = []
    action_log = []
    
    valids = g.getValidMoves(board, player) 
    game_result = [0] * NUMBER_PLAYERS
    
    selected_area = -1
    edit_mode = 0
    
    return get_render_state()

def getNextState(action):
    global g, board, mcts, player, history, valids, game_result, selected_area, action_log
    
    # Save history
    history.insert(0, [player, np.copy(board)])
    try:
        m_str = move_to_str(action, player)
    except:
        m_str = f"Action {action}"
    action_log.insert(0, f"J{player}: {m_str}")
    if len(action_log) > 6:
        action_log.pop()
    
    # Execute move
    board, player = g.getNextState(board, player, action)

    # Check end game
    res = g.getGameEnded(board, player) 
    if any(r != 0 for r in res):
        game_result = res
        
    valids = g.getValidMoves(board, player)
    
    # Reset interaction
    selected_area = -1
    return get_render_state()

def undo(player_types=None):
    global g, board, player, history, valids, game_result, selected_area, action_log
    
    # 1. Local UI Undo
    if selected_area != -1:
        selected_area = -1
        return get_render_state()

    # 2. Utility to pop one state
    def pop_one_state():
        global board, player, valids, game_result
        if len(history) > 0:
            prev = history.pop(0)
            player = prev[0]
            board = prev[1]
            valids = g.getValidMoves(board, player)
            game_result = [0] * NUMBER_PLAYERS
            if len(action_log) > 0: action_log.pop(0)
            return True
        return False

    # 3. Effective rollback (skipping AIs)
    if pop_one_state():
        if player_types is not None:
            while len(history) > 0 and player_types[player] == 1:
                pop_one_state()

    selected_area = -1
    return get_render_state()

def set_edit_mode(mode):
    global edit_mode, selected_area
    edit_mode = int(mode)
    selected_area = -1
    return get_render_state()

# ==========================================
# ===== ACTION ROUTER (UI -> ENGINE) =======
# ==========================================

def handle_action(action_type, *args):
    """
    Receives UI intents and translates them into Action IDs
    for the SmallworldLogicNumba engine.
    """
    global selected_area, valids
    
    if edit_mode != 0:
        return get_render_state()
        
    if _end_game():
        return get_render_state()

    action_idx = -1

    # --- AREA SELECTION (UI Only) ---
    if action_type == 'select_area':
        selected_area = int(args[0])
        return get_render_state()
        
    # --- AREA TARGETED ACTIONS ---
    elif action_type == 'attack':
        if selected_area >= 0 and selected_area < NB_AREAS:
            action_idx = NB_AREAS + selected_area # FIXED: Shifted by NB_AREAS
            
    elif action_type == 'use_people':
        if selected_area >= 0 and selected_area < NB_AREAS:
            action_idx = 2 * NB_AREAS + selected_area
            
    elif action_type == 'use_power':
        if selected_area >= 0 and selected_area < NB_AREAS:
            action_idx = 3 * NB_AREAS + selected_area
            
    elif action_type == 'deploy':
        if selected_area >= 0 and selected_area < NB_AREAS:
            action_idx = 4 * NB_AREAS + 8 + selected_area

    # --- GLOBAL ACTIONS ---
    elif action_type == 'start_deploy':
        action_idx = 5 * NB_AREAS + 8 + 6 + 2
        
    elif action_type == 'end_turn':
        action_idx = 5 * NB_AREAS + 8 + 6 + 1
        
    elif action_type == 'decline':
        action_idx = 5 * NB_AREAS + 8 + 6

    elif action_type == 'choose_deck':
        deck_index = int(args[0])
        if 0 <= deck_index < DECK_SIZE:
            action_idx = 5 * NB_AREAS + 8 + deck_index

    # --- EXECUTION ---
    if action_idx >= 0 and len(valids) > action_idx and valids[action_idx]:
        return getNextState(action_idx)
    
    return get_render_state()


# ==========================================
# ===== VIEW GENERATION ====================
# ==========================================

def get_render_state():
    """
    Builds the full data tree for Alpine.js.
    Handles Numpy board to ViewModel conversion.
    """
    global board, player, game_result, edit_mode, valids
    
    # 1. Status Message
    status = ""
    if _end_game():
        status = f"Game Over! Winners: {[i for i, v in enumerate(game_result) if v > 0]}"
    elif edit_mode != 0:
        status = "Edit Mode Active"
    else:
        status = f"Player {player}'s Turn"

    # 2. Territories (The Map)
    territories_data = []
    for i in range(NB_AREAS):
        nb_ppl = int(g.board.territories[i, 0])
        ppl_type = int(g.board.territories[i, 1])
        owner = int(g.board.territories[i, 7])
        
        # Compute added defense (fortress, mountains, etc.)
        added_defense = int(g.board.territories[i, 5] - nb_ppl) 
        
        # Force cast to int then bool to guarantee JSON serialization
        # FIXED: Attack index is NB_AREAS + i
        can_attack_here = bool(int(valids[NB_AREAS + i]) == 1) if len(valids) > (NB_AREAS + i) else False
        can_deploy_here = bool(int(valids[4*NB_AREAS + 8 + i]) == 1) if len(valids) > (4*NB_AREAS + 8 + i) else False
        can_use_people_here = bool(int(valids[2*NB_AREAS + i]) == 1) if len(valids) > (2*NB_AREAS + i) else False
        can_use_power_here = bool(int(valids[3*NB_AREAS + i]) == 1) if len(valids) > (3*NB_AREAS + i) else False

        territories_data.append({
            'id': i,
            'owner': owner,
            'nbPeople': nb_ppl,
            'peopleType': ppl_type,
            'addedDefense': added_defense,
            'terrain': int(descr[i][0]),
            'isCavern': bool(descr[i][1]),
            'isMagic': bool(descr[i][2]),
            'isMine': bool(descr[i][3]),
            'isLostTribe': bool(descr[i][4]),
            'isAtEdge': bool(descr[i][5]),
            'isSelected': (i == selected_area),
            'canAttack': can_attack_here,
            'canDeploy': can_deploy_here,
            'canUsePeople': can_use_people_here,
            'canUsePower': can_use_power_here
        })

    # 3. Players (Scores and Peoples)
    players_data = []
    for p in range(NUMBER_PLAYERS):
        current_id = int(g.board.game_status[p, 4])
        
        # Active People
        active_info = g.board.peoples[p, current_id]
        active_data = {
            'nb': int(active_info[0]),
            'type': int(active_info[1]),
            'power': int(active_info[2])
        }
        
        # Declined Peoples
        declined_data = []
        for d_id in range(3):
            if d_id != current_id:
                d_info = g.board.peoples[p, d_id]
                if int(d_info[0]) > 0 or int(d_info[1]) >= 0: 
                    declined_data.append({
                        'nb': int(d_info[0]),
                        'type': int(d_info[1]),
                        'power': int(d_info[2])
                    })
        
        players_data.append({
            'id': p,
            'isCurrentTurn': (p == player),
            'score': int(g.getScore(board, p)),
            'activePeople': active_data,
            'declinedPeoples': declined_data
        })

    # 4. Deck (Available peoples)
    deck_data = []
    for i in range(DECK_SIZE):
        d_info = g.board.visible_deck[i]
        
        action_idx = 5*NB_AREAS + 8 + i
        can_choose = bool(valids[action_idx]) if len(valids) > action_idx else False

        deck_data.append({
            'index': i,
            'nbPeople': int(d_info[0]),
            'peopleType': int(d_info[1]),
            'power': int(d_info[2]),
            'coins': int(d_info[6]),
            'canChoose': can_choose
        })

    # 5. UI Interface (Global buttons state)
    # Check globally if an action type is possible
    # FIXED: Attack range shifted by NB_AREAS
    ui_actions = {
        'canAttack': bool(np.any(valids[NB_AREAS : 2*NB_AREAS])),
        'canUsePeople': bool(np.any(valids[2*NB_AREAS : 3*NB_AREAS])),
        'canUsePower': bool(np.any(valids[3*NB_AREAS : 4*NB_AREAS])),
        'canDeploy': bool(np.any(valids[4*NB_AREAS+8 : 5*NB_AREAS+8])),
        'canChooseDeck': bool(np.any(valids[5*NB_AREAS+8 : 5*NB_AREAS+8+6])),
        'canEndTurn': bool(valids[5*NB_AREAS+8+6+1]) if len(valids) > (5*NB_AREAS+8+6+1) else False,
    }

    state = {
        'statusMessage': status,
        'currentPlayer': player,
        'gameEnded': _end_game(),
        'editMode': edit_mode,
        'canUndo': len(history) > 0,
        'viewData': {
            'territories': territories_data,
            'players': players_data,
            'deck': deck_data,
            'ui': ui_actions,
            'actionLog': action_log,
        }
    }
    
    return json.dumps(state)

def _end_game():
    return any(r != 0 for r in game_result)

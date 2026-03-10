import json
import numpy as np

from MCTS import MCTS
from SmallworldGame import SmallworldGame as Game
from SmallworldDisplay import move_to_str
from SmallworldConstants import *
from SmallworldMaps import *

# Utility class to allow dot notation access for dictionaries
class dotdict(dict):
    def __getattr__(self, name):
        return self[name]

# Global state variables for game mechanics and UI tracking
g, board, mcts, player = None, None, None, 0
history = []

game_started = False
can_add_virtual_start_deploy = True
interaction_step = -1
previous_player = -1
previous_moves = []


def init_game(numMCTSSims):
    # Initializes the game environment, MCTS agent, and resets UI states
    global g, board, mcts, player, history
    global game_started, can_add_virtual_start_deploy, interaction_step, previous_player, previous_moves

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
    
    game_started = False
    can_add_virtual_start_deploy = True
    interaction_step = -1
    previous_player = -1
    previous_moves = []

    return get_render_state()

def undo(are_players_human):
    # Reverts the board to the previous state for the current player
    global player, interaction_step, previous_moves

    revert_to_previous_move(player)
    
    interaction_step = -1
    previous_moves = []
    
    return get_render_state()

def set_edit_mode(mode):
    # Stub to prevent JS crash if the edit mode toggle is triggered
    return get_render_state()

def getNextState(action):
    # Standard entry point for AI moves triggered by the JS client
    execute_move(int(action))
    return get_render_state()

def handle_action(action_name, *args):
    # Routes UI interactions (clicks on map, buttons, or deck) to the proper game action ID
    global interaction_step
    
    N = NB_AREAS
    MR = MAX_REDEPLOY
    DS = DECK_SIZE

    if action_name == "click_btn":
        btn_id = int(args[0])
        interaction_step = btn_id
        if btn_id == 10: 
            execute_move(5*N + MR + DS + 3)
            
    elif action_name == "click_area":
        area = int(args[0])
        action = -1
        if interaction_step == 0:   action = N + area
        elif interaction_step == 1: action = 2*N + area
        elif interaction_step == 2: action = 3*N + area
        elif interaction_step == 4: action = 4*N + MR + area
        elif interaction_step == 8: action = area
        
        if action >= 0:
            execute_move(action)
            
    elif action_name == "click_deck":
        deck_idx = int(args[0])
        action = 5*N + MR + deck_idx
        execute_move(action)
        
    elif action_name == "confirm":
        action = -1
        if interaction_step == 7:   action = 4*N 
        elif interaction_step == 9: action = 5*N + MR + DS 
        elif interaction_step == 6: action = 5*N + MR + DS + 1 
        elif interaction_step == 3: action = 5*N + MR + DS + 2 
        
        if action >= 0:
            execute_move(action)

    return get_render_state()

def execute_move(action):
    # Processes the chosen action, updates game history, and tracks move success for UI feedback
    global g, board, player, history
    global game_started, can_add_virtual_start_deploy, previous_player, previous_moves, interaction_step

    N = NB_AREAS
    MR = MAX_REDEPLOY
    DS = DECK_SIZE
    
    game_started = True

    if action == 5*N + MR + DS + 3: 
        pass 
    elif action == 5*N + MR + DS + 2: 
        previous_player = player
        gather_current_ppl_but_one()
        can_add_virtual_start_deploy = False
    else:
        move_type, area = -1, -1

        if N <= action < 2*N:               move_type, area = 0, action - N
        elif 2*N <= action < 3*N:           move_type, area = 1, action - 2*N
        elif 3*N <= action < 4*N:           move_type, area = 2, action - 3*N
        elif 4*N + MR <= action < 5*N + MR: move_type, area = 4, action - (4*N + MR)
        elif 0 <= action < N:               move_type, area = 8, action
        elif action == 5*N + MR + DS:       move_type, area = 9, -1

        # Store attacking people details before state changes to evaluate success later
        curr_p, curr_id = getCurrentPlayerAndPeople()
        cur_ppl_type = getPplInfo(curr_p, curr_id)[1]

        history.insert(0, [player, np.copy(board), action])
        board, player = g.getNextState(board, player, action)

        success = True
        if move_type == 0:
            area_ppl = getTerritoryInfo2(area)[1]
            if area_ppl != cur_ppl_type:
                success = False

        if previous_player != player:
            previous_moves = []
            previous_player = player

        if move_type >= 0:
            previous_moves.append([area, move_type, success])

        valids = g.getValidMoves(board, player)
        if any(valids[N : 2*N]): 
            can_add_virtual_start_deploy = True

    interaction_step = -1

def get_render_state():
    # Packages the current game state into a JSON payload tailored for the Alpine.js frontend
    global g, board, player, history
    global game_started, can_add_virtual_start_deploy, interaction_step, previous_player, previous_moves

    end = g.getGameEnded(board, player)
    valids = g.getValidMoves(board, player)
    
    N = NB_AREAS
    MR = MAX_REDEPLOY
    DS = DECK_SIZE

    valid_start_deploy = bool(can_add_virtual_start_deploy and any(valids[4*N + MR : 5*N + MR]))
    valid_start = not game_started
    valids_ext = np.append(valids, [valid_start_deploy, valid_start])

    allowed_btns = [
        bool(any(valids_ext[N : 2*N])),             
        bool(any(valids_ext[2*N : 3*N])),           
        bool(any(valids_ext[3*N : 4*N])),           
        bool(valids_ext[5*N + MR + DS + 2]),        
        bool(any(valids_ext[4*N + MR : 5*N + MR])), 
        bool(any(valids_ext[5*N + MR : 5*N + MR + DS])), 
        bool(valids_ext[5*N + MR + DS + 1]),        
        bool(valids_ext[4*N]),                      
        bool(any(valids_ext[0 : N])),               
        bool(valids_ext[5*N + MR + DS]),            
        bool(valids_ext[5*N + MR + DS + 3])         
    ]

    if allowed_btns[10]: 
        allowed_btns = [False] * 11
        allowed_btns[10] = True

    if allowed_btns[3]:  
        allowed_btns[4] = False

    if interaction_step < 0 or not allowed_btns[interaction_step]:
        try:
            interaction_step = allowed_btns.index(True)
        except ValueError:
            interaction_step = -1

    confirm_needed = interaction_step in [3, 6, 7, 9]

    view_board = [getTerritoryInfo2(i) for i in range(NB_AREAS)]

    view_players = []
    for p in range(NUMBER_PLAYERS):
        peoples = [getPplInfo(p, ppl).tolist() for ppl in range(3)]
        view_players.append({
            "score": int(getScore(p)),
            "peoples": peoples
        })

    view_deck = [getDeckInfo(i).tolist() for i in range(DECK_SIZE)]
    curr_player, curr_id = getCurrentPlayerAndPeople()
    need_dice = [bool(needDiceToAttack(i)) for i in range(NB_AREAS)]

    selecting_diplomacy = False
    if interaction_step == 2:
        cur_pwr = g.board.peoples[curr_player, curr_id, 2]
        if cur_pwr == DIPLOMAT:
            selecting_diplomacy = True

    viewData = {
        "board": view_board,
        "players": view_players,
        "deck": view_deck,
        "round": int(getRound()),
        "currentPlayerInfo": [int(curr_player), int(curr_id)]
    }

    extra = {
        "validMoves": [bool(v) for v in valids_ext],
        "allowedBtns": allowed_btns,
        "selectedBtn": int(interaction_step),
        "confirmNeeded": bool(confirm_needed),
        "needDice": need_dice,
        "previousMoves": [[int(m[0]), int(m[1]), bool(m[2])] for m in previous_moves],
        "selectingDiplomacy": bool(selecting_diplomacy),
        "gameStarted": bool(game_started)
    }

    state_dict = {
        "statusMessage": "",
        "currentPlayer": int(player),
        "gameEnded": bool(end[0] != 0 if isinstance(end, np.ndarray) else end != 0),
        "editMode": 0,
        "canUndo": len(history) > 0,
        "viewData": viewData,
        "extra": extra
    }

    return json.dumps(state_dict)


# =============================================================================
# Helper Functions
# =============================================================================

def changeDifficulty(numMCTSSims):
    # Adjusts AI search iterations
    global mcts
    mcts.args.numMCTSSims = numMCTSSims

def revert_to_previous_move(player_asking_revert):
    # Winds back the game history strictly for the designated player
    global g, board, mcts, player, history
    if len(history) > 0:
        for index, state in enumerate(history):
            if (state[0] == player_asking_revert) and (index+1 == len(history) or history[index+1][0] != player_asking_revert):
                break
        player, board = state[0], state[1]
        history = history[index+1:]

def getScore(p):
    return g.board.game_status[p, 6] + SCORE_OFFSET

def getRound():
    return g.board.game_status[:, 3].min()

def getPplInfo(p, ppl):
    # Retrieves the active capabilities and total population count for a given player's people
    total_number_of_people = g.board._total_number_of_ppl(g.board.peoples[p, ppl, :])
    return np.append(g.board.peoples[p, ppl, :5], total_number_of_people)

def getDeckInfo(i):
    return g.board.visible_deck[i][[0,1,2,6]]

def getCurrentPlayerAndPeople():
    current_id = g.board.game_status[player, 4].item()
    return player, current_id

def getTerritoryInfo2(area):
    # Formats raw terrain data into a structure easily digestible by the UI rendering
    data = [
        g.board.territories[area, 0].item(), 
        g.board.territories[area, 1].item(), 
        (g.board.territories[area, 5]-g.board.territories[area, 0]).item(), 
        descr[area][0].item(),               
        [descr[area][1].item(), descr[area][2].item(), descr[area][3].item()], 
    ]
    return data

def needDiceToAttack(area):
    # Checks if the active player needs the reinforcement die to conquer a specific area
    _, current_id = getCurrentPlayerAndPeople()
    current_ppl = g.board.peoples[player, current_id, :]

    territories_of_player = g.board._are_occupied_by(current_ppl)
    how_many_ppl_available = g.board._ppl_virtually_available(player, current_ppl, PHASE_CONQUEST, territories_of_player)
    
    if current_ppl[2] == BERSERK:
        dataB, dataA = divmod(current_ppl[4], 2**6)
        if bool(dataB):
            how_many_ppl_available += dataA

    minimum_ppl_for_attack = g.board._minimum_ppl_for_attack(area, current_ppl)
    return bool(how_many_ppl_available < minimum_ppl_for_attack)

def gather_current_ppl_but_one():
    # Helper to enforce the "leave one token behind" rule during redeployment
    current_ppl, _ = g.board._current_ppl(player)
    g.board._gather_current_ppl_but_one(current_ppl)
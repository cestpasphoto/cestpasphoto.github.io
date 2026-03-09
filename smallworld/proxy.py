import json
import numpy as np

from MCTS import MCTS
from SmallworldGame import SmallworldGame as Game
from SmallworldDisplay import move_to_str
from SmallworldConstants import *
from SmallworldMaps import *

class dotdict(dict):
    def __getattr__(self, name):
        return self[name]

# =============================================================================
# VARIABLES GLOBALES ET ÉTATS UI
# =============================================================================
g, board, mcts, player = None, None, None, 0
history = []

# UI state variables (migrated from JS MoveSelector)
game_started = False
can_add_virtual_start_deploy = True
interaction_step = -1
previous_player = -1
previous_moves = []


# =============================================================================
# INITIALISATION ET ROUTAGE
# =============================================================================
def init_game(numMCTSSims):
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
    
    # Reset UI states
    game_started = False
    can_add_virtual_start_deploy = True
    interaction_step = -1
    previous_player = -1
    previous_moves = []

    return get_render_state()

def undo(are_players_human_json_str=None):
    global player, interaction_step, previous_moves

    revert_to_previous_move(player)
    
    # Reset local UI states
    interaction_step = -1
    previous_moves = []
    
    return get_render_state()

def set_edit_mode(mode):
    # Smallworld has no edit mode, but game.js calls it.
    return get_render_state()

# Called by generic game.js when AI plays
def getNextState(action):
    execute_move(int(action))
    return get_render_state()


# =============================================================================
# GESTION DES ACTIONS UI (Remplace l'ancienne logique JS)
# =============================================================================
def handle_action(action_name, *args):
    global interaction_step

    if action_name == "click_btn":
        btn_id = int(args[0])
        interaction_step = btn_id
        if btn_id == 10:  # startBtn needs no confirmation
            execute_move(167)
            
    elif action_name == "click_area":
        area = int(args[0])
        action = -1
        if interaction_step == 0:   action = 30 + area    # attackBtn
        elif interaction_step == 1: action = 60 + area    # usePplBtn
        elif interaction_step == 2: action = 90 + area    # usePwrBtn
        elif interaction_step == 4: action = 128 + area   # deploy1Btn
        elif interaction_step == 8: action = area         # abandonBtn
        
        if action >= 0:
            execute_move(action)
            
    elif action_name == "click_deck":
        deck_idx = int(args[0])
        action = 158 + deck_idx                           # choseBtn
        execute_move(action)
        
    elif action_name == "confirm":
        action = -1
        if interaction_step == 7:   action = 120 # noDeployBtn
        elif interaction_step == 9: action = 164 # declineBtn
        elif interaction_step == 6: action = 165 # endTurnBtn
        elif interaction_step == 3: action = 166 # startDplBtn
        
        if action >= 0:
            execute_move(action)

    return get_render_state()

def execute_move(action):
    global g, board, player, history
    global game_started, can_add_virtual_start_deploy, previous_player, previous_moves, interaction_step

    game_started = True

    if action == 167:
        pass # Virtual 'start' move, nothing changes on board
        
    elif action == 166:
        # Virtual 'start deploy' move
        previous_player = player
        gather_current_ppl_but_one()
        can_add_virtual_start_deploy = False
        
    else:
        success = True
        move_type, area = -1, -1

        # Check success of attack BEFORE applying move (mimics JS logic)
        if 30 <= action < 60:
            move_type, area = 0, action - 30
            area_ppl = getTerritoryInfo2(area)[1]
            curr_p, curr_id = getCurrentPlayerAndPeople()
            cur_ppl_type = getPplInfo(curr_p, curr_id)[1]
            if area_ppl != cur_ppl_type:
                success = False
        elif 60 <= action < 90:
            move_type, area = 1, action - 60
        elif 90 <= action < 120:
            move_type, area = 2, action - 90
        elif 128 <= action < 158:
            move_type, area = 4, action - 128
        elif 0 <= action < 30:
            move_type, area = 8, action
        elif action == 164:
            move_type, area = 9, -1

        history.insert(0, [player, np.copy(board), action])
        board, player = g.getNextState(board, player, action)

        # Record UI dots info
        if previous_player != player:
            previous_moves = []
            previous_player = player

        if move_type >= 0:
            previous_moves.append([area, move_type, success])

        # Restore virtual deploy logic based on new turn valid moves
        valids = g.getValidMoves(board, player)
        if any(valids[30:60]): 
            can_add_virtual_start_deploy = True

    # Reset current selection
    interaction_step = -1


# =============================================================================
# RENDU JSON POUR ALPINE.JS
# =============================================================================
def get_render_state():
    global g, board, player, history
    global game_started, can_add_virtual_start_deploy, interaction_step, previous_player, previous_moves

    end = g.getGameEnded(board, player)
    valids = g.getValidMoves(board, player)

    # 1. Virtual moves logic
    valid_start_deploy = bool(can_add_virtual_start_deploy and any(valids[128:158]))
    valid_start = not game_started
    valids_ext = np.append(valids, [valid_start_deploy, valid_start])

    # 2. Map buttons to valid subsets
    allowed_btns = [
        bool(any(valids_ext[30:60])),   # 0: attackBtn
        bool(any(valids_ext[60:90])),   # 1: usePplBtn
        bool(any(valids_ext[90:120])),  # 2: usePwrBtn
        bool(valids_ext[166]),          # 3: startDplBtn
        bool(any(valids_ext[128:158])), # 4: deploy1Btn
        bool(any(valids_ext[158:164])), # 5: choseBtn
        bool(valids_ext[165]),          # 6: endTurnBtn
        bool(valids_ext[120]),          # 7: noDeployBtn
        bool(any(valids_ext[0:30])),    # 8: abandonBtn
        bool(valids_ext[164]),          # 9: declineBtn
        bool(valids_ext[167])           # 10: startBtn
    ]

    if allowed_btns[10]: # startBtn overrides all
        allowed_btns = [False] * 11
        allowed_btns[10] = True

    if allowed_btns[3]:  # startDplBtn inhibits deploy1Btn
        allowed_btns[4] = False

    # Auto-select the first valid action
    if interaction_step < 0 or not allowed_btns[interaction_step]:
        try:
            interaction_step = allowed_btns.index(True)
        except ValueError:
            interaction_step = -1

    confirm_needed = interaction_step in [3, 6, 7, 9]

    # 3. Compile Board / Players / Deck
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
# ANCIENNES FONCTIONS UTILITAIRES (Conservées et utilisées en interne)
# =============================================================================
def changeDifficulty(numMCTSSims):
    global mcts
    mcts.args.numMCTSSims = numMCTSSims
    print('Difficulty changed to', mcts.args.numMCTSSims)

async def guessBestAction():
    global g, board, mcts, player, history
    probs, _, _ = await mcts.getActionProb(g.getCanonicalForm(board, player), force_full_search=True)
    g.board.copy_state(board, True)
    best_action = max(range(len(probs)), key=lambda x: probs[x])
    return best_action

def revert_to_previous_move(player_asking_revert):
    global g, board, mcts, player, history
    if len(history) > 0:
        for index, state in enumerate(history):
            if (state[0] == player_asking_revert) and (index+1 == len(history) or history[index+1][0] != player_asking_revert):
                break
        player, board = state[0], state[1]
        history = history[index+1:]

def get_last_action():
    global history
    if len(history) < 1:
        return None
    return history[0][2]

def getBoard():
    result = ''
    result += 'State        : ' + np.array_str(g.board.state) + '<br>'
    result += 'Territories  : ' + np.array_str(g.board.territories) + '<br>'
    result += 'Peoples      : ' + np.array_str(g.board.peoples) + '<br>'
    result += 'Visible deck : ' + np.array_str(g.board.visible_deck) + '<br>'
    result += 'Round Status : ' + np.array_str(g.board.round_status) + '<br>'
    result += 'Game Status  : ' + np.array_str(g.board.game_status) + '<br>'
    result += '<br>'
    result += 'Valid moves  : ' + np.array_str(np.flatnonzero(g.getValidMoves(board, player)))
    return result

def getScore(p):
    return g.board.game_status[p, 6] + SCORE_OFFSET

def getRound():
    return g.board.game_status[:, 3].min()

def getPplInfo(p, ppl):
    total_number_of_people = g.board._total_number_of_ppl(g.board.peoples[p, ppl, :])
    return np.append(g.board.peoples[p, ppl, :5], total_number_of_people)

def getDeckInfo(i):
    return g.board.visible_deck[i][[0,1,2,6]]

def getCurrentPlayerAndPeople():
    current_id = g.board.game_status[player, 4].item()
    return player, current_id

def getTerritoryInfo2(area):
    data = [
        g.board.territories[area, 0].item(), 
        g.board.territories[area, 1].item(), 
        (g.board.territories[area, 5]-g.board.territories[area, 0]).item(), 
        descr[area][0].item(),               
        [descr[area][1].item(), descr[area][2].item(), descr[area][3].item()], 
    ]
    return data

def needDiceToAttack(area):
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
    current_ppl, _ = g.board._current_ppl(player)
    g.board._gather_current_ppl_but_one(current_ppl)

def ongoingRedeploy():
    return (g.board.round_status[player, 4] == PHASE_REDEPLOY).item()

# =============================================================================
# VARIABLES D'ÉTAT POUR L'INTERFACE (Remplace JS MoveSelector & JS Smallworld)
# =============================================================================
game_started = False
can_add_virtual_start_deploy = True
interaction_step = -1
previous_player = -1
previous_moves = [] # Stocke les infos pour l'UI: [area, type, success]

# =============================================================================
# GESTION DES ACTIONS UI (Remplace l'ancienne logique JS)
# =============================================================================
def handle_action(action_name, *args):
    global interaction_step
    
    N = NB_AREAS
    MR = MAX_REDEPLOY
    DS = DECK_SIZE

    if action_name == "click_btn":
        btn_id = int(args[0])
        interaction_step = btn_id
        if btn_id == 10: # startBtn
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
        if interaction_step == 7:   action = 4*N # noDeployBtn
        elif interaction_step == 9: action = 5*N + MR + DS # declineBtn
        elif interaction_step == 6: action = 5*N + MR + DS + 1 # endTurnBtn
        elif interaction_step == 3: action = 5*N + MR + DS + 2 # startDplBtn
        
        if action >= 0:
            execute_move(action)

    return get_render_state()

def execute_move(action):
    global g, board, player, history
    global game_started, can_add_virtual_start_deploy, previous_player, previous_moves, interaction_step

    N = NB_AREAS
    MR = MAX_REDEPLOY
    DS = DECK_SIZE
    
    game_started = True

    if action == 5*N + MR + DS + 3: # startBtn
        pass 
    elif action == 5*N + MR + DS + 2: # startDplBtn
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

        # On mémorise le peuple attaquant AVANT que le tour ne change
        curr_p, curr_id = getCurrentPlayerAndPeople()
        cur_ppl_type = getPplInfo(curr_p, curr_id)[1]

        history.insert(0, [player, np.copy(board), action])
        board, player = g.getNextState(board, player, action)

        # On évalue le succès APRÈS l'attaque
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

# =============================================================================
# RENDU JSON POUR ALPINE.JS
# =============================================================================
def get_render_state():
    global g, board, player, history
    global game_started, can_add_virtual_start_deploy, interaction_step, previous_player, previous_moves

    end = g.getGameEnded(board, player)
    valids = g.getValidMoves(board, player)
    
    N = NB_AREAS
    MR = MAX_REDEPLOY
    DS = DECK_SIZE

    # 1. Virtual moves logic
    valid_start_deploy = bool(can_add_virtual_start_deploy and any(valids[4*N + MR : 5*N + MR]))
    valid_start = not game_started
    valids_ext = np.append(valids, [valid_start_deploy, valid_start])

    # 2. Map buttons to valid subsets
    allowed_btns = [
        bool(any(valids_ext[N : 2*N])),             # 0: attackBtn
        bool(any(valids_ext[2*N : 3*N])),           # 1: usePplBtn
        bool(any(valids_ext[3*N : 4*N])),           # 2: usePwrBtn
        bool(valids_ext[5*N + MR + DS + 2]),        # 3: startDplBtn
        bool(any(valids_ext[4*N + MR : 5*N + MR])), # 4: deploy1Btn
        bool(any(valids_ext[5*N + MR : 5*N + MR + DS])), # 5: choseBtn
        bool(valids_ext[5*N + MR + DS + 1]),        # 6: endTurnBtn
        bool(valids_ext[4*N]),                      # 7: noDeployBtn
        bool(any(valids_ext[0 : N])),               # 8: abandonBtn
        bool(valids_ext[5*N + MR + DS]),            # 9: declineBtn
        bool(valids_ext[5*N + MR + DS + 3])         # 10: startBtn
    ]

    if allowed_btns[10]: # startBtn overrides all
        allowed_btns = [False] * 11
        allowed_btns[10] = True

    if allowed_btns[3]:  # startDplBtn inhibits deploy1Btn
        allowed_btns[4] = False

    if interaction_step < 0 or not allowed_btns[interaction_step]:
        try:
            interaction_step = allowed_btns.index(True)
        except ValueError:
            interaction_step = -1

    confirm_needed = interaction_step in [3, 6, 7, 9]

    # ... (Le reste de get_render_state() reste inchangé) ...
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
# MODIFICATIONS DES FONCTIONS D'INITIALISATION
# =============================================================================
# Modifie ton init_game() actuel pour qu'il retourne le JSON
def init_game(numMCTSSims):
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

    # Reset des états UI
    game_started = False
    can_add_virtual_start_deploy = True
    interaction_step = -1
    previous_player = -1
    previous_moves = []

    return get_render_state()

# Ajoute ce wrapper pour l'undo appelé depuis game.js
def undo(are_players_human):
    global player, interaction_step, previous_moves

    # Simplification : On recule pour le joueur courant
    revert_to_previous_move(player)
    
    # Reset de la sélection locale
    interaction_step = -1
    previous_moves = []
    
    return get_render_state()
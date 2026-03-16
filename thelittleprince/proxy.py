import json
import numpy as np

from MCTS import MCTS
from TLPGame import TLPGame as Game
from TLPLogicNumba import my_unpackbits

# Utility class to allow dot notation access for dictionaries
class dotdict(dict):
    def __getattr__(self, name):
        return self[name]

# Global state variables for game mechanics and UI tracking
g, board, mcts, player = None, None, None, 0
history = []

def init_game(numMCTSSims):
    # Initializes the game environment, MCTS agent, and resets history
    global g, board, mcts, player, history

    g = Game()
    board = g.getInitBoard()

    mcts_args = dotdict({
        'numMCTSSims'     : numMCTSSims,
        'fpu'             : 0.2 if g.num_players > 2 else 0.158,
        'cpuct'           : 1.0 if g.num_players > 2 else 0.741,
        'prob_fullMCTS'   : 1.,
        'forced_playouts' : True,
        'no_mem_optim'    : False,
        'universes'       : None if g.num_players > 2 else 3,
    })

    mcts = MCTS(g, None, mcts_args)
    player = 0
    history = []

    return get_render_state()

def undo(are_players_human):
    # Reverts the board to the previous state for the current player
    global g, board, mcts, player, history
    
    if len(history) > 0:
        player_asking_revert = player
        for index, state in enumerate(history):
            if (state[0] == player_asking_revert) and (index+1 == len(history) or history[index+1][0] != player_asking_revert):
                break
        player, board = state[0], state[1]
        history = history[index+1:]
        
    return get_render_state()

def set_edit_mode(mode):
    # Stub to prevent JS crash if the edit mode toggle is triggered
    return get_render_state()

def getNextState(action):
    # Standard entry point for AI moves triggered by the JS client
    execute_move(int(action))
    return get_render_state()

def handle_action(action_name, *args):
    # Routes UI interactions (card selection + next player) to the proper game action ID
    if action_name == "play":
        card_idx = int(args[0])
        next_player_id = int(args[1])
        
        # Calculate the delta since actions are encoded relative to the current player
        player_delta = (next_player_id - player) % g.getNumberOfPlayers()
        action = card_idx * g.getNumberOfPlayers() + player_delta
        
        execute_move(action)

    return get_render_state()

def execute_move(action):
    # Processes the chosen action and updates game history
    global g, board, player, history
    
    history.insert(0, [player, np.copy(board), action])
    board, player = g.getNextState(board, player, action)

def get_render_state():
    # Packages the current game state into a JSON payload tailored for the frontend
    global g, board, player, history

    end = g.getGameEnded(board, player)
    valids = g.getValidMoves(board, player)
    n = g.getNumberOfPlayers()

    # Extract market cards
    market_cards = [g.board.market[i].tolist() for i in range(n)]

    # Extract players' data (planets, scores, and active status)
    view_players = []
    who_can_play = my_unpackbits(g.board.round_and_state[2])[:n]
    
    for p in range(n):
        # 16 cards per player to represent their planet
        planet = g.board.players_cards[16*p : 16*(p+1)].tolist()
        score = g.board.players_score[p].tolist()
        
        view_players.append({
            "score": int(sum(score)),
            "detailedScore": score,
            "planet": planet,
            "canPlay": bool(who_can_play[p])
        })

    viewData = {
        "market": market_cards,
        "players": view_players,
        "round": int(g.getRound(board)),
    }

    state_dict = {
        "statusMessage": "",
        "currentPlayer": int(player),
        "gameEnded": bool(end[0] != 0 if isinstance(end, np.ndarray) else end != 0),
        "editMode": 0,
        "canUndo": len(history) > 0,
        "validMoves": [bool(v) for v in valids],
        "viewData": viewData
    }

    return json.dumps(state_dict)

def changeDifficulty(numMCTSSims):
    # Adjusts AI search iterations
    global mcts
    if mcts is not None:
        mcts.args.numMCTSSims = numMCTSSims
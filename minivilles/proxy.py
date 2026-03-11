import json
import numpy as np

from MCTS import MCTS
from MinivillesGame import MinivillesGame as Game
from MinivillesDisplay import move_to_str

# Utility class to allow dot notation access for dictionaries
class dotdict(dict):
    def __getattr__(self, name):
        return self[name]

# Global state variables for game mechanics and UI tracking
g, board, mcts, player = None, None, None, 0
history = []

def init_game(numMCTSSims):
    """
    Initializes the game environment, MCTS agent, and resets UI states.
    """
    global g, board, mcts, player, history

    mcts_args = dotdict({
        'numMCTSSims'     : numMCTSSims,
        'fpu'             : 0.10,
        'cpuct'           : 1.0,
        'prob_fullMCTS'   : 1.,
        'forced_playouts' : False,
        'no_mem_optim'    : False,
    })

    g = Game()
    board = g.getInitBoard()
    mcts = MCTS(g, None, mcts_args)
    player = 0
    history = []

    return get_render_state()

def undo(are_players_human):
    """
    Reverts the board to the previous state for the current player.
    """
    global g, board, mcts, player, history

    if len(history) > 0:
        player_asking_revert = player
        for index, state in enumerate(history):
            # Find the last time this player made a move
            if (state[0] == player_asking_revert) and (index+1 == len(history) or history[index+1][0] != player_asking_revert):
                break
        
        player, board = state[0], state[1]
        history = history[index+1:]
    
    return get_render_state()

def set_edit_mode(mode):
    """
    Stub to prevent JS crash if the edit mode toggle is triggered.
    Minivilles does not currently implement map editing.
    """
    return get_render_state()

def getNextState(action):
    """
    Standard entry point for AI moves triggered by the JS client.
    """
    execute_move(int(action))
    return get_render_state()

def handle_action(action_name, *args):
    """
    Routes UI interactions (clicks on cards, monuments, or buttons) to the proper game action ID.
    Action mapping:
      0-14  : Buy a card from the market
      15-18 : Buy a monument
      19    : Re-roll the dice (Radio Tower effect)
      20    : End turn / Do nothing
    """
    action = -1

    if action_name == "buy_card":
        card_id = int(args[0])
        if 0 <= card_id <= 14:
            action = card_id
            
    elif action_name == "buy_monument":
        monument_id = int(args[0])
        if 0 <= monument_id <= 3:
            action = 15 + monument_id
            
    elif action_name == "reroll_dice":
        action = 19
        
    elif action_name == "do_nothing":
        action = 20

    if action >= 0:
        execute_move(action)

    return get_render_state()

def execute_move(action):
    """
    Processes the chosen action and updates game history.
    """
    global g, board, player, history

    # Save state before applying the move
    history.insert(0, [player, np.copy(board), action])
    
    # Compute next state
    board, player = g.getNextState(board, player, action)

def get_render_state():
    """
    Packages the current game state into a JSON payload tailored for the Alpine.js frontend.
    """
    global g, board, player, history

    # Load the board array into the game logic's Board object for easy access
    g.board.copy_state(board, False)
    
    end = g.getGameEnded(board, player)
    valids = g.getValidMoves(board, player)

    # 1. Market Data (Remaining cards for each of the 15 types)
    market = [int(c) for c in g.board.market[:, 0]]

    # 2. Players Data
    view_players = []
    for p in range(g.num_players):
        money = int(g.board.players_money[p, 0])
        cards = [int(c) for c in g.board.players_cards[15*p : 15*(p+1), 0]]
        monuments = [int(m) for m in g.board.players_monuments[4*p : 4*(p+1), 0]]
        score = int(g.getScore(board, p))
        
        view_players.append({
            "money": money,
            "cards": cards,
            "monuments": monuments,
            "score": score
        })

    # 3. Compile ViewData
    viewData = {
        "market": market,
        "players": view_players,
        "round": int(g.board.round[0]),
        "lastDice": int(g.board.last_dice[0]),
        "playerState": int(g.board.player_state[0])
    }

    # 4. Compile Extra Context
    extra = {
        "validMoves": [bool(v) for v in valids],
    }

    # 5. Build final dictionary
    state_dict = {
        "statusMessage": "",
        "currentPlayer": int(player),
        "gameEnded": bool(end[0] != 0 if isinstance(end, np.ndarray) else end != 0),
        "winners": [int(i) for i, w in enumerate(end) if w > 0] if isinstance(end, np.ndarray) and end.any() else [],
        "editMode": 0,
        "canUndo": len(history) > 0,
        "viewData": viewData,
        "extra": extra
    }

    return json.dumps(state_dict)

def changeDifficulty(numMCTSSims):
    """
    Adjusts AI search iterations.
    """
    global mcts
    mcts.args.numMCTSSims = numMCTSSims
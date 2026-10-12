import json
import numpy as np

from MCTS import MCTS
from TLPGame import TLPGame as Game, NUMBER_PLAYERS
from TLPLogicNumba import my_unpackbits

# Utility class to allow dot notation access for dictionaries
# MCTS arguments of the page: common part, then one profile per value of NUMBER_PLAYERS (checked by make_web_py.py)
MCTS_COMMON = dict(prob_fullMCTS=1., forced_playouts=False, no_mem_optim=False)
MCTS_PROFILES = {
    3: dict(fpu=0.1, fpu_root=0., cpuct=1.25, universes=1),
}


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

    mcts_args = dotdict(MCTS_COMMON, numMCTSSims=numMCTSSims, **MCTS_PROFILES[NUMBER_PLAYERS])

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
    # Routes UI interactions to the proper game action ID:
    #   "play", card, next_player -> take market card and designate next player (absolute id)
    #   "stack", t                -> choose the stack the market is refilled from
    n = g.getNumberOfPlayers()
    if action_name == "play":
        card_idx = int(args[0])
        next_player_id = int(args[1])
        # Actions are encoded relative to the current player
        action = card_idx * n + (next_player_id - player) % n
    elif action_name == "stack":
        action = n * n + int(args[0])
    else:
        return get_render_state()

    # A stale or illegal click is ignored rather than corrupting the game
    if g.getValidMoves(board, player)[action]:
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
    game_ended = bool(np.any(end != 0))

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

    # Legal designations per market card, in ABSOLUTE player ids: validTakes[card][player]
    valid_takes = [[bool(valids[c*n + (q - player) % n]) for q in range(n)] for c in range(n)]
    # Stack choice (start of a turn): legal stacks and cards left in each stack
    valid_stacks = [bool(v) for v in valids[n*n:]]
    available = g.board._available_cards()
    stacks_left = [int(available[20*t:20*(t+1)].sum()) for t in range(len(valid_stacks))]
    choose_stack = any(valid_stacks)

    if game_ended:
        best = max(view_players[p]["score"] for p in range(n))
        winners = [p for p in range(n) if view_players[p]["score"] == best]
        status = "Game over: " + " and ".join(f"P{p}" for p in winners) + (" win (tie)" if len(winners) > 1 else " wins")
    elif choose_stack:
        status = f"P{player} chooses the next stack"
    else:
        status = f"P{player} takes a card and designates the next player"

    viewData = {
        "market": market_cards,
        "players": view_players,
        "round": int(g.getRound(board)),
        "chooseStack": choose_stack,
        "validStacks": valid_stacks,
        "stacksLeft": stacks_left,
        "validTakes": valid_takes,
    }

    state_dict = {
        "statusMessage": status,
        "currentPlayer": int(player),
        "gameEnded": game_ended,
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
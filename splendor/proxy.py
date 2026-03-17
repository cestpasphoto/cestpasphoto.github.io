import json
import numpy as np
from MCTS import MCTS
from SplendorGame import SplendorGame as Game
from SplendorLogic import np_all_cards_1, np_all_cards_2, np_all_cards_3, np_all_nobles
from SplendorLogicNumba import my_packbits, my_unpackbits

class dotdict(dict):
    def __getattr__(self, name):
        return self[name]

# -------------------------------------------------------------------------
# Core Engine Initialization & State Management
# -------------------------------------------------------------------------

def init_game(numMCTSSims):
    # Initializes the main game environment, MCTS agent, and clears history.
    global g, board, mcts, player, history, edit_mode

    g = Game()
    board = g.getInitBoard()

    mcts_args = dotdict({
        'numMCTSSims'     : numMCTSSims,
        'fpu'             : 0.1 if g.num_players > 2 else 0.0593,
        'cpuct'           : 1.0 if g.num_players == 3 else 0.8,
        'prob_fullMCTS'   : 1.,
        'forced_playouts' : True,
        'no_mem_optim'    : False,
        'universes'       : None if g.num_players == 3 else 3,
    })

    mcts = MCTS(g, None, mcts_args)
    player = 0
    history = []
    edit_mode = 0
    
    return get_render_state()

def changeDifficulty(numMCTSSims):
    # Dynamically adjusts MCTS depth parameters during gameplay.
    global mcts
    if mcts is not None:
        mcts.args.numMCTSSims = numMCTSSims

def getNextState(action):
    # Applies a move to the board, advances the player turn, and saves history.
    global g, board, mcts, player, history
    
    history.insert(0, [player, np.copy(board), action])
    board, player = g.getNextState(board, player, action)
    
    return get_render_state()

# -------------------------------------------------------------------------
# Formatting & Type Conversion Helpers
# -------------------------------------------------------------------------

DIFFERENT_GEMS_UP_TO_3 = [
    [0], [1], [2], [3], [4],
    [0,1], [0,2], [0,3], [0,4], [1,2], [1,3], [1,4], [2,3], [2,4], [3,4],
    [0,1,2], [0,1,3], [0,1,4], [0,2,3], [0,2,4], [0,3,4], [1,2,3], [1,2,4], [1,3,4], [2,3,4]
]

DIFFERENT_GEMS_UP_TO_2 = [
    [0], [1], [2], [3], [4],
    [0,1], [0,2], [0,3], [0,4], [1,2], [1,3], [1,4], [2,3], [2,4], [3,4]
]

def _convertTokensToJS(card_data_1):
    # Translates raw NumPy array token arrays into standard Python lists.
    tokens_col = card_data_1[:6].nonzero()[0]
    tokens_val = card_data_1[tokens_col]
    return np.vstack([tokens_col, tokens_val]).T.tolist()

def _convertCardToJS(card_data_1, card_data_2):
    # Packages a dual-matrix card format into [color, points, [cost matrix]].
    if card_data_1.sum() == 0:
        return [-1, -1, []]
    
    color = card_data_2.nonzero()[0][0].item()
    points = card_data_2[6].item()
    tokens = _convertTokensToJS(card_data_1)
    
    return [color, points, tokens]

# -------------------------------------------------------------------------
# Move Translation & Validation
# -------------------------------------------------------------------------

def _get_move_index():
    # Maps internal UI selection states to exact SplendorGame action integer IDs.
    global sel_type, sel_items
    
    if sel_type == 'none' or not sel_items:
        return -1
        
    if sel_type == 'card':
        tier, index = sel_items[0]
        return 27 + index if tier == -1 else tier * 4 + index
            
    elif sel_type == 'rsv':
        tier, index = sel_items[0]
        return 12 + tier * 4 + index
        
    elif sel_type == 'gem':
        if len(sel_items) == 2 and sel_items[0] == sel_items[1]:
            return 55 + sel_items[0] 
        else:
            sorted_gems = sorted(sel_items)
            try:
                combo_index = DIFFERENT_GEMS_UP_TO_3.index(sorted_gems)
                return 30 + combo_index 
            except ValueError:
                return -1
    
    elif sel_type == 'deck':
        return 24 + sel_items[0]
        
    elif sel_type == 'gemback':
        if len(sel_items) == 2 and sel_items[0] == sel_items[1]:
            return 60 + DIFFERENT_GEMS_UP_TO_2.index([sel_items[0]]) + len(DIFFERENT_GEMS_UP_TO_2)
        else:
            sorted_gems = sorted(sel_items)
            try:
                combo_index = DIFFERENT_GEMS_UP_TO_2.index(sorted_gems)
                return 60 + combo_index 
            except ValueError:
                return -1

    return -1

def _is_selection_valid():
    # Validates against the engine's rule constraints for the active player.
    global g, board, player
    
    if sel_type == 'none':
        return False
        
    move = _get_move_index()
    if move < 0 or move >= g.getActionSize():
        return False
        
    valids = g.getValidMoves(board, player)
    return bool(valids[move])

def _get_move_short_desc():
    # Generates a human-readable string based on active selection vectors.
    global sel_type, sel_items
    
    if sel_type == 'none' or not sel_items:
        return "none"
    
    if sel_type == 'card':
        return "buy a reserved card" if sel_items[0][0] == -1 else "buy a card"
    elif sel_type == 'rsv':
        return "reserve a card"
    elif sel_type == 'deck':
        return "reserve a card from deck"
    elif sel_type == 'gem':
        if len(sel_items) == 2 and sel_items[0] == sel_items[1]:
            return "take 2 similar gems"
        if len(sel_items) == 1:
            return "take 1 gem"
        return f"take {len(sel_items)} different gems"
    elif sel_type == 'gemback':
        if len(sel_items) == 2 and sel_items[0] == sel_items[1]:
            return "give back 2 similar gems"
        if len(sel_items) == 1:
            return "give back 1 gem"
        return f"give back {len(sel_items)} different gems"
        
    return "none"

def _get_last_action_details():
    # Extracts the latest move from the ledger to drive UI styling highlights.
    global history
    
    if not history:
        return ["none", -1]
        
    last_move = int(history[0][2])
    if last_move < 0:
        return ["none", -1]
    
    if last_move < 12:
        return ["card", last_move]
    elif last_move < 24:
        return ["rsv", last_move - 12]
    elif last_move < 27:
        return ["deck", last_move - 24]
    elif last_move < 30:
        return ["buyrsv", last_move - 27]
    elif last_move < 60: 
        combo_idx = last_move - 30
        gems = DIFFERENT_GEMS_UP_TO_3[combo_idx] if last_move < 55 else [last_move - 55, last_move - 55]
        return ["gem", gems]
    else: 
        combo_idx = last_move - 60
        gems = DIFFERENT_GEMS_UP_TO_2[combo_idx] if last_move < 75 else [last_move - 75, last_move - 75]
        return ["gemback", gems]

# -------------------------------------------------------------------------
# Interaction Handlers (Pyodide Entrypoints)
# -------------------------------------------------------------------------

def handle_action(action_name, *args):
    # Main Python-side router receiving directives triggered via Alpine.js JS bridging.
    if 'g' not in globals() or g is None:
        return json.dumps({"viewData": {}, "extra": {}})
        
    if action_name == "click_and_render":
        return click_and_render(args[0], args[1], args[2] if len(args) > 2 else -1)
    elif action_name == "confirm_action":
        return confirm_action()
    elif action_name == "undo":
        if len(args) > 0:
            humans = args[0].to_py() if hasattr(args[0], 'to_py') else args[0]
            return undo(humans)
        return undo()
    elif action_name == "filter_cards":
        global editor_matching_cards
        editor_matching_cards = filterCards(args[0], args[1], args[2])
        return get_render_state()
    elif action_name == "change_deck_card":
        return changeDeckCard(args[0], args[1], args[2], args[3], args[4], False)
    elif action_name == "change_noble":
        return changeNoble(args[0], args[1], args[2])
    elif action_name == "change_gem":
        return changeGemOrNbCards(args[0], args[1], args[2], args[3])
        
    return get_render_state()

def click_and_render(item_category, arg1, arg2=-1):
    # Triggers selection state updates before broadcasting back the unified state.
    click_item(item_category, arg1, arg2)
    return get_render_state()

def confirm_action():
    # Commits the formulated command to the environment if legal.
    global sel_type, sel_items, player, board
    
    if not _is_selection_valid():
        return get_render_state()
        
    move = _get_move_index()
    _ = getNextState(move) 
    
    reset_selection()
    return get_render_state()

def undo(are_players_human=None):
    # Traverses the history stack backwards until encountering a human player turn.
    global board, player, history
    
    if are_players_human is None:
        are_players_human = [True, True, True]
        
    if len(history) > 0:
        index_to_restore = 0
        for index, state in enumerate(history):
            p = int(state[0])
            if are_players_human[p] and (index+1 == len(history) or history[index+1][0] != p):
                index_to_restore = index
                break
                
        state = history[index_to_restore]
        player = state[0]
        board = np.copy(state[1])
        history = history[index_to_restore+1:]
        reset_selection()
        
    return get_render_state()

# -------------------------------------------------------------------------
# Selection State Machine 
# -------------------------------------------------------------------------

sel_type = 'none'
sel_items = []

def reset_selection():
    # Flushes pending selection buffers globally.
    global sel_type, sel_items
    sel_type = 'none'
    sel_items = []

def click_item(item_category, arg1, arg2=-1):
    # Processes UI clicks to construct actionable move arrays.
    global sel_type, sel_items
    
    if item_category == 'gem':
        color = arg1
        if color == 5:
            return
            
        if sel_type != 'gem':
            sel_type = 'gem'
            sel_items = [color]
        else:
            if color in sel_items:
                if len(sel_items) == 1:
                    sel_items.append(color)
                elif len(sel_items) == 2 and sel_items[0] == sel_items[1] and sel_items[0] == color:
                    reset_selection()
                else:
                    sel_items.remove(color)
                    if not sel_items:
                        sel_type = 'none'
            else:
                if len(sel_items) == 2 and sel_items[0] == sel_items[1]:
                    pass 
                elif len(sel_items) < 3:
                    sel_items.append(color)

    elif item_category == 'card':
        tier = arg1
        index = arg2
        if sel_type == 'card' and sel_items == [[tier, index]]:
            sel_type = 'rsv'
        elif sel_type == 'rsv' and sel_items == [[tier, index]]:
            reset_selection()
        else:
            sel_type = 'card'
            sel_items = [[tier, index]]

    elif item_category == 'reserved':
        index = arg1
        if sel_type == 'card' and sel_items == [[-1, index]]:
            reset_selection()
        else:
            sel_type = 'card'
            sel_items = [[-1, index]]

    elif item_category == 'deck':
        tier = arg1
        if sel_type == 'deck' and sel_items == [tier]:
            reset_selection()
        else:
            sel_type = 'deck'
            sel_items = [tier]
            
    elif item_category == 'gemback':
        color = arg1
        if color == 5:
            return 
            
        if sel_type != 'gemback':
            sel_type = 'gemback'
            sel_items = [color]
        else:
            if color in sel_items:
                if len(sel_items) == 1:
                    sel_items.append(color)
                elif len(sel_items) == 2 and sel_items[0] == sel_items[1] and sel_items[0] == color:
                    reset_selection()
                else:
                    sel_items.remove(color)
                    if not sel_items:
                        sel_type = 'none'
            else:
                if len(sel_items) == 2 and sel_items[0] == sel_items[1]:
                    pass
                elif len(sel_items) < 2:
                    sel_items.append(color)

# -------------------------------------------------------------------------
# Serialized Presentation Engine
# -------------------------------------------------------------------------

def get_render_state():
    # Assembles the definitive truth for the game state as a JSON string for JS injection.
    global g, board, player, history
    
    if g is None or board is None:
        return json.dumps({"viewData": {}, "extra": {}})
        
    num_players = g.num_players

    view = {
        "bank": [int(g.board.bank[0][c]) for c in range(6)],
        "tiers": [],
        "decks": [int(g.board.nb_deck_tiers[2*t, :5].sum()) for t in range(3)],
        "nobles": [],
        "players": []
    }
    
    for t in range(3):
        tier_cards = []
        for i in range(4):
            c1 = g.board.cards_tiers[8*t + 2*i]
            c2 = g.board.cards_tiers[8*t + 2*i + 1]
            tier_cards.append(_convertCardToJS(c1, c2))
        view["tiers"].append(tier_cards)
        
    for n in g.board.nobles:
        if n.sum() > 0:
            view["nobles"].append(_convertTokensToJS(n)[:3])
        else:
            view["nobles"].append([])
            
    for p in range(num_players):
        pts = int(g.getScore(board, p))
        
        p_data = {
            "gems": [int(g.board.players_gems[p][c]) for c in range(6)],
            "cards": [int(g.board.players_cards[p][c]) for c in range(6)],
            "reserved": [],
            "nobles": [],
            "points": pts
        }
        p_data["total_gems"] = sum(p_data["gems"])
        
        for i in range(3):
            c1 = g.board.players_reserved[6*p + 2*i]
            c2 = g.board.players_reserved[6*p + 2*i + 1]
            p_data["reserved"].append(_convertCardToJS(c1, c2))
            
        for i in range(3):
            if g.board.players_nobles[3*p + i].sum() > 0:
                p_data["nobles"].append(_convertTokensToJS(g.board.players_nobles[3*p + i])[:3])
                p_data["noble_points"] = int(g.board.players_nobles[3*p:3*p+3, 6].sum())

        view["players"].append(p_data)
        
    extra = {
        "sel_type": sel_type,
        "sel_items": sel_items,
        "can_confirm": _is_selection_valid(),
        "move_desc": _get_move_short_desc(),
        "last_action": _get_last_action_details(),
        "previous_player": int(history[0][0]) if history else -1,
        "matching_cards": editor_matching_cards,
    }

    end_status = g.getGameEnded(board, player)
    winners = [i for i, x in enumerate(end_status) if x > 0]
    
    response = {
        "viewData": view,
        "extra": extra,
        "currentPlayer": int(player),
        "gameEnded": bool(end_status[0] != 0),
        "winners": winners if end_status[0] != 0 else [],
        "canUndo": len(history) > 0,
        "editMode": int(edit_mode),
    }
    
    return json.dumps(response)

# -------------------------------------------------------------------------
# God-Mode & Editor Configuration Methods 
# -------------------------------------------------------------------------

edit_mode = 0
editor_matching_cards = []

def set_edit_mode(mode):
    # Globally activates or deactivates environment editing overrides.
    global edit_mode
    edit_mode = int(mode)
    return get_render_state()

def filterCards(tier, color, points):
    # Generates a restricted view of cards matching user-provided criteria.
    pattern = np.zeros(7,)
    pattern[color] = 1
    pattern[6] = points
    
    list_cards = [np_all_cards_1, np_all_cards_2, np_all_cards_3][tier].reshape(-1,2,7)
    indexes = np.where((list_cards[:,1,:] == pattern).all(axis=1))[0]
    
    return [_convertCardToJS(list_cards[i,0,:], list_cards[i,1,:]) for i in indexes]

def searchCard(card, many_cards, onlyCardIncome=False):
    # Locates specific multi-dimensional arrays efficiently across board memory pools.
    if onlyCardIncome:
        assert(card.ndim == 1)
        assert(many_cards.ndim == 3)
        return np.where((many_cards[:,1,:] == card).all(axis=1))[0]

    assert(card.ndim == 2)
    if many_cards.ndim == 3:    
        result = np.where(np.logical_and(
            (many_cards[:,0,:] == card[0,:]).all(axis=1),
            (many_cards[:,1,:] == card[1,:]).all(axis=1)
        ))[0]
    else:
        result = np.where(np.logical_and(
            (many_cards[ ::2,:] == card[0,:]).all(axis=1),
            (many_cards[1::2,:] == card[1,:]).all(axis=1)
        ))[0]
        result *= 2
        
    return result

def changeDeckCard(tier, color, points, selectedIndexInList, locationIndex, lapidaryMode):
    # Performs surgical injection of selected deck cards, swapping visible and static states.
    global g, board, player
    
    pattern = np.zeros(7,)
    pattern[color] = 1
    pattern[6] = points
    
    list_cards = [np_all_cards_1, np_all_cards_2, np_all_cards_3][tier].reshape(-1,2,7)
    indexes = searchCard(pattern, list_cards, onlyCardIncome=True)

    newCardIndex = indexes[selectedIndexInList]
    newCardX, newCardY = divmod(newCardIndex, list_cards.shape[0] // 5)
    newCard = list_cards[newCardIndex, :, :]

    oldCard = g.board.cards_tiers[8*tier+2*locationIndex:8*tier+2*locationIndex+2]
    oldCardIndex = searchCard(oldCard, list_cards)[0]
    oldCardX, oldCardY = divmod(oldCardIndex, list_cards.shape[0] // 5)
    old_i = 8*tier + 2*locationIndex

    if newCardIndex != oldCardIndex:
        index_visible = searchCard(newCard, g.board.cards_tiers)
        index_reserved = searchCard(newCard, g.board.players_reserved)
        deck_cards = my_unpackbits(g.board.nb_deck_tiers[2*tier+1, newCardX])
        new_is_in_deck = (deck_cards[newCardY] > 0)
        
        if index_visible.size > 0 or index_reserved.size > 0:
            new_i = index_visible[0] if index_visible.size else index_reserved[0]
            g.board.cards_tiers[[old_i  , new_i  ], :] = g.board.cards_tiers[[new_i  , old_i  ], :]
            g.board.cards_tiers[[old_i+1, new_i+1], :] = g.board.cards_tiers[[new_i+1, old_i+1], :]
        else:
            g.board.cards_tiers[old_i  , :] = newCard[0, :]
            g.board.cards_tiers[old_i+1, :] = newCard[1, :]
            
            if new_is_in_deck:
                deck_cards[newCardY] = 0
                g.board.nb_deck_tiers[2*tier+1, newCardX] = my_packbits(deck_cards)
                g.board.nb_deck_tiers[2*tier, newCardX] -= 1
                
                deck_cards = my_unpackbits(g.board.nb_deck_tiers[2*tier+1, oldCardX])
                deck_cards[oldCardY] = 1
                g.board.nb_deck_tiers[2*tier+1, oldCardX] = my_packbits(deck_cards)
                g.board.nb_deck_tiers[2*tier, oldCardX] += 1

    if lapidaryMode:
        end_tier = 8*(tier+1)
        g.board.cards_tiers[old_i:end_tier, :] = np.roll(g.board.cards_tiers[old_i:end_tier, :], shift=-2, axis=0)

    return get_render_state()

def changeGemOrNbCards(p, color, type_, delta):
    # Modifies discrete gem counts or permanent bonus counts artificially.
    global g, board, player
    
    if p < 0:
        g.board.bank[0][color] = max(0, g.board.bank[0][color] + delta)
    elif type_ == 'gem':
        g.board.players_gems[p][color] = max(0, g.board.players_gems[p][color] + delta)
    else:
        g.board.players_cards[p][color] = max(0, g.board.players_cards[p][color] + delta)

    return get_render_state()

def changeNoble(index, nobleId, assignedPlayer):
    # Reassigns nobles from global pool to specific players manually.
    global g, board, player
    
    g.board.nobles[index, :] = np_all_nobles[nobleId, :] if assignedPlayer < 0 else 0
    for p in range(g.num_players):
        g.board.players_nobles[3*p+index, :] = np_all_nobles[nobleId, :] if assignedPlayer == p else 0

    return get_render_state()
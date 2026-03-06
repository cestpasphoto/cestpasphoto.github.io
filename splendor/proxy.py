import json
import numpy as np
from MCTS import MCTS
from SplendorGame import SplendorGame as Game
from SplendorLogic import np_all_cards_1, np_all_cards_2, np_all_cards_3, np_all_nobles
from SplendorLogicNumba import my_packbits, my_unpackbits


class dotdict(dict):
    def __getattr__(self, name):
        return self[name]

def init_game(numMCTSSims):
    global g, board, mcts, player, history

    mcts_args = dotdict({
        'numMCTSSims'     : numMCTSSims,
        'fpu'             : 0.10,
        'cpuct'           : 1.00,
        'prob_fullMCTS'   : 1.,
        'forced_playouts' : False,
        'no_mem_optim'    : False,
    })

    g = Game()
    board = g.getInitBoard()
    mcts = MCTS(g, None, mcts_args)
    player = 0
    history = []
    valids = g.getValidMoves(board, player)
    end = [0,0]

    return get_render_state()

def changeDifficulty(numMCTSSims):
    global mcts
    if mcts is not None:
        mcts.args.numMCTSSims = numMCTSSims

def getNextState(action):
    global g, board, mcts, player, history
    history.insert(0, [player, np.copy(board), action])
    board, player = g.getNextState(board, player, action)
    end = g.getGameEnded(board, player)
    valids = g.getValidMoves(board, player)

    return get_render_state()

# ==========================================
# ===== MOVE MAPPING & VALIDATION ==========
# ==========================================

# Helper array matching the one in your splendor.js
DIFFERENT_GEMS_UP_TO_3 = [
    [0], [1], [2], [3], [4],
    [0,1], [0,2], [0,3], [0,4], [1,2], [1,3], [1,4], [2,3], [2,4], [3,4],
    [0,1,2], [0,1,3], [0,1,4], [0,2,3], [0,2,4], [0,3,4], [1,2,3], [1,2,4], [1,3,4], [2,3,4]
]

# Helper array for returning gems (up to 2)
DIFFERENT_GEMS_UP_TO_2 = [
    [0], [1], [2], [3], [4],
    [0,1], [0,2], [0,3], [0,4], [1,2], [1,3], [1,4], [2,3], [2,4], [3,4]
]

def _convertTokensToJS(card_data_1):
    tokens_col = card_data_1[:6].nonzero()[0]
    tokens_val = card_data_1[tokens_col]
    return np.vstack([tokens_col, tokens_val]).T.tolist()

def _convertCardToJS(card_data_1, card_data_2):
    if card_data_1.sum() == 0: # Empty card
        return [-1, -1, []]
    color, points = card_data_2.nonzero()[0][0].item(), card_data_2[6].item()
    tokens = _convertTokensToJS(card_data_1)
    return [color, points, tokens]

def _get_move_index():
    """
    Translates the current sel_type and sel_items into the MCTS action integer.
    WARNING: The offsets (12, 15, etc.) must perfectly match the ones in your
    original splendor.js `move_sel.getMoveIndex()` function.
    """
    global sel_type, sel_items
    
    if sel_type == 'none' or not sel_items:
        return -1
        
    if sel_type == 'card':
        tier, index = sel_items[0]
        if tier == -1:
            return 27 + index
        else:
            return tier * 4 + index
            
    elif sel_type == 'rsv':
        tier, index = sel_items[0]
        return 12 + tier * 4 + index
        
    elif sel_type == 'gem':
        if len(sel_items) == 2 and sel_items[0] == sel_items[1]:
            return 55 + sel_items[0] 
        else:
            # Take up to 3 different colors
            sorted_gems = sorted(sel_items)
            try:
                combo_index = DIFFERENT_GEMS_UP_TO_3.index(sorted_gems)
                return 30 + combo_index 
            except ValueError:
                return -1
    
    elif sel_type == 'deck':
        # Reserve blind card from deck (indices 24 to 26 typically)
        return 24 + sel_items[0]
        
    elif sel_type == 'gemback':
        if len(sel_items) == 2 and sel_items[0] == sel_items[1]:
            # Return 2 of the same color
            return 60 + DIFFERENT_GEMS_UP_TO_2.index([sel_items[0]]) + len(DIFFERENT_GEMS_UP_TO_2)
        else:
            # Return 1 or 2 different colors
            sorted_gems = sorted(sel_items)
            try:
                combo_index = DIFFERENT_GEMS_UP_TO_2.index(sorted_gems)
                return 60 + combo_index 
            except ValueError:
                return -1

    return -1

def _is_selection_valid():
    """ Checks if the currently formulated move is legal according to the engine """
    global g, board, player
    
    if sel_type == 'none':
        return False
        
    move = _get_move_index()
    if move < 0 or move >= g.getActionSize():
        return False
        
    # Get valid moves bitmask from MCTS
    valids = g.getValidMoves(board, player)
    return bool(valids[move])

def _get_move_short_desc():
    """Génère le texte exact qu'affichait l'ancien JS"""
    global sel_type, sel_items
    if sel_type == 'none' or not sel_items: return "none"
    
    if sel_type == 'card':
        if sel_items[0][0] == -1: return "buy a reserved card"
        return "buy a card"
    elif sel_type == 'rsv':
        return "reserve a card"
    elif sel_type == 'deck':
        return "reserve a card from deck"
    elif sel_type == 'gem':
        if len(sel_items) == 2 and sel_items[0] == sel_items[1]: return "take 2 similar gems"
        if len(sel_items) == 1: return "take 1 gem"
        return f"take {len(sel_items)} different gems"
    elif sel_type == 'gemback':
        if len(sel_items) == 2 and sel_items[0] == sel_items[1]: return "give back 2 similar gems"
        if len(sel_items) == 1: return "give back 1 gem"
        return f"give back {len(sel_items)} different gems"
    return "none"

def _get_last_action_details():
    """Formate le dernier coup pour le highlight (petit point tan)"""
    global history
    if not history: return ["none", -1]
    last_move = history[0][2]
    if last_move < 0: return ["none", -1]
    
    if last_move < 12: return ["card", last_move]
    elif last_move < 24: return ["rsv", last_move - 12]
    elif last_move < 27: return ["deck", last_move - 24]
    elif last_move < 30: return ["buyrsv", last_move - 27]
    elif last_move < 60: 
        combo_idx = last_move - 30
        gems = DIFFERENT_GEMS_UP_TO_3[combo_idx] if last_move < 55 else [last_move - 55, last_move - 55]
        return ["gem", gems]
    else: 
        combo_idx = last_move - 60
        gems = DIFFERENT_GEMS_UP_TO_2[combo_idx] if last_move < 75 else [last_move - 75, last_move - 75]
        return ["gemback", gems]

# ==========================================
# ===== EXPOSED ACTION ROUTERS =============
# ==========================================
# These functions are called directly by game.js via act()
# and must return the updated JSON state.

def handle_action(action_name, *args):
    if 'g' not in globals() or g is None:
        return json.dumps({"viewData": {}, "extra": {}})
        
    if action_name == "reset_and_render": return reset_and_render()
    elif action_name == "click_and_render": return click_and_render(args[0], args[1], args[2] if len(args) > 2 else -1)
    elif action_name == "confirm_action": return confirm_action()
    elif action_name == "undo": return undo()
    
    # Nouvelles actions pour le mode Édition :
    elif action_name == "set_edit_mode": return set_edit_mode(args[0])
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

def reset_and_render():
    """ Resets selection and updates UI (useful for a 'Cancel' button) """
    reset_selection()
    return get_render_state()

def click_and_render(item_category, arg1, arg2=-1):
    """ Wrapper around click_item to return the updated state """
    click_item(item_category, arg1, arg2)
    return get_render_state()

def confirm_action():
    """ Executes the selected move if valid """
    global sel_type, sel_items, player, board
    
    if not _is_selection_valid():
        return get_render_state() # Do nothing if invalid
        
    move = _get_move_index()
    
    # Play the move. We discard the return value because getNextState 
    # now returns a JSON string for the AI script, but updates globals internally.
    _ = getNextState(move) 
    
    # Reset interaction state machine for the next turn
    reset_selection()
    
    # We must re-render because reset_selection() changed the state AFTER getNextState
    return get_render_state()

def undo(are_players_human=None):
    global board, player, history
    
    if are_players_human is None:
        are_players_human = [True, True, True]
        
    if len(history) > 0:
        # On remonte l'historique jusqu'à trouver un tour où le joueur courant était humain
        index_to_restore = 0
        for index, state in enumerate(history):
            p = state[0]
            if are_players_human[p] and (index+1 == len(history) or history[index+1][0] != p):
                index_to_restore = index
                break
                
        state = history[index_to_restore]
        player = state[0]
        board = np.copy(state[1])
        history = history[index_to_restore+1:]
        reset_selection()
        
    return get_render_state()

# ==========================================
# ===== INTERACTION STATE MACHINE ==========
# ==========================================

# State variables replacing the JS 'move_sel' class
sel_type = 'none' # Can be 'none', 'card', 'rsv', 'gem'
sel_items = []    # List of selected items

def reset_selection():
    """ Resets the current user selection """
    global sel_type, sel_items
    sel_type = 'none'
    sel_items = []

def click_item(item_category, arg1, arg2=-1):
    """
    Handles clicks from the UI to update the selection state machine.
    - item_category: 'gem', 'card', or 'reserved'
    - arg1: color (0-4) for gem, tier (0-2) for card, or index (0-2) for reserved
    - arg2: index (0-3) for card on board
    """
    global sel_type, sel_items
    
    if item_category == 'gem':
        color = arg1
        if color == 5:
            return
        if sel_type != 'gem':
            # First gem selected
            sel_type = 'gem'
            sel_items = [color]
        else:
            if color in sel_items:
                if len(sel_items) == 1:
                    # Second click on the same gem: try to take 2 of the same color
                    sel_items.append(color)
                elif len(sel_items) == 2 and sel_items[0] == sel_items[1] and sel_items[0] == color:
                    # Third click on the same gem: reset selection
                    reset_selection()
                else:
                    # Deselect this specific gem
                    sel_items.remove(color)
                    if not sel_items:
                        sel_type = 'none'
            else:
                # Clicking a different gem color
                if len(sel_items) == 2 and sel_items[0] == sel_items[1]:
                    # Cannot mix 2 same colors + 1 different
                    pass 
                elif len(sel_items) < 3:
                    sel_items.append(color)

    elif item_category == 'card':
        tier = arg1
        index = arg2
        if sel_type == 'card' and sel_items == [[tier, index]]:
            # Second click on the same card -> switch to reserve mode
            sel_type = 'rsv'
        elif sel_type == 'rsv' and sel_items == [[tier, index]]:
            # Third click -> deselect completely
            reset_selection()
        else:
            # First click -> select to buy
            sel_type = 'card'
            sel_items = [[tier, index]]

    elif item_category == 'reserved':
        index = arg1
        if sel_type == 'card' and sel_items == [[-1, index]]:
            # Second click -> deselect (cannot reserve an already reserved card)
            reset_selection()
        else:
            # First click -> select to buy (-1 tier convention for reserved)
            sel_type = 'card'
            sel_items = [[-1, index]]

    elif item_category == 'deck':
        tier = arg1
        if sel_type == 'deck' and sel_items == [tier]:
            # Second click on same deck -> deselect
            reset_selection()
        else:
            # First click -> select deck to reserve
            sel_type = 'deck'
            sel_items = [tier]
            
    elif item_category == 'gemback':
        color = arg1
        # Cannot return gold (usually handled automatically or impossible)
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
                    pass # Cannot mix 2 same + 1 diff
                elif len(sel_items) < 2: # Max 2 gems to return per action usually
                    sel_items.append(color)

def get_render_state():
    global g, board, player, history
    
    if g is None or board is None:
        return json.dumps({"viewData": {}, "extra": {}})
        
    num_players = g.num_players
    
    view = {
        "bank": [int(g.board.bank[0][c]) for c in range(6)],
        "tiers": [],
        "decks": [int(g.board.nb_deck_tiers[2*t]) for t in range(3)],
        "nobles": [],
        "players": []
    }
    
    # 1. Cards on the board (3 tiers x 4 cards)
    for t in range(3):
        tier_cards = []
        for i in range(4):
            c1 = g.board.cards_tiers[8*t + 2*i]
            c2 = g.board.cards_tiers[8*t + 2*i + 1]
            tier_cards.append(_convertCardToJS(c1, c2))
        view["tiers"].append(tier_cards)
        
    # 2. Available Nobles
    for n in g.board.nobles:
        if n.sum() > 0:
            view["nobles"].append(_convertTokensToJS(n)[:3])
        else:
            view["nobles"].append([]) # Empty slot
            
    # 3. Players state
    for p in range(num_players):
        pts = int(g.getScore(board, p))
        
        p_data = {
            "gems": [int(g.board.players_gems[p][c]) for c in range(6)],
            "cards": [int(g.board.players_cards[p][c]) for c in range(6)], # Bonus from cards
            "reserved": [],
            "nobles": [],
            "points": pts
        }
        p_data["total_gems"] = sum(p_data["gems"])
        
        # Reserved cards (max 3 slots)
        for i in range(3):
            c1 = g.board.players_reserved[6*p + 2*i]
            c2 = g.board.players_reserved[6*p + 2*i + 1]
            p_data["reserved"].append(_convertCardToJS(c1, c2))
            
        # Owned nobles
        for i in range(3):
            if g.board.players_nobles[3*p + i].sum() > 0:
                p_data["nobles"].append(_convertTokensToJS(g.board.players_nobles[3*p + i])[:3])
                p_data["noble_points"] = int(g.board.players_nobles[3*p:3*p+3, 6].sum())

        view["players"].append(p_data)
        
    # 4. Interaction metadata (Selection states)
    extra = {
        "sel_type": sel_type,
        "sel_items": sel_items,
        "can_confirm": _is_selection_valid(),
        "move_desc": _get_move_short_desc(),
        "last_action": _get_last_action_details(),
        "previous_player": history[0][0] if history else -1,
        "matching_cards": editor_matching_cards,
    }

    end_status = g.getGameEnded(board, player)
    
    response = {
        "viewData": view, # <-- Assure-toi que cette variable est bien construite comme dans ton code
        "extra": extra,
        "currentPlayer": player,
        "gameEnded": bool(end_status[0] != 0),
        "canUndo": len(history) > 0,
        "editMode": edit_mode,
    }
    
    return json.dumps(response)


# ==========================================
# ===== EDIT MODE ==========================
# ==========================================

edit_mode = 0
editor_matching_cards = []

def set_edit_mode(mode):
    global edit_mode
    edit_mode = mode
    return get_render_state()

def filterCards(tier, color, points):
    pattern = np.zeros(7,)
    pattern[color] = 1
    pattern[6] = points
    list_cards = [np_all_cards_1, np_all_cards_2, np_all_cards_3][tier].reshape(-1,2,7)
    indexes = np.where((list_cards[:,1,:] == pattern).all(axis=1))[0]
    return [_convertCardToJS(list_cards[i,0,:], list_cards[i,1,:]) for i in indexes]

def searchCard(card, many_cards, onlyCardIncome=False):
    if (onlyCardIncome):
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
        if (index_visible.size > 0 or index_reserved.size > 0):
            new_i = index_visible[0] if index_visible.size else index_reserved[0]
            g.board.cards_tiers[[old_i  , new_i  ], :] = g.board.cards_tiers[[new_i  , old_i  ], :]
            g.board.cards_tiers[[old_i+1, new_i+1], :] = g.board.cards_tiers[[new_i+1, old_i+1], :]
        else:
            g.board.cards_tiers[old_i  , :] = newCard[0, :]
            g.board.cards_tiers[old_i+1, :] = newCard[1, :]
            if (new_is_in_deck):
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
    global g, board, player
    if (p < 0): # Bank
        g.board.bank[0][color]          = max(0, g.board.bank[0][color]          + delta)
    elif type_ == 'gem':
        g.board.players_gems[p][color]  = max(0, g.board.players_gems[p][color]  + delta)
    else:
        g.board.players_cards[p][color] = max(0, g.board.players_cards[p][color] + delta)

    return get_render_state()

def changeNoble(index, nobleId, assignedPlayer):
    global g, board, player
    g.board.nobles[index, :] = np_all_nobles[nobleId, :] if assignedPlayer < 0 else 0
    for p in range(g.num_players):
        g.board.players_nobles[3*p+index, :] = np_all_nobles[nobleId, :] if assignedPlayer == p else 0

    return get_render_state()

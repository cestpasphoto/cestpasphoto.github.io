import json

# ==========================================
# ===== MOVE MAPPING & VALIDATION ==========
# ==========================================

# Helper array matching the one in your splendor.js
DIFFERENT_GEMS_UP_TO_3 = [
    [0], [1], [2], [3], [4],
    [0,1], [0,2], [0,3], [0,4], [1,2], [1,3], [1,4], [2,3], [2,4], [3,4],
    [0,1,2], [0,1,3], [0,1,4], [0,2,3], [0,2,4], [0,3,4], [1,2,3], [1,2,4], [1,3,4], [2,3,4]
]

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
            # Buy reserved card (indices 12 to 14 typically)
            return 12 + index
        else:
            # Buy card from board (indices 0 to 11 typically)
            return tier * 4 + index
            
    elif sel_type == 'rsv':
        tier, index = sel_items[0]
        # Reserve card from board (indices 15 to 26 typically)
        return 15 + tier * 4 + index
        
    elif sel_type == 'gem':
        if len(sel_items) == 2 and sel_items[0] == sel_items[1]:
            # Take 2 of the same color
            # Usually placed after card reservations, e.g., 27 + color
            # Adjust the '27' offset based on your JS
            return 27 + sel_items[0] 
        else:
            # Take up to 3 different colors
            sorted_gems = sorted(sel_items)
            try:
                combo_index = DIFFERENT_GEMS_UP_TO_3.index(sorted_gems)
                # Adjust the '32' offset based on your JS
                return 32 + combo_index 
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

# ==========================================
# ===== EXPOSED ACTION ROUTERS =============
# ==========================================
# These functions are called directly by game.js via act()
# and must return the updated JSON state.

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
    
    # Play the move using the existing Splendor proxy logic
    player, board = getNextState(move)
    
    # Reset interaction state machine for the next turn
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

def get_render_state():
    global g, board, player
    
    # Return empty state if game is not initialized yet
    if g is None or board is None:
        return json.dumps({"view": {}, "extra": {}})
        
    num_players = g.num_players
    
    view = {
        "bank": [int(g.board.bank[0][c]) for c in range(6)], # 5 gem colors + 1 gold
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
            view["nobles"].append(n.nonzero()[0].tolist())
        else:
            view["nobles"].append([]) # Empty slot
            
    # 3. Players state
    for p in range(num_players):
        # Calculate points matching the old getPoints() logic
        pts = int(g.board.players_cards[p][6])
        pts += int(np.count_nonzero(g.board.players_nobles[3*p:3*p+3].sum(axis=1)) * 3)
        
        p_data = {
            "gems": [int(g.board.players_gems[p][c]) for c in range(6)],
            "cards": [int(g.board.players_cards[p][c]) for c in range(6)], # Bonus from cards
            "reserved": [],
            "nobles": [],
            "points": pts
        }
        
        # Reserved cards (max 3 slots)
        for i in range(3):
            c1 = g.board.players_reserved[6*p + 2*i]
            c2 = g.board.players_reserved[6*p + 2*i + 1]
            p_data["reserved"].append(_convertCardToJS(c1, c2))
            
        # Owned nobles
        for i in range(3):
            if g.board.players_nobles[3*p + i].sum() > 0:
                p_data["nobles"].append(g.board.players_nobles[3*p + i].nonzero()[0].tolist())
                
        view["players"].append(p_data)
        
    # 4. Interaction metadata (Selection states)
    extra = {
        "sel_type": sel_type,
        "sel_items": sel_items,
        "can_confirm": _is_selection_valid() # We will implement this next
    }
    
    return json.dumps({"view": view, "extra": extra})
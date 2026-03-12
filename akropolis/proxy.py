import json
import numpy as np
import js
from MCTS import MCTS

# Dynamically load the correct game module based on the JS frontend configuration
try:
    num_players = int(js.numPlayers)
except Exception:
    num_players = 2
from AkropolisGame import AkropolisGame as Game


class dotdict(dict):
    def __getattr__(self, name):
        return self[name]

# -------------------------------------------------------------------------
# Core Engine Initialization & State Management
# -------------------------------------------------------------------------

def init_game(numMCTSSims):
    global g, board, mcts, player, history, edit_mode

    mcts_args = dotdict({
        'numMCTSSims'     : numMCTSSims,
        'fpu'             : 0.10,
        'cpuct'           : 1.5,
        'prob_fullMCTS'   : 1.,
        'forced_playouts' : True,
        'no_mem_optim'    : False,
        'universes'       : 1,
    })

    g = Game()
    board = g.getInitBoard()
    mcts = MCTS(g, None, mcts_args)
    player = 0
    history = []
    edit_mode = 0
    
    reset_selection()
    return get_render_state()

def changeDifficulty(numMCTSSims):
    global mcts
    if mcts is not None:
        mcts.args.numMCTSSims = numMCTSSims

def getNextState(action):
    global g, board, mcts, player, history
    
    history.insert(0, [player, np.copy(board), action])
    board, player = g.getNextState(board, player, action)
    
    return get_render_state()

# -------------------------------------------------------------------------
# Dynamic Dimensions & Properties Getters
# -------------------------------------------------------------------------
# Extracting dimensions from the board avoids hardcoding Numba compiled 
# constants that vary depending on the number of players.

def get_city_size():
    return g.board.state.shape[0]

def get_constr_site_size():
    return g.board.construction_site.shape[0]

def get_n_orientations():
    return 6

def get_city_area():
    cs = get_city_size()
    return cs * cs

def get_n_patterns():
    return get_city_area() * get_n_orientations()

# -------------------------------------------------------------------------
# Move Translation & Validation
# -------------------------------------------------------------------------

sel_tile_idx = -1
sel_site_idx = -1
sel_orient = 0

def reset_selection():
    global sel_tile_idx, sel_site_idx, sel_orient
    sel_tile_idx = -1
    sel_site_idx = -1
    sel_orient = 0

def _get_move_index():
    if sel_tile_idx < 0 or sel_site_idx < 0:
        return -1
    # action = tile_idx_in_cs * N_PATTERNS + site_idx * N_ORIENTS + orient
    return sel_tile_idx * get_n_patterns() + sel_site_idx * get_n_orientations() + sel_orient

def _is_selection_valid():
    global g, board, player
    move = _get_move_index()
    if move < 0 or move >= g.getActionSize():
        return False
        
    valids = g.getValidMoves(board, player)
    return bool(valids[move])

def _get_valid_placements():
    """Returns a list of 1D site_idx that have at least one valid orientation for the selected tile."""
    if sel_tile_idx < 0:
        return []
        
    valids = g.getValidMoves(board, player)
    valid_sites = []
    
    n_patt = get_n_patterns()
    n_ori = get_n_orientations()
    
    base_offset = sel_tile_idx * n_patt
    for site in range(get_city_area()):
        for o in range(n_ori):
            if valids[base_offset + site * n_ori + o]:
                valid_sites.append(site)
                break
    return valid_sites

def _get_selected_hexes():
    """Calculates the relative positions of the 3 hexes for the UI ghost preview."""
    if sel_tile_idx < 0 or sel_site_idx < 0:
        return []
        
    tile = g.board.construction_site[sel_tile_idx]
    if tile[0] == 0: # EMPTY
        return []
        
    cs = get_city_size()
    r, q = divmod(sel_site_idx, cs)
    o = sel_orient
    
    # Odd-r offset coordinates movements
    DIRECTIONS_EVEN = [(-1, +1), ( 0, +1), (+1, 0), ( 0, -1), (-1, -1), (-1, 0)]
    DIRECTIONS_ODD  = [( 0, +1), (+1, +1), (+1, 0), (+1, -1), ( 0, -1), (-1, 0)]
    
    if (r % 2) == 1:
        d1, d2 = DIRECTIONS_ODD[o], DIRECTIONS_ODD[(o + 1) % 6]
    else:
        d1, d2 = DIRECTIONS_EVEN[o], DIRECTIONS_EVEN[(o + 1) % 6]
        
    pts = [
        (q + d1[0], r + d1[1]),
        (q        , r),         # Central hex is the 2nd one in the description array
        (q + d2[0], r + d2[1]),
    ]
    
    res = []
    for i, (qq, rr) in enumerate(pts):
        if 0 <= qq < cs and 0 <= rr < cs:
            res.append({"r": int(rr), "q": int(qq), "desc": int(tile[i])})
    return res

def _get_move_short_desc():
    if sel_tile_idx < 0:
        return "Select a tile from the construction site"
    if sel_site_idx < 0:
        return "Select a valid placement in your city"
    if not _is_selection_valid():
        return "Invalid orientation or not enough stones"
    return "Confirm placement"

# -------------------------------------------------------------------------
# Interaction Handlers (Pyodide Entrypoints)
# -------------------------------------------------------------------------

def handle_action(action_name, *args):
    global g, board, player, sel_tile_idx, sel_site_idx, sel_orient
    if 'g' not in globals() or g is None:
        return json.dumps({"viewData": {}, "extra": {}})
        
    if action_name == "select_tile":
        idx = int(args[0])
        if sel_tile_idx == idx:
            reset_selection() # Toggle off
        else:
            sel_tile_idx = idx
            sel_site_idx = -1
            sel_orient = 0
            
    elif action_name == "select_position":
        site_idx = int(args[0])
        sel_site_idx = site_idx
        
        # Auto-rotate to the first valid orientation if current is invalid
        if not _is_selection_valid() and sel_tile_idx >= 0:
            valids = g.getValidMoves(board, player)
            n_patt = get_n_patterns()
            n_ori = get_n_orientations()
            base_offset = sel_tile_idx * n_patt + site_idx * n_ori
            for o in range(n_ori):
                if valids[base_offset + o]:
                    sel_orient = o
                    break

    elif action_name == "rotate_left":
        sel_orient = (sel_orient - 1) % 6
        
    elif action_name == "rotate_right":
        sel_orient = (sel_orient + 1) % 6
        
    elif action_name == "confirm_action":
        if _is_selection_valid():
            move = _get_move_index()
            _ = getNextState(move)
            reset_selection()
            
    elif action_name == "undo":
        if len(args) > 0:
            humans = args[0].to_py() if hasattr(args[0], 'to_py') else args[0]
            return undo(humans)
        return undo()
        
    return get_render_state()

def undo(are_players_human=None):
    global board, player, history
    
    if are_players_human is None:
        are_players_human = [True, True, True, True]
        
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
# Serialized Presentation Engine
# -------------------------------------------------------------------------

def get_render_state():
    global g, board, player, history
    
    if g is None or board is None:
        return json.dumps({"viewData": {}, "extra": {}})
        
    cs_size = get_constr_site_size()
    city_size = get_city_size()
    
    # --- Construction Site ---
    construction_site = []
    for i in range(cs_size):
        t = g.board.construction_site[i]
        if t[0] != 0: # 0 = EMPTY
            construction_site.append([int(t[0]), int(t[1]), int(t[2]), int(t[3])])
            
    # --- Players Cities & Scores ---
    players_data = []
    for p in range(g.num_players):
        city_hexes = []
        for r in range(city_size):
            for q in range(city_size):
                h = int(g.board.board_height[r, q, p])
                if h > 0:
                    desc = int(g.board.board_descr[r, q, p])
                    city_hexes.append({
                        "r": r, "q": q,
                        "h": h,
                        "desc": desc
                    })
        
        # Calculate scores through the engine rather than reading int8 estimation
        score = int(g.getScore(board, p))
        stones = int(g.board.stones[p])
        
        players_data.append({
            "points": score,
            "stones": stones,
            "city_state": city_hexes
        })

    view = {
        "construction_site": construction_site,
        "stacks_remaining": int(g.board.misc[1]),
        "players": players_data
    }
    
    extra = {
        "selected_tile": sel_tile_idx,
        "selected_site": sel_site_idx,
        "selected_orient": sel_orient,
        "valid_placements": _get_valid_placements(),
        "ghost_hexes": _get_selected_hexes(),
        "can_confirm": _is_selection_valid(),
        "action_message": _get_move_short_desc(),
        "previous_player": int(history[0][0]) if history else -1,
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
        "editMode": 0,
    }
    
    return json.dumps(response)
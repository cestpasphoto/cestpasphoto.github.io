from MCTS import MCTS
from SplendorGame import SplendorGame as Game
from SplendorLogic import move_to_str, np_all_cards_1, np_all_cards_2, np_all_cards_3, np_all_nobles, list_different_gems_up_to_3, list_different_gems_up_to_2
import numpy as np
import json

# ==========================================
# ===== CONSTANTS & CONFIGURATION ==========
# ==========================================

NB_PLAYERS = 3
COLORS = ['white', 'blue', 'green', 'red', 'black', 'yellow']

class dotdict(dict):
    def __getattr__(self, name):
        return self[name]

# ==========================================
# ===== GLOBAL STATE =======================
# ==========================================

g = None
board = None
mcts = None
player = 0         # ID du joueur dont c'est le tour (0, 1, 2)
history = []       # Historique pour le Undo
valids = []        # Coups valides (bitmask)
game_result = [0] * NB_PLAYERS

# --- State Machine de l'UI ---
# L'interaction dans Splendor n'est pas linéaire comme Santorini.
# On stocke l'intention du joueur avant validation.
selected_gems = [] # Liste d'entiers (couleurs de 0 à 4)
edit_mode = 0      # 0: Play, 1: Edit

# ==========================================
# ===== MAIN INTERFACE FUNCTIONS ===========
# ==========================================

def init_game(numMCTSSims):
    global g, board, mcts, player, history, valids, game_result
    global selected_gems, edit_mode

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
    game_result = [0] * NB_PLAYERS
    
    _reset_interaction()
    edit_mode = 0
    return get_render_state()

def getNextState(action):
    global g, board, mcts, player, history, valids, game_result
    
    # Save history
    history.insert(0, [player, np.copy(board)])
    
    # Execute move
    board, player = g.getNextState(board, player, action)

    # Check end game
    # getGameEnded renvoie souvent un tableau de scores ou [0,0,0] si non fini
    res = g.getGameEnded(board, player) 
    if any(r != 0 for r in res):
        game_result = res
        
    valids = g.getValidMoves(board, player)
    
    _reset_interaction()
    return get_render_state()

def undo(player_types=None):
    global g, board, player, history, valids, game_result
    
    # 1. Annulation UI locale (désélectionner les gemmes)
    if len(selected_gems) > 0:
        _reset_interaction()
        return get_render_state()

    # 2. Fonction utilitaire pour dépiler un état
    def pop_one_state():
        global board, player, valids, game_result
        if len(history) > 0:
            prev = history.pop(0)
            player = prev[0]
            board = prev[1]
            valids = g.getValidMoves(board, player)
            game_result = [0] * NB_PLAYERS
            return True
        return False

    # 3. Retour arrière effectif (et saut des IA si player_types est fourni)
    if pop_one_state():
        if player_types is not None:
            while len(history) > 0 and player_types[player] == 1:
                pop_one_state()

    _reset_interaction()
    return get_render_state()

def set_edit_mode(mode):
    global edit_mode
    edit_mode = int(mode)
    _reset_interaction()
    return get_render_state()

# ==========================================
# ===== ROUTEUR D'ACTIONS (UI -> MOTEUR) ===
# ==========================================

def handle_action(action_type, *args):
    """
    Reçoit les intentions de l'interface et les traduit en actions de jeu.
    action_type : 'toggle_gem', 'buy_card', 'reserve_card', 'buy_reserved', 'confirm_gems'
    """
    global selected_gems, valids
    
    if edit_mode != 0:
        # TODO: Appeler les fonctions _apply_edit selon l'UX définie
        return get_render_state()
        
    if _end_game():
        return get_render_state()

    # --- SÉLECTION DE GEMMES ---
    if action_type == 'toggle_gem':
        color = int(args[0])
        if color in selected_gems:
            selected_gems.remove(color)
        elif len(selected_gems) < 3:
            selected_gems.append(color)
        return get_render_state() # Rafraîchit l'UI (surbrillance)

    # --- VALIDATION DES GEMMES ---
    elif action_type == 'confirm_gems':
        action_idx = _find_gem_action_index(selected_gems)
        if action_idx >= 0 and valids[action_idx]:
            return getNextState(action_idx)
        else:
            # Action invalide, on reset la sélection
            print(f'Action invalide {selected_gems=} {action_idx=} {valids[action_idx]=}')
            _reset_interaction()

    # --- ACHAT ET RÉSERVATION ---
    elif action_type in ['buy_card', 'reserve_card', 'buy_reserved']:
        action_idx = _find_card_action_index(action_type, *args)
        if action_idx >= 0 and valids[action_idx]:
            return getNextState(action_idx)

    return get_render_state()

def _reset_interaction():
    global selected_gems
    selected_gems = []


def _find_card_action_index(action_type, *args):
    """
    Traduit une intention d'achat ou de réservation en Index d'Action (0-29).
    args contient généralement (tier, index) ou juste (index).
    """
    if action_type == 'buy_card':
        tier, index = int(args[0]), int(args[1])
        # Indices 0 à 11
        return (tier * 4) + index
        
    elif action_type == 'reserve_card':
        tier, index = int(args[0]), int(args[1])
        # Indices 12 à 23
        return 12 + (tier * 4) + index
        
    elif action_type == 'reserve_deck':
        tier = int(args[0])
        # Indices 24 à 26
        return 24 + tier
        
    elif action_type == 'buy_reserved':
        index = int(args[0])
        # Indices 27 à 29
        return 27 + index
        
    return -1


def _find_gem_action_index(gems, discard=False):
    """
    Traduit une liste d'entiers (ex: [0, 2, 4] pour White, Green, Black)
    en Index d'Action de prise ou de défausse de jetons (30-79).
    """
    if not gems:
        return -1
        
    # --- Cas 1 : 2 Gemmes Identiques ---
    if len(gems) == 2 and gems[0] == gems[1]:
        color = gems[0]
        if discard:
            return 75 + color # 75-79: Give back 2 identical
        else:
            return 55 + color # 55-59: Get 2 identical

    # --- Cas 2 : Combinaison de gemmes différentes ---
    # On construit un tableau signature de taille 7 (comme dans ta logique)
    # pour le comparer avec tes listes pré-générées.
    target_sig = [0] * 7
    for color in gems:
        target_sig[color] += 1
        
    target_arr = np.array(target_sig, dtype=np.int8)

    if discard:
        # Recherche dans les 15 combinaisons de défausse (up to 2)
        for i, comb in enumerate(list_different_gems_up_to_2):
            if np.array_equal(comb, target_arr):
                return 60 + i # 60-74: Give back different gems
    else:
        # Recherche dans les 25 combinaisons de prise (up to 3)
        for i, comb in enumerate(list_different_gems_up_to_3):
            if np.array_equal(comb, target_arr):
                return 30 + i # 30-54: Get different gems

    return -1


# ==========================================
# ===== VIEW GENERATION (LE MEGA-JSON) =====
# ==========================================

def get_render_state():
    """
    Construit l'arbre complet des données pour Alpine.js.
    Élimine le besoin de faire 50 appels JS pour afficher le plateau.
    """
    global board, player, game_result, edit_mode, selected_gems

    # 1. Status Message
    status = ""
    if _end_game():
        status = f"Game Over! Winners: {[i for i, v in enumerate(game_result) if v > 0]}"
    elif edit_mode != 0:
        status = "Edit Mode Active"
    else:
        status = f"Player {player}'s Turn"
        if len(selected_gems) > 0:
            status += f" (Gems selected: {len(selected_gems)})"

    # 2. La Banque
    bank_data = []
    for c in range(6):
        qty = int(g.board.bank[0][c])
        bank_data.append({
            'colorIdx': c,
            'colorName': COLORS[c],
            'qty': qty,
            'isSelected': c in selected_gems,
            'isAvailable': qty > 0
        })

    # 3. Les Cartes sur la table (Tiers)
    tiers_data = []
    for tier in range(3):
        tier_cards = []
        for index in range(4): # 4 cartes visibles par tier
            card = _get_tier_card(tier, index)
            tier_cards.append(card)
        tiers_data.append(tier_cards)

    # 4. Les Nobles
    nobles_data = []
    for index in range(NB_PLAYERS + 1):
        # Lecture depuis g.board.nobles
        nobles_data.append(_get_noble(index))

    # 5. Les Joueurs
    players_data = []
    for p in range(NB_PLAYERS):
        p_data = {
            'id': p,
            'isCurrentTurn': (p == player),
            'gems': [int(g.board.players_gems[p][c]) for c in range(6)],
            'cardsCount': [int(g.board.players_cards[p][c]) for c in range(5)], # Uniquement les 5 couleurs
            'score': int(g.getScore(board, p)),
            'reserved': [_get_player_reserved(p, i) for i in range(3)]
        }
        players_data.append(p_data)

    # 6. Construction Finale
    state = {
        'statusMessage': status,
        'currentPlayer': player,
        'gameEnded': _end_game(),
        'editMode': edit_mode,
        'canUndo': len(history) > 0 or len(selected_gems) > 0,
        'viewData': {
            'bank': bank_data,
            'tiers': tiers_data,
            'nobles': nobles_data,
            'players': players_data,
            'canConfirmGems': len(selected_gems) in [2, 3] # Règle visuelle basique
        }
    }
    
    return json.dumps(state)


# ==========================================
# ===== HELPERS DE LECTURE DU BOARD ========
# ==========================================
# Ces fonctions remplacent les anciens getters individuels
# et transforment la donnée Numpy brute en dictionnaires python propres.

def _end_game():
    return any(r != 0 for r in game_result)

def _convert_card_to_dict(line0, line1):
    """
    Décode les 2 lignes décrivant une carte Splendor.
    line0: [W, U, G, R, B, -, -] -> Coûts
    line1: [W, U, G, R, B, -, Pts] -> Gain de ressource et Points
    """
    # Si la carte est vide (slot inoccupé sur le plateau)
    if np.all(line0 == 0) and np.all(line1 == 0):
        return None
        
    # La carte produit une gemme de la couleur indiquée dans line1 (indices 0 à 4)
    # On cherche quel index (0 à 4) vaut 1
    color_name = ""
    for i in range(5):
        if line1[i] > 0:
            color_name = COLORS[i]
            break
            
    return {
        'color': color_name,
        'points': int(line1[6]),
        'cost': [int(c) for c in line0[0:5]] # Les 5 premières valeurs de line0
    }

def _get_noble(index):
    """
    Décode la ligne décrivant un noble.
    noble_data: [W, U, G, R, B, Gold, Pts]
    """
    noble_data = g.board.nobles[index]
    
    if np.all(noble_data == 0):
        return None
        
    return {
        'points': int(noble_data[6]),
        'cost': [int(c) for c in noble_data[0:5]]
    }

def _get_tier_card(tier, index):
    card_data_1 = g.board.cards_tiers[8*tier + 2*index]
    card_data_2 = g.board.cards_tiers[8*tier + 2*index + 1]
    return _convert_card_to_dict(card_data_1, card_data_2)

def _get_player_reserved(player_id, index):
    card_data_1 = g.board.players_reserved[6*player_id + 2*index]
    card_data_2 = g.board.players_reserved[6*player_id + 2*index + 1]
    return _convert_card_to_dict(card_data_1, card_data_2)

def _calculate_score(player_id):
    # Idéalement lu depuis un score direct dans le board, 
    # sinon calculé à partir des cartes et nobles.
    return 0 # Placeholder
   
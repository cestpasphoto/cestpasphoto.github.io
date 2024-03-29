from MCTS import MCTS
from SplendorGame import SplendorGame as Game
from SplendorLogic import move_to_str, np_all_cards_1, np_all_cards_2, np_all_cards_3, np_all_nobles
from SplendorLogicNumba import my_packbits, my_unpackbits
import numpy as np

g, board, mcts, player = None, None, None, 0
history = [] # Previous states (new to old, not current). Each is an array with player and board and action

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
	valids = g.getValidMoves(board, player)
	end = [0,0]

	return player, end, valids

def getNextState(action):
	global g, board, mcts, player, history
	history.insert(0, [player, np.copy(board), action])
	board, player = g.getNextState(board, player, action)
	end = g.getGameEnded(board, player)
	valids = g.getValidMoves(board, player)

	return player, end, valids

def changeDifficulty(numMCTSSims):
	global g, board, mcts, player, history
	mcts.args.numMCTSSims = numMCTSSims
	print('Difficulty changed to', mcts.args.numMCTSSims);

async def guessBestAction():
	global g, board, mcts, player, history
	probs, _, _ = await mcts.getActionProb(g.getCanonicalForm(board, player), force_full_search=True)
	g.board.copy_state(board, True) # g.board was in canonical form, set it back to normal form
	best_action = max(range(len(probs)), key=lambda x: probs[x])

	# Compute good moves
	print('List of best moves found by AI:')
	sorted_probs = sorted([(action,p) for action,p in enumerate(probs)], key=lambda x: x[1], reverse=True)
	for i, (action, p) in enumerate(sorted_probs):
		if p < sorted_probs[0][1] / 3. or i >= 3:
			break
		print(f'{int(100*p)}% [{action}] {move_to_str(action, short=False)}')

	return best_action

def revert_to_previous_move(player_asking_revert):
	global g, board, mcts, player, history
	if len(history) > 0:
		# Revert to the previous 0 before a 1, or first 0 from game
		for index, state in enumerate(history):
			if (state[0] == player_asking_revert) and (index+1 == len(history) or history[index+1][0] != player_asking_revert):
				break
		print(f'index={index} / {len(history)}');
		
		# Actually revert, and update history
		# print(f'Board to revert: {state[1]}')
		player, board = state[0], state[1]
		history = history[index+1:]

	end = g.getGameEnded(board, player)
	valids = g.getValidMoves(board, player)
	return player, end, valids

def get_last_action():
	global g, board, mcts, player, history

	if len(history) < 1:
		return None
	return history[0][2]

# -----------------------------------------------------------------------------

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

def filterCards(tier, color, points):
	pattern = np.zeros(7,)
	pattern[color] = 1
	pattern[6] = points
	list_cards = [np_all_cards_1, np_all_cards_2, np_all_cards_3][tier].reshape(-1,2,7)
	indexes = np.where((list_cards[:,1,:] == pattern).all(axis=1))[0]
	return [_convertCardToJS(list_cards[i,0,:], list_cards[i,1,:]) for i in indexes]

# Return list of indexes where "card" appears in "many_cards"
# Possible combo of dimensions
# card=(7,) , many_cards=(?,2,7)
# card=(2,7), many_cards=(?,2,7)
# card=(2,7), many_cards=(?x2,7)
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
		# Swap cards (put old instead of new)
		index_visible = searchCard(newCard, g.board.cards_tiers)
		index_reserved = searchCard(newCard, g.board.players_reserved)
		deck_cards = my_unpackbits(g.board.nb_deck_tiers[2*tier+1, newCardX])
		new_is_in_deck = (deck_cards[newCardY] > 0)
		# Swap old card <-> new card (old, new = new, old)
		if (index_visible.size > 0 or index_reserved.size > 0):
			new_i = index_visible[0] if index_visible.size else index_reserved[0]
			g.board.cards_tiers[[old_i  , new_i  ], :] = g.board.cards_tiers[[new_i  , old_i  ], :]
			g.board.cards_tiers[[old_i+1, new_i+1], :] = g.board.cards_tiers[[new_i+1, old_i+1], :]
		else:
			g.board.cards_tiers[old_i  , :] = newCard[0, :]
			g.board.cards_tiers[old_i+1, :] = newCard[1, :]
			if (new_is_in_deck):
				# Remove new card from deck
				deck_cards[newCardY] = 0
				g.board.nb_deck_tiers[2*tier+1, newCardX] = my_packbits(deck_cards)
				g.board.nb_deck_tiers[2*tier, newCardX] -= 1
				# Add old card in deck
				deck_cards = my_unpackbits(g.board.nb_deck_tiers[2*tier+1, oldCardX])
				deck_cards[oldCardY] = 1
				g.board.nb_deck_tiers[2*tier+1, oldCardX] = my_packbits(deck_cards)
				g.board.nb_deck_tiers[2*tier, oldCardX] += 1
			# else was won by a player

	if lapidaryMode:
		# Put new card (now at old_i index) at the rightest and shift other cards
		end_tier = 8*(tier+1)
		g.board.cards_tiers[old_i:end_tier, :] = np.roll(g.board.cards_tiers[old_i:end_tier, :], shift=-2, axis=0)

	end = g.getGameEnded(board, player)
	valids = g.getValidMoves(board, player)
	return player, end, valids

def changeGemOrNbCards(p, color, type_, delta):
	if (p < 0): # Bank
		g.board.bank[0][color]          = max(0, g.board.bank[0][color]          + delta)
	elif type_ == 'gem':
		g.board.players_gems[p][color]  = max(0, g.board.players_gems[p][color]  + delta)
	else:
		g.board.players_cards[p][color] = max(0, g.board.players_cards[p][color] + delta)

	end = g.getGameEnded(board, player)
	valids = g.getValidMoves(board, player)
	return player, end, valids

def resetNoble(index):
	g.board.nobles[index, :] = 0
	g.board.players_nobles[index::2, :] = 0

def changeNoble(index, nobleId, assignedPlayer):
	g.board.nobles[index, :] = np_all_nobles[nobleId, :] if assignedPlayer < 0 else 0
	for p in range(g.num_players):
		g.board.players_nobles[3*p+index, :] = np_all_nobles[nobleId, :] if assignedPlayer == p else 0

	end = g.getGameEnded(board, player)
	valids = g.getValidMoves(board, player)
	return player, end, valids

def getBank(color):
	return g.board.bank[0][color].item()

def getPlayerNbCards(player, color):
	return g.board.players_cards[player][color].item()

def getPlayerReserved(player, index):
	card_data_1 = g.board.players_reserved[6*player+2*index]
	card_data_2 = g.board.players_reserved[6*player+2*index+1]
	return _convertCardToJS(card_data_1, card_data_2)

def getPlayerGems(player, color):
	return g.board.players_gems[player][color].item()

def getTierCard(tier, index):
	card_data_1 = g.board.cards_tiers[8*tier+2*index]
	card_data_2 = g.board.cards_tiers[8*tier+2*index+1]
	return _convertCardToJS(card_data_1, card_data_2)

def getNbCardsInDeck(tier):
	return g.board.nb_deck_tiers[2*tier, :5].sum().item()

def getPoints(player, details):
	card_points  = g.board.players_cards[player, 6].item()
	noble_points = g.board.players_nobles[player*3:player*3+3, 6].sum().item()
	return [card_points + noble_points, card_points, noble_points] if details else (card_points+noble_points)

def getNoble(index):
	noble = g.board.nobles[index]
	tokens = _convertTokensToJS(noble)
	return tokens[:3]
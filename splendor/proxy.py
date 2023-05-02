from MCTS import MCTS
from SplendorGame import SplendorGame as Game
from SplendorLogic import move_to_str, np_all_cards_1, np_all_cards_2, np_all_cards_3
import numpy as np

g, board, mcts, player = None, None, None, 0

class dotdict(dict):
    def __getattr__(self, name):
        return self[name]

def init_stuff(numMCTSSims):
	global g, board, mcts, player

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

	return player, end, board.tolist(), valids

def getNextState(action):
	global g, board, mcts, player
	board, player = g.getNextState(board, player, action)
	end = g.getGameEnded(board, player)
	valids = g.getValidMoves(board, player)

	return player, end, board.tolist(), valids

def getBoard():
	global g, board, mcts, player
	return board.tolist()

def changeDifficulty(numMCTSSims):
	global g, board, mcts, player
	mcts.args.numMCTSSims = numMCTSSims
	print('Difficulty changed to', mcts.args.numMCTSSims);

async def guessBestAction():
	global g, board, mcts, player
	probs, _, _ = await mcts.getActionProb(g.getCanonicalForm(board, player), temp=0.5, force_full_search=True)
	best_action = max(range(len(probs)), key=lambda x: probs[x])

	# Compute good moves
	print('List of best moves found by AI:')
	sorted_probs = sorted([(action,p) for action,p in enumerate(probs)], key=lambda x: x[1], reverse=True)
	for action, p in sorted_probs:
		if p < sorted_probs[0][1] / 5.:
			break
		print(f'{int(100*p)}% [{action}] {move_to_str(action, short=False)}')

	return best_action

# -----------------------------------------------------------------------------

def filterCards(tier, color, points):
	pattern = np.zeros(7,)
	pattern[color] = 1
	pattern[6] = points
	list_cards = [np_all_cards_1, np_all_cards_2, np_all_cards_3][tier].reshape(-1,2,7)
	indexes = np.where((list_cards[:,1,:] == pattern).all(axis=1))[0]

	# Convert to format used in our JS code
	result = []
	for i in indexes:
		tokens_col = list_cards[i,0,:].nonzero()[0]
		tokens_val = list_cards[i,0,tokens_col]
		tokens = np.vstack([tokens_col, tokens_val]).T.tolist()
		result.append([color, points, tokens])
	return result

def changeDeckCard(tier, color, points, selectedIndexInDeck, locationIndex):
	pattern = np.zeros(7,)
	pattern[color] = 1
	pattern[6] = points
	list_cards = [np_all_cards_1, np_all_cards_2, np_all_cards_3][tier].reshape(-1,2,7)
	indexes = np.where((list_cards[:,1,:] == pattern).all(axis=1))[0]

	newCardIndex = indexes[selectedIndexInDeck]
	newCard = list_cards[newCardIndex, :, :]

	oldCard = g.board.cards_tiers[8*tier+2*locationIndex:8*tier+2*locationIndex+2]
	oldCardIndex = np.where(np.logical_and(
		(list_cards[:,0,:] == oldCard[0,:]).all(axis=1),
		(list_cards[:,1,:] == oldCard[1,:]).all(axis=1)
	))[0][0]

	# Actually put new card instead of old
	g.board.cards_tiers[8*tier+2*locationIndex  , :] = newCard[0, :]
	g.board.cards_tiers[8*tier+2*locationIndex+1, :] = newCard[1, :]

	# TODO: swap card (put old instead of new)
	# newCard is in visible deck? player reserve? invisible deck? player buy?
	# TODO

	end = g.getGameEnded(board, player)
	valids = g.getValidMoves(board, player)
	return player, end, board.tolist(), valids

# init_stuff(25)
# changeDeckCard(0,0,0,2,1)

def setData(setBoard):
	global g, board, mcts, player

	board = g.getCanonicalForm(np.array(setBoard.to_py()), 0) # say player=0 to force-set setBoard as is
	end = g.getGameEnded(board, player)
	valids = g.getValidMoves(board, player)

	return player, end, board.tolist(), valids
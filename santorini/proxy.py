from MCTS import MCTS
from SantoriniGame import SantoriniGame as Game
from SantoriniDisplay import move_to_str
import numpy as np

g, board, mcts, player = None, None, None, 0

class dotdict(dict):
    def __getattr__(self, name):
        return self[name]

def init_stuff(numMCTSSims):
	global g, board, mcts, player

	mcts_args = dotdict({
		'numMCTSSims'     : numMCTSSims,
		'fpu'             : 0.03,
		'cpuct'           : 2.75,
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
	probs, _, _ = await mcts.getActionProb(g.getCanonicalForm(board, player), temp=1, force_full_search=True)
	best_action = max(range(len(probs)), key=lambda x: probs[x])

	# Compute good moves
	print('List of best moves found by AI:')
	sorted_probs = sorted([(action,p) for action,p in enumerate(probs)], key=lambda x: x[1], reverse=True)
	for action, p in sorted_probs:
		if p < sorted_probs[0][1] / 5.:
			break
		print(f'{int(100*p)}% [{action}] {move_to_str(action, player)}')

	return best_action

def setData(setPlayer, setBoard):
	global g, board, mcts, player

	board = g.getCanonicalForm(np.array(setBoard.to_py()), 0) # say player=0 to force-set setBoard as is
	player = setPlayer
	end = g.getGameEnded(board, player)
	valids = g.getValidMoves(board, player)

	return player, end, board.tolist(), valids

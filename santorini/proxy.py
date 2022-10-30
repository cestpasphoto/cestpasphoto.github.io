from MCTS import MCTS
from SantoriniGame import SantoriniGame as Game
import numpy as np

g, board, mcts, player = None, None, None, 0

class dotdict(dict):
    def __getattr__(self, name):
        return self[name]

def init_stuff(numMCTSSims):
	global g, board, mcts, player

	mcts_args = dotdict({
		'numMCTSSims'     : numMCTSSims,
		'cpuct'           : 1.0,
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
	print('Difficuly changed to', mcts.args.numMCTSSims);

async def guessBestAction():
	global g, board, mcts, player
	probs, _, _ = await mcts.getActionProb(g.getCanonicalForm(board, player), temp=1, force_full_search=True)
	# print('Results', probs)
	best_action = max(range(len(probs)), key=lambda x: probs[x])
	print(f'best_action {best_action} with strength {int(probs[best_action]*100)}%')
	return best_action

def setData(setPlayer, setBoard):
	global g, board, mcts, player

	board = g.getCanonicalForm(np.array(setBoard.to_py()), 0) # say player=0 to force-set setBoard as is
	player = setPlayer
	end = g.getGameEnded(board, player)
	valids = g.getValidMoves(board, player)

	return player, end, board.tolist(), valids

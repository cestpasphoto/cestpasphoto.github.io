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

	# Compute v
	import js
	nn_result = await js.predict(board.flat[:], g.getValidMoves(board, player).flat[:])
	nn_result_py = nn_result.to_py()
	Ps, v = np.exp(np.array(nn_result_py['pi'], dtype=np.float32)), np.array(nn_result_py['v'], dtype=np.float32)
	print(f'Current value: {v} - chances that green wins = {int(100*((v[0]-v[1])/4+0.5))}%')
	# Compute good moves
	sorted_probs = sorted([(i,p) for i,p in enumerate(probs)], key=lambda x: x[1], reverse=True)
	sum_probs = 0
	for i, p in sorted_probs:
		print(f'move {i} {int(100*p)}%,', end='')
		sum_probs += p
		if sum_probs > 0.75:
			break
	print()

	return best_action

def setData(setPlayer, setBoard):
	global g, board, mcts, player

	board = g.getCanonicalForm(np.array(setBoard.to_py()), 0) # say player=0 to force-set setBoard as is
	player = setPlayer
	end = g.getGameEnded(board, player)
	valids = g.getValidMoves(board, player)

	return player, end, board.tolist(), valids

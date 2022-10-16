from MCTS import MCTS
from SantoriniGame import SantoriniGame as Game

g, board, mcts, player = None, None, None, 0

class dotdict(dict):
    def __getattr__(self, name):
        return self[name]

def init_stuff():
	global g, board, mcts, player

	mcts_args = dotdict({
		'numMCTSSims'     : 100,
		'cpuct'           : 1.0,
		'prob_fullMCTS'   : 1.,
		'forced_playouts' : False,
		'no_mem_optim'    : False,
	})

	if g is None:
		g = Game()
	board = g.getInitBoard()
	mcts = MCTS(g, None, mcts_args)
	player = 0

def getNextState(action):
	global g, board, mcts, player
	board, nextPlayer = g.getNextState(board, player, action)
	player = nextPlayer

def printBoard():
	global g, board, mcts, player
	g.printBoard(board)

def getBoard():
	global g, board, mcts, player
	return board.tolist()

def getNextPlayer():
	global g, board, mcts, player
	return player

async def guessBestAction():
	global g, board, mcts, player
	probs, _, _ = await mcts.getActionProb(board, 1)
	# print('Results', probs)
	best_action = max(range(len(probs)), key=lambda x: probs[x])
	print(f'best_action {best_action} with strength {int(probs[best_action]*100)}%')
	return best_action

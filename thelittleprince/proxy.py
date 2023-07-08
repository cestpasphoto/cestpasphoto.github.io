from MCTS import MCTS
from TLPGame import TLPGame as Game
from TLPDisplay import move_to_str
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

def getBoard():
	result = '';
	result += 'Round and state  : ' + np.array_str(g.board.round_and_state) + '<br>';
	result += 'Market           : ' + np.array_str(g.board.market) + '<br>';
	result += 'Players score    : ' + np.array_str(g.board.players_score) + '<br>';
	result += 'Players cards    : ' + np.array_str(g.board.players_cards) + '<br>';
	return result
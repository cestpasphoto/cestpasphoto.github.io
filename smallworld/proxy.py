from MCTS import MCTS
from SmallworldGame import SmallworldGame as Game
from SmallworldDisplay import move_to_str
from SmallworldConstants import *
from SmallworldMaps import *
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
		'fpu'             : 0.177,
		'cpuct'           : 0.4,
		'prob_fullMCTS'   : 1.,
		'forced_playouts' : True,
		'no_mem_optim'    : False,
		'universes'       : 2,
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
		print(f'{int(100*p)}% [{action}] {move_to_str(action, player=player)}')

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
	result += 'State        : ' + np.array_str(g.board.state) + '<br>';
	result += 'Territories  : ' + np.array_str(g.board.territories) + '<br>';
	result += 'Peoples      : ' + np.array_str(g.board.peoples) + '<br>';
	result += 'Visible deck : ' + np.array_str(g.board.visible_deck) + '<br>';
	result += 'Round Status : ' + np.array_str(g.board.round_status) + '<br>';
	result += 'Game Status  : ' + np.array_str(g.board.game_status) + '<br>';
	result += '<br>'
	result += 'Valid moves  : ' + np.array_str(np.flatnonzero(g.getValidMoves(board, player)));
	return result

def getScore(p):
	return g.board.game_status[p, 6] + SCORE_OFFSET

def getRound():
	return g.board.game_status[:, 3].min()

def getPplInfo(p, ppl):
	total_number_of_people = g.board._total_number_of_ppl(g.board.peoples[p, ppl, :])
	return np.append(g.board.peoples[p, ppl, :5], total_number_of_people)

def getDeckInfo(i):
	return g.board.visible_deck[i][[0,1,2,6]]

def getCurrentPlayerAndPeople():
	current_id = g.board.game_status[player, 4].item()
	return player, current_id

def getTerritoryInfo2(area):
	data = [
		g.board.territories[area, 0].item(), # 0 number of people
		g.board.territories[area, 1].item(), # 1 type of people
		(g.board.territories[area, 5]-g.board.territories[area, 0]).item(), # 2 added defense
		descr[area][0].item(),               # 3 terrain type
		[descr[area][1].item(), descr[area][2].item(), descr[area][3].item()], # 4 terrain power
	]
	return data

def needDiceToAttack(area):
	# How many ppl are currently available
	_, current_id = getCurrentPlayerAndPeople()
	current_ppl = g.board.peoples[player, current_id, :]

	territories_of_player = g.board._are_occupied_by(current_ppl)
	how_many_ppl_available = g.board._ppl_virtually_available(player, current_ppl, PHASE_CONQUEST, territories_of_player)
	# Take in account dice when berserk
	if current_ppl[2] == BERSERK:
		dataB, dataA = divmod(current_ppl[4], 2**6)
		if bool(dataB):
			how_many_ppl_available += dataA

	minimum_ppl_for_attack = g.board._minimum_ppl_for_attack(area, current_ppl)
	return bool(how_many_ppl_available < minimum_ppl_for_attack)

def gather_current_ppl_but_one():
	current_ppl, _ = g.board._current_ppl(player)
	g.board._gather_current_ppl_but_one(current_ppl)

def ongoingRedeploy():
	return (g.board.round_status[player, 4] == PHASE_REDEPLOY).item()


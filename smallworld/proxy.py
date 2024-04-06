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
		'fpu'             : 0.10,
		'cpuct'           : 1.00,
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

terrains_col = [
	'green',  # FORESTT
	'yellow', # FARMLAND
	'olive',  # HILLT
	'red',    # SWAMPT
	'grey',   # MOUNTAIN
	'blue',   # WATER
]
powers_str = [' ', '⅏','ℵ', '⍎']

ppl_str      = [' ', 'A' , 'D' , 'E', 'g', 'G' , 'h', 'H' , 'O' , 'R' , 's', 'S' , 't', 'T' , 'W' , 'l']
ppl_decl_str = [' ', '🄐', '🄓', '🄔', '🄖', '🄖', '🄗', '🄗', '🄞', '🄡', '🄢', '🄢', '🄣', '🄣', '🄦', '🄛']
ppl_long_str = [' ', 'AMAZON','DWARF','ELF','GHOUL','GIANT','HALFLING','HUMAN','ORC','RATMAN','SKELETON','SORCERER','TRITON','TROLL','WIZARD', 'LOST_TRIBE']
power_long_str = [' ','ALCHEMIST','BERSERK','BIVOUACKING','COMMANDO','DIPLOMAT','DRAGONMASTER', 'FLYING','FOREST','FORTIFIED','HEROIC','HILL','MERCHANT','MOUNTED','PILLAGING','SEAFARING','SPIRIT','STOUT','SWAMP','UNDERWORLD','WEALTHY']
ac_or_dec_str = ['decline-spirit ppl', 'decline ppl', 'active ppl', '']

def getBackground(y, x):
	area, txt = map_display[y][x]
	terrain = descr[area][0]
	return terrains_col[terrain]

def getScore(p):
	return g.board.game_status[p, 6] + SCORE_OFFSET

def getRound():
	return g.board.game_status[:, 3].min()

def getPplInfo(p, ppl):
	return np.abs(g.board.peoples[p, ppl, :3])

def getDeckInfo(i):
	return g.board.visible_deck[i][[0,1,2,6]]

def getCurrentPlayerAndPeople():
	current_p = np.argwhere(g.board.game_status[:, 4] + 1)[0]
	current_ppl = g.board.game_status[current_p, 4]
	return current_p, current_ppl

def getTerritory(y, x):
	area, txt = map_display[y][x]
	# terrain = descr[area][0]

	if txt == 1 and g.board.territories[area,0] > 0:
		data = str(g.board.territories[area,0])
	elif txt == 2:
		if g.board.territories[area,1] >= 0:
			data = ppl_str     [ g.board.territories[area,1]]
		else:
			data = ppl_decl_str[-g.board.territories[area,1]]	
	elif txt == 3:
		data = ''
		for i in range(1, 4):
			if descr[area][i]:
				data += powers_str[i]
		data += ' ' * (2-len(data))
	elif txt == 4 and g.board.territories[area, 3:5].sum() > 0:
		if g.board.territories[area, 3:5].sum() >= IMMUNITY:
			data = '**'
		else:
			data = '+' + str(g.board.territories[area, 3:5].sum())
	else:
		data = ''
	return data

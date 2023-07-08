import numpy as np
from TLPLogicNumba import my_unpackbits

NUMBER_PLAYERS = 3

def move_to_str(move, short=False):
	card_to_take, next_player = divmod(move, NUMBER_PLAYERS)
	card_str = f'take card {card_to_take}'

	if   next_player == 0:
		short_name_next = 'himself'
	elif next_player == 1:
		short_name_next = 'the player on his right'
	elif next_player == NUMBER_PLAYERS-1:
		short_name_next = 'the player on his left'
	elif next_player == 2:
		short_name_next = '2nd player on his right'
	elif next_player == NUMBER_PLAYERS-2:
		short_name_next = '2nd player on his left'
	else: # should not happen
		short_name_next = f'P+{next_player}'
	player_str = f' and choose {short_name_next} as next'
	return card_str + player_str

############################# NAMES ######################################

# Must be synchronized with attributes codes at end of TLPLogicNumba.py
attributes_name = [
	'Card face down', # 0
	'Baobab',         # 1
	'Volcano',        # 2
	'Sunset',         # 3
	'Rose',           # 4
	'Lamp post',      # 5
	'Box',            # 6
	'Big star',       # 7
	'Fox',            # 8
	'Elephant',       # 9
	'Snake',          # 10
	'Sheep (white)',  # 11
	'Sheep (grey)',   # 12
	'Sheep (brown)',  # 13
]

attributes_sign = [
	'🔙', '🌲', '🌋', '🌅', '🌹', '💡', '💼', '🌟', '🦊', '🐘', '🐍', '🐑', '🐺', '🐐'
]

# Must be synchronized with character codes at end of TLPLogicNumba.py
characters_name = [
	'-',                 # 0
	'Vain man',          # 1
	'Geographer',        # 2
	'Astronomer',        # 3
	'King',              # 4
	'Lamplighter',       # 5
	'Hunter',            # 6
	'Drunkard',          # 7
	'W Businessman',     # 8
	'G Businessman',     # 9
	'B Businessman',     # 10
	'Gardener',          # 11
	'Turkish Astronomer',# 12
	'Little Prince',     # 13
]

############################# PRINT GAME ######################################

def print_board(board):
	print()

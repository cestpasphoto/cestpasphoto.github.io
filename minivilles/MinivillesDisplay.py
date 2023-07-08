import numpy as np

def move_to_str(move, short=False):
	if   move < 15:
		return f'buy {cards_description[move][-1]}'
	elif move < 15+4:
		i = move-15
		return f'enable {monuments_description[i][-1]}'
	elif move == 15+4:
		return f'roll dice(s) again'
	else:
		return f'do nothing'

############################# NAMES ######################################

cards_description = [
	('', '', '  1  ', 1, 'banque → 1 → tous'     , 'champs de blé'             ), # 0
	('', '', '  2  ', 1, 'banque → 1 → tous'     , 'ferme'                     ), # 1
	('', '', ' 2-3 ', 1, 'banque → 1 → moi '     , 'boulangerie'               ), # 2
	('', '', '  3  ', 2, 'lanceur → 1 → moi'     , 'café'                      ), # 3
	('', '', '  4  ', 2, 'banque → 3 → moi'      , 'supérette'                 ), # 4
	('', '', '  5  ', 3, 'banque → 1 → tous'     , 'forêt'                     ), # 5
	('', '', '  6  ', 6, 'tous → 2 → moi'        , 'stade'                     ), # 6
	('', '', '  6  ', 8, 'qqun ⇆ 1 carte ⇆ moi'  , 'centre d\'affaires'        ), # 7
	('', '', '  6  ', 7, 'qqun → 5 → moi'        , 'chaîne de télévision'      ), # 8
	('', '', '  7  ', 5, 'banque → 3*c2 → moi'   , 'fromagerie'                ), # 9
	('', '', '  8  ', 3, 'banque → 3*c5&9 → moi' , 'fabrique de meubles'       ), # 10
	('', '', '  9  ', 6, 'banque → 5 → tous '    , 'mine'                      ), # 11
	('', '', ' 9-10', 3, 'lanceur → 2 → moi '    , 'restaurant'                ), # 12
	('', '', '  10 ', 3, 'banque → 3 → tous '    , 'verger'                    ), # 13
	('', '', '11-12', 2, 'banque → 2*c1&10 → moi', 'marché de fruits & légumes'), # 14
]

monuments_description = [
	('', '', 4,  '2 dés'                      , 'gare'               ), # 0
	('', '', 10, 'bonus c2-3 & 3 & 4 & 9-10'  , 'centre commercial'  ), # 1
	('', '', 16, 'tour bonus si double'       , 'tour radio'         ), # 2
	('', '', 22, 'peut relancer dés'          , 'parc d\'attractions'), # 3
]

############################# PRINT GAME ######################################

def print_board(board):
	pass
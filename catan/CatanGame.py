from Game import Game
from CatanConstants import N_PLAYERS as NUMBER_PLAYERS
from CatanLogicNumba import Board, observation_size, action_size

# Web copy of catan/CatanGame.py: flat imports (Pyodide loads every file at the
# root of its filesystem), no CatanDisplay (colorama), no training-only methods.


class CatanGame(Game):
	# Read by MCTS: chance (dice, draws, steals) is re-drawn at every simulation,
	# a universe only fixes the invented hidden hands.
	chance_per_sim = True

	def __init__(self):
		self.board = Board(NUMBER_PLAYERS)
		self.num_players = NUMBER_PLAYERS

	def getInitBoard(self):
		self.board.init_game()
		return self.board.get_state()

	def getBoardSize(self):
		return observation_size()

	def getActionSize(self):
		return action_size()

	def getNextState(self, board, player, action, random_seed=0):
		self.board.copy_state(board, True)
		next_player = self.board.make_move(action, player, random_seed)
		return (self.board.get_state(), next_player)

	def getValidMoves(self, board, player):
		self.board.copy_state(board, False)
		return self.board.valid_moves(player)

	def getGameEnded(self, board, next_player):
		self.board.copy_state(board, False)
		return self.board.check_end_game(next_player)

	def getScore(self, board, player):
		self.board.copy_state(board, False)
		return self.board.get_score(player)

	def getRound(self, board):
		self.board.copy_state(board, False)
		return self.board.get_round()

	def getCanonicalForm(self, board, player):
		if player == 0:
			return board
		self.board.copy_state(board, True)
		self.board.swap_players(player)
		return self.board.get_state()

	def stringRepresentation(self, board):
		return board.tobytes()

	def getNumberOfPlayers(self):
		return NUMBER_PLAYERS

	# --- Hidden information (see MCTS.py) -----------------------------------
	def getObservation(self, board, viewer):
		self.board.copy_state(board, True)
		self.board.get_observation(viewer)
		return self.board.get_state()

	def sampleWorld(self, observation, random_seed):
		self.board.copy_state(observation, True)
		self.board.sample_world(random_seed)
		return self.board.get_state()

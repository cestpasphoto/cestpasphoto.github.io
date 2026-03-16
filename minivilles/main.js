// minivilles/main.js

/* =================== */
/* ===== GLOBALS ===== */
/* =================== */

// Minivilles is configured for 2 players by default in the provided logic
const numPlayers = 2;

// Default number of MCTS simulations for the AI
const numMCTSSims = 25;

// Size of the Canonical Board:
// In MinivillesLogicNumba.py, observation_size(2) returns (58, 2).
// Flattened size = 58 * 2 = 116.
const sizeCB = [1, 58, 2];

// Size of the Valid Actions array:
// In MinivillesLogicNumba.py, action_size() returns 21.
const sizeV = [1, 21];

// Path to the ONNX model trained for Minivilles
const defaultModelFileName = 'minivilles/model.onnx';

// List of Python files to be fetched and mounted in Pyodide's virtual filesystem
const list_of_files = [
    ['minivilles/proxy.py', 'proxy.py'],
    ['minivilles/MinivillesGame.py', 'MinivillesGame.py'],
    ['minivilles/MinivillesLogicNumba.py', 'MinivillesLogicNumba.py'],
    ['minivilles/MinivillesDisplay.py', 'MinivillesDisplay.py'],
    ['minivilles/MCTS.py', 'MCTS.py'],
    ['minivilles/Game.py', 'Game.py']
];
// Define main constants for Abalone
const configs = {
    abalone: {
        game_name: 'Abalone',
        // Action space size defined in AbaloneLogicNumba.py (9 * 9 * 42)
        onnxOutputSize: 3402,
        // Path to the ONNX model
        defaultModelFileName: 'abalone/model.onnx',
    }
};

// Number of players for Abalone
const numPlayers = 2;

// Select the configuration
const selectedConfig = configs.abalone;

// Export variables expected by game.js and abalone.js
const { game_name, onnxOutputSize, pyConstantsFileName, defaultModelFileName } = selectedConfig;
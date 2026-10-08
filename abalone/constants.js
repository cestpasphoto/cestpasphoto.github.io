// Define main constants for Abalone, one configuration per starting layout,
// chosen with `abalone.html?layout=N` (0 by default). The engine reads INITIAL_LAYOUT
// from globalThis.gameConfig when AbaloneLogicNumba.py is imported.
const configs = {
    // Classic
    0: {
        // Path to the ONNX model
        defaultModelFileName: 'abalone/model_layout0.onnx',
    },
    // Belgian Daisy
    1: {
        defaultModelFileName: 'abalone/model_layout1.onnx',
    },
    // German Daisy
    2: {
        defaultModelFileName: 'abalone/model_layout2.onnx',
    },
};

const game_name = 'Abalone';
// Action space size defined in AbaloneLogicNumba.py (9 * 9 * 42), same for every layout
const onnxOutputSize = 3402;

// Number of players for Abalone
const numPlayers = 2;

// Select the configuration
const _layoutParam = +new URLSearchParams(window.location.search).get('layout');
const initialLayout = configs[_layoutParam] ? _layoutParam : 0;
const { defaultModelFileName } = configs[initialLayout];
// Read by the Python engine when its constants module is imported: must be set before `import proxy`
globalThis.gameConfig = { INITIAL_LAYOUT: initialLayout };

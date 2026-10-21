// One configuration per player count, chosen with `azul.html?players=N` (2 by default).
// The engine reads NUMBER_PLAYERS from globalThis.gameConfig when AzulGame.py is imported.
const configs = {
  2: {
    defaultModelFileName: 'azul/model_2pl.onnx',
    sizeCB: [1, 23, 6],         // observation_size(2) = (9*2 + 5, 6)
    sizeV: [1, 180],            // action_size(2) = (2*2 + 2) * 30
  },
  3: {
    defaultModelFileName: 'azul/model_3pl.onnx',
    sizeCB: [1, 32, 6],
    sizeV: [1, 240],
  },
  4: {
    defaultModelFileName: 'azul/model_4pl.onnx',
    sizeCB: [1, 41, 6],
    sizeV: [1, 300],
  },
};

const _playersParam = +new URLSearchParams(window.location.search).get('players');
const numPlayers = configs[_playersParam] ? _playersParam : 2;
const { sizeV, sizeCB, defaultModelFileName } = configs[numPlayers];
// Read by the Python engine when its game module is imported: must be set before `import proxy`
globalThis.gameConfig = { NUMBER_PLAYERS: numPlayers };

// Seats: blue and red would be mistaken for tiles, hence this palette
const SEAT_COLORS = ['#21BA45', '#F2711C', '#A333C8', '#00B5AD'];
const SEAT_NAMES = ['Green', 'Orange', 'Purple', 'Teal'];

// Tiles, in engine order (Blue, Yellow, Red, Black, White); the emoji are the ones Python writes in its texts
const TILE_NAMES = ['blue', 'yellow', 'red', 'black', 'white'];
const TILE_EMOJI = ['🟦', '🟨', '🟥', '⬛', '⬜'];

// Floor line: penalty of each of its 7 slots
const FLOOR_PEN = [1, 1, 2, 2, 2, 3, 3];
const TOKEN = 5;      // first-player token in a floor list

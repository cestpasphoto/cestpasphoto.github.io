// One configuration per player count, chosen with `tlp.html?players=N` (3 by default).
// The engine reads NUMBER_PLAYERS from globalThis.gameConfig when TLPGame.py is imported.
const configs = {
  3: {
    defaultModelFileName: 'thelittleprince/model_3pl.onnx',
    sizeCB: [1, 55, 15],        // observation_size() = (18*n + 1, 15)
    sizeV: [1, 13],             // action_size() = n*n + 4
  },
  4: {
    defaultModelFileName: 'thelittleprince/model_4pl.onnx',
    sizeCB: [1, 73, 15],
    sizeV: [1, 20],
  },
  5: {
    defaultModelFileName: 'thelittleprince/model_5pl.onnx',
    sizeCB: [1, 91, 15],
    sizeV: [1, 29],
  },
};

const _playersParam = +new URLSearchParams(window.location.search).get('players');
const numPlayers = configs[_playersParam] ? _playersParam : 3;
const { sizeV, sizeCB, defaultModelFileName } = configs[numPlayers];
// Read by the Python engine when TLPGame.py is imported: must be set before `import proxy`
globalThis.gameConfig = { NUMBER_PLAYERS: numPlayers };

// Seats
const SEAT_COLORS = ['#2185D0', '#DB2828', '#F2711C', '#A333C8', '#21BA45'];
const SEAT_NAMES = ['Blue', 'Red', 'Orange', 'Purple', 'Green'];

// Card attributes, engine order (TLPLogicNumba.py: FACE_DOWN .. SHEEP_BROWN, then CARD_TYPE)
const A_FACE_DOWN = 0, A_BAOBAB = 1, A_VOLCANO = 2, A_STAR = 7, A_TYPE = 14;
const ATTR_EMOJI = ['⬛', '🌳', '🌋', '🌅', '🌹', '💡', '📦', '⭐', '🦊', '🐘', '🐍', '🐑', '🐑', '🐑'];
const ATTR_NAMES = ['face-down card', 'baobab', 'volcano', 'sunset', 'rose', 'lamp post', 'box', 'star',
                    'fox', 'elephant', 'snake', 'white sheep', 'grey sheep', 'brown sheep'];
const SHEEP_CLS = { 11: 'w', 12: 'g', 13: 'b' };   // the three sheep share one emoji: a colored chip tells them apart

// Stacks / slot types: engine card type = 25 * (t + 1), stack action = n*n + t
const STACK_ICON = ['◼', '◢', '◣', '👤'];
const STACK_NAME = ['Center', 'Uphill edge', 'Downhill edge', 'Character'];
// Slot type (0-3) of each of the 16 planet slots, row by row (slots_in_planet())
const SLOT_TYPE = [3, 1, 2, 3, 2, 0, 0, 1, 1, 0, 0, 2, 3, 2, 1, 3];

// Characters (engine card type - 100): emoji, name, short effect (inside the tile), full rule
const CHARS = [
  null,
  ['🎩', 'Vain Man', '4/🐍', '4 points per 🐍 snake.'],
  ['🗺️', 'Geographer', '1/no🌋', '1 point per non-character card without 🌋 volcano.'],
  ['🔭', 'Astronomer', '2/🌅', '2 points per 🌅 sunset.'],
  ['👑', 'King', '🌹14/7', '14 points with exactly one 🌹 rose, 7 with exactly two, 0 otherwise.'],
  ['🕯️', 'Lamplighter', '1/💡', '1 point per 💡 lamp post.'],
  ['🏹', 'Hunter', '3/kind', '3 points for having a 🐍, 3 for an 🐘, 3 for a 🐑 of any color.'],
  ['🍷', 'Drunkard', '3/⬛', '3 points per face-down card.'],
  ['💼', 'Businessman', '2/#11', '2 points per white #11 sheep.'],
  ['💼', 'Businessman', '3/#12', '3 points per grey #12 sheep.'],
  ['💼', 'Businessman', '5/#13', '5 points per brown #13 sheep.'],
  ['🧑‍🌾', 'Gardener', '7/🌳', '7 points per 🌳 baobab still face up.'],
  ['🌠', 'Turkish Astronomer', '1/⭐', '1 point per ⭐ star.'],
  ['🤴', 'Little Prince', '3/🐑 1/📦', '3 points per sheep color you have, 1 point per 📦 box.'],
];

// One configuration per player count, chosen with `catan.html?players=N` (3 by default).
// The engine reads N_PLAYERS from globalThis.gameConfig when CatanConstants.py is imported.
const configs = {
  2: {
    defaultModelFileName: 'catan/model_2pl.onnx',
    sizeCB: [1, 83, 12],        // observation_size() = (75 + 4*2, 12)
    sizeV: [1, 382],            // action_size()
  },
  3: {
    defaultModelFileName: 'catan/model_3pl.onnx',
    sizeCB: [1, 87, 12],
    sizeV: [1, 402],
  },
  4: {
    defaultModelFileName: 'catan/model_4pl.onnx',
    sizeCB: [1, 91, 12],
    sizeV: [1, 422],
  },
};

const _playersParam = +new URLSearchParams(window.location.search).get('players');
const numPlayers = configs[_playersParam] ? _playersParam : 3;
const { sizeV, sizeCB, defaultModelFileName } = configs[numPlayers];
// Read by the Python engine when it is imported (_webconfig.py): must be set before `import proxy`
globalThis.gameConfig = { N_PLAYERS: numPlayers };

// Seats
const SEAT_COLORS = ['#2185D0', '#DB2828', '#F2711C', '#A333C8'];
const SEAT_NAMES = ['Blue', 'Red', 'Orange', 'Purple'];

// Resources, in engine order (BRICK, LUMBER, ORE, GRAIN, WOOL)
const RES_EMOJI = ['🧱', '🌲', '⛰️', '🌾', '🐑'];
const RES_NAMES = ['Brick', 'Lumber', 'Ore', 'Grain', 'Wool'];

// Hex types, in engine order (DESERT, HILL, FOREST, MOUNTAIN, FIELD, PASTURE)
const HEX_COLORS = ['#e6d5a8', '#c96a42', '#3f8a45', '#9aa2ab', '#e9c54a', '#a3d06b'];

// Development cards, in engine order (KNIGHT, VICTORY_POINT, ROAD_BUILDING, MONOPOLY, YEAR_OF_PLENTY)
const DEV_EMOJI = ['⚔️', '⭐', '🛣️', '💰', '🎁'];
const DEV_NAMES = ['Knight', 'Victory Point', 'Road Building', 'Monopoly', 'Year of Plenty'];
const DEV_ORDER = [0, 2, 3, 4, 1];   // display order, VP cards last

// Phases (GA_PHASE)
const PHASE_SETUP_SETTLEMENT = 0, PHASE_SETUP_ROAD = 1, PHASE_TRADE_ANSWER = 8;

// Trade statuses (PD_TRADE_STATUS)
const TRADE_COMPOSING = 1, TRADE_OFFERED = 2, TRADE_REFUSED = 3;

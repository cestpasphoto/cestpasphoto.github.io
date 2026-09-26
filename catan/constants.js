// Catan is played with the 3-player model only.
const numPlayers = 3;
const defaultModelFileName = 'catan/model.onnx';
const sizeCB = [1, 87, 12];     // observation_size() = (75 + 4*3, 12)
const sizeV = [1, 402];         // action_size()

// Seats
const SEAT_COLORS = ['#2185D0', '#DB2828', '#F2711C'];
const SEAT_NAMES = ['Blue', 'Red', 'Orange'];

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

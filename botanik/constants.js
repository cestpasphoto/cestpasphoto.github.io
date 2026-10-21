// Botanik is played by 2 players only: one configuration, one model.
const numPlayers = 2;
const defaultModelFileName = 'botanik/model.onnx';
const sizeCB = [1, 66, 5, 7];   // observation_size() = (6 + 6*ceil(7*7/5), 5, 7), MACHINE_SIZE = 7
const sizeV = [1, 428];         // action_size() = 36 + 8*7*7

// Seats (Botanik uses the 3rd and 4th common seat colours: blue and red are card colours)
const SEAT_COLORS = ['#F2711C', '#A333C8'];
const SEAT_NAMES = ['Orange', 'Purple'];

// Card colours, engine order (BotanikConstants.py: EMPTY, SOURCE, BLUE, YELLOW, GREEN, RED, BLACK)
const CARD_FILL = ['transparent', '#ffffff', '#a9cdee', '#f4dc85', '#addcaa', '#f2aaa1', '#5f5f5f'];
const CARD_PIPE = ['#999', '#3a78b5', '#1d4f7c', '#6b5410', '#22562a', '#6e211a', '#f4f4f4'];
const COLOR_EMOJI = ['', '💧', '🟦', '🟨', '🟩', '🟥', '⬛'];
const COLOR_NAMES = ['', 'source', 'blue', 'yellow', 'green', 'red', 'black'];

// Card types (PIPE2_ANGLE, PIPE2_STRAIGHT, PIPE3, PIPE4, PLANT, VEGET, MECABOT)
const TYPE_GLYPH = ['', '', '', '', '🌷', '🥕', '🤖'];
const TYPE_NAMES = ['angle pipe', 'straight pipe', 'T pipe', 'cross pipe', 'flower', 'vegetable', 'mecabot'];

// Card row: colour, flowers, type, then pipes north / east / south / west
const C_COLOR = 0, C_FLOWERS = 1, C_TYPE = 2, C_NORTH = 3;
const MACHINE_SIZE = 7;

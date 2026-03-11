/* ==================================================== */
/* ===== ENGINE CONFIGURATION (REQUIRED BY GAME.JS) === */
/* ==================================================== */

const numPlayers = 2;
const numMCTSSims = 25;

// ONNX Model Configuration
const defaultModelFileName = './akropolis/model.onnx';

// Tensor dimensions for Akropolis (2 Players)
// Canonical Board: [1, CITY_SIZE, CITY_SIZE, 3 * N_PLAYERS + 2] -> [1, 13, 13, 8]
const sizeCB = [1, 13, 13, 8];

// Valid Actions: [CONSTR_SITE_SIZE * CITY_AREA * N_ORIENTS] -> [4 * 169 * 6] -> [4056]
const sizeV = [1, 4056];

// Python files required by Pyodide to run the engine in the browser
const list_of_files = [
    ['./akropolis/Game.py', 'Game.py'],
    ['./akropolis/MCTS.py', 'MCTS.py'],
    ['./akropolis/proxy.py', 'proxy.py'],
    ['./akropolis/AkropolisGame.py', 'AkropolisGame.py'],
    ['./akropolis/AkropolisLogicNumba.py', 'AkropolisLogicNumba.py'],
    ['./akropolis/AkropolisConstants.py', 'AkropolisConstants.py'],
];

/* ==================================================== */
/* ===== GAME SPECIFIC CONSTANTS BELOW...           === */
/* ==================================================== */

// (The rest of the constants provided in the previous message: HEX_R, COLORS, etc.)

// --- Geometric Constants for Pointy-Topped Hexagons ---
const HEX_R = 30; // Outer radius of the hexagon
const HEX_W = Math.sqrt(3) * HEX_R; // Width
const HEX_H = 2 * HEX_R;            // Height
const HEX_X_STEP = HEX_W;           // Horizontal distance between centers
const HEX_Y_STEP = 1.5 * HEX_R;     // Vertical distance between centers
const HEIGHT_Z_SHIFT = 10;          // Y-offset in pixels to simulate 3D elevation

// --- Tiles & Colors ---
const TILE_EMPTY = 0;
const TILE_QUARRY = 1;

const COLORS = {
    0: 'transparent',
    1: '#e0e0e0', // QUARRY (Light Grey)
    2: '#80bfff', // DISTRICT BLUE
    3: '#ffdd66', // DISTRICT YELLOW
    4: '#ff8080', // DISTRICT RED
    5: '#df80ff', // DISTRICT PURPLE
    6: '#80df80', // DISTRICT GREEN
    7: '#1a75ff', // PLAZA BLUE
    8: '#e6b800', // PLAZA YELLOW
    9: '#e60000', // PLAZA RED
    10: '#9900cc',// PLAZA PURPLE
    11: '#009900' // PLAZA GREEN
};

// Map description IDs to their respective text/icons
function getTileLabel(desc) {
    if (desc === 1) return 'Q';
    if (desc >= 2 && desc <= 6) return '⌂'; // Districts
    if (desc === 7) return '★';            // Plaza Blue (1 star)
    if ([8, 9, 10].includes(desc)) return '★★'; // Plaza Yellow, Red, Purple (2 stars)
    if (desc === 11) return '★★★';          // Plaza Green (3 stars)
    return '';
}

// Convert axial odd-r coordinates to Cartesian SVG coordinates
function getHexCoords(r, q) {
    let x = HEX_W * (q + 0.5 * (r & 1));
    let y = HEX_Y_STEP * r;
    return { x, y };
}

// Generate the SVG polygon points string for a hexagon centered at (cx, cy)
function getHexPolygon(cx, cy) {
    return [
        [cx, cy - HEX_R],
        [cx + HEX_W/2, cy - HEX_R/2],
        [cx + HEX_W/2, cy + HEX_R/2],
        [cx, cy + HEX_R],
        [cx - HEX_W/2, cy + HEX_R/2],
        [cx - HEX_W/2, cy - HEX_R/2]
    ].map(p => p.join(',')).join(' ');
}
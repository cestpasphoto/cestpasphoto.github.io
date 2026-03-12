/* ==================================================== */
/* ===== ENGINE CONFIGURATION (REQUIRED BY GAME.JS) === */
/* ==================================================== */

const numMCTSSims = 25;

const sizeCB = [1, 13, 13, 8]; // 3 = 13x13x11, 4 = 13x13x14
const sizeV = [1, 4056];       // 3 = 5070, 4 = 6084

const numPlayers = +new URLSearchParams(window.location.search).get('players') || 2;
// const selectedConfig = configs[numPlayers] || configs[2];


const list_of_files = [
    ['./akropolis/Game.py', 'Game.py'],
    ['./akropolis/MCTS.py', 'MCTS.py'],
    ['./akropolis/proxy.py', 'proxy.py'],
    ['./akropolis/AkropolisGame.py', 'AkropolisGame.py'],
    ['./akropolis/AkropolisLogicNumba.py', 'AkropolisLogicNumba.py'],
    ['./akropolis/AkropolisConstants.py', 'AkropolisConstants.py'],
];
const defaultModelFileName = './akropolis/model_2pl.onnx';


/* ==================================================== */
/* ===== 3D GEOMETRIC CONSTANTS                     === */
/* ==================================================== */

const HEX_R = 36;                     // Base radius of the hexagon
const HEX_W = Math.sqrt(3) * HEX_R;   // True width
const ISO_RATIO = 0.75;               // Y-axis squash ratio for fake 3D
const TILE_THICKNESS = 5;            // T: Thickness of the tile in pixels

// Spacing constants (before isometric projection)
const HEX_X_STEP = HEX_W;
const HEX_Y_STEP = 1.5 * HEX_R;

/* ==================================================== */
/* ===== COLORS & LABELS                            === */
/* ==================================================== */

const TILE_EMPTY = 0;
const TILE_QUARRY = 1;

const COLORS = {
    0: 'transparent',
    1: '#e2e8f0', // QUARRY (Light Grey)
    2: '#3b82f6', // DISTRICT BLUE
    3: '#facc15', // DISTRICT YELLOW
    4: '#ef4444', // DISTRICT RED
    5: '#a855f7', // DISTRICT PURPLE
    6: '#22c55e', // DISTRICT GREEN
    7: '#1d4ed8', // PLAZA BLUE
    8: '#ca8a04', // PLAZA YELLOW
    9: '#b91c1c', // PLAZA RED
    10: '#7e22ce',// PLAZA PURPLE
    11: '#166534' // PLAZA GREEN
};

function getTileLabel(desc) {
    // if (desc === 1) return 'Q';
    // if (desc >= 2 && desc <= 6) return '⌂'; 
    if (desc === 7) return '★';            
    if ([8, 9, 10].includes(desc)) return '★★'; 
    if (desc === 11) return '★★★';          
    return '';
}

// Computes the flat 2D center coordinate, but squashed on Y
function getHexCoords(r, q) {
    let x = HEX_X_STEP * (q + 0.5 * (r & 1));
    let y = HEX_Y_STEP * r * ISO_RATIO;
    return { x, y };
}
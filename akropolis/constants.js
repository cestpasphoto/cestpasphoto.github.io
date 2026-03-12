/* ==================================================== */
/* ===== ENGINE CONFIGURATION (REQUIRED BY GAME.JS) === */
/* ==================================================== */

const numPlayers = +new URLSearchParams(window.location.search).get('players') || 2;
const numMCTSSims = 25;

// Charge dynamiquement model_3pl.onnx, model_4pl.onnx, etc.
const defaultModelFileName = `./akropolis/model_${numPlayers}pl.onnx`;

// La dimension du plateau change selon le nombre de joueurs (3*N + 2)
const sizeCB = [1, 13, 13, (3 * numPlayers) + 2];
const sizeV = [1, 4056];

const list_of_files = [
    ['./akropolis/Game.py', 'Game.py'],
    ['./akropolis/MCTS.py', 'MCTS.py'],
    ['./akropolis/proxy.py', 'proxy.py'],
    ['./akropolis/AkropolisGame.py', 'AkropolisGame.py'],
    ['./akropolis/AkropolisLogicNumba.py', 'AkropolisLogicNumba.py'],
    ['./akropolis/AkropolisConstants.py', 'AkropolisConstants.py'],
];

/* ==================================================== */
/* ===== 3D GEOMETRIC CONSTANTS                     === */
/* ==================================================== */

const HEX_R = 36;                     
const HEX_W = Math.sqrt(3) * HEX_R;   
const ISO_RATIO = 0.75;               
const TILE_THICKNESS = 5;            

const HEX_X_STEP = HEX_W;
const HEX_Y_STEP = 1.5 * HEX_R;

/* ==================================================== */
/* ===== COLORS & LABELS                            === */
/* ==================================================== */

const TILE_EMPTY = 0;
const TILE_QUARRY = 1;

const COLORS = {
    0: 'transparent',
    1: '#e2e8f0', 
    2: '#3b82f6', 
    3: '#facc15', 
    4: '#ef4444', 
    5: '#a855f7', 
    6: '#22c55e', 
    7: '#1d4ed8', 
    8: '#ca8a04', 
    9: '#b91c1c', 
    10: '#7e22ce',
    11: '#166534' 
};

function getTileLabel(desc) {
    if (desc === 7) return '★';            
    if ([8, 9, 10].includes(desc)) return '★★'; 
    if (desc === 11) return '★★★';          
    return ''; 
}

function getHexCoords(r, q) {
    let x = HEX_X_STEP * (q + 0.5 * (r & 1));
    let y = HEX_Y_STEP * r * ISO_RATIO;
    return { x, y };
}
/* =================== */
/* =====  CONFIG ===== */
/* =================== */

// Files to be loaded by Pyodide into the virtual file system.
// The first element is the path/URL, the second is the local filename in Python.
// pyConstantsFileName is defined in constants_*.js (loaded before this file).
const list_of_files = [
  ['santorini/Game.py', 'Game.py'],
  ['santorini/proxy.py', 'proxy.py'], // The new Controller
  ['santorini/MCTS.py', 'MCTS.py'],
  ['santorini/SantoriniDisplay.py', 'SantoriniDisplay.py'],
  ['santorini/SantoriniGame.py', 'SantoriniGame.py'],
  ['santorini/SantoriniLogicNumba.py', 'SantoriniLogicNumba.py'],
  [pyConstantsFileName, 'SantoriniConstants.py'],
];

// ONNX Neural Network Input/Output Shapes
// Used by game.js to construct Tensors.
// onnxOutputSize is defined in constants_*.js.
const sizeCB = [1, 25, 3];
const sizeV = [1, onnxOutputSize];

// Number of MCTS Simulations per move
// Adjusted for a balance between speed and strength in the browser.
const numMCTSSims = 50;

/* =================== */
/* ===== ANALYTICS === */
/* =================== */

// Preserved logic from original file: Simple hit counter.
const counterAPI_base = 'https://abacus.jasoncameron.dev/hit/cestpasphoto.github.io';
const counterAPI_suffix = new Date().toISOString().slice(2,7).replace('-','');

window.addEventListener('load', () => {
    // Fire and forget fetch for analytics
    const urls = [ 
        `${counterAPI_base}/overall`, 
        `${counterAPI_base}/overall_${counterAPI_suffix}`,
        `${counterAPI_base}/santorini_${counterAPI_suffix}`
    ];
    
    urls.forEach(url => {
        fetch(url, { mode: 'no-cors' }).catch(e => {
            // Silently fail if analytics are blocked
            console.debug("Analytics blocked or failed");
        });
    });
});
/* =================== */
/* =====  CONFIG ===== */
/* =================== */

// Files to be loaded by Pyodide into the virtual file system.
// pyConstantsFileName is defined in constants_*.js (loaded before this file).
const list_of_files = [
  ['splendor/Game.py', 'Game.py'],
  ['splendor/proxy.py', 'proxy.py'], // The new Controller
  ['splendor/MCTS.py', 'MCTS.py'],
  ['splendor/SplendorGame_3pl.py', 'SplendorGame.py'],
  ['splendor/SplendorLogic.py', 'SplendorLogic.py'],
  ['splendor/SplendorLogicNumba.py', 'SplendorLogicNumba.py'],
  [pyConstantsFileName, 'SplendorConstants.py'],
];

// Number of MCTS Simulations per move
// Adjusted for a balance between speed and strength in the browser.
const numMCTSSims = 50;

/* =================== */
/* ===== ANALYTICS === */
/* =================== */

// Preserved logic from original file: Simple hit counter.
const counterAPI_base = 'https://abacus.jasoncameron.dev/hit/cestpasphoto.github.io';
const counterAPI_suffix = new Date().toISOString().slice(2,7).replace('-','');

console.log('disabled analytics');
// window.addEventListener('load', () => {
//     // Fire and forget fetch for analytics
//     const urls = [ 
//         `${counterAPI_base}/overall`, 
//         `${counterAPI_base}/overall_${counterAPI_suffix}`,
//         `${counterAPI_base}/splendor_${counterAPI_suffix}`
//     ];
    
//     urls.forEach(url => {
//         fetch(url, { mode: 'no-cors' }).catch(e => {
//             // Silently fail if analytics are blocked
//             console.debug("Analytics blocked or failed");
//         });
//     });
// });
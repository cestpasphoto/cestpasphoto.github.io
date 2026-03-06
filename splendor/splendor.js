/* =================== */
/* =====  CONFIG ===== */
/* =================== */

// Fichiers Python à charger dans Pyodide
const list_of_files = [
  ['splendor/Game.py', 'Game.py'],
  ['splendor/proxy.py', 'proxy.py'],
  ['splendor/MCTS.py', 'MCTS.py'],
  ['splendor/SplendorLogic.py', 'SplendorLogic.py'],
  ['splendor/SplendorLogicNumba.py', 'SplendorLogicNumba.py'],
  [pyConstantsFileName, 'SplendorGame.py'], // Récupère le SplendorGame_3pl.py
];

// Configuration de l'IA et du jeu (attendue par game.js)
const numMCTSSims = 50; // Ajuste si besoin
const numPlayers = nb_players; // Fait le pont avec ta variable dans constants_3pl.js

/* =================== */
/* =====  CONST  ===== */
/* =================== */

const colors = [
  ["gainsboro"  , "ghostwhite", "black"], // white
  ["dodgerblue" , "mediumblue", "white"], // blue
  ["lightgreen" , "green"     , "white"], // green
  ["tomato"     , "red"       , "white"], // red
  ["dimgray"    , "black"     , "white"], // black
  ["lightyellow", "yellow"    , "black"], // yellow
  ["darkgray"   , "darkgray"  , "black"]  // For noble
];

const tokensCoord = [
  "left: 17%; top: 17%",
  "left: 65%; top: 15%",
  "left: 35%; top: 40%",
  "left: 10%; top: 62%",
  "left: 60%; top: 65%",
];

const nobles_names = [
  "Isabelle of Castile", "Anne of Brittany", "Mary Stuart", "Elisabeth of Austria", 
  "Charles V", "Machiavelli", "Suleiman the Magnificent", "Henry VIII",
  "Francis I", "Catherine of Medici"
];

// Note : nobles_req is kept just in case you use it for tooltips, 
// though the actual requirements checking is fully done in Python now.
const nobles_req = [
  "4[W] 4[B] 4[K]", "3[B] 3[G] 3[R]", "3[R] 3[G] 3[B]", "3[W] 3[B] 3[K]",
  "3[W] 3[R] 3[K]", "4[B] 4[W] 4[R]", "4[B] 4[G] 4[R]", "4[R] 4[B] 4[K]",
  "3[R] 3[W] 3[G]", "3[G] 3[W] 3[B]"
];

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
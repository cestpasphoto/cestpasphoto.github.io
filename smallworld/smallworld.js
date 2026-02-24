/* =================== */
/* =====  CONFIG ===== */
/* =================== */

// Les variables pyConstantsFileName et pyMapsFileName devront 
// être définies dans tes fichiers constants_Xpl.js
const list_of_files = [
  ['smallworld/Game.py', 'Game.py'],
  ['smallworld/proxy.py', 'proxy.py'], // Le nouveau contrôleur
  ['smallworld/MCTS.py', 'MCTS.py'],
  ['smallworld/SmallworldDisplay.py', 'SmallworldDisplay.py'],
  ['smallworld/SmallworldGame.py', 'SmallworldGame.py'],
  ['smallworld/SmallworldLogicNumba.py', 'SmallworldLogicNumba.py'],
  ['smallworld/SmallworldMaps.py', 'SmallworldMaps.py'],
  [pyConstantsFileName, 'SmallworldConstants.py'],
  [pyMapsFileName, 'SmallworldMaps_3pl.py'], // Le nom local importe peu ici, Python l'importe via SmallworldMaps.py
];

// Number of MCTS Simulations per move
// Ajusté pour un bon équilibre vitesse/force dans le navigateur
const numMCTSSims = 50;

/* =================== */
/* ===== UI & VIEW === */
/* =================== */

// Définition du composant Alpine.js local pour l'UI de Smallworld
document.addEventListener('alpine:init', () => {
  Alpine.data('smallworldUI', () => ({
    // Couleurs des territoires des joueurs (J0, J1, J2, J3, J4)
    playerColors: ['#ffb3b3', '#b3d9ff', '#c2f0c2', '#ffffb3', '#e6ccff'],
    
    // Traduction des ID de polygones en points SVG
    getPolyPoints(areaId) {
      if (typeof mapPolys === 'undefined' || typeof mapPoints === 'undefined') return "";
      const polyIndices = mapPolys[areaId];
      if (!polyIndices) return "";
      return polyIndices.map(idx => `${mapPoints[idx][0]},${mapPoints[idx][1]}`).join(' ');
    },

    // Centre du polygone pour afficher le texte
    getCenter(areaId) {
      if (typeof mapCenters === 'undefined') return [0, 0];
      return mapCenters[areaId] || [0, 0];
    },

    // Utilitaires de traduction ID -> Texte
    getPeopleName(id) {
      if (id < 0) return "Inconnu";
      // À ajuster selon l'ordre exact de ton fichier SmallworldConstants.py
      const names = ["Amazones", "Nains", "Elfes", "Goules", "Ratmen", "Squelettes", "Sorciers", "Tritons", "Geants", "Halflings", "Humains", "Orcs", "Trolls"]; 
      return names[id] || `Peuple ${id}`;
    },

    getPowerName(id) {
      if (id < 0) return "Aucun";
      // À ajuster selon l'ordre exact de NOPOWER=0, ALCHEMIST=1, BERSERK=2, etc.
      const names = [
        "Sans Pouvoir", "Alchimistes", "Berserk", "Bivouaquants", "Commandos", 
        "Diplomates", "Maîtres Dragons", "Volants", "Forestiers", "Fortifiés", 
        "Héroïques", "Des Collines", "Marchands", "Montés", "Pillards", 
        "Marins", "Spirituels", "Robustes", "Des Marais", "Des Cavernes", "Monde Souterrain"
      ]; 
      return names[id] || `Pouvoir ${id}`;
    }
  }));
});

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
//         `${counterAPI_base}/smallworld_${counterAPI_suffix}`
//     ];
    
//     urls.forEach(url => {
//         fetch(url, { mode: 'no-cors' }).catch(e => {
//             // Silently fail if analytics are blocked
//             console.debug("Analytics blocked or failed");
//         });
//     });
// });
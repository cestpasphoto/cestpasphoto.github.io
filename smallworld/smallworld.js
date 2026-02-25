/* =================== */
/* =====  CONFIG ===== */
/* =================== */

const list_of_files = [
  ['smallworld/Game.py', 'Game.py'],
  ['smallworld/proxy.py', 'proxy.py'], // Le nouveau contrôleur
  ['smallworld/MCTS.py', 'MCTS.py'],
  ['smallworld/SmallworldDisplay.py', 'SmallworldDisplay.py'],
  ['smallworld/SmallworldGame.py', 'SmallworldGame.py'],
  ['smallworld/SmallworldLogicNumba.py', 'SmallworldLogicNumba.py'],
  ['smallworld/SmallworldMaps.py', 'SmallworldMaps.py'],
  [pyConstantsFileName, 'SmallworldConstants.py'],
  [pyMapsFileName, 'SmallworldMaps.py'],
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
      if (typeof mapAreas === 'undefined' || typeof mapPoints === 'undefined') {
        console.error("CRITICAL DEBUG: mapAreas ou mapPoints est introuvable !");
        console.error("-> Vérifie dans l'onglet 'Réseau' (Network) de la console si 'constants_3pl.js' a bien été chargé ou s'il y a une erreur 404 (chemin incorrect).");
        return "";
      }
      const polyIndices = mapAreas[areaId];
      if (!polyIndices) return "";
      return polyIndices.map(idx => `${mapPoints[idx][0]},${mapPoints[idx][1]}`).join(' ');
    },

    // Couleurs de fond pour les terrains
    // Ordre : Forest, Farmland, Hill, Swamp, Mountain, Water
    getTerrainColor(terrainId) {
      const colors = ['#a5d6a7', '#ffe082', '#ffcc80', '#c5e1a5', '#cfd8dc', '#81d4fa']; 
      return colors[terrainId] || '#e8e8e8';
    },

    // Centre du polygone pour afficher le texte
    getCenter(areaId) {
      if (typeof mapCenters !== 'undefined' && mapCenters[areaId]) return mapCenters[areaId];
      
      // Fallback : on calcule le barycentre mathématique si mapCenters est absent
      const polyIndices = typeof mapAreas !== 'undefined' ? mapAreas[areaId] : null;
      if (!polyIndices || polyIndices.length === 0) return [0, 0];
      
      let x = 0, y = 0;
      for (let idx of polyIndices) {
        x += mapPoints[idx][0];
        y += mapPoints[idx][1];
      }
      return [x / polyIndices.length, y / polyIndices.length];
    },

    // Utilitaires de traduction ID -> Texte
    getPeopleName(id) {
      if (id < 0) return "Inconnu";
      const names = ["-", "Amazones", "Nains", "Elfes", "Goules", "Ratmen", "Squelettes", "Sorciers", "Tritons", "Geants", "Halflings", "Humains", "Orcs", "Trolls"]; 
      return names[id] || `Peuple ${id}`;
    },

    getPowerName(id) {
      if (id < 0) return "Aucun";
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
/* ===== AI TWEAK ==== */
/* =================== */

// Écrase la fonction globale de game.js spécifiquement pour Smallworld
// Permet d'enchaîner les nombreux coups d'un tour sans la pause de 800ms
window.check_ai_turn = async function() {
    const store = Alpine.store('game');
    if (store.gameEnded || store.editMode !== 0) return;
    
    if (!is_nextplayer_human()) {
        // Pause très courte de 50ms au lieu de 800ms
        setTimeout(() => execute_ai_move(), 50); 
    }
}

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
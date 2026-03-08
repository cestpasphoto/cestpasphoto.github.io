/* ========================================================================= */
/* ===== DICTIONNAIRES & COULEURS (Récupérés de ton code original)     ===== */
/* ========================================================================= */

const ppl_str       = [' ', 'amazon','dwarf','elf','ghoul','giant','halfling','human','orc','ratman','skeleton','sorcerer','triton','troll','wizard', 'lost_tribe'];
const ppl_short_str = [' ', 'a'     ,'d'    ,'e'  ,'g'    ,'i'    ,'h'       ,'u'    ,'c'  ,'r'     ,'k'       ,'s'       ,'t'     ,'l'    ,'w'     , '古'];
const pwr_str       = [' ','alchemist','berserk','bivouacking','commando','diplomat','dragonmaster','flying','forest','fortified','heroic','hill','merchant','mounted','pillaging','seafaring','spirit','stout','swamp','underworld','wealthy'];

const terrains_col = [
  ['#99e69c'  ,  '#2db931' ],  // FORESTT
  ['#f6e5ac'  ,  '#e9c03a' ],  // FARMLAND
  ['#d1f6ac'  ,  '#9eec51' ],  // HILLT
  ['#f6c5ac'  ,  '#e9743a' ],  // SWAMPT
  ['#e6e6e6'  ,  '#a6a6a6' ],  // MOUNTAIN
  ['#acedf6'  ,  '#3ad5e9' ],  // WATER
];

const pplColors = [
  ['#8caef2', '#477eeb', '#bacff7'], // Player 0 (Blue)
  ['#b580ff', '#83f'   , '#d2b3ff'], // Player 1 (Purple)
  ['darkorange', 'orangered', 'lightsalmon'], // Player 2 (Orange)
  ['#f186f9', '#e93df5', '#f7b6fb'], // Extra (Pink)
];


/* ========================================================================= */
/* ===== ALGORITHME GÉOMÉTRIQUE (Ton code original pour la carte)      ===== */
/* ========================================================================= */

function _miscPolygonComputations(points) {
  let sumX = 0, sumY = 0, totalArea = 0;
  let maxX = 0, maxY = 0, minX = 999, minY = 999;

  for (let i = 0; i < points.length; i++) {
    const [x1, y1] = points[i];
    const [x2, y2] = points[(i + 1) % points.length];
    const triangleArea = (x1 * y2 - x2 * y1);
    
    sumX += (x1 + x2) * triangleArea;
    sumY += (y1 + y2) * triangleArea;
    totalArea += triangleArea;

    minX = Math.min(minX, x1); maxX = Math.max(maxX, x1);
    minY = Math.min(minY, y1); maxY = Math.max(maxY, y1);
  }

  const baryX = sumX / (3 * totalArea);
  const baryY = sumY / (3 * totalArea);

  const shiftX = 6, shiftY = 4;
  let areas = [];
  if ((maxX-minX) > 1.5*(maxY-minY)) {
    areas = [ [baryX-shiftX, baryY], [baryX, baryY], [baryX+shiftX, baryY] ];
  } else if ((maxY-minY) > 1.5*(maxX-minX)) {
    areas = [ [baryX, baryY-shiftY], [baryX, baryY], [baryX, baryY+shiftY] ];
  } else {
    areas = [ [baryX-shiftX/2, baryY-shiftY/2], [baryX+shiftX/2, baryY-shiftY/2], [baryX, baryY+shiftY/2] ];
  }

  const erosionR = 1.0;
  for (const point of points) {
    const vectorToCenter = [baryX-point[0], baryY-point[1]];
    const vectorLength = Math.sqrt(vectorToCenter[0]*vectorToCenter[0]+vectorToCenter[1]*vectorToCenter[1]);
    const newPoint = [point[0] + erosionR*vectorToCenter[0]/vectorLength, point[1] + erosionR*vectorToCenter[1]/vectorLength];
    areas.push(newPoint);
  }
  return areas;
}


/* ========================================================================= */
/* ===== HELPERS ALPINE.JS (Interface Vue <-> Python)                  ===== */
/* ========================================================================= */

function ui_raceName(id) { return ppl_str[id] || 'Unknown'; }
function ui_powerName(id) { return pwr_str[id] || ''; }
function ui_playerColorClass(pIdx) { return ['blue', 'purple', 'orange', 'pink'][pIdx] || 'grey'; }

function ui_findPlayerFromPpl(pplId) {
    if (pplId === 0 || pplId === -15) return -1;
    const absId = Math.abs(pplId);
    const players = Alpine.store('game').view.players;
    if (!players) return -1;
    for (let pIdx = 0; pIdx < players.length; pIdx++) {
        for (let ppl of players[pIdx].peoples) {
            if (Math.abs(ppl[1]) === absId) return pIdx;
        }
    }
    return -1;
}

// --- Carte et Formes ---
function ui_polyStr(aIdx) {
  if (typeof mapAreas === 'undefined' || !mapAreas[aIdx]) return '';
  let pts = mapAreas[aIdx].map(pIdx => mapPoints[pIdx]);
  let computed = _miscPolygonComputations(pts);
  let str = "";
  for(let i=3; i<computed.length; i++) { // L'érosion commence à l'index 3
    str += computed[i][0] + "," + computed[i][1] + " ";
  }
  return str;
}

function ui_areaColor(area) { return terrains_col[area[3]][0]; }
function ui_areaStroke(aIdx) { return ui_isAreaClickable(aIdx) ? 'red' : 'rgba(0,0,0,0.1)'; }
function ui_areaStrokeWidth(aIdx) { return ui_isAreaClickable(aIdx) ? 1.0 : 0.5; }

function ui_areaDasharray(aIdx) {
   const extra = Alpine.store('game').extra;
   if (extra && extra.selectedBtn === 0 && extra.needDice && extra.needDice[aIdx]) return "1";
   return "none";
}

// --- Coordonnées des éléments (tirées de ton tableau elementsCoord) ---
function ui_tokenPos(aIdx) { return {x: elementsCoord[aIdx][0], y: elementsCoord[aIdx][1]}; }
function ui_defensePos(aIdx) { return {x: elementsCoord[aIdx][2], y: elementsCoord[aIdx][3]}; }
function ui_territoryPos(aIdx) { return {x: elementsCoord[aIdx][4], y: elementsCoord[aIdx][5]}; }

function ui_terrainSymbols(area) {
   let pow = area[4]; // [cavern, magic, mine]
   let res = '';
   if (pow[0]) res += '⌘ ';
   if (pow[1]) res += '☆ ';
   if (pow[2]) res += '⏚ ';
   return res;
}

function ui_defenseSvg(area) {
    let defense = area[2], terrain = area[3];
    if (defense <= 0 && terrain !== 4) return '';
    let result = '';
    
    if (defense === 1 && terrain === 4) { // Montagne
        result = '<path d="M13 14L17 9L22 18H2.84444C2.46441 18 2.2233 17.5928 2.40603 17.2596L10.0509 3.31896C10.2429 2.96885 10.7476 2.97394 10.9325 3.32786L15.122 11.3476" stroke="black" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"/>';
    } else if (defense >= 20) { // Immunité totale
        result = '<text x="12" y="12" text-anchor="middle" dominant-baseline="central" font-size="14" font-weight="bolder" fill="black">⦸</text>';
    } else { // Bouclier
        result = '<path d="M20 6C20 6 19.1843 6 19.0001 6C16.2681 6 13.8871 4.93485 11.9999 3C10.1128 4.93478 7.73199 6 5.00009 6C4.81589 6 4.00009 6 4.00009 6C4.00009 6 4 8 4 9.16611C4 14.8596 7.3994 19.6436 12 21C16.6006 19.6436 20 14.8596 20 9.16611C20 8 20 6 20 6Z" stroke="black" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"/><text x="12" y="12" text-anchor="middle" dominant-baseline="central" font-size="14" font-weight="bolder" fill="black">' + defense + '</text>';
    }
    return '<svg width="6" height="6" viewBox="0 0 24 24" fill="none">' + result + '</svg>';
}

function ui_tokenStyle(pplId) {
   if (pplId === 0) return { bg: 'none', txt: 'none', char: '' };
   if (pplId === -15) return { bg: '#f2f2f2', txt: 'dimgray', char: ppl_short_str[15] }; // Tribu oubliée en déclin
   
   let absId = Math.abs(pplId);
   let pIdx = ui_findPlayerFromPpl(pplId);
   
   let char = ppl_short_str[absId].toUpperCase();
   if (pplId < 0) char = char.toLowerCase();
   
   let bg = pplId < 0 ? '#f7f7f7' : (pplColors[pIdx] ? pplColors[pIdx][1] : 'gray');
   let txt = pplId < 0 ? (pplColors[pIdx] ? pplColors[pIdx][1] : 'gray') : 'white';
   
   return { bg, txt, char };
}

// --- Clics et Historique ---
function ui_isAreaClickable(aIdx) {
  const extra = Alpine.store('game').extra;
  if (!extra || !extra.validMoves) return false;
  let step = extra.selectedBtn;
  if (step === 0) return extra.validMoves[30 + aIdx];   // Attack
  if (step === 1) return extra.validMoves[60 + aIdx];   // Use Ppl
  if (step === 2) return extra.validMoves[90 + aIdx];   // Use Power
  if (step === 4) return extra.validMoves[128 + aIdx];  // Deploy 1
  if (step === 8) return extra.validMoves[aIdx];        // Abandon
  return false;
}

function ui_hasPreviousMove(aIdx) {
  const extra = Alpine.store('game').extra;
  return extra?.previousMoves?.some(m => m[0] === aIdx) || false;
}

function ui_previousMoveColor(aIdx) {
  const extra = Alpine.store('game').extra;
  let moves = extra.previousMoves.filter(m => m[0] === aIdx);
  if (moves.length === 0) return 'transparent';
  let move = moves[moves.length - 1]; 
  if (!move[2]) return '#db2828'; // Failed attack -> red
  if (move[1] === 0) return '#21ba45'; // Attack success -> green
  if (move[1] === 1 || move[1] === 4) return '#2185d0'; // Use ppl/deploy -> blue
  if (move[1] === 2) return '#a333c8'; // Power -> purple
  if (move[1] === 8) return '#f2711c'; // Abandon -> orange
  return 'white';
}

function ui_roundDisplay() {
  const view = Alpine.store('game').view;
  if (!view || !view.round) return '';
  let round = view.round;
  let html = '';
  for(let i=1; i<=10; i++) {
    if(i === round) html += `<div class="ui black label">${i}</div>`;
    else if(i > round) html += `<div class="ui basic grey label">${i}</div>`;
    else html += `<div class="ui disabled grey label">${i}</div>`;
  }
  return html;
}

function ui_btnClass(btnIdx, defaultColor) {
  const extra = Alpine.store('game').extra;
  if (!extra) return 'disabled';
  if (extra.selectedBtn === btnIdx) return defaultColor;
  if (extra.allowedBtns && extra.allowedBtns[btnIdx]) return `basic ${defaultColor}`;
  return 'disabled';
}

function ui_deckBtnClass(dIdx) {
  const extra = Alpine.store('game').extra;
  if (!extra || !extra.validMoves) return 'disabled';
  let action = 158 + dIdx;
  if (extra.selectedBtn === 5 && extra.validMoves[action]) return 'blue';
  if (!extra.validMoves[action]) return 'disabled';
  return 'basic blue';
}

function ui_deckDescr(deckItem) {
  if (!deckItem || deckItem[0] === 0) return "<i>Empty</i>";
  let pplName = ui_raceName(deckItem[0]);
  let pwrName = ui_powerName(deckItem[1]);
  let coins = deckItem[3]; 
  let html = `<span class="ui small text"><b>${pplName}</b> ${pwrName}</span>`;
  if (coins > 0) html += ` <span class="ui circular small label">${coins} <i class="coins icon"></i></span>`;
  return html;
}
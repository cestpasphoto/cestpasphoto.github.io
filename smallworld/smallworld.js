/* ========================================================================= */
/* ===== CONFIGURATION                                                 ===== */
/* ========================================================================= */

const numMCTSSims = 25;

/* ========================================================================= */
/* ===== DICTIONNAIRES & TEXTES                                        ===== */
/* ========================================================================= */

const actionsDescr = [
  'Attack one of the highlighted areas (dash means dice needed)', // "attackBtn" 0
  'Chose one area on which apply the ability of your people', // "usePplBtn" 1
  'Chose one area on which apply the power of your people',   // "usePwrBtn" 2
  'Confirm to gather your people before redeploy',            // "startDplBtn"  3
  'Chose one area to redeploy 1 people on',                   // "deploy1Btn" 4
  'Chose your people + power in deck',                        // "choseBtn" 5
  'Confirm to end your turn',                                 // "endTurnBtn" 6
  'Confirm no redeploy of your people',                       // "noDeployBtn" 7
  'Chose one area to abandon',                                // "abandonBtn" 8
  'Confirm to decline your people',                           // "declineBtn" 9
  'Install lost tribe and start game',                        // "startBtn" 10
];

const ppl_str       = [' ', 'amazon','dwarf','elf','ghoul','giant','halfling','human','orc','ratman','skeleton','sorcerer','triton','troll','wizard', 'lost_tribe'];
const ppl_short_str = [' ', 'a'     ,'d'    ,'e'  ,'g'    ,'i'    ,'h'       ,'u'    ,'c'  ,'r'     ,'k'       ,'s'       ,'t'     ,'l'    ,'w'     , '古'];
const pwr_str = [' ','alchemist','berserk','bivouacking','commando','diplomat','dragonmaster','flying','forest','fortified','heroic','hill','merchant','mounted','pillaging','seafaring','spirit','stout','swamp','underworld','wealthy'];

const terrains_col = [
  ['#99e69c'  ,  '#2db931' ],  // FORESTT
  ['#f6e5ac'  ,  '#e9c03a' ],  // FARMLAND
  ['#d1f6ac'  ,  '#9eec51' ],  // HILLT
  ['#f6c5ac'  ,  '#e9743a' ],  // SWAMPT
  ['#e6e6e6'  ,  '#a6a6a6' ],  // MOUNTAIN
  ['#acedf6'  ,  '#3ad5e9' ],  // WATER
];

const terrains_symb = ['⌘', '☆', '⏚'];

function formatArea(areaName) {
  if (areaName == 'forest') return '<span style="color: ' + terrains_col[0][1] + '"><b>forest</b></span>';
  if (areaName == 'farmland') return '<span style="color: ' + terrains_col[1][1] + '"><b>farmland</b></span>';
  if (areaName == 'hill') return '<span style="color: ' + terrains_col[2][1] + '"><b>hill</b></span>';
  if (areaName == 'swamp') return '<span style="color: ' + terrains_col[3][1] + '"><b>swamp</b></span>';
  if (areaName == 'mountain') return '<span style="color: ' + terrains_col[4][1] + '"><b>mountain</b></span>';
  if (areaName == 'water') return '<span style="color: ' + terrains_col[5][1] + '"><b>water</b></span>';
  if (areaName == 'cavern') return '<span>' + terrains_symb[0] + '</span>';
  if (areaName == 'magic') return '<span>' + terrains_symb[1] + '</span>';
  if (areaName == 'mine') return '<span>' + terrains_symb[2] + '</span>';
}

const pplDescr = [
  'No people',
  '+4 <i class="user icon"></i> during attack',
  '+1 <i class="coins icon"></i> for each ' + formatArea('mine') + ' occupied, even in decline',
  'Do not discard 1 <i class="user icon"></i> when attacked',
  'In decline, <i class="users icon"></i> arent discarded and can even play',
  '-1 <i class="user icon"></i> when attacking a ' + formatArea('mountain'),
  'Can start anywhere, receive immunity ⦸ on 2 first regions until abandoned or decline',
  '+1 <i class="coins icon"></i> for each ' + formatArea('farmland') + ' occupied',
  '+1 <i class="coins icon"></i> for each attacked non-empty area',
  'They are numerous',                                                           
  '+1 <i class="user icon"></i> for every 2 attacked non-empty areas',           
  'Replace a single active neighbour enemy by new sorcerer',                     
  'Need -1 <i class="user icon"></i> when attacking a area neighbour to ' + formatArea('water'), 
  '+1 defense ⛨ on each owned area, even in decline',                            
  '+1 <i class="coins icon"></i> for each ' + formatArea('magic') + ' occupied', 
]

const pwrDescr = [
  'No power',                                                               
  '+2 <i class="coins icon"></i> at each round',                            
  'Roll die before each attack',                                            
  '5 defenses ⛨ to place every turn, also immunising against sorcerer',     
  'Need -1 <i class="user icon"></i> when attacking',                       
  'Peace with an enemy people at end of turn, if you havent attacked them', 
  'Can conqueer an area with a dragon, which gives immunity ⦸',            
  'All areas are neighbour',                                                
  '+1 <i class="coins icon"></i> for each ' + formatArea('forest') + ' occupied', 
  'Can place 1 fortress per turn up to 6, giving +1 <i class="coins icon"></i> when active and +1 defense always', 
  '2 defenses ⛨ to place every turn, giving full immunity ⦸',              
  '+1 <i class="coins icon"></i> for each ' + formatArea('hill') + ' occupied', 
  '+1 <i class="coins icon"></i> for each area occupied',                   
  'Need -1 <i class="user icon"></i> when attacking a ' + formatArea('hill') + ' or ' + formatArea('farmland'), 
  '+1 <i class="coins icon"></i> for each attacked non-empty area',         
  'Only ones allowed to attack ' + formatArea('water') + ' areas',          
  'Can be 2 different ppl in decline, spirits never disappear',             
  'Can decline at end of the turn',                                         
  '+1 <i class="coins icon"></i> for each ' + formatArea('swamp') + ' occupied', 
  '-1 <i class="coins icon"></i> when attacking  a ' + formatArea('cavern'),
  '+7 <i class="coins icon"></i> after first turn',                         
];

const pplColors = [
  ['#8caef2', '#477eeb', '#bacff7'], // Player 0 (Blue) -> [decline2, active, decline1]
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
  if ((maxX-minX) > 1.5*(maxY-minY)) areas = [ [baryX-shiftX, baryY], [baryX, baryY], [baryX+shiftX, baryY] ];
  else if ((maxY-minY) > 1.5*(maxX-minX)) areas = [ [baryX, baryY-shiftY], [baryX, baryY], [baryX, baryY+shiftY] ];
  else areas = [ [baryX-shiftX/2, baryY-shiftY/2], [baryX+shiftX/2, baryY-shiftY/2], [baryX, baryY+shiftY/2] ];

  const erosionR = 1.0;
  for (const point of points) {
    const vectorToCenter = [baryX-point[0], baryY-point[1]];
    const vectorLength = Math.sqrt(vectorToCenter[0]*vectorToCenter[0]+vectorToCenter[1]*vectorToCenter[1]);
    const newPoint = [point[0] + erosionR*vectorToCenter[0]/vectorLength, point[1] + erosionR*vectorToCenter[1]/vectorLength];
    areas.push(newPoint);
  }
  return areas;
}

function _bitfieldToBits(n) { return Array.from({ length: 8 }, (_, i) => !!(n & (1 << (7 - i)))); }
function _bitfieldToTrue(n) {
  const bitsArray = _bitfieldToBits(n);
  return bitsArray.reduce((out, bool, index) => bool ? out.concat(index) : out, []);
}

/* ========================================================================= */
/* ===== HELPERS ALPINE.JS (Interface Vue <-> Python)                  ===== */
/* ========================================================================= */

// --- Conversion de données ---
function ui_findPlayerFromPpl(pplId) {
    if (pplId === 0 || pplId === -15) return {pIdx: -1, pplIdx: -1};
    const absId = Math.abs(pplId);
    const players = Alpine.store('game').view.players;
    if (!players) return {pIdx: -1, pplIdx: -1};
    for (let pIdx = 0; pIdx < players.length; pIdx++) {
        for (let idx = 0; idx < players[pIdx].peoples.length; idx++) {
            if (Math.abs(players[pIdx].peoples[idx][1]) === absId) return {pIdx, pplIdx: idx};
        }
    }
    return {pIdx: -1, pplIdx: -1};
}

function ui_tokenStyle(pplId, pIdx, pplIdx) {
   if (pplId === 0) return { bg: 'none', txt: 'none' };
   if (pplId === -15) return { bg: '#f2f2f2', txt: 'dimgray' };
   
   let cIdx = (pplIdx === 2) ? 0 : (pplIdx === 1 ? 1 : 2);
   let bg = pplId < 0 ? '#f7f7f7' : (pplColors[pIdx] ? pplColors[pIdx][cIdx] : 'gray');
   let txt = pplId < 0 ? (pplColors[pIdx] ? pplColors[pIdx][cIdx] : 'gray') : 'white';
   return { bg, txt };
}

function ui_toLongString(data, showNumber = true) {
  let nb = data[0], ppl = data[1], power = data[2];
  if (ppl == 0) return '';
  else if (ppl > 0) return (showNumber ? nb + ' ' : '') + ppl_str[ppl] + ' + ' + pwr_str[power];
  else return (showNumber ? nb + ' ' : '') + ppl_str[-ppl] + ' <i class="skull crossbones icon"></i>';
}

function ui_toDetailString(data) {
  let ppl = data[1], power = data[2], pplDetails = data[3], pwrDetails = data[4];
  let result = '';
  if (ppl == 1 && pplDetails > 0) result += pplDetails + ' <i class="users icon"></i> loaned. ';
  else if (ppl == 6 && pplDetails > 0) result += pplDetails + ' ⛨ remaining. ';
  else if (ppl == 11) {
    const players = _bitfieldToTrue(pplDetails);
    if (players.length > 0) result += 'Other player sorcerized. ';
  }

  if (power == 2 && pwrDetails >= 2**6) result += 'Dice is ' + (pwrDetails-2**6) + '. ';
  else if (power == 5) {
    if (pwrDetails >= 2**6) {
      const players = _bitfieldToTrue(pwrDetails-2**6);
      if (players.length > 0) result += 'Cant use diplomacy with other player.';
    } else if (pwrDetails > 0) {
      result += 'Ongoing diplomacy with other player.';
    }
  } else if ([3, 9, 10].includes(power) && pwrDetails > 0) {
    result += (pwrDetails % 2**6) + ' ⛨ remaining. ';
  }
  return result;
}

function ui_toDescr(nb, ppl, power) {
  let result = pplDescr[Math.abs(ppl)] + ' ; ';
  result += ppl > 0 ? pwrDescr[power] : pwrDescr[0];
  return result;
}

// --- Player State Info ---
function ui_isCurrentPpl(pIdx, pplIdx) {
  const info = Alpine.store('game').view.currentPlayerInfo;
  return info[0] === pIdx && info[1] === pplIdx;
}

function ui_displayDiplomacyBtn(pIdx, pplIdx) {
  const store = Alpine.store('game');
  if (!store.extra || !store.extra.selectingDiplomacy) return false;
  const curPlayPpl = store.view.currentPlayerInfo;
  const relativePly = (pIdx - curPlayPpl[0] + numPlayers) % numPlayers;
  return (relativePly !== 0) && (pplIdx === 2) && store.extra.validMoves[90 + relativePly];
}

function ui_diplomacyClick(pIdx) {
  const curPlayPpl = Alpine.store('game').view.currentPlayerInfo;
  const relativePly = (pIdx - curPlayPpl[0] + numPlayers) % numPlayers;
  Alpine.store('game').act('click_area', relativePly);
}

function ui_hasDeclined() {
  const extra = Alpine.store('game').extra;
  return extra?.previousMoves?.some(m => m[0] === -1) || false;
}

// --- Carte et Formes ---
function ui_polyStr(aIdx) {
  if (typeof mapAreas === 'undefined' || !mapAreas[aIdx]) return '';
  let pts = mapAreas[aIdx].map(pIdx => mapPoints[pIdx]);
  let computed = _miscPolygonComputations(pts);
  let str = "";
  for(let i=3; i<computed.length; i++) str += computed[i][0] + "," + computed[i][1] + " ";
  return str;
}

function ui_areaColor(area) { return terrains_col[area[3]][0]; }
const strokeColors = ['#016936', '#0E6EB8', '#0E6EB8', '#FF1493', '#FF1493', '#0E6EB8', '#0E6EB8', '#0E6EB8', '#DB2828', '#0E6EB8', '#0E6EB8'];
function ui_areaStroke(aIdx) { 
  const extra = Alpine.store('game').extra;
  if (!ui_isAreaClickable(aIdx)) return 'transparent'; // <- Transparent au lieu de grisâtre
  return (extra && extra.selectedBtn >= 0) ? strokeColors[extra.selectedBtn] : 'black';
}
function ui_areaStrokeWidth(aIdx) { return ui_isAreaClickable(aIdx) ? 0.5 : 0; }
function ui_areaDasharray(aIdx) {
   const extra = Alpine.store('game').extra;
   if (extra && extra.selectedBtn === 0 && extra.needDice && extra.needDice[aIdx]) return "1";
   return "none";
}

function ui_tokenPos(aIdx) { return {x: elementsCoord[aIdx][0], y: elementsCoord[aIdx][1]}; }
function ui_defensePos(aIdx) { return {x: elementsCoord[aIdx][2], y: elementsCoord[aIdx][3]}; }
function ui_territoryPos(aIdx) { return {x: elementsCoord[aIdx][4], y: elementsCoord[aIdx][5]}; }

function ui_terrainSymbols(area) {
   let pow = area[4];
   let res = '';
   if (pow[0]) res += terrains_symb[0] + ' ';
   if (pow[1]) res += terrains_symb[1] + ' ';
   if (pow[2]) res += terrains_symb[2] + ' ';
   return res;
}

function ui_defenseSvg(area) {
    let defense = area[2], terrain = area[3];
    if (defense <= 0 && terrain !== 4) return '';
    let result = '';
    if (defense === 1 && terrain === 4) {
        result = '<path d="M13 14L17 9L22 18H2.84444C2.46441 18 2.2233 17.5928 2.40603 17.2596L10.0509 3.31896C10.2429 2.96885 10.7476 2.97394 10.9325 3.32786L15.122 11.3476" stroke="black" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"/>';
    } else if (defense >= 20) {
        result = '<text x="12" y="12" text-anchor="middle" dominant-baseline="central" font-size="14" font-weight="bolder" fill="black">⦸</text>';
    } else {
        result = '<path d="M20 6C20 6 19.1843 6 19.0001 6C16.2681 6 13.8871 4.93485 11.9999 3C10.1128 4.93478 7.73199 6 5.00009 6C4.81589 6 4.00009 6 4.00009 6C4.00009 6 4 8 4 9.16611C4 14.8596 7.3994 19.6436 12 21C16.6006 19.6436 20 14.8596 20 9.16611C20 8 20 6 20 6Z" stroke="black" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"/><text x="12" y="12" text-anchor="middle" dominant-baseline="central" font-size="14" font-weight="bolder" fill="black">' + defense + '</text>';
    }
    return '<svg width="6" height="6" viewBox="0 0 24 24" fill="none">' + result + '</svg>';
}

// --- Clics et Historique ---
function ui_isAreaClickable(aIdx) {
  const extra = Alpine.store('game').extra;
  if (!extra || !extra.validMoves) return false;
  let step = extra.selectedBtn;
  if (step === 0) return extra.validMoves[30 + aIdx];   
  if (step === 1) return extra.validMoves[60 + aIdx];   
  if (step === 2) return extra.validMoves[90 + aIdx];   
  if (step === 4) return extra.validMoves[128 + aIdx];  
  if (step === 8) return extra.validMoves[aIdx];        
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
  
  let mainType = Math.min(...moves.map(m => m[1]));
  
  // N'évaluer l'échec que s'il s'agissait d'une attaque (Type 0)
  if (mainType === 0) {
      let hasSuccess = moves.some(m => m[1] === mainType && m[2] === true);
      if (!hasSuccess) mainType = -1;
  }
  
  if (mainType < 0) return 'gray';
  return strokeColors[mainType] || 'white';
}

// --- Textes et Boutons UI ---
function ui_actionDescr() {
  const extra = Alpine.store('game').extra;
  if (!extra || extra.selectedBtn < 0) return '';
  return actionsDescr[extra.selectedBtn] || '';
}

function ui_roundDisplay() {
  const view = Alpine.store('game').view;
  if (!view || !view.round) return '';
  let round = view.round;
  let html = '';
  for(let i=1; i<=nbTurns; i++) {
    if(i === round) html += `<div class="ui black label">${i}</div>`;
    else if(i > round) html += `<div class="ui basic grey label">${i}</div>`;
    else html += `<div class="ui disabled grey label">${i}</div>`;
  }
  return html;
}

const btnColors = ['green', 'blue', 'blue', 'pink', 'pink', 'blue', 'blue', 'blue', 'red', 'blue', 'blue'];
function ui_btnClass(btnIdx) {
  const extra = Alpine.store('game').extra;
  if (!extra) return '';
  return extra.selectedBtn === btnIdx ? btnColors[btnIdx] : '';
}

function ui_isDeckDisabled() {
  const extra = Alpine.store('game').extra;
  if (!extra) return true;
  if (extra.selectedBtn >= 0 && extra.selectedBtn !== 5) return true;
  return false;
}

function ui_deckDescrLong(deckInfo) {
  if (!deckInfo || deckInfo[0] === 0) return "-";
  let descr = ui_toLongString(deckInfo);
  if (deckInfo[3] > 0) descr += " + " + deckInfo[3] + '<i class="coins icon"></i>';
  
  const store = Alpine.store('game');
  if (store && store.showDetails) {
    descr += '<br><span class="ui small text">' + ui_toDescr(deckInfo[0], deckInfo[1], deckInfo[2]) + '</span>';
  }
  return descr;
}
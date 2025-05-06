// Import common/game.js before this file

/* =================== */
/* =====  CONST  ===== */
/* =================== */


const list_of_files = [
  ['smallworld/Game.py'                , 'Game.py'],
  ['smallworld/proxy.py'               , 'proxy.py'],
  ['smallworld/MCTS.py'                , 'MCTS.py'],
  ['smallworld/SmallworldDisplay.py'   , 'SmallworldDisplay.py'],
  ['smallworld/SmallworldGame.py'      , 'SmallworldGame.py'],
  ['smallworld/SmallworldConstants.py' , 'SmallworldConstants.py'],
  ['smallworld/SmallworldLogicNumba.py', 'SmallworldLogicNumba.py'],
  ['smallworld/SmallworldMaps.py'      , 'SmallworldMaps.py'],
  ['smallworld/SmallworldMaps_2pl.py'  , 'SmallworldMaps_2pl.py'],
  ['smallworld/SmallworldMaps_3pl.py'  , 'SmallworldMaps_3pl.py'],
  ['smallworld/SmallworldMaps_4pl.py'  , 'SmallworldMaps_4pl.py'],
];

const defaultModelFileName = 'smallworld/model_4pl.onnx';
const nbAreas = 39;
const nb_players = 4;
const sizeCB = [1, nbAreas + 5*nb_players + 6+1, 8];
const sizeV = [1, 5*nbAreas + 8 + 6 + 2];

/* =================== */
/* =====  UTILS  ===== */
/* =================== */

const buttonInfos = [
  // button     range of moveID  HTMLcolor FomanticColor  confirmation needed
  ["attackBtn"  ,   nbAreas      , 2*nbAreas-1    , '#016936',   'green',     false],
  ["usePplBtn"  , 2*nbAreas      , 3*nbAreas-1    , '#0E6EB8',   'blue',      false],
  ["usePwrBtn"  , 3*nbAreas      , 4*nbAreas-1    , '#0E6EB8',   'blue',      false],
  ["startDplBtn", 5*nbAreas+8+6+2, 5*nbAreas+8+6+2, '#FF1493',   'pink',      true ],
  ["deploy1Btn" , 4*nbAreas+8    , 5*nbAreas+8-1  , '#FF1493',   'pink',      false],
  ["choseBtn"   , 5*nbAreas+8    , 5*nbAreas+8+6-1, '#0E6EB8',   'blue',      false],
  ["endTurnBtn" , 5*nbAreas+8+6+1, 5*nbAreas+8+6+1, '#0E6EB8',   'blue',      true ],
  ["noDeployBtn", 4*nbAreas      , 4*nbAreas      , '#0E6EB8',   'blue',      true ],
  ["abandonBtn" ,               0,   nbAreas-1    , '#DB2828',   'red',       false],
  ["declineBtn" , 5*nbAreas+8+6  , 5*nbAreas+8+6  , '#0E6EB8',   'blue',      true ],
  ["startBtn"   , 5*nbAreas+8+6+3, 5*nbAreas+8+6+3, '#0E6EB8',   'blue',      false],
  // deployN 121-127 not proposed
];

const actionsDescr = [
  'Attack one of the highlighted areas (dash means dice needed)', // "attackBtn"
  'Chose one area on which apply the ability of your people', // "usePplBtn"
  'Chose one area on which apply the power of your people',   // "usePwrBtn"
  'Confirm to gather your people before redeploy',            // "startDplBtn"  
  'Chose one area to redeploy 1 people on',                   // "deploy1Btn"
  'Chose your people + power in deck',                        // "choseBtn"
  'Confirm to end your turn',                                 // "endTurnBtn"
  'Confirm no redeploy of your people',                       // "noDeployBtn"
  'Chose one area to abandon',                                // "abandonBtn"
  'Confirm to decline your people',                           // "declineBtn"
  'Install lost tribe and start game',                        // "startBtn"
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

const terrains_symb = [
  '⌘', // cavern
  '☆', // magic ★
  '⏚', // mine
];

const mapPoints = [
  [30, 130], // A_1
  [90, 100], // A_2
  [120, 80], // A_3
  [50, 80], // B_1
  [90, 80], // B_2
  [120, 70], // B_3
  [0, 0], // C
  [40, 60], // C_1
  [90, 70], // C_2
  [120, 50], // C_3
  [10, 10], // D
  [50, 60], // D_1
  [90, 50], // D_2
  [140, 0], // D_3
  [30, 10], // E
  [50, 40], // E_1
  [90, 40], // E_2
  [140, 10], // E_3
  [30, 20], // F
  [50, 30], // F_1
  [80, 40], // F_2
  [140, 30], // F_3
  [40, 20], // G_1
  [80, 50], // G_2
  [140, 50], // G_3
  [10, 40], // H
  [50, 10], // H_1
  [80, 30], // H_2
  [140, 60], // H_3
  [10, 60], // I
  [50, 0], // I_1
  [100, 10], // I_2
  [140, 90], // I_3
  [30, 40], // J
  [80, 0], // J_1
  [120, 20], // J_2
  [140, 100], // J_3
  [30, 30], // K
  [70, 20], // K_1
  [120, 0], // K_2
  [140, 130], // K_3
  [0, 70], // L
  [70, 30], // L_1
  [100, 30], // L_2
  [30, 50], // L_3
  [10, 70], // M
  [60, 40], // M_1
  [120, 30], // M_2
  [30, 60], // M_3
  [30, 70], // N
  [70, 60], // N_1
  [110, 50], // N_2
  [30, 80], // O
  [70, 70], // O_1
  [100, 70], // O_2
  [0, 90], // P
  [60, 80], // P_1
  [100, 90], // P_2
  [30, 90], // Q
  [60, 90], // Q_1
  [110, 70], // Q_2
  [20, 100], // R
  [80, 90], // R_1
  [120, 90], // R_2
  [0, 110], // S
  [70, 100], // S_1
  [100, 110], // S_2
  [0, 130], // T
  [70, 120], // T_1
  [110, 110], // T_2
  [10, 130], // U
  [60, 110], // U_1
  [110, 130], // U_2
  [20, 110], // V
  [60, 130], // V_1
  [120, 130], // V_2
  [40, 100], // W
  [100, 130], // W_1
  [130, 110], // W_2
  [40, 110], // Z
  [90, 120], // Z_1
  [120, 100], // Z_2
];

const mapAreas = [
  [30,6,41,45,29,25,10,14,18,37,22,26], // poly1
  [41,45,49,52,55], // poly2
  [55,52,58,61,64], // poly3
  [64,61,73,70,67], // poly4
  [25,18,14,10], // poly5
  [25,29,33,37,18], // poly6
  [29,33,44,48,49,45], // poly7
  [70,73,76,79,0], // poly8
  [44,15,19,22,37,33], // poly9
  [44,15,46,11,7,48], // poly10
  [48,7,3,58,52,49], // poly11
  [58,3,56,59,76,73,61], // poly12
  [79,71,74,0], // q1
  [26,38,42,19,22], // poly13
  [11,50,53,56,3,7], // poly14
  [30,26,38,34], // q2
  [46,23,50,11], // q3
  [59,62,65,68,71,79,76], // poly15
  [19,15,46,23,20,27,42], // poly16
  [53,4,62,59,56], // poly17
  [68,80,77,74,71], // poly18
  [38,34,39,31,27,42], // poly19
  [20,16,12,8,4,53,50,23], // poly20
  [8,54,57,66,1,65,62,4], // poly21
  [65,1,80,68], // q4
  [27,31,35,43,16,20], // poly22
  [43,47,51,12,16], // poly23
  [12,51,9,60,54,8], // poly24
  [66,69,72,77,80,1], // poly25
  [39,13,17,35,31], // poly26
  [35,17,21,47,43], // poly27
  [60,5,2,63,57,54], // poly28
  [63,81,69,66,57], // poly29
  [47,21,24,9,51], // poly30
  [24,9,60,5,28], // poly31
  [69,81,78,75,72], // poly32
  [5,28,32,2], // q5
  [2,32,36,78,81,63], // poly33
  [78,36,40,75], // q6
];


const elementsCoord = [
  // mainX, mainY, defenseX, defenseY, territoryX, territoryY
  [5, 5, 5, 10, 5, 15],
  [5, 75, 5, 80, 10, 75],
  [5, 94, 5, 99, 10, 92],
  [5, 114, 5, 119, 5, 124],
  [15, 15, 15, 20, 15, 25],
  [15, 43, 19, 39, 23, 35],
  [15, 63, 19, 59, 20, 64],
  [19, 124, 22, 118, 24, 123],
  [35, 33, 35, 38, 39, 29],
  [35, 54, 40, 51, 43, 55],
  [35, 65, 35, 70, 35, 75],
  [28, 100, 32, 96, 36, 93],
  [39, 124, 42, 118, 44, 123],
  [48, 20, 52, 17, 52, 23],
  [49, 65, 51, 70, 54, 65],
  [55, 5, 59, 8, 63, 5],
  [59, 54, 62, 48, 64, 53],
  [45, 104, 50, 101, 53, 105],
  [55, 35, 60, 35, 65, 35],
  [65, 83, 69, 79, 70, 84],
  [65, 123, 70, 125, 75, 125],
  [75, 22, 78, 16, 80, 21],
  [75, 63, 78, 67, 79, 59],
  [83, 95, 87, 91, 90, 95],
  [75, 105, 75, 110, 75, 115],
  [85, 33, 89, 29, 93, 25],
  [95, 43, 99, 39, 100, 44],
  [95, 55, 95, 60, 95, 65],
  [95, 113, 96, 118, 100, 115],
  [112, 10, 117, 8, 118, 13],
  [122, 25, 127, 23, 132, 20],
  [105, 75, 105, 80, 105, 85],
  [105, 95, 105, 100, 105, 105],
  [119, 44, 122, 38, 124, 43],
  [119, 64, 122, 58, 126, 55],
  [115, 113, 115, 118, 115, 123],
  [125, 74, 128, 78, 130, 71],
  [125, 89, 125, 94, 127, 99],
  [129, 124, 132, 118, 134, 123]
];



function formatArea(areaName) {
  if (areaName == 'forest') {
    return '<span style="color: ' + terrains_col[0][1] + '"><b>forest</b></span>';
  }
  if (areaName == 'farmland') {
    return '<span style="color: ' + terrains_col[1][1] + '"><b>farmland</b></span>';
  }
  if (areaName == 'hill') {
    return '<span style="color: ' + terrains_col[2][1] + '"><b>hill</b></span>';
  }
  if (areaName == 'swamp') {
    return '<span style="color: ' + terrains_col[3][1] + '"><b>swamp</b></span>';
  }
  if (areaName == 'mountain') {
    return '<span style="color: ' + terrains_col[4][1] + '"><b>mountain</b></span>';
  }
  if (areaName == 'water') {
    return '<span style="color: ' + terrains_col[5][1] + '"><b>water</b></span>';
  }
  if (areaName == 'cavern') {
    return '<span>' + terrains_symb[0] + '</span>';
  }
  if (areaName == 'magic') {
    return '<span>' + terrains_symb[1] + '</span>';
  }
  if (areaName == 'mine') {
    return '<span>' + terrains_symb[2] + '</span>';
  }
}

const pplDescr = [
  'No people', // NOPPL     = 0
  '+4 <i class="user icon"></i> during attack',                                  // AMAZON    = 1  #  +4 pour attaque
  '+1 <i class="coins icon"></i> for each ' + formatArea('mine') + ' occupied, even in decline', // DWARF     = 2  #  +1 victoire sur mine, même en déclin
  'Do not discard 1 <i class="user icon"></i> when attacked',                    // ELF       = 3  #  pas de défausse lors d'une défaite
  'In decline, <i class="users icon"></i> arent discarded and can even play',    // GHOUL     = 4  #  tous les zombies restent en déclin, peuvent attaquer
  '-1 <i class="user icon"></i> when attacking a ' + formatArea('mountain'),     // GIANT     = 5  #  -1 pour attaque voisin montagne
  'Can start anywhere, receive immunity ⦸ on 2 first regions until abandoned or decline', // HALFLING  = 6  #  départ n'importe où, immunité sur 2 prem régions
  '+1 <i class="coins icon"></i> for each ' + formatArea('farmland') + ' occupied', // HUMAN     = 7  #  +1 victoire sur champs
  '+1 <i class="coins icon"></i> for each attacked non-empty area',              // ORC       = 8  #  +1 victoire pour région non-vide conquise
  'They are numerous',                                                           // RATMAN    = 9  #  leur nombre                                             
  '+1 <i class="user icon"></i> for every 2 attacked non-empty areas',           // SKELETON  = 10 #  +1 pion pour toutes 2 régions non-vide conquises
  'Replace a single active neighbour enemy by new sorcerer',                     // SORCERER  = 11 #  remplace pion unique adversaire actif par un sorcier
  'Need -1 <i class="user icon"></i> when attacking a area neighbour to ' + formatArea('water'), // TRITON    = 12 #  -1 pour attaque région côtière
  '+1 defense ⛨ on each owned area, even in decline',                            // TROLL     = 13 #  +1 défense sur chaque territoire même en déclin
  '+1 <i class="coins icon"></i> for each ' + formatArea('magic') + ' occupied', // WIZARD    = 14 #  +1 victoire sur source magique
]

const pwrDescr = [
  'No power',                                                               // NOPOWER     = 0
  '+2 <i class="coins icon"></i> at each round',                            // ALCHEMIST   = 1  # +2 chaque tour
  'Roll die before each attack',                                            // BERSERK     = 2  # Lancer de dé AVANT chaque attaque
  '5 defenses ⛨ to place every turn, also immunising against sorcerer',     // BIVOUACKING = 3  # 5 défenses à placer à chaque tour + immunité au sorcier
  'Need -1 <i class="user icon"></i> when attacking',                       // COMMANDO    = 4  # -1 attaque
  'Peace with an enemy people at end of turn, if you havent attacked them', // DIPLOMAT    = 5  # Paix avec un peuple actif à choisir à chaque tour
  'Can conqueer an area with a dragon, which gives immunity ⦸',            // DRAGONMASTER= 6  # 1 attaque dragon par tour + immunité complète
  'All areas are neighbour',                                                // FLYING      = 7  # Toutes les régions sont voisines
  '+1 <i class="coins icon"></i> for each ' + formatArea('forest') + ' occupied', // FOREST      = 8  # +1 victoire si forêt
  'Can place 1 fortress per turn up to 6, giving +1 <i class="coins icon"></i> when active and +1 defense always', // FORTIFIED   = 9  # +1 défense avec forteresse mm en déclin, +1 par tour actif (max 6- doit limiter à +une fortress / tour
  '2 defenses ⛨ to place every turn, giving full immunity ⦸',              // HEROIC      = 10 # 2 immunités complètes
  '+1 <i class="coins icon"></i> for each ' + formatArea('hill') + ' occupied', // HILL        = 11 # +1 victoire par colline
  '+1 <i class="coins icon"></i> for each area occupied',                   // MERCHANT    = 12 # +1 victoire par région
  'Need -1 <i class="user icon"></i> when attacking a ' + formatArea('hill') + ' or ' + formatArea('farmland'), // MOUNTED     = 13 # -1 attaque colline/ferme
  '+1 <i class="coins icon"></i> for each attacked non-empty area',         // PILLAGING   = 14 # +1 par région non vide conquise
  'Only ones allowed to attack ' + formatArea('water') + ' areas',          // SEAFARING   = 15 # Conquête possible des mers/lacs, conservées en déclin
  'Can be 2 different ppl in decline, spirits never disappear',             // SPIRIT      = 16 # 2e peuple en déclin, et le reste jusqu'au bout
  'Can decline at end of the turn',                                         // STOUT       = 17 # Déclin possible juste après tour classique
  '+1 <i class="coins icon"></i> for each ' + formatArea('swamp') + ' occupied', // SWAMP       = 18 # +1 victoire par marais
  '-1 <i class="coins icon"></i> when attacking  a ' + formatArea('cavern'),// UNDERWORLD  = 19 # -1 attaque caverne, et les cavernes sont adjacentes
  '+7 <i class="coins icon"></i> after first turn',                         // WEALTHY     = 20 # +7 victoire à la fin premier tour
];

const pplColors = [
  ['#8caef2', '#477eeb', '#bacff7'],
  ['#b580ff', '#83f', '#d2b3ff'],
  ['darkorange', 'orangered', 'lightsalmon'], // TO UPDATE
  ['red', 'blue', 'green'], // TO UPDATE
  //['darkorange', 'orangered', 'lightsalmon'],
];
const declineBackground = '#f7f7f7';

function _bitfieldToBits(n) {
  return Array.from({ length: 8 }, (_, i) => !!(n & (1 << (7 - i))));
}

function _bitfieldToTrue(n) {
  const bitsArray = _bitfieldToBits(n);
  const indices = bitsArray.reduce((out, bool, index) => bool ? out.concat(index) : out, []);
  return indices;
}

function toShortString(data) {
  let nb = data[0], ppl = data[1];
  if (ppl == 0) {
    return '';
  } else if (ppl > 0) {
    return nb + ppl_short_str[ ppl].toUpperCase();
  } else {
    return nb + ppl_short_str[-ppl];
  }
}

function toLongString(data, showNumber = true) {
  let nb = data[0], ppl = data[1], power = data[2];
  if (ppl == 0) {
    return '';
  } else if (ppl > 0) {
    return (showNumber ? nb + ' ' : '') + ppl_str[ ppl] + ' + ' + pwr_str[power];
  } else {
    return (showNumber ? nb + ' ' : '') + ppl_str[-ppl] + ' <i class="skull crossbones icon"></i>';
  }
}

function toDetailString(data) {
  let ppl = data[1], power = data[2], pplDetails = data[3], pwrDetails = data[4];
  let result = '';

  if (ppl == 1) {         // AMAZON
    if (pplDetails > 0) {
      result += pplDetails + ' <i class="users icon"></i> loaned. ';
    }
  } else if (ppl == 6) {  // HALFLING
    if (pplDetails > 0) {
      result += pplDetails + ' ⛨ remaining. ';
    }
  } else if (ppl == 11) { // SORCERER
    const players = _bitfieldToTrue(pplDetails);
    if (players.length > 0) {
      for (pl of players) {
        //result += 'P+' + pl;
        result += 'Other player';
      }
      result += ' sorcerized. '
    }
  }

  if (power == 2) { // BERSERK
    if (pwrDetails >= 2**6) {
      result += 'Dice is ' + (pwrDetails-2**6) + '. ';
    }
  } else if (power == 5) { // DIPLOMAT
    if (pwrDetails >= 2**6) {
      const players = _bitfieldToTrue(pwrDetails-2**6);
      if (players.length > 0) {
        result += 'Cant use diplomacy with';
        for (pl of players) {
          //result += 'P+' + pl;
          result += ' other player.';
        }
      }
    } else if (pwrDetails > 0) {
      result += 'Ongoing diplomacy with';
      //result += 'P+' + pl;
      result += ' other player.';
    }
  } else if (power == 3) { // BIVOUACKING
    if (pwrDetails > 0) {
      result += (pwrDetails % 2**6) + ' ⛨ remaining. ';
    }
  } else if (power == 9) { // FORTIFIED
    if (pwrDetails > 0) {
      result += (pwrDetails % 2**6) + ' ⛨ remaining. ';
    }
  } else if (power == 10) { // HEROIC
    if (pwrDetails > 0) {
      result += (pwrDetails % 2**6) + ' ⛨ remaining. ';
    }
  }

  return result;
}

function toColors(data) {
  //        color, nb , letter, letter color
  let nb = data[0], ppl = data[1];
  if (ppl == 0) {
    return ['none', '', '', 'none'];
  } else if (ppl == -15) {
    return ['#f2f2f2', '' + nb, '', 'dimgray'];
  } else {
    console.log(game.displayColors);
    console.log(ppl);
    let colorInfo = game.displayColors[Math.abs(ppl)];
    let color = pplColors[colorInfo[0]][colorInfo[1]];
    if (ppl < 0) {
      return [declineBackground, '' + nb, ppl_short_str[-ppl], color];
    } else {
      return [color, '' + nb, ppl_short_str[ ppl].toUpperCase(), 'white'];
    }
  }
}

function toDescr(nb, ppl, power) {
  let result = '';
  result += pplDescr[Math.abs(ppl)] + ' ; ';
  if (ppl > 0) {
    result += pwrDescr[power];
  } else {
    result += pwrDescr[0];
  }

  return result;
}

function _miscPolygonComputations(points) {
  let sumX = 0, sumY = 0, totalArea = 0;
  let maxX = 0, maxY = 0, minX = 999, minY = 999;

  // Compute simultaneously barycenter and surrounding box
  for (let i = 0; i < points.length; i++) {
    const [x1, y1] = points[i];
    const [x2, y2] = points[(i + 1) % points.length];
    const triangleArea = (x1 * y2 - x2 * y1);
    
    sumX += (x1 + x2) * triangleArea;
    sumY += (y1 + y2) * triangleArea;
    totalArea += triangleArea;

    minX = Math.min(minX, x1);
    maxX = Math.max(maxX, x1);
    minY = Math.min(minY, y1);
    maxY = Math.max(maxY, y1);
  }

  // Barycenter
  const baryX = sumX / (3 * totalArea);
  const baryY = sumY / (3 * totalArea);

  // Check overall shape, and deduce 3 areas
  const shiftX = 6, shiftY = 4;
  let areas = [];
  if ((maxX-minX) > 1.5*(maxY-minY)) {
    // shape is mostly horizontal
    areas = [ [baryX-shiftX, baryY], [baryX, baryY], [baryX+shiftX, baryY] ];
  } else if ((maxY-minY) > 1.5*(maxX-minX)) {
    // shape is mostly vertical
    areas = [ [baryX, baryY-shiftY], [baryX, baryY], [baryX, baryY+shiftY] ];
  } else {
    // shape is mostly square
    areas = [ [baryX-shiftX/2, baryY-shiftY/2], [baryX+shiftX/2, baryY-shiftY/2], [baryX, baryY+shiftY/2] ];
  }

  // Compute erosion
  const erosionR = 1.0;
  for (const point of points) {
    const vectorToCenter = [baryX-point[0], baryY-point[1]];
    const vectorLength = Math.sqrt(vectorToCenter[0]*vectorToCenter[0]+vectorToCenter[1]*vectorToCenter[1]);
    const newPoint = [point[0] + erosionR*vectorToCenter[0]/vectorLength, point[1] + erosionR*vectorToCenter[1]/vectorLength];
    areas.push(newPoint);
  }

  return areas;
}

function _actionType(action) {
  const type = buttonInfos.findIndex(row => row[1] <= action && action <= row[2]);
  return type;
}

function _typeFromBtnName(btnName) {
  const type = buttonInfos.findIndex(row => row[0] == btnName);
  return type;
}

/* =================== */
/* =====  LOGIC  ===== */
/* =================== */

class Smallworld extends AbstractGame {
  constructor() {
    super()
    // Add 2 virtual actions to list of valid actions
    this.validMoves = Array(sizeV[1]+2); this.validMoves.fill(false);
    this.canAddVirtualStartDeploy = true;
    this.gameIsStarted = false;
    this.displayColors = {}; // For each pplID, list player and colorID
    this.nextColors = Array(nb_players).fill(0); // For each player, list next colorID to use
  }

  post_init_game() {
    this.canAddVirtualStartDeploy = true;
    this.gameIsStarted = false;
    this._addVirtualMoves();
  }

  pre_move(action, manualMove) {
  }

  move(action, isManualMove) {
    this.gameIsStarted = true;

    if (action == sizeV[1]+1 && isManualMove) {
      // Nothing to update
      this.validMoves = this.validMoves.slice(0, sizeV[1]);
    } else if (action == sizeV[1] && isManualMove) {
      this.pre_move(action, isManualMove);
      // Actually move
      this.previousPlayer = this.nextPlayer;
      this.py.gather_current_ppl_but_one();
      //These values shouldn't change: this.nextPlayer, this.gameEnded, this.validMoves
      this.validMoves = this.validMoves.slice(0, sizeV[1]);
      this.post_move(action, isManualMove);
    } else {
      super.move(action, isManualMove);
    }
  }

  post_move(action, manualMove) {
    // Register past move, after checking its success
    let success = true;
    const type = _actionType(action);
    if (type >= 0 && buttonInfos[type][0] == 'attackBtn') {
      // Check if attack actually succeeded
      const area = action - buttonInfos[type][1];
      const areaPpl = this.getTerritoryInfo2(area)[1];

      const current = this.getCurrentPlayerAndPeople();
      const curPplType = this.getPplInfo(current[0], current[1])[1];
      if (areaPpl != curPplType) {
        success = false;
      }
    }
    move_sel.registerMove(action, success);

    // Switch "canAddVirtualStartDeploy" depending on current move
    if (action == sizeV[1]) {
      this.canAddVirtualStartDeploy = false; // using virtual move, can't use it again for this turn
    }
    if (Math.max(...this.validMoves.slice(nbAreas, 2*nbAreas-1)) == true) {
      this.canAddVirtualStartDeploy = true; // new turn, can use "canAddVirtualStartDeploy" again
    }

    // Add virtual action
    this._addVirtualMoves();

    // Update color definition if needed
    this._syncPplAndColors();
  }

  post_set_data() {
    this._addVirtualMoves();
  }

  has_changed_on_last_move(item_vector) {
    return 0;
  }

  getTerritoryInfo2(area) {
    return this.py.getTerritoryInfo2(area).toJs({create_proxies: false});
  }

  getScore(p) {
    return this.py.getScore(p);
  }

  getPplInfo(p, ppl) {
    return this.py.getPplInfo(p, ppl).toJs({create_proxies: false});
  }

  getCurrentPlayerAndPeople() {
    return this.py.getCurrentPlayerAndPeople().toJs({create_proxies: false});
  }

  getDeckInfo(i) {
    return this.py.getDeckInfo(i).toJs({create_proxies: false});
  }

  getRound() {
    return this.py.getRound();
  }

  needDiceToAttack(area) {
    return this.py.needDiceToAttack(area);
  }

  _addVirtualMoves() {
    // Add virtual move = prepare to redeploy
    const validVirtualMove = this.canAddVirtualStartDeploy && Math.max(...this.validMoves.slice(4*nbAreas+8, 5*nbAreas+8));
    this.validMoves.push(validVirtualMove);
    // Add another virtual move = install lost tribe
    this.validMoves.push(!this.gameIsStarted);
    console.assert(this.validMoves.length == sizeV[1]+2, 'validMoves.length = ' + this.validMoves.length + ' ' + validVirtualMove + ' ' + this.gameIsStarted);
  }

  _syncPplAndColors() {
    let usedColors = Array.from({ length: nb_players }, () => Array.from({ length: 3 }, () => false));
    let newPplList = [];

    // Check if any new ppl, or any removed ppl
    for (let p = 0; p < nb_players; p++) {
      for (let ppl = 0; ppl < 3; ppl++) {
        let info = this.getPplInfo(p, ppl);
        let pplIDabs = Math.abs(info[1]);
        if (pplIDabs != 0) {
          if (pplIDabs in this.displayColors) {
            let color = this.displayColors[pplIDabs][1];
            //console.log('DEBUG IN: ', pplIDabs, color);
            usedColors[p][color] = true;
          } else {
            // New people, will define color later
            //console.log('DEBUG NOTIN: ', p, pplIDabs);
            newPplList.push([p, pplIDabs]);
          }
        }
      }
    }

    // Find unused color for each new people
    for (let i = 0; i < newPplList.length; ++i) {
      let p = newPplList[i][0], pplIDabs = newPplList[i][1];
      let colorCandidate = this.nextColors[p];
      if (usedColors[p][colorCandidate]) {
        // Use first available color otherwise
        colorCandidate = usedColors[p].findIndex(x => !x);
      }

      this.displayColors[pplIDabs] = [p, colorCandidate];
      this.nextColors[p] = (this.nextColors[p] + 1) % 3;
      usedColors[p][colorCandidate] = true;
    }
  }

}

class MoveSelector extends AbstractMoveSelector {
  constructor() {
    super();
    this.previousMoves = [];
    this.previousPlayer = -1;
    this.showDetails = true;
  }

  // Going back to default, between moves for instance
  reset() {
  }

  // First start
  start() {
    this.selectedMoveType = -1;
    this.allowedMoveTypes = new Array(buttonInfos.length).fill(false);
    this.show2ndButtons = false;
    this.nextMove = -1;
    this.disableDeck = false;
    this.update();
  }

  update() {
    // reset nextMove (but not selectedMoveType)
    this.nextMove = -1;
    // check allowed types
    for (let i = 0; i < buttonInfos.length; i++) {
      this.allowedMoveTypes[i] = game.validMoves.slice(buttonInfos[i][1], buttonInfos[i][2]+1).some(Boolean);
    }
    if (this.allowedMoveTypes[_typeFromBtnName('startBtn')]) {
      // Inhibit all other actions
      this.allowedMoveTypes.fill(false);
      this.allowedMoveTypes[_typeFromBtnName('startBtn')] = true;
    }
    if (this.allowedMoveTypes[_typeFromBtnName('startDplBtn')])
      this.allowedMoveTypes[_typeFromBtnName('deploy1Btn')] = false; // Inhibit "deploy1" when "startDeploy" is valid
    // decide which type to select
    if (this.selectedMoveType < 0 || !this.allowedMoveTypes[this.selectedMoveType]) {
      this.selectedMoveType = this.allowedMoveTypes.indexOf(true);
    }
    if (this.selectedMoveType < 0) {
      return;
    }
    // decide which elements to show
    this.show2ndButtons = buttonInfos[this.selectedMoveType][5];
    this.disableDeck = (this.selectedMoveType >= 0 && buttonInfos[this.selectedMoveType][0] != 'choseBtn');

    // update UI
    this._updateHTML();
  }

  end() {
    this.selectedMoveType = 0;
    this.allowedMoveTypes = new Array(buttonInfos.length).fill(false);
    this.show2ndButtons = false;
    this.disableDeck = true;
    this.nextMove = -1;
    this._updateHTML();
  }

  _updateHTML() {
    for (let i = 0; i < buttonInfos.length; i++) {
      document.getElementById(buttonInfos[i][0]).style = this.allowedMoveTypes[i] ? "" : "display: none";
      document.getElementById(buttonInfos[i][0]).classList.toggle(buttonInfos[i][4], i == this.selectedMoveType);
    }

    document.getElementById('confirmBtn').style = (this.show2ndButtons) ? "" : "display: none";
    document.getElementById('actionDescr').innerHTML = (this.selectedMoveType<0) ? '' : actionsDescr[this.selectedMoveType];
  }

  registerMove(action, success) {
    if (this.previousPlayer != game.previousPlayer) {
      this.previousMoves = [];
      this.previousPlayer = game.previousPlayer;
    }

    const type = _actionType(action);
    if (type >= 0) {
      if (['attackBtn', 'usePplBtn', 'usePwrBtn', 'abandonBtn'].includes(buttonInfos[type][0])) {
        const area = action - buttonInfos[type][1];
        this.previousMoves.push([area, type, success]);
      } else if (['declineBtn'].includes(buttonInfos[type][0])) {
        this.previousMoves.push([-1, type, success]);
      }
    }
  }

  getTypeOfMoveOnArea(area) {
    const moveTypes = this.previousMoves.filter(x => x[0] === area);
    if (moveTypes.length == 0) {
      return null;
    }

    let mainType = Math.min(...moveTypes.map(x => x[1]));
    if (buttonInfos[mainType][0] == 'attackBtn') {
      if (!moveTypes.some(x => x[1] === mainType && x[2] === true)) {
        mainType = -1;
      }
    }

    return mainType;
  }

  hasDeclined() {
    const anyDecline = this.previousMoves.filter(x => x[0] === -1).length;
    return !!anyDecline;
  }

  clickOnButton(btn) {
    this.selectedMoveType = _typeFromBtnName(btn);
    this.show2ndButtons = buttonInfos[this.selectedMoveType][5];
    this._updateHTML();
    refreshBoard();

    // For this button, no confirmation needed, no territory so trigger move already
    if (buttonInfos[this.selectedMoveType][0] == 'startBtn') {
      this.nextMove = sizeV[1]+1;
      userMove();
    }
  }

  clickOnTerritory(area) {
    this.nextMove = buttonInfos[this.selectedMoveType][1] + area;
    userMove();
  }

  territoryIsClickable(area) {
    if (['choseBtn', 'startDplBtn', 'noDeployBtn', 'declineBtn', 'endTurnBtn', 'startBtn'].includes(buttonInfos[this.selectedMoveType][0])) {
      return false;  
    }
    if (this.selectingDiplomacy()) {
      return false;
    }
    const virtualMove = buttonInfos[this.selectedMoveType][1] + area;
    return game.validMoves[virtualMove];
  }

  clickOnDeck(index) {
    console.assert(buttonInfos[this.selectedMoveType][0] == 'choseBtn', 'deck was clicked but was move_sel wasnot in mode choose');
    this.nextMove = (5*nbAreas+8) + index;
    userMove();
  }

  confirm() {
    if (buttonInfos[this.selectedMoveType][0] == 'noDeployBtn') {
      this.nextMove = 4*nbAreas;
    } else if (buttonInfos[this.selectedMoveType][0] == 'declineBtn') {
      this.nextMove = sizeV[1]-2;
    } else if (buttonInfos[this.selectedMoveType][0] == 'endTurnBtn') {
      this.nextMove = sizeV[1]-1;
    } else if (buttonInfos[this.selectedMoveType][0] == 'startDplBtn') {
      this.nextMove = sizeV[1];
    } else {
      return;
    } 
    userMove();
  }

  selectingDiplomacy() {
    // Check if need to enable special mode when using "diplomat" power
    if (buttonInfos[this.selectedMoveType][0] != 'usePwrBtn') {
      return false;
    }

    const curPlayPpl = game.getCurrentPlayerAndPeople();
    const curPwr = game.getPplInfo(curPlayPpl[0], curPlayPpl[1])[2];
    return (curPwr == 5); // DIPLOMAT = 5
  }

  // return move, or -1 if move is undefined
  getMove() {
    return this.nextMove;
  }

  toggleDetails() {
    this.showDetails = !(this.showDetails);
    refreshBoard();
    document.getElementById('toggleDetailsBtn').classList.toggle('inverted', this.showDetails);
  }
}

function moveToString(move, gameMode) {
  return ''
}

/* =================== */
/* ===== DISPLAY ===== */
/* =================== */

function _dispPeople(x, y, mainColor, bigChar, littleChar, charColor) {
  let result = '<svg ';
  if (!!x) {
    result += 'width="6" height="6" x="' + (x-6/2) + '" y="' + (y-6/2) + '">';
  } else {
    result += 'width="3em" height="3em" viewBox="0 0 6 6" style="vertical-align: bottom;">';
  }

  result += '<rect width="6" height="6" x="0" y="0" fill="' + mainColor + '" />';
  // if (stroke) {
  //   result += '<rect width="6" height="6" x="0" y="0" fill="none" stroke="red" stroke-width="1" />';
  // }
  result += '<text x="3" y="3" text-anchor="middle" dominant-baseline="central" font-size="5" font-weight="bolder" fill="' + charColor + '">';
  result += bigChar;
  result += '</text>';
  if (!!littleChar) {
    result += '<text x="0.5" y="2" font-size="1.5" font-weight="bolder" fill="' + charColor + '">';
    result += littleChar;
    result += '</text>';
  }

  result += '</svg>';
  return result;
}

function _boardDisplPeople(data, x, y, dotColor) {
  if (x<=0 && y<=0) {
    return '';
  }
  let info = toColors(data);
  let mainColor = info[0], bigChar = info[1], littleChar = info[2], charColor = info[3];
  if (charColor == 'none') {
    return '';
  }

  let result = _dispPeople(x, y, mainColor, bigChar, null, charColor);
  if (dotColor != null) {
    result += '<circle r="1" cx="' + (x+6/2) + '" cy="' + (y-6/2) + '" fill="' + dotColor + '" stroke="white" stroke-width="0.2" />';
  }

  return result;
}

function _boardDisplDefense(data, x, y) {
  if (x<=0 && y<=0) {
    return  '';
  }
  let defense = data[2], terrain = data[3];
  if (defense <= 0) {
    return '';
  }

  let result = '<svg width="6" height="6" x="' + (x-6/2) + '" y="' + (y-6/2) + '" viewBox="0 0 24 24" fill="none">';

  if (defense == 1 && terrain == 4) {
    // Draw mountain
    result += '<path d="M13 14L17 9L22 18H2.84444C2.46441 18 2.2233 17.5928 2.40603 17.2596L10.0509 3.31896C10.2429 2.96885 10.7476 2.97394 10.9325 3.32786L15.122 11.3476"';
    result += 'stroke="black" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"/>';
  } else if (defense >= 20) {
    // Draw forbid
    result += '<text x="12" y="12" text-anchor="middle" dominant-baseline="central" font-size="14" font-weight="bolder" fill="black">';
    result += '⦸';
    result += '</text>';
  } else {
    // Draw shield
    result += '<path d="M20 6C20 6 19.1843 6 19.0001 6C16.2681 6 13.8871 4.93485 11.9999 3C10.1128 4.93478 7.73199 6 5.00009 6C4.81589 6 4.00009 6 4.00009 6C4.00009 6 4 8 4 9.16611C4 14.8596 7.3994 19.6436 12 21C16.6006 19.6436 20 14.8596 20 9.16611C20 8 20 6 20 6Z"';
    result += 'stroke="black" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"/>';

    result += '<text x="12" y="12" text-anchor="middle" dominant-baseline="central" font-size="14" font-weight="bolder" fill="black">';
    result += defense;
    result += '</text>';
  }

  result += '</svg>';
  return result;
}

function _boardDisplTerritory(data, x, y) {
  if (x<=0 && y<=0) {
    return  '';
  }

  let terrainPowers = data[4];

  let result = '<text x="' + x + '" y="' + y + '"';
  result += 'text-anchor="middle" dominant-baseline="central" font-size="3" font-weight="bolder" fill="black">';
  if (terrainPowers[0]) {
    result += terrains_symb[0] + ' ';
  }
  if (terrainPowers[1]) {
    result += terrains_symb[1] + ' ';
  }
  if (terrainPowers[2]) {
    result += terrains_symb[2] + ' ';
  }
  result += '</text>';

  return result;
}

function _genBoard() {
  let result = '';
  let strokeColor = buttonInfos[move_sel.selectedMoveType][3]

  for (var i = 0 ; i < mapAreas.length; i++) {
    let list_of_points = [];
    for (const point of mapAreas[i]) {
      list_of_points.push(mapPoints[point]);
    }
    const computedPoints = _miscPolygonComputations(list_of_points);
    const data = game.getTerritoryInfo2(i);

    result += '<g';
    if (move_sel.territoryIsClickable(i)) {
      result += ' onclick="move_sel.clickOnTerritory(' + i + ')"';
    }
    result += '>';

    // Draw polygon
    result += '<polygon points="';
    for (var j = 3 ; j < computedPoints.length; j++) {
      result += computedPoints[j][0] + ',' + computedPoints[j][1] + ' ';
    }
    result += '" fill="' + (terrains_col[data[3]][0]) + '"';
    if (move_sel.territoryIsClickable(i)) {
      result += ' stroke="'+  strokeColor + '" stroke-width="0.5"';
      if (buttonInfos[move_sel.selectedMoveType][0] == 'attackBtn' && game.needDiceToAttack(i)) {
        result += ' stroke-dasharray="1"';
      }
    }
    result += '></polygon>';

    // Compute color of dot
    const lastMoveOnArea = move_sel.getTypeOfMoveOnArea(i);
    let dotColor = (lastMoveOnArea == null) ? null : ((lastMoveOnArea < 0) ? 'gray' : buttonInfos[lastMoveOnArea][3]);

    if (game.gameIsStarted) {
      result += _boardDisplPeople(data, elementsCoord[i][0], elementsCoord[i][1], dotColor);
    }
    result += _boardDisplDefense(data, elementsCoord[i][2], elementsCoord[i][3]);
    result += _boardDisplTerritory(data, elementsCoord[i][4], elementsCoord[i][5]);

    // result += '<text x="' + computedPoints[0][0] + '" y="' + computedPoints[0][1] + '"';
    // result += ' text-anchor="middle" dominant-baseline="central" font-size="0.4em" font-weight="bolder" fill="purple" fill-opacity="0.4">';
    // result += i;
    // result += '</text>';
    
    result += '</g>';
  }

  return result;
}

function _genPlayersInfo(p) {
  const curPlayPpl = game.getCurrentPlayerAndPeople();
  let descr = "";
  for (let ppl = 2; ppl >= 0; ppl--) {
    const pplInfo = game.getPplInfo(p, ppl); // number in hand, ppl, power, total number
    if (pplInfo[1] != 0) {
      let colorInfo = toColors(pplInfo);
      const isCurrent = (p == curPlayPpl[0] && ppl == curPlayPpl[1]);
      const relativePly = (p - curPlayPpl[0]) % nb_players;
      const displayDiplomacyButton = move_sel.selectingDiplomacy() && (relativePly != 0) && (ppl == 2);
      const validDiplomacyMove = game.validMoves[buttonInfos[_typeFromBtnName('usePwrBtn')][1] + relativePly];
      
      // Display colored square + full name (or button if need to select diplomacy)
      if (isCurrent) {
        descr += '<div style="border: 0.2rem solid dodgerblue; padding: 0.2rem;">';
      } else {
        descr += '<div>';
      }
      descr += _dispPeople(null, null, colorInfo[0], colorInfo[1], null, colorInfo[3]);
      descr += '<span class="ui large text">';
      descr += ' ';

      if (displayDiplomacyButton && validDiplomacyMove) {
        descr += '<div class="ui big compact primary button" onclick="move_sel.clickOnTerritory(' + relativePly + ')">';
        descr += toLongString(pplInfo, false);
        descr += '</div>';
      } else {
        //descr += isCurrent ? '<b>' : '';
        descr += toLongString(pplInfo, false);
        //descr += isCurrent ? '</b>' : '';
      }

      if (ppl < 2 && relativePly == (nb_players - 1) && move_sel.hasDeclined() ) {
        // Has just declined, add a dot
        descr += '<span class="ui ' + buttonInfos[_typeFromBtnName('declineBtn')][4] + ' text">●</span>';
      }
      descr += '</span>';

      // Specific details for power/people
      const details = toDetailString(pplInfo);
      if (details.length > 0) {
        descr += ' <span class="ui grey text"> ' + details + "</span>";
      }

      // Explanation
      if (move_sel.showDetails) {
        descr += '<br><span class="ui small text">';
        descr += toDescr(pplInfo[0], pplInfo[1], pplInfo[2])
        descr += '. ' + pplInfo[5] + ' <i class="user icon"></i> total';
        descr += '</span>';
      }

      descr += '</div>';
    }
  }
  return descr;
}

function userMove() {
  let move = move_sel.getMove()
  game.move(move, true);
  move_sel.reset();
  refreshBoard();
  refreshButtons();
  refreshPlayersText();

  ai_play_if_needed();
}

function refreshBoard() {
  console.log('refresh board');

  // update board contents
  document.getElementById("boardSvg").innerHTML = _genBoard();
  document.getElementById("boardSvg").setAttribute("viewBox", "0 0 140 130");

  // update peoples and scores
  for (let p = 0; p < nb_players; p++) {
    document.getElementById("p"+p+"Score").innerHTML = (p ? "AI " + p : "You") + " - " + game.getScore(p) + ' <i class="coins icon"></i>';
    document.getElementById("p"+p+"Ppl").innerHTML = _genPlayersInfo(p);
  }

  // update deck
  for (let i = 0; i < 6; i++) {
    deckInfo = game.getDeckInfo(i); // number, power, ppl, points
    let descr = toLongString(deckInfo);
    if (deckInfo[3] > 0) {
      descr += " + " + deckInfo[3] + '<i class="coins icon"></i>';
    }

    if (move_sel.showDetails) {
      descr += '<br>';
      descr += '<span class="ui small text">' + toDescr(deckInfo[0], deckInfo[1], deckInfo[2]) + '</span>';
    }
    document.getElementById("deck"+i+"Descr").innerHTML = descr;
    document.getElementById("deck"+i+"Btn").classList.toggle('disabled', move_sel.disableDeck);
    document.getElementById("deck"+i+"Btn").classList.toggle('primary', !move_sel.disableDeck);
  }

  // update round
  // "Round " + game.getRound() + "/10";
  let roundDescr = '';
  const round = game.getRound();
  for (var i = 1; i <= 9; ++i) {
    if (i == round) {
      roundDescr += '<div class="ui black';
    } else if (i > round) {
      roundDescr += '<div class="ui basic grey';
    } else {
      roundDescr += '<div class="ui disabled grey';
    }
    roundDescr += ' label">' + i + "</div>";
  }
  document.getElementById("roundP").innerHTML = roundDescr;
}

function refreshButtons(loading=false) {
  console.log('refresh buttons');
  if (!loading) {
    allBtn.style = "";
    loadingBtn.style = "display: none";
  } else {
    allBtn.style = "display: none";
    loadingBtn.style = "";
  }

  if (game.is_ended()) {
    console.log('End of game');
    move_sel.end();
  } else {
    // update move selector
    move_sel.update();
  }
}

function refreshPlayersText() {
}

function changeMoveText() {
}

/* =================== */
/* ===== ACTIONS ===== */
/* =================== */


var game = new Smallworld();
var move_sel = new MoveSelector();

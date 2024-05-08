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

const defaultModelFileName = 'smallworld/model.onnx';
const sizeCB = [1, 40, 8];
const sizeV = [1, 131];
const nb_players = 2;

/* =================== */
/* =====  UTILS  ===== */
/* =================== */

const buttonInfos = [
  // button     range of moveID  HTMLcolor FomanticColor  confirmation needed
  ["attackBtn"  , 23, 45,       'tomato',    'orange',    false],
  ["noDeployBtn", 92, 92,       'mediumblue','blue',      true ],
  ["deploy1Btn" , 100, 122,     'hotpink',   'pink',      false],
  ["usePplBtn"  , 46, 68,       'mediumblue','blue',      false],
  ["usePwrBtn"  , 69, 91,       'mediumblue','blue',      false],
  ["endTurnBtn" , 130, 130,     'mediumblue','blue',      true ],
  ["abandonBtn" , 0, 22,        'red',       'red',       false],
  ["choseBtn"   , 123, 128,     'mediumblue','blue',      false],
  ["declineBtn" , 129, 129,     'mediumblue','blue',      true ],
  // deployN 93-99 not proposed
];

const ppl_str       = [' ', 'amazon','dwarf','elf','ghoul','giant','halfling','human','orc','ratman','skeleton','sorcerer','triton','troll','wizard', 'lost_tribe'];
const ppl_short_str = [' ', 'a'     ,'d'    ,'e'  ,'h'    ,'g'    ,'f'       ,'u'    ,'o'  ,'r'     ,'k'       ,'s'       ,'n'     ,'t'    ,'w'     , 'l'];
const pwr_str = [' ','alchemist','berserk','bivouacking','commando','diplomat','dragonmaster','flying','forest','fortified','heroic','hill','merchant','mounted','pillaging','seafaring','spirit','stout','swamp','underworld','wealthy'];

const terrains_col = [
  ['#266e3c'  ,  'green' ],  // FORESTT
  ['#eaba5e'  ,  'brown' ],  // FARMLAND
  ['#74a339'  ,  'olive' ],  // HILLT
  ['#886a44'  ,  'purple'],  // SWAMPT
  ['#c8c8c8'  ,  'black' ],  // MOUNTAIN
  ['#61a6cf'  ,  'blue'  ],  // WATER
];

const terrains_symb = [
  '⌘', // cavern
  '★', // magic
  '⏚', // mine
];

const mapPoints = [
  [0 , 0 ], // A  0
  [20, 0 ], // B  1
  [20, 10], // C  2
  [0 , 20], // D  3
  [30, 20], // E  4
  [40, 20], // F  5
  [40,  0], // G  6
  [50, 20], // H  7
  [60, 20], // I  8
  [60, 10], // J  9
  [60, 0 ], // K  10
  [70, 10], // L  11
  [80, 10], // M  12
  [80, 0 ], // N  13
  [100, 0], // O  14
  [100, 10], // P 15
  [90, 10], // Q  16
  [80, 30], // R  17
  [60, 30], // S  18
  [60, 40], // T  19
  [40, 40], // U  20
  [90, 30], // V  21
  [100, 30], // W 22
  [70, 20], // Z  23
  [90, 40], // A1 24
  [90, 50], // B1 25
  [100, 50], // C1 26
  [80, 70], // D1 27
  [100, 70], // E1 28
  [80, 60], // F1 29
  [80, 40], // G1 30
  [70, 30], // H1 31
  [70, 40], // I1 32
  [70, 60], // J1 33
  [70, 70], // K1 34
  [50, 50], // L1 35
  [50, 60], // M1 36
  [50, 70], // N1 37
  [30, 50], // O1 38
  [40, 70], // P1 39
  [20, 50], // Q1 40
  [20, 30], // R1 41
  [0 , 30], // S1 42
  [10, 50], // T1 43
  [0 , 60], // U1 44
  [20, 70], // V1 45
  [0 , 70], // W1 46
  [30, 30], // Z1 47
];

const mapAreas = [
  [0, 1, 2, 3],             // 0
  [3, 2, 4, 41, 42],        // 1
  [42, 41, 47, 40, 43, 44], // 2
  [44, 43, 45, 46],         // 3
  [1, 6, 5, 4, 2],          // 4
  [4, 5, 7, 20, 47, 41],    // 5
  [43, 40, 38, 39, 45],     // 6
  [47, 20, 19, 35, 38, 40], // 7
  [6, 10, 9, 8, 7, 5],      // 8
  [7, 8, 18, 19, 20],       // 9
  [38, 35, 36, 37, 39],     // 10
  [9, 11, 23, 31, 18, 8],   // 11
  [18, 31, 32, 33, 36, 35, 19], // 12
  [10, 13, 12, 11, 9],      // 13
  [36, 33, 34, 37],         // 14
  [23, 17, 21, 24, 30, 32], // 15
  [11, 12, 16, 17, 23],     // 16
  [32, 30, 29, 27, 34, 33], // 17
  [13, 14, 15, 16, 12],     // 18
  [25, 26, 28, 27, 29],     // 19
  [21, 22, 26, 25],         // 20
  [30, 24, 25, 29],         // 21
  [16, 15, 22, 21, 17],     // 22
];

function formatArea(areaName) {
  if (areaName == 'forest') {
    return '<span class="ui text" style="color: ' + terrains_col[0][0] + '">forest</span>';
  }
  if (areaName == 'farmland') {
    return '<span class="ui text" style="color: ' + terrains_col[1][0] + '">farmland</span>';
  }
  if (areaName == 'hill') {
    return '<span class="ui text" style="color: ' + terrains_col[2][0] + '">hill</span>';
  }
  if (areaName == 'swamp') {
    return '<span class="ui text" style="color: ' + terrains_col[3][0] + '">swamp</span>';
  }
  if (areaName == 'mountain') {
    return '<span class="ui text" style="color: ' + terrains_col[4][0] + '">mountain</span>';
  }
  if (areaName == 'water') {
    return '<span class="ui text" style="color: ' + terrains_col[5][0] + '">water</span>';
  }
  if (areaName == 'cavern') {
    return '<span class="ui text">' + terrains_symb[0] + '</span>';
  }
  if (areaName == 'magic') {
    return '<span class="ui text">' + terrains_symb[1] + '</span>';
  }
  if (areaName == 'mine') {
    return '<span class="ui text">' + terrains_symb[2] + '</span>';
  }
}

const pplDescr = [
  'No people', // NOPPL     = 0
  '+4 <i class="user icon"></i> during attack',                               // AMAZON    = 1  #  +4 pour attaque
  '+1 <i class="coins icon"></i> for each ' + formatArea('mine') + ' occupied, even in decline', // DWARF     = 2  #  +1 victoire sur mine, même en déclin
  'Do not discard 1 <i class="user icon"></i> when attacked',                 // ELF       = 3  #  pas de défausse lors d'une défaite
  'In decline, <i class="users icon"></i> arent discarded and can even play', // GHOUL     = 4  #  tous les zombies restent en déclin, peuvent attaquer
  '-1 <i class="user icon"></i> when attacking a ' + formatArea('mountain'),  // GIANT     = 5  #  -1 pour attaque voisin montagne
  'Can start anywhere, receive immunity on 2 first regions until abandoned or decline', // HALFLING  = 6  #  départ n'importe où, immunité sur 2 prem régions
  '+1 <i class="coins icon"></i> for each ' + formatArea('farmland') + ' occupied', // HUMAN     = 7  #  +1 victoire sur champs
  '+1 <i class="coins icon"></i> for each attacked non-empty area',           // ORC       = 8  #  +1 victoire pour région non-vide conquise
  'They are numerous',                                                        // RATMAN    = 9  #  leur nombre                                             
  '+1 <i class="user icon"></i> for every 2 attacked non-empty areas',        // SKELETON  = 10 #  +1 pion pour toutes 2 régions non-vide conquises
  'Replace a single active neighbour enemy by new sorcerer',                  // SORCERER  = 11 #  remplace pion unique adversaire actif par un sorcier
  'Need -1 <i class="user icon"></i> when attacking a area neighbour to ' + formatArea('water'), // TRITON    = 12 #  -1 pour attaque région côtière
  '+1 defense on each owned area, even in decline',                           // TROLL     = 13 #  +1 défense sur chaque territoire même en déclin
  '+1 <i class="coins icon"></i> for each ' + formatArea('magic') + ' occupied', // WIZARD    = 14 #  +1 victoire sur source magique
]

const pwrDescr = [
  'No power',                                                               // NOPOWER     = 0
  '+2 <i class="coins icon"></i> at each round',                            // ALCHEMIST   = 1  # +2 chaque tour
  'Roll die before each attack',                                            // BERSERK     = 2  # Lancer de dé AVANT chaque attaque
  '5 defenses to place every turn, also immunising against sorcerer',       // BIVOUACKING = 3  # 5 défenses à placer à chaque tour + immunité au sorcier
  'Need -1 <i class="user icon"></i> when attacking',                       // COMMANDO    = 4  # -1 attaque
  'Peace with an enemy people at end of turn, if you havent attacked them', // DIPLOMAT    = 5  # Paix avec un peuple actif à choisir à chaque tour
  'Can conqueer an area with a dragon, which gives immunity',               // DRAGONMASTER= 6  # 1 attaque dragon par tour + immunité complète
  'All areas are neighbour',                                                // FLYING      = 7  # Toutes les régions sont voisines
  '+1 <i class="coins icon"></i> for each ' + formatArea('forest') + ' occupied', // FOREST      = 8  # +1 victoire si forêt
  'Can place 1 fortress per turn up to 6, giving +1 <i class="coins icon"></i> when active and +1 defense always', // FORTIFIED   = 9  # +1 défense avec forteresse mm en déclin, +1 par tour actif (max 6- doit limiter à +une fortress / tour
  '2 defenses to place every turn, giving full immunity',                   // HEROIC      = 10 # 2 immunités complètes
  '+1 <i class="coins icon"></i> for each ' + formatArea('hill') + ' occupied', // HILL        = 11 # +1 victoire par colline
  '+1 <i class="coins icon"></i> for each area occupied',                   // MERCHANT    = 12 # +1 victoire par région
  'Need -1 <i class="user icon"></i> when attacking a ' + formatArea('hill') + ' or ' + formatArea('farmland'), // MOUNTED     = 13 # -1 attaque colline/ferme
  '+1 <i class="coins icon"></i> for each attacked non-empty area',         // PILLAGING   = 14 # +1 par région non vide conquise
  'Only ones allowed to attack ' + formatArea('water') + ' areas',          // SEAFARING   = 15 # Conquête possible des mers/lacs, conservées en déclin
  'Can be 2 different ppl in decline, spirits never disappear',             // SPIRIT      = 16 # 2e peuple en déclin, et le reste jusqu'au bout
  'Can decline at end of the turn',                                         // STOUT       = 17 # Déclin possible juste après tour classique
  '+1 <i class="coins icon"></i> for each ' + formatArea('swamp') + ' occupied', // SWAMP       = 18 # +1 victoire par marais
  '-1 <i class="coins icon"></i> when attacking  a' + formatArea('cavern'),  // UNDERWORLD  = 19 # -1 attaque caverne, et les cavernes sont adjacentes
  '+7 <i class="coins icon"></i> after first turn',                         // WEALTHY     = 20 # +7 victoire à la fin premier tour
];

const actionsDescr = [
  'Attack one of the highlighted areas on the board',         // "attackBtn"
  'Confirm no redeploy of your people',                       // "noDeployBtn"
  'Redeploy 1 people on one board area (after keeping only 1 people per area)', // "deploy1Btn"
  'Chose one area on which apply the ability of your people', // "usePplBtn"
  'Chose one area on which apply the power of your people',   // "usePwrBtn"
  'Confirm to end your turn',                                 // "endTurnBtn"
  'Chose one area to abandon',                                // "abandonBtn"
  'Chose your people in deck below',                          // "choseBtn"
  'Confirm to decline your people',                           // "declineBtn"
];

function _bitfieldToBits(n) {
  return Array.from({ length: 8 }, (_, i) => !!(n & (1 << (7 - i))));
}

function _bitfieldToTrue(n) {
  const bitsArray = _bitfieldToBits(n);
  const indices = bitsArray.reduce((out, bool, index) => bool ? out.concat(index) : out, []);
  return indices;
}

function toShortString(nb, ppl) {
  if (ppl == 0) {
    return '';
  } else if (ppl > 0) {
     return nb + ppl_short_str[ ppl].toUpperCase();
  } else {
    return nb + ppl_short_str[-ppl];
  }
}

function toLongString(nb, ppl, power) {
  if (ppl == 0) {
    return '';
  } else if (ppl > 0) {
    return nb + 'x ' + ppl_str[ ppl] + ' + ' + pwr_str[power];
  } else {
    return nb + 'x ' + ppl_str[-ppl] + ' <i class="skull crossbones icon"></i>';
  }
}

function toDetailString(ppl, power, pplDetails, pwrDetails) {
  let result = '';

  if (ppl == 1) {         // AMAZON
    if (pplDetails > 0) {
      result += pplDetails + ' <i class="users icon"></i> loaned. ';
    }
  } else if (ppl == 6) {  // HALFLING
    if (pplDetails != 2) {
      result += (2-pplDetails) + ' <i class="shield alternate icon"></i> remaining. ';
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
      result += pwrDetails + ' <i class="shield alternate icon"></i> remaining. ';
    }
  } else if (power == 9) { // FORTIFIED
    if (pwrDetails > 0) {
      result += pwrDetails + ' <i class="shield alternate icon"></i> remaining. ';
    }
  } else if (power == 10) { // HEROIC
    if (pwrDetails > 0) {
      result += pwrDetails + ' <i class="shield alternate icon"></i> remaining. ';
    }
  }

  return result;
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
  const erosionR = 1.2;
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

/* =================== */
/* =====  LOGIC  ===== */
/* =================== */

class Smallworld extends AbstractGame {
  constructor() {
    super()
    this.validMoves = Array(sizeV[1]); this.validMoves.fill(false);
  }

  post_init_game() {
  }

  pre_move(action, manualMove) {
  }

  post_move(action, manualMove) {
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
  }

  post_set_data() {
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

}

class MoveSelector extends AbstractMoveSelector {
  constructor() {
    super();
    this.previousMoves = [];
    this.previousPlayer = -1;
  }

  // Going back to default, between moves for instance
  reset() {
  }

  // First start
  start() {
    this.selectedMoveType = -1;
    this.allowedMoveTypes = new Array(buttonInfos.length).fill(false);
    this.show2ndButtons = false;
    this.showDeck = false;
    this.nextMove = -1;
    this.update();
  }

  update() {
    // reset nextMove (but not selectedMoveType)
    this.nextMove = -1;
    // check allowed types
    for (let i = 0; i < buttonInfos.length; i++) {
      this.allowedMoveTypes[i] = game.validMoves.slice(buttonInfos[i][1], buttonInfos[i][2]+1).some(Boolean);
    }
    // decide which type to select
    if (this.selectedMoveType < 0 || !this.allowedMoveTypes[this.selectedMoveType]) {
      this.selectedMoveType = this.allowedMoveTypes.indexOf(true);
    }
    if (this.selectedMoveType < 0) {
      return;
    }
    // decide which elements to show
    this.show2ndButtons = buttonInfos[this.selectedMoveType][5];
    //this.showDeck = ['choseBtn', 'declineBtn'].includes(buttonInfos[this.selectedMoveType][0]);
    this.showDeck = true;

    // update UI
    this._updateHTML();
  }

  end() {
    this.selectedMoveType = 0;
    this.allowedMoveTypes = new Array(buttonInfos.length).fill(false);
    this.show2ndButtons = false;
    this.showDeck = false;
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

    document.getElementById('deckDivider').style = (this.showDeck) ? "" : "display: none";
    document.getElementById('deckGrid').style = (this.showDeck) ? "" : "display: none";
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
    const anyDecline = this.previousMoves.filter(x => x[0] === 8).length;
    return !!anyDecline;
  }

  clickOnButton(btn) {
    this.selectedMoveType = buttonInfos.findIndex(row => row[0] === btn);
    this.show2ndButtons = buttonInfos[this.selectedMoveType][5];
    // this.showDeck = ['choseBtn', 'declineBtn'].includes(buttonInfos[this.selectedMoveType][0]);
    this.showDeck = true;
    this._updateHTML();
    refreshBoard();
  }

  clickOnTerritory(area) {
    this.nextMove = buttonInfos[this.selectedMoveType][1] + area;
    userMove();
  }

  territoryIsClickable(area) {
    if (['choseBtn', 'noDeployBtn', 'declineBtn', 'endTurn'].includes(buttonInfos[this.selectedMoveType][0])) {
      return false;  
    }
    const virtualMove = buttonInfos[this.selectedMoveType][1] + area;
    return game.validMoves[virtualMove];
  }

  clickOnDeck(index) {
    console.assert(buttonInfos[this.selectedMoveType][0] == 'choseBtn', 'deck was clicked but was move_sel wasnot in mode choose');
    this.nextMove = 123 + index;
    userMove();
  }

  confirm() {
    if (buttonInfos[this.selectedMoveType][0] == 'noDeployBtn') {
      this.nextMove = 92;
    } else if (buttonInfos[this.selectedMoveType][0] == 'declineBtn') {
      this.nextMove = 129;
    } else if (buttonInfos[this.selectedMoveType][0] == 'endTurnBtn') {
      this.nextMove = 130;
    } else {
      return;
    } 
    userMove();
  }

  // return move, or -1 if move is undefined
  getMove() {
    return this.nextMove;
  }

}

function moveToString(move, gameMode) {
  return ''
}

/* =================== */
/* ===== DISPLAY ===== */
/* =================== */

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
      result += ' stroke="'+  strokeColor + '" stroke-width="0.8"';
      if (buttonInfos[move_sel.selectedMoveType][0] == 'attackBtn' && game.needDiceToAttack(i)) {
        result += ' stroke-dasharray="1"';
      }
    }
    result += '></polygon>';

    // Draw text
    if (data[0] > 0) {
      result += '<text x="' + computedPoints[0][0] + '" y="' + computedPoints[0][1] + '"';
      result += ' text-anchor="middle" dominant-baseline="central" font-size="0.4em" font-weight="bolder" fill="white">';
      result += toShortString(data[0], data[1])
      result += '</text>';
    }

    if (data[2] > 0) {
      result += '<text x="' + computedPoints[1][0] + '" y="' + computedPoints[1][1] + '"';
      result += ' text-anchor="middle" dominant-baseline="central" font-size="0.3em" font-weight="bolder" fill="white">';
      result += (data[2] >= 20) ? '🛇' : ('+'+data[2]);
      result += '</text>';
    }

    // Draw symbols
    result += '<text x="' + computedPoints[2][0] + '" y="' + computedPoints[2][1] + '"';
    result += ' text-anchor="middle" dominant-baseline="central" font-size="0.2em" font-weight="bolder" fill="white">';
    if (data[4][0]) {
      result += terrains_symb[0] + ' ';
    }
    if (data[4][1]) {
      result += terrains_symb[1] + ' ';
    }
    if (data[4][2]) {
      result += terrains_symb[2] + ' ';
    }
    result += '</text>';

    // Draw dot
    const lastMoveOnArea = move_sel.getTypeOfMoveOnArea(i);
    if (lastMoveOnArea !== null) {
      const moveColor = (lastMoveOnArea < 0) ? 'gray' : buttonInfos[lastMoveOnArea][3];
      result += '<circle r="1" cx="' + (computedPoints[2][0]+2) + '" cy="' + (computedPoints[2][1]+2) + '" fill="' + moveColor + '" />';
    }

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
      // Header
      const rowColor = (p == curPlayPpl[0] && ppl == curPlayPpl[1]) ? 'blue' : '';
      descr += '<div class="three wide ' + rowColor + ' column"><span class="ui big text">';
      descr += toShortString(pplInfo[0], pplInfo[1]);
      descr += '</span></div>';

      // Full name
      descr += '<div class="thirteen wide column">';
      descr += toLongString(pplInfo[5], pplInfo[1], pplInfo[2]);
      if (ppl < 2 && move_sel.hasDeclined()) {
        // Has just declined, add a dot
        descr += '<span class="ui ' + buttonInfos[8][4] + ' text">⬤</span>'
      }

      // Specific details for power/people
      const details = toDetailString(pplInfo[1], pplInfo[2], pplInfo[3], pplInfo[4]);
      if (details.length > 0) {
        descr += ' <span class="ui grey text">' + details + "</span>";
      }

      // Explanation
      descr += '<br><span class="ui small text">' + toDescr(pplInfo[0], pplInfo[1], pplInfo[2]) + '</span>';
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
  document.getElementById("boardSvg").setAttribute("viewBox", "0 0 100 70");

  // update peoples and scores
  for (let p = 0; p < nb_players; p++) {
    // document.getElementById("p"+p+"Score").innerHTML = "Player " + p + " - " + game.getScore(p) + '<i class="coins icon"></i>';
    document.getElementById("p"+p+"Score").innerHTML = (p ? "AI" : "You") + " - " + game.getScore(p) + '<i class="coins icon"></i>';
    document.getElementById("p"+p+"Ppl").innerHTML = _genPlayersInfo(p);
  }

  // update deck
  for (let i = 0; i < 6; i++) {
    deckInfo = game.getDeckInfo(i); // number, power, ppl, points
    let descr = toLongString(deckInfo[0], deckInfo[1], deckInfo[2]);
    if (deckInfo[3] > 0) {
      descr += " + " + deckInfo[3] + '<i class="coins icon"></i>';
    }

    descr += '<br>';
    descr += '<span class="ui small text">' + toDescr(deckInfo[0], deckInfo[1], deckInfo[2]) + '</span>';
    document.getElementById("deck"+i+"Descr").innerHTML = descr;
  }

  // update round
  // "Round " + game.getRound() + "/10";
  let roundDescr = '';
  const round = game.getRound();
  for (var i = 1; i <= 10; ++i) {
    roundDescr += '<div class="ui'; 
    if (i == round) {
      roundDescr += ' black';
    } else if (i > round) {
      roundDescr += ' disabled';
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

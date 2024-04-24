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
  const erosionR = 0.8;
  for (const point of points) {
    const vectorToCenter = [baryX-point[0], baryY-point[1]];
    const vectorLength = Math.sqrt(vectorToCenter[0]*vectorToCenter[0]+vectorToCenter[1]*vectorToCenter[1]);
    const newPoint = [point[0] + erosionR*vectorToCenter[0]/vectorLength, point[1] + erosionR*vectorToCenter[1]/vectorLength];
    areas.push(newPoint);
  }

  return areas;
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
    move_sel._registerMove(action);
  }

  post_move(action, manualMove) {
    // Check if attack succeeded ?
    // Print move
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

}

const buttonInfos = [
  // button     range of moveID  HTMLcolor FomanticColor  confirmation needed
  ["attackBtn"  , 23, 45,       'lime',      'green',     false],
  ["noDeployBtn", 92, 92,       'black',     'blue',      true ],
  ["deploy1Btn" , 100, 122,     'hotpink',   'pink',      false],
  ["usePplBtn"  , 46, 68,       'black',     'blue',      false],
  ["usePwrBtn"  , 69, 91,       'black',     'blue',      false],
  ["endTurnBtn" , 130, 130,     'black',     'blue',      true ],
  ["abandonBtn" , 0, 22,        'red',       'red',       false],
  ["choseBtn"   , 123, 128,     'black',     'blue',      false],
  ["declineBtn" , 129, 129,     'black',     'blue',      true ],
  // deployN 93-99 not proposed
];

class MoveSelector extends AbstractMoveSelector {
  constructor() {
    super();
    this.previousAttacks = [];
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
    this.showDeck = ['choseBtn', 'declineBtn'].includes(buttonInfos[this.selectedMoveType][0]);

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

    document.getElementById('deckDivider').style = (this.showDeck) ? "" : "display: none";
    document.getElementById('deckGrid').style = (this.showDeck) ? "" : "display: none";
  }

  _registerMove(action) {
    if (this.previousPlayer != game.nextPlayer) {
      this.previousAttacks = [];
      this.previousPlayer = game.nextPlayer;
    }
    const rowAttack = buttonInfos.find(row => row[0] === 'attackBtn');
    if (action >= rowAttack[1] && action <= rowAttack[2]) {
      const area = action - rowAttack[1];
      this.previousAttacks.push(area);
    }
  }

  _wasAPreviousAttack(area) {
    return this.previousAttacks.includes(area);
  }

  clickOnButton(btn) {
    this.selectedMoveType = buttonInfos.findIndex(row => row[0] === btn);
    this.show2ndButtons = buttonInfos[this.selectedMoveType][5];
    this.showDeck = ['choseBtn', 'declineBtn'].includes(buttonInfos[this.selectedMoveType][0]);
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

const ppl_str       = [' ', 'amazon','dwarf','elf','ghoul','giant','halfling','human','orc','ratman','skeleton','sorcerer','triton','troll','wizard', 'lost_tribe'];
const ppl_short_str = [' ', 'a'     ,'d'    ,'e'  ,'h'    ,'g'    ,'f'       ,'u'    ,'o'  ,'r'     ,'k'       ,'s'       ,'n'     ,'t'    ,'w'     , 'l'];
const pwr_str = [' ','alchemist','berserk','bivouacking','commando','diplomat','dragonmaster','flying','forest','fortified','heroic','hill','merchant','mounted','pillaging','seafaring','spirit','stout','swamp','underworld','wealthy'];

const terrains_col = [
  ['#266e3c'  ,  'green' ],  // FORESTT
  ['#eaba5e'  , 'brown' ],  // FARMLAND
  ['#39a35f'  ,  'green' ],  // HILLT
  ['#886a44'  , 'purple'],  // SWAMPT
  ['lightgrey',   'black' ],  // MOUNTAIN
  ['#61a6cf'  ,   'blue'  ],  // WATER
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
      result += ' stroke="'+  strokeColor + '" stroke-width="0.4"';
    }
    result += '></polygon>';

    // Draw text
    if (data[0] > 0) {
      result += '<text x="' + computedPoints[0][0] + '" y="' + computedPoints[0][1] + '"';
      result += ' text-anchor="middle" dominant-baseline="central" font-size="0.3em" font-weight="bolder" fill="white">';
      result += toShortString(data[0], data[1])
      result += '</text>';
    }

    if (data[2] > 0) {
      result += '<text x="' + computedPoints[1][0] + '" y="' + computedPoints[1][1] + '"';
      result += ' text-anchor="middle" dominant-baseline="central" font-size="0.3em" font-weight="bolder" fill="white">';
      result += (data[2] >= 20) ? '🚫' : ('+'+data[2]);
      result += '</text>';
    }

    // Draw dot
    if (move_sel._wasAPreviousAttack(i)) {
      result += '<circle r="1" cx="' + computedPoints[2][0] + '" cy="' + computedPoints[2][1] + '" fill="blue" />';
    }

    result += '</g>';
  }

  return result;
}

function _genPlayersInfo(p) {
  const curPlayPpl = game.getCurrentPlayerAndPeople();
  let descr = "";
  for (let ppl = 2; ppl >= 0; ppl--) {
    const pplInfo = game.getPplInfo(p, ppl); // number, ppl, power
    if (pplInfo[1] != 0) {
      // Header
      const rowColor = (p == curPlayPpl[0] && ppl == curPlayPpl[1]) ? 'blue' : '';
      descr += '<div class="three wide ' + rowColor + ' column"><span class="ui big text">';
      descr += toShortString(pplInfo[0], pplInfo[1]);
      descr += '</span></div>';

      // Full name
      descr += '<div class="thirteen wide column">';
      descr += toLongString(pplInfo[0], pplInfo[1], pplInfo[2]);
      descr += '<br>';

      // Explanation
      descr += '<span class="ui small text">Can sorcerize surrounding people if only 1 active.';
      descr += 'Can steal 1 coin to somebody once per turn if on <span class="ui brown text">swamp</span></span>';

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

  for (let p = 0; p < nb_players; p++) {
    pplDescr = document.getElementById("p"+p+"Ppl");
    pplDescr.innerHTML = _genPlayersInfo(p);
  }

  // update deck
  for (let i = 0; i < 6; i++) {
    deckInfo = game.getDeckInfo(i); // number, power, ppl, points
    let descr = toLongString(deckInfo[0], deckInfo[1], deckInfo[2]);
    if (deckInfo[3] > 0) {
      descr += " + " + deckInfo[3] + '<i class="coins icon"></i>';
    }

    descr += '<br>';
    descr += '<span class="ui small text">Can sorcerize surrounding people if only 1 active. Can steal 1 coin to somebody once per turn if on <span class="ui brown text">swamp</span></span>';
    document.getElementById("deck"+i+"Descr").innerHTML = descr;
  }
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
  // update peoples and scores
  for (let p = 0; p < nb_players; p++) {
    document.getElementById("p"+p+"Score").innerHTML = "Player " + p + " - " + game.getScore(p) + '<i class="coins icon"></i>';
  }
}

function changeMoveText() {
}

/* =================== */
/* ===== ACTIONS ===== */
/* =================== */


var game = new Smallworld();
var move_sel = new MoveSelector();

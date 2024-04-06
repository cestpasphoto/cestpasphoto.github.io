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
  }

  post_set_data() {
  }

  has_changed_on_last_move(item_vector) {
    return 0;
  }

  getTerritory(y, x) {
    return this.py.getTerritory(y, x);
  }

  getBackground(y, x) {
    return this.py.getBackground(y, x);
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

class MoveSelector extends AbstractMoveSelector {}

function moveToString(move, gameMode) {
  return ''
}

/* =================== */
/* ===== DISPLAY ===== */
/* =================== */

const ppl_str = [' ', 'AMAZON','DWARF','ELF','GHOUL','GIANT','HALFLING','HUMAN','ORC','RATMAN','SKELETON','SORCERER','TRITON','TROLL','WIZARD', 'LOST_TRIBE'];
const pwr_str = [' ','ALCHEMIST','BERSERK','BIVOUACKING','COMMANDO','DIPLOMAT','DRAGONMASTER', 'FLYING','FOREST','FORTIFIED','HEROIC','HILL','MERCHANT','MOUNTED','PILLAGING','SEAFARING','SPIRIT','STOUT','SWAMP','UNDERWORLD','WEALTHY'];

function userMove() {
  let move = Number(document.getElementById('userMoveID').value);
  game.move(move, true);
  move_sel.reset();
  refreshBoard();
  refreshButtons();

  ai_play_if_needed();
}

function refreshBoard() {
  console.log('refresh board');
  if (mainBoard.rows.length == 0) {
    // create all columns and line
    for (let y = 0; y < 8; y++) { 
      var newRow = mainBoard.insertRow(-1);
      for (let x = 0; x < 13; x++) { 
        var newCell = newRow.insertCell(-1);
        newCell.id = "cell_"+y+"_"+x;
        newCell.classList.add(game.getBackground(y, x));
        newCell.style['color'] = '#000000';
        newCell.innerHTML = ".";
      }
    }
  }

  // update board contents
  for (let y = 0; y < 8; y++) { 
    for (let x = 0; x < 13; x++) { 
      document.getElementById("cell_"+y+"_"+x).innerHTML = game.getTerritory(y, x);
    }
  }

  // update peoples and scores
  curPlayPpl = game.getCurrentPlayerAndPeople();
  for (let p = 0; p < 2; p++) {
    document.getElementById("p"+p+"Score").innerHTML = "Player " + p + " - " + game.getScore(p) + '<i class="star icon"></i>';
  }
  for (let ppl = 2; ppl >= 0; ppl--) {
    pplDescr = document.getElementById("ppl"+ppl+"Descr");
    descr = "";
    for (let p = 0; p < 2; p++) {
      pplInfo = game.getPplInfo(p, ppl); // number, ppl, power
      if (pplInfo[1] == 0) {
        descr += '<td></td>';
      } else {
        if (p == curPlayPpl[0] && ppl == curPlayPpl[1]) {
          descr += '<td class="center aligned positive">';
        } else {
          descr += '<td class="center aligned">';
        }
        descr += pplInfo[0];
        descr += ' ' + ppl_str[pplInfo[1]];
        descr += '+' + pwr_str[pplInfo[2]];
        descr += '</td> ';
      }
    }
    pplDescr.innerHTML = descr;
  }

  // update round
  document.getElementById("roundP").innerHTML = "Round " + game.getRound() + "/10";

  // update deck
  deckContent = document.getElementById("deckContent");
  deckContent.innerHTML = "";
  for (let i = 0; i < 6; i++) {
    deckInfo = game.getDeckInfo(i); // number, power, ppl, points
    deckContent.innerHTML += "<p>";
    deckContent.innerHTML += i + '<i class="star icon"></i>: ';
    deckContent.innerHTML += deckInfo[0] + "x";
    deckContent.innerHTML += " " + ppl_str[deckInfo[1]];
    deckContent.innerHTML += "+" + pwr_str[deckInfo[2]];
    deckContent.innerHTML += "+" + deckInfo[3] + '<i class="star icon"></i>';
    deckContent.innerHTML += "</p>";
  }
}

function refreshButtons(loading=false) {
  console.log('refresh buttons');
  if (!loading) {
    allBtn.style = "";
    loadingBtn.style = "display: none";
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

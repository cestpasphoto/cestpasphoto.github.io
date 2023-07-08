// Import common/game.js before this file

/* =================== */
/* =====  CONST  ===== */
/* =================== */

// Here are common constants between nogod and god modes.
// Check also constants_*.js

const list_of_files = [
  ['thelittleprince/Game.py'         , 'Game.py'],
  ['thelittleprince/proxy.py'        , 'proxy.py'],
  ['thelittleprince/MCTS.py'         , 'MCTS.py'],
  ['thelittleprince/TLPDisplay.py'   , 'TLPDisplay.py'],
  ['thelittleprince/TLPGame.py'      , 'TLPGame.py'],
  ['thelittleprince/TLPLogicNumba.py', 'TLPLogicNumba.py'],
  /*[pyConstantsFileName, 'thelittleprinceConstants.py'],*/
];

const defaultModelFileName = 'thelittleprince/model.onnx';
/*const pyConstantsFileName = 'thelittleprince/SplendorGame_2pl.py';*/
const sizeCB = [1, 55, 15];
const sizeV = [1, 9];
const nb_players = 3;

/* =================== */
/* =====  UTILS  ===== */
/* =================== */


/* =================== */
/* =====  LOGIC  ===== */
/* =================== */

class Minivilles extends AbstractGame {
  constructor() {
    super()
    this.validMoves = Array(9); this.validMoves.fill(false);
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

  getBoard() {
    return this.py.getBoard();
  }
}

class MoveSelector extends AbstractMoveSelector {}

function moveToString(move, gameMode) {
  return ''
}

/* =================== */
/* ===== DISPLAY ===== */
/* =================== */

function refreshBoard() {
  console.log('refresh board');
  document.getElementById('boardSgmt').innerHTML = game.getBoard();
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


var game = new Minivilles();
var move_sel = new MoveSelector();

// Import common/game.js before this file

/* =================== */
/* =====  CONST  ===== */
/* =================== */

// Here are common constants between nogod and god modes.
// Check also constants_*.js

const list_of_files = [
  ['minivilles/Game.py'                , 'Game.py'],
  ['minivilles/proxy.py'               , 'proxy.py'],
  ['minivilles/MCTS.py'                , 'MCTS.py'],
  ['minivilles/MinivillesDisplay.py'   , 'MinivillesDisplay.py'],
  ['minivilles/MinivillesGame.py'      , 'MinivillesGame.py'],
  ['minivilles/MinivillesLogicNumba.py', 'MinivillesLogicNumba.py'],
  /*[pyConstantsFileName, 'MinivillesConstants.py'],*/
];

const defaultModelFileName = 'minivilles/model.onnx';
/*const pyConstantsFileName = 'minivilles/SplendorGame_2pl.py';*/
const sizeCB = [1, 58, 2];
const sizeV = [1, 21];
const nb_players = 2;

/* =================== */
/* =====  UTILS  ===== */
/* =================== */


/* =================== */
/* =====  LOGIC  ===== */
/* =================== */

class Minivilles extends AbstractGame {
  constructor() {
    super()
    this.validMoves = Array(21); this.validMoves.fill(false);
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

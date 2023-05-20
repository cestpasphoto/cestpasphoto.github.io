// Variables to declare in game code
// var game = new Splendor();
// var move_sel = new MoveSelector();
// const sizeCB = [1, 25, 3];
// const sizeV = [1, onnxOutputSize];
// const list_of_files;


/* =================== */
/* =====  ONNX   ===== */
/* =================== */

var onnxSession;

// Function called by python code
async function predict(canonicalBoard, valids) {
  const cb_js = Float32Array.from(canonicalBoard.toJs({create_proxies: false}));
  const vs_js = Uint8Array.from(valids.toJs({create_proxies: false}));
  const tensor_board = new ort.Tensor('float32', cb_js, sizeCB);
  const tensor_valid = new ort.Tensor('bool'   , vs_js, sizeV);
  // console.log('canonicalboard:', tensor_board);
  // console.log('valid:', tensor_valid);
  const results = await globalThis.onnxSession.run({ board: tensor_board, valid_actions: tensor_valid });
  // console.log('results:', results);
  return {pi: Array.from(results.pi.data), v: Array.from(results.v.data)}
}

async function loadONNX(model) {
  globalThis.onnxSession = await ort.InferenceSession.create(defaultModelFileName);
  console.log('Loaded default ONNX');
}

/* =================== */
/* =====  LOGIC  ===== */
/* =================== */

class AbstractGame {
  constructor() {
    if (this.constructor == AbstractGame) {
      throw new Error("Abstract classes can't be instantiated.");
    }

    this.py = null;             // Python wrapper
    this.nextPlayer = 0;        // ID of next player
    this.previousPlayer = null; // ID of previous player
    this.gameEnded = [0, 0];    // Has player P won, for each player
    this.history = [];          // List all previous states from new to old, not including current one. Each contains an array with nextPlayer and board
    this.gameMode = 'P0';       // "P0" or "P1" to define which player is human or "AI" for AIs only or "human" for no AI
    this.numMCTSSims = 25;      // Number of MCTS simulations per move

    // To define in extended class
    this.board = null;          // Board representation (should not exist)
    this.validMoves = null;     // Array boolean with valid moves 
  }

  init_game() {
    this.nextPlayer = 0;
    this.previousPlayer = null;
    this.gameEnded = [0, 0];
    this.history = [];
    this.gameMode = 'P0';
    this.validMoves.fill(false);
    
    // Python init
    if (this.py == null) {
      console.log('Now importing python module');
      this.py = pyodide.pyimport("proxy");
    }
    let data_tuple = this.py.init_game(this.numMCTSSims).toJs({create_proxies: false});
    [this.nextPlayer, this.gameEnded, this.board, this.validMoves] = data_tuple;

    this.post_init_game();
  }

  move(action, isManualMove) {
    if (this.is_ended()) {
      console.log('Cant move, game is finished');
    } else if (!this.validMoves[action]) {
      console.log('Not a valid action', this.validMoves);
    } else {
      this.pre_move(action, isManualMove);

      // Record board
      this.history.unshift([this.nextPlayer, this.board]);
      this.previousPlayer = this.nextPlayer;
      // Actually move
      let data_tuple = this.py.getNextState(action).toJs({create_proxies: false});
      [this.nextPlayer, this.gameEnded, this.board, this.validMoves] = data_tuple;

      this.post_move(action, isManualMove);
    }  
  }

  async ai_guess_and_move() {
    if (this.is_ended()) {
      console.log('Not guessing, game is finished');
      return;
    }
    var best_action = await this.py.guessBestAction();
    this.move(best_action, false);
  }

  revert_to_previous_human_move() {
    if (this.history.length == 0) {
      return;
    }

    let player = this.who_is_human();
    // Revert to the previous 0 before a 1, or first 0 from game
    let index;
    for (index = 0; index < this.history.length; ++index) {
      if ((this.history[index][0] == player) && (index+1 == this.history.length || this.history[index+1][0] != player)) {
        break;
      }
    }
    console.log('index=', index, '/', this.history.length-1);

    // Actually revert
    console.log('board to revert:', this.history[index][1]);
    let data_tuple = this.py.setData(this.history[index][0], this.history[index][1]).toJs({create_proxies: false});
    [this.nextPlayer, this.gameEnded, this.board, this.validMoves] = data_tuple;
    this.previousPlayer = null;
    this.post_set_data();
    // Remove reverted move from history and later moves
    this.history.splice(0, index+1); 
  }

  // ----- UTILS METHODS -----

  change_difficulty(numMCTSSims) {
    this.numMCTSSims = Number(numMCTSSims);
    this.py.changeDifficulty(this.numMCTSSims);
  }

  is_ended() {
    return this.gameEnded.some(x => !!x);
  }

  is_human_player(player) {
    if (this.gameMode == 'AI') {
      return false;
    } else if (this.gameMode == 'Human') {
      return true;
    }


    if (player == 'next') {
      player = this.nextPlayer;
    } else if (player == 'previous') {
      player = this.previousPlayer;
    }
    return player == ((this.gameMode == 'P0') ? 0 : 1);
  }

  who_is_human() {
    return (this.gameMode == 'P0') ? 0 : 1;
  }

  // ----- METHODS TO EXTEND -----

  post_init_game() {}
  pre_move(action, isManualMove) {}
  post_move(action, isManualMove) {}
  post_set_data() {}
  has_changed_on_last_move(item_vector) {}
}

/* =================== */
/* ===== DISPLAY ===== */
/* =================== */


class AbstractDisplay {
  refreshBoard() {}

  refreshButtons(loading=false) {}
}

class AbstractMoveSelector {
  constructor() {
    this.stage = 0;
    this.resetAndStart();
  }

  resetAndStart() {
    this.reset();
    this.start();
  }

  reset() { }

  start() { }

  // return move, or -1 if move is undefined
  getMove() {}

  edit() {}
}

/* =================== */
/* ===== ACTIONS ===== */
/* =================== */

async function ai_play_one_move() {
  refreshButtons(loading=true);
  let aiPlayer = game.nextPlayer;
  while ((game.nextPlayer == aiPlayer) && game.gameEnded.every(x => !x)) {
    await game.ai_guess_and_move();
    refreshBoard();
  }
  refreshButtons(loading=false);
}

async function ai_play_if_needed() {
  if (game.gameMode == 'AI') {
    while (game.gameEnded.every(x => !x)) {
      await ai_play_one_move();
    }
  } else
  {
    if ((game.nextPlayer == 0 && game.gameMode == 'P1') ||
        (game.nextPlayer == 1 && game.gameMode == 'P0')) {
      await ai_play_one_move();
    }
    move_sel.resetAndStart();

    refreshBoard();
    refreshButtons();
    changeMoveText(moveToString(game.lastMove, 'AI'), 'add');
  }
}

async function changeGameMode(mode) {
  game.gameMode = mode;
  move_sel.resetAndStart();
  await ai_play_if_needed();
}


function reset() {
  game.init_game();
  move_sel.resetAndStart();

  refreshBoard();
  refreshPlayersText();
  refreshButtons();
  changeMoveText();
}

function cancel_and_undo() {
  if (move_sel.stage == 0) {
    game.revert_to_previous_human_move();
  }
  move_sel.resetAndStart();

  refreshBoard();
  refreshButtons();
  changeMoveText();
}


function edit() {
  move_sel.edit();
  refreshBoard();
  refreshButtons();
  refreshPlayersText();
}

/* =================== */
/* ===== PYODIDE ===== */
/* =================== */

// init Pyodide and stuff
async function init_code() {
  pyodide = await loadPyodide({ fullStdLib : false });
  await pyodide.loadPackage("numpy");

  // Convert list_of_files into a proper string
  var list_of_files_string = `[`;
  for (const f of list_of_files) {
    list_of_files_string += `[`;
    list_of_files_string += "'" + f[0] + "'";
    list_of_files_string += `, `;
    list_of_files_string += "'" + f[1] + "'";
    list_of_files_string += `], `;
  }
  list_of_files_string += `]`;

  await pyodide.runPythonAsync(`
    from pyodide.http import pyfetch
    for filename_in, filename_out in ${list_of_files_string}:
      response = await pyfetch(filename_in)
      with open(filename_out, "wb") as f:
        f.write(await response.bytes())
  `);
  loadONNX(); // Not "await" on purpose
  console.log('Loaded python code, pyodide ready');  
}

async function main(usePyodide=true) {
  refreshButtons(loading=true);

  if (usePyodide) {
    await init_code();
  }
  game.init_game();
  move_sel.resetAndStart();

  refreshBoard();
  refreshPlayersText();
  refreshButtons();
  changeMoveText();
}

var pyodide = null;

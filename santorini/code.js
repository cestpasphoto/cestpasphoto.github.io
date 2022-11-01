var onnxSession;

// Function called by python code
async function predict(canonicalBoard, valids) {
  const cb_js = Float32Array.from(canonicalBoard.toJs({create_proxies: false}));
  const vs_js = Uint8Array.from(valids.toJs({create_proxies: false}));
  const tensor_board = new ort.Tensor('float32', cb_js, [1, 25, 3]);
  const tensor_valid = new ort.Tensor('bool'   , vs_js, [1, 162  ]);
  // console.log('canonicalboard:', tensor_board);
  // console.log('valid:', tensor_valid);
  const results = await globalThis.onnxSession.run({ board: tensor_board, valid_actions: tensor_valid });
  // console.log('results:', results);
  return {pi: Array.from(results.pi.data), v: Array.from(results.v.data)}
}

/* =================== */
/* =====  UTILS  ===== */
/* =================== */

function encodeDirection(oldX, oldY, newX, newY) {
  let diffX = newX - oldX;
  let diffY = newY - oldY;
  if (Math.abs(diffX) > 1 || Math.abs(diffY) > 1) {
    return -1;
  }
  return ((diffY+1)*3 + (diffX+1));
}

function moveToString(move, subject='One') {
  let [worker, move_direction, build_direction] = Santorini.decodeMove(move);
  const directions_char = ['↖', '↑', '↗', '←', 'Ø', '→', '↙', '↓', '↘'];
  var description = subject + ' moved worker ' + worker + ' ' + directions_char[move_direction]
  description += ' then build ' + directions_char[build_direction];
  description += ' (move ' + move + ')';
  return description;
}

/* =================== */
/* =====  LOGIC  ===== */
/* =================== */

class Santorini {
  constructor() {
    this.py = null;
    this.board = Array.from(Array(5), _ => Array.from(Array(5), _ => Array(3).fill(0)));
    this.nextPlayer = 0;
    this.validMoves = Array(2*9*9); this.validMoves.fill(false);
    this.gameEnded = [0, 0];
    this.history = []; // List all previous states from new to old, not including current one
    this.lastMove = -1;
  }

  init_game() {
    this.history = [];
    this.lastMove = -1;
    if (pyodide == null) {
      // Random board
      this.board = Array.from(Array(5), _ => Array.from(Array(5), _ => Array(3).fill(0)));
      this.validMoves.fill(true);
      for (let y = 0; y < 5; y++) {
        for (let x = 0; x < 5; x++) {
          let worker = Math.random() * 15 - 7;
          let level = Math.random() * 9;
          this.board[y][x][0] = Math.floor((worker>0) ? worker-Math.min(5,worker) : worker-Math.max(-5,worker));
          this.board[y][x][1] = Math.floor(level - Math.min(6, level));
          /*console.log(this.board[y][x][0], this.board[y][x][1]);*/
        }
      }
    } else {
      if (this.py == null) {
        console.log('Now importing python module');
        this.py = pyodide.pyimport("proxy");
      }
      console.log('Run a game');
      let numMCTSSims = parseInt(document.getElementById('difficulty').value);
      let data_tuple = this.py.init_stuff(numMCTSSims).toJs({create_proxies: false});
      [this.nextPlayer, this.gameEnded, this.board, this.validMoves] = data_tuple;
    }
  }

  manual_move(action) {
    console.log('manual move:', action);
    if (this.validMoves[action]) {
      this._applyMove(action);
    } else {
      console.log('Not a valid action', this.validMoves);
    }    
  }


  async ai_guess_and_play() {
    if (game.gameEnded.some(x => !!x)) {
      console.log('Not guessing, game is finished');
      return;
    }
    // console.log('guessing');
    var best_action = await this.py.guessBestAction();
    this._applyMove(best_action);
  }

  _applyMove(action) {
    this.history.unshift([this.nextPlayer, this.board]);
    let data_tuple = this.py.getNextState(action).toJs({create_proxies: false});
    [this.nextPlayer, this.gameEnded, this.board, this.validMoves] = data_tuple;
    this.lastMove = action;
  }

  changeDifficulty() {
    let numMCTSSims = parseInt(document.getElementById('difficulty').value);
    this.py.changeDifficulty(numMCTSSims);
  }

  previous() {
    if (this.history.length == 0) {
      return;
    }

    let player = (gameMode.value == 'P0') ? 0 : 1;
    // find earliest move where 'player' is next player (last move if null)
    let index = 0;
    if (player != null) {
      index = this.history.findIndex(x => x[0]==player);
      if (index < 0) {
        return;
      }
      // continue to find first item of sequence
      for (; (index < this.history.length) && (this.history[index][0] == player); index++) {
      }
      index--;
    }
    console.log('index=', index, '/', this.history.length);

    // Actually revert
    console.log('board to revert:', this.history[index][1]);
    let data_tuple = this.py.setData(this.history[index][0], this.history[index][1]).toJs({create_proxies: false});
    [this.nextPlayer, this.gameEnded, this.board, this.validMoves] = data_tuple;
    this.history.splice(0, index+1); // remove reverted move from history and further moves
    this.lastMove = -1;
  }

  static decodeMove(move) {
    let worker = Math.floor(move / (9*9));
    let action_ = move % (9*9);
    let move_direction = Math.floor(action_ / 9);
    let build_direction = action_ % 9;
    return [worker, move_direction, build_direction];
  }
}

class MoveSelector {
  constructor() {
    this.resetAndStart();
    this.stage = 0; // how many taps done, finished when 3, -1 means new game
  }

  resetAndStart() {
    this.reset();
    this._select_my_workers();
  }

  reset() {
    this.cells = Array.from(Array(5), _ => Array(5).fill(false)); // 2D array containg true if cell should be selectable  
    this.stage = 0;
    this.workerID = 0, this.workerX = 0, this.workerY = 0;
    this.moveDirection = 0, this.workerNewX = 0, this.workerNewY = 0;
    this.buildDirection = 0, this.buildX = 0, this.buildY = 0;
    this.currentMove = 0;
  }

  // return move when finished, else null
  click(clicked_y, clicked_x) {
    this.stage++; 
    if (this.stage == 1) {
      // Selecting worker
      this.workerX = clicked_x;
      this.workerY = clicked_y;
      this.workerID = Math.abs(game.board[this.workerY][this.workerX][0]) - 1;
      this.currentMove = 1*9*9 * this.workerID;
      this._select_neighbours(clicked_y, clicked_x);
    } else if (this.stage == 2) {
      // Selecting worker new position
      this.workerNewX = clicked_x;
      this.workerNewY = clicked_y;
      this.moveDirection = encodeDirection(this.workerX, this.workerY, this.workerNewX, this.workerNewY);
      this.currentMove += 9*this.moveDirection;
      this._select_neighbours(clicked_y, clicked_x);
    } else if (this.stage == 3) {
      // Selecting building position
      this.buildX = clicked_x;
      this.buildY = clicked_y;
      this.buildDirection = encodeDirection(this.workerNewX, this.workerNewY, this.buildX, this.buildY);
      this.currentMove += this.buildDirection;
      return this.currentMove;
    } else if (this.stage == 4) {
      this.resetAndStart();
    } else {
      // Starting new game
      this.resetAndStart();
    }

    return null;
  }

  isSelectable(y, x) {
    return this.cells[y][x];
  }

  getPartialDescription() {
    const directions_char = ['↖', '↑', '↗', '←', 'Ø', '→', '↙', '↓', '↘'];
    var description = '';
    if (this.stage >= 1) {
      description += 'You move from ('+this.workerY+','+this.workerX+')';
    }
    if (this.stage >= 2) {
      description += ' in direction ' + directions_char[this.moveDirection];
    }
    if (this.stage >= 3) {
      description += ' and build ' + directions_char[this.buildDirection] + ' (move ' + this.currentMove + ')';
    }
    return description;
  }

  _select_neighbours(clicked_y, clicked_x) {
    for (let y = 0; y < 5; y++) {
      for (let x = 0; x < 5; x++) {
        this.cells[y][x] = this._anySubmovePossible(y, x);
      }
    }
  }

  _select_my_workers() {
    for (let y = 0; y < 5; y++) {
      for (let x = 0; x < 5; x++) {
        if ((game.nextPlayer == 0 && game.board[y][x][0] > 0) ||
            (game.nextPlayer == 1 && game.board[y][x][0] < 0)) {
          this.cells[y][x] = this._anySubmovePossible(y, x);
        } else {
          this.cells[y][x] = false;
        }
      }
    }
  }

  _select_none() {
    this.cells = Array.from(Array(5), _ => Array(5).fill(false));
  }

  _anySubmovePossible(coordY, coordX) {
    let any_move_possible = true;
    if (this.stage == 0) {
      let worker_id = Math.abs(game.board[coordY][coordX][0]) - 1;
      let moves_begin =  worker_id   *9*9;
      let moves_end   = (worker_id+1)*9*9;
      any_move_possible = game.validMoves.slice(moves_begin, moves_end).some(x => x);
    } else if (this.stage == 1) {
      // coord = worker move direction
      let move_direction = encodeDirection(this.workerX, this.workerY, coordX, coordY);
      let moves_begin = this.currentMove +  move_direction   *9;
      let moves_end   = this.currentMove + (move_direction+1)*9;
      any_move_possible = game.validMoves.slice(moves_begin, moves_end).some(x => x);
    } else if (this.stage == 2) {
      // coord = build direction
      let build_direction = encodeDirection(this.workerNewX, this.workerNewY, coordX, coordY);
      any_move_possible = game.validMoves[this.currentMove + build_direction];
    } else {
      console.log('Weird, I dont support this.stage=', this.stage, coordX, coordY);
    }
    return any_move_possible;
  }
}

/* =================== */
/* ===== DISPLAY ===== */
/* =================== */

function refreshBoard() {
  const levels_array = ['‌', '▂', '▅', '█', 'X'];
  const worker_string = '웃';
  const no_worker_string = '‌';
  for (let y = 0; y < 5; y++) {
    for (let x = 0; x < 5; x++) {
      let cell = document.getElementById('cell_' + y + '_' + x);
      let level  = game.board[y][x][1];
      let worker = game.board[y][x][0];
      let selectable = move_sel.isSelectable(y, x);

      // set cell content and color
      if (worker > 0) {
        cell_content = '<span class="ui green text">' + worker_string + '<br>' + levels_array[level] + '</span>';
      } else if (worker < 0) {
        cell_content = '<span class="ui red text">'   + worker_string + '<br>' + levels_array[level] + '</span>';
      } else {
        cell_content = '<span class="ui text">'    + no_worker_string + '<br>' + levels_array[level] + '</span>';
      }

      // set cell background and ability to be clicked
      if (selectable) {
        cell.classList.add('selectable', 'warning');
        cell.innerHTML = '<a onclick="cellClick('+y+','+x+');event.preventDefault();">' + cell_content + '</a>';
      } else {
        cell.classList.remove('selectable', 'warning');
        cell.innerHTML = cell_content;
      }
    }
  }
}

function refreshButtons(loading=false) {
  if (loading) {
    // Loading
    allBtn.style = "display: none";
    loadingBtn.style = "";
    allBtn.classList.remove('green', 'red');
  } else
  {
    allBtn.style = "";
    loadingBtn.style = "display: none";
    if (game.gameEnded.some(x => !!x)) {
      // Game is finished, looking for the winner
      console.log('End of game');
      allBtn.classList.add((game.gameEnded[0]>0) ? 'green' : 'red');
    } else {
      // Ongoing game
      allBtn.classList.remove('green', 'red');
      if (move_sel.stage <= 0) {
        undoBtn.classList.add('disabled');
      } else {
        undoBtn.classList.remove('disabled');
      }
      if (game.history.length <= 1) {
        previousBtn.classList.add('disabled');
      } else {
        previousBtn.classList.remove('disabled');
      }
    }
  }
}


function refreshPlayersText() {
  p0title.innerHTML = "Regular";
  p0details.innerHTML = "You can move one of your worker to a neighbour cell, and then build one level to another neighbour cell";
  p1title.innerHTML = "Regular";
  p1details.innerHTML = "Your Worker may move into an opponent Worker's space, if their Worker can be forced one space straight backwards to an unoccupied space at any level.";
}

function refreshMoveText(text) {
  moveSgmt.innerHTML = text;
}


/* =================== */
/* ===== ACTIONS ===== */
/* =================== */

async function ai_play_one_move() {
  refreshButtons(loading=true);
  await game.ai_guess_and_play();
  refreshBoard();
  refreshButtons(loading=false);
}

async function ai_play_if_needed() {
  if (gameMode.value == 'AI') {
    while (game.gameEnded.every(x => !x)) {
      await ai_play_one_move();
    }
  } else
  {
    if ((game.nextPlayer == 0 && gameMode.value == 'P1') ||
        (game.nextPlayer == 1 && gameMode.value == 'P0')) {
      await ai_play_one_move();
    }
    move_sel.resetAndStart();

    refreshBoard();
    refreshButtons();
    refreshMoveText(moveToString(game.lastMove, 'AI'));
  }
}

async function changeGameMode() {
  await ai_play_if_needed();
}

async function cellClick(clicked_y = null, clicked_x = null) {
  let move = move_sel.click(clicked_y == null ? -1 : clicked_y, clicked_x == null ? -1 : clicked_x);

  refreshBoard();
  refreshButtons();
  refreshMoveText(move_sel.getPartialDescription());

  if (move !== null) {
    game.manual_move(move);
    move_sel.reset();
    refreshBoard();
    refreshButtons();

    await ai_play_if_needed();
  }
}

function reset() {
  game.init_game();
  move_sel.resetAndStart();

  refreshBoard();
  refreshPlayersText();
  refreshButtons();
  refreshMoveText('');
}

function previous() {
  game.previous();
  move_sel.resetAndStart();

  refreshBoard();
  refreshButtons();
  refreshMoveText('');
}

function cancel() {
  move_sel.resetAndStart();

  refreshBoard();
  refreshButtons();
  refreshMoveText('');
}

/* =================== */
/* ===== PYODIDE ===== */
/* =================== */

// init Pyodide and stuff
async function init_code() {
  pyodide = await loadPyodide({ fullStdLib : false });
  await pyodide.loadPackage("numpy");

  globalThis.onnxSession = await ort.InferenceSession.create('./exported_model.onnx');

  await pyodide.runPythonAsync(`
    from pyodide.http import pyfetch
    for filename in ['Game.py', 'proxy.py', 'MCTS.py', 'SantoriniConstants.py', 'SantoriniDisplay.py', 'SantoriniGame.py', 'SantoriniLogicNumba.py']:
      response = await pyfetch("./"+filename)
      with open(filename, "wb") as f:
        f.write(await response.bytes())
  `)
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
  refreshMoveText('');
}

var game = new Santorini();
var move_sel = new MoveSelector();
var pyodide = null;

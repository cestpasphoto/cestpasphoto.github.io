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

class Santorini {
  constructor() {
    this.py = null;
    this.board = null;
    this.nextPlayer = 0;
    this.validMoves = Array(2*9*9); this.validMoves.fill(false);
    this.gameEnded = [0, 0];
  }

  init_game(pyodide) {
    console.log('Now importing python module');
    this.py = pyodide.pyimport("main_web");
    console.log('Run a game');
    let data_tuple = this.py.init_stuff().toJs({create_proxies: false});
    [this.nextPlayer, this.gameEnded, this.board, this.validMoves] = data_tuple;
    updateTable();
    displayNextPlayer();
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
    console.log('guessing');
    button_ai.setAttribute('class', "ui fluid primary huge elastic loading button");
    var best_action = await this.py.guessBestAction();
    // console.log('best_action:', best_action);
    this._applyMove(best_action);
    displayAIMove(best_action);
    button_ai.setAttribute('class', "ui fluid primary huge button");
  }

  _applyMove(action) {
    let data_tuple = this.py.getNextState(action).toJs({create_proxies: false});
    [this.nextPlayer, this.gameEnded, this.board, this.validMoves] = data_tuple;
    updateTable();
    displayNextPlayer();
  }

  changeDifficulty() {
    let level = parseInt(document.getElementById('difficulty').value);
    console.log('Difficuly changed to ', level);
    this.py.changeDifficulty(level);
  }

  static decodeMove(move) {
    let worker = Math.floor(move / (9*9));
    let action_ = move % (9*9);
    let move_direction = Math.floor(action_ / 9);
    let build_direction = action_ % 9;
    return worker, move_direction, build_direction;
  }
}


function updateTable() {
  levels_array = ['‌', '▂', '▅', '█', 'X'];
  worker_string = '◎'; no_worker_string = '‌';
  for (let y = 0; y < 5; y++) {
    for (let x = 0; x < 5; x++) {
      let level  = game.board[y][x][1];
      let cell = document.getElementById('cell_' + y + '_' + x);
      
      let worker = game.board[y][x][0];
      if (worker > 0) {
        cell.firstChild.innerHTML = worker_string + '<br>' + levels_array[level];
        cell.firstChild.setAttribute('class', 'ui green text');
      } else if (worker < 0) {
        cell.firstChild.innerHTML = worker_string + '<br>' + levels_array[level];
        cell.firstChild.setAttribute('class', 'ui red text');
      } else {
        cell.firstChild.innerHTML = no_worker_string + '<br>' + levels_array[level];
        cell.firstChild.setAttribute('class', 'ui text');
      }
    }
  }
}

function encodeDirection(oldX, oldY, newX, newY) {
  let diffX = newX - oldX;
  let diffY = newY - oldY;
  return ((diffY+1)*3 + (diffX+1));
}

function cellClick(stage, clicked_y = null, clicked_x = null) {
  console.log('Clicked on cell', clicked_y, clicked_x, 'stage = ', stage);
  let move_description = document.getElementById('move_description');

  if (stage == 1) {
    move_description.innerHTML = 'Move my worker';
    currentMoveTemp = 0;
  } else if (stage == 2) {
    move_description.innerHTML += ' from ('+clicked_y+','+clicked_x+')';
    workerY = clicked_y; workerX = clicked_x;
    workerID = Math.abs(game.board[workerY][workerX][0]) - 1;
    currentMoveTemp = 1*9*9 * workerID;
  } else if (stage == 3) {
    move_description.innerHTML += ' to ('+clicked_y+','+clicked_x+')';
    workerNewY = clicked_y; workerNewX = clicked_x;
    moveDirection = encodeDirection(workerX, workerY, workerNewX, workerNewY);
    currentMoveTemp += 9*moveDirection;
  } else if (stage == 0 && clicked_y != null) {
    move_description.innerHTML += ' and build on ('+clicked_y+','+clicked_x+')';
    buildY = clicked_y; buildX = clicked_x;
    buildDirection = encodeDirection(workerNewX, workerNewY, buildX, buildY);
    currentMoveTemp += buildDirection;
    move_description.innerHTML += ' action = ' + currentMoveTemp;
  } else {
    move_description.innerHTML = '';
    currentMoveTemp = 0;
  }

  for (let y = 0; y < 5; y++) {
    for (let x = 0; x < 5; x++) {
      let cell = document.getElementById('cell_' + y + '_' + x);
      let cell_content = cell.firstChild.tagName == 'SPAN' ? cell.innerHTML : cell.firstChild.innerHTML;
      if (stage == 0) {
        // default display, no selectable cell
        cell.setAttribute('class', '');
        cell.innerHTML = cell_content;
      } else if (stage == 1) {
        // Only my workers are selectable
        let cell_class = cell.firstChild.tagName == 'SPAN' ? cell.firstChild.classList : cell.firstChild.firstChild.classList;
        if ((cell_class.contains('green') && game.nextPlayer == 0) || (cell_class.contains('red') && game.nextPlayer == 1)) {
          // Set my workers to selectable
          if (anySubmovePossible(stage, x, y)) {
            cell.setAttribute('class', 'selectable warning');
            cell.innerHTML = '<a onclick="cellClick('+((stage+1)%4)+','+y+','+x+');event.preventDefault();">'+cell_content+'</a>';
          } else {
            cell.setAttribute('class', '');
            cell.innerHTML = cell_content;
          }
        } else {
          cell.setAttribute('class', '');
          cell.innerHTML = cell_content;
        }    
      } else if (stage == 2 || stage == 3) {
        // Make clicked cell blue or purple and mark neighbours as selectable
        if (x == clicked_x && y == clicked_y) {
          cell.setAttribute('class', stage == 1 ? 'right blue marked' : 'right purple marked');
          cell.innerHTML = cell_content;
        } else if (Math.abs(x-clicked_x) <= 1 && Math.abs(y-clicked_y) <= 1) {
          if (anySubmovePossible(stage, x, y)) {
            cell.setAttribute('class', 'selectable warning');
            cell.innerHTML = '<a onclick="cellClick('+((stage+1)%4)+','+y+','+x+');event.preventDefault();">'+cell_content+'</a>';
          } else {
            cell.setAttribute('class', '');
            cell.innerHTML = cell_content;
          }
        } else {
          cell.setAttribute('class', '');
          cell.innerHTML = cell_content;
        }
      }
    }  
  }

  if (stage == 0 && clicked_y != null) {
    game.manual_move(currentMoveTemp);
  }
}

function displayAIMove(move) {
  let move_description = document.getElementById('move_description');
  move_description.innerHTML = 'AI played move ' + move;

  let [worker, move_direction, build_direction] = Santorini.decodeMove(move);
  const directions_char = ['↖', '↑', '↗', '←', 'Ø', '→', '↙', '↓', '↘'];
  let description = 'moved worker ' + worker + ' ' + directions_char[move_direction] + ' and then build ' + directions_char[build_direction];
  move_description.innerHTML += ' = AI ' + description;
}

function displayNextPlayer() {
  if (game.gameEnded.some(x => !!x)) {
    console.log('End of game');
    if (game.gameEnded[0] > 0) {
      document.getElementById('nextplayer').innerHTML = 'P0';
      document.getElementById('nextplayer').setAttribute('class', 'ui big green text');
    } else {
      document.getElementById('nextplayer').innerHTML = 'P1';
      document.getElementById('nextplayer').setAttribute('class', 'ui big red text');
    }
    document.getElementById('nextplayer').nextElementSibling.innerHTML = ' won';
    document.getElementById('button_ai').setAttribute('disabled', true);
    document.getElementById('button_human').setAttribute('disabled', true);
  } else if (game.nextPlayer == 0) {
    document.getElementById('nextplayer').innerHTML = 'P0';
    document.getElementById('nextplayer').setAttribute('class', 'ui big green text');
  } else if (game.nextPlayer == 1) {
    document.getElementById('nextplayer').innerHTML = 'P1';
    document.getElementById('nextplayer').setAttribute('class', 'ui big red text');
  } else {
    document.getElementById('nextplayer').innerHTML = 'P' + game.nextPlayer;
    document.getElementById('nextplayer').setAttribute('class', 'ui big text');
  }
}

function anySubmovePossible(level, coordX, coordY) {
  if (level == 1) {
    // coord = worker
    worker_id = Math.abs(game.board[coordY][coordX][0]) - 1;
    let moves_begin =  worker_id   *9*9;
    let moves_end   = (worker_id+1)*9*9;
    any_move_possible = game.validMoves.slice(moves_begin, moves_end).some(x => x);
  } else if (level == 2) {
    // coord = worker move direction
    move_direction = encodeDirection(workerX, workerY, coordX, coordY);
    let moves_begin = currentMoveTemp +  move_direction   *9;
    let moves_end   = currentMoveTemp + (move_direction+1)*9;
    any_move_possible = game.validMoves.slice(moves_begin, moves_end).some(x => x);
  } else if (level == 3) {
    // coord = build direction
    build_direction = encodeDirection(workerNewX, workerNewY, coordX, coordY);
    any_move_possible = game.validMoves[currentMoveTemp + build_direction];
  } else {
    console.log('Weird, I dont support level=', level, coordX, coordY);
  }

  return any_move_possible;
}

// init Pyodide and stuff
async function init_code() {
  let pyodide = await loadPyodide({ fullStdLib : false });
  await pyodide.loadPackage("numpy");

  globalThis.onnxSession = await ort.InferenceSession.create('./exported_model.onnx');

  await pyodide.runPythonAsync(`
      from pyodide.http import pyfetch
      # response = await pyfetch("./mycode.zip")
      # await response.unpack_archive() # by default, unpacks to the current dir

      code_files = ['Game.py', 'main_web.py', 'MCTS.py', 'SantoriniConstants.py', 'SantoriniDisplay.py', 'SantoriniGame.py', 'SantoriniLogicNumba.py']
      for filename in code_files:
        response = await pyfetch("./"+filename)
        with open(filename, "wb") as f:
          f.write(await response.bytes())

  `)
  console.log('Loaded python code, pyodide ready');
  return pyodide
}

async function main() {
  let pyodide = await init_code();
  game.init_game(pyodide);
  button_ai.setAttribute('class', "ui fluid primary huge button");
}

var game = new Santorini();
var workerID = 0, workerX = 0, workerY = 0;
var moveDirection = 0, workerNewX = 0, workerNewY = 0;
var buildDirection = 0, buildX = 0, buildY = 0;
var currentMoveTemp = 0;

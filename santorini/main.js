// Import common/game.js before this file

/* =================== */
/* =====  CONST  ===== */
/* =================== */

// Here are common constants between nogod and god modes.
// Check also constants_*.js

const directions_char = ['↖', '↑', '↗', '←', 'Ø', '→', '↙', '↓', '↘'];

const green = '#21BA45';
const red   = '#DB2828';

const list_of_files = [
  ['santorini/Game.py', 'Game.py'],
  ['santorini/proxy.py', 'proxy.py'],
  ['santorini/MCTS.py', 'MCTS.py'],
  ['santorini/SantoriniDisplay.py', 'SantoriniDisplay.py'],
  ['santorini/SantoriniGame.py', 'SantoriniGame.py'],
  ['santorini/SantoriniLogicNumba.py', 'SantoriniLogicNumba.py'],
  [pyConstantsFileName, 'SantoriniConstants.py'],
];

const sizeCB = [1, 25, 3];
const sizeV = [1, onnxOutputSize];

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
  let [worker, power, move_direction, build_direction] = Santorini.decodeMove(move);
  var description = subject + ' moved worker ' + worker + ' ' + directions_char[move_direction]
  description += ' then build ' + directions_char[build_direction];
  description += (power > 0) ? ' with power' : '';
  description += ' [' + move + ']';
  return description;
}

function generateSvg(nb_levels, worker) {
  const width = 240, height = 240, level_height = 40, level_shrink_x = 30;
  let style = 'style=""';
  if (worker > 0) {
    style = `style="fill: ${green};"`;
  } else if (worker < 0) {
    style = `style="fill: ${red};"`;
  }

  let svg = `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xml:space="preserve">`;

  // Draw base rectangles
  let x_beg = 0, x_end = 0, y_beg = height, y_end = height;
  for (let l=0; l<nb_levels && l<3; l++) {
    x_beg = level_shrink_x * l, x_end = width - level_shrink_x * l;
    y_beg = height - level_height * l, y_end = height - level_height * (l+1);
    svg += `<polygon ${style} points="${x_beg},${y_beg} ${x_beg},${y_end} ${x_end},${y_end} ${x_end},${y_beg}"/>`;
  }

  // Draw upper item: either dome, either worker, either nothing
  if (nb_levels == 4) {
    svg += `<path d="M 70 0 A 50 50, 0, 0 1, 170 0" style="fill: blue;" transform="translate(0 ${3*level_height})"/>`;
  } else if (worker != 0) {
    svg += `<g ${style} transform="translate(70 ${height - nb_levels*level_height - 100})">`;
    if (Math.abs(worker) == 1) {
      svg += '<path d="M66.403,29.362C68.181,18.711,60.798,10,50,10l0,0c-10.794,0-18.177,8.711-16.403,19.362l2.686,16.133 c1.068,6.393,7.24,11.621,13.718,11.621l0,0c6.481,0,12.649-5.229,13.714-11.621L66.403,29.362z"/>';
      svg += '<path d="M64.007,58.001c-3.76,3.535-8.736,5.781-14.007,5.781s-10.247-2.246-14.007-5.781l-19.668,6.557 C12.845,65.716,10,69.668,10,73.333V90h80V73.333c0-3.665-2.845-7.617-6.325-8.775L64.007,58.001z"/>';
    } else {
      svg += '<path d="M83.675,64.558l-19.668-6.557c-3.76,3.535-8.736,5.781-14.007,5.781s-10.247-2.246-14.007-5.781l-19.668,6.557 C12.845,65.716,10,69.668,10,73.333V90h80V73.333C90,69.668,87.155,65.716,83.675,64.558z"/>';
      svg += '<path d="M76.328,50c-6.442-6.439-9.661-14.886-9.661-23.333h-0.029C66.862,17.282,59.87,10,50,10 c-9.863,0-16.855,7.282-16.638,16.667h-0.029c0,8.447-3.219,16.895-9.661,23.333l4.714,4.717c3.189-3.189,5.726-6.846,7.637-10.791 l0.26,1.569c1.068,6.394,7.24,11.622,13.718,11.622c6.481,0,12.649-5.228,13.714-11.622l0.264-1.572 c1.911,3.945,4.447,7.605,7.637,10.794L76.328,50z"/>';
    }
    svg += `</g>`;
  }
  svg += '</svg>';
  return svg;
}

/* =================== */
/* =====  LOGIC  ===== */
/* =================== */

class Santorini extends AbstractGame {
  constructor() {
    super()
    this.validMoves = Array(2*NB_GODS*9*9); this.validMoves.fill(false);
    this.lastMove = -1;
    this.powers = [0, 0];       // Which power each player has
    this.powers_data = [0, 0];  // Which data stored in power position
    this.cellsOfLastMove = [];
  }

  post_init_game() {
    this.lastMove = -1;
    this.cellsOfLastMove = [];

    // Find powers and power info for each player
    this._read_power_info(false);
  }

  pre_move(action, manualMove) {
    if (manualMove) {
      this.cellsOfLastMove = [];
    } else {
      this._updateLastCells(action);
    }
    this.lastMove = action;
  }

  post_move(action, manualMove) {
    this._read_power_info();    
  }

  post_set_data() {
    this.lastMove = -1;
    this.cellsOfLastMove = [];
    this._read_power_info();
  }

  has_changed_on_last_move(item_vector) {
    return this.cellsOfLastMove.some(e => e.toString() == item_vector.toString());
  }

  _updateLastCells(action) {
    let [worker, power, move_direction, build_direction] = Santorini.decodeMove(action);
    let worker_id = (worker+1) * ((this.nextPlayer==0) ? 1 : -1);
    let [workerY, workerX] = this.py._findWorker(worker_id).toJs({create_proxies: false});
    let [moveY, moveX] = Santorini._applyDirection(workerY, workerX, move_direction);
    let [buildY, buildX] = Santorini._applyDirection(moveY, moveX, build_direction);
    this.cellsOfLastMove = [[workerY, workerX]];
  }

  _read_power_info(read_data_only=true) {
    if (!read_data_only) {
      this.powers = this.py._read_power().toJs({create_proxies: false});
    }
    this.powers_data = this.py._read_power_data().toJs({create_proxies: false});
  }

  editCell(clicked_y, clicked_x, editMode) {
    this.py.editCell(clicked_y, clicked_x, editMode);
    
    if (editMode == 0) {
      let data_tuple = this.py.update_after_edit().toJs({create_proxies: false});
      [this.nextPlayer, this.gameEnded, this.validMoves] = data_tuple;
      this._read_power_info();
    }
  }

  editGod(player) {
    this.py.editGod(player, this.powers[player]);
    this._read_power_info(false);
  }

  static decodeMove(move) {
    let worker = Math.floor(move / (NB_GODS*9*9));
    let action_ = move % (NB_GODS*9*9);
    let power = Math.floor(action_ / (9*9));
    action_ = action_ % (9*9);
    let move_direction = Math.floor(action_ / 9);
    let build_direction = action_ % 9;
    return [worker, power, move_direction, build_direction];
  }

  static _applyDirection(startY, startX, direction) {
    let deltaY = Math.floor(direction / 3) - 1;
    let deltaX = (direction % 3) - 1;
    return [startY+deltaY, startX+deltaX];
  }
}

class MoveSelector extends AbstractMoveSelector {
  constructor() {
    super()
    this.resetAndStart();
    this.stage = 0; // how many taps done, finished when 3, -1 means new game
  }

  reset() {
    this.cells = Array.from(Array(5), _ => Array(5).fill(false)); // 2D array containg true if cell should be selectable  
    this.stage = 0;
    this.workerID = 0, this.workerX = 0, this.workerY = 0;
    this.moveDirection = 0, this.workerNewX = 0, this.workerNewY = 0;
    this.buildDirection = 0, this.buildX = 0, this.buildY = 0;
    this.currentMoveWoPower = 0; // Accumulate data about move being selected
    this.power = -1; // -1 = undefined, 0 = no power used, x = power delta to add on 'currentMoveWoPower'
    this.editMode = 0; // 0 = no edit mode, 1 = editing levels, 2 = editing workers
  }

  start() {
    this._select_relevant_cells();
  }

  // return move when finished, else null
  click(clicked_y, clicked_x) {
    this.stage++; 
    if (this.stage == 1) {
      // Selecting worker
      this.workerX = clicked_x;
      this.workerY = clicked_y;
      this.workerID = Math.abs(game.py._read_worker(this.workerY, this.workerX)) - 1;
      this.currentMoveWoPower = NB_GODS*9*9 * this.workerID;
    } else if (this.stage == 2) {
      // Selecting worker new position
      this.workerNewX = clicked_x;
      this.workerNewY = clicked_y;
      this.moveDirection = encodeDirection(this.workerX, this.workerY, this.workerNewX, this.workerNewY);
      this.currentMoveWoPower += 9*this.moveDirection;
    } else if (this.stage == 3) {
      // Selecting building position
      this.buildX = clicked_x;
      this.buildY = clicked_y;
      this.buildDirection = encodeDirection(this.workerNewX, this.workerNewY, this.buildX, this.buildY);
      this.currentMoveWoPower += this.buildDirection;
    } else if (this.stage == 4) {
      console.log('We are on stage 4');
      this.reset();
    } else {
      console.log('We are on stage', this.stage);
      // Starting new game
      this.reset();
    }

    this._select_relevant_cells();
  }

  togglePower(usePower) {
    this.power = (usePower ? game.powers[game.nextPlayer]*9*9 : 0);
  }

  isSelectable(y, x) {
    return this.cells[y][x];
  }

  getPartialDescription() {
    var description = '';
    if (this.stage >= 1) {
      description += 'You move from ('+this.workerY+','+this.workerX+')';
    }
    if (this.stage >= 2) {
      description += ' in direction ' + directions_char[this.moveDirection];
    }
    if (this.stage >= 3) {
      description += ' and build ' + directions_char[this.buildDirection] + ' [' + this.currentMoveWoPower + ']';
    }
    return description;
  }

  // return move, or -1 if move is undefined
  getMove() {
    if (this.stage >= 3) {
      if (this.power >= 0) {
        return this.currentMoveWoPower + this.power;
      }
      if (game.powers[game.nextPlayer] == 0) {
        this.power = 0;
        return this.currentMoveWoPower;
      }
      // If power undefined, check how many options possible
      let doableWithOutPower = game.validMoves[this.currentMoveWoPower                                   ];
      let doableWithPower    = game.validMoves[this.currentMoveWoPower + game.powers[game.nextPlayer]*9*9];
      if        ( doableWithOutPower &&  doableWithPower) {
        console.log('2 moves possible, need user to decide whether s.he wants power or not');
      } else if (!doableWithOutPower && !doableWithPower) {
        console.log('No move possible, that should not happen');
      } else if (!doableWithOutPower &&  doableWithPower) {
        this.power = game.powers[game.nextPlayer]*9*9;
        return this.currentMoveWoPower + game.powers[game.nextPlayer]*9*9;
      } else if ( doableWithOutPower && !doableWithPower) {
        this.power = 0;
        return this.currentMoveWoPower;
      }
    }
    return -1;
  }

  edit() {
    this._select_none();
    this.editMode = (this.editMode+1) % 3;
    if (this.editMode == 0) {
      game.editCell(-1, -1, 0);
      this._select_relevant_cells();
    }
  }

  _select_relevant_cells() {
    if (game.py == null) {
      return;
    }

    if (this.stage >= 3) {
      this._select_none();
    } else if (this.stage < 1) {
      for (let y = 0; y < 5; y++) {
        for (let x = 0; x < 5; x++) {
          if ((game.nextPlayer == 0 && game.py._read_worker(y,x) > 0) ||
              (game.nextPlayer == 1 && game.py._read_worker(y,x) < 0)) {
            this.cells[y][x] = this._anySubmovePossible(y, x);
          } else {
            this.cells[y][x] = false;
          }
        }
      }
    } else {
      for (let y = 0; y < 5; y++) {
        for (let x = 0; x < 5; x++) {
          this.cells[y][x] = this._anySubmovePossible(y, x);
        }
      }
    }
  }

  _select_none() {
    this.cells = Array.from(Array(5), _ => Array(5).fill(false));
  }

  // Whole function ignore value of this.power on purpose, consider both options
  _anySubmovePossible(coordY, coordX) {
    let any_move_possible = true;
    let power = game.powers[game.nextPlayer]*9*9;
    if (this.stage == 0) {
      let worker_id = Math.abs(game.py._read_worker(coordY, coordX)) - 1;
      let moves_begin = (worker_id*NB_GODS    )*9*9;
      let moves_end   = (worker_id*NB_GODS + 1)*9*9;
      any_move_possible = game.validMoves.slice(moves_begin, moves_end).some(x => x);
      if (!any_move_possible && power>0) {
        // Check if any move with power
        moves_begin += power;
        moves_end   += power;
        any_move_possible = game.validMoves.slice(moves_begin, moves_end).some(x => x);
      }
    } else if (this.stage == 1) {
      // coord = worker move direction
      let move_direction = encodeDirection(this.workerX, this.workerY, coordX, coordY);
      if (move_direction < 0) {
        return false; // Not valid move
      }
      let moves_begin = this.currentMoveWoPower +  move_direction   *9;
      let moves_end   = this.currentMoveWoPower + (move_direction+1)*9;
      any_move_possible = game.validMoves.slice(moves_begin, moves_end).some(x => x);
      if (!any_move_possible && power>0) {
        // Check if any move with power
        moves_begin += power;
        moves_end   += power;
        any_move_possible = game.validMoves.slice(moves_begin, moves_end).some(x => x);
      }
    } else if (this.stage == 2) {
      // coord = build direction
      let build_direction = encodeDirection(this.workerNewX, this.workerNewY, coordX, coordY);
      if (build_direction < 0) {
        return false; // Not valid move
      }
      any_move_possible = game.validMoves[this.currentMoveWoPower + build_direction];
      if (!any_move_possible && power>0) {
        // Check if any move with power
        any_move_possible = game.validMoves[this.currentMoveWoPower + build_direction + power];
      }
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
  let editMode = move_sel.editMode;
  for (let y = 0; y < 5; y++) {
    for (let x = 0; x < 5; x++) {
      let cell = document.getElementById('cell_' + y + '_' + x);
      let level  = game.py._read_level(y, x);
      let worker = game.py._read_worker(y, x);
      let selectable = move_sel.isSelectable(y, x);

      // generateSvg deals with nb of levels, dome, worker and color
      cell_content = '<div class="ui middle aligned tiny image">';
      if (game.has_changed_on_last_move([y,x])) {
        // Since dot only shows for AI, making it red if human is P0 else green
        let dotColor = game.is_human_player(0) ? 'red' : 'green';
        cell_content += `<div class="ui tiny ${dotColor} corner empty circular label"></div>`;
      }
      cell_content += generateSvg(level, worker) + '</div>';
      

      // set cell background and ability to be clicked
      if (editMode > 0) {
        cell.classList.add('selectable');
        cell.innerHTML = '<a onclick="cellClick('+y+','+x+');event.preventDefault();">' + cell_content + '</a>';
      } else if (selectable) {
        cell.classList.add('selectable');
        cell.innerHTML = '<a onclick="cellClick('+y+','+x+');event.preventDefault();">' + cell_content + '</a>';
      } else {
        cell.classList.remove('selectable');
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
  } else if (move_sel.editMode > 0) {
    editMsg.classList.remove('hidden');
    allBtn.style = "display: none";
    allBtn.classList.remove('green', 'red');

    editBtn.classList.remove('secondary', 'primary', 'red');
    if (move_sel.editMode == 1) {
      editBtn.classList.add('secondary');
    } else if (move_sel.editMode == 2) {
      editBtn.classList.add('primary', 'red');
    }
  } else {
    allBtn.style = "";
    loadingBtn.style = "display: none";
    if (game.is_ended()) {
      // Game is finished, looking for the winner
      console.log('End of game');
      allBtn.classList.add((game.gameEnded[0]>0) ? 'green' : 'red');
    } else {
      // Ongoing game
      allBtn.classList.remove('green', 'red');
      if (game.py.get_last_action() == null && move_sel.stage <= 0) {
        undoBtn.classList.add('disabled');
      } else {
        undoBtn.classList.remove('disabled');
      }
    }

    if (NB_GODS == 1) {
      usePowerBtn.classList.remove('basic', 'teal'); usePowerBtn.classList.add('disabled');
      noPowerBtn.classList.remove('basic', 'blue'); noPowerBtn.classList.add('disabled');
    } else {
      usePowerBtn.classList.remove('basic', 'disabled');
      noPowerBtn.classList.remove('basic', 'disabled');
      if (move_sel.stage <= 2) {
        usePowerBtn.classList.add('disabled', 'basic');
        noPowerBtn.classList.add('disabled', 'basic');
      } else if (move_sel.power < 0) {
        usePowerBtn.classList.add('basic');
        noPowerBtn.classList.add('basic');
      } else if (move_sel.power == 0) {
        usePowerBtn.classList.add('basic');
      } else {
        noPowerBtn.classList.add('basic');
      }
    }

    editMsg.classList.add('hidden');
    editBtn.classList.remove('secondary', 'primary', 'red');
  }
}

function refreshPlayersText() {
  let power = game.powers[0];
  p0title.innerHTML = gods_name[power];
  p0details.innerHTML = gods_descr[power];
  p0details.innerHTML += '<span class="ui grey text"> ' + gods_instructions[power] + '</span>';

  power = game.powers[1];
  p1title.innerHTML = gods_name[power];
  p1details.innerHTML = gods_descr[power];

  if (move_sel.editMode > 0) {
    p0title.setAttribute('onclick', 'godClick(0)');
    p0details.setAttribute('onclick', 'godClick(0)');
    p1title.setAttribute('onclick', 'godClick(1)');
    p1details.setAttribute('onclick', 'godClick(1)');
  } else {
    p0title.removeAttribute('onclick');
    p0details.removeAttribute('onclick');
    p1title.removeAttribute('onclick');
    p1details.removeAttribute('onclick');
  }
}

var movesText = [];
function changeMoveText(text, mode='reset') {
  if (mode == 'reset') {
    movesText = [];
  } else if (mode == 'edit') {
    movesText[0] = text;
  } else if (mode == 'add') {
    movesText[1] = movesText[0];
    movesText[0] = text;
  }

  moveSgmt.innerHTML = movesText.join('<br>');
}


/* =================== */
/* ===== ACTIONS ===== */
/* =================== */

function cellClick(clicked_y = null, clicked_x = null) {
  if (move_sel.editMode > 0) {
    game.editCell(clicked_y, clicked_x, move_sel.editMode);
    refreshBoard();
  } else {
    move_sel.click(clicked_y == null ? -1 : clicked_y, clicked_x == null ? -1 : clicked_x);
    let move = move_sel.getMove();

    refreshBoard();
    refreshButtons();
    changeMoveText(move_sel.getPartialDescription(), move_sel.stage == 1 ? 'add' : 'edit');

    if (move >= 0) {
      game.move(move, true);
      move_sel.reset();
      refreshBoard();
      refreshButtons();

      ai_play_if_needed();
    }
  }
}

function godClick(player) {
  game.editGod(player);
  refreshPlayersText();
}

function togglePower(state) {
  move_sel.togglePower(state);
  refreshButtons();
  refreshBoard();

  let move = move_sel.getMove();
  if (move >= 0) {
    game.move(move, true);
    move_sel.reset();
    refreshBoard();
    refreshButtons();

    ai_play_if_needed();
  }
}

function edit() {
  move_sel.edit();
  refreshBoard();
  refreshButtons();
  refreshPlayersText();
}

var game = new Santorini();
var move_sel = new MoveSelector();

/* =================== */
/* =====  CONST  ===== */
/* =================== */

const defaultModelFileName = 'model.onnx';

const tokensCoord      = [["20%", "83%"], ["20%", "53%"], ["50%", "83%"], ["50%", "53%"]];
const tokensCoordSmall = [["20%", "83%"], ["20%", "50%"], ["50%", "83%"], ["50%", "50%"]];
const tokensCoordNoble = [["25%", "83%"], ["25%", "50%"], ["25%", "16%"]];
const colors = [
    ["lightgray"  , "ghostwhite", "black"],
    ["dodgerblue" , "mediumblue", "white"],
    ["lightgreen" , "green"     , "white"],
    ["tomato"     , "red"       , "white"],
    ["dimgray"    , "black"     , "white"],
    ["lightyellow", "yellow"    , "black"],
    ["gray"       , "gray"      , "black"] // For noble
];

const different_gems_up_to_3 = [
    [0], [1], [2], [3], [4],
    [0,1], [0,2], [0,3], [0,4], [1,2], [1,3], [1,4], [2,3], [2,4], [3,4],
    [0,1,2], [0,1,3], [0,1,4], [0,2,3], [0,2,4], [0,3,4], [1,2,3], [1,2,4], [1,3,4], [2,3,4]
];

/* =================== */
/* =====  ONNX   ===== */
/* =================== */

var onnxSession;
var onnxSessionDefault;
var onnxModel;

// Function called by python code
async function predict(canonicalBoard, valids) {
  const cb_js = Float32Array.from(canonicalBoard.toJs({create_proxies: false}));
  const vs_js = Uint8Array.from(valids.toJs({create_proxies: false}));
  const tensor_board = new ort.Tensor('float32', cb_js, [1, 56, 7]);
  const tensor_valid = new ort.Tensor('bool'   , vs_js, [1, 81]);
  // console.log('canonicalboard:', tensor_board);
  // console.log('valid:', tensor_valid);
  const results = await globalThis.onnxSession.run({ board: tensor_board, valid_actions: tensor_valid });
  // console.log('results:', results);
  return {pi: Array.from(results.pi.data), v: Array.from(results.v.data)}
}

async function loadONNX(model=[]) {
    globalThis.onnxSession = await ort.InferenceSession.create(defaultModelFileName);
    console.log('Loaded default ONNX');
}

/* =================== */
/* =====  UTILS  ===== */
/* =================== */


/* =================== */
/* =====  LOGIC  ===== */
/* =================== */

class Splendor {
  constructor() {
    this.py = null;
    this.board = Array.from(Array(56), _ => Array(7).fill(0));
    this.nextPlayer = 0;
    this.gameEnded = [0, 0];
    this.validMoves = Array(81); this.validMoves.fill(false);
    this.gameMode = 'P0';
  }

  init_game() {
    // Random board
/*    for (let y = 0; y < 56; y++) {
      for (let c = 0; c < 7; c++) {
        this.board[y][c] = Math.floor(Math.random() * 6);
      }
    }*/

    if (this.py == null) {
        console.log('Now importing python module');
        this.py = pyodide.pyimport("proxy");
    }
    console.log('Run a game');
    let data_tuple = this.py.init_stuff(25).toJs({create_proxies: false});
    this.updateDifficulty();
    [this.nextPlayer, this.gameEnded, this.board, this.validMoves] = data_tuple;
  }

  manual_move(action) {
    console.log('manual move:', action);
    if (this.validMoves[action]) {
      this._applyMove(action, true);
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
    this._applyMove(best_action, false);
  }

  _applyMove(action, manualMove) {
    //this.history.unshift([this.nextPlayer, this.board]);
    /*if (manualMove) {
      this.cellsOfLastMove = [];
    } else {
      this._updateLastCells(action);
    }
    this.lastMove = action;*/

    // Actually move
    let data_tuple = this.py.getNextState(action).toJs({create_proxies: false});
    [this.nextPlayer, this.gameEnded, this.board, this.validMoves] = data_tuple;    
  }

  getBank(color) {
    return this.board[0][color];
  }

  getPlayerCard(player, color) {
    return this.board[42+player][color];
  }

  getPlayerReserved(player, index) {
    let i = 44 + 6*player + 2*index;
    let tokens = this._getTokens(i, 4);
    // card reward
    let cardColor = this.board[i+1].findIndex(x=>x>0);
    let cardPoints = this.board[i+1][cardColor];

    if (cardColor < 0) {
        return null;
    }
    return [cardColor, cardPoints, tokens]; 
  }

  getPlayerGems(player, color) {
    return this.board[34+player][color];
  }

  getPlayerNobles(player) {
    let i = 36 + 3*player;
    let noblesPoint = 0;
    for (let noble=0; noble<3; noble++) {
        let cardColor = this.board[i+2*noble+1].findIndex(x=>x>0);
        if (cardColor > 0) {
            noblesPoint += this.board[i+2*noble+1][cardColor];
        }
    }
    return noblesPoint;
  }

  getTierCard(tier, index) {
    let i = 1 + 8*tier + 2*index;
    let tokens = this._getTokens(i, 4);
    // card reward
    let cardColor = this.board[i+1].findIndex(x=>x>0);
    let cardPoints = this.board[i+1][cardColor];

    return [cardColor, cardPoints, tokens]; 
  }

  getNoble(index) {
    let i = 31 + index;
    return this._getTokens(i, 3); 
  }

  _getTokens(i, maxi) {
    // card cost
    let tokens = [];
    for (let c = 0; c < 5; c++) {
        if (this.board[i][c] > 0 && tokens.length < maxi)
            tokens.push([c, this.board[i][c]]);
    }
    return tokens
  }

  updateDifficulty() {
    this.py.changeDifficulty(Number(document.getElementById('difficultyForm').value));
  }
}

class MoveSelector {
    constructor() {
        this.reset();
    }

    click(itemType, index) {
        console.log('move selector was on ', this.selectedType, this.selectedIndex, ' + click on ', itemType, index);
        if (this.selectedType == itemType) {
            if (itemType == 'gem') {
                if (this.selectedIndex.includes(index) && this.regularSelection) {
                    this.selectedIndex = [index];
                    this.regularSelection = false;
                } else {
                    this.selectedIndex.push(index);
                    this.selectedIndex = [...new Set(this.selectedIndex)].slice(-3); // keep up to 3 unique values
                    this.regularSelection = true;
                }
            } else {
                if (itemType == 'card' && this.selectedIndex.includes(index)) {
                    this.regularSelection = !this.regularSelection;
                } else {
                    this.selectedType = itemType;
                    this.selectedIndex = [index];
                    this.regularSelection = (itemType != 'deck');
                }
            }
        } else {
            this.selectedType = itemType;
            this.selectedIndex = [index];
            this.regularSelection = (itemType != 'deck');
        }
        console.log('= move selector now is ', this.selectedType, this.selectedIndex, this.regularSelection);
    }

    isSelected(itemType, index) {
        if (this.selectedType == itemType && this.selectedIndex.includes(index)) {
            return this.regularSelection ? 1 : 2;
        }
        return false;
    }

    reset() {
        this.selectedType = 'none';
        this.selectedIndex = [];
        this.regularSelection = true;
    }

    getMoveIndex() {
        if (this.selectedType == 'card') {
            if (this.regularSelection) {
                return 0 + this.selectedIndex[0]; // buy a card
            } else {
                return 12 + this.selectedIndex[0]; // reserve a (visible) card
            }
        } else if (this.selectedType == 'deck') {
            console.assert(!(this.regularSelection), 'wrong value with deck');
            return 24 + this.selectedIndex[0]; // reserve card from deck
        } else if (this.selectedType == 'rsv') {
            console.assert(this.regularSelection, 'wrong value with rsv');
            return 27 + this.selectedIndex[0]; // buy reserved card
        } else if (this.selectedType == 'gem') {
            return 30 + this._gemsEncode(); // get gems
        }

        return -1;
    }

    getMoveShortDesc() {
         if (this.selectedType == 'card') {
            if (this.regularSelection) {
                return 'buy a card';
            } else {
                return 'reserve a card';
            }
        } else if (this.selectedType == 'deck') {
            console.assert(!(this.regularSelection), 'wrong value with deck');
            return 'reserve a card from deck'
        } else if (this.selectedType == 'rsv') {
            console.assert(this.regularSelection, 'wrong value with rsv');
            return 'buy a reserved card';
        } else if (this.selectedType == 'gem') {
            if (this.regularSelection) {
                return 'take ' + (this.selectedIndex.length) + ' gems of different color';
            } else {
                return 'take 2 gems of same color';
            }
        }

        return 'none';
    }

    _gemsEncode() {
        console.assert(this.selectedType == 'gem', 'wrong call');
        if (!this.regularSelection) {
            // Same color of gems, 2 times
            return this.selectedIndex[0] + different_gems_up_to_3.length;
        }
        // Different colors
        let toFind = this.selectedIndex.slice().sort().toString();
        let result = different_gems_up_to_3.findIndex(x => x.toString() == toFind);
        if (result < 0) {
            console.log('Cant find ', this.selectedIndex);
            return 0;
        }
        return result;
    }


/*    isSelectable(itemType, index) {
    }*/
}

/* =================== */
/* ===== DISPLAY ===== */
/* =================== */

function _svgIfSelected(selected) {
    if (!selected) {
        return "";
    }

    let color = (selected == 2) ? 'turquoise' : 'deeppink';
    return `<circle cx="85%" cy="15%" r="5px" fill="${color}"/>`;
}

function generateSvgCard(colorIndex, points, tokens, selected) {
    let [bgColor, mainColor, fontColor] = colors[colorIndex]
    let svg = `<svg viewBox="0 0 60 60">`;
    // Draw background first
    svg += `<rect width="100%" height="100%" fill="${bgColor}"/>`;
    svg += `<rect width="100%" height="30%" fill="white" fill-opacity="50%"/>`;

    // Add head elements
    svg += `<rect width="13px" height="13px" x="65%" y="5%" fill="${mainColor}"/>`;
    if (points > 0) {
        svg += `<text x="25%" y="17%" text-anchor="middle" dominant-baseline="central" font-size="20px" font-weight="bolder" fill="${fontColor}">${points}</text>`;
    }

    // Add needed tokens if any
    for (const [index, token] of tokens.entries()) {
        let [x, y] = tokensCoord[index];
        let [col, tokValue] = tokens[index];
        let [notUsed, tokCol, fontCol] = colors[col];
        svg += `<circle cx="${x}" cy="${y}" r="0.5em" fill="${tokCol}" />`;
        svg += `<text x="${x}" y="${y}" text-anchor="middle" dominant-baseline="central" font-size="0.9em" font-weight="bolder" fill="${fontCol}">${tokValue}</text>`;
    }

    svg += _svgIfSelected(selected) + `</svg>`;
    return svg; 
}

function generateSvgNbCards(colorIndex, nbCards) {
    if (nbCards <= 0) {
        return `<svg viewBox="0 0 32 32"></svg>`;
    }
    let [bgColor, mainColor, fontColor] = colors[colorIndex]
    let svg = `<svg viewBox="0 0 32 32">`;
    svg += `<rect width="100%" height="100%" fill="${mainColor}" />`;
    svg += `<text x="50%" y="50%" text-anchor="middle" dominant-baseline="central" alignment-baseline="central" font-size="1.5em" font-weight="bolder" fill="${fontColor}">${nbCards}</text>`;
    svg += `</svg>`;
    return svg;
}

function generateSvgGem(colorIndex, nbGems, selected) {
    if (nbGems <= 0) {
        return `<svg viewBox="0 0 32 32"></svg>`;
    }
    let [bgColor, mainColor, fontColor] = colors[colorIndex]
    let svg = `<svg viewBox="0 0 32 32">`;
    svg += `<circle cx="50%" cy="50%" r="50%" fill="${mainColor}" />`;
    svg += `<text x="50%" y="50%" text-anchor="middle" dominant-baseline="central" alignment-baseline="central" font-size="1.5em" font-weight="bolder" fill="${fontColor}">${nbGems}</text>`;
    svg += _svgIfSelected(selected) + `</svg>`;
    return svg;
}

function generateSvgSmall(colorIndex, points, tokens, selected) {
    console.log('GenerateSVgSmall', colorIndex);
    let [bgColor, mainColor, fontColor] = colors[colorIndex]
    let svg = `<svg viewBox="0 0 32 32">`;
    // Draw background first
    svg += `<rect width="100%" height="100%" fill="${bgColor}"/>`;
    svg += `<rect width="100%" height="33%" fill="white" fill-opacity="50%"/>`;

    // Add head elements
    svg += `<rect width="0.4em" height="0.5em" x="65%" y="5%" fill="${mainColor}"/>`;
    if (points > 0) {
        svg += `<text x="25%" y="17%" text-anchor="middle" dominant-baseline="central" font-size="0.7em" font-weight="bolder" fill="${fontColor}">${points}</text>`;
    }

    // Add needed tokens if any
    for (const [index, token] of tokens.entries()) {
        let [x, y] = tokensCoordSmall[index];
        let [col, tokValue] = tokens[index];
        let [notUsed, tokCol, fontCol] = colors[col];
        svg += `<circle cx="${x}" cy="${y}" r="0.3em" fill="${tokCol}" />`;
        svg += `<text x="${x}" y="${y}" text-anchor="middle" dominant-baseline="central" font-size="0.6em" font-weight="bolder" fill="${fontCol}">${tokValue}</text>`;
    }

    svg += _svgIfSelected(selected) + `</svg>`;
    return svg; 
}

function generateSvgNoble(tokens) {
    let [bgColor, mainColor, fontColor] = colors[6];
    let svg = `<svg viewBox="0 0 32 32">`;
    // Draw background first
    svg += `<rect width="100%" height="100%" fill="${bgColor}"/>`;
    for (const [index, token] of tokens.entries()) {
        let [x, y] = tokensCoordNoble[index];
        let [col, tokValue] = tokens[index];
        let [notUsed, tokCol, fontCol] = colors[col];
        svg += `<circle cx="${x}" cy="${y}" r="0.3em" fill="${tokCol}" />`;
        svg += `<text x="${x}" y="${y}" text-anchor="middle" dominant-baseline="central" font-size="0.5em" font-weight="bolder" fill="${fontCol}">${tokValue}</text>`;
    }

    svg += `</svg>`;
    return svg; 
}

function generateDeck(number, selected) {
    let svg = `<svg viewBox="0 0 60 60">`;
    svg += `<polygon points="0,0 60,0 60,60 0,60" fill="black"/>`;
    svg += `<text x="50%" y="50%" text-anchor="middle" dominant-baseline="central" font-size="0.9em" font-weight="bolder" fill="darkgray">${number} cards</text>`;
    svg += _svgIfSelected(selected) + `</svg>`;
    return svg;
}

function refreshBoard() {
    for (let tier = 2; tier >= 0; tier--) {
        for (let index = 0; index < 4; index++) {
            let cardInfo = game.getTierCard(tier, index);
            let isSelected = move_sel.isSelected('card', tier*4+index);
            document.getElementById('lv' + tier + '_' + index).innerHTML = `<a onclick="clickToSelect('card', ${tier*4+index});event.preventDefault();"> ${generateSvgCard(cardInfo[0], cardInfo[1], cardInfo[2], isSelected)} </a>`;
        }
        let isSelected = move_sel.isSelected('deck', tier);
        document.getElementById('lv' + tier + '_deck').innerHTML = `<a onclick="clickToSelect('deck', ${tier});event.preventDefault();"> ${generateDeck(11, isSelected)} </a>`;
    }

    for (let noble = 0; noble < 3; noble++) {
        document.getElementById('noble' + noble).innerHTML = generateSvgNoble(game.getNoble(noble));
    }

    for (let color = 0; color < 6; color++) {
        let isSelected = move_sel.isSelected('gem', color);
        if (color < 5) {
            document.getElementById('bank_c' + color).innerHTML = `<a onclick="clickToSelect('gem', ${color});event.preventDefault();"> ${generateSvgGem(color, game.getBank(color), isSelected)} </a>`;
        } else 
        {
            document.getElementById('bank_c' + color).innerHTML = generateSvgGem(color, game.getBank(color), isSelected);
        }
    }


    for (let player = 0; player < 2; player++) {
        for (let color = 0; color < 6; color++) {
            if (color < 5) {
                document.getElementById('p' + player + '_c' + color).innerHTML = generateSvgNbCards(color, game.getPlayerCard(player, color));
            }
            document.getElementById('p' + player + '_g' + color).innerHTML = generateSvgGem(color, game.getPlayerGems(player, color));
        }
    }

    for (let player = 0; player < 2; player++) {
        for (let rsvIndex = 0; rsvIndex < 3; rsvIndex++) {
            let cardInfo = game.getPlayerReserved(player, rsvIndex);
            if (cardInfo === null) {
                document.getElementById('p' + player + '_r' + rsvIndex).innerHTML = ``;
            } else if (player == 0) {
                let isSelected = move_sel.isSelected('rsv', rsvIndex);
                document.getElementById('p' + player + '_r' + rsvIndex).innerHTML = `<a onclick="clickToSelect('rsv', ${rsvIndex});event.preventDefault();"> ${generateSvgSmall(cardInfo[0], cardInfo[1], cardInfo[2], isSelected)} </a>`;
            } else {
                document.getElementById('p' + player + '_r' + rsvIndex).innerHTML = generateSvgSmall(cardInfo[0], cardInfo[1], cardInfo[2], false);
            }
        }
    }

    console.log('Nobles points for P0: ', game.getPlayerNobles(0));
    console.log('Nobles points for P1: ', game.getPlayerNobles(1));
}

function refreshButtons() {
    let move_str = move_sel.getMoveShortDesc();
    if (move_str == 'none') {
        document.getElementById('btn_confirm').innerHTML = `Click a card or gem to select action`;
        document.getElementById('btn_confirm').classList.add('disabled');
    } else {
        document.getElementById('btn_confirm').innerHTML = `Confirm to ${move_str}`;
        document.getElementById('btn_confirm').classList.remove('disabled');
    }
}

/* =================== */
/* ===== ACTIONS ===== */
/* =================== */

function clickToSelect(itemType, index) {
    move_sel.click(itemType, index);
    refreshBoard();
    refreshButtons()
    console.log('move = ', move_sel.getMoveIndex());
}

function confirmSelect() {
    let move = move_sel.getMoveIndex();
    move_sel.reset();

    // Do move
    console.log('Move = ', move);
    game.manual_move(move);

    refreshBoard();
    refreshButtons();

    ai_play_if_needed();
}

async function ai_play_one_move() {
  refreshButtons(); // Loading
  let aiPlayer = game.nextPlayer;
  while ((game.nextPlayer == aiPlayer) && game.gameEnded.every(x => !x)) {
    await game.ai_guess_and_play();
    refreshBoard();
  }
  refreshButtons(); // Loading = false
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
    move_sel.reset();

    refreshBoard();
    refreshButtons();
    /*changeMoveText(moveToString(game.lastMove, 'AI'), 'add');*/
  }
}

async function changeGameMode(mode) {
  game.gameMode = mode;
  move_sel.reset();
  await ai_play_if_needed();
}


/* =================== */
/* ======= MAIN ====== */
/* =================== */

// init Pyodide and stuff
async function init_code() {
  pyodide = await loadPyodide({ fullStdLib : false });
  await pyodide.loadPackage("numpy");

  await pyodide.runPythonAsync(`
    from pyodide.http import pyfetch
    for filename in ['Game.py', 'proxy.py', 'MCTS.py', 'SplendorGame.py', 'SplendorLogic.py', 'SplendorLogicNumba.py']:
      response = await pyfetch(filename)
      with open(filename, "wb") as f:
        f.write(await response.bytes())
  `)
  loadONNX(); // Not "await" on purpose
  console.log('Loaded python code, pyodide ready');  
}

async function main(usePyodide=true) {
  refreshButtons(loading=true);

  if (usePyodide) {
    await init_code();
  }
  game.init_game();
  move_sel.reset();

  refreshBoard();
  refreshButtons();
}

var game = new Splendor();
var move_sel = new MoveSelector();
var pyodide = null;
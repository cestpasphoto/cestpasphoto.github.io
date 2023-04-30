/* =================== */
/* =====  CONST  ===== */
/* =================== */

const defaultModelFileName = 'splendor/model.onnx';

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

const different_gems_up_to_2 = [
	[0], [1], [2], [3], [4],
	[0,1], [0,2], [0,3], [0,4], [1,2], [1,3], [1,4], [2,3], [2,4], [3,4],
];

const different_gems_up_to_3 = [
	[0], [1], [2], [3], [4],
	[0,1], [0,2], [0,3], [0,4], [1,2], [1,3], [1,4], [2,3], [2,4], [3,4],
	[0,1,2], [0,1,3], [0,1,4], [0,2,3], [0,2,4], [0,3,4], [1,2,3], [1,2,4], [1,3,4], [2,3,4],
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


function humanPlayer() {
	let player = (this.gameMode == 'P0') ? 0 : 1;
	return player;
}

/* =================== */
/* =====  LOGIC  ===== */
/* =================== */

class Splendor {
  constructor() {
		this.py = null;
		this.board = Array.from(Array(56), _ => Array(7).fill(0));
		this.nextPlayer = 0;
		this.gameEnded = [0, 0];
		this.history = [];          // List all previous states from new to old, not including current one
		this.validMoves = Array(81); this.validMoves.fill(false);
		this.gameMode = 'P0';
  }

  init_game() {
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
		this.history.unshift([this.nextPlayer, this.board, action]);

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
		let cardPoints = this.board[i+1][6];

		if (cardColor < 0) {
			return null;
		}
		return [cardColor, cardPoints, tokens]; 
  }

  getPlayerGems(player, color) {
		return this.board[34+player][color];
  }

  getTierCard(tier, index) {
		let i = 1 + 8*tier + 2*index;
		let tokens = this._getTokens(i, 4);
		// card reward
		let cardColor = this.board[i+1].findIndex(x=>x>0);
		let cardPoints = this.board[i+1][6];

		return [cardColor, cardPoints, tokens]; 
  }

  getNbCardsInDeck(tier) {
		let result = 0;
		for (let c = 0; c < 5; c++) {
			result += this.board[25 + 2*tier][c];
		}
		return result;
  }

  getNoble(index) {
		let i = 31 + index;
		return this._getTokens(i, 3); 
  }

  getPoints(player, details=false) {
		let card_points  = this.board[42 + player][6];
		let noble_points = 0;
		for (let i = player*3; i < player*3+3; i++) {
			noble_points += this.board[36 + i][6];
		}

		if (details) {
			return [card_points + noble_points, card_points, noble_points];
		} else {
			return card_points + noble_points;
		}
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

  previous() {
    if (this.history.length == 0) {
      return;
    }

    let player = (this.gameMode == 'P0') ? 0 : 1;
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
    this.history.splice(0, index+1); // remove reverted move from history and further moves
  }

  getLastActionDetails() {
  	if (this.history.length == 0) {
      return ['first', -1];
    }
  	let lastMove = this.history[0][2];
  	if (0 <= lastMove && lastMove < 12) {
  		return ['card', lastMove-0];
  	} else if (12 <= lastMove && lastMove < 12+12) {
  		return ['rsv', lastMove-12];
  	} else if (12+12 <= lastMove && lastMove < 12+15) {
  		return ['deck', lastMove-12-12];
  	} else if (12+15 <= lastMove && lastMove < 12+15+3) {
  		return ['buyrsv', lastMove-12-15];
  	} else if (12+15+3 <= lastMove && lastMove < 12+15+3+30) {
  		return ['gem', different_gems_up_to_3[lastMove-12-15-3]];
  	} else if (12+15+3+30 <= lastMove) {
  		return ['gemback', different_gems_up_to_2[lastMove-12-15-3-30]];
  	}
  }

}

class MoveSelector {
	constructor() {
		this.reset();
	}

	click(itemType, index) {
		if (this.selectedType == itemType) {
			if (itemType == 'gem' || itemType == 'gemback') {
				if (this.selectedIndex.includes(index) && this.regularSelection) {
					this.selectedIndex = [index];
					this.regularSelection = false;
				} else {
					this.selectedIndex.push(index);
					let maxGems = (itemType == 'gem') ? 3 : 2;
					this.selectedIndex = [...new Set(this.selectedIndex)].slice(-maxGems); // keep up to 3 unique values
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
	}

	isSelected(itemType, index) {
		if (this.selectedType == itemType && this.selectedIndex.includes(index)) {
			return this.regularSelection ? 1 : 2;
		}
		return 0;
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
		} else if (this.selectedType == 'buyrsv') {
			console.assert(this.regularSelection, 'wrong value with buyrsv');
			return 27 + this.selectedIndex[0]; // buy reserved card
		} else if (this.selectedType == 'gem') {
			return 30 + this._gemsEncode(); // get gems
		} else if (this.selectedType == 'gemback') {
			return 60 + this._giveGemsEncode(); // give back gems
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
		} else if (this.selectedType == 'buyrsv') {
			console.assert(this.regularSelection, 'wrong value with buyrsv');
			return 'buy a reserved card';
		} else if (this.selectedType == 'gem') {
			if (this.regularSelection) {
				if (this.selectedIndex.length == 1) {
					return 'take 1 gem';
				} else {
					return 'take ' + (this.selectedIndex.length) + ' different gems';
				}
			} else {
				return 'take 2 similar gems';
			}
		} else if (this.selectedType == 'gemback') {
			if (this.regularSelection) {
				if (this.selectedIndex.length == 1) {
					return 'give back 1 gem';
				} else {
					return 'give back ' + (this.selectedIndex.length) + ' different gems';
				}
			} else {
				return 'give back 2 similar gems';
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

	_giveGemsEncode() {
		console.assert(this.selectedType == 'gemback', 'wrong call');
		if (!this.regularSelection) {
			// Same color of gems, 2 times
			return this.selectedIndex[0] + different_gems_up_to_2.length;
		}
		// Different colors
		let toFind = this.selectedIndex.slice().sort().toString();
		let result = different_gems_up_to_2.findIndex(x => x.toString() == toFind);
		if (result < 0) {
			console.log('Cant find ', this.selectedIndex);
			return 0;
		}
		return result;
	}
}

/* =================== */
/* ===== DISPLAY ===== */
/* =================== */

function _svgIfSelected(selected) {
	if (selected == 0) {
		return "";
	}

	let color = (selected == 2) ? 'turquoise' : ((selected == 1) ? 'deeppink' : 'chocolate');
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
		return `<svg viewBox="0 0 32 32">${_svgIfSelected(selected)}</svg>`;
	}
	let [bgColor, mainColor, fontColor] = colors[colorIndex]
	let svg = `<svg viewBox="0 0 32 32">`;
	svg += `<circle cx="50%" cy="50%" r="50%" fill="${mainColor}" />`;
	svg += `<text x="50%" y="50%" text-anchor="middle" dominant-baseline="central" alignment-baseline="central" font-size="1.5em" font-weight="bolder" fill="${fontColor}">${nbGems}</text>`;
	svg += _svgIfSelected(selected) + `</svg>`;
	return svg;
}

function generateSvgSmall(colorIndex, points, tokens, selected) {
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

function generateTxtPoints(player, scoreDetails) {
	let result = ``;
	result += `<div class="ui header">${scoreDetails[0]} point(s)</div>`;
	if (scoreDetails[2] > 0) {
		result += ` (incl. ${scoreDetails[2]} by nobles)`;
	}
	return result;
}

// Return 1 if main action, 2 if secondary action, 3 if previous action
// 0 otherwise
// lastAction=null: don't check previous action (never returns 3)
// currentMove=false: don't check current move (never returns 1 nor 2)
function _getSelectMode(itemType, index, lastAction=null, currentMove=true) {
	let result = 0;
	if (currentMove) {
		result = move_sel.isSelected(itemType, index);
	}

	if (lastAction !== null && result == 0) {
		if (lastAction[0] == itemType || (itemType == 'gemback' && lastAction[0] == 'gem') || (itemType == 'card' && lastAction[0] == 'rsv')) {
			if (Array.isArray(lastAction[1])) {
				if (lastAction[1].includes(index)) {
					result = 3;
				}
			} else if (lastAction[1] == index) {
				result = 3;
			}
		}
	}

	return result;
}

function refreshBoard() {
	let lastAction = ['none', -1];
	if (move_sel.selectedType == 'none') {
		// Display last action only if user is not selecting a move
		lastAction = game.getLastActionDetails();
	}

	for (let tier = 2; tier >= 0; tier--) {
		for (let index = 0; index < 4; index++) {
			let cardInfo = game.getTierCard(tier, index);
			let selectMode = _getSelectMode('card', tier*4+index, lastAction);
			document.getElementById('lv' + tier + '_' + index).innerHTML = `<a onclick="clickToSelect('card', ${tier*4+index});event.preventDefault();"> ${generateSvgCard(cardInfo[0], cardInfo[1], cardInfo[2], selectMode)} </a>`;
		}
		let selectMode = _getSelectMode('deck', tier, lastAction);
		let nbCardsInDeck = game.getNbCardsInDeck(tier);
		document.getElementById('lv' + tier + '_deck').innerHTML = `<a onclick="clickToSelect('deck', ${tier});event.preventDefault();"> ${generateDeck(nbCardsInDeck, selectMode)} </a>`;
	}

	for (let noble = 0; noble < 3; noble++) {
		document.getElementById('noble' + noble).innerHTML = generateSvgNoble(game.getNoble(noble));
	}

	for (let color = 0; color < 6; color++) {
		let selectMode = _getSelectMode('gem', color);
		if (color < 5) {
			document.getElementById('bank_c' + color).innerHTML = `<a onclick="clickToSelect('gem', ${color});event.preventDefault();"> ${generateSvgGem(color, game.getBank(color), selectMode)} </a>`;
		} else 
		{
			document.getElementById('bank_c' + color).innerHTML = generateSvgGem(color, game.getBank(color), selectMode);
		}
	}


	for (let player = 0; player < 2; player++) {
		for (let color = 0; color < 6; color++) {
			if (color < 5) {
				document.getElementById('p' + player + '_c' + color).innerHTML = generateSvgNbCards(color, game.getPlayerCard(player, color));
			}
			if (player == humanPlayer()) {
				let selectMode = _getSelectMode('gemback', color);
				document.getElementById('p' + player + '_g' + color).innerHTML = `<a onclick="clickToSelect('gemback', ${color});event.preventDefault();"> ${generateSvgGem(color, game.getPlayerGems(player, color), selectMode)} </a>`;
			} else {
				let selectMode = _getSelectMode('gemback', color, lastAction, currentMove=false);
				document.getElementById('p' + player + '_g' + color).innerHTML = generateSvgGem(color, game.getPlayerGems(player, color), selectMode);
			}
		}
	}

	for (let player = 0; player < 2; player++) {
		for (let rsvIndex = 0; rsvIndex < 3; rsvIndex++) {
			let cardInfo = game.getPlayerReserved(player, rsvIndex);
			
				
			if (player == humanPlayer()) {
				if (cardInfo === null) {
					document.getElementById('p' + player + '_r' + rsvIndex).innerHTML = ``;
				} else {
					let selectMode = _getSelectMode('buyrsv', rsvIndex);
					document.getElementById('p' + player + '_r' + rsvIndex).innerHTML = `<a onclick="clickToSelect('buyrsv', ${rsvIndex});event.preventDefault();"> ${generateSvgSmall(cardInfo[0], cardInfo[1], cardInfo[2], selectMode)} </a>`;
				}
			} else {
				let selectMode = _getSelectMode('buyrsv', rsvIndex, lastAction, currentMove=false);
				if (cardInfo === null) {
					if (selectMode == 0) {
						document.getElementById('p' + player + '_r' + rsvIndex).innerHTML = ``;
					} else {
						document.getElementById('p' + player + '_r' + rsvIndex).innerHTML = `<svg viewBox="0 0 32 32">${_svgIfSelected(selectMode)}</svg>`;
					}
				} else {
					document.getElementById('p' + player + '_r' + rsvIndex).innerHTML = generateSvgSmall(cardInfo[0], cardInfo[1], cardInfo[2], selectMode);
				}
			}
		}

		let scoreDetails = game.getPoints(player, details=true);
		document.getElementById('p' + player + '_details').innerHTML = generateTxtPoints(player, scoreDetails);
	}
}

function refreshButtons(loading=false) {
	if (loading) {
		document.getElementById('allBtn').style = "display: none";
		document.getElementById('loadingBtn').style = "";
		return;
	} else {
		document.getElementById('allBtn').style = "";
		document.getElementById('loadingBtn').style = "display: none";
	}
	document.getElementById('btn_confirm').classList.remove('green', 'red', 'gray');

	if (game.gameEnded.some(x => !!x)) {
		// Game is finished, looking for the winner
		console.log('End of game');
		let color; let message;
		if (game.gameEnded[0]>0) {
			if (game.gameEnded[1]>0) {
				color = 'gray'; message = 'TIE';
			} else {
				color = 'green'; message = 'P0 wins';
			}
		} else {
			color = 'red'; message = 'P1 wins';
		}
		document.getElementById('btn_confirm').classList.add(color, 'disabled');
		document.getElementById('btn_confirm').innerHTML = `END OF GAME - ` + message;
	} else {
		let move_str = move_sel.getMoveShortDesc();
		let move = move_sel.getMoveIndex();
		
		if (move_str == 'none') {
			document.getElementById('btn_confirm').innerHTML = `CLICK ON A CARD OR A GEM`;
			document.getElementById('btn_confirm').classList.add('disabled', 'green');
		} else if (game.validMoves[move]) {
			document.getElementById('btn_confirm').innerHTML = `Confirm to ${move_str}`;
			document.getElementById('btn_confirm').classList.remove('disabled');
			document.getElementById('btn_confirm').classList.add('green');
		} else {
			document.getElementById('btn_confirm').innerHTML = `Cannot ${move_str}`;
			document.getElementById('btn_confirm').classList.add('disabled');
		}
	}
}

/* =================== */
/* ===== ACTIONS ===== */
/* =================== */

function clickToSelect(itemType, index) {
	move_sel.click(itemType, index);
	refreshBoard();
	refreshButtons()
}

function confirmSelect() {
	let move = move_sel.getMoveIndex();
	let descr = move_sel.getMoveShortDesc();
	move_sel.reset();

	// Do move
	console.log('Move = ', move, ' = ', descr);
	game.manual_move(move);

	refreshBoard();
	refreshButtons();

	ai_play_if_needed();
}

function cancel_and_undo() {
  if (move_sel.selectedType == 'none') {
    game.previous();
  }
  move_sel.reset();

  refreshBoard();
  refreshButtons();
}

async function ai_play_one_move() {
  refreshButtons(loading=true);
  let aiPlayer = game.nextPlayer;
  while ((game.nextPlayer == aiPlayer) && game.gameEnded.every(x => !x)) {
		await game.ai_guess_and_play();
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
		response = await pyfetch('splendor/'+filename)
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
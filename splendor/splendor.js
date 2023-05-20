// Import common.js before this file

/* =================== */
/* =====  CONST  ===== */
/* =================== */

const colors = [
	["gainsboro"  , "ghostwhite", "black"], // white
	["dodgerblue" , "mediumblue", "white"], // blue
	["lightgreen" , "green"     , "white"], // green
	["tomato"     , "red"       , "white"], // red
	["dimgray"    , "black"     , "white"], // black
	["lightyellow", "yellow"    , "black"], // yellow
	["darkgray"   , "darkgray"  , "black"]  // For noble
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

const all_nobles = [
	[[2,4], [3,4]],
	[[3,4], [4,4]],
	[[1,4], [2,4]],
	[[0,4], [4,4]],
	[[0,4], [1,4]],
	[[0,3], [3,3], [4,3]],
	[[0,3], [1,3], [2,3]],
	[[2,3], [3,3], [4,3]],
	[[1,3], [2,3], [3,3]],
	[[0,3], [1,3], [4,3]],
];

const list_of_files = [
	['splendor/Game.py', 'Game.py'],
	['splendor/proxy.py', 'proxy.py'],
	['splendor/MCTS.py', 'MCTS.py'],
	['splendor/SplendorGame.py', 'SplendorGame.py'],
	['splendor/SplendorLogic.py', 'SplendorLogic.py'],
	['splendor/SplendorLogicNumba.py', 'SplendorLogicNumba.py'],
];

const defaultModelFileName = 'splendor/model.onnx';
const sizeCB = [1, 56, 7];
const sizeV = [1, 81];

const tokensCoord      = [["20%", "83%"], ["20%", "53%"], ["50%", "83%"], ["50%", "53%"]];
const tokensCoordSmall = [["20%", "83%"], ["20%", "50%"], ["50%", "83%"], ["50%", "50%"]];
const tokensCoordNoble = [["25%", "83%"], ["25%", "50%"], ["25%", "16%"]];

/* =================== */
/* =====  LOGIC  ===== */
/* =================== */

class Splendor extends AbstractGame {
  constructor() {
  	super()
		this.py = null;
		this.board = Array.from(Array(56), _ => Array(7).fill(0));
		this.validMoves = Array(81); this.validMoves.fill(false);
  }

  post_move(action, manualMove) {
		if (editedGame) {
			// If game was edited, and that we just took a random card, propose user to edit it
			if (action < 12+12) {
				let tier = Math.floor((action%12) / 4);
				let index = (action%12)%4;
				startEdit(tier, index, true);
			} else if (action < 12+15) {
				console.log('I cant let you edit the deck card that was just reserved')
			}
		}
  }

  getBank(color) {
		return this.py.getBank(color);
  }

  getPlayerNbCards(player, color) {
		return this.py.getPlayerNbCards(player, color);
  }

  getPlayerReserved(player, index) {
		return this.py.getPlayerReserved(player, index).toJs({create_proxies: false});
  }

  getPlayerGems(player, color) {
		return this.py.getPlayerGems(player, color);
  }

  getTierCard(tier, index) {
		return this.py.getTierCard(tier, index).toJs({create_proxies: false});
  }

  getNbCardsInDeck(tier) {
		return this.py.getNbCardsInDeck(tier);
	}

  getNoble(index) {
		return this.py.getNoble(index).toJs({create_proxies: false});
  }

  getPoints(player, details=false) {
		if (details) {
			return this.py.getPoints(player, details).toJs({create_proxies: false});
		} else {
			return this.py.getPoints(player, details);
		}
  }

  _changeDeckCard(tier, color, points, selectedIndexInDeck, locationIndex, lapidaryMode) {
		let data_tuple = this.py.changeDeckCard(tier, color, points, selectedIndexInDeck, locationIndex, lapidaryMode).toJs({create_proxies: false});
		[this.nextPlayer, this.gameEnded, this.board, this.validMoves] = data_tuple;  	
  }

  _changeNoble(index, nobleId, assignedPlayer) {
		let data_tuple = this.py.changeNoble(index, nobleId, assignedPlayer).toJs({create_proxies: false});
		[this.nextPlayer, this.gameEnded, this.board, this.validMoves] = data_tuple;  	
  }

  _changeGemOrNbCards(player, color, type, delta) {
  	let data_tuple = this.py.changeGemOrNbCards(player, color, type, delta).toJs({create_proxies: false});
		[this.nextPlayer, this.gameEnded, this.board, this.validMoves] = data_tuple;
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

  update() {
  	let data_tuple = this.py.setData(null, this.board).toJs({create_proxies: false});
		[this.nextPlayer, this.gameEnded, this.board, this.validMoves] = data_tuple;
  }
}

class MoveSelector extends AbstractMoveSelector {
	constructor() {
		super()
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

	edit() {

	}
}

class CardEditor {
	constructor(tier, index) {
		if (tier >= 0 && index >= 0) {
			this.setInitialState(tier, index, false);
		}
		this.lapidaryMode = false;
	}

	setInitialState(tier, index, lookup=true) {
		this.tier = tier;
		this.index = index;
		this.currentCard = game.getTierCard(tier, index);
		this.selectedColor = this.currentCard[0];
		this.selectedPoints = this.currentCard[1];
		this.cardsInfo = (lookup ? this._getMatchingCards() : []);
	}

	refresh() {
		// Title
		let title = "Edit card - ";
		title += ["1st", "2nd", "3rd", "4th"][this.index];
		title += " on ";
		title += ["bottom", "middle", "top"][this.tier];
		title += " line";
		document.getElementById('mod_head').innerHTML = title;

		// Small cards
		for (let index = 0; index < 4; index++) {
			let cardInfo = game.getTierCard(this.tier, index);
			let selectMode = (index == this.index) ? 1 : 0;
			document.getElementById('editor_info' + index).innerHTML = generateSvgSmall(cardInfo[0], cardInfo[1], cardInfo[2], selectMode);
		}

		// Buttons
		for (let index = 0; index < 5; index++) {
			if (index == this.selectedColor) {
				document.getElementById('mod_but_col' + index).classList.remove('basic');
			} else {
				document.getElementById('mod_but_col' + index).classList.add('basic');
			}
		}
		for (let index = 0; index < 6; index++) {
			if (index == this.selectedPoints) {
				document.getElementById('mod_but_pts' + index).classList.remove('basic');
			} else {
				document.getElementById('mod_but_pts' + index).classList.add('basic');
			}
		}

		// Proposed cards
		for (let index = 0; index < this.cardsInfo.length; index++) {
			let cardInfo = this.cardsInfo[index];
			let selectMode = (this.currentCard.toString() == cardInfo.toString()) ? 1 : 0;
			document.getElementById('sel_c' + index).innerHTML = `<a onclick="cardEditor.clickToEdit(${index});event.preventDefault();"> ${generateSvgCard(cardInfo[0], cardInfo[1], cardInfo[2], selectMode)} </a>`;
		}
		for (let index = this.cardsInfo.length; index < 8; index++) {
			document.getElementById('sel_c' + index).innerHTML = `<svg viewBox="0 0 60 60"></svg>`;
		}
	}

	clickToEdit(cardIndex) {
		game._changeDeckCard(this.tier, this.selectedColor, this.selectedPoints, cardIndex, this.index, this.lapidaryMode);

		let next_tier = (this.index==3) ? this.tier+1 : this.tier;
		let next_index = (this.index+1) % 4;
		if (next_tier >= 3) {
			this.btnNext()
		} else {
			this.setInitialState(next_tier, next_index);
			this.refresh();
		}
	}

	buttonClick(btnId) {
		if (btnId.substr(-4, 3) == 'col') {
			this.selectedColor = Number(btnId.substr(-1));
		} else {
			this.selectedPoints = Number(btnId.substr(-1));
		}
		this.cardsInfo = this._getMatchingCards();
		this.refresh();
	}

	_getMatchingCards() {
		let results = game.py.filterCards(this.tier, this.selectedColor, this.selectedPoints).toJs({create_proxies: false});
		return results;
	}

	btnNext() {
		nobleEditor.setInitialState();
		document.getElementById('card_editor').style = "display: none";
		document.getElementById('noble_editor').style = "";
		nobleEditor.refresh();
		currentEditor = nobleEditor;

		document.getElementById('edit_next_section').innerHTML = "Edit gems";
	}	
}

class NobleEditor {
	constructor() {
		this.setInitialState();
	}

	setInitialState() {
		this.selectedSlot = 0;
		this.assignations = [-1, -1, -1];

		this.noblesId = [-2, -2, -2];
		if (game.py !== null) {
			for (let i = 0; i < 3; ++i) {
				this.noblesId[i] = this._findNobleId(game.getNoble(i));
			}
		}
	}

	refresh() {
		// Title
		let title = "Edit nobles";
		document.getElementById('mod_head').innerHTML = title;

		// Bank nobles
		for (let index = 0; index < 3; index++) {
			let noble = all_nobles[this.noblesId[index]];
			document.getElementById('bank_noble' + index).innerHTML = generateSvgNoble(noble, (index == this.selectedSlot) ? 1 : 0);
		}

		// Buttons
		for (let index = -1; index < 2; index++) {
			if (index == this.assignations[this.selectedSlot]) {
				document.getElementById('noble_assign_P' + index).classList.remove('basic');
			} else {
				document.getElementById('noble_assign_P' + index).classList.add('basic');
			}
		}

		// (constant) Nobles list
		for (let index = 0; index < 10; index++) {
			document.getElementById('avail_noble' + index).innerHTML = generateSvgNoble(all_nobles[index]);
		}
	}

	clickToEdit(btnId) {
		if (btnId.substr(0,5) == 'avail') {
			this.noblesId[this.selectedSlot] = Number(btnId.substr(11));
		} else {
			// Assign noble to a player / bank
			this.assignations[this.selectedSlot] = Number(btnId.substr(14));
		}
		game._changeNoble(this.selectedSlot, this.noblesId[this.selectedSlot], this.assignations[this.selectedSlot]);


		if (this.selectedSlot+1 < 3) {
			++this.selectedSlot;
			this.refresh();
		} else {
			this.btnNext();
		}
	}

	buttonClick(btnId) {
		this.selectedSlot = Number(btnId.substr(10));
		this.refresh();
	}

	_findNobleId(tokens) {
		let tokens_str = tokens.toString();
		for (let i = 0; i < all_nobles.length; ++i) {
			if (tokens_str == all_nobles[i].toString()) {
				return i;
			}
		}
		return -1;
	}

	btnNext() {
		gemEditor.setInitialState();
		document.getElementById('noble_editor').style = "display: none";
		document.getElementById('gem_editor').style = "";
		gemEditor.refresh();
		currentEditor = gemEditor;

		document.getElementById('edit_next_section').innerHTML = "Edit cards";
	}
}

class GemEditor {
	constructor() {
		this.setInitialState();
	}

	setInitialState() {
		this.selectedPlayer = -1;
	}

	refresh() {
		// Title
		let title = "Edit bank/players";
		document.getElementById('mod_head').innerHTML = title;

		// Buttons
		for (let index = -1; index < 2; index++) {
			if (index == this.selectedPlayer) {
				document.getElementById('editor_P' + index).classList.remove('basic');
			} else {
				document.getElementById('editor_P' + index).classList.add('basic');
			}
		}

		// Gems and cards
		for (let index = 0; index < 6; index++) {
			let nbGems = (this.selectedPlayer < 0) ? game.getBank(index) : game.getPlayerGems(this.selectedPlayer, index);
			document.getElementById('editor_g' + index).innerHTML = generateSvgGem(index, nbGems, 0, false);
		}

		if (this.selectedPlayer < 0) {
			document.getElementById('editor_c_grid').style = "display: none";
		} else {
			document.getElementById('editor_c_grid').style = "";
			for (let index = 0; index < 5; index++) {
				let nbCards = game.getPlayerNbCards(this.selectedPlayer, index);
				document.getElementById('editor_c' + index).innerHTML = generateSvgNbCards(index, nbCards, false);
			}
		}
	}

	clickToEdit(btnId) {
		editor_g0_plus
		let btnInfo = btnId.split('_');
		let type = (btnInfo[1][0] == 'g') ? 'gem' : 'card';
		let color = Number(btnInfo[1][1]);
		let delta = (btnInfo[2] == 'plus') ? +1 : -1;

		game._changeGemOrNbCards(this.selectedPlayer, color, type, delta);
		this.refresh();
	}

	buttonClick(btnId) {
		this.selectedPlayer = Number(btnId.substr(8));
		this.refresh();
	}

	btnNext() {
		cardEditor.setInitialState(0, 0);
		document.getElementById('gem_editor').style = "display: none";
		document.getElementById('card_editor').style = "";
		cardEditor.refresh();
		currentEditor = cardEditor;

		document.getElementById('edit_next_section').innerHTML = "Edit nobles";
	}
}

/* =================== */
/* ===== DISPLAY ===== */
/* =================== */

function _svgIfSelected(selected, isCircle=false) {
	if (selected == 0) {
		return "";
	}

	let color = (selected == 1) ? 'aquamarine' : 'tan';
	if (selected == 3) {
		return `<circle cx="85%" cy="15%" r="5px" fill="${color}"/>`;
	}	else if (isCircle) {
		return `<circle cx="50%" cy="50%" r="45%" style="fill:none;stroke-width:10%;stroke:${color}" />`;
	} else {
		return `<rect width="100%" height="100%" style="fill:none;stroke-width:10%;stroke:${color}" />`;
	}
}

function generateSvgCard(colorIndex, points, tokens, selected) {
	let [bgColor, mainColor, fontColor] = colors[colorIndex]
	let svg = `<svg class="svgL" viewBox="0 0 60 60">`;
	// Draw background first
	svg += `<rect width="100%" height="100%" fill="${bgColor}"/>`;
	svg += `<rect width="100%" height="30%" fill="white" fill-opacity="50%"/>`;

	// Add head elements
	svg += `<rect width="13px" height="13px" x="65%" y="5%" fill="${mainColor}"/>`;
	if (points > 0) {
		svg += `<text x="25%" y="17%" text-anchor="middle" dominant-baseline="central" font-size="16px" font-weight="bolder" fill="${fontColor}">${points}</text>`;
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

function generateSvgNbCards(colorIndex, nbCards, hideIfZero=true) {
	if (nbCards <= 0 && hideIfZero) {
		return `<svg class="svgS" viewBox="0 0 32 32"></svg>`;
	}
	let [bgColor, mainColor, fontColor] = colors[colorIndex]
	let svg = `<svg class="svgS" viewBox="0 0 32 32">`;
	svg += `<rect width="100%" height="100%" fill="${mainColor}" />`;
	svg += `<text x="50%" y="50%" text-anchor="middle" dominant-baseline="central" alignment-baseline="central" font-size="1.5em" font-weight="bolder" fill="${fontColor}">${nbCards}</text>`;
	svg += `</svg>`;
	return svg;
}

function generateSvgGem(colorIndex, nbGems, selected, hideIfZero=true) {
	if (nbGems <= 0 && hideIfZero) {
		return `<svg class="svgS" viewBox="0 0 32 32">${_svgIfSelected(selected, true)}</svg>`;
	}
	let [bgColor, mainColor, fontColor] = colors[colorIndex]
	let svg = `<svg class="svgS" viewBox="0 0 32 32">`;
	svg += `<circle cx="50%" cy="50%" r="50%" fill="${mainColor}" />`;
	svg += `<text x="50%" y="50%" text-anchor="middle" dominant-baseline="central" alignment-baseline="central" font-size="1.5em" font-weight="bolder" fill="${fontColor}">${nbGems}</text>`;
	svg += _svgIfSelected(selected, true) + `</svg>`;
	return svg;
}

function generateSvgSmall(colorIndex, points, tokens, selected) {
	let [bgColor, mainColor, fontColor] = colors[colorIndex]
	let svg = `<svg class="svgS" viewBox="0 0 32 32">`;
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

function generateSvgNoble(tokens, selected=0) {
	let [bgColor, mainColor, fontColor] = colors[6];
	let svg = `<svg class="svgS" viewBox="0 0 32 32">`;
	// Draw background first
	svg += `<rect width="100%" height="100%" fill="${bgColor}"/>`;
	for (const [index, token] of tokens.entries()) {
		let [x, y] = tokensCoordNoble[index];
		let [col, tokValue] = tokens[index];
		let [notUsed, tokCol, fontCol] = colors[col];
		svg += `<rect x="calc(${x} - 0.3em)" y="calc(${y} - 0.3em)" width="0.6em" height="0.6em" fill="${tokCol}" />`;
		svg += `<text x="${x}" y="${y}" text-anchor="middle" dominant-baseline="central" font-size="0.5em" font-weight="bolder" fill="${fontCol}">${tokValue}</text>`;
	}

	svg += _svgIfSelected(selected) + `</svg>`;
	return svg; 
}

function generateDeck(number, selected) {
	let svg = `<svg class="svgL" viewBox="0 0 60 60">`;
	svg += `<polygon points="0,0 60,0 60,60 0,60" fill="black"/>`;
	svg += `<text x="50%" y="50%" text-anchor="middle" dominant-baseline="central" font-size="0.9em" font-weight="bolder" fill="darkgray">${number} cards</text>`;
	svg += _svgIfSelected(selected) + `</svg>`;
	return svg;
}

function generateTxtPoints(player, scoreDetails) {
	let result = game.is_human_player(player) ? `You - ` : ` AI - `;
	result += `${scoreDetails[0]} point(s)`;
	if (scoreDetails[2] > 0) {
		result += ` incl. ${scoreDetails[2]} by nobles`;
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
	if (!game.is_human_player('previous')) {
		// Previous mode was from AI
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
		} else {
			document.getElementById('bank_c' + color).innerHTML = generateSvgGem(color, game.getBank(color), selectMode);
		}
	}


	for (let player = 0; player < 2; player++) {
		for (let color = 0; color < 6; color++) {
			if (color < 5) {
				document.getElementById('p' + player + '_c' + color).innerHTML = generateSvgNbCards(color, game.getPlayerNbCards(player, color));
			}
			if (game.is_human_player(player)) {
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
			
				
			if (game.is_human_player(player)) {
				if (cardInfo[0] < 0) {
					document.getElementById('p' + player + '_r' + rsvIndex).innerHTML = ``;
				} else {
					let selectMode = _getSelectMode('buyrsv', rsvIndex);
					document.getElementById('p' + player + '_r' + rsvIndex).innerHTML = `<a onclick="clickToSelect('buyrsv', ${rsvIndex});event.preventDefault();"> ${generateSvgSmall(cardInfo[0], cardInfo[1], cardInfo[2], selectMode)} </a>`;
				}
			} else {
				let selectMode = _getSelectMode('buyrsv', rsvIndex, lastAction, currentMove=false);
				if (cardInfo[0] < 0) {
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

	if (game.is_ended()) {
		// Game is finished, looking for the winner
		console.log('End of game');
		let color; let message;
		if (game.gameEnded[0]>0) {
			if (game.gameEnded[1]>0) {
				color = 'gray'; message = 'Tie game';
			} else {
				color = 'green'; message = 'P0 wins';
			}
		} else {
			color = 'red'; message = 'P1 wins';
		}
		document.getElementById('btn_confirm').classList.add(color, 'disabled');
		document.getElementById('btn_confirm').classList.remove('basic');
		document.getElementById('btn_confirm').innerHTML = message;
	} else {
		let move_str = move_sel.getMoveShortDesc();
		let move = move_sel.getMoveIndex();
		
		if (move_str == 'none') {
			document.getElementById('btn_confirm').innerHTML = `CLICK ON A CARD OR A GEM`;
			document.getElementById('btn_confirm').classList.add('disabled', 'green', 'basic');
		} else if (game.validMoves[move]) {
			document.getElementById('btn_confirm').innerHTML = `Confirm to ${move_str}`;
			document.getElementById('btn_confirm').classList.remove('disabled', 'basic');
			document.getElementById('btn_confirm').classList.add('green');
		} else {
			document.getElementById('btn_confirm').innerHTML = `Cannot ${move_str}`;
			document.getElementById('btn_confirm').classList.add('disabled', 'basic');
		}
	}
}

function refreshPlayersText() {

}

function changeMoveText() {

}

function moveToString(move, gameMode) {
	return ''
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
	game.move(move, true);

	refreshBoard();
	refreshButtons();

	if (!editionOngoing) {
		ai_play_if_needed();
	}
}

function startEdit(tier=0, index=0, lapidaryMode=false) {
	editionOngoing = true;
	cardEditor.lapidaryMode = lapidaryMode;
	cardEditor.setInitialState(tier, index);
	document.getElementById('noble_editor').style = "display: none";
	document.getElementById('gem_editor').style = "display: none";
	document.getElementById('card_editor').style = "";
	document.getElementById('edit_next_section').innerHTML = "Edit nobles";
	currentEditor = cardEditor;
	cardEditor.refresh();
	
	$('.ui.modal').modal({onHide: afterEdit}).modal('show');
	editedGame = true;
}

function afterEdit() {
	refreshBoard();
	refreshButtons();
	changeMoveText();
	editionOngoing = false;

	ai_play_if_needed();

	return true;
}

var game = new Splendor();
var move_sel = new MoveSelector();
var cardEditor = new CardEditor(-1, -1, false);
var gemEditor = new GemEditor();
var nobleEditor = new NobleEditor();
var currentEditor = cardEditor;
var editedGame = false;
var editionOngoing = false;

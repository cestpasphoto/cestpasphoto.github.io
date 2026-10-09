// Game technical constants
const numPlayers = 3;
const numMCTSSims = 25;

// ONNX model dimensions, from observation_size and action_size in TLPLogicNumba.py
const sizeCB = [1, 18 * numPlayers + 1, 15];
const sizeV = [1, numPlayers * numPlayers + 4];   // take card & designate (n*n), then choose stack (4)

const defaultModelFileName = './thelittleprince/model.onnx';
const list_of_files = [
    ['thelittleprince/proxy.py', 'proxy.py'],
    ['thelittleprince/TLPGame.py', 'TLPGame.py'],
    ['thelittleprince/TLPLogicNumba.py', 'TLPLogicNumba.py'],
    ['thelittleprince/Stochastic.py', 'Stochastic.py'],
    ['thelittleprince/MCTS.py', 'MCTS.py'],
    ['thelittleprince/Game.py', 'Game.py']
];

// --- ATTRIBUTES MAPPING (Must match TLPLogicNumba.py) ---
const ATTR_FACE_DOWN   = 0;
const ATTR_BAOBAB      = 1;
const ATTR_VOLCANO     = 2;
const ATTR_SUNSET      = 3;
const ATTR_ROSE        = 4;
const ATTR_LAMPPOST    = 5;
const ATTR_BOX         = 6;
const ATTR_BIG_STAR    = 7;
const ATTR_FOX         = 8;
const ATTR_ELEPHANT    = 9;
const ATTR_SNAKE       = 10;
const ATTR_SHEEP_WHITE = 11;
const ATTR_SHEEP_GREY  = 12;
const ATTR_SHEEP_BROWN = 13;
const ATTR_CARD_TYPE   = 14;

// --- CARD TYPES MAPPING ---
const TYPE_EMPTY       = 0;
const TYPE_CENTER      = 25;
const TYPE_UPHILL      = 50;
const TYPE_DOWNHILL    = 75;
const TYPE_CORNER      = 100;

// --- VISUAL ASSETS ---
const EMOJIS = [
    '🔙', '🌲', '🌋', '🌅', '🌹', '💡', '💼', '🌟', '🦊', '🐘', '🐍', '🐑', '🐺', '🐐'
];

const CHARACTERS_NAME = [
    '-', 'Vain man', 'Geographer', 'Astronomer', 'King', 'Lamplighter', 
    'Hunter', 'Drunkard', 'Businessman (W)', 'Businessman (G)', 'Businessman (B)', 
    'Gardener', 'Turkish Ast.', 'Little Prince'
];

const PLAYER_COLORS = ['blue', 'green', 'orange', 'purple', 'teal'];

// Stacks the first player of a turn chooses from (order of the actions n*n + t)
const STACKS_NAME = ['Center', 'Uphill edge', 'Downhill edge', 'Character'];

// --- UI HELPER FUNCTIONS FOR ALPINE.JS ---

/**
 * Checks if a market card slot is completely empty
 */
function ui_isMarketEmpty(card) {
    if (!card) return true;
    return card[ATTR_CARD_TYPE] === TYPE_EMPTY;
}

/**
 * Generates the CSS classes for a given tile on the planet
 */
function ui_getTileClasses(card) {
    if (!card || card[ATTR_CARD_TYPE] === TYPE_EMPTY) {
        return 'empty-tile';
    }
    if (card[ATTR_FACE_DOWN] === 1) {
        return 'face-down';
    }
    return '';
}

/**
 * Decodes a card array and returns the HTML/Emojis to render inside the tile
 */
function ui_renderTile(card) {
    if (!card || card[ATTR_CARD_TYPE] === TYPE_EMPTY) {
        return '';
    }

    if (card[ATTR_FACE_DOWN] === 1) {
        return `<span style="font-size: 2rem;">${EMOJIS[ATTR_FACE_DOWN]}</span>`;
    }

    let html = '<div style="display: flex; flex-wrap: wrap; justify-content: center; gap: 2px;">';

    // Check if it's a character card (Corners)
    if (card[ATTR_CARD_TYPE] >= TYPE_CORNER) {
        const charId = card[ATTR_CARD_TYPE] - TYPE_CORNER;
        html += `<div style="width: 100%; text-align: center; font-size: 0.8rem; font-weight: bold; padding: 2px;">
                    ${CHARACTERS_NAME[charId]}
                 </div>`;
        
        // Characters might also have immediate attributes (like giving a star or box)
        for (let i = 1; i <= 13; i++) {
            if (card[i] > 0) {
                html += `<span style="font-size: 0.9rem;">${EMOJIS[i]} x${card[i]}</span>`;
            }
        }
    } else {
        // Standard edge or center card: iterate through attributes to display emojis
        for (let i = 1; i <= 13; i++) {
            if (card[i] > 0) {
                // Repeat the emoji if the card gives multiple of the same attribute
                for (let count = 0; count < card[i]; count++) {
                    html += `<span>${EMOJIS[i]}</span>`;
                }
            }
        }
    }

    html += '</div>';
    
    // Add small visual indicator of edge type for better UX
    if (card[ATTR_CARD_TYPE] === TYPE_UPHILL) {
        html += `<div style="position: absolute; bottom: 0; width: 100%; height: 3px; background-color: #8bb174;"></div>`;
    } else if (card[ATTR_CARD_TYPE] === TYPE_DOWNHILL) {
        html += `<div style="position: absolute; top: 0; width: 100%; height: 3px; background-color: #8bb174;"></div>`;
    }

    return html;
}

/**
 * Returns the semantic UI color for a player
 */
function ui_getButtonColor(pIdx) {
    return PLAYER_COLORS[pIdx % PLAYER_COLORS.length];
}

/**
 * Highlights the segment of the player currently taking their turn
 */
function ui_getPlayerSegmentClass(pIdx) {
    const store = Alpine.store('game');
    if (!store || !store.view) return '';

    let classes = '';
    // Highlight if it's currently this player's turn to act
    if (pIdx === store.currentPlayer) {
        classes += 'raised secondary ';
    }
    // Fade out a bit if the player has already played this round
    if (store.view.players && store.view.players[pIdx] && !store.view.players[pIdx].canPlay) {
        classes += 'tertiary ';
    }
    
    return classes;
}

/**
 * True when it is a human's turn and the UI can accept an action
 */
function ui_humanToPlay() {
    const store = Alpine.store('game');
    return !!store && !store.isThinking && !store.gameEnded && store.arePlayersHuman[store.currentPlayer];
}

/**
 * Label of a stack button: name and number of cards left in that stack
 */
function ui_stackLabel(t) {
    const store = Alpine.store('game');
    const left = (store && store.view && store.view.stacksLeft) ? store.view.stacksLeft[t] : '?';
    return `${STACKS_NAME[t]} (${left} left)`;
}

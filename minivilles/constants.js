// One configuration per player count, chosen with `minivilles.html?players=N` (2 by default).
// The engine reads NUMBER_PLAYERS from globalThis.gameConfig when MinivillesGame.py is imported.
const configs = {
  2: {
    defaultModelFileName: 'minivilles/model_2pl.onnx',
    sizeCB: [1, 58, 2],         // observation_size(2) = (18 + 20*2, 2)
    sizeV: [1, 23],             // action_size()
  },
  3: {
    defaultModelFileName: 'minivilles/model_3pl.onnx',
    sizeCB: [1, 78, 2],
    sizeV: [1, 23],
  },
  4: {
    defaultModelFileName: 'minivilles/model_4pl.onnx',
    sizeCB: [1, 98, 2],
    sizeV: [1, 23],
  },
};

const _playersParam = +new URLSearchParams(window.location.search).get('players');
const numPlayers = configs[_playersParam] ? _playersParam : 2;
const { sizeV, sizeCB, defaultModelFileName } = configs[numPlayers];
// Read by the Python engine when its game module is imported: must be set before `import proxy`
globalThis.gameConfig = { NUMBER_PLAYERS: numPlayers };

// Seats (same palette as Catan)
const SEAT_COLORS = ['#2185D0', '#DB2828', '#F2711C', '#A333C8'];
const SEAT_NAMES = ['Blue', 'Red', 'Orange', 'Purple'];

// Card colours: when a card pays
const CARD_COLORS = { b: '#2f7fd1', g: '#3aa655', r: '#d64541', p: '#8e44ad' };
const COLOR_RULES = [
  ['b', "anyone's roll"],
  ['g', 'your roll'],
  ['r', "another player's roll, paid by the roller"],
  ['p', 'your roll, one per city'],
];

// Establishments, in engine order (actions 0-14).
// fx: short effect shown in the table; descr: full text shown when the row is selected
const CARDS = [
  { dice: '1',     c: 'b', e: '🌾', name: 'Wheat Field',       fx: '+1',                    descr: "Anyone's roll of 1: get 1 coin from the bank." },
  { dice: '2',     c: 'b', e: '🐄', name: 'Ranch',             fx: '+1',                    descr: "Anyone's roll of 2: get 1 coin from the bank." },
  { dice: '2-3',   c: 'g', e: '🥖', name: 'Bakery',            fx: '+1',                    descr: 'Your roll of 2 or 3: get 1 coin from the bank (+1 with the 🛍️ Shopping Mall).' },
  { dice: '3',     c: 'r', e: '☕', name: 'Cafe',              fx: '+1 from the roller',    descr: "Another player's roll of 3: take 1 coin from them (+1 with the 🛍️ Shopping Mall)." },
  { dice: '4',     c: 'g', e: '🏪', name: 'Convenience Store', fx: '+3',                    descr: 'Your roll of 4: get 3 coins from the bank (+1 with the 🛍️ Shopping Mall).' },
  { dice: '5',     c: 'b', e: '🌲', name: 'Forest',            fx: '+1',                    descr: "Anyone's roll of 5: get 1 coin from the bank." },
  { dice: '6',     c: 'p', e: '🏟️', name: 'Stadium',           fx: '+2 from each player',   descr: 'Your roll of 6: take 2 coins from every other player. One per city.' },
  { dice: '6',     c: 'p', e: '🏢', name: 'Business Center',   fx: 'swap with the richest', descr: 'Your roll of 6: your cheapest establishment is swapped with the most expensive one of the wealthiest player (automatic, purple cards excluded). One per city.' },
  { dice: '6',     c: 'p', e: '📺', name: 'TV Station',        fx: '+5 from the richest',   descr: 'Your roll of 6: take 5 coins from a player who has at least 5, the wealthiest first; if nobody has 5, from the one with most coins (automatic). One per city.' },
  { dice: '7',     c: 'g', e: '🧀', name: 'Cheese Factory',    fx: '+3 per 🐄',             descr: 'Your roll of 7: get 3 coins from the bank per 🐄 Ranch you own.' },
  { dice: '8',     c: 'g', e: '🪑', name: 'Furniture Factory', fx: '+3 per 🌲 and ⛏️',      descr: 'Your roll of 8: get 3 coins from the bank per 🌲 Forest and ⛏️ Mine you own.' },
  { dice: '9',     c: 'b', e: '⛏️', name: 'Mine',              fx: '+5',                    descr: "Anyone's roll of 9: get 5 coins from the bank." },
  { dice: '9-10',  c: 'r', e: '🍝', name: 'Family Restaurant', fx: '+2 from the roller',    descr: "Another player's roll of 9 or 10: take 2 coins from them (+1 with the 🛍️ Shopping Mall)." },
  { dice: '10',    c: 'b', e: '🍎', name: 'Apple Orchard',     fx: '+3',                    descr: "Anyone's roll of 10: get 3 coins from the bank." },
  { dice: '11-12', c: 'g', e: '🧺', name: 'Fruit Market',      fx: '+2 per 🌾 and 🍎',       descr: 'Your roll of 11 or 12: get 2 coins from the bank per 🌾 Wheat Field and 🍎 Apple Orchard you own.' },
];
const CARD_COSTS = [1, 1, 1, 2, 2, 3, 6, 8, 7, 5, 3, 6, 3, 3, 2];

// Landmarks, in engine order (actions 15-18). Building all four wins the game.
const LANDMARKS = [
  { e: '🚉', name: 'Train Station',  cost: 4,  fx: 'roll 1 or 2 dice',     descr: 'At the start of your turn, choose to roll 1 or 2 dice.' },
  { e: '🛍️', name: 'Shopping Mall',  cost: 10, fx: '+1 on 🥖☕🏪🍝',        descr: 'Your 🥖 ☕ 🏪 🍝 each pay 1 more coin.' },
  { e: '🎡', name: 'Amusement Park', cost: 16, fx: 'double: play again',   descr: 'If you roll a double with 2 dice, play another turn.' },
  { e: '📡', name: 'Radio Tower',    cost: 22, fx: 'reroll once',          descr: 'Once per turn, you may reroll the dice (same number of dice); the first roll is cancelled.' },
];

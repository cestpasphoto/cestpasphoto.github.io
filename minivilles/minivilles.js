// Python files mounted in Pyodide's filesystem (flat: modules import each other by name)
const list_of_files = [
  ['minivilles/Game.py', 'Game.py'],
  ['minivilles/Stochastic.py', 'Stochastic.py'],
  ['minivilles/MinivillesLogicNumba.py', 'MinivillesLogicNumba.py'],
  ['minivilles/MinivillesGame.py', 'MinivillesGame.py'],
  ['minivilles/MCTS.py', 'MCTS.py'],
  ['minivilles/proxy.py', 'proxy.py'],
];

// Default number of MCTS simulations (must match the option selected in minivilles.html)
const numMCTSSims = 25;


/* ========================= */
/* ===== Store access  ===== */
/* ========================= */

function S() { return Alpine.store('game'); }
function V() { return S().view || {}; }
function X() { return S().extra || {}; }
function ui_player(p) { return (V().players || [])[p] || null; }

// Whose point of view is displayed: the only human, or the human who must act
// when several humans share the screen, or nobody (-1) when no human plays.
function ui_viewer() {
  const s = S();
  const humans = s.arePlayersHuman.map((h, i) => h ? i : -1).filter(i => i >= 0);
  if (humans.length === 0) return -1;
  if (humans.length === 1) return humans[0];
  return s.arePlayersHuman[s.currentPlayer] ? s.currentPlayer : humans[0];
}
// Seat whose income-by-roll is shown: the viewer, or the seat to play when no human plays
function ui_focus() { const w = ui_viewer(); return w >= 0 ? w : S().currentPlayer; }

function ui_canAct() {
  const s = S();
  return !s.isLoading && !s.isThinking && !s.gameEnded && !!V().players && !!s.arePlayersHuman[s.currentPlayer];
}

function ui_name(p) {
  if (p === ui_viewer()) return 'You';
  return SEAT_NAMES[p] + (S().arePlayersHuman[p] ? '' : ' AI');
}
function ui_nameHtml(p) { return `<b style="color:${SEAT_COLORS[p]}">${ui_name(p)}</b>`; }
// Python writes seats as @0 @1 @2 @3
function ui_fmt(text) { return (text || '').replace(/@(\d)/g, (_, d) => ui_nameHtml(+d)); }

// Table columns: the viewer first, then the others in turn order
function ui_cols() {
  const w = ui_focus();
  return [...Array(numPlayers).keys()].map(i => (w + i) % numPlayers);
}
function ui_colHead(p) {
  const pl = ui_player(p);
  const short = p === ui_viewer() ? 'You' : SEAT_NAMES[p];
  return `<span style="color:${SEAT_COLORS[p]}">${short}</span><br>🪙${pl ? pl.money : ''}`;
}


/* ========================= */
/* ===== Table rows    ===== */
/* ========================= */

// Rows 0-14 are establishments, 15-18 landmarks: same indices as the engine actions
const ROWS = [...Array(19).keys()];
function ui_isCard(i) { return i < 15; }
function ui_rowInfo(i) { return ui_isCard(i) ? CARDS[i] : LANDMARKS[i - 15]; }
function ui_rowCost(i) { return ui_isCard(i) ? CARD_COSTS[i] : LANDMARKS[i - 15].cost; }
function ui_rowBand(i) { return ui_isCard(i) ? CARD_COLORS[CARDS[i].c] : '#d4a400'; }
function ui_rowNum(i) { return ui_isCard(i) ? CARDS[i].dice : '★'; }
function ui_rowLeft(i) { return ui_isCard(i) ? (V().market || [])[i] : null; }
function ui_owned(i, p) {
  const pl = ui_player(p);
  if (!pl) return 0;
  return ui_isCard(i) ? pl.cards[i] : pl.landmarks[i - 15];
}
function ui_cellText(i, p) {
  const n = ui_owned(i, p);
  if (!n) return '·';
  return ui_isCard(i) ? n : '✓';
}
// A row the player to move could buy now
function ui_rowBuyable(i) { return ui_canAct() && (X().act || [])[i] >= 0; }
function ui_rowDim(i) { return !!V().players && !S().gameEnded && !ui_rowBuyable(i) && !ui_owned(i, ui_focus()); }
function ui_clickRow(i) { if (ui_canAct()) S().act('select', i); }


/* ========================= */
/* ===== Prompt        ===== */
/* ========================= */

const _PIPS = { 1: [[50, 50]], 2: [[28, 28], [72, 72]], 3: [[28, 28], [50, 50], [72, 72]],
                4: [[28, 28], [72, 28], [28, 72], [72, 72]], 5: [[28, 28], [72, 28], [50, 50], [28, 72], [72, 72]],
                6: [[28, 25], [72, 25], [28, 50], [72, 50], [28, 75], [72, 75]] };
function _die(n) {
  return `<svg class="die" viewBox="0 0 100 100"><rect x="5" y="5" width="90" height="90" rx="18" fill="#fff" stroke="#333" stroke-width="6"/>`
       + (_PIPS[n] || []).map(([x, y]) => `<circle cx="${x}" cy="${y}" r="10" fill="#222"/>`).join('') + `</svg>`;
}
// One die is drawn with its face; two dice show their faces only on a double (the engine keeps the sum)
function ui_diceHtml() {
  const v = V();
  if (!v.dice) return '';
  if (v.nDice === 2) {
    const faces = v.double ? _die(v.dice / 2) + _die(v.dice / 2) : '🎲🎲';
    return `${faces}<b class="sum">${v.dice}</b>`;
  }
  return _die(v.dice);
}

function ui_promptHtml() {
  const s = S(), v = V();
  if (s.isLoading) return s.loadingMessage || 'Loading…';
  if (!v.players) return s.statusMessage || '';
  if (s.gameEnded) {
    const w = s.winners;
    if (w.length === 1) return `🏆 ${ui_nameHtml(w[0])} won!`;
    return w.length ? '🏆 ' + w.map(ui_nameHtml).join(' & ') + ' tie' : 'Game over';
  }
  const cur = s.currentPlayer;
  if (!s.arePlayersHuman[cur]) return `${ui_nameHtml(cur)} ${s.isThinking ? 'is thinking…' : 'to play'}`;
  const who = ui_viewer() === cur ? 'You' : ui_nameHtml(cur);
  if (v.awaiting) return `${who}: roll 1 or 2 dice`;
  const roll = v.double ? 'rolled a double' : 'rolled';
  const gain = v.gained >= 0 ? `+${v.gained}` : `−${-v.gained}`;
  return `${who} ${roll}${v.rerolled ? ' (rerolled)' : ''} · ${who === 'You' ? 'earned' : 'earns'} <b>${gain}🪙</b>`;
}

// Selected row: name, when it pays, what it does, and why it cannot be bought
function ui_selHtml() {
  const i = X().sel;
  if (i === undefined || i < 0) return '';
  const r = ui_rowInfo(i);
  let when = '';
  if (ui_isCard(i)) when = ` <span class="small"><span class="sq" style="background:${CARD_COLORS[r.c]}"></span> ${r.dice}</span>`;
  const why = X().selWhy ? ` <span class="why">${X().selWhy}</span>` : '';
  return `<b>${r.e} ${r.name}</b>${when} · ${r.descr}${why}`;
}

function ui_undo() {
  const s = S();
  if (s.isLoading || s.isThinking || !s.canUndo) return;
  update_store(pyProxy.handle_action('undo'));   // game.js's act() refuses once the game is over
}

// game.js's reset() restarts with the default level: re-apply the selected one
function ui_newGame() {
  const s = S();
  if (s.isLoading || s.isThinking) return;
  s.reset();
  s.changeDifficulty();
}


/* ========================= */
/* ===== Income by roll ==== */
/* ========================= */

function ui_incLabel(kind) {
  const f = ui_focus(), mine = f === ui_viewer();
  if (kind === 'own') return mine ? 'Your roll' : `${SEAT_NAMES[f]}'s roll`;
  if (numPlayers === 2) return `${SEAT_NAMES[(f + 1) % 2]}'s roll`;
  return "Others' roll";
}
function ui_incCell(kind, d) {
  const t = (V().income || [])[ui_focus()];
  if (!t) return { txt: '', tip: '', cls: 'na' };
  const x = t[kind][d - 1];
  if (x === null || x === undefined) return { txt: '', tip: '', cls: 'na' };
  const sign = n => n > 0 ? '+' + n : (n < 0 ? '−' + (-n) : '·');
  // others: [min, max] over the other seats (Cafe/Restaurant are capped by the roller's coins;
  // their Stadium / TV Station make you pay)
  const [lo, hi] = kind === 'own' ? [x, x] : x;
  // a range does not fit in a cell: show the extreme, '~' marks that it depends on who rolls
  const txt = lo === hi ? sign(lo) : '~' + sign(Math.abs(lo) > Math.abs(hi) ? lo : hi);
  const tip = lo === hi ? '' : `${sign(lo)} to ${sign(hi)}, depending on who rolls`;
  const tone = hi > 0 ? 'pos' : (lo < 0 ? 'neg' : '');
  // frame the last roll: in the row of whoever rolled it
  const v = V(), rolledByFocus = S().currentPlayer === ui_focus();
  const cur = v.dice === d && ((kind === 'own') === rolledByFocus);
  return { txt, tip, cls: tone + (cur ? ' cur' : '') };
}


/* ========================= */
/* ===== Journal       ===== */
/* ========================= */

// Events since the viewer's latest turn (last 14 when nobody is human)
function ui_recent() {
  const view = V(), all = view.events || [], w = ui_viewer();
  const list = w >= 0 ? all.filter(e => e.id > ((view.marks || [])[w] || 0)) : all.slice(-14);
  return list.slice().reverse();
}


/* ========================= */
/* ===== Analytics     ===== */
/* ========================= */

// Same anonymous hit counter as the other games
const counterAPI_base = 'https://abacus.jasoncameron.dev/hit/cestpasphoto.github.io';
const counterAPI_suffix = new Date().toISOString().slice(2, 7).replace('-', '');

window.addEventListener('load', () => {
    const urls = [
        `${counterAPI_base}/overall`,
        `${counterAPI_base}/overall_${counterAPI_suffix}`,
        `${counterAPI_base}/minivilles_${counterAPI_suffix}`
    ];
    urls.forEach(url => {
        fetch(url, { mode: 'no-cors' }).catch(e => {
            console.debug("Analytics blocked or failed");
        });
    });
});

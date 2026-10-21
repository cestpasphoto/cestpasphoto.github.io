// Python files mounted in Pyodide's filesystem (flat: modules import each other by name)
const list_of_files = [
  ['azul/Game.py', 'Game.py'],
  ['azul/Stochastic.py', 'Stochastic.py'],
  ['azul/AzulLogic.py', 'AzulLogic.py'],
  ['azul/AzulLogicNumba.py', 'AzulLogicNumba.py'],
  ['azul/AzulGame.py', 'AzulGame.py'],
  ['azul/MCTS.py', 'MCTS.py'],
  ['azul/proxy.py', 'proxy.py'],
];

// Default number of MCTS simulations (must match the option selected in azul.html)
const numMCTSSims = 50;


/* ========================= */
/* ===== Store access  ===== */
/* ========================= */

function S() { return Alpine.store('game'); }
function V() { return S().view || {}; }
function X() { return S().extra || {}; }
function ui_player(p) { return (V().players || [])[p] || null; }

// Whose board is shown large: the only human, or the human who must act when
// several humans share the screen; with no human (-1), the seat to play.
function ui_viewer() {
  const s = S();
  const humans = s.arePlayersHuman.map((h, i) => h ? i : -1).filter(i => i >= 0);
  if (humans.length === 0) return -1;
  if (humans.length === 1) return humans[0];
  return s.arePlayersHuman[s.currentPlayer] ? s.currentPlayer : humans[0];
}
function ui_focus() { const w = ui_viewer(); return w >= 0 ? w : S().currentPlayer; }
// The other seats, in turn order after the focused one
function ui_others() {
  const f = ui_focus();
  return [...Array(numPlayers - 1).keys()].map(i => (f + 1 + i) % numPlayers);
}

function ui_canAct() {
  const s = S();
  return !s.isLoading && !s.isThinking && !s.gameEnded && !!V().players && !!s.arePlayersHuman[s.currentPlayer];
}
// Interaction on a board: only the seat to play, when it is human
function ui_actsOn(p) { return ui_canAct() && p === S().currentPlayer; }

function ui_name(p) {
  if (p === ui_viewer()) return 'You';
  return SEAT_NAMES[p] + (S().arePlayersHuman[p] ? '' : ' AI');
}
function ui_nameHtml(p) { return `<b style="color:${SEAT_COLORS[p]}">${ui_name(p)}</b>`; }
function ui_tileHtml(c) { return `<span class="t t${c} i"></span>`; }
// Python writes seats as @0 @1 ... and tiles as coloured square emoji
function ui_fmt(text) {
  let s = (text || '').replace(/@(\d)/g, (_, d) => ui_nameHtml(+d));
  TILE_EMOJI.forEach((e, c) => { s = s.split(e).join(ui_tileHtml(c)); });
  return s;
}


/* ========================= */
/* ===== Actions       ===== */
/* ========================= */

function ui_pick(s, c) {
  if (ui_canAct() && ((X().pick || [])[s] || [])[c]) S().act('pick', s, c);
}
function ui_place(l) {
  if (ui_canAct() && (X().lines || [])[l]) S().act('place', l);
}

// Undo stays available once the game is over (game.js's act() refuses it then)
function ui_undo() {
  const s = S();
  if (s.isLoading || s.isThinking || !s.canUndo) return;
  update_store(pyProxy.handle_action('undo'));
}

// game.js's reset() restarts with the default level: re-apply the selected one
function ui_newGame() {
  const s = S();
  if (s.isLoading || s.isThinking) return;
  s.reset();
  s.changeDifficulty();
}


/* ========================= */
/* ===== Prompt         ==== */
/* ========================= */

function ui_promptHtml() {
  const s = S();
  if (s.isLoading) return s.loadingMessage || 'Loading…';
  if (!V().players) return s.statusMessage || '';
  if (s.gameEnded) {
    const w = s.winners;
    if (w.length === 1) return `🏆 ${ui_nameHtml(w[0])} won!`;
    return w.length ? '🏆 ' + w.map(ui_nameHtml).join(' & ') + ' tie' : 'Game over';
  }
  const cur = s.currentPlayer;
  if (!s.arePlayersHuman[cur]) return `${ui_nameHtml(cur)} ${s.isThinking ? 'is thinking…' : 'to play'}`;
  const who = ui_viewer() === cur ? '<b style="color:' + SEAT_COLORS[cur] + '">Your turn:</b> ' : ui_nameHtml(cur) + ': ';
  const sel = X().sel;
  if (sel) {
    const where = sel.s === 0 ? 'the centre' : 'factory ' + sel.s;
    return who + `take ${sel.k} ${ui_tileHtml(sel.c)} from ${where}` + (sel.token ? ` + <span class="t tk i">1</span>` : '');
  }
  return who + 'tap a tile in a factory or the centre';
}
function ui_subPrompt() {
  if (!ui_canAct()) return '';
  return X().sel ? 'Tap a highlighted row, or the floor' : '';
}


/* ========================= */
/* ===== Factories     ===== */
/* ========================= */

function ui_selected(s, c) { const x = X().sel; return !!x && x.s === s && x.c === c; }
function ui_srcTileClass(s, c) {
  const x = X().sel;
  let k = `t t${c}`;
  if (x && x.s === s) k += x.c === c ? ' ring' : ' faded';
  if (ui_canAct() && ((X().pick || [])[s] || [])[c]) k += ' tap';
  return k;
}
// Centre: one chip per colour present, the first-player token first
function ui_centre() {
  const v = V(), out = [];
  (v.centre || []).forEach((n, c) => { if (n) out.push({ c, n }); });
  return out;
}


/* ========================= */
/* ===== Boards        ===== */
/* ========================= */

// Pattern line r of seat p, as 5 cells right-aligned: 'x' (no slot), 'e' (empty) or a colour
function ui_patCells(p, r) {
  const pl = ui_player(p);
  if (!pl) return [];
  const [col, cnt] = pl.pat[r];
  return [0, 1, 2, 3, 4].map(j => j < 4 - r ? 'x' : ((4 - j) < cnt ? col : 'e'));
}
function ui_patClass(v) { return v === 'x' ? 't none' : (v === 'e' ? 't e' : `t t${v}`); }
function ui_wallClass(p, r, c) {
  const pl = ui_player(p);
  const col = (c - r + 5) % 5;            // wall pattern: colour k sits in column (k + r) % 5
  return `t t${col}` + (pl && pl.wall[r][c] ? '' : ' g');
}
function ui_floorCells(p) {
  const pl = ui_player(p);
  const fl = pl ? pl.floor : [];
  return [0, 1, 2, 3, 4, 5, 6].map(i => i < fl.length ? fl[i] : null);
}
function ui_floorClass(v) { return v === null ? 't e' : (v === TOKEN ? 't tk' : (v < 0 ? 't tq' : `t t${v}`)); }
function ui_floorExtra(p) { const pl = ui_player(p); return pl && pl.floor.length > 7 ? `+${pl.floor.length - 7}` : ''; }

function ui_line(l) { return (X().lines || [])[l] || null; }
function ui_selecting(p) { return ui_actsOn(p) && !!X().sel; }
function ui_rowClass(p, l) {
  if (!ui_selecting(p)) return '';
  return ui_line(l) ? 'legal' : 'dim';
}
// Hint left of a row: fill after the move and floor penalty, or the mark of a recent change
function ui_hint(p, l) {
  if (ui_selecting(p)) { const o = ui_line(l); return o ? o.t : ''; }
  return ui_isRecent(p, l) ? '●' : '';
}
function ui_hintClass(p, l) {
  if (ui_selecting(p)) {
    const o = ui_line(l);
    if (!o) return 'hint';
    return 'hint ' + (o.loss ? 'bad' : (o.full ? 'good' : ''));
  }
  return 'hint recent';
}

function ui_headSub(p) {
  const pl = ui_player(p);
  if (!pl) return '';
  const bits = [];
  if (pl.floorPen) bits.push(`floor −${pl.floorPen}`);
  if (pl.floor.includes(TOKEN)) bits.push('starts next round');
  return bits.join(' · ');
}
function ui_now(p) { return !S().gameEnded && p === S().currentPlayer; }


/* ========================= */
/* ===== Journal       ===== */
/* ========================= */

// Events since the viewer's latest move (last 12 when nobody is human), most
// recent first, and the rows they touched. Memoised: every row asks.
let _recent = { src: null, w: null, list: [], rows: new Set() };
function ui_recentEvents() {
  const view = V(), src = view.events || null, w = ui_viewer();
  if (src === _recent.src && w === _recent.w) return _recent;
  const all = src || [];
  const list = w >= 0 ? all.filter(e => e.id > ((view.marks || [])[w] || 0)) : all.slice(-12);
  const rows = new Set();
  for (const e of list) if (e.p !== undefined && e.r >= 0) rows.add(`${e.p}:${e.r}`);
  _recent = { src, w, list: list.slice().reverse(), rows };
  return _recent;
}
function ui_isRecent(p, l) { return ui_recentEvents().rows.has(`${p}:${l}`); }


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
        `${counterAPI_base}/azul_${counterAPI_suffix}`
    ];
    urls.forEach(url => {
        fetch(url, { mode: 'no-cors' }).catch(e => {
            console.debug("Analytics blocked or failed");
        });
    });
});

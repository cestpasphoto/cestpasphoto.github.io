// Python files mounted in Pyodide's filesystem (flat: modules import each other by name)
const list_of_files = [
  ['botanik/Game.py', 'Game.py'],
  ['botanik/Stochastic.py', 'Stochastic.py'],
  ['botanik/BotanikConstants.py', 'BotanikConstants.py'],
  ['botanik/BotanikLogicNumba.py', 'BotanikLogicNumba.py'],
  ['botanik/BotanikGame.py', 'BotanikGame.py'],
  ['botanik/MCTS.py', 'MCTS.py'],
  ['botanik/proxy.py', 'proxy.py'],
];

// Default number of MCTS simulations (must match the option selected in botanik.html)
const numMCTSSims = 50;


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
// Seat shown at the bottom of the register and first among the machines
function ui_focus() { return Math.max(ui_viewer(), 0); }
function ui_other() { return 1 - ui_focus(); }

function ui_canAct() {
  const s = S();
  return !s.isLoading && !s.isThinking && !s.gameEnded && !!V().players && !!s.arePlayersHuman[s.currentPlayer];
}

function ui_name(p) {
  if (p === ui_viewer()) return 'You';
  return SEAT_NAMES[p] + (S().arePlayersHuman[p] ? '' : ' AI');
}
function ui_nameHtml(p) { return `<b style="color:${SEAT_COLORS[p]}">${ui_name(p)}</b>`; }
// Python writes seats as @0 @1 and cards as %c0 %c1 (indexes into `cards`)
function ui_fmt(text, cards) {
  return (text || '')
    .replace(/@(\d)/g, (_, d) => ui_nameHtml(+d))
    .replace(/%c(\d+)/g, (_, i) => ui_card((cards || [])[+i], 'i'));
}


/* ========================= */
/* ===== Cards         ===== */
/* ========================= */

function _empty(c) { return !c || c[C_COLOR] === 0; }
function ui_cardTitle(c) {
  if (_empty(c)) return '';
  if (c[C_COLOR] === 1) return 'Source';
  const fl = c[C_FLOWERS] ? `, ${c[C_FLOWERS]} flower${c[C_FLOWERS] > 1 ? 's' : ''}` : '';
  return `${COLOR_NAMES[c[C_COLOR]]} ${TYPE_NAMES[c[C_TYPE]]}${fl}`;
}

// One card as HTML. size: 'r' (register, 44 px), 'm' (machine, fluid), 'i' (inline).
// mode: '' | 'sel' | 'ok' | 'legal' | 'ghost' | 'warn' | 'last' | 'wait'
function ui_card(c, size, mode) {
  mode = mode || '';
  if (_empty(c)) return `<div class="cd ${size} empty ${mode}"></div>`;
  const fill = CARD_FILL[c[C_COLOR]], pipe = CARD_PIPE[c[C_COLOR]];
  let s = '';
  ['pN', 'pE', 'pS', 'pW'].forEach((k, d) => { if (c[C_NORTH + d]) s += `<i class="${k}" style="background:${pipe}"></i>`; });
  const glyph = c[C_COLOR] === 1 ? '💧' : TYPE_GLYPH[c[C_TYPE]];
  // flower / vegetable: small mark in the top-left corner (except inline); mecabot and source: centred
  const corner = (c[C_TYPE] === 4 || c[C_TYPE] === 5) && size !== 'i';
  if (glyph) s += `<span class="${corner ? 'tg' : 'gl'}">${glyph}</span>`;
  if (c[C_FLOWERS] && size !== 'i') s += `<span class="fl" style="color:${pipe}">✿${c[C_FLOWERS] > 1 ? c[C_FLOWERS] : ''}</span>`;
  if (mode.split(' ').includes('warn')) s += '<span class="bd">⤴</span>';
  return `<div class="cd ${size} ${mode}" style="background:${fill}" title="${ui_cardTitle(c)}">${s}</div>`;
}

// Overlay of the human decision being prepared (Python's extra.ov), and the
// latest decision of any seat (view.last)
function _ov(key) { return ui_canAct() ? ((X().ov || {})[key] || null) : null; }
function _slotHtml(key, c, size, extraMode) {
  const o = _ov(key);
  if (o && o.m === 'ghost') return ui_card(o.g || c, size, 'ghost');
  const modes = [o ? o.m : (V().last || []).includes(key) ? 'last' : '', extraMode || ''];
  return ui_card(c, size, modes.filter(m => m).join(' '));
}


/* ========================= */
/* ===== Register      ===== */
/* ========================= */

// Rows: the other seat's register, the middle row, the focused seat's register
function ui_rows() { return [{ k: 'reg', p: ui_other() }, { k: 'mid', p: -1 }, { k: 'reg', p: ui_focus() }]; }
function ui_rowLabel(r) {
  if (r.k === 'mid') return '<span style="color:#767676">Middle</span>';
  return `<span style="color:${SEAT_COLORS[r.p]}">${ui_name(r.p)}</span>`;
}
function ui_slotHtml(r, s) {
  if (r.k === 'mid') return _slotHtml(`mid.${s}`, (V().middle || [])[s], 'r');
  const pl = ui_player(r.p);
  return pl ? _slotHtml(`reg.${r.p}.${s}`, pl.register[s], 'r') : '';
}
function ui_clickSlot(r, s) { if (ui_canAct()) S().act('slot', r.k, r.p, s); }

// Freed cards of a seat (column at the right of its register row)
function ui_freedHtml(r) {
  if (r.k === 'mid') return '';
  const pl = ui_player(r.p);
  if (!pl) return '';
  const shown = [0, 1].filter(c => !_empty(pl.freed[c]) || (_ov(`freed.${r.p}.${c}`) || {}).m === 'ghost');
  if (!shown.length) return ui_card(null, 'r');
  const size = shown.length > 1 ? 'h' : 'r';
  return shown.map(c => `<div class="fr" data-c="${c}">${_slotHtml(`freed.${r.p}.${c}`, pl.freed[c], size)}</div>`).join('');
}
function ui_clickFreed(r, ev) {
  const el = ev.target.closest('.fr');
  if (ui_canAct() && r.k === 'reg' && el) S().act('freed', r.p, +el.dataset.c);
}

// Arrival zone
function ui_arrivalHtml(i) {
  const c = (V().arrival || [])[i];
  const o = _ov(`arr.${i}`);
  // dimmed while the human to play cannot take an arrival card (machine, mecabot)
  const mode = !ui_canAct() || _empty(c) ? '' : (o ? (o.m === 'sel' ? 'sel' : 'ok') : 'dim');
  return ui_card(c, 'r', mode);
}
function ui_clickArrival(i) { if (ui_canAct()) S().act('arrival', i); }


/* ========================= */
/* ===== Machines      ===== */
/* ========================= */

function ui_cols() { return [ui_focus(), ui_other()]; }
function ui_cellHtml(p, k) {
  const pl = ui_player(p);
  if (!pl) return '';
  const c = pl.machine[k];
  const waiting = !_empty(c) && !pl.reach[k];
  return _slotHtml(`cell.${p}.${k}`, c, 'm', waiting ? 'wait' : '');
}
function ui_clickCell(p, k) { if (ui_canAct()) S().act('cell', p, k); }

function ui_headHtml(p) {
  const pl = ui_player(p);
  if (!pl) return '';
  const tag = !S().gameEnded && p === S().currentPlayer ? '<span class="now">▶</span>' : '<span class="now"></span>';
  const groups = pl.groups.filter(g => g[3] > 0).map(([col, n, fl, pts]) =>
    `<span class="grp" title="${COLOR_NAMES[col]}: ${n} card${n > 1 ? 's' : ''}${n >= 3 ? '' : ' (under 3: only flowers count)'}, ${fl} ✿">${COLOR_EMOJI[col]}${pts}</span>`).join(' ');
  return `${tag}${ui_nameHtml(p)}<span class="grps">${groups}</span><span class="sc">${pl.score}</span>`;
}


/* ========================= */
/* ===== Prompt        ===== */
/* ========================= */

function ui_promptHtml() {
  const s = S(), v = V();
  if (s.isLoading) return s.loadingMessage || 'Loading…';
  if (!v.players) return s.statusMessage || '';
  if (s.gameEnded) {
    const w = s.winners, sc = p => ui_player(p).score;
    if (w.length === 1) return `🏆 ${ui_nameHtml(w[0])} won, ${sc(w[0])} to ${sc(1 - w[0])}`
                             + (sc(0) === sc(1) ? ' (more connected cards)' : '') + '!';
    return w.length ? `🤝 Tie, ${sc(0)} points each` : 'Game over';
  }
  const cur = s.currentPlayer;
  if (!s.arePlayersHuman[cur]) return `${ui_nameHtml(cur)} ${s.isThinking ? 'is thinking…' : 'to play'}`;
  return `${ui_nameHtml(cur)}: ${ui_fmt(X().prompt, X().c)}`;
}
function ui_selHtml() { return ui_fmt(X().sel, X().c); }

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
/* ===== Journal       ===== */
/* ========================= */

// Events since the viewer's latest decision (last 14 when nobody is human)
function ui_recent() {
  const view = V(), all = view.events || [], w = ui_viewer();
  const list = w >= 0 ? all.filter(e => e.id > ((view.marks || [])[w] || 0)) : all.slice(-14);
  return list.slice().reverse();
}
function ui_evHtml(ev) { return ui_fmt(ev.t, ev.c); }

// Rules reminder (collapsible panel)
function ui_rulesHtml() {
  return [
    'Each round, the main player puts one arrival card either in their register, under a middle card sharing its colour or its type, or on the middle row, where it replaces (discards) a card. The main player alternates every round; 3 cards arrive every 3 rounds.',
    'A register card that no longer shares colour or type with the middle card above it is freed, whoever caused it: its owner places it in their machine. A freed 🤖 is first swapped with a middle card, and the card taken is placed instead.',
    'Tap an arrival card, then a highlighted slot: it is played at once. In the machine, pipes must face pipes and walls face walls: tap a highlighted cell, tap it again to rotate, then ✓ Place. This engine also refuses a card that would close the last open pipe; with no legal cell, freed cards are thrown away.',
    'Score: only cards connected to the 💧 source by pipes count (faded cards wait). Each pipe-connected group of one colour scores its cards if there are 3 or more, plus its ✿ flowers in any case (🌷 and 🥕 carry 3).',
    'The game ends when the deck, the arrival zone and the freed cards are exhausted. Tie: most cards connected to the source.',
  ].map(t => `<div>${t}</div>`).join('');
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
        `${counterAPI_base}/botanik_${counterAPI_suffix}`
    ];
    urls.forEach(url => {
        fetch(url, { mode: 'no-cors' }).catch(e => {
            console.debug("Analytics blocked or failed");
        });
    });
});

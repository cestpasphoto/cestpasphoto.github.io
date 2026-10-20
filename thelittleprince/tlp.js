// Python files mounted in Pyodide's filesystem (flat: modules import each other by name)
const list_of_files = [
  ['thelittleprince/Game.py', 'Game.py'],
  ['thelittleprince/Stochastic.py', 'Stochastic.py'],
  ['thelittleprince/TLPLogicNumba.py', 'TLPLogicNumba.py'],
  ['thelittleprince/TLPGame.py', 'TLPGame.py'],
  ['thelittleprince/MCTS.py', 'MCTS.py'],
  ['thelittleprince/proxy.py', 'proxy.py'],
];

// Default number of MCTS simulations (must match the option selected in tlp.html)
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

function ui_canAct() {
  const s = S();
  return !s.isLoading && !s.isThinking && !s.gameEnded && !!V().players && !!s.arePlayersHuman[s.currentPlayer];
}

function ui_name(p) {
  if (p === ui_viewer()) return 'You';
  return SEAT_NAMES[p] + (S().arePlayersHuman[p] ? '' : ' AI');
}
function ui_nameHtml(p) { return `<b style="color:${SEAT_COLORS[p]}">${ui_name(p)}</b>`; }
// Python writes seats as @0 @1 ...: colored names, or plain ones (labels of colored buttons)
function ui_fmt(text) { return (text || '').replace(/@(\d)/g, (_, d) => ui_nameHtml(+d)); }
function ui_plain(text) {
  return (text || '').replace(/@(\d)/g, (_, d) => +d === ui_viewer() ? 'you' : SEAT_NAMES[+d]);
}

// Planets: the viewer first, then the others in seat order
function ui_cols() {
  const w = Math.max(ui_viewer(), 0);
  return [...Array(numPlayers).keys()].map(i => (w + i) % numPlayers);
}


/* ========================= */
/* ===== Cards         ===== */
/* ========================= */

function _sheep(a) { return `<span class="sh ${SHEEP_CLS[a]}">🐑</span>`; }
// '#11' in rule texts stands for a sheep of that color
function ui_sym(text) { return text.replace(/#(1[1-3])/g, (_, a) => _sheep(+a)); }
function _icons(c) {
  let s = '';
  for (let a = 1; a <= 13; a++) for (let k = 0; k < c[a]; k++) s += SHEEP_CLS[a] ? _sheep(a) : `<span>${ATTR_EMOJI[a]}</span>`;
  return s;
}
function _type(c) { return Math.min(Math.floor(c[A_TYPE] / 25), 4) - 1; }   // 0-3
function _char(c) { return c[A_TYPE] >= 100 ? c[A_TYPE] - 100 : 0; }

// Card content: a character (emoji, stars, short rule; full rule on hover) or its icons
function ui_cardHtml(c) {
  if (!c || !c[A_TYPE]) return '';
  if (c[A_FACE_DOWN]) return '<span class="fdmark" title="Face down: 3 baobabs">⬛</span>';
  const ch = _char(c);
  if (ch) {
    const [e, name, short, full] = CHARS[ch];
    const stars = c[A_STAR] ? `<span class="st">${'⭐'.repeat(c[A_STAR])}</span>` : '';
    return `<div class="chr" title="${name}: ${full.replace(/#1[1-3]/g, '🐑')}"><span class="ce">${e}</span>${stars}<span class="fx">${ui_sym(short)}</span></div>`;
  }
  return `<div class="ic">${_icons(c)}</div>`;
}
// Same, on one line (journal, selection)
function ui_cardInline(c) {
  if (!c || !c[A_TYPE]) return '';
  const ch = _char(c);
  if (ch) return `<span title="${CHARS[ch][1]}">${CHARS[ch][0]}</span>${'⭐'.repeat(c[A_STAR])}`;
  return _icons(c);
}
function ui_tileClass(c, slot) {
  const t = c && c[A_TYPE] ? _type(c) : SLOT_TYPE[slot];
  return `t${t}` + (c && c[A_TYPE] ? '' : ' empty') + (c && c[A_FACE_DOWN] ? ' fd' : '');
}
function ui_planetHtml(p) {
  const pl = ui_player(p);
  if (!pl) return '';
  let s = '';
  pl.planet.forEach((c, i) => {
    s += `<div class="tile ${ui_tileClass(c, i)}">${c[A_TYPE] ? ui_cardHtml(c) : `<span class="ph">${STACK_ICON[SLOT_TYPE[i]]}</span>`}</div>`;
  });
  return s;
}


/* ========================= */
/* ===== Planets       ===== */
/* ========================= */

function ui_tag(p) {
  if (S().gameEnded) return '';
  if (p === S().currentPlayer) return '<span class="tag now">▶</span>';
  return ui_player(p).played ? '<span class="tag done" title="Played this turn">✓</span>' : '<span class="tag wait">·</span>';
}
function ui_headHtml(p) {
  const pl = ui_player(p);
  if (!pl) return '';
  return `${ui_tag(p)}${ui_nameHtml(p)}<span class="sc">${pl.score}</span>`;
}
// Points of each character, the volcano penalty, then the volcano count (bottom right)
function ui_footHtml(p) {
  const pl = ui_player(p);
  if (!pl) return '';
  let s = '';
  for (const [k, v] of pl.breakdown) {
    if (k === 'vol') { if (v) s += `<span class="neg" title="Most volcanoes">🌋${v}</span>`; continue; }
    s += `<span title="${CHARS[k][1]}">${CHARS[k][0]}${v}</span>`;
  }
  return s + `<span class="vol ${pl.volMax ? 'max' : ''}" title="Volcanoes">🌋${pl.vol}</span>`;
}


/* ========================= */
/* ===== Prompt        ===== */
/* ========================= */

function ui_promptHtml() {
  const s = S(), v = V();
  if (s.isLoading) return s.loadingMessage || 'Loading…';
  if (!v.players) return s.statusMessage || '';
  if (s.gameEnded) {
    const w = s.winners;
    if (w.length === 1) return `🏆 ${ui_nameHtml(w[0])} won with ${ui_player(w[0]).score} points!`;
    return w.length ? '🏆 ' + w.map(ui_nameHtml).join(' & ') + ' tie' : 'Game over';
  }
  const cur = s.currentPlayer;
  if (!s.arePlayersHuman[cur]) return `${ui_nameHtml(cur)} ${s.isThinking ? 'is thinking…' : 'to play'}`;
  return `${ui_nameHtml(cur)}: ${X().prompt || ''}`;
}

// Market cards (take phase) or stacks (stack phase), tapped to select
function ui_slots() {
  const x = X();
  if (x.phase === 'stack') return x.stacks.map(k => ({ kind: 'stack', i: k.t, k }));
  return (x.market || []).map((m, i) => ({ kind: 'card', i, m }));
}
function ui_slotClass(o) {
  const sel = X().sel, on = sel && sel.kind === o.kind && (o.kind === 'card' ? sel.i : sel.t) === o.i;
  if (o.kind === 'stack') return `back t${o.i}` + (o.k.ok ? '' : ' off') + (on ? ' sel' : '') + (ui_canAct() && o.k.ok ? ' tap' : '');
  if (!o.m.card) return 'gone';
  return `t${_type(o.m.card)}` + (o.m.card[A_FACE_DOWN] ? ' fd' : '') + (on ? ' sel' : '') + (ui_canAct() ? ' tap' : '');
}
function ui_slotHtml(o) {
  if (o.kind === 'stack') {
    return `<div>${STACK_ICON[o.i]}<span class="cnt">${o.k.left}</span></div><div class="sub">${STACK_NAME[o.i]}</div>`;
  }
  if (!o.m.card) return '<span class="small">taken</span>';
  const d = o.m.delta;
  const badge = ui_canAct() ? `<span class="dl ${d > 0 ? 'pos' : d < 0 ? 'neg' : ''}">${_signed(d)}</span>` : '';
  return badge + ui_cardHtml(o.m.card);
}
function ui_clickSlot(o) {
  if (!ui_canAct()) return;
  if (o.kind === 'stack' ? o.k.ok : (o.m.card && o.m.ok)) S().act('select', o.kind, o.i);
}
function _signed(d) { return d > 0 ? '+' + d : (d < 0 ? '−' + (-d) : '±0'); }

// Selected card: what it is and what it brings; selected stack: what is still in it
function ui_selHtml() {
  const sel = X().sel;
  if (!sel) return '';
  if (sel.kind === 'card') {
    const c = sel.card, t = _type(c), ch = _char(c);
    const forWho = S().currentPlayer === ui_viewer() ? 'you' : SEAT_NAMES[S().currentPlayer];
    const what = ch ? `<b>${CHARS[ch][0]} ${CHARS[ch][1]}</b>${'⭐'.repeat(c[A_STAR])}: ${ui_sym(CHARS[ch][3])}`
                    : `<b>${STACK_ICON[t]} ${STACK_NAME[t]}</b> ${ui_cardInline(c)}`;
    return `${what} · <b>${_signed(sel.delta)}</b> for ${forWho}${sel.why ? ': ' + sel.why : ''}`;
  }
  let left;
  if (sel.chars) left = sel.chars.map(([k, n]) => CHARS[k][0] + (n > 1 ? '×' + n : '')).join(' ');
  else left = [2, 3, 4, 5, 6, 7, 9, 10, 11, 12, 13, 1, 8].filter(a => sel.attrs[a])
                .map(a => (SHEEP_CLS[a] ? _sheep(a) : ATTR_EMOJI[a]) + sel.attrs[a]).join(' ');
  return `<b>${STACK_ICON[sel.t]} ${STACK_NAME[sel.t]}</b>: ${sel.left} left, room ${sel.room} on each planet`
       + `<br><span class="small">Still in stack:</span> ${left || '—'}`;
}

// Choice buttons; designation buttons (c.s = seat) take that seat's color
function ui_choiceStyle(c) { return c.s !== undefined ? `background:${SEAT_COLORS[c.s]};color:#fff` : ''; }
function ui_choiceLabel(c) { return c.s !== undefined ? ui_plain(c.l) : ui_fmt(c.l); }

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

// Events since the viewer's latest card (last 14 when nobody is human)
function ui_recent() {
  const view = V(), all = view.events || [], w = ui_viewer();
  const list = w >= 0 ? all.filter(e => e.id > ((view.marks || [])[w] || 0)) : all.slice(-14);
  return list.slice().reverse();
}
function ui_evHtml(ev) {
  return ui_fmt(ev.t).replace(/%c(\d)/g, (_, i) => `<span class="jc">${ui_cardInline((ev.c || [])[+i])}</span>`);
}

// Rules reminder (collapsible panel)
function ui_rulesHtml() {
  const sw = t => `<span class="sw t${t}">${STACK_ICON[t]}</span>`;
  return `<div>Each turn, the first player picks a stack: one card per player is drawn. Each player takes a card and picks who plays next among those who have not played; the last one opens the next turn.</div>`
    + `<div>🌋 Most volcanoes at the end: lose that many points (ties too). · 3rd 🌳: all your baobab cards turn face down ⬛.</div>`
    + `<div>Slots: ${sw(3)} character, ${sw(0)} center, ${sw(1)} uphill edge, ${sw(2)} downhill edge.</div>`
    + CHARS.slice(1).map(([e, n, , f]) => `<div><span class="ce">${e}</span> <b>${n}</b> ${ui_sym(f)}</div>`).join('');
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
        `${counterAPI_base}/tlp_${counterAPI_suffix}`
    ];
    urls.forEach(url => {
        fetch(url, { mode: 'no-cors' }).catch(e => {
            console.debug("Analytics blocked or failed");
        });
    });
});

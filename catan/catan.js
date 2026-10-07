// Python files mounted in Pyodide's filesystem (flat: modules import each other by name)
const list_of_files = [
  ['catan/Game.py', 'Game.py'],
  ['catan/Stochastic.py', 'Stochastic.py'],
  ['catan/CatanConstants.py', 'CatanConstants.py'],
  ['catan/CatanLogicNumba.py', 'CatanLogicNumba.py'],
  ['catan/CatanGame.py', 'CatanGame.py'],
  ['catan/MCTS.py', 'MCTS.py'],
  ['catan/proxy.py', 'proxy.py'],
];

// Default number of MCTS simulations (must match the option selected in catan.html)
const numMCTSSims = 50;


/* ========================= */
/* ===== Store access  ===== */
/* ========================= */

function S() { return Alpine.store('game'); }
function V() { return S().view || {}; }
function X() { return S().extra || {}; }
function ui_player(p) { return (V().players || [])[p] || null; }
// The viewer's player, or an empty one while the panel is being torn down
const _NOBODY = { vp: 0, vpDev: 0, res: [0, 0, 0, 0, 0], dev: [0, 0, 0, 0, 0], devNew: [0, 0, 0, 0, 0], left: [0, 0, 0] };
function ui_mine() { return ui_player(ui_viewer()) || _NOBODY; }

// Whose information is displayed: the only human, or the human who must act
// when several humans share the screen, or everybody (-1) when no human plays.
function ui_viewer() {
  const s = S();
  const humans = s.arePlayersHuman.map((h, i) => h ? i : -1).filter(i => i >= 0);
  if (humans.length === 0) return -1;
  if (humans.length === 1) return humans[0];
  return s.arePlayersHuman[s.currentPlayer] ? s.currentPlayer : humans[0];
}
function ui_sees(p) { const w = ui_viewer(); return w < 0 || w === p || S().gameEnded; }

function ui_canAct() {
  const s = S();
  return !s.isLoading && !s.isThinking && !s.gameEnded && !!V().players && !!s.arePlayersHuman[s.currentPlayer];
}

function ui_name(p) {
  if (p === ui_viewer()) return 'You';
  return SEAT_NAMES[p] + (S().arePlayersHuman[p] ? '' : ' AI');
}
function ui_nameHtml(p) {
  return `<b style="color:${SEAT_COLORS[p]}">${ui_name(p)}</b>`;
}
// Python writes seats as @0 @1 @2
function ui_fmt(text) { return (text || '').replace(/@(\d)/g, (_, d) => ui_nameHtml(+d)); }
function ui_res1(counts) { return counts.map((n, r) => RES_EMOJI[r] + n).join(' '); }
function ui_res(counts) { return counts.map((n, r) => RES_EMOJI[r].repeat(n)).join('') || '∅'; }


/* ========================= */
/* ===== Actions       ===== */
/* ========================= */

function ui_play(a) { if (a >= 0 && ui_canAct()) S().act('play', a); }

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

function ui_clickDev(k) {
  const a = (X().dev || [])[k];
  if (!ui_canAct() || a === undefined || a === -1) return;
  if (a >= 0) S().act('play', a); else S().act('dev', k);
}


/* ========================= */
/* ===== Players       ===== */
/* ========================= */

// Seats shown in the top strip: everybody but the viewer, in turn order
function ui_stripSeats() {
  const w = ui_viewer();
  if (w < 0) return [...Array(numPlayers).keys()];
  return [...Array(numPlayers - 1).keys()].map(i => (w + 1 + i) % numPlayers);
}

function ui_vp(p) {
  const pl = ui_player(p);
  if (!pl) return '';
  return ui_sees(p) && pl.vpDev ? `${pl.vp + pl.vpDev} (${pl.vpDev}⭐)` : `${pl.vp}`;
}

function ui_badges(p) {
  const pl = ui_player(p);
  if (!pl) return '';
  let s = '';
  if (pl.road) s += ` <span class="badge" title="Longest Road">🛣️ ${pl.roadLen}</span>`;
  if (pl.army) s += ` <span class="badge" title="Largest Army">⚔️ army</span>`;
  if (pl.owe) s += ` <span class="badge warn">discards ${pl.owe}</span>`;
  if (pl.offer) {
    if (pl.offer.st === TRADE_REFUSED) s += ' <span class="badge">❌</span>';
    else if (pl.offer.st === TRADE_OFFERED || pl.offer.st === TRADE_COMPOSING) s += ' <span class="badge">💬</span>';
  }
  return s;
}

// One line for a player in the top strip
function ui_stripLine(p) {
  const pl = ui_player(p);
  if (!pl) return '';
  const sees = ui_sees(p);
  const cards = sees ? ui_res(pl.res) : `${pl.nRes} card${pl.nRes === 1 ? '' : 's'}`;
  const dev = sees
    ? DEV_ORDER.map(k => DEV_EMOJI[k].repeat(pl.dev[k] + pl.devNew[k])).join('')
    : (pl.nDev ? `${pl.nDev} dev` : '');
  return `<span class="stat">🏅 ${ui_vp(p)}</span> · <span class="stat">${cards}</span>`
       + (dev ? ` · <span class="stat">${dev}</span>` : '')
       + (pl.knights ? ` · <span class="stat">⚔️ ${pl.knights} played</span>` : '')
       + ui_badges(p);
}


/* ========================= */
/* ===== Prompt/journal ==== */
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
  const who = ui_viewer() === cur ? '' : ui_nameHtml(cur) + ': ';
  return who + ui_fmt(X().prompt);
}

// Events since the viewer's latest decision (last 12 when nobody is human),
// plus the board elements they touched. Memoised: every board element asks.
let _recent = { src: null, w: null, list: [], v: new Set(), e: new Set(), h: new Set() };
function ui_recent() {
  const view = V(), src = view.events || null, w = ui_viewer();
  if (src === _recent.src && w === _recent.w) return _recent;
  const all = src || [];
  const list = w >= 0 ? all.filter(e => e.id > ((view.marks || [])[w] || 0)) : all.slice(-12);
  const r = { src, w, list, v: new Set(), e: new Set(), h: new Set() };
  for (const ev of list) {
    for (const k of ['v', 'e', 'h']) (ev[k] || []).forEach(i => r[k].add(i));
  }
  _recent = r;
  return r;
}
function ui_evHtml(ev) {
  const w = ui_viewer();
  let s = ui_fmt(ev.t);
  if (ev.pt && (w < 0 || S().gameEnded || (ev.ps || []).includes(w))) s += ` <span class="priv">(${ev.pt})</span>`;
  return s;
}
function ui_isRecent(kind, i) { return ui_recent()[kind].has(i); }


/* ========================= */
/* ===== Board         ===== */
/* ========================= */

function ui_hexFill(h) { const x = V().hexes; return x ? HEX_COLORS[x[h][0]] : '#ddd'; }
function ui_hexNum(h) { const x = V().hexes; return x ? x[h][1] : 0; }
function ui_numColor(h) { const n = ui_hexNum(h); return (n === 6 || n === 8) ? '#c0392b' : '#3b2f1e'; }
function ui_pips(h) { const n = ui_hexNum(h); return n ? '•'.repeat(6 - Math.abs(7 - n)) : ''; }
function ui_robber(h) { const x = V().hexes; return !!x && x[h][2] === 1; }
function ui_hexTarget(h) { return ui_canAct() && ((X().hAct || [])[h] ?? -1) !== -1; }
function ui_clickHex(h) {
  if (!ui_hexTarget(h)) return;
  const a = X().hAct[h];
  if (a >= 0) S().act('play', a); else S().act('hex', h);
}

function ui_edgeOwner(e) { const x = V().edges; return x ? x[e] : -1; }
function ui_edgeColor(e) { const o = ui_edgeOwner(e); return o >= 0 ? SEAT_COLORS[o] : 'none'; }
function ui_edgeTarget(e) { return ui_canAct() && ((X().eAct || [])[e] ?? -1) >= 0; }
function ui_clickEdge(e) { if (ui_edgeTarget(e)) S().act('play', X().eAct[e]); }

function ui_building(v) { const x = V().verts; return x ? x[v][0] : 0; }
function ui_vertColor(v) { const x = V().verts; return x && x[v][1] >= 0 ? SEAT_COLORS[x[v][1]] : 'none'; }
function ui_vertTarget(v) { return ui_canAct() && ((X().vAct || [])[v] ?? -1) >= 0; }
function ui_clickVert(v) { if (ui_vertTarget(v)) S().act('play', X().vAct[v]); }
function ui_actorColor() { return SEAT_COLORS[S().currentPlayer] || '#000'; }

function ui_portLabel(p) { const t = (V().ports || [])[p]; return t === 6 ? '3:1' : (t > 0 ? '2:1' : ''); }
function ui_portRes(p) { const t = (V().ports || [])[p]; return (t > 0 && t < 6) ? RES_EMOJI[t - 1] : ''; }

function _pts(list) { return list.map(([x, y]) => `${x},${y}`).join(' '); }
function _shape(x, y, pts, k) { return _pts(pts.map(([dx, dy]) => [+(x + k * dx).toFixed(2), +(y + k * dy).toFixed(2)])); }
const _HOUSE = [[-2, 1.7], [2, 1.7], [2, -0.6], [0, -2.5], [-2, -0.6]];
const _CITY = [[-3.1, 1.9], [3.1, 1.9], [3.1, -0.9], [0.7, -0.9], [0.7, -2.1], [-1.2, -3.5], [-3.1, -2.1]];

// Static SVG skeleton, written once and injected with x-html: Alpine cannot run
// x-for inside an <svg>. Geometry comes from geometry.js; every element binds
// to the store by its engine index.
function ui_boardSvg() {
  const G = GEO;
  const [bx, by, bw, bh] = G.viewBox.split(' ').map(Number);
  let s = `<rect class="deco" x="${bx}" y="${by}" width="${bw}" height="${bh}" rx="6" fill="#9fcfe8"/>`;

  // ports: two dashed piers and a label
  G.port.forEach(([a, b, x, y], p) => {
    for (const v of [a, b]) {
      s += `<line class="deco" x1="${x}" y1="${y}" x2="${G.vert[v][0]}" y2="${G.vert[v][1]}" stroke="#7b6a4a" stroke-width="0.5" stroke-dasharray="1 0.8"/>`;
    }
    s += `<circle class="deco" cx="${x}" cy="${y}" r="3.3" fill="#fffaf0" stroke="#7b6a4a" stroke-width="0.35"/>`
       + `<text class="deco" x="${x}" :y="ui_portRes(${p}) ? ${(y - 0.7).toFixed(2)} : ${(y + 0.8).toFixed(2)}" font-size="2.1" text-anchor="middle" font-weight="bold" fill="#3b2f1e" x-text="ui_portLabel(${p})"></text>`
       + `<text class="deco" x="${x}" y="${y + 2.0}" font-size="2.2" text-anchor="middle" x-text="ui_portRes(${p})"></text>`;
  });

  // hexes (clickable for the robber), number tokens, robber
  G.hex.forEach(([x, y], h) => {
    const pts = _pts(G.hexV[h].map(v => G.vert[v]));
    s += `<polygon data-h="${h}" points="${pts}" :fill="ui_hexFill(${h})" stroke="#f3ead2" stroke-width="0.7" @click="ui_clickHex(${h})" :style="ui_hexTarget(${h}) ? 'cursor:pointer' : ''"/>`
       + `<polygon class="deco" points="${pts}" fill="none" stroke="#222" stroke-width="0.9" stroke-dasharray="2 1.2" x-show="ui_hexTarget(${h})"/>`
       + `<polygon class="deco" points="${pts}" fill="none" stroke="tan" stroke-width="1.1" x-show="ui_isRecent('h', ${h})"/>`
       + `<g class="deco" x-show="ui_hexNum(${h}) > 0">`
       +   `<circle cx="${x}" cy="${y}" r="3.4" fill="#fbf3dc" stroke="#6b5a3a" stroke-width="0.3"/>`
       +   `<text x="${x}" y="${y + 0.6}" font-size="3.1" text-anchor="middle" font-weight="bold" :fill="ui_numColor(${h})" x-text="ui_hexNum(${h})"></text>`
       +   `<text x="${x}" y="${y + 2.6}" font-size="1.9" text-anchor="middle" :fill="ui_numColor(${h})" x-text="ui_pips(${h})"></text>`
       + `</g>`
       + `<circle class="deco" x-show="ui_robber(${h})" cx="${(x - 4.8).toFixed(2)}" cy="${(y + 2.6).toFixed(2)}" r="2.1" fill="#222" stroke="#eee" stroke-width="0.4"/>`;
  });

  // roads and road targets
  G.edge.forEach(([a, b], e) => {
    const [x0, y0] = G.vert[a], [x1, y1] = G.vert[b];
    const at = t => [(x0 + t * (x1 - x0)).toFixed(2), (y0 + t * (y1 - y0)).toFixed(2)];
    const [p0x, p0y] = at(0.2), [p1x, p1y] = at(0.8), [mx, my] = at(0.5);
    s += `<line class="deco" x1="${p0x}" y1="${p0y}" x2="${p1x}" y2="${p1y}" stroke-width="1.8" stroke-linecap="round" :stroke="ui_edgeColor(${e})" x-show="ui_edgeOwner(${e}) >= 0"/>`
       + `<line class="deco pulse" x1="${p0x}" y1="${p0y}" x2="${p1x}" y2="${p1y}" stroke-width="1.2" stroke-dasharray="1.3 0.9" :stroke="ui_actorColor()" x-show="ui_edgeTarget(${e})"/>`
       + `<circle class="deco" cx="${mx}" cy="${my}" r="0.9" fill="tan" stroke="#5a4a2a" stroke-width="0.25" x-show="ui_isRecent('e', ${e})"/>`;
  });

  // buildings and vertex targets
  G.vert.forEach(([x, y], v) => {
    s += `<polygon class="deco" points="${_shape(x, y, _HOUSE, 1)}" :fill="ui_vertColor(${v})" stroke="#fff" stroke-width="0.45" x-show="ui_building(${v}) === 1"/>`
       + `<polygon class="deco" points="${_shape(x, y, _CITY, 1)}" :fill="ui_vertColor(${v})" stroke="#fff" stroke-width="0.45" x-show="ui_building(${v}) === 2"/>`
       + `<circle class="deco pulse" cx="${x}" cy="${y}" :r="ui_building(${v}) ? 3.6 : 1.5" :fill="ui_building(${v}) ? 'none' : '#fff'" :stroke="ui_actorColor()" stroke-width="0.7" x-show="ui_vertTarget(${v})"/>`
       + `<circle class="deco" cx="${(x + 2.3).toFixed(2)}" cy="${(y - 2.3).toFixed(2)}" r="0.9" fill="tan" stroke="#5a4a2a" stroke-width="0.25" x-show="ui_isRecent('v', ${v})"/>`;
  });

  // invisible hit areas, on top, active only for legal targets
  G.edge.forEach(([a, b], e) => {
    const [x0, y0] = G.vert[a], [x1, y1] = G.vert[b];
    const at = t => [(x0 + t * (x1 - x0)).toFixed(2), (y0 + t * (y1 - y0)).toFixed(2)];
    const [p0x, p0y] = at(0.25), [p1x, p1y] = at(0.75);
    s += `<line data-e="${e}" x1="${p0x}" y1="${p0y}" x2="${p1x}" y2="${p1y}" stroke="transparent" stroke-width="5" @click="ui_clickEdge(${e})" :class="ui_edgeTarget(${e}) ? 'hit' : 'nohit'"/>`;
  });
  G.vert.forEach(([x, y], v) => {
    s += `<circle data-v="${v}" cx="${x}" cy="${y}" r="3.6" fill="transparent" @click="ui_clickVert(${v})" :class="ui_vertTarget(${v}) ? 'hit' : 'nohit'"/>`;
  });
  return s;
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
        `${counterAPI_base}/catan_${counterAPI_suffix}`
    ];
    urls.forEach(url => {
        fetch(url, { mode: 'no-cors' }).catch(e => {
            console.debug("Analytics blocked or failed");
        });
    });
});

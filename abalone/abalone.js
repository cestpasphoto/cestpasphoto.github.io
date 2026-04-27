// Defines the Python environment dependencies for Pyodide
const list_of_files = [
  ['abalone/Game.py', 'Game.py'],
  ['abalone/AbaloneGame.py', 'AbaloneGame.py'],
  ['abalone/proxy.py', 'proxy.py'],
  ['abalone/MCTS.py', 'MCTS.py'],
  ['abalone/AbaloneLogicNumba.py', 'AbaloneLogicNumba.py'],
];

// Define tensor shapes required for the ONNX neural network inference
const sizeCB = [1, 9, 9, 4]; // (Batch, H, W, Channels)
const sizeV = [1, onnxOutputSize]; // 3402

// Default number of MCTS simulations
const numMCTSSims = 50;

// Colors matching the classic game: Black (Player 0) and White (Player 1)
const colors = {
    '-1': 'transparent', // Empty cell
    '0': '#111111',      // Black marbles
    '1': '#EEEEEE'       // White marbles
};

// Generates the SVG markup for a single hexagonal cell and its marble if present.
// Converts axial coordinates (r, q) to cartesian coordinates (x, y).
function ui_renderCell(cell) {
    if (!cell) return '';

    const R = 5; 
    const W = R * Math.sqrt(3);
    const H = R * 2; 
    
    const r_offset = cell.r - 4;
    const q_offset = cell.q - 4;
    
    const cx = 50; 
    const cy = 50; 
    
    const x = cx + (q_offset + r_offset / 2) * W;
    const y = cy + r_offset * (H * 0.75);

    const points = [
        [0, -R], [W/2, -R/2], [W/2, R/2], 
        [0, R], [-W/2, R/2], [-W/2, -R/2]
    ].map(p => `${x + p[0]},${y + p[1]}`).join(' ');

    // Styles épurés pour le plateau
    let hexFill = 'transparent'; 
    let hexStroke = '#cccccc';
    let hexStrokeWidth = 0.3;
    let cursor = 'default';

    if (cell.isSelectable) {
        hexFill = '#f4f4f4'; // Léger gris au survol possible
        cursor = 'pointer';
    }
    if (cell.isSelected) {
        hexFill = '#e0e0e0';
        hexStroke = '#888888';
        hexStrokeWidth = 1;
    }

    let marbleHtml = '';
    if (cell.player !== -1) {
        // Couleurs brutes : Noir (0) et Blanc (1)
        const marbleColor = cell.player === 0 ? '#000000' : '#ffffff';
        // Ajout d'une bordure noire pour que la bille blanche soit visible sur fond blanc
        const marbleStroke = cell.player === 1 ? 'stroke="#000000" stroke-width="0.3"' : '';
        const radius = cell.isSelected ? R * 0.75 : R * 0.7;
        
        marbleHtml = `
            <circle cx="${x}" cy="${y}" r="${radius}" fill="${marbleColor}" ${marbleStroke} />
        `;
    }

    let lastMoveHtml = '';
    if (cell.lastMove) {
        lastMoveHtml = `<circle cx="${x}" cy="${y}" r="${R * 0.15}" fill="red" />`;
    }

    return `
        <g transform="translate(0, 0)" onclick="Alpine.store('game').act('click_cell', ${cell.r}, ${cell.q})" style="cursor: ${cursor}">
            <polygon points="${points}" fill="${hexFill}" stroke="${hexStroke}" stroke-width="${hexStrokeWidth}" />
            ${marbleHtml}
            ${lastMoveHtml}
        </g>
    `;
}

// Assemble les cellules et génère le SVG complet
function ui_renderBoard(cells) {
    if (!cells || cells.length === 0) {
        return '<svg viewBox="0 0 100 100"></svg>';
    }
    
    const cellsHtml = cells.map(cell => ui_renderCell(cell)).join('');
    return `<svg viewBox="0 0 100 100">${cellsHtml}</svg>`;
}

// Executes a non-blocking telemetry ping for basic traffic analytics on page load.
const counterAPI_base = 'https://abacus.jasoncameron.dev/hit/cestpasphoto.github.io';
const counterAPI_suffix = new Date().toISOString().slice(2,7).replace('-','');

window.addEventListener('load', () => {
    const urls = [ 
        `${counterAPI_base}/overall`, 
        `${counterAPI_base}/overall_${counterAPI_suffix}`,
        `${counterAPI_base}/abalone_${counterAPI_suffix}`
    ];
    
    urls.forEach(url => {
        fetch(url, { mode: 'no-cors' }).catch(e => {
            console.debug("Analytics blocked or failed");
        });
    })
});
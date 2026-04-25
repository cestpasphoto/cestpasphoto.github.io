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

    // Mathematical conversion from Axial (r, q) to Cartesian (x, y) for pointy-topped hexes
    const R = 5; // Hexagon radius in SVG coordinate units
    const W = R * Math.sqrt(3); // Width
    const H = R * 2; // Height
    
    // The center of the 9x9 board is at r=4, q=4
    const r_offset = cell.r - 4;
    const q_offset = cell.q - 4;
    
    const cx = 50; // SVG ViewBox Center X
    const cy = 50; // SVG ViewBox Center Y
    
    const x = cx + (q_offset + r_offset / 2) * W;
    const y = cy + r_offset * (H * 0.75);

    // Calculate hexagon points relative to its center
    const points = [
        [0, -R], [W/2, -R/2], [W/2, R/2], 
        [0, R], [-W/2, R/2], [-W/2, -R/2]
    ].map(p => `${x + p[0]},${y + p[1]}`).join(' ');

    // Styling based on state from proxy.py
    let hexFill = '#cfb997'; // Classic wooden board color
    let hexStroke = '#8c7352';
    let hexStrokeWidth = 0.3;
    let cursor = 'default';

    if (cell.isSelectable) {
        hexFill = '#e3cfb3'; // Brighter when hoverable/selectable
        cursor = 'pointer';
    }
    if (cell.isSelected) {
        hexFill = '#a6cfb3'; // Greenish tint for selected group
        hexStroke = '#2b7a4b';
        hexStrokeWidth = 1;
    }

    let marbleHtml = '';
    if (cell.player !== -1) {
        const marbleColor = colors[cell.player];
        const shadowColor = cell.player === 0 ? '#000000' : '#bbbbbb';
        
        // Add a slight scale effect if it's the anchor/selected
        const radius = cell.isSelected ? R * 0.75 : R * 0.7;
        
        marbleHtml = `
            <circle cx="${x}" cy="${y}" r="${radius}" fill="${marbleColor}" filter="drop-shadow(1px 2px 2px rgba(0,0,0,0.5))" />
            <circle cx="${x - R*0.2}" cy="${y - R*0.2}" r="${radius * 0.2}" fill="white" opacity="0.3" filter="blur(0.5px)" />
        `;
    }

    // Last move indicator
    let lastMoveHtml = '';
    if (cell.lastMove) {
        lastMoveHtml = `<circle cx="${x}" cy="${y}" r="${R * 0.15}" fill="red" />`;
    }

    // Wrap the cell in a clickable group, sending the act('click_cell', r, q) to Alpine
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

// Analytics (optional, copied from your framework)
window.addEventListener('load', () => {
    // ... ton code d'analytics existant ...
});
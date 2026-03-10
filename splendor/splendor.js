// Defines the Python environment dependencies to be fetched and mounted by Pyodide during initialization.
const list_of_files = [
  ['splendor/Game.py', 'Game.py'],
  ['splendor/proxy.py', 'proxy.py'],
  ['splendor/MCTS.py', 'MCTS.py'],
  ['splendor/SplendorLogic.py', 'SplendorLogic.py'],
  ['splendor/SplendorLogicNumba.py', 'SplendorLogicNumba.py'],
  [pyConstantsFileName, 'SplendorGame.py'],
];

// Default number of Monte Carlo Tree Search simulations determining the AI's base calculation depth.
const numMCTSSims = 25;

// Generates the SVG markup for a standard development card.
// Handles point values, cost distribution, and visual overlays for selection states or previous actions.
function ui_renderCard(card, isSelected, isLastAction, cssClass = 'svgL') {
    if (!card || card[0] < 0) {
        return `<svg class="${cssClass}" viewBox="0 0 60 60"></svg>`;
    }

    const colorIdx = card[0];
    const points = card[1];
    const costs = card[2];

    const bgColor = colors[colorIdx][0];
    const headerColor = colors[colorIdx][1];
    const textColor = colors[colorIdx][2];

    const tCenters = [ [12, 50], [12, 32], [30, 50], [30, 32] ];

    let costsHtml = '';
    if (costs) {
        for (let i = 0; i < costs.length; i++) {
            const costColorIdx = costs[i][0];
            const costAmount = costs[i][1];
            costsHtml += `
                <circle cx="${tCenters[i][0]}" cy="${tCenters[i][1]}" r="6" fill="${colors[costColorIdx][1]}" />
                <text x="${tCenters[i][0]}" y="${tCenters[i][1]}" text-anchor="middle" dominant-baseline="central" font-size="10" font-weight="bolder" fill="${colors[costColorIdx][2]}">${costAmount}</text>
            `;
        }
    }

    const selectionHtml = isSelected 
        ? '<rect width="100%" height="100%" style="fill:none;stroke-width:6;stroke:aquamarine" />' 
        : '';
        
    const lastActionHtml = isLastAction
        ? '<circle cx="51" cy="9" r="5" fill="tan" />'
        : '';

    return `
        <svg class="${cssClass}" viewBox="0 0 60 60">
            <rect width="100%" height="100%" fill="${bgColor}"/>
            <rect width="100%" height="30%" fill="white" fill-opacity="50%"/>
            <rect width="13" height="13" x="39" y="3" fill="${headerColor}"/> 
            ${points > 0 ? `<text x="15" y="10.2" text-anchor="middle" dominant-baseline="central" font-size="16" font-weight="bolder" fill="${textColor}">${points}</text>` : ''}
            ${costsHtml}
            ${selectionHtml}
            ${lastActionHtml}
        </svg>
    `;
}

// Generates the SVG markup for a miniature card token, representing accumulated permanent gem bonuses.
function ui_renderCardToken(colorIdx, count, cssClass = 'svgS') {
    if (count <= 0) return `<svg class="${cssClass}" viewBox="0 0 32 32"></svg>`;
    
    return `
        <svg class="${cssClass}" viewBox="0 0 32 32">
            <rect width="100%" height="100%" fill="${colors[colorIdx][1]}" />
            <text x="16" y="16" text-anchor="middle" dominant-baseline="central" font-size="16" font-weight="bolder" fill="${colors[colorIdx][2]}">${count}</text>
        </svg>
    `;
}

// Generates the SVG markup for a noble tile, displaying the specific card bonuses required to acquire it.
function ui_renderNoble(noble, isSelected, cssClass = 'svgS') {
    if (!noble || noble.length === 0) {
        return `<svg class="${cssClass}" viewBox="0 0 32 32"></svg>`;
    }

    let costsHtml = '';
    const coords = [[8, 24], [24, 24], [16, 8]];

    for (let i = 0; i < noble.length; i++) {
        const cIdx = noble[i][0];
        const cAmt = noble[i][1];
        costsHtml += `
            <rect x="${coords[i][0] - 3.5}" y="${coords[i][1] - 3.5}" width="7" height="7" fill="${colors[cIdx][1]}" />
            <text x="${coords[i][0]}" y="${coords[i][1]}" text-anchor="middle" dominant-baseline="central" font-size="6" font-weight="bolder" fill="${colors[cIdx][2]}">${cAmt}</text>
        `;
    }

    const selectionHtml = isSelected 
        ? '<rect width="100%" height="100%" style="fill:none;stroke-width:3;stroke:aquamarine" />' 
        : '';

    return `
        <svg class="${cssClass}" viewBox="0 0 32 32">
            <rect width="100%" height="100%" fill="${colors[6][0]}"/>
            <rect width="50%" height="100%" fill="white" fill-opacity="50%"/>
            ${costsHtml}
            ${selectionHtml}
        </svg>
    `;
}

// Generates the SVG markup for a standard gem token.
// Handles quantity display and dynamic stroke outlines based on the active selection type.
function ui_renderGem(colorIdx, count, selectionType = 'none', isLastAction = false, cssClass = 'svgM') {
    if (count === 0 && colorIdx < 5 && selectionType === 'none') {
        return `<svg class="${cssClass}" viewBox="0 0 32 32"></svg>`;
    }

    let contentHtml = '';
    if (count > 0 || colorIdx === 5) {
        contentHtml = `
            <circle cx="16" cy="16" r="16" fill="${colors[colorIdx][1]}" />
            <text x="16" y="16" text-anchor="middle" dominant-baseline="central" font-size="16" font-weight="bolder" fill="${colors[colorIdx][2]}">${count}</text>
        `;
    }

    let strokeHtml = '';
    if (selectionType === 'select_1') strokeHtml = `<circle cx="16" cy="16" r="14" style="fill:none;stroke-width:3;stroke:aquamarine" />`;
    if (selectionType === 'select_2') strokeHtml = `<circle cx="16" cy="16" r="14" style="fill:none;stroke-width:3;stroke:tan" />`;

    let lastActionHtml = isLastAction ? `<circle cx="27" cy="5" r="3" fill="tan" />` : '';

    return `
        <svg class="${cssClass}" viewBox="0 0 32 32">
            ${contentHtml}
            ${strokeHtml}
            ${lastActionHtml}
        </svg>
    `;
}

// Executes a non-blocking telemetry ping for basic traffic analytics on page load.
const counterAPI_base = 'https://abacus.jasoncameron.dev/hit/cestpasphoto.github.io';
const counterAPI_suffix = new Date().toISOString().slice(2,7).replace('-','');

window.addEventListener('load', () => {
    const urls = [ 
        `${counterAPI_base}/overall`, 
        `${counterAPI_base}/overall_${counterAPI_suffix}`,
        `${counterAPI_base}/splendor_${counterAPI_suffix}`
    ];
    
    urls.forEach(url => {
        fetch(url, { mode: 'no-cors' }).catch(e => {
            console.debug("Analytics blocked or failed");
        });
    });
});
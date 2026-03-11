/* ==================================================== */
/* ===== AKROPOLIS SVG RENDERING ENGINE (Vanilla) ===== */
/* ==================================================== */

// Generates the SVG string for a single hexagon (used by all other functions)
function renderSingleHex(x, y, desc, h, isGhost = false) {
    if (desc === TILE_EMPTY) return '';

    // Apply the 3D elevation shift
    let cy = y - (h - 1) * HEIGHT_Z_SHIFT;
    let cx = x;
    
    let color = COLORS[desc] || '#ffffff';
    let label = getTileLabel(desc);
    
    // Ghost styling for placement preview
    let strokeWidth = isGhost ? 2 : 1;
    let strokeColor = isGhost ? 'black' : '#333';
    let dashArray = isGhost ? '5,5' : 'none';
    let opacity = isGhost ? 0.6 : 1.0;
    
    let elements = [];
    
    // Base polygon
    elements.push(`<polygon points="${getHexPolygon(cx, cy)}" fill="${color}" stroke="${strokeColor}" stroke-width="${strokeWidth}" stroke-dasharray="${dashArray}" opacity="${opacity}" />`);
    
    // Icon / Label
    if (label) {
         elements.push(`<text x="${cx}" y="${cy}" text-anchor="middle" dominant-baseline="central" font-size="16" fill="black" opacity="${opacity}">${label}</text>`);
    }
    
    // Height Indicator (White circle with number)
    if (h > 1 && !isGhost) {
        let badgeX = cx + HEX_W/3 - 4;
        let badgeY = cy - HEX_R/2 + 4;
        elements.push(`<circle cx="${badgeX}" cy="${badgeY}" r="7" fill="white" stroke="black" stroke-width="1" />`);
        elements.push(`<text x="${badgeX}" y="${badgeY}" text-anchor="middle" dominant-baseline="central" font-size="10" font-weight="bold" fill="black">${h}</text>`);
    }
    
    return elements.join('');
}

// Render a market tile (3 hexes standard orientation)
globalThis.ui_renderTile = function(tileData, isSelected, svgClass) {
    if (!tileData || tileData.length < 3) return '';

    // Standard static coordinates for the construction site tiles (Orientation 0)
    // Center is (0,0), SW is (-1, 1), SE is (0, 1) in our mapped system
    let c0 = getHexCoords(1, -1); // SW
    let c1 = getHexCoords(0, 0);  // Center
    let c2 = getHexCoords(1, 0);  // SE
    
    let svgs = [];
    svgs.push(renderSingleHex(c0.x, c0.y, tileData[0], 1));
    svgs.push(renderSingleHex(c1.x, c1.y, tileData[1], 1));
    svgs.push(renderSingleHex(c2.x, c2.y, tileData[2], 1));
    
    let stroke = isSelected ? 'stroke="red" stroke-width="4"' : '';
    
    // Hardcoded viewBox centered on the tile cluster
    return `<svg class="${svgClass}" viewBox="-60 -40 120 100" ${stroke} style="overflow: visible;">${svgs.join('')}</svg>`;
};

// Render the player's city
globalThis.ui_renderCity = function(cityState) {
    if (!cityState || cityState.length === 0) return '';
    
    // VERY IMPORTANT: Sort by height ascending, then row (r) ascending.
    // This ensures lower levels are drawn first, and northern hexes are drawn behind southern hexes,
    // creating a flawless 3D isometric illusion.
    let sorted = [...cityState].sort((a, b) => {
        if (a.h !== b.h) return a.h - b.h;
        if (a.r !== b.r) return a.r - b.r;
        return a.q - b.q;
    });
    
    let svgs = sorted.map(hex => {
        let coords = getHexCoords(hex.r, hex.q);
        return renderSingleHex(coords.x, coords.y, hex.desc, hex.h);
    });
    
    return svgs.join('');
};

// Render valid targets and the currently hovering ghost tile
globalThis.ui_renderValidMoves = function(validPlacements, ghostHexes, selectedSite) {
    let svgs = [];
    
    // Draw small target circles for valid placement sites
    if (validPlacements && validPlacements.length > 0) {
        validPlacements.forEach(siteIdx => {
            let r = Math.floor(siteIdx / 13); // CITY_SIZE is 13
            let q = siteIdx % 13;
            let coords = getHexCoords(r, q);
            
            let isSelected = (siteIdx === selectedSite);
            let color = isSelected ? 'rgba(255, 0, 0, 0.7)' : 'rgba(0, 0, 0, 0.15)';
            let cursor = isSelected ? 'default' : 'pointer';
            
            // Add Alpine click event directly to the SVG element
            svgs.push(`<circle cx="${coords.x}" cy="${coords.y}" r="12" fill="${color}" style="cursor: ${cursor}" @click="$store.game.act('select_position', ${siteIdx})" />`);
        });
    }
    
    // Draw the ghost tile if a site is selected
    if (selectedSite >= 0 && ghostHexes && ghostHexes.length > 0) {
        // Find the player's current city state to calculate stacked height
        const store = Alpine.store('game');
        let cityState = store.view.players[store.currentPlayer].city_state;
        
        ghostHexes.forEach(hex => {
            let coords = getHexCoords(hex.r, hex.q);
            
            // Query current height at this specific location
            let baseHeight = 0;
            let existing = cityState.find(h => h.r === hex.r && h.q === hex.q);
            if (existing) baseHeight = existing.h;
            
            svgs.push(renderSingleHex(coords.x, coords.y, hex.desc, baseHeight + 1, true));
        });
    }
    
    return svgs.join('');
};

globalThis.ui_getCityViewBox = function(cityState) {
    if (!cityState || cityState.length === 0) return "-100 -100 200 200";
    
    let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
    
    cityState.forEach(hex => {
        let coords = getHexCoords(hex.r, hex.q);
        // Apply height shift for Y boundary
        let cy = coords.y - (hex.h - 1) * HEIGHT_Z_SHIFT;
        
        if (coords.x < minX) minX = coords.x;
        if (coords.x > maxX) maxX = coords.x;
        if (cy < minY) minY = cy;
        if (cy > maxY) maxY = cy;
    });
    
    // Add margin around the bounds
    let padding = 80;
    let width = (maxX - minX) + padding * 2;
    let height = (maxY - minY) + padding * 2;
    
    // Maintain a minimum zoom level
    if (width < 300) width = 300;
    if (height < 300) height = 300;
    
    return `${minX - padding} ${minY - padding} ${width} ${height}`;
};
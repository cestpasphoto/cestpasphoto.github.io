/* ==================================================== */
/* ===== AKROPOLIS 3D RENDERING ENGINE (Vanilla) ====== */
/* ==================================================== */

// Rule 2 & 4: Calculate 3D points and generate shading polygons
function renderSingleHex3D(x, y, desc, h, isGhost = false) {
    if (desc === TILE_EMPTY) return '';

    // Rule 3: Elevation visual shift. Subtract (Z * T) to Y. 
    // Here h is 1-indexed, so base level (h=1) has 0 shift.
    let cy = y - ((h - 1) * TILE_THICKNESS);
    let cx = x;
    
    let color = COLORS[desc] || '#ffffff';
    let label = getTileLabel(desc);
    
    // Calculate the 6 points of the squashed top face
    let p0 = [cx, cy - HEX_R * ISO_RATIO];                  // Top
    let p1 = [cx + HEX_W/2, cy - (HEX_R/2) * ISO_RATIO];    // Top Right
    let p2 = [cx + HEX_W/2, cy + (HEX_R/2) * ISO_RATIO];    // Bottom Right
    let p3 = [cx, cy + HEX_R * ISO_RATIO];                  // Bottom
    let p4 = [cx - HEX_W/2, cy + (HEX_R/2) * ISO_RATIO];    // Bottom Left
    let p5 = [cx - HEX_W/2, cy - (HEX_R/2) * ISO_RATIO];    // Top Left

    // Function to add thickness to a point (shift down by T)
    const down = (p) => [p[0], p[1] + TILE_THICKNESS];

    let elements = [];
    let opacity = isGhost ? 0.5 : 1.0;

    // --- LATERAL FACES (Rule 2) ---
    // Left Face (Points 5 -> 4 -> 4_down -> 5_down)
    let leftFace = [p5, p4, down(p4), down(p5)].map(p => p.join(',')).join(' ');
    elements.push(`<polygon points="${leftFace}" fill="${color}" opacity="${opacity}" />`);
    // Rule 4: Fake lighting with black polygon
    elements.push(`<polygon points="${leftFace}" fill="black" opacity="${isGhost ? 0.2 : 0.6}" />`);

    // Front Face (Points 4 -> 3 -> 3_down -> 4_down)
    let frontFace = [p4, p3, down(p3), down(p4)].map(p => p.join(',')).join(' ');
    elements.push(`<polygon points="${frontFace}" fill="${color}" opacity="${opacity}" />`);
    elements.push(`<polygon points="${frontFace}" fill="black" opacity="${isGhost ? 0.1 : 0.3}" />`);

    // Right Face (Points 3 -> 2 -> 2_down -> 3_down)
    let rightFace = [p3, p2, down(p2), down(p3)].map(p => p.join(',')).join(' ');
    elements.push(`<polygon points="${rightFace}" fill="${color}" opacity="${opacity}" />`);
    elements.push(`<polygon points="${rightFace}" fill="black" opacity="${isGhost ? 0.3 : 0.75}" />`);

    // --- TOP FACE ---
    let topFace = [p0, p1, p2, p3, p4, p5].map(p => p.join(',')).join(' ');
    elements.push(`<polygon points="${topFace}" fill="${color}" opacity="${opacity}" />`);
    
    // Rule 5: Top border for visibility
    let strokeColor = isGhost ? '#000000' : 'rgba(255, 255, 255, 0.6)';
    let strokeWidth = isGhost ? 2 : 1;
    let dash = isGhost ? 'stroke-dasharray="4,4"' : '';
    elements.push(`<polygon points="${topFace}" fill="transparent" stroke="${strokeColor}" stroke-width="${strokeWidth}" ${dash} opacity="${opacity}" />`);

    // Icon / Label
    if (label) {
         elements.push(`<text x="${cx}" y="${cy}" text-anchor="middle" dominant-baseline="central" font-size="14" font-weight="bold" fill="white" opacity="${opacity}" style="text-shadow: 1px 1px 2px black;">${label}</text>`);
    }

    // Height Badge (Optional, but useful if stack is hard to read)
    if (h > 1 && !isGhost) {
        let badgeX = cx + HEX_W/3 - 4;
        let badgeY = cy - HEX_R/2 * ISO_RATIO + 2;
        elements.push(`<circle cx="${badgeX}" cy="${badgeY}" r="6" fill="white" stroke="#333" stroke-width="1" />`);
        elements.push(`<text x="${badgeX}" y="${badgeY}" text-anchor="middle" dominant-baseline="central" font-size="9" font-weight="bold" fill="black">${h}</text>`);
    }

    return elements.join('');
}

// Rule 1: Painter's Algorithm sorting (Y ascending, then Z ascending)
function sortCityHexes(cityState) {
    return [...cityState].sort((a, b) => {
        // Since Y directly maps to 'r' in our grid system, we sort by 'r' first.
        if (a.r !== b.r) return a.r - b.r;
        // If same Y, sort by height 'h' (Z axis)
        if (a.h !== b.h) return a.h - b.h;
        return a.q - b.q;
    });
}

globalThis.ui_renderCity3D = function(cityState) {
    if (!cityState || cityState.length === 0) return '';
    
    let sorted = sortCityHexes(cityState);
    let svgs = sorted.map(hex => {
        let coords = getHexCoords(hex.r, hex.q);
        return renderSingleHex3D(coords.x, coords.y, hex.desc, hex.h);
    });
    
    return svgs.join('');
};

globalThis.ui_renderTile3D = function(tileData, isSelected, svgClass) {
    if (!tileData || tileData.length < 3) return '';

    // Standard static coordinates for the construction site tiles (Orientation 0)
    let c0 = getHexCoords(1, -1); // SW
    let c1 = getHexCoords(0, 0);  // Center
    let c2 = getHexCoords(1, 0);  // SE
    
    // Sort these 3 hardcoded hexes using painter's algo (r, then q)
    let parts = [
        { r: 0, q: 0, desc: tileData[1], x: c1.x, y: c1.y },
        { r: 1, q: -1, desc: tileData[0], x: c0.x, y: c0.y },
        { r: 1, q: 0, desc: tileData[2], x: c2.x, y: c2.y }
    ];
    parts.sort((a, b) => a.r - b.r || a.q - b.q);

    let svgs = parts.map(p => renderSingleHex3D(p.x, p.y, p.desc, 1));
    
    let stroke = isSelected ? 'stroke="red" stroke-width="3"' : '';
    return `<svg class="${svgClass}" viewBox="-60 -60 120 120" ${stroke} style="overflow: visible; filter: drop-shadow(0px 4px 6px rgba(0,0,0,0.3));">${svgs.join('')}</svg>`;
};

globalThis.ui_renderValidMoves3D = function(validPlacements, ghostHexes, selectedSite) {
    let svgs = [];
    
    // Draw targets
    if (validPlacements && validPlacements.length > 0) {
        validPlacements.forEach(siteIdx => {
            let r = Math.floor(siteIdx / 13);
            let q = siteIdx % 13;
            let coords = getHexCoords(r, q);
            
            // Find current height to place the target exactly on top of the stack
            const store = Alpine.store('game');
            let cityState = store.view.players[store.currentPlayer].city_state;
            let baseHeight = 0;
            let existing = cityState.find(h => h.r === r && h.q === q);
            if (existing) baseHeight = existing.h;

            let cy = coords.y - (baseHeight * TILE_THICKNESS); // Shift UP based on height
            
            let isSelected = (siteIdx === selectedSite);
            let color = isSelected ? 'rgba(255, 0, 0, 0.8)' : 'rgba(255, 255, 255, 0.4)';
            let cursor = isSelected ? 'default' : 'pointer';
            
            svgs.push(`<circle cx="${coords.x}" cy="${cy}" r="10" fill="${color}" stroke="#000" stroke-width="2" style="cursor: ${cursor}" @click="$store.game.act('select_position', ${siteIdx})" />`);
        });
    }
    
    // Draw Ghost Tile
    if (selectedSite >= 0 && ghostHexes && ghostHexes.length > 0) {
        const store = Alpine.store('game');
        let cityState = store.view.players[store.currentPlayer].city_state;
        
        let sortedGhost = sortCityHexes(ghostHexes);
        sortedGhost.forEach(hex => {
            let coords = getHexCoords(hex.r, hex.q);
            let baseHeight = 0;
            let existing = cityState.find(h => h.r === hex.r && h.q === hex.q);
            if (existing) baseHeight = existing.h;
            
            // Ghost is placed at baseHeight + 1
            svgs.push(renderSingleHex3D(coords.x, coords.y, hex.desc, baseHeight + 1, true));
        });
    }
    
    return svgs.join('');
};
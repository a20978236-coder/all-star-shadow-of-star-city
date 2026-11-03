import * as pc from 'playcanvas';
import { Rng } from '../core/MathUtils.js';

/**
 * Procedural placeholder textures generated on <canvas>. Swap these for real
 * art later by loading image assets with the same material slots.
 */
function makeCanvas(w, h) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    return c;
}

export function canvasTexture(device, canvas, { srgb = true, repeat = true, mipmaps = true, name = 'tex' } = {}) {
    const tex = new pc.Texture(device, {
        name,
        width: canvas.width,
        height: canvas.height,
        format: srgb ? pc.PIXELFORMAT_SRGBA8 : pc.PIXELFORMAT_RGBA8,
        mipmaps,
        minFilter: mipmaps ? pc.FILTER_LINEAR_MIPMAP_LINEAR : pc.FILTER_LINEAR,
        magFilter: pc.FILTER_LINEAR,
        addressU: repeat ? pc.ADDRESS_REPEAT : pc.ADDRESS_CLAMP_TO_EDGE,
        addressV: repeat ? pc.ADDRESS_REPEAT : pc.ADDRESS_CLAMP_TO_EDGE,
        anisotropy: 4
    });
    tex.setSource(canvas);
    return tex;
}

/**
 * Convert a greyscale height canvas into a tangent-space normal map canvas.
 * White = raised, black = recessed.
 */
export function heightToNormalCanvas(height, strength = 2.5) {
    const w = height.width, h = height.height;
    const src = height.getContext('2d').getImageData(0, 0, w, h).data;
    const out = makeCanvas(w, h);
    const og = out.getContext('2d');
    const img = og.createImageData(w, h);
    const H = (x, y) => src[(((y + h) % h) * w + ((x + w) % w)) * 4] / 255;
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            const dx = (H(x + 1, y) - H(x - 1, y)) * strength;
            const dy = (H(x, y + 1) - H(x, y - 1)) * strength;
            const l = Math.hypot(dx, dy, 1);
            const i = (y * w + x) * 4;
            img.data[i] = (-dx / l * 0.5 + 0.5) * 255;
            img.data[i + 1] = (dy / l * 0.5 + 0.5) * 255;
            img.data[i + 2] = (1 / l * 0.5 + 0.5) * 255;
            img.data[i + 3] = 255;
        }
    }
    og.putImageData(img, 0, 0);
    return out;
}

/**
 * Facade window grid. Returns { diffuse, emissive, normal } canvases. One texture tile
 * covers 16 x 16 windows (≈56 m x 57.6 m of facade). `size` is 512 or 1024.
 */
export function makeFacadeCanvases(style, seed, size = 1024) {
    const rng = new Rng(seed);
    const N = 16, S = size / N;
    const d = makeCanvas(size, size), e = makeCanvas(size, size), hm = makeCanvas(size, size);
    const dc = d.getContext('2d'), ec = e.getContext('2d'), hc = hm.getContext('2d');
    dc.fillStyle = style.wall; dc.fillRect(0, 0, size, size);
    ec.fillStyle = '#000'; ec.fillRect(0, 0, size, size);
    hc.fillStyle = '#9a9a9a'; hc.fillRect(0, 0, size, size);

    // wall material detail: bricks, concrete panels or curtain-wall seams
    if (style.brick) {
        const bh = S / 9, bw = S / 3.2;
        for (let y = 0, r = 0; y < size; y += bh, r++) {
            for (let x = (r % 2) * bw / 2 - bw; x < size; x += bw) {
                const v = rng.range(-14, 14);
                dc.fillStyle = `rgba(${120 + v},${60 + v * 0.6},${48 + v * 0.5},0.18)`;
                dc.fillRect(x + 1, y + 1, bw - 2, bh - 2);
                hc.fillStyle = '#5a5a5a'; hc.fillRect(x, y, bw, 1.2); hc.fillRect(x, y, 1.2, bh);
            }
        }
    } else {
        for (let i = 0; i < 2600; i++) {
            dc.fillStyle = `rgba(255,255,255,${rng.range(0, 0.03)})`;
            dc.fillRect(rng.range(0, size), rng.range(0, size), rng.range(2, 30), rng.range(2, 12));
        }
        // rain streaks / grime running down the facade
        for (let i = 0; i < 260; i++) {
            const x = rng.range(0, size), y = rng.range(0, size);
            const gr = dc.createLinearGradient(x, y, x, y + S * 3);
            gr.addColorStop(0, 'rgba(0,0,0,0.18)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
            dc.fillStyle = gr; dc.fillRect(x, y, rng.range(1, 3), S * 3);
        }
    }

    const litColors = style.lit;
    for (let row = 0; row < N; row++) {
        const floorBias = rng.range(-0.25, 0.25);
        const officeFloor = rng.chance(style.officeChance || 0.15);
        for (let col = 0; col < N; col++) {
            const x = col * S, y = row * S;
            const mx = S * style.marginX, my = S * style.marginY;
            const wx = x + mx, wy = y + my, ww = S - mx * 2, wh = S - my * 2;
            // recessed window (height) with a raised frame
            hc.fillStyle = '#e0e0e0'; hc.fillRect(wx - 2, wy - 2, ww + 4, wh + 4);
            hc.fillStyle = '#303030'; hc.fillRect(wx, wy, ww, wh);
            // glass with a diagonal sky reflection sheen
            const sheen = dc.createLinearGradient(wx, wy, wx + ww, wy + wh);
            sheen.addColorStop(0, style.glass);
            sheen.addColorStop(0.55, style.glassHi || style.glass);
            sheen.addColorStop(1, style.glass);
            dc.fillStyle = sheen; dc.fillRect(wx, wy, ww, wh);
            // mullions
            dc.fillStyle = 'rgba(0,0,0,0.45)';
            dc.fillRect(x + S / 2 - 1, wy, 2, wh);
            if (style.transom) dc.fillRect(wx, wy + wh * 0.3, ww, 2);
            hc.fillStyle = '#b0b0b0'; hc.fillRect(x + S / 2 - 1, wy, 2, wh);

            const lit = officeFloor ? rng.next() < 0.9 : rng.next() < style.litChance + floorBias;
            if (lit) {
                const c = officeFloor ? [220, 235, 255] : rng.pick(litColors);
                const a = rng.range(0.4, 1);
                // interior: brighter ceiling, darker floor = depth
                const ig = ec.createLinearGradient(0, wy, 0, wy + wh);
                ig.addColorStop(0, `rgba(${c[0]},${c[1]},${c[2]},${a})`);
                ig.addColorStop(0.65, `rgba(${c[0] * 0.8 | 0},${c[1] * 0.7 | 0},${c[2] * 0.6 | 0},${a * 0.75})`);
                ig.addColorStop(1, `rgba(${c[0] * 0.4 | 0},${c[1] * 0.3 | 0},${c[2] * 0.25 | 0},${a * 0.5})`);
                ec.fillStyle = ig; ec.fillRect(wx, wy, ww, wh);
                if (officeFloor) {                      // ceiling light strip
                    ec.fillStyle = 'rgba(255,255,255,0.9)'; ec.fillRect(wx, wy + 1, ww, Math.max(1.5, wh * 0.06));
                }
                const deco = rng.next();
                ec.fillStyle = 'rgba(0,0,0,0.6)';
                if (deco < 0.25) ec.fillRect(wx, wy, ww, wh * rng.range(0.2, 0.6));                  // blind down
                else if (deco < 0.45) {                                                              // curtains
                    ec.fillRect(wx, wy, ww * 0.22, wh); ec.fillRect(wx + ww * 0.78, wy, ww * 0.22, wh);
                } else if (deco < 0.55) {                                                            // silhouette
                    const px = wx + rng.range(0.25, 0.7) * ww;
                    ec.beginPath(); ec.arc(px, wy + wh * 0.42, wh * 0.09, 0, Math.PI * 2); ec.fill();
                    ec.fillRect(px - wh * 0.11, wy + wh * 0.52, wh * 0.22, wh * 0.48);
                } else if (deco < 0.7) {                                                             // venetian blinds
                    for (let k = 0; k < wh; k += 3) ec.fillRect(wx, wy + k, ww, 1);
                }
                dc.fillStyle = `rgba(${c[0]},${c[1]},${c[2]},0.18)`;
                dc.fillRect(wx, wy, ww, wh);
            }
        }
        // horizontal floor slab / ledge line
        const slabH = Math.max(3, S * style.marginY * 0.6);
        dc.fillStyle = style.slab;
        dc.fillRect(0, row * S, size, slabH);
        hc.fillStyle = '#d8d8d8'; hc.fillRect(0, row * S, size, slabH);
        dc.fillStyle = 'rgba(0,0,0,0.25)'; dc.fillRect(0, row * S + slabH, size, 2);
    }
    // soft blur of the height map before turning it into normals
    const hb = makeCanvas(size, size), hbc = hb.getContext('2d');
    hbc.filter = 'blur(1px)'; hbc.drawImage(hm, 0, 0);
    return { diffuse: d, emissive: e, normal: heightToNormalCanvas(hb, size >= 1024 ? 3 : 2) };
}

export const FACADE_STYLES = {
    glass: { wall: '#1a2230', glass: '#0b1220', glassHi: '#24344c', slab: '#263040', marginX: 0.06, marginY: 0.1, litChance: 0.3, officeChance: 0.22, lit: [[255, 230, 170], [190, 225, 255], [255, 255, 240]] },
    concrete: { wall: '#2a2a2e', glass: '#0d0f14', glassHi: '#1d2430', slab: '#36363c', marginX: 0.22, marginY: 0.22, transom: true, litChance: 0.28, lit: [[255, 210, 140], [255, 190, 120], [210, 230, 255]] },
    brick: { wall: '#3a2420', glass: '#100a0a', glassHi: '#22191a', slab: '#4a302a', marginX: 0.28, marginY: 0.2, brick: true, transom: true, officeChance: 0.04, litChance: 0.25, lit: [[255, 190, 110], [255, 170, 90]] },
    industrial: { wall: '#25292b', glass: '#121518', glassHi: '#1e2428', slab: '#30363a', officeChance: 0.05, marginX: 0.18, marginY: 0.34, litChance: 0.12, lit: [[200, 255, 200], [255, 220, 150]] },
    chaos: { wall: '#1d1416', glass: '#0b0506', glassHi: '#1c0f11', slab: '#2b1a1d', officeChance: 0.03, marginX: 0.2, marginY: 0.2, litChance: 0.22, lit: [[255, 60, 50], [255, 120, 80], [255, 200, 160]] }
};

/** 80 m road cell: asphalt with lane markings on the tile borders. */
export function makeRoadCanvas(size = 1024) {
    const c = makeCanvas(size, size), g = c.getContext('2d');
    const rng = new Rng(77);
    g.fillStyle = '#16171a'; g.fillRect(0, 0, size, size);
    for (let i = 0; i < 9000; i++) {
        const v = rng.int(10, 40);
        g.fillStyle = `rgba(${v},${v},${v + 4},0.5)`;
        g.fillRect(rng.range(0, size), rng.range(0, size), 2, 2);
    }
    // wet patches (darker, read as puddles under specular)
    for (let i = 0; i < 40; i++) {
        g.fillStyle = 'rgba(0,0,0,0.35)';
        g.beginPath();
        g.ellipse(rng.range(0, size), rng.range(0, size), rng.range(10, 60), rng.range(6, 30), rng.range(0, 3), 0, Math.PI * 2);
        g.fill();
    }
    const px = size / 80; // pixels per metre
    g.fillStyle = 'rgba(220,210,170,0.75)';
    for (let i = 0; i < 80; i += 6) {
        // centre dashes along the tile edges (roads are centred on edges)
        g.fillRect(i * px, 0, 3 * px, 0.25 * px);
        g.fillRect(i * px, size - 0.25 * px, 3 * px, 0.25 * px);
        g.fillRect(0, i * px, 0.25 * px, 3 * px);
        g.fillRect(size - 0.25 * px, i * px, 0.25 * px, 3 * px);
    }
    // crosswalks near intersections
    g.fillStyle = 'rgba(230,230,230,0.55)';
    for (let k = 0; k < 7; k++) {
        const o = (1.2 + k * 1.0) * px;
        g.fillRect(o, 9 * px, 0.5 * px, 4 * px);                   // west edge crossing
        g.fillRect(9 * px, o, 4 * px, 0.5 * px);
        g.fillRect(size - o, size - 13 * px, 0.5 * px, 4 * px);
        g.fillRect(size - 13 * px, size - o, 4 * px, 0.5 * px);
    }
    return c;
}

export function makeConcreteCanvas(base = '#3a3b40', seed = 5) {
    const size = 256, c = makeCanvas(size, size), g = c.getContext('2d');
    const rng = new Rng(seed);
    g.fillStyle = base; g.fillRect(0, 0, size, size);
    for (let i = 0; i < 2500; i++) {
        const v = rng.int(0, 255);
        g.fillStyle = `rgba(${v},${v},${v},0.06)`;
        g.fillRect(rng.range(0, size), rng.range(0, size), rng.range(1, 4), rng.range(1, 4));
    }
    g.strokeStyle = 'rgba(0,0,0,0.35)'; g.lineWidth = 2;
    for (let i = 0; i <= 4; i++) {
        g.beginPath(); g.moveTo(i * 64, 0); g.lineTo(i * 64, size); g.stroke();
        g.beginPath(); g.moveTo(0, i * 64); g.lineTo(size, i * 64); g.stroke();
    }
    return c;
}

export function makeSkyCanvas() {
    const w = 1024, h = 512, c = makeCanvas(w, h), g = c.getContext('2d');
    const grad = g.createLinearGradient(0, 0, 0, h);
    grad.addColorStop(0, '#02030a');
    grad.addColorStop(0.35, '#070b1c');
    grad.addColorStop(0.5, '#141a35');
    grad.addColorStop(0.56, '#2a1f3f');
    grad.addColorStop(1, '#05060c');
    g.fillStyle = grad; g.fillRect(0, 0, w, h);
    const rng = new Rng(11);
    for (let i = 0; i < 500; i++) {
        g.fillStyle = `rgba(255,255,255,${rng.range(0.1, 0.8)})`;
        g.fillRect(rng.range(0, w), rng.range(0, h * 0.42), 1, 1);
    }
    // storm clouds
    for (let i = 0; i < 160; i++) {
        const y = rng.range(h * 0.12, h * 0.52);
        const r = rng.range(20, 90);
        const cg = g.createRadialGradient(0, 0, 0, 0, 0, r);
        cg.addColorStop(0, `rgba(60,70,110,${rng.range(0.05, 0.16)})`);
        cg.addColorStop(1, 'rgba(60,70,110,0)');
        g.save(); g.translate(rng.range(0, w), y); g.scale(2.4, 1); g.fillStyle = cg;
        g.beginPath(); g.arc(0, 0, r, 0, Math.PI * 2); g.fill(); g.restore();
    }
    return c;
}

export function makeStarCanvas(color = '#b8ff2c', fill = false, blur = 18) {
    const size = 256, c = makeCanvas(size, size), g = c.getContext('2d');
    g.clearRect(0, 0, size, size);
    const pts = [];
    for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + i * Math.PI / 5;
        const r = i % 2 === 0 ? 110 : 46;
        pts.push([128 + Math.cos(a) * r, 132 + Math.sin(a) * r]);
    }
    g.beginPath(); pts.forEach((p, i) => i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])); g.closePath();
    g.shadowColor = color; g.shadowBlur = blur;
    if (fill) { g.fillStyle = color; g.fill(); } else { g.strokeStyle = color; g.lineWidth = 14; g.lineJoin = 'round'; g.stroke(); }
    return c;
}

export function makeDotCanvas() {
    const size = 64, c = makeCanvas(size, size), g = c.getContext('2d');
    const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(0.4, 'rgba(255,255,255,0.5)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad; g.fillRect(0, 0, size, size);
    return c;
}

/** Neon sign face with text/glyph. */
export function makeSignCanvas(text, color) {
    const w = 512, h = 128, c = makeCanvas(w, h), g = c.getContext('2d');
    g.fillStyle = '#000'; g.fillRect(0, 0, w, h);
    g.font = 'bold 78px "Arial Black", Arial, sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    g.shadowColor = color; g.shadowBlur = 20;
    g.strokeStyle = color; g.lineWidth = 6; g.strokeText(text, w / 2, h / 2 + 4);
    g.fillStyle = '#fff'; g.fillText(text, w / 2, h / 2 + 4);
    return c;
}

// ---------------------------------------------------------------------------
// Wet-surface maps: diffuse + gloss (puddles) + normal for roads and sidewalks
// ---------------------------------------------------------------------------

/**
 * Road maps for one 80 m cell. Puddles are dark in diffuse and near-mirror in
 * the gloss map, so they pick up neon reflections from the environment map.
 */
export function makeRoadMaps(size = 1024) {
    const diffuse = makeRoadCanvas(size);
    const rng = new Rng(4242);
    const gloss = makeCanvas(size, size), gg = gloss.getContext('2d');
    const height = makeCanvas(size, size), hg = height.getContext('2d');
    gg.fillStyle = '#7a7a7a'; gg.fillRect(0, 0, size, size);       // wet asphalt baseline
    hg.fillStyle = '#808080'; hg.fillRect(0, 0, size, size);
    // asphalt aggregate
    for (let i = 0; i < size * 14; i++) {
        const v = rng.int(70, 190);
        hg.fillStyle = `rgb(${v},${v},${v})`;
        hg.fillRect(rng.range(0, size), rng.range(0, size), 1.5, 1.5);
        if (i % 3 === 0) { const gv = rng.int(80, 140); gg.fillStyle = `rgb(${gv},${gv},${gv})`; gg.fillRect(rng.range(0, size), rng.range(0, size), 2, 2); }
    }
    // cracks
    hg.strokeStyle = '#303030'; hg.lineWidth = 1.5;
    const dg = diffuse.getContext('2d');
    dg.strokeStyle = 'rgba(0,0,0,0.45)'; dg.lineWidth = 1.2;
    for (let i = 0; i < 26; i++) {
        let x = rng.range(0, size), y = rng.range(0, size);
        hg.beginPath(); hg.moveTo(x, y); dg.beginPath(); dg.moveTo(x, y);
        for (let k = 0; k < 8; k++) { x += rng.range(-18, 18); y += rng.range(-18, 18); hg.lineTo(x, y); dg.lineTo(x, y); }
        hg.stroke(); dg.stroke();
    }
    // puddles: concentrated near the gutters (tile edges) and in random dips
    const px = size / 80;
    for (let i = 0; i < 55; i++) {
        const nearGutter = rng.chance(0.6);
        let x = rng.range(0, size), y = rng.range(0, size);
        if (nearGutter) {
            const edge = rng.int(0, 3), o = rng.range(5.5, 7.6) * px;
            if (edge === 0) x = o; else if (edge === 1) x = size - o; else if (edge === 2) y = o; else y = size - o;
        }
        const rx = rng.range(1.2, 4.5) * px, ry = rng.range(0.6, 2.2) * px, rot = rng.range(0, Math.PI);
        for (const [ctx, col] of [[gg, '#ffffff'], [dg, 'rgba(2,3,6,0.55)'], [hg, '#7a7a7a']]) {
            ctx.save(); ctx.translate(x, y); ctx.rotate(rot);
            const r = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
            r.addColorStop(0, col); r.addColorStop(0.8, col); r.addColorStop(1, ctx === gg ? 'rgba(122,122,122,0)' : 'rgba(0,0,0,0)');
            ctx.fillStyle = r; ctx.scale(1, ry / rx); ctx.beginPath(); ctx.arc(0, 0, rx, 0, Math.PI * 2); ctx.fill();
            ctx.restore();
        }
    }
    // manhole covers at block corners
    for (const [mx, my] of [[20, 20], [60, 60]]) {
        dg.fillStyle = '#0c0c0e'; dg.beginPath(); dg.arc(mx * px, my * px, 0.6 * px, 0, Math.PI * 2); dg.fill();
        dg.strokeStyle = 'rgba(120,120,120,0.5)'; dg.lineWidth = 2; dg.stroke();
        hg.fillStyle = '#b0b0b0'; hg.beginPath(); hg.arc(mx * px, my * px, 0.6 * px, 0, Math.PI * 2); hg.fill();
        for (let k = -2; k <= 2; k++) { hg.fillStyle = '#606060'; hg.fillRect(mx * px - 0.5 * px, my * px + k * 0.2 * px, px, 2); }
    }
    return { diffuse, gloss, normal: heightToNormalCanvas(height, 1.6) };
}

/** Paving-slab sidewalk with wet patches. */
export function makeSidewalkMaps(size = 512) {
    const rng = new Rng(808);
    const d = makeCanvas(size, size), g = makeCanvas(size, size), h = makeCanvas(size, size);
    const dc = d.getContext('2d'), gc = g.getContext('2d'), hc = h.getContext('2d');
    const tiles = 4, t = size / tiles;
    dc.fillStyle = '#3e3f45'; dc.fillRect(0, 0, size, size);
    gc.fillStyle = '#5a5a5a'; gc.fillRect(0, 0, size, size);
    hc.fillStyle = '#909090'; hc.fillRect(0, 0, size, size);
    for (let i = 0; i < tiles; i++) for (let j = 0; j < tiles; j++) {
        const v = rng.int(-10, 10);
        dc.fillStyle = `rgb(${62 + v},${63 + v},${69 + v})`;
        dc.fillRect(i * t + 2, j * t + 2, t - 4, t - 4);
        for (let k = 0; k < 120; k++) {
            const n = rng.int(30, 110);
            dc.fillStyle = `rgba(${n},${n},${n + 4},0.25)`;
            dc.fillRect(i * t + rng.range(0, t), j * t + rng.range(0, t), 2, 2);
        }
        hc.strokeStyle = '#404040'; hc.lineWidth = 4; hc.strokeRect(i * t, j * t, t, t);
        dc.strokeStyle = 'rgba(0,0,0,0.5)'; dc.lineWidth = 3; dc.strokeRect(i * t, j * t, t, t);
        gc.strokeStyle = '#d8d8d8'; gc.lineWidth = 4; gc.strokeRect(i * t, j * t, t, t);   // water in the joints
    }
    for (let i = 0; i < 6; i++) {
        const x = rng.range(0, size), y = rng.range(0, size), r = rng.range(20, 60);
        const gr = gc.createRadialGradient(x, y, 0, x, y, r);
        gr.addColorStop(0, '#f0f0f0'); gr.addColorStop(1, 'rgba(90,90,90,0)');
        gc.fillStyle = gr; gc.fillRect(x - r, y - r, r * 2, r * 2);
        const dr = dc.createRadialGradient(x, y, 0, x, y, r);
        dr.addColorStop(0, 'rgba(0,0,0,0.35)'); dr.addColorStop(1, 'rgba(0,0,0,0)');
        dc.fillStyle = dr; dc.fillRect(x - r, y - r, r * 2, r * 2);
    }
    return { diffuse: d, gloss: g, normal: heightToNormalCanvas(h, 2) };
}

/** Street-level shop fronts: emissive window band with signage. Tile = 4 shops (≈28 m) wide. */
export function makeStorefrontCanvases(seed = 9) {
    const rng = new Rng(seed);
    const w = 1024, h = 256;
    const d = makeCanvas(w, h), e = makeCanvas(w, h);
    const dc = d.getContext('2d'), ec = e.getContext('2d');
    dc.fillStyle = '#1c1d22'; dc.fillRect(0, 0, w, h);
    ec.fillStyle = '#000'; ec.fillRect(0, 0, w, h);
    const palettes = [[255, 200, 120], [120, 220, 255], [255, 120, 200], [184, 255, 44], [255, 240, 220], [190, 140, 255]];
    const names = ['PHARMACY', 'NOODLE BAR', 'ARCADE', 'COFFEE', 'GARAGE', 'DINER', 'TATTOO', 'MARKET', 'CYBER', 'PAWN'];
    const sw = w / 4;
    for (let i = 0; i < 4; i++) {
        const x = i * sw;
        const c = rng.pick(palettes);
        const open = rng.chance(0.75);
        // sign band
        dc.fillStyle = '#101014'; dc.fillRect(x + 6, 10, sw - 12, 50);
        ec.font = 'bold 34px Arial, sans-serif'; ec.textAlign = 'center'; ec.textBaseline = 'middle';
        ec.shadowColor = `rgb(${c})`; ec.shadowBlur = 14;
        ec.fillStyle = `rgb(${c})`; ec.fillText(rng.pick(names), x + sw / 2, 36);
        ec.shadowBlur = 0;
        // window + door
        const wy = 74, wh = h - wy - 18;
        dc.fillStyle = '#08090c'; dc.fillRect(x + 10, wy, sw - 20, wh);
        if (open) {
            const gr = ec.createLinearGradient(0, wy, 0, wy + wh);
            gr.addColorStop(0, `rgba(${c},0.95)`); gr.addColorStop(1, `rgba(${c[0] * 0.5 | 0},${c[1] * 0.5 | 0},${c[2] * 0.5 | 0},0.6)`);
            ec.fillStyle = gr; ec.fillRect(x + 10, wy, sw - 20, wh);
            // shelves / interior clutter
            ec.fillStyle = 'rgba(0,0,0,0.55)';
            for (let k = 0; k < 3; k++) ec.fillRect(x + 16, wy + 30 + k * 40, sw * 0.5, 6);
            for (let k = 0; k < 6; k++) ec.fillRect(x + rng.range(16, sw - 40), wy + rng.range(20, wh - 30), rng.range(8, 24), rng.range(10, 30));
        } else {
            // roller shutter
            for (let k = wy; k < wy + wh; k += 6) { dc.fillStyle = k % 12 ? '#2c2e34' : '#24262b'; dc.fillRect(x + 10, k, sw - 20, 6); }
        }
        // door
        dc.fillStyle = '#050507'; dc.fillRect(x + sw - 70, wy + 10, 46, wh - 10);
        if (open) { ec.fillStyle = `rgba(${c},0.5)`; ec.fillRect(x + sw - 66, wy + 14, 38, wh - 18); }
        // mullions
        dc.fillStyle = '#2b2c31'; dc.fillRect(x + sw / 2 - 2, wy, 4, wh);
        ec.fillStyle = '#000'; ec.fillRect(x + sw / 2 - 2, wy, 4, wh);
    }
    return { diffuse: d, emissive: e };
}

/** Armoured hex-scale suit pattern (diffuse + normal), tiles nicely on limbs. */
export function makeSuitMaps(size = 256) {
    const d = makeCanvas(size, size), h = makeCanvas(size, size);
    const dc = d.getContext('2d'), hc = h.getContext('2d');
    dc.fillStyle = '#111317'; dc.fillRect(0, 0, size, size);
    hc.fillStyle = '#404040'; hc.fillRect(0, 0, size, size);
    const r = size / 12, hx = r * Math.sqrt(3);
    for (let row = -1; row < size / (r * 1.5) + 1; row++) {
        for (let col = -1; col < size / hx + 1; col++) {
            const cx = col * hx + (row % 2 ? hx / 2 : 0), cy = row * r * 1.5;
            const hex = (ctx, rr) => {
                ctx.beginPath();
                for (let k = 0; k < 6; k++) { const a = Math.PI / 6 + k * Math.PI / 3; ctx.lineTo(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr); }
                ctx.closePath();
            };
            const g = hc.createRadialGradient(cx, cy - r * 0.3, 0, cx, cy, r);
            g.addColorStop(0, '#f0f0f0'); g.addColorStop(1, '#909090');
            hc.fillStyle = g; hex(hc, r * 0.86); hc.fill();
            const v = 14 + ((col * 7 + row * 13) % 6);
            dc.fillStyle = `rgb(${v},${v + 2},${v + 6})`; hex(dc, r * 0.86); dc.fill();
        }
    }
    return { diffuse: d, normal: heightToNormalCanvas(h, 2.2) };
}

/** Hand-painted "graffiti" star with paint splatter, as on All-Star's chest and cape. */
export function makeGraffitiStarCanvas(color = '#b8ff2c', size = 256, seed = 3) {
    const rng = new Rng(seed);
    const c = makeCanvas(size, size), g = c.getContext('2d');
    const k = size / 256;
    const pts = [];
    for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + i * Math.PI / 5;
        const r = (i % 2 === 0 ? 108 : 44) * k;
        pts.push([128 * k + Math.cos(a) * r, 134 * k + Math.sin(a) * r]);
    }
    g.lineJoin = 'miter';
    g.strokeStyle = color;
    // rough brush: several jittered strokes
    for (let pass = 0; pass < 4; pass++) {
        g.lineWidth = (13 - pass * 2.5) * k;
        g.globalAlpha = pass === 0 ? 1 : 0.6;
        g.beginPath();
        pts.forEach((p, i) => {
            const x = p[0] + rng.range(-2.5, 2.5) * k, y = p[1] + rng.range(-2.5, 2.5) * k;
            if (i) g.lineTo(x, y); else g.moveTo(x, y);
        });
        g.closePath(); g.stroke();
    }
    g.globalAlpha = 1;
    g.fillStyle = color;
    for (let i = 0; i < 70; i++) {
        const a = rng.range(0, Math.PI * 2), d = rng.range(30, 125) * k;
        g.beginPath(); g.arc(128 * k + Math.cos(a) * d, 134 * k + Math.sin(a) * d, rng.range(0.6, 3.2) * k, 0, Math.PI * 2); g.fill();
    }
    return c;
}

/** Cape outer layer: black fabric with lime edge piping and the star on the back. Returns {diffuse, emissive}. */
export function makeCapeCanvases(color = '#b8ff2c') {
    const w = 256, h = 512;
    const d = makeCanvas(w, h), e = makeCanvas(w, h);
    const dc = d.getContext('2d'), ec = e.getContext('2d');
    dc.fillStyle = '#060708'; dc.fillRect(0, 0, w, h);
    ec.fillStyle = '#000'; ec.fillRect(0, 0, w, h);
    const rng = new Rng(17);
    for (let i = 0; i < 900; i++) {                       // subtle fabric weave / wet sheen
        dc.fillStyle = `rgba(255,255,255,${rng.range(0, 0.03)})`;
        dc.fillRect(rng.range(0, w), rng.range(0, h), rng.range(1, 3), rng.range(4, 20));
    }
    for (const ctx of [dc, ec]) {
        ctx.fillStyle = color;
        ctx.fillRect(0, 0, 7, h); ctx.fillRect(w - 7, 0, 7, h);      // side piping
        ctx.fillRect(0, h - 10, w, 10);                               // hem piping
        ctx.drawImage(makeGraffitiStarCanvas(color, 256, 9), w * 0.5 - 70, h * 0.1, 140, 140);
    }
    return { diffuse: d, emissive: e };
}

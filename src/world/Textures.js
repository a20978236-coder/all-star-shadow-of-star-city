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
 * Facade window grid. Returns { diffuse, emissive } canvases. One texture tile
 * covers 16 x 16 windows (≈56 m x 57.6 m of facade).
 */
export function makeFacadeCanvases(style, seed) {
    const rng = new Rng(seed);
    const N = 16, S = 64, size = N * S;
    const d = makeCanvas(size, size), e = makeCanvas(size, size);
    const dc = d.getContext('2d'), ec = e.getContext('2d');
    dc.fillStyle = style.wall; dc.fillRect(0, 0, size, size);
    ec.fillStyle = '#000'; ec.fillRect(0, 0, size, size);

    // subtle panel noise
    for (let i = 0; i < 1800; i++) {
        dc.fillStyle = `rgba(255,255,255,${rng.range(0, 0.035)})`;
        dc.fillRect(rng.range(0, size), rng.range(0, size), rng.range(2, 30), rng.range(2, 12));
    }
    const litColors = style.lit;
    for (let row = 0; row < N; row++) {
        // whole floors are sometimes dark/lit together for realism
        const floorBias = rng.range(-0.25, 0.25);
        for (let col = 0; col < N; col++) {
            const x = col * S, y = row * S;
            const mx = S * style.marginX, my = S * style.marginY;
            dc.fillStyle = style.glass;
            dc.fillRect(x + mx, y + my, S - mx * 2, S - my * 2);
            // window frame line
            dc.fillStyle = 'rgba(0,0,0,0.35)';
            dc.fillRect(x + S / 2 - 1, y + my, 2, S - my * 2);
            if (rng.next() < style.litChance + floorBias) {
                const c = rng.pick(litColors);
                const a = rng.range(0.35, 1);
                ec.fillStyle = `rgba(${c[0]},${c[1]},${c[2]},${a})`;
                ec.fillRect(x + mx, y + my, S - mx * 2, S - my * 2);
                // blinds / silhouettes
                if (rng.chance(0.4)) {
                    ec.fillStyle = 'rgba(0,0,0,0.55)';
                    ec.fillRect(x + mx, y + my, S - mx * 2, (S - my * 2) * rng.range(0.2, 0.7));
                }
                dc.fillStyle = `rgba(${c[0]},${c[1]},${c[2]},0.25)`;
                dc.fillRect(x + mx, y + my, S - mx * 2, S - my * 2);
            }
        }
        // horizontal floor slab line
        dc.fillStyle = style.slab;
        dc.fillRect(0, row * S, size, Math.max(3, S * style.marginY * 0.6));
    }
    return { diffuse: d, emissive: e };
}

export const FACADE_STYLES = {
    glass: { wall: '#1a2230', glass: '#0b1220', slab: '#263040', marginX: 0.08, marginY: 0.12, litChance: 0.32, lit: [[255, 230, 170], [190, 225, 255], [255, 255, 240]] },
    concrete: { wall: '#2a2a2e', glass: '#0d0f14', slab: '#36363c', marginX: 0.22, marginY: 0.22, litChance: 0.28, lit: [[255, 210, 140], [255, 190, 120], [210, 230, 255]] },
    brick: { wall: '#3a2420', glass: '#100a0a', slab: '#4a302a', marginX: 0.28, marginY: 0.2, litChance: 0.25, lit: [[255, 190, 110], [255, 170, 90]] },
    industrial: { wall: '#25292b', glass: '#121518', slab: '#30363a', marginX: 0.18, marginY: 0.34, litChance: 0.12, lit: [[200, 255, 200], [255, 220, 150]] },
    chaos: { wall: '#1d1416', glass: '#0b0506', slab: '#2b1a1d', marginX: 0.2, marginY: 0.2, litChance: 0.22, lit: [[255, 60, 50], [255, 120, 80], [255, 200, 160]] }
};

/** 80 m road cell: asphalt with lane markings on the tile borders. */
export function makeRoadCanvas() {
    const size = 1024, c = makeCanvas(size, size), g = c.getContext('2d');
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

export function makeStarCanvas(color = '#b8ff2c', fill = false) {
    const size = 256, c = makeCanvas(size, size), g = c.getContext('2d');
    g.clearRect(0, 0, size, size);
    const pts = [];
    for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + i * Math.PI / 5;
        const r = i % 2 === 0 ? 110 : 46;
        pts.push([128 + Math.cos(a) * r, 132 + Math.sin(a) * r]);
    }
    g.beginPath(); pts.forEach((p, i) => i ? g.lineTo(p[0], p[1]) : g.moveTo(p[0], p[1])); g.closePath();
    g.shadowColor = color; g.shadowBlur = 18;
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

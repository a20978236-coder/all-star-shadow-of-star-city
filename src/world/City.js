import { Vec3 } from '../core/math.js';
import { Rng, clamp, lerp } from '../core/MathUtils.js';
import { BatchSet } from './GeometryBatch.js';
import { makeMaterial, neonMaterial } from './Materials.js';
import {
    canvasTexture, makeFacadeCanvases, FACADE_STYLES, makeRoadCanvas, makeConcreteCanvas,
    makeStarCanvas, makeSignCanvas, makeRoadMaps, makeSidewalkMaps, makeStorefrontCanvases, makeDotCanvas
} from './Textures.js';
import { COLORS, QUALITY } from '../config.js';

const PITCH = 80;          // block + street
const HALF_BLOCK = 32;     // sidewalk slab half-size
const ORIGIN = -400;
const GRID = 10;
export const CITY_EDGE = 480;

export const DISTRICTS = {
    downtown:      { name: 'Downtown Star City',     style: ['glass', 'concrete'], minH: 30, maxH: 125, split: 2, neon: 0.45, color: '#2a6fd6' },
    techcore:      { name: 'Techcore Tower',         style: ['glass'], minH: 0, maxH: 0, split: 1, neon: 0, color: '#b8ff2c' },
    chaos:         { name: 'Chaos Empire Occupation Zone', style: ['chaos'], minH: 18, maxH: 55, split: 2, neon: 0.6, neonColors: ['red'], color: '#d02525' },
    chaosPlaza:    { name: 'Chaos Empire Hideout',   style: ['chaos'], minH: 0, maxH: 0, split: 1, neon: 0, color: '#ff3030' },
    harbor:        { name: 'The Harbor District',    style: ['industrial'], minH: 8, maxH: 18, split: 2, neon: 0.2, color: '#3d7fa6' },
    harborPlaza:   { name: 'Harbor Docks',           style: ['industrial'], minH: 0, maxH: 0, split: 1, neon: 0, color: '#4d9fc6' },
    northridge:    { name: 'Northridge Heights',     style: ['concrete', 'brick'], minH: 14, maxH: 40, split: 3, neon: 0.2, color: '#4c6a8c' },
    park:          { name: 'Riverdale Park',         style: ['concrete'], minH: 0, maxH: 0, split: 1, neon: 0, color: '#2f7d3a' },
    industrial:    { name: 'Industrial Sector',      style: ['industrial'], minH: 10, maxH: 30, split: 2, neon: 0.15, neonColors: ['green', 'warm'], color: '#7a6a3a' },
    blackgate:     { name: 'Blackgate Facility',     style: ['concrete'], minH: 0, maxH: 0, split: 1, neon: 0, color: '#6a6a6a' },
    entertainment: { name: 'Entertainment District', style: ['concrete', 'glass'], minH: 18, maxH: 70, split: 2, neon: 0.95, neonColors: ['magenta', 'purple', 'cyan'], color: '#b03ac0' },
    oldcity:       { name: 'The Old City',           style: ['brick'], minH: 10, maxH: 28, split: 3, neon: 0.35, neonColors: ['magenta', 'warm', 'cyan'], color: '#8a5a3a' },
    university:    { name: 'University District',    style: ['brick', 'concrete'], minH: 14, maxH: 36, split: 2, neon: 0.2, color: '#a08a4a' },
    westend:       { name: 'West End Residential',   style: ['brick', 'concrete'], minH: 12, maxH: 30, split: 3, neon: 0.2, color: '#5a7a5a' }
};

function districtKeyFor(i, j) {
    if (i === 5 && j === 4) return 'techcore';
    if (i === 4 && j === 1) return 'chaosPlaza';
    if (i === 8 && j === 1) return 'harborPlaza';
    if (i >= 7 && j <= 2) return 'harbor';
    if (i >= 3 && i <= 6 && j <= 1) return 'chaos';
    if (i <= 2 && j <= 1) return 'northridge';
    if (i <= 1 && j >= 2 && j <= 5) return 'park';
    if (i >= 7 && j >= 3 && j <= 6) return 'industrial';
    if (i >= 7 && j >= 7) return 'blackgate';
    if (i >= 4 && i <= 6 && j >= 7) return 'entertainment';
    if (i <= 3 && j >= 7) return 'oldcity';
    if (i >= 2 && i <= 3 && j >= 5) return 'university';
    if (i <= 1 && j === 6) return 'westend';
    return 'downtown';
}

const NEON = {
    green: COLORS.neonGreen, cyan: COLORS.neonCyan, magenta: COLORS.neonMagenta,
    purple: COLORS.neonPurple, red: COLORS.chaosRed, warm: [1.0, 0.7, 0.35], white: [0.9, 0.95, 1.0]
};

const SIGN_TEXTS = [
    ['STAR CITY', '#39d0ff'], ['NOCTHRAVE', '#ff3cc0'], ['LUXOR', '#b070ff'], ['ALL-STAR TECH', '#b8ff2c'],
    ['NOODLES', '#ff7a2c'], ['HOTEL', '#ff3c5c'], ['CYBER BAR', '#39d0ff'], ['24/7', '#b8ff2c']
];

export class City {
    /** g = graphics backend (see gfx/gfx.js). */
    constructor(g, physics) {
        this.gfx = g;
        this.physics = physics;
        this.root = g.node('City');
        g.add(this.root);
        this.rng = new Rng(20261103);
        this.detailRng = new Rng(777);       // separate stream: added details never shift the original layout
        this.steamVents = [];
        this.signalMats = null;
        this.batches = new BatchSet();
        this.materials = {};
        this.roofs = [];             // walkable rooftops for collectibles / spawns
        this.footprints = [];        // for the minimap
        this.lightCandidates = [];   // street lamp & neon positions for the dynamic light pool
        this.landmarks = {};
        this.blinkers = [];
        this.time = 0;
    }

    // ------------------------------------------------------------------ helpers
    blockCenter(i, j) { return [ORIGIN + PITCH * i + PITCH / 2, ORIGIN + PITCH * j + PITCH / 2]; }

    districtAt(x, z) {
        if (Math.abs(x) > 400 || Math.abs(z) > 400) return { key: 'waterfront', name: 'Star City Waterfront', color: '#2a4d6a' };
        const i = clamp(Math.floor((x - ORIGIN) / PITCH), 0, GRID - 1);
        const j = clamp(Math.floor((z - ORIGIN) / PITCH), 0, GRID - 1);
        const key = districtKeyFor(i, j);
        return { key, ...DISTRICTS[key] };
    }

    _chunk(x, z) { return `${Math.floor((x + CITY_EDGE) / 320)}_${Math.floor((z + CITY_EDGE) / 320)}`; }
    _b(mat, x, z) { return this.batches.get(`${this._chunk(x, z)}|${mat}`); }

    _box(mat, x0, y0, z0, x1, y1, z1, opts = {}, collide = true, tag = 'solid') {
        this._b(mat, (x0 + x1) / 2, (z0 + z1) / 2).addBox(x0, y0, z0, x1, y1, z1, opts);
        if (collide) return this.physics.addBox(x0, y0, z0, x1, y1, z1, tag);
        return null;
    }

    // ------------------------------------------------------------------ materials
    _createMaterials() {
        const dev = null;
        const M = this.materials;
        let seed = 100;
        const facadeSize = QUALITY.facadeDetail && QUALITY.name === 'high' ? 1024 : 512;
        const lin = (canvas, name) => canvasTexture(dev, canvas, { name, srgb: false });
        for (const [key, style] of Object.entries(FACADE_STYLES)) {
            const { diffuse, emissive, normal } = makeFacadeCanvases(style, seed++, facadeSize);
            const m = makeMaterial({
                name: `facade_${key}`,
                diffuse: [1, 1, 1],
                diffuseMap: canvasTexture(dev, diffuse, { name: `facade_${key}_d` }),
                emissiveMap: canvasTexture(dev, emissive, { name: `facade_${key}_e` }),
                emissiveIntensity: 0.9,
                gloss: key === 'glass' ? 0.86 : 0.42,
                metalness: key === 'glass' ? 0.55 : 0.05,
                normalMap: lin(normal, `facade_${key}_n`),
                bumpiness: 0.7
            });
            M[`facade_${key}`] = m;
        }
        // Wet asphalt with mirror-like puddles (gloss map) and aggregate/cracks (normal map)
        const road = makeRoadMaps(QUALITY.name === 'low' ? 512 : 1024);
        M.road = makeMaterial({
            name: 'road', diffuse: [1, 1, 1], diffuseMap: canvasTexture(dev, road.diffuse, { name: 'road' }), tiling: [12, 12], gloss: 0.95, metalness: 0.12,
            glossMap: canvasTexture(dev, road.gloss, { name: 'road_g', srgb: false, gloss: true }), glossTiling: [12, 12],
            normalMap: lin(road.normal, 'road_n'), normalTiling: [12, 12], bumpiness: 0.45
        });
        const walk = makeSidewalkMaps(512);
        const walkGloss = canvasTexture(dev, walk.gloss, { name: 'sidewalk_g', srgb: false, gloss: true });
        const walkNormal = lin(walk.normal, 'sidewalk_n');
        M.sidewalk = makeMaterial({
            name: 'sidewalk', diffuse: [1, 1, 1], diffuseMap: canvasTexture(dev, walk.diffuse, { name: 'sidewalk' }), gloss: 0.85, metalness: 0.05,
            glossMap: walkGloss, normalMap: walkNormal, bumpiness: 0.6
        });
        M.roof = makeMaterial({
            name: 'roof', diffuse: [1, 1, 1], diffuseMap: canvasTexture(dev, makeConcreteCanvas('#2b2c31', 9), { name: 'roof' }), gloss: 0.72, metalness: 0.05,
            glossMap: walkGloss, normalMap: walkNormal, bumpiness: 0.4
        });
        M.curb = makeMaterial({ name: 'curb', diffuse: [0.36, 0.36, 0.38], gloss: 0.7 });
        const shops = makeStorefrontCanvases(13);
        M.storefront = makeMaterial({
            name: 'storefront', diffuse: [1, 1, 1],
            diffuseMap: canvasTexture(dev, shops.diffuse, { name: 'shop_d' }),
            emissiveMap: canvasTexture(dev, shops.emissive, { name: 'shop_e' }),
            emissiveIntensity: 0.75, gloss: 0.8, metalness: 0.3
        });
        M.hydrant = makeMaterial({ name: 'hydrant', diffuse: [0.55, 0.05, 0.04], gloss: 0.6, metalness: 0.3 });
        M.bin = makeMaterial({ name: 'bin', diffuse: [0.05, 0.12, 0.08], gloss: 0.5, metalness: 0.4 });
        M.signalRed = neonMaterial([1, 0.1, 0.05], 5);
        M.signalGreen = neonMaterial([0.2, 1, 0.45], 0.2);
        M.signalAmber = neonMaterial([1, 0.6, 0.05], 0.2);
        this.signalMats = [M.signalRed, M.signalAmber, M.signalGreen];
        M.metal = makeMaterial({ name: 'metal', diffuse: [0.09, 0.1, 0.12], gloss: 0.6, metalness: 0.8 });
        M.trim = makeMaterial({ name: 'trim', diffuse: [0.16, 0.17, 0.2], gloss: 0.5, metalness: 0.3 });
        M.grass = makeMaterial({ name: 'grass', diffuse: [0.05, 0.12, 0.06], gloss: 0.3 });
        M.tree = makeMaterial({ name: 'tree', diffuse: [0.03, 0.09, 0.05], gloss: 0.2 });
        M.trunk = makeMaterial({ name: 'trunk', diffuse: [0.1, 0.07, 0.05], gloss: 0.2 });
        M.water = makeMaterial({ name: 'water', diffuse: [0.01, 0.02, 0.04], gloss: 0.95, metalness: 0.6, emissive: [0.01, 0.02, 0.05] });
        M.containerA = makeMaterial({ name: 'cA', diffuse: [0.45, 0.1, 0.08], gloss: 0.4, metalness: 0.5 });
        M.containerB = makeMaterial({ name: 'cB', diffuse: [0.08, 0.2, 0.4], gloss: 0.4, metalness: 0.5 });
        M.containerC = makeMaterial({ name: 'cC', diffuse: [0.35, 0.3, 0.08], gloss: 0.4, metalness: 0.5 });
        M.carA = makeMaterial({ name: 'carA', diffuse: [0.05, 0.05, 0.06], gloss: 0.85, metalness: 0.7 });
        M.carB = makeMaterial({ name: 'carB', diffuse: [0.35, 0.36, 0.4], gloss: 0.85, metalness: 0.7 });
        M.carC = makeMaterial({ name: 'carC', diffuse: [0.35, 0.03, 0.04], gloss: 0.85, metalness: 0.7 });
        M.glassDark = makeMaterial({ name: 'glassDark', diffuse: [0.02, 0.03, 0.05], gloss: 0.95, metalness: 0.8 });
        for (const [k, c] of Object.entries(NEON)) M[`neon_${k}`] = neonMaterial(c, k === 'warm' ? 2.4 : 4.5);
        M.beacon = neonMaterial(COLORS.chaosRed, 6);
        M.lampHead = neonMaterial([1.0, 0.85, 0.6], 3.5);

        const starTex = canvasTexture(dev, makeStarCanvas('#b8ff2c'), { repeat: false, name: 'star' });
        M.starSign = makeMaterial({ name: 'starSign', diffuse: [0, 0, 0], emissiveMap: starTex, emissive: [1, 1, 1], emissiveIntensity: 6, opacityMap: starTex, blend: 'additive', twoSided: true });
        SIGN_TEXTS.forEach(([text, col], idx) => {
            const t = canvasTexture(dev, makeSignCanvas(text, col), { repeat: false, name: `sign${idx}` });
            M[`sign${idx}`] = makeMaterial({ name: `sign${idx}`, diffuse: [0, 0, 0], emissiveMap: t, emissive: [1, 1, 1], emissiveIntensity: 3.5, twoSided: true });
        });
    }

    // ------------------------------------------------------------------ build
    build() {
        this._createMaterials();
        this._buildGround();
        for (let i = 0; i < GRID; i++) {
            for (let j = 0; j < GRID; j++) this._buildBlock(i, j);
        }
        this._buildStreetFurniture();
        this._buildCurbs();
        if (QUALITY.streetProps) this._buildStreetProps();
        this._buildWaterfront();
        this._flush();
        this._buildLightPool();
        this._buildDrones();
        this._buildMinimapCanvas();
        return this;
    }

    _buildGround() {
        const g = this.gfx;
        const e = g.mesh('plane', this.materials.road, { castShadows: false, name: 'Streets' });
        e.setLocalScale(CITY_EDGE * 2, 1, CITY_EDGE * 2);
        this.root.addChild(e);

        const w = g.mesh('plane', this.materials.water, { castShadows: false, name: 'Water' });
        w.setLocalScale(5000, 1, 5000);
        w.setLocalPosition(0, -1.2, 0);
        this.root.addChild(w);
    }

    _buildBlock(i, j) {
        const [cx, cz] = this.blockCenter(i, j);
        const dkey = districtKeyFor(i, j);
        const d = DISTRICTS[dkey];
        const rng = this.rng;
        const x0 = cx - HALF_BLOCK, x1 = cx + HALF_BLOCK, z0 = cz - HALF_BLOCK, z1 = cz + HALF_BLOCK;

        // Sidewalk slab (curb). Step-able for characters and the bike.
        this._box(dkey === 'park' ? 'grass' : 'sidewalk', x0, 0, z0, x1, 0.2, z1, { uvScale: [4, 4], topScale: [6, 6], bottom: false }, true, 'curb');
        this.footprints.push({ x0, z0, x1, z1, color: dkey === 'park' ? '#173a1c' : '#1b2230', kind: 'block' });

        switch (dkey) {
            case 'techcore': return this._buildTechcore(cx, cz);
            case 'chaosPlaza': return this._buildChaosPlaza(cx, cz);
            case 'harborPlaza': return this._buildHarborPlaza(cx, cz);
            case 'park': return this._buildPark(cx, cz);
            case 'blackgate': return this._buildBlackgate(cx, cz, i, j);
            default: break;
        }

        // Generic lots
        const inner = HALF_BLOCK - 2.5;
        const nx = rng.int(1, d.split), nz = rng.int(1, d.split);
        const alley = 2;
        const lw = (inner * 2 - alley * (nx - 1)) / nx;
        const ld = (inner * 2 - alley * (nz - 1)) / nz;
        for (let a = 0; a < nx; a++) {
            for (let b = 0; b < nz; b++) {
                const lx0 = cx - inner + a * (lw + alley), lz0 = cz - inner + b * (ld + alley);
                const ins = () => rng.range(0.2, 1.6);
                const bx0 = lx0 + ins(), bx1 = lx0 + lw - ins();
                const bz0 = lz0 + ins(), bz1 = lz0 + ld - ins();
                let h;
                if (dkey === 'downtown') {
                    const dist = Math.hypot(cx - 40, cz + 40);
                    const t = clamp(dist / 380, 0, 1);
                    h = lerp(d.maxH, d.minH, t) * rng.range(0.55, 1.15);
                } else {
                    h = rng.range(d.minH, d.maxH);
                }
                h = Math.max(8, Math.round(h / 3.6) * 3.6);
                this._building(bx0, bz0, bx1, bz1, h, d, dkey);
                if (dkey === 'industrial' && rng.chance(0.5)) {
                    const r = rng.range(1.2, 2.2);
                    const px = (bx0 + bx1) / 2 + rng.range(-3, 3), pz = (bz0 + bz1) / 2 + rng.range(-3, 3);
                    const ch = h + rng.range(12, 26);
                    this._b('trim', px, pz).addCylinder(px, h, pz, r, r * 0.8, ch - h, 10);
                    this._b('neon_red', px, pz).addBox(px - 0.25, ch, pz - 0.25, px + 0.25, ch + 0.4, pz + 0.25);
                    this.physics.addBox(px - r, h, pz - r, px + r, ch, pz + r, 'chimney');
                }
            }
        }
        // Harbor gets containers in the alleys
        if (dkey === 'harbor' && rng.chance(0.6)) this._containerStack(cx + rng.range(-10, 10), cz + HALF_BLOCK - 4, rng.int(2, 4), 2);
    }

    _building(x0, z0, x1, z1, h, d, dkey) {
        const rng = this.rng;
        const styleKey = rng.pick(d.style);
        const mat = `facade_${styleKey}`;
        const uvOffset = [rng.int(0, 15) / 16, rng.int(0, 15) / 16];
        const uv = { uvScale: [56, 57.6], uvOffset, top: false, bottom: false };
        this._box(mat, x0, 0, z0, x1, h, z1, uv, true, 'building');
        this._roof(x0, z0, x1, z1, h, dkey);
        this.footprints.push({ x0, z0, x1, z1, color: d.color, kind: 'building', h });
        if (QUALITY.facadeDetail) this._facadeDetail(x0, z0, x1, z1, h, styleKey, dkey);

        let topH = h;
        const w = x1 - x0, dd = z1 - z0;
        if (h > 36 && rng.chance(0.45) && Math.min(w, dd) > 12) {
            const t = rng.range(2.5, Math.min(w, dd) * 0.25);
            const h2 = Math.round((h + rng.range(10, h * 0.45)) / 3.6) * 3.6;
            this._box(mat, x0 + t, h, z0 + t, x1 - t, h2, z1 - t, { ...uv, uvOffset: [uvOffset[0] + 0.25, uvOffset[1]] }, true, 'building');
            this._roof(x0 + t, z0 + t, x1 - t, z1 - t, h2, dkey);
            topH = h2;
            if (styleKey === 'glass' && rng.chance(0.6)) this._edgeNeon(x0 + t, z0 + t, x1 - t, z1 - t, h2, rng.pick(['cyan', 'purple', 'green']));
        } else if (styleKey === 'glass' && rng.chance(0.35)) {
            this._edgeNeon(x0, z0, x1, z1, h, rng.pick(['cyan', 'purple', 'magenta']));
        }
        if (topH > 80 && rng.chance(0.7)) {
            const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
            const ah = rng.range(10, 24);
            this._b('metal', cx, cz).addCylinder(cx, topH, cz, 0.35, 0.12, ah, 6);
            this._b('beacon', cx, cz).addBox(cx - 0.35, topH + ah, cz - 0.35, cx + 0.35, topH + ah + 0.7, cz + 0.35);
        }
        // Neon signs on facades
        if (rng.chance(d.neon)) {
            const colors = d.neonColors || ['cyan', 'magenta', 'purple', 'green', 'warm'];
            const n = dkey === 'entertainment' ? rng.int(1, 3) : 1;
            for (let k = 0; k < n; k++) this._facadeSign(x0, z0, x1, z1, Math.min(h, 40), rng.pick(colors));
        }
        if (h < 60 && rng.chance(dkey === 'entertainment' ? 0.4 : 0.12)) this._roofBillboard(x0, z0, x1, z1, h);
    }

    /** Ledges, pilasters, cornices and street-level shop fronts (visual only). */
    _facadeDetail(x0, z0, x1, z1, h, styleKey, dkey) {
        const r = this.detailRng;
        const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
        const ring = (mat, y0, y1, out) => {
            const b = this._b(mat, cx, cz);
            b.addBox(x0 - out, y0, z0 - out, x1 + out, y1, z0, { bottom: true });
            b.addBox(x0 - out, y0, z1, x1 + out, y1, z1 + out, { bottom: true });
            b.addBox(x0 - out, y0, z0, x0, y1, z1, { bottom: true });
            b.addBox(x1, y0, z0, x1 + out, y1, z1, { bottom: true });
        };
        if (styleKey === 'glass') {
            // slim corner pilasters + a crown
            const t = 0.45;
            for (const [x, z] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1]]) this._b('trim', x, z).addBox(x - t, 0, z - t, x + t, h + 0.6, z + t);
            if (h > 60) ring('trim', h - 1.2, h + 0.2, 0.35);
        } else {
            const every = styleKey === 'brick' ? 3.6 * 3 : 3.6 * 4;
            for (let y = every; y < h - 2; y += every) ring('trim', y - 0.25, y + 0.15, 0.22);
            ring('trim', h - 0.9, h + 0.1, 0.4);                      // cornice
        }
        // shop fronts on busy districts
        const shopDistricts = ['downtown', 'entertainment', 'oldcity', 'university', 'westend', 'northridge', 'chaos'];
        if (shopDistricts.includes(dkey) && r.chance(0.75)) {
            const sh = 4.4, o = 0.08;
            const b = this._b('storefront', cx, cz);
            // one quad per ~7 m shop, each picking one of the 4 shop designs in the texture
            const side = (ax0, ax1, fixed, normal, alongX) => {
                const len = ax1 - ax0 - 1.2;
                const n = Math.max(1, Math.round(len / 7));
                const w = len / n;
                for (let k = 0; k < n; k++) {
                    const c = ax0 + 0.6 + w * (k + 0.5);
                    const shop = r.int(0, 3);
                    if (alongX) b.addQuad(c, 0.2 + sh / 2, fixed, w - 0.1, sh, normal, shop / 4, (shop + 1) / 4);
                    else b.addQuad(fixed, 0.2 + sh / 2, c, w - 0.1, sh, normal, shop / 4, (shop + 1) / 4);
                }
            };
            side(x0, x1, z0 - o, [0, 0, -1], true);
            side(x0, x1, z1 + o, [0, 0, 1], true);
            side(z0, z1, x0 - o, [-1, 0, 0], false);
            side(z0, z1, x1 + o, [1, 0, 0], false);
            // awning ledge above the shops
            ring('metal', sh, sh + 0.25, 1.1);
            this.lightCandidates.push({ x: cx + (x1 - x0) * 0.5 + 2, y: 3, z: cz, color: [1, 0.8, 0.6], range: 12, intensity: 1.6 });
        }
    }

    _roof(x0, z0, x1, z1, h, dkey) {
        const rng = this.rng;
        const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
        this._b('roof', cx, cz).addFloor(x0, z0, x1, z1, h, 6);
        // parapet (low enough to step over)
        const p = 0.35, ph = 0.5;
        this._box('trim', x0, h, z0, x1, h + ph, z0 + p, {}, true, 'parapet');
        this._box('trim', x0, h, z1 - p, x1, h + ph, z1, {}, true, 'parapet');
        this._box('trim', x0, h, z0 + p, x0 + p, h + ph, z1 - p, {}, true, 'parapet');
        this._box('trim', x1 - p, h, z0 + p, x1, h + ph, z1 - p, {}, true, 'parapet');
        const w = x1 - x0, d = z1 - z0;
        this.roofs.push({ x0, z0, x1, z1, y: h, cx, cz, district: dkey });
        if (w < 6 || d < 6) return;
        // AC units / vents
        const n = rng.int(0, 3);
        for (let k = 0; k < n; k++) {
            const ax = rng.range(x0 + 2, x1 - 4), az = rng.range(z0 + 2, z1 - 4);
            const ah = rng.range(0.9, 1.6);
            this._box('metal', ax, h, az, ax + rng.range(1.5, 2.5), h + ah, az + rng.range(1.5, 2.5), {}, true, 'prop');
        }
        // rooftop access hut
        if (rng.chance(0.4) && w > 12 && d > 12) {
            const hx = rng.range(x0 + 2, x1 - 6), hz = rng.range(z0 + 2, z1 - 6);
            this._box('trim', hx, h, hz, hx + 3.5, h + 2.8, hz + 3.2, {}, true, 'prop');
            this._b('neon_warm', hx, hz).addBox(hx + 1.2, h + 2.2, hz - 0.08, hx + 2.3, h + 2.4, hz);
        }
        // water tower
        if (rng.chance(dkey === 'oldcity' || dkey === 'northridge' || dkey === 'westend' ? 0.35 : 0.08) && w > 10 && d > 10) {
            const tx = rng.range(x0 + 4, x1 - 4), tz = rng.range(z0 + 4, z1 - 4);
            for (const [ox, oz] of [[-1.3, -1.3], [1.3, -1.3], [-1.3, 1.3], [1.3, 1.3]]) {
                this._b('metal', tx, tz).addBox(tx + ox - 0.12, h, tz + oz - 0.12, tx + ox + 0.12, h + 3.5, tz + oz + 0.12);
            }
            this._b('trunk', tx, tz).addCylinder(tx, h + 3.5, tz, 2.1, 2.1, 3.6, 10);
            this._b('trunk', tx, tz).addCylinder(tx, h + 7.1, tz, 2.2, 0.1, 1.4, 10);
            this.physics.addBox(tx - 2.1, h + 3.5, tz - 2.1, tx + 2.1, h + 7.6, tz + 2.1, 'prop');
        }
    }

    _edgeNeon(x0, z0, x1, z1, h, color) {
        const t = 0.18, m = `neon_${color}`, cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
        const b = this._b(m, cx, cz);
        b.addBox(x0 - t, h - 0.3, z0 - t, x1 + t, h, z0);
        b.addBox(x0 - t, h - 0.3, z1, x1 + t, h, z1 + t);
        b.addBox(x0 - t, h - 0.3, z0, x0, h, z1);
        b.addBox(x1, h - 0.3, z0, x1 + t, h, z1);
        // vertical corner strips
        for (const [x, z] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1]]) b.addBox(x - t, 0.5, z - t, x + t, h, z + t);
    }

    _facadeSign(x0, z0, x1, z1, maxY, color) {
        const rng = this.rng;
        const side = rng.int(0, 3);
        const sh = rng.range(4, 10), sw = rng.range(1.2, 2);
        const y0 = rng.range(4, Math.max(5, maxY - sh - 1));
        const m = `neon_${color}`;
        let px, pz, n;
        if (side === 0) { px = x1 + 0.6; pz = rng.range(z0 + 2, z1 - 2); n = [1, 0, 0]; this._b(m, px, pz).addBox(x1 + 0.2, y0, pz - 0.15, x1 + 1.0, y0 + sh, pz + 0.15); }
        else if (side === 1) { px = x0 - 0.6; pz = rng.range(z0 + 2, z1 - 2); n = [-1, 0, 0]; this._b(m, px, pz).addBox(x0 - 1.0, y0, pz - 0.15, x0 - 0.2, y0 + sh, pz + 0.15); }
        else if (side === 2) { pz = z1 + 0.6; px = rng.range(x0 + 2, x1 - 2); n = [0, 0, 1]; this._b(m, px, pz).addBox(px - 0.15, y0, z1 + 0.2, px + 0.15, y0 + sh, z1 + 1.0); }
        else { pz = z0 - 0.6; px = rng.range(x0 + 2, x1 - 2); n = [0, 0, -1]; this._b(m, px, pz).addBox(px - 0.15, y0, z0 - 1.0, px + 0.15, y0 + sh, z0 - 0.2); }
        // horizontal bar below the vertical sign
        if (rng.chance(0.5)) {
            const bx = px + n[0] * 0.2, bz = pz + n[2] * 0.2;
            this._b(m, bx, bz).addBox(bx - (n[2] ? sw * 2 : 0.08), y0 - 1.2, bz - (n[0] ? sw * 2 : 0.08), bx + (n[2] ? sw * 2 : 0.08), y0 - 0.9, bz + (n[0] ? sw * 2 : 0.08));
        }
        this.lightCandidates.push({ x: px + n[0] * 2.5, y: y0 + sh * 0.4, z: pz + n[2] * 2.5, color: NEON[color], range: 16, intensity: 2.2 });
    }

    _roofBillboard(x0, z0, x1, z1, h) {
        const rng = this.rng;
        const idx = rng.int(0, SIGN_TEXTS.length - 1);
        const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
        const alongX = (x1 - x0) > (z1 - z0);
        const w = Math.min(14, (alongX ? x1 - x0 : z1 - z0) - 2), sh = w / 4;
        const y = h + 2 + sh / 2;
        const b = this._b(`sign${idx}`, cx, cz);
        if (alongX) { b.addQuad(cx, y, z1 - 1, w, sh, [0, 0, 1]); b.addQuad(cx, y, z1 - 1.05, w, sh, [0, 0, -1]); }
        else { b.addQuad(x1 - 1, y, cz, w, sh, [1, 0, 0]); b.addQuad(x1 - 1.05, y, cz, w, sh, [-1, 0, 0]); }
        const lx = alongX ? cx : x1 - 1, lz = alongX ? z1 - 1 : cz;
        this._b('metal', lx, lz).addBox(lx - (alongX ? w / 2 : 0.1), h, lz - (alongX ? 0.1 : w / 2), lx + (alongX ? w / 2 : 0.1), h + 2, lz + (alongX ? 0.1 : w / 2));
        this.physics.addBox(lx - (alongX ? w / 2 : 0.2), h, lz - (alongX ? 0.2 : w / 2), lx + (alongX ? w / 2 : 0.2), y + sh / 2, lz + (alongX ? 0.2 : w / 2), 'sign');
    }

    _buildTechcore(cx, cz) {
        const tiers = [[27, 70], [21, 120], [16, 165], [11, 205]];
        let y = 0;
        tiers.forEach(([half, top], idx) => {
            this._box('facade_glass', cx - half, y, cz - half, cx + half, top, cz + half, { uvScale: [56, 57.6], uvOffset: [idx * 0.25, 0], top: false, bottom: false }, true, 'building');
            this._roof(cx - half, cz - half, cx + half, cz + half, top, 'techcore');
            this._edgeNeon(cx - half, cz - half, cx + half, cz + half, top, 'green');
            y = top;
        });
        this._b('metal', cx, cz).addCylinder(cx, 205, cz, 2.2, 0.4, 42, 8);
        this._b('neon_green', cx, cz).addCylinder(cx, 245, cz, 0.6, 0.05, 6, 6);
        this.physics.addBox(cx - 2.2, 205, cz - 2.2, cx + 2.2, 240, cz + 2.2, 'spire');
        // Giant star emblems + signage
        const b = this._b('starSign', cx, cz);
        b.addQuad(cx, 186, cz - 11.3, 22, 22, [0, 0, -1]);
        b.addQuad(cx, 186, cz + 11.3, 22, 22, [0, 0, 1]);
        b.addQuad(cx - 11.3, 186, cz, 22, 22, [-1, 0, 0]);
        b.addQuad(cx + 11.3, 186, cz, 22, 22, [1, 0, 0]);
        const s = this._b('sign3', cx, cz);
        s.addQuad(cx, 60, cz - 27.3, 40, 10, [0, 0, -1]);
        s.addQuad(cx, 60, cz + 27.3, 40, 10, [0, 0, 1]);
        this.footprints.push({ x0: cx - 27, z0: cz - 27, x1: cx + 27, z1: cz + 27, color: '#9be22a', kind: 'building', h: 205 });
        this.landmarks.techcore = new Vec3(cx, 205, cz);
        this.landmarks.techcoreDeck = new Vec3(cx, 70, cz - 24);
        for (let k = 0; k < 4; k++) this.lightCandidates.push({ x: cx + (k % 2 ? 30 : -30), y: 8, z: cz + (k < 2 ? 30 : -30), color: COLORS.neonGreen, range: 26, intensity: 3, priority: true });
    }

    _buildChaosPlaza(cx, cz) {
        const rng = this.rng;
        // Hideout garage on the north side
        this._building(cx - 20, cz - 29, cx + 20, cz - 14, 14.4, DISTRICTS.chaos, 'chaos');
        this._b('neon_red', cx, cz - 13.5).addBox(cx - 8, 9, cz - 13.8, cx + 8, 9.6, cz - 13.4);
        this._b('sign1', cx, cz).addQuad(cx, 11.6, cz - 13.7, 14, 3.5, [0, 0, 1]);
        // Barricades and crates
        for (let k = 0; k < 14; k++) {
            const a = (k / 14) * Math.PI * 2;
            const r = rng.range(16, 22);
            const bx = cx + Math.cos(a) * r, bz = cz + 6 + Math.sin(a) * r * 0.6;
            if (bz < cz - 12) continue;
            this._box('trim', bx - 1.4, 0.2, bz - 0.4, bx + 1.4, 1.2, bz + 0.4, {}, true, 'prop');
        }
        for (let k = 0; k < 7; k++) {
            const bx = cx + rng.range(-16, 16), bz = cz + rng.range(-8, 18);
            const s = rng.range(1.2, 2);
            this._box('trunk', bx, 0.2, bz, bx + s, 0.2 + s, bz + s, {}, true, 'prop');
        }
        // Red floodlights (always on)
        for (const [ox, oz] of [[-18, -8], [18, -8], [0, 22]]) {
            this._b('metal', cx + ox, cz + oz).addCylinder(cx + ox, 0, cz + oz, 0.15, 0.15, 6, 6);
            this._b('neon_red', cx + ox, cz + oz).addBox(cx + ox - 0.6, 6, cz + oz - 0.3, cx + ox + 0.6, 6.6, cz + oz + 0.3);
            this.lightCandidates.push({ x: cx + ox, y: 6, z: cz + oz, color: COLORS.chaosRed, range: 28, intensity: 4, priority: true });
        }
        this.landmarks.chaosPlaza = new Vec3(cx, 0.2, cz + 4);
        this.landmarks.chaosIntel = new Vec3(cx + 6, 0.2, cz - 11);
    }

    _buildHarborPlaza(cx, cz) {
        const rng = this.rng;
        for (let k = 0; k < 7; k++) {
            this._containerStack(cx + rng.range(-24, 18), cz + rng.range(-24, 24), rng.int(1, 3), rng.int(1, 2));
        }
        // Gantry crane (grapple-able)
        const g = (x0, y0, z0, x1, y1, z1) => this._box('containerC', x0, y0, z0, x1, y1, z1, {}, true, 'crane');
        g(cx + 20, 0.2, cz - 22, cx + 21.5, 34, cz - 20.5);
        g(cx + 20, 0.2, cz + 20.5, cx + 21.5, 34, cz + 22);
        g(cx + 19, 34, cz - 24, cx + 22.5, 37, cz + 24);
        this._b('beacon', cx, cz).addBox(cx + 20.3, 37, cz - 0.4, cx + 21.2, 37.8, cz + 0.4);
        this.lightCandidates.push({ x: cx + 10, y: 10, z: cz, color: [0.6, 0.8, 1.0], range: 40, intensity: 3, priority: true });
        this.landmarks.harbor = new Vec3(cx - 4, 0.2, cz);
    }

    _containerStack(x, z, count, levels) {
        const rng = this.rng;
        for (let c = 0; c < count; c++) {
            for (let l = 0; l < levels; l++) {
                const mat = rng.pick(['containerA', 'containerB', 'containerC']);
                const zz = z + c * 2.8;
                this._box(mat, x, 0.2 + l * 2.6, zz, x + 12, 0.2 + (l + 1) * 2.6, zz + 2.5, {}, true, 'container');
            }
        }
        this.footprints.push({ x0: x, z0: z, x1: x + 12, z1: z + count * 2.8, color: '#4d6f8a', kind: 'building', h: 5 });
    }

    _buildPark(cx, cz) {
        const rng = this.rng;
        for (let k = 0; k < 22; k++) {
            const tx = cx + rng.range(-28, 28), tz = cz + rng.range(-28, 28);
            if (Math.abs(tx - cx) < 3 || Math.abs(tz - cz) < 3) continue; // paths
            const th = rng.range(2, 3.5), r = rng.range(2, 3.5);
            this._b('trunk', tx, tz).addCylinder(tx, 0.2, tz, 0.3, 0.22, th, 6);
            this._b('tree', tx, tz).addCylinder(tx, 0.2 + th, tz, r, 0, r * 2.4, 7);
            this._b('tree', tx, tz).addCylinder(tx, 0.2 + th + r * 1.1, tz, r * 0.75, 0, r * 1.8, 7);
            this.physics.addBox(tx - 0.35, 0.2, tz - 0.35, tx + 0.35, 0.2 + th + r * 2, tz + 0.35, 'tree');
        }
        this._b('sidewalk', cx, cz).addFloor(cx - 2.5, cz - 30, cx + 2.5, cz + 30, 0.22, 4);
        this._b('sidewalk', cx, cz).addFloor(cx - 30, cz - 2.5, cx + 30, cz + 2.5, 0.22, 4);
        // gazebo
        this._b('neon_warm', cx, cz).addCylinder(cx, 4.2, cz, 4.2, 0.4, 2.2, 8);
        this.lightCandidates.push({ x: cx, y: 3.5, z: cz, color: [1, 0.75, 0.45], range: 18, intensity: 2.5 });
    }

    _buildBlackgate(cx, cz, i, j) {
        const rng = this.rng;
        const hw = 28, wh = 9, t = 1.2;
        this._box('facade_concrete', cx - hw, 0, cz - hw, cx + hw, wh, cz - hw + t, { uvScale: [56, 57.6] }, true, 'wall');
        this._box('facade_concrete', cx - hw, 0, cz + hw - t, cx + hw, wh, cz + hw, { uvScale: [56, 57.6] }, true, 'wall');
        this._box('facade_concrete', cx - hw, 0, cz - hw + t, cx - hw + t, wh, cz + hw - t, { uvScale: [56, 57.6] }, true, 'wall');
        this._box('facade_concrete', cx + hw - t, 0, cz - hw + t, cx + hw, wh, cz + hw - t, { uvScale: [56, 57.6] }, true, 'wall');
        for (const [ox, oz] of [[-hw, -hw], [hw, -hw], [-hw, hw], [hw, hw]]) {
            const x = cx + ox, z = cz + oz;
            this._box('facade_concrete', x - 2.5, 0, z - 2.5, x + 2.5, 18, z + 2.5, { uvScale: [56, 57.6], top: false }, true, 'tower');
            this._roof(x - 2.5, z - 2.5, x + 2.5, z + 2.5, 18, 'blackgate');
            this._b('lampHead', x, z).addBox(x - 0.6, 18.5, z - 0.6, x + 0.6, 19.2, z + 0.6);
            this.lightCandidates.push({ x, y: 17, z, color: [0.85, 0.9, 1.0], range: 30, intensity: 2.5 });
        }
        if ((i + j) % 2 === 0) this._building(cx - 14, cz - 12, cx + 14, cz + 12, rng.range(12, 22), DISTRICTS.blackgate || DISTRICTS.northridge, 'blackgate');
        else this._building(cx - 18, cz - 8, cx + 18, cz + 8, rng.range(10, 16), { ...DISTRICTS.northridge, neon: 0 }, 'blackgate');
        this.footprints.push({ x0: cx - hw, z0: cz - hw, x1: cx + hw, z1: cz + hw, color: '#5a5a5a', kind: 'wall', h: wh });
    }

    _buildStreetFurniture() {
        const rng = new Rng(99);
        for (let i = 0; i < GRID; i++) {
            for (let j = 0; j < GRID; j++) {
                const [cx, cz] = this.blockCenter(i, j);
                const dkey = districtKeyFor(i, j);
                // two lamps per block side
                for (const side of [0, 1, 2, 3]) {
                    for (const t of [-14, 14]) {
                        let x, z, ax, az;
                        const e = HALF_BLOCK - 0.8;
                        if (side === 0) { x = cx + t; z = cz - e; ax = 0; az = -1; }
                        else if (side === 1) { x = cx + t; z = cz + e; ax = 0; az = 1; }
                        else if (side === 2) { x = cx - e; z = cz + t; ax = -1; az = 0; }
                        else { x = cx + e; z = cz + t; ax = 1; az = 0; }
                        this._b('metal', x, z).addCylinder(x, 0.2, z, 0.12, 0.09, 7, 6, false);
                        this._b('metal', x, z).addBox(Math.min(x, x + ax * 2.2) - 0.06, 7, Math.min(z, z + az * 2.2) - 0.06, Math.max(x, x + ax * 2.2) + 0.06, 7.15, Math.max(z, z + az * 2.2) + 0.06);
                        const hx = x + ax * 2.2, hz = z + az * 2.2;
                        this._b('lampHead', hx, hz).addBox(hx - 0.35, 6.75, hz - 0.2, hx + 0.35, 6.95, hz + 0.2);
                        this.physics.addBox(x - 0.15, 0.2, z - 0.15, x + 0.15, 7, z + 0.15, 'lamp');
                        this.lightCandidates.push({ x: hx, y: 6.5, z: hz, color: [1, 0.78, 0.5], range: 17, intensity: 2.2 });
                    }
                }
                // parked cars along the block edges (not in plazas)
                if (dkey === 'park' || dkey === 'techcore' || dkey === 'chaosPlaza') continue;
                const nCars = rng.int(0, 3);
                for (let k = 0; k < nCars; k++) {
                    const side = rng.int(0, 3);
                    const t = rng.range(-26, 26);
                    const off = HALF_BLOCK + 1.6;
                    if (side < 2) this._car(cx + t, cz + (side ? off : -off), true, rng);
                    else this._car(cx + (side === 2 ? -off : off), cz + t, false, rng);
                }
            }
        }
    }

    _buildCurbs() {
        for (let i = 0; i < GRID; i++) for (let j = 0; j < GRID; j++) {
            const [cx, cz] = this.blockCenter(i, j);
            const e = HALF_BLOCK, t = 0.35, y = 0.24;
            const b = this._b('curb', cx, cz);
            b.addBox(cx - e - 0.05, 0, cz - e - 0.05, cx + e + 0.05, y, cz - e + t, { bottom: false });
            b.addBox(cx - e - 0.05, 0, cz + e - t, cx + e + 0.05, y, cz + e + 0.05, { bottom: false });
            b.addBox(cx - e - 0.05, 0, cz - e + t, cx - e + t, y, cz + e - t, { bottom: false });
            b.addBox(cx + e - t, 0, cz - e + t, cx + e + 0.05, y, cz + e - t, { bottom: false });
        }
    }

    /** Traffic signals, hydrants, bins, benches and steam vents. */
    _buildStreetProps() {
        const r = this.detailRng;
        // traffic signals at interior intersections (two diagonal corners each)
        for (let a = 1; a < GRID; a++) for (let b = 1; b < GRID; b++) {
            const rx = ORIGIN + a * PITCH, rz = ORIGIN + b * PITCH;
            for (const s of [1, -1]) {
                const px = rx + s * 9, pz = rz + s * 9;
                this._b('metal', px, pz).addCylinder(px, 0.2, pz, 0.14, 0.12, 6.2, 6, false);
                const ax = px - s * 4.5;
                this._b('metal', px, pz).addBox(Math.min(px, ax), 6.0, pz - 0.08, Math.max(px, ax), 6.18, pz + 0.08);
                this._b('trim', ax, pz).addBox(ax - 0.22, 5.0, pz - 0.2, ax + 0.22, 6.0, pz + 0.2);
                const lamps = [['signalRed', 5.78], ['signalAmber', 5.5], ['signalGreen', 5.22]];
                for (const [m, y] of lamps) {
                    this._b(m, ax, pz).addBox(ax - 0.1, y - 0.1, pz - 0.23, ax + 0.1, y + 0.1, pz - 0.2);
                    this._b(m, ax, pz).addBox(ax - 0.1, y - 0.1, pz + 0.2, ax + 0.1, y + 0.1, pz + 0.23);
                }
                this.physics.addBox(px - 0.16, 0.2, pz - 0.16, px + 0.16, 6.2, pz + 0.16, 'lamp');
            }
        }
        for (let i = 0; i < GRID; i++) for (let j = 0; j < GRID; j++) {
            const dkey = districtKeyFor(i, j);
            if (dkey === 'park' || dkey === 'techcore' || dkey === 'harborPlaza') continue;
            const [cx, cz] = this.blockCenter(i, j);
            const e = HALF_BLOCK - 1.2;
            const edgeSpot = () => {
                const side = r.int(0, 3), t = r.range(-24, 24);
                return side === 0 ? [cx + t, cz - e] : side === 1 ? [cx + t, cz + e] : side === 2 ? [cx - e, cz + t] : [cx + e, cz + t];
            };
            // fire hydrant
            const [hx, hz] = edgeSpot();
            this._b('hydrant', hx, hz).addCylinder(hx, 0.2, hz, 0.17, 0.15, 0.6, 8);
            this._b('hydrant', hx, hz).addCylinder(hx, 0.8, hz, 0.15, 0.05, 0.14, 8);
            this._b('hydrant', hx, hz).addBox(hx - 0.25, 0.5, hz - 0.06, hx + 0.25, 0.62, hz + 0.06);
            // trash bins
            for (let k = 0; k < 2; k++) {
                const [bx, bz] = edgeSpot();
                this._b('bin', bx, bz).addCylinder(bx, 0.2, bz, 0.3, 0.34, 0.95, 8);
                this.physics.addBox(bx - 0.3, 0.2, bz - 0.3, bx + 0.3, 1.15, bz + 0.3, 'prop');
            }
            // bench
            if (r.chance(0.5)) {
                const [bx, bz] = edgeSpot();
                const alongX = Math.abs(bz - cz) > Math.abs(bx - cx);
                const hw = 0.9, hd = 0.25;
                const [ex, ez] = alongX ? [hw, hd] : [hd, hw];
                this._b('trunk', bx, bz).addBox(bx - ex, 0.62, bz - ez, bx + ex, 0.7, bz + ez);
                this._b('metal', bx, bz).addBox(bx - ex, 0.2, bz - ez, bx - ex + 0.08, 0.62, bz + ez);
                this._b('metal', bx, bz).addBox(bx + ex - 0.08, 0.2, bz - ez, bx + ex, 0.62, bz + ez);
            }
        }
        // steam rising from street vents (downtown / old city)
        if (QUALITY.name !== 'low') {
            const dot = canvasTexture(null, makeDotCanvas(), { repeat: false, name: 'steamDot' });
            const spots = [[0, 60], [80, -20], [-80, -100], [0, -140], [-160, 280], [160, 300], [-240, 220], [80, 140]];
            for (const [x, z] of spots) {
                const e = this.gfx.steam(x, 0.1, z, dot);
                if (e) { this.root.addChild(e); this.steamVents.push(e); }
                this._b('metal', x, z).addBox(x - 0.6, 0.0, z - 0.6, x + 0.6, 0.03, z + 0.6);
            }
        }
    }

    _car(x, z, alongX, rng) {
        const L = 4.4, W = 1.9;
        const hx = alongX ? L / 2 : W / 2, hz = alongX ? W / 2 : L / 2;
        const mat = rng.pick(['carA', 'carB', 'carC', 'carA']);
        this._box(mat, x - hx, 0.25, z - hz, x + hx, 1.05, z + hz, {}, true, 'car');
        const cx = alongX ? hx * 0.55 : hx * 0.9, cz = alongX ? hz * 0.9 : hz * 0.55;
        this._b('glassDark', x, z).addBox(x - cx, 1.05, z - cz, x + cx, 1.6, z + cz);
        this.physics.addBox(x - cx, 1.05, z - cz, x + cx, 1.6, z + cz, 'car');
        const tl = 'neon_red';
        if (alongX) {
            this._b(tl, x, z).addBox(x + hx, 0.7, z - hz + 0.1, x + hx + 0.05, 0.9, z - hz + 0.45);
            this._b(tl, x, z).addBox(x + hx, 0.7, z + hz - 0.45, x + hx + 0.05, 0.9, z + hz - 0.1);
        } else {
            this._b(tl, x, z).addBox(x - hx + 0.1, 0.7, z + hz, x - hx + 0.45, 0.9, z + hz + 0.05);
            this._b(tl, x, z).addBox(x + hx - 0.45, 0.7, z + hz, x + hx - 0.1, 0.9, z + hz + 0.05);
        }
    }

    _buildWaterfront() {
        const E = CITY_EDGE;
        // railings along the edge and invisible boundary walls
        const r = (x0, z0, x1, z1) => {
            this._b('metal', (x0 + x1) / 2, (z0 + z1) / 2).addBox(x0, 0, z0, x1, 1.1, z1);
            this.physics.addBox(x0, -5, z0, x1, 60, z1, 'boundary');
        };
        r(-E, -E - 0.5, E, -E); r(-E, E, E, E + 0.5); r(-E - 0.5, -E, -E, E); r(E, -E, E + 0.5, E);
        // pier / harbour edge visual
        this._b('sidewalk', 0, 0).addBox(-E, -1.2, -E - 0.5, E, 0, -E, {}, false);
        this._b('sidewalk', 0, 0).addBox(-E, -1.2, E, E, 0, E + 0.5, {}, false);
        // Luxor Island hint (distant decorative lights) and skyline across the water
        const rng = new Rng(4040);
        for (let k = 0; k < 70; k++) {
            const a = rng.range(0, Math.PI * 2), d = rng.range(700, 1100);
            const x = Math.cos(a) * d, z = Math.sin(a) * d;
            const w = rng.range(15, 40), h = rng.range(30, 160);
            this._b('facade_glass', x, z).addBox(x - w / 2, -1, z - w / 2, x + w / 2, h, z + w / 2, { uvScale: [56, 57.6], uvOffset: [rng.int(0, 15) / 16, 0], bottom: false });
        }
    }

    _flush() {
        for (const [key, batch] of this.batches.map) {
            const mat = key.split('|')[1];
            const isNeon = mat.startsWith('neon') || mat.startsWith('signal') || mat === 'beacon' || mat === 'lampHead' || mat.startsWith('sign') || mat === 'starSign';
            batch.build(this.gfx, this.materials[mat], this.root, key, { castShadows: !isNeon && mat !== 'roof', receiveShadows: !isNeon });
        }
        this.batches = null;
    }

    _buildLightPool() {
        const n = Math.min(QUALITY.maxStreetLights, this.gfx.maxDynamicLights);
        this.lights = [];
        for (let k = 0; k < n; k++) {
            const e = this.gfx.pointLight({ name: `poolLight${k}`, color: [1, 0.8, 0.5], intensity: 2, range: 16, falloff: 'linear' });
            this.root.addChild(e);
            this.lights.push(e);
        }
        this._lightTimer = 0;
    }

    _buildDrones() {
        this.drones = [];
        const bodyMat = makeMaterial({ diffuse: [0.05, 0.05, 0.06], gloss: 0.7, metalness: 0.8 });
        for (let k = 0; k < 5; k++) {
            const g = this.gfx;
            const e = g.node('drone');
            const body = g.mesh('box', bodyMat);
            body.setLocalScale(1.2, 0.25, 1.2);
            e.addChild(body);
            const light = g.mesh('sphere', this.materials[k % 2 ? 'neon_cyan' : 'neon_red'], { castShadows: false });
            light.setLocalScale(0.25, 0.25, 0.25);
            light.setLocalPosition(0, -0.2, 0);
            e.addChild(light);
            this.root.addChild(e);
            this.drones.push({ e, r: 80 + k * 55, h: 60 + k * 18, speed: 0.05 + k * 0.012, phase: k * 1.7, cx: 40 - k * 30, cz: -40 + k * 20 });
        }
    }

    _buildMinimapCanvas() {
        const size = 1024;
        const c = document.createElement('canvas');
        c.width = c.height = size;
        const g = c.getContext('2d');
        const s = size / (CITY_EDGE * 2);
        g.fillStyle = '#071019'; g.fillRect(0, 0, size, size);
        g.fillStyle = '#0d1824';
        g.fillRect(0, 0, size, size);
        // roads glow lines
        g.strokeStyle = 'rgba(57,208,255,0.18)'; g.lineWidth = 2;
        for (let k = 0; k <= GRID; k++) {
            const p = (ORIGIN + k * PITCH + CITY_EDGE) * s;
            g.beginPath(); g.moveTo(p, 0); g.lineTo(p, size); g.stroke();
            g.beginPath(); g.moveTo(0, p); g.lineTo(size, p); g.stroke();
        }
        for (const f of this.footprints) {
            g.fillStyle = f.color;
            g.globalAlpha = f.kind === 'block' ? 1 : 0.55 + Math.min(0.45, (f.h || 0) / 200);
            g.fillRect((f.x0 + CITY_EDGE) * s, (f.z0 + CITY_EDGE) * s, (f.x1 - f.x0) * s, (f.z1 - f.z0) * s);
        }
        g.globalAlpha = 1;
        this.minimapCanvas = c;
        this.minimapScale = s;
    }

    // ------------------------------------------------------------------ runtime
    update(dt, camPos) {
        this.time += dt;
        // blinking aircraft beacons
        const blink = (Math.sin(this.time * 3) > 0.6) ? 7 : 0.4;
        if (this._blink !== blink) { this._blink = blink; this.gfx.setEmissive(this.materials.beacon, null, blink); }

        if (this.signalMats) {
            const t = this.time % 14;
            const phase = t < 6 ? 0 : t < 7.5 ? 1 : t < 13 ? 2 : 1;      // red, amber, green, amber
            if (phase !== this._signalPhase) {
                this._signalPhase = phase;
                this.signalMats.forEach((m, k) => this.gfx.setEmissive(m, null, k === phase ? 5 : 0.15));
            }
        }
        for (const d of this.drones) {
            const a = this.time * d.speed + d.phase;
            d.e.setPosition(d.cx + Math.cos(a) * d.r, d.h + Math.sin(this.time * 0.7 + d.phase) * 4, d.cz + Math.sin(a) * d.r);
            d.e.setEulerAngles(0, -a * 57.3, 0);
        }

        this._lightTimer -= dt;
        if (this._lightTimer <= 0) {
            this._lightTimer = 0.35;
            const cx = camPos.x, cz = camPos.z;
            const scored = [];
            for (const c of this.lightCandidates) {
                const dx = c.x - cx, dz = c.z - cz;
                const d2 = dx * dx + dz * dz - (c.priority ? 3000 : 0);
                if (d2 < 160 * 160) scored.push([d2, c]);
            }
            scored.sort((a, b) => a[0] - b[0]);
            for (let k = 0; k < this.lights.length; k++) {
                const e = this.lights[k];
                const c = scored[k]?.[1];
                if (!c) { e.enabled = false; continue; }
                e.enabled = true;
                e.setPosition(c.x, c.y, c.z);
                e.setLight({ color: c.color, range: c.range, intensity: c.intensity });
            }
        }
    }

    /** Pick rooftops for star-shard collectibles. */
    pickShardRoofs(count, near) {
        const rng = new Rng(555);
        const roofs = this.roofs.filter(r => (r.x1 - r.x0) > 6 && (r.z1 - r.z0) > 6 && r.y < 150);
        const close = roofs.filter(r => r.district === 'downtown').sort((a, b) =>
            Math.hypot(a.cx - near.x, a.cz - near.z) - Math.hypot(b.cx - near.x, b.cz - near.z));
        const result = [close[1], close[3], close[6]].filter(Boolean);
        for (let tries = 0; result.length < count && tries < 5000; tries++) {
            const r = rng.pick(roofs);
            const minGap = tries < 3000 ? 60 : 20;
            if (!result.includes(r) && result.every(o => Math.hypot(o.cx - r.cx, o.cz - r.cz) > minGap)) result.push(r);
        }
        return result;
    }
}

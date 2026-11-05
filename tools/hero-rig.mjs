// Stage 2 of the hero asset pipeline: normalise, auto-rig and export a game-ready GLB.
//
//   node tools/hero-optimize.mjs <raw.glb> <tmp.json> 50000      (stage 1: weld + simplify)
//   node tools/hero-rig.mjs <tmp.json> public/assets/models/allstar.glb
//
// - rotates the model to face -Z, scales it to 1.85 m, feet at y = 0
// - builds a skeleton whose joint names match the game's Humanoid rig
//   (body, pelvis, torso, head, armL/foreL, armR/foreR, legL/shinL, legR/shinR, cape1, cape2)
// - computes smooth skin weights (capsule distance + joint blending, cape chain)
// - smooth normals across UV seams, resized texture
import { Document, NodeIO } from '@gltf-transform/core';
import { tangents, unweld, weld } from '@gltf-transform/functions';
import { generateTangents } from 'mikktspace';
import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';

const [, , input, output, texSize = '2048'] = process.argv;
// --maps (default on): generate normal + metallic/roughness detail maps from the texture
const raw = JSON.parse(fs.readFileSync(input, 'utf8'));
const P = Float32Array.from(raw.pos);
const UV = Float32Array.from(raw.uv);
const IDX = Uint32Array.from(raw.idx);
const N = P.length / 3;
const H = 1.85;

// ---------------------------------------------------------------- normalise
let minY = Infinity, maxY = -Infinity, minX = Infinity, maxX = -Infinity;
for (let i = 0; i < N; i++) {
    P[i * 3] *= -1; P[i * 3 + 2] *= -1;                                  // face -Z
    minY = Math.min(minY, P[i * 3 + 1]); maxY = Math.max(maxY, P[i * 3 + 1]);
}
const s = H / (maxY - minY);
const legZ = [];
for (let i = 0; i < N; i++) {
    P[i * 3] *= s; P[i * 3 + 1] = (P[i * 3 + 1] - minY) * s; P[i * 3 + 2] *= s;
    minX = Math.min(minX, P[i * 3]); maxX = Math.max(maxX, P[i * 3]);
    if (P[i * 3 + 1] > 0.1 && P[i * 3 + 1] < 0.6) legZ.push(P[i * 3 + 2]);
}
legZ.sort((a, b) => a - b);
const cx = (minX + maxX) / 2, cz = legZ[legZ.length >> 1];
for (let i = 0; i < N; i++) { P[i * 3] -= cx; P[i * 3 + 2] -= cz; }

// ---------------------------------------------------------------- skeleton (rest pose = the model's pose)
// world-space joint positions measured from the model (see README "Hero asset pipeline")
const J = {
    body:   { pos: [0, 0, 0], parent: null },
    pelvis: { pos: [0, 0.98, 0.0], parent: 'body' },
    torso:  { pos: [0, 1.05, 0.0], parent: 'pelvis' },
    head:   { pos: [0, 1.53, -0.03], parent: 'torso' },
    armL:   { pos: [-0.2, 1.42, 0.01], parent: 'torso' },
    foreL:  { pos: [-0.29, 1.13, 0.02], parent: 'armL' },
    armR:   { pos: [0.2, 1.42, 0.01], parent: 'torso' },
    foreR:  { pos: [0.29, 1.13, 0.02], parent: 'armR' },
    legL:   { pos: [-0.1, 0.93, 0.0], parent: 'pelvis' },
    shinL:  { pos: [-0.2, 0.5, -0.01], parent: 'legL' },
    legR:   { pos: [0.1, 0.93, 0.0], parent: 'pelvis' },
    shinR:  { pos: [0.17, 0.5, -0.01], parent: 'legR' },
    cape1:  { pos: [0, 1.45, 0.14], parent: 'torso' },
    cape2:  { pos: [0, 0.95, 0.24], parent: 'cape1' }
};
const names = Object.keys(J);
const jIndex = Object.fromEntries(names.map((n, i) => [n, i]));

// capsules used for weighting: [joint, end point, radius]
const caps = {
    pelvis: { a: [0, 0.9, 0], b: [0, 1.06, 0], r: 0.17 },
    torso: { a: [0, 1.06, 0], b: [0, 1.5, 0.0], r: 0.19 },
    head: { a: [0, 1.53, -0.03], b: [0, 1.82, -0.06], r: 0.13 },
    armL: { a: J.armL.pos, b: J.foreL.pos, r: 0.075 },
    foreL: { a: J.foreL.pos, b: [-0.34, 0.74, 0.0], r: 0.07 },
    armR: { a: J.armR.pos, b: J.foreR.pos, r: 0.075 },
    foreR: { a: J.foreR.pos, b: [0.33, 0.74, 0.0], r: 0.07 },
    legL: { a: J.legL.pos, b: J.shinL.pos, r: 0.1 },
    shinL: { a: J.shinL.pos, b: [-0.25, 0.0, -0.06], r: 0.085 },
    legR: { a: J.legR.pos, b: J.shinR.pos, r: 0.1 },
    shinR: { a: J.shinR.pos, b: [0.19, 0.0, -0.06], r: 0.085 }
};
const childOf = { armL: 'foreL', armR: 'foreR', legL: 'shinL', legR: 'shinR', pelvis: 'torso', torso: 'head' };
const parentOf = { foreL: 'armL', foreR: 'armR', shinL: 'legL', shinR: 'legR', torso: 'pelvis', head: 'torso', armL: 'torso', armR: 'torso', legL: 'pelvis', legR: 'pelvis' };

function segDist(p, a, b) {
    const abx = b[0] - a[0], aby = b[1] - a[1], abz = b[2] - a[2];
    const apx = p[0] - a[0], apy = p[1] - a[1], apz = p[2] - a[2];
    const l2 = abx * abx + aby * aby + abz * abz;
    let t = (apx * abx + apy * aby + apz * abz) / l2;
    t = Math.max(0, Math.min(1, t));
    const dx = apx - abx * t, dy = apy - aby * t, dz = apz - abz * t;
    return [Math.sqrt(dx * dx + dy * dy + dz * dz), t];
}
const smooth = (e0, e1, x) => { const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0))); return t * t * (3 - 2 * t); };

// ---------------------------------------------------------------- skin weights
const JOINTS = new Uint8Array(N * 4);
const WEIGHTS = new Float32Array(N * 4);
let capeCount = 0;
const NJ = names.length;
const Wd = new Float32Array(N * NJ);          // dense weights, smoothed below
const anchor = new Uint8Array(N);
const SMOOTH_ITERS = 12;
const label = new Array(N);                    // hard part label before smoothing
const groupOf = { cape1: 'cape', cape2: 'cape', armL: 'armL', foreL: 'armL', armR: 'armR', foreR: 'armR', legL: 'legL', shinL: 'legL', legR: 'legR', shinR: 'legR' };
for (let i = 0; i < N; i++) {
    const p = [P[i * 3], P[i * 3 + 1], P[i * 3 + 2]];
    let best = null, bestN = Infinity, bestT = 0;
    for (const [name, c] of Object.entries(caps)) {
        const [d, t] = segDist(p, c.a, c.b);
        const n = d / c.r;
        if (n < bestN) { bestN = n; best = name; bestT = t; }
    }
    const w = {};
    // cape: behind the back, or flaring well away from every body capsule
    const behind = p[2] > 0.15 && p[1] < 1.46 && p[1] > 0.05;
    const flare = bestN > 1.7 && p[1] < 1.3;
    if ((behind || flare) && !(best === 'head')) {
        capeCount++;
        label[i] = 'cape';
        const k2 = 1 - smooth(0.75, 1.15, p[1]);       // lower cape -> cape2
        const top = smooth(1.28, 1.45, p[1]);           // stays pinned at the shoulders
        w.cape1 = (1 - k2) * (1 - top);
        w.cape2 = k2 * (1 - top);
        w.torso = top;
    } else {
        // blend with the parent near the joint and with the child near the end
        const par = parentOf[best], ch = childOf[best];
        let own = 1;
        if (par && bestT < 0.22) { const k = 0.5 + 0.5 * smooth(0, 0.22, bestT); w[par] = (w[par] || 0) + (1 - k); own = k; }
        if (ch && bestT > 0.8) { const k = 0.5 + 0.5 * (1 - smooth(0.8, 1.0, bestT)); w[ch] = (w[ch] || 0) + own * (1 - k); own *= k; }
        w[best] = (w[best] || 0) + own;
        label[i] = groupOf[best] || 'core';
    }
    for (const [n, v] of Object.entries(w)) Wd[i * NJ + jIndex[n]] = v;
    anchor[i] = bestN < 0.75 && !(behind || flare) ? 1 : 0;     // deep inside a limb: keep rigid
}

// ---------------------------------------------------------------- cut bridge triangles
// AI meshes fuse separate parts (cape hem to calves, gadget hand to cape, thigh to thigh).
// Triangles spanning such parts would stretch when they move apart, so drop them.
const limb = new Set(['armL', 'armR', 'legL', 'legR']);
const kept = [];
let cut = 0;
for (let t = 0; t < IDX.length; t += 3) {
    const L = new Set([label[IDX[t]], label[IDX[t + 1]], label[IDX[t + 2]]]);
    const capeLimb = L.has('cape') && [...L].some(x => limb.has(x));
    const legLeg = L.has('legL') && L.has('legR');
    const armCore = (L.has('armL') || L.has('armR')) && (L.has('legL') || L.has('legR'));
    if (capeLimb || legLeg || armCore) { cut++; continue; }
    kept.push(IDX[t], IDX[t + 1], IDX[t + 2]);
}
// drop tiny islands left behind by the cut (they would float around the legs)
let islandTris = 0;
{
    const parent = new Int32Array(N).map((_, i) => i);
    const find = x => { while (parent[x] !== x) { parent[x] = parent[parent[x]]; x = parent[x]; } return x; };
    const union = (a, b) => { a = find(a); b = find(b); if (a !== b) parent[a] = b; };
    const seam = new Map();
    for (let i = 0; i < N; i++) {
        const k = `${Math.round(P[i * 3] * 1e4)},${Math.round(P[i * 3 + 1] * 1e4)},${Math.round(P[i * 3 + 2] * 1e4)}`;
        if (seam.has(k)) union(i, seam.get(k)); else seam.set(k, i);
    }
    for (let t = 0; t < kept.length; t += 3) { union(kept[t], kept[t + 1]); union(kept[t], kept[t + 2]); }
    const size = new Map();
    for (let i = 0; i < N; i++) { const r = find(i); size.set(r, (size.get(r) || 0) + 1); }
    const k2 = [];
    for (let t = 0; t < kept.length; t += 3) {
        if (size.get(find(kept[t])) < 25) { islandTris++; continue; }
        k2.push(kept[t], kept[t + 1], kept[t + 2]);
    }
    kept.length = 0; for (const v of k2) kept.push(v);
}
const IDXK = Uint32Array.from(kept);

// ---------------------------------------------------------------- weight smoothing over mesh edges
// Diffuses weights across connected vertices so neighbouring vertices never follow
// very different bones (prevents stretched triangles where the cape meets the legs).
{
    const nb = Array.from({ length: N }, () => new Set());
    // also connect vertices that share a position (UV seams)
    const posGroups = new Map();
    for (let i = 0; i < N; i++) {
        const k = `${Math.round(P[i * 3] * 1e4)},${Math.round(P[i * 3 + 1] * 1e4)},${Math.round(P[i * 3 + 2] * 1e4)}`;
        if (!posGroups.has(k)) posGroups.set(k, []);
        posGroups.get(k).push(i);
    }
    for (const g of posGroups.values()) for (const a of g) for (const b of g) if (a !== b) nb[a].add(b);
    for (let t = 0; t < IDXK.length; t += 3) {
        const a = IDXK[t], b = IDXK[t + 1], c = IDXK[t + 2];
        nb[a].add(b); nb[a].add(c); nb[b].add(a); nb[b].add(c); nb[c].add(a); nb[c].add(b);
    }
    const tmp = new Float32Array(N * NJ);
    for (let it = 0; it < SMOOTH_ITERS; it++) {
        for (let i = 0; i < N; i++) {
            const o = i * NJ;
            if (anchor[i]) { for (let j = 0; j < NJ; j++) tmp[o + j] = Wd[o + j]; continue; }
            const ns = nb[i];
            const k = 1 / (ns.size + 1);
            for (let j = 0; j < NJ; j++) {
                let acc = Wd[o + j];
                for (const n of ns) acc += Wd[n * NJ + j];
                tmp[o + j] = acc * k;
            }
        }
        Wd.set(tmp);
    }
}
for (let i = 0; i < N; i++) {
    const row = Array.from(Wd.subarray(i * NJ, i * NJ + NJ)).map((v, j) => [j, v]).filter(e => e[1] > 1e-3)
        .sort((a, b) => b[1] - a[1]).slice(0, 4);
    const sum = row.reduce((a, e) => a + e[1], 0) || 1;
    row.forEach(([j, v], k) => { JOINTS[i * 4 + k] = j; WEIGHTS[i * 4 + k] = v / sum; });
}

// ---------------------------------------------------------------- smooth normals (shared across UV seams)
const NRM = new Float32Array(N * 3);
const key = i => `${Math.round(P[i * 3] * 1e4)},${Math.round(P[i * 3 + 1] * 1e4)},${Math.round(P[i * 3 + 2] * 1e4)}`;
const groups = new Map();
const gOf = new Int32Array(N);
for (let i = 0; i < N; i++) { const k = key(i); let g = groups.get(k); if (g === undefined) { g = groups.size; groups.set(k, g); } gOf[i] = g; }
const GN = new Float32Array(groups.size * 3);
for (let t = 0; t < IDX.length; t += 3) {
    const a = IDX[t], b = IDX[t + 1], c = IDX[t + 2];
    const e1 = [P[b * 3] - P[a * 3], P[b * 3 + 1] - P[a * 3 + 1], P[b * 3 + 2] - P[a * 3 + 2]];
    const e2 = [P[c * 3] - P[a * 3], P[c * 3 + 1] - P[a * 3 + 1], P[c * 3 + 2] - P[a * 3 + 2]];
    // mirroring (x and z flipped = 180 deg rotation) keeps the original winding
    const n = [e1[1] * e2[2] - e1[2] * e2[1], e1[2] * e2[0] - e1[0] * e2[2], e1[0] * e2[1] - e1[1] * e2[0]];
    for (const v of [a, b, c]) { const g = gOf[v] * 3; GN[g] += n[0]; GN[g + 1] += n[1]; GN[g + 2] += n[2]; }
}
for (let i = 0; i < N; i++) {
    const g = gOf[i] * 3, l = Math.hypot(GN[g], GN[g + 1], GN[g + 2]) || 1;
    NRM[i * 3] = GN[g] / l; NRM[i * 3 + 1] = GN[g + 1] / l; NRM[i * 3 + 2] = GN[g + 2] / l;
}

// ---------------------------------------------------------------- texture
const srcImg = input.replace(/\.json$/, '.jpg');
const size = Number(texSize);
const { data: RGBA } = await sharp(srcImg).resize(size, size, { fit: 'fill' }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });

// ---------------------------------------------------------------- restyle to the character sheet
// Matches the official All-Star character sheet: black (not navy) cape shell, lime star
// painted on the back of the cape, and an emissive map so lime/cyan details glow.
const restyle = !process.argv.includes('--no-restyle');
let capeMask = null;
if (restyle) {
    const mask = new Uint8Array(size * size);           // 1 = cape texel, 2 = cape texel inside the back star
    // star outline in the cape's back plane (x right, y up), metres
    const STAR = { cx: 0, cy: 1.17, rOut: 0.23, rIn: 0.093, width: 0.03 };
    const starPts = [];
    for (let k = 0; k < 10; k++) {
        const a = Math.PI / 2 + k * Math.PI / 5;
        const r = k % 2 === 0 ? STAR.rOut : STAR.rIn;
        starPts.push([STAR.cx + Math.cos(a) * r, STAR.cy + Math.sin(a) * r]);
    }
    const distToStar = (x, y) => {
        let best = Infinity;
        for (let k = 0; k < 10; k++) {
            const [ax, ay] = starPts[k], [bx, by] = starPts[(k + 1) % 10];
            const vx = bx - ax, vy = by - ay, t = Math.max(0, Math.min(1, ((x - ax) * vx + (y - ay) * vy) / (vx * vx + vy * vy)));
            best = Math.min(best, Math.hypot(x - ax - vx * t, y - ay - vy * t));
        }
        return best;
    };
    for (let t = 0; t < IDXK.length; t += 3) {
        const a = IDXK[t], b = IDXK[t + 1], c = IDXK[t + 2];
        if (label[a] !== 'cape' || label[b] !== 'cape' || label[c] !== 'cape') continue;
        // facing the back (+Z) => candidate for the star decal
        const nz = (NRM[a * 3 + 2] + NRM[b * 3 + 2] + NRM[c * 3 + 2]) / 3;
        const u = [UV[a * 2] * size, UV[b * 2] * size, UV[c * 2] * size];
        const v = [UV[a * 2 + 1] * size, UV[b * 2 + 1] * size, UV[c * 2 + 1] * size];
        const x0 = Math.max(0, Math.floor(Math.min(...u))), x1 = Math.min(size - 1, Math.ceil(Math.max(...u)));
        const y0 = Math.max(0, Math.floor(Math.min(...v))), y1 = Math.min(size - 1, Math.ceil(Math.max(...v)));
        const den = (v[1] - v[2]) * (u[0] - u[2]) + (u[2] - u[1]) * (v[0] - v[2]);
        if (Math.abs(den) < 1e-9 || (x1 - x0) * (y1 - y0) > 40000) continue;
        for (let py = y0; py <= y1; py++) for (let px = x0; px <= x1; px++) {
            const qx = px + 0.5, qy = py + 0.5;
            const w0 = ((v[1] - v[2]) * (qx - u[2]) + (u[2] - u[1]) * (qy - v[2])) / den;
            const w1 = ((v[2] - v[0]) * (qx - u[2]) + (u[0] - u[2]) * (qy - v[2])) / den;
            const w2 = 1 - w0 - w1;
            if (w0 < -0.02 || w1 < -0.02 || w2 < -0.02) continue;
            const id = py * size + px;
            if (mask[id] === 0) mask[id] = 1;
            if (nz > 0.25) {
                const X = P[a * 3] * w0 + P[b * 3] * w1 + P[c * 3] * w2;
                const Y = P[a * 3 + 1] * w0 + P[b * 3 + 1] * w1 + P[c * 3 + 1] * w2;
                // viewed from behind, +X is the viewer's left: mirror so the star reads correctly
                const d = distToStar(-X, Y);
                if (d < STAR.width) mask[id] = 2 + Math.min(253, Math.round((1 - d / STAR.width) * 253));
            }
        }
    }
    let capePx = 0, starPx = 0;
    for (let i = 0; i < size * size; i++) {
        const m = mask[i];
        if (!m) continue;
        const o = i * 4, r = RGBA[o], g = RGBA[o + 1], b = RGBA[o + 2];
        const lime = g > 120 && g > r * 1.15 && g > b * 1.5;
        if (!lime) {
            // navy -> near-black with a faint cool sheen (sheet: black cape)
            capePx++;
            const lum = 0.3 * r + 0.55 * g + 0.15 * b;
            RGBA[o] = Math.round(lum * 0.42 + 2);
            RGBA[o + 1] = Math.round(lum * 0.44 + 2);
            RGBA[o + 2] = Math.round(lum * 0.52 + 4);
        }
        if (m >= 2) {
            starPx++;
            const k = Math.min(1, (m - 2) / 120);             // soft edge
            RGBA[o] = Math.round(RGBA[o] * (1 - k) + 184 * k);
            RGBA[o + 1] = Math.round(RGBA[o + 1] * (1 - k) + 255 * k);
            RGBA[o + 2] = Math.round(RGBA[o + 2] * (1 - k) + 44 * k);
        }
    }
    capeMask = mask;
    console.log(`restyle: cape texels darkened ${capePx}, star texels ${starPx}`);
}
// emissive map: only the lime and cyan suit/cape details glow
const EMI = Buffer.alloc(size * size * 3);
for (let i = 0; i < size * size; i++) {
    const r = RGBA[i * 4], g = RGBA[i * 4 + 1], b = RGBA[i * 4 + 2];
    const lime = g > 140 && g > r * 1.15 && g > b * 1.6;
    const cyan = b > 150 && g > 110 && r < 110 && b > r * 1.6;
    if (lime || cyan) {
        const k = Math.min(1, (Math.max(g, b) - 110) / 120);
        EMI[i * 3] = Math.round(r * k); EMI[i * 3 + 1] = Math.round(g * k); EMI[i * 3 + 2] = Math.round(b * k);
    }
}
const rgb = Buffer.alloc(size * size * 3);
for (let i = 0; i < size * size; i++) { rgb[i * 3] = RGBA[i * 4]; rgb[i * 3 + 1] = RGBA[i * 4 + 1]; rgb[i * 3 + 2] = RGBA[i * 4 + 2]; }
const jpg = await sharp(rgb, { raw: { width: size, height: size, channels: 3 } }).jpeg({ quality: 84, mozjpeg: true }).toBuffer();
const emiJpg = await sharp(EMI, { raw: { width: size, height: size, channels: 3 } }).resize(size / 2, size / 2).jpeg({ quality: 80, mozjpeg: true }).toBuffer();

// ---------------------------------------------------------------- detail maps (normal + metallic/roughness)
// The AI texture already contains the painted surface detail (panel seams, hex armour, fabric
// folds, hair strands). A high-passed luminance height gives it real relief under lighting;
// a per-material classification gives skin, armour, cape fabric and glowing trims believable
// roughness/metalness. Neither changes the outfit's colours.
const maps = !process.argv.includes('--no-maps');
let nrmJpg = null, ormJpg = null;
if (maps) {
    const ms = size / 2;                                    // detail maps at half the colour resolution
    // float luminance + skin mask at map resolution (2x2 box downsample)
    const lum = new Float32Array(ms * ms), skinM = new Float32Array(ms * ms);
    const isSkin = o => { const r = RGBA[o], g = RGBA[o + 1], b = RGBA[o + 2], L = 0.3 * r + 0.59 * g + 0.11 * b; return r > 70 && r > g * 1.12 && g > b * 1.04 && r - b > 22 && L > 45; };
    for (let y = 0; y < ms; y++) for (let x = 0; x < ms; x++) {
        let L = 0, sk = 0;
        for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
            const o = ((y * 2 + dy) * size + x * 2 + dx) * 4;
            L += 0.3 * RGBA[o] + 0.59 * RGBA[o + 1] + 0.11 * RGBA[o + 2];
            sk += isSkin(o) ? 1 : 0;
        }
        lum[y * ms + x] = L / (4 * 255); skinM[y * ms + x] = sk / 4;
    }
    const boxBlur = (src, r) => {               // separable box blur (float), clamp at edges
        const tmp = new Float32Array(src.length), out = new Float32Array(src.length), w = 2 * r + 1;
        for (let y = 0; y < ms; y++) { let acc = 0; for (let x = -r; x <= r; x++) acc += src[y * ms + Math.min(ms - 1, Math.max(0, x))];
            for (let x = 0; x < ms; x++) { tmp[y * ms + x] = acc / w; acc += src[y * ms + Math.min(ms - 1, x + r + 1)] - src[y * ms + Math.max(0, x - r)]; } }
        for (let x = 0; x < ms; x++) { let acc = 0; for (let y = -r; y <= r; y++) acc += tmp[Math.min(ms - 1, Math.max(0, y)) * ms + x];
            for (let y = 0; y < ms; y++) { out[y * ms + x] = acc / w; acc += tmp[Math.min(ms - 1, y + r + 1) * ms + x] - tmp[Math.max(0, y - r) * ms + x]; } }
        return out;
    };
    const fine = boxBlur(boxBlur(lum, 1), 1);                 // removes 8-bit terracing
    const low = boxBlur(boxBlur(lum, Math.round(ms / 128)), Math.round(ms / 128));
    const skinSoft = boxBlur(skinM, 3);
    const Hh = new Float32Array(ms * ms);
    for (let i = 0; i < ms * ms; i++) Hh[i] = (fine[i] - low[i]) * (1 - Math.min(1, skinSoft[i] * 1.5));   // no relief on skin
    const NM = Buffer.alloc(ms * ms * 3);
    const strength = 1.6 * (ms / 1024);
    const at = (x, y) => Hh[Math.min(ms - 1, Math.max(0, y)) * ms + Math.min(ms - 1, Math.max(0, x))];
    for (let y = 0; y < ms; y++) for (let x = 0; x < ms; x++) {
        const dx = (at(x + 1, y) - at(x - 1, y)) * strength;
        const dy = (at(x, y + 1) - at(x, y - 1)) * strength;
        const l = Math.hypot(dx, dy, 1), o = (y * ms + x) * 3;
        NM[o] = Math.round((-dx / l * 0.5 + 0.5) * 255);
        NM[o + 1] = Math.round((dy / l * 0.5 + 0.5) * 255);                     // glTF: +Y up (V runs down the image)
        NM[o + 2] = Math.round((1 / l * 0.5 + 0.5) * 255);
    }
    nrmJpg = await sharp(NM, { raw: { width: ms, height: ms, channels: 3 } }).jpeg({ quality: 90, mozjpeg: true }).toBuffer();
    // ORM: R = occlusion (cavities from the low-frequency luminance), G = roughness, B = metalness
    const ORM = Buffer.alloc(size * size * 3);
    for (let i = 0; i < size * size; i++) {
        const r = RGBA[i * 4], g = RGBA[i * 4 + 1], b = RGBA[i * 4 + 2];
        const L = 0.3 * r + 0.59 * g + 0.11 * b;
        let rough, metal;
        const glow = (g > 140 && g > r * 1.15 && g > b * 1.6) || (b > 150 && g > 110 && r < 110 && b > r * 1.6);
        const skin = r > 70 && r > g * 1.12 && g > b * 1.04 && r - b > 22 && L > 45;
        if (glow) { rough = 0.32; metal = 0.0; }
        else if (capeMask && capeMask[i]) { rough = 0.72; metal = 0.04; }          // cape fabric
        else if (skin) { rough = 0.52; metal = 0.0; }
        else if (L < 38) { rough = 0.38; metal = 0.55; }                            // black armour plates
        else { rough = 0.58; metal = 0.18; }                                          // suit, belt, hair
        ORM[i * 3] = 255; ORM[i * 3 + 1] = Math.round(rough * 255); ORM[i * 3 + 2] = Math.round(metal * 255);
    }
    ormJpg = await sharp(ORM, { raw: { width: size, height: size, channels: 3 } }).resize(ms, ms).jpeg({ quality: 85, mozjpeg: true }).toBuffer();
    console.log(`detail maps: normal + metallic/roughness at ${ms}x${ms}`);
}

// ---------------------------------------------------------------- write glTF
const doc = new Document();
const buf = doc.createBuffer();
const acc = (type, arr) => doc.createAccessor().setType(type).setArray(arr).setBuffer(buf);
const prim = doc.createPrimitive()
    .setAttribute('POSITION', acc('VEC3', P))
    .setAttribute('NORMAL', acc('VEC3', NRM))
    .setAttribute('TEXCOORD_0', acc('VEC2', UV))
    .setAttribute('JOINTS_0', acc('VEC4', JOINTS))
    .setAttribute('WEIGHTS_0', acc('VEC4', WEIGHTS))
    .setIndices(acc('SCALAR', N > 65535 ? IDXK : Uint16Array.from(IDXK)));
const tex = doc.createTexture('allstar_basecolor').setImage(jpg).setMimeType('image/jpeg');
const emiTex = doc.createTexture('allstar_emissive').setImage(emiJpg).setMimeType('image/jpeg');
const nrmTex = nrmJpg && doc.createTexture('allstar_normal').setImage(nrmJpg).setMimeType('image/jpeg');
const ormTex = ormJpg && doc.createTexture('allstar_metal_rough').setImage(ormJpg).setMimeType('image/jpeg');
const mat = doc.createMaterial('allstar')
    .setBaseColorTexture(tex)
    .setEmissiveTexture(emiTex)
    .setEmissiveFactor([1, 1, 1])
    .setNormalTexture(nrmTex || null)
    .setNormalScale(nrmTex ? 0.6 : 1)
    .setMetallicRoughnessTexture(ormTex || null)
    .setRoughnessFactor(0.55)
    .setMetallicFactor(0.15);
prim.setMaterial(mat);
const mesh = doc.createMesh('allstar').addPrimitive(prim);

const nodes = {};
for (const n of names) {
    const j = J[n];
    const pp = j.parent ? J[j.parent].pos : [0, 0, 0];
    nodes[n] = doc.createNode(n).setTranslation([j.pos[0] - pp[0], j.pos[1] - pp[1], j.pos[2] - pp[2]]);
}
for (const n of names) if (J[n].parent) nodes[J[n].parent].addChild(nodes[n]);
const ibm = new Float32Array(names.length * 16);
names.forEach((n, k) => {
    const [x, y, z] = J[n].pos;
    ibm.set([1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, -x, -y, -z, 1], k * 16);
});
const skin = doc.createSkin('allstarSkin').setSkeleton(nodes.body).setInverseBindMatrices(acc('MAT4', ibm));
names.forEach(n => skin.addJoint(nodes[n]));
const meshNode = doc.createNode('allstarMesh').setMesh(mesh).setSkin(skin);
const root = doc.createNode('AllStar').addChild(nodes.body).addChild(meshNode);
doc.createScene('scene').addChild(root);
doc.getRoot().getAsset().generator = 'all-star hero pipeline (tools/hero-rig.mjs)';

fs.mkdirSync(path.dirname(output), { recursive: true });
if (nrmTex) {
    if (ormTex) mat.setRoughnessFactor(1).setMetallicFactor(1);          // the map carries the values
    // MikkTSpace tangents for the normal map (needs an unwelded mesh, then re-weld)
    await doc.transform(unweld(), tangents({ generateTangents, overwrite: true }), weld());
}
await new NodeIO().write(output, doc);
const kb = Math.round(fs.statSync(output).size / 1024);
console.log(`bridge triangles cut: ${cut}, island triangles removed: ${islandTris}`);
console.log(`wrote ${output}: ${N} vertices, ${IDXK.length / 3} triangles, ${names.length} joints, cape vertices ${capeCount}, ${kb} KB`);

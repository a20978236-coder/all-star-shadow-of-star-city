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
import sharp from 'sharp';
import fs from 'node:fs';
import path from 'node:path';

const [, , input, output, texSize = '2048'] = process.argv;
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
const jpg = await sharp(srcImg).resize(size, size, { fit: 'fill' }).jpeg({ quality: 84, mozjpeg: true }).toBuffer();

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
const mat = doc.createMaterial('allstar')
    .setBaseColorTexture(tex)
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
await new NodeIO().write(output, doc);
const kb = Math.round(fs.statSync(output).size / 1024);
console.log(`bridge triangles cut: ${cut}, island triangles removed: ${islandTris}`);
console.log(`wrote ${output}: ${N} vertices, ${IDXK.length / 3} triangles, ${names.length} joints, cape vertices ${capeCount}, ${kb} KB`);

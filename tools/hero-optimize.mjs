// Stage 1 of the hero asset pipeline: weld + simplify + normalize an AI-generated GLB.
// Usage: node tools/hero-optimize.mjs <input.glb> <out.bin.json> [targetTriangles]
// Writes raw arrays (positions, uvs, indices) + the base colour image for stage 2 (rigging).
import { NodeIO } from '@gltf-transform/core';
import { weld, simplify, dedup, prune } from '@gltf-transform/functions';
import { MeshoptSimplifier } from 'meshoptimizer';
import fs from 'node:fs';
import path from 'node:path';

const [, , input, output, target = '50000'] = process.argv;
const io = new NodeIO();
const doc = await io.read(input);
await MeshoptSimplifier.ready;
const prim0 = doc.getRoot().listMeshes()[0].listPrimitives()[0];
const before = prim0.getIndices().getCount() / 3;
await doc.transform(dedup(), weld());
const prim1 = doc.getRoot().listMeshes()[0].listPrimitives()[0];
const tris = prim1.getIndices().getCount() / 3;
const ratio = Math.min(1, Number(target) / tris);
await doc.transform(simplify({ simplifier: MeshoptSimplifier, ratio, error: 0.002, lockBorder: false }), prune());
const prim = doc.getRoot().listMeshes()[0].listPrimitives()[0];
const pos = Array.from(prim.getAttribute('POSITION').getArray());
const uv = Array.from(prim.getAttribute('TEXCOORD_0').getArray());
const idx = Array.from(prim.getIndices().getArray());
const tex = doc.getRoot().listTextures()[0];
fs.mkdirSync(path.dirname(output), { recursive: true });
fs.writeFileSync(output.replace(/\.json$/, '.jpg'), Buffer.from(tex.getImage()));
fs.writeFileSync(output, JSON.stringify({ pos, uv, idx }));
console.log(`triangles ${before} -> welded ${tris} -> ${idx.length / 3}, vertices ${pos.length / 3}`);

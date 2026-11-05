// Diagnostic: apply test poses to the rigged hero and report stretched triangles.
// Usage: node tools/hero-rig-check.mjs public/assets/models/allstar.glb
import { NodeIO } from '@gltf-transform/core';
import { Mat4, Quat, Vec3 } from 'playcanvas';
const doc = await new NodeIO().read(process.argv[2]);
const skin = doc.getRoot().listSkins()[0];
const joints = skin.listJoints();
const prim = doc.getRoot().listMeshes()[0].listPrimitives()[0];
const P = prim.getAttribute('POSITION').getArray(), J = prim.getAttribute('JOINTS_0').getArray(), W = prim.getAttribute('WEIGHTS_0').getArray(), I = prim.getIndices().getArray();
const POSES = {
    run: { legL: [45, 0, 0], legR: [-35, 0, 0], shinL: [-20, 0, 0], shinR: [-80, 0, 0], armL: [-40, 0, -6], armR: [40, 0, 6], foreL: [70, 0, 0], foreR: [80, 0, 0], torso: [-10, 8, 0], cape1: [-45, 0, 0], cape2: [-25, 0, 0] },
    glide: { armL: [0, 0, -85], armR: [0, 0, 85], body: [-75, 0, 0], head: [-50, 0, 0], cape1: [-95, 0, 0], cape2: [-5, 0, 0] },
    kick: { legR: [95, 0, 0], legL: [-15, 0, 0], torso: [-15, -30, 0], cape1: [-25, 0, 0] }
};
const names = joints.map(j => j.getName());
for (const [pname, pose] of Object.entries(POSES)) {
    const world = new Map();
    const wm = j => {
        if (world.has(j)) return world.get(j);
        const t = j.getTranslation(), a = pose[j.getName()] || [0, 0, 0];
        const local = new Mat4().setTRS(new Vec3(t[0], t[1], t[2]), new Quat().setFromEulerAngles(a[0], a[1], a[2]), Vec3.ONE);
        const parent = j.getParentNode && j.getParentNode();
        const pm = parent && joints.includes(parent) ? wm(parent) : new Mat4();
        const m = new Mat4().mul2(pm, local); world.set(j, m); return m;
    };
    const ibm = skin.getInverseBindMatrices().getArray();
    const skinM = joints.map((j, k) => new Mat4().mul2(wm(j), new Mat4().set(Array.from(ibm.slice(k * 16, k * 16 + 16)))));
    const n = P.length / 3, Q = new Float32Array(n * 3), v = new Vec3(), o = new Vec3();
    for (let i = 0; i < n; i++) {
        let x = 0, y = 0, z = 0;
        for (let k = 0; k < 4; k++) { const w = W[i * 4 + k]; if (!w) continue; v.set(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]); skinM[J[i * 4 + k]].transformPoint(v, o); x += o.x * w; y += o.y * w; z += o.z * w; }
        Q[i * 3] = x; Q[i * 3 + 1] = y; Q[i * 3 + 2] = z;
    }
    const len = (A, a, b) => Math.hypot(A[a * 3] - A[b * 3], A[a * 3 + 1] - A[b * 3 + 1], A[a * 3 + 2] - A[b * 3 + 2]);
    let bad = 0; const where = {};
    for (let t = 0; t < I.length; t += 3) {
        const [a, b, c] = [I[t], I[t + 1], I[t + 2]];
        const r = Math.max(len(Q, a, b) / (len(P, a, b) + 1e-4), len(Q, b, c) / (len(P, b, c) + 1e-4), len(Q, a, c) / (len(P, a, c) + 1e-4));
        const grow = Math.max(len(Q, a, b), len(Q, b, c), len(Q, a, c));
        if (r > 3 && grow > 0.12) {
            bad++;
            for (const vv of [a, b, c]) { const key = `${names[J[vv * 4]]}`; where[key] = (where[key] || 0) + 1; }
        }
    }
    console.log(pname, 'stretched triangles:', bad, JSON.stringify(where));
}

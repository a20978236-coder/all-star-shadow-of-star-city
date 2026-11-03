import * as pc from 'playcanvas';

const W = 8;          // columns
const H = 12;         // rows
const ITER = 5;

const tmpA = new pc.Vec3();
const tmpB = new pc.Vec3();
const inv = new pc.Mat4();

/**
 * Verlet cloth cape pinned to the hero's shoulders. Reacts to running, wind
 * from motion, gravity and the body (sphere collisions), spreads into a wing
 * while gliding, and has a pointed scalloped hem. Two layers: black shell +
 * electric-blue lining.
 */
export class Cape {
    constructor(app, rig, { outer, inner, trim }) {
        this.app = app;
        this.rig = rig;
        const n = W * H;
        this.pos = new Float32Array(n * 3);
        this.prev = new Float32Array(n * 3);
        this.rest = [];
        this.length = 1.3;
        this.topWidth = 0.5;
        this.bottomWidth = 1.2;
        this.segV = this.length / (H - 1);
        this.wind = new pc.Vec3();
        this.lastRoot = new pc.Vec3();
        this.initialised = false;
        this.time = 0;

        // per-column extra length for the pointed hem
        this.hem = [];
        for (let c = 0; c < W; c++) this.hem.push(c % 2 === 0 ? 0.16 : 0);

        // meshes
        const idx = [];
        for (let r = 0; r < H - 1; r++) for (let c = 0; c < W - 1; c++) {
            const a = r * W + c, b = a + 1, d = a + W, e = d + 1;
            idx.push(a, d, b, b, d, e);
        }
        const idxInner = [];
        for (let k = 0; k < idx.length; k += 3) idxInner.push(idx[k], idx[k + 2], idx[k + 1]);
        const uvs = new Float32Array(n * 2);
        for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) { uvs[(r * W + c) * 2] = c / (W - 1); uvs[(r * W + c) * 2 + 1] = r / (H - 1); }
        this.normalsOut = new Float32Array(n * 3);
        this.normalsIn = new Float32Array(n * 3);
        this.posOut = new Float32Array(n * 3);
        this.posIn = new Float32Array(n * 3);
        const mk = (indices, mat, positions, normals) => {
            const mesh = new pc.Mesh(app.graphicsDevice);
            mesh.setPositions(positions);
            mesh.setNormals(normals);
            mesh.setUvs(0, uvs);
            mesh.setIndices(new Uint16Array(indices));
            mesh.update(pc.PRIMITIVE_TRIANGLES);
            const mi = new pc.MeshInstance(mesh, mat);
            mi.cull = false;
            return { mesh, mi };
        };
        this.outer = mk(idx, outer, this.posOut, this.normalsOut);
        this.inner = mk(idxInner, inner, this.posIn, this.normalsIn);
        this.entity = new pc.Entity('CapeCloth');
        this.entity.addComponent('render', { meshInstances: [this.outer.mi, this.inner.mi], castShadows: true, receiveShadows: true });
        app.root.addChild(this.entity);

        // glowing hem trim (a thin strip following the bottom row)
        this.trimMat = trim;
    }

    /** Pinned top-row point (world) for column c. */
    _pin(c, out) {
        const t = c / (W - 1);
        const x = (t - 0.5) * this.topWidth;
        // wrap slightly around the shoulders
        const z = 0.13 + Math.abs(t - 0.5) * -0.08;
        this.rig.torso.getWorldTransform().transformPoint(tmpA.set(x, 0.58, z), out);
        return out;
    }

    reset() {
        const down = this.rig.torso.up.clone().mulScalar(-1);
        const back = this.rig.torso.forward.clone().mulScalar(-1);
        for (let c = 0; c < W; c++) {
            this._pin(c, tmpB);
            const t = c / (W - 1);
            for (let r = 0; r < H; r++) {
                const k = (r * W + c) * 3;
                const spread = (t - 0.5) * (this.bottomWidth - this.topWidth) * (r / (H - 1));
                const right = this.rig.torso.right;
                const px = tmpB.x + down.x * r * this.segV + back.x * 0.05 * r + right.x * spread;
                const py = tmpB.y + down.y * r * this.segV + back.y * 0.05 * r + right.y * spread;
                const pz = tmpB.z + down.z * r * this.segV + back.z * 0.05 * r + right.z * spread;
                this.pos[k] = this.prev[k] = px;
                this.pos[k + 1] = this.prev[k + 1] = py;
                this.pos[k + 2] = this.prev[k + 2] = pz;
            }
        }
        this.initialised = true;
    }

    /**
     * velocity: world velocity of the character. state: animation state string.
     */
    update(dt, velocity, state) {
        if (dt <= 0) return;
        dt = Math.min(dt, 1 / 30);
        this.time += dt;
        const root = this.rig.root.getPosition();
        if (!this.initialised || root.distance(this.lastRoot) > 3) this.reset();
        this.lastRoot.copy(root);

        const P = this.pos, Q = this.prev;
        const gravity = -11 * dt * dt;
        // apparent wind from the hero's motion + gusts
        const gust = Math.sin(this.time * 2.3) * 0.6 + Math.sin(this.time * 5.1) * 0.3;
        this.wind.set(-velocity.x * 0.9 + gust * 0.4, -velocity.y * 0.35, -velocity.z * 0.9 + gust * 0.25);
        const damping = 0.965;
        const windK = 0.42 * dt * dt;
        const gliding = state === 'glide';

        // integrate
        for (let r = 1; r < H; r++) for (let c = 0; c < W; c++) {
            const k = (r * W + c) * 3;
            const flutter = Math.sin(this.time * 11 + r * 0.9 + c * 1.3) * Math.min(1, velocity.length() / 12) * 0.5;
            for (let a = 0; a < 3; a++) {
                const v = (P[k + a] - Q[k + a]) * damping;
                Q[k + a] = P[k + a];
                let acc = this.wind[['x', 'y', 'z'][a]] * windK * (r / H);
                if (a === 1) acc += gravity + flutter * dt * dt * 3;
                P[k + a] += v + acc;
            }
        }

        // pins
        for (let c = 0; c < W; c++) {
            this._pin(c, tmpB);
            const k = c * 3;
            P[k] = Q[k] = tmpB.x; P[k + 1] = Q[k + 1] = tmpB.y; P[k + 2] = Q[k + 2] = tmpB.z;
        }

        // glide: pull the cloth into a wing spanning the arms
        if (gliding) {
            const torso = this.rig.torso;
            const right = torso.right, down = torso.up.clone().mulScalar(-1);
            for (let r = 1; r < H; r++) for (let c = 0; c < W; c++) {
                const k = (r * W + c) * 3, t = c / (W - 1);
                this._pin(c, tmpB);
                const span = (t - 0.5) * 2.3 * Math.min(1, r / (H * 0.5));
                const tx = tmpB.x + right.x * span + down.x * r * this.segV * 0.85;
                const ty = tmpB.y + right.y * span + down.y * r * this.segV * 0.85 + 0.03;
                const tz = tmpB.z + right.z * span + down.z * r * this.segV * 0.85;
                P[k] += (tx - P[k]) * 0.3; P[k + 1] += (ty - P[k + 1]) * 0.3; P[k + 2] += (tz - P[k + 2]) * 0.3;
            }
        }

        // body colliders (world spheres)
        const spheres = this._colliders();
        inv.copy(this.rig.torso.getWorldTransform()).invert();

        for (let it = 0; it < ITER; it++) {
            // distance constraints
            for (let r = 0; r < H; r++) {
                const width = this.topWidth + (this.bottomWidth - this.topWidth) * (r / (H - 1));
                const hSeg = width / (W - 1);
                for (let c = 0; c < W; c++) {
                    const i = r * W + c;
                    if (c < W - 1) this._satisfy(i, i + 1, hSeg, r === 0);
                    if (r < H - 1) {
                        const len = this.segV + (r === H - 2 ? this.hem[c] : 0);
                        this._satisfy(i, i + W, len, r === 0);
                    }
                    if (r < H - 1 && c < W - 1) this._satisfy(i, i + W + 1, Math.hypot(hSeg, this.segV) * 1.02, r === 0);
                }
            }
            // collisions
            for (let i = W; i < W * H; i++) {
                const k = i * 3;
                for (const s of spheres) {
                    const dx = P[k] - s[0], dy = P[k + 1] - s[1], dz = P[k + 2] - s[2];
                    const d2 = dx * dx + dy * dy + dz * dz;
                    if (d2 < s[3] * s[3] && d2 > 1e-8) {
                        const d = Math.sqrt(d2), push = (s[3] - d) / d;
                        P[k] += dx * push; P[k + 1] += dy * push; P[k + 2] += dz * push;
                    }
                }
                // keep the cloth behind the back (torso-local z >= 0.1) for the upper half
                if (!gliding && i < W * H * 0.55) {
                    tmpA.set(P[k], P[k + 1], P[k + 2]);
                    inv.transformPoint(tmpA, tmpA);
                    if (tmpA.z < 0.11 && tmpA.y > -0.3) {
                        tmpA.z = 0.11;
                        this.rig.torso.getWorldTransform().transformPoint(tmpA, tmpA);
                        P[k] = tmpA.x; P[k + 1] = tmpA.y; P[k + 2] = tmpA.z;
                    }
                }
                // floor
                const floorY = root.y + 0.02;
                if (P[k + 1] < floorY) P[k + 1] = floorY;
            }
        }
        this._upload();
    }

    _satisfy(i, j, rest, pinnedI) {
        const P = this.pos, a = i * 3, b = j * 3;
        const dx = P[b] - P[a], dy = P[b + 1] - P[a + 1], dz = P[b + 2] - P[a + 2];
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-6;
        const diff = (d - rest) / d;
        if (pinnedI && i < W && j < W) return;
        if (i < W) {                 // i is pinned: move only j
            P[b] -= dx * diff; P[b + 1] -= dy * diff; P[b + 2] -= dz * diff;
        } else {
            const h = diff * 0.5;
            P[a] += dx * h; P[a + 1] += dy * h; P[a + 2] += dz * h;
            P[b] -= dx * h; P[b + 1] -= dy * h; P[b + 2] -= dz * h;
        }
    }

    _colliders() {
        const rig = this.rig, out = [];
        const add = (ent, x, y, z, r) => {
            rig[ent].getWorldTransform().transformPoint(tmpA.set(x, y, z), tmpB);
            out.push([tmpB.x, tmpB.y, tmpB.z, r]);
        };
        add('torso', 0, 0.42, 0.0, 0.25);
        add('torso', 0, 0.18, 0.0, 0.22);
        add('pelvis', 0, -0.05, 0.0, 0.21);
        add('legL', 0, -0.22, 0.0, 0.12);
        add('legR', 0, -0.22, 0.0, 0.12);
        add('shinL', 0, -0.2, 0.0, 0.1);
        add('shinR', 0, -0.2, 0.0, 0.1);
        return out;
    }

    _upload() {
        const P = this.pos, NO = this.normalsOut, NI = this.normalsIn, PO = this.posOut, PI = this.posIn;
        for (let r = 0; r < H; r++) for (let c = 0; c < W; c++) {
            const i = r * W + c, k = i * 3;
            const l = c > 0 ? i - 1 : i, rr = c < W - 1 ? i + 1 : i;
            const u = r > 0 ? i - W : i, d = r < H - 1 ? i + W : i;
            const ax = P[rr * 3] - P[l * 3], ay = P[rr * 3 + 1] - P[l * 3 + 1], az = P[rr * 3 + 2] - P[l * 3 + 2];
            const bx = P[d * 3] - P[u * 3], by = P[d * 3 + 1] - P[u * 3 + 1], bz = P[d * 3 + 2] - P[u * 3 + 2];
            // outward (away from the body) normal = row x col
            let nx = by * az - bz * ay, ny = bz * ax - bx * az, nz = bx * ay - by * ax;
            const nl = Math.hypot(nx, ny, nz) || 1;
            nx /= nl; ny /= nl; nz /= nl;
            NO[k] = nx; NO[k + 1] = ny; NO[k + 2] = nz;
            NI[k] = -nx; NI[k + 1] = -ny; NI[k + 2] = -nz;
            PO[k] = P[k] + nx * 0.004; PO[k + 1] = P[k + 1] + ny * 0.004; PO[k + 2] = P[k + 2] + nz * 0.004;
            PI[k] = P[k] - nx * 0.004; PI[k + 1] = P[k + 1] - ny * 0.004; PI[k + 2] = P[k + 2] - nz * 0.004;
        }
        for (const [m, p, n] of [[this.outer.mesh, PO, NO], [this.inner.mesh, PI, NI]]) {
            m.setPositions(p);
            m.setNormals(n);
            m.update(pc.PRIMITIVE_TRIANGLES, false);
        }
    }

    setVisible(v) { this.entity.enabled = v; }
}

import { Vec3, Quat } from '../core/math.js';

const tmpQ = new Quat();
const tmpP = new Vec3();
const tmpN = new Vec3();

/**
 * Builds smooth organic shapes (ellipsoids, tapered limbs, rotated boxes) and
 * merges them into a single mesh, so a detailed character body part costs one
 * draw call per material.
 */
export class ShapeBuilder {
    constructor() {
        this.positions = [];
        this.normals = [];
        this.uvs = [];
        this.indices = [];
    }

    get vertexCount() { return this.positions.length / 3; }
    get empty() { return this.indices.length === 0; }

    _xform(rot) {
        tmpQ.setFromEulerAngles(rot ? rot[0] : 0, rot ? rot[1] : 0, rot ? rot[2] : 0);
        return tmpQ;
    }

    /** Ellipsoid centred at c with radii r. rot = euler degrees. */
    ellipsoid(c, r, seg = 14, rings = 10, rot = null, uvScale = 1) {
        const q = this._xform(rot);
        const base = this.vertexCount;
        for (let i = 0; i <= rings; i++) {
            const v = i / rings, phi = v * Math.PI;
            const sp = Math.sin(phi), cp = Math.cos(phi);
            for (let j = 0; j <= seg; j++) {
                const u = j / seg, th = u * Math.PI * 2;
                const x = Math.cos(th) * sp, y = cp, z = Math.sin(th) * sp;
                tmpP.set(x * r[0], y * r[1], z * r[2]);
                q.transformVector(tmpP, tmpP);
                tmpN.set(x / r[0], y / r[1], z / r[2]).normalize();
                q.transformVector(tmpN, tmpN);
                this.positions.push(c[0] + tmpP.x, c[1] + tmpP.y, c[2] + tmpP.z);
                this.normals.push(tmpN.x, tmpN.y, tmpN.z);
                this.uvs.push(u * uvScale * 2, v * uvScale);
            }
        }
        for (let i = 0; i < rings; i++) {
            for (let j = 0; j < seg; j++) {
                const a = base + i * (seg + 1) + j, b = a + seg + 1;
                this.indices.push(a, a + 1, b, b, a + 1, b + 1);
            }
        }
        return this;
    }

    /**
     * Tapered limb hanging down from `top` (x,y,z) by `length`, radius r0 -> r1,
     * with an elliptical section (ratio = depth/width) and rounded ends.
     */
    limb(top, length, r0, r1, ratio = 1, seg = 14, rings = 6, uvScale = 1) {
        const base = this.vertexCount;
        for (let i = 0; i <= rings; i++) {
            const t = i / rings;
            // slight muscle bulge in the upper third
            const bulge = 1 + Math.sin(Math.min(1, t * 1.6) * Math.PI) * 0.08;
            const r = (r0 + (r1 - r0) * t) * bulge;
            const y = top[1] - length * t;
            for (let j = 0; j <= seg; j++) {
                const th = (j / seg) * Math.PI * 2;
                const cx = Math.cos(th), sz = Math.sin(th);
                this.positions.push(top[0] + cx * r, y, top[2] + sz * r * ratio);
                tmpN.set(cx, (r0 - r1) / length, sz / ratio).normalize();
                this.normals.push(tmpN.x, tmpN.y, tmpN.z);
                this.uvs.push((j / seg) * uvScale, t * length * 4 * uvScale);
            }
        }
        for (let i = 0; i < rings; i++) {
            for (let j = 0; j < seg; j++) {
                const a = base + i * (seg + 1) + j, b = a + seg + 1;
                this.indices.push(a, b, a + 1, b, b + 1, a + 1);
            }
        }
        // rounded caps
        this.ellipsoid([top[0], top[1], top[2]], [r0, r0 * 0.9, r0 * ratio], seg, 6, null, uvScale);
        this.ellipsoid([top[0], top[1] - length, top[2]], [r1, r1 * 0.9, r1 * ratio], seg, 6, null, uvScale);
        return this;
    }

    /** Box centred at c with half-extents h, optional euler rotation (degrees). */
    box(c, h, rot = null) {
        const q = this._xform(rot);
        const faces = [
            [[1, 0, 0], [0, 0, 1], [0, 1, 0]], [[-1, 0, 0], [0, 0, -1], [0, 1, 0]],
            [[0, 1, 0], [1, 0, 0], [0, 0, 1]], [[0, -1, 0], [1, 0, 0], [0, 0, -1]],
            [[0, 0, 1], [-1, 0, 0], [0, 1, 0]], [[0, 0, -1], [1, 0, 0], [0, 1, 0]]
        ];
        for (const [n, u, v] of faces) {
            const base = this.vertexCount;
            for (const [su, sv] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
                tmpP.set(
                    (n[0] + u[0] * su + v[0] * sv) * h[0],
                    (n[1] + u[1] * su + v[1] * sv) * h[1],
                    (n[2] + u[2] * su + v[2] * sv) * h[2]
                );
                q.transformVector(tmpP, tmpP);
                tmpN.set(n[0], n[1], n[2]);
                q.transformVector(tmpN, tmpN);
                this.positions.push(c[0] + tmpP.x, c[1] + tmpP.y, c[2] + tmpP.z);
                this.normals.push(tmpN.x, tmpN.y, tmpN.z);
                this.uvs.push((su + 1) / 2, (sv + 1) / 2);
            }
            this.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
        }
        return this;
    }

    /** Make every triangle front-facing along its vertex normals (robust to winding mistakes). */
    fixWinding() {
        const P = this.positions, N = this.normals, I = this.indices;
        for (let t = 0; t < I.length; t += 3) {
            const a = I[t] * 3, b = I[t + 1] * 3, c = I[t + 2] * 3;
            const e1x = P[b] - P[a], e1y = P[b + 1] - P[a + 1], e1z = P[b + 2] - P[a + 2];
            const e2x = P[c] - P[a], e2y = P[c + 1] - P[a + 1], e2z = P[c + 2] - P[a + 2];
            const cx = e1y * e2z - e1z * e2y, cy = e1z * e2x - e1x * e2z, cz = e1x * e2y - e1y * e2x;
            const nx = N[a] + N[b] + N[c], ny = N[a + 1] + N[b + 1] + N[c + 1], nz = N[a + 2] + N[b + 2] + N[c + 2];
            if (cx * nx + cy * ny + cz * nz < 0) { const tmp = I[t + 1]; I[t + 1] = I[t + 2]; I[t + 2] = tmp; }
        }
    }

    /** Geometry arrays for gfx.customMesh(). */
    toData() {
        this.fixWinding();
        return {
            positions: new Float32Array(this.positions),
            normals: new Float32Array(this.normals),
            uvs: new Float32Array(this.uvs),
            indices: this.vertexCount > 65535 ? new Uint32Array(this.indices) : new Uint16Array(this.indices)
        };
    }

    /** Attach as a mesh child of `parent` (g = graphics backend). */
    attach(g, parent, material, { castShadows = true, name = 'shape' } = {}) {
        if (this.empty) return null;
        const e = g.customMesh(this.toData(), material, { castShadows, receiveShadows: true, name });
        parent.addChild(e);
        return e;
    }
}

/** Collect several ShapeBuilders keyed by material for one pivot. */
export class PartSet {
    constructor() { this.map = new Map(); }
    get(mat) {
        let b = this.map.get(mat);
        if (!b) { b = new ShapeBuilder(); this.map.set(mat, b); }
        return b;
    }
    attach(g, parent, castShadowsFor = () => true) {
        for (const [mat, b] of this.map) b.attach(g, parent, mat, { castShadows: castShadowsFor(mat) });
    }
}

import * as pc from 'playcanvas';

/**
 * Accumulates static geometry (boxes, prisms, quads) into one mesh so the
 * whole city renders in a handful of draw calls. UVs are world-scaled so
 * facade textures tile consistently regardless of building size.
 */
export class GeometryBatch {
    constructor() {
        this.positions = [];
        this.normals = [];
        this.uvs = [];
        this.indices = [];
    }

    get vertexCount() { return this.positions.length / 3; }

    _quad(a, b, c, d, n, uva, uvb, uvc, uvd) {
        // Fix winding so the face is front-facing along normal n (CCW).
        const e1 = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
        const e2 = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
        const cx = e1[1] * e2[2] - e1[2] * e2[1];
        const cy = e1[2] * e2[0] - e1[0] * e2[2];
        const cz = e1[0] * e2[1] - e1[1] * e2[0];
        const flip = (cx * n[0] + cy * n[1] + cz * n[2]) < 0;
        const base = this.vertexCount;
        for (const [p, uv] of [[a, uva], [b, uvb], [c, uvc], [d, uvd]]) {
            this.positions.push(p[0], p[1], p[2]);
            this.normals.push(n[0], n[1], n[2]);
            this.uvs.push(uv[0], uv[1]);
        }
        if (flip) this.indices.push(base, base + 2, base + 1, base, base + 3, base + 2);
        else this.indices.push(base, base + 1, base + 2, base, base + 2, base + 3);
    }

    /**
     * Axis aligned box. opts.uvScale = [metresPerU, metresPerV] for sides,
     * opts.uvOffset = [u, v] random offset, opts.faces to skip ('bottom', 'top').
     */
    addBox(x0, y0, z0, x1, y1, z1, opts = {}) {
        const [su, sv] = opts.uvScale || [1, 1];
        const [ou, ov] = opts.uvOffset || [0, 0];
        const skipBottom = opts.bottom === false;
        const skipTop = opts.top === false;
        const U = v => v / su + ou, V = v => v / sv + ov;
        // +X
        this._quad([x1, y0, z0], [x1, y0, z1], [x1, y1, z1], [x1, y1, z0], [1, 0, 0],
            [U(z0), V(y0)], [U(z1), V(y0)], [U(z1), V(y1)], [U(z0), V(y1)]);
        // -X
        this._quad([x0, y0, z1], [x0, y0, z0], [x0, y1, z0], [x0, y1, z1], [-1, 0, 0],
            [U(-z1), V(y0)], [U(-z0), V(y0)], [U(-z0), V(y1)], [U(-z1), V(y1)]);
        // +Z
        this._quad([x1, y0, z1], [x0, y0, z1], [x0, y1, z1], [x1, y1, z1], [0, 0, 1],
            [U(-x1), V(y0)], [U(-x0), V(y0)], [U(-x0), V(y1)], [U(-x1), V(y1)]);
        // -Z
        this._quad([x0, y0, z0], [x1, y0, z0], [x1, y1, z0], [x0, y1, z0], [0, 0, -1],
            [U(x0), V(y0)], [U(x1), V(y0)], [U(x1), V(y1)], [U(x0), V(y1)]);
        const [tu, tv] = opts.topScale || [su, su];
        if (!skipTop) {
            this._quad([x0, y1, z0], [x1, y1, z0], [x1, y1, z1], [x0, y1, z1], [0, 1, 0],
                [x0 / tu, z0 / tv], [x1 / tu, z0 / tv], [x1 / tu, z1 / tv], [x0 / tu, z1 / tv]);
        }
        if (!skipBottom) {
            this._quad([x0, y0, z1], [x1, y0, z1], [x1, y0, z0], [x0, y0, z0], [0, -1, 0],
                [0, 0], [1, 0], [1, 1], [0, 1]);
        }
    }

    /** Vertical prism / cone (rTop may be 0). */
    addCylinder(cx, y0, cz, rBottom, rTop, height, sides = 8, caps = true) {
        const y1 = y0 + height;
        const slope = (rBottom - rTop) / height;
        for (let i = 0; i < sides; i++) {
            const a0 = (i / sides) * Math.PI * 2, a1 = ((i + 1) / sides) * Math.PI * 2;
            const am = (a0 + a1) / 2;
            const n = [Math.cos(am), slope, Math.sin(am)];
            const l = Math.hypot(n[0], n[1], n[2]); n[0] /= l; n[1] /= l; n[2] /= l;
            const p0 = [cx + Math.cos(a0) * rBottom, y0, cz + Math.sin(a0) * rBottom];
            const p1 = [cx + Math.cos(a1) * rBottom, y0, cz + Math.sin(a1) * rBottom];
            const p2 = [cx + Math.cos(a1) * rTop, y1, cz + Math.sin(a1) * rTop];
            const p3 = [cx + Math.cos(a0) * rTop, y1, cz + Math.sin(a0) * rTop];
            this._quad(p0, p1, p2, p3, n, [i / sides, 0], [(i + 1) / sides, 0], [(i + 1) / sides, 1], [i / sides, 1]);
            if (caps && rTop > 0) {
                const c = [cx, y1, cz];
                this._quad(c, p3, p2, c, [0, 1, 0], [0.5, 0.5], [0, 0], [1, 0], [0.5, 0.5]);
            }
        }
    }

    /** Flat rectangle with full 0..1 UVs (signs, decals). `axis` is the facing normal. */
    addQuad(cx, cy, cz, w, h, normal, u0 = 0, u1 = 1) {
        const [nx, , nz] = normal;
        // right vector perpendicular to normal on XZ plane
        const rx = -nz, rz = nx;
        const hw = w / 2, hh = h / 2;
        const a = [cx - rx * hw, cy - hh, cz - rz * hw];
        const b = [cx + rx * hw, cy - hh, cz + rz * hw];
        const c = [cx + rx * hw, cy + hh, cz + rz * hw];
        const d = [cx - rx * hw, cy + hh, cz - rz * hw];
        // UV so the texture reads correctly when viewed from the front
        // canvas textures have v = 0 at the top of the image
        this._quad(a, b, c, d, normal, [u1, 1], [u0, 1], [u0, 0], [u1, 0]);
    }

    /** Horizontal quad (ground decals, water). */
    addFloor(x0, z0, x1, z1, y, uvScale = 1) {
        this._quad([x0, y, z0], [x1, y, z0], [x1, y, z1], [x0, y, z1], [0, 1, 0],
            [x0 / uvScale, z0 / uvScale], [x1 / uvScale, z0 / uvScale], [x1 / uvScale, z1 / uvScale], [x0 / uvScale, z1 / uvScale]);
    }

    /** Build an entity rendering this batch. Returns the entity (or null when empty). */
    build(app, material, parent, name = 'batch', { castShadows = true, receiveShadows = true } = {}) {
        if (this.indices.length === 0) return null;
        const mesh = new pc.Mesh(app.graphicsDevice);
        mesh.setPositions(new Float32Array(this.positions));
        mesh.setNormals(new Float32Array(this.normals));
        mesh.setUvs(0, new Float32Array(this.uvs));
        mesh.setIndices(this.vertexCount > 65535 ? new Uint32Array(this.indices) : new Uint16Array(this.indices));
        mesh.update(pc.PRIMITIVE_TRIANGLES);
        const mi = new pc.MeshInstance(mesh, material);
        const e = new pc.Entity(name);
        e.addComponent('render', { meshInstances: [mi], castShadows, receiveShadows });
        parent.addChild(e);
        return e;
    }
}

/** Keyed collection of batches (one per material per chunk). */
export class BatchSet {
    constructor() { this.map = new Map(); }
    get(key) {
        let b = this.map.get(key);
        if (!b) { b = new GeometryBatch(); this.map.set(key, b); }
        return b;
    }
}

import * as pc from 'playcanvas';

/**
 * Lightweight kinematic collision world built from axis-aligned boxes.
 * Buildings, rooftop props and barriers all register boxes here. Characters
 * and the motorcycle are swept as upright boxes (feet position + radius + height).
 * This avoids a WASM physics dependency and keeps mobile performance high.
 */
export class PhysicsWorld {
    constructor(cellSize = 24) {
        this.boxes = [];
        this.cellSize = cellSize;
        this.grid = new Map();
        this._stamp = 0;
        this.groundY = 0;
    }

    _key(cx, cz) { return cx * 73856093 ^ cz * 19349663; }

    /** Register a solid box. Returns the box record. */
    addBox(minX, minY, minZ, maxX, maxY, maxZ, tag = 'solid') {
        const box = { min: [minX, minY, minZ], max: [maxX, maxY, maxZ], tag, stamp: 0 };
        this.boxes.push(box);
        const cs = this.cellSize;
        for (let cx = Math.floor(minX / cs); cx <= Math.floor(maxX / cs); cx++) {
            for (let cz = Math.floor(minZ / cs); cz <= Math.floor(maxZ / cs); cz++) {
                const k = this._key(cx, cz);
                let list = this.grid.get(k);
                if (!list) { list = []; this.grid.set(k, list); }
                list.push(box);
            }
        }
        return box;
    }

    /** Boxes overlapping the XZ rectangle. */
    query(minX, minZ, maxX, maxZ, out = []) {
        out.length = 0;
        const stamp = ++this._stamp;
        const cs = this.cellSize;
        for (let cx = Math.floor(minX / cs); cx <= Math.floor(maxX / cs); cx++) {
            for (let cz = Math.floor(minZ / cs); cz <= Math.floor(maxZ / cs); cz++) {
                const list = this.grid.get(this._key(cx, cz));
                if (!list) continue;
                for (let i = 0; i < list.length; i++) {
                    const b = list[i];
                    if (b.stamp !== stamp) { b.stamp = stamp; out.push(b); }
                }
            }
        }
        return out;
    }

    /**
     * Sweep an upright box body by `delta`. body = { pos: Vec3 (feet), vel: Vec3, radius, height, grounded }.
     * Returns collision info: { hitWall, wallBox, wallNormal, hitCeiling }.
     */
    move(body, dx, dy, dz, stepHeight = 0) {
        const info = { hitWall: false, wallBox: null, wallNormal: new pc.Vec3(), hitCeiling: false, landed: false };
        const len = Math.sqrt(dx * dx + dy * dy + dz * dz);
        const steps = Math.max(1, Math.ceil(len / 0.3));
        const sx = dx / steps, sy = dy / steps, sz = dz / steps;
        const r = body.radius, h = body.height, p = body.pos;
        const candidates = this.query(
            Math.min(p.x, p.x + dx) - r - 1, Math.min(p.z, p.z + dz) - r - 1,
            Math.max(p.x, p.x + dx) + r + 1, Math.max(p.z, p.z + dz) + r + 1, this._tmpList || (this._tmpList = [])
        );
        const wasGrounded = body.grounded;
        body.grounded = false;

        for (let s = 0; s < steps; s++) {
            // ---- X axis
            p.x += sx;
            for (let i = 0; i < candidates.length; i++) {
                const b = candidates[i];
                if (!this._overlap(p, r, h, b)) continue;
                if (stepHeight > 0 && b.max[1] - p.y <= stepHeight && (wasGrounded || body.grounded) && this._free(p.x, b.max[1] + 0.01, p.z, r, h, candidates)) {
                    p.y = b.max[1]; continue;
                }
                if (sx > 0) { p.x = b.min[0] - r - 1e-4; info.wallNormal.set(-1, 0, 0); } else { p.x = b.max[0] + r + 1e-4; info.wallNormal.set(1, 0, 0); }
                info.hitWall = true; info.wallBox = b; body.vel.x = 0;
            }
            // ---- Z axis
            p.z += sz;
            for (let i = 0; i < candidates.length; i++) {
                const b = candidates[i];
                if (!this._overlap(p, r, h, b)) continue;
                if (stepHeight > 0 && b.max[1] - p.y <= stepHeight && (wasGrounded || body.grounded) && this._free(p.x, b.max[1] + 0.01, p.z, r, h, candidates)) {
                    p.y = b.max[1]; continue;
                }
                if (sz > 0) { p.z = b.min[2] - r - 1e-4; info.wallNormal.set(0, 0, -1); } else { p.z = b.max[2] + r + 1e-4; info.wallNormal.set(0, 0, 1); }
                info.hitWall = true; info.wallBox = b; body.vel.z = 0;
            }
            // ---- Y axis
            p.y += sy;
            for (let i = 0; i < candidates.length; i++) {
                const b = candidates[i];
                if (!this._overlap(p, r, h, b)) continue;
                if (sy <= 0) {
                    p.y = b.max[1]; body.grounded = true; if (body.vel.y < 0) body.vel.y = 0;
                } else {
                    p.y = b.min[1] - h - 1e-4; info.hitCeiling = true; if (body.vel.y > 0) body.vel.y = 0;
                }
            }
            if (p.y <= this.groundY) {
                p.y = this.groundY; body.grounded = true; if (body.vel.y < 0) body.vel.y = 0;
            }
        }

        // Ground probe: stay grounded when standing exactly on a surface.
        if (!body.grounded && dy <= 0) {
            if (p.y <= this.groundY + 0.02) body.grounded = true;
            else {
                for (let i = 0; i < candidates.length; i++) {
                    const b = candidates[i];
                    if (Math.abs(b.max[1] - p.y) < 0.04 && p.x + r > b.min[0] && p.x - r < b.max[0] && p.z + r > b.min[2] && p.z - r < b.max[2]) {
                        body.grounded = true; break;
                    }
                }
            }
        }
        info.landed = !wasGrounded && body.grounded;
        return info;
    }

    _overlap(p, r, h, b) {
        return p.x + r > b.min[0] && p.x - r < b.max[0] &&
               p.z + r > b.min[2] && p.z - r < b.max[2] &&
               p.y + h > b.min[1] && p.y < b.max[1] - 1e-5;
    }

    _free(x, y, z, r, h, list) {
        const p = { x, y, z };
        for (let i = 0; i < list.length; i++) if (this._overlap(p, r, h, list[i])) return false;
        return true;
    }

    /** Raycast against every box and the ground plane. Returns null or { dist, point, normal, box }. */
    raycast(origin, dir, maxDist = 1000, includeGround = true) {
        let best = maxDist, bestBox = null, bestAxis = -1, bestSign = 0;
        const o = [origin.x, origin.y, origin.z], d = [dir.x, dir.y, dir.z];
        const inv = [1 / d[0], 1 / d[1], 1 / d[2]];
        const boxes = this.boxes;
        for (let i = 0; i < boxes.length; i++) {
            const b = boxes[i];
            let tmin = 0, tmax = best, axis = -1, sign = 0;
            let ok = true;
            for (let a = 0; a < 3; a++) {
                if (Math.abs(d[a]) < 1e-9) {
                    if (o[a] < b.min[a] || o[a] > b.max[a]) { ok = false; break; }
                    continue;
                }
                let t1 = (b.min[a] - o[a]) * inv[a];
                let t2 = (b.max[a] - o[a]) * inv[a];
                let s = -1;
                if (t1 > t2) { const tt = t1; t1 = t2; t2 = tt; s = 1; }
                if (t1 > tmin) { tmin = t1; axis = a; sign = s; }
                if (t2 < tmax) tmax = t2;
                if (tmin > tmax) { ok = false; break; }
            }
            if (ok && axis >= 0 && tmin < best) { best = tmin; bestBox = b; bestAxis = axis; bestSign = sign; }
        }
        if (includeGround && d[1] < -1e-6) {
            const t = (this.groundY - o[1]) / d[1];
            if (t > 0 && t < best) { best = t; bestBox = null; bestAxis = 1; bestSign = 1; }
        }
        if (bestAxis < 0) return null;
        const normal = new pc.Vec3(0, 0, 0);
        if (bestAxis === 0) normal.x = bestSign; else if (bestAxis === 1) normal.y = bestSign; else normal.z = bestSign;
        return {
            dist: best,
            point: new pc.Vec3(o[0] + d[0] * best, o[1] + d[1] * best, o[2] + d[2] * best),
            normal,
            box: bestBox
        };
    }

    /** Height of the highest walkable surface under (x,z) below `fromY`. */
    heightAt(x, z, fromY = 1000) {
        let h = this.groundY;
        const list = this.query(x, z, x, z, this._hList || (this._hList = []));
        for (const b of list) {
            if (x >= b.min[0] && x <= b.max[0] && z >= b.min[2] && z <= b.max[2] && b.max[1] <= fromY && b.max[1] > h) h = b.max[1];
        }
        return h;
    }
}

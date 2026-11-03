import { Vec3 } from '../core/math.js';
import { GRAPPLE, WORLD } from '../config.js';
import { neonMaterial } from '../world/Materials.js';
import { headingFromDir, dirFromHeading, dampAngle, clamp, DEG } from '../core/MathUtils.js';
import { COLORS } from '../config.js';

const tmp = new Vec3();
const tmp2 = new Vec3();

/**
 * Two traversal tools:
 *  - Grapple (Q / middle mouse / touch): zip to the ledge under the crosshair and vault onto the roof.
 *  - Swing (hold E / touch): fire a line at a nearby building and swing like a pendulum; release to fling.
 */
export class GrappleSystem {
    constructor(game, player) {
        this.game = game;
        this.player = player;
        this.physics = game.physics;
        this.zipTarget = null;      // latest valid zip target under the crosshair
        this.anchor = new Vec3();
        this.ropeLength = 0;
        this.swingTime = 0;
        this.swingPitch = 0;
        this.cooldown = 0;

        const mat = neonMaterial([0.75, 1.0, 0.85], 2.2);
        this.rope = game.gfx.mesh('box', mat, { castShadows: false, receiveShadows: false, name: 'GrappleLine' });
        this.rope.enabled = false;
        game.gfx.add(this.rope);

        const hookMat = neonMaterial(COLORS.neonGreen, 5);
        this.hook = game.gfx.mesh('sphere', hookMat, { castShadows: false, name: 'GrappleHook' });
        this.hook.setLocalScale(0.35, 0.35, 0.35);
        this.hook.enabled = false;
        game.gfx.add(this.hook);
    }

    /** Called every frame (before state update) to look for targets and react to input. */
    handleInput(input) {
        const p = this.player;
        this.cooldown = Math.max(0, this.cooldown - this.game.dt);
        this.zipTarget = this.findZipTarget();

        if (input.pressed('grapple') && this.cooldown <= 0 && p.state !== 'zip') {
            if (this.zipTarget) this.startZip(this.zipTarget);
            else this.game.hud.hint('No grapple point — aim at a ledge or rooftop', 1.5);
        }
        if (input.pressed('swing') && p.state !== 'swing' && p.state !== 'zip') {
            const a = this.findSwingAnchor();
            if (a) this.startSwing(a);
            else this.game.hud.hint('No swing anchor in range — get closer to buildings', 1.5);
        }
    }

    // ---------------------------------------------------------------- zip
    findZipTarget() {
        const cam = this.game.camera;
        const origin = cam.entity.getPosition();
        const fwd = cam.entity.forward;
        const hit = this.physics.raycast(origin, fwd, GRAPPLE.zipRange + 10, false);
        if (!hit || !hit.box) return null;
        const tag = hit.box.tag;
        if (tag === 'boundary' || tag === 'lamp' || tag === 'curb') return null;
        const p = this.player.pos;
        const box = hit.box;
        let edge, stand, normal;
        if (hit.normal.y > 0.7) {
            edge = hit.point.clone(); edge.y += 0.1;
            normal = null;
        } else if (Math.abs(hit.normal.y) < 0.1) {
            const top = box.max[1];
            normal = hit.normal.clone();
            edge = new Vec3(hit.point.x + normal.x * 0.5, top + 0.2, hit.point.z + normal.z * 0.5);
        } else return null;
        const dist = edge.distance(p);
        if (dist > GRAPPLE.zipRange || dist < 3) return null;
        if (edge.y < p.y - 1 && dist < 12) return null;
        stand = normal ? new Vec3(edge.x - normal.x * 1.2, edge.y, edge.z - normal.z * 1.2) : edge.clone();
        return { edge, stand, normal, dist };
    }

    startZip(t) {
        const p = this.player;
        this.zip = { target: t.edge.clone(), normal: t.normal ? t.normal.clone() : null, speed: 12, t: 0 };
        this.anchor.copy(t.edge);
        p.setState('zip');
        p.body.vel.set(0, 0, 0);
        tmp.sub2(t.edge, p.pos);
        p.heading = headingFromDir(tmp.x, tmp.z);
        this.cooldown = 0.25;
        this._showRope(true);
        this.game.camera.shake(0.12);
    }

    updateZip(dt) {
        const p = this.player;
        const z = this.zip;
        z.t += dt;
        z.speed = Math.min(GRAPPLE.zipSpeed, z.speed + 120 * dt);
        tmp.sub2(z.target, p.pos);
        const d = tmp.length();
        const step = z.speed * dt;
        // short hook travel time before the pull starts
        if (z.t > 0.08) {
            if (d <= step + 0.6) {
                p.pos.copy(z.target);
                this._finishZip();
                return;
            }
            tmp.mulScalar(step / d);
            p.pos.add(tmp);
            p.body.vel.copy(tmp).mulScalar(1 / dt);
        }
        this._updateRope(z.t < 0.08 ? z.t / 0.08 : 1);
        if (z.t > 4) this._finishZip();
    }

    _finishZip() {
        const p = this.player;
        const n = this.zip.normal;
        // Grapple boost: launch up and over the ledge
        if (n) p.body.vel.set(-n.x * 5, GRAPPLE.zipLaunchUp, -n.z * 5);
        else p.body.vel.set(0, 5, 0);
        p.body.grounded = false;
        p.setState('air');
        this._showRope(false);
        this.zip = null;
    }

    // ---------------------------------------------------------------- swing
    findSwingAnchor() {
        const p = this.player;
        const b = p.body;
        const hs = Math.hypot(b.vel.x, b.vel.z);
        const cam = this.game.camera;
        const yaw = cam.yaw * Math.PI / 180;
        const fwd = hs > 4 ? tmp.set(b.vel.x / hs, 0, b.vel.z / hs) : tmp.set(-Math.sin(yaw), 0, -Math.cos(yaw));
        const right = tmp2.set(-fwd.z, 0, fwd.x);
        const origin = new Vec3(p.pos.x, p.pos.y + 1.6, p.pos.z);
        let best = null, bestScore = -Infinity;
        const elevs = [55, 68, 42, 78];
        const sides = [0, -0.7, 0.7, -1.4, 1.4];
        const dir = new Vec3();
        for (const e of elevs) {
            const ce = Math.cos(e * Math.PI / 180), se = Math.sin(e * Math.PI / 180);
            for (const s of sides) {
                dir.set(fwd.x * ce + right.x * s * ce, se, fwd.z * ce + right.z * s * ce).normalize();
                const hit = this.physics.raycast(origin, dir, GRAPPLE.swingRange, false);
                if (!hit || !hit.box || hit.box.tag === 'boundary') continue;
                const rise = hit.point.y - p.pos.y;
                if (rise < 6 || hit.dist < GRAPPLE.swingMinLength) continue;
                const forwardness = (hit.point.x - p.pos.x) * fwd.x + (hit.point.z - p.pos.z) * fwd.z;
                const score = forwardness * 0.6 + Math.min(rise, 35) * 0.5 - Math.abs(s) * 4 - Math.abs(hit.dist - 28) * 0.2;
                if (score > bestScore) { bestScore = score; best = hit.point.clone(); }
            }
        }
        if (!best) {
            // Fallback: sweep all around (e.g. when pressed up against a wall)
            for (let k = 0; k < 12; k++) {
                const a = (k / 12) * Math.PI * 2;
                for (const e of [62, 78]) {
                    const ce = Math.cos(e * Math.PI / 180);
                    dir.set(Math.cos(a) * ce, Math.sin(e * Math.PI / 180), Math.sin(a) * ce);
                    const hit = this.physics.raycast(origin, dir, GRAPPLE.swingRange, false);
                    if (!hit || !hit.box || hit.box.tag === 'boundary') continue;
                    const rise = hit.point.y - p.pos.y;
                    if (rise < 6 || hit.dist < GRAPPLE.swingMinLength) continue;
                    const score = Math.min(rise, 35) - Math.abs(hit.dist - 25) * 0.2;
                    if (score > bestScore) { bestScore = score; best = hit.point.clone(); }
                }
            }
        }
        return best;
    }

    startSwing(anchor) {
        const p = this.player;
        this.anchor.copy(anchor);
        const dist = anchor.distance(p.pos);
        // Keep the bottom of the arc above the ground so street-level swings don't scrape the floor.
        const floor = this.physics.heightAt(p.pos.x, p.pos.z, p.pos.y + 0.5);
        const maxLen = Math.max(GRAPPLE.swingMinLength, anchor.y - floor - 3);
        this.ropeLength = clamp(Math.min(dist * 0.92, maxLen), GRAPPLE.swingMinLength, GRAPPLE.swingRange);
        // initial tug towards the anchor
        tmp.sub2(anchor, p.pos).normalize();
        p.body.vel.add(tmp.mulScalar(p.body.grounded ? 14 : 8));
        if (p.body.grounded) { p.body.vel.y = Math.max(p.body.vel.y, 10); p.body.pos.y += 0.1; p.body.grounded = false; }
        this.swingTime = 0;
        p.setState('swing');
        this._showRope(true);
    }

    updateSwing(dt, input) {
        const p = this.player;
        const b = p.body;
        this.swingTime += dt;
        b.vel.y += WORLD.gravity * dt;
        // steering relative to the camera
        const yaw = this.game.camera.yaw * Math.PI / 180;
        const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
        const rx = Math.cos(yaw), rz = -Math.sin(yaw);
        const s = GRAPPLE.swingSteer * dt;
        b.vel.x += (fx * input.move.y + rx * input.move.x) * s;
        b.vel.z += (fz * input.move.y + rz * input.move.x) * s;
        const sp = b.vel.length();
        if (sp > GRAPPLE.swingMaxSpeed) b.vel.mulScalar(GRAPPLE.swingMaxSpeed / sp);

        // integrate and apply the rope constraint
        const next = tmp.copy(b.vel).mulScalar(dt).add(b.pos);
        const toA = tmp2.sub2(next, this.anchor);
        const d = toA.length();
        if (d > this.ropeLength) {
            toA.mulScalar(1 / d);
            next.copy(this.anchor).add(toA.clone().mulScalar(this.ropeLength));
            const radial = b.vel.dot(toA);
            if (radial > 0) b.vel.sub(toA.clone().mulScalar(radial));
        }
        this.ropeLength = Math.max(GRAPPLE.swingMinLength, this.ropeLength - GRAPPLE.swingReel * dt);
        const info = this.physics.move(b, next.x - b.pos.x, next.y - b.pos.y, next.z - b.pos.z, 0);

        const hs = Math.hypot(b.vel.x, b.vel.z);
        if (hs > 1) p.heading = dampAngle(p.heading, headingFromDir(b.vel.x, b.vel.z), 8, dt);
        // model pitch follows the rope
        const rope = tmp2.sub2(this.anchor, b.pos).normalize();
        const f = dirFromHeading(p.heading, tmp);
        this.swingPitch = -Math.atan2(rope.x * f.x + rope.z * f.z, rope.y) * DEG;

        this._updateRope(1);

        if (b.grounded && this.swingTime > 0.35) { this.cancel(); p.setState('ground'); return; }
        if (info.hitWall && this.swingTime > 0.2) { this.cancel(); p.setState('air'); return; }
        const aboveAnchor = b.pos.y > this.anchor.y - 1.5;
        if (input.released('swing') || !input.held('swing') || aboveAnchor || this.swingTime > 7) this.releaseSwing();
    }

    releaseSwing() {
        const p = this.player;
        const b = p.body;
        if (b.vel.y > -6) b.vel.y += GRAPPLE.releaseBoost;
        const hs = Math.hypot(b.vel.x, b.vel.z);
        if (hs > 1) { b.vel.x *= 1.08; b.vel.z *= 1.08; }
        this._showRope(false);
        p.setState('air');
    }

    cancel() {
        this._showRope(false);
        this.zip = null;
    }

    // ---------------------------------------------------------------- rope visual
    _showRope(v) { this.rope.enabled = v; this.hook.enabled = v; }

    _updateRope(extend) {
        const p = this.player;
        const hand = new Vec3(p.pos.x, p.pos.y + (p.state === 'swing' ? 2.0 : 1.5), p.pos.z);
        const end = new Vec3().lerp(hand, this.anchor, extend);
        const len = hand.distance(end);
        if (len < 0.05) return;
        const mid = new Vec3().lerp(hand, end, 0.5);
        this.rope.setPosition(mid);
        this.rope.lookAt(end);
        this.rope.setLocalScale(0.035, 0.035, len);
        this.hook.setPosition(end);
    }
}

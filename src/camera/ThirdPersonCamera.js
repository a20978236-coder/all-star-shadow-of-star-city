import { Quat, Vec3 } from '../core/math.js';
import { clamp, damp, dampAngle, DEG, RAD } from '../core/MathUtils.js';

const PROFILES = {
    onfoot: { dist: 4.3, height: 1.6, shoulder: 0.6, fov: 62, follow: 0 },
    sprint: { dist: 4.8, height: 1.55, shoulder: 0.5, fov: 70, follow: 1.2 },
    combat: { dist: 5.6, height: 1.7, shoulder: 0.25, fov: 64, follow: 0 },
    air:    { dist: 5.2, height: 1.6, shoulder: 0.45, fov: 68, follow: 0.8 },
    glide:  { dist: 6.8, height: 1.4, shoulder: 0.0, fov: 76, follow: 2.2 },
    swing:  { dist: 7.2, height: 1.2, shoulder: 0.0, fov: 78, follow: 1.8 },
    zip:    { dist: 5.8, height: 1.4, shoulder: 0.3, fov: 74, follow: 0 },
    bike:   { dist: 7.0, height: 1.9, shoulder: 0.0, fov: 66, follow: 3.0 }
};

/**
 * Cinematic third-person orbit camera: shoulder offset, collision with the
 * city, speed-based FOV, auto-follow during traversal, and screen shake.
 * The post-processing chain is provided by the graphics backend.
 */
export class ThirdPersonCamera {
    /** g = graphics backend (see gfx/gfx.js). */
    constructor(g, physics) {
        this.gfx = g;
        this.physics = physics;
        this.entity = g.camera({ fov: 62, near: 0.1, far: 3200, clearColor: [0.02, 0.025, 0.05] });
        g.add(this.entity);

        this.yaw = 0;           // degrees
        this.pitch = -10;       // degrees (negative looks down)
        this.pivot = new Vec3();
        this.curDist = 4.3;
        this.prof = { ...PROFILES.onfoot };
        this.trauma = 0;
        this.sensitivity = 1;
        // post chain lives in the backend (PlayCanvas CameraFrame / Three.js EffectComposer)
        this.post = g.createPost(this.entity);
    }

    /** Apply a graphics preset to the post-processing chain (can be called at runtime). */
    applyQuality(q) { this.post.applyQuality(q); }

    shake(amount) { this.trauma = Math.min(1, this.trauma + amount); }

    get forward() { return this.entity.forward; }

    /**
     * target = { pos: Vec3 (feet), mode: profile key, heading: radians, speed }
     */
    update(dt, input, target) {
        // manual look
        this.yaw -= input.look.x * this.sensitivity;
        this.pitch -= input.look.y * this.sensitivity;
        this.pitch = clamp(this.pitch, -75, 50);

        const p = PROFILES[target.mode] || PROFILES.onfoot;
        const k = 1 - Math.exp(-4 * dt);
        for (const key of ['dist', 'height', 'shoulder', 'fov']) this.prof[key] += (p[key] - this.prof[key]) * k;

        // auto-follow behind the direction of travel when the player isn't steering the camera
        const idle = performance.now() - input.lastLookTime > 900;
        if (p.follow > 0 && idle && target.speed > 3) {
            this.yaw = dampAngle(this.yaw * RAD, target.heading, p.follow, dt) * DEG;
            if (target.mode === 'bike') this.pitch = damp(this.pitch, -8, 1.5, dt);
        }

        const fovBoost = clamp((target.speed - 8) * 0.35, 0, 14);
        this.entity.setFov(this.prof.fov + fovBoost);

        // smoothed pivot (tighter vertically for rooftop running)
        const tx = target.pos.x, ty = target.pos.y + this.prof.height, tz = target.pos.z;
        if (this.pivot.lengthSq() === 0) this.pivot.set(tx, ty, tz);
        this.pivot.x = damp(this.pivot.x, tx, 22, dt);
        this.pivot.y = damp(this.pivot.y, ty, 14, dt);
        this.pivot.z = damp(this.pivot.z, tz, 22, dt);

        const q = new Quat().setFromEulerAngles(this.pitch, this.yaw, 0);
        const offset = new Vec3(this.prof.shoulder, 0.25, this.prof.dist);
        q.transformVector(offset, offset);
        const want = offset.length();
        const dir = offset.clone().mulScalar(1 / want);
        let dist = want;
        const right = new Vec3(Math.cos(this.yaw * RAD), 0, -Math.sin(this.yaw * RAD));
        for (const [ox, oy] of [[0, 0], [0.3, 0], [-0.3, 0], [0, 0.25], [0, -0.25]]) {
            const o = this.pivot.clone().add(right.clone().mulScalar(ox));
            o.y += oy;
            const hit = this.physics.raycast(o, dir, want + 0.4, true);
            if (hit) dist = Math.min(dist, Math.max(0.5, hit.dist - 0.4));
        }
        this.curDist = dist < this.curDist ? dist : damp(this.curDist, dist, 5, dt);

        const pos = this.pivot.clone().add(dir.mulScalar(this.curDist));
        if (pos.y < 0.35) pos.y = 0.35;

        // trauma-based shake
        this.trauma = Math.max(0, this.trauma - dt * 1.6);
        const s = this.trauma * this.trauma;
        const t = performance.now() * 0.001;
        const sx = (Math.sin(t * 47) + Math.sin(t * 31)) * 0.5 * s * 0.35;
        const sy = (Math.sin(t * 53) + Math.sin(t * 23)) * 0.5 * s * 0.35;
        this.post.setFocus(this.curDist + 0.5, 40 + target.speed * 0.8);
        this.entity.setPosition(pos.x, pos.y + sy, pos.z);
        this.entity.setEulerAngles(this.pitch + sy * 8, this.yaw + sx * 8, sx * 6);
    }
}

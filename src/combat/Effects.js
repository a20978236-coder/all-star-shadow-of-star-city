import { Vec3 } from '../core/math.js';
import { neonMaterial, makeMaterial } from '../world/Materials.js';
import { COLORS } from '../config.js';

/** Pooled hit sparks and shockwaves. */
export class Effects {
    constructor(app) {
        this.gfx = app;
        this.sparks = [];
        const mats = [neonMaterial([1, 0.95, 0.7], 8), neonMaterial(COLORS.neonGreen, 8), neonMaterial(COLORS.neonCyan, 8)];
        for (let i = 0; i < 90; i++) {
            const e = app.mesh('box', mats[i % 3], { castShadows: false, receiveShadows: false, name: 'spark' });
            e.enabled = false;
            app.add(e);
            this.sparks.push({ e, vel: new Vec3(), life: 0, max: 1, size: 0.1 });
        }
        this._next = 0;
        this.ringMat = makeMaterial({ name: 'ring', diffuse: [0, 0, 0], emissive: COLORS.neonGreen, emissiveIntensity: 6, opacity: 0.8, blend: 'additive', twoSided: true });
        this.ring = app.mesh('cylinder', this.ringMat, { castShadows: false, receiveShadows: false, name: 'shockwave' });
        this.ring.enabled = false;
        app.add(this.ring);
        this.ringT = 0;
        this.ringMax = 1;
    }

    spark(pos, count = 10, speed = 7, size = 0.09) {
        for (let i = 0; i < count; i++) {
            const s = this.sparks[this._next];
            this._next = (this._next + 1) % this.sparks.length;
            s.e.enabled = true;
            s.e.setPosition(pos);
            s.vel.set(Math.random() - 0.5, Math.random() * 0.8, Math.random() - 0.5).normalize().mulScalar(speed * (0.4 + Math.random()));
            s.life = s.max = 0.25 + Math.random() * 0.3;
            s.size = size * (0.6 + Math.random());
        }
    }

    shockwave(pos, radius, color) {
        this.ring.enabled = true;
        this.ring.setPosition(pos.x, pos.y + 0.6, pos.z);
        this.ringT = 0;
        this.ringMax = radius;
        this.gfx.setEmissive(this.ringMat, color || null);
    }

    update(dt) {
        for (const s of this.sparks) {
            if (!s.e.enabled) continue;
            s.life -= dt;
            if (s.life <= 0) { s.e.enabled = false; continue; }
            s.vel.y -= 14 * dt;
            const p = s.e.getPosition();
            s.e.setPosition(p.x + s.vel.x * dt, p.y + s.vel.y * dt, p.z + s.vel.z * dt);
            const k = s.life / s.max;
            s.e.setLocalScale(s.size * k, s.size * k, s.size * (1 + 3 * k));
            s.e.lookAt(p.x + s.vel.x, p.y + s.vel.y, p.z + s.vel.z);
        }
        if (this.ring.enabled) {
            this.ringT += dt / 0.45;
            const r = this.ringMax * Math.min(1, this.ringT) * 2;
            this.ring.setLocalScale(r, 0.08 + (1 - this.ringT) * 1.2, r);
            this.gfx.setOpacity(this.ringMat, Math.max(0, 0.8 * (1 - this.ringT)));
            if (this.ringT >= 1) this.ring.enabled = false;
        }
    }
}

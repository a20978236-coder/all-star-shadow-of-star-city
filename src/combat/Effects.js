import * as pc from 'playcanvas';
import { neonMaterial, makeMaterial } from '../world/Materials.js';
import { COLORS } from '../config.js';

/** Pooled hit sparks and shockwaves. */
export class Effects {
    constructor(app) {
        this.app = app;
        this.sparks = [];
        const mats = [neonMaterial([1, 0.95, 0.7], 8), neonMaterial(COLORS.neonGreen, 8), neonMaterial(COLORS.neonCyan, 8)];
        for (let i = 0; i < 90; i++) {
            const e = new pc.Entity('spark');
            e.addComponent('render', { type: 'box', material: mats[i % 3], castShadows: false, receiveShadows: false });
            e.enabled = false;
            app.root.addChild(e);
            this.sparks.push({ e, vel: new pc.Vec3(), life: 0, max: 1, size: 0.1 });
        }
        this._next = 0;
        this.ringMat = makeMaterial({ name: 'ring', diffuse: [0, 0, 0], emissive: COLORS.neonGreen, emissiveIntensity: 6, opacity: 0.8, blend: pc.BLEND_ADDITIVE, twoSided: true });
        this.ring = new pc.Entity('shockwave');
        this.ring.addComponent('render', { type: 'cylinder', material: this.ringMat, castShadows: false, receiveShadows: false });
        this.ring.enabled = false;
        app.root.addChild(this.ring);
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
        if (color) { this.ringMat.emissive = new pc.Color(color[0], color[1], color[2]); }
        this.ringMat.update();
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
            this.ringMat.opacity = Math.max(0, 0.8 * (1 - this.ringT));
            this.ringMat.update();
            if (this.ringT >= 1) this.ring.enabled = false;
        }
    }
}

import { Vec3 } from '../core/math.js';
import { Enemy } from './Enemy.js';
import { ENEMY } from '../config.js';

/**
 * Spawns enemy groups, hands out attack "tokens" so only a couple of thugs
 * swing at once (readable free-flow combat), separates crowds and cleans up.
 */
export class EnemyManager {
    constructor(game) {
        this.game = game;
        this.list = [];
        this.groups = new Map();     // id -> { alerted, ambient, center, count, variantMix, respawnTimer }
        this.tokenTimer = 1;
        this.engagedCount = 0;
    }

    spawnGroup(id, center, count, { brutes = 0, spread = 6, ambient = false, y = null } = {}) {
        const g = { id, alerted: false, ambient, center: center.clone(), count, brutes, spread, y, respawnTimer: 0 };
        this.groups.set(id, g);
        this._spawnMembers(g);
        return g;
    }

    _spawnMembers(g) {
        for (let i = 0; i < g.count; i++) {
            const a = (i / g.count) * Math.PI * 2 + Math.random() * 0.5;
            const r = g.spread * (0.4 + Math.random() * 0.6);
            const x = g.center.x + Math.cos(a) * r, z = g.center.z + Math.sin(a) * r;
            const y = g.y !== null ? g.y : this.game.physics.heightAt(x, z, g.center.y + 2);
            const variant = i < g.brutes ? 'brute' : 'thug';
            this.list.push(new Enemy(this.game, variant, new Vec3(x, y + 0.05, z), g.id));
        }
        g.alerted = false;
    }

    alert(id) { const g = this.groups.get(id); if (g) g.alerted = true; }
    isAlerted(id) { return this.groups.get(id)?.alerted; }

    remaining(id) {
        let n = 0;
        for (const e of this.list) if (e.groupId === id && e.alive) n++;
        return n;
    }

    update(dt) {
        const p = this.game.player;
        let attackers = 0;
        this.engagedCount = 0;
        const candidates = [];
        for (const e of this.list) {
            const d = Math.hypot(e.pos.x - p.pos.x, e.pos.z - p.pos.z);
            // cull far-away AI for performance
            const active = d < 160;
            e.setVisible(d < 130);
            if (!active) continue;
            e.update(dt);
            if (e.isAttacking) attackers++;
            if (e.engaged && e.state === 'engage') { candidates.push([d, e]); }
            if (e.engaged && d < 20) this.engagedCount++;
        }

        // attack tokens
        this.tokenTimer -= dt;
        if (this.tokenTimer <= 0 && candidates.length && attackers < ENEMY.maxAttackers && !p.onBike && p.state !== 'hit') {
            candidates.sort((a, b) => a[0] - b[0]);
            const pick = candidates[Math.min(candidates.length - 1, Math.floor(Math.random() * Math.min(3, candidates.length)))][1];
            if (Math.hypot(pick.pos.x - p.pos.x, pick.pos.z - p.pos.z) < 14) pick.setState('approach');
            this.tokenTimer = Math.max(0.45, 1.5 - candidates.length * 0.12) * (0.7 + Math.random() * 0.6);
        }

        // crowd separation
        for (let i = 0; i < this.list.length; i++) {
            const a = this.list[i];
            if (!a.alive || !a.engaged) continue;
            for (let j = i + 1; j < this.list.length; j++) {
                const b = this.list[j];
                if (!b.alive) continue;
                const dx = b.pos.x - a.pos.x, dz = b.pos.z - a.pos.z;
                const d2 = dx * dx + dz * dz;
                const min = a.radius + b.radius + 0.5;
                if (d2 < min * min && d2 > 1e-6 && Math.abs(a.pos.y - b.pos.y) < 1.5) {
                    const d = Math.sqrt(d2), push = (min - d) * 0.5;
                    a.pos.x -= dx / d * push; a.pos.z -= dz / d * push;
                    b.pos.x += dx / d * push; b.pos.z += dz / d * push;
                }
            }
            // keep a little space from the player too
            const dx = a.pos.x - p.pos.x, dz = a.pos.z - p.pos.z;
            const d = Math.hypot(dx, dz);
            if (d < 0.9 && d > 0.001 && !p.onBike) { a.pos.x += dx / d * (0.9 - d); a.pos.z += dz / d * (0.9 - d); }
        }

        // cleanup defeated bodies, respawn ambient groups out of sight
        for (let i = this.list.length - 1; i >= 0; i--) {
            const e = this.list[i];
            if (!e.alive && e.removeTimer > 10) { e.destroy(); this.list.splice(i, 1); }
        }
        for (const g of this.groups.values()) {
            if (!g.ambient) continue;
            if (this.remaining(g.id) === 0 && !this.list.some(e => e.groupId === g.id)) {
                g.respawnTimer += dt;
                const far = Math.hypot(g.center.x - p.pos.x, g.center.z - p.pos.z) > 140;
                if (g.respawnTimer > 90 && far) { g.respawnTimer = 0; this._spawnMembers(g); }
            }
        }
    }

    /** Motorcycle impacts. */
    bikeImpact(pos, dir, speed) {
        for (const e of this.list) {
            if (!e.alive || e.state === 'down') continue;
            const d = Math.hypot(e.pos.x - pos.x, e.pos.z - pos.z);
            if (d < 1.8 && Math.abs(e.pos.y - pos.y) < 1.5) {
                e.knockdown(dir, Math.min(18, speed * 0.6), speed > 25 ? 3 : 2);
                this.game.fx.spark(new Vec3(e.pos.x, e.pos.y + 1, e.pos.z), 14, 9);
                this.game.camera.shake(0.3);
            }
        }
    }
}

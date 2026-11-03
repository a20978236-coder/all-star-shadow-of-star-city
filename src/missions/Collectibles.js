import * as pc from 'playcanvas';
import { makeMaterial } from '../world/Materials.js';
import { canvasTexture, makeStarCanvas } from '../world/Textures.js';

/** Floating Star Shards on rooftops around the city. */
export class Collectibles {
    constructor(game, roofs) {
        this.game = game;
        this.items = [];
        this.collected = 0;
        const tex = canvasTexture(game.app.graphicsDevice, makeStarCanvas('#ffe14a', true), { repeat: false, name: 'shard' });
        const mat = makeMaterial({ name: 'shard', diffuse: [0, 0, 0], emissiveMap: tex, emissive: [1, 1, 1], emissiveIntensity: 7, opacityMap: tex, blend: pc.BLEND_ADDITIVE, twoSided: true });
        for (const r of roofs) {
            const e = new pc.Entity('StarShard');
            for (const ry of [0, 90]) {
                const q = new pc.Entity();
                q.addComponent('render', { type: 'plane', material: mat, castShadows: false, receiveShadows: false });
                q.setLocalScale(1.1, 1, 1.1);
                q.setLocalEulerAngles(90, ry, 0);
                e.addChild(q);
            }
            const pos = new pc.Vec3(r.cx, r.y + 1.3, r.cz);
            e.setPosition(pos);
            game.app.root.addChild(e);
            this.items.push({ e, pos, taken: false, phase: Math.random() * 6 });
        }
        this.total = this.items.length;
    }

    update(dt) {
        const p = this.game.player.pos;
        const t = this.game.time;
        for (const it of this.items) {
            if (it.taken) continue;
            it.e.setPosition(it.pos.x, it.pos.y + Math.sin(t * 2 + it.phase) * 0.25, it.pos.z);
            it.e.setEulerAngles(0, t * 90 + it.phase * 30, 0);
            const dx = p.x - it.pos.x, dy = p.y + 1 - it.pos.y, dz = p.z - it.pos.z;
            if (dx * dx + dy * dy + dz * dz < 2.4 * 2.4) {
                it.taken = true;
                it.e.enabled = false;
                this.collected++;
                this.game.fx.spark(it.pos, 24, 6, 0.12);
                this.game.player.energy = Math.min(100, this.game.player.energy + 25);
                this.game.hud.toast(`STAR SHARD ${this.collected}/${this.total}`);
                this.game.missions.notify('collect');
            }
        }
    }

    /** Nearest uncollected shards (for the minimap). */
    remaining() { return this.items.filter(i => !i.taken); }
}

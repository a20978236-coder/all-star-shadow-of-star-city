import { Vec3 } from '../core/math.js';
import { COMBAT, PLAYER, WORLD, COLORS } from '../config.js';
import { headingFromDir, dirFromHeading } from '../core/MathUtils.js';

const tmp = new Vec3();

/**
 * Free-flow melee combat: lunge strikes that chain into combos, counters
 * against telegraphed attacks, ground takedowns, dodges and the Star Burst
 * special (area knockdown fuelled by the energy meter).
 */
export class CombatSystem {
    constructor(game) {
        this.game = game;
        this.combo = 0;
        this.comboTimer = 0;
        this.bestCombo = 0;
        this.target = null;
        this.phase = null;          // 'lunge' | 'strike'
        this.t = 0;
        this.attackT = 0;
        this.attackSide = 0;
        this.hitDone = false;
        this.buffered = false;
        this.counterCooldown = 0;
    }

    get player() { return this.game.player; }

    /** Called every frame from the game loop. */
    update(dt, input) {
        const p = this.player;
        this.counterCooldown = Math.max(0, this.counterCooldown - dt);
        if (this.combo > 0) {
            this.comboTimer -= dt;
            if (this.comboTimer <= 0) this.endCombo();
        }
        if (p.onBike) return;
        const free = p.state === 'ground' || p.state === 'air' || p.state === 'glide';
        if (input.pressed('counter') && (free || p.state === 'attack')) this.tryCounter();
        if (input.pressed('special') && (free || p.state === 'attack')) this.trySpecial();
        if (input.pressed('attack')) {
            if (p.state === 'attack') this.buffered = true;
            else if (free || p.state === 'swing') this.tryAttack(input);
        }
    }

    _pickTarget(input) {
        const p = this.player;
        const dir = p.moveDir(input, tmp);
        if (dir.length() < 0.2) {
            const yaw = this.game.camera.yaw * Math.PI / 180;
            dir.set(-Math.sin(yaw), 0, -Math.cos(yaw));
        }
        dir.normalize();
        let best = null, bestScore = Infinity;
        for (const e of this.game.enemies.list) {
            if (!e.alive) continue;
            const dx = e.pos.x - p.pos.x, dz = e.pos.z - p.pos.z, dy = e.pos.y - p.pos.y;
            const d = Math.hypot(dx, dz);
            if (d > COMBAT.targetRange || Math.abs(dy) > 3) continue;
            const facing = d > 0.01 ? (dx * dir.x + dz * dir.z) / d : 1;
            const score = d * (1.6 - facing) + (e.state === 'down' ? 1.5 : 0);
            if (score < bestScore) { bestScore = score; best = e; }
        }
        return best;
    }

    tryAttack(input) {
        const p = this.player;
        if (p.state === 'swing') { p.grapple.releaseSwing(); }
        const target = this._pickTarget(input);
        this.target = target;
        this.phase = target ? 'lunge' : 'strike';
        this.t = 0;
        this.hitDone = false;
        this.buffered = false;
        this.attackSide = (this.attackSide + 1) % 4;
        if (!target && this.combo > 0) this.endCombo();      // whiffing breaks the flow
        p.setState('attack');
    }

    /** Player motion while attacking (called by Player.update). */
    updatePlayerMotion(dt) {
        const p = this.player;
        const b = p.body;
        this.t += dt;
        const tg = this.target;
        b.vel.y += WORLD.gravity * dt;
        if (p.state === 'counter') {
            b.vel.x = b.vel.z = 0;
            if (p.stateTime > 0.38) p.setState(b.grounded ? 'ground' : 'air');
        } else if (this.phase === 'lunge') {
            if (!tg || !tg.alive) { this.phase = 'strike'; this.t = 0; return; }
            tmp.set(tg.pos.x - b.pos.x, 0, tg.pos.z - b.pos.z);
            const d = tmp.length();
            p.heading = headingFromDir(tmp.x, tmp.z);
            const reach = COMBAT.strikeRange + (tg.radius || 0.4);
            if (d <= reach || this.t > 0.5) { this.phase = 'strike'; this.t = 0; b.vel.x = b.vel.z = 0; }
            else {
                tmp.mulScalar(1 / d);
                const sp = Math.min(COMBAT.lungeSpeed, (d - reach) / dt);
                b.vel.x = tmp.x * sp; b.vel.z = tmp.z * sp;
            }
            this.attackT = 0;
        } else {
            b.vel.x *= 0.6; b.vel.z *= 0.6;
            this.attackT = this.t / COMBAT.strikeDuration;
            if (!this.hitDone && this.t > COMBAT.strikeDuration * 0.4) {
                this.hitDone = true;
                if (tg && tg.alive) {
                    const d = Math.hypot(tg.pos.x - b.pos.x, tg.pos.z - b.pos.z);
                    if (d < COMBAT.strikeRange + 1.2) this._landHit(tg);
                }
            }
            if (this.t >= COMBAT.strikeDuration) {
                if (this.buffered) { this.tryAttack(this.game.input); return; }
                p.setState(b.grounded ? 'ground' : 'air');
            }
        }
        this.game.physics.move(b, b.vel.x * dt, b.vel.y * dt, b.vel.z * dt, PLAYER.stepHeight);
    }

    _landHit(enemy) {
        const p = this.player;
        const finisher = enemy.state === 'down';
        this.combo++;
        this.comboTimer = COMBAT.comboWindow;
        this.bestCombo = Math.max(this.bestCombo, this.combo);
        const heavy = finisher || this.combo % 5 === 0;
        const dir = dirFromHeading(p.heading, new Vec3());
        enemy.takeHit({ damage: finisher ? 99 : 1, dir, force: heavy ? 12 : 5, finisher });
        p.energy = Math.min(PLAYER.maxEnergy, p.energy + COMBAT.energyPerHit * (1 + this.combo * 0.05));
        const hitPos = new Vec3(enemy.pos.x, enemy.pos.y + 1.3, enemy.pos.z);
        this.game.fx.spark(hitPos, heavy ? 18 : 10, heavy ? 10 : 7);
        this.game.camera.shake(heavy ? 0.35 : 0.18);
        this.game.hitStop(heavy ? 0.09 : 0.045);
        this.game.hud.combo(this.combo, finisher ? 'TAKEDOWN' : (heavy ? 'CRITICAL' : null));
    }

    tryCounter() {
        if (this.counterCooldown > 0) return;
        const p = this.player;
        const threats = this.game.enemies.list.filter(e => e.alive && e.isTelegraphing &&
            Math.hypot(e.pos.x - p.pos.x, e.pos.z - p.pos.z) < COMBAT.counterRange);
        if (!threats.length) { this.counterCooldown = 0.45; return; }
        const first = threats[0];
        tmp.set(first.pos.x - p.pos.x, 0, first.pos.z - p.pos.z);
        p.heading = headingFromDir(tmp.x, tmp.z);
        p.grapple.cancel();
        p.setState('counter');
        p.invuln = 0.6;
        const dir = dirFromHeading(p.heading, new Vec3());
        for (const e of threats) {
            e.countered(dir);
            this.combo++;
            this.game.fx.spark(new Vec3(e.pos.x, e.pos.y + 1.4, e.pos.z), 14, 8);
        }
        this.comboTimer = COMBAT.comboWindow;
        this.bestCombo = Math.max(this.bestCombo, this.combo);
        p.energy = Math.min(PLAYER.maxEnergy, p.energy + 12 * threats.length);
        this.game.camera.shake(0.3);
        this.game.hitStop(0.08);
        this.game.hud.combo(this.combo, threats.length > 1 ? `${threats.length}x COUNTER` : 'COUNTER');
        this._counterTime = 0;
    }

    trySpecial() {
        const p = this.player;
        if (p.energy < COMBAT.specialCost) { this.game.hud.hint('Star Burst needs a full energy meter — build it with combos', 1.6); return; }
        p.energy = 0;
        const hits = [];
        for (const e of this.game.enemies.list) {
            if (!e.alive) continue;
            const dx = e.pos.x - p.pos.x, dz = e.pos.z - p.pos.z;
            const d = Math.hypot(dx, dz);
            if (d < COMBAT.specialRadius && Math.abs(e.pos.y - p.pos.y) < 3) hits.push([e, dx / (d || 1), dz / (d || 1)]);
        }
        for (const [e, x, z] of hits) e.knockdown(new Vec3(x, 0, z), 14, 2);
        this.combo += hits.length;
        if (hits.length) { this.comboTimer = COMBAT.comboWindow; this.bestCombo = Math.max(this.bestCombo, this.combo); }
        this.game.fx.shockwave(p.pos, COMBAT.specialRadius, COLORS.neonGreen);
        this.game.fx.spark(new Vec3(p.pos.x, p.pos.y + 1, p.pos.z), 30, 12, 0.14);
        this.game.camera.shake(0.6);
        this.game.hitStop(0.12);
        this.game.hud.combo(this.combo, 'STAR BURST');
        p.invuln = 0.8;
    }

    onPlayerDodge() { /* dodging keeps the combo alive */ this.comboTimer = Math.max(this.comboTimer, 0.6); }

    endCombo() {
        if (this.combo >= 3) this.game.hud.toast(`${this.combo} HIT COMBO`);
        this.combo = 0;
        this.comboTimer = 0;
        this.game.hud.combo(0);
    }

    onPlayerHit() { if (this.combo > 0) this.endCombo(); }
}

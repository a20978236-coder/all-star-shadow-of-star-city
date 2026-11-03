import { Vec3 } from '../core/math.js';
import { createChaosModel } from '../characters/Characters.js';
import { ENEMY, WORLD, COLORS } from '../config.js';
import { headingFromDir, dampAngle, DEG } from '../core/MathUtils.js';
import { neonMaterial } from '../world/Materials.js';

const tmp = new Vec3();
let warnMat = null;

/**
 * Chaos Empire soldier AI:
 * patrol → engage (circle the player) → approach → windup (counter window!) → strike → recover.
 * Reactions: stagger, knockdown, defeated.
 */
export class Enemy {
    constructor(game, variant, pos, groupId) {
        this.game = game;
        this.variant = variant;
        this.groupId = groupId;
        const brute = variant === 'brute';
        this.maxHealth = brute ? 6 : 3;
        this.health = this.maxHealth;
        this.radius = brute ? 0.5 : 0.4;
        this.body = { pos: pos.clone(), vel: new Vec3(), radius: this.radius, height: brute ? 2.2 : 1.8, grounded: false };
        this.home = pos.clone();
        this.heading = Math.random() * Math.PI * 2;
        this.state = 'patrol';
        this.stateTime = 0;
        this.patrolTarget = null;
        this.orbitDir = Math.random() < 0.5 ? -1 : 1;
        this.knock = new Vec3();
        this.flash = 0;
        this.removeTimer = 0;

        this.model = createChaosModel(game.gfx, variant);
        game.gfx.add(this.model.root);
        if (!warnMat) warnMat = neonMaterial(COLORS.neonCyan, 9);
        this.warn = game.gfx.mesh('box', warnMat, { castShadows: false, receiveShadows: false, name: 'counterWarning' });
        this.warn.setLocalScale(0.3, 0.3, 0.3);
        this.warn.enabled = false;
        game.gfx.add(this.warn);
        this.anim = { state: 'idle', speed: 0 };
    }

    get pos() { return this.body.pos; }
    get alive() { return this.state !== 'defeated'; }
    get isTelegraphing() { return this.state === 'windup'; }
    get isAttacking() { return this.state === 'approach' || this.state === 'windup' || this.state === 'strike'; }
    get engaged() { return this.alive && this.state !== 'patrol'; }

    setState(s) { this.state = s; this.stateTime = 0; }

    update(dt) {
        const p = this.game.player;
        this.stateTime += dt;
        const b = this.body;
        const dx = p.pos.x - b.pos.x, dz = p.pos.z - b.pos.z, dy = p.pos.y - b.pos.y;
        const dist = Math.hypot(dx, dz);
        let wantX = 0, wantZ = 0, speed = 0;
        let face = null;

        switch (this.state) {
            case 'patrol': {
                if ((dist < ENEMY.awareRange && Math.abs(dy) < 8 && !p.onBike) || this.game.enemies.isAlerted(this.groupId)) {
                    this.game.enemies.alert(this.groupId);
                    this.setState('engage');
                    break;
                }
                if (!this.patrolTarget || this.stateTime > 6) {
                    const a = Math.random() * Math.PI * 2, r = Math.random() * 5;
                    this.patrolTarget = new Vec3(this.home.x + Math.cos(a) * r, 0, this.home.z + Math.sin(a) * r);
                    this.stateTime = 0;
                }
                const tx = this.patrolTarget.x - b.pos.x, tz = this.patrolTarget.z - b.pos.z;
                const td = Math.hypot(tx, tz);
                if (td > 0.6) { wantX = tx / td; wantZ = tz / td; speed = ENEMY.walkSpeed * 0.6; }
                break;
            }
            case 'engage': {
                if (dist > 48 || Math.abs(dy) > 14) { this.setState('patrol'); break; }
                face = [dx, dz];
                const nx = dx / (dist || 1), nz = dz / (dist || 1);
                const radial = dist - ENEMY.circleDistance;
                wantX = nx * radial * 0.6 + -nz * this.orbitDir * 0.7;
                wantZ = nz * radial * 0.6 + nx * this.orbitDir * 0.7;
                const l = Math.hypot(wantX, wantZ);
                if (l > 0.01) { wantX /= l; wantZ /= l; }
                speed = Math.abs(radial) > 4 ? ENEMY.runSpeed : ENEMY.walkSpeed * Math.min(1, l);
                if (Math.random() < dt * 0.3) this.orbitDir *= -1;
                break;
            }
            case 'approach': {
                face = [dx, dz];
                if (dist < ENEMY.strikeRange - 0.3) { this.setState('windup'); break; }
                wantX = dx / dist; wantZ = dz / dist; speed = ENEMY.runSpeed;
                if (this.stateTime > 3 || p.onBike) this.setState('engage');
                break;
            }
            case 'windup': {
                face = [dx, dz];
                if (this.stateTime > ENEMY.windupTime * (this.variant === 'brute' ? 1.3 : 1)) this.setState('strike');
                break;
            }
            case 'strike': {
                const f = Math.sin(this.heading);
                wantX = -f; wantZ = -Math.cos(this.heading); speed = 3;
                if (!this._struck && this.stateTime > 0.08) {
                    this._struck = true;
                    if (dist < ENEMY.strikeRange + 0.3 && Math.abs(dy) < 2) {
                        p.receiveHit(ENEMY.damage * (this.variant === 'brute' ? 1.6 : 1), b.pos);
                    }
                }
                if (this.stateTime > 0.25) { this._struck = false; this.setState('recover'); }
                break;
            }
            case 'recover': {
                face = [dx, dz];
                if (this.stateTime > 0.7) this.setState('engage');
                break;
            }
            case 'stagger': {
                if (this.stateTime > 0.55) this.setState('engage');
                break;
            }
            case 'down': {
                if (this.stateTime > 2.6) this.setState('engage');
                break;
            }
            case 'defeated': {
                this.removeTimer += dt;
                break;
            }
            default: break;
        }

        // movement
        const accel = 20 * dt;
        b.vel.x += (wantX * speed - b.vel.x) * Math.min(1, accel);
        b.vel.z += (wantZ * speed - b.vel.z) * Math.min(1, accel);
        b.vel.x += this.knock.x; b.vel.z += this.knock.z;
        this.knock.mulScalar(Math.exp(-7 * dt));
        b.vel.y += WORLD.gravity * dt;
        // don't walk off rooftops while patrolling
        if (this.state === 'patrol' && b.grounded) {
            const ahead = this.game.physics.heightAt(b.pos.x + b.vel.x * 0.5, b.pos.z + b.vel.z * 0.5, b.pos.y + 0.7);
            if (ahead < b.pos.y - 1) { b.vel.x = 0; b.vel.z = 0; this.patrolTarget = null; }
        }
        this.game.physics.move(b, b.vel.x * dt, b.vel.y * dt, b.vel.z * dt, 0.6);
        b.vel.x -= this.knock.x; b.vel.z -= this.knock.z;
        if (b.pos.y < -5) { b.pos.copy(this.home); }

        if (face) this.heading = dampAngle(this.heading, headingFromDir(face[0], face[1]), 10, dt);
        else if (Math.hypot(b.vel.x, b.vel.z) > 0.5) this.heading = dampAngle(this.heading, headingFromDir(b.vel.x, b.vel.z), 8, dt);

        this._updateVisual(dt);
    }

    takeHit({ damage, dir, force, finisher }) {
        if (!this.alive) return;
        this.health -= damage;
        this.flash = 0.15;
        this.knock.set(dir.x * force, 0, dir.z * force);
        this.heading = headingFromDir(-dir.x, -dir.z);
        if (this.health <= 0) this.defeat();
        else if (this.variant === 'brute' && !finisher && this.health > 2 && this.state !== 'windup') {
            // brutes shrug off light hits
            this.knock.mulScalar(0.3);
        } else this.setState('stagger');
        this.game.enemies.alert(this.groupId);
    }

    countered(dir) {
        this.health -= 1;
        this.flash = 0.2;
        this.knock.set(dir.x * 9, 0, dir.z * 9);
        if (this.health <= 0) this.defeat(); else this.setState('down');
    }

    knockdown(dir, force, damage = 1) {
        if (!this.alive) return;
        this.health -= damage;
        this.knock.set(dir.x * force, 0, dir.z * force);
        this.body.vel.y = 6;
        this.flash = 0.2;
        if (this.health <= 0) this.defeat(); else this.setState('down');
        this.game.enemies.alert(this.groupId);
    }

    defeat() {
        this.setState('defeated');
        this.health = 0;
        this.game.onEnemyDefeated(this);
    }

    _updateVisual(dt) {
        const b = this.body;
        const hs = Math.hypot(b.vel.x, b.vel.z);
        const a = this.anim;
        a.speed = hs;
        a.combatReady = this.state !== 'patrol';
        switch (this.state) {
            case 'windup': a.state = 'windup'; break;
            case 'strike': a.state = 'attack'; a.attackT = Math.min(1, this.stateTime / 0.25); a.attackSide = 0; break;
            case 'stagger': a.state = 'hit'; break;
            case 'down': case 'defeated': a.state = 'down'; break;
            default: a.state = hs > 0.5 ? 'run' : 'idle';
        }
        this.model.root.setPosition(b.pos);
        this.model.root.setEulerAngles(0, this.heading * DEG, 0);
        this.model.pose(dt, a);

        if (this.flash > 0) {
            this.flash -= dt;
            const m = this.model.suitMaterial;
            this.game.gfx.setEmissive(m, this.flash > 0 ? [1, 1, 1] : [0, 0, 0], this.flash > 0 ? 1.5 : 1);
        }
        const tele = this.state === 'windup';
        this.warn.enabled = tele;
        if (tele) {
            const s = 0.25 + Math.sin(this.stateTime * 30) * 0.06;
            this.warn.setLocalScale(s, s * 1.8, s);
            this.warn.setPosition(b.pos.x, b.pos.y + b.height + 0.55, b.pos.z);
            this.warn.setEulerAngles(0, this.stateTime * 400, 45);
        }
    }

    setVisible(v) { this.model.root.enabled = v; }

    destroy() {
        this.model.root.destroy();
        this.warn.destroy();
    }
}

import { Vec3 } from '../core/math.js';
import { createAllStarModel, loadAllStarModel } from '../characters/Characters.js';
import { PLAYER, WORLD, COMBAT } from '../config.js';
import { clamp, damp, dampAngle, headingFromDir, dirFromHeading, DEG } from '../core/MathUtils.js';
import { GrappleSystem } from './GrappleSystem.js';

const tmpV = new Vec3();
const tmpV2 = new Vec3();

/**
 * All-Star character controller: walk / run / sprint, jump, cape glide, ledge
 * mantle, dodge, stagger, and hand-off to grapple, combat and the motorcycle.
 */
export class Player {
    constructor(game, spawn) {
        this.game = game;
        this.gfx = game.gfx;
        this.physics = game.physics;
        // start with the built-in hero, then swap to the 3D model once it has loaded
        this.model = createAllStarModel(this.gfx);
        this.gfx.add(this.model.root);
        const classic = typeof location !== 'undefined' && /[?&]hero=classic\b/.test(location.search);
        if (!classic && this.gfx.loadModel) {
            loadAllStarModel(this.gfx)
                .then(m => this.useModel(m))
                .catch(err => console.warn('[hero] 3D model unavailable, keeping the built-in hero:', err));
        }

        this.body = { pos: spawn.clone(), vel: new Vec3(), radius: PLAYER.radius, height: PLAYER.height, grounded: false };
        this.heading = 0;
        this.state = 'ground';
        this.stateTime = 0;
        this.health = PLAYER.maxHealth;
        this.energy = 40;
        this.invuln = 0;
        this.lastHitTime = -99;
        this.coyote = 0;
        this.glideSpeed = 0;
        this.mantle = null;
        this.dodgeDir = new Vec3();
        this.knock = new Vec3();
        this.checkpoint = spawn.clone();
        this.anim = { state: 'idle', speed: 0 };
        this.grapple = new GrappleSystem(game, this);

        // Soft cinematic key light that follows the camera so the dark suit reads at night.
        this.keyLight = this.gfx.pointLight({ name: 'HeroKeyLight', color: [0.65, 0.78, 1.0], intensity: 1.1, range: 12, falloff: 'linear' });
        this.gfx.add(this.keyLight);
    }

    /** Replace the visual model (keeps all gameplay state). */
    useModel(model) {
        const old = this.model;
        this.gfx.add(model.root);
        this.model = model;
        old.setVisible(false);
        old.root.destroy();
        if (old.cloth) old.cloth.entity.destroy();
        this.modelSource = 'glb';
    }

    get pos() { return this.body.pos; }
    get onBike() { return this.state === 'bike'; }
    get busy() { return ['attack', 'counter', 'zip', 'mantle', 'hit', 'bike'].includes(this.state); }

    setState(s) {
        if (this.state === s) return;
        this.state = s;
        this.stateTime = 0;
    }

    /** Camera-relative desired move direction (XZ) scaled by stick magnitude. */
    moveDir(input, out = new Vec3()) {
        const yaw = this.game.camera.yaw * Math.PI / 180;
        const fx = -Math.sin(yaw), fz = -Math.cos(yaw);
        const rx = Math.cos(yaw), rz = -Math.sin(yaw);
        out.set(fx * input.move.y + rx * input.move.x, 0, fz * input.move.y + rz * input.move.x);
        return out;
    }

    update(dt, input) {
        this.stateTime += dt;
        this.invuln = Math.max(0, this.invuln - dt);
        const now = this.game.time;
        if (now - this.lastHitTime > 5 && this.health < PLAYER.maxHealth) {
            this.health = Math.min(PLAYER.maxHealth, this.health + PLAYER.healthRegen * dt);
        }

        // Grapple / swing input is available in most traversal states.
        if (!this.busy || this.state === 'zip') this.grapple.handleInput(input);
        else this.grapple.zipTarget = null;

        switch (this.state) {
            case 'ground': this._ground(dt, input); break;
            case 'air': this._air(dt, input); break;
            case 'glide': this._glide(dt, input); break;
            case 'dodge': this._dodge(dt); break;
            case 'hit': this._hit(dt); break;
            case 'mantle': this._mantle(dt); break;
            case 'swing': this.grapple.updateSwing(dt, input); break;
            case 'zip': this.grapple.updateZip(dt); break;
            case 'attack': case 'counter': this.game.combat.updatePlayerMotion(dt); break;
            case 'bike': break; // driven by Motorcycle
            default: break;
        }

        // Safety: fell out of the world
        if (this.body.pos.y < -8) this.respawn();
        this._updateModel(dt);
    }

    // ---------------------------------------------------------------- states
    _ground(dt, input) {
        const b = this.body;
        const dir = this.moveDir(input, tmpV);
        const mag = Math.min(1, dir.length());
        const sprint = input.held('sprint');
        const target = mag < 0.05 ? 0 : (sprint ? PLAYER.sprintSpeed : (mag < 0.55 ? PLAYER.walkSpeed : PLAYER.runSpeed)) * mag;
        if (mag > 0.05) {
            dir.normalize();
            this.heading = dampAngle(this.heading, headingFromDir(dir.x, dir.z), 14, dt);
        }
        // accelerate horizontal velocity towards the facing direction (tight, responsive turns)
        const face = dirFromHeading(this.heading, tmpV2);
        const want = mag > 0.05 ? dir : face;
        const tx = want.x * target, tz = want.z * target;
        const a = PLAYER.groundAccel * dt;
        b.vel.x += clamp(tx - b.vel.x, -a, a);
        b.vel.z += clamp(tz - b.vel.z, -a, a);
        b.vel.y = -2;

        if (input.pressed('jump')) {
            b.vel.y = PLAYER.jumpSpeed;
            this.setState('air');
            this._move(dt, false);
            return;
        }
        if (input.pressed('dodge')) { this.startDodge(input); return; }

        const info = this._move(dt, true);
        if (!b.grounded) {
            this.coyote += dt;
            if (this.coyote > 0.12) { this.setState('air'); b.vel.y = 0; }
        } else this.coyote = 0;
        if (info.hitWall && mag > 0.3) this._tryMantle(info, dir, 1.3);
    }

    _air(dt, input) {
        const b = this.body;
        const dir = this.moveDir(input, tmpV);
        b.vel.y += WORLD.gravity * dt;
        b.vel.y = Math.max(b.vel.y, -55);
        const a = PLAYER.airAccel * dt;
        const hs = Math.hypot(b.vel.x, b.vel.z);
        const maxH = Math.max(PLAYER.runSpeed, hs);
        b.vel.x += dir.x * a; b.vel.z += dir.z * a;
        const nhs = Math.hypot(b.vel.x, b.vel.z);
        if (nhs > maxH) { b.vel.x *= maxH / nhs; b.vel.z *= maxH / nhs; }
        if (nhs > 1) this.heading = dampAngle(this.heading, headingFromDir(b.vel.x, b.vel.z), 6, dt);

        const heightAbove = b.pos.y - this.physics.heightAt(b.pos.x, b.pos.z, b.pos.y + 0.1);
        const canGlide = heightAbove > 2.2 && this.stateTime > 0.15;
        if (canGlide && (input.pressed('jump') || (input.held('jump') && b.vel.y < -7))) { this.startGlide(); return; }
        if (input.pressed('dodge') && this.stateTime > 0.1) { this.startDodge(input); return; }

        const info = this._move(dt, false);
        if (b.grounded) {
            this.setState('ground');
            this.game.camera.shake(Math.min(0.5, -this._lastVy / 80));
            this.landT = 1;
            this.landImpact = clamp(-this._lastVy / 22, 0.25, 1);
            return;
        }
        if (info.hitWall) this._tryMantle(info, dir, 2.4);
    }

    startGlide() {
        const b = this.body;
        this.glideSpeed = Math.max(PLAYER.glide.minSpeed, Math.hypot(b.vel.x, b.vel.z));
        this.glideLift = 0;
        if (Math.hypot(b.vel.x, b.vel.z) > 2) this.heading = headingFromDir(b.vel.x, b.vel.z);
        this.setState('glide');
        this.game.hud.hint('Gliding: push forward to dive, pull back to slow, Jump to drop', 2.5);
    }

    _glide(dt, input) {
        const g = PLAYER.glide;
        const b = this.body;
        // steer: stick X turns, with a little camera-relative assist
        this.heading -= input.move.x * g.turnRate * dt;
        let sink = g.sinkRate;
        if (input.move.y > 0.3) {             // dive
            this.glideSpeed = Math.min(g.maxSpeed, this.glideSpeed + 16 * dt);
            sink = g.diveSinkRate;
            this.glideLift = Math.min(12, this.glideLift + 10 * dt);
        } else if (input.move.y < -0.3) {     // flare / slow
            this.glideSpeed = Math.max(g.minSpeed * 0.8, this.glideSpeed - 10 * dt);
            sink = -2.2;
        } else {
            this.glideSpeed = damp(this.glideSpeed, g.cruiseSpeed, 0.6, dt);
        }
        // dive-bomb pull-up: converts built-up energy into lift
        if (input.move.y <= 0.3 && this.glideLift > 0) {
            sink += this.glideLift * 1.4;
            this.glideLift = Math.max(0, this.glideLift - 9 * dt);
        }
        const d = dirFromHeading(this.heading, tmpV);
        b.vel.set(d.x * this.glideSpeed, damp(b.vel.y, sink, 4, dt), d.z * this.glideSpeed);

        if (input.pressed('jump')) { this.setState('air'); return; }
        const info = this._move(dt, false);
        if (b.grounded) { this.setState('ground'); return; }
        if (info.hitWall) {
            if (!this._tryMantle(info, d, 2.6)) { this.setState('air'); b.vel.x *= 0.2; b.vel.z *= 0.2; }
        }
    }

    startDodge(input) {
        const dir = this.moveDir(input, this.dodgeDir);
        if (dir.length() < 0.1) dirFromHeading(this.heading + Math.PI, dir); // backflip-style evade
        dir.normalize();
        this.setState('dodge');
        this.invuln = COMBAT.dodgeTime + 0.1;
        this.game.combat.onPlayerDodge();
    }

    _dodge(dt) {
        const b = this.body;
        const k = 1 - this.stateTime / COMBAT.dodgeTime;
        b.vel.x = this.dodgeDir.x * COMBAT.dodgeSpeed * Math.max(0.2, k);
        b.vel.z = this.dodgeDir.z * COMBAT.dodgeSpeed * Math.max(0.2, k);
        b.vel.y += WORLD.gravity * dt;
        this._move(dt, true);
        if (this.stateTime >= COMBAT.dodgeTime) this.setState(b.grounded ? 'ground' : 'air');
    }

    _hit(dt) {
        const b = this.body;
        b.vel.x = this.knock.x; b.vel.z = this.knock.z;
        this.knock.mulScalar(Math.exp(-6 * dt));
        b.vel.y += WORLD.gravity * dt;
        this._move(dt, true);
        if (this.stateTime > 0.45) this.setState(b.grounded ? 'ground' : 'air');
    }

    _tryMantle(info, dir, maxRise) {
        const box = info.wallBox;
        if (!box || box.tag === 'boundary') return false;
        const b = this.body;
        const top = box.max[1];
        const rise = top - b.pos.y;
        if (rise < 0.55 || rise > maxRise) return false;
        // must be pushing into the wall
        const n = info.wallNormal;
        if (dir.x * n.x + dir.z * n.z > -0.3) return false;
        const tx = b.pos.x - n.x * (b.radius * 2 + 0.2), tz = b.pos.z - n.z * (b.radius * 2 + 0.2);
        if (!this.physics._free(tx, top + 0.02, tz, b.radius, b.height, this.physics.query(tx - 2, tz - 2, tx + 2, tz + 2))) return false;
        this.mantle = { from: b.pos.clone(), to: new Vec3(tx, top + 0.02, tz), t: 0, dur: 0.18 + rise * 0.1 };
        this.heading = headingFromDir(-n.x, -n.z);
        this.setState('mantle');
        return true;
    }

    _mantle(dt) {
        const m = this.mantle;
        m.t += dt / m.dur;
        const t = Math.min(1, m.t);
        const b = this.body;
        // rise first, then over the edge
        const ty = Math.min(1, t * 1.6), txz = Math.max(0, (t - 0.45) / 0.55);
        b.pos.set(m.from.x + (m.to.x - m.from.x) * txz, m.from.y + (m.to.y - m.from.y) * ty, m.from.z + (m.to.z - m.from.z) * txz);
        b.vel.set(0, 0, 0);
        if (t >= 1) { this.setState('ground'); b.grounded = true; }
    }

    _move(dt, step) {
        const b = this.body;
        this._lastVy = b.vel.y;
        return this.physics.move(b, b.vel.x * dt, b.vel.y * dt, b.vel.z * dt, step ? PLAYER.stepHeight : 0);
    }

    // ---------------------------------------------------------------- damage
    receiveHit(damage, fromPos) {
        if (this.invuln > 0 || this.state === 'dodge' || this.state === 'bike' || this.state === 'counter') return false;
        this.health -= damage;
        this.lastHitTime = this.game.time;
        this.invuln = 0.5;
        const dx = this.pos.x - fromPos.x, dz = this.pos.z - fromPos.z;
        const l = Math.hypot(dx, dz) || 1;
        this.knock.set(dx / l * 7, 0, dz / l * 7);
        this.heading = headingFromDir(-dx, -dz);
        this.grapple.cancel();
        this.setState('hit');
        this.game.onPlayerHit(damage);
        if (this.health <= 0) this.game.onPlayerDefeated();
        return true;
    }

    respawn(pos) {
        const p = pos || this.checkpoint;
        this.grapple.cancel();
        this.body.pos.copy(p);
        this.body.vel.set(0, 0, 0);
        this.health = PLAYER.maxHealth;
        this.invuln = 2;
        this.setState('air');
    }

    // ---------------------------------------------------------------- visuals
    _updateModel(dt) {
        const b = this.body;
        const hs = Math.hypot(b.vel.x, b.vel.z);
        const a = this.anim;
        a.speed = hs;
        a.airVel = b.vel.y;
        a.lean = 0;
        a.combatReady = this.game.enemies.engagedCount > 0;
        this.landT = Math.max(0, (this.landT || 0) - dt * 3.5);
        a.landT = this.landT;
        a.landImpact = this.landImpact || 0;
        a.velocity = this.state === 'bike' ? this.game.bike.body.vel : b.vel;
        switch (this.state) {
            case 'ground': a.state = hs < 0.4 ? 'idle' : hs < PLAYER.walkSpeed + 0.8 ? 'walk' : (hs > PLAYER.runSpeed + 1 ? 'sprint' : 'run'); break;
            case 'air': a.state = 'air'; break;
            case 'glide': a.state = 'glide'; a.lean = clamp(-this.game.input.move.x * 30, -30, 30); break;
            case 'swing': a.state = 'swing'; a.swingPitch = this.grapple.swingPitch; break;
            case 'zip': a.state = 'zip'; break;
            case 'attack': a.state = 'attack'; a.attackT = this.game.combat.attackT; a.attackSide = this.game.combat.attackSide; break;
            case 'counter': a.state = 'counter'; break;
            case 'dodge': a.state = 'dodge'; break;
            case 'hit': a.state = 'hit'; break;
            case 'mantle': a.state = 'mantle'; break;
            case 'bike': a.state = 'ride'; a.speed = Math.abs(this.game.bike.speed); a.lean = 0; break;
            default: a.state = 'idle';
        }
        if (this.state === 'bike') {
            // sit on the Star Cycle (the bike updates first each frame, so this is current)
            const bike = this.game.bike;
            this.model.root.setPosition(b.pos.x, b.pos.y + 0.12, b.pos.z);
            this.model.root.setEulerAngles(0, bike.heading * DEG, bike.lean);
        } else {
            this.model.root.setPosition(b.pos);
            this.model.root.setEulerAngles(0, this.heading * DEG, 0);
        }
        this.model.pose(dt, a);
        const cp = this.game.camera.entity.getPosition();
        this.keyLight.setPosition((cp.x + b.pos.x) * 0.5, Math.max(cp.y, b.pos.y) + 3, (cp.z + b.pos.z) * 0.5);
        // invulnerability flicker after respawn
        this.model.setVisible(!(this.invuln > 1 && Math.floor(this.game.time * 20) % 2 === 0));
    }
}

import * as pc from 'playcanvas';
import { BIKE, WORLD, COLORS } from '../config.js';
import { makeMaterial, neonMaterial } from '../world/Materials.js';
import { canvasTexture, makeStarCanvas } from '../world/Textures.js';
import { clamp, damp, dirFromHeading, DEG } from '../core/MathUtils.js';

const tmp = new pc.Vec3();

/**
 * The Star Cycle: summonable arcade motorcycle with boost, drifting lean,
 * crash bumps, enemy ram knockdowns and an eject-launch into a glide.
 */
export class Motorcycle {
    constructor(game) {
        this.game = game;
        this.app = game.app;
        this.body = { pos: new pc.Vec3(0, -100, 0), vel: new pc.Vec3(), radius: BIKE.radius, height: 1.3, grounded: false };
        this.heading = 0;
        this.speed = 0;
        this.steer = 0;
        this.lean = 0;
        this.boost = 100;
        this.rider = null;
        this.active = false;
        this.wheelSpin = 0;
        this.summonFx = 0;
        this._buildModel();
        this.root.enabled = false;
    }

    _buildModel() {
        const app = this.app;
        const black = makeMaterial({ name: 'bikeBody', diffuse: [0.02, 0.022, 0.026], gloss: 0.9, metalness: 0.65 });
        const dark = makeMaterial({ name: 'bikeFrame', diffuse: [0.07, 0.075, 0.08], gloss: 0.7, metalness: 0.9 });
        const tire = makeMaterial({ name: 'tire', diffuse: [0.015, 0.015, 0.015], gloss: 0.3 });
        const green = neonMaterial(COLORS.neonGreen, 5);
        const cyan = neonMaterial(COLORS.neonCyan, 6);
        const red = neonMaterial(COLORS.chaosRed, 5);
        const starTex = canvasTexture(app.graphicsDevice, makeStarCanvas('#b8ff2c', false), { repeat: false, name: 'bikeStar' });
        const starMat = makeMaterial({ name: 'bikeStar', diffuse: [0, 0, 0], emissiveMap: starTex, emissive: [1, 1, 1], emissiveIntensity: 4, opacityMap: starTex, blend: pc.BLEND_ADDITIVE, twoSided: true });

        this.root = new pc.Entity('StarCycle');
        this.leanPivot = new pc.Entity('lean');
        this.root.addChild(this.leanPivot);
        const part = (type, mat, x, y, z, sx, sy, sz, rx = 0, ry = 0, rz = 0, parent = this.leanPivot) => {
            const e = new pc.Entity();
            e.addComponent('render', { type, material: mat, castShadows: true });
            e.setLocalPosition(x, y, z); e.setLocalScale(sx, sy, sz); e.setLocalEulerAngles(rx, ry, rz);
            parent.addChild(e);
            return e;
        };
        // body (faces -Z)
        part('box', black, 0, 0.75, -0.1, 0.42, 0.42, 1.5, -6);              // main tank/body
        part('box', black, 0, 0.92, -0.9, 0.48, 0.38, 0.7, 25);              // front fairing
        part('box', dark, 0, 1.12, -1.05, 0.4, 0.06, 0.4, 40);               // windshield
        part('box', black, 0, 0.95, 0.55, 0.36, 0.14, 0.75, 4);              // seat
        part('box', black, 0, 0.95, 1.05, 0.3, 0.2, 0.5, -12);               // tail
        part('box', dark, 0, 0.5, 0.15, 0.3, 0.32, 0.8);                    // engine
        part('cylinder', green, 0, 0.5, 0.15, 0.36, 0.34, 0.36, 0, 0, 90);   // engine glow ring
        part('box', dark, 0.18, 0.55, -1.05, 0.06, 0.7, 0.08, -25);          // forks
        part('box', dark, -0.18, 0.55, -1.05, 0.06, 0.7, 0.08, -25);
        part('box', dark, 0, 0.55, 0.85, 0.1, 0.1, 0.9, 10);                 // swingarm
        part('box', dark, 0, 1.18, -0.75, 0.75, 0.05, 0.05);                 // handlebar
        part('box', cyan, 0.13, 0.98, -1.27, 0.14, 0.05, 0.04, 25);          // headlights
        part('box', cyan, -0.13, 0.98, -1.27, 0.14, 0.05, 0.04, 25);
        part('box', red, 0, 1.0, 1.31, 0.22, 0.05, 0.03);                    // tail light
        part('box', green, 0.215, 0.78, -0.3, 0.01, 0.05, 1.2, -6);          // side stripes
        part('box', green, -0.215, 0.78, -0.3, 0.01, 0.05, 1.2, -6);
        const s1 = part('plane', starMat, 0.216, 0.78, -0.05, 0.32, 1, 0.32, 0, 0, -90);
        const s2 = part('plane', starMat, -0.216, 0.78, -0.05, 0.32, 1, 0.32, 0, 0, 90);
        s1.render.castShadows = s2.render.castShadows = false;
        // wheels: pivot spins around X, child cylinder lies along X
        const wheel = z => {
            const pivot = new pc.Entity('wheel');
            pivot.setLocalPosition(0, 0.36, z);
            this.leanPivot.addChild(pivot);
            part('cylinder', tire, 0, 0, 0, 0.72, 0.22, 0.72, 0, 0, 90, pivot);
            part('torus', green, 0, 0, 0, 0.62, 0.62, 0.62, 0, 0, 90, pivot).render.castShadows = false;
            part('box', dark, 0, 0, 0, 0.24, 0.5, 0.05, 0, 0, 0, pivot);       // spoke so the spin is visible
            part('box', dark, 0, 0, 0, 0.24, 0.05, 0.5, 0, 0, 0, pivot);
            return pivot;
        };
        this.frontWheel = wheel(-1.2);
        this.rearWheel = wheel(1.1);

        // headlight
        this.headlight = new pc.Entity('headlight');
        this.headlight.addComponent('light', {
            type: 'spot', color: new pc.Color(0.75, 0.9, 1), intensity: 6, range: 45,
            innerConeAngle: 18, outerConeAngle: 32, castShadows: false, falloffMode: pc.LIGHTFALLOFF_INVERSESQUARED
        });
        this.headlight.setLocalPosition(0, 1.0, -1.3);
        this.headlight.setLocalEulerAngles(-82, 0, 0);
        this.leanPivot.addChild(this.headlight);
        this.app.root.addChild(this.root);
    }

    get pos() { return this.body.pos; }
    get riding() { return !!this.rider; }

    /** Place the bike near the player (only from street level). */
    summon(player) {
        const p = player.pos;
        if (p.y > 3 || !player.body.grounded) { this.game.hud.hint('Summon the Star Cycle from street level', 2); return false; }
        const behind = dirFromHeading(player.heading + Math.PI, tmp);
        const phys = this.game.physics;
        let placed = false;
        for (const dist of [7, 5, 3.5, 9]) {
            const x = p.x + behind.x * dist, z = p.z + behind.z * dist;
            const y = phys.heightAt(x, z, 2);
            if (phys._free(x, y + 0.05, z, BIKE.radius, 1.3, phys.query(x - 3, z - 3, x + 3, z + 3))) {
                this.body.pos.set(x, y + 0.05, z); placed = true; break;
            }
        }
        if (!placed) this.body.pos.set(p.x, p.y + 0.05, p.z);
        this.heading = player.heading;
        this.speed = 0;
        this.active = true;
        this.root.enabled = true;
        this.summonFx = 1;
        this.game.fx.spark(new pc.Vec3(this.body.pos.x, this.body.pos.y + 0.6, this.body.pos.z), 24, 6, 0.12);
        this.game.hud.toast('STAR CYCLE ARRIVED');
        return true;
    }

    canMount(player) {
        return this.active && !this.rider && player.pos.distance(this.body.pos) < 3.2 && !player.busy;
    }

    mount(player) {
        this.rider = player;
        player.grapple.cancel();
        player.setState('bike');
        player.body.vel.set(0, 0, 0);
        this.game.hud.hint('W/S throttle & brake · A/D steer · Shift boost · Space eject · F dismount', 4);
    }

    dismount(eject = false) {
        const p = this.rider;
        if (!p) return;
        this.rider = null;
        const right = new pc.Vec3(Math.cos(this.heading), 0, -Math.sin(this.heading));
        if (eject) {
            const f = dirFromHeading(this.heading, tmp);
            p.body.pos.set(this.body.pos.x, this.body.pos.y + 1.6, this.body.pos.z);
            p.body.vel.set(f.x * Math.max(8, this.speed * 0.8), 17, f.z * Math.max(8, this.speed * 0.8));
            p.heading = this.heading;
            p.setState('air');
            this.game.camera.shake(0.25);
            this.game.hud.hint('Hold Jump to glide!', 2);
        } else {
            p.body.pos.set(this.body.pos.x + right.x * 1.2, this.body.pos.y + 0.1, this.body.pos.z + right.z * 1.2);
            p.body.vel.set(0, 0, 0);
            p.heading = this.heading;
            p.setState('air');
            this.speed *= 0.3;
        }
    }

    update(dt, input) {
        if (!this.active) return;
        const b = this.body;
        const riding = !!this.rider;
        let throttle = riding ? input.move.y : 0;
        const steerIn = riding ? input.move.x : 0;
        const boosting = riding && input.held('sprint') && this.boost > 0 && throttle > 0;
        if (boosting) this.boost = Math.max(0, this.boost - 28 * dt); else this.boost = Math.min(100, this.boost + 12 * dt);
        const maxSpeed = boosting ? BIKE.boostSpeed : BIKE.maxSpeed;

        if (throttle > 0.05) {
            this.speed += BIKE.accel * throttle * (boosting ? 1.8 : 1) * dt;
            if (this.speed > maxSpeed) this.speed = damp(this.speed, maxSpeed, 2, dt);
        } else if (throttle < -0.05) {
            if (this.speed > 0.5) this.speed -= BIKE.brake * -throttle * dt;
            else this.speed = Math.max(-BIKE.reverseSpeed, this.speed - BIKE.accel * 0.5 * -throttle * dt);
        } else {
            this.speed -= this.speed * BIKE.drag * dt + Math.sign(this.speed) * Math.min(Math.abs(this.speed), 2 * dt);
        }
        if (!riding) this.speed = damp(this.speed, 0, 1.5, dt);

        const speedFactor = clamp(Math.abs(this.speed) / 6, 0, 1);
        const highSpeedDamp = 1 - 0.45 * clamp(Math.abs(this.speed) / BIKE.boostSpeed, 0, 1);
        this.steer = damp(this.steer, steerIn, 8, dt);
        this.heading -= this.steer * BIKE.steerRate * speedFactor * highSpeedDamp * Math.sign(this.speed || 1) * dt;

        const f = dirFromHeading(this.heading, tmp);
        b.vel.x = f.x * this.speed;
        b.vel.z = f.z * this.speed;
        b.vel.y = b.grounded ? -2 : Math.max(-40, b.vel.y + WORLD.gravity * dt);
        const info = this.game.physics.move(b, b.vel.x * dt, b.vel.y * dt, b.vel.z * dt, 0.65);
        if (info.hitWall && Math.abs(this.speed) > 4) {
            const impact = Math.abs(this.speed);
            this.speed *= impact > 18 ? -0.25 : 0.2;
            this.game.camera.shake(Math.min(0.8, impact / 40));
            this.game.fx.spark(new pc.Vec3(b.pos.x + f.x, b.pos.y + 0.7, b.pos.z + f.z), 12, 6);
        }
        if (riding && Math.abs(this.speed) > 7) this.game.enemies.bikeImpact(b.pos, f.clone(), Math.abs(this.speed));
        if (b.pos.y < -5) { b.pos.y = 1; }

        this.lean = damp(this.lean, -this.steer * clamp(Math.abs(this.speed) / 22, 0, 1) * 28, 6, dt);
        this.wheelSpin += this.speed * dt / 0.36;

        // visuals
        this.root.setPosition(b.pos);
        this.root.setEulerAngles(0, this.heading * DEG, 0);
        this.leanPivot.setLocalEulerAngles(boosting ? -2 : 0, 0, this.lean);
        this.frontWheel.setLocalEulerAngles(-this.wheelSpin * DEG, 0, 0);
        this.rearWheel.setLocalEulerAngles(-this.wheelSpin * DEG, 0, 0);
        this.headlight.enabled = true;

        if (riding) {
            const p = this.rider;
            p.body.pos.copy(b.pos);
            p.body.pos.y += 0.0;
            p.heading = this.heading;
            if (input.pressed('jump')) this.dismount(true);
            else if (input.pressed('interact')) this.dismount(false);
        }
        if (boosting && Math.random() < dt * 30) {
            this.game.fx.spark(new pc.Vec3(b.pos.x - f.x * 1.4, b.pos.y + 0.6, b.pos.z - f.z * 1.4), 2, 3, 0.07);
        }
    }
}

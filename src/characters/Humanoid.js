import * as pc from 'playcanvas';
import { damp } from '../core/MathUtils.js';

/**
 * Placeholder humanoid rig built from primitives with procedural animation.
 * Replace with a skinned GLB later: keep the same `pose` API (state, speed, etc.).
 * The model faces -Z.
 */
export class Humanoid {
    constructor(app, opts) {
        this.app = app;
        this.opts = opts;
        const s = opts.scale || 1;
        this.root = new pc.Entity(opts.name || 'Humanoid');
        this.body = new pc.Entity('body');           // tilt/lean pivot at the feet
        this.root.addChild(this.body);
        this.pelvis = this._pivot(this.body, 0, 0.98 * s, 0);
        this.torso = this._pivot(this.pelvis, 0, 0.05 * s, 0);
        this.head = this._pivot(this.torso, 0, 0.66 * s, 0);
        this.armL = this._pivot(this.torso, -0.27 * s, 0.56 * s, 0);
        this.armR = this._pivot(this.torso, 0.27 * s, 0.56 * s, 0);
        this.foreL = this._pivot(this.armL, 0, -0.32 * s, 0);
        this.foreR = this._pivot(this.armR, 0, -0.32 * s, 0);
        this.legL = this._pivot(this.pelvis, -0.12 * s, 0, 0);
        this.legR = this._pivot(this.pelvis, 0.12 * s, 0, 0);
        this.shinL = this._pivot(this.legL, 0, -0.47 * s, 0);
        this.shinR = this._pivot(this.legR, 0, -0.47 * s, 0);

        const M = opts.materials;
        // torso
        this._part(this.torso, 'box', M.suit, 0, 0.32 * s, 0, 0.46 * s, 0.56 * s, 0.26 * s);
        this._part(this.torso, 'box', M.armor, 0, 0.42 * s, -0.02 * s, 0.5 * s, 0.3 * s, 0.3 * s);
        this._part(this.pelvis, 'box', M.suit, 0, -0.02 * s, 0, 0.36 * s, 0.2 * s, 0.22 * s);
        if (M.belt) this._part(this.pelvis, 'box', M.belt, 0, 0.06 * s, 0, 0.4 * s, 0.07 * s, 0.25 * s);
        // head
        this._part(this.head, 'box', M.skin, 0, 0.02 * s, 0, 0.08 * s, 0.1 * s, 0.08 * s);       // neck
        this._part(this.head, 'sphere', M.skin, 0, 0.16 * s, 0, 0.22 * s, 0.27 * s, 0.24 * s);
        if (M.hair) this._part(this.head, 'sphere', M.hair, 0, 0.23 * s, 0.025 * s, 0.26 * s, 0.22 * s, 0.26 * s);
        if (M.mask) this._part(this.head, 'box', M.mask, 0, 0.17 * s, -0.08 * s, 0.2 * s, 0.09 * s, 0.1 * s);
        if (M.visor) this._part(this.head, 'box', M.visor, 0, 0.18 * s, -0.12 * s, 0.17 * s, 0.035 * s, 0.03 * s);
        // arms
        for (const [arm, fore] of [[this.armL, this.foreL], [this.armR, this.foreR]]) {
            this._part(arm, 'box', M.armor, 0, -0.02 * s, 0, 0.17 * s, 0.17 * s, 0.17 * s);    // shoulder pad
            this._part(arm, 'box', M.suit, 0, -0.16 * s, 0, 0.12 * s, 0.32 * s, 0.12 * s);
            this._part(fore, 'box', M.gauntlet || M.armor, 0, -0.14 * s, 0, 0.12 * s, 0.28 * s, 0.13 * s);
            this._part(fore, 'box', M.glove || M.suit, 0, -0.32 * s, 0, 0.1 * s, 0.1 * s, 0.11 * s);
            if (M.accent) this._part(fore, 'box', M.accent, 0, -0.14 * s, -0.068 * s, 0.03 * s, 0.22 * s, 0.01 * s);
        }
        // legs
        for (const [leg, shin] of [[this.legL, this.shinL], [this.legR, this.shinR]]) {
            this._part(leg, 'box', M.suit, 0, -0.23 * s, 0, 0.16 * s, 0.46 * s, 0.17 * s);
            this._part(shin, 'box', M.armor, 0, -0.22 * s, 0, 0.15 * s, 0.44 * s, 0.16 * s);
            this._part(shin, 'box', M.boot || M.armor, 0, -0.46 * s, -0.04 * s, 0.15 * s, 0.1 * s, 0.26 * s);
            if (M.accent) this._part(shin, 'box', M.accent, 0, -0.2 * s, -0.085 * s, 0.03 * s, 0.3 * s, 0.01 * s);
        }
        // emblem
        if (M.emblem) {
            const e = this._part(this.torso, 'plane', M.emblem, 0, 0.4 * s, -0.172 * s, 0.34 * s, 1, 0.34 * s);
            e.setLocalEulerAngles(-90, 0, 0);
        }
        // cape (two segments for a bit of flutter)
        if (M.cape) {
            this.cape1 = this._pivot(this.torso, 0, 0.6 * s, 0.15 * s);
            this._part(this.cape1, 'box', M.cape, 0, -0.38 * s, 0, 0.62 * s, 0.76 * s, 0.025 * s);
            this.cape2 = this._pivot(this.cape1, 0, -0.76 * s, 0);
            this._part(this.cape2, 'box', M.cape, 0, -0.35 * s, 0, 0.72 * s, 0.7 * s, 0.025 * s);
            if (M.capeTrim) this._part(this.cape2, 'box', M.capeTrim, 0, -0.69 * s, 0.002, 0.74 * s, 0.06 * s, 0.03 * s);
        }

        this.t = 0;
        this.phase = 0;
        this.cur = {};          // smoothed joint angles
        this.lean = 0;
    }

    _pivot(parent, x, y, z) {
        const e = new pc.Entity();
        e.setLocalPosition(x, y, z);
        parent.addChild(e);
        return e;
    }

    _part(parent, type, material, x, y, z, sx, sy, sz) {
        const e = new pc.Entity();
        e.addComponent('render', { type, material, castShadows: true, receiveShadows: true });
        e.setLocalPosition(x, y, z);
        e.setLocalScale(sx, sy, sz);
        parent.addChild(e);
        return e;
    }

    /**
     * Drive the rig. p = { state, speed, airVel, attackT, attackSide, turnRate, swingT }.
     * States: idle, run, sprint, air, glide, swing, zip, attack, counter, dodge, hit, down, ride, mantle, windup.
     */
    pose(dt, p) {
        this.t += dt;
        const speed = p.speed || 0;
        this.phase += dt * (speed > 0.2 ? 4.2 + speed * 0.75 : 0);
        const ph = this.phase;
        const T = {};
        const set = (k, x, y = 0, z = 0) => { T[k] = [x, y, z]; };
        const st = p.state;
        let bodyPitch = 0, bodyY = 0, bodyRoll = 0;
        let cape1 = 8 + Math.min(speed, 20) * 3.2, cape2 = Math.min(speed, 20) * 1.5;
        const breathe = Math.sin(this.t * 2) * 2;

        if (st === 'run' || st === 'sprint' || st === 'walk') {
            const amp = Math.min(1, speed / 9) * (st === 'sprint' ? 1.2 : 1);
            const sw = Math.sin(ph) * 50 * amp;
            set('legL', sw); set('legR', -sw);
            set('shinL', -Math.max(0, Math.sin(ph + 1.2)) * 80 * amp - 5);
            set('shinR', -Math.max(0, Math.sin(ph + 1.2 + Math.PI)) * 80 * amp - 5);
            set('armL', -sw * 0.8, 0, -6); set('armR', sw * 0.8, 0, 6);
            set('foreL', 40 * amp + 10); set('foreR', 40 * amp + 10);
            set('torso', -8 * amp - (st === 'sprint' ? 10 : 0), Math.sin(ph) * 6 * amp);
            set('head', 6 * amp);
            bodyY = Math.abs(Math.sin(ph)) * 0.06 * amp;
            cape1 += Math.sin(ph * 2) * 4;
        } else if (st === 'air') {
            const up = (p.airVel || 0) > 0;
            set('legL', up ? 40 : 20); set('legR', up ? -10 : -20);
            set('shinL', -60); set('shinR', -30);
            set('armL', -30, 0, -40); set('armR', -30, 0, 40);
            set('foreL', 30); set('foreR', 30);
            set('torso', up ? 5 : -5);
            cape1 = 50; cape2 = 20;
        } else if (st === 'glide') {
            set('legL', 5); set('legR', -5); set('shinL', -10); set('shinR', -10);
            set('armL', 0, 0, -85); set('armR', 0, 0, 85);
            set('foreL', 0); set('foreR', 0);
            set('torso', 0); set('head', -55);
            bodyPitch = -75;
            cape1 = 95; cape2 = 5;
        } else if (st === 'swing' || st === 'zip') {
            set('armR', 175, 0, 10); set('foreR', 0);
            set('armL', -20, 0, -35); set('foreL', 40);
            set('legL', 30); set('legR', -15); set('shinL', -70); set('shinR', -40);
            set('torso', 0);
            bodyPitch = st === 'zip' ? -35 : (p.swingPitch || 0);
            cape1 = 70; cape2 = 25;
        } else if (st === 'attack') {
            const k = Math.sin(Math.min(1, p.attackT || 0) * Math.PI);
            const side = p.attackSide || 0;
            if (side % 4 === 3) {                 // kick
                set('legR', 95 * k); set('shinR', -10 * (1 - k)); set('legL', -15 * k);
                set('torso', -15 * k, -30 * k);
                set('armL', 30, 0, -40); set('armR', -20, 0, 40);
            } else {
                const punchR = side % 2 === 0;
                set(punchR ? 'armR' : 'armL', 90 * k + 10, 0, 0);
                set(punchR ? 'foreR' : 'foreL', 15 * (1 - k));
                set(punchR ? 'armL' : 'armR', 40, 0, punchR ? -20 : 20);
                set(punchR ? 'foreL' : 'foreR', 100);
                set('torso', -10 * k, (punchR ? -35 : 35) * k);
                set('legL', 25); set('legR', -25); set('shinL', -20); set('shinR', -10);
            }
            cape1 = 25;
        } else if (st === 'counter') {
            set('armL', 110, 0, -20); set('foreL', 60);
            set('armR', 80); set('foreR', 20);
            set('torso', -10, 25);
            set('legL', 30); set('legR', -30);
        } else if (st === 'dodge') {
            set('legL', 60); set('legR', 50); set('shinL', -110); set('shinR', -110);
            set('armL', 60, 0, -20); set('armR', 60, 0, 20); set('foreL', 90); set('foreR', 90);
            bodyPitch = -40; bodyY = -0.35;
            cape1 = 60;
        } else if (st === 'hit') {
            set('torso', 20); set('head', 25); set('armL', -20, 0, -40); set('armR', -20, 0, 40);
            set('legL', -10); set('legR', 15);
        } else if (st === 'down') {
            set('armL', 0, 0, -70); set('armR', 0, 0, 70); set('legL', 5); set('legR', -5);
            bodyPitch = 88; bodyY = 0.1;
        } else if (st === 'ride') {
            set('legL', 80, 0, -12); set('legR', 80, 0, 12); set('shinL', -95); set('shinR', -95);
            set('armL', 70, 0, -10); set('armR', 70, 0, 10); set('foreL', 25); set('foreR', 25);
            set('torso', -38); set('head', 30);
            bodyY = 0.15;
            cape1 = 40 + Math.min(speed, 40) * 1.2; cape2 = 10;
        } else if (st === 'mantle') {
            set('armL', 150); set('armR', 150); set('foreL', 30); set('foreR', 30);
            set('legL', 70); set('shinL', -90); set('legR', 10);
            set('torso', -20);
        } else if (st === 'windup') {
            set('armR', -40, 0, 30); set('foreR', 110); set('armL', 50, 0, -20); set('foreL', 80);
            set('torso', 10, 30); set('legL', 25); set('legR', -20);
        } else {
            // idle / combat stance
            const guard = p.combatReady ? 1 : 0;
            set('armL', 8 + guard * 50, 0, -6 + breathe * 0.5); set('armR', 8 + guard * 50, 0, 6 - breathe * 0.5);
            set('foreL', 10 + guard * 80); set('foreR', 10 + guard * 80);
            set('torso', breathe * 0.4 - guard * 6);
            set('legL', guard * 15); set('legR', -guard * 10); set('shinL', -guard * 15); set('shinR', -guard * 5);
            cape1 = 6 + breathe;
        }

        const lambda = st === 'attack' || st === 'counter' ? 30 : 14;
        const joints = ['torso', 'head', 'armL', 'armR', 'foreL', 'foreR', 'legL', 'legR', 'shinL', 'shinR'];
        for (const j of joints) {
            const target = T[j] || [0, 0, 0];
            const c = this.cur[j] || (this.cur[j] = [0, 0, 0]);
            for (let k = 0; k < 3; k++) c[k] = damp(c[k], target[k], lambda, dt);
            // pitch: positive rotates the limb forward (towards -Z)
            this[j].setLocalEulerAngles(c[0], c[1], c[2]);
        }
        const b = this.cur.body || (this.cur.body = [0, 0, 0]);
        b[0] = damp(b[0], bodyPitch, 10, dt);
        b[1] = damp(b[1], bodyY, 12, dt);
        b[2] = damp(b[2], bodyRoll + (p.lean || 0), 8, dt);
        this.body.setLocalEulerAngles(b[0], 0, b[2]);
        this.body.setLocalPosition(0, b[1] + (st === 'glide' ? 1.0 : 0) + (st === 'down' ? 0 : 0), st === 'down' ? 0.6 : 0);
        if (this.cape1) {
            const flutter = Math.sin(this.t * 13) * Math.min(speed, 25) * 0.25;
            const cc = this.cur.cape || (this.cur.cape = [0, 0]);
            cc[0] = damp(cc[0], cape1 + flutter, 8, dt);
            cc[1] = damp(cc[1], cape2 - flutter * 0.6, 8, dt);
            this.cape1.setLocalEulerAngles(-cc[0], 0, 0);
            this.cape2.setLocalEulerAngles(-cc[1], 0, 0);
        }
    }
}

import * as pc from 'playcanvas';
import { QUALITY, QUALITY_PRESETS, IS_TOUCH, saveQualityName } from './config.js';
import { Input } from './core/Input.js';
import { TouchControls } from './core/TouchControls.js';
import { PhysicsWorld } from './core/Physics.js';
import { City } from './world/City.js';
import { Environment } from './world/Environment.js';
import { ThirdPersonCamera } from './camera/ThirdPersonCamera.js';
import { Player } from './player/Player.js';
import { CombatSystem } from './combat/CombatSystem.js';
import { Effects } from './combat/Effects.js';
import { EnemyManager } from './enemies/EnemyManager.js';
import { Motorcycle } from './vehicles/Motorcycle.js';
import { Collectibles } from './missions/Collectibles.js';
import { MissionSystem } from './missions/MissionSystem.js';
import { HUD } from './ui/HUD.js';
import { Rng } from './core/MathUtils.js';

const SPAWN = new pc.Vec3(0, 0.05, 140);

/** Top-level game: owns the PlayCanvas app and wires every system together. */
export class Game {
    constructor(canvas, uiRoot) {
        this.canvas = canvas;
        this.uiRoot = uiRoot;
        this.time = 0;
        this.dt = 0;
        this.paused = true;
        this.started = false;
        this.hitStopTimer = 0;
        this._splashPos = new pc.Vec3();
        this.defeated = false;
    }

    init() {
        const canvas = this.canvas;
        const app = new pc.Application(canvas, {
            graphicsDeviceOptions: { antialias: false, alpha: false, powerPreference: 'high-performance' }
        });
        this.app = app;
        app.setCanvasFillMode(pc.FILLMODE_FILL_WINDOW);
        app.setCanvasResolution(pc.RESOLUTION_AUTO);
        app.graphicsDevice.maxPixelRatio = QUALITY.pixelRatio;
        const resize = () => app.resizeCanvas();
        window.addEventListener('resize', resize);
        window.addEventListener('orientationchange', () => setTimeout(resize, 250));

        this.input = new Input(canvas);
        this.hud = new HUD(this.uiRoot, this);
        this.physics = new PhysicsWorld();

        this.env = new Environment(app);
        this.city = new City(app, this.physics).build();
        this.camera = new ThirdPersonCamera(app, this.physics);
        this.fx = new Effects(app);
        this.enemies = new EnemyManager(this);
        this.combat = new CombatSystem(this);
        this.player = new Player(this, SPAWN);
        this.bike = new Motorcycle(this);
        this.collectibles = new Collectibles(this, this.city.pickShardRoofs(20, SPAWN));
        this.missions = new MissionSystem(this);
        this._spawnAmbientPatrols();

        if (IS_TOUCH) {
            this.touch = new TouchControls(this.uiRoot, this.input);
            this.touch.show(false);
        }

        app.on('update', dt => this.update(dt));
        app.start();

        // Render one frame behind the title screen so the city is visible.
        this.camera.update(0.016, this.input, { pos: this.player.pos, mode: 'onfoot', heading: 0, speed: 0 });
        this.env.update(0.016, this.camera.entity.getPosition());

        this.hud.ready(() => this.start());

        document.addEventListener('visibilitychange', () => { if (document.hidden && this.started) this.togglePause(true); });
        window.__game = this; // handy for debugging in the console
        return this;
    }

    _spawnAmbientPatrols() {
        const rng = new Rng(808);
        const roofs = this.city.roofs.filter(r => r.y > 14 && r.y < 70 && (r.x1 - r.x0) > 14 && (r.z1 - r.z0) > 14 &&
            Math.hypot(r.cx - SPAWN.x, r.cz - SPAWN.z) > 120 && r.district !== 'techcore');
        const chosen = [];
        for (let tries = 0; chosen.length < 7 && tries < 400; tries++) {
            const r = rng.pick(roofs);
            if (chosen.every(c => Math.hypot(c.cx - r.cx, c.cz - r.cz) > 150)) chosen.push(r);
        }
        chosen.forEach((r, i) => this.enemies.spawnGroup(`patrol${i}`, new pc.Vec3(r.cx, r.y, r.cz), rng.int(2, 4),
            { spread: Math.min(r.x1 - r.x0, r.z1 - r.z0) * 0.3, ambient: true, y: r.y, brutes: i % 3 === 0 ? 1 : 0 }));
    }

    start() {
        this.started = true;
        this.paused = false;
        if (this.touch) this.touch.show(true);
        this.missions.start();
        if (!IS_TOUCH) this.hud.hint('Click to capture the mouse · WASD to move · Q to grapple', 5);
    }

    togglePause(force) {
        if (!this.started) return;
        const v = force !== undefined ? force : !this.paused;
        this.paused = v;
        this.hud.showPause(v);
        if (this.touch) this.touch.show(!v);
        if (v) this.input.exitPointerLock();
        this.input.reset();
    }

    get qualityName() { return this._qualityName || QUALITY.name; }

    /** Switch graphics preset: live for post FX / resolution / shadows, the rest after reload. */
    setQuality(name) {
        const q = QUALITY_PRESETS[name];
        if (!q) return;
        this._qualityName = name;
        saveQualityName(name);
        this.app.graphicsDevice.maxPixelRatio = q.pixelRatio;
        this.app.resizeCanvas();
        this.camera.applyQuality({ ...q, name });
        this.app.scene.lighting.shadowsEnabled = q.shadows;
        this.env.moonLight.light.castShadows = q.shadows;
        this.env.moonLight.light.shadowResolution = q.shadowResolution;
        this.hud.toast(`GRAPHICS: ${q.label.toUpperCase()}`);
    }

    hitStop(t) { this.hitStopTimer = Math.max(this.hitStopTimer, t); }

    onPlayerHit(dmg) {
        this.hud.damage();
        this.camera.shake(0.35);
        this.combat.onPlayerHit();
    }

    onPlayerDefeated() {
        if (this.defeated) return;
        this.defeated = true;
        this.hud.showDefeat(true);
        setTimeout(() => {
            this.player.respawn();
            // Reset alert state so the fight restarts fairly
            for (const e of this.enemies.list) if (e.alive && e.state !== 'patrol') e.setState('engage');
            this.hud.showDefeat(false);
            this.defeated = false;
        }, 2600);
    }

    onEnemyDefeated(enemy) {
        this.player.energy = Math.min(100, this.player.energy + 6);
    }

    update(rawDt) {
        const input = this.input;
        input.poll();
        if (input.pressed('pause') || input.pressed('map')) this.togglePause();
        if (this.paused) { input.endFrame(); return; }

        let dt = Math.min(rawDt, 1 / 20);
        if (this.hitStopTimer > 0) { this.hitStopTimer -= dt; dt *= 0.08; }
        this.dt = dt;
        this.time += dt;
        if (this.defeated) { input.reset(); }

        const p = this.player;
        const bike = this.bike;

        // context actions
        if (input.pressed('bike') && !p.onBike) bike.summon(p);
        const canMount = bike.canMount(p);
        if (canMount && input.pressed('interact')) {
            bike.mount(p);
            this.missions.notify('mount');
            input.consume('interact');
        }
        this.hud.setPrompt(canMount ? (IS_TOUCH ? 'Tap ✋ to ride the Star Cycle' : 'Press F to ride the Star Cycle') : null);

        this.combat.update(dt, input);
        bike.update(dt, input);          // before the player so the rider (and cape) use this frame's bike pose
        p.update(dt, input);
        this.enemies.update(dt);
        this.collectibles.update(dt);
        this.missions.update(dt);
        this.fx.update(dt);

        // camera
        let mode = 'onfoot', heading = p.heading, speed = Math.hypot(p.body.vel.x, p.body.vel.z);
        let camPos = p.pos;
        switch (p.state) {
            case 'bike': mode = 'bike'; heading = bike.heading; speed = Math.abs(bike.speed); camPos = bike.pos; break;
            case 'glide': mode = 'glide'; break;
            case 'swing': mode = 'swing'; break;
            case 'zip': mode = 'zip'; break;
            case 'air': mode = 'air'; break;
            default:
                if (this.enemies.engagedCount > 0) mode = 'combat';
                else if (speed > 12) mode = 'sprint';
        }
        this.camera.update(rawDt > 0 ? Math.min(rawDt, 1 / 20) : dt, input, { pos: camPos, mode, heading, speed });

        const cp = this.camera.entity.getPosition();
        this.city.update(dt, cp);
        this.env.update(dt, cp, this._splashPos.set(p.pos.x, this.physics.heightAt(p.pos.x, p.pos.z, p.pos.y + 0.5), p.pos.z));
        this.hud.update(dt);
        if (this.touch) this.touch.setContext({ canInteract: canMount || p.onBike, onBike: p.onBike, specialReady: p.energy >= 100 });

        input.endFrame();
    }
}

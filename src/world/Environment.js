import * as pc from 'playcanvas';
import { makeMaterial } from './Materials.js';
import { canvasTexture, makeSkyCanvas, makeDotCanvas } from './Textures.js';
import { QUALITY } from '../config.js';

/**
 * Night-time atmosphere: moonlight, ambient, fog, sky dome, moon and rain.
 */
export class Environment {
    constructor(app) {
        this.app = app;
        const scene = app.scene;
        scene.ambientLight = new pc.Color(0.11, 0.12, 0.2);
        scene.fog.type = pc.FOG_EXP2;
        scene.fog.color = new pc.Color(0.045, 0.055, 0.1);
        scene.fog.density = 0.0042;
        scene.exposure = 1.1;
        scene.lighting.shadowsEnabled = QUALITY.shadows;

        // Moonlight
        const moon = new pc.Entity('Moonlight');
        moon.addComponent('light', {
            type: 'directional',
            color: new pc.Color(0.55, 0.65, 0.95),
            intensity: 0.9,
            castShadows: QUALITY.shadows,
            shadowResolution: QUALITY.shadowResolution,
            shadowDistance: 140,
            numCascades: QUALITY.shadows ? 2 : 1,
            shadowBias: 0.3,
            normalOffsetBias: 0.06,
            shadowType: pc.SHADOW_PCF3_32F
        });
        moon.setEulerAngles(52, 35, 0);
        app.root.addChild(moon);
        this.moonLight = moon;

        // Cool rim fill from the opposite direction
        const fill = new pc.Entity('Fill');
        fill.addComponent('light', { type: 'directional', color: new pc.Color(0.35, 0.2, 0.45), intensity: 0.35, castShadows: false });
        fill.setEulerAngles(30, -150, 0);
        app.root.addChild(fill);

        // Sky dome
        const skyTex = canvasTexture(app.graphicsDevice, makeSkyCanvas(), { repeat: true, name: 'sky' });
        const skyMat = makeMaterial({
            name: 'sky', diffuse: [0, 0, 0], emissiveMap: skyTex, emissive: [1, 1, 1], emissiveIntensity: 1.0,
            unlit: true, noFog: true, cull: pc.CULLFACE_FRONT
        });
        skyMat.depthWrite = false;
        skyMat.update();
        const sky = new pc.Entity('Sky');
        sky.addComponent('render', { type: 'sphere', material: skyMat, castShadows: false, receiveShadows: false });
        sky.setLocalScale(3000, 3000, 3000);
        sky.render.meshInstances.forEach(mi => { mi.drawOrder = -1; mi.cull = false; });
        app.root.addChild(sky);
        this.sky = sky;

        // Moon disc
        const dot = canvasTexture(app.graphicsDevice, makeDotCanvas(), { repeat: false, name: 'dot' });
        this.dotTexture = dot;
        const moonMat = makeMaterial({ name: 'moon', diffuse: [0, 0, 0], emissive: [0.85, 0.9, 1.0], emissiveIntensity: 4, unlit: true, noFog: true });
        const moonDisc = new pc.Entity('MoonDisc');
        moonDisc.addComponent('render', { type: 'sphere', material: moonMat, castShadows: false, receiveShadows: false });
        moonDisc.setLocalScale(60, 60, 60);
        app.root.addChild(moonDisc);
        const halo = new pc.Entity('MoonHalo');
        const haloMat = makeMaterial({ name: 'halo', diffuse: [0, 0, 0], emissiveMap: dot, emissive: [0.4, 0.5, 0.9], emissiveIntensity: 1.2, opacityMap: dot, blend: pc.BLEND_ADDITIVE, unlit: true, noFog: true, twoSided: true });
        halo.addComponent('render', { type: 'plane', material: haloMat, castShadows: false, receiveShadows: false });
        halo.setLocalScale(320, 1, 320);
        app.root.addChild(halo);
        this.moonDisc = moonDisc;
        this.moonHalo = halo;
        this.moonDir = new pc.Vec3(-0.45, 0.42, -0.79).normalize();

        this._createRain(dot);
    }

    _createRain(dot) {
        const rain = new pc.Entity('Rain');
        const n = QUALITY.rainParticles;
        rain.addComponent('particlesystem', {
            numParticles: n,
            lifetime: 1.1,
            rate: 1.1 / n,
            rate2: 1.1 / n,
            emitterShape: pc.EMITTERSHAPE_BOX,
            emitterExtents: new pc.Vec3(70, 2, 70),
            velocityGraph: new pc.CurveSet([[0, -3], [0, -32], [0, 1.5]]),
            scaleGraph: new pc.Curve([0, 0.022]),
            alphaGraph: new pc.Curve([0, 0.0, 0.1, 0.32, 0.9, 0.32, 1, 0]),
            colorGraph: new pc.CurveSet([[0, 0.7], [0, 0.8], [0, 1.0]]),
            colorMap: dot,
            stretch: 0.035,
            alignToMotion: true,
            blendType: pc.BLEND_ADDITIVE,
            depthWrite: false,
            lighting: false,
            loop: true,
            autoPlay: true,
            preWarm: true
        });
        this.app.root.addChild(rain);
        this.rain = rain;
    }

    update(dt, camPos) {
        this.rain.setPosition(camPos.x, camPos.y + 24, camPos.z);
        this.sky.setPosition(camPos);
        const d = this.moonDir;
        this.moonDisc.setPosition(camPos.x + d.x * 1300, camPos.y + d.y * 1300, camPos.z + d.z * 1300);
        this.moonHalo.setPosition(camPos.x + d.x * 1290, camPos.y + d.y * 1290, camPos.z + d.z * 1290);
        this.moonHalo.lookAt(camPos);
        this.moonHalo.rotateLocal(90, 0, 0);
    }
}

import * as THREE from 'three';
import { Quat, Vec3 } from '../core/math.js';
import { QUALITY } from '../config.js';
import { makeCityEnvFaces } from '../world/EnvMap.js';
import { makeSkyCanvas, makeDotCanvas } from '../world/Textures.js';

const L = Math.PI;           // light unit scale (see ThreeGfx LIGHT_SCALE)

function linear(r, g, b) { const c = new THREE.Color(); c.setRGB(r, g, b, THREE.SRGBColorSpace); return c; }

/** Direction a PlayCanvas directional light shines (its local -Y) for given euler angles. */
function pcLightDir(ex, ey, ez) {
    const q = new Quat().setFromEulerAngles(ex, ey, ez);
    const d = new Vec3(0, -1, 0);
    q.transformVector(d, d);
    return new THREE.Vector3(d.x, d.y, d.z).normalize();
}

/**
 * Three.js night atmosphere, mirroring world/Environment.js (PlayCanvas):
 * moonlight + shadows, fill light, ambient, exp2 fog, sky dome, moon + halo,
 * procedural city environment map (PMREM), rain streaks, ground splashes, lightning.
 */
export class ThreeEnvironment {
    constructor(g, game) {
        this.g = g;
        const scene = g.scene, renderer = g.renderer;
        scene.fog = new THREE.FogExp2(linear(0.045, 0.055, 0.1), 0.0042);

        this.ambient = new THREE.AmbientLight(linear(0.11, 0.12, 0.2), 1.1 * L);
        scene.add(this.ambient);

        // moonlight with a shadow frustum that follows the camera
        this.moonDirVec = pcLightDir(52, 35, 0);
        const moon = new THREE.DirectionalLight(linear(0.55, 0.65, 0.95), 0.9 * L);
        moon.castShadow = QUALITY.shadows;
        moon.shadow.mapSize.set(QUALITY.shadowResolution, QUALITY.shadowResolution);
        const sc = moon.shadow.camera;
        sc.left = -70; sc.right = 70; sc.top = 70; sc.bottom = -70; sc.near = 1; sc.far = 400;
        moon.shadow.bias = -0.0004;
        moon.shadow.normalBias = 0.04;
        scene.add(moon);
        scene.add(moon.target);
        this.moonLight = moon;
        this.baseMoon = moon.intensity;

        const fill = new THREE.DirectionalLight(linear(0.35, 0.2, 0.45), 0.35 * L);
        fill.position.copy(pcLightDir(30, -150, 0)).multiplyScalar(-100);
        scene.add(fill);

        // sky dome (flipY on so the equirect canvas reads top-down like PlayCanvas)
        const skyTex = new THREE.CanvasTexture(makeSkyCanvas());
        skyTex.colorSpace = THREE.SRGBColorSpace;
        this.skyMat = new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, fog: false, depthWrite: false });
        this.sky = new THREE.Mesh(new THREE.SphereGeometry(1500, 48, 24), this.skyMat);
        this.sky.renderOrder = -1;
        this.sky.frustumCulled = false;
        scene.add(this.sky);

        const dot = new THREE.CanvasTexture(makeDotCanvas());
        dot.colorSpace = THREE.SRGBColorSpace;
        this.dot = dot;
        this.moonDisc = new THREE.Mesh(new THREE.SphereGeometry(30, 32, 16), new THREE.MeshBasicMaterial({ color: linear(0.85, 0.9, 1).multiplyScalar(4), fog: false }));
        scene.add(this.moonDisc);
        this.moonHalo = new THREE.Sprite(new THREE.SpriteMaterial({ map: dot, color: linear(0.4, 0.5, 0.9).multiplyScalar(1.2), blending: THREE.AdditiveBlending, depthWrite: false, fog: false }));
        this.moonHalo.scale.set(320, 320, 1);
        scene.add(this.moonHalo);
        this.moonPos = new THREE.Vector3(-0.45, 0.42, -0.79).normalize();

        // image-based lighting from the procedural neon-skyline cubemap
        const cube = new THREE.CubeTexture(makeCityEnvFaces(QUALITY.envMapSize));
        cube.colorSpace = THREE.SRGBColorSpace;
        cube.needsUpdate = true;
        const pmrem = new THREE.PMREMGenerator(renderer);
        this.envRT = pmrem.fromCubemap(cube);
        scene.environment = this.envRT.texture;
        scene.environmentIntensity = 1.6;
        pmrem.dispose();

        this._createRain();
        this._createSplashes();
        this.lightning = { timer: 8 + Math.random() * 10, flash: 0 };
    }

    _createRain() {
        const n = QUALITY.rainParticles;
        this.rainN = n;
        this.rainPos = new Float32Array(n * 6);
        this.rainSeed = new Float32Array(n * 4);      // x, y, z offsets + speed
        for (let i = 0; i < n; i++) {
            this.rainSeed[i * 4] = (Math.random() - 0.5) * 70;
            this.rainSeed[i * 4 + 1] = Math.random() * 50;
            this.rainSeed[i * 4 + 2] = (Math.random() - 0.5) * 70;
            this.rainSeed[i * 4 + 3] = 26 + Math.random() * 10;
        }
        const geo = new THREE.BufferGeometry();
        const attr = new THREE.BufferAttribute(this.rainPos, 3);
        attr.setUsage(THREE.DynamicDrawUsage);
        geo.setAttribute('position', attr);
        this.rainAttr = attr;
        const mat = new THREE.LineBasicMaterial({ color: linear(0.62, 0.72, 0.95), transparent: true, opacity: 0.32, blending: THREE.AdditiveBlending, depthWrite: false });
        this.rain = new THREE.LineSegments(geo, mat);
        this.rain.frustumCulled = false;
        this.g.scene.add(this.rain);
    }

    _createSplashes() {
        const n = QUALITY.splashParticles || 0;
        this.splashN = n;
        if (!n) return;
        this.splashPos = new Float32Array(n * 3);
        this.splashCol = new Float32Array(n * 3);
        this.splashLife = new Float32Array(n);
        this.splashOff = new Float32Array(n * 2);
        for (let i = 0; i < n; i++) this.splashLife[i] = Math.random() * 0.3;
        const geo = new THREE.BufferGeometry();
        const pa = new THREE.BufferAttribute(this.splashPos, 3); pa.setUsage(THREE.DynamicDrawUsage);
        const ca = new THREE.BufferAttribute(this.splashCol, 3); ca.setUsage(THREE.DynamicDrawUsage);
        geo.setAttribute('position', pa);
        geo.setAttribute('color', ca);
        this.splashAttrs = [pa, ca];
        const mat = new THREE.PointsMaterial({ size: 0.09, map: this.dot, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
        this.splashes = new THREE.Points(geo, mat);
        this.splashes.frustumCulled = false;
        this.g.scene.add(this.splashes);
    }

    applyQuality(q) {
        const r = this.g.renderer;
        if (q.shadows && !r.shadowMap.enabled) {
            r.shadowMap.enabled = true;
            this.g.scene.traverse(o => { if (o.material) o.material.needsUpdate = true; });
        }
        this.moonLight.castShadow = q.shadows;
        if (this.moonLight.shadow.mapSize.x !== q.shadowResolution) {
            this.moonLight.shadow.mapSize.set(q.shadowResolution, q.shadowResolution);
            this.moonLight.shadow.map?.dispose();
            this.moonLight.shadow.map = null;
        }
    }

    update(dt, camPos, groundPos) {
        // sky, moon
        this.sky.position.set(camPos.x, camPos.y, camPos.z);
        const m = this.moonPos;
        this.moonDisc.position.set(camPos.x + m.x * 1300, camPos.y + m.y * 1300, camPos.z + m.z * 1300);
        this.moonHalo.position.set(camPos.x + m.x * 1290, camPos.y + m.y * 1290, camPos.z + m.z * 1290);

        // shadow frustum follows the player, snapped to texels to avoid shimmering
        const focus = groundPos || camPos;
        const texel = 140 / this.moonLight.shadow.mapSize.x;
        const fx = Math.round(focus.x / texel) * texel, fz = Math.round(focus.z / texel) * texel;
        this.moonLight.target.position.set(fx, focus.y, fz);
        this.moonLight.position.set(fx - this.moonDirVec.x * 200, focus.y - this.moonDirVec.y * 200, fz - this.moonDirVec.z * 200);

        // rain streaks recycled inside a box around the camera
        const P = this.rainPos, S = this.rainSeed, n = this.rainN;
        const t = performance.now() * 0.001;
        for (let i = 0; i < n; i++) {
            const sp = S[i * 4 + 3];
            let y = (S[i * 4 + 1] - t * sp) % 50;
            if (y < 0) y += 50;
            const x = camPos.x + S[i * 4] - y * 0.08, z = camPos.z + S[i * 4 + 2];
            const yy = camPos.y - 18 + y;
            const k = i * 6;
            P[k] = x; P[k + 1] = yy; P[k + 2] = z;
            P[k + 3] = x + 0.05; P[k + 4] = yy + 0.7; P[k + 5] = z;
        }
        this.rainAttr.needsUpdate = true;

        // ground splashes
        if (this.splashN && groundPos) {
            const SP = this.splashPos, SC = this.splashCol, life = this.splashLife, off = this.splashOff;
            for (let i = 0; i < this.splashN; i++) {
                life[i] -= dt;
                if (life[i] <= 0) {
                    life[i] = 0.28;
                    off[i * 2] = groundPos.x + (Math.random() - 0.5) * 52;
                    off[i * 2 + 1] = groundPos.z + (Math.random() - 0.5) * 52;
                }
                const a = life[i] / 0.28;
                SP[i * 3] = off[i * 2]; SP[i * 3 + 1] = groundPos.y + 0.05 + (1 - a) * 0.18; SP[i * 3 + 2] = off[i * 2 + 1];
                SC[i * 3] = 0.55 * a; SC[i * 3 + 1] = 0.62 * a; SC[i * 3 + 2] = 0.75 * a;
            }
            this.splashAttrs[0].needsUpdate = true;
            this.splashAttrs[1].needsUpdate = true;
        }

        // lightning
        const Lg = this.lightning;
        Lg.timer -= dt;
        if (Lg.timer <= 0) { Lg.timer = 9 + Math.random() * 16; Lg.flash = 1; Lg.double = Math.random() < 0.5; }
        if (Lg.flash > 0) {
            Lg.flash = Math.max(0, Lg.flash - dt * 4);
            const f = Lg.double && Lg.flash < 0.5 ? Lg.flash * 2 : Lg.flash;
            const k = f * f;
            this.moonLight.intensity = this.baseMoon + k * 3.5 * L;
            this.skyMat.color.setScalar(1 + k * 2.5);
        }
    }
}

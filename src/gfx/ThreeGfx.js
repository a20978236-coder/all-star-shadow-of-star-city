import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { BokehPass } from 'three/examples/jsm/postprocessing/BokehPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { Vec3, Mat4 } from '../core/math.js';
import { QUALITY, IS_MOBILE } from '../config.js';
import { ThreeEnvironment } from '../three/ThreeEnvironment.js';

const DEG2RAD = Math.PI / 180;
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _m = new THREE.Matrix4();
const UP = new THREE.Vector3(0, 1, 0);

/** Convert an sRGB [r,g,b] (PlayCanvas convention) to a linear THREE.Color. */
function srgb(c, k = 1) {
    const col = new THREE.Color();
    col.setRGB(c[0], c[1], c[2], THREE.SRGBColorSpace);
    if (k !== 1) col.multiplyScalar(k);
    return col;
}

/**
 * Wraps a THREE.Object3D with the subset of the PlayCanvas Entity API that the
 * game uses, so gameplay code is identical on both renderers. Euler angles are
 * degrees with PlayCanvas' rotation order (equivalent to Three's 'ZYX').
 */
export class Node {
    constructor(obj) {
        this.obj = obj;
        obj.userData.node = this;
        this._pos = new Vec3();
        this._wt = new Mat4();
        this._fwd = new Vec3();
        this._up = new Vec3();
        this._right = new Vec3();
        this._enabled = true;
    }

    get name() { return this.obj.name; }
    get enabled() { return this._enabled; }
    set enabled(v) { this._enabled = !!v; this.obj.visible = !!v; }

    addChild(node) { this.obj.add(node.obj); }
    destroy() { this.obj.removeFromParent(); }

    _isRootLevel() { return !this.obj.parent || this.obj.parent.isScene; }

    setLocalPosition(x, y, z) {
        if (typeof x === 'object') this.obj.position.set(x.x, x.y, x.z);
        else this.obj.position.set(x, y, z);
    }

    setPosition(x, y, z) {
        if (typeof x === 'object') { z = x.z; y = x.y; x = x.x; }
        if (this._isRootLevel()) { this.obj.position.set(x, y, z); return; }
        _v.set(x, y, z);
        this.obj.parent.updateWorldMatrix(true, false);
        this.obj.parent.worldToLocal(_v);
        this.obj.position.copy(_v);
    }

    getPosition() {
        if (this._isRootLevel()) { const p = this.obj.position; return this._pos.set(p.x, p.y, p.z); }
        this.obj.updateWorldMatrix(true, false);
        _v.setFromMatrixPosition(this.obj.matrixWorld);
        return this._pos.set(_v.x, _v.y, _v.z);
    }

    setLocalEulerAngles(x, y, z) {
        if (typeof x === 'object') { z = x.z; y = x.y; x = x.x; }
        this.obj.rotation.set(x * DEG2RAD, y * DEG2RAD, z * DEG2RAD, 'ZYX');
    }

    setEulerAngles(x, y, z) {
        if (typeof x === 'object') { z = x.z; y = x.y; x = x.x; }
        if (this._isRootLevel()) { this.setLocalEulerAngles(x, y, z); return; }
        _e.set(x * DEG2RAD, y * DEG2RAD, z * DEG2RAD, 'ZYX');
        _q.setFromEuler(_e);
        this.obj.parent.updateWorldMatrix(true, false);
        this.obj.parent.getWorldQuaternion(this.obj.quaternion).invert().multiply(_q);
    }

    setLocalScale(x, y, z) {
        if (y === undefined) this.obj.scale.set(x, x, x);
        else this.obj.scale.set(x, y, z);
    }

    rotateLocal(x, y, z) {
        _e.set(x * DEG2RAD, y * DEG2RAD, z * DEG2RAD, 'ZYX');
        _q.setFromEuler(_e);
        this.obj.quaternion.multiply(_q);
    }

    /** Point the node's -Z axis at the target (PlayCanvas convention). */
    lookAt(x, y, z) {
        if (typeof x === 'object') { z = x.z; y = x.y; x = x.x; }
        this.obj.updateWorldMatrix(true, false);
        _v.setFromMatrixPosition(this.obj.matrixWorld);
        _v2.set(x, y, z);
        if (_v.distanceToSquared(_v2) < 1e-10) return;
        _m.lookAt(_v, _v2, UP);
        _q.setFromRotationMatrix(_m);
        if (!this._isRootLevel()) {
            const pq = new THREE.Quaternion();
            this.obj.parent.getWorldQuaternion(pq);
            _q.premultiply(pq.invert());
        }
        this.obj.quaternion.copy(_q);
    }

    getWorldTransform() {
        this.obj.updateWorldMatrix(true, false);
        this._wt.data.set(this.obj.matrixWorld.elements);
        return this._wt;
    }

    _axis(col, out, sign = 1) {
        this.obj.updateWorldMatrix(true, false);
        const e = this.obj.matrixWorld.elements, i = col * 4;
        out.set(e[i] * sign, e[i + 1] * sign, e[i + 2] * sign);
        return out.normalize();
    }

    get right() { return this._axis(0, this._right); }
    get up() { return this._axis(1, this._up); }
    get forward() { return this._axis(2, this._fwd, -1); }
}

// Primitive geometries shaped like PlayCanvas' built-in ones (unit size, same orientation).
function primitive(type) {
    switch (type) {
        case 'box': return new THREE.BoxGeometry(1, 1, 1);
        case 'sphere': return new THREE.SphereGeometry(0.5, 24, 16);
        case 'cylinder': return new THREE.CylinderGeometry(0.5, 0.5, 1, 24);
        case 'cone': return new THREE.ConeGeometry(0.5, 1, 24);
        case 'plane': return new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
        case 'torus': return new THREE.TorusGeometry(0.3, 0.2, 12, 32).rotateX(Math.PI / 2);
        default: throw new Error(`Unknown primitive ${type}`);
    }
}

// Lighting unit conversion: PlayCanvas' diffuse has no 1/PI factor, Three's does.
const LIGHT_SCALE = Math.PI;

/** Three.js implementation of the graphics layer. */
export class ThreeGfx {
    constructor(canvas) {
        this.name = 'three';
        this.canvas = canvas;
        const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, alpha: false, powerPreference: 'high-performance', stencil: false });
        renderer.setPixelRatio(QUALITY.pixelRatio);
        renderer.setSize(window.innerWidth, window.innerHeight, false);
        renderer.outputColorSpace = THREE.SRGBColorSpace;
        renderer.toneMapping = THREE.ACESFilmicToneMapping;
        renderer.toneMappingExposure = 1.4;
        renderer.info.autoReset = false;         // count every pass of a frame
        renderer.shadowMap.enabled = QUALITY.shadows;
        renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        canvas.style.width = '100%';
        canvas.style.height = '100%';
        this.renderer = renderer;
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x05060d);
        this.rootNode = new Node(this.scene);
        this._geo = {};
        // Three adds every point light to every shader: keep the pool small and fixed-size.
        this.maxDynamicLights = QUALITY.name === 'high' ? 16 : QUALITY.name === 'medium' ? 8 : 4;
        this.dynamicMeshes = [];
        window.addEventListener('resize', () => this._resize());
        window.addEventListener('orientationchange', () => setTimeout(() => this._resize(), 250));
    }

    get drawCalls() { return this._lastCalls ?? this.renderer.info.render.calls; }
    get root() { return this.rootNode; }

    _resize() {
        const w = window.innerWidth, h = window.innerHeight;
        this.renderer.setSize(w, h, false);
        if (this.cameraObj) { this.cameraObj.aspect = w / h; this.cameraObj.updateProjectionMatrix(); }
        if (this.composer) this.composer.setSize(w, h);
        if (this.bokeh) this.bokeh.setSize?.(w, h);
    }

    setPixelRatio(r) {
        this.renderer.setPixelRatio(r);
        if (this.composer) this.composer.setPixelRatio(r);
        this._resize();
    }

    start(loop) {
        const clock = new THREE.Clock();
        this.renderer.setAnimationLoop(() => {
            const dt = Math.min(clock.getDelta(), 0.1);
            this._lastCalls = this.renderer.info.render.calls;
            this.renderer.info.reset();
            loop(dt);
            this.tick(dt);
            if (this.composer) this.composer.render(dt);
            else if (this.cameraObj) this.renderer.render(this.scene, this.cameraObj);
        });
    }

    // ------------------------------------------------------------ scene graph
    node(name = 'node') {
        const o = new THREE.Object3D();
        o.name = name;
        return new Node(o);
    }

    add(node, parent) { (parent ? parent.obj : this.scene).add(node.obj); return node; }

    mesh(type, material, { castShadows = true, receiveShadows = true, name } = {}) {
        const geo = this._geo[type] || (this._geo[type] = primitive(type));
        const m = new THREE.Mesh(geo, material);
        m.name = name || type;
        m.castShadow = castShadows && !material.userData.noShadow;
        m.receiveShadow = receiveShadows;
        return new Node(m);
    }

    customMesh(data, material, { castShadows = true, receiveShadows = true, dynamic = false, name = 'mesh' } = {}) {
        const geo = new THREE.BufferGeometry();
        const pos = new THREE.BufferAttribute(data.positions instanceof Float32Array ? data.positions.slice() : new Float32Array(data.positions), 3);
        const nrm = new THREE.BufferAttribute(data.normals instanceof Float32Array ? data.normals.slice() : new Float32Array(data.normals), 3);
        if (dynamic) { pos.setUsage(THREE.DynamicDrawUsage); nrm.setUsage(THREE.DynamicDrawUsage); }
        geo.setAttribute('position', pos);
        geo.setAttribute('normal', nrm);
        geo.setAttribute('uv', new THREE.BufferAttribute(data.uvs instanceof Float32Array ? data.uvs : new Float32Array(data.uvs), 2));
        const vc = pos.count;
        const idx = data.indices instanceof Uint16Array || data.indices instanceof Uint32Array ? data.indices
            : (vc > 65535 ? new Uint32Array(data.indices) : new Uint16Array(data.indices));
        geo.setIndex(new THREE.BufferAttribute(idx, 1));
        geo.computeBoundingSphere();
        const m = new THREE.Mesh(geo, material);
        m.name = name;
        m.castShadow = castShadows && !material.userData.noShadow;
        m.receiveShadow = receiveShadows;
        const node = new Node(m);
        if (dynamic) {
            m.frustumCulled = false;
            node.updateGeometry = (p, n) => {
                pos.array.set(p); pos.needsUpdate = true;
                nrm.array.set(n); nrm.needsUpdate = true;
            };
        }
        return node;
    }

    // ------------------------------------------------------------ materials & textures
    texture(canvas, { srgb: isSrgb = true, repeat = true, mipmaps = true, name = 'tex', gloss = false } = {}) {
        let src = canvas;
        if (gloss) {
            // Three uses roughness (= 1 - gloss) in the green channel
            src = document.createElement('canvas');
            src.width = canvas.width; src.height = canvas.height;
            const g = src.getContext('2d');
            g.drawImage(canvas, 0, 0);
            const img = g.getImageData(0, 0, src.width, src.height);
            const d = img.data;
            for (let i = 0; i < d.length; i += 4) { const r = 255 - d[i + 1] * 0.9; d[i] = d[i + 1] = d[i + 2] = r; }   // min roughness ~0.1
            g.putImageData(img, 0, 0);
        }
        const t = new THREE.CanvasTexture(src);
        t.name = name;
        t.colorSpace = isSrgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
        t.wrapS = t.wrapT = repeat ? THREE.RepeatWrapping : THREE.ClampToEdgeWrapping;
        t.flipY = false;                       // keep the PlayCanvas UV convention (v = 0 at the top)
        t.generateMipmaps = mipmaps;
        t.minFilter = mipmaps ? THREE.LinearMipmapLinearFilter : THREE.LinearFilter;
        t.anisotropy = Math.min(4, this.renderer.capabilities.getMaxAnisotropy());
        t.needsUpdate = true;
        return t;
    }

    _tiled(tex, tiling) {
        if (!tex || !tiling) return tex;
        if (tex.repeat.x === tiling[0] && tex.repeat.y === tiling[1]) return tex;
        const t = (tex.repeat.x === 1 && tex.repeat.y === 1 && !tex.userData.tiled) ? tex : tex.clone();
        t.repeat.set(tiling[0], tiling[1]);
        t.userData.tiled = true;
        t.needsUpdate = true;
        return t;
    }

    material(o = {}) {
        const blend = o.blend === 'additive' || o.blend === 1 ? 'additive' : (o.opacity !== undefined || o.blend !== undefined ? 'normal' : null);
        const side = o.twoSided || o.cull === 'none' || o.cull === 0 ? THREE.DoubleSide
            : (o.cull === 'front' || o.cull === 2 ? THREE.BackSide : THREE.FrontSide);
        const common = {
            name: o.name || 'mat',
            side,
            fog: !o.noFog,
            transparent: !!blend,
            opacity: o.opacity ?? 1,
            depthWrite: blend ? (o.depthWrite ?? false) : (o.depthWrite ?? true),
            blending: blend === 'additive' ? THREE.AdditiveBlending : THREE.NormalBlending
        };
        let m;
        const k = o.emissiveIntensity ?? 1;
        if (o.unlit) {
            m = new THREE.MeshBasicMaterial({
                ...common,
                color: o.emissiveMap ? srgb(o.emissive || [1, 1, 1], k) : srgb(o.emissive || o.diffuse || [1, 1, 1], o.emissive ? k : 1),
                map: this._tiled(o.emissiveMap || o.diffuseMap || null, o.tiling)
            });
        } else {
            m = new THREE.MeshStandardMaterial({
                ...common,
                color: srgb(o.diffuse || [0.5, 0.5, 0.5]),
                roughness: Math.min(1, Math.max(0.04, 1 - (o.gloss ?? 0.4))),
                metalness: o.metalness ?? 0,
                map: this._tiled(o.diffuseMap || null, o.tiling),
                emissive: o.emissive ? srgb(o.emissive) : (o.emissiveMap ? new THREE.Color(1, 1, 1) : new THREE.Color(0, 0, 0)),
                emissiveIntensity: k,
                emissiveMap: this._tiled(o.emissiveMap || null, o.tiling),
                normalMap: this._tiled(o.normalMap || null, o.normalTiling),
                roughnessMap: this._tiled(o.glossMap || null, o.glossTiling)
            });
            if (o.normalMap) m.normalScale.set(o.bumpiness ?? 1, -(o.bumpiness ?? 1));
            if (o.glossMap) m.roughness = 1;              // the map carries the full range
            // glowing materials (neon, signs) shouldn't pick up reflections
            if (o.diffuse && o.diffuse[0] === 0 && o.diffuse[1] === 0 && o.diffuse[2] === 0 && (o.emissive || o.emissiveMap)) {
                m.envMapIntensity = 0; m.roughness = 1; m.userData.noShadow = true;
            }
        }
        return m;
    }

    setEmissive(m, color, intensity) {
        if (m.isMeshBasicMaterial) {
            if (color) m.color.copy(srgb(color, intensity ?? 1));
            else if (intensity !== undefined) {
                const base = m.userData.baseColor || (m.userData.baseColor = m.color.clone());
                m.color.copy(base).multiplyScalar(intensity);
            }
            return;
        }
        if (color) m.emissive.copy(srgb(color));
        if (intensity !== undefined) m.emissiveIntensity = intensity;
    }

    setOpacity(m, v) { m.opacity = v; }

    // ------------------------------------------------------------ lights & camera
    pointLight({ color = [1, 1, 1], intensity = 1, range = 10, name = 'pointLight' } = {}) {
        const l = new THREE.PointLight(srgb(color), intensity * LIGHT_SCALE, range, 1);
        l.name = name;
        const node = new Node(l);
        // toggling light visibility in Three recompiles shaders - fade intensity instead
        let enabled = true, level = intensity;
        Object.defineProperty(node, 'enabled', {
            get: () => enabled,
            set: v => { enabled = !!v; l.intensity = enabled ? level * LIGHT_SCALE : 0; }
        });
        node.setLight = ({ color: c, intensity: i, range: r }) => {
            if (c) l.color.copy(srgb(c));
            if (i !== undefined) { level = i; if (enabled) l.intensity = i * LIGHT_SCALE; }
            if (r !== undefined) l.distance = r;
        };
        return node;
    }

    /** Spot light shining along its local -Y axis (PlayCanvas convention). */
    spotLight({ color = [1, 1, 1], intensity = 1, range = 20, inner = 20, outer = 35, name = 'spotLight' } = {}) {
        const holder = new THREE.Object3D();
        holder.name = name;
        const l = new THREE.SpotLight(srgb(color), intensity * LIGHT_SCALE * 0.6, range, outer * DEG2RAD, 1 - inner / outer, 1);
        holder.add(l);
        holder.add(l.target);
        l.target.position.set(0, -1, 0);
        const node = new Node(holder);
        node.setLight = ({ color: c, intensity: i, range: r }) => {
            if (c) l.color.copy(srgb(c));
            if (i !== undefined) l.intensity = i * LIGHT_SCALE * 0.6;
            if (r !== undefined) l.distance = r;
        };
        return node;
    }

    camera({ fov = 62, near = 0.1, far = 3200 } = {}) {
        const cam = new THREE.PerspectiveCamera(fov, window.innerWidth / window.innerHeight, near, far);
        cam.name = 'MainCamera';
        this.cameraObj = cam;
        const node = new Node(cam);
        node.setFov = v => { if (Math.abs(cam.fov - v) > 0.01) { cam.fov = v; cam.updateProjectionMatrix(); } };
        return node;
    }

    /** EffectComposer chain: (GTAO) -> bloom -> (bokeh DOF) -> vignette -> ACES/sRGB output. */
    createPost(cameraNode) {
        const renderer = this.renderer, scene = this.scene, camera = cameraNode.obj;
        const w = window.innerWidth, h = window.innerHeight;
        const rt = new THREE.WebGLRenderTarget(w, h, { type: THREE.HalfFloatType, samples: QUALITY.msaa > 1 ? 4 : 0 });
        const composer = new EffectComposer(renderer, rt);
        composer.setPixelRatio(QUALITY.pixelRatio);
        composer.setSize(w, h);
        composer.addPass(new RenderPass(scene, camera));
        const gtao = new GTAOPass(scene, camera, w, h);
        gtao.output = GTAOPass.OUTPUT.Default;
        gtao.blendIntensity = 0.8;
        gtao.updateGtaoMaterial({ radius: 0.6, distanceExponent: 1, thickness: 1.5, scale: 1 });
        composer.addPass(gtao);
        const bloom = new UnrealBloomPass(new THREE.Vector2(w / 2, h / 2), 0.32, 0.45, 0.95);
        composer.addPass(bloom);
        const bokeh = new BokehPass(scene, camera, { focus: 6, aperture: 0.00035, maxblur: 0.006 });
        composer.addPass(bokeh);
        const vignette = new ShaderPass({
            uniforms: { tDiffuse: { value: null }, uAmount: { value: 0.42 } },
            vertexShader: 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
            fragmentShader: `uniform sampler2D tDiffuse; uniform float uAmount; varying vec2 vUv;
                void main(){ vec4 c = texture2D(tDiffuse, vUv); vec2 d = vUv - 0.5; float v = smoothstep(0.85, 0.25, length(d) * 1.25);
                gl_FragColor = vec4(c.rgb * mix(1.0 - uAmount, 1.0, v), c.a); }`
        });
        composer.addPass(vignette);
        composer.addPass(new OutputPass());
        this.composer = composer;
        this.bokeh = bokeh;
        const post = {
            applyQuality(q) {
                gtao.enabled = !!q.ssao;
                bloom.enabled = !!q.bloom;
                bokeh.enabled = !!q.dof;
                bloom.resolution.set(w / (IS_MOBILE ? 3 : 2), h / (IS_MOBILE ? 3 : 2));
            },
            setFocus(distance) {
                if (bokeh.enabled) bokeh.uniforms.focus.value = distance;
            }
        };
        post.applyQuality(QUALITY);
        return post;
    }

    createEnvironment(game) { return new ThreeEnvironment(this, game); }

    /** Street steam: a few soft billboard puffs rising and fading. */
    steam(x, y, z, dotTexture) {
        const group = new THREE.Group();
        group.name = 'steam';
        const mat = new THREE.SpriteMaterial({ map: dotTexture, color: 0xc8ccd6, transparent: true, opacity: 0.12, depthWrite: false });
        const puffs = [];
        for (let i = 0; i < 6; i++) {
            const s = new THREE.Sprite(mat.clone());
            s.userData.t = i / 6;
            group.add(s);
            puffs.push(s);
        }
        group.position.set(x, y, z);
        const node = new Node(group);
        this.dynamicMeshes.push(dt => {
            for (const s of puffs) {
                s.userData.t = (s.userData.t + dt / 4.5) % 1;
                const t = s.userData.t;
                s.position.set(Math.sin(t * 7 + s.id) * 0.3, t * 4.5, Math.cos(t * 5 + s.id) * 0.3);
                const sc = 0.8 + t * 3.6;
                s.scale.set(sc, sc, 1);
                s.material.opacity = 0.16 * Math.sin(t * Math.PI);
            }
        });
        return node;
    }

    /** Per-frame hooks for backend-only animation (steam). */
    tick(dt) { for (const f of this.dynamicMeshes) f(dt); }
}

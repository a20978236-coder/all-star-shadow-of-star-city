import * as pc from 'playcanvas';
import { QUALITY, IS_MOBILE } from '../config.js';
import { Environment } from '../world/Environment.js';

const toColor = c => (c instanceof pc.Color ? c : new pc.Color(c[0], c[1], c[2], c[3] ?? 1));
const BLEND = { additive: pc.BLEND_ADDITIVE, normal: pc.BLEND_NORMAL };
const CULL = { front: pc.CULLFACE_FRONT, none: pc.CULLFACE_NONE, back: pc.CULLFACE_BACK };

/** PlayCanvas implementation of the graphics layer (the original renderer). */
export class PcGfx {
    constructor(canvas) {
        this.name = 'playcanvas';
        const app = new pc.Application(canvas, {
            graphicsDeviceOptions: { antialias: false, alpha: false, powerPreference: 'high-performance' }
        });
        this.app = app;
        this.device = app.graphicsDevice;
        app.setCanvasFillMode(pc.FILLMODE_FILL_WINDOW);
        app.setCanvasResolution(pc.RESOLUTION_AUTO);
        this.device.maxPixelRatio = QUALITY.pixelRatio;
        const resize = () => app.resizeCanvas();
        window.addEventListener('resize', resize);
        window.addEventListener('orientationchange', () => setTimeout(resize, 250));
        this.maxDynamicLights = Infinity;      // clustered lighting handles many lights cheaply
    }

    get drawCalls() { return this.app.stats?.drawCalls?.total ?? 0; }
    get root() { return this.app.root; }

    start(loop) {
        this.app.on('update', dt => loop(dt));
        this.app.start();
    }

    setPixelRatio(r) {
        this.device.maxPixelRatio = r;
        this.app.resizeCanvas();
    }

    // ------------------------------------------------------------ scene graph
    node(name = 'node') { return new pc.Entity(name); }

    add(node, parent) { (parent || this.app.root).addChild(node); return node; }

    mesh(type, material, { castShadows = true, receiveShadows = true, name } = {}) {
        const e = new pc.Entity(name || type);
        e.addComponent('render', { type, material, castShadows, receiveShadows });
        return e;
    }

    customMesh(data, material, { castShadows = true, receiveShadows = true, dynamic = false, name = 'mesh' } = {}) {
        const mesh = new pc.Mesh(this.device);
        const positions = data.positions instanceof Float32Array ? data.positions : new Float32Array(data.positions);
        mesh.setPositions(positions);
        mesh.setNormals(data.normals instanceof Float32Array ? data.normals : new Float32Array(data.normals));
        mesh.setUvs(0, data.uvs instanceof Float32Array ? data.uvs : new Float32Array(data.uvs));
        const vc = positions.length / 3;
        mesh.setIndices(data.indices instanceof Uint16Array || data.indices instanceof Uint32Array ? data.indices
            : (vc > 65535 ? new Uint32Array(data.indices) : new Uint16Array(data.indices)));
        mesh.update(pc.PRIMITIVE_TRIANGLES);
        const mi = new pc.MeshInstance(mesh, material);
        if (dynamic) mi.cull = false;
        const e = new pc.Entity(name);
        e.addComponent('render', { meshInstances: [mi], castShadows, receiveShadows });
        if (dynamic) {
            e.updateGeometry = (p, n) => {
                mesh.setPositions(p);
                mesh.setNormals(n);
                mesh.update(pc.PRIMITIVE_TRIANGLES, false);
            };
        }
        return e;
    }

    // ------------------------------------------------------------ materials & textures
    texture(canvas, { srgb = true, repeat = true, mipmaps = true, name = 'tex' } = {}) {
        const tex = new pc.Texture(this.device, {
            name,
            width: canvas.width,
            height: canvas.height,
            format: srgb ? pc.PIXELFORMAT_SRGBA8 : pc.PIXELFORMAT_RGBA8,
            mipmaps,
            minFilter: mipmaps ? pc.FILTER_LINEAR_MIPMAP_LINEAR : pc.FILTER_LINEAR,
            magFilter: pc.FILTER_LINEAR,
            addressU: repeat ? pc.ADDRESS_REPEAT : pc.ADDRESS_CLAMP_TO_EDGE,
            addressV: repeat ? pc.ADDRESS_REPEAT : pc.ADDRESS_CLAMP_TO_EDGE,
            anisotropy: 4
        });
        tex.setSource(canvas);
        return tex;
    }

    material(o = {}) {
        const m = new pc.StandardMaterial();
        m.name = o.name || 'mat';
        m.useMetalness = true;
        m.diffuse = toColor(o.diffuse || [0.5, 0.5, 0.5]);
        m.metalness = o.metalness ?? 0;
        m.gloss = o.gloss ?? 0.4;
        const tiling = o.tiling ? new pc.Vec2(o.tiling[0], o.tiling[1]) : null;
        if (o.diffuseMap) { m.diffuseMap = o.diffuseMap; if (tiling) m.diffuseMapTiling = tiling; }
        if (o.emissive) m.emissive = toColor(o.emissive);
        if (o.emissiveMap) {
            m.emissiveMap = o.emissiveMap;
            if (!o.emissive) m.emissive = new pc.Color(1, 1, 1);
            if (tiling) m.emissiveMapTiling = tiling.clone();
        }
        m.emissiveIntensity = o.emissiveIntensity ?? 1;
        if (o.normalMap) {
            m.normalMap = o.normalMap;
            m.bumpiness = o.bumpiness ?? 1;
            if (o.normalTiling) m.normalMapTiling = new pc.Vec2(o.normalTiling[0], o.normalTiling[1]);
        }
        if (o.glossMap) {
            m.glossMap = o.glossMap;
            if (o.glossTiling) m.glossMapTiling = new pc.Vec2(o.glossTiling[0], o.glossTiling[1]);
        }
        const blend = typeof o.blend === 'string' ? BLEND[o.blend] : o.blend;
        if (o.opacity !== undefined) {
            m.opacity = o.opacity;
            m.blendType = blend ?? pc.BLEND_NORMAL;
            m.depthWrite = o.depthWrite ?? false;
        } else if (blend !== undefined) {
            m.blendType = blend;
            m.depthWrite = o.depthWrite ?? false;
        }
        if (o.opacityMap) { m.opacityMap = o.opacityMap; m.opacityMapChannel = 'a'; }
        if (o.unlit) { m.useLighting = false; m.useSkybox = false; }
        if (o.noFog) m.useFog = false;
        if (o.cull !== undefined) m.cull = typeof o.cull === 'string' ? CULL[o.cull] : o.cull;
        if (o.twoSided) m.cull = pc.CULLFACE_NONE;
        if (o.depthWrite !== undefined && blend === undefined && o.opacity === undefined) m.depthWrite = o.depthWrite;
        m.update();
        return m;
    }

    setEmissive(m, color, intensity) {
        if (color) m.emissive = toColor(color);
        if (intensity !== undefined) m.emissiveIntensity = intensity;
        m.update();
    }

    setOpacity(m, v) { m.opacity = v; m.update(); }

    // ------------------------------------------------------------ lights & camera
    _light(type, { color = [1, 1, 1], intensity = 1, range = 10, castShadows = false, falloff = 'linear', inner = 20, outer = 35, name } = {}) {
        const e = new pc.Entity(name || `${type}Light`);
        e.addComponent('light', {
            type, color: toColor(color), intensity, range, castShadows,
            falloffMode: falloff === 'linear' ? pc.LIGHTFALLOFF_LINEAR : pc.LIGHTFALLOFF_INVERSESQUARED,
            innerConeAngle: inner, outerConeAngle: outer
        });
        e.setLight = ({ color: c, intensity: i, range: r }) => {
            if (c) e.light.color = toColor(c);
            if (i !== undefined) e.light.intensity = i;
            if (r !== undefined) e.light.range = r;
        };
        return e;
    }

    pointLight(opts) { return this._light('omni', opts); }
    spotLight(opts) { return this._light('spot', opts); }

    camera({ fov = 62, near = 0.1, far = 3200, clearColor = [0.02, 0.025, 0.05] } = {}) {
        const e = new pc.Entity('MainCamera');
        e.addComponent('camera', { clearColor: toColor(clearColor), fov, nearClip: near, farClip: far });
        e.setFov = v => { e.camera.fov = v; };
        return e;
    }

    /** Post chain: ACES, bloom, vignette, SSAO and depth of field via CameraFrame. */
    createPost(cameraNode) {
        const cam = cameraNode.camera;
        let cf = null;
        try {
            if (!pc.CameraFrame) throw new Error('CameraFrame unavailable');
            cf = new pc.CameraFrame(this.app, cam);
            cf.rendering.toneMapping = pc.TONEMAP_ACES;
            cf.bloom.blurLevel = IS_MOBILE ? 10 : 16;
            cf.vignette.inner = 0.55;
            cf.vignette.outer = 1.2;
            cf.vignette.curvature = 0.5;
            // Note: colour grading is left off - its contrast curve crushes the night-time shadows.
        } catch (err) {
            console.warn('[camera] post-processing disabled:', err);
            cam.toneMapping = pc.TONEMAP_ACES;
            cam.gammaCorrection = pc.GAMMA_SRGB;
        }
        const post = {
            frame: cf,
            applyQuality(q) {
                if (!cf) return;
                cf.rendering.samples = q.msaa || 1;
                cf.bloom.intensity = q.bloom ? 0.04 : 0;
                cf.vignette.intensity = 0.42;
                cf.ssao.type = q.ssao ? pc.SSAOTYPE_LIGHTING : pc.SSAOTYPE_NONE;
                cf.ssao.intensity = 0.55;
                cf.ssao.radius = 22;
                cf.ssao.samples = 10;
                cf.ssao.scale = 0.5;
                cf.dof.enabled = !!q.dof;
                cf.dof.nearBlur = false;
                cf.dof.highQuality = false;
                cf.dof.focusRange = 40;
                cf.dof.blurRadius = 1.2;
                cf.dof.focusDistance = 6;
                cf.rendering.sceneDepthMap = !!(q.ssao || q.dof);
                cf.fringing.intensity = 0;
                cf.update();
            },
            setFocus(distance, range) {
                if (!cf || !cf.dof.enabled) return;
                if (Math.abs(distance - cf.dof.focusDistance) > 0.25) {
                    cf.dof.focusDistance = distance;
                    cf.dof.focusRange = range;
                    cf.update();
                }
            }
        };
        post.applyQuality(QUALITY);
        return post;
    }

    createEnvironment(game) { return new Environment(this.app); }

    /** Street steam vent (particle system). */
    steam(x, y, z, dotTexture) {
        const e = new pc.Entity('steam');
        e.addComponent('particlesystem', {
            numParticles: 28, lifetime: 4.5, rate: 0.16, rate2: 0.22,
            emitterShape: pc.EMITTERSHAPE_SPHERE, emitterRadius: 0.5,
            velocityGraph: new pc.CurveSet([[0, 0.2], [0, 1.4], [0, 0.1]]),
            velocityGraph2: new pc.CurveSet([[0, -0.2], [0, 0.9], [0, -0.1]]),
            scaleGraph: new pc.Curve([0, 0.8, 1, 4.5]),
            alphaGraph: new pc.Curve([0, 0, 0.15, 0.16, 1, 0]),
            colorGraph: new pc.CurveSet([[0, 0.75], [0, 0.78], [0, 0.85]]),
            colorMap: dotTexture, blendType: pc.BLEND_NORMAL, depthWrite: false, lighting: false,
            loop: true, autoPlay: true, preWarm: true
        });
        e.setPosition(x, y, z);
        return e;
    }
}

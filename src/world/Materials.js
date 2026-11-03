import * as pc from 'playcanvas';

const toColor = c => (c instanceof pc.Color ? c : new pc.Color(c[0], c[1], c[2], c[3] ?? 1));

/** Small helper to build StandardMaterials with sensible defaults for the night city. */
export function makeMaterial(opts = {}) {
    const m = new pc.StandardMaterial();
    m.name = opts.name || 'mat';
    m.useMetalness = true;
    m.diffuse = toColor(opts.diffuse || [0.5, 0.5, 0.5]);
    m.metalness = opts.metalness ?? 0;
    m.gloss = opts.gloss ?? 0.4;
    if (opts.diffuseMap) {
        m.diffuseMap = opts.diffuseMap;
        if (opts.tiling) m.diffuseMapTiling = new pc.Vec2(opts.tiling[0], opts.tiling[1]);
    }
    if (opts.emissive) m.emissive = toColor(opts.emissive);
    if (opts.emissiveMap) {
        m.emissiveMap = opts.emissiveMap;
        if (!opts.emissive) m.emissive = new pc.Color(1, 1, 1);
        if (opts.tiling) m.emissiveMapTiling = new pc.Vec2(opts.tiling[0], opts.tiling[1]);
    }
    m.emissiveIntensity = opts.emissiveIntensity ?? 1;
    if (opts.opacity !== undefined) {
        m.opacity = opts.opacity;
        m.blendType = opts.blend ?? pc.BLEND_NORMAL;
        m.depthWrite = opts.depthWrite ?? false;
    } else if (opts.blend !== undefined) {
        m.blendType = opts.blend;
        m.depthWrite = opts.depthWrite ?? false;
    }
    if (opts.opacityMap) { m.opacityMap = opts.opacityMap; m.opacityMapChannel = 'a'; }
    if (opts.unlit) { m.useLighting = false; m.useSkybox = false; }
    if (opts.noFog) m.useFog = false;
    if (opts.cull !== undefined) m.cull = opts.cull;
    if (opts.twoSided) m.cull = pc.CULLFACE_NONE;
    m.update();
    return m;
}

/** Emissive "neon" material: unlit-looking glow, picked up by bloom. */
export function neonMaterial(color, intensity = 3, opts = {}) {
    return makeMaterial({
        name: 'neon',
        diffuse: [0, 0, 0],
        emissive: color,
        emissiveIntensity: intensity,
        gloss: 0.2,
        ...opts
    });
}

/** Shared material library so we do not create thousands of materials. */
export class MaterialLibrary {
    constructor() { this.cache = new Map(); }
    get(key, factory) {
        let m = this.cache.get(key);
        if (!m) { m = factory(); this.cache.set(key, m); }
        return m;
    }
    neon(color, intensity = 3) {
        return this.get(`neon:${color.join(',')}:${intensity}`, () => neonMaterial(color, intensity));
    }
    solid(color, gloss = 0.35, metalness = 0) {
        return this.get(`solid:${color.join(',')}:${gloss}:${metalness}`, () => makeMaterial({ diffuse: color, gloss, metalness }));
    }
}

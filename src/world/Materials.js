import { gfx } from '../gfx/gfx.js';

/**
 * Material helpers. The spec is renderer-agnostic and is turned into a real
 * material by the active graphics backend (PlayCanvas or Three.js).
 *
 * Spec keys: name, diffuse [r,g,b] (sRGB), gloss (0..1), metalness, diffuseMap, emissive,
 * emissiveMap, emissiveIntensity, tiling [u,v], normalMap, normalTiling, bumpiness,
 * glossMap, glossTiling, opacity, opacityMap, blend ('normal' | 'additive'), depthWrite,
 * unlit, noFog, cull ('front' | 'back' | 'none'), twoSided.
 */
export function makeMaterial(opts = {}) {
    return gfx().material(opts);
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

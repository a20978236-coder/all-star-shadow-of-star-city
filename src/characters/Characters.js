import * as pc from 'playcanvas';
import { Humanoid } from './Humanoid.js';
import { makeMaterial, neonMaterial } from '../world/Materials.js';
import { canvasTexture, makeStarCanvas } from '../world/Textures.js';
import { COLORS } from '../config.js';

let allStarMats = null;

/** The hero: black armored suit, neon green star, green-lined cape. */
export function createAllStarModel(app) {
    if (!allStarMats) {
        const star = canvasTexture(app.graphicsDevice, makeStarCanvas('#b8ff2c', false), { repeat: false, name: 'heroStar' });
        allStarMats = {
            suit: makeMaterial({ name: 'heroSuit', diffuse: [0.03, 0.035, 0.04], gloss: 0.55, metalness: 0.2 }),
            armor: makeMaterial({ name: 'heroArmor', diffuse: [0.06, 0.065, 0.075], gloss: 0.8, metalness: 0.75 }),
            gauntlet: makeMaterial({ name: 'heroGauntlet', diffuse: [0.08, 0.09, 0.1], gloss: 0.85, metalness: 0.8 }),
            belt: makeMaterial({ name: 'heroBelt', diffuse: [0.05, 0.05, 0.05], emissive: [0.2, 0.3, 0.05], emissiveIntensity: 0.6, gloss: 0.6, metalness: 0.6 }),
            skin: makeMaterial({ name: 'heroSkin', diffuse: [0.33, 0.2, 0.13], gloss: 0.35 }),
            hair: makeMaterial({ name: 'heroHair', diffuse: [0.02, 0.015, 0.012], gloss: 0.2 }),
            accent: neonMaterial(COLORS.neonGreen, 3.5),
            emblem: makeMaterial({ name: 'heroEmblem', diffuse: [0, 0, 0], emissiveMap: star, emissive: [1, 1, 1], emissiveIntensity: 5, opacityMap: star, blend: pc.BLEND_ADDITIVE, twoSided: true }),
            cape: makeMaterial({ name: 'heroCape', diffuse: [0.02, 0.02, 0.025], gloss: 0.7, metalness: 0.1, twoSided: true }),
            capeTrim: neonMaterial(COLORS.neonGreen, 3)
        };
    }
    return new Humanoid(app, { name: 'AllStar', materials: allStarMats, scale: 1 });
}

const enemyShared = {};

/** Chaos Empire foot soldier. variant: 'thug' | 'brute'. Each gets its own suit material for hit flashes. */
export function createChaosModel(app, variant = 'thug') {
    if (!enemyShared.skin) {
        enemyShared.skin = makeMaterial({ name: 'thugSkin', diffuse: [0.28, 0.2, 0.16], gloss: 0.3 });
        enemyShared.mask = makeMaterial({ name: 'thugMask', diffuse: [0.04, 0.04, 0.045], gloss: 0.7, metalness: 0.6 });
        enemyShared.visor = neonMaterial(COLORS.chaosRed, 5);
        enemyShared.armor = makeMaterial({ name: 'thugArmor', diffuse: [0.12, 0.1, 0.1], gloss: 0.55, metalness: 0.6 });
        enemyShared.accent = neonMaterial(COLORS.chaosRed, 2.5);
        enemyShared.boot = makeMaterial({ name: 'thugBoot', diffuse: [0.05, 0.05, 0.05], gloss: 0.4 });
    }
    const suit = makeMaterial({ name: 'thugSuit', diffuse: variant === 'brute' ? [0.18, 0.05, 0.05] : [0.1, 0.1, 0.12], gloss: 0.35 });
    const mats = { ...enemyShared, suit };
    const h = new Humanoid(app, { name: `Chaos_${variant}`, materials: mats, scale: variant === 'brute' ? 1.22 : 1 });
    h.suitMaterial = suit;
    return h;
}

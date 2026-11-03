import * as pc from 'playcanvas';
import { Humanoid } from './Humanoid.js';
import { makeMaterial, neonMaterial } from '../world/Materials.js';
import { canvasTexture, makeStarCanvas, makeSuitMaps } from '../world/Textures.js';
import { PartSet } from './ShapeBuilder.js';
import { COLORS } from '../config.js';

let allStarMats = null;

/** Electric blue used for All-Star's suit lines and cape lining. */
export const HERO_BLUE = [0.12, 0.55, 1.0];

function heroMaterials(app) {
    if (allStarMats) return allStarMats;
    const dev = app.graphicsDevice;
    const star = canvasTexture(dev, makeStarCanvas('#b8ff2c', false, 4), { repeat: false, name: 'heroStar' });
    const suitMaps = makeSuitMaps(256);
    const suit = makeMaterial({ name: 'heroSuit', diffuse: [1, 1, 1], diffuseMap: canvasTexture(dev, suitMaps.diffuse, { name: 'suit_d' }), tiling: [2, 2], gloss: 0.5, metalness: 0.3 });
    suit.normalMap = canvasTexture(dev, suitMaps.normal, { name: 'suit_n', srgb: false });
    suit.normalMapTiling = new pc.Vec2(2, 2);
    suit.bumpiness = 0.9;
    suit.update();
    allStarMats = {
        suit,
        armor: makeMaterial({ name: 'heroArmor', diffuse: [0.04, 0.045, 0.055], gloss: 0.74, metalness: 0.65 }),
        armorBlue: makeMaterial({ name: 'heroArmorBlue', diffuse: [0.035, 0.08, 0.19], gloss: 0.74, metalness: 0.65 }),
        accent: neonMaterial(HERO_BLUE, 2.6),
        green: neonMaterial(COLORS.neonGreen, 4),
        belt: makeMaterial({ name: 'heroBelt', diffuse: [0.06, 0.06, 0.065], gloss: 0.7, metalness: 0.7 }),
        // warm brown skin with a faint warm emissive so the face reads under night lighting
        skin: makeMaterial({ name: 'heroSkin', diffuse: [0.38, 0.225, 0.14], emissive: [0.022, 0.011, 0.005], emissiveIntensity: 1, gloss: 0.46, metalness: 0 }),
        catchlight: neonMaterial([1, 1, 1], 1.4),
        lips: makeMaterial({ name: 'heroLips', diffuse: [0.24, 0.12, 0.09], gloss: 0.55 }),
        hair: makeMaterial({ name: 'heroHair', diffuse: [0.032, 0.022, 0.017], gloss: 0.28, metalness: 0 }),
        eyeWhite: makeMaterial({ name: 'heroEyeWhite', diffuse: [0.86, 0.84, 0.8], gloss: 0.9 }),
        iris: makeMaterial({ name: 'heroIris', diffuse: [0.16, 0.08, 0.035], gloss: 0.95, metalness: 0.1 }),
        emblem: makeMaterial({ name: 'heroEmblem', diffuse: [0, 0, 0], emissiveMap: star, emissive: [1, 1, 1], emissiveIntensity: 1.3, opacityMap: star, blend: pc.BLEND_ADDITIVE, twoSided: true }),
        capeOuter: makeMaterial({ name: 'heroCape', diffuse: [0.014, 0.015, 0.02], gloss: 0.62, metalness: 0.15 }),
        capeInner: makeMaterial({ name: 'heroCapeLining', diffuse: [0.03, 0.1, 0.3], emissive: [0.05, 0.22, 0.6], emissiveIntensity: 0.6, gloss: 0.7 }),
        capeTrim: neonMaterial(HERO_BLUE, 3)
    };
    return allStarMats;
}

/** Deterministic pseudo-random for the hair curls. */
function curlRand(i) { const x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); }

/**
 * Builds All-Star from smooth sculpted shapes: athletic young build, warm brown
 * skin, brown eyes, thick black curly hair, black hex-armour suit with
 * electric-blue lines, neon-green star emblem and star buckle, finned
 * gauntlets, knee guards and armoured boots. Each body part merges into one
 * mesh per material, so the whole hero costs only a few dozen draw calls.
 */
function buildAllStar(rig, s, M) {
    const app = rig.app;
    const noShadow = m => m !== M.accent && m !== M.green && m !== M.emblem && m !== M.catchlight;
    // slightly larger head and shorter neck for youthful, heroic proportions
    rig.head.setLocalPosition(0, 0.585 * s, 0.005);
    rig.head.setLocalScale(1.1, 1.1, 1.1);
    const part = () => new PartSet();

    // ---------------- torso
    const T = part();
    T.get(M.suit).ellipsoid([0, 0.13, 0.005], [0.155, 0.17, 0.115], 16, 10);          // abdomen
    T.get(M.suit).ellipsoid([0, 0.37, 0], [0.215, 0.2, 0.135], 18, 12);               // chest / lats
    T.get(M.armor).ellipsoid([0, 0.41, -0.032], [0.19, 0.15, 0.105], 18, 12);          // chest plate
    T.get(M.armor).ellipsoid([-0.065, 0.2, -0.085], [0.06, 0.055, 0.03], 10, 6);       // ab plates
    T.get(M.armor).ellipsoid([0.065, 0.2, -0.085], [0.06, 0.055, 0.03], 10, 6);
    T.get(M.armor).ellipsoid([-0.06, 0.09, -0.085], [0.055, 0.045, 0.028], 10, 6);
    T.get(M.armor).ellipsoid([0.06, 0.09, -0.085], [0.055, 0.045, 0.028], 10, 6);
    T.get(M.armor).ellipsoid([-0.235, 0.53, 0], [0.088, 0.06, 0.088], 14, 8, [0, 0, 24]);  // shoulder guards
    T.get(M.armor).ellipsoid([0.235, 0.53, 0], [0.088, 0.06, 0.088], 14, 8, [0, 0, -24]);
    T.get(M.suit).ellipsoid([0, 0.555, 0.02], [0.15, 0.07, 0.105], 14, 8);              // trapezius
    T.get(M.suit).limb([0, 0.62, 0.015], 0.06, 0.07, 0.078, 1, 14, 2);                  // high collar
    T.get(M.capeOuter).ellipsoid([0, 0.6, 0.085], [0.16, 0.1, 0.09], 14, 8);           // hood folded at the nape
    // blue suit lines: chevrons from the shoulders to the sternum and down the flanks
    T.get(M.accent).box([-0.1, 0.46, -0.14], [0.01, 0.075, 0.006], [12, 0, 48]);
    T.get(M.accent).box([0.1, 0.46, -0.14], [0.01, 0.075, 0.006], [12, 0, -48]);
    T.get(M.accent).box([-0.17, 0.26, -0.07], [0.008, 0.11, 0.006], [0, 28, -8]);
    T.get(M.accent).box([0.17, 0.26, -0.07], [0.008, 0.11, 0.006], [0, -28, 8]);
    T.get(M.accent).box([-0.25, 0.53, -0.07], [0.04, 0.006, 0.006], [0, 0, 20]);
    T.get(M.accent).box([0.25, 0.53, -0.07], [0.04, 0.006, 0.006], [0, 0, -20]);
    T.attach(app, rig.torso, noShadow);
    const emblem = rig._part(rig.torso, 'plane', M.emblem, 0, 0.415 * s, -0.142 * s, 0.2 * s, 1, 0.2 * s);
    emblem.setLocalEulerAngles(-80, 0, 0);
    emblem.render.castShadows = false;

    // ---------------- pelvis & belt
    const Pv = part();
    Pv.get(M.suit).ellipsoid([0, -0.03, 0], [0.165, 0.12, 0.115], 16, 10);
    Pv.get(M.suit).ellipsoid([-0.075, -0.06, 0.045], [0.085, 0.09, 0.075], 12, 8);      // glutes
    Pv.get(M.suit).ellipsoid([0.075, -0.06, 0.045], [0.085, 0.09, 0.075], 12, 8);
    Pv.get(M.belt).ellipsoid([0, 0.05, 0], [0.175, 0.035, 0.125], 18, 6);
    for (const x of [-0.13, -0.07, 0.07, 0.13]) Pv.get(M.belt).box([x, 0.045, -0.12 + Math.abs(x) * 0.2], [0.022, 0.026, 0.018]);   // pouches
    Pv.get(M.armor).box([0, 0.05, -0.128], [0.035, 0.03, 0.01]);
    Pv.attach(app, rig.pelvis, noShadow);
    const buckle = rig._part(rig.pelvis, 'plane', M.emblem, 0, 0.05 * s, -0.14 * s, 0.07 * s, 1, 0.07 * s);
    buckle.setLocalEulerAngles(-90, 0, 0);
    buckle.render.castShadows = false;

    // ---------------- head (face matches the reference: young, warm brown skin, brown eyes, curly black hair)
    const Hd = part();
    Hd.get(M.skin).limb([0, 0.12, 0.012], 0.13, 0.058, 0.066, 1, 12, 3);                // neck
    Hd.get(M.skin).ellipsoid([0, 0.205, 0.008], [0.094, 0.115, 0.106], 20, 14);          // cranium
    Hd.get(M.skin).ellipsoid([0, 0.15, -0.03], [0.078, 0.07, 0.078], 18, 10);           // jaw / cheeks
    Hd.get(M.skin).ellipsoid([0, 0.112, -0.055], [0.034, 0.024, 0.035], 12, 8);         // chin
    Hd.get(M.skin).ellipsoid([0, 0.18, -0.104], [0.015, 0.024, 0.018], 10, 8, [-12, 0, 0]);   // nose bridge
    Hd.get(M.skin).ellipsoid([0, 0.164, -0.106], [0.02, 0.012, 0.015], 10, 6);          // nose tip / nostrils
    Hd.get(M.skin).ellipsoid([-0.094, 0.185, 0.012], [0.014, 0.028, 0.021], 10, 8);     // ears
    Hd.get(M.skin).ellipsoid([0.094, 0.185, 0.012], [0.014, 0.028, 0.021], 10, 8);
    Hd.get(M.skin).ellipsoid([-0.036, 0.214, -0.088], [0.028, 0.009, 0.014], 10, 6);    // brow ridge
    Hd.get(M.skin).ellipsoid([0.036, 0.214, -0.088], [0.028, 0.009, 0.014], 10, 6);
    for (const x of [-0.035, 0.035]) {
        Hd.get(M.eyeWhite).ellipsoid([x, 0.197, -0.095], [0.019, 0.0105, 0.01], 12, 8);
        Hd.get(M.iris).ellipsoid([x, 0.197, -0.1045], [0.0085, 0.0085, 0.003], 10, 6);
        Hd.get(M.catchlight).ellipsoid([x + 0.003, 0.2005, -0.1076], [0.0022, 0.0022, 0.001], 6, 4);   // eye catchlight
        Hd.get(M.skin).ellipsoid([x, 0.205, -0.091], [0.021, 0.006, 0.011], 10, 6);                     // upper eyelid
        Hd.get(M.hair).box([x, 0.224, -0.103], [0.019, 0.0035, 0.004], [0, 0, x < 0 ? -6 : 6]);   // eyebrows
    }
    Hd.get(M.lips).ellipsoid([0, 0.134, -0.102], [0.025, 0.0065, 0.011], 12, 6);          // upper lip
    Hd.get(M.lips).ellipsoid([0, 0.126, -0.1], [0.022, 0.007, 0.011], 12, 6);           // lower lip
    // thick curly hair: many small curls distributed over the scalp (Fibonacci sphere), face left clear
    const hair = Hd.get(M.hair);
    hair.ellipsoid([0, 0.23, 0.012], [0.098, 0.088, 0.104], 16, 10);                     // base volume
    const N = 340, golden = Math.PI * (3 - Math.sqrt(5));
    for (let i = 0; i < N; i++) {
        const y = 1 - (i / (N - 1)) * 2, rad = Math.sqrt(1 - y * y), th = golden * i;
        const x = Math.cos(th) * rad, z = Math.sin(th) * rad;
        const py = 0.205 + y * 0.118, px = x * 0.1, pz = 0.008 + z * 0.112;
        const face = pz < -0.035 && py < 0.258;            // forehead / face
        const belowEars = py < 0.16 && pz < 0.06;           // sideburn area kept short
        if (face || belowEars || py < 0.12) continue;
        const k = 1.05 + curlRand(i) * 0.12 + Math.max(0, y) * 0.12;                // taller on top
        const cr = 0.019 + curlRand(i + 7) * 0.014;
        hair.ellipsoid([px * k, 0.205 + (py - 0.205) * k + 0.012, 0.008 + (pz - 0.008) * k], [cr, cr * 0.75, cr * 0.9], 7, 5,
            [curlRand(i + 3) * 90, curlRand(i + 5) * 90, 0]);
    }
    Hd.attach(app, rig.head, noShadow);

    // ---------------- arms
    for (const [arm, fore, side] of [[rig.armL, rig.foreL, -1], [rig.armR, rig.foreR, 1]]) {
        const A = part();
        A.get(M.suit).limb([0, -0.02, 0], 0.29, 0.076, 0.062, 1, 14, 6);
        A.get(M.armorBlue).ellipsoid([side * 0.022, -0.1, 0], [0.066, 0.075, 0.068], 12, 8);   // bicep plate
        A.get(M.accent).box([side * 0.06, -0.15, 0], [0.004, 0.08, 0.012]);
        A.attach(app, arm, noShadow);
        const F = part();
        F.get(M.suit).limb([0, 0, 0], 0.27, 0.062, 0.05, 1, 14, 6);
        F.get(M.armor).limb([0, -0.06, 0], 0.18, 0.068, 0.058, 1.05, 14, 4);              // gauntlet
        for (let k = 0; k < 3; k++) {                                                        // gauntlet fins
            F.get(M.armor).box([side * 0.07, -0.09 - k * 0.055, 0.0], [0.012, 0.03, 0.022], [0, 0, side * -35]);
        }
        F.get(M.accent).box([0, -0.15, -0.058], [0.008, 0.07, 0.004]);
        F.get(M.armor).ellipsoid([0, -0.315, -0.005], [0.046, 0.055, 0.034], 12, 8);       // fist
        F.get(M.armor).ellipsoid([0, -0.29, -0.035], [0.04, 0.02, 0.018], 10, 6);          // knuckle guard
        for (let k = 0; k < 4; k++) {                                                        // curled fingers
            F.get(M.armor).ellipsoid([-0.027 + k * 0.018, -0.34, -0.03], [0.0095, 0.016, 0.012], 8, 6);
        }
        F.get(M.armor).ellipsoid([side * -0.045, -0.31, -0.025], [0.012, 0.024, 0.012], 8, 6, [0, 0, side * 30]);   // thumb
        F.attach(app, fore, noShadow);
    }

    // ---------------- legs
    for (const [leg, shin] of [[rig.legL, rig.shinL], [rig.legR, rig.shinR]]) {
        const L = part();
        L.get(M.suit).limb([0, -0.01, 0], 0.44, 0.098, 0.07, 1.02, 14, 7);
        L.get(M.armorBlue).ellipsoid([0, -0.2, -0.05], [0.06, 0.12, 0.035], 12, 8);         // thigh plate
        L.get(M.accent).box([0, -0.2, -0.088], [0.006, 0.1, 0.004]);
        L.attach(app, leg, noShadow);
        const S = part();
        S.get(M.suit).limb([0, 0, 0], 0.4, 0.068, 0.055, 1.05, 14, 6);
        S.get(M.armor).ellipsoid([0, -0.015, -0.05], [0.058, 0.06, 0.035], 12, 8);          // knee guard
        S.get(M.suit).ellipsoid([0, -0.12, 0.022], [0.06, 0.095, 0.058], 12, 8);            // calf
        S.get(M.armor).limb([0, -0.2, 0], 0.22, 0.062, 0.058, 1.08, 14, 4);                 // boot shaft
        S.get(M.armor).ellipsoid([0, -0.45, -0.045], [0.056, 0.045, 0.118], 14, 8);        // boot
        S.get(M.belt).box([0, -0.488, -0.045], [0.056, 0.012, 0.115]);                       // sole
        S.get(M.accent).box([0, -0.25, -0.066], [0.006, 0.09, 0.004]);
        S.get(M.accent).box([0, -0.43, -0.16], [0.03, 0.005, 0.005]);
        S.attach(app, shin, noShadow);
    }
}

/** The hero: All-Star, black and blue armoured suit with a cloth cape. */
export function createAllStarModel(app) {
    const M = heroMaterials(app);
    return new Humanoid(app, {
        name: 'AllStar',
        materials: M,
        scale: 1,
        build: buildAllStar,
        cloth: { outer: M.capeOuter, inner: M.capeInner, trim: M.capeTrim }
    });
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

// Central tuning values for ALL-STAR: Shadows of Star City.
// Tweak gameplay feel here without digging through the systems.

export const IS_TOUCH = (typeof window !== 'undefined') &&
    (('ontouchstart' in window) || (navigator.maxTouchPoints > 0) || window.matchMedia?.('(pointer: coarse)').matches);

export const IS_MOBILE = IS_TOUCH && /iPhone|iPad|iPod|Android|Mobile/i.test(navigator.userAgent || '') ||
    (IS_TOUCH && Math.min(window.screen.width, window.screen.height) < 900);

/**
 * Graphics presets. PC defaults to "high", iPhone/touch devices to "medium".
 * The player can switch in the pause menu (stored in localStorage).
 */
export const QUALITY_PRESETS = {
    low: {
        label: 'Low', pixelRatio: 1, shadows: false, shadowResolution: 1024, shadowCascades: 1,
        bloom: true, ssao: false, dof: false, volumetricFog: false, msaa: 1,
        rainParticles: 1100, splashParticles: 120, maxStreetLights: 10, envMapSize: 64,
        streetProps: false, facadeDetail: false, drawDistance: 600
    },
    medium: {
        label: 'Medium', pixelRatio: 1.5, shadows: true, shadowResolution: 1024, shadowCascades: 1,
        bloom: true, ssao: false, dof: false, volumetricFog: false, msaa: 1,
        rainParticles: 2000, splashParticles: 220, maxStreetLights: 18, envMapSize: 128,
        streetProps: true, facadeDetail: true, drawDistance: 750
    },
    high: {
        label: 'High', pixelRatio: Math.min(window.devicePixelRatio || 1, 2), shadows: true, shadowResolution: 2048, shadowCascades: 2,
        bloom: true, ssao: true, dof: true, volumetricFog: false, msaa: 2,
        rainParticles: 4200, splashParticles: 420, maxStreetLights: 48, envMapSize: 256,
        streetProps: true, facadeDetail: true, drawDistance: 900
    }
};

const QUALITY_KEY = 'allstar.quality';
function loadQualityName() {
    try {
        const v = localStorage.getItem(QUALITY_KEY);
        if (v && QUALITY_PRESETS[v]) return v;
    } catch (_) { /* storage blocked */ }
    return IS_MOBILE ? 'medium' : 'high';
}

export const QUALITY_NAME = loadQualityName();
export const QUALITY = { ...QUALITY_PRESETS[QUALITY_NAME], name: QUALITY_NAME };

export function saveQualityName(name) {
    try { localStorage.setItem(QUALITY_KEY, name); } catch (_) { /* storage blocked */ }
}

export const COLORS = {
    neonGreen: [0.72, 1.0, 0.17],
    neonCyan: [0.2, 0.8, 1.0],
    neonMagenta: [1.0, 0.2, 0.75],
    neonPurple: [0.6, 0.25, 1.0],
    chaosRed: [1.0, 0.12, 0.1],
    warmWindow: [1.0, 0.82, 0.55]
};

export const WORLD = {
    gravity: -28,
    citySize: 800,          // city blocks span [-400, 400] on X and Z
    blockPitch: 80,         // block + street
    streetWidth: 16,
    boundary: 470           // invisible walls at the waterfront
};

export const PLAYER = {
    radius: 0.38,
    height: 1.85,
    walkSpeed: 6.5,
    runSpeed: 11,
    sprintSpeed: 16,
    groundAccel: 70,
    airAccel: 14,
    jumpSpeed: 11.5,
    stepHeight: 0.6,
    maxHealth: 100,
    maxEnergy: 100,
    healthRegen: 2.5,       // per second when out of combat
    glide: {
        minSpeed: 11,
        cruiseSpeed: 18,
        maxSpeed: 34,
        sinkRate: -3.2,
        diveSinkRate: -11,
        turnRate: 2.1
    }
};

export const GRAPPLE = {
    zipRange: 120,
    zipSpeed: 48,
    zipLaunchUp: 13,
    swingRange: 60,
    swingMinLength: 8,
    swingMaxSpeed: 46,
    swingSteer: 14,
    swingReel: 2.5,         // metres per second the rope shortens while swinging
    releaseBoost: 7
};

export const COMBAT = {
    targetRange: 11,
    lungeSpeed: 26,
    strikeRange: 1.45,
    strikeDuration: 0.3,
    comboWindow: 1.7,
    counterRange: 7,
    specialRadius: 7.5,
    specialCost: 100,
    energyPerHit: 9,
    dodgeSpeed: 17,
    dodgeTime: 0.32
};

export const ENEMY = {
    awareRange: 24,
    circleDistance: 4.2,
    walkSpeed: 2.4,
    runSpeed: 6.2,
    windupTime: 0.75,
    strikeRange: 2.2,
    damage: 12,
    maxAttackers: 2
};

export const BIKE = {
    accel: 24,
    brake: 42,
    maxSpeed: 44,
    boostSpeed: 62,
    reverseSpeed: 10,
    steerRate: 2.3,
    drag: 0.35,
    radius: 0.9
};

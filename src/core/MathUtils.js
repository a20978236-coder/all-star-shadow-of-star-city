import { Vec3 } from './math.js';

export const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
export const lerp = (a, b, t) => a + (b - a) * t;
export const damp = (a, b, lambda, dt) => lerp(a, b, 1 - Math.exp(-lambda * dt));
export const DEG = 180 / Math.PI;
export const RAD = Math.PI / 180;

/** Shortest signed difference between two angles (radians). */
export function angleDelta(a, b) {
    let d = (b - a) % (Math.PI * 2);
    if (d > Math.PI) d -= Math.PI * 2;
    if (d < -Math.PI) d += Math.PI * 2;
    return d;
}

export function dampAngle(a, b, lambda, dt) {
    return a + angleDelta(a, b) * (1 - Math.exp(-lambda * dt));
}

/** Heading (radians) such that an entity rotated by it around Y faces `dir` with its -Z axis. */
export function headingFromDir(x, z) {
    return Math.atan2(-x, -z);
}

export function dirFromHeading(h, out = new Vec3()) {
    return out.set(-Math.sin(h), 0, -Math.cos(h));
}

/** Deterministic PRNG so the city is the same every run. */
export function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
        a = (a + 0x6D2B79F5) >>> 0;
        let t = a;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

export class Rng {
    constructor(seed) { this.next = mulberry32(seed); }
    range(a, b) { return a + (b - a) * this.next(); }
    int(a, b) { return Math.floor(this.range(a, b + 1)); }
    pick(arr) { return arr[Math.floor(this.next() * arr.length)]; }
    chance(p) { return this.next() < p; }
}

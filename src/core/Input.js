/**
 * Unified input for keyboard + mouse (PC) and virtual touch controls (iPhone).
 * Game systems only read actions: `input.held('jump')`, `input.pressed('attack')`,
 * `input.move` (x = strafe, y = forward) and `input.look` (pixel deltas this frame).
 */
export const ACTIONS = ['jump', 'sprint', 'attack', 'counter', 'swing', 'grapple', 'dodge', 'special', 'interact', 'bike', 'pause', 'map'];

const KEYMAP = {
    Space: 'jump',
    ShiftLeft: 'sprint', ShiftRight: 'sprint',
    KeyE: 'swing',
    KeyQ: 'grapple',
    ControlLeft: 'dodge', KeyC: 'dodge',
    KeyR: 'special',
    KeyF: 'interact',
    KeyB: 'bike',
    Escape: 'pause', KeyP: 'pause',
    KeyM: 'map',
    KeyJ: 'attack', KeyK: 'counter'
};

export class Input {
    constructor(canvas) {
        this.canvas = canvas;
        this.move = { x: 0, y: 0 };
        this.look = { x: 0, y: 0 };
        this.keys = new Set();
        this._held = Object.fromEntries(ACTIONS.map(a => [a, 0]));   // counts of sources holding
        this._pressed = new Set();
        this._released = new Set();
        this.touchMove = { x: 0, y: 0 };
        this.mouseSensitivity = 0.12;
        this.touchSensitivity = 0.22;
        this.pointerLocked = false;
        this.lastLookTime = 0;
        this.enabled = true;

        window.addEventListener('keydown', e => this._onKey(e, true));
        window.addEventListener('keyup', e => this._onKey(e, false));
        window.addEventListener('blur', () => this.reset());

        canvas.addEventListener('mousedown', e => {
            if (!this.enabled) return;
            if (!this.pointerLocked && canvas.requestPointerLock) {
                try { const p = canvas.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch (_) { /* ignore */ }
            }
            if (e.button === 0) this.press('attack');
            if (e.button === 2) this.press('counter');
            if (e.button === 1) this.press('grapple');
        });
        window.addEventListener('mouseup', e => {
            if (e.button === 0) this.release('attack');
            if (e.button === 2) this.release('counter');
            if (e.button === 1) this.release('grapple');
        });
        canvas.addEventListener('contextmenu', e => e.preventDefault());
        document.addEventListener('pointerlockchange', () => {
            this.pointerLocked = document.pointerLockElement === canvas;
        });
        window.addEventListener('mousemove', e => {
            if (!this.pointerLocked || !this.enabled) return;
            this.addLook(e.movementX * this.mouseSensitivity, e.movementY * this.mouseSensitivity);
        });
    }

    _onKey(e, down) {
        if (e.repeat) { if (KEYMAP[e.code] || e.code.startsWith('Arrow')) e.preventDefault(); return; }
        if (down) this.keys.add(e.code); else this.keys.delete(e.code);
        const action = KEYMAP[e.code];
        if (action) {
            if (down) this.press(action); else this.release(action);
            if (e.code !== 'Escape') e.preventDefault();
        }
        if (e.code.startsWith('Arrow')) e.preventDefault();
    }

    press(action) {
        if (this._held[action] === 0) this._pressed.add(action);
        this._held[action]++;
    }

    release(action) {
        if (this._held[action] > 0) {
            this._held[action]--;
            if (this._held[action] === 0) this._released.add(action);
        }
    }

    tap(action) { this._pressed.add(action); }

    addLook(dx, dy) {
        this.look.x += dx; this.look.y += dy;
        if (Math.abs(dx) + Math.abs(dy) > 0.01) this.lastLookTime = performance.now();
    }

    held(a) { return this._held[a] > 0; }
    pressed(a) { return this._pressed.has(a); }
    released(a) { return this._released.has(a); }
    consume(a) { this._pressed.delete(a); }

    /** Call once per frame before game update. */
    poll() {
        const k = this.keys;
        let x = 0, y = 0;
        if (k.has('KeyW') || k.has('ArrowUp')) y += 1;
        if (k.has('KeyS') || k.has('ArrowDown')) y -= 1;
        if (k.has('KeyD') || k.has('ArrowRight')) x += 1;
        if (k.has('KeyA') || k.has('ArrowLeft')) x -= 1;
        x += this.touchMove.x; y += this.touchMove.y;
        const len = Math.hypot(x, y);
        if (len > 1) { x /= len; y /= len; }
        this.move.x = x; this.move.y = y;
    }

    /** Call once per frame after game update. */
    endFrame() {
        this._pressed.clear();
        this._released.clear();
        this.look.x = 0; this.look.y = 0;
    }

    reset() {
        this.keys.clear();
        for (const a of ACTIONS) this._held[a] = 0;
        this._pressed.clear(); this._released.clear();
        this.touchMove.x = this.touchMove.y = 0;
    }

    exitPointerLock() {
        if (document.pointerLockElement) document.exitPointerLock();
    }
}

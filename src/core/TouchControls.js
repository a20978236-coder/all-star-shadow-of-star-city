import { ICONS } from '../ui/Icons.js';

const capture = (el, id) => { try { el.setPointerCapture(id); } catch (_) { /* synthetic or already released pointer */ } };

/**
 * Virtual joystick + action buttons for iPhone / touch screens.
 * Left: floating move stick. Right half: drag to look. Buttons feed the shared Input.
 */
export class TouchControls {
    constructor(root, input) {
        this.input = input;
        this.el = document.createElement('div');
        this.el.className = 'touch-layer';
        this.el.innerHTML = `
            <div class="touch-look-zone"></div>
            <div class="stick-zone">
                <div class="stick-base"><div class="stick-knob"></div>
                    <span class="stick-arrow up"></span><span class="stick-arrow down"></span>
                    <span class="stick-arrow left"></span><span class="stick-arrow right"></span>
                </div>
            </div>
            <button class="tbtn sprint" data-action="sprint" data-mode="toggle" aria-label="Sprint">${ICONS.run}</button>
            <div class="tbtn-cluster">
                <button class="tbtn grapple" data-action="grapple" aria-label="Grapple">${ICONS.grapple}</button>
                <button class="tbtn swing" data-action="swing" aria-label="Swing">${ICONS.swing}</button>
                <button class="tbtn counter" data-action="counter" aria-label="Counter">${ICONS.counter}</button>
                <button class="tbtn attack" data-action="attack" aria-label="Strike">${ICONS.fist}</button>
                <button class="tbtn jump" data-action="jump" aria-label="Jump / Glide">${ICONS.jump}</button>
                <button class="tbtn dodge" data-action="dodge" aria-label="Dodge">${ICONS.dodge}</button>
                <button class="tbtn special" data-action="special" aria-label="Star Burst">${ICONS.star}</button>
                <button class="tbtn interact" data-action="interact" aria-label="Interact">${ICONS.hand}</button>
                <button class="tbtn bike" data-action="bike" aria-label="Summon Star Cycle">${ICONS.bike}</button>
            </div>`;
        root.appendChild(this.el);

        this.base = this.el.querySelector('.stick-base');
        this.knob = this.el.querySelector('.stick-knob');
        this.stickZone = this.el.querySelector('.stick-zone');
        this.lookZone = this.el.querySelector('.touch-look-zone');
        this.stickId = null;
        this.lookId = null;
        this.stickOrigin = { x: 0, y: 0 };
        this.lookLast = { x: 0, y: 0 };
        this.sprintToggled = false;

        this._fit = () => {
            // scale controls to the screen: compact on small iPhones, full size on tablets
            const k = Math.max(0.68, Math.min(1.15, Math.min(window.innerHeight / 430, window.innerWidth / 900)));
            this.el.style.setProperty('--touch-scale', k.toFixed(3));
        };
        this._fit();
        window.addEventListener('resize', this._fit);
        window.addEventListener('orientationchange', () => setTimeout(this._fit, 250));
        this._bindStick();
        this._bindLook();
        this._bindButtons();

        // Stop iOS rubber-banding / double-tap zoom / long-press menus.
        const stop = e => { if (e.target.closest('.touch-layer') || e.target.tagName === 'CANVAS') e.preventDefault(); };
        document.addEventListener('touchmove', stop, { passive: false });
        document.addEventListener('gesturestart', e => e.preventDefault());
        document.addEventListener('dblclick', e => e.preventDefault());
    }

    show(v) { this.el.style.display = v ? '' : 'none'; }

    _bindStick() {
        const zone = this.stickZone;
        let maxR = 52;
        const updateKnob = (dx, dy) => {
            const len = Math.hypot(dx, dy);
            const k = len > maxR ? maxR / len : 1;
            dx *= k; dy *= k;
            this.knob.style.transform = `translate(${dx}px, ${dy}px)`;
            const nx = dx / maxR, ny = -dy / maxR;
            const mag = Math.hypot(nx, ny);
            const dead = 0.12;
            const scale = mag < dead ? 0 : (mag - dead) / (1 - dead) / mag;
            this.input.touchMove.x = nx * scale;
            this.input.touchMove.y = ny * scale;
            // Push the stick fully forward to auto-run fast.
            const wantSprint = mag > 0.96 && ny > 0.7;
            if (wantSprint && !this._stickSprint) { this._stickSprint = true; this.input.press('sprint'); }
            if (!wantSprint && this._stickSprint) { this._stickSprint = false; this.input.release('sprint'); }
        };
        zone.addEventListener('pointerdown', e => {
            if (this.stickId !== null) return;
            this.stickId = e.pointerId;
            capture(zone, e.pointerId);
            // floating stick: the base jumps under the thumb wherever it lands in the zone
            const zr = zone.getBoundingClientRect();
            const br = this.base.getBoundingClientRect();
            const half = br.width / 2;                 // on-screen (scaled) radius
            const layoutHalf = this.base.offsetWidth / 2;  // CSS layout radius
            maxR = half * 0.7;
            const cx = Math.min(Math.max(e.clientX, zr.left + half + 4), zr.right - half - 4);
            const cy = Math.min(Math.max(e.clientY, zr.top + half + 4), zr.bottom - half - 4);
            this.base.style.left = `${cx - zr.left - layoutHalf}px`;
            this.base.style.bottom = `${zr.bottom - cy - layoutHalf}px`;
            this.stickOrigin.x = cx;
            this.stickOrigin.y = cy;
            updateKnob(e.clientX - cx, e.clientY - cy);
            this.base.classList.add('active');
        });
        zone.addEventListener('pointermove', e => {
            if (e.pointerId !== this.stickId) return;
            updateKnob(e.clientX - this.stickOrigin.x, e.clientY - this.stickOrigin.y);
        });
        const end = e => {
            if (e.pointerId !== this.stickId) return;
            this.stickId = null;
            updateKnob(0, 0);
            this.base.classList.remove('active');
            this.base.style.left = '';
            this.base.style.bottom = '';
        };
        zone.addEventListener('pointerup', end);
        zone.addEventListener('pointercancel', end);
    }

    _bindLook() {
        const zone = this.lookZone;
        zone.addEventListener('pointerdown', e => {
            if (this.lookId !== null) return;
            this.lookId = e.pointerId;
            capture(zone, e.pointerId);
            this.lookLast.x = e.clientX; this.lookLast.y = e.clientY;
        });
        zone.addEventListener('pointermove', e => {
            if (e.pointerId !== this.lookId) return;
            const s = this.input.touchSensitivity;
            this.input.addLook((e.clientX - this.lookLast.x) * s, (e.clientY - this.lookLast.y) * s);
            this.lookLast.x = e.clientX; this.lookLast.y = e.clientY;
        });
        const end = e => { if (e.pointerId === this.lookId) this.lookId = null; };
        zone.addEventListener('pointerup', end);
        zone.addEventListener('pointercancel', end);
    }

    _bindButtons() {
        this.el.querySelectorAll('.tbtn').forEach(btn => {
            const action = btn.dataset.action;
            const toggle = btn.dataset.mode === 'toggle';
            let lookPointer = null;
            let last = null;
            btn.addEventListener('pointerdown', e => {
                e.preventDefault();
                capture(btn, e.pointerId);
                btn.classList.add('down');
                if (toggle) {
                    this.sprintToggled = !this.sprintToggled;
                    btn.classList.toggle('on', this.sprintToggled);
                    if (this.sprintToggled) this.input.press(action); else this.input.release(action);
                } else {
                    this.input.press(action);
                }
                // Allow dragging from a held button to steer the camera (e.g. while swinging).
                lookPointer = e.pointerId; last = { x: e.clientX, y: e.clientY };
            });
            btn.addEventListener('pointermove', e => {
                if (e.pointerId !== lookPointer || this.lookId !== null) return;
                const s = this.input.touchSensitivity * 0.8;
                this.input.addLook((e.clientX - last.x) * s, (e.clientY - last.y) * s);
                last.x = e.clientX; last.y = e.clientY;
            });
            const up = e => {
                if (e.pointerId !== lookPointer) return;
                lookPointer = null;
                btn.classList.remove('down');
                if (!toggle) this.input.release(action);
            };
            btn.addEventListener('pointerup', up);
            btn.addEventListener('pointercancel', up);
        });
    }

    /** Highlight context buttons (e.g. show the interact button only when useful). */
    setContext({ canInteract, onBike, specialReady }) {
        this.el.classList.toggle('can-interact', !!canInteract);
        this.el.classList.toggle('on-bike', !!onBike);
        this.el.classList.toggle('special-ready', !!specialReady);
    }
}

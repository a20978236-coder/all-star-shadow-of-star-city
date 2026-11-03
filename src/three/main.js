import '../ui/styles.css';
import { Game } from '../Game.js';
import { ThreeGfx } from '../gfx/ThreeGfx.js';

// ALL-STAR: Shadows of Star City - Three.js renderer (side-by-side port).
// Gameplay, physics, input, HUD and touch controls are shared with the
// PlayCanvas version (src/main.js); only rendering differs.
const canvas = document.getElementById('app-canvas');
const ui = document.getElementById('ui-root');

const badge = document.createElement('a');
badge.className = 'renderer-badge';
badge.href = '../';
badge.textContent = 'THREE.JS PREVIEW · switch to PlayCanvas';
document.body.appendChild(badge);

requestAnimationFrame(() => setTimeout(() => {
    try {
        new Game(canvas, ui, c => new ThreeGfx(c)).init();
    } catch (err) {
        console.error(err);
        const box = document.createElement('div');
        box.className = 'fatal';
        box.textContent = `Failed to start: ${err.message}. WebGL2 is required.`;
        document.body.appendChild(box);
    }
}, 30));

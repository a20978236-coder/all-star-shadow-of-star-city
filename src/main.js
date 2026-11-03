import './ui/styles.css';
import { Game } from './Game.js';
import { PcGfx } from './gfx/PcGfx.js';

// ALL-STAR: Shadows of Star City — entry point (PlayCanvas renderer).
// The Three.js version lives at three/index.html -> src/three/main.js.
const canvas = document.getElementById('app-canvas');
const ui = document.getElementById('ui-root');

// Let the title screen paint before the (synchronous) city generation starts.
requestAnimationFrame(() => setTimeout(() => {
    try {
        new Game(canvas, ui, c => new PcGfx(c)).init();
    } catch (err) {
        console.error(err);
        const box = document.createElement('div');
        box.className = 'fatal';
        box.textContent = `Failed to start: ${err.message}. WebGL2 is required.`;
        document.body.appendChild(box);
    }
}, 30));

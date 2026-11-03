import './ui/styles.css';
import { Game } from './Game.js';

// ALL-STAR: Shadows of Star City — entry point.
const canvas = document.getElementById('app-canvas');
const ui = document.getElementById('ui-root');

// Let the title screen paint before the (synchronous) city generation starts.
requestAnimationFrame(() => setTimeout(() => {
    try {
        new Game(canvas, ui).init();
    } catch (err) {
        console.error(err);
        const box = document.createElement('div');
        box.className = 'fatal';
        box.textContent = `Failed to start: ${err.message}. WebGL2 is required.`;
        document.body.appendChild(box);
    }
}, 30));

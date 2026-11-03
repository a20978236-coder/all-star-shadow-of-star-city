// Original inline SVG icons used by the HUD and touch controls.
const svg = (body, vb = '0 0 48 48') =>
    `<svg viewBox="${vb}" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round">${body}</svg>`;

export const STAR_PATH = 'M24 4l5.9 13.1 14.3 1.5-10.7 9.6 3.1 14.1L24 35l-12.6 7.3 3.1-14.1L3.8 18.6l14.3-1.5z';

export const ICONS = {
    star: svg(`<path d="${STAR_PATH}"/><path d="M24 14l2.6 5.8 6.3.7-4.7 4.2 1.4 6.2L24 27.7l-5.6 3.2 1.4-6.2-4.7-4.2 6.3-.7z" stroke-width="2"/>`),
    fist: svg('<path d="M14 22v-6a3 3 0 0 1 6 0v4M20 19v-5a3 3 0 0 1 6 0v5M26 19v-4a3 3 0 0 1 6 0v6M32 21a3 3 0 0 1 6 0v6c0 8-5 14-13 14h-2c-6 0-11-5-11-11v-5c0-2 1.5-3 3-3h6c2 0 3 1.5 3 3s-1 3-3 3h-4"/>'),
    counter: svg('<path d="M24 5l15 6v11c0 10-6.5 17-15 21C15.5 39 9 32 9 22V11z"/><path d="M26 14l-6 10h7l-5 10" stroke-width="2.6"/>'),
    grapple: svg('<path d="M10 38l14-14"/><path d="M24 24l4-12 4 8 8 4-12 4z"/><circle cx="9" cy="39" r="3"/>'),
    swing: svg('<path d="M36 6C24 10 16 20 14 32"/><circle cx="14" cy="36" r="4"/><path d="M8 44c3-2 9-2 12 0"/><path d="M36 6l4 2-2 4"/>'),
    jump: svg('<path d="M24 40V12"/><path d="M12 22l12-12 12 12"/><path d="M14 44h20"/>'),
    dodge: svg('<path d="M8 24h22"/><path d="M22 14l10 10-10 10"/><path d="M36 12v24"/>'),
    run: svg('<circle cx="30" cy="8" r="4"/><path d="M18 20l8-5 6 6 6 2M24 16l-4 12 8 6v10M20 28l-6 8H8M28 34"/>'),
    hand: svg('<path d="M16 26V12a3 3 0 0 1 6 0v10M22 22V9a3 3 0 0 1 6 0v13M28 22V11a3 3 0 0 1 6 0v13M34 24v-5a3 3 0 0 1 6 0v9c0 9-6 16-15 16h-1c-5 0-8-2-11-6l-6-8a3 3 0 0 1 5-4l3 4"/>'),
    bike: svg('<circle cx="11" cy="32" r="7"/><circle cx="37" cy="32" r="7"/><path d="M11 32l9-12h10l7 12M20 20l-3-6h-5M28 14h6l3 6"/>'),
    pause: svg('<path d="M17 12v24M31 12v24" stroke-width="5"/>'),
    map: svg('<path d="M6 12l12-5 12 5 12-5v29l-12 5-12-5-12 5z"/><path d="M18 7v29M30 12v29"/>')
};

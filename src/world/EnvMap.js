import * as pc from 'playcanvas';
import { Rng } from '../core/MathUtils.js';

/**
 * Procedural "night city" environment cubemap used for image-based lighting.
 * Every glossy surface (wet roads, puddles, glass towers, the suit) reflects
 * a skyline of lit windows, neon and street lamps - without rendering the scene
 * six times or downloading an HDRI. Generated once at startup.
 */
function sideFace(size, seed) {
    const rng = new Rng(seed);
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const g = c.getContext('2d');
    const sky = g.createLinearGradient(0, 0, 0, size);
    sky.addColorStop(0, '#04060f');
    sky.addColorStop(0.42, '#121a36');
    sky.addColorStop(0.5, '#2a2346');
    sky.addColorStop(0.52, '#0a0c14');
    sky.addColorStop(1, '#050608');
    g.fillStyle = sky; g.fillRect(0, 0, size, size);

    // building silhouettes: tall in the street canyon, filling most of the face
    let x = 0;
    while (x < size) {
        const w = rng.range(size * 0.06, size * 0.2);
        const top = rng.range(size * 0.05, size * 0.4);
        const shade = rng.int(8, 20);
        g.fillStyle = `rgb(${shade},${shade + 2},${shade + 8})`;
        g.fillRect(x, top, w, size - top);
        // lit windows
        const cell = Math.max(2, size / 64);
        for (let wy = top + cell; wy < size * 0.82; wy += cell * 1.6) {
            for (let wx = x + cell * 0.5; wx < x + w - cell; wx += cell * 1.4) {
                if (rng.next() < 0.3) {
                    const warm = rng.next() < 0.65;
                    const a = rng.range(0.4, 1);
                    g.fillStyle = warm ? `rgba(255,${190 + rng.int(0, 40)},${110 + rng.int(0, 60)},${a})` : `rgba(170,210,255,${a})`;
                    g.fillRect(wx, wy, cell * 0.8, cell * 0.9);
                }
            }
        }
        // neon sign strip on some buildings
        if (rng.next() < 0.45) {
            const col = rng.pick(['#ff3cc0', '#39d0ff', '#b8ff2c', '#9a5cff', '#ff4a3a']);
            g.shadowColor = col; g.shadowBlur = size / 40;
            g.fillStyle = col;
            const vx = x + rng.range(0.2, 0.8) * w;
            g.fillRect(vx, rng.range(top, size * 0.55), size / 90, rng.range(size * 0.08, size * 0.25));
            g.shadowBlur = 0;
        }
        x += w + rng.range(0, size * 0.015);
    }
    // street lamps / headlights glow near the horizon line
    for (let k = 0; k < 10; k++) {
        const lx = rng.range(0, size), ly = rng.range(size * 0.6, size * 0.86), r = rng.range(size * 0.02, size * 0.05);
        const gr = g.createRadialGradient(lx, ly, 0, lx, ly, r);
        const warm = rng.next() < 0.75;
        gr.addColorStop(0, warm ? 'rgba(255,220,160,1)' : 'rgba(200,230,255,1)');
        gr.addColorStop(1, 'rgba(255,200,120,0)');
        g.fillStyle = gr; g.fillRect(lx - r, ly - r, r * 2, r * 2);
    }
    return c;
}

function topFace(size) {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const g = c.getContext('2d');
    const gr = g.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size * 0.75);
    gr.addColorStop(0, '#05070f'); gr.addColorStop(1, '#141b36');
    g.fillStyle = gr; g.fillRect(0, 0, size, size);
    // moon glow
    const m = g.createRadialGradient(size * 0.3, size * 0.25, 0, size * 0.3, size * 0.25, size * 0.12);
    m.addColorStop(0, 'rgba(220,230,255,0.9)'); m.addColorStop(1, 'rgba(120,140,200,0)');
    g.fillStyle = m; g.fillRect(0, 0, size, size);
    return c;
}

function bottomFace(size) {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    const g = c.getContext('2d');
    g.fillStyle = '#060709'; g.fillRect(0, 0, size, size);
    const rng = new Rng(71);
    for (let k = 0; k < 14; k++) {
        const x = rng.range(0, size), y = rng.range(0, size), r = rng.range(size * 0.03, size * 0.08);
        const gr = g.createRadialGradient(x, y, 0, x, y, r);
        gr.addColorStop(0, 'rgba(255,190,120,0.35)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = gr; g.fillRect(x - r, y - r, r * 2, r * 2);
    }
    return c;
}

/** The six cubemap faces (+X, -X, +Y, -Y, +Z, -Z) as canvases - shared by both renderers. */
export function makeCityEnvFaces(size = 128) {
    return [sideFace(size, 1), sideFace(size, 2), topFace(size), bottomFace(size), sideFace(size, 3), sideFace(size, 4)];
}

/** PlayCanvas: build the prefiltered environment atlas and assign it to the scene. */
export function createCityEnvironment(app, size = 128) {
    const device = app.graphicsDevice;
    const faces = makeCityEnvFaces(size);
    const cubemap = new pc.Texture(device, {
        name: 'cityEnvCube',
        cubemap: true,
        width: size,
        height: size,
        format: pc.PIXELFORMAT_SRGBA8,
        mipmaps: true,
        addressU: pc.ADDRESS_CLAMP_TO_EDGE,
        addressV: pc.ADDRESS_CLAMP_TO_EDGE
    });
    cubemap.setSource(faces);

    try {
        const lighting = pc.EnvLighting.generateLightingSource(cubemap, { size: Math.min(128, size) });
        const atlas = pc.EnvLighting.generateAtlas(lighting, { size: size >= 256 ? 512 : 256, numReflectionSamples: 512, numAmbientSamples: 512 });
        lighting.destroy();
        app.scene.envAtlas = atlas;
        app.scene.skyboxIntensity = 1.0;
        return atlas;
    } catch (err) {
        console.warn('[env] environment lighting unavailable:', err);
        return null;
    } finally {
        cubemap.destroy();
    }
}

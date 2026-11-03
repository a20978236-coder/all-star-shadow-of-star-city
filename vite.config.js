import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({
    // Relative base so the production build works from any static host / sub-folder.
    base: './',
    server: {
        // Expose the dev server on your LAN so you can open it on an iPhone.
        host: true,
        port: 5173
    },
    preview: {
        host: true,
        port: 4173
    },
    build: {
        target: 'es2022',
        chunkSizeWarningLimit: 4000,
        rollupOptions: {
            // Two pages share all gameplay code:
            //   index.html        -> PlayCanvas renderer (the live game)
            //   three/index.html  -> Three.js renderer (side-by-side port)
            input: {
                main: resolve(__dirname, 'index.html'),
                three: resolve(__dirname, 'three/index.html')
            }
        }
    }
});

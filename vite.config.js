import { defineConfig } from 'vite';

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
        chunkSizeWarningLimit: 4000
    }
});

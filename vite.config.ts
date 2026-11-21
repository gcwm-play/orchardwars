import { defineConfig } from 'vite';

// base is './' so the build works on GitHub Pages under /orchardwars/.
export default defineConfig({
  base: './',
  build: { target: 'es2022', chunkSizeWarningLimit: 1500 },
});

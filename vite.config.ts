import { defineConfig } from 'vite';

// base is './' so the build works on GitHub Pages under /orchardwars/.
export default defineConfig({
  base: './',
  build: {
    target: 'es2022',
    chunkSizeWarningLimit: 1500,
    // The single-file build (npm run build:html) can't load extra chunks from disk, so it keeps
    // everything, including the online-play code, in one script.
    // The rainy street walk (walk.html) is a second page; the single-file build leaves it out.
    rollupOptions: process.env.OW_SINGLE_FILE
      ? { output: { inlineDynamicImports: true } }
      : { input: { main: 'index.html', walk: 'walk.html' } },
  },
});

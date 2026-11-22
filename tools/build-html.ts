// Builds one self-contained file, dist/orchard-wars.html, with the scripts, styles and map data
// inlined, so the game can be opened straight from disk or sent as a single file.
//   npm run build:html

import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

execSync('npx vite build', { stdio: 'inherit', env: { ...process.env, OW_SINGLE_FILE: '1' } });

const dist = 'dist';
let html = readFileSync(join(dist, 'index.html'), 'utf8');
// Inline text must not close the surrounding <script> or <style> tag early.
const safe = (s: string) => s.replace(/<\/(script|style)/gi, '<\\/$1');

html = html.replace(/<link rel="stylesheet"[^>]*href="\.?\/?(assets\/[^"]+\.css)"[^>]*>/g, (_, file) =>
  `<style>${safe(readFileSync(join(dist, file), 'utf8'))}</style>`);
html = html.replace(/<link rel="modulepreload"[^>]*>/g, '');
html = html.replace(/<script type="module" crossorigin src="\.?\/?(assets\/[^"]+\.js)"><\/script>/g, (_, file) =>
  `<script type="module">${safe(readFileSync(join(dist, file), 'utf8'))}</script>`);
if (/src="\.?\/?assets\//.test(html)) throw new Error('A script was not inlined; check the Vite output tags');

const map = readFileSync('public/data/map.json', 'utf8');
html = html.replace('<head>', `<head>\n<script>window.__ORCHARD_MAP__ = ${safe(map)};</script>`);

const out = join(dist, 'orchard-wars.html');
writeFileSync(out, html);
console.log(`${out}: ${(html.length / 1e6).toFixed(1)} MB`);

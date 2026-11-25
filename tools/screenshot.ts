// Takes screenshots of the running game so visual changes can be checked without a person.
//   npm run build && npm run shot              -> shots/*.png from the built game
//   npm run shot -- --url http://localhost:5173 (screenshot a running dev server instead)
// Each view sets ?x=&z=&zoom= on the URL; add your own below.

import { mkdirSync } from 'node:fs';
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { createRequire } from 'node:module';

// Playwright is not a project dependency (it is preinstalled in Claude Code cloud sessions).
// Locally: npm i -D playwright && npx playwright install chromium
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const { chromium } = createRequire(import.meta.url)('playwright') as any;

const VIEWS: { name: string; query: string; page?: string; width?: number; height?: number; scale?: number; wait?: number }[] = [
  { name: 'title', query: '' },
  { name: 'briefing', query: 'gang=chrome&brief=1&name=Void%20Deck%20Kings&seed=7' },
  { name: 'overview', query: 'gang=thorn&seed=7' },
  { name: 'orchard-close', query: 'gang=thorn&seed=7&x=-850&z=-820&zoom=330' },
  { name: 'civic-close', query: 'gang=thorn&seed=7&x=1200&z=350&zoom=330' },
  { name: 'phone', query: 'gang=thorn&seed=7', width: 390, height: 844, scale: 2 },
  { name: 'phone-briefing', query: 'gang=tide&brief=1&seed=7', width: 390, height: 844, scale: 2 },
  // The rainy street walk (walk.html). Headless Chromium has no WebGPU, so these show the WebGL 2 fallback.
  { name: 'walk', page: 'walk.html', query: 'auto=1&fixed=1&t=0.3' },
  { name: 'walk-across', page: 'walk.html', query: 'auto=1&fixed=1&t=0.55&yaw=-55' },
  { name: 'walk-phone', page: 'walk.html', query: 'fixed=1&t=0.1', width: 390, height: 844, scale: 2 },
];

const argUrl = process.argv.indexOf('--url');
let base = argUrl > 0 ? process.argv[argUrl + 1] : '';
let server: ReturnType<typeof createServer> | undefined;

if (!base) {
  // Serve dist/ ourselves.
  const types: Record<string, string> = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json' };
  server = createServer(async (req, res) => {
    let path = decodeURIComponent((req.url ?? '/').split('?')[0]);
    if (path.endsWith('/')) path += 'index.html';
    try {
      const body = await readFile(join('dist', path));
      res.writeHead(200, { 'Content-Type': types[extname(path)] ?? 'application/octet-stream' }).end(body);
    } catch {
      res.writeHead(404).end();
    }
  });
  await new Promise<void>((r) => server!.listen(4173, r));
  base = 'http://localhost:4173/';
}

mkdirSync('shots', { recursive: true });
const browser = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--ignore-gpu-blocklist'] });
for (const v of VIEWS) {
  const page = await browser.newPage({
    viewport: { width: v.width ?? 1280, height: v.height ?? 800 },
    deviceScaleFactor: v.scale ?? 1,
  });
  page.on('pageerror', (e: Error) => console.error(`[${v.name}] ${e.message}`));
  page.on('console', (m: { type(): string; text(): string }) => m.type() === 'error' && console.error(`[${v.name}] ${m.text()}`));
  await page.goto(`${base}${v.page ?? ''}${v.query ? `?${v.query}` : ''}`);
  await page.waitForFunction(() => !document.getElementById('loading'), null, { timeout: 120_000 });
  await page.waitForTimeout(v.wait ?? 2500);
  await page.screenshot({ path: `shots/${v.name}.png` });
  console.log(`shots/${v.name}.png`);
  await page.close();
}
await browser.close();
server?.close();

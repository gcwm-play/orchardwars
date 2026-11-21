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

const VIEWS: { name: string; query: string; width?: number; height?: number; scale?: number }[] = [
  { name: 'spawn-orchard', query: '' },
  { name: 'wide-orchard-road', query: 'zoom=260' },
  { name: 'civic-district', query: 'x=1150&z=380&zoom=160' },
  { name: 'phone', query: '', width: 390, height: 844, scale: 2 },
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
  await page.goto(`${base}${v.query ? `?${v.query}` : ''}`);
  await page.waitForFunction(() => !document.getElementById('loading'), null, { timeout: 120_000 });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `shots/${v.name}.png` });
  console.log(`shots/${v.name}.png`);
  await page.close();
}
await browser.close();
server?.close();

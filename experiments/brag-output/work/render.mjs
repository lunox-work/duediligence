// Usage: node render.mjs stills t1,t2,...   |   node render.mjs frames <fps> <seconds>
import { createRequire } from 'node:module';
import { mkdirSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
const here = path.dirname(fileURLToPath(import.meta.url));
const require = createRequire('/Users/charlieangriawan/Repositories/lunox-work/public/sandbox-factory/package.json');
const { chromium } = require('playwright');
const [mode, a, b] = process.argv.slice(2);
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
await page.goto(pathToFileURL(path.join(here, 'index.html')).href);
await page.evaluate(async () => { await document.fonts.ready; await Promise.all([...document.fonts].map(f => f.load())); });
const shot = async (t, file) => { await page.evaluate(t => window.render(t), t); await page.screenshot({ path: file, type: 'png' }); };
if (mode === 'stills') {
  mkdirSync(path.join(here, 'stills'), { recursive: true });
  for (const t of a.split(',').map(Number)) await shot(t, path.join(here, 'stills', `t${t.toFixed(2)}.png`));
} else {
  const fps = Number(a), secs = Number(b), n = Math.round(fps * secs);
  mkdirSync(path.join(here, 'frames'), { recursive: true });
  for (let i = 0; i < n; i++) {
    await shot(i / fps, path.join(here, 'frames', `f${String(i).padStart(4, '0')}.png`));
    if (i % 60 === 0) console.log('frame', i, '/', n);
  }
}
await browser.close();

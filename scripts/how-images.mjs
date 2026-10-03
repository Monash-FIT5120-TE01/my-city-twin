/*
 * ─────────────────────────────────────────────────────────────────────────
 * THE PICTURES ON "HOW IT WORKS"
 * ─────────────────────────────────────────────────────────────────────────
 *
 * `npm run how-images` — photographs the app itself for the three steps on
 * the How it works page, into public/how/:
 *
 *   find.jpg     a searched building, outlined                 (step 01)
 *   sun.jpg      a project's shadow with a spot measured       (step 02)
 *   today.jpg    the comparison's "today" view                 (step 03)
 *   after.jpg    the comparison's "after" view                 (step 03)
 *
 * WHY PHOTOGRAPHS OF THE APP AND NOT THE DESIGN'S DRAWINGS
 *   The design's pictures are one flattened illustration of an imaginary
 *   city, with a third building colour ("In progress") the model does not
 *   draw. A page that explains how to read the map should show the map it
 *   explains. Re-run this when the city's look changes.
 *
 * The interface is hidden for the shots (focus mode, and the comparison's
 * page is not photographed), and so is the map credit — the How it works
 * page carries the credit beside the pictures instead, because a cropped
 * picture can lose a credit in its corner.
 *
 * Needs the dev server on 5173 (the map token is limited to it); starts one
 * if none is running.
 */

import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(root, 'public', 'how');
mkdirSync(OUT, { recursive: true });
const URL_ = 'http://localhost:5173/';

let ownServer = null;
try {
  await fetch(URL_);
} catch {
  const { createServer } = await import('vite');
  ownServer = await createServer({ root, server: { port: 5173, strictPort: true }, logLevel: 'error' });
  await ownServer.listen();
}

const browser = await chromium.launch({
  channel: 'chrome',
  args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
});

/** No map credit (the page that shows the picture carries it), and no focus-mode button. */
const HIDE_CREDIT = '.attribution, .focus-toggle { display: none !important; }';

/** A page, opened and waited on until the city has drawn and settled. */
async function open(path, width, height, ready) {
  const page = await browser.newPage({ viewport: { width, height }, deviceScaleFactor: 1.5 });
  await page.goto(URL_ + path, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector(ready, { timeout: 120_000 });
  await page.addStyleTag({ content: HIDE_CREDIT });
  await page.waitForTimeout(4000);
  return page;
}

/** Hide the interface (focus mode) and photograph the whole canvas. */
async function shootCity(page, file) {
  await page.getByRole('button', { name: /Focus mode/ }).click();
  await page.waitForTimeout(2500);
  await page.locator('canvas').first().screenshot({ path: join(OUT, file), type: 'jpeg', quality: 82 });
}

const MOMENT = 'd=2026-06-21&t=720';

// 01 — a searched building, outlined.
let page = await open(`?view=building&bldg=382cff45-4323-48b5-a305-d8b32e361cd2&${MOMENT}`, 1200, 460, '.viewctl');
await shootCity(page, 'find.jpg');
await page.close();

// 02 — a project's shadow, with a spot measured on the ground beside it.
page = await open(`?view=sunlight&dev=X0012808&${MOMENT}`, 1200, 460, '.timebar__dock');
await page.getByRole('button', { name: 'Choose a spot' }).click();
await page.waitForTimeout(800);
await page.mouse.click(330, 250);
await page.waitForTimeout(2000);
await shootCity(page, 'sun.jpg');
await page.close();

// 03 — the comparison's two views, from the same place.
page = await open(`?view=compare&dev=X0012808&${MOMENT}`, 1400, 760, '.compare__canvas canvas');
await page.waitForTimeout(2000);
await page.locator('.app__scene--compare canvas').screenshot({ path: join(OUT, 'today.jpg'), type: 'jpeg', quality: 82 });
await page.locator('.compare__canvas canvas').screenshot({ path: join(OUT, 'after.jpg'), type: 'jpeg', quality: 82 });
await page.close();

await browser.close();
await ownServer?.close();
console.log(`Written to ${OUT}`);

/*
 * ─────────────────────────────────────────────────────────────────────────
 * THE PAGE, DRIVEN IN A BROWSER
 * ─────────────────────────────────────────────────────────────────────────
 *
 * `npm run test:page` — the screen-level checks the unit tests cannot make,
 * because they are about layout, scrolling and time: things that only exist
 * in a real browser with the real city loaded.
 *
 * WHAT IT CHECKS
 *   The front page
 *     - it loads with no page errors;
 *     - the sections under the first screen are there, and "Future plans"
 *       in the header scrolls to its section;
 *     - scrolling the map's window up under the header covers the map
 *       before its credit can disappear (the map's licence requires the
 *       credit whenever the map shows);
 *     - choosing an address and pressing "Explore sunlight" opens the
 *       sunlight screen.
 *   The sunlight screen
 *     - "Map layers" is there (the only shadows switch);
 *     - play moves the hour, and leaving the screen stops it — returning
 *       does not find it running by itself;
 *     - "Compare today and after" flips the neighbourhood view on its own.
 *   On a phone, upright and on its side
 *     - the time bar sits below the header and above the map credit, and the
 *       credit above the sheet — nothing covers anything;
 *     - the sources link is reachable inside the sheet.
 *
 * HOW
 *   Like test:vr: the Chrome (or Edge) already installed, a dev server on
 *   5173 if one is running or its own, software WebGL so no GPU is needed.
 *   Screenshots go to test-results/page-check/.
 */

import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(root, 'test-results', 'page-check');
mkdirSync(OUT, { recursive: true });
const URL_ = 'http://localhost:5173/';

// ── The server ─────────────────────────────────────────────────────────────

/** True when a dev server already answers on 5173. */
async function serverRunning() {
  try {
    return (await fetch(URL_)).ok;
  } catch {
    return false;
  }
}

let ownServer = null;
if (!(await serverRunning())) {
  const { createServer } = await import('vite');
  ownServer = await createServer({ root, server: { port: 5173, strictPort: true }, logLevel: 'error' });
  await ownServer.listen();
}

// ── The browser ────────────────────────────────────────────────────────────

/** Installed Chrome, else Edge, with software WebGL. */
async function launch() {
  const args = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
  try {
    return await chromium.launch({ channel: 'chrome', args });
  } catch {
    return chromium.launch({ channel: 'msedge', args });
  }
}

const browser = await launch();
const pageErrors = [];
const results = [];

/** Record one check and print it as it happens. */
function check(name, ok, detail = '') {
  results.push({ name, ok });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
}

/** A page at this size, opened at `path`, waited on until the city is drawn. */
async function open(width, height, path, ready = 'canvas') {
  const page = await browser.newPage({ viewport: { width, height } });
  page.on('pageerror', (error) => pageErrors.push(`${width}x${height}: ${error.message}`));
  await page.goto(URL_ + path, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector(ready, { timeout: 120_000 });
  await page.waitForTimeout(3000);
  return page;
}

/** The vertical extent of an element, or null if it is not there. */
const span = (page, selector) =>
  page.evaluate((selector) => {
    const element = document.querySelector(selector);
    if (!element) return null;
    const box = element.getBoundingClientRect();
    return { top: Math.round(box.top), bottom: Math.round(box.bottom) };
  }, selector);

const SUNLIGHT = '?view=sunlight&dev=X0012808&d=2026-06-21&t=720';

try {
  // ── The front page ──────────────────────────────────────────────────────
  let page = await open(1440, 900, '?d=2026-06-21&t=720', '.landing__legend');
  await page.screenshot({ path: join(OUT, '01-front.png') });

  const sections = await page.locator('.more h2').count();
  check('The sections under the first screen are there', sections === 6, `${sections} headings`);

  await page.getByRole('button', { name: 'Future plans' }).click();
  await page.waitForTimeout(1500);
  const future = await span(page, '#future-plans');
  check('"Future plans" scrolls its section to the top', future !== null && Math.abs(future.top) < 120,
    future ? `top ${future.top}px` : 'missing');

  /*
   * Walk the window up under the header: whenever the map shows below the
   * header, its credit must too.
   */
  let creditAlwaysShown = true;
  let firstFailure = '';
  for (let y = 0; y <= 900; y += 20) {
    await page.evaluate((y) => document.querySelector('.landing').scrollTo(0, y), y);
    await page.waitForTimeout(60);
    const state = await page.evaluate(() => {
      const bar = document.querySelector('.header').getBoundingClientRect().bottom;
      const hole = document.querySelector('.landing__window');
      const map = hole.getBoundingClientRect();
      const credit = hole.querySelector('.attribution')?.getBoundingClientRect();
      const mapShows = map.bottom > bar + 1 && !hole.hasAttribute('data-covered');
      return { mapShows, creditShows: credit ? credit.top >= bar : false };
    });
    if (state.mapShows && !state.creditShows) {
      creditAlwaysShown = false;
      firstFailure = `scrolled ${y}px`;
      break;
    }
  }
  check('While the map shows, its credit shows', creditAlwaysShown, firstFailure);

  await page.evaluate(() => document.querySelector('.landing').scrollTo(0, 0));
  await page.fill('.landing__field input', 'Collins');
  await page.locator('.landing__search .results button').first().click();
  await page.getByRole('button', { name: 'Explore sunlight' }).click();
  const opened = await page
    .waitForSelector('.timebar__dock', { timeout: 30_000 })
    .then(() => true)
    .catch(() => false);
  check('Choosing an address and "Explore sunlight" open the sunlight screen', opened);
  await page.close();

  // ── The sunlight screen ─────────────────────────────────────────────────
  page = await open(1440, 900, SUNLIGHT, '.timebar__dock');
  await page.screenshot({ path: join(OUT, '02-sunlight.png') });
  check('"Map layers" is on the sunlight screen', (await page.getByRole('button', { name: /Map layers/ }).count()) === 1);

  const hourBefore = await page.locator('.timebar__now').innerText();
  await page.getByRole('button', { name: 'Play the day' }).click();
  await page.waitForTimeout(2000);
  const hourDuring = await page.locator('.timebar__now').innerText();
  check('Play moves the hour', hourDuring !== hourBefore, `${hourBefore} → ${hourDuring}`);

  await page.getByRole('button', { name: 'Details' }).click();
  await page.waitForTimeout(800);
  await page.getByRole('tab', { name: 'Sunlight' }).click();
  await page.waitForSelector('.timebar__play');
  const hourBack = await page.locator('.timebar__now').innerText();
  await page.waitForTimeout(1500);
  const label = await page.locator('.timebar__play').getAttribute('aria-label');
  const hourLater = await page.locator('.timebar__now').innerText();
  check('Leaving the screen stops play, and returning does not restart it',
    label === 'Play the day' && hourLater === hourBack, `${label}, ${hourBack} → ${hourLater}`);

  const radios = () =>
    page.evaluate(() => [...document.querySelectorAll('input[name=neighbourhood]')].map((r) => r.checked).join());
  await page.getByRole('button', { name: 'Compare today and after' }).click();
  const first = await radios();
  await page.waitForTimeout(2000);
  const second = await radios();
  await page.getByRole('button', { name: 'Stop comparing' }).click();
  check('"Compare today and after" flips the neighbourhood view on its own', first !== second, `${first} → ${second}`);
  await page.close();

  // ── On a phone ──────────────────────────────────────────────────────────
  for (const [width, height] of [
    [375, 667],
    [667, 375],
  ]) {
    page = await open(width, height, SUNLIGHT, '.timebar__dock');
    await page.screenshot({ path: join(OUT, `03-phone-${width}x${height}.png`) });
    const header = await span(page, '.header');
    const dock = await span(page, '.timebar__dock');
    const credit = await span(page, '.attribution');
    const sheet = await span(page, '.sheet--sun');
    const stacked =
      dock.top >= header.bottom && dock.bottom <= credit.top && credit.bottom <= sheet.top;
    check(`${width}×${height}: header, time bar, credit and sheet stack without covering`, stacked,
      `header ↓${header.bottom}, bar ${dock.top}–${dock.bottom}, credit ${credit.top}–${credit.bottom}, sheet ↑${sheet.top}`);
    const sources = await page.evaluate(() => getComputedStyle(document.querySelector('.sheet__sources')).display);
    check(`${width}×${height}: the sources link is in the sheet`, sources !== 'none');
    await page.close();
  }
} catch (error) {
  check('Runs to the end without stopping', false, error.message.split('\n')[0]);
} finally {
  await browser.close();
  await ownServer?.close();
}

// ── The summary ────────────────────────────────────────────────────────────

check('No page errors', pageErrors.length === 0, pageErrors.slice(0, 3).join(' | '));
const failed = results.filter((result) => !result.ok);
console.log('');
console.log(`${results.length - failed.length} / ${results.length} passed. Screenshots: ${OUT}`);
process.exit(failed.length ? 1 : 0);

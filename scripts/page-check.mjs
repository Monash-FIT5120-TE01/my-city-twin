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
 *   Choosing a project on the map
 *     - one click opens nothing; a double click opens it, as a card beside
 *       the building (not a side column) whose "Explore sunlight" works;
 *     - nothing on the card runs past its edge, and dragging or scrolling
 *       on the card does not move the map.
 *   Choosing an existing building on the map
 *     - the same: one click nothing, a double click its page.
 *   The sunlight screen
 *     - "Map layers" is there (the only shadows switch);
 *     - play moves the hour, and leaving the screen stops it — returning
 *       does not find it running by itself;
 *     - "Compare side by side" opens the comparison page — two views, each
 *       with the map's credit — and "Back to sunlight" returns to one.
 *   How it works
 *     - the header's link opens the page with its pictures loaded, and its
 *       two buttons go back to sunlight and on to the map.
 *   On a phone, upright and on its side
 *     - the time bar sits below the header and above the map credit, and the
 *       credit above the sheet — nothing covers anything;
 *     - the sources link is reachable inside the sheet;
 *     - on a project's page and the explore screen, the view controls and
 *       the map credit sit between the header and the sheet (or the hint),
 *       apart from each other.
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
    // The page re-measures on its scroll event; let two frames pass so the
    // check reads the page after it has, not before.
    await page.evaluate(
      () => new Promise((done) => requestAnimationFrame(() => requestAnimationFrame(done))),
    );
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
  await page.fill('.landing__search input', 'Collins');
  await page.locator('.landing__search .results button').first().click();
  await page.getByRole('button', { name: 'Explore sunlight' }).click();
  const opened = await page
    .waitForSelector('.timebar__dock', { timeout: 30_000 })
    .then(() => true)
    .catch(() => false);
  check('Choosing an address and "Explore sunlight" open the sunlight screen', opened);
  await page.close();

  // ── Choosing a project on the map ───────────────────────────────────────
  /*
   * A single click on a project opens nothing; a double click opens it.
   * The pointer turns to a hand over a project, which is how one is found
   * without knowing where the camera put it.
   */
  page = await open(1440, 900, '?view=explore&d=2026-06-21&t=720', '.viewctl');
  let spot = null;
  for (let y = 200; y < 700 && !spot; y += 25) {
    for (let x = 450; x < 1300 && !spot; x += 25) {
      await page.mouse.move(x, y);
      await page.waitForTimeout(40);
      if ((await page.evaluate(() => document.body.style.cursor)) === 'pointer') spot = [x, y];
    }
  }
  if (!spot) {
    check('A project can be found under the pointer', false);
  } else {
    const view = () => new URL(page.url()).searchParams.get('view');
    await page.mouse.click(spot[0], spot[1]);
    await page.waitForTimeout(1200);
    check('One click on a project opens nothing', view() === 'explore', `view ${view()}`);
    await page.mouse.dblclick(spot[0], spot[1]);
    await page.waitForTimeout(1200);
    check('A double click on a project opens it', view() === 'development', `view ${view()}`);
    /*
     * What opens is the place card beside the building — no column over the
     * left of the map — with the figures and the way on to sunlight.
     */
    await page.waitForTimeout(1500);
    const card = await page.evaluate(() => {
      const element = document.querySelector('.place-card--anchored');
      if (!element) return null;
      const r = element.getBoundingClientRect();
      return {
        left: r.left,
        figures: element.querySelectorAll('.place-card__figures dd').length,
        panel: document.querySelector('.panel--left') !== null,
      };
    });
    check('It opens as a card beside the building, with figures, not a side column',
      card !== null && card.left > 300 && card.figures >= 1 && !card.panel, JSON.stringify(card));
    await page.locator('.place-card--anchored').getByRole('button', { name: /Explore sunlight/ }).click();
    await page.waitForTimeout(800);
    check('"Explore sunlight" on the card opens the sunlight screen', view() === 'sunlight', `view ${view()}`);
  }
  await page.close();

  /*
   * The widest figures in the data (148-156 Queen Street: 62,754 m² of
   * office) stay inside the card, beside the building and docked on the
   * narrowest phone. "62,754 m²" once ran out past the card's edge.
   */
  for (const [width, height] of [[1440, 900], [320, 640]]) {
    page = await open(width, height, '?view=development&dev=X0014802&d=2026-06-21&t=720', '.place-card');
    await page.waitForTimeout(1500);
    const spill = await page.evaluate(() => {
      const card = [...document.querySelectorAll('.place-card')].find((e) => e.offsetParent !== null);
      if (!card) return ['no card'];
      const edge = card.getBoundingClientRect();
      return [...card.querySelectorAll('*')]
        .filter((e) => {
          const r = e.getBoundingClientRect();
          return r.width > 0 && (r.right > edge.right + 0.5 || r.left < edge.left - 0.5);
        })
        .map((e) => e.className || e.tagName);
    });
    check(`${width}×${height}: nothing on the place card runs past its edge`, spill.length === 0, spill.join(', '));

    /*
     * A drag that starts on the card, and the wheel over it, leave the map
     * where it is. The card is drawn inside the map's box, and both used to
     * reach the camera controls. Measured by the card itself: it follows its
     * building, so if the camera moved, the card would too.
     */
    if (width === 1440) {
      const where = async () => {
        const r = await page.locator('.place-card--anchored').boundingBox();
        return `${Math.round(r.x)},${Math.round(r.y)}`;
      };
      const before = await where();
      const box = await page.locator('.place-card--anchored').boundingBox();
      const x = box.x + 60;
      const y = box.y + box.height - 20;
      await page.mouse.move(x, y);
      await page.mouse.down();
      for (let i = 1; i <= 10; i++) await page.mouse.move(x - i * 25, y + i * 10);
      await page.mouse.up();
      await page.mouse.move(box.x + 100, box.y + 100);
      await page.mouse.wheel(0, 600);
      await page.waitForTimeout(1500);
      const after = await where();
      check('A drag or the wheel on the place card leaves the map still', before === after, `${before} → ${after}`);
    }
    await page.close();
  }

  /*
   * An existing building: the same double click opens its page. Found by
   * double-clicking down columns of the map until a building answers —
   * where a project answers instead, the search goes on. Each spot is
   * clicked once first, to show a single click does nothing.
   *
   * Done twice, in the left and the right half of the map, and the two must
   * be different buildings: a ray-to-building mapping that always answered
   * with the same one would otherwise pass.
   */
  const EXPLORE = '?view=explore&d=2026-06-21&t=720';
  let singleOpened = '';
  const findBuilding = async (columns) => {
    page = await open(1440, 900, EXPLORE, '.viewctl');
    try {
      for (let y = 160; y < 640; y += 40) {
        for (const x of columns) {
          await page.mouse.click(x, y);
          await page.waitForTimeout(300);
          const after = new URL(page.url()).searchParams.get('view');
          if (after !== 'explore') {
            singleOpened ||= `view ${after} at ${x},${y}`;
            return null;
          }
          await page.mouse.dblclick(x, y);
          await page.waitForTimeout(900);
          const now = new URL(page.url());
          if (now.searchParams.get('view') === 'building') return now.searchParams.get('bldg');
          if (now.searchParams.get('view') !== 'explore') {
            await page.goto(URL_ + EXPLORE);
            await page.waitForSelector('.viewctl', { timeout: 120_000 });
            await page.waitForTimeout(2500);
          }
        }
      }
      return null;
    } finally {
      await page.close();
    }
  };
  const leftBuilding = await findBuilding([300, 420, 540]);
  const rightBuilding = await findBuilding([900, 1020, 1140]);
  check('One click on a building opens nothing', singleOpened === '', singleOpened);
  check('A double click on an existing building opens its page, a different one on each side',
    leftBuilding !== null && rightBuilding !== null && leftBuilding !== rightBuilding,
    `left ${leftBuilding}, right ${rightBuilding}`);

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
  // "Details" now opens the place card beside the building; it leads back.
  await page.locator('.place-card--anchored').getByRole('button', { name: /Explore sunlight/ }).click();
  await page.waitForSelector('.timebar__play');
  const hourBack = await page.locator('.timebar__now').innerText();
  await page.waitForTimeout(1500);
  const label = await page.locator('.timebar__play').getAttribute('aria-label');
  const hourLater = await page.locator('.timebar__now').innerText();
  check('Leaving the screen stops play, and returning does not restart it',
    label === 'Play the day' && hourLater === hourBack, `${label}, ${hourBack} → ${hourLater}`);

  /*
   * Compare side by side: a page of its own with two views, the "after" one
   * drawing a project the "today" one does not, both with the map's credit;
   * and back again to one view.
   */
  await page.getByRole('button', { name: 'Compare side by side' }).click();
  const compared = await page
    .waitForSelector('.compare__canvas canvas', { timeout: 60_000 })
    .then(() => true)
    .catch(() => false);
  await page.waitForTimeout(3000);
  const canvases = await page.locator('canvas').count();
  const credits = await page.locator('.attribution').count();
  check('"Compare side by side" opens two views, each with the map credit',
    compared && canvases === 2 && credits === 2, `${canvases} views, ${credits} credits`);
  await page.screenshot({ path: join(OUT, '02b-compare.png') });
  await page.getByRole('button', { name: 'Back to sunlight' }).click();
  await page.waitForSelector('.timebar__dock');
  await page.waitForTimeout(800);
  check('"Back to sunlight" returns to one view', (await page.locator('canvas').count()) === 1);

  /*
   * How it works: the header's link opens its own page, its pictures load,
   * and from there "Back to sunlight" and "Explore the city" go where they say.
   */
  await page.locator('.header').getByRole('button', { name: 'How it works' }).click();
  await page.waitForSelector('.how img');
  await page.waitForTimeout(800);
  const pictures = await page.locator('.how img').evaluateAll((images) =>
    images.filter((image) => image.complete && image.naturalWidth > 0).length);
  check('"How it works" opens its page, with its four pictures',
    page.url().includes('view=how') && pictures === 4, `${page.url()}, ${pictures} pictures`);
  await page.screenshot({ path: join(OUT, '02c-how.png') });
  await page.locator('.how').getByRole('button', { name: 'Back to sunlight' }).click();
  await page.waitForSelector('.timebar__dock');
  check('"Back to sunlight" from How it works returns to the sunlight screen', page.url().includes('view=sunlight'));
  await page.locator('.header').getByRole('button', { name: 'How it works' }).click();
  await page.waitForSelector('.how');
  await page.locator('.how').getByRole('button', { name: 'Explore the city' }).click();
  await page.waitForTimeout(800);
  check('"Explore the city" from How it works opens the map', page.url().includes('view=explore'));
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

    /*
     * A project's page and the explore screen: the view controls and the
     * credit are on the screen, below the header, and nothing covers them —
     * upright the stack ran off the top, on its side under the header.
     */
    for (const [name, path] of [
      ['project', '?view=development&dev=X0012808'],
      ['explore', '?view=explore'],
    ]) {
      page = await open(width, height, path, '.viewctl');
      const rects = await page.evaluate(() => {
        const box = (selector) => {
          const element = document.querySelector(selector);
          if (!element) return null;
          const r = element.getBoundingClientRect();
          return { top: r.top, bottom: r.bottom, left: r.left, right: r.right };
        };
        return {
          header: box('.header'),
          controls: box('.viewctl__stack'),
          credit: box('.attribution'),
          below: box('.panel--left') ?? box('.place-card--docked') ?? box('.explore-hint'),
        };
      });
      const { header, controls, credit, below } = rects;
      const apart = (a, b) =>
        a.bottom <= b.top || b.bottom <= a.top || a.right <= b.left || b.right <= a.left;
      const fits =
        controls.top >= header.bottom && credit.top >= header.bottom &&
        controls.bottom <= below.top && credit.bottom <= below.top && apart(controls, credit);
      check(`${width}×${height} ${name}: view controls and credit sit between the header and what is below`,
        fits, `header ↓${header.bottom}, controls ${controls.top}–${controls.bottom}, credit ${credit.top}–${credit.bottom}, below ↑${below.top}`);
      await page.close();
    }
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

/*
 * Walks through the headset tasks in the simulated headset, with nothing but
 * a laser and a trigger, and says which of them worked.
 *
 *   npm run test:vr              headless, prints a result per task
 *   npm run test:vr -- --headed  the same, in a window you can watch
 *
 * WHY THIS EXISTS
 *   The unit tests cover the sums — where somebody is put down, which way
 *   they face. They cannot cover what the headset panel actually DOES when a
 *   ray lands on a button, and neither can reading the code: the first run
 *   of this found that a press held longer than 300 ms did nothing, and that
 *   pointing down at the city could press "Leave VR" through the panel.
 *   Neither shows in a test that calls functions.
 *
 * WHAT IT NEEDS
 *   Chrome (or Edge) installed — it drives the browser already on the
 *   machine, it does not download one. A dev server on localhost:5173 is used
 *   if one is running; otherwise this starts its own and stops it after.
 *   Port 5173 because that is the one the Mapbox token allows.
 *
 * WHAT IT CANNOT TELL YOU
 *   Comfort, readability at arm's length, and anything about frame rate: the
 *   software renderer here draws a few frames a second. So waits for the app
 *   to respond are counted in rendered frames, not milliseconds — and every
 *   one of them also has a wall-clock limit, so a render loop that has
 *   stopped fails the run instead of hanging it.
 *
 * HOW IT REACHES INSIDE
 *   Through the dev server's own modules: it imports the SAME module URLs the
 *   page loaded (read from the resource timing list, `?t=` query and all —
 *   a different URL is a different module instance and a different store),
 *   takes the scene from react-three-fiber's roots, and moves the simulated
 *   controllers through the simulator's on-screen handles, which it copies
 *   into the controllers every frame and would otherwise overwrite.
 */

import { chromium } from 'playwright-core';
import { mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(root, 'test-results', 'vr-check');
const URL_ = 'http://localhost:5173/';
const headed = process.argv.includes('--headed');

mkdirSync(OUT, { recursive: true });

// ── The server ─────────────────────────────────────────────────────────────

async function serverRunning() {
  try {
    const response = await fetch(URL_);
    return response.ok;
  } catch {
    return false;
  }
}

let ownServer = null;
if (!(await serverRunning())) {
  const { createServer } = await import('vite');
  ownServer = await createServer({
    root,
    server: { port: 5173, strictPort: true },
    logLevel: 'error',
  });
  await ownServer.listen();
}

// ── The browser ────────────────────────────────────────────────────────────

async function launch() {
  const options = {
    headless: !headed,
    // Software WebGL, so this runs on a machine with no usable GPU as well.
    args: headed ? [] : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
  };
  try {
    return await chromium.launch({ ...options, channel: 'chrome' });
  } catch {
    return await chromium.launch({ ...options, channel: 'msedge' });
  }
}

const browser = await launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
const pageErrors = [];
page.on('pageerror', (error) => pageErrors.push(error.message));
page.on('dialog', (dialog) => dialog.dismiss());

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? '合格  ' : '不合格'}  ${name}${detail ? `  (${detail})` : ''}`);
};

async function shoot(name) {
  await page.screenshot({ path: join(OUT, `${name}.png`) });
}

// ── Reaching inside ────────────────────────────────────────────────────────

async function instrument() {
  await page.evaluate(async () => {
    const loaded = (part) =>
      performance
        .getEntriesByType('resource')
        .map((entry) => entry.name)
        .find((name) => name.includes(part));
    const fiber = await import(loaded('/.vite/deps/@react-three_fiber.js'));
    const three = await import(loaded('/.vite/deps/three.js'));
    const xr = await import(loaded('/src/scene/xrStore.ts'));
    const rootStore = [...fiber._roots.values()][0].store;

    const t = {
      three,
      state: () => rootStore.getState(),
      xr: () => xr.xrStore().getState(),
      device: () => xr.xrStore().getState().emulator,
    };
    t.frame = () => t.state().gl.info.render.frame;
    t.panel = () => t.state().scene.getObjectByName('vr-panel');
    t.texts = () => {
      const out = [];
      t.panel()?.traverse((o) => {
        if (o.inputProperties?.text != null) out.push(String(o.inputProperties.text));
      });
      return out;
    };
    // In the panel first, then the Menu button on the left hand.
    t.findText = (text) => {
      let hit = null;
      for (const name of ['vr-panel', 'vr-menu-button']) {
        t.state().scene.getObjectByName(name)?.traverse((o) => {
          if (!hit && o.inputProperties?.text === text) hit = o;
        });
      }
      return hit;
    };
    t.origin = () => t.state().gl.xr.getCamera().parent;
    t.head = () => t.state().camera.getWorldPosition(new three.Vector3()).toArray();
    // Pose a controller through the simulator's handle, in its world, which
    // is the headset's reference space.
    t.setPose = (hand, position, quaternion) => {
      const device = t.device();
      const key = Object.getOwnPropertySymbols(device).find((s) => device[s]?.devui);
      const handle = device[key].devui.inputLayer.transformHandles.get(hand);
      const V = handle.position.constructor;
      const Q = handle.quaternion.constructor;
      handle.parent.updateWorldMatrix(true, false);
      handle.position.copy(handle.parent.worldToLocal(new V(...position)));
      const undo = handle.parent.getWorldQuaternion(new Q()).invert();
      handle.quaternion.copy(undo.multiply(new Q(...quaternion)));
    };
    t.aimAt = (hand, world) => {
      const origin = t.origin();
      origin.updateWorldMatrix(true, false);
      const local = origin.worldToLocal(world.clone());
      const from = new three.Vector3(hand === 'right' ? 0.2 : -0.2, 1.35, -0.25);
      const turn = new three.Quaternion().setFromUnitVectors(
        new three.Vector3(0, 0, -1),
        local.sub(from).normalize(),
      );
      t.setPose(hand, from.toArray(), turn.toArray());
    };
    t.aimAtText = (hand, text) => {
      const target = t.findText(text);
      if (!target) return false;
      const box = new three.Box3().setFromObject(target);
      t.aimAt(hand, box.getCenter(new three.Vector3()));
      return true;
    };
    /*
     * The veil, watched on every frame from inside the frame loop — after
     * VrWalk has placed it, before the frame is drawn. A sample taken from
     * outside, between frames, can miss the one frame a move happens on.
     * Records how far the veil ever was from the head while it was dark
     * enough to matter.
     */
    t.veilGap = 0;
    let veil = null;
    rootStore.getState().internal.subscribe(
      {
        current: () => {
          veil ??= (() => {
            let found = null;
            t.state().scene.traverse((o) => {
              if (!found && o.isMesh && o.renderOrder === 10_000) found = o;
            });
            return found;
          })();
          if (!veil || !veil.visible || veil.material.opacity < 0.5) return;
          const eyes = t.state().camera.getWorldPosition(new three.Vector3());
          t.veilGap = Math.max(t.veilGap, veil.position.distanceTo(eyes));
        },
      },
      0,
      rootStore,
    );
    window.__vrCheck = t;
  });
}

const call = (fn, ...args) => page.evaluate(fn, ...args);
const texts = () => call(() => window.__vrCheck.texts());
const head = () => call(() => window.__vrCheck.head());

/** How long any single wait may take, however few frames it asked for. */
const WAIT_LIMIT_MS = 30_000;

async function frames(n) {
  const start = await call(() => window.__vrCheck.frame());
  const deadline = Date.now() + WAIT_LIMIT_MS;
  while (Date.now() < deadline) {
    if ((await call(() => window.__vrCheck.frame())) - start >= n) return;
    await page.waitForTimeout(100);
  }
  throw new Error(`${n} フレーム待っても描画が進まない（描画が止まった可能性）`);
}

/** Polls `read` until `done` says yes, or the frame or clock limit runs out; returns the last reading. */
async function until(read, done, maxFrames) {
  const start = await call(() => window.__vrCheck.frame());
  const deadline = Date.now() + WAIT_LIMIT_MS;
  let value = await read();
  while (
    !done(value) &&
    Date.now() < deadline &&
    (await call(() => window.__vrCheck.frame())) - start < maxFrames
  ) {
    await page.waitForTimeout(150);
    value = await read();
  }
  return value;
}

/**
 * Press and release, the press held across at least one whole frame.
 *
 * Not longer. A click must be released within two seconds (xrStore.ts), and
 * the software renderer here can fall to a frame or two a second after a move
 * — so a hold counted as three frames sometimes outlasted the limit and a
 * working button was reported as dead. On the headset a frame is 14 ms.
 */
async function pull(hand, button = 'trigger') {
  await call(({ hand, button }) => window.__vrCheck.device().controllers[hand].updateButtonValue(button, 1), { hand, button });
  await frames(2);
  await call(({ hand, button }) => window.__vrCheck.device().controllers[hand].updateButtonValue(button, 0), { hand, button });
  await frames(3);
}

/**
 * Aim at a button and pull the trigger, re-aiming at every step.
 *
 * A person keeps the laser on what they mean; a script aims once. The panel
 * can move between the two — it is re-placed a frame after it is called up,
 * and it rides on the player during a move — so an aim taken a few frames
 * early lands beside the button and the press is lost.
 */
/*
 * A press that is followed by nothing is pressed once more — and said so.
 *
 * On this software renderer, at a few frames a second, the press and the
 * release sometimes fall so that the pointer library never sees a click; the
 * same press made again goes through, and a headset at 72 frames a second has
 * not shown the problem. Retrying hides nothing: every button that needed a
 * second press is listed at the end of the run, so a button that really
 * needs two presses would show up there every time.
 */
const retried = [];

async function press(text, happened) {
  await pressOnce(text);
  if (!happened) return;
  if (await until(happened, (ok) => ok, 30)) return;
  retried.push(text);
  await pressOnce(text);
}

async function pressOnce(text) {
  const aim = () => call(({ text }) => window.__vrCheck.aimAtText('right', text), { text });
  if (!(await aim())) throw new Error(`パネルに「${text}」が見つからない`);
  await frames(3);
  await aim();
  await call(() => window.__vrCheck.device().controllers.right.updateButtonValue('trigger', 1));
  // Held across two frames: one can end the moment it is counted, leaving the
  // press and the release in the same frame. Not longer — see pull().
  await frames(2);
  await aim();
  await call(() => window.__vrCheck.device().controllers.right.updateButtonValue('trigger', 0));
  await frames(3);
}

/** Head position, once it satisfies `arrived` — a move takes a fade and a few frames. */
async function headOnce(arrived, maxFrames = 60) {
  return until(head, arrived, maxFrames);
}

/**
 * The panel's words, once they say what is expected — or as they are after
 * giving up. A press is answered by a React render and then a uikit layout,
 * which at a few frames a second takes several frames; reading straight after
 * the press read the previous answer and reported a working button as broken.
 */
async function textsOnce(expected, maxFrames = 40) {
  return until(texts, expected, maxFrames);
}
const hourIn = (seen) => seen.find((text) => /^\d{1,2}:\d{2}$/.test(text));

/**
 * Press a page button that starts a session, and wait until one is running.
 * Returns how long the view stayed dark after the session began, ms, or null
 * if the veil could not be found.
 */
async function enterThrough(button) {
  await button.click();
  await page.waitForFunction(
    async () => {
      const url = performance
        .getEntriesByType('resource')
        .map((entry) => entry.name)
        .find((name) => name.includes('/src/scene/xrStore.ts'));
      return (await import(url)).xrStore().getState().session != null;
    },
    null,
    { timeout: 30_000 },
  );
  await instrument();
  /*
   * Timed from the session's first drawn frame, so what is measured is the
   * blackout itself — not the software renderer's start-up (shader compiles
   * and the like, a second or more here and a fraction of that on a headset)
   * and not the state some time afterwards.
   */
  const firstFrame = await call(() => window.__vrCheck.frame());
  const startDeadline = Date.now() + WAIT_LIMIT_MS;
  while ((await call(() => window.__vrCheck.frame())) === firstFrame && Date.now() < startDeadline) {
    await page.waitForTimeout(20);
  }
  const began = Date.now();
  let darkFor = null;
  const deadline = began + 10_000;
  while (Date.now() < deadline) {
    const up = await call(() => {
      let veil = null;
      window.__vrCheck.state().scene.traverse((o) => {
        if (!veil && o.isMesh && o.renderOrder === 10_000) veil = o;
      });
      return veil ? veil.visible && veil.material.opacity > 0 : null;
    });
    if (up === false) {
      darkFor = Date.now() - began;
      break;
    }
    await page.waitForTimeout(50);
  }
  await frames(10);
  return darkFor;
}

/** Aim ahead and down at the ground in front of the subject, as a reader would. */
async function aimAtGroundAhead(heightM) {
  await call(({ heightM }) => {
    const t = window.__vrCheck;
    // The same sums as overlookFor: how high the platform is, how far out.
    const up = Math.min(400, Math.max(120, heightM + 60));
    const out = Math.min(600, Math.max(180, heightM * 1.6 + 120));
    const origin = t.origin();
    origin.updateWorldMatrix(true, false);
    const ahead = new t.three.Vector3(0, 0, -1).applyQuaternion(t.state().gl.xr.getCamera().quaternion);
    ahead.y = 0;
    ahead.normalize();
    t.aimAt('right', origin.localToWorld(new t.three.Vector3(ahead.x * out * 0.7, -up, ahead.z * out * 0.7)));
  }, { heightM });
}

/** Put the panel away, point at the smallest clickable thing in the city, press, bring the panel back. */
async function pointAtAProposal() {
  await pull('left', 'x-button');
  // Wait for the panel to be away: aimed while it is still up, the laser
  // would land on the panel, which outranks the city.
  {
    const start = await call(() => window.__vrCheck.frame());
    while (
      (await call(() => window.__vrCheck.panel().visible)) &&
      (await call(() => window.__vrCheck.frame())) - start < 40
    ) {
      await page.waitForTimeout(150);
    }
  }
  await call(() => {
    const t = window.__vrCheck;
    const box = new t.three.Box3();
    const found = [];
    t.state().scene.traverse((o) => {
      if (!o.isMesh || !o.__r3f?.handlers?.onClick) return;
      for (let p = o; p; p = p.parent) if (p.name === 'vr-panel' || p.name === 'vr-menu-button') return;
      box.setFromObject(o);
      found.push({ size: box.getSize(new t.three.Vector3()).length(), centre: box.getCenter(new t.three.Vector3()) });
    });
    // The smallest clickable thing is one proposal rather than the ground.
    found.sort((a, b) => a.size - b.size);
    t.aimAt('right', found[0].centre);
  });
  await frames(3);
  await pull('right');
  await pull('left', 'x-button');
}

// ── The tasks ──────────────────────────────────────────────────────────────

try {
  /*
   * Opened at 20:00 on 21 June — after dark — so the run does not depend on
   * what the Melbourne clock happens to read, and so the headset has to deal
   * with night on the way in (see enterVr in App.tsx).
   */
  await page.goto(`${URL_}?d=2026-06-21&t=1200#vr-sim`, { waitUntil: 'domcontentloaded' });

  // 0. From the front door.
  const enter = page.getByRole('button', { name: 'Enter in VR' });
  const offered = await enter
    .waitFor({ timeout: 90_000 })
    .then(() => true)
    .catch(() => false);
  check('ランディングに「Enter in VR」が出る', offered);
  if (!offered) throw new Error('VR に入れないので、ここで打ち切ります');
  await shoot('00-landing');

  const darkFor = await enterThrough(enter);

  // 1. Arriving — and not left in the dark. The fade may never last more than
  // a second (VrWalk's DARK_AT_MOST_MS); the allowance over that is this
  // software renderer's frame time and the polling, not the app.
  check('VR に入ってから暗転が明けるまで 2 秒以内（上限 1 秒 + 描画の遅れ）',
    darkFor !== null && darkFor <= 2000, darkFor === null ? '幕が消えなかった' : `${darkFor} ms`);

  let seen = await texts();
  check('入ると場所の一覧が目の前に出る', seen.includes('Choose a place'));
  const above = await head();
  check('街の上空に立っている', above[1] > 300, `頭の高さ ${above[1].toFixed(0)} m`);
  await shoot('01-arrive');

  // 1b. The sky is inside what the headset draws.
  const sky = await call(() => {
    const t = window.__vrCheck;
    let dome = null;
    t.state().scene.traverse((o) => {
      if (!dome && o.isMesh && o.renderOrder === -1 && o.geometry?.parameters?.radius) dome = o;
    });
    const centre = dome.getWorldPosition(new t.three.Vector3());
    const scale = dome.getWorldScale(new t.three.Vector3()).x;
    const eyes = t.state().camera.getWorldPosition(new t.three.Vector3());
    return {
      radius: Math.round(dome.geometry.parameters.radius * scale),
      offset: Math.round(centre.distanceTo(eyes)),
      far: t.xr().session.renderState.depthFar,
    };
  });
  // Well inside the range, not merely inside it: a device may clamp far.
  check('VR でも空のドームが頭の位置にあり、描画範囲に十分収まる', sky.offset < 1 && sky.radius <= 0.5 * sky.far,
    `ドームの実際の半径 ${sky.radius} m、頭からのずれ ${sky.offset} m、描画範囲 ${sky.far} m`);
  /*
   * What a Quest showed: the headset clears to black, where the emulator
   * clears to the page's beige. Clear to black here as well, and the sky
   * must still be the dome's, not the clear colour.
   */
  await call(() => {
    const t = window.__vrCheck;
    t.savedBackground = t.state().scene.background;
    t.state().scene.background = new t.three.Color('#000000');
  });
  await frames(3);
  await shoot('01b-cleared-to-black');
  await call(() => {
    const t = window.__vrCheck;
    t.state().scene.background = t.savedBackground;
  });

  // 2. Pointing at a proposal in the city, panel put away.
  await pointAtAProposal();
  seen = await textsOnce((now) => now.includes('Measure a spot'));
  const addressIn = (now) => now.find((text) => /^\d[\d-]* [A-Z]/.test(text) && !/ of /.test(text));
  check('パネルを消して街の開発計画を指すと、その場所が開く', seen.includes('Measure a spot'), addressIn(seen));
  check('夜に VR に入ると 12:00 に切り替わり、その理由がパネルに出る',
    hourIn(seen) === '12:00' && seen.some((text) => /^The sun is down/.test(text)),
    `${hourIn(seen)} / ${seen.find((text) => /^The sun is down/.test(text)) ?? '説明なし'}`);

  // 3. The list: back to it, its pages, its order, and choosing from it.
  await press('Places', async () => (await texts()).includes('Choose a place'));
  seen = await textsOnce((now) => now.includes('Choose a place'));
  check('「Places」で場所の一覧に戻る', seen.includes('Choose a place'));

  const pageIn = (now) => now.find((text) => /^\d+ of \d+$/.test(text));
  const firstPage = pageIn(seen);
  await press('Next', async () => /^2 of/.test(pageIn(await texts()) ?? ''));
  seen = await textsOnce((now) => pageIn(now) !== firstPage);
  const secondPage = pageIn(seen);
  check('「Next」で次のページになる', /^2 of/.test(secondPage ?? ''), `${firstPage} → ${secondPage}`);
  // The right stick, pushed down and let back.
  await call(() => window.__vrCheck.device().controllers.right.updateAxes('thumbstick', 0, 1));
  await frames(3);
  await call(() => window.__vrCheck.device().controllers.right.updateAxes('thumbstick', 0, 0));
  seen = await textsOnce((now) => pageIn(now) !== secondPage);
  check('右スティックを下に倒すと、もう1ページ進む', /^3 of/.test(pageIn(seen) ?? ''), `${secondPage} → ${pageIn(seen)}`);
  await press('Previous');
  await press('Previous');
  seen = await textsOnce((now) => /^1 of/.test(pageIn(now) ?? ''));

  // Nearest first: the distances on the first page never go down.
  const away = seen
    .filter((text) => / away$/.test(text))
    .map((text) => (/km/.test(text) ? parseFloat(text) * 1000 : parseFloat(text)));
  check('「Nearest」で近い順に並ぶ', away.length >= 3 && away.every((d, i) => i === 0 || d >= away[i - 1]),
    away.map((d) => `${d} m`).join(', '));

  const rows = seen.filter((text) => /^\d[\d-]* [A-Z]/.test(text) && !/ of /.test(text));
  const row = rows[1];
  await press(row, async () => {
    const now = await texts();
    return now.includes(row) && now.includes('Measure a spot');
  });
  seen = await textsOnce((now) => now.includes('Measure a spot'));
  check('一覧の行を選ぶと、その場所の日照画面になる', seen.includes(row) && seen.includes('Measure a spot'), row);
  const overPlace = await headOnce((at) => Math.hypot(at[0] - above[0], at[2] - above[2]) > 50);
  check('選んだ場所の上空へ移動する', Math.hypot(overPlace[0] - above[0], overPlace[2] - above[2]) > 50,
    `${Math.hypot(overPlace[0] - above[0], overPlace[2] - above[2]).toFixed(0)} m 移動`);
  await shoot('02-place');

  // 4. Season and hour.
  // The run starts in June, so pressing Winter would prove nothing: Summer.
  await press('Summer', async () => (await texts()).some((text) => /December/.test(text)));
  seen = await textsOnce((now) => now.some((text) => /December/.test(text)));
  const when = seen.find((text) => /December/.test(text));
  const toMinutes = (clock) => (clock ? Number(clock.slice(0, -3)) * 60 + Number(clock.slice(-2)) : NaN);
  const hourBefore = hourIn(seen);
  await press('+1 h', async () => hourIn(await texts()) !== hourBefore);
  seen = await textsOnce((now) => hourIn(now) !== hourBefore);
  const hourAfter = hourIn(seen);
  check('「Summer」で12月の日付になる', /December/.test(when ?? ''), when);
  check('「+1 h」で時刻がちょうど1時間進む', toMinutes(hourAfter) - toMinutes(hourBefore) === 60,
    `${hourBefore} → ${hourAfter}`);

  // 4b. The laser on a button: can the reader see where it is?
  await call(() => window.__vrCheck.aimAtText('right', 'Summer'));
  await frames(4);
  const pointer = await call(() => {
    const t = window.__vrCheck;
    let cursor = null;
    let ray = null;
    t.state().scene.traverse((o) => {
      if (!o.isMesh || !o.visible) return;
      const kind = o.material?.constructor?.name;
      if (kind === 'OnTopCursorMaterial') cursor = o;
      if (kind === 'PointerRayMaterial') ray = o;
    });
    let panelOrder = 0;
    t.panel().traverse((o) => {
      panelOrder = Math.max(panelOrder, o.renderOrder ?? 0);
    });
    return {
      cursor: cursor && { order: cursor.renderOrder, depthTest: cursor.material.depthTest },
      ray: ray && { order: ray.renderOrder },
      panelOrder,
    };
  });
  check(
    'パネルを指すと、カーソルとレーザーがパネルより手前に見える',
    Boolean(pointer.cursor && pointer.ray) &&
      pointer.cursor.order > pointer.panelOrder &&
      pointer.ray.order > pointer.panelOrder &&
      pointer.cursor.depthTest === false,
    JSON.stringify(pointer),
  );
  await shoot('02b-pointing-at-button');

  // 5. Measuring a spot.
  await press('Measure a spot', async () => (await texts()).includes('Point at the ground and pull the trigger.'));
  seen = await textsOnce((now) => now.includes('Point at the ground and pull the trigger.'));
  check('「Measure a spot」で地面を指す状態になる', seen.includes('Point at the ground and pull the trigger.'));
  await aimAtGroundAhead(Number(/(\d+) m/.exec(seen.find((text) => /Approved development/.test(text)) ?? '')?.[1] ?? 60));
  await frames(3);
  await pull('right');
  seen = await textsOnce((now) => now.includes('Measure another spot'));
  const figure = seen.includes('Measure another spot')
    ? seen.find((text) => /^\d+ (h|min)/.test(text) || /takes no direct sun/.test(text))
    : null;
  check('地面を指してトリガーを引くと、日照の数値が出る', Boolean(figure), figure ?? '');
  await shoot('03-measured');

  // 6. Down to the street, and back up — with the veil watched throughout.
  await call(() => {
    window.__vrCheck.veilGap = 0;
  });
  await press(seen.includes('Stand at the spot') ? 'Stand at the spot' : 'Stand in the street', async () => (await head())[1] < 80);
  seen = await textsOnce((now) => now.includes('Go back up'));
  const street = await headOnce((at) => at[1] < 80);
  check('「Stand at the spot」で路上に立つ', street[1] < 80, `頭の高さ ${street[1].toFixed(0)} m`);
  check('路上では「Go back up」が出る', seen.includes('Go back up'));
  await shoot('04-street');
  await press('Go back up', async () => (await head())[1] > 100);
  const back = await headOnce((at) => at[1] > 100);
  check('「Go back up」で上空に戻る', back[1] > 100, `頭の高さ ${back[1].toFixed(0)} m`);
  const gap = await call(() => window.__vrCheck.veilGap);
  // The sphere is 0.3 m across the head; outside that, a frame went unveiled.
  check('移動中、暗転の幕が毎フレーム頭の位置にある', gap < 0.3, `頭からの最大のずれ ${gap.toFixed(2)} m`);

  // 7. The panel, away and back.
  // Shown or hidden is a React render away, like the words; waited for.
  const panelShownOnce = (expected) =>
    until(() => call(() => window.__vrCheck.panel().visible), (shown) => shown === expected, 40);
  await pull('left', 'x-button');
  const hidden = !(await panelShownOnce(false));
  await pull('left', 'x-button');
  const shownAgain = await panelShownOnce(true);
  check('左手の X でパネルが消えて、もう一度で戻る', hidden && shownAgain);

  // 7b. Minimise, and back.
  await press('Minimise', async () => (await texts()).includes('Open'));
  seen = await textsOnce((now) => now.includes('Open'));
  check('「Minimise」で時刻と場所だけの小さなバーになる',
    seen.includes('Open') && !seen.includes('Measure a spot') && !seen.includes('Measure another spot') && Boolean(hourIn(seen)),
    seen.join(' / '));
  await shoot('04c-minimised');
  await press('Open', async () => (await texts()).includes('Minimise'));
  seen = await textsOnce((now) => now.includes('Minimise'));
  check('「Open」で元の大きさに戻る', seen.includes('Minimise'));

  // 7c. Hide, and the Menu button on the left hand brings it back.
  await press('Hide', async () => !(await call(() => window.__vrCheck.panel().visible)));
  const hiddenByButton = !(await panelShownOnce(false));
  const menuShown = await until(
    () => call(() => window.__vrCheck.state().scene.getObjectByName('vr-menu-button')?.visible === true),
    (shown) => shown,
    20,
  );
  await shoot('04d-menu-on-hand');
  check('「Hide」でパネルが消え、左手に「Menu」ボタンが出る', hiddenByButton && menuShown,
    `パネル ${hiddenByButton ? '消えた' : '残っている'} / Menu ${menuShown ? '出ている' : '出ていない'}`);
  await press('Menu', async () => call(() => window.__vrCheck.panel().visible));
  const backByMenu = await panelShownOnce(true);
  const menuGone = await until(
    () => call(() => window.__vrCheck.state().scene.getObjectByName('vr-menu-button')?.visible === false),
    (gone) => gone,
    20,
  );
  check('左手の「Menu」を押すとパネルが戻り、Menu は消える', backByMenu && menuGone);
  await shoot('04b-back-from-menu');

  // 8. Leaving, which asks first.
  await press('Leave VR', async () => (await texts()).includes('Yes, leave VR'));
  seen = await textsOnce((now) => now.includes('Yes, leave VR'));
  const stillIn = await call(() => window.__vrCheck.xr().session != null);
  check('「Leave VR」はすぐには出ずに確認する', stillIn && seen.includes('Yes, leave VR'));
  await press('Yes, leave VR', async () => call(() => window.__vrCheck.xr().session == null));
  await page.waitForTimeout(2000);
  const out = await call(() => window.__vrCheck.xr().session == null);
  check('「Yes, leave VR」で VR を出る', out);
  await shoot('05-after');

  // ── B. From a building's page, as a shared link opens it ─────────────────
  const building = '60626413-853e-4a38-88d9-9337629eb7c9'; // 206-218 Bourke Street
  await page.goto(`${URL_}?view=sunlight&bldg=${building}#vr-sim`, { waitUntil: 'domcontentloaded' });
  const headerEnter = page.getByRole('button', { name: 'Enter VR', exact: true });
  await headerEnter.waitFor({ timeout: 90_000 });
  const search = page.getByPlaceholder('Search a street or address');
  await search.fill('Bourke');

  // 9. A session that is refused leaves the page exactly as it was.
  const errorsBefore = pageErrors.length;
  await call(() => {
    navigator.xr.requestSession = () => Promise.reject(new DOMException('refused', 'NotAllowedError'));
  });
  await headerEnter.click();
  await page.waitForTimeout(1500);
  const refusedIn = await call(async () => {
    const url = performance
      .getEntriesByType('resource')
      .map((entry) => entry.name)
      .find((name) => name.includes('/src/scene/xrStore.ts'));
    return (await import(url)).xrStore().getState().session != null;
  });
  const kept = (await search.inputValue()) === 'Bourke';
  check('VR の開始が拒否されても、画面（検索欄）がそのまま残る', !refusedIn && kept && pageErrors.length === errorsBefore,
    `検索欄 "${await search.inputValue()}"、新しいページのエラー ${pageErrors.length - errorsBefore} 件`);
  await call(() => {
    // The simulator's own method again, from its prototype.
    delete navigator.xr.requestSession;
  });

  // 10. Re-choosing by pointing forgets the old spot.
  await enterThrough(headerEnter);
  seen = await textsOnce((now) => now.includes('Measure a spot'));
  const buildingTitle = '206-218 Bourke Street';
  await press('Measure a spot', async () => (await texts()).includes('Point at the ground and pull the trigger.'));
  await textsOnce((now) => now.includes('Point at the ground and pull the trigger.'));
  await aimAtGroundAhead(Number(/(\d+) m/.exec(seen.find((text) => /Existing building/.test(text)) ?? '')?.[1] ?? 30));
  await frames(3);
  await pull('right');
  seen = await textsOnce((now) => now.includes('Measure another spot'));
  check('既存建物でも地点を測れる', seen.includes('Measure another spot'), buildingTitle);
  await pointAtAProposal();
  seen = await textsOnce((now) => !now.includes(buildingTitle));
  check('指して別の計画を選び直すと、前の地点が消える',
    !seen.includes(buildingTitle) && seen.includes('Measure a spot') && !seen.includes('Measure another spot'),
    `${buildingTitle} → ${addressIn(seen)}`);
  await shoot('06-rechosen');
} catch (error) {
  check('途中で止まらずに最後まで進む', false, error.message.split('\n')[0]);
} finally {
  await browser.close();
  await ownServer?.close();
}

const failed = results.filter((result) => !result.ok);
console.log('');
console.log(`${results.length - failed.length} / ${results.length} 合格。スクリーンショット: ${OUT}`);
if (retried.length) console.log(`押し直しが必要だった操作（エミュレーターの描画の遅さによるもの）: ${retried.join(', ')}`);
if (pageErrors.length) {
  console.log(`ページのエラー ${pageErrors.length} 件:`);
  for (const message of pageErrors.slice(-5)) console.log(`  ${message}`);
}
process.exit(failed.length ? 1 : 0);

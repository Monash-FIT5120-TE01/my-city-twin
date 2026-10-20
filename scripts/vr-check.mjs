/*
 * Walks through the headset tasks in the simulated headset, with nothing but
 * a laser and a trigger, and says which of them worked.
 *
 *   npm run test:vr              headless, prints a result per task
 *   npm run test:vr -- --headed  the same, in a window you can watch
 *   npm run test:vr -- --gpu     headless, drawn on the GPU instead of in software
 *
 * WHEN TO USE --gpu
 *   When the machine is busy. The software renderer then falls to a frame
 *   every second or two, a press held for "two frames" outlasts the two
 *   seconds a click is allowed (xrStore.ts), and working buttons are reported
 *   dead — the place list's Next failed that way with nothing changed. On the
 *   GPU a frame is tens of milliseconds, as it is on the headset.
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
const gpu = process.argv.includes('--gpu');
/** Records a CPU profile around choosing a place and standing in the street, and prints what took the time. */
const profile = process.argv.includes('--profile');
/** Opens the first page with ?vrdebug, and prints what its log noted about moves and stalls at the end. */
const vrdebug = process.argv.includes('--vrdebug');
/** Walks the Flat card (choose a building, floor and side, go in, come out) and takes a picture at each step. */
const flatShots = process.argv.includes('--flat-shots');
let debugLines = [];

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
    // Software WebGL by default, so this runs on a machine with no usable GPU as well.
    args: headed
      ? []
      : gpu
        ? ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist']
        : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'],
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

/** Every check's outcome, for the summary at the end. */
const results = [];
/** Records one task's outcome and prints it at once: PASS or FAIL, the task, and any detail. */
const check = (name, ok, detail = '') => {
  results.push({ name, ok, detail });
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
};

async function shoot(name) {
  // A screenshot holds the page for most of a second, which the stall log would count as the app's.
  if (vrdebug) return;
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
    /** Where a piece of text is, in the world, or null. */
    t.worldOf = (text) => {
      const target = t.findText(text);
      return target ? new three.Box3().setFromObject(target).getCenter(new three.Vector3()).toArray() : null;
    };
    /**
     * The middle of the white bar under the menu, in the world. See VrPanel: 660 mm cards, 18 mm gap,
     * the 88 mm navigation, 16 mm gap, the 40 mm bar — 822 mm in all, centred on the rig.
     */
    t.windowBar = () => {
      const rig = t.state().scene.getObjectByName('vr-menu');
      rig.updateWorldMatrix(true, false);
      return rig.localToWorld(new three.Vector3(0, -(822 / 2 - 20) / 1000, 0));
    };
    /*
     * The middle of the city map's picture, give or take (dx, dy) metres across it. From the card's title: the
     * frame is 508 x 556 mm, its left edge under the title's, its top 50 mm under the title row's top.
     */
    t.aimAtMap = (hand, dx = 0, dy = 0) => {
      const title = t.findText('City map');
      const rig = t.state().scene.getObjectByName('vr-menu');
      if (!title || !rig) return false;
      rig.updateWorldMatrix(true, false);
      const box = new three.Box3().setFromObject(title);
      const local = rig.worldToLocal(box.getCenter(new three.Vector3()));
      const left = rig.worldToLocal(box.min.clone()).x;
      const top = local.y + (box.max.y - box.min.y) / 2;
      local.set(left + 0.254 + dx, top - 0.05 - 0.278 + dy, local.z);
      t.aimAt(hand, rig.localToWorld(local));
      return true;
    };
    /*
     * A share of the way along the day bar (0 = the first hour, 1 = the last). From the middles of "-10 min" and
     * "+10 min" (middles, which do not change as the menu turns, unlike a box's corner): halfway between them
     * is the card's middle, and the bar's picture is centred on it; the picture ends 7 mm above the buttons'
     * top, and the bar runs 12-280 mm across its 292, its middle 45 mm above its foot.
     */
    t.aimAtDayBar = (hand, share) => {
      const minus = t.findText('-10 min');
      const plus = t.findText('+10 min');
      const rig = t.state().scene.getObjectByName('vr-menu');
      if (!minus || !plus || !rig) return false;
      rig.updateWorldMatrix(true, false);
      const middleOf = (o) => rig.worldToLocal(new three.Box3().setFromObject(o).getCenter(new three.Vector3()));
      const a = middleOf(minus);
      const b = middleOf(plus);
      const at = a.clone().add(b).multiplyScalar(0.5);
      at.set(at.x + (0.012 + share * 0.268 - 0.146), at.y + 0.03 + 0.007 + 0.045, at.z);
      t.aimAt(hand, rig.localToWorld(at));
      return true;
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
    /*
     * The "Going to …" pill (VrLoader), watched the same way: the furthest it
     * ever was from the eyes while up, and the text-free fact that it came up.
     */
    t.loader = { seen: 0, furthest: 0 };
    let veil = null;
    rootStore.getState().internal.subscribe(
      {
        current: () => {
          // A tram followed frame by frame (6a): its drawn front, and the simulation's clock.
          const watch = t.tramWatch;
          const layer = window.__trams;
          if (watch && layer && watch.frames.length < 60) {
            // Not while the timetable is still being run on fast to catch up (the warm-up): seconds a frame then.
            const warming = watch.lastTime === undefined || layer.sim.time - watch.lastTime > 0.5;
            watch.lastTime = layer.sim.time;
            // Anything followed before or during it is started over: the tram may have left in the meantime.
            if (warming) { watch.id = null; watch.frames = []; }
            const tram = warming ? null : layer.sim.trams.find((x) => (watch.id === null ? x.v > 3 : x.id === watch.id));
            if (tram) {
              watch.id = tram.id;
              watch.frames.push({ s: layer.shownS(tram), time: layer.sim.time });
            }
            // A tram that has left is not swapped for another: two trams' fronts are not one tram's steps.
          }
          const loader = t.state().scene.getObjectByName('vr-loader');
          if (loader?.visible) {
            t.loader.seen += 1;
            const eyes = t.state().camera.getWorldPosition(new three.Vector3());
            t.loader.furthest = Math.max(t.loader.furthest, loader.getWorldPosition(new three.Vector3()).distanceTo(eyes));
            const look = t.state().camera.getWorldDirection(new three.Vector3());
            const to = loader.getWorldPosition(new three.Vector3()).sub(eyes).normalize();
            t.loader.offCentreDeg = Math.max(t.loader.offCentreDeg ?? 0, (look.angleTo(to) * 180) / Math.PI);
          }
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

/**
 * With --profile: runs `act` under the CPU profiler and prints the functions
 * that took the most time of their own, and the longest single task.
 */
async function profiled(name, act) {
  if (!profile) return act();
  const cdp = await page.context().newCDPSession(page);
  await call(() => {
    window.__longest = 0;
    window.__longObserver ??= new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) window.__longest = Math.max(window.__longest, entry.duration);
    });
    window.__longObserver.observe({ type: 'longtask' });
  });
  await cdp.send('Profiler.enable');
  await cdp.send('Profiler.setSamplingInterval', { interval: 500 });
  await cdp.send('Profiler.start');
  const result = await act();
  const { profile: cpu } = await cdp.send('Profiler.stop');
  const longest = await call(() => window.__longest);
  const dt = new Map();
  cpu.samples.forEach((id, i) => dt.set(id, (dt.get(id) ?? 0) + (cpu.timeDeltas[i] ?? 0) / 1000));
  const self = new Map();
  for (const node of cpu.nodes) {
    const { functionName, url, lineNumber } = node.callFrame;
    if (['(idle)', '(program)', '(garbage collector)'].includes(functionName) && !dt.get(node.id)) continue;
    const key = `${functionName || '(anonymous)'}  ${url.replace(/^.*\/(src|node_modules|\.vite)\//, '$1/').replace(/\?.*$/, '')}:${lineNumber + 1}`;
    self.set(key, (self.get(key) ?? 0) + (dt.get(node.id) ?? 0));
  }
  console.log(`
── profile: ${name} — longest task ${longest.toFixed(0)} ms`);
  [...self.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25)
    .forEach(([key, ms]) => console.log(`${ms.toFixed(0).padStart(7)} ms  ${key}`));
  await cdp.detach();
  return result;
}
const texts = () => call(() => window.__vrCheck.texts());
const head = () => call(() => window.__vrCheck.head());

/** How long any single wait may take, however few frames it asked for. */
const WAIT_LIMIT_MS = 30_000;

/** Waits until the page has drawn `n` more frames; throws if it stops drawing. */
async function frames(n) {
  const start = await call(() => window.__vrCheck.frame());
  const deadline = Date.now() + WAIT_LIMIT_MS;
  while (Date.now() < deadline) {
    if ((await call(() => window.__vrCheck.frame())) - start >= n) return;
    await page.waitForTimeout(100);
  }
  throw new Error(`${n} frames passed without rendering progress (rendering may have stalled)`);
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

/** Aims the right-hand laser at the panel's button labelled `text` and pulls the trigger once. */
async function pressOnce(text) {
  const aim = () => call(({ text }) => window.__vrCheck.aimAtText('right', text), { text });
  if (!(await aim())) throw new Error(`"${text}" not found on the panel`);
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
  await page.goto(`${URL_}?d=2026-06-21&t=1200${vrdebug ? '&vrdebug' : ''}#vr-sim`, { waitUntil: 'domcontentloaded' });
  // The log's panel sits over the page's buttons; it keeps writing while hidden.
  if (vrdebug) await page.addStyleTag({ content: '#vrdebug-panel { display: none !important; }' });

  // 0. From the front door.
  const enter = page.getByRole('button', { name: 'Enter in VR' });
  const offered = await enter
    .waitFor({ timeout: 90_000 })
    .then(() => true)
    .catch(() => false);
  check('The landing page offers "Enter in VR"', offered);
  if (!offered) throw new Error('Cannot enter VR, stopping here');
  await shoot('00-landing');

  const darkFor = await enterThrough(enter);

  // 1. Arriving — and not left in the dark. The fade may never last more than
  // a second (VrWalk's DARK_AT_MOST_MS); the allowance over that is this
  // software renderer's frame time and the polling, not the app.
  check('The fade clears within 2 s of entering VR (1 s limit + render lag)',
    darkFor !== null && darkFor <= 2000, darkFor === null ? 'the fade never cleared' : `${darkFor} ms`);

  // 1a. The controls tutorial comes first, every time, and is walked through
  // with nothing but the laser and the trigger (vrTutorial.ts).
  let seen = await textsOnce((s) => s.includes('Welcome to Live Melbourne'));
  const frameMs = async () => {
    const began = Date.now();
    await frames(5);
    return Math.round((Date.now() - began) / 5);
  };
  check('On entering, the controls tutorial is in front of the viewer', seen.includes('Welcome to Live Melbourne'),
    `${await frameMs()} ms a frame here`);
  await shoot('01a-tutorial');
  await press('Try it: point here and pull the trigger', async () =>
    (await texts()).includes('Well done - that is every button here.'));
  seen = await texts();
  check('The tutorial\'s practice button answers the trigger', seen.includes('Well done - that is every button here.'));
  await shoot('01b-tutorial-practice');
  for (const title of ['Walk and turn', 'Move the sun', 'Open or close the menu', 'In the street', 'Leaving VR']) {
    await press('Next', async () => (await texts()).includes(title));
    await textsOnce((now) => now.includes(title));
  }
  seen = await texts();
  check('Next goes through every page of the tutorial', seen.includes('Leaving VR') && seen.includes('Start exploring'),
    seen.find((text) => /^Controls \| /.test(text)) ?? seen.slice(0, 4).join(' / '));
  await shoot('01c-tutorial-last');
  await press('Start exploring', async () => (await texts()).includes('Explore Melbourne'));

  seen = await texts();
  check('After the tutorial, the place list is in front of the viewer', seen.includes('Explore Melbourne'),
    `${await frameMs()} ms a frame here`);

  // One menu of three cards once the tutorial is done: Map, City map, Sun & time.
  seen = await textsOnce((now) => now.includes('City map') && now.includes('Sun & time'));
  check('After the tutorial, the menu shows Map, City map and Sun & time together',
    seen.includes('Map') && seen.includes('City map') && seen.includes('Sun & time'));
  await shoot('01d-three-panels');

  // More > Show the tutorial again brings the tutorial back; Skip puts it away again from any page.
  // The way back is inside More since 2026-10-19: More's middle card is the controls and the tutorial again.
  await press('More', async () => (await texts()).includes('Show the tutorial again'));
  await frames(5);
  await shoot('01e-more-and-help');
  await press('Show the tutorial again', async () => (await texts()).includes('Welcome to Live Melbourne'));
  check('More > Show the tutorial again opens the tutorial', (await texts()).includes('Welcome to Live Melbourne'));
  await press('Skip', async () => !(await texts()).includes('Welcome to Live Melbourne'));
  seen = await texts();
  check('Skip closes the tutorial', !seen.includes('Welcome to Live Melbourne') && seen.includes('Show the tutorial again'));
  await press('Map', async () => (await texts()).includes('Explore Melbourne'));
  const above = await head();
  check('Standing above the city', above[1] > 300, `head height ${above[1].toFixed(0)} m`);
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
  check('In VR the sky dome is centred on the head and well inside the draw range', sky.offset < 1 && sky.radius <= 0.5 * sky.far,
    `dome radius ${sky.radius} m, offset from head ${sky.offset} m, draw range ${sky.far} m`);
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
  seen = await textsOnce((now) => now.includes('Details'));
  const addressIn = (now) => now.find((text) => /^\d[\d-]* [A-Z]/.test(text) && !/ of /.test(text));
  check('With the menu closed, pointing at a proposal in the city chooses it', seen.includes('Details'), addressIn(seen));
  check('Entering VR at night switches to 12:00 and the panel says why',
    hourIn(seen) === '12:00' && seen.some((text) => /^The sun is down/.test(text)),
    `${hourIn(seen)} / ${seen.find((text) => /^The sun is down/.test(text)) ?? 'no explanation'}`);

  // 3. The map: a press drops a spot, and what stands within 150 m of it is listed, nearest first.
  await press('Map', async () => (await texts()).includes('City map'));
  const subjectTitle = addressIn(await texts());
  await call(() => window.__vrCheck.aimAtMap('right'));
  await frames(3);
  await pull('right');
  seen = await textsOnce((now) => now.includes('Near this spot'));
  check('Pressing the city map drops a spot and lists what stands near it', seen.includes('Near this spot'),
    seen.find((text) => /within 150 m/.test(text)) ?? 'no list');
  await shoot('02a-near-spot');

  // The list scrolls: the right stick pushed down carries the rows up.
  const firstRow = seen.find((text) => /^\d[\d-]* [A-Z]/.test(text) && !/ of /.test(text) && text !== subjectTitle);
  const rowBefore = await call((text) => window.__vrCheck.worldOf(text), firstRow);
  await call(() => window.__vrCheck.device().controllers.right.updateAxes('thumbstick', 0, 1));
  await frames(12);
  await call(() => window.__vrCheck.device().controllers.right.updateAxes('thumbstick', 0, 0));
  await frames(3);
  const rowAfter = await call((text) => window.__vrCheck.worldOf(text), firstRow);
  const scrolledM = rowBefore && rowAfter ? rowAfter[1] - rowBefore[1] : 0;
  check('Pushing the right stick down scrolls the list near the spot', scrolledM > 0.02, `${firstRow} moved ${(scrolledM * 1000).toFixed(0)} mm`);
  await call(() => window.__vrCheck.device().controllers.right.updateAxes('thumbstick', 0, -1));
  await frames(20);
  await call(() => window.__vrCheck.device().controllers.right.updateAxes('thumbstick', 0, 0));
  seen = await textsOnce((now) => now.includes('Near this spot'));

  // Nearest first: a row says "120 m | 66 m tall" (or "Here | ..."); the distances down the list never go down.
  const away = seen
    .map((text) => /^(Here|(\d+) m) \| /.exec(text))
    .filter(Boolean)
    .map(([, here, metres]) => (here === 'Here' ? 0 : Number(metres)));
  check('The list near a spot is nearest first', away.length >= 3 && away.every((d, i) => i === 0 || d >= away[i - 1]),
    away.map((d) => `${d} m`).join(', '));

  // "Planned" narrows it to the projects; choosing one fills it on the map, offers Details, and does not move anybody.
  await pressOnce('Planned');
  seen = await textsOnce((now) => now.includes('Near this spot'));
  const headBefore = await head();
  const planned = seen.filter((text) => /^\d[\d-]* [A-Z]/.test(text) && !/ of /.test(text));
  const row = planned.find((text) => text === subjectTitle) ?? planned[0];
  await press(row, async () => (await texts()).includes('Details'));
  seen = await textsOnce((now) => now.includes('Details'));
  const headAfter = await head();
  check('Choosing a row chooses that building without moving the viewer', seen.includes(row) && seen.includes('Details') && Math.hypot(headAfter[0] - headBefore[0], headAfter[2] - headBefore[2]) < 1, row);
  await shoot('02-place');

  // Details: Place, with what can be done with it.
  await press('Details', async () => (await texts()).includes('Measure the sun'));
  seen = await textsOnce((now) => now.includes('Measure the sun'));
  check('Details opens Place: stand in front, measure the sun, the project on or off',
    seen.includes('Stand in front') && seen.includes('Measure the sun') && seen.includes('With project'));
  await shoot('02b-place-card');

  // 4. Season and hour.
  // The run starts in June, so pressing Winter would prove nothing: Summer.
  await press('Summer', async () => (await texts()).some((text) => /December/.test(text)));
  seen = await textsOnce((now) => now.some((text) => /December/.test(text)));
  const when = seen.find((text) => /December/.test(text));
  const toMinutes = (clock) => (clock ? Number(clock.slice(0, -3)) * 60 + Number(clock.slice(-2)) : NaN);
  const hourBefore = hourIn(seen);
  await press('+10 min', async () => hourIn(await texts()) !== hourBefore);
  seen = await textsOnce((now) => hourIn(now) !== hourBefore);
  const hourAfter = hourIn(seen);
  check('"Summer" sets a December date', /December/.test(when ?? ''), when);
  check('"+10 min" moves the time exactly ten minutes', toMinutes(hourAfter) - toMinutes(hourBefore) === 10,
    `${hourBefore} → ${hourAfter}`);

  // The day bar: with the hour moved by hand the note is gone and the sun's arc is drawn. A press on the bar
  // a quarter of the way along (06:00-20:00) sets the hour there.
  await frames(5);
  await shoot('02c-day-bar');
  await call(() => window.__vrCheck.aimAtDayBar('right', 3 / 14));
  await frames(3);
  await pull('right');
  // within one step of 09:00: the laser is aimed from the buttons' text, a few millimetres either way
  seen = await textsOnce((now) => Math.abs(toMinutes(hourIn(now)) - 540) <= 10);
  check('A press on the day bar sets the hour there', Math.abs(toMinutes(hourIn(seen)) - 540) <= 10, `${hourIn(seen)} (aimed at 09:00)`);

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
    'Pointing at the panel, the cursor and laser draw in front of it',
    Boolean(pointer.cursor && pointer.ray) &&
      pointer.cursor.order > pointer.panelOrder &&
      pointer.ray.order > pointer.panelOrder &&
      pointer.cursor.depthTest === false,
    JSON.stringify(pointer),
  );
  await shoot('02b-pointing-at-button');

  // 4b. With --flat-shots: the flat, in pictures. A building standing today from the list near a spot on
  // the map, then Details > Look out from a flat: the card opens on a floor and side where the flat fits.
  if (flatShots) {
    await press('Map', async () => (await texts()).includes('City map'));
    await call(() => window.__vrCheck.aimAtMap('right'));
    await frames(3);
    await pull('right');
    await textsOnce((now) => now.includes('Near this spot'));
    await pressOnce('Existing');
    await frames(5);
    seen = await texts();
    const standing = seen.filter((text) => /^\d[\d-]* [A-Z]/.test(text) && !/ of /.test(text));
    let inside = false;
    for (const row of standing.slice(0, 4)) {
      await press(row, async () => (await texts()).includes('Details'));
      await press('Details', async () => (await texts()).includes('Look out from a flat'));
      await press('Look out from a flat', async () => (await texts()).includes('Choose a flat'));
      // the sides and floors are worked out a few each frame
      await frames(40);
      seen = await texts();
      const floorLine = seen.find((text) => /^Floor \d+/.test(text));
      check('"Look out from a flat" opens on a floor and a side where the flat fits', seen.includes('Go into the flat'), `${row}: ${floorLine ?? 'no floor'}`);
      await shoot('flat-1-choose');
      if (!seen.includes('Go into the flat')) {
        await press('Back', async () => (await texts()).includes('Look out from a flat'));
        await press('Map', async () => (await texts()).includes('Near this spot'));
        continue;
      }
      // Up, held: more than one floor
      const before = Number(/^Floor (\d+)/.exec(floorLine ?? '')?.[1]);
      await call(() => window.__vrCheck.aimAtText('right', 'Up'));
      await frames(3);
      await call(() => window.__vrCheck.device().controllers.right.updateButtonValue('trigger', 1));
      await new Promise((done) => setTimeout(done, 1500));
      await call(() => window.__vrCheck.device().controllers.right.updateButtonValue('trigger', 0));
      await frames(10);
      seen = await texts();
      const after = Number(/^Floor (\d+)/.exec(seen.find((text) => /^Floor \d+/.test(text)) ?? '')?.[1]);
      check('Holding Up climbs several floors, faster as it is held', after - before >= 3, `${before} → ${after}`);
      await shoot('flat-2-floor-and-side');
      await press('Top', async () => true);
      await frames(20);
      await shoot('flat-3-ready');
      seen = await texts();
      if (seen.includes('Go into the flat')) {
        await press('Go into the flat', async () => (await texts()).includes('Leave the flat'));
        await frames(60);
        await shoot('flat-4-inside-menu');
        await pull('left', 'x-button');
        await frames(20);
        await shoot('flat-5-inside');
        await pull('left', 'x-button');
        await frames(10);
        await press('Leave the flat', async () => !(await texts()).includes('Leave the flat'));
        await frames(30);
        inside = true;
      }
      break;
    }
    console.log(`flat pictures: ${inside ? 'went into a flat' : 'did not get into a flat'}`);
    await press('Map', async () => (await texts()).includes('City map'));
  }

  // 5. Measuring a spot: Place > Measure the sun.
  await press('Place', async () => (await texts()).includes('Measure the sun'));
  const heightText = (await texts()).find((text) => /\| \d+ m$/.test(text));
  await press('Measure the sun', async () => (await texts()).includes('Point at the ground and pull the trigger.'));
  seen = await textsOnce((now) => now.includes('Point at the ground and pull the trigger.'));
  check('"Measure the sun" arms the ground straight away', seen.includes('Point at the ground and pull the trigger.'));
  await aimAtGroundAhead(Number(/\| (\d+) m$/.exec(heightText ?? '')?.[1] ?? 60));
  await frames(3);
  await pull('right');
  seen = await textsOnce((now) => now.includes('Measure another spot'));
  const figure = seen.includes('Measure another spot')
    ? seen.find((text) => /^\d+ (h|min)/.test(text) || /takes no direct sun/.test(text))
    : null;
  check('Pointing at the ground and pulling the trigger gives a sunlight figure', Boolean(figure), figure ?? '');
  await shoot('03-measured');
  // 5b. Straight after measuring, the menu asks "Stand here?" beside the figure; "Not now" puts it away.
  const asked = (await texts()).includes('Stand here?');
  check('After measuring, the menu asks "Stand here?" with the figure still on show', asked && Boolean(figure));
  if (asked) {
    await shoot('03b-stand-here-asked');
    await press('Not now', async () => !(await texts()).includes('Stand here?'));
    check('"Not now" puts the question away', !(await texts()).includes('Stand here?'));
  }

  // 6. Down to the street, and back up — with the veil watched throughout.
  await call(() => {
    window.__vrCheck.veilGap = 0;
  });
  await profiled('standing in the street', async () => {
    const stand = seen.includes('Stand at the spot') ? 'Stand at the spot' : 'Stand in the street';
    // Pressed by hand rather than with pressOnce, so the picture is taken while the pill is up.
    await call(() => { window.__vrCheck.loader = { seen: 0, furthest: 0 }; });
    await call(({ text }) => window.__vrCheck.aimAtText('right', text), { text: stand });
    await frames(3);
    await call(() => window.__vrCheck.device().controllers.right.updateButtonValue('trigger', 1));
    await frames(2);
    await call(() => window.__vrCheck.device().controllers.right.updateButtonValue('trigger', 0));
    // Best effort: the picture is taken a moment after it is asked for, and the pill may be gone by then.
    await shoot('04a-going-down');
    if (!(await until(async () => (await head())[1] < 80, (ok) => ok, 30))) {
      retried.push(stand);
      await pressOnce(stand);
    }
  });
  seen = await textsOnce((now) => now.includes('Go back up'));
  const street = await headOnce((at) => at[1] < 80);
  check('"Stand at the spot" puts the viewer in the street', street[1] < 80, `head height ${street[1].toFixed(0)} m`);
  check('In the street, "Go back up" is offered', seen.includes('Go back up'));
  await shoot('04-street');
  // With --profile: what a frame in the street costs when nothing is being asked for.
  if (profile) await profiled('standing still in the street for 3 s', () => page.waitForTimeout(3000));
  if (profile) {
    // What the scene graph holds: every object is walked each frame to update its matrix.
    const counts = await call(() => {
      const scene = window.__vrCheck.state().scene;
      const tally = (root) => { let n = 0, auto = 0; root.traverse((o) => { n++; if (o.matrixAutoUpdate) auto++; }); return { n, auto }; };
      const named = (o, depth) => (o.name || o.type) + (depth && o.children.length === 1 ? ` > ${named(o.children[0], depth - 1)}` : '');
      // Down through the biggest branch until it splits into many small ones.
      const parts = [];
      const open = (o, path, depth) => {
        const big = [...o.children].sort((a, b) => tally(b).n - tally(a).n);
        if (depth < 6 && big.length && tally(big[0]).n > 0.6 * tally(o).n) {
          for (const c of big.slice(1, 4)) parts.push({ name: `${path} > ${named(c, 2)}`, ...tally(c) });
          return open(big[0], `${path} > ${c0(big[0])}`, depth + 1);
        }
        parts.push({ name: `${path} (${o.children.length} children, e.g. ${[...new Set(o.children.slice(0, 50).map((c) => c.name || c.type))].slice(0, 5).join(', ')})`, ...tally(o) });
      };
      const c0 = (o) => o.name || o.type;
      for (const c of scene.children) if (tally(c).n > 50) open(c, c0(c), 0); else parts.push({ name: named(c, 3), ...tally(c) });
      return { all: tally(scene), parts: parts.sort((a, b) => b.n - a.n).slice(0, 14) };
    });
    console.log(`
── scene objects in the street: ${counts.all.n} (${counts.all.auto} update their matrix every frame)`);
    for (const part of counts.parts) console.log(`${String(part.n).padStart(7)}  ${part.name}`);
    const street = await call(() => {
      let root = null;
      window.__vrCheck.state().scene.traverse((o) => { if (!root && o.name === 'streetscape') root = o; });
      const tally = (r) => { let n = 0, meshes = 0, inst = 0; r.traverse((o) => { n++; if (o.isMesh) meshes++; if (o.isInstancedMesh) inst++; }); return { n, meshes, inst }; };
      return root ? root.children.map((c) => ({ name: c.name || c.type, ...tally(c) })).sort((a, b) => b.n - a.n) : [];
    });
    for (const part of street) console.log(`${String(part.n).padStart(7)}  streetscape > ${part.name} (${part.meshes} meshes, ${part.inst} instanced)`);
  }
  // 6a. The trams in the street: stepped 15 times a second but drawn every frame between steps (TramLayer),
  // so a moving tram's drawn front never runs backwards and never jumps.
  // Watched inside the frame loop (see instrument): sampled from out here, frames slipped by between samples.
  await call(() => { window.__vrCheck.tramWatch = { id: null, frames: [] }; });
  await until(() => call(() => window.__vrCheck.tramWatch.frames.length), (n) => n >= 40, 400);
  const tramTrack = await call(() => window.__vrCheck.tramWatch.frames);
  await call(() => { window.__vrCheck.tramWatch = null; });
  const followed = tramTrack;
  // Pairs across the warm-up (the timetable run on fast, undrawn, when the street is first entered) are left out.
  const steps = followed.slice(1).map((r, i) => ({ d: r.s - followed[i].s, dt: r.time - followed[i].time })).filter((x) => x.dt < 0.5).map((x) => x.d);
  check('Trams in the street move smoothly between simulation steps',
    steps.length >= 10 && steps.every((d) => d >= -0.01 && d < 3),
    followed.length ? `${followed.length} frames, steps ${Math.min(...steps).toFixed(2)}..${Math.max(...steps).toFixed(2)} m` : 'no moving tram');

  // 6b. Walking aids: with the menu away, the street bar over the view, and signs on the corners nearby.
  await pull('left', 'x-button');
  const aids = await until(
    () => call(() => {
      const scene = window.__vrCheck.state().scene;
      const signs = scene.getObjectByName('vr-corner-signs');
      /*
       * Each blade stood upright (its text's up is the world's up) and above the head of someone standing at
       * its corner: measured from the foot of its own pole. Not from the reader's eyes — the ground has its
       * real heights (2026-10-18), and a corner down the hill has its signs lower than the reader's eyes.
       */
      const V = window.__vrCheck.three.Vector3;
      let upright = true;
      let lowestM = Infinity;
      for (const sign of signs?.children ?? []) {
        const foot = sign.getWorldPosition(new V()).y;
        sign.traverse((o) => {
          if (!o.isMesh || o.geometry.type !== 'PlaneGeometry') return;
          if (new V(0, 1, 0).transformDirection(o.matrixWorld).y < 0.99) upright = false;
          lowestM = Math.min(lowestM, o.getWorldPosition(new V()).y - foot);
        });
      }
      return { bar: Boolean(scene.getObjectByName('vr-street-bar')?.visible), signs: signs?.children.length ?? 0, upright, aboveGroundM: lowestM };
    }),
    (now) => now.bar && now.signs > 0,
    40,
  );
  check('In the street with the menu away, the street bar shows and nearby corners carry upright signs above head height',
    aids.bar && aids.signs > 0 && aids.upright && aids.aboveGroundM > 2.2, `${aids.signs} signs, lowest blade ${aids.aboveGroundM?.toFixed(1)} m above its own corner's ground`);
  await frames(10);
  await shoot('04-street-bar');
  await pull('left', 'x-button');
  await until(() => call(() => window.__vrCheck.panel().visible), (shown) => shown, 40);
  await press('Go back up', async () => (await head())[1] > 100);
  const back = await headOnce((at) => at[1] > 100);
  check('"Go back up" returns above the city', back[1] > 100, `head height ${back[1].toFixed(0)} m`);
  const gap = await call(() => window.__vrCheck.veilGap);
  // The sphere is 0.3 m across the head; outside that, a frame went unveiled.
  check('While moving, the fade stays on the head every frame', gap < 0.3, `largest offset from head ${gap.toFixed(2)} m`);

  // 7. The panel, away and back.
  // Shown or hidden is a React render away, like the words; waited for.
  const panelShownOnce = (expected) =>
    until(() => call(() => window.__vrCheck.panel().visible), (shown) => shown === expected, 40);
  await pull('left', 'x-button');
  const hidden = !(await panelShownOnce(false));
  await pull('left', 'x-button');
  const shownAgain = await panelShownOnce(true);
  check('X on the left hand hides the panel and brings it back', hidden && shownAgain);

  // 7b. The white bar under the window carries it with the beam.
  const windowAt = () => call(() => window.__vrCheck.state().scene.getObjectByName('vr-menu').getWorldPosition(new window.__vrCheck.three.Vector3()).toArray());
  const before = await windowAt();
  await call(() => window.__vrCheck.aimAt('right', window.__vrCheck.windowBar()));
  await frames(3);
  await call(() => window.__vrCheck.device().controllers.right.updateButtonValue('trigger', 1));
  await frames(3);
  await call(() => {
    const t = window.__vrCheck;
    const bar = t.windowBar();
    const side = new t.three.Vector3(0.35, 0, 0).applyQuaternion(t.state().gl.xr.getCamera().getWorldQuaternion(new t.three.Quaternion()));
    t.aimAt('right', bar.add(side));
  });
  await frames(6);
  await call(() => window.__vrCheck.device().controllers.right.updateButtonValue('trigger', 0));
  await frames(3);
  const after = await windowAt();
  const movedM = Math.hypot(after[0] - before[0], after[2] - before[2]);
  check('Holding the trigger on the white bar carries the window', movedM > 0.1, `moved ${(movedM * 100).toFixed(0)} cm`);
  await shoot('04c-window-moved');
  // Calling the panels up again puts them back on the arc.
  await pull('left', 'x-button');
  await panelShownOnce(false);
  await pull('left', 'x-button');
  await panelShownOnce(true);

  // 7c. Hide, and the Menu button on the left hand brings it back.
  await press('Close', async () => !(await call(() => window.__vrCheck.panel().visible)));
  const hiddenByButton = !(await panelShownOnce(false));
  const menuShown = await until(
    () => call(() => window.__vrCheck.state().scene.getObjectByName('vr-menu-button')?.visible === true),
    (shown) => shown,
    20,
  );
  await shoot('04d-menu-on-hand');
  check('"Close" hides the whole menu and shows "Menu" on the left hand', hiddenByButton && menuShown,
    `panel ${hiddenByButton ? 'hidden' : 'still shown'} / Menu ${menuShown ? 'shown' : 'not shown'}`);
  const miniMap = await call(() => {
    const t = window.__vrCheck;
    const map = t.state().scene.getObjectByName('vr-mini-map');
    if (!map?.visible) return null;
    // In the head's own frame: +x right, +y up, -z ahead.
    const camera = t.state().camera;
    camera.updateMatrixWorld();
    const at = camera.worldToLocal(map.getWorldPosition(new t.three.Vector3()));
    return { left: -at.x, up: at.y, ahead: -at.z };
  });
  check('With the panels away, a small map rides in the upper left of the view',
    Boolean(miniMap && miniMap.left > 0.1 && miniMap.up > 0.05 && miniMap.ahead > 0.3),
    miniMap ? `${(miniMap.left * 100).toFixed(0)} cm left, ${(miniMap.up * 100).toFixed(0)} cm up, ${(miniMap.ahead * 100).toFixed(0)} cm ahead` : 'not shown');
  await press('Menu', async () => call(() => window.__vrCheck.panel().visible));
  const backByMenu = await panelShownOnce(true);
  const menuGone = await until(
    () => call(() => window.__vrCheck.state().scene.getObjectByName('vr-menu-button')?.visible === false),
    (gone) => gone,
    20,
  );
  check('Pressing "Menu" on the left hand brings the panel back and removes Menu', backByMenu && menuGone);
  await shoot('04b-back-from-menu');

  // 8. Leaving, which always asks first — the grip held, and the button.
  await call(() => window.__vrCheck.device().controllers.left.updateButtonValue('squeeze', 1));
  await page.waitForTimeout(1600);
  await frames(3);
  await call(() => window.__vrCheck.device().controllers.left.updateButtonValue('squeeze', 0));
  seen = await textsOnce((now) => now.includes('Yes, leave VR'));
  const afterGrip = await call(() => window.__vrCheck.xr().session != null);
  check('Holding a grip asks before leaving, and does not leave', afterGrip && seen.includes('Yes, leave VR'));
  await shoot('04e-leave-asked');
  await press('Stay in VR', async () => !(await texts()).includes('Yes, leave VR'));
  check('"Stay in VR" closes the question', !(await texts()).includes('Yes, leave VR'));
  await press('More', async () => (await texts()).includes('Leave VR'));
  await press('Leave VR', async () => (await texts()).includes('Yes, leave VR'));
  seen = await textsOnce((now) => now.includes('Yes, leave VR'));
  const stillIn = await call(() => window.__vrCheck.xr().session != null);
  check('"Leave VR" asks for confirmation first', stillIn && seen.includes('Yes, leave VR'));
  await press('Yes, leave VR', async () => call(() => window.__vrCheck.xr().session == null));
  await page.waitForTimeout(2000);
  const out = await call(() => window.__vrCheck.xr().session == null);
  check('"Yes, leave VR" ends the session', out);
  await shoot('05-after');

  // ── B. From a building's page, as a shared link opens it ─────────────────
  const building = '642138c8-44c5-444b-b87f-9f57c1f4438b'; // 206-218 Bourke Street
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
  check('A refused VR start leaves the page (search field) as it was', !refusedIn && kept && pageErrors.length === errorsBefore,
    `search field "${await search.inputValue()}", new page errors: ${pageErrors.length - errorsBefore}`);
  await call(() => {
    // The simulator's own method again, from its prototype.
    delete navigator.xr.requestSession;
  });

  // 10. Re-choosing by pointing forgets the old spot.
  await enterThrough(headerEnter);
  // Every Enter VR, not only the first: the headset is passed between testers.
  seen = await textsOnce((now) => now.includes('Welcome to Live Melbourne'));
  check('The tutorial is shown again on the next Enter VR', seen.includes('Welcome to Live Melbourne'));
  await press('Skip', async () => !(await texts()).includes('Welcome to Live Melbourne'));
  seen = await textsOnce((now) => now.includes('Details'));
  const buildingTitle = '206-218 Bourke Street';
  const buildingHeight = Number(/\| (\d+) m$/.exec(seen.find((text) => /^Standing today \| \d+ m$/.test(text)) ?? '')?.[1] ?? 30);
  await press('Details', async () => (await texts()).includes('Measure the sun'));
  await press('Measure the sun', async () => (await texts()).includes('Point at the ground and pull the trigger.'));
  await textsOnce((now) => now.includes('Point at the ground and pull the trigger.'));
  await aimAtGroundAhead(buildingHeight);
  await frames(3);
  await pull('right');
  seen = await textsOnce((now) => now.includes('Measure another spot'));
  check('A spot can be measured for an existing building', seen.includes('Measure another spot'), buildingTitle);
  await pointAtAProposal();
  seen = await textsOnce((now) => !now.includes(buildingTitle));
  // the new building's own card, not the last one's figure
  check('Pointing at another proposal clears the previous spot',
    !seen.includes(buildingTitle) && !seen.includes('Measure another spot'),
    `${buildingTitle} → ${addressIn(seen)}`);
  await shoot('06-rechosen');
} catch (error) {
  check('Runs to the end without stopping', false, error.message.split('\n')[0]);
} finally {
  if (vrdebug) debugLines = await page.evaluate(() => JSON.parse(localStorage.getItem('vrdebug-log') ?? '[]')).catch(() => []);
  await browser.close();
  await ownServer?.close();
}

// The summary: the count, where the screenshots are, and anything that needed help.
const failed = results.filter((result) => !result.ok);
console.log('');
console.log(`${results.length - failed.length} / ${results.length} passed. Screenshots: ${OUT}`);
if (vrdebug) {
  console.log('');
  console.log('?vrdebug — moves and stalls:');
  for (const line of debugLines.filter((text) => /move|STALL|long task|taken away/.test(text))) console.log(`  ${line}`);
}
if (retried.length) console.log(`Presses that needed a second go (the emulator renders slowly): ${retried.join(', ')}`);
if (pageErrors.length) {
  console.log(`Page errors: ${pageErrors.length}`);
  for (const message of pageErrors.slice(-5)) console.log(`  ${message}`);
}
process.exit(failed.length ? 1 : 0);

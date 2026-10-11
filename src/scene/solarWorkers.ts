/*
 * A small pool of workers for the solar panel check (solarShade.worker.ts):
 * up to four, one fewer than the device's cores. A roof's tiles are dealt out
 * among them, largest first, so they finish at about the same time.
 *
 * Where workers cannot be made (tests, very old browsers), or one fails while
 * working, the pool is put aside for good and the work runs on the page's
 * thread instead (usableRoof, shadeBlocks): slower, but it finishes.
 */
import type { Massing } from '../data/model';
import { usableRoof, type RoofBlock, type RoofOptions, type RoofResult } from './roofParts';
import { planTiles, shadeBlocks, type BlockSun } from './solarShade';
import type { FromWorker, ToWorker } from './solarShade.worker';

let pool: Worker[] | null = null;
let poolCity: Massing[] | null = null;
/** Set once a worker has failed: from then on the page's thread does the work. */
let broken = false;
let nextJob = 1;
/** Progress goes to the page at most this often. */
const PROGRESS_MS = 200;
/** How often a running job checks whether its caller has given up. */
const CANCEL_POLL_MS = 100;

function dropPool(): void {
  for (const w of pool ?? []) w.terminate();
  pool = null; poolCity = null;
}

function workers(city: Massing[] | null): Worker[] | null {
  if (broken || typeof Worker === 'undefined') return null;
  if (!pool) {
    const cores = typeof navigator !== 'undefined' && navigator.hardwareConcurrency ? navigator.hardwareConcurrency : 2;
    const n = Math.max(1, Math.min(4, cores - 1));
    const made: Worker[] = [];
    try {
      for (let k = 0; k < n; k++) made.push(new Worker(new URL('./solarShade.worker.ts', import.meta.url), { type: 'module' }));
    } catch {
      for (const w of made) w.terminate();
      broken = true;
      return null;
    }
    pool = made;
  }
  // the city goes to each worker once, and again only if it changes
  if (city && poolCity !== city) {
    for (const w of pool) w.postMessage({ kind: 'city', city } satisfies ToWorker);
    poolCity = city;
  }
  return pool;
}

/**
 * Run a job on some workers: send each its message, collect replies with `onReply` (true when
 * that worker is finished), and stop when all are finished, the caller gives up (resolves
 * 'cancelled'), or a worker fails (resolves 'failed', and the pool is put aside).
 */
function run(
  ws: Worker[], job: number, messages: ToWorker[],
  onReply: (msg: FromWorker) => boolean, cancelled: () => boolean,
): Promise<'done' | 'cancelled' | 'failed'> {
  return new Promise((resolve) => {
    let finished = 0;
    const listen = (event: MessageEvent<FromWorker>) => {
      if (event.data.job !== job) return;
      if (onReply(event.data) && ++finished === ws.length) end('done');
    };
    const fail = () => end('failed');
    const poll = setInterval(() => { if (cancelled()) end('cancelled'); }, CANCEL_POLL_MS);
    function end(how: 'done' | 'cancelled' | 'failed') {
      clearInterval(poll);
      for (const w of ws) { w.removeEventListener('message', listen); w.removeEventListener('error', fail); w.removeEventListener('messageerror', fail); }
      if (how === 'cancelled') for (const w of ws) w.postMessage({ kind: 'cancel', job } satisfies ToWorker);
      if (how === 'failed') { broken = true; dropPool(); }
      resolve(how);
    }
    ws.forEach((w, k) => {
      w.addEventListener('message', listen);
      w.addEventListener('error', fail);
      w.addEventListener('messageerror', fail);
      w.postMessage(messages[k]);
    });
  });
}

/** The roof a panel could go on, found off the page's thread. Resolves null when cancelled. */
export async function roofOffThread(parts: Massing[], options: Partial<RoofOptions>, cancelled: () => boolean): Promise<RoofResult | null> {
  const ws = workers(null);
  if (ws) {
    const job = nextJob++;
    let roof: RoofResult | null = null;
    const how = await run([ws[0]], job, [{ kind: 'roof', job, parts, options }], (msg) => {
      if (msg.kind === 'roof') roof = msg.roof;
      return msg.kind === 'roof';
    }, cancelled);
    if (how === 'done') return roof;
    if (how === 'cancelled') return null;
  }
  return cancelled() ? null : usableRoof(parts, options);
}

/**
 * Every block's sun, worked out off the page's thread. Reports progress (0..1); resolves to one
 * BlockSun per block, or null when cancelled.
 */
export async function shadeBlocksOffThread(
  blocks: RoofBlock[], city: Massing[], year: number, facingDeg: number,
  onProgress: (done: number) => void, cancelled: () => boolean,
): Promise<BlockSun[] | null> {
  const ws = workers(city);
  if (ws && blocks.length) {
    const job = nextJob++;
    // deal the tiles out, largest first, each to the worker with least so far
    const tiles = planTiles(blocks).sort((a, b) => b.length - a.length);
    const share: number[][][] = ws.map(() => []), load = ws.map(() => 0);
    for (const t of tiles) { const k = load.indexOf(Math.min(...load)); share[k].push(t); load[k] += t.length; }
    const busy = ws.filter((_, k) => share[k].length > 0);
    const out = new Array<BlockSun>(blocks.length);
    let done = 0, reported = 0;
    const how = await run(busy, job, busy.map((w) => ({ kind: 'job', job, blocks, tiles: share[ws.indexOf(w)], year, facingDeg })), (msg) => {
      if (msg.kind !== 'tile') return msg.kind === 'done';
      msg.shares.forEach((v, k) => { out[msg.members[k]] = v; });
      done += msg.members.length;
      // the page redraws on each report: a few a second is enough to show it moving
      const now = performance.now();
      if (now - reported > PROGRESS_MS) { reported = now; onProgress(Math.min(1, done / blocks.length)); }
      return false;
    }, cancelled);
    if (how === 'done') return out;
    if (how === 'cancelled') return null;
    // a worker failed: start again on the page's thread
  }
  return shadeBlocks(blocks, city, year, facingDeg, onProgress, cancelled);
}

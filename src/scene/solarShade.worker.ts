/*
 * The solar panel check's heavy work off the page's thread, so the map keeps
 * moving while a roof is found and measured. Several of these run at once
 * (solarWorkers.ts):
 *   roof  finds the roof a panel could go on (roofParts.ts) for one building;
 *   job   works out the shade on a share of that roof's tiles (solarShade.ts).
 *
 * The city is sent once and kept, and again only when a different one is asked
 * for (the city as it stands, or with the approved developments); after that
 * a job is only the roof's blocks and which tiles to do. A job picks the parts
 * that can shade its roof from the city it starts with, so a city sent while it
 * runs does not change it. Between tiles the worker lets messages in, so a
 * cancel (another building chosen) stops it within a tile. Cancelled jobs are
 * remembered until they end: more than one can be in flight.
 */
import type { Massing } from '../data/model';
import { usableRoof, type RoofBlock, type RoofOptions, type RoofResult } from './roofParts';
import { annualSunSamples, possibleShaders, shadeTile, type BlockSun, type SunSample } from './solarShade';

export type ToWorker =
  | { kind: 'city'; city: Massing[] }
  | { kind: 'roof'; job: number; parts: Massing[]; options: Partial<RoofOptions> }
  | { kind: 'job'; job: number; blocks: RoofBlock[]; tiles: number[][]; year: number; facingDeg: number }
  | { kind: 'cancel'; job: number };
export type FromWorker =
  | { kind: 'roof'; job: number; roof: RoofResult }
  | { kind: 'tile'; job: number; members: number[]; shares: BlockSun[] }
  | { kind: 'done'; job: number };

let city: Massing[] = [];
const cancelled = new Set<number>();
const sampleCache = new Map<string, SunSample[]>();
const post = (m: FromWorker) => (self as unknown as { postMessage: (m: FromWorker) => void }).postMessage(m);

self.onmessage = async (event: MessageEvent<ToWorker>) => {
  const msg = event.data;
  if (msg.kind === 'city') { city = msg.city; return; }
  if (msg.kind === 'cancel') { cancelled.add(msg.job); return; }
  if (msg.kind === 'roof') { post({ kind: 'roof', job: msg.job, roof: usableRoof(msg.parts, msg.options) }); return; }
  const { job, blocks, tiles, year, facingDeg } = msg;
  const key = `${year}:${facingDeg}`;
  let samples = sampleCache.get(key);
  if (!samples) { samples = annualSunSamples(year, facingDeg); sampleCache.set(key, samples); }
  const shaders = possibleShaders(blocks, city);
  for (const members of tiles) {
    // let a cancel in
    await new Promise<void>((resolve) => setTimeout(resolve, 0));
    if (cancelled.has(job)) { cancelled.delete(job); return; }
    post({ kind: 'tile', job, members, shares: shadeTile(blocks, members, shaders, samples) });
  }
  cancelled.delete(job);
  post({ kind: 'done', job });
};

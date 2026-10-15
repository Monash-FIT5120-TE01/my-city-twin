import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { TramPath, TramSim, type DayKey, type Tram, type TramsDoc } from './tramSim';
import { phaseOf, planFor } from '../signalPlan';

/*
 * The simulation on the real timetable (trams-<day>.json) and signals: trams never overlap on a track, none is held
 * for minutes by anything but a stop, none breaks the 40 km/h limit or its class's acceleration and braking,
 * and the mean speed through the CBD is close to the published ~10-11 km/h.
 */
const docs = Object.fromEntries((['monThu', 'fri', 'sat', 'sun'] as DayKey[]).map((d) => [d, JSON.parse(readFileSync(`public/data/streetscape/trams-${d}.json`, 'utf8')) as TramsDoc]));
const plans = JSON.parse(readFileSync('public/data/streetscape/signals.json', 'utf8')).sites.map(planFor);

function overlapping(a: Tram, b: Tram): boolean {
  for (let i = 0; i < b.body.length; i++) {
    const p = b.body[i], pr = a.path.project(p[0], p[1], a.s - a.L + 0.5, a.s - 0.5), d = a.path.dir(pr.s);
    if (pr.d < 0.8 && pr.s > a.s - a.L + 0.5 && pr.s < a.s - 0.5 && d[0] * b.bodyDir[i][0] + d[1] * b.bodyDir[i][1] > 0.5) return true;
  }
  return false;
}

function run(day: DayKey, from: number, minutes: number, before?: DayKey) {
  const sim = new TramSim(docs[day], day, from, (s, t) => phaseOf(plans[s], t), before ? { doc: docs[before], day: before } : undefined);
  const still = new Map<number, number>();
  let overlaps = 0, held = 0, maxV = 0, moved = 0, time = 0, peak = 0, past = 0;
  for (let k = 0; k < minutes * 120; k++) {
    sim.step(0.5);
    peak = Math.max(peak, sim.trams.length);
    for (const t of sim.trams) {
      maxV = Math.max(maxV, t.v); moved += t.v * 0.5; time += 0.5;
      expect(t.a).toBeLessThanOrEqual(t.accel + 1e-6); expect(t.a).toBeGreaterThanOrEqual(-t.brake - 1e-6);
      const w = t.v === 0 && !t.calling ? (still.get(t.id) ?? 0) + 0.5 : 0; still.set(t.id, w); if (w === 180) held++;
      // never past the next stop of its trip without having called there (the first one included)
      const call = t.trip.stops[t.next];
      if (call && t.s > t.path.stops[call[0]][3] + 1.5) past++;
    }
    if (k % 60 === 0) for (const a of sim.trams) for (const b of sim.trams) if (a !== b && overlapping(a, b)) overlaps++;
  }
  return { overlaps, held, past, maxKmh: maxV * 3.6, meanKmh: (moved / time) * 3.6, peak };
}

describe('trams on the timetable', () => {
  it.each([
    ['monThu', 8 * 3600, 'morning peak', undefined],
    ['sat', 13 * 3600, 'Saturday afternoon', undefined],
    ['fri', 1800, 'after midnight (Thursday\'s late trips)', 'monThu'],
  ] as [DayKey, number, string, DayKey | undefined][])('%s from %i s (%s)', (day, from, _label, before) => {
    const r = run(day, from, 40, before);
    expect(r.peak).toBeGreaterThan(0);
    expect(r.overlaps).toBe(0);
    expect(r.held).toBe(0);
    expect(r.past).toBe(0);
    expect(r.maxKmh).toBeLessThanOrEqual(40.5);
    if (day === 'monThu') { expect(r.meanKmh).toBeGreaterThan(7); expect(r.meanKmh).toBeLessThan(14); }
  }, 120000);
});

/*
 * One straight 500 m track with two stops, and two trips ten seconds apart: the first calls at its first stop
 * (it comes in short of it), and the second, stopped right behind it there, calls where it stands.
 */
describe('calling at a stop', () => {
  const doc: TramsDoc = {
    days: { monThu: '', fri: '', sat: '', sun: '' },
    paths: [{ pts: [[0, 0], [500, 0]], stops: [['a', 'A', 1, 100, 40], ['b', 'B', 2, 300, 40]], signals: [], slow: [], merges: [] }],
    trips: { monThu: [[0, '1', 'Z3', [0, 100, 1, 200]], [0, '1', 'Z3', [0, 110, 1, 210]]], fri: [], sat: [], sun: [] },
  };
  it('calls at the first stop, and behind a tram calling there', () => {
    const sim = new TramSim(doc, 'monThu', 0, () => ({ A: 2, B: 2, walk: null }));
    const firstCalls = new Set<number>(), done = new Set<number>(); let behind = false;
    for (let k = 0; k < 800; k++) {
      sim.step(0.5);
      for (const t of sim.trams) {
        if (t.calling && t.next === 0) firstCalls.add(t.id);
        if (t.calling && t.next === 0 && t.s < 100 - 1.5) behind = true;
        if (t.next === 2) done.add(t.id);
      }
    }
    expect(firstCalls.size).toBe(2);
    expect(behind).toBe(true);
    expect(done.size).toBe(2);
  });
});

describe('the shortcuts in the simulation', () => {
  /*
   * obstacle() skips trams on paths that never run along this one (sharesTrack), and projects through a segment
   * grid (projectNear) rather than every segment in reach: both are only faster ways to the same answer. Two
   * simulations, one with the shortcuts and one without, must end with every tram in the same place.
   */
  it('change no tram\'s position or speed', () => {
    const make = () => new TramSim(docs.monThu, 'monThu', 8 * 3600, (s, t) => phaseOf(plans[s], t));
    const fast = make();
    for (let k = 0; k < 600; k++) fast.step(1 / 15);
    const near = TramPath.prototype.projectNear;
    TramPath.prototype.projectNear = TramPath.prototype.project;
    try {
      const slow = make();
      (slow as unknown as { sharesTrack: () => boolean }).sharesTrack = () => true;
      for (let k = 0; k < 600; k++) slow.step(1 / 15);
      const state = (sim: TramSim) => sim.trams.map((t) => [t.id, t.s.toFixed(6), t.v.toFixed(6)]);
      expect(fast.trams.length).toBeGreaterThan(20);
      expect(state(fast)).toEqual(state(slow));
    } finally {
      TramPath.prototype.projectNear = near;
    }
  }, 60_000);
});

describe('leaving the model', () => {
  /*
   * A tram past the end of its path runs its last length on along the straight beyond the end. Routes 19 and
   * 59 end on route 57's track (Elizabeth St north); before obstacle() looked past the end, a 19 or 59 leaving
   * there drove into the back of a 57 held at the signal or the stop (monThu 11:53, 2026-10-16). Checked every
   * step, in the street's own terms: no body point of another tram, heading the same way, within 1.2 m of the
   * leaving tram's own body.
   */
  it('does not drive into a tram beyond the end of its path', () => {
    // from 11:45, as the trams first go in when the street is opened then (the run that found it)
    const sim = new TramSim(docs.monThu, 'monThu', 11.75 * 3600, (s, t) => phaseOf(plans[s], t));
    let hits = 0;
    for (let k = 0; k < 20 * 120; k++) {
      sim.step(0.5);
      for (const a of sim.trams) {
        if (a.s <= a.path.len) continue;
        for (const b of sim.trams) {
          if (b === a || Math.hypot(b.body[0][0] - a.body[0][0], b.body[0][1] - a.body[0][1]) > a.L + b.L) continue;
          for (let i = 0; i < b.body.length; i++) {
            const p = b.body[i];
            for (let j = 0; j < a.body.length - 1; j++) {
              const q = a.body[j], r = a.body[j + 1], dx = r[0] - q[0], dy = r[1] - q[1], L2 = dx * dx + dy * dy || 1;
              const u = Math.max(0, Math.min(1, ((p[0] - q[0]) * dx + (p[1] - q[1]) * dy) / L2));
              if (Math.hypot(p[0] - q[0] - u * dx, p[1] - q[1] - u * dy) < 1.2 && a.dir[0] * b.bodyDir[i][0] + a.dir[1] * b.bodyDir[i][1] > 0.5) { hits++; break; }
            }
          }
        }
      }
    }
    expect(hits).toBe(0);
  }, 120_000);
});

describe('the terminus with points', () => {
  /*
   * Elizabeth St, Stop 1 (Flinders Street Station): a tram takes whichever side of the island is free, over the
   * crossover north of it (scripts/terminus-crossover.mjs). Friday 17:00 to 18:00 is the busiest hour there; at
   * 17:23 two trams taking the diagonals each waited for the other, and the trams behind them for hours
   * (2026-10-16). Near the island: no two trams touch, none waits for a side or the crossover over 3 min, and
   * both sides are used by arriving and leaving trams. The paths and the island are read from the data.
   */
  const island = (JSON.parse(readFileSync('public/data/streetscape/tram.json', 'utf8')).platforms as { name: string; c: [number, number] }[])
    .find((q) => q.name === 'Stop 1: Flinders Street Station')!.c;

  it('swaps an arriving tram onto a twin with the same stops and signals up to the crossover', () => {
    // terminusHold() keeps the tram's place, next stop and next signal when it changes to the twin
    for (const day of ['monThu', 'fri', 'sat', 'sun'] as DayKey[]) {
      const doc = docs[day];
      expect(doc.terminus?.length).toBe(8);
      for (const [pi, , kind, twin, x0] of doc.terminus!) {
        if (kind !== 'arrive') continue;
        const a = doc.paths[pi], b = doc.paths[twin];
        expect(b.stops).toEqual(a.stops);
        expect(b.signals.filter((g) => g[0] < x0)).toEqual(a.signals.filter((g) => g[0] < x0));
      }
    }
  });

  it('uses both sides, without touching or waiting for ever', () => {
    const sim = new TramSim(docs.fri, 'fri', 17 * 3600, (s, t) => phaseOf(plans[s], t));
    const arriving = new Set(docs.fri.terminus!.filter((e) => e[2] === 'arrive').map((e) => e[0]));
    const sides = new Set<string>(), waited = new Map<number, number>();
    let touch = 0, longest = 0;
    for (let k = 0; k < 3600 * 2; k++) {
      sim.step(0.5);
      const near = sim.trams.filter((t) => Math.hypot(t.body[0][0] - island[0], t.body[0][1] - island[1]) < 130);
      for (const t of near) {
        if (t.berth) sides.add((arriving.has(t.trip.path) ? 'arrive ' : 'depart ') + t.berth);
        // one wait without a break, not all of a tram's waits added up
        const w = (t.why === 'berth' || t.why === 'points') && t.v === 0 ? (waited.get(t.id) ?? 0) + 0.5 : 0;
        waited.set(t.id, w); longest = Math.max(longest, w);
      }
      for (const a of near) for (const b of near) {
        if (a.id >= b.id) continue;
        for (const p of a.body) for (let j = 0; j < b.body.length - 1; j++) {
          const q = b.body[j], r = b.body[j + 1], dx = r[0] - q[0], dy = r[1] - q[1], L2 = dx * dx + dy * dy || 1;
          const u = Math.max(0, Math.min(1, ((p[0] - q[0]) * dx + (p[1] - q[1]) * dy) / L2));
          if (Math.hypot(p[0] - q[0] - u * dx, p[1] - q[1] - u * dy) < 1.5) touch++;
        }
      }
    }
    expect(touch).toBe(0);
    expect(longest).toBeLessThan(180);
    expect([...sides].sort()).toEqual(['arrive E', 'arrive W', 'depart E', 'depart W']);
  }, 300_000);
});

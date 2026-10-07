import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { TramSim, type DayKey, type Tram, type TramsDoc } from './tramSim';
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

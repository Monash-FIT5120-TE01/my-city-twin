/*
 * ─────────────────────────────────────────────────────────────────────────
 * TRAMS RUNNING TO TIMETABLE
 * ─────────────────────────────────────────────────────────────────────────
 *
 * WHAT IT DOES
 *   Runs the day's tram trips through the CBD (trams.json, from the GTFS timetable) as vehicles that obey the
 *   signals, keep clear of each other, stop at every timetabled stop and speed up and slow down gradually.
 *   Pure logic: no three.js, so it can be tested on its own. Distances in metres along a path, times in
 *   seconds of the service day.
 *
 * HOW A TRAM DECIDES ITS SPEED (each step)
 *   It may not go faster than the limit where it is (40 km/h, the CBD limit; less on curves and in the mall),
 *   and it must be able to stop, braking comfortably, before each of these, whichever is nearest:
 *     - 3 m behind the tram in front (any tram on the same track, whichever route it is on)
 *     - the stop line of a signal showing red, or amber when it can still stop
 *     - the stop where it is due to call next
 *   Acceleration follows from that, limited in how fast it may change (jerk), so it pulls away and comes to a
 *   stand gradually.
 *
 * AT A STOP (as asked: a stop takes one tram, and the one behind it)
 *   A tram stopped at the stop position calls there. So does a tram stopped directly behind a tram that is
 *   calling there: it opens its doors where it is. Further back than that it waits, and moves up when there
 *   is room. A call lasts 15-20 s, and a tram early on the timetable waits for its time (up to a minute more).
 *
 * WHAT IS NOT MODELLED
 *   Tram priority at signals (SCATS extends greens for trams), cars, and turning conflicts between trams
 *   crossing on different tracks (the signals keep those apart).
 */
import type { Phase } from '../signalPlan';
import { TRAM_CLASSES, type ClassKey } from './tramClasses';

export type XY = [number, number];
export type DayKey = 'monThu' | 'fri' | 'sat' | 'sun';
/** [stop id, name, stop number, front position m, platform length m] */
export type PathStop = [string, string, string | number, number, number];
export interface TramsDoc {
  days: Record<DayKey, string>;
  paths: { pts: XY[]; stops: PathStop[]; signals: [number, number, 'A' | 'B'][]; slow: [number, number, number][]; merges: [number, number, number][] }[];
  /** [path, route, class, [stop index, time s, stop index, time s, ...]] */
  trips: Record<DayKey, [number, string, ClassKey, number[]][]>;
}

export const LIMIT_MS = 40 / 3.6;
const GAP_M = 3;
const ENTRY_MS = 5.5;          // assumed average speed from the edge of the model to the first stop
const LOOK_M = 160;
const JERK = 1.0;              // m/s3: comfort (EST; no published vehicle figure)
const COMFORT = 0.7;           // plan braking at this share of the service rate
const BODY_STEP_M = 4;         // spacing of the points a tram's body is checked by
const MERGE_LOOK_M = 40;       // how near a join two trams start deciding who goes first
const MAX_HOLD_S = 60;         // the longest a tram waits at a stop for its timetabled time
const BOX_M = 25;              // an intersection's depth past its stop line (EST): room needed to clear it

/** A path through the CBD, with distance along it. */
export class TramPath {
  readonly pts: XY[]; readonly s: number[]; readonly len: number;
  readonly stops: PathStop[]; readonly signals: [number, number, 'A' | 'B'][]; readonly slow: [number, number, number][];
  readonly merges: [number, number, number][];
  constructor(p: TramsDoc['paths'][number]) {
    this.pts = p.pts; this.stops = p.stops; this.signals = p.signals; this.slow = p.slow; this.merges = p.merges ?? [];
    this.s = [0]; for (let i = 1; i < p.pts.length; i++) this.s.push(this.s[i - 1] + Math.hypot(p.pts[i][0] - p.pts[i - 1][0], p.pts[i][1] - p.pts[i - 1][1]));
    this.len = this.s[this.s.length - 1];
  }
  private seg(d: number): number {
    let lo = 0, hi = this.s.length - 1;
    while (hi - lo > 1) { const mid = (lo + hi) >> 1; if (this.s[mid] <= d) lo = mid; else hi = mid; }
    return lo;
  }
  /** Position at distance d (extended straight past either end). */
  at(d: number, out: XY = [0, 0]): XY {
    const i = d <= 0 ? 0 : d >= this.len ? this.pts.length - 2 : this.seg(d);
    const a = this.pts[i], b = this.pts[i + 1], L = this.s[i + 1] - this.s[i] || 1, u = (d - this.s[i]) / L;
    out[0] = a[0] + (b[0] - a[0]) * u; out[1] = a[1] + (b[1] - a[1]) * u; return out;
  }
  /** Unit direction of travel at distance d. */
  dir(d: number, out: XY = [0, 0]): XY {
    const i = d <= 0 ? 0 : d >= this.len ? this.pts.length - 2 : this.seg(d);
    const a = this.pts[i], b = this.pts[i + 1], L = this.s[i + 1] - this.s[i] || 1;
    out[0] = (b[0] - a[0]) / L; out[1] = (b[1] - a[1]) / L; return out;
  }
  /** The nearest point to (x, y) between distances d0 and d1: its distance along, and how far off. */
  project(x: number, y: number, d0: number, d1: number): { s: number; d: number } {
    let best = { s: 0, d: Infinity };
    const i0 = this.seg(Math.max(0, d0)), i1 = this.seg(Math.min(this.len, d1));
    for (let i = i0; i <= i1 && i < this.pts.length - 1; i++) {
      const a = this.pts[i], b = this.pts[i + 1], dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy || 1;
      const u = Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / L2)), dd = Math.hypot(x - a[0] - u * dx, y - a[1] - u * dy);
      if (dd < best.d) best = { s: this.s[i] + u * Math.sqrt(L2), d: dd };
    }
    return best;
  }
  /** Speed limit at distance d. */
  limit(d: number): number {
    let v = LIMIT_MS;
    for (const [a, b, kmh] of this.slow) if (d >= a && d <= b) v = Math.min(v, kmh / 3.6);
    return v;
  }
}

export interface Trip { index: number; path: number; route: string; cls: ClassKey; stops: [number, number][]; spawnAt: number }

export interface Tram {
  id: number; trip: Trip; path: TramPath; L: number; accel: number; brake: number;
  /** Front position along the path, speed, acceleration. */
  s: number; v: number; a: number;
  /** Next stop of the trip (index into trip.stops); calling: until when. */
  next: number; calling: boolean; callUntil: number; callStop: number;
  /** Signal index (into path.signals) it has committed to going through on amber. */
  committed: number;
  /** Points along the body every ~4 m, front first (east, north), and the direction at each (on a curve the
   *  back of a long tram points another way from its front), refreshed each step. */
  body: XY[]; bodyDir: XY[];
  dir: XY;
  /** What it is stopping for, if anything (for checking the simulation). */
  why: 'tram' | 'merge' | 'signal' | 'box' | 'stop' | '';
}

/** A random number in [0, 1) from two integers, so the same trip calls for the same time every run. */
const rand = (a: number, b: number) => { let h = (a * 374761393 + b * 668265263) >>> 0; h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };

export class TramSim {
  readonly paths: TramPath[];
  readonly trams: Tram[] = [];
  time: number;
  private trips: Trip[];
  private nextTrip = 0;
  private nextId = 1;
  private signalPhase: (site: number, t: number) => Phase;
  /** Called when a tram leaves the model (the ride ends with it). */
  onLeave: ((t: Tram) => void) | null = null;

  /**
   * @param time seconds of the service day to start at (the caller warms up from earlier: see warmUp)
   * @param signalPhase the phase of signal site `site` at time t (the same clock as `time`)
   */
  constructor(doc: TramsDoc, day: DayKey, time: number, signalPhase: (site: number, t: number) => Phase) {
    this.paths = doc.paths.map((p) => new TramPath(p));
    this.time = time; this.signalPhase = signalPhase;
    const trips: Trip[] = [];
    doc.trips[day].forEach(([path, route, cls, flat], index) => {
      const stops: [number, number][] = []; for (let i = 0; i < flat.length; i += 2) stops.push([flat[i], flat[i + 1]]);
      const p = this.paths[path], first = p.stops[stops[0][0]];
      const spawnAt = stops[0][1] - first[3] / ENTRY_MS - 20;
      trips.push({ index, path, route, cls, stops, spawnAt });
      // after midnight the day before's late trips are still running: they are listed past 24:00
      if (stops[stops.length - 1][1] >= 86400) trips.push({ index, path, route, cls, stops: stops.map(([i, t]) => [i, t - 86400]), spawnAt: spawnAt - 86400 });
    });
    trips.sort((a, b) => a.spawnAt - b.spawnAt);
    this.trips = trips;
    // nothing that would already have left the model
    while (this.nextTrip < trips.length && trips[this.nextTrip].stops[trips[this.nextTrip].stops.length - 1][1] < time - 300) this.nextTrip++;
  }

  /** Runs `seconds` of simulated time in steps of `dt`, without drawing: trams in place when the view opens. */
  warmUp(seconds: number, dt = 0.5): void { for (let t = 0; t < seconds; t += dt) this.step(dt); }

  step(dt: number): void {
    this.time += dt;
    this.spawn();
    for (const t of this.trams) this.control(t, dt);
    for (const t of this.trams) this.refresh(t);
    for (let i = this.trams.length - 1; i >= 0; i--) {
      const t = this.trams[i];
      if (t.s - t.L > t.path.len + 1) { this.trams.splice(i, 1); this.onLeave?.(t); }
    }
  }

  private spawn(): void {
    while (this.nextTrip < this.trips.length && this.trips[this.nextTrip].spawnAt <= this.time) {
      const trip = this.trips[this.nextTrip], path = this.paths[trip.path], c = TRAM_CLASSES[trip.cls];
      // the way in must be clear: no tram body on the first stretch of this path
      if (this.obstacle(path, 0, c.L + GAP_M + 2, null) < c.L + GAP_M + 2) break;
      this.nextTrip++;
      if (trip.stops[trip.stops.length - 1][1] < this.time - 60) continue;   // long gone
      const t: Tram = {
        id: this.nextId++, trip, path, L: c.L, accel: c.accel, brake: c.brake, s: c.L, v: Math.min(LIMIT_MS, path.limit(c.L)) * 0.6, a: 0,
        next: 0, calling: false, callUntil: 0, callStop: -1, committed: -1, body: Array.from({ length: Math.ceil(c.L / BODY_STEP_M) + 1 }, (): XY => [0, 0]), bodyDir: Array.from({ length: Math.ceil(c.L / BODY_STEP_M) + 1 }, (): XY => [1, 0]), dir: [1, 0], why: '',
      };
      // a stop already behind the entry point is not called at
      while (t.next < trip.stops.length && path.stops[trip.stops[t.next][0]][3] < t.s) t.next++;
      this.refresh(t); this.trams.push(t);
    }
  }

  private refresh(t: Tram): void {
    const n = t.body.length - 1;
    for (let i = 0; i <= n; i++) { t.path.at(t.s - (t.L * i) / n, t.body[i]); t.path.dir(t.s - (t.L * i) / n, t.bodyDir[i]); }
    t.path.dir(t.s, t.dir);
  }

  /**
   * Distance along `path` (from `from`, looking `ahead` metres) to the nearest part of another tram that is on
   * this path and heading the same way. `self` is skipped.
   */
  private obstacle(path: TramPath, from: number, ahead: number, self: Tram | null): number {
    let best = Infinity;
    const here = path.at(Math.max(0, from)), dirHere: XY = [0, 0];
    for (const o of this.trams) {
      if (o === self) continue;
      const mid = o.body[o.body.length >> 1];
      if (Math.hypot(mid[0] - here[0], mid[1] - here[1]) > ahead + o.L) continue;
      for (let i = 0; i < o.body.length; i++) {
        const p = o.body[i], pd = o.bodyDir[i];
        const pr = path.project(p[0], p[1], from - 1, from + ahead);
        if (pr.d > 1.2 || pr.s < from - 0.5) continue;
        path.dir(pr.s, dirHere);
        if (pd[0] * dirHere[0] + pd[1] * dirHere[1] < 0.5) continue;   // crossing: the signals keep those apart
        best = Math.min(best, pr.s);
      }
    }
    return best;
  }

  /**
   * Where a tram must wait for another joining the same track (trams.json merges). Within MERGE_LOOK_M of a
   * join, the tram nearer it goes first (or the one already on it, until its back is clear); the other waits
   * GAP_M short of it. Both paths list the join, so each tram reaches the same answer.
   */
  private mergeHold(t: Tram): number {
    let hold = Infinity;
    for (const [at, other, atOther] of t.path.merges) {
      const mine = at - t.s;
      if (mine < -0.5 || mine > MERGE_LOOK_M) continue;
      for (const o of this.trams) {
        if (o === t || o.trip.path !== other) continue;
        const theirs = atOther - o.s;
        if (theirs > MERGE_LOOK_M || theirs < -(o.L + GAP_M)) continue;   // far off, or through and clear
        const first = theirs < 0 || theirs < mine || (theirs === mine && o.id < t.id);
        if (first) hold = Math.min(hold, at - GAP_M);
      }
    }
    return hold;
  }

  /** Who is directly ahead (for the stop rule): the nearest tram whose back is within `within` m. */
  private leaderOf(t: Tram, within: number): Tram | null {
    let best: Tram | null = null, bestS = Infinity;
    for (const o of this.trams) {
      if (o === t) continue;
      const pr = t.path.project(o.body[2][0], o.body[2][1], t.s - 1, t.s + within);
      if (pr.d < 1.2 && pr.s >= t.s - 0.5 && pr.s < bestS) { bestS = pr.s; best = o; }
    }
    return best;
  }

  private control(t: Tram, dt: number): void {
    const p = t.path, now = this.time;

    // ── calling at a stop ──
    if (t.calling) {
      if (now < t.callUntil) { t.v = 0; t.a = 0; return; }
      t.calling = false; t.next++;
    }

    // ── what it must stop for, nearest first ──
    let stopAt = Infinity;
    const obstacleS = this.obstacle(p, t.s, LOOK_M, t);
    let why: Tram['why'] = '';
    if (obstacleS < Infinity) { stopAt = obstacleS - GAP_M; why = 'tram'; }
    const merge = this.mergeHold(t); if (merge < stopAt) { stopAt = merge; why = 'merge'; }
    // signals ahead
    for (let k = 0; k < p.signals.length; k++) {
      const [line, site, road] = p.signals[k];
      if (line < t.s - 0.5) continue;               // passed
      if (line > t.s + LOOK_M) break;
      if (k === t.committed) continue;
      const ph = this.signalPhase(site, now)[road], dist = line - t.s;
      // never into the intersection without room to get out of it: a tram stopped in it would block the crossing road
      const noRoom = obstacleS - (line + BOX_M) < t.L + GAP_M;
      if (ph === 2 && !(noRoom && dist > 1)) continue;
      if (ph === 2) { if (line < stopAt) { stopAt = line; why = 'box'; } break; }
      const canStop = t.v * t.v <= 2 * t.brake * Math.max(0.01, dist) || t.v < 0.5;
      if (ph === 1 && !canStop) { t.committed = k; continue; }   // too close to stop on amber: go through
      if (ph === 0 && !canStop && dist < 2) { t.committed = k; continue; }   // already over the line
      if (line < stopAt) { stopAt = line; why = 'signal'; } break;
    }
    // the next stop of the trip
    const call = t.next < t.trip.stops.length ? t.trip.stops[t.next] : null;
    const berth = call ? p.stops[call[0]][3] : Infinity;
    if (call && berth < stopAt) { stopAt = berth; why = 'stop'; }
    t.why = why;

    // ── speed ──
    const bPlan = t.brake * COMFORT;
    let vWant = p.limit(t.s);
    for (const [a, , kmh] of p.slow) if (a > t.s && a < t.s + LOOK_M) vWant = Math.min(vWant, Math.sqrt((kmh / 3.6) ** 2 + 2 * bPlan * (a - t.s)));
    const room = stopAt - t.s;
    if (room < Infinity) {
      vWant = Math.min(vWant, Math.sqrt(2 * bPlan * Math.max(0, room)));
      if (room > 0.3) vWant = Math.max(vWant, Math.min(0.8, room));   // creep the last metre in
      else vWant = 0;
    }
    let aWant = Math.max(-t.brake, Math.min(t.accel, (vWant - t.v) / 1.0));
    // braking harder than planned when the stopping distance is running out: no jerk limit then
    const urgent = room < Infinity && t.v * t.v > 2 * bPlan * Math.max(0.01, room);
    if (!urgent) aWant = Math.max(t.a - JERK * dt, Math.min(t.a + JERK * dt, aWant));
    t.a = aWant;
    t.v = Math.max(0, t.v + t.a * dt);
    let s = t.s + t.v * dt;
    if (s > stopAt) { s = Math.max(t.s, stopAt); t.v = 0; t.a = 0; }
    t.s = s;

    // ── arriving ──
    if (call && t.v === 0) {
      const leader = this.leaderOf(t, 8);
      const atBerth = Math.abs(t.s - berth) < 1.5;
      // the same stop (by its id: the tram in front may be on another route's path)
      const behindCaller = !!leader && leader.calling && leader.path.stops[leader.callStop]?.[0] === p.stops[call[0]][0];
      if (atBerth || behindCaller) {
        t.calling = true; t.callStop = call[0];
        const dwell = 15 + 5 * rand(t.trip.index, t.next);
        // early on the timetable: wait for the time, but not more than a minute longer (it holds up the trams behind)
        t.callUntil = now + dwell + Math.min(MAX_HOLD_S, Math.max(0, call[1] - (now + dwell)));
      }
    }
  }
}

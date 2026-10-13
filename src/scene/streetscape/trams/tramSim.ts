/*
 * ─────────────────────────────────────────────────────────────────────────
 * TRAMS RUNNING TO TIMETABLE
 * ─────────────────────────────────────────────────────────────────────────
 *
 * WHAT IT DOES
 *   Runs the day's tram trips through the CBD (trams-<day>.json, from the GTFS timetable) as vehicles that obey the
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
const ENTRY_SHORT_M = 8;       // how far short of its first stop a tram comes into the model, at most
const BOX_M = 25;              // an intersection's depth past its stop line (EST): room needed to clear it
const GRID_M = 10;             // cell of a path's segment grid (segmentsNear)
const SHARE_STEP_M = 1;        // how densely one path is sampled against another (sharesTrack)
const SHARE_OFF_M = 2;         // nearer than this, and heading the same way, is the same track (obstacle allows 1.2)
const SHARE_PAST_END_M = 45;  // longer than any tram (tramClasses)
const NONE: readonly number[] = [];
/** A grid cell as one number (a string key cost more than the lookup it named); cells span ±5,000 km. */
const cellKey = (gx: number, gy: number) => (gx + 500_000) * 1_000_000 + (gy + 500_000);

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
  /**
   * project(), looking only at the segments near (x, y) (segmentsNear) rather than at every one between d0 and
   * d1: the same answer whenever the nearest point is within GRID_M — which is all the simulation asks
   * (it uses a projection only when it is within a metre or so) — and Infinity off beyond that.
   */
  projectNear(x: number, y: number, d0: number, d1: number): { s: number; d: number } {
    let best = { s: 0, d: Infinity };
    const i0 = this.seg(Math.max(0, d0)), i1 = this.seg(Math.min(this.len, d1));
    for (const i of this.segmentsNear(x, y)) {
      if (i < i0 || i > i1) continue;
      const a = this.pts[i], b = this.pts[i + 1], dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy || 1;
      const u = Math.max(0, Math.min(1, ((x - a[0]) * dx + (y - a[1]) * dy) / L2)), dd = Math.hypot(x - a[0] - u * dx, y - a[1] - u * dy);
      if (dd < best.d) best = { s: this.s[i] + u * Math.sqrt(L2), d: dd };
    }
    return best;
  }

  /** The segments (indices into pts) passing within GRID_M of (x, y), from a grid made on first use. */
  segmentsNear(x: number, y: number): readonly number[] {
    if (!this.grid) {
      const grid = new Map<number, number[]>();
      for (let i = 0; i < this.pts.length - 1; i++) {
        const a = this.pts[i], b = this.pts[i + 1];
        const x0 = Math.floor((Math.min(a[0], b[0]) - GRID_M) / GRID_M), x1 = Math.floor((Math.max(a[0], b[0]) + GRID_M) / GRID_M);
        const y0 = Math.floor((Math.min(a[1], b[1]) - GRID_M) / GRID_M), y1 = Math.floor((Math.max(a[1], b[1]) + GRID_M) / GRID_M);
        for (let gx = x0; gx <= x1; gx++) for (let gy = y0; gy <= y1; gy++) {
          const key = cellKey(gx, gy), list = grid.get(key);
          if (list) list.push(i); else grid.set(key, [i]);
        }
      }
      this.grid = grid;
    }
    return this.grid.get(cellKey(Math.floor(x / GRID_M), Math.floor(y / GRID_M))) ?? NONE;
  }
  private grid: Map<number, number[]> | null = null;

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
   * @param before the day before's timetable (its own day type), for the trips still running after
   *               midnight; they are listed in it past 24:00. Without it, this day's own late trips stand in.
   */
  constructor(doc: TramsDoc, day: DayKey, time: number, signalPhase: (site: number, t: number) => Phase, before?: { doc: TramsDoc; day: DayKey }) {
    this.paths = doc.paths.map((p) => new TramPath(p));
    this.time = time; this.signalPhase = signalPhase;
    const trips: Trip[] = [];
    const read = (list: TramsDoc['trips'][DayKey], shift: number, lateOnly: boolean) => list.forEach(([path, route, cls, flat], index) => {
      const stops: [number, number][] = []; for (let i = 0; i < flat.length; i += 2) stops.push([flat[i], flat[i + 1] - shift]);
      if (lateOnly && stops[stops.length - 1][1] < 0) return;
      const p = this.paths[path], first = p.stops[stops[0][0]];
      const spawnAt = stops[0][1] - first[3] / ENTRY_MS - 20;
      trips.push({ index: shift ? -1 - index : index, path, route, cls, stops, spawnAt });
    });
    read(doc.trips[day], 0, false);
    if (before) read(before.doc.trips[before.day], 86400, true);
    else read(doc.trips[day], 86400, true);
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

  /*
   * Trips due to enter, oldest first. One waits while its way in is taken, and so do the later trips on the
   * same path (they keep their order); trips on other paths come in regardless.
   */
  private due: Trip[] = [];

  private spawn(): void {
    while (this.nextTrip < this.trips.length && this.trips[this.nextTrip].spawnAt <= this.time) this.due.push(this.trips[this.nextTrip++]);
    const blocked = new Set<number>();
    for (let k = 0; k < this.due.length; k++) {
      const trip = this.due[k], path = this.paths[trip.path], c = TRAM_CLASSES[trip.cls];
      if (blocked.has(trip.path)) continue;
      if (trip.stops[trip.stops.length - 1][1] < this.time - 60) { this.due.splice(k--, 1); continue; }   // long gone
      /*
       * The front starts short of the first stop, so the trip calls there too: at most a tram length in, and
       * never past the stop. The body may reach back past the edge of the model, as a tram coming in does.
       */
      const front = Math.max(0, Math.min(c.L, path.stops[trip.stops[0][0]][3] - ENTRY_SHORT_M));
      // the way in must be clear: no tram body from the edge to just ahead of the front
      if (this.obstacle(path, 0, front + GAP_M + 2, null) < front + GAP_M + 2) { blocked.add(trip.path); continue; }
      this.due.splice(k--, 1);
      const t: Tram = {
        id: this.nextId++, trip, path, L: c.L, accel: c.accel, brake: c.brake, s: front, v: Math.min(LIMIT_MS, path.limit(front)) * 0.6, a: 0,
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
      // a tram on a path that never runs along this one, the same way, can never be in front: skipped whole
      if (!this.sharesTrack(path, o.path)) continue;
      const mid = o.body[o.body.length >> 1];
      if (Math.hypot(mid[0] - here[0], mid[1] - here[1]) > ahead + o.L) continue;
      for (let i = 0; i < o.body.length; i++) {
        const p = o.body[i], pd = o.bodyDir[i];
        const pr = path.projectNear(p[0], p[1], from - 1, from + ahead);
        if (pr.d > 1.2 || pr.s < from - 0.5) continue;
        path.dir(pr.s, dirHere);
        if (pd[0] * dirHere[0] + pd[1] * dirHere[1] < 0.5) continue;   // crossing: the signals keep those apart
        best = Math.min(best, pr.s);
      }
    }
    return best;
  }

  /*
   * Whether any stretch of `other` runs along `path`, the same way: worked out once per pair, by sampling
   * `other` every SHARE_STEP_M against `path`'s segment grid. obstacle() looks at every other tram for every
   * tram, every step, and almost all of those pairs are on tracks that only cross or never meet; it was most
   * of the simulation's time (2026-10-14). The test is looser than obstacle's own (SHARE_OFF_M against
   * 1.2 m, a wider angle), so a pair it lets through is checked as before and none it drops could have counted.
   */
  private shared = new Map<TramPath, Map<TramPath, boolean>>();
  private sharesTrack(path: TramPath, other: TramPath): boolean {
    if (path === other) return true;
    let row = this.shared.get(path);
    if (!row) { row = new Map(); this.shared.set(path, row); }
    let answer = row.get(other);
    if (answer === undefined) {
      answer = false;
      // along each segment of `other` (and the straights past its ends), every SHARE_STEP_M
      const pts = other.pts, last = pts.length - 1, p: XY = [0, 0];
      for (let j = -1; j <= last && !answer; j++) {
        const a = pts[Math.max(0, Math.min(last - 1, j))], b = pts[Math.max(1, Math.min(last, j + 1))];
        const sx = b[0] - a[0], sy = b[1] - a[1], len = Math.hypot(sx, sy) || 1, ux = sx / len, uy = sy / len;
        // the segment itself; before the first and after the last, the straight on beyond the end
        const [ox, oy, run] = j === -1 ? [a[0] - ux * SHARE_PAST_END_M, a[1] - uy * SHARE_PAST_END_M, SHARE_PAST_END_M]
          : j === last ? [b[0], b[1], SHARE_PAST_END_M] : [a[0], a[1], len];
        for (let t = 0; t <= run && !answer; t += SHARE_STEP_M) {
          p[0] = ox + ux * t; p[1] = oy + uy * t;
          for (const i of path.segmentsNear(p[0], p[1])) {
            const c = path.pts[i], e = path.pts[i + 1], dx = e[0] - c[0], dy = e[1] - c[1], L2 = dx * dx + dy * dy || 1;
            const u = Math.max(0, Math.min(1, ((p[0] - c[0]) * dx + (p[1] - c[1]) * dy) / L2));
            if (Math.hypot(p[0] - c[0] - u * dx, p[1] - c[1] - u * dy) > SHARE_OFF_M) continue;
            if ((ux * dx + uy * dy) / Math.sqrt(L2) >= 0.4) { answer = true; break; }
          }
        }
      }
      row.set(other, answer);
    }
    return answer;
  }

  /**
   * Where a tram must wait for another joining the same track (the paths' merges). Within MERGE_LOOK_M of a
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
      const back = o.body[o.body.length - 1];
      const pr = t.path.projectNear(back[0], back[1], t.s - 1, t.s + within);
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

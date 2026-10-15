/*
 * THE ELIZABETH STREET TERMINUS — two tracks either side of an island platform, where the data had one.
 *
 * Stop 1: Flinders Street Station (routes 19, 57, 59) ends Elizabeth St at Flinders St. The City of Melbourne's
 * surfaces show a tram formation each side of a raised island, one track wide each; the PTV route lines the
 * tracks come from (build-streetscape.mjs) run the two directions as one line from about 42 m north of the
 * island, so the data had the east track only: arriving trams (paths 13 and 26, southbound) and leaving ones
 * (14 and 27, northbound) used the same rails head on, and an arriving tram passed through one waiting to leave.
 * The island is seen on site with a track along each side (2026-10-16).
 *
 * What this does (all positions from the surfaces, EST beyond that):
 *   - the northbound track (track line 41, which left the southbound one 42 m north of the island) is carried
 *     down the middle of the west formation to its south end (u = 33; the island runs on to u = 44, beyond the
 *     surveyed formation, so the west rail stops short of the island's south end), joining its old line by an
 *     S-curve to the north;
 *   - the southbound track (line 40) along the island is moved onto the middle of the east formation (it sat
 *     0.9 m east of it: the build's fit to the formation needs a second track beside it, and there was none);
 *   - leaving trams start on the west track, arriving ones keep the east (left-running north of the island, so
 *     neither crosses the other); distances along the changed paths (stops, signals, slow zones, joins) are
 *     moved with them;
 *   - the platform sits between the two tracks and is drawn as an island (both edges), without fence or ramp.
 *
 * Run after build-streetscape.mjs and build-trams.mjs, and before terminus-crossover.mjs (it changes their
 * output; a second run does nothing; after a rebuild, the whole chain again: build-streetscape.mjs). The track lines and paths
 * are found by number and checked against the island before anything is changed; tram.json, which carries the
 * marker, is written last, so a run that fails part way can be run again.
 *   node scripts/terminus-tracks.mjs public/data/streetscape
 */
import fs from 'node:fs';
import path from 'node:path';
import { EDGE_M, surfaceLookup } from './align-platforms.mjs';

const FIX = 'elizabeth-terminus';
const STOP = 'Stop 1: Flinders Street Station';
const NB_LINE = 41, SB_LINE = 40;          // northbound (west) and southbound (east) track lines, as built
const LEAVING = [14, 27], ARRIVING = [13, 26];
const SOUTH_END_U = 33;                    // the west formation runs to about u = 35 (u: along the island, + south)
const CURVE_U = [-30, -72];                // the S-curve from the west formation to the old northbound line

const dir = process.argv[2]; if (!dir) throw new Error('usage: node scripts/terminus-tracks.mjs <dir of tram.json, trams-*.json, surfaces.json>');
const read = (f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
const tram = read('tram.json');
const DAYS = ['monThu', 'fri', 'sat', 'sun'];
if ((tram.fixes || []).includes(FIX)) {
  // tram.json is done and is the starting point for the timetables: one built again since cannot be done alone
  const left = DAYS.filter((d) => !(read(`trams-${d}.json`).fixes || []).includes(FIX));
  if (left.length) throw new Error(`trams-${left[0]}.json is not done but tram.json is: run the whole chain from build-streetscape.mjs`);
  console.log('already done'); process.exit(0);
}
const surfAt = surfaceLookup(read('surfaces.json'));
const r2 = (v) => Math.round(v * 100) / 100;
const smooth = (x) => x * x * (3 - 2 * x);

const q = tram.platforms.find((p) => p.name === STOP); if (!q) throw new Error(STOP + ' not found');
const must = (v, what) => { if (v === null || v === undefined || Number.isNaN(v)) throw new Error('terminus-tracks: ' + what); return v; };
const t = q.t, nn = [-t[1], t[0]], o = q.c;   // +u along the island (south), +w across it (east)
const U = (p) => (p[0] - o[0]) * t[0] + (p[1] - o[1]) * t[1], W = (p) => (p[0] - o[0]) * nn[0] + (p[1] - o[1]) * nn[1];
const XY = (u, w) => [r2(o[0] + t[0] * u + nn[0] * w), r2(o[1] + t[1] * u + nn[1] * w)];
/** The middle of the tram formation west (side -1) or east (+1) of the island, at u. */
function formationMid(u, side) {
  let a = null, b = null;
  for (let w = side * 0.5; Math.abs(w) < 7; w += side * 0.1) {
    const f = surfAt(XY(u, w)) === 'Road Tram Formation';
    if (f && a === null) a = w; if (!f && a !== null) { b = w - side * 0.1; break; }
  }
  return a === null || b === null ? null : (a + b) / 2;
}
const lineW = (l, u) => { let best = null; for (let i = 0; i < l.length - 1; i++) { const ua = U(l[i]), ub = U(l[i + 1]); if ((ua - u) * (ub - u) <= 0 && ua !== ub) { const k = (u - ua) / (ub - ua); best = W(l[i]) + (W(l[i + 1]) - W(l[i])) * k; } } return best; };

// the numbered track lines and paths must be the ones beside the island (a new build can renumber them)
// (the northbound one where the curve will join it, the southbound one beside the island)
for (const [li, what, u] of [[NB_LINE, 'northbound', CURVE_U[1] - 5], [SB_LINE, 'southbound', 0]]) {
  const w = lineW(tram.trackLines[li] || [], u);
  if (w === null || Math.abs(w) > 8) throw new Error(`terminus-tracks: track line ${li} is not the ${what} track beside the island`);
}

// where the formation's end is ragged, the nearest middle to the north of it
const westMid = (u) => { for (let d = 0; d < 20; d += 1) { const m = formationMid(u - d, -1); if (m !== null) return m; } throw new Error('no west formation near u ' + u); };

// ── the island first: its outline's middle onto the middle between the two formations ──
const um = (q.u[0] + q.u[1]) / 2, shift = (westMid(um) + formationMid(um, 1)) / 2 - (q.w[0] + q.w[1]) / 2;
const westEdge = q.w[0] + shift, eastEdge = q.w[1] + shift;
/*
 * Beside the island each track keeps the standard EDGE_M from its edge (align-platforms.mjs): the formation
 * narrows to the north end, and its middle there would bring a tram's side over the platform edge. Elsewhere,
 * the formation's middle.
 */
const beside = (u) => u >= q.u[0] - 2 && u <= q.u[1] + 2;
const westW = (u) => (beside(u) ? Math.min(westMid(u), westEdge - EDGE_M) : westMid(u));
const eastW = (u) => { const m = formationMid(u, 1); return m === null ? null : beside(u) ? Math.max(m, eastEdge + EDGE_M) : m; };

// ── the west track: down the west formation, then an S-curve onto the old northbound line ──
const nb = tram.trackLines[NB_LINE];
const joinW = must(lineW(nb, CURVE_U[1]), 'northbound line not found at the curve');
const us = []; for (let u = SOUTH_END_U; u >= CURVE_U[0]; u -= 2) us.push(u);
const raw = us.map(westW);
// eased over five points (the clearance meets the formation's middle at a corner), never nearer the island
const ws = raw.map((w, i) => Math.min(w, raw.slice(Math.max(0, i - 2), i + 3).reduce((x, y) => x + y, 0) / raw.slice(Math.max(0, i - 2), i + 3).length));
const west = us.map((u, i) => XY(u, ws[i]));
const w0 = ws[ws.length - 1];
for (let u = CURVE_U[0] - 2; u > CURVE_U[1]; u -= 2) { const k = smooth((CURVE_U[0] - u) / (CURVE_U[0] - CURVE_U[1])); west.push(XY(u, w0 + (joinW - w0) * k)); }
const nbKeep = nb.filter((p) => U(p) <= CURVE_U[1]);   // the line runs south to north: keep what is north of the curve
tram.trackLines[NB_LINE] = [...west, ...nbKeep];
const westAt = (u) => lineW(tram.trackLines[NB_LINE], u);

// ── the east track (and the arriving paths on it): onto the middle of the east formation ──
const eastShift = (p) => {
  const u = U(p), w = W(p);
  if (u < -60 || u > SOUTH_END_U + 5 || Math.abs(w - 2.5) > 2) return p;
  const mid = eastW(u); if (mid === null) return p;
  const k = u >= -40 ? 1 : smooth((u + 60) / 20);   // eased in over 20 m
  return XY(u, w + (mid - w) * k);
};
tram.trackLines[SB_LINE] = tram.trackLines[SB_LINE].map(eastShift);

// ── the island: drawn with both edges, no fence or ramp ──
q.c = XY(0, shift); q.ring = q.ring.map((p) => XY(U(p), W(p) + shift));
Object.assign(q, { island: true, needRamp: false, fence: [], m: [r2(q.u[0] + 0.3), r2(q.u[1] - 0.3)] });
delete q.aligned;

// ── the paths, in every timetable ──
const lenOf = (pts) => { let s = 0; for (let i = 1; i < pts.length; i++) s += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); return s; };
const sAtU = (pts, u) => { let s = 0; for (let i = 0; i < pts.length - 1; i++) { const ua = U(pts[i]), ub = U(pts[i + 1]), L = Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]); if ((ua - u) * (ub - u) <= 0 && ua !== ub) return s + L * (u - ua) / (ub - ua); s += L; } return null; };
const uAtS = (pts, sq) => { let s = 0; for (let i = 0; i < pts.length - 1; i++) { const L = Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]); if (s + L >= sq) { const k = (sq - s) / (L || 1); return U([pts[i][0] + (pts[i + 1][0] - pts[i][0]) * k, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * k]); } s += L; } return null; };
const near = (pt) => Math.hypot(pt[0] - o[0], pt[1] - o[1]) < 80;
for (const day of DAYS) {
  const f = `trams-${day}.json`, doc = read(f);
  if ((doc.fixes || []).includes(FIX)) continue;
  for (const pi of LEAVING) if (!doc.paths[pi] || !near(doc.paths[pi].pts[0])) throw new Error(`terminus-tracks: ${f} path ${pi} does not start at the island`);
  for (const pi of ARRIVING) if (!doc.paths[pi] || !near(doc.paths[pi].pts.at(-1))) throw new Error(`terminus-tracks: ${f} path ${pi} does not end at the island`);
  const moved = {};   // path -> function old s -> new s
  for (const pi of LEAVING) {
    const p = doc.paths[pi], old = p.pts;
    // its points from the start to the end of the curve are replaced by the west track's
    let k = 0; while (k < old.length && U(old[k]) > CURVE_U[1]) k++;
    const startU = U(old[0]);
    const head = tram.trackLines[NB_LINE].filter((x) => U(x) <= startU && U(x) > CURVE_U[1]);
    const first = XY(startU, must(westAt(startU), `${f} path ${pi} starts beyond the west track`));
    const pts = [first, ...head.filter((x) => U(x) < startU - 0.5), ...old.slice(k)];
    const oldK = lenOf(old.slice(0, k + 1)), newK = lenOf(pts.slice(0, pts.length - (old.length - k) + 1)), d = newK - oldK;
    moved[pi] = (s) => { if (s >= oldK) return s + d; const u = uAtS(old, s); return (u === null ? null : sAtU(pts, u)) ?? s; };
    p.pts = pts;
    p.stops = p.stops.map((st) => [st[0], st[1], st[2], r2(moved[pi](st[3])), st[4]]);
    p.signals = p.signals.map((sg) => [r2(moved[pi](sg[0])), sg[1], sg[2]]);
    p.slow = p.slow.map(([a, b, v]) => [r2(moved[pi](a)), r2(moved[pi](b)), v]);
    p.merges = p.merges.map(([at, other, atOther]) => [r2(moved[pi](at)), other, atOther]);
  }
  for (const pi of ARRIVING) doc.paths[pi].pts = doc.paths[pi].pts.map(eastShift);
  // joins other paths have with the moved ones
  for (const p of doc.paths) p.merges = p.merges.map(([at, other, atOther]) => [at, other, moved[other] ? r2(moved[other](atOther)) : atOther]);
  doc.fixes = [...(doc.fixes || []), FIX];
  fs.writeFileSync(path.join(dir, f), JSON.stringify(doc));
}
tram.fixes = [...(tram.fixes || []), FIX];
fs.writeFileSync(path.join(dir, 'tram.json'), JSON.stringify(tram));
console.log('west track', west.length, 'points; island at w', r2(W(q.c)), '; leaving paths moved', LEAVING.join(', '));

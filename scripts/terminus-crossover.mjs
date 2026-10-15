/*
 * THE ELIZABETH STREET TERMINUS CROSSOVER — trams take whichever side of the island is free.
 *
 * On site (2026-10-16) there are points north of the island at Stop 1: Flinders Street Station, and an
 * arriving tram runs into either side of it, whichever is free; a tram leaves from either side. After
 * terminus-tracks.mjs the data has the two tracks but every arriving tram on the east side and every leaving
 * one on the west. This adds:
 *   - a scissors crossover north of the island (U_NORTH to U_SOUTH): one diagonal for an arriving tram into
 *     the west side (east track to west, southbound) and one for a leaving tram out of the east side (east
 *     track to west, northbound), as track lines (rails and wire);
 *   - for each of the four paths through the terminus, its other-side twin: the same up to the crossover, the
 *     other side after it (stops, signals, slow zones, joins carried by where they are along the island);
 *   - doc.terminus, telling the simulation which side each path ends or starts at, its twin, and where it
 *     runs through the crossover (tramSim.ts: berths and the crossover lock).
 * Positions are EST: the points' real place is not on record; this keeps them clear of the island and of
 * Flinders Lane's crossing.
 *
 * Run after terminus-tracks.mjs (a second run does nothing; after a rebuild, the whole chain again:
 * build-streetscape.mjs). Anything not where it is expected stops it before a file is written; tram.json, which
 * carries the marker, is written last.
 *   node scripts/terminus-crossover.mjs public/data/streetscape
 */
import fs from 'node:fs';
import path from 'node:path';

const FIX = 'elizabeth-crossover';
const STOP = 'Stop 1: Flinders Street Station';
const NB_LINE = 41, SB_LINE = 40;
const ARRIVING = [13, 26], LEAVING = [14, 27];   // on the east side and the west side, as terminus-tracks.mjs left them
const U_NORTH = -64, U_SOUTH = -42;               // the diagonals' ends (u along the island, + south)
const X_MARGIN = 4;                              // the crossover's lock reaches this far past the diagonals' ends

const dir = process.argv[2]; if (!dir) throw new Error('usage: node scripts/terminus-crossover.mjs <dir of tram.json, trams-*.json>');
const read = (f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
const tram = read('tram.json');
const DAYS = ['monThu', 'fri', 'sat', 'sun'];
if ((tram.fixes || []).includes(FIX)) {
  // tram.json is done and is the starting point for the timetables: one built again since cannot be done alone
  const left = DAYS.filter((d) => !(read(`trams-${d}.json`).fixes || []).includes(FIX));
  if (left.length) throw new Error(`trams-${left[0]}.json is not done but tram.json is: run the whole chain from build-streetscape.mjs`);
  console.log('already done'); process.exit(0);
}
if (!(tram.fixes || []).includes('elizabeth-terminus')) throw new Error('run terminus-tracks.mjs first');
const r2 = (v) => Math.round(v * 100) / 100;
const must = (v, what) => { if (v === null || v === undefined || Number.isNaN(v) || v === -1) throw new Error('terminus-crossover: ' + what); return v; };
const smooth = (x) => x * x * (3 - 2 * x);

const q = tram.platforms.find((p) => p.name === STOP); if (!q) throw new Error(STOP + ' not found');
const t = q.t, nn = [-t[1], t[0]], o = q.c;
const U = (p) => (p[0] - o[0]) * t[0] + (p[1] - o[1]) * t[1], W = (p) => (p[0] - o[0]) * nn[0] + (p[1] - o[1]) * nn[1];
const XY = (u, w) => [r2(o[0] + t[0] * u + nn[0] * w), r2(o[1] + t[1] * u + nn[1] * w)];
const lineAt = (l, u) => { for (let i = 0; i < l.length - 1; i++) { const ua = U(l[i]), ub = U(l[i + 1]); if ((ua - u) * (ub - u) <= 0 && ua !== ub) { const k = (u - ua) / (ub - ua); return W(l[i]) + (W(l[i + 1]) - W(l[i])) * k; } } return null; };
const lineW = (l, u) => must(lineAt(l, u), `a track does not reach u ${u}`);
const east = tram.trackLines[SB_LINE], west = tram.trackLines[NB_LINE];

// ── the two diagonals, east track to west track, eased at both ends ──
const diagonal = (fromU, toU) => {   // from the east track at fromU to the west track at toU, in that order
  const pts = [], n = Math.round(Math.abs(toU - fromU) / 1.5);
  for (let i = 0; i <= n; i++) { const u = fromU + (toU - fromU) * i / n, k = smooth(i / n); pts.push(XY(u, lineW(east, u) * (1 - k) + lineW(west, u) * k)); }
  return pts;
};
const intoWest = diagonal(U_NORTH, U_SOUTH);    // southbound: arriving into the west side
const outOfEast = diagonal(U_SOUTH, U_NORTH);   // northbound: leaving from the east side
tram.trackLines.push(intoWest, outOfEast);

// ── the twins of the four paths ──
const lenOf = (pts) => { let s = 0; for (let i = 1; i < pts.length; i++) s += Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); return s; };
const sAtU = (pts, u, from = 0) => { let s = 0; for (let i = 0; i < pts.length - 1; i++) { const ua = U(pts[i]), ub = U(pts[i + 1]), L = Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]); if (s + L >= from && (ua - u) * (ub - u) <= 0 && ua !== ub) return s + L * (u - ua) / (ub - ua); s += L; } return null; };
const uAtS = (pts, sq) => { let s = 0; for (let i = 0; i < pts.length - 1; i++) { const L = Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]); if (s + L >= sq) { const k = (sq - s) / (L || 1); return U([pts[i][0] + (pts[i + 1][0] - pts[i][0]) * k, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * k]); } s += L; } return null; };
const near = (p, u0, u1) => U(p) >= Math.min(u0, u1) - 200 && U(p) <= Math.max(u0, u1) + 200 && Math.abs(W(p)) < 12;

/** A twin: the same points up to where `cut` says, then `tail`; distances along carried by place. */
function twin(p, keepHead, tail, keepTail) {
  const pts = [...keepHead, ...tail, ...keepTail], moved = (s) => {
    // a distance before the changed stretch stays; after it, the same place along the island (or beyond, shifted)
    const headLen = lenOf(keepHead), oldU = uAtS(p.pts, s);
    if (s <= headLen) return s;
    if (keepTail.length) { const tailFrom = lenOf(p.pts) - lenOf(keepTail), d = lenOf(pts) - lenOf(p.pts); if (s >= tailFrom) return s + d; }
    const ns = oldU === null ? null : sAtU(pts, oldU, headLen - 1);
    return ns ?? s;
  };
  return {
    pts, stops: p.stops.map((st) => [st[0], st[1], st[2], r2(moved(st[3])), st[4]]),
    signals: p.signals.map((sg) => [r2(moved(sg[0])), sg[1], sg[2]]),
    slow: p.slow.map(([a, b, v]) => [r2(moved(a)), r2(moved(b)), v]),
    merges: p.merges.map(([at, other, atOther]) => [r2(moved(at)), other, atOther]),
  };
}
const xRange = (pts) => { const a = must(sAtU(pts, U_NORTH - X_MARGIN), 'a path misses the crossover'), b = must(sAtU(pts, U_SOUTH + X_MARGIN), 'a path misses the crossover'); return [r2(Math.min(a, b)), r2(Math.max(a, b))]; };

const out = [];   // [file, doc]: written only once every day is done
for (const day of DAYS) {
  const f = `trams-${day}.json`, doc = read(f);
  if ((doc.fixes || []).includes(FIX)) continue;
  for (const pi of ARRIVING) if (Math.hypot(doc.paths[pi]?.pts.at(-1)[0] - o[0], doc.paths[pi]?.pts.at(-1)[1] - o[1]) > 80) throw new Error(`terminus-crossover: ${f} path ${pi} does not end at the island`);
  for (const pi of LEAVING) if (Math.hypot(doc.paths[pi]?.pts[0][0] - o[0], doc.paths[pi]?.pts[0][1] - o[1]) > 80) throw new Error(`terminus-crossover: ${f} path ${pi} does not start at the island`);
  const entries = [];
  for (const pi of ARRIVING) {   // southbound into the east side; twin: over the crossover into the west side
    const p = doc.paths[pi], endU = U(p.pts[p.pts.length - 1]);
    const headN = must(p.pts.findIndex((x) => near(x, U_NORTH, U_SOUTH) && U(x) >= U_NORTH - 0.5), `${f} path ${pi} never reaches the crossover`);
    const tail = [...west].filter((x) => U(x) > U_SOUTH + 0.5 && U(x) <= endU).sort((a, b) => U(a) - U(b));
    const tw = twin(p, p.pts.slice(0, headN), [...intoWest, ...tail], []);
    doc.paths.push(tw);
    entries.push([pi, 'E', 'arrive', doc.paths.length - 1, ...xRange(p.pts), false], [doc.paths.length - 1, 'W', 'arrive', pi, ...xRange(tw.pts), true]);
  }
  for (const pi of LEAVING) {   // northbound out of the west side; twin: out of the east side over the crossover
    const p = doc.paths[pi], startU = U(p.pts[0]);
    const k = must(p.pts.findIndex((x) => U(x) < U_NORTH - 0.5), `${f} path ${pi} never leaves the crossover`);
    const head = [XY(startU, lineW(east, startU)), ...[...east].filter((x) => U(x) < startU - 0.5 && U(x) > U_SOUTH + 0.5).sort((a, b) => U(b) - U(a))];
    const tw = twin(p, [], [...head, ...outOfEast], p.pts.slice(k));
    doc.paths.push(tw);
    entries.push([pi, 'W', 'depart', doc.paths.length - 1, ...xRange(p.pts), false], [doc.paths.length - 1, 'E', 'depart', pi, ...xRange(tw.pts), true]);
  }
  doc.terminus = entries;
  doc.fixes = [...(doc.fixes || []), FIX];
  out.push([f, doc]);
}
for (const [f, doc] of out) fs.writeFileSync(path.join(dir, f), JSON.stringify(doc));
tram.fixes = [...(tram.fixes || []), FIX];
fs.writeFileSync(path.join(dir, 'tram.json'), JSON.stringify(tram));
if (fs.existsSync(path.join(dir, 'manifest.json'))) { const m = read('manifest.json'); m.counts.trackLines = tram.trackLines.length; fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(m)); }
console.log('crossover diagonals', intoWest.length, outOfEast.length, 'points; twins added for paths', [...ARRIVING, ...LEAVING].join(', '));

/*
 * ─────────────────────────────────────────────────────────────────────────
 * TRAMS TO TIMETABLE — the data the tram simulation runs on
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Usage: node scripts/build-trams.mjs --gtfs <dir of the unzipped tram GTFS>
 *   The tram GTFS is folder 3 of the Victorian GTFS Schedule (Transport Victoria / DTP, CC BY 4.0, weekly):
 *   https://opendata.transport.vic.gov.au/dataset/gtfs-schedule  ->  gtfs.zip / 3 / google_transit.zip
 *   Run after build-streetscape.mjs: it reads tram.json (tracks, platforms) and signals.json from there.
 *
 * WRITES public/data/streetscape/trams-{monThu,fri,sat,sun}.json (the same paths in each; the day's trips)
 *   paths   one per distinct route path through the CBD: the GTFS shape clipped to the model's extent and
 *           laid onto the surveyed track centrelines (the shapes already follow the track they run on, within
 *           ~0.6 m; inside intersections, where there is no surveyed curve, the shape itself is kept). Each
 *           path carries, as distances along it:
 *             stops    where the front of a tram stops: the downstream end of the platform (tram.json) the GTFS
 *                      stop is on, or 5 m past the stop where no platform was matched
 *             signals  the stop line before each signalised intersection the path crosses, the site index in
 *                      signals.json, and which signal road (A: along the grid's north-south axis, B: east-west)
 *             merges   where it joins another path's track: [distance here, other path, distance there]
 *             slow     stretches below the 40 km/h CBD limit: curves (Yarra Trams track design minimum speeds,
 *                      15 km/h to 50 m radius, 20 to 100 m, 30 to 240 m) and Bourke St Mall (10 km/h, EST)
 *   trips   per day type (Mon-Thu, Fri, Sat, Sun: the services of one ordinary date of each in the feed),
 *           each [path, route, class, [stop index, scheduled time s]...]. GTFS times are whole minutes with
 *           no dwell (arrival = departure); times past 24:00 belong to the service day before.
 *   days    the dates used, so the app can say which timetable it shows.
 *
 * Tram classes per route are EST (allocations change; Wikipedia, 2026): see CLASS_BY_ROUTE.
 */
import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import proj4 from 'proj4';

const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, all) => (v.startsWith('--') ? [...a, [v.slice(2), all[i + 1]]] : a), []));
const G = args.gtfs; if (!G) throw new Error('--gtfs <dir> is required');
const OUT = path.resolve('public/data/streetscape');

proj4.defs('EPSG:7855', '+proj=utm +zone=55 +south +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs');
const toM = proj4('EPSG:4326', 'EPSG:7855');
const ORIGIN = toM.forward([144.9605, -37.8145]);
const P = (lon, lat) => { const [x, y] = toM.forward([lon, lat]); return [x - ORIGIN[0], y - ORIGIN[1]]; };
const r2 = (v) => Math.round(v * 100) / 100;

// ── the model's extent (as build-streetscape) ─────────────────────────────
const manifest = JSON.parse(fs.readFileSync(path.join(OUT, 'manifest.json'), 'utf8'));
const [W, S, E, N] = manifest.extentWgs84;
const inBox = (lon, lat) => lon >= W && lon <= E && lat >= S && lat <= N;
const tram = JSON.parse(fs.readFileSync(path.join(OUT, 'tram.json'), 'utf8'));
const signals = JSON.parse(fs.readFileSync(path.join(OUT, 'signals.json'), 'utf8'));
const surfaces = JSON.parse(fs.readFileSync(path.join(OUT, 'surfaces.json'), 'utf8'));
const NS = surfaces.axes.ns, EW = surfaces.axes.ew;

// ── csv ───────────────────────────────────────────────────────────────────
function parseLine(line) {
  const out = []; let cur = '', q = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (q) { if (c === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else if (c === '"') q = true; else if (c === ',') { out.push(cur); cur = ''; } else cur += c;
  }
  out.push(cur); return out;
}
function readCsv(name) {
  const lines = fs.readFileSync(path.join(G, name), 'utf8').replace(/^﻿/, '').split(/\r?\n/).filter(Boolean);
  const head = parseLine(lines[0]);
  return lines.slice(1).map((l) => Object.fromEntries(parseLine(l).map((v, i) => [head[i], v])));
}
async function eachCsv(name, fn) {
  const rl = readline.createInterface({ input: fs.createReadStream(path.join(G, name), 'utf8'), crlfDelay: Infinity });
  let head = null;
  for await (const raw of rl) { const line = head ? raw : raw.replace(/^﻿/, ''); if (!line) continue; const v = parseLine(line); if (!head) { head = v; continue; } fn(v, head); }
}
const secs = (t) => { const [h, m, s] = t.split(':').map(Number); return h * 3600 + m * 60 + s; };

// ── which services run on an ordinary day of each type ────────────────────
const calendar = readCsv('calendar.txt'), exceptions = readCsv('calendar_dates.txt');
const DOW = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const ymd = (d) => d.toISOString().slice(0, 10).replace(/-/g, '');
function servicesOn(date) {
  const dow = DOW[new Date(`${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6)}T12:00:00Z`).getUTCDay()];
  const on = new Set(calendar.filter((c) => c[dow] === '1' && c.start_date <= date && c.end_date >= date).map((c) => c.service_id));
  for (const x of exceptions) if (x.date === date) { if (x.exception_type === '1') on.add(x.service_id); else on.delete(x.service_id); }
  return on;
}
const DAY_TYPES = { monThu: 1, fri: 5, sat: 6, sun: 0 };   // weekday of the representative date
const start = calendar.reduce((m, c) => (c.start_date < m ? c.start_date : m), '99999999');
const days = {};
for (const [key, dow] of Object.entries(DAY_TYPES)) {
  // the first ordinary date of that weekday, a week into the feed
  const d = new Date(`${start.slice(0, 4)}-${start.slice(4, 6)}-${start.slice(6)}T12:00:00Z`); d.setUTCDate(d.getUTCDate() + 7);
  for (let k = 0; k < 60; k++, d.setUTCDate(d.getUTCDate() + 1)) {
    // special-day services are switched off on almost every date; an ordinary date is one with none switched on
    const date = ymd(d); if (d.getUTCDay() !== dow || exceptions.some((x) => x.date === date && x.exception_type === '1')) continue;
    days[key] = { date, services: servicesOn(date) }; break;
  }
}
console.log('days', Object.entries(days).map(([k, v]) => `${k} ${v.date} (${[...v.services].join(' ')})`).join(' | '));

// ── routes, stops, trips ──────────────────────────────────────────────────
const routes = new Map(readCsv('routes.txt').map((r) => [r.route_id, r.route_short_name]));
const stops = new Map(readCsv('stops.txt').map((s) => [s.stop_id, { name: s.stop_name, lon: +s.stop_lon, lat: +s.stop_lat }]));
const cbdStop = new Set([...stops].filter(([, s]) => inBox(s.lon, s.lat)).map(([id]) => id));
const anyService = new Set(Object.values(days).flatMap((d) => [...d.services]));
const trips = new Map();
for (const t of readCsv('trips.txt')) if (anyService.has(t.service_id)) trips.set(t.trip_id, { route: routes.get(t.route_id), service: t.service_id, shape: t.shape_id, stops: [] });
await eachCsv('stop_times.txt', (v, h) => {
  const trip = trips.get(v[0]); if (!trip) return;
  const stopId = v[h.indexOf('stop_id')]; if (!cbdStop.has(stopId)) return;
  trip.stops.push([stopId, secs(v[h.indexOf('departure_time')]), +v[h.indexOf('stop_sequence')]]);
});
for (const [id, t] of trips) { if (t.stops.length < 2) trips.delete(id); else t.stops.sort((a, b) => a[2] - b[2]); }
console.log('trips through the CBD on the chosen days', trips.size);

// ── shapes -> paths on the track ──────────────────────────────────────────
const usedShapes = new Set([...trips.values()].map((t) => t.shape));
const shapes = new Map();
await eachCsv('shapes.txt', (v) => { if (!usedShapes.has(v[0])) return; if (!shapes.has(v[0])) shapes.set(v[0], []); shapes.get(v[0]).push([+v[3], +v[2], +v[1]]); });
for (const pts of shapes.values()) pts.sort((a, b) => a[0] - b[0]);

const segs = []; for (const l of tram.trackLines) for (let i = 0; i < l.length - 1; i++) segs.push([l[i], l[i + 1]]);
const GRID = 20, grid = new Map();
segs.forEach((sg, i) => { const [a, b] = sg; for (let x = Math.floor(Math.min(a[0], b[0]) / GRID); x <= Math.floor(Math.max(a[0], b[0]) / GRID); x++) for (let y = Math.floor(Math.min(a[1], b[1]) / GRID); y <= Math.floor(Math.max(a[1], b[1]) / GRID); y++) { const k = x + ',' + y; if (!grid.has(k)) grid.set(k, []); grid.get(k).push(i); } });
function snap(p, dir) {   // nearest track point within 2.5 m on a track running the same way
  let best = null;
  const gx = Math.floor(p[0] / GRID), gy = Math.floor(p[1] / GRID);
  for (let x = gx - 1; x <= gx + 1; x++) for (let y = gy - 1; y <= gy + 1; y++) for (const i of grid.get(x + ',' + y) || []) {
    const [a, b] = segs[i], dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1;
    if (Math.abs((dx * dir[0] + dy * dir[1]) / L) < 0.9) continue;
    const u = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / (L * L))), q = [a[0] + u * dx, a[1] + u * dy], d = Math.hypot(p[0] - q[0], p[1] - q[1]);
    if (d < 2.5 && (!best || d < best.d)) best = { d, q };
  }
  return best ? best.q : null;
}
function resample(line, step) {
  const out = [line[0]];
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1], b = line[i], L = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(1, Math.ceil(L / step));
    for (let k = 1; k <= n; k++) out.push([a[0] + ((b[0] - a[0]) * k) / n, a[1] + ((b[1] - a[1]) * k) / n]);
  }
  return out;
}
function simplify(r, eps) {
  if (r.length < 3) return r;
  const a = r[0], b = r[r.length - 1], dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy);
  let mx = -1, ix = 0;
  for (let i = 1; i < r.length - 1; i++) { const d = L > 1e-9 ? Math.abs((r[i][0] - a[0]) * dy - (r[i][1] - a[1]) * dx) / L : Math.hypot(r[i][0] - a[0], r[i][1] - a[1]); if (d > mx) { mx = d; ix = i; } }
  return mx > eps ? [...simplify(r.slice(0, ix + 1), eps).slice(0, -1), ...simplify(r.slice(ix), eps)] : [a, b];
}
const cumul = (pts) => { const s = [0]; for (let i = 1; i < pts.length; i++) s.push(s[i - 1] + Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1])); return s; };
function project(pts, s, p) {   // distance along the path of the point nearest p, and how far off it is
  let best = { d: 1e9, s: 0 };
  for (let i = 0; i < pts.length - 1; i++) {
    const a = pts[i], b = pts[i + 1], dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy || 1, u = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2));
    const d = Math.hypot(p[0] - a[0] - u * dx, p[1] - a[1] - u * dy); if (d < best.d) best = { d, s: s[i] + u * Math.sqrt(L2) };
  }
  return best;
}

function pathOf(shape) {
  // the longest run of the shape inside the extent
  let run = [], bestRun = [];
  for (const [, lon, lat] of shape) { if (inBox(lon, lat)) run.push(P(lon, lat)); else { if (run.length > bestRun.length) bestRun = run; run = []; } }
  if (run.length > bestRun.length) bestRun = run;
  if (bestRun.length < 2) return null;
  const fine = resample(bestRun, 1);
  const laid = fine.map((p, i) => { const a = fine[Math.max(0, i - 3)], b = fine[Math.min(fine.length - 1, i + 3)], L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1; return snap(p, [(b[0] - a[0]) / L, (b[1] - a[1]) / L]) || p; });
  // smooth the joins between laid and kept stretches (a moving average over 5 m), then thin out
  const smooth = laid.map((p, i) => { let x = 0, y = 0, n = 0; for (let k = Math.max(0, i - 2); k <= Math.min(laid.length - 1, i + 2); k++) { x += laid[k][0]; y += laid[k][1]; n++; } return [x / n, y / n]; });
  return simplify(smooth, 0.03).map(([x, y]) => [r2(x), r2(y)]);
}

// ── per path: stops, signals, slow stretches ──────────────────────────────
const platforms = tram.platforms.map((pl) => ({ pl, ring: pl.ring }));
const hull = (pts) => {   // convex hull (monotone chain)
  const p = [...pts].sort((a, b) => a[0] - b[0] || a[1] - b[1]); if (p.length < 3) return p;
  const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = []; for (const q of p) { while (lo.length >= 2 && cr(lo[lo.length - 2], lo[lo.length - 1], q) <= 0) lo.pop(); lo.push(q); }
  const up = []; for (const q of [...p].reverse()) { while (up.length >= 2 && cr(up[up.length - 2], up[up.length - 1], q) <= 0) up.pop(); up.push(q); }
  return [...lo.slice(0, -1), ...up.slice(0, -1)];
};
const inside = (p, r) => { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [xi, yi] = r[i], [xj, yj] = r[j]; if ((yi > p[1]) !== (yj > p[1]) && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) c = !c; } return c; };
const grow = (r, d) => { const cx = r.reduce((a, p) => a + p[0], 0) / r.length, cy = r.reduce((a, p) => a + p[1], 0) / r.length; return r.map(([x, y]) => { const L = Math.hypot(x - cx, y - cy) || 1; return [x + ((x - cx) / L) * d, y + ((y - cy) / L) * d]; }); };
const boxes = signals.sites.map((site) => grow(hull(site.corners.map((c) => c.pt)), 1));
const mall = (() => {   // Bourke St between Swanston and Elizabeth: the two signal sites at its ends
  const end = (a, b) => signals.sites.find((s) => /BOURKE/i.test(s.name) && new RegExp(b, 'i').test(s.name))?.p;
  const a = end('BOURKE', 'SWANSTON'), b = end('BOURKE', 'ELIZABETH'); return a && b ? [a, b] : null;
})();

function annotate(pts) {
  const s = cumul(pts), len = s[s.length - 1];
  const at = (d) => { let i = 1; while (i < s.length - 1 && s[i] < d) i++; const u = (d - s[i - 1]) / ((s[i] - s[i - 1]) || 1); return [pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * u, pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * u]; };
  const tangent = (d) => { const a = at(Math.max(0, d - 2)), b = at(Math.min(len, d + 2)), L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1; return [(b[0] - a[0]) / L, (b[1] - a[1]) / L]; };
  // signals: where the path enters each intersection box
  const sig = [];
  boxes.forEach((bx, si) => {
    if (bx.length < 3) return;
    let was = inside(at(0), bx);
    for (let d = 1; d <= len; d += 1) {
      const now = inside(at(d), bx);
      if (now && !was && d > 3) {
        const t = tangent(d), road = signals.sites[si].type === 'POS' ? 'A' : Math.abs(t[0] * NS[0] + t[1] * NS[1]) >= Math.abs(t[0] * EW[0] + t[1] * EW[1]) ? 'A' : 'B';
        sig.push([r2(d - 2), si, road]);
      }
      was = now;
    }
  });
  sig.sort((a, b) => a[0] - b[0]);
  // slow stretches: curvature from points 6 m either side
  const slow = [];
  const limitFor = (R) => (R <= 50 ? 15 : R <= 100 ? 20 : R <= 240 ? 30 : 40);
  for (let d = 6; d < len - 6; d += 2) {
    const a = at(d - 6), b = at(d), c = at(d + 6);
    const ab = Math.hypot(b[0] - a[0], b[1] - a[1]), bc = Math.hypot(c[0] - b[0], c[1] - b[1]), ca = Math.hypot(a[0] - c[0], a[1] - c[1]);
    const area = Math.abs((b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0])) / 2;
    const R = area > 1e-6 ? (ab * bc * ca) / (4 * area) : 1e9, kmh = limitFor(R);
    if (kmh < 40) { const last = slow[slow.length - 1]; if (last && last[2] === kmh && d - 8 <= last[1]) last[1] = r2(d + 6); else slow.push([r2(d - 6), r2(d + 6), kmh]); }
  }
  if (mall) { const a = project(pts, s, mall[0]), b = project(pts, s, mall[1]); if (a.d < 15 && b.d < 15) slow.push([r2(Math.min(a.s, b.s)), r2(Math.max(a.s, b.s)), 10]); }
  return { s, len, sig, slow };
}

const pathIndex = new Map(), paths = [];
const shapePath = new Map();
for (const [id, shape] of shapes) {
  const pts = pathOf(shape); if (!pts) continue;
  const key = pts.filter((_, i) => i % 10 === 0).map(([x, y]) => `${Math.round(x)},${Math.round(y)}`).join(';');
  if (!pathIndex.has(key)) { const a = annotate(pts); pathIndex.set(key, paths.length); paths.push({ pts, ...a, stops: [], stopIndex: new Map() }); }
  shapePath.set(id, pathIndex.get(key));
}
console.log('shapes', shapes.size, '-> paths', paths.length);

// ── merges: where one path joins another's track ──────────────────────────
// A tram coming in from a side track and one already on the main track can reach the same rail at the same
// time; the simulation lets the one nearer the join go first. A join is where a path starts running on
// another path's track (within 0.6 m, the same way) and keeps to it for at least 15 m.
const MERGE_STEP = 2, mergeGrid = new Map();
paths.forEach((p, pi) => { for (let i = 0; i < p.pts.length - 1; i++) { const a = p.pts[i], b = p.pts[i + 1];
  for (let x = Math.floor(Math.min(a[0], b[0]) / 10); x <= Math.floor(Math.max(a[0], b[0]) / 10); x++) for (let y = Math.floor(Math.min(a[1], b[1]) / 10); y <= Math.floor(Math.max(a[1], b[1]) / 10); y++) { const k = x + ',' + y; if (!mergeGrid.has(k)) mergeGrid.set(k, []); mergeGrid.get(k).push([pi, i]); } } });
function sharedWith(pi, pt, dir) {   // the other paths whose track this point is on, running the same way, with the distance along them
  const out = new Map();
  for (const [pj, i] of mergeGrid.get(Math.floor(pt[0] / 10) + ',' + Math.floor(pt[1] / 10)) || []) {
    if (pj === pi) continue;
    const q = paths[pj], a = q.pts[i], b = q.pts[i + 1], dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy) || 1;
    if ((dx * dir[0] + dy * dir[1]) / L < 0.9) continue;
    const u = Math.max(0, Math.min(1, ((pt[0] - a[0]) * dx + (pt[1] - a[1]) * dy) / (L * L))), d = Math.hypot(pt[0] - a[0] - u * dx, pt[1] - a[1] - u * dy);
    if (d < 0.6) out.set(pj, q.s[i] + u * L);
  }
  return out;
}
for (const [pi, p] of paths.entries()) {
  const at = (d) => { let i = 1; while (i < p.s.length - 1 && p.s[i] < d) i++; const u = (d - p.s[i - 1]) / ((p.s[i] - p.s[i - 1]) || 1); return [p.pts[i - 1][0] + (p.pts[i][0] - p.pts[i - 1][0]) * u, p.pts[i - 1][1] + (p.pts[i][1] - p.pts[i - 1][1]) * u]; };
  const samples = [];
  for (let d = 0; d <= p.len; d += MERGE_STEP) { const a = at(Math.max(0, d - 1)), b = at(Math.min(p.len, d + 1)), L = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1; samples.push(sharedWith(pi, at(d), [(b[0] - a[0]) / L, (b[1] - a[1]) / L])); }
  p.merges = [];
  for (let k = 1; k < samples.length; k++) for (const [pj, sj] of samples[k]) {
    if (samples[k - 1].has(pj) || k * MERGE_STEP < 5) continue;
    let run = 0; for (let m = k; m < samples.length && samples[m].has(pj); m++) run += MERGE_STEP;
    // a real join: before it the other track is not just alongside (it comes in from somewhere else)
    if (run >= 15 && sj > 5) p.merges.push([r2(k * MERGE_STEP), pj, r2(sj)]);
  }
}
console.log('merges', paths.reduce((a, p) => a + p.merges.length, 0));

function stopOn(pi, stopId) {
  const p = paths[pi]; if (p.stopIndex.has(stopId)) return p.stopIndex.get(stopId);
  const st = stops.get(stopId), at = project(p.pts, p.s, P(st.lon, st.lat));
  let berth = null;
  if (at.d < 25) {
    // the platform beside the track here: its extent along the path; the front stops at its far end
    for (const { pl, ring } of platforms) {
      if (Math.hypot(pl.c[0] - P(st.lon, st.lat)[0], pl.c[1] - P(st.lon, st.lat)[1]) > 40) continue;
      const ext = ring.map((q) => project(p.pts, p.s, q)); if (Math.min(...ext.map((e) => e.d)) > 6) continue;
      const lo = Math.min(...ext.map((e) => e.s)), hi = Math.max(...ext.map((e) => e.s));
      if (at.s < lo - 15 || at.s > hi + 15) continue;
      berth = { front: r2(hi - 1), length: r2(hi - lo) }; break;
    }
  }
  const front = berth ? berth.front : at.d < 25 ? r2(Math.min(p.len, at.s + 5)) : null;
  const idx = front === null ? -1 : p.stops.push([stopId, st.name.replace(/\s*#\d+$/, ''), +(st.name.match(/#(\w+)$/)?.[1] ?? 0) || st.name.match(/#(\w+)$/)?.[1] || '', front, berth ? berth.length : 0]) - 1;
  p.stopIndex.set(stopId, idx); return idx;
}

// ── trips per day type ────────────────────────────────────────────────────
// EST: which classes run which routes (Wikipedia route lists, 2026; allocations change). A trip takes one of
// its route's classes by a hash of its id, so the mix is stable from run to run.
const CLASS_BY_ROUTE = {
  1: ['Z3', 'B2'], 3: ['Z3', 'B2'], 5: ['Z3', 'D1'], 6: ['Z3', 'D2'], 11: ['E'], 12: ['A'], 16: ['Z3', 'D1'], 19: ['E', 'B2'], 30: ['A', 'E'],
  35: ['W8'], 48: ['C1', 'A'], 57: ['Z3', 'G'], 58: ['E', 'B2'], 59: ['B2', 'G'], 64: ['B2', 'Z3'], 67: ['Z3', 'B2'], 70: ['A', 'B2'],
  72: ['Z3', 'D1'], 75: ['A', 'B2'], 78: ['A'], 82: ['Z3', 'G'], 86: ['E'], 96: ['E', 'C2'], 109: ['C1', 'A'],
};
const hash = (s) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
const out = {};
for (const [key, day] of Object.entries(days)) {
  const list = [];
  for (const [id, t] of trips) {
    if (!day.services.has(t.service)) continue;
    const pi = shapePath.get(t.shape); if (pi === undefined) continue;
    const seq = t.stops.map(([sid, time]) => [stopOn(pi, sid), time]).filter(([i]) => i >= 0);
    if (seq.length < 2) continue;
    const cls = (CLASS_BY_ROUTE[t.route] || ['E'])[hash(id) % (CLASS_BY_ROUTE[t.route] || ['E']).length];
    list.push([pi, t.route, cls, seq.flat()]);
  }
  list.sort((a, b) => a[3][1] - b[3][1]);
  out[key] = list;
  console.log(key, 'trips', list.length);
}

// One file per day type: the app reads only the day it shows (a quarter of the trips, ~0.5 MB), and lets it go
// when the walker leaves the street.
const common = {
  built: new Date().toISOString().slice(0, 10),
  source: 'Transport Victoria GTFS Schedule (CC BY 4.0), tram feed; Yarra Trams Infrastructure - Tram Track Design (2019) for curve speeds',
  days: Object.fromEntries(Object.entries(days).map(([k, v]) => [k, v.date])),
  paths: paths.map((p) => ({ pts: p.pts, stops: p.stops, signals: p.sig, slow: p.slow, merges: p.merges })),
};
for (const key of Object.keys(out)) {
  const txt = JSON.stringify({ ...common, trips: { [key]: out[key] } });
  fs.writeFileSync(path.join(OUT, `trams-${key}.json`), txt);
  console.log(`wrote trams-${key}.json`, (txt.length / 1024).toFixed(0), 'KB');
}
fs.rmSync(path.join(OUT, 'trams.json'), { force: true });   // the single file of before
console.log('paths', paths.length, 'stops on paths', paths.reduce((a, p) => a + p.stops.length, 0),
  'signals', paths.reduce((a, p) => a + p.sig.length, 0), 'platform-matched', paths.reduce((a, p) => a + p.stops.filter((q) => q[4] > 0).length, 0));

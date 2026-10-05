/*
 * ─────────────────────────────────────────────────────────────────────────
 * STREETSCAPE DATA — from open data to ready-to-place JSON
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Usage:
 *   node scripts/build-streetscape.mjs --cache <dir> --trees <cbd_trees_postgis_ready.geojson>
 *        [--ptlines <public_transport_lines.geojson>]
 *
 * Writes public/data/streetscape/{surfaces,trees,street,signals,tram,manifest}.json, in metres east/north of
 * the scene origin (EPSG:7855, the same projection and origin as the buildings), for the extent of the
 * building data plus a margin. Downloads are cached in --cache (outside the repo; some inputs are large).
 *
 * Everything that needs a decision is decided HERE, once, so the browser only places pieces:
 *   lamp positions from lux peaks, tree pits and planters, which way each seat faces, signal corners and
 *   lantern roles, crossing lines, stop parts (fence runs, ramps, shelter type and position), overhead spans.
 * The rules, the sources and what is estimated are written up in
 * ProjectDoc/streetscape/PLAN.md (outside the repo) and summarised in manifest.json.
 *
 * Sources (all open):
 *   City of Melbourne Open Data (CC BY): road segments with surface type, street lights with emitted lux
 *     level, street furniture (seats), stormwater pits, tactile ground surface indicators, on-street parking
 *     bays, drinking fountains, public toilets.
 *   Transport Victoria (CC BY 4.0): public transport lines (GTFS shapes); Victorian traffic signals (DTP).
 *   OpenStreetMap contributors (ODbL): tram platform outlines.
 *   Australian Government (CC BY 3.0 AU): National Public Toilet Map (toilet type notes).
 *   Team tree handoff (2026-10-03): tree points, heights.
 */
import fs from 'node:fs';
import path from 'node:path';
import proj4 from 'proj4';

const args = Object.fromEntries(process.argv.slice(2).reduce((a, v, i, all) => (v.startsWith('--') ? [...a, [v.slice(2), all[i + 1]]] : a), []));
const CACHE = args.cache; if (!CACHE) throw new Error('--cache <dir> is required');
fs.mkdirSync(CACHE, { recursive: true });
const OUT = path.resolve('public/data/streetscape'); fs.mkdirSync(OUT, { recursive: true });

// same projection and origin as src/scene/frame.ts
proj4.defs('EPSG:7855', '+proj=utm +zone=55 +south +ellps=GRS80 +towgs84=0,0,0,0,0,0,0 +units=m +no_defs');
const toM = proj4('EPSG:4326', 'EPSG:7855');
const ORIGIN = toM.forward([144.9605, -37.8145]);
const r1 = (v) => Math.round(v * 10) / 10, r2 = (v) => Math.round(v * 100) / 100;
const P = ([lon, lat]) => { const [x, y] = toM.forward([lon, lat]); return [r2(x - ORIGIN[0]), r2(y - ORIGIN[1])]; };

// ── extent: the building data plus 40 m ───────────────────────────────────
const bld = JSON.parse(fs.readFileSync('public/data/building-footprints.json', 'utf8'));
let [w, s, e, n] = [180, 90, -180, -90];
const walk = (c) => { if (typeof c[0] === 'number') { w = Math.min(w, c[0]); e = Math.max(e, c[0]); s = Math.min(s, c[1]); n = Math.max(n, c[1]); } else c.forEach(walk); };
for (const f of bld.features) walk(f.geometry.coordinates);
const M = 0.00045; [w, s, e, n] = [w - M, s - M, e + M, n + M];
const BBOX_WKT = `POLYGON((${w} ${s}, ${e} ${s}, ${e} ${n}, ${w} ${n}, ${w} ${s}))`;
const inBox = ([lon, lat]) => lon >= w && lon <= e && lat >= s && lat <= n;
console.log('extent', [w, s, e, n].map((v) => v.toFixed(5)).join(', '));

async function cached(name, url, opts) {
  const f = path.join(CACHE, name);
  if (!fs.existsSync(f)) {
    process.stdout.write(`download ${name} ... `);
    const res = await fetch(url, opts); if (!res.ok) throw new Error(`${url} -> ${res.status}`);
    fs.writeFileSync(f, Buffer.from(await res.arrayBuffer())); console.log('ok');
  }
  return fs.readFileSync(f, 'utf8');
}
const com = async (ds, field) => JSON.parse(await cached(`com-${ds}.geojson`,
  `https://data.melbourne.vic.gov.au/api/explore/v2.1/catalog/datasets/${ds}/exports/geojson?where=${encodeURIComponent(`within(${field}, geom'${BBOX_WKT}')`)}`)).features;

// ── geometry helpers ──────────────────────────────────────────────────────
const inRing = (p, r) => { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [xi, yi] = r[i], [xj, yj] = r[j]; if ((yi > p[1]) !== (yj > p[1]) && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) c = !c; } return c; };
const inPoly = (p, poly) => inRing(p, poly[0]) && !poly.slice(1).some((h) => inRing(p, h));
const segDist = (p, a, b) => { const dx = b[0] - a[0], dy = b[1] - a[1], L = dx * dx + dy * dy || 1, u = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L)); const q = [a[0] + u * dx, a[1] + u * dy]; return { d: Math.hypot(p[0] - q[0], p[1] - q[1]), q, u }; };
const unit = (v) => { const l = Math.hypot(v[0], v[1]) || 1; return [v[0] / l, v[1] / l]; };
const dot = (a, b) => a[0] * b[0] + a[1] * b[1];
const yawOf = (v) => r2(Math.atan2(v[1], v[0]));   // angle of a direction from +x (east), counter-clockwise
class Grid { // bucket items by the cells their bounding box covers
  constructor(cell) { this.cell = cell; this.m = new Map(); }
  add(item, x0, y0, x1, y1) { const c = this.cell; for (let i = Math.floor(x0 / c); i <= Math.floor(x1 / c); i++) for (let j = Math.floor(y0 / c); j <= Math.floor(y1 / c); j++) { const k = i + ',' + j; if (!this.m.has(k)) this.m.set(k, []); this.m.get(k).push(item); } }
  near(x, y, r = 0) { const c = this.cell, out = new Set(); for (let i = Math.floor((x - r) / c); i <= Math.floor((x + r) / c); i++) for (let j = Math.floor((y - r) / c); j <= Math.floor((y + r) / c); j++) for (const it of this.m.get(i + ',' + j) || []) out.add(it); return out; }
}
const bboxOf = (ring) => { let x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9; for (const [x, y] of ring) { x0 = Math.min(x0, x); y0 = Math.min(y0, y); x1 = Math.max(x1, x); y1 = Math.max(y1, y); } return [x0, y0, x1, y1]; };
const ringArea = (r) => { let A = 0; for (let i = 0; i < r.length - 1; i++) A += r[i][0] * r[i + 1][1] - r[i + 1][0] * r[i][1]; return A / 2; };
function clean(ring) { const out = []; for (const p of ring) { const q = [r2(p[0]), r2(p[1])]; const l = out[out.length - 1]; if (!l || Math.hypot(l[0] - q[0], l[1] - q[1]) > 0.04) out.push(q); } if (out.length > 2) { const a = out[0], b = out[out.length - 1]; if (a[0] !== b[0] || a[1] !== b[1]) out.push([a[0], a[1]]); } return out; }

// ── 1. road surfaces ──────────────────────────────────────────────────────
const SURF_TYPES = ['Road Carriageway', 'Road Arterial', 'Road Channel', 'Road Kerb', 'Road Kerb & Or Channel', 'Road Footway', 'Road Median', 'Road Nature Strip', 'Road Tram Formation'];
const surfFeat = await com('road-segments-with-surface-type', 'geo_point_2d');
const surfaces = []; // { type, polys: [[outer, ...holes]] }
for (const f of surfFeat) {
  const t = f.properties.type; if (!SURF_TYPES.includes(t) || !f.geometry) continue;
  const polys = (f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.type === 'MultiPolygon' ? f.geometry.coordinates : [])
    .map((pp) => pp.map((r) => clean(r.map(P))).filter((r) => r.length > 3)).filter((pp) => pp.length);
  if (polys.length) surfaces.push({ type: t === 'Road Kerb & Or Channel' ? 'Road Kerb' : t, polys });
}
const surfGrid = new Grid(25);
surfaces.forEach((sf) => sf.polys.forEach((pp) => { const [x0, y0, x1, y1] = bboxOf(pp[0]); surfGrid.add({ type: sf.type, poly: pp }, x0, y0, x1, y1); }));
const surfAt = (p) => { for (const it of surfGrid.near(p[0], p[1])) if (inPoly(p, it.poly)) return it.type; return null; };
const ROADISH = /Carriageway|Arterial|Channel|Tram Formation/;
const kerbEdges = new Grid(10);
for (const sf of surfaces) if (sf.type === 'Road Kerb') for (const pp of sf.polys) for (const r of pp) for (let i = 0; i < r.length - 1; i++) { const a = r[i], b = r[i + 1]; if (Math.hypot(b[0] - a[0], b[1] - a[1]) < 0.5) continue; kerbEdges.add([a, b], Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[0], b[0]), Math.max(a[1], b[1])); }
function nearestKerb(p, maxD = 12) {
  let best = null; for (const [a, b] of kerbEdges.near(p[0], p[1], maxD)) { const r = segDist(p, a, b); if (r.d < maxD && (!best || r.d < best.d)) best = { ...r, t: unit([b[0] - a[0], b[1] - a[1]]) }; } return best;
}
// street grid axes: the dominant kerb direction (mod 90 deg), length-weighted
const hist = new Array(90).fill(0);
for (const sf of surfaces) if (sf.type === 'Road Kerb') for (const pp of sf.polys) for (let i = 0; i < pp[0].length - 1; i++) { const a = pp[0][i], b = pp[0][i + 1], L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L < 2) continue; let d = (Math.atan2(b[1] - a[1], b[0] - a[0]) * 180 / Math.PI) % 90; if (d < 0) d += 90; hist[Math.floor(d)] += L; }
const domDeg = hist.indexOf(Math.max(...hist)) + 0.5;
const AX_A = [Math.cos(domDeg * Math.PI / 180), Math.sin(domDeg * Math.PI / 180)], AX_B = [-AX_A[1], AX_A[0]];
const NS = Math.abs(AX_A[1]) > Math.abs(AX_B[1]) ? AX_A : AX_B, EW = NS === AX_A ? AX_B : AX_A;  // "north-south" streets and "east-west" streets
const gridAxis = (v) => (Math.abs(dot(v, NS)) > Math.abs(dot(v, EW)) ? NS : EW);
console.log('surfaces', surfaces.length, '| grid axis', domDeg, 'deg');

// DTP signal sites (needed by the stops and the overhead too)
const SITES = (await cached('dtp-victorian-traffic-signals.csv', 'https://opendata.transport.vic.gov.au/dataset/923af458-363d-469f-bc5e-84746a80b9a2/resource/1036a318-8867-4dc6-bd84-fc3bcd6cbdb9/download/victorian_traffic_signals.csv'))
  .split(/\r?\n/).slice(1).map((l) => l.split(',')).filter((c) => c[4] && inBox([+c[5], +c[4]])).map((c) => ({ id: c[0], name: c[1], type: c[2], p: P([+c[5], +c[4]]) }));

// tram lines near a point, before the tram section runs (only used to tell St Kilda Road poles apart)
const trackDistEarly = (() => { if (!args.ptlines) return () => 1e9; const pts = [];
  for (const f of JSON.parse(fs.readFileSync(args.ptlines, 'utf8')).features) { if (f.properties.MODE !== 'METRO TRAM') continue; const ls = f.geometry.type === 'LineString' ? [f.geometry.coordinates] : f.geometry.coordinates; for (const l of ls) for (const c of l) if (inBox(c)) pts.push(P(c)); }
  const g = new Grid(20); pts.forEach((q) => g.add(q, q[0], q[1], q[0], q[1]));
  return (p) => { let m = 1e9; for (const q of g.near(p[0], p[1], 30)) m = Math.min(m, Math.hypot(q[0] - p[0], q[1] - p[1])); return m; }; })();
var TOP = { 'Road Footway': 0.14, 'Road Kerb': 0.15, 'Road Channel': 0.03, 'Road Carriageway': 0.02, 'Road Arterial': 0.02, 'Road Tram Formation': 0.035, 'Road Median': 0.15, 'Road Nature Strip': 0.15 };
// ── 2. street lights (inferred from lux peaks) ────────────────────────────
const luxF = await com('street-lights-with-emitted-lux-level-council-owned-lights-only', 'geo_point_2d');
// The data is modelled illuminance sampled every ~0.25 m along the streets, not the poles themselves. A pole
// stands under each local brightest point: brighter than everything within 10 m, and at least 5 lux (a
// fixed 20 lux floor kept only the brightest quarter of the lamps). Ties on a plateau are thinned below.
const luxPts = luxF.map((f) => ({ p: P(f.geometry.coordinates), l: +f.properties.label })).filter((q) => Number.isFinite(q.l));
const luxGrid = new Grid(10); for (const q of luxPts) luxGrid.add(q, q.p[0], q.p[1], q.p[0], q.p[1]);
const peakGrid = new Grid(15), peaks = [];
for (const q of luxPts.filter((o) => o.l >= 5).sort((a, b) => b.l - a.l)) {
  if ([...luxGrid.near(q.p[0], q.p[1], 10)].some((o) => o.l > q.l && Math.hypot(o.p[0] - q.p[0], o.p[1] - q.p[1]) < 10)) continue;
  if ([...peakGrid.near(q.p[0], q.p[1], 10)].some((o) => Math.hypot(o[0] - q.p[0], o[1] - q.p[1]) < 10)) continue;
  peaks.push(q.p); peakGrid.add(q.p, q.p[0], q.p[1], q.p[0], q.p[1]);
}
// The lux data has no pole type. The type follows the City of Melbourne Design Standards' own rules of use:
//   601.01 Kings Street tall (10 m)   major streets            601.02 Kings Street short (5.5 m)   small streets
//   601.05 laneway wall-mounted       laneways, on a wall      601.07 St Kilda Road (combined tram pole)
//   601.09 park light (6.2 m)         parks and gardens (Birrarung Marr in charcoal)
// Decided here from where the peak lies: on or beside a road -> by carriageway width; away from any kerb
// but within 6 m of a building wall -> wall-mounted; other paving -> short pole; open ground -> park light.
// All types are EST.
const bEdges = new Grid(10);
for (const f of bld.features) {
  const polys = f.geometry.type === 'Polygon' ? [f.geometry.coordinates] : f.geometry.coordinates;
  for (const pp of polys) { const r = pp[0].map(P); for (let q = 0; q < r.length - 1; q++) { const a = r[q], b = r[q + 1]; bEdges.add([a, b], Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[0], b[0]), Math.max(a[1], b[1])); } }
}
function nearestWall(p, maxD) { let best = null; for (const [a, b] of bEdges.near(p[0], p[1], maxD)) { const r = segDist(p, a, b); if (r.d < maxD && (!best || r.d < best.d)) best = { ...r }; } return best; }
function roadWidth(q, nrm) {   // carriageway width across the road from a kerb point, along its normal
  const isRoad = (pt) => /Carriageway|Arterial|Tram Formation|Channel/.test(surfAt(pt) || '');
  for (const sg of [1, -1]) { let w = 0, inside = false; for (let d = 0.3; d < 40; d += 0.5) { const on = isRoad([q[0] + nrm[0] * sg * d, q[1] + nrm[1] * sg * d]); if (on) { inside = true; w = d; } else if (inside && d - w > 1.5) break; } if (inside) return w; }
  return 0;
}
const lights = [], lightGrid = new Grid(20), LIGHT_TYPES = {}, DROP = { nowhere: 0, merged: 0 };
for (const pk of peaks) {
  const k = nearestKerb(pk, 15), at = surfAt(pk), inRoad = ROADISH.test(at || '');
  let pt, toRoad, type, merge = 14;
  if (k && (inRoad || k.d < 4)) {
    const out = unit([k.q[0] - pk[0], k.q[1] - pk[1]]);
    if (inRoad) { pt = [k.q[0] + out[0] * 0.8, k.q[1] + out[1] * 0.8]; toRoad = [-out[0], -out[1]]; }
    else { toRoad = out; pt = [k.q[0] - out[0] * 0.8, k.q[1] - out[1] * 0.8]; }
    const w = roadWidth(k.q, toRoad);
    type = pt[1] < -600 && trackDistEarly(pt) < 20 ? 'stkilda' : w >= 11 ? 'tall' : 'short';
  } else {
    const wall = nearestWall(pk, 6);
    if (wall) {   // laneway: on the nearest wall, arm out towards the peak (long bracket 1.74 m)
      const out = unit([pk[0] - wall.q[0], pk[1] - wall.q[1]]); pt = wall.q; toRoad = out; type = 'wall'; merge = 8;
    } else if (!at) { pt = pk; toRoad = EW; type = pk[0] > 950 && pk[1] < -300 ? 'parkCharcoal' : 'park'; merge = 12; }
    // paved but far from a kerb and a wall (plazas, wide footpaths, malls): a short Kings Street pole where it shines
    else if (at && !inRoad) { pt = pk; toRoad = k ? unit([k.q[0] - pk[0], k.q[1] - pk[1]]) : EW; type = 'short'; merge = 10; }
    else { DROP.nowhere++; continue; }
  }
  if ([...lightGrid.near(pt[0], pt[1], merge)].some((o) => Math.hypot(o[0] - pt[0], o[1] - pt[1]) < merge)) { DROP.merged++; continue; }
  lightGrid.add(pt, pt[0], pt[1], pt[0], pt[1]); lights.push([r1(pt[0]), r1(pt[1]), yawOf(toRoad), type]); LIGHT_TYPES[type] = (LIGHT_TYPES[type] || 0) + 1;
}
console.log('light types', JSON.stringify(LIGHT_TYPES), '| dropped', JSON.stringify(DROP), '| lux in extent', luxF.length, '| peaks', peaks.length);

// Feature lighting (City of Melbourne "Feature lighting including light type, wattage and location", CC BY):
// real positions and types; no design standard exists for these bespoke fittings, so their shapes are EST.
// Points within 2.5 m of each other with the same type are one fitting (the data lists each lamp).
const featF = await com('feature-lighting-including-light-type-wattage-and-location', 'geo_point_2d');
const featKind = (pr) => { const d = (pr.featuredescription || '').toLowerCase(), m = (pr.lightmounting || '').toLowerCase();
  if (m.includes('catenary') || d.includes('catenary')) return 'catenary'; if (m.includes('seat')) return 'seat'; if (m.includes('stairs')) return 'stairs'; if (m.includes('bridge')) return 'bridge';
  if (m.includes('inground') || d.startsWith('up light') || d.includes('upward')) return 'up'; if (d.startsWith('flood')) return 'flood'; if (d.startsWith('down')) return 'down'; if (d.startsWith('wall') || m === 'wall') return 'wall'; return 'feature'; };
const featPts = featF.filter((f) => f.geometry).map((f) => ({ p: P(f.geometry.coordinates), k: featKind(f.properties) }));
const featGrid = new Grid(5), features = [];
for (const q of featPts) {
  const hit = [...featGrid.near(q.p[0], q.p[1], 2.5)].find((o) => o.k === q.k && Math.hypot(o.p[0] - q.p[0], o.p[1] - q.p[1]) < 2.5);
  if (hit) { hit.n++; continue; }
  const o = { p: q.p, k: q.k, n: 1 }; features.push(o); featGrid.add(o, q.p[0], q.p[1], q.p[0], q.p[1]);
}
const featureLights = features.map((o) => { const kb = nearestKerb(o.p, 10); return [o.p[0], o.p[1], o.k, o.n, yawOf(kb ? unit([kb.q[0] - o.p[0], kb.q[1] - o.p[1]]) : EW), TOP[surfAt(o.p)] ?? 0.14]; });
console.log('feature lighting points', featPts.length, '| fittings', features.length, JSON.stringify(features.reduce((a, o) => ((a[o.k] = (a[o.k] || 0) + 1), a), {})));
console.log('lux points', luxPts.length, '| peaks', peaks.length, '| lights', lights.length);

// ── 3. trees, pits and planters ───────────────────────────────────────────
const treeF = JSON.parse(fs.readFileSync(args.trees, 'utf8')).features.filter((f) => f.geometry && inBox(f.geometry.coordinates));
const trees = treeF.map((f) => ({ p: P(f.geometry.coordinates), h: f.properties.height_m, dbh: f.properties.dbh_cm, genus: f.properties.genus || '', kind: f.properties.height_data_type }));
function holeShape(h) {
  const A = Math.abs(ringArea(h)); let best = 0, ax = [1, 0]; for (let i = 0; i < h.length - 1; i++) { const dx = h[i + 1][0] - h[i][0], dy = h[i + 1][1] - h[i][1], L = Math.hypot(dx, dy); if (L > best) { best = L; ax = [dx / L, dy / L]; } }
  const c = [0, 1].map((k) => h.slice(0, -1).reduce((a, q) => a + q[k], 0) / (h.length - 1));
  const U = h.map((q) => (q[0] - c[0]) * ax[0] + (q[1] - c[1]) * ax[1]), W = h.map((q) => -(q[0] - c[0]) * ax[1] + (q[1] - c[1]) * ax[0]);
  const len = Math.max(...U) - Math.min(...U), wid = Math.max(...W) - Math.min(...W);
  return { A, c, ax, hl: len / 2, hw: wid / 2, ok: A >= 0.8 && A <= 9 && Math.max(len, wid) <= 4 && Math.max(len, wid) / Math.max(0.1, Math.min(len, wid)) <= 3 };
}
const holes = surfaces.filter((sf) => sf.type === 'Road Footway').flatMap((sf) => sf.polys.flatMap((pp) => pp.slice(1))).map((ring) => ({ ring, ...holeShape(ring) }));
const holeGrid = new Grid(10); holes.forEach((h, i) => { if (h.ok) holeGrid.add(i, h.c[0], h.c[1], h.c[0], h.c[1]); });
const used = new Map(); // hole index -> tree index
trees.forEach((t, ti) => { let bi = -1, bd = 2.5; for (const i of holeGrid.near(t.p[0], t.p[1], 2.5)) { if (used.has(i)) continue; const d = Math.hypot(holes[i].c[0] - t.p[0], holes[i].c[1] - t.p[1]); if (d < bd) { bd = d; bi = i; } } if (bi >= 0) { used.set(bi, ti); t.p0 = t.p; t.p = [r2(holes[bi].c[0]), r2(holes[bi].c[1])]; t.pit = bi; } });
const planters = [];
holes.forEach((h, i) => { if (used.has(i)) planters.push({ ring: h.ring, c: h.c, ax: h.ax, hl: h.hl, hw: h.hw, surveyed: true }); });
for (const t of trees) if (t.pit === undefined && surfAt(t.p) === 'Road Footway') {
  const k = nearestKerb(t.p); const ax = k ? gridAxis(k.t) : NS, bx = [-ax[1], ax[0]], h = 0.85;
  planters.push({ ring: [[1, 1], [-1, 1], [-1, -1], [1, -1], [1, 1]].map(([a, b]) => [r2(t.p[0] + ax[0] * a * h + bx[0] * b * h), r2(t.p[1] + ax[1] * a * h + bx[1] * b * h)]), c: t.p, ax, hl: h, hw: h, surveyed: false });
}
const otherHoles = holes.filter((_, i) => !used.has(i)).map((h) => h.ring);
console.log('trees', trees.length, '| footway holes', holes.length, '| tree pits', used.size, '| planters', planters.length);

// ── 4. tram tracks and platforms ──────────────────────────────────────────
let trackLines = [];
if (args.ptlines) {
  const shapes = JSON.parse(fs.readFileSync(args.ptlines, 'utf8')).features.filter((f) => f.properties.MODE === 'METRO TRAM');
  const runs = [];
  for (const f of shapes) { const lines = f.geometry.type === 'LineString' ? [f.geometry.coordinates] : f.geometry.coordinates; for (const ln of lines) { let cur = []; for (const c of ln) { if (inBox(c)) cur.push(P(c)); else if (cur.length) { if (cur.length > 1) runs.push(cur); cur = []; } } if (cur.length > 1) runs.push(cur); } }
  runs.sort((a, b) => b.length - a.length);
  const kept = [], keptGrid = new Grid(20);
  const covered = (p) => { for (const [a, b] of keptGrid.near(p[0], p[1], 0.5)) if (segDist(p, a, b).d < 0.5) return true; return false; };
  for (const r of runs) {
    const cov = r.map(covered);
    for (let i = 0; i < r.length; i++) { if (cov[i]) continue; let j = i; while (j + 1 < r.length && !cov[j + 1]) j++; const piece = r.slice(Math.max(0, i - 1), Math.min(r.length, j + 2)); if (piece.length > 1) { kept.push(piece); for (let q = 0; q < piece.length - 1; q++) { const a = piece[q], b = piece[q + 1]; keptGrid.add([a, b], Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[0], b[0]), Math.max(a[1], b[1])); } } i = j; }
  }
  // fit to the CoM tram formation (the PTV/OSM lines sit 0.7-2.3 m off its middle); fade back where there is none
  const isF = (p) => surfAt(p) === 'Road Tram Formation';
  const resample = (l, st) => { const out = [l[0]]; for (let i = 0; i < l.length - 1; i++) { const [a, b] = [l[i], l[i + 1]], L = Math.hypot(b[0] - a[0], b[1] - a[1]); for (let d = st; d < L; d += st) out.push([a[0] + (b[0] - a[0]) * d / L, a[1] + (b[1] - a[1]) * d / L]); out.push(b); } return out; };
  const fitted = kept.map((l) => resample(l, 2)), fGrid = new Grid(20);
  fitted.forEach((l, li) => { for (let q = 0; q < l.length - 1; q++) { const a = l[q], b = l[q + 1]; fGrid.add([li, a, b], Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[0], b[0]), Math.max(a[1], b[1])); } });
  const shifts = fitted.map((l, li) => l.map((p, i) => {
    const a = l[Math.max(0, i - 1)], b = l[Math.min(l.length - 1, i + 1)], t = unit([b[0] - a[0], b[1] - a[1]]), nn = [-t[1], t[0]];
    let partner = null;
    for (const [mj, a2, b2] of fGrid.near(p[0], p[1], 4.5)) { if (mj === li) continue; const r = segDist(p, a2, b2); const mt = unit([b2[0] - a2[0], b2[1] - a2[1]]); if (r.d < 2.5 || r.d > 4.5 || Math.abs(dot(mt, t)) < 0.97) continue; const side = dot([r.q[0] - p[0], r.q[1] - p[1]], nn); if (partner === null || Math.abs(side) < Math.abs(partner)) partner = side; }
    if (partner === null) return null;
    const pc = partner / 2; let lo = null, hi = null;
    for (let ww = pc; ww > pc - 6; ww -= 0.1) if (!isF([p[0] + nn[0] * ww, p[1] + nn[1] * ww])) { lo = ww; break; }
    for (let ww = pc; ww < pc + 6; ww += 0.1) if (!isF([p[0] + nn[0] * ww, p[1] + nn[1] * ww])) { hi = ww; break; }
    if (lo === null || hi === null || hi - lo < 4.5 || hi - lo > 8.5) return null;
    const sh = (lo + hi) / 2 - pc; return Math.abs(sh) < 3 ? sh : null;
  }));
  trackLines = fitted.map((l, li) => {
    const sh = shifts[li], known = sh.map((v, i) => (v === null ? -1 : i)).filter((i) => i >= 0);
    const full = sh.map((v, i) => { if (!known.length) return 0; if (v !== null) return v; const p0 = known.filter((k) => k < i).pop(), q0 = known.find((k) => k > i); if (p0 === undefined) return sh[q0] * Math.max(0, 1 - (q0 - i) / 10); if (q0 === undefined) return sh[p0] * Math.max(0, 1 - (i - p0) / 10); return sh[p0] + (sh[q0] - sh[p0]) * (i - p0) / (q0 - p0); });
    const sm = full.map((_, i) => { const win = full.slice(Math.max(0, i - 5), i + 6); return win.reduce((a, b) => a + b, 0) / win.length; });
    return l.map((p, i) => { const a = l[Math.max(0, i - 1)], b = l[Math.min(l.length - 1, i + 1)], t = unit([b[0] - a[0], b[1] - a[1]]); return [r2(p[0] - t[1] * sm[i]), r2(p[1] + t[0] * sm[i])]; });
  });
}
const trackGrid = new Grid(20);
trackLines.forEach((l) => { for (let q = 0; q < l.length - 1; q++) { const a = l[q], b = l[q + 1]; trackGrid.add([a, b], Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[0], b[0]), Math.max(a[1], b[1])); } });
const trackDist = (p) => { let m = 1e9; for (const [a, b] of trackGrid.near(p[0], p[1], 10)) m = Math.min(m, segDist(p, a, b).d); return m; };
console.log('track lines', trackLines.length, 'vertices', trackLines.reduce((a, l) => a + l.length, 0));

const ovq = `[out:json][timeout:90];way["railway"="platform"]["tram"="yes"](${s},${w},${n},${e});out geom tags;`;
let osm = [];
for (const host of ['https://overpass-api.de/api/interpreter', 'https://overpass.kumi.systems/api/interpreter', 'https://maps.mail.ru/osm/tools/overpass/api/interpreter']) {
  try { osm = JSON.parse(await cached('osm-tram-platforms.json', host, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': 'my-city-twin-streetscape/1.0' }, body: 'data=' + encodeURIComponent(ovq) })).elements; break; }
  catch (err) { console.log('overpass failed at', host, String(err).slice(0, 80)); try { fs.unlinkSync(path.join(CACHE, 'osm-tram-platforms.json')); } catch { /* none */ } }
}
const seatF = (await com('street-furniture-including-bollards-bicycle-rails-bins-drinking-fountains-horse-', 'geo_point_2d')).filter((f) => f.properties.type === 'Seat');
const seatPts = seatF.map((f) => ({ p: P(f.geometry.coordinates), model: f.properties.modeldescription || '' }));
const platforms = [];
for (const el of osm) {
  if (el.type !== 'way' || !el.geometry || el.tags.location) continue;
  const ring = clean(el.geometry.map((g) => P([g.lon, g.lat]))); if (ring.length < 4) continue;
  let best = 0, t = [1, 0]; for (let i = 0; i < ring.length - 1; i++) { const dx = ring[i + 1][0] - ring[i][0], dy = ring[i + 1][1] - ring[i][1], L = Math.hypot(dx, dy); if (L > best) { best = L; t = [dx / L, dy / L]; } }
  const nn = [-t[1], t[0]], c = [0, 1].map((k) => ring.slice(0, -1).reduce((a, q) => a + q[k], 0) / (ring.length - 1));
  const U = (q) => (q[0] - c[0]) * t[0] + (q[1] - c[1]) * t[1], W = (q) => (q[0] - c[0]) * nn[0] + (q[1] - c[1]) * nn[1];
  const u0 = Math.min(...ring.map(U)), u1 = Math.max(...ring.map(U)), w0 = Math.min(...ring.map(W)), w1 = Math.max(...ring.map(W));
  const side = (ww) => trackDist([c[0] + nn[0] * ww, c[1] + nn[1] * ww]);
  const front = [side(w0 - 1.4) < 2 ? -1 : 0, side(w1 + 1.4) < 2 ? 1 : 0].filter(Boolean);
  if (front.length !== 1) { platforms.push({ name: el.tags.name || '', ring, c, t, u: [u0, u1], w: [w0, w1], front, simple: true }); continue; }
  const f = front[0], wr = f === 1 ? w0 : w1, k = f, dep = -f;
  const Pt = (u, ww) => [c[0] + t[0] * u + nn[0] * ww, c[1] + t[1] * u + nn[1] * ww];
  // rear faces the carriageway? -> fence there, and ramp + steps at the ends
  const runs = []; let cur = null, roadN = 0, allN = 0;
  for (let u = u0 + 0.3; u < u1 - 0.3; u += 2) { const ue = Math.min(u1 - 0.3, u + 2), road = ROADISH.test(surfAt(Pt((u + ue) / 2, wr - k * 1.2)) || '') && surfAt(Pt((u + ue) / 2, wr - k * 1.2)) !== 'Road Tram Formation'; allN++; if (road) { roadN++; if (cur && Math.abs(cur[1] - u) < 1e-6) cur[1] = ue; else { cur = [u, ue]; runs.push(cur); } } else cur = null; }
  const needRamp = allN > 0 && roadN / allN >= 0.3;
  const endPt = (u) => [c[0] + t[0] * u, c[1] + t[1] * u], dSig = (u) => Math.min(1e9, ...SITES.map((q) => Math.hypot(q.p[0] - endPt(u)[0], q.p[1] - endPt(u)[1])));
  const rampAtStart = dSig(u0) < dSig(u1);  // ramp at the end nearer a signalised crossing (EST)
  const RL = needRamp ? Math.min(9, (u1 - u0) * 0.15) : 0;
  const mStart = needRamp ? u0 + (rampAtStart ? RL : 0.3) : u0 + 0.3, mEnd = needRamp ? u1 - (rampAtStart ? 0.3 : RL) : u1 - 0.3;
  // shelters: on clusters of real seats (box shelter where the rear faces traffic, open canopy where it faces a footway),
  // clear of trees (inventory point and any footway hole within 2.5 m of it)
  const Wc = W; const seatsHere = seatPts.filter((q) => inRing(q.p, ring)).map((q) => [U(q.p), Wc(q.p)]).sort((a, b) => a[0] - b[0]);
  const clusters = []; for (const sq of seatsHere) { const cl = clusters.at(-1); if (cl && sq[0] - cl.at(-1)[0] < 6) cl.push(sq); else clusters.push([sq]); }
  const len = mEnd - mStart, nRule = Math.max(1, Math.floor(len / 22));
  const spots = el.tags.shelter !== 'yes' ? [] : clusters.length ? clusters.map((cl) => ({ u: cl.reduce((a, q) => a + q[0], 0) / cl.length, w: k > 0 ? Math.min(...cl.map((q) => q[1])) : Math.max(...cl.map((q) => q[1])), real: true }))
    : Array.from({ length: nRule }, (_, q) => ({ u: mStart + len * (q + 1) / (nRule + 1), real: false }));
  const obst = []; for (const tr of trees) { const tp = tr.p0 || tr.p; if (Math.hypot(tp[0] - c[0], tp[1] - c[1]) > 60) continue; obst.push(tr.p, tp); }
  const obUW = obst.map((q) => [U(q), W(q)]), D2 = Math.min(1.7, Math.max(1.0, (w1 - w0) - 1.9)), placed = [], shelters = [];
  for (const sp of spots) {
    const HL = needRamp ? 2.07 : 4.925, CLR = needRamp ? 2.0 : 0.3;
    const wcN = sp.real ? sp.w - k * 0.9 : wr + k * 1.4;
    const wLo = needRamp ? Math.min(wr + k * 0.2, wr + k * (0.2 + D2)) - 2.0 : wcN - 1.5, wHi = needRamp ? Math.max(wr + k * 0.2, wr + k * (0.2 + D2)) + 2.0 : wcN + 1.5;
    let um = null;
    for (let dl = 0; dl <= 12 && um === null; dl++) for (const sg of dl ? [1, -1] : [1]) { const cu = Math.min(mEnd - HL - 0.2, Math.max(mStart + HL + 0.2, sp.u + sg * dl)); if (!obUW.some(([tu, tw]) => tu > cu - HL - CLR && tu < cu + HL + CLR && tw > wLo && tw < wHi) && !placed.some((q) => Math.abs(q - cu) < 2 * HL + 0.5)) { um = cu; break; } }
    if (um === null) continue; placed.push(um);
    const wa = needRamp ? (sp.real ? (k > 0 ? Math.max(wr + 0.2, sp.w - 0.45) : Math.min(wr - 0.2, sp.w + 0.45)) : wr + k * 0.2) : wcN;
    shelters.push({ type: needRamp ? 'box' : 'canopy', u: r2(um), w: r2(wa), depth: r2(D2), ruleBench: !sp.real });
  }
  const nm = el.tags.name || '', ci = nm.indexOf(':');
  platforms.push({ name: nm, stopName: ci > 0 ? nm.slice(ci + 1).trim() : nm, stopNo: ci > 0 ? nm.slice(0, ci).replace('Stop', '').trim() : '', ring, c: c.map(r2), t: t.map((v) => +v.toFixed(5)), u: [r2(u0), r2(u1)], w: [r2(w0), r2(w1)], front: f, dep, needRamp, rampAtStart, m: [r2(mStart), r2(mEnd)], fence: runs.map(([a, b]) => [r2(a), r2(b)]), shelters });
}
console.log('platforms', platforms.length, '| with front', platforms.filter((q) => !q.simple).length, '| shelters', platforms.reduce((a, q) => a + (q.shelters || []).length, 0));

// overhead: contact wire over each track; cross spans every ~30 m to poles 0.8 m behind each kerb
const onPlatform = (p) => platforms.some((q) => inRing(p, q.ring));
const spans = [], poles = [];
for (const line of trackLines) {
  let acc = 30;
  for (let q = 1; q < line.length; q++) {
    const a = line[q - 1], b = line[q], L = Math.hypot(b[0] - a[0], b[1] - a[1]); acc += L; if (acc < 30) continue;
    if (spans.some((sp) => Math.hypot(sp.at[0] - b[0], sp.at[1] - b[1]) < 12)) continue;
    if (SITES.some((sg) => Math.hypot(sg.p[0] - b[0], sg.p[1] - b[1]) < 18)) continue;
    const tt = unit([b[0] - a[0], b[1] - a[1]]), nn = [-tt[1], tt[0]];
    const side = (sg) => { for (let d = 2.5; d < 22; d += 0.25) { const qq = [b[0] + nn[0] * sg * d, b[1] + nn[1] * sg * d], st = surfAt(qq); if ((st === 'Road Kerb' || st === 'Road Footway') && !onPlatform(qq)) return [r1(qq[0] + nn[0] * sg * 0.8), r1(qq[1] + nn[1] * sg * 0.8)]; } return null; };
    const pa = side(1), pb = side(-1); if (!pa || !pb || Math.hypot(pa[0] - pb[0], pa[1] - pb[1]) > 34) continue;
    acc = 0; spans.push({ at: b, a: pa, b: pb });
    for (const pp of [pa, pb]) if (!poles.some((o) => Math.hypot(o[0] - pp[0], o[1] - pp[1]) < 4)) poles.push(pp);
  }
}
console.log('overhead spans', spans.length, '| poles', poles.length);

// ── 5. seats (orientation decided here) ───────────────────────────────────
const seats = [], planterEndUsed = new Set();
const planterGrid = new Grid(10); planters.forEach((pl, i) => { const [x0, y0, x1, y1] = bboxOf(pl.ring); planterGrid.add(i, x0, y0, x1, y1); });
for (const sp of seatPts) {
  const pl = platforms.find((q) => !q.simple && inRing(sp.p, q.ring));
  if (pl) { seats.push({ p: sp.p, yaw: yawOf([-pl.t[1] * pl.front, pl.t[0] * pl.front]), z: 0.29, kind: 'kerb', model: sp.model }); continue; }
  let best = null; for (const i of planterGrid.near(sp.p[0], sp.p[1], 2.5)) { const r = planters[i].ring; for (let k2 = 0; k2 < r.length - 1; k2++) { const d = segDist(sp.p, r[k2], r[k2 + 1]).d; if (d < 2.5 && (!best || d < best.d)) best = { d, i }; } }
  if (best) {
    const P0 = planters[best.i], sg = dot([sp.p[0] - P0.c[0], sp.p[1] - P0.c[1]], P0.ax) >= 0 ? 1 : -1, key = best.i + ':' + sg;
    if (!planterEndUsed.has(key)) {
      planterEndUsed.add(key); (P0.seatEnds ||= []).push(sg); const out = [P0.ax[0] * sg, P0.ax[1] * sg];
      seats.push({ p: [r2(P0.c[0] + out[0] * (P0.hl + 0.32)), r2(P0.c[1] + out[1] * (P0.hl + 0.32))], yaw: yawOf(out), z: 0.14, kind: 'planter', len: r2(Math.min(1.8, Math.max(1.2, P0.hw * 2 + 0.2))), model: sp.model }); continue;
    }
  }
  const k = nearestKerb(sp.p, 10); const away = k ? unit([sp.p[0] - k.q[0], sp.p[1] - k.q[1]]) : EW;
  seats.push({ p: sp.p, yaw: yawOf(away), z: 0.14, kind: 'kerb', model: sp.model });
}
console.log('seats', seats.length, '| at planter ends', seats.filter((q) => q.kind === 'planter').length);

// ── 6. stormwater pit lids, tactile pads, parking bays, fountains, toilets ─
var TOP = { 'Road Footway': 0.14, 'Road Kerb': 0.15, 'Road Channel': 0.03, 'Road Carriageway': 0.02, 'Road Arterial': 0.02, 'Road Tram Formation': 0.035, 'Road Median': 0.15, 'Road Nature Strip': 0.15 };
const VISIBLE = { 'Grated Kerbside': 1, 'Grated OFK': 1, 'Double Grated OFK': 1, 'Grated Side Entry': 1, 'Lane Type': 1, 'Trench Grate': 1, 'Grated Manhole': 1 };
const pits = [];
for (const f of await com('stormwater-pits', 'location')) {
  const kind = (f.properties.asset_description || '').replace('SWD Pit - ', ''); if (!VISIBLE[kind]) continue;
  const p = P(f.geometry.coordinates), L = +f.properties.grate_length || (kind === 'Trench Grate' ? 1500 : kind === 'Grated Manhole' ? 750 : 600), Wd = +f.properties.grate_width || (kind === 'Trench Grate' ? 200 : kind === 'Grated Manhole' ? 750 : 600);
  const k = kind === 'Lane Type' ? null : nearestKerb(p, 4);
  pits.push([p[0], p[1], yawOf(k ? k.t : NS), L / 1000, Wd / 1000, TOP[surfAt(p)] ?? 0.02, kind === 'Lane Type' || kind === 'Grated Manhole' ? 1 : 0, f.properties.grate_material_lupvalue === 'Cast Iron' ? 1 : 0]);
}
const tgsi = [];
for (const f of await com('tactile-ground-surface-indicator', 'location')) {
  const p = P(f.geometry.coordinates), k = nearestKerb(p, 8); if (!k) continue;
  const nr = [-k.t[1], k.t[0]], sg = surfAt([k.q[0] + nr[0] * 0.8, k.q[1] + nr[1] * 0.8]) === 'Road Footway' ? 1 : -1;
  tgsi.push([r2(k.q[0] + nr[0] * sg * 0.6), r2(k.q[1] + nr[1] * sg * 0.6), yawOf(k.t)]);
}
const bayF = await com('on-street-parking-bays', 'location'), bayPts = bayF.map((f) => P(f.geometry.coordinates)), bayLines = [], bayEnds = [];
for (const bp of bayPts) {
  const k = nearestKerb(bp, 6); if (!k) continue; const kn = [-k.t[1], k.t[0]];
  const isRoad = (sg) => /Carriageway|Channel|Arterial/.test(surfAt([k.q[0] + kn[0] * sg * 1.2, k.q[1] + kn[1] * sg * 1.2]) || '');
  const sg = isRoad(1) ? 1 : isRoad(-1) ? -1 : 0; if (!sg) continue; const nr = [kn[0] * sg, kn[1] * sg];
  let gap = 1e9; for (const o of bayPts) { if (o === bp) continue; const dd = Math.abs(dot([o[0] - bp[0], o[1] - bp[1]], k.t)), off = Math.abs(dot([o[0] - bp[0], o[1] - bp[1]], nr)); if (off < 1.5 && dd > 2 && dd < gap) gap = dd; }
  const L = Math.min(6.7, Math.max(4.5, gap < 1e8 ? gap : 5.4)), Wb = 2.2, z = 0.02;
  for (const e2 of [-0.5, 0.5]) bayEnds.push([k.q[0] + k.t[0] * L * e2 + nr[0] * Wb / 2, k.q[1] + k.t[1] * L * e2 + nr[1] * Wb / 2, yawOf(nr), Wb, z]);
  bayLines.push([r2(k.q[0] + nr[0] * Wb), r2(k.q[1] + nr[1] * Wb), yawOf(k.t), r2(L + 0.1), z]);
}
// Neighbouring bays share a boundary, and each drew its own end line there: the same line twice, or two lines
// a little apart where the inferred lengths disagree. Ends closer than 1.5 m (a bay is at least 4.5 m long) and
// parallel are one boundary, drawn once at their mean position.
{
  const kept = [], g = new Grid(3);
  for (const e of bayEnds) {
    const hit = [...g.near(e[0], e[1], 1.5)].find((o) => Math.hypot(o.x / o.n - e[0], o.y / o.n - e[1]) < 1.5 && Math.abs(Math.sin(o.yaw - e[2])) < 0.2);
    if (hit) { hit.x += e[0]; hit.y += e[1]; hit.n++; continue; }
    const o = { x: e[0], y: e[1], n: 1, yaw: e[2], len: e[3], z: e[4] }; kept.push(o); g.add(o, e[0], e[1], e[0], e[1]);
  }
  for (const o of kept) bayLines.push([r2(o.x / o.n), r2(o.y / o.n), o.yaw, o.len, o.z]);
  console.log('bay end lines', bayEnds.length, '-> boundaries', kept.length);
}
const fountains = [];
for (const f of await com('drinking-fountains', 'geo_point_2d')) {
  const p = P(f.geometry.coordinates), k = nearestKerb(p, 10), m = f.properties.modeldescription || '';
  fountains.push([p[0], p[1], yawOf(k ? unit([p[0] - k.q[0], p[1] - k.q[1]]) : NS), /Leaf/i.test(m) ? 1 : 0, /Bottle/i.test(m) ? 1 : 0, TOP[surfAt(p)] ?? 0.14]);
}
// toilets: type only where the National Public Toilet Map notes state it
const ntm = (await cached('ntm.csv', 'https://data.gov.au/data/dataset/553b3049-2b8b-46a2-95e6-640d7986a8c1/resource/34076296-6692-4e30-b627-67b7c4eb1027/download/toiletmapexport_261001_074429.csv'))
  .split(/\r?\n/);
const parseCsv = (line) => { const out = []; let cur = '', q = false; for (const ch of line) { if (ch === '"') q = !q; else if (ch === ',' && !q) { out.push(cur); cur = ''; } else cur += ch; } out.push(cur); return out; };
const hdr = parseCsv(ntm[0].replace(/^\uFEFF/, ''));
const ntmRows = []; { let buf = ''; for (const l of ntm.slice(1)) { buf = buf ? buf + '\n' + l : l; if ((buf.match(/"/g) || []).length % 2 === 0) { const c = parseCsv(buf); const o = Object.fromEntries(hdr.map((h, i) => [h, c[i]])); if (o.State === 'VIC' && o.Latitude) ntmRows.push(o); buf = ''; } } }
const toilets = [];
for (const f of await com('public-toilets', 'location')) {
  const [lon, lat] = f.geometry.coordinates, p = P([lon, lat]), name = f.properties.name || '';
  let note = '', bd = 40; for (const o of ntmRows) { const d = Math.hypot((+o.Longitude - lon) * 88000, (+o.Latitude - lat) * 111000); if (d < bd) { bd = d; note = [o.Name, o.ToiletNote, o.AddressNote, o.AccessNote].join(' '); } } // nearest within 40 m
  const type = /underground/i.test(note + name) ? 'underground' : /exeloo|automat|self.?clean/i.test(note) ? 'exeloo' : /Toilet \d+/.test(name) ? 'unknown' : 'building';
  const k = nearestKerb(p, 12); toilets.push({ p, yaw: yawOf(k ? k.t : NS), type, name });
}
console.log('pits', pits.length, '| tgsi', tgsi.length, '| bay lines', bayLines.length, '| fountains', fountains.length, '| toilets', toilets.length, JSON.stringify(toilets.reduce((a, t) => ((a[t.type] = (a[t.type] || 0) + 1), a), {})));

// ── 7. traffic signals: posts on the kerb corners, lantern roles (TC-1115), crossings ─
const kerbPtGrid = new Grid(10);
for (const sf of surfaces) if (sf.type === 'Road Kerb') for (const pp of sf.polys) for (const q of pp[0]) kerbPtGrid.add(q, q[0], q[1], q[0], q[1]);
const roadAt = (p) => /Carriageway|Arterial|Tram Formation|Channel/.test(surfAt(p) || '');
function spanAcross(o, across) { let lo = 0, hi = 0; for (let d = 0; d < 25; d += 0.25) { if (roadAt([o[0] + across[0] * d, o[1] + across[1] * d])) hi = d; else if (d > hi + 1) break; } for (let d = 0; d < 25; d += 0.25) { if (roadAt([o[0] - across[0] * d, o[1] - across[1] * d])) lo = d; else if (d > lo + 1) break; } return [-lo, hi]; }
const signalSites = [], marks = [];
for (const site of SITES) {
  const Pp = site.p, corners = [];
  for (const [a, b] of [[1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    let best = null, bd = site.type === 'POS' ? 18 : 30;
    for (const q of kerbPtGrid.near(Pp[0], Pp[1], bd)) { const dx = q[0] - Pp[0], dy = q[1] - Pp[1], sa = dx * NS[0] + dy * NS[1], sb = dx * EW[0] + dy * EW[1]; if (sa * a > 2 && sb * b > 2) { const d = Math.hypot(dx, dy); if (d < bd) { bd = d; best = q; } } }
    if (!best) continue; const out = unit([NS[0] * a + EW[0] * b, NS[1] * a + EW[1] * b]);
    corners.push({ a, b, dir: out, pt: [r1(best[0] + out[0] * 0.5), r1(best[1] + out[1] * 0.5)], items: [] });
  }
  if (corners.length < 2) continue;
  const tramNS = trackDist(Pp) < 25 && trackLines.some((l) => l.some((q, i) => i && Math.hypot(q[0] - Pp[0], q[1] - Pp[1]) < 25 && Math.abs(dot(unit([q[0] - l[i - 1][0], q[1] - l[i - 1][1]]), NS)) > 0.9));
  const tramEW = trackDist(Pp) < 25 && trackLines.some((l) => l.some((q, i) => i && Math.hypot(q[0] - Pp[0], q[1] - Pp[1]) < 25 && Math.abs(dot(unit([q[0] - l[i - 1][0], q[1] - l[i - 1][1]]), EW)) > 0.9));
  for (const ap of [{ t: NS, road: 'A', tram: tramNS }, { t: [-NS[0], -NS[1]], road: 'A', tram: tramNS }, { t: EW, road: 'B', tram: tramEW }, { t: [-EW[0], -EW[1]], road: 'B', tram: tramEW }]) {
    const L = [-ap.t[1], ap.t[0]], pick = (v) => corners.reduce((bst, c) => (dot(c.dir, v) > dot(bst.dir, v) ? c : bst), corners[0]), face = yawOf([-ap.t[0], -ap.t[1]]);
    if (site.type === 'POS' && ap.road === 'B') continue; // mid-block crossing: lanterns for the through road only
    pick([-ap.t[0] + L[0], -ap.t[1] + L[1]]).items.push(['P', face, ap.road, ap.tram ? 1 : 0]);
    pick([ap.t[0] - L[0], ap.t[1] - L[1]]).items.push(['S', face, ap.road, 0]);
    pick([ap.t[0] + L[0], ap.t[1] + L[1]]).items.push(['T', face, ap.road, 0]);
  }
  signalSites.push({ id: site.id, name: site.name, type: site.type, p: Pp, corners: corners.map((c) => ({ pt: c.pt, items: c.items, ped: [[yawOf([-NS[0] * c.a, -NS[1] * c.a]), 'B'], [yawOf([-EW[0] * c.b, -EW[1] * c.b]), 'A']] })) });
  // crossing lines and stop lines (positions inferred)
  for (const [leg, across, setback] of [[NS, EW, 12], [[-NS[0], -NS[1]], EW, 12], [EW, NS, 9], [[-EW[0], -EW[1]], NS, 9]]) {
    for (const off of [setback, setback + 3]) { const o = [Pp[0] + leg[0] * off, Pp[1] + leg[1] * off], [lo, hi] = spanAcross(o, across); for (let tt = lo; tt < hi - 0.5; tt += 1.3) marks.push([r2(o[0] + across[0] * (tt + 0.5)), r2(o[1] + across[1] * (tt + 0.5)), yawOf(across), 1.0, 0.15]); }
    const o = [Pp[0] + leg[0] * (setback + 4.5), Pp[1] + leg[1] * (setback + 4.5)], [lo, hi] = spanAcross(o, across), Lf = [leg[1], -leg[0]], sgn = dot(Lf, across) > 0 ? 1 : -1, a0 = sgn > 0 ? 0 : lo, a1 = sgn > 0 ? hi : 0;
    if (Math.abs(a1 - a0) > 1) marks.push([r2(o[0] + across[0] * (a0 + a1) / 2), r2(o[1] + across[1] * (a0 + a1) / 2), yawOf(across), r2(Math.abs(a1 - a0)), 0.6]);
  }
}
console.log('signal sites', SITES.length, '| with posts', signalSites.length, '| posts', signalSites.reduce((a, q) => a + q.corners.length, 0), '| marks', marks.length);

// ── write ─────────────────────────────────────────────────────────────────
const write = (name, obj) => { const txt = JSON.stringify(obj); fs.writeFileSync(path.join(OUT, name), txt); console.log('wrote', name, (txt.length / 1024).toFixed(0), 'KB'); };
// The source outlines carry a point every few centimetres along straight kerbs: 526,000 points, of which 33,000
// change the shape by 5 cm or more. Douglas-Peucker at 5 cm keeps those; the slabs come out ~15x lighter.
const SIMPLIFY_M = +(process.env.SIMPLIFY_M || 0.05);
function dpOpen(r, eps) {
  if (r.length < 3) return r;
  const a = r[0], b = r[r.length - 1], dx = b[0] - a[0], dy = b[1] - a[1], L = Math.hypot(dx, dy);
  let mx = -1, ix = 0;
  for (let i = 1; i < r.length - 1; i++) { const d = L > 1e-9 ? Math.abs((r[i][0] - a[0]) * dy - (r[i][1] - a[1]) * dx) / L : Math.hypot(r[i][0] - a[0], r[i][1] - a[1]); if (d > mx) { mx = d; ix = i; } }
  return mx > eps ? [...dpOpen(r.slice(0, ix + 1), eps).slice(0, -1), ...dpOpen(r.slice(ix), eps)] : [a, b];
}
function simplifyRing(r, eps) {   // closed ring in, closed ring out (null when it collapses)
  let k = 0, mx = -1; for (let i = 1; i < r.length - 1; i++) { const d = Math.hypot(r[i][0] - r[0][0], r[i][1] - r[0][1]); if (d > mx) { mx = d; k = i; } }
  const out = [...dpOpen(r.slice(0, k + 1), eps).slice(0, -1), ...dpOpen(r.slice(k), eps)];
  return out.length >= 4 ? out : null;
}
const simplifyPoly = (poly) => { const outer = simplifyRing(poly[0], SIMPLIFY_M); if (!outer) return null; return [outer, ...poly.slice(1).map((h) => simplifyRing(h, SIMPLIFY_M)).filter(Boolean)]; };
const byType = {}; let ptsIn = 0, ptsOut = 0;
for (const sf of surfaces) for (const poly of sf.polys) { ptsIn += poly.reduce((a, r) => a + r.length, 0); const sp = simplifyPoly(poly); if (!sp) continue; ptsOut += sp.reduce((a, r) => a + r.length, 0); (byType[sf.type] ||= []).push(sp); }
const holesOut = otherHoles.map((h) => simplifyRing(h, SIMPLIFY_M)).filter(Boolean);
console.log('surface points', ptsIn, '->', ptsOut);
write('surfaces.json', { axes: { ns: NS.map((v) => +v.toFixed(5)), ew: EW.map((v) => +v.toFixed(5)) }, byType, otherHoles: holesOut });
write('trees.json', { trees: trees.map((t) => [t.p[0], t.p[1], t.h ?? null, t.dbh ?? null, t.kind === 'missing' ? 0 : 1]), planters: planters.map((pl) => ({ ring: pl.ring, c: pl.c.map(r2), ax: pl.ax.map((v) => +v.toFixed(5)), hl: r2(pl.hl), hw: r2(pl.hw), surveyed: pl.surveyed, seatEnds: pl.seatEnds || [] })) });
write('street.json', { lights, featureLights, seats, pits, tgsi, bayLines, fountains, toilets });
write('signals.json', { sites: signalSites, marks });
write('tram.json', { trackLines, platforms, overhead: { spans: spans.map((q) => [q.a, q.b]), poles } });
write('manifest.json', {
  built: new Date().toISOString().slice(0, 10), extentWgs84: [w, s, e, n].map((v) => +v.toFixed(6)), origin: 'EPSG:7855, metres from 144.9605 E, -37.8145 N (as the buildings)',
  counts: { surfaces: surfaces.length, trees: trees.length, planters: planters.length, lights: lights.length, seats: seats.length, pits: pits.length, tgsi: tgsi.length, bayLines: bayLines.length, fountains: fountains.length, toilets: toilets.length, signalSites: signalSites.length, trackLines: trackLines.length, platforms: platforms.length },
  sources: [
    'City of Melbourne Open Data (CC BY): road-segments-with-surface-type, street-lights-with-emitted-lux-level-council-owned-lights-only, feature-lighting-including-light-type-wattage-and-location, street-furniture (seats), stormwater-pits, tactile-ground-surface-indicator, on-street-parking-bays, drinking-fountains, public-toilets',
    'Transport Victoria (CC BY 4.0): Public Transport Lines (GTFS shapes); DTP Victorian Traffic Signals',
    '(c) OpenStreetMap contributors (ODbL): tram platform outlines',
    'National Public Toilet Map, Australian Government (CC BY 3.0 AU): toilet type notes',
    'MyCityTwin tree data team handoff 2026-10-03: tree points and heights',
  ],
  estimated: 'street-light poles (from lux peaks), signal posts and lantern layout, crossing and stop lines, standard tree pits, planter shape, seat orientation, platform fittings, overhead poles and wires, tactile pad and bay-line shapes',
});

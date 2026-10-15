/*
 * PLATFORMS ONTO THE TRACKS — moves each tram platform sideways so its front edge sits where the standard puts
 * it from the track it serves.
 *
 * Why: the platform outlines are OpenStreetMap's, the tracks are fitted to the City of Melbourne's tram
 * formation (build-streetscape.mjs). The two disagree by 0.8-1.4 m, nearly all the same way (platforms on
 * east-west streets sit north of where the formation puts them, on north-south streets east of it), which is
 * an offset in how the OSM outlines were traced rather than the stops. Seen from the street, each pair of
 * platforms then sits off-centre on its tracks: one edge a metre and a half from the rail, the other almost on
 * it. The tracks and the ground agree with each other, so the platforms are the ones moved.
 *
 * Rule: Yarra Trams CE-019-ST-0039 Table 3, platform front edge 700 mm from the rail; with half the 1435 mm
 * gauge that is EDGE_M from the track centre (ProjectDoc/streetscape/09-tram-stops.md). A platform with a
 * track along both sides (an island) is centred between them. A platform whose track side was not worked out
 * takes the edge nearer a track. Everything a platform carries (fence, ramps, shelters) is stored relative to
 * its centre, so moving the outline and the centre moves them too.
 *
 * Used by build-streetscape.mjs before tram.json is written. On its own it re-aligns an existing file:
 *   node scripts/align-platforms.mjs public/data/streetscape/tram.json
 * (it also fits out platforms left as a bare slab, and puts the ramps of facing platforms at the same end:
 * fitPlainPlatforms and pairRamps below)
 */
import fs from 'node:fs';
import { pathToFileURL } from 'node:url';

export const EDGE_M = 1.418;
/** Moves larger than this are left alone: something other than a tracing offset. */
const MAX_MOVE_M = 2.5;

function segDist(p, a, b) {
  const dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy;
  const t = L2 ? Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2)) : 0;
  return Math.hypot(p[0] - (a[0] + dx * t), p[1] - (a[1] + dy * t));
}

/** Returns { moved, skipped } and moves the platforms in place. */
export function alignPlatforms(platforms, trackLines) {
  const segs = []; for (const l of trackLines) for (let i = 0; i < l.length - 1; i++) segs.push([l[i], l[i + 1]]);
  const near = (p) => { let m = 1e9; for (const [a, b] of segs) { if (Math.min(a[0], b[0]) - p[0] > 30 || p[0] - Math.max(a[0], b[0]) > 30) continue; m = Math.min(m, segDist(p, a, b)); } return m; };
  const r2 = (v) => Math.round(v * 100) / 100;
  let moved = 0, skipped = 0;
  for (const q of platforms) {
    if (q.island) continue;   // placed between its two tracks by terminus-tracks.mjs
    const nn = [-q.t[1], q.t[0]];
    // the gap from each long edge to the nearest track centre, the middle of samples along it
    const gap = (w) => {
      const ds = []; const step = Math.max(1, (q.u[1] - q.u[0] - 2) / 10);
      for (let u = q.u[0] + 1; u <= q.u[1] - 1 + 1e-6; u += step) ds.push(near([q.c[0] + q.t[0] * u + nn[0] * w, q.c[1] + q.t[1] * u + nn[1] * w]));
      ds.sort((a, b) => a - b); return ds[ds.length >> 1] ?? 1e9;
    };
    const lo = gap(q.w[0]), hi = gap(q.w[1]);
    // which side the track is: the one the build found, or the nearer edge; both near is an island
    const island = lo < EDGE_M + 1.5 && hi < EDGE_M + 1.5 && Math.abs(lo - hi) < 2.5 && q.simple;
    let shift;   // along nn, metres
    if (island) shift = (hi - lo) / 2;
    else {
      const f = q.simple ? (hi < lo ? 1 : -1) : q.front, g = f === 1 ? hi : lo;
      shift = f * (g - EDGE_M);
    }
    if (!Number.isFinite(shift) || Math.abs(shift) > MAX_MOVE_M) { skipped++; continue; }
    const dx = nn[0] * shift, dy = nn[1] * shift;
    q.c = [r2(q.c[0] + dx), r2(q.c[1] + dy)];
    q.ring = q.ring.map((p) => [r2(p[0] + dx), r2(p[1] + dy)]);
    q.aligned = r2(shift); moved++;
  }
  return { moved, skipped };
}

/*
 * Platforms drawn as a plain slab. build-streetscape.mjs gives a platform its fittings (track-edge line and
 * TGSI, rear fence, ramp and steps, totem) only when it can tell which long side faces a track, by looking
 * 1.4 m beyond each edge; with the OSM outline a metre off the track, some looked past the track or not far
 * enough, and were left as a bare slab. Once aligned, the track side is plain: the edge EDGE_M from a track.
 * The fittings follow the same rules as the build (fence and ramp where the rear faces the carriageway, the
 * ramp at the end nearer a signalised crossing). Shelters need the seat inventory and OSM tags the build has,
 * so a platform fitted here has none. A platform with a track along both sides is left as it is here (the
 * Elizabeth St island is drawn as one by terminus-tracks.mjs).
 */
const ROADISH = /Carriageway|Arterial|Channel|Tram Formation/;
export function fitPlainPlatforms(platforms, trackLines, surfAt, sites) {
  const segs = []; for (const l of trackLines) for (let i = 0; i < l.length - 1; i++) segs.push([l[i], l[i + 1]]);
  const near = (p) => { let m = 1e9; for (const [a, b] of segs) { if (Math.min(a[0], b[0]) - p[0] > 30 || p[0] - Math.max(a[0], b[0]) > 30) continue; m = Math.min(m, segDist(p, a, b)); } return m; };
  const nearSig = (p) => Math.min(1e9, ...sites.map((q) => Math.hypot(q[0] - p[0], q[1] - p[1])));
  const r2 = (v) => Math.round(v * 100) / 100;
  let fitted = 0;
  for (const q of platforms) {
    if (!q.simple) continue;
    const nn = [-q.t[1], q.t[0]], Pt = (u, w) => [q.c[0] + q.t[0] * u + nn[0] * w, q.c[1] + q.t[1] * u + nn[1] * w];
    const gap = (w) => near(Pt((q.u[0] + q.u[1]) / 2, w));
    const lo = gap(q.w[0]), hi = gap(q.w[1]);
    if (Math.max(lo, hi) < EDGE_M + 0.6 || Math.min(lo, hi) > EDGE_M + 0.6) continue;   // an island, or no track
    const f = hi < lo ? 1 : -1, k = f, wr = f === 1 ? q.w[0] : q.w[1], [u0, u1] = q.u;
    const runs = []; let cur = null, roadN = 0, allN = 0;
    for (let u = u0 + 0.3; u < u1 - 0.3; u += 2) {
      const ue = Math.min(u1 - 0.3, u + 2), st = surfAt(Pt((u + ue) / 2, wr - k * 1.2)) || '';
      const road = ROADISH.test(st) && st !== 'Road Tram Formation'; allN++;
      if (road) { roadN++; if (cur && Math.abs(cur[1] - u) < 1e-6) cur[1] = ue; else { cur = [u, ue]; runs.push(cur); } } else cur = null;
    }
    const needRamp = allN > 0 && roadN / allN >= 0.3;
    const rampAtStart = nearSig(Pt(u0, 0)) < nearSig(Pt(u1, 0)), RL = needRamp ? Math.min(9, (u1 - u0) * 0.15) : 0;
    const m = needRamp ? (rampAtStart ? [u0 + RL, u1 - 0.3] : [u0 + 0.3, u1 - RL]) : [u0 + 0.3, u1 - 0.3];
    const nm = q.name || '', ci = nm.indexOf(':');
    Object.assign(q, {
      stopName: ci > 0 ? nm.slice(ci + 1).trim() : nm, stopNo: ci > 0 ? nm.slice(0, ci).replace('Stop', '').trim() : '',
      front: f, dep: -f, needRamp, rampAtStart, m: m.map(r2), fence: runs.map(([a, b]) => [r2(a), r2(b)]), shelters: [], fittedLate: true,
    });
    delete q.simple; fitted++;
  }
  return fitted;
}

/** A road-surface lookup over surfaces.json (the same surfaces the build reads), for the standalone run. */
export function surfaceLookup(doc) {
  const inRing = (p, r) => { let c = false; for (let i = 0, j = r.length - 1; i < r.length; j = i++) { const [xi, yi] = r[i], [xj, yj] = r[j]; if ((yi > p[1]) !== (yj > p[1]) && p[0] < (xj - xi) * (p[1] - yi) / (yj - yi) + xi) c = !c; } return c; };
  const cells = new Map(), key = (x, y) => `${Math.floor(x / 20)},${Math.floor(y / 20)}`;
  for (const [type, polys] of Object.entries(doc.byType)) for (const poly of polys) {
    const xs = poly[0].map((p) => p[0]), ys = poly[0].map((p) => p[1]);
    for (let x = Math.floor(Math.min(...xs) / 20); x <= Math.floor(Math.max(...xs) / 20); x++) for (let y = Math.floor(Math.min(...ys) / 20); y <= Math.floor(Math.max(...ys) / 20); y++) {
      const kk = `${x},${y}`; if (!cells.has(kk)) cells.set(kk, []); cells.get(kk).push({ type, poly });
    }
  }
  return (p) => { for (const it of cells.get(key(p[0], p[1])) || []) if (inRing(p, it.poly[0]) && !it.poly.slice(1).some((h) => inRing(p, h))) return it.type; return null; };
}

/*
 * Ramps, per stop rather than per platform. build-streetscape.mjs puts each platform's ramp at whichever of
 * its own ends is nearer a signalised crossing (EST); two platforms facing each other across the tracks could
 * then get their ramps at opposite ends, and the raised parts of the pair look staggered by up to 15 m. Here
 * the two platforms of a stop (same name, parallel, across the tracks from each other, overlapping along
 * them) take one end between them: the end of the pair nearer a signalised crossing. A platform that needs no
 * ramp (its rear faces a footway) keeps none. Shelters are kept on the level part.
 */
export function pairRamps(platforms, sites) {
  const nearSig = (p) => Math.min(1e9, ...sites.map((q) => Math.hypot(q[0] - p[0], q[1] - p[1])));
  let changed = 0;
  for (let i = 0; i < platforms.length; i++) for (let j = i + 1; j < platforms.length; j++) {
    const a = platforms[i], b = platforms[j];
    if (a.simple || b.simple || !a.needRamp || !b.needRamp || a.name !== b.name) continue;
    const dot = a.t[0] * b.t[0] + a.t[1] * b.t[1]; if (Math.abs(dot) < 0.98) continue;
    const dx = b.c[0] - a.c[0], dy = b.c[1] - a.c[1];
    if (Math.abs(-dx * a.t[1] + dy * a.t[0]) > 16 || Math.abs(dx * a.t[0] + dy * a.t[1]) > 40) continue;
    // each platform's two ends on a's axis: which of its own u0/u1 is the low end
    const lowIsStart = (q) => q.t[0] * a.t[0] + q.t[1] * a.t[1] > 0;
    const endPt = (q, u) => [q.c[0] + q.t[0] * u, q.c[1] + q.t[1] * u];
    const lowMid = [0, 1].map((k) => (endPt(a, lowIsStart(a) ? a.u[0] : a.u[1])[k] + endPt(b, lowIsStart(b) ? b.u[0] : b.u[1])[k]) / 2);
    const highMid = [0, 1].map((k) => (endPt(a, lowIsStart(a) ? a.u[1] : a.u[0])[k] + endPt(b, lowIsStart(b) ? b.u[1] : b.u[0])[k]) / 2);
    const rampLow = nearSig(lowMid) <= nearSig(highMid);
    for (const q of [a, b]) {
      const start = rampLow === lowIsStart(q);
      if (start === q.rampAtStart) continue;
      const [u0, u1] = q.u, RL = Math.min(9, (u1 - u0) * 0.15), r2 = (v) => Math.round(v * 100) / 100;
      q.rampAtStart = start;
      q.m = start ? [r2(u0 + RL), r2(u1 - 0.3)] : [r2(u0 + 0.3), r2(u1 - RL)];
      for (const sh of q.shelters || []) {
        const HL = (sh.type === 'canopy' ? 4.925 : 2.07) + 0.2;
        sh.u = r2(Math.min(q.m[1] - HL, Math.max(q.m[0] + HL, sh.u)));
      }
      changed++;
    }
  }
  return changed;
}

// on its own: re-align a tram.json in place
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  const file = process.argv[2]; if (!file) throw new Error('usage: node scripts/align-platforms.mjs <tram.json>');
  const doc = JSON.parse(fs.readFileSync(file, 'utf8'));
  // a file aligned before: undo it first, so running this twice is the same as once
  for (const q of doc.platforms) if (q.aligned) {
    const nn = [-q.t[1], q.t[0]], s = -q.aligned;
    q.c = [q.c[0] + nn[0] * s, q.c[1] + nn[1] * s]; q.ring = q.ring.map((p) => [p[0] + nn[0] * s, p[1] + nn[1] * s]); delete q.aligned;
  }
  const r = alignPlatforms(doc.platforms, doc.trackLines);
  // the signalised crossings, from signals.json beside it
  const sig = JSON.parse(fs.readFileSync(new URL('signals.json', pathToFileURL(file)), 'utf8')).sites.map((q) => q.p);
  const surfAt = surfaceLookup(JSON.parse(fs.readFileSync(new URL('surfaces.json', pathToFileURL(file)), 'utf8')));
  const fit = fitPlainPlatforms(doc.platforms, doc.trackLines, surfAt, sig);
  const n = pairRamps(doc.platforms, sig);
  fs.writeFileSync(file, JSON.stringify(doc));
  console.log('platforms aligned', r.moved, '| left alone', r.skipped,  '| slabs given fittings', fit, '| ramps moved to match the facing platform', n);
}

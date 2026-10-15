/*
 * PLANTERS FOR TREES ON THE ROADWAY — a tree the city records in the road gets a planter, not bare asphalt.
 *
 * 165 of the 2,682 trees stand on the carriageway of the road surfaces (Road Carriageway, Road Arterial, Road
 * Tram Formation; the run prints the count). Their points match the City of Melbourne's Urban Forest records to
 * the centimetre (the 165 checked against the live dataset by tree id, 2026-10-16), and aerial photos show
 * such trees in the parking lane and at the road's edge (Exhibition St, La Trobe St, Flinders Ln): kerb
 * outstands and planted strips that the road-surface data does not draw. build-streetscape.mjs gives a
 * planter only to a tree on the footway, so these grew straight out of the road. This gives each one the
 * standard 1.7 m planter (CoM DS 501.04, as for a footway tree without a surveyed pit), set square to the
 * nearest footway edge (the kerb, not a tree pit cut out of the footway). The trees stay where the city records
 * them. A planter that would come within NEAR_TRACK_M of a tram track's centre (over the tram's swept width)
 * stops the run. The outstand's real outline is not on record (EST).
 *
 * Run after build-streetscape.mjs (it changes its output; a second run does nothing; the whole chain:
 * build-streetscape.mjs):
 *   node scripts/road-tree-planters.mjs public/data/streetscape
 */
import fs from 'node:fs';
import path from 'node:path';
import { surfaceLookup } from './align-platforms.mjs';

const FIX = 'road-tree-planters';
const ROAD = new Set(['Road Carriageway', 'Road Arterial', 'Road Tram Formation']);
const HALF = 0.85;   // half the standard planter's side
const NEAR_TRACK_M = 1.6 + HALF * Math.SQRT2;   // a tram's half width (1.33-1.37 m) and some, plus the planter's corner
const EDGE_STEP_M = 10;   // footway edges are filed in pieces no longer than this, by where each piece is

const dir = process.argv[2]; if (!dir) throw new Error('usage: node scripts/road-tree-planters.mjs <dir of trees.json, surfaces.json, tram.json>');
const read = (f) => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8'));
const doc = read('trees.json');
if ((doc.fixes || []).includes(FIX)) { console.log('already done'); process.exit(0); }
const surf = read('surfaces.json'), surfAt = surfaceLookup(surf), tram = read('tram.json');
const r2 = (v) => Math.round(v * 100) / 100;

const segD = (p, a, b) => {
  const dx = b[0] - a[0], dy = b[1] - a[1], L2 = dx * dx + dy * dy || 1, u = Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2));
  return Math.hypot(p[0] - a[0] - u * dx, p[1] - a[1] - u * dy);
};

// the footway's outer edges (not the pits cut out of it), in 20 m cells, for the direction of the nearest one
const edges = new Map(), key = (x, y) => `${Math.floor(x / 20)},${Math.floor(y / 20)}`;
for (const poly of surf.byType['Road Footway'] || []) {
  const ring = poly[0];
  for (let i = 0; i < ring.length - 1; i++) {
    const a = ring[i], b = ring[i + 1], L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L < 0.5) continue;
    const along = [(b[0] - a[0]) / L, (b[1] - a[1]) / L], n = Math.ceil(L / EDGE_STEP_M);
    for (let k = 0; k < n; k++) {
      const p0 = [a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n], p1 = [a[0] + (b[0] - a[0]) * (k + 1) / n, a[1] + (b[1] - a[1]) * (k + 1) / n];
      const c = key((p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2); if (!edges.has(c)) edges.set(c, []); edges.get(c).push([p0, p1, along]);
    }
  }
}
/** The direction of the nearest footway edge within about 20 m, or null. */
function nearestEdge(p) {
  let best = null, bd = Infinity;
  for (let i = -1; i <= 1; i++) for (let j = -1; j <= 1; j++) for (const [a, b, along] of edges.get(`${Math.floor(p[0] / 20) + i},${Math.floor(p[1] / 20) + j}`) || []) {
    const d = segD(p, a, b); if (d < bd) { bd = d; best = along; }
  }
  return best;
}
const trackD = (p) => { let m = Infinity; for (const l of tram.trackLines) for (let i = 0; i < l.length - 1; i++) m = Math.min(m, segD(p, l[i], l[i + 1])); return m; };

let added = 0, squareToGrid = 0;
for (const [x, y] of doc.trees) {
  if (!ROAD.has(surfAt([x, y]))) continue;
  const td = trackD([x, y]);
  if (td < NEAR_TRACK_M) throw new Error(`road-tree-planters: the tree at ${x}, ${y} is ${td.toFixed(2)} m from a tram track`);
  let ax = nearestEdge([x, y]); if (!ax) { ax = [1, 0]; squareToGrid++; }   // no footway near: square to east
  const bx = [-ax[1], ax[0]];
  const ring = [[1, 1], [-1, 1], [-1, -1], [1, -1], [1, 1]].map(([a, b]) => [r2(x + (ax[0] * a + bx[0] * b) * HALF), r2(y + (ax[1] * a + bx[1] * b) * HALF)]);
  doc.planters.push({ ring, c: [x, y], ax: ax.map((v) => +v.toFixed(5)), hl: HALF, hw: HALF, surveyed: false, seatEnds: [] });
  added++;
}
doc.fixes = [...(doc.fixes || []), FIX];
fs.writeFileSync(path.join(dir, 'trees.json'), JSON.stringify(doc));
// the manifest's count, if there is one beside it
if (fs.existsSync(path.join(dir, 'manifest.json'))) { const m = read('manifest.json'); m.counts.planters = doc.planters.length; fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(m)); }
console.log('planters added for trees on the roadway:', added, squareToGrid ? `(${squareToGrid} with no footway near, squared to east)` : '');

/*
 * ─────────────────────────────────────────────────────────────────────────
 * HOW MUCH OF THE YEAR IS THIS PIECE OF ROOF IN SHADE?
 * ─────────────────────────────────────────────────────────────────────────
 *
 * WHAT THIS FILE IS
 *   The shade test of the solar panel check. The roof a panel could go on
 *   (roofParts.ts) comes in 1 m blocks; for each block this asks, across the
 *   year, what share of the daylight hours the rest of the city (its own
 *   tower included) keeps the sun off it. A block shaded for more than a
 *   quarter of them is no place for a panel: the rule the National
 *   Construction Code uses for the same question (NCC 2025 J9D5, as worked
 *   for a Melbourne CBD tower by the ABCB).
 *
 * HOW
 *   The same skyline as a window's (skyline.ts): from the block, for each
 *   compass degree, how high the sun must be to clear everything in the way.
 *   Built once per block; then every sun position of the year is a lookup.
 *   The sun positions are the same for every block, so they are worked out
 *   once: the 21st of each month, every ten minutes while the sun is up.
 *
 *   A building far off looks the same from every block of a roof, so the
 *   skyline is built in two parts: what lies more than FAR_M away, once for
 *   each TILE_M square of a roof level (from its centre); and what lies
 *   nearer, for each block. The block's skyline is the higher of the two.
 *   From a tile's corner a far edge is seen at most a couple of degrees off,
 *   and the work drops from every block times the city to every block times
 *   its neighbours (see FAR_M for the error, measured).
 *
 * HOW MUCH IT COSTS IN ENERGY
 *   The share of daylight hours is the rule's test, but a low winter sun lost
 *   behind a tower carries little energy, and the diffuse light of the sky
 *   still reaches a block the sun does not. So each block also gets the share
 *   of the year's energy on a panel it keeps (BlockSun.energy):
 *     - the sun's direct light, sample by sample: each month's measured direct
 *       light (PVGIS, below) shared out over that month's samples in
 *       proportion to a clear sky's on the panels (a pair at 10 degrees, faced
 *       the way the layout turns it: panelLayout.ts), counted where the sun
 *       reaches the block. Only samples with the sun above MIN_ALTITUDE_DEG
 *       carry it, the same cut that leaves out buildings too far off to rise
 *       above that (possibleShaders): the month's direct light below it, under
 *       1% of the year's, is shared over the rest;
 *     - the sky's diffuse light, each month's measured, times how much of the
 *       sky the block sees (its sky view factor, from the same skyline; what
 *       lies below 2 degrees is not in the skyline, at most 0.12% of the sky).
 *   A pair's year of light barely depends on which way it is turned (the two
 *   halves make up for each other: PVGIS gives 1,600 kWh/m² east-west and
 *   1,598 north-east/south-west); which samples carry it does, for a low sun.
 *   Light reflected off the ground and other buildings is left out: at 10
 *   degrees a panel sees almost none of it.
 *
 * WHAT IT LEAVES OUT
 *   Trees, and anything on the roof the massing model does not have
 *   (parapets, plant, screens). Towers are their widest part all the way up,
 *   so shade is, if anything, overstated (see skyline.ts).
 */
import type { Massing } from '../data/model';
import { SITE } from './frame';
import { buildSkyline, sunReaches, type Skyline } from './skyline';
import { civilToInstant, solarPosition } from './solar';
import type { RoofBlock } from './roofParts';

/** Shaded for more than this share of daylight, a block is left out (NCC 2025 J9D5). */
export const SHADE_LIMIT = 0.25;
/** The test point sits this far above the roof: about where a tilted panel's face is. */
const PANEL_HEIGHT_M = 0.3;
/** Sun below this does not count as daylight a panel could use, and lets far-off towers be skipped. */
const MIN_ALTITUDE_DEG = 2;
const STEP_MIN = 10;
/** Beyond this, a part is in a roof tile's shared skyline; nearer, in each block's own. */
/*
 * Checked against building every block's skyline whole on 16 sampled roofs: at 100 m and 6 m the
 * shaded share differs by at most 1.3 points, and 0.09% of the roof area changes side of the 25%
 * line; at 50 m and 8 m it was 2.4 points and 0.24%, for two-thirds of the time.
 */
const FAR_M = 100;
const TILE_M = 6;

/** Distance from a point to a segment. */
function pointSegment(x: number, y: number, ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy || 1;
  const u = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / L));
  return Math.hypot(x - ax - u * dx, y - ay - u * dy);
}
function segmentsCross(ax: number, ay: number, bx: number, by: number, cx: number, cy: number, dx: number, dy: number): boolean {
  const o = (px: number, py: number, qx: number, qy: number, rx: number, ry: number) => Math.sign((qx - px) * (ry - py) - (qy - py) * (rx - px));
  return o(ax, ay, bx, by, cx, cy) !== o(ax, ay, bx, by, dx, dy) && o(cx, cy, dx, dy, ax, ay) !== o(cx, cy, dx, dy, bx, by);
}
/** Nearest distance from a part's outline to a box (0 when they overlap or one holds the other). */
function distanceToBox(m: Massing, [x0, y0, x1, y1]: [number, number, number, number]): number {
  const corners: [number, number][] = [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
  let best = Infinity, holdsCentre = false;
  const cx = (x0 + x1) / 2, cy = (y0 + y1) / 2;
  for (const poly of m.footprint) {
    const ring = poly[0] ?? [];
    let odd = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [ax, ay] = ring[j], [bx, by] = ring[i];
      if ((by > cy) !== (ay > cy) && cx < ((ax - bx) * (cy - by)) / (ay - by) + bx) odd = !odd;
      // a vertex in the box, or an edge crossing one of the box's sides: they overlap
      if (bx >= x0 && bx <= x1 && by >= y0 && by <= y1) return 0;
      for (let k = 0; k < 4; k++) {
        const [px, py] = corners[k], [qx, qy] = corners[(k + 1) % 4];
        if (segmentsCross(ax, ay, bx, by, px, py, qx, qy)) return 0;
        best = Math.min(best, pointSegment(px, py, ax, ay, bx, by));
      }
      const dx = Math.max(x0 - bx, 0, bx - x1), dy = Math.max(y0 - by, 0, by - y1);
      best = Math.min(best, Math.hypot(dx, dy));
    }
    if (odd) holdsCentre = true;
  }
  return holdsCentre ? 0 : best;
}

/** Nearest distance from a point to a part's outline (its outer rings). */
function distanceTo(m: Massing, x: number, y: number): number {
  let best = Infinity;
  for (const poly of m.footprint) {
    const ring = poly[0] ?? [];
    for (let i = 0; i < ring.length; i++) {
      const [ax, ay] = ring[i], [bx, by] = ring[(i + 1) % ring.length];
      const dx = bx - ax, dy = by - ay, L = dx * dx + dy * dy || 1;
      const u = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / L));
      best = Math.min(best, Math.hypot(x - ax - u * dx, y - ay - u * dy));
    }
  }
  return best;
}

/**
 * Melbourne CBD (37.8145 S, 144.9605 E), each month: global light on the level, kWh/m², and the share
 * of it that is diffuse. PVGIS 5.3 (ERA5), monthly radiation, 2010-2020 averaged; the response is in
 * ProjectDoc/solar/data/pvgis-mrcalc-melbourne-cbd-2010-2020.json.
 */
export const MONTHLY_LIGHT: readonly { globalKwhM2: number; diffuseShare: number }[] = [
  { globalKwhM2: 219.4, diffuseShare: 0.272 }, { globalKwhM2: 173.9, diffuseShare: 0.286 },
  { globalKwhM2: 147.4, diffuseShare: 0.314 }, { globalKwhM2: 97.9, diffuseShare: 0.357 },
  { globalKwhM2: 69.4, diffuseShare: 0.385 }, { globalKwhM2: 54.4, diffuseShare: 0.412 },
  { globalKwhM2: 62.1, diffuseShare: 0.403 }, { globalKwhM2: 86.3, diffuseShare: 0.375 },
  { globalKwhM2: 120.4, diffuseShare: 0.347 }, { globalKwhM2: 167.0, diffuseShare: 0.321 },
  { globalKwhM2: 188.7, diffuseShare: 0.332 }, { globalKwhM2: 218.8, diffuseShare: 0.304 },
];
/** The panels' tilt, degrees: laid east and west at 10 (useSolarCheck.ts). */
const PANEL_TILT_DEG = 10;
const DEG = Math.PI / 180;

export interface SunSample {
  altitudeDeg: number; azimuthDeg: number;
  /** The share of the year's light on an unshaded panel that comes as the sun's direct light at this sample. */
  beam: number;
}

/** A clear sky's direct light, W/m² facing the sun (Meinel, with the Kasten and Young air mass). */
function clearSkyDirect(altitudeDeg: number): number {
  const airMass = 1 / (Math.sin(altitudeDeg * DEG) + 0.50572 * (altitudeDeg + 6.07995) ** -1.6364);
  return 1353 * 0.7 ** (airMass ** 0.678);
}
/**
 * How square the sun is on a pair of panels, its two halves averaged (0 when behind both): one half
 * faces `facingDeg` (compass, 90 = due east), the other the opposite way.
 */
function onPanels({ altitudeDeg, azimuthDeg }: { altitudeDeg: number; azimuthDeg: number }, facingDeg: number): number {
  const up = Math.sin(altitudeDeg * DEG) * Math.cos(PANEL_TILT_DEG * DEG);
  const side = Math.cos(altitudeDeg * DEG) * Math.sin(PANEL_TILT_DEG * DEG);
  const one = up + side * Math.cos((azimuthDeg - facingDeg) * DEG), other = up + side * Math.cos((azimuthDeg - facingDeg - 180) * DEG);
  return (Math.max(0, one) + Math.max(0, other)) / 2;
}

/**
 * The sun's positions over a year: the 21st of each month, every ten minutes it is up; each with
 * its share of the year's light on a pair facing `facingDeg` (see the head of the file). What the
 * samples' shares leave of 1 is the sky's diffuse light (diffuseShareOf).
 */
export function annualSunSamples(year: number, facingDeg = 90): SunSample[] {
  return sunYear(year, facingDeg).samples;
}

/** The year's light on an unshaded pair facing `facingDeg`, kWh/m² of panel (worked out once for each). */
const yearLightKept = new Map<string, number>();
export function yearLight(year: number, facingDeg = 90): number {
  const key = `${year}:${facingDeg}`;
  let v = yearLightKept.get(key);
  if (v === undefined) { v = sunYear(year, facingDeg).totalKwhM2; yearLightKept.set(key, v); }
  return v;
}

function sunYear(year: number, facingDeg: number): { samples: SunSample[]; totalKwhM2: number } {
  const out: SunSample[] = [];
  let total = 0;
  for (let month = 1; month <= 12; month++) {
    const first = out.length;
    let onLevel = 0, onPanel = 0;
    for (let minutes = 4 * 60; minutes < 21 * 60; minutes += STEP_MIN) {
      const sun = solarPosition(
        civilToInstant(SITE.timeZone, year, month, 21, Math.floor(minutes / 60), minutes % 60),
        { lat: SITE.lat, lon: SITE.lon, elevationM: SITE.elevationM },
      );
      if (sun.altitudeDeg <= 0) continue;
      const dni = clearSkyDirect(sun.altitudeDeg), facing = sun.altitudeDeg >= MIN_ALTITUDE_DEG ? dni * onPanels(sun, facingDeg) : 0;
      onLevel += dni * Math.sin(sun.altitudeDeg * DEG); onPanel += dni * onPanels(sun, facingDeg);
      out.push({ altitudeDeg: sun.altitudeDeg, azimuthDeg: sun.azimuthDeg, beam: facing });
    }
    // the month's measured direct light, turned from the level onto the panels, shared out by the clear sky's
    const { globalKwhM2, diffuseShare } = MONTHLY_LIGHT[month - 1];
    const monthDirect = globalKwhM2 * (1 - diffuseShare) * (onLevel ? onPanel / onLevel : 0);
    let carried = 0;
    for (let i = first; i < out.length; i++) carried += out[i].beam;
    for (let i = first; i < out.length; i++) out[i].beam = carried ? (out[i].beam / carried) * monthDirect : 0;
    // the sky's, on a panel tilted 10 degrees: what it sees of an even sky; a month with no sample high
    // enough to carry its direct light (none at this site) counts that light as lost, not as the sky's
    total += (carried ? monthDirect : 0) + (globalKwhM2 * diffuseShare * (1 + Math.cos(PANEL_TILT_DEG * DEG))) / 2;
  }
  for (const s of out) s.beam /= total;
  return { samples: out, totalKwhM2: total };
}

/** The share of the year's light on an unshaded panel that is the sky's diffuse light. */
export function diffuseShareOf(samples: SunSample[]): number {
  return 1 - samples.reduce((t, s) => t + s.beam, 0);
}

/** How much of the sky a block sees (an even sky, on the level): 1 open, less behind buildings. */
function skyView(skyline: Skyline): number {
  let sum = 0;
  for (let k = 0; k < skyline.length; k++) { const c = Math.cos(skyline[k] * DEG); sum += c * c; }
  return sum / skyline.length;
}

/** One block's sun across the year. */
export interface BlockSun {
  /** The share of daylight samples in which it is shaded: the rule's test (SHADE_LIMIT). */
  shaded: number;
  /** The share of an unshaded panel's year of light it still gets, 0..1. */
  energy: number;
}

/**
 * The parts of the city that could shade any block of this roof: taller than its lowest level, and
 * near enough to rise above MIN_ALTITUDE_DEG from it. Cuts the skyline work to a fraction.
 */
export function possibleShaders(blocks: RoofBlock[], city: Massing[]): Massing[] {
  if (!blocks.length) return [];
  const low = Math.min(...blocks.map((b) => b.topAhdM)) + PANEL_HEIGHT_M;
  let e0 = Infinity, n0 = Infinity, e1 = -Infinity, n1 = -Infinity;
  for (const b of blocks) { e0 = Math.min(e0, b.centre[0]); n0 = Math.min(n0, b.centre[1]); e1 = Math.max(e1, b.centre[0]); n1 = Math.max(n1, b.centre[1]); }
  const tan = Math.tan((MIN_ALTITUDE_DEG * Math.PI) / 180);
  const box: [number, number, number, number] = [e0, n0, e1, n1];
  // by the nearest point of the part's outline to the roof (an edge passing close counts, not only
  // its corners), or zero when the part encloses or crosses the roof's box
  return city.filter((m) => {
    const rise = m.topAhdM - low;
    return rise > 0 && distanceToBox(m, box) <= rise / tan;
  });
}

/** The share of daylight samples in which a block is shaded (its skyline built whole: the reference the tiled one is checked against). */
export function shadedShare(block: RoofBlock, shaders: Massing[], samples: SunSample[]): BlockSun {
  return sunUnder(buildSkyline(block.centre, block.topAhdM + PANEL_HEIGHT_M, shaders), samples);
}

function sunUnder(skyline: Skyline, samples: SunSample[]): BlockSun {
  let up = 0, dark = 0, beam = 0, beamAll = 0;
  for (const sun of samples) {
    beamAll += sun.beam;
    const reaches = sunReaches(skyline, sun);
    if (reaches) beam += sun.beam;
    if (sun.altitudeDeg < MIN_ALTITUDE_DEG) continue;
    up++;
    if (!reaches) dark++;
  }
  return { shaded: up ? dark / up : 0, energy: beam + (1 - beamAll) * skyView(skyline) };
}

/** The blocks of one roof grouped by roof level and TILE_M square: the unit of work. */
export function planTiles(blocks: RoofBlock[], tileM = TILE_M): number[][] {
  const tiles = new Map<string, number[]>();
  blocks.forEach((b, i) => {
    const key = `${b.topAhdM.toFixed(1)}:${Math.floor(b.centre[0] / tileM)}:${Math.floor(b.centre[1] / tileM)}`;
    const list = tiles.get(key);
    if (list) list.push(i); else tiles.set(key, [i]);
  });
  return [...tiles.values()];
}

/** The sun of each block in one tile (in the order of `members`). */
export function shadeTile(blocks: RoofBlock[], members: number[], shaders: Massing[], samples: SunSample[], farM = FAR_M, tileM = TILE_M): BlockSun[] {
  const cx = members.reduce((t, i) => t + blocks[i].centre[0], 0) / members.length;
  const cy = members.reduce((t, i) => t + blocks[i].centre[1], 0) / members.length;
  const z = Math.min(...members.map((i) => blocks[i].topAhdM)) + PANEL_HEIGHT_M;
  const reachOut = farM + tileM;   // nearer than this to the centre: possibly within farM of a block
  const near: Massing[] = [], far: Massing[] = [];
  for (const m of shaders) (distanceTo(m, cx, cy) > reachOut ? far : near).push(m);
  const farSky = buildSkyline([cx, cy], z, far);
  return members.map((i) => {
    const b = blocks[i];
    const sky = buildSkyline(b.centre, b.topAhdM + PANEL_HEIGHT_M, near);
    for (let k = 0; k < sky.length; k++) if (farSky[k] > sky[k]) sky[k] = farSky[k];
    return sunUnder(sky, samples);
  });
}

/**
 * Every block's sun on the page's own thread, a tile at a time with a break between: the
 * fallback where workers are not available (solarWorkers.ts does the same work off the thread).
 * Reports progress (0..1); resolves to one BlockSun per block, or null when cancelled.
 */
export async function shadeBlocks(
  blocks: RoofBlock[], city: Massing[], year: number, facingDeg: number,
  onProgress: (done: number) => void, cancelled: () => boolean,
): Promise<BlockSun[] | null> {
  const samples = annualSunSamples(year, facingDeg);
  const shaders = possibleShaders(blocks, city);
  const out = new Array<BlockSun>(blocks.length);
  let done = 0, sinceBreak = 0;
  for (const members of planTiles(blocks)) {
    if (cancelled()) return null;
    shadeTile(blocks, members, shaders, samples).forEach((v, k) => { out[members[k]] = v; });
    done += members.length; sinceBreak += members.length;
    if (sinceBreak >= 40) {
      sinceBreak = 0;
      onProgress(Math.min(1, done / blocks.length));
      await new Promise<void>((resolve) => setTimeout(resolve, 0));
    }
  }
  onProgress(1);
  return out;
}

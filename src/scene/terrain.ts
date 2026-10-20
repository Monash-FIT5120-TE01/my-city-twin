/*
 * ─────────────────────────────────────────────────────────────────────────
 * THE GROUND, AT ITS REAL HEIGHT
 * ─────────────────────────────────────────────────────────────────────────
 *
 * WHAT IT REPLACES
 *   The city used to stand on one flat plane at the median of every roof
 *   plane's base — 29.5 m AHD, twelve metres above the median of the actual
 *   ground under the buildings (17.5 m). The CBD falls from about 57 m in the
 *   north to under a metre at the river, so 1,388 of 1,548 buildings were
 *   drawn sunk into the plane, some by 29 m: lower than they are, casting
 *   shorter shadows than they do (decided to fix, 2026-10-18).
 *
 * WHERE THE HEIGHTS COME FROM
 *   The building data itself. Each structure records the elevation of the
 *   ground it stands on (structureMinElevationAhdM), and the lowest roof
 *   plane's base agrees with it to within half a metre for 99.5% of them.
 *   So every building's outline is a set of points whose ground height is
 *   known: about 1,500 small patches spread over the whole city.
 *
 *   Between them — the streets, the parks — the height is interpolated on a
 *   grid, by blurring the known points (see FINE_SIGMA_M below). That is a
 *   smooth guess, not a survey: a cutting, a kerb or a ramp is not in
 *   it. It is good to the metre or two along a street between buildings, and
 *   it says nothing it does not know about a park with no building in it.
 *
 * THE GRID
 *   Ten metres a cell, over the data's extent and a margin. Asked outside the
 *   grid, the nearest edge answers: the far haze is not anywhere a height
 *   matters.
 *
 * ONE PLACE
 *   Every height on the ground — the surface drawn, the foot of a building,
 *   a tree, a person walking, a point being measured — is read from here, so
 *   they cannot disagree.
 */
import type { Massing, PolygonEN } from '../data/model';

export interface Terrain {
  /** South-west corner of the grid, east/north metres. */
  readonly minE: number;
  readonly minN: number;
  /** Metres between grid points. */
  readonly cell: number;
  readonly cols: number;
  readonly rows: number;
  /** Ground height at each grid point, metres AHD; row by row from the south. */
  readonly heights: Float32Array;
  /**
   * One number for what still needs one: the median ground under the
   * buildings. Not a height to stand anything on.
   */
  readonly reference: number;
}

const CELL_M = 10;
const MARGIN_M = 400;
/*
 * Interpolation by blurring (normalised convolution): the known heights are gathered onto the grid, and
 * both they and how many fell in each cell are blurred with a Gaussian; their ratio is the ground. Two
 * blurs: a wide one for the lie of the land (the fall from Flagstaff to the river), and a narrow one for
 * the rise and fall street by street, which gives way to the wide one where there are no buildings near.
 * A blur cannot make a step, a terrace or a cliff, so the ground comes out as smooth as the real one: the
 * first version, interpolating the nearest few buildings, made a terrace of every building and a cliff
 * where its search ran out (slopes up to 150%; 2026-10-18).
 */
const FINE_SIGMA_M = 70;
const WIDE_SIGMA_M = 300;
/** Out where even the wide blur has nothing (the far haze): wider still, so the edge does not drop away. */
const FAR_SIGMA_M = 900;
/** How much a cell must have of the narrow blur's data before it outweighs the wide one (in cells' worth). */
const FINE_TRUST = 0.6;
/** Points along an outline, at most this far apart, so a long building speaks along its length. */
const OUTLINE_STEP_M = 15;

interface Known {
  e: number;
  n: number;
  h: number;
}

/**
 * A building whose recorded ground is this far from its neighbours' is not used to shape the ground:
 * a record taken from a deck over the railway, or simply wrong, would otherwise raise a mound or sink
 * a pit across the street around it. The building itself still stands where its record says.
 */
const OUTLIER_M = 8;
/** How many neighbouring buildings that judgement asks. */
const OUTLIER_NEIGHBOURS = 6;

function centreOf(part: Massing): [number, number] {
  const ring = part.footprint[0]?.[0] ?? [[0, 0]];
  let e = 0;
  let n = 0;
  for (const [x, y] of ring) {
    e += x;
    n += y;
  }
  return [e / ring.length, n / ring.length];
}

/** The ground under each building: its lowest part's base, at points round that part's outline. */
function knownPoints(buildings: readonly Massing[]): Known[] {
  const lowest = new Map<string, Massing>();
  for (const b of buildings) {
    const seen = lowest.get(b.parentId);
    if (!seen || b.baseAhdM < seen.baseAhdM) lowest.set(b.parentId, b);
  }
  // each building against the median ground of its nearest few: far off, and it is left out
  const parts = [...lowest.values()];
  const centres = parts.map(centreOf);
  const CELL = 100;
  const grid = new Map<number, number[]>();
  const keyOf = (c: number, r: number) => c * 100003 + r;
  centres.forEach(([e, n], i) => {
    const k = keyOf(Math.floor(e / CELL), Math.floor(n / CELL));
    const list = grid.get(k);
    if (list) list.push(i);
    else grid.set(k, [i]);
  });
  const trusted = parts.filter((part, i) => {
    const [e, n] = centres[i];
    const c0 = Math.floor(e / CELL);
    const r0 = Math.floor(n / CELL);
    let near: { d: number; h: number }[] = [];
    for (let reach = 1; reach <= 5 && near.length < OUTLIER_NEIGHBOURS; reach++) {
      near = [];
      for (let c = c0 - reach; c <= c0 + reach; c++) {
        for (let r = r0 - reach; r <= r0 + reach; r++) {
          for (const j of grid.get(keyOf(c, r)) ?? []) {
            if (j !== i) near.push({ d: (centres[j][0] - e) ** 2 + (centres[j][1] - n) ** 2, h: parts[j].baseAhdM });
          }
        }
      }
    }
    if (near.length < 3) return true;
    const hs = near
      .sort((x, y) => x.d - y.d)
      .slice(0, OUTLIER_NEIGHBOURS)
      .map((x) => x.h)
      .sort((x, y) => x - y);
    return Math.abs(part.baseAhdM - hs[Math.floor(hs.length / 2)]) <= OUTLIER_M;
  });
  const out: Known[] = [];
  for (const part of trusted) {
    const h = part.baseAhdM;
    for (const polygon of part.footprint) {
      const ring = polygon[0];
      if (!ring || ring.length < 3) continue;
      let ce = 0;
      let cn = 0;
      for (let i = 0; i < ring.length; i++) {
        const [e0, n0] = ring[i];
        const [e1, n1] = ring[(i + 1) % ring.length];
        ce += e0;
        cn += n0;
        const len = Math.hypot(e1 - e0, n1 - n0);
        const steps = Math.max(1, Math.ceil(len / OUTLINE_STEP_M));
        for (let s = 0; s < steps; s++) out.push({ e: e0 + ((e1 - e0) * s) / steps, n: n0 + ((n1 - n0) * s) / steps, h });
      }
      out.push({ e: ce / ring.length, n: cn / ring.length, h });
    }
  }
  return out;
}

/**
 * The ground for a city, from its buildings.
 *
 * @param buildings every building part (the city as stored: a proposal does not move the ground)
 * @param extent    the area to cover; a margin is added round it
 */
export function buildTerrain(
  buildings: readonly Massing[],
  extent: { minE: number; minN: number; maxE: number; maxN: number },
): Terrain {
  const known = knownPoints(buildings);
  const lows = new Map<string, number>();
  for (const b of buildings) lows.set(b.parentId, Math.min(lows.get(b.parentId) ?? Infinity, b.baseAhdM));
  const sortedLows = [...lows.values()].sort((a, b) => a - b);
  const reference = sortedLows.length ? sortedLows[Math.floor(sortedLows.length / 2)] : 0;

  const minE = Math.floor((extent.minE - MARGIN_M) / CELL_M) * CELL_M;
  const minN = Math.floor((extent.minN - MARGIN_M) / CELL_M) * CELL_M;
  const cols = Math.ceil((extent.maxE + MARGIN_M - minE) / CELL_M) + 1;
  const rows = Math.ceil((extent.maxN + MARGIN_M - minN) / CELL_M) + 1;
  const heights = new Float32Array(cols * rows);
  if (known.length === 0) {
    heights.fill(reference);
    return { minE, minN, cell: CELL_M, cols, rows, heights, reference };
  }

  // the known heights gathered onto the grid: a sum and a count per cell
  const sum = new Float64Array(cols * rows);
  const count = new Float64Array(cols * rows);
  for (const k of known) {
    const c = Math.round((k.e - minE) / CELL_M);
    const r = Math.round((k.n - minN) / CELL_M);
    if (c < 0 || r < 0 || c >= cols || r >= rows) continue;
    sum[r * cols + c] += k.h;
    count[r * cols + c] += 1;
  }
  const fineSum = blur(sum, cols, rows, FINE_SIGMA_M / CELL_M);
  const fineCount = blur(count, cols, rows, FINE_SIGMA_M / CELL_M);
  const wideSum = blur(sum, cols, rows, WIDE_SIGMA_M / CELL_M);
  const wideCount = blur(count, cols, rows, WIDE_SIGMA_M / CELL_M);
  const farSum = blur(sum, cols, rows, FAR_SIGMA_M / CELL_M);
  const farCount = blur(count, cols, rows, FAR_SIGMA_M / CELL_M);
  for (let i = 0; i < heights.length; i++) {
    const far = farCount[i] > 1e-12 ? farSum[i] / farCount[i] : reference;
    const ww = wideCount[i] / (wideCount[i] + FINE_TRUST * 0.1);
    const wide = wideCount[i] > 1e-12 ? ww * (wideSum[i] / wideCount[i]) + (1 - ww) * far : far;
    // the narrow blur where it has data enough; the wide one filling in as it thins out
    const w = fineCount[i] / (fineCount[i] + FINE_TRUST);
    const fine = fineCount[i] > 1e-12 ? fineSum[i] / fineCount[i] : wide;
    heights[i] = w * fine + (1 - w) * wide;
  }
  return { minE, minN, cell: CELL_M, cols, rows, heights, reference };
}

/** A separable Gaussian blur of a grid, `sigma` in cells; beyond the edge counts as empty. */
function blur(src: Float64Array, cols: number, rows: number, sigma: number): Float64Array {
  const radius = Math.ceil(sigma * 3);
  const kernel = new Float64Array(radius * 2 + 1);
  for (let i = -radius; i <= radius; i++) kernel[i + radius] = Math.exp(-(i * i) / (2 * sigma * sigma));
  const across = new Float64Array(src.length);
  for (let r = 0; r < rows; r++) {
    const row = r * cols;
    for (let c = 0; c < cols; c++) {
      let acc = 0;
      const lo = Math.max(0, c - radius);
      const hi = Math.min(cols - 1, c + radius);
      for (let k = lo; k <= hi; k++) acc += src[row + k] * kernel[k - c + radius];
      across[row + c] = acc;
    }
  }
  const out = new Float64Array(src.length);
  for (let c = 0; c < cols; c++) {
    for (let r = 0; r < rows; r++) {
      let acc = 0;
      const lo = Math.max(0, r - radius);
      const hi = Math.min(rows - 1, r + radius);
      for (let k = lo; k <= hi; k++) acc += across[k * cols + c] * kernel[k - r + radius];
      out[r * cols + c] = acc;
    }
  }
  return out;
}

/**
 * The ground height here, metres AHD. Between grid points, on the same two triangles per cell the drawn
 * ground has (Ground.tsx: split corner to corner from south-west to north-east), so whatever is laid on
 * the ground at any point (drape.ts, onGround.ts) is exactly on the surface drawn there, not a few
 * centimetres under it where a bilinear patch and two flat triangles part company.
 */
export function heightAt(t: Terrain, e: number, n: number): number {
  const x = Math.min(Math.max((e - t.minE) / t.cell, 0), t.cols - 1);
  const y = Math.min(Math.max((n - t.minN) / t.cell, 0), t.rows - 1);
  const c0 = Math.min(Math.floor(x), t.cols - 2);
  const r0 = Math.min(Math.floor(y), t.rows - 2);
  const fx = x - c0;
  const fy = y - r0;
  const i = r0 * t.cols + c0;
  const h = t.heights;
  const h00 = h[i];
  const h10 = h[i + 1];
  const h01 = h[i + t.cols];
  const h11 = h[i + t.cols + 1];
  // below the diagonal: (0,0) (1,0) (1,1); above it: (0,0) (1,1) (0,1)
  return fx >= fy ? h00 + fx * (h10 - h00) + fy * (h11 - h10) : h00 + fy * (h01 - h00) + fx * (h11 - h01);
}

/** The highest ground under an outline (the uphill side of a building on a slope). */
export function highestUnder(t: Terrain, footprint: readonly PolygonEN[]): number {
  let high = -Infinity;
  for (const polygon of footprint) {
    const ring = polygon[0];
    if (!ring) continue;
    for (let i = 0; i < ring.length; i++) {
      const [e0, n0] = ring[i];
      const [e1, n1] = ring[(i + 1) % ring.length];
      const steps = Math.max(1, Math.ceil(Math.hypot(e1 - e0, n1 - n0) / t.cell));
      for (let s = 0; s < steps; s++) {
        high = Math.max(high, heightAt(t, e0 + ((e1 - e0) * s) / steps, n0 + ((n1 - n0) * s) / steps));
      }
    }
  }
  return Number.isFinite(high) ? high : t.reference;
}

/**
 * The lowest ground under an outline: where a building's walls have to reach down to so that no gap
 * shows under any side of it on a slope. Read at the outline's corners and along its edges.
 */
export function lowestUnder(t: Terrain, footprint: readonly PolygonEN[]): number {
  let low = Infinity;
  for (const polygon of footprint) {
    const ring = polygon[0];
    if (!ring) continue;
    for (let i = 0; i < ring.length; i++) {
      const [e0, n0] = ring[i];
      const [e1, n1] = ring[(i + 1) % ring.length];
      const steps = Math.max(1, Math.ceil(Math.hypot(e1 - e0, n1 - n0) / t.cell));
      for (let s = 0; s < steps; s++) {
        low = Math.min(low, heightAt(t, e0 + ((e1 - e0) * s) / steps, n0 + ((n1 - n0) * s) / steps));
      }
    }
  }
  return Number.isFinite(low) ? low : t.reference;
}

/**
 * Where a building's ground floor is, metres AHD: its recorded base, but never below the lowest ground
 * drawn round it. The ground is smoothed (a few metres off a building's own record here and there), and a
 * ground floor under the visible street is the mistake this replaced (facades.ts groundFloorAhdM).
 */
export function buildingGroundAhdM(parts: readonly Massing[], t: Terrain): number {
  const base = Math.min(...parts.map((p) => p.baseAhdM));
  const low = Math.min(...parts.map((p) => lowestUnder(t, p.footprint)));
  return Math.max(base, low);
}

/** The ground, as everything that stands on it is given it: a terrain, or (still, in places) one flat height. */
export type Ground = Terrain | number;

export function groundAt(g: Ground, e: number, n: number): number {
  return typeof g === 'number' ? g : heightAt(g, e, n);
}

export function groundUnder(g: Ground, footprint: readonly PolygonEN[]): number {
  return typeof g === 'number' ? g : lowestUnder(g, footprint);
}

/* One terrain per city model: worked out once, wherever it is first asked for. */
const cache = new WeakMap<object, Terrain>();

export function terrainOf(model: {
  buildings: readonly Massing[];
  extent: { minE: number; minN: number; maxE: number; maxN: number };
}): Terrain {
  let t = cache.get(model.buildings);
  if (!t) {
    t = buildTerrain(model.buildings, model.extent);
    cache.set(model.buildings, t);
  }
  return t;
}

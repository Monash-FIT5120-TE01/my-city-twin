/*
 * WHERE A SOLAR PANEL COULD GO ON A ROOF (for the development check, RoofCheck.tsx)
 *
 * For one building (or one planned development) at a time:
 *   1. Its parts are drawn onto a 0.25 m grid turned to the building's own
 *      long side, each cell taking the highest part over it: that is the
 *      roof seen from above.
 *   2. Small parts standing on a bigger one are taken to be plant rooms and
 *      lift overruns, not roof: under 15% of the area of the part they stand
 *      on, and no more than 8 m tall.
 *   3. On each roof level, only the cells a whole panel (1.134 x 1.762 m,
 *      either way round) can cover without leaving that level are kept: a
 *      strip narrower than a panel cannot take one.
 *   4. Balconies and terraces are left out: on any level below the main
 *      roof with more of the building (not a plant room) rising more than a
 *      storey above it, every part of the roof no TERRACE_M square can cover.
 *      Balconies are at least 1.8-2.4 m deep (Clause 58.05-3, Table 1); what
 *      is wider is the roof of a podium or a setback and stays. A ledge that
 *      widens at a corner keeps only the corner (and step 5 may then drop it).
 *      And a step with other steps within STACK_M both above and below it is
 *      one of a run of storeys each set back from the last: every one of
 *      them is a terrace off the floor above, and the whole level goes. (Whether the level's parts
 *      stand on the ground cannot tell them apart: some buildings are drawn
 *      as one block per storey, every one of them from the ground up.)
 *   5. Pieces left smaller than MIN_PIECE_M2 are dropped.
 * The result is a set of rectangles, back in east/north metres, with the
 * height of the roof they lie on.
 */
import type { Massing } from '../data/model';

const PLANT_SHARE = 0.15, PLANT_MAX_M = 8, SAME_LEVEL_M = 0.6;
/** One panel, as installed on Melbourne apartment roofs (ProjectDoc/solar/references/installed-systems.md). */
export const PANEL_M: [number, number] = [1.134, 1.762];
/** A piece of roof smaller than this is not worth a panel or two (ABCB's worked example drops a 2-panel lift roof). */
export const MIN_PIECE_M2 = 10;
const CELL_M = 0.25;
/** More of the building rising this far above a level makes it a step in the tower, not a roof (about a storey). */
const STOREY_M = 3;
/** A part whose base is within this of the building's lowest stands on the ground. */
const ON_GROUND_M = 1.5;
/** A piece of a step in the tower no square this wide fits in is a balcony or terrace. */
export const TERRACE_M = 3;
/** Steps this close above and below make a level one of a run of set-back storeys. */
const STACK_M = 4.5;

/** The rules' settings, all defaulting to the values above (varied only to test how much the result depends on them). */
export interface RoofOptions {
  cellM: number; plantShare: number; plantMaxM: number; terraceM: number; stackM: number; storeyM: number; minPieceM2: number;
  /** Turn the grid this much from the building's long side (rad), and shift its origin (m): a test of grid placement. */
  turn: number; shift: number;
  /** Keep every level whole: no balcony or terrace rules. */
  keepSteps: boolean;
  /** Also return what was taken out, and why (for checking the rules against imagery). */
  debug: boolean;
  /**
   * Also group the roof kept into square blocks this wide (m), each with its centre and area, and tag
   * every piece with its block: the units the shade test works in (solarShade.ts). 0: no blocks.
   */
  blockM: number;
}
export const ROOF_DEFAULTS: RoofOptions = {
  cellM: CELL_M, plantShare: PLANT_SHARE, plantMaxM: PLANT_MAX_M, terraceM: TERRACE_M, stackM: STACK_M, storeyM: STOREY_M,
  minPieceM2: MIN_PIECE_M2, turn: 0, shift: 0, keepSteps: false, debug: false, blockM: 0,
};

// read once, when the page loads: the app rewrites the address to its own state soon after
const ROOF_CHECK = import.meta.env.DEV && typeof location !== 'undefined' && new URLSearchParams(location.search).has('roofs');
export const roofCheckOn = (): boolean => ROOF_CHECK;

type Box = [number, number, number, number];
function boxOf(m: Massing): Box {
  const b: Box = [Infinity, Infinity, -Infinity, -Infinity];
  for (const poly of m.footprint) for (const [x, y] of poly[0] ?? []) {
    b[0] = Math.min(b[0], x); b[1] = Math.min(b[1], y); b[2] = Math.max(b[2], x); b[3] = Math.max(b[3], y);
  }
  return b;
}
const overlap = (a: Box, b: Box) => a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];

/** Is (x, y) inside the outer ring of one of a part's polygons? (even-odd) */
function inside(m: Massing, x: number, y: number): boolean {
  for (const poly of m.footprint) {
    const ring = poly[0] ?? [];
    let odd = false;
    for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
      const [xi, yi] = ring[i], [xj, yj] = ring[j];
      if ((yi > y) !== (yj > y) && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) odd = !odd;
    }
    if (odd) return true;
  }
  return false;
}
function crosses(a: [number, number], b: [number, number], c: [number, number], d: [number, number]): boolean {
  const o = (p: [number, number], q: [number, number], r: [number, number]) => Math.sign((q[0] - p[0]) * (r[1] - p[1]) - (q[1] - p[1]) * (r[0] - p[0]));
  return o(a, b, c) !== o(a, b, d) && o(c, d, a) !== o(c, d, b);
}
/**
 * Do two parts' footprints overlap (share area, one inside the other, or edges crossing)? Their
 * boxes overlapping is not enough: an L-shaped wing's box covers a tower it does not touch.
 */
function touches(a: Massing, b: Massing, boxA: Box, boxB: Box): boolean {
  if (!overlap(boxA, boxB)) return false;
  const ringsA = a.footprint.map((poly) => poly[0] ?? []), ringsB = b.footprint.map((poly) => poly[0] ?? []);
  for (const r of ringsA) for (const [x, y] of r) if (inside(b, x, y)) return true;
  for (const r of ringsB) for (const [x, y] of r) if (inside(a, x, y)) return true;
  for (const ra of ringsA) for (let i = 0; i < ra.length; i++) for (const rb of ringsB) for (let j = 0; j < rb.length; j++) {
    if (crosses(ra[i] as [number, number], ra[(i + 1) % ra.length] as [number, number], rb[j] as [number, number], rb[(j + 1) % rb.length] as [number, number])) return true;
  }
  return false;
}

/** The parts of one building taken to be plant rooms: small, short, and standing on a bigger part. */
function plantOf(parts: Massing[], share: number, maxM: number): Set<Massing> {
  const plant = new Set<Massing>();
  if (parts.length < 2) return plant;
  const boxes = new Map(parts.map((p) => [p, boxOf(p)]));
  for (const q of parts) {
    const under = parts.filter((r) => r !== q && Math.abs(r.topAhdM - q.baseAhdM) < SAME_LEVEL_M && touches(r, q, boxes.get(r)!, boxes.get(q)!));
    if (!under.length) continue;
    const biggest = Math.max(...under.map((r) => r.areaM2));
    if (q.areaM2 < share * biggest && q.heightM <= maxM) plant.add(q);
  }
  return plant;
}

/** The direction of the longest edge of the biggest part: the grid is laid along it. */
function angleOf(parts: Massing[]): number {
  const big = parts.reduce((a, b) => (b.areaM2 > a.areaM2 ? b : a));
  let best = 0, angle = 0;
  for (const poly of big.footprint) {
    const ring = poly[0] ?? [];
    for (let i = 0; i < ring.length; i++) {
      const [x0, y0] = ring[i], [x1, y1] = ring[(i + 1) % ring.length];
      const len = Math.hypot(x1 - x0, y1 - y0);
      if (len > best) { best = len; angle = Math.atan2(y1 - y0, x1 - x0); }
    }
  }
  return angle;
}

/** A rectangle of roof a panel can go on: corners in east/north metres, and the roof's height (m AHD). */
export interface RoofPiece { corners: [number, number][]; topAhdM: number; /** with options.blockM: index into RoofResult.blocks */ block?: number }
/** A square of roof kept, for the shade test: where its kept cells are centred, its roof height, and how much of it is kept. */
export interface RoofBlock {
  /** The sample point: a kept cell's centre (east, north). */
  centre: [number, number];
  /** The highest roof under the block (m AHD), and how much of the block is kept (m²). */
  topAhdM: number; areaM2: number;
  /** Which roof level (index) and which block of the grid: blocks on one level whose cells differ by 1 are neighbours. */
  level: number; cell: [number, number];
}
/** Where a level sits in its building: the main roof, a lower roof with nothing rising over it, a lower roof standing on the ground with more of the building rising over it, or a step partway up the tower. */
export type LevelKind = 'main' | 'podium' | 'podium-under' | 'step';
/** One connected piece of roof a panel can go on, before the small ones are dropped. */
export interface RoofComponent { areaM2: number; kind: LevelKind; kept: boolean }
/**
 * The grid the roof was found on (with options.blockM), for laying panels out on it: turned by `angle`
 * (radians, east towards north) to the building, cell (i, j) spanning u0 + i·cellM and v0 + j·cellM in
 * the turned frame (u along `angle`, v square to it). Per cell: which roof level it belongs to (-1 none),
 * which block of RoofResult.blocks keeps it (-1 not kept), and the highest roof over it (m AHD).
 */
export interface RoofGrid {
  angle: number; u0: number; v0: number; cellM: number; nx: number; ny: number;
  level: Int16Array; block: Int32Array; top: Float32Array;
}
export interface RoofResult {
  pieces: RoofPiece[]; areaM2: number; components: RoofComponent[];
  /** With options.blockM: the grid, cell by cell. */
  grid?: RoofGrid;
  /** Where the roof went, m²: the open roof seen from above, plant rooms' tops, strips too narrow for a panel, balconies and terraces, pieces too small. */
  openM2: number; plantM2: number; narrowM2: number; terraceM2: number; smallM2: number;
  /** With options.blockM: the roof kept, in blocks. */
  blocks?: RoofBlock[];
  /** With options.debug: the roof taken out, as rectangles, with the reason. */
  dropped?: (RoofPiece & { reason: 'plant' | 'narrow' | 'terrace' | 'small' })[];
}

/** Count of cells set in each window of w x h cells, by a summed-area table. */
function windowsFull(mask: Uint8Array, nx: number, ny: number, w: number, h: number): Uint8Array {
  const S = new Int32Array((nx + 1) * (ny + 1));
  for (let j = 0; j < ny; j++) {
    let row = 0;
    for (let i = 0; i < nx; i++) { row += mask[j * nx + i]; S[(j + 1) * (nx + 1) + i + 1] = S[j * (nx + 1) + i + 1] + row; }
  }
  // an anchor: the window whose lower-left cell is (i, j) lies wholly on the mask
  const anchor = new Uint8Array(nx * ny);
  for (let j = 0; j + h <= ny; j++) for (let i = 0; i + w <= nx; i++) {
    const s = S[(j + h) * (nx + 1) + i + w] - S[j * (nx + 1) + i + w] - S[(j + h) * (nx + 1) + i] + S[j * (nx + 1) + i];
    if (s === w * h) anchor[j * nx + i] = 1;
  }
  // a cell is kept when some anchored window covers it
  const A = new Int32Array((nx + 1) * (ny + 1));
  for (let j = 0; j < ny; j++) {
    let row = 0;
    for (let i = 0; i < nx; i++) { row += anchor[j * nx + i]; A[(j + 1) * (nx + 1) + i + 1] = A[j * (nx + 1) + i + 1] + row; }
  }
  const out = new Uint8Array(nx * ny);
  for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) {
    const i0 = Math.max(0, i - w + 1), j0 = Math.max(0, j - h + 1);
    const s = A[(j + 1) * (nx + 1) + i + 1] - A[j0 * (nx + 1) + i + 1] - A[(j + 1) * (nx + 1) + i0] + A[j0 * (nx + 1) + i0];
    if (s > 0) out[j * nx + i] = 1;
  }
  return out;
}

/** The roof of one building (all its parts) a panel can go on. */
export function usableRoof(parts: Massing[], options: Partial<RoofOptions> = {}): RoofResult {
  const o = { ...ROOF_DEFAULTS, ...options };
  const CELL = o.cellM, keepSteps = o.keepSteps;
  const result: RoofResult = { pieces: [], areaM2: 0, components: [], openM2: 0, plantM2: 0, narrowM2: 0, terraceM2: 0, smallM2: 0 };
  if (!parts.length) return result;
  const plant = plantOf(parts, o.plantShare, o.plantMaxM);
  const a = angleOf(parts) + o.turn, c = Math.cos(a), s = Math.sin(a);
  const toU = (x: number, y: number): [number, number] => [x * c + y * s, -x * s + y * c];
  const toEN = (u: number, v: number): [number, number] => [u * c - v * s, u * s + v * c];
  // the parts' outlines turned to the grid
  const rings = parts.map((p) => p.footprint.map((poly) => poly.map((ring) => ring.map(([x, y]) => toU(x, y)))));
  let u0 = Infinity, v0 = Infinity, u1 = -Infinity, v1 = -Infinity;
  for (const polys of rings) for (const poly of polys) for (const ring of poly) for (const [u, v] of ring) {
    u0 = Math.min(u0, u); v0 = Math.min(v0, v); u1 = Math.max(u1, u); v1 = Math.max(v1, v);
  }
  if (!isFinite(u0)) return result;
  u0 -= o.shift; v0 -= o.shift;
  const nx = Math.ceil((u1 - u0) / CELL) + 1, ny = Math.ceil((v1 - v0) / CELL) + 1;
  if (nx * ny > 6e6) return result;   // nothing in the city is near this big; a bad outline is skipped rather than allocated
  // the highest part over each cell (index into parts, -1 for none)
  const top = new Float32Array(nx * ny).fill(-Infinity), owner = new Int16Array(nx * ny).fill(-1);
  const xs: number[] = [];
  parts.forEach((p, k) => {
    for (const poly of rings[k]) {
      // even-odd scanline fill of the polygon with its holes, at cell centres
      for (let j = 0; j < ny; j++) {
        const v = v0 + (j + 0.5) * CELL;
        xs.length = 0;
        for (const ring of poly) for (let i = 0, n = ring.length; i < n; i++) {
          const [ua, va] = ring[i], [ub, vb] = ring[(i + 1) % n];
          if ((va <= v) !== (vb <= v)) xs.push(ua + ((v - va) / (vb - va)) * (ub - ua));
        }
        xs.sort((x, y) => x - y);
        for (let q = 0; q + 1 < xs.length; q += 2) {
          const i0 = Math.max(0, Math.ceil((xs[q] - u0) / CELL - 0.5)), i1 = Math.min(nx - 1, Math.floor((xs[q + 1] - u0) / CELL - 0.5));
          for (let i = i0; i <= i1; i++) {
            const at = j * nx + i;
            if (p.topAhdM > top[at]) { top[at] = p.topAhdM; owner[at] = k; }
          }
        }
      }
    }
  });
  const cellM2 = CELL * CELL;
  for (let at = 0; at < nx * ny; at++) if (owner[at] >= 0) { result.openM2 += cellM2; if (plant.has(parts[owner[at]])) result.plantM2 += cellM2; }
  // the roof levels, plant rooms left out
  const levels: number[] = [];
  for (const p of parts) if (!plant.has(p) && !levels.some((l) => Math.abs(l - p.topAhdM) < SAME_LEVEL_M)) levels.push(p.topAhdM);
  const ground = Math.min(...parts.map((p) => p.baseAhdM));
  const mainTop = Math.max(...parts.filter((p) => !plant.has(p)).map((p) => p.topAhdM));
  // which parts touch which (footprints overlapping): the terrace rules look only at a level's own stack
  const boxes = parts.map(boxOf);
  const near = parts.map((pa, ia) => parts.map((pb, ib) => ia === ib || touches(pa, pb, boxes[ia], boxes[ib])));
  const partsAt = (level: number) => parts.map((_, k) => k).filter((k) => !plant.has(parts[k]) && Math.abs(parts[k].topAhdM - level) < SAME_LEVEL_M);
  /** A part (not plant) touching one of these parts, whose top passes the test. */
  const touching = (here: number[], test: (top: number) => boolean) =>
    parts.some((p, k) => !plant.has(p) && test(p.topAhdM) && here.some((h) => near[h][k]));
  const kindOf = (level: number): LevelKind => {
    if (Math.abs(level - mainTop) < SAME_LEVEL_M) return 'main';
    const here = partsAt(level);
    const rising = touching(here, (t) => t > level + o.storeyM);
    const onGround = here.some((k) => parts[k].baseAhdM - ground < ON_GROUND_M);
    return !rising ? 'podium' : onGround ? 'podium-under' : 'step';
  };
  // each cell belongs to exactly one level: the nearest (two levels can both lie within SAME_LEVEL_M of a top)
  const cellLevel = new Int16Array(nx * ny).fill(-1);
  for (let at = 0; at < nx * ny; at++) {
    const k = owner[at]; if (k < 0 || plant.has(parts[k])) continue;
    let best = -1, d = Infinity;
    levels.forEach((l, li) => { const e = Math.abs(top[at] - l); if (e < d) { d = e; best = li; } });
    cellLevel[at] = best;
  }
  if (o.debug) result.dropped = [];
  const keptBlock = o.blockM ? new Int32Array(nx * ny).fill(-1) : null;
  if (o.blockM) result.blocks = [];
  const emit = (m: Uint8Array, level: number, reason?: 'plant' | 'narrow' | 'terrace' | 'small') => {
    for (let j = 0; j < ny; j++) {
      let i = 0;
      while (i < nx) {
        if (!m[j * nx + i]) { i++; continue; }
        const i0 = i, z = Number.isFinite(top[j * nx + i]) ? top[j * nx + i] : level;
        while (i < nx && m[j * nx + i] && (top[j * nx + i] === z || !Number.isFinite(top[j * nx + i]))) i++;
        const ua = u0 + i0 * CELL, ub = u0 + i * CELL, va = v0 + j * CELL, vb = va + CELL;
        const piece = { corners: [toEN(ua, va), toEN(ub, va), toEN(ub, vb), toEN(ua, vb)], topAhdM: z };
        if (reason) result.dropped!.push({ ...piece, reason }); else { result.pieces.push(piece); result.areaM2 += (i - i0) * CELL * CELL; }
      }
    }
  };
  if (o.debug) {
    const pm = new Uint8Array(nx * ny);
    for (let at = 0; at < nx * ny; at++) if (owner[at] >= 0 && plant.has(parts[owner[at]])) pm[at] = 1;
    emit(pm, mainTop, 'plant');
  }
  // rounded up, so a strip passes only if its cells are at least a panel long (1.762 m takes 8 cells of 0.25 m, not 7)
  const pw = Math.ceil(PANEL_M[0] / CELL - 1e-9), ph = Math.ceil(PANEL_M[1] / CELL - 1e-9);
  const minCells = o.minPieceM2 / (CELL * CELL);
  levels.forEach((level, li) => {
    const kind = kindOf(level);
    const here = partsAt(level);
    const stacked = kind === 'step'
      && touching(here, (t) => t > level + SAME_LEVEL_M && t <= level + o.stackM)
      && touching(here, (t) => t < level - SAME_LEVEL_M && t >= level - o.stackM);
    if (stacked && !keepSteps) {
      // measured as cells below, and dropped
      const tm = new Uint8Array(nx * ny);
      for (let at = 0; at < nx * ny; at++) if (cellLevel[at] === li) { result.terraceM2 += CELL * CELL; tm[at] = 1; }
      if (o.debug) emit(tm, level, 'terrace');
      return;
    }
    const mask = new Uint8Array(nx * ny);
    let any = false;
    for (let at = 0; at < nx * ny; at++) {
      if (cellLevel[at] === li) { mask[at] = 1; any = true; }
    }
    if (!any) return;
    const a1 = windowsFull(mask, nx, ny, pw, ph), a2 = windowsFull(mask, nx, ny, ph, pw);
    const keep = new Uint8Array(nx * ny);
    const nm = o.debug ? new Uint8Array(nx * ny) : null;
    for (let at = 0; at < nx * ny; at++) { keep[at] = a1[at] | a2[at]; if (mask[at] && !keep[at]) { result.narrowM2 += cellM2; if (nm) nm[at] = 1; } }
    if (nm) emit(nm, level, 'narrow');
    // below the main roof with more of the building over it: only what a terrace-wide square covers
    if ((kind === 'step' || kind === 'podium-under') && !keepSteps) {
      const t = Math.round(o.terraceM / CELL), wide = windowsFull(keep, nx, ny, t, t);
      const tm = o.debug ? new Uint8Array(nx * ny) : null;
      for (let at = 0; at < nx * ny; at++) if (keep[at] && !wide[at]) { keep[at] = 0; result.terraceM2 += CELL * CELL; if (tm) tm[at] = 1; }
      if (tm) emit(tm, level, 'terrace');
    }
    // pieces too small to bother with
    const seen = new Uint8Array(nx * ny), stack: number[] = [];
    for (let start = 0; start < nx * ny; start++) {
      if (!keep[start] || seen[start]) continue;
      const cells: number[] = []; stack.push(start); seen[start] = 1;
      while (stack.length) {
        const at = stack.pop()!; cells.push(at);
        const i = at % nx, j = (at - i) / nx;
        for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const ii = i + di, jj = j + dj;
          if (ii < 0 || jj < 0 || ii >= nx || jj >= ny) continue;
          const nb = jj * nx + ii;
          if (keep[nb] && !seen[nb]) { seen[nb] = 1; stack.push(nb); }
        }
      }
      const kept = cells.length >= minCells;
      result.components.push({ areaM2: cells.length * CELL * CELL, kind, kept });
      if (!kept) {
        for (const at of cells) keep[at] = 0; result.smallM2 += cells.length * cellM2;
        if (o.debug) { const sm = new Uint8Array(nx * ny); for (const at of cells) sm[at] = 1; emit(sm, level, 'small'); }
      }
    }
    // runs along each row, as rectangles
    if (!o.blockM) { emit(keep, level); return; }
    // the same, cut at block edges, each run tagged with its block
    const k = Math.max(1, Math.round(o.blockM / CELL)), index = new Map<number, number>();
    const cellsOf: { u: number; v: number }[][] = [];
    const blockOf = (i: number, j: number) => {
      const key = Math.floor(j / k) * 1e6 + Math.floor(i / k);
      let b = index.get(key);
      if (b === undefined) {
        b = result.blocks!.length; index.set(key, b);
        result.blocks!.push({ centre: [0, 0], topAhdM: -Infinity, areaM2: 0, level: li, cell: [Math.floor(i / k), Math.floor(j / k)] });
        cellsOf[b] = [];
      }
      return b;
    };
    for (let j = 0; j < ny; j++) {
      let i = 0;
      while (i < nx) {
        if (!keep[j * nx + i]) { i++; continue; }
        const i0 = i, b = blockOf(i, j), z = top[j * nx + i];
        while (i < nx && keep[j * nx + i] && Math.floor(i / k) === Math.floor(i0 / k) && top[j * nx + i] === z) i++;
        const ua = u0 + i0 * CELL, ub = u0 + i * CELL, va = v0 + j * CELL, vb = va + CELL;
        result.pieces.push({ corners: [toEN(ua, va), toEN(ub, va), toEN(ub, vb), toEN(ua, vb)], topAhdM: z, block: b });
        result.areaM2 += (i - i0) * CELL * CELL;
        const blk = result.blocks![b];
        blk.areaM2 += (i - i0) * CELL * CELL; blk.topAhdM = Math.max(blk.topAhdM, z);
        for (let c = i0; c < i; c++) { cellsOf[b].push({ u: u0 + (c + 0.5) * CELL, v: v0 + (j + 0.5) * CELL }); keptBlock![j * nx + c] = b; }
      }
    }
    // the sample point: the kept cell nearest the block's centroid, so it is always on the roof
    index.forEach((b) => {
      const cells = cellsOf[b];
      const mu = cells.reduce((t, q) => t + q.u, 0) / cells.length, mv = cells.reduce((t, q) => t + q.v, 0) / cells.length;
      let best = cells[0], d = Infinity;
      for (const q of cells) { const e = (q.u - mu) ** 2 + (q.v - mv) ** 2; if (e < d) { d = e; best = q; } }
      result.blocks![b].centre = toEN(best.u, best.v);
    });
  });
  if (keptBlock) result.grid = { angle: a, u0, v0, cellM: CELL, nx, ny, level: cellLevel, block: keptBlock, top };
  return result;
}

/** usableRoof for every building or development in the list, grouped by parentId. */
export function usableRoofs(parts: Massing[], options: Partial<RoofOptions> = {}): Map<string, RoofResult> {
  const byParent = new Map<string, Massing[]>();
  for (const p of parts) byParent.set(p.parentId, [...(byParent.get(p.parentId) ?? []), p]);
  const out = new Map<string, RoofResult>();
  for (const [id, group] of byParent) out.set(id, usableRoof(group, options));
  return out;
}

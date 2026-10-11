/*
 * ─────────────────────────────────────────────────────────────────────────
 * WHERE THE PANELS GO
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Lays east-west pairs of panels (panelModel.ts) out on a roof, one roof
 * level at a time, on the grid the roof was found on (roofParts.ts):
 *
 *   - a pair goes only where every cell under it is kept roof, on its level,
 *     at least EDGE_SETBACK_M in from the level's edge (the ABCB's worked
 *     example keeps modules 1,000 mm from roof edges), and passes the test:
 *       light   every cell keeps at least LIGHT_MIN of an unshaded panel's
 *               year of light (BlockSun.energy) - the darkest cell decides;
 *       rule    every cell is shaded for no more than SHADE_LIMIT of daylight
 *               (NCC 2025 J9D5), for comparison;
 *   - the rows run along whichever side of the building is nearer north-south,
 *     so the panels face as near east and west as the roof allows; the shade
 *     and the yield count them facing the way they are laid (pairFacing);
 *   - a pair sits on one roof height: the cells under it may differ by no
 *     more than LEVEL_TOLERANCE_M (roof levels group tops up to 0.6 m apart),
 *     and a run of pairs is split where its height changes;
 *   - the pairs sit on a regular pitch, and of the starting offsets (a cell
 *     at a time across one pitch and one row) the one that fits most is kept.
 *
 * LIGHT_MIN is 0.88: the 75% "total solar resource fraction" Project Sunroof
 * and Energy Trust of Oregon count as worth installing, less what laying the
 * panels east and west at 10 degrees costs against facing north at 35 (PVGIS:
 * 1,249 against 1,461 kWh per kW a year, 0.855), leaving what shade may take.
 *
 * Not in it: walkways inside a field, plant clearances beyond the roof rules,
 * and the frame's own limits on a field's size.
 */
import type { Massing } from '../data/model';
import type { RoofGrid } from './roofParts';
import { SHADE_LIMIT, type BlockSun } from './solarShade';
import { field, frameFor, PAIR_WIDTH_M, ROW_LENGTH_M, type ArrayParts, type FrameKind } from './panelModel';

export const LIGHT_MIN = 0.88;
export const EDGE_SETBACK_M = 1;
/** The most the roof under one pair may rise or fall, m: what a frame's packers can take up (assumed). */
export const LEVEL_TOLERANCE_M = 0.05;

/** The frame a roof's panels are laid out in: rows along u or v of its grid, and the turn from east/north. */
export function layoutFrame(grid: RoofGrid): { alongU: boolean; yaw: number } {
  // rows along the grid axis nearer north-south: u if the grid's angle is nearer north than east
  const alongU = Math.abs(Math.sin(grid.angle)) > Math.abs(Math.cos(grid.angle));
  return { alongU, yaw: alongU ? grid.angle - Math.PI / 2 : grid.angle };
}

/** The way the eastern half of each pair faces, compass degrees (90 = due east), in 0..180. */
export function pairFacing(grid: RoofGrid): number {
  const deg = 90 - (layoutFrame(grid).yaw * 180) / Math.PI;
  return Math.round((((deg % 180) + 180) % 180) * 10) / 10;
}

export interface RoofLayout {
  frame: FrameKind;
  /** The parts are laid out in a frame turned by `yaw` (radians, east towards north) about the origin. */
  yaw: number;
  parts: ArrayParts;
  panels: number;
  /** Each panel's share of an unshaded panel's year of light (the mean over the cells under its pair), added up. */
  lightSum: number;
}

/** How tall the building is: its highest roof above its lowest base, m. */
export function buildingHeight(parts: Massing[]): number {
  return Math.max(...parts.map((p) => p.topAhdM)) - Math.min(...parts.map((p) => p.baseAhdM));
}

type Test = 'light' | 'rule';

/**
 * The pairs that fit on the roof, by `test`. `parts` is the building (for its height, which picks the
 * frame); `sun` is one BlockSun per block.
 */
export function layOut(grid: RoofGrid, sun: BlockSun[], parts: Massing[], test: Test): RoofLayout {
  const frame = frameFor(buildingHeight(parts));
  const c = grid.cellM, { nx, ny } = grid;
  const { alongU, yaw } = layoutFrame(grid);
  // the local frame: p across (x), q along (y); cell (p, q) spans x0 + p·c, y0 + q·c
  const np = alongU ? ny : nx, nq = alongU ? nx : ny;
  const x0 = alongU ? -grid.v0 - ny * c : grid.u0, y0 = alongU ? grid.u0 : grid.v0;
  const at = (p: number, q: number) => (alongU ? q + (ny - 1 - p) * nx : p + q * nx);

  const passes = (b: number) => (test === 'light' ? sun[b].energy >= LIGHT_MIN : sun[b].shaded <= SHADE_LIMIT);
  const setback = Math.round(EDGE_SETBACK_M / c);
  const pitch = PAIR_WIDTH_M[frame], rowLength = ROW_LENGTH_M[frame];
  const out: RoofLayout = { frame, yaw, parts: { modules: [], profiles: [], posts: [], plates: [], blocks: [] }, panels: 0, lightSum: 0 };

  const levels = new Set<number>();
  for (let k = 0; k < nx * ny; k++) if (grid.block[k] >= 0) levels.add(grid.level[k]);
  for (const li of levels) {
    // summed-area tables, in the local frame: cells on this level, and cells a pair may cover
    const W = np + 1;
    const onLevel = new Int32Array(W * (nq + 1)), good = new Int32Array(W * (nq + 1));
    for (let q = 0; q < nq; q++) {
      let a = 0;
      for (let p = 0; p < np; p++) { a += grid.level[at(p, q)] === li ? 1 : 0; onLevel[(q + 1) * W + p + 1] = onLevel[q * W + p + 1] + a; }
    }
    const sum = (S: Int32Array, p0: number, q0: number, p1: number, q1: number) =>
      S[q1 * W + p1] - S[q0 * W + p1] - S[q1 * W + p0] + S[q0 * W + p0];
    for (let q = 0; q < nq; q++) {
      let a = 0;
      for (let p = 0; p < np; p++) {
        const k = at(p, q), b = grid.block[k];
        // in from the edge: the square of cells around it within the setback all on this level
        const inside = p >= setback && q >= setback && p + setback < np && q + setback < nq
          && sum(onLevel, p - setback, q - setback, p + setback + 1, q + setback + 1) === (2 * setback + 1) ** 2;
        a += grid.level[k] === li && b >= 0 && inside && passes(b) ? 1 : 0;
        good[(q + 1) * W + p + 1] = good[q * W + p + 1] + a;
      }
    }
    // the cells a slot covers: from the cell its start falls in to the cell its end falls in
    const span = (start: number, length: number) => [Math.floor(start / c + 1e-9), Math.ceil((start + length) / c - 1e-9)] as const;
    // the roof's height under a slot, or null where it varies by more than a frame takes up
    const heightUnder = (p0: number, q0: number, p1: number, q1: number): number | null => {
      let lo = Infinity, hi = -Infinity;
      for (let q = q0; q < q1; q++) for (let p = p0; p < p1; p++) { const t = grid.top[at(p, q)]; lo = Math.min(lo, t); hi = Math.max(hi, t); }
      return hi - lo <= LEVEL_TOLERANCE_M ? hi : null;
    };
    // a slot: pair s across, row r along, and the roof height it sits on
    type Slot = { s: number; r: number; z: number };
    let best: { dp: number; dq: number; slots: Slot[] } = { dp: 0, dq: 0, slots: [] };
    for (let dq = 0; dq * c < rowLength; dq++) {
      for (let dp = 0; dp * c < pitch; dp++) {
        const slots: Slot[] = [];
        for (let r = 0; dq * c + (r + 1) * rowLength <= nq * c; r++) {
          const [q0, q1] = span(dq * c + r * rowLength, rowLength);
          for (let s = 0; dp * c + (s + 1) * pitch <= np * c; s++) {
            const [p0, p1] = span(dp * c + s * pitch, pitch);
            if (sum(good, p0, q0, p1, q1) !== (p1 - p0) * (q1 - q0)) continue;
            const z = heightUnder(p0, q0, p1, q1);
            if (z !== null) slots.push({ s, r, z });
          }
        }
        if (slots.length > best.slots.length) best = { dp, dq, slots };
      }
    }
    // runs of neighbouring slots in a row, at one height, become one field
    const { dp, dq, slots } = best;
    for (let i = 0; i < slots.length;) {
      let j = i + 1;
      while (j < slots.length && slots[j].r === slots[i].r && slots[j].s === slots[j - 1].s + 1 && slots[j].z === slots[i].z) j++;
      const { s: s0, r, z } = slots[i], n = j - i;
      const xs = dp * c + s0 * pitch, ys = dq * c + r * rowLength;
      const [q0, q1] = span(ys, rowLength);
      const f = field(frame, n, 1, x0 + xs, y0 + ys, z);
      for (const key of Object.keys(out.parts) as (keyof ArrayParts)[]) out.parts[key].push(...f[key]);
      // each pair's light: the mean over the cells under it
      for (let k = 0; k < n; k++) {
        const [a0, a1] = span(xs + k * pitch, pitch);
        let total = 0, cells = 0;
        for (let q = q0; q < q1; q++) for (let p = a0; p < a1; p++) { total += sun[grid.block[at(p, q)]].energy; cells++; }
        out.lightSum += 2 * (total / cells);
      }
      out.panels += 2 * n;
      i = j;
    }
  }
  return out;
}

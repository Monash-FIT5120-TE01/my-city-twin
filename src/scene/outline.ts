/*
 * ─────────────────────────────────────────────────────────────────────────
 * A BUILDING'S OUTLINE, FROM ITS FOOTPRINTS
 * ─────────────────────────────────────────────────────────────────────────
 *
 * WHAT THIS FILE IS
 *   The lines SelectionEdges draws round the chosen building: its roof lines
 *   and its corners, and nothing else. Pure geometry, with no three.js in
 *   it, so it is tested on its own (outline.test.ts).
 *
 * WHAT IT DOES
 *   - outlineSegments: a building's blocks in, line-segment endpoints out.
 *   - Small polygon helpers it needs: dropping a ring's closing point, a
 *     ring's winding, and whether a point is inside a footprint.
 *
 * WHY NOT FROM THE MESH
 *   Taken from the triangles — every edge where the faces turn — the outline
 *   was a tangle. A building is several blocks that overlap and stand on one
 *   another, so the mesh is full of edges that are not the building's: the
 *   end of one block's wall lying flat on another's, a roof line buried in
 *   the tower above it. And a curved facade is a ring of facets, each joint
 *   a line. Raising the angle took out the facets and the real corners of an
 *   octagonal tower with them.
 *
 *   The blocks are simple — a footprint extruded between two heights — so
 *   the outline can be worked out from that instead, and each line asked
 *   whether it belongs to the building's outside.
 *
 * WHAT IS KEPT
 *   ROOF LINES: every edge of every block's top, unless the roof carries on
 *   past it — into a neighbouring block of the same height — or a taller
 *   block stands on it. Tested a little way OUTSIDE the edge: where that
 *   point is inside another block at that height, the edge is not on the
 *   outside there.
 *
 *   CORNERS: an upright line at each footprint corner that turns by more
 *   than `CORNER_DEG`, so the joints round a curve are left out and the
 *   corners of a box or an octagon are not. Tested outside the corner, the
 *   same way. Also left out: a corner beside a wall shorter
 *   than `RECESS_M` (a recess or a kink in the survey, not the building's
 *   shape), and a corner where the wall carries straight on into the next
 *   block (two blocks side by side make one flat wall).
 *
 * PIECE BY PIECE, NOT ALL OR NOTHING
 *   Every test is made along the line — every `SAMPLE_M` along a roof edge,
 *   every `SAMPLE_M` up a corner — and only the stretches that pass are
 *   drawn. Tested once in the middle, a roof edge a neighbour touched for a
 *   third of its length lost its exposed ends too, and a tower's corner
 *   beside a lower block vanished all the way up instead of from the
 *   neighbour's roof. See `runs`.
 *
 * Positions are in the same frame the mesh is built in — east, north, up,
 * in metres — so the lines sit on the walls they outline.
 */

import type { Massing, Ring } from '../data/model';
import { effectiveBaseAhdM } from './massing';

/** A footprint turn sharper than this is a corner. Degrees. */
const CORNER_DEG = 35;

/** How far outside an edge to test whether something else is there. Metres. */
const PROBE_M = 0.8;

/**
 * A corner beside a wall shorter than this is the edge of a shallow recess
 * or a kink in the survey line — a slot a metre deep down the face of a
 * tower — rather than a corner of the building's shape, and is not drawn.
 * Metres.
 */
const RECESS_M = 1.5;

/**
 * How long a stretch of edge one sample stands for, along a roof line or up
 * a corner. Fine enough that a partly covered wall keeps its exposed ends.
 * Metres.
 */
const SAMPLE_M = 1;

/** Two roofs closer than this in height are one roof. Metres. */
const SAME_ROOF_M = 0.5;

/** One block of a building: its footprint (open rings) between two heights. */
interface Block {
  rings: Ring[][];
  base: number;
  top: number;
}

/** The ring without a repeated closing point. */
function open(ring: Ring): Ring {
  if (ring.length > 1) {
    const [a, b] = [ring[0], ring[ring.length - 1]];
    if (a[0] === b[0] && a[1] === b[1]) return ring.slice(0, -1);
  }
  return ring;
}

/** Positive when the ring runs anticlockwise; used to tell outside from inside. */
function signedArea(ring: Ring): number {
  let sum = 0;
  for (let i = 0; i < ring.length; i++) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[(i + 1) % ring.length];
    sum += x1 * y2 - x2 * y1;
  }
  return sum / 2;
}

/** Whether (x, y) is inside one ring, by counting crossings (even-odd). */
function inRing(x: number, y: number, ring: Ring): boolean {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) inside = !inside;
  }
  return inside;
}

/** Inside a polygon's outer ring and outside all its holes. */
function inFootprint(x: number, y: number, rings: Ring[][]): boolean {
  return rings.some(
    ([outer, ...holes]) => inRing(x, y, outer) && !holes.some((hole) => inRing(x, y, hole)),
  );
}

/**
 * The stretches of [0, 1] that pass a test, as [from, to] pairs.
 *
 * The span is cut into `count` equal pieces and each is tested at its
 * middle; neighbouring pieces that pass are joined into one stretch. A whole
 * edge that passes comes back as the single pair [0, 1].
 */
function runs(count: number, shows: (t: number) => boolean): [number, number][] {
  const out: [number, number][] = [];
  let start = -1;
  for (let k = 0; k <= count; k++) {
    const on = k < count && shows((k + 0.5) / count);
    if (on && start < 0) start = k;
    if (!on && start >= 0) {
      out.push([start / count, k / count]);
      start = -1;
    }
  }
  return out;
}

/**
 * The outline of a building made of these blocks, as line-segment endpoints:
 * six numbers per segment, [x1, y1, z1, x2, y2, z2]. Blocks with no
 * usable footprint, or less than 0.2 m tall, are ignored.
 */
export function outlineSegments(parts: Massing[], floorAhdM: number): Float32Array {
  const blocks: Block[] = parts
    .map((part) => ({
      rings: part.footprint.map((polygon) => polygon.map(open)).filter((p) => p[0]?.length >= 3),
      base: effectiveBaseAhdM(part, floorAhdM),
      top: part.topAhdM,
    }))
    .filter((block) => block.rings.length > 0 && block.top - block.base > 0.2);

  /** Is (x, y) at height z inside a block other than `self`? */
  const solidAt = (x: number, y: number, z: number, self: Block) =>
    blocks.some(
      (other) =>
        other !== self && z > other.base - 0.01 && z < other.top + 0.01 && inFootprint(x, y, other.rings),
    );

  /** Does a roof carry on at (x, y) — another block's top at this height? */
  const roofContinues = (x: number, y: number, top: number, self: Block) =>
    blocks.some(
      (other) =>
        other !== self && Math.abs(other.top - top) < SAME_ROOF_M && inFootprint(x, y, other.rings),
    );

  const out: number[] = [];
  const corner = Math.cos(((180 - CORNER_DEG) * Math.PI) / 180);

  for (const block of blocks) {
    for (const polygon of block.rings) {
      for (const [index, ring] of polygon.entries()) {
        /*
         * Away from the solid. For the outer ring that is out of the ring —
         * the right of travel when it runs anticlockwise; for a hole it is
         * into the hole, the other way.
         */
        const anticlockwise = signedArea(ring) >= 0;
        const turn = (anticlockwise ? 1 : -1) * (index === 0 ? 1 : -1);
        const n = ring.length;
        for (let i = 0; i < n; i++) {
          const [x1, y1] = ring[i];
          const [x2, y2] = ring[(i + 1) % n];
          const dx = x2 - x1;
          const dy = y2 - y1;
          const length = Math.hypot(dx, dy);
          if (length < 1e-6) continue;

          /*
           * ── the roof line along this edge, in the stretches that show
           *
           * Tested along its length, not at one point: a neighbour can touch
           * only part of a wall, and one probe at the middle threw away the
           * exposed ends with the covered middle. Each sample stands for a
           * stretch of about `SAMPLE_M`; neighbouring exposed stretches join.
           */
          const ox = (dy / length) * turn;
          const oy = (-dx / length) * turn;
          const roofShows = (t: number) => {
            const mx = x1 + dx * t + ox * PROBE_M;
            const my = y1 + dy * t + oy * PROBE_M;
            return (
              !solidAt(mx, my, block.top + SAME_ROOF_M, block) &&
              !roofContinues(mx, my, block.top, block)
            );
          };
          for (const [from, to] of runs(Math.max(1, Math.ceil(length / SAMPLE_M)), roofShows)) {
            out.push(
              x1 + dx * from,
              y1 + dy * from,
              block.top,
              x1 + dx * to,
              y1 + dy * to,
              block.top,
            );
          }

          // ── the upright at this edge's start, if it is a corner
          const [px, py] = ring[(i - 1 + n) % n];
          const ax = px - x1;
          const ay = py - y1;
          const al = Math.hypot(ax, ay);
          if (al < 1e-6) continue;
          // The angle between the two edges at this vertex: straight on is 180°.
          const cos = (ax * dx + ay * dy) / (al * length);
          if (cos < corner) continue;
          if (al < RECESS_M || length < RECESS_M) continue;
          // Outside the corner: away from both edges' insides.
          const bx = -(ax / al + dx / length);
          const by = -(ay / al + dy / length);
          const bl = Math.hypot(bx, by) || 1;
          const cx = x1 + (bx / bl) * PROBE_M;
          const cy = y1 + (by / bl) * PROBE_M;
          const e1x = -ax / al;
          const e1y = -ay / al;
          const e2x = dx / length;
          const e2y = dy / length;
          const inset = PROBE_M / 2;
          /*
           * Whether the corner shows at height z. Not against another block
           * — a reflex corner's bisector points inwards; either way a corner
           * against a neighbour is not on the outside — and not where a wall
           * carries straight on into the next block: two blocks side by side
           * make one flat wall, and the corner each has at the join is not a
           * corner of the building. Probed just past the vertex along each
           * wall, a little inside it.
           *
           * Asked up the corner's height rather than once at mid-height: a
           * tower beside a lower neighbour is hidden only up to the
           * neighbour's roof, and the corner above it still shows.
           */
          const cornerShows = (f: number) => {
            const z = block.base + (block.top - block.base) * f;
            return !(
              solidAt(cx, cy, z, block) ||
              solidAt(
                x1 + e1x * PROBE_M - e1y * turn * inset,
                y1 + e1y * PROBE_M + e1x * turn * inset,
                z,
                block,
              ) ||
              solidAt(
                x1 - e2x * PROBE_M - e2y * turn * inset,
                y1 - e2y * PROBE_M + e2x * turn * inset,
                z,
                block,
              )
            );
          };
          const height = block.top - block.base;
          for (const [from, to] of runs(Math.max(1, Math.ceil(height / SAMPLE_M)), cornerShows)) {
            out.push(x1, y1, block.base + height * from, x1, y1, block.base + height * to);
          }
        }
      }
    }
  }

  return new Float32Array(out);
}

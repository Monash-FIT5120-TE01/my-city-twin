/*
 * ─────────────────────────────────────────────────────────────────────────
 * MAP COORDINATES  →  METRES
 * ─────────────────────────────────────────────────────────────────────────
 *
 * WHAT THIS FILE IS
 *   The border crossing between how the world describes a place and how a
 *   3D scene describes one. The API sends longitude and latitude; the scene
 *   needs metres east and north of a chosen point. Everything here is that
 *   conversion, plus two small pieces of polygon arithmetic that need it.
 *
 * WHO USES IT
 *   Only adapter.ts, while it is turning an API response into the model the
 *   rest of the app sees. Nothing downstream ever touches longitude again.
 *
 * WHY NOT JUST USE LONGITUDE AND LATITUDE
 *   Because they are angles, not distances, and the two axes are not the
 *   same size. In Melbourne one degree of longitude is about 88 km and one
 *   degree of latitude about 111 km. Treating those as if they matched
 *   would squash the city east-to-west by a fifth, and every shadow would
 *   lean by a consistent amount that looks like nothing in particular.
 */

import proj4 from 'proj4';
import { PROJECTED_CRS_DEF, SOURCE_CRS } from '../scene/frame';
import type { PolygonEN, Ring } from './model';
import type { ApiMultiPolygon } from './api-types';

// Teaches proj4 what EPSG:7855 is. It ships with the common projections but
// not this one, so the definition string comes from frame.ts.
proj4.defs('EPSG:7855', PROJECTED_CRS_DEF);

/**
 * The converter itself, built once and reused. `forward` takes [lon, lat] in
 * degrees and returns [easting, northing] in metres.
 */
const toMetric = proj4(SOURCE_CRS, 'EPSG:7855');

/**
 * One point, from degrees to metres.
 *
 * The numbers that come back are large — Melbourne sits around 320,000 m
 * east and 5,813,000 m north of the zone's origin — so callers normally
 * subtract a local origin afterwards. See projectMultiPolygon, which does
 * both steps at once.
 */
export function projectLonLat(lon: number, lat: number): [number, number] {
  const [x, y] = toMetric.forward([lon, lat]);
  return [x, y];
}

/**
 * A whole building outline, from degrees to local metres.
 *
 * SHAPE OF THE INPUT
 *   A GeoJSON MultiPolygon nests four levels deep:
 *
 *     coordinates[polygon][ring][vertex][lon, lat]
 *
 *   A building is usually one polygon. A polygon is one outer ring plus any
 *   number of inner rings, and an inner ring is a courtyard — a hole.
 *
 * WHAT COMES OUT
 *   The same nesting, but every vertex is [east, north] in metres from the
 *   scene origin, and the duplicated closing vertex is gone.
 *
 * WHY SUBTRACT AN ORIGIN
 *   Projected eastings are seven digits. A GPU stores depth in a float with
 *   about seven significant digits total, so numbers that large leave almost
 *   nothing for the fractional part — and shadows on flat roofs break into
 *   speckle. Subtracting a nearby origin brings every coordinate down to
 *   three or four digits and the problem disappears.
 *
 * WHY KEEP THE HOLES
 *   Because a courtyard is not part of the building. Filling it in would add
 *   mass the building does not have, and mass casts shadow.
 */
export function projectMultiPolygon(
  geometry: ApiMultiPolygon,
  originX: number,
  originY: number,
): PolygonEN[] {
  // .map twice: once over the polygons, once over each polygon's rings.
  return geometry.coordinates.map((polygon) =>
    polygon.map((ring) => {
      const out: Ring = [];

      // Project each vertex, then shift it so the scene origin is at zero.
      for (const [lon, lat] of ring) {
        const [x, y] = toMetric.forward([lon, lat]);
        out.push([x - originX, y - originY]);
      }

      // GeoJSON repeats the first vertex at the end to close the ring.
      // three.js's Shape closes it for us, so the repeat would become a
      // zero-length edge. Drop it if it is there.
      if (out.length > 1) {
        const first = out[0];
        const last = out[out.length - 1];
        if (first[0] === last[0] && first[1] === last[1]) out.pop();
      }

      return out;
    }),
  );
}

/**
 * How much ground a ring covers, in square metres.
 *
 * HOW IT WORKS
 *   Walk the edges of the ring. For each one, add the area of the trapezoid
 *   between that edge and the x-axis. Edges running one way add, edges
 *   running back subtract, and what survives is the enclosed area. The loop
 *   variable `j` is simply "the vertex before `i`", which is why it starts
 *   at the last one — that pairs the final vertex with the first and closes
 *   the ring.
 *
 * THE SIGN IS BACKWARDS
 *   This trapezoid form comes out NEGATIVE for a counter-clockwise ring,
 *   the opposite of the textbook shoelace formula. Every caller here takes
 *   the absolute value, so it does not matter — but anybody who uses the
 *   sign to work out which way a ring winds needs to know.
 */
export function ringArea(ring: Ring): number {
  let sum = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    sum += (ring[j][0] + ring[i][0]) * (ring[j][1] - ring[i][1]);
  }
  return sum / 2;
}

/**
 * A single point standing for a group of polygons — used to put the map pin
 * on a development and to point the camera at it.
 *
 * HOW IT WORKS
 *   Average the vertices of each outer ring to get a rough middle, then
 *   average those middles weighted by area, so a large building counts for
 *   more than a small one beside it.
 *
 * WHAT IT IS NOT
 *   A true centre of area. Averaging vertices is pulled towards whichever
 *   side has more of them, and holes are ignored. For a pin a few metres
 *   either way is invisible; for anything measured it would not be.
 */
export function centroidOf(polygons: PolygonEN[]): [number, number] {
  let cx = 0;
  let cy = 0;
  let total = 0;

  for (const polygon of polygons) {
    const outer = polygon[0];
    // Fewer than three vertices is not a shape; skip it rather than divide
    // by an area of zero further down.
    if (!outer || outer.length < 3) continue;

    const area = Math.abs(ringArea(outer));

    // Rough middle of this ring: the average of its vertices.
    let sx = 0;
    let sy = 0;
    for (const [x, y] of outer) {
      sx += x;
      sy += y;
    }

    // Accumulate it weighted by how much ground it covers.
    cx += (sx / outer.length) * area;
    cy += (sy / outer.length) * area;
    total += area;
  }

  // Nothing usable came in — return the origin rather than NaN, which would
  // travel silently into the camera and put it nowhere.
  return total > 0 ? [cx / total, cy / total] : [0, 0];
}

import proj4 from 'proj4';
import { PROJECTED_CRS_DEF, SOURCE_CRS } from '../scene/frame';
import type { PolygonEN, Ring } from './model';
import type { ApiMultiPolygon } from './api-types';

proj4.defs('EPSG:7855', PROJECTED_CRS_DEF);

const toMetric = proj4(SOURCE_CRS, 'EPSG:7855');

/** Projected metres for one lon/lat pair. */
export function projectLonLat(lon: number, lat: number): [number, number] {
  const [x, y] = toMetric.forward([lon, lat]);
  return [x, y];
}

/**
 * Converts an API MultiPolygon into local east/north metres.
 *
 * The origin is subtracted here rather than in the scene, so every coordinate
 * downstream is a small number. Raw MGA eastings are seven digits; carrying
 * them into the depth buffer is what produces shadow acne on flat roofs.
 *
 * Ring order is preserved: outer ring first, holes after. Courtyards have to
 * stay open or the massing gains mass it does not have.
 */
export function projectMultiPolygon(
  geometry: ApiMultiPolygon,
  originX: number,
  originY: number,
): PolygonEN[] {
  return geometry.coordinates.map((polygon) =>
    polygon.map((ring) => {
      const out: Ring = [];
      for (const [lon, lat] of ring) {
        const [x, y] = toMetric.forward([lon, lat]);
        out.push([x - originX, y - originY]);
      }
      // GeoJSON closes its rings; three.js Shape does not want the repeat.
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
 * Signed area of a ring, m². This trapezoid form is **negative for a
 * counter-clockwise ring** — the opposite of the usual shoelace sign. Every
 * caller takes the absolute value; anyone using the sign to decide winding
 * must account for that.
 */
export function ringArea(ring: Ring): number {
  let sum = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    sum += (ring[j][0] + ring[i][0]) * (ring[j][1] - ring[i][1]);
  }
  return sum / 2;
}

/** Area-weighted centroid of a set of polygons, for pins and camera targets. */
export function centroidOf(polygons: PolygonEN[]): [number, number] {
  let cx = 0;
  let cy = 0;
  let total = 0;
  for (const polygon of polygons) {
    const outer = polygon[0];
    if (!outer || outer.length < 3) continue;
    const area = Math.abs(ringArea(outer));
    let sx = 0;
    let sy = 0;
    for (const [x, y] of outer) {
      sx += x;
      sy += y;
    }
    cx += (sx / outer.length) * area;
    cy += (sy / outer.length) * area;
    total += area;
  }
  return total > 0 ? [cx / total, cy / total] : [0, 0];
}

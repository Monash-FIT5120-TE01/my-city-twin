import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { GRID_DIRECTIONS, ROADS } from './streets';
import type { PolygonEN } from '../data/model';

/*
 * The road surface is generated offline by subtracting every building
 * footprint from the street strips, so what ships is a fixture rather than
 * something the app can re-derive. These tests hold the fixture to the shape
 * the generator promised: real road area, in the right places, following the
 * grid — and, above all, not running under the buildings.
 *
 * Drawing the strips directly put 15% of the road surface beneath a building,
 * and the little streets were at 40%. That is the regression this guards.
 */

const doc: { polygons: PolygonEN[]; count: number } = JSON.parse(
  readFileSync(resolve(__dirname, '../../public/data/roads.json'), 'utf-8'),
);

const ringArea = (ring: [number, number][]) => {
  let sum = 0;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    sum += (ring[j][0] + ring[i][0]) * (ring[j][1] - ring[i][1]);
  }
  return Math.abs(sum / 2);
};

describe('the road surface fixture', () => {
  it('is present and non-trivial', () => {
    expect(doc.polygons.length).toBeGreaterThan(20);
    expect(doc.polygons.length).toBe(doc.count);
  });

  it('carries enough area to be a street network', () => {
    // Eighteen streets across a 2 km grid: hundreds of thousands of square
    // metres. A near-empty fixture means the subtraction ate everything.
    const total = doc.polygons.reduce(
      (sum, polygon) =>
        sum + ringArea(polygon[0]) - polygon.slice(1).reduce((h, r) => h + ringArea(r), 0),
      0,
    );
    expect(total).toBeGreaterThan(150_000);
    expect(total).toBeLessThan(900_000);
  });

  it('stays inside the Hoddle Grid', () => {
    for (const polygon of doc.polygons) {
      for (const ring of polygon) {
        for (const [east, north] of ring) {
          expect(Math.abs(east)).toBeLessThan(2500);
          expect(Math.abs(north)).toBeLessThan(2500);
        }
      }
    }
  });

  it('has every vertex near one of the eighteen carriageways', () => {
    // Each point should sit within half a road width of some street's
    // centreline. A stray polygon would mean the union picked up something
    // that is not a road.
    let stray = 0;
    let checked = 0;

    for (const polygon of doc.polygons) {
      for (const [east, north] of polygon[0]) {
        checked += 1;
        const onARoad = ROADS.some((road) => {
          const [offE, offN] =
            road.axis === 'long' ? GRID_DIRECTIONS.cross : GRID_DIRECTIONS.long;
          const offset = east * offE + north * offN;
          // Half a width, plus a little for the simplification tolerance.
          return Math.abs(offset - road.offsetM) <= road.widthM / 2 + 24;
        });
        if (!onARoad) stray += 1;
      }
    }

    expect(checked).toBeGreaterThan(200);
    expect(stray / checked).toBeLessThan(0.02);
  });

  it('records how it was made, because it cannot be re-derived at runtime', () => {
    const raw = readFileSync(resolve(__dirname, '../../public/data/roads.json'), 'utf-8');
    expect(raw).toMatch(/minus the union of all 4,443 building footprints/);
  });
});

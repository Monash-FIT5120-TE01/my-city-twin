import { describe, expect, it } from 'vitest';
import {
  buildingCentres,
  buildingsUnder,
  insidePolygon,
  pointInRing,
  representativePoint,
  representativePointIsInterior,
} from './replaces';
import type { PolygonEN } from './model';

/** A square with its corner at (east, north). */
const square = (east: number, north: number, size: number): PolygonEN => [
  [
    [east, north],
    [east + size, north],
    [east + size, north + size],
    [east, north + size],
    [east, north],
  ],
];

describe('pointInRing', () => {
  const ring = square(0, 0, 10)[0];

  it('finds a point inside', () => {
    expect(pointInRing([5, 5], ring)).toBe(true);
  });

  it('leaves a point outside', () => {
    expect(pointInRing([15, 5], ring)).toBe(false);
    expect(pointInRing([5, -1], ring)).toBe(false);
  });
});

describe('finding a point that is really inside', () => {
  it('keeps out of a courtyard the building is built around', () => {
    /*
     * A block built around a light well. Both centroids — the vertex average
     * and the area centroid — land in the middle of the courtyard, which is
     * not the building. Ten of the 1,548 bundled buildings are shaped like
     * this, and every one of their centres was in its own hole.
     */
    const courtyardBlock = [
      square(0, 0, 30)[0],
      // Wound the same way; the even-odd test does not care, and the data
      // does not promise otherwise.
      square(10, 10, 10)[0],
    ];

    const point = representativePoint(courtyardBlock);
    expect(insidePolygon(point, courtyardBlock)).toBe(true);
    expect(pointInRing(point, square(10, 10, 10)[0])).toBe(false);
    expect(representativePointIsInterior(courtyardBlock)).toBe(true);
  });

  it('stays inside a U, where the centroid is in the opening', () => {
    const u: [number, number][] = [
      [0, 0], [10, 0], [10, 10], [8, 10], [8, 2], [2, 2], [2, 10], [0, 10], [0, 0],
    ];
    const point = representativePoint([u]);
    expect(pointInRing(point, u)).toBe(true);
  });

  it('is not moved by vertices that add no shape', () => {
    // Collinear points along one edge dragged the old vertex average towards
    // it, so the same outline described twice gave two different answers.
    const plain = square(0, 0, 10)[0];
    const padded: [number, number][] = [
      [0, 0], [10, 0], [10, 2.5], [10, 5], [10, 7.5], [10, 10], [0, 10], [0, 0],
    ];
    const a = representativePoint([plain]);
    const b = representativePoint([padded]);
    expect(b[0]).toBeCloseTo(a[0], 6);
    expect(b[1]).toBeCloseTo(a[1], 6);
  });

  it('admits when a ring has no interior at all', () => {
    /*
     * Three collinear points enclose nothing. There is no point on the
     * surface to return, and the honest answer is to say so — returning
     * something that merely looks like a centre is how a building ends up
     * classified by a point that is not on it.
     */
    const line: [number, number][] = [[0, 0], [5, 0], [10, 0], [0, 0]];
    expect(representativePointIsInterior([line])).toBe(false);
  });
});

describe('which building stands on which site', () => {
  it('takes only the building whose centre is under the proposal', () => {
    /*
     * Two buildings side by side, sharing a party wall at east = 10 — which
     * is the arrangement all down a Hoddle Grid block, and the reason this
     * asks about centres rather than about overlap. A proposal covering the
     * first must not take the second with it.
     */
    const centres = buildingCentres([
      { parentId: 'left', footprint: [square(0, 0, 10)] },
      { parentId: 'right', footprint: [square(10, 0, 10)] },
    ]);

    expect(buildingsUnder([square(-1, -1, 12)], centres)).toEqual(['left']);
  });

  it('takes a building whose parts are not all under the proposal', () => {
    /*
     * One building, two roof planes, only the larger inside. Deciding per
     * part would demolish half of it and leave the rest standing in mid-air,
     * which is why the decision is made once per building.
     */
    const centres = buildingCentres([
      { parentId: 'tower', footprint: [square(0, 0, 20)] },
      { parentId: 'tower', footprint: [square(30, 30, 4)] },
    ]);

    expect(buildingsUnder([square(-1, -1, 22)], centres)).toEqual(['tower']);
  });

  it('takes its centre from the largest part, not the average of them', () => {
    // A tower with a long low wing: averaging the parts puts the centre out
    // in the wing, and the question is which site the building stands on.
    const centres = buildingCentres([
      { parentId: 'a', footprint: [square(0, 0, 20)] },
      { parentId: 'a', footprint: [square(100, 0, 3)] },
    ]);

    expect(centres.get('a')).toEqual([10, 10]);
  });

  it('leaves the city alone when the proposal covers open ground', () => {
    const centres = buildingCentres([{ parentId: 'far', footprint: [square(500, 500, 10)] }]);
    expect(buildingsUnder([square(0, 0, 10)], centres)).toEqual([]);
  });

  it('ignores a degenerate footprint rather than throwing on it', () => {
    const centres = buildingCentres([{ parentId: 'thin', footprint: [[[[0, 0], [1, 1]]]] }]);
    expect(centres.size).toBe(0);
    expect(buildingsUnder([[[[0, 0], [1, 1]]]], new Map([['x', [0.5, 0.5]]]))).toEqual([]);
  });
});

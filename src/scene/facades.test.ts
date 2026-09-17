import { describe, expect, it } from 'vitest';
import {
  clearOfBuildings,
  compassOf,
  facadesOf,
  floorAhdM,
  windowPlace,
  ASSUMED_FLOOR_M,
} from './facades';
import type { Massing } from '../data/model';

/*
 * The one that has to be right is the OUTWARD direction. A sign error here
 * points every window into the building it belongs to, and the symptom is not
 * an error but a plausible-looking figure that is wrong all day.
 */

function box(
  ring: [number, number][],
  base = 0,
  top = 30,
): Massing {
  return {
    id: 'b',
    parentId: 'p',
    footprint: [[ring]],
    baseAhdM: base,
    topAhdM: top,
    heightM: top - base,
    areaM2: 0,
    sinksToGround: true,
  };
}

/** A 40 x 40 square about the origin, counter-clockwise. */
const anticlockwise: [number, number][] = [
  [-20, -20],
  [20, -20],
  [20, 20],
  [-20, 20],
];

/** The same square, wound the other way. */
const clockwise: [number, number][] = [...anticlockwise].reverse();

describe('naming a bearing', () => {
  it('rounds to the eight points', () => {
    expect(compassOf(0)).toBe('North');
    expect(compassOf(90)).toBe('East');
    expect(compassOf(180)).toBe('South');
    expect(compassOf(270)).toBe('West');
    expect(compassOf(44)).toBe('North-east');
    expect(compassOf(359)).toBe('North');
  });
});

describe('the sides of a building', () => {
  it('finds four on a square, whichever way the ring is wound', () => {
    for (const ring of [anticlockwise, clockwise]) {
      const sides = facadesOf([box(ring)]);
      expect(sides).toHaveLength(4);
      expect(sides.map((s) => s.compass).sort()).toEqual(
        ['East', 'North', 'South', 'West'].sort(),
      );
    }
  });

  it('points each side away from the middle, not into it', () => {
    /*
     * The test the sign error fails. The north side is the one at +20 north,
     * and it must FACE north — outward from the centre of the footprint.
     */
    for (const ring of [anticlockwise, clockwise]) {
      const north = facadesOf([box(ring)]).find((s) => s.compass === 'North')!;
      expect(north.midpointEN[1]).toBeGreaterThan(0);
      expect(north.bearingDeg).toBeCloseTo(0, 5);

      const west = facadesOf([box(ring)]).find((s) => s.compass === 'West')!;
      expect(west.midpointEN[0]).toBeLessThan(0);
      expect(west.bearingDeg).toBeCloseTo(270, 5);
    }
  });

  it('does not offer sides the building does not have', () => {
    const sides = facadesOf([box(anticlockwise)]);
    expect(sides.some((s) => s.compass === 'North-east')).toBe(false);
  });

  it('reports the longest side first', () => {
    // A slab: long east and west walls, short north and south ones.
    const slab: [number, number][] = [
      [-10, -60],
      [10, -60],
      [10, 60],
      [-10, 60],
    ];
    const sides = facadesOf([box(slab)]);
    expect(['East', 'West']).toContain(sides[0].compass);
    expect(sides[0].lengthM).toBeGreaterThan(sides[3].lengthM);
  });

  it('ignores a corner splay too small to live behind', () => {
    // A square with one corner cut off by a 2 m chamfer.
    const chamfered: [number, number][] = [
      [-20, -20],
      [18, -20],
      [20, -18],
      [20, 20],
      [-20, 20],
    ];
    const sides = facadesOf([box(chamfered)]);
    expect(sides.some((s) => s.compass === 'South-east')).toBe(false);
  });

  it('has nothing to say about a building with no footprint', () => {
    expect(facadesOf([])).toEqual([]);
  });
});

describe('placing a window on a side', () => {
  const parts = [box(anticlockwise, 10, 70)]; // 60 m tall, base at 10 AHD
  const north = facadesOf(parts).find((s) => s.compass === 'North')!;

  it('stands the point clear of the wall, on the outside', () => {
    const place = windowPlace(parts, north, 1, 20)!;
    expect(place.en[1]).toBeGreaterThan(20);
    expect(place.en[1]).toBeLessThan(21);
    expect(place.facingDeg).toBeCloseTo(0, 5);
  });

  it('divides the building by its storeys when the record has them', () => {
    // 60 m over 20 storeys is 3 m a floor; floor 1 is the sill above the base.
    const first = windowPlace(parts, north, 1, 20)!;
    const tenth = windowPlace(parts, north, 10, 20)!;
    expect(first.ahdM).toBeCloseTo(10 + 1.2, 5);
    expect(tenth.ahdM).toBeCloseTo(10 + 3 * 9 + 1.2, 5);
    expect(first.floorHeightAssumed).toBe(false);
  });

  it('falls back to an assumed floor height, and says that it did', () => {
    const place = windowPlace(parts, north, 5, null)!;
    expect(place.ahdM).toBeCloseTo(10 + ASSUMED_FLOOR_M * 4 + 1.2, 5);
    expect(place.floorHeightAssumed).toBe(true);
  });

  it('refuses a floor the building does not have', () => {
    expect(windowPlace(parts, north, 21, 20)).toBeNull();
    expect(windowPlace(parts, north, 0, 20)).toBeNull();
    expect(windowPlace(parts, north, 2.5, 20)).toBeNull();
  });

  it('refuses a floor that would sit above the roof when guessing', () => {
    // 60 m of building at an assumed 3 m a floor runs out after 20.
    expect(windowPlace(parts, north, 19, null)).not.toBeNull();
    expect(windowPlace(parts, north, 40, null)).toBeNull();
  });
});

describe('a tower standing on a podium', () => {
  /*
   * The fault this guards. A podium is wide and a tower is not, so the
   * largest ring in the building belongs to the podium — and choosing the
   * outline by area alone put EVERY window, on every floor, on the podium's
   * edge. For a flat halfway up that is a point in mid-air beside the
   * building, and the sunlight measured there belongs to nobody.
   */
  const podium = box(
    [
      [-60, -60],
      [60, -60],
      [60, 60],
      [-60, 60],
    ],
    0,
    20,
  );
  const tower = box(
    [
      [-15, -15],
      [15, -15],
      [15, 15],
      [-15, 15],
    ],
    0,
    120,
  );
  const parts = [podium, tower];

  it('describes the podium down at its own level', () => {
    const low = facadesOf(parts, 10);
    const north = low.find((s) => s.compass === 'North')!;
    expect(north.midpointEN[1]).toBeCloseTo(60, 5);
  });

  it('describes the TOWER once above the podium', () => {
    const high = facadesOf(parts, 80);
    const north = high.find((s) => s.compass === 'North')!;
    expect(north.midpointEN[1]).toBeCloseTo(15, 5);
  });

  it('puts a high window on the tower, not out over the podium edge', () => {
    const ahdM = floorAhdM(parts, 30, 40)!;
    const sides = facadesOf(parts, ahdM);
    const place = windowPlace(parts, sides.find((s) => s.compass === 'North')!, 30, 40)!;

    // The tower's north wall is at 15 m; the podium's is at 60.
    expect(place.en[1]).toBeGreaterThan(15);
    expect(place.en[1]).toBeLessThan(17);
  });

  it('agrees about the height whether asked directly or through a place', () => {
    const direct = floorAhdM(parts, 12, 40);
    const sides = facadesOf(parts, direct ?? undefined);
    const place = windowPlace(parts, sides[0], 12, 40);
    expect(place!.ahdM).toBeCloseTo(direct!, 8);
  });
});

describe('getting the measurement out of the wall', () => {
  /*
   * A large building is several overlapping parts, and the side taken from
   * its outline can have another wing of the SAME building standing on it.
   * Stepping out of that is fine. Stepping out through a NEIGHBOUR is not,
   * and that distinction is the whole of this.
   */
  const host = box(
    [
      [-20, -20],
      [20, -20],
      [20, 20],
      [-20, 20],
    ],
    0,
    60,
  );
  /** A wing of the same building, two metres deep, over the north wall. */
  const wing = box(
    [
      [-5, 18],
      [5, 18],
      [5, 22],
      [-5, 22],
    ],
    0,
    60,
  );

  const north = facadesOf([host]).find((s) => s.compass === 'North')!;
  const at = () => windowPlace([host], north, 5, 20)!;

  it('steps out of a wing of its own building', () => {
    const inside = at();
    expect(inside.en[1]).toBeCloseTo(20.5, 5);

    const freed = clearOfBuildings(inside, [host, wing], [])!;
    expect(freed).not.toBeNull();
    // 22 is the wing's far edge; the boundary itself counts as open air.
    expect(freed.en[1]).toBeGreaterThanOrEqual(22);
    expect(freed.en[1]).toBeLessThan(23);
  });

  it('REFUSES to step out through a neighbour', () => {
    /*
     * The fault this replaces. A point inside a neighbour was walked out to
     * just beyond it, and the obstruction to the north went from 87 degrees
     * to nothing — the panel reported the sunlight on the far side of a
     * building as the sunlight at somebody's window.
     *
     * The flat is BEHIND that neighbour. There is no honest measurement to
     * take on this side, and null is the only true answer.
     */
    const neighbour = box(
      [
        [-5, 20],
        [5, 20],
        [5, 23],
        [-5, 23],
      ],
      0,
      60,
    );
    expect(clearOfBuildings(at(), [host], [neighbour])).toBeNull();
  });

  it('does not step OVER a thin neighbour between two samples', () => {
    /*
     * The walk is a swept path approximated by points, so the step size is
     * the widest thing that can hide between two of them. A review slid a
     * neighbour 0.2 m thick through a half-metre step and came out the far
     * side reporting the sky beyond it.
     */
    const homeWing = box([[-5, 20], [5, 20], [5, 20.7], [-5, 20.7]], 0, 60);
    const thin = box([[-5, 20.75], [5, 20.75], [5, 20.95], [-5, 20.95]], 0, 60);

    /*
     * The rule is never to step THROUGH, not never to approach. Open air in
     * front of the home wing and behind the neighbour is a real place to
     * measure — the neighbour then shades it, as it shades the real window.
     * What must never happen is coming out on the FAR side at 20.95, where
     * the neighbour is behind the measurement instead of in front of it.
     */
    const freed = clearOfBuildings(at(), [host, homeWing], [thin])!;
    expect(freed).not.toBeNull();
    expect(freed.en[1]).toBeLessThan(20.75);
  });

  it('checks the half metre the window was already pushed out through', () => {
    // windowPlace offsets 0.5 m from the wall before this runs, and a
    // neighbour sitting in that gap used to be stepped straight over.
    const inTheGap = box([[-5, 20.1], [5, 20.1], [5, 20.3], [-5, 20.3]], 0, 60);
    expect(clearOfBuildings(at(), [host], [inTheGap])).toBeNull();
  });

  it('leaves a point that is already in open air where it is', () => {
    const place = at();
    const freed = clearOfBuildings(place, [host], [])!;
    expect(freed.en[1]).toBeCloseTo(place.en[1], 5);
  });

  it('refuses rather than teleporting out of a deep wing', () => {
    const slab = box(
      [
        [-40, 18],
        [40, 18],
        [40, 60],
        [-40, 60],
      ],
      0,
      60,
    );
    expect(clearOfBuildings(at(), [host, slab], [])).toBeNull();
  });

  it('treats a courtyard as open air, not as solid', () => {
    const doughnut: Massing = {
      ...host,
      footprint: [
        [
          [
            [-40, -40],
            [40, -40],
            [40, 40],
            [-40, 40],
          ],
          [
            [-10, -10],
            [10, -10],
            [10, 10],
            [-10, 10],
          ],
        ],
      ],
    };
    const inCourtyard = { ...at(), en: [0, 0] as [number, number] };
    const freed = clearOfBuildings(inCourtyard, [doughnut], []);
    expect(freed).not.toBeNull();
    expect(freed!.en).toEqual([0, 0]);
  });
});

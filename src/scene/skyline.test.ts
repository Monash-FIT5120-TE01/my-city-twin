import { describe, expect, it } from 'vitest';
import { bearingGap, buildSkyline, sunReaches, HORIZON_BUCKETS } from './skyline';
import type { Massing } from '../data/model';

/*
 * The skyline is the whole of the room-sunlight answer compressed into one
 * array, so these check the compression rather than the wrapper around it:
 * that a wall blocks the direction it stands in and no other, that height and
 * distance trade off the way they must, and that a window only sees the half
 * of the sky its wall faces.
 */

/** A box of the given size, centred on a point, standing to `topAhdM`. */
function block(
  centreE: number,
  centreN: number,
  sizeM: number,
  topAhdM: number,
): Massing {
  const h = sizeM / 2;
  return {
    id: `b${centreE},${centreN}`,
    parentId: 'test',
    footprint: [
      [
        [
          [centreE - h, centreN - h],
          [centreE + h, centreN - h],
          [centreE + h, centreN + h],
          [centreE - h, centreN + h],
        ],
      ],
    ],
    baseAhdM: 0,
    topAhdM,
    heightM: topAhdM,
    areaM2: 0,
    sinksToGround: true,
  };
}

describe('bearing arithmetic', () => {
  it('measures the short way round the compass', () => {
    expect(bearingGap(10, 350)).toBe(20);
    expect(bearingGap(350, 10)).toBe(20);
    expect(bearingGap(0, 180)).toBe(180);
    expect(bearingGap(90, 90)).toBe(0);
  });
});

describe('the skyline a viewpoint sees', () => {
  it('is open sky when nothing is standing anywhere', () => {
    const skyline = buildSkyline([0, 0], 0, []);
    expect(skyline).toHaveLength(HORIZON_BUCKETS);
    expect([...skyline].every((altitude) => altitude === 0)).toBe(true);
  });

  it('raises only the directions a building actually stands in', () => {
    // A block 100 m due north, 20 m across, 50 m tall.
    const skyline = buildSkyline([0, 0], 0, [block(0, 100, 20, 50)]);

    // North is blocked...
    expect(skyline[0]).toBeGreaterThan(20);
    // ...and the opposite side of the compass is not.
    expect(skyline[180]).toBe(0);
    expect(skyline[90]).toBe(0);
    expect(skyline[270]).toBe(0);
  });

  it('puts the blocked altitude where the trigonometry says', () => {
    /*
     * 50 m of building at 100 m: the roofline sits at atan(50/100), which is
     * 26.6 degrees. The nearest face is at 90 m, so due north the bucket
     * should read atan(50/90) = 29.1 rather than the centre's 26.6.
     */
    const skyline = buildSkyline([0, 0], 0, [block(0, 100, 20, 50)]);
    expect(skyline[0]).toBeCloseTo((Math.atan2(50, 90) * 180) / Math.PI, 0);
  });

  it('ignores anything no taller than the viewpoint', () => {
    // The same block, seen from a window level with its roof.
    const skyline = buildSkyline([0, 0], 50, [block(0, 100, 20, 50)]);
    expect([...skyline].every((altitude) => altitude === 0)).toBe(true);
  });

  it('shrinks what a building blocks as the viewpoint climbs', () => {
    const tower = block(0, 100, 20, 80);
    const fromStreet = buildSkyline([0, 0], 0, [tower])[0];
    const fromUpstairs = buildSkyline([0, 0], 40, [tower])[0];
    expect(fromUpstairs).toBeGreaterThan(0);
    expect(fromUpstairs).toBeLessThan(fromStreet);
  });

  it('reads a wider span for the same building seen from closer', () => {
    const near = buildSkyline([0, 0], 0, [block(0, 60, 40, 60)]);
    const far = buildSkyline([0, 0], 0, [block(0, 400, 40, 60)]);
    const spanOf = (s: Float32Array) => [...s].filter((a) => a > 0).length;
    expect(spanOf(near)).toBeGreaterThan(spanOf(far));
  });

  it('handles a building that straddles due north without a gap', () => {
    /*
     * The wrap at 0/360 is the one place bucket arithmetic goes wrong, and
     * the symptom is a sliver of false open sky pointing exactly north.
     */
    const skyline = buildSkyline([0, 0], 0, [block(0, 50, 60, 40)]);
    for (const bucket of [358, 359, 0, 1, 2]) {
      expect(skyline[bucket]).toBeGreaterThan(0);
    }
  });
});

describe('whether the sun reaches the viewpoint', () => {
  const skyline = buildSkyline([0, 0], 0, [block(0, 100, 20, 50)]);

  it('says no when the sun is below the horizon at all', () => {
    expect(sunReaches(skyline, { altitudeDeg: -3, azimuthDeg: 180 })).toBe(false);
  });

  it('lets high sun over a building it cannot clear low', () => {
    expect(sunReaches(skyline, { altitudeDeg: 15, azimuthDeg: 0 })).toBe(false);
    expect(sunReaches(skyline, { altitudeDeg: 45, azimuthDeg: 0 })).toBe(true);
  });

  it('leaves the open directions open', () => {
    expect(sunReaches(skyline, { altitudeDeg: 5, azimuthDeg: 180 })).toBe(true);
  });

  /*
   * A window is not a spot on the ground: it is a hole in a wall, and the
   * wall is behind it. Without this an east-facing flat would be credited
   * with the whole afternoon.
   */
  it('closes the half of the sky behind a window', () => {
    const open = buildSkyline([0, 0], 20, []);
    const east = 90;
    expect(sunReaches(open, { altitudeDeg: 30, azimuthDeg: 90 }, east)).toBe(true);
    expect(sunReaches(open, { altitudeDeg: 30, azimuthDeg: 30 }, east)).toBe(true);
    expect(sunReaches(open, { altitudeDeg: 30, azimuthDeg: 200 }, east)).toBe(false);
    expect(sunReaches(open, { altitudeDeg: 30, azimuthDeg: 270 }, east)).toBe(false);
  });

  it('treats exactly along the wall as behind it', () => {
    // Grazing incidence delivers nothing, and counting it as sun would put
    // an hour of "direct sun" on a window the sun only ever skims.
    const open = buildSkyline([0, 0], 20, []);
    expect(sunReaches(open, { altitudeDeg: 30, azimuthDeg: 180 }, 90)).toBe(false);
    expect(sunReaches(open, { altitudeDeg: 30, azimuthDeg: 0 }, 90)).toBe(false);
  });
});

describe('no sky where there is a wall', () => {
  /*
   * ── THE LEAK THIS REPLACED ──────────────────────────────────────────────
   *
   * The first version stepped along each edge and binned the samples. The
   * step was taken from the distance to the edge's MIDDLE, so an edge seen
   * end-on -- its nearest point metres away, its middle far off -- was
   * sampled far too coarsely and the samples skipped whole buckets between
   * them. A review ran it against a wall two metres away and found 88
   * buckets still reading zero with a solid building across them.
   *
   * These are that reproduction. A bucket the building spans must be blocked;
   * "mostly blocked" is a wall with holes in it, and the sun comes through
   * holes.
   */
  const gapsAcross = (skyline: Float32Array, from: number, to: number) => {
    const empty: number[] = [];
    for (let bucket = from; bucket <= to; bucket++) {
      const wrapped = ((bucket % 360) + 360) % 360;
      if (skyline[wrapped] === 0) empty.push(wrapped);
    }
    return empty;
  };

  it('leaves no gap in a wall standing right in front of the viewpoint', () => {
    // 40 m tall, spanning 20 m of east, its near face one metre away.
    const wall = block(0, 1.5, 0, 0);
    const near: Massing = {
      ...wall,
      footprint: [
        [
          [
            [-10, 1],
            [10, 1],
            [10, 2],
            [-10, 2],
          ],
        ],
      ],
      topAhdM: 40,
      heightM: 40,
    };

    const skyline = buildSkyline([0, 0], 2, [near]);

    // The wall spans from atan2(-10,1) to atan2(10,1): roughly 275 to 85.
    expect(gapsAcross(skyline, -80, 80)).toEqual([]);
  });

  it('leaves no gap in a very wide wall, where the sample cap used to bite', () => {
    const wide: Massing = {
      id: 'wide',
      parentId: 'wide',
      footprint: [
        [
          [
            [-200, 3],
            [200, 3],
            [200, 8],
            [-200, 8],
          ],
        ],
      ],
      baseAhdM: 0,
      topAhdM: 60,
      heightM: 60,
      areaM2: 0,
      sinksToGround: true,
    };

    const skyline = buildSkyline([0, 0], 2, [wide]);
    expect(gapsAcross(skyline, -85, 85)).toEqual([]);
  });

  it('does not block the sky behind the viewpoint', () => {
    // The same near wall. Due south of it there is nothing, and a wall that
    // blocked all round would be a different bug with the same symptom.
    const near: Massing = {
      id: 'n',
      parentId: 'n',
      footprint: [[[[-10, 1], [10, 1], [10, 2], [-10, 2]]]],
      baseAhdM: 0,
      topAhdM: 40,
      heightM: 40,
      areaM2: 0,
      sinksToGround: true,
    };
    const skyline = buildSkyline([0, 0], 2, [near]);
    expect(skyline[180]).toBe(0);
  });

  it('agrees with the trigonometry for a wall straight ahead', () => {
    const near: Massing = {
      id: 'n',
      parentId: 'n',
      footprint: [[[[-50, 20], [50, 20], [50, 25], [-50, 25]]]],
      baseAhdM: 0,
      topAhdM: 45,
      heightM: 45,
      areaM2: 0,
      sinksToGround: true,
    };
    // Due north the near face is 20 m away and rises 40 m above a 5 m window.
    const skyline = buildSkyline([0, 0], 5, [near]);
    expect(skyline[0]).toBeCloseTo((Math.atan2(40, 20) * 180) / Math.PI, 0);
  });
});

describe('a bucket is a band of directions, not a direction', () => {
  /*
   * ── THE TWO WAYS THIS WENT WRONG ────────────────────────────────────────
   *
   * A bucket stands for one degree of sky, and the wall inside it has to be
   * measured where it is NEAREST, not where a single ray happens to cross.
   *
   * Testing the middle ray alone left the buckets at each end of an arc
   * empty, because there the ray passes the corner and misses. Patching that
   * by writing each corner's own distance into its bucket over-corrected: a
   * corner a metre away handed its steep angle to a whole bucket the wall
   * only clips the edge of. A review found both, in the same build.
   */

  it('does not let a corner lend its angle to a bucket the wall only clips', () => {
    /*
     * A long wall starting 0.1 m to the east, and a
     * tiny hole near its inner face. The hole is nowhere near bearing 0.5,
     * and must not raise the bucket that contains it beyond what the wall
     * there actually subtends.
     */
    const withHole: Massing = {
      id: 'h',
      parentId: 'h',
      footprint: [
        [
          [
            [0.1, 1],
            [10, 1],
            [10, 100],
            [0.1, 100],
          ],
          [
            [0.11, 7],
            [0.12, 7],
            [0.12, 8],
            [0.11, 8],
          ],
        ],
      ],
      baseAhdM: 0,
      topAhdM: 10,
      heightM: 10,
      areaM2: 0,
      sinksToGround: true,
    };
    const withoutHole: Massing = {
      ...withHole,
      footprint: [[withHole.footprint[0][0]]],
    };

    const holed = buildSkyline([0, 0], 0, [withHole]);
    const solid = buildSkyline([0, 0], 0, [withoutHole]);

    // A courtyard ring inside a solid block changes nothing seen from outside.
    expect(holed[0]).toBeCloseTo(solid[0], 6);
  });

  it('measures the wall where it is nearest inside the bucket', () => {
    /*
     * A wall running away from the viewpoint. Bucket 0 covers bearings 0 to
     * 1 degree; the nearest the wall comes in that band is its own corner at
     * 20 m, so the bucket must read atan(30/20) and not the far end's angle.
     */
    const wall: Massing = {
      id: 'w',
      parentId: 'w',
      footprint: [[[[0.2, 20], [0.2, 400], [3, 400], [3, 20]]]],
      baseAhdM: 0,
      topAhdM: 30,
      heightM: 30,
      areaM2: 0,
      sinksToGround: true,
    };
    const skyline = buildSkyline([0, 0], 0, [wall]);
    expect(skyline[0]).toBeCloseTo((Math.atan2(30, 20) * 180) / Math.PI, 0);
  });
});

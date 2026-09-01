import { describe, expect, it } from 'vitest';
import { GRID_DIRECTIONS, ROADS, streetLabelsNear } from './streets';

/*
 * The road surfaces and the street names come from the same measured grid, so
 * the thing worth pinning is that they still agree: every named street must
 * have a carriageway under it, or a name ends up floating over a block.
 */

const NAMED_WITH_ROADS = [
  'La Trobe Street',
  'Lonsdale Street',
  'Bourke Street',
  'Collins Street',
  'Flinders Street',
  'Spencer Street',
  'King Street',
  'William Street',
  'Queen Street',
  'Elizabeth Street',
  'Swanston Street',
  'Russell Street',
];

describe('carriageways', () => {
  it('follows one of the two grid directions', () => {
    for (const road of ROADS) {
      expect(['long', 'cross']).toContain(road.axis);
    }
  });

  it('uses the two Hoddle widths and nothing else', () => {
    const widths = new Set(ROADS.map((r) => r.widthM));
    expect([...widths].sort((a, b) => a - b)).toEqual([10.1, 30.2]);
  });

  it('has a road beneath every named street', () => {
    const labels = streetLabelsNear(0, 0);
    for (const name of NAMED_WITH_ROADS) {
      const label = labels.find((l) => l.name === name)!;
      const [offE, offN] =
        label.axis === 'long' ? GRID_DIRECTIONS.cross : GRID_DIRECTIONS.long;
      const labelOffset = label.east * offE + label.north * offN;

      const road = ROADS.find(
        (r) => r.axis === label.axis && Math.abs(r.offsetM - labelOffset) < 0.5,
      );
      expect(road, `no carriageway under ${name}`).toBeDefined();
      // Names go on the main streets, which are the wide ones.
      expect(road!.widthM).toBe(30.2);
    }
  });

  it('keeps the lanes narrower than the streets they serve', () => {
    const lanes = ROADS.filter((r) => r.widthM === 10.1);
    expect(lanes).toHaveLength(4);
    for (const lane of lanes) {
      expect(lane.axis).toBe('long');
    }
  });

  it('spaces the long carriageways roughly a block apart', () => {
    const offsets = ROADS.filter((r) => r.axis === 'long' && r.widthM === 30.2)
      .map((r) => r.offsetM)
      .sort((a, b) => a - b);

    for (let i = 1; i < offsets.length; i++) {
      const gap = offsets[i] - offsets[i - 1];
      expect(gap).toBeGreaterThan(150);
      expect(gap).toBeLessThan(300);
    }
  });

  it('puts a lane between each pair of long streets', () => {
    const main = ROADS.filter((r) => r.axis === 'long' && r.widthM === 30.2)
      .map((r) => r.offsetM)
      .sort((a, b) => a - b);
    const lanes = ROADS.filter((r) => r.axis === 'long' && r.widthM === 10.1)
      .map((r) => r.offsetM)
      .sort((a, b) => a - b);

    expect(lanes).toHaveLength(main.length - 1);
    for (let i = 0; i < lanes.length; i++) {
      expect(lanes[i]).toBeGreaterThan(main[i]);
      expect(lanes[i]).toBeLessThan(main[i + 1]);
    }
  });
});

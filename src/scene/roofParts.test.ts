import { describe, expect, it } from 'vitest';
import type { Massing } from '../data/model';
import { usableRoof } from './roofParts';
import { possibleShaders } from './solarShade';

/** A box-shaped part: x0..x1 east, y0..y1 north, base..top m AHD. */
function box(id: string, x0: number, y0: number, x1: number, y1: number, base: number, top: number, parentId = 'b'): Massing {
  return {
    id, parentId, baseAhdM: base, topAhdM: top, heightM: top - base, areaM2: (x1 - x0) * (y1 - y0), sinksToGround: base === 0,
    footprint: [[[[x0, y0], [x1, y0], [x1, y1], [x0, y1], [x0, y0]]]],
  };
}

describe('roof a panel could go on', () => {
  it('keeps a strip only if it is at least a whole panel long', () => {
    // 1.8 m wide strips: one 1.75 m long (shorter than the 1.762 m panel), one 2.0 m long
    const short = usableRoof([box('a', 0, 0, 1.75, 1.75, 0, 10)], { minPieceM2: 0 });
    const long = usableRoof([box('a', 0, 0, 2.0, 1.25, 0, 10)], { minPieceM2: 0 });
    expect(short.areaM2).toBe(0);
    expect(long.areaM2).toBeGreaterThan(2);
  });

  it('puts every shade sample point on a kept cell', () => {
    // an L-shaped roof: blocks at the inner corner are not square
    const parts = [box('a', 0, 0, 20, 6, 0, 10), box('b', 0, 6, 6, 20, 0, 10)];
    const r = usableRoof(parts, { blockM: 1, minPieceM2: 0 });
    for (const b of r.blocks!) {
      const [x, y] = b.centre;
      const onRoof = (x >= 0 && x <= 20 && y >= 0 && y <= 6) || (x >= 0 && x <= 6 && y >= 6 && y <= 20);
      expect(onRoof).toBe(true);
    }
  });

  it('does not take a separate small block for a plant room just because the boxes overlap', () => {
    // an L-shaped podium whose bounding box covers a small part that stands beside it, not on it
    const podium: Massing = {
      ...box('p', 0, 0, 40, 40, 0, 20),
      footprint: [[[[0, 0], [40, 0], [40, 10], [10, 10], [10, 40], [0, 40], [0, 0]]]],
      areaM2: 700,
    };
    const beside = box('s', 25, 25, 30, 30, 20, 24);   // in the L's empty corner, base level with the podium's top
    const r = usableRoof([podium, beside], { minPieceM2: 0 });
    expect(r.plantM2).toBe(0);
  });
});

describe('what could shade a roof', () => {
  it('counts a long wall that passes close even when both its ends are far away', () => {
    const roof = usableRoof([box('r', 0, 0, 10, 10, 0, 10, 'roof')], { blockM: 1 });
    // a 1,000 m long slab 30 m north of the roof, only 2 m taller: reach at 2 degrees is about 57 m
    const wall = box('w', -500, 40, 500, 45, 0, 12, 'wall');
    expect(possibleShaders(roof.blocks!, [wall])).toHaveLength(1);
  });
});

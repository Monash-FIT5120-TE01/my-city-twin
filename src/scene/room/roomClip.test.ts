import { describe, expect, it } from 'vitest';
import { Vector3 } from 'three';
import { enuToWorld } from '../frame';
import { CUT_BOX } from './apartmentLayout';
import { insideCut, roomClipPlanes } from './roomClip';
import { toEN, type RoomPlacement } from './roomPlacement';

/** A point given in the flat's own frame, as a three.js world point. */
function world(p: RoomPlacement, x: number, y: number, z: number): Vector3 {
  const [e, n] = toEN(p, x, y);
  return new Vector3(...enuToWorld([e, n, p.floorAhdM + z]));
}

const facings: [string, number][] = [['east', 0], ['north', 90], ['west', 180], ['south', 270], ['thirty', 30]];

describe('the block cut out of the building for the flat', () => {
  for (const [name, deg] of facings) {
    const p: RoomPlacement = { originEN: [120.5, -48.25], angle: (deg * Math.PI) / 180, floorAhdM: 61.5, side: name };
    const planes = roomClipPlanes(p);

    it(`removes the inside of the flat (facade looking ${name})`, () => {
      for (const [x, y, z] of [[3.6, 3.4, 1.4], [0.1, 0.1, 0.1], [7.3, 6.8, 2.7], [5.6, 5.2, 2.0]]) {
        expect(insideCut(planes, world(p, x, y, z))).toBe(true);
      }
    });

    it(`keeps the building just outside it (facade looking ${name})`, () => {
      const outside: [number, number, number][] = [
        [CUT_BOX.x1 + 0.05, 3.4, 1.4], // beyond the facade: the balcony side, open air
        [CUT_BOX.x0 - 0.05, 3.4, 1.4], // behind the flat: the corridor side
        [3.6, CUT_BOX.y0 - 0.05, 1.4], // the neighbour to the south
        [3.6, CUT_BOX.y1 + 0.05, 1.4], // the neighbour to the north
        [3.6, 3.4, CUT_BOX.z0 - 0.05], // the storey below
        [3.6, 3.4, CUT_BOX.z1 + 0.05], // the storey above
      ];
      for (const [x, y, z] of outside) expect(insideCut(planes, world(p, x, y, z))).toBe(false);
    });
  }
});

import { describe, expect, it } from 'vitest';
import { blocked, slide } from '../obstacles';
import { roomObstacles } from './roomObstacles';
import type { RoomPlacement } from './roomPlacement';

/** The flat's own frame: east/north are its local x/y. */
const HERE: RoomPlacement = { originEN: [0, 0], angle: 0, floorAhdM: 0, side: 'East' };
/** Turned to face north-west, somewhere else: the same walls must still be met. */
const TURNED: RoomPlacement = { originEN: [312.4, -88.1], angle: (135 * Math.PI) / 180, floorAhdM: 40, side: 'North-west' };
const BODY = 0.2;

function standsAt(index: ReturnType<typeof roomObstacles>, e: number, n: number): boolean {
  return ![[0, 0], [BODY, 0], [-BODY, 0], [0, BODY], [0, -BODY]].some(([de, dn]) => blocked(index, e + de, n + dn));
}

/** Everywhere a walker can get to from `start`, on a 5 cm grid, moving the way StreetView does (slide). */
function reachable(index: ReturnType<typeof roomObstacles>, start: [number, number]): Set<string> {
  const STEP = 0.05;
  const key = (e: number, n: number) => `${Math.round(e / STEP)},${Math.round(n / STEP)}`;
  const seen = new Set([key(...start)]);
  const queue: [number, number][] = [start];
  while (queue.length) {
    const [e, n] = queue.pop()!;
    for (const [de, dn] of [[STEP, 0], [-STEP, 0], [0, STEP], [0, -STEP]]) {
      const [ne, nn] = slide(index, e, n, e + de, n + dn);
      if (ne === e && nn === n) continue;
      if (ne < -3 || ne > 12 || nn < -3 || nn > 10) continue;
      const k = key(ne, nn);
      if (!seen.has(k)) {
        seen.add(k);
        queue.push([ne, nn]);
      }
    }
  }
  return seen;
}
const near = (seen: Set<string>, e: number, n: number) => {
  for (let de = -2; de <= 2; de++) for (let dn = -2; dn <= 2; dn++) if (seen.has(`${Math.round(e / 0.05) + de},${Math.round(n / 0.05) + dn}`)) return true;
  return false;
};

describe("the flat's walls and furniture", () => {
  const index = roomObstacles(HERE);
  const start: [number, number] = [4.6, 1.6];

  it('the place the walker starts is free', () => {
    expect(standsAt(index, ...start)).toBe(true);
  });

  it('the furniture does not stop the walker; the balcony rail does', () => {
    expect(blocked(index, 5.6, 5.6)).toBe(false);    // the bed
    expect(blocked(index, 6.0, 1.9)).toBe(false);    // the coffee table
    expect(blocked(index, 6.0, 3.0)).toBe(false);    // the sofa
    expect(blocked(index, 9.27, 1.7)).toBe(true);    // the rail's glass
  });

  const seen = reachable(index, start);
  for (const [room, e, n] of [
    ['the kitchen', 2.0, 1.0],
    ['the bedroom', 4.5, 4.4],
    ['the bathroom', 1.2, 4.6],
    ['the laundry', 0.8, 3.0],
    ['the hall by the front door', 0.6, 2.3],
    ['the balcony', 8.0, 2.8],
  ] as const) {
    it(`walks through the doors to ${room}`, () => {
      expect(near(seen, e, n)).toBe(true);
    });
  }

  // at 0.35 m a side (the street's walker) every one of these stopped at the frame (2026-10-18)
  for (const [door, at, off, deg] of [
    ['the bedroom', [4.5, 3.55], 0.15, 90],
    ['the bedroom', [4.5, 3.55], -0.15, 135],
    ['the bedroom', [4.5, 3.55], 0, 30],
    ['the bathroom', [2.15, 3.95], 0.15, 90],
  ] as const) {
    it(`walks through the door to ${door}, ${off} m off its middle at ${deg}°, without catching on the frame`, () => {
      const a = (deg * Math.PI) / 180;
      const [dx, dy] = [Math.cos(a) * 0.04, Math.sin(a) * 0.04];
      let [e, n] = [at[0] + off - dx * 37, at[1] - dy * 37];
      for (let k = 0; k < 120; k++) [e, n] = slide(index, e, n, e + dx, n + dy);
      expect(n).toBeGreaterThan(at[1] + 0.4);
    });
  }

  it('never gets out: not past the rail, not through the walls or the glass', () => {
    for (const k of seen) {
      const [e, n] = k.split(',').map((v) => Number(v) * 0.05);
      expect(e > -0.2 && e < 9.25 && n > -0.2 && n < 7.0).toBe(true);
    }
    expect(near(seen, 10.5, 1.75)).toBe(false);      // beyond the rail
    expect(near(seen, 8.4, 5.0)).toBe(false);        // outside, north of the balcony
    expect(near(seen, -1.0, 2.3)).toBe(false);       // through the closed front door
  });

  it('turned and moved, the same walls stand in the same places', () => {
    const t = roomObstacles(TURNED);
    const at = (x: number, y: number): [number, number] => {
      const c = Math.cos(TURNED.angle), s = Math.sin(TURNED.angle);
      return [TURNED.originEN[0] + x * c - y * s, TURNED.originEN[1] + x * s + y * c];
    };
    expect(blocked(t, ...at(2.65, 4.5))).toBe(true);    // the bathroom's east wall
    expect(blocked(t, ...at(9.27, 1.7))).toBe(true);
    expect(standsAt(t, ...at(4.6, 1.6))).toBe(true);
  });
});

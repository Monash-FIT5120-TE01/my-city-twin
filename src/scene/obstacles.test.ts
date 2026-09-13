import { describe, expect, it } from 'vitest';
import { blocked, indexObstacles, nearestFree, slide } from './obstacles';
import type { PolygonEN } from '../data/model';

const square = (e: number, n: number, size: number): PolygonEN => [
  [
    [e, n],
    [e + size, n],
    [e + size, n + size],
    [e, n + size],
    [e, n],
  ],
];

const part = (footprint: PolygonEN, baseAhdM: number, topAhdM: number, sinksToGround = false) => ({
  footprint: [footprint],
  baseAhdM,
  topAhdM,
  sinksToGround,
});

describe('what blocks a walker', () => {
  it('stops them inside a building and lets them past outside it', () => {
    const index = indexObstacles([part(square(0, 0, 20), 10, 60)], 12);
    expect(blocked(index, 10, 10)).toBe(true);
    expect(blocked(index, 30, 10)).toBe(false);
  });

  it('ignores a part that is entirely overhead', () => {
    // A roof plane forty metres up is not something a person walks into, and
    // treating it as one walls off arcades that are genuinely open.
    const index = indexObstacles([part(square(0, 0, 20), 40, 60)], 12);
    expect(index.count).toBe(0);
    expect(blocked(index, 10, 10)).toBe(false);
  });

  it('stops them at a building whose recorded base is above the ground', () => {
    /*
     * 7.2% of buildings record a base above the ground plane and are drawn
     * sunk onto it anyway. The walker has to meet the building that is
     * there, not the one the numbers describe.
     */
    const index = indexObstacles([part(square(0, 0, 20), 40, 90, true)], 12);
    expect(blocked(index, 10, 10)).toBe(true);
  });

  it('finds a building across a grid boundary', () => {
    // Fifty-metre cells; this one spans four of them.
    const index = indexObstacles([part(square(40, 40, 20), 10, 60)], 12);
    expect(blocked(index, 55, 55)).toBe(true);
    expect(blocked(index, 45, 45)).toBe(true);
  });
});

describe('sliding along a wall', () => {
  const index = indexObstacles([part(square(0, 0, 20), 10, 60)], 12);

  it('lets a clear move through untouched', () => {
    expect(slide(index, 30, 30, 32, 32)).toEqual([32, 32]);
  });

  it('keeps the component that is not blocked', () => {
    // Walking north-east into the building's west wall should still carry
    // them north. Stopping dead reads as a bug rather than as a wall.
    const [e, n] = slide(index, -2, 5, 2, 9);
    expect(e).toBe(-2);
    expect(n).toBe(9);
  });

  it('refuses a move that is blocked every way', () => {
    expect(slide(index, 5, 5, 6, 6)).toEqual([5, 5]);
  });
});

describe('putting a walker down', () => {
  const index = indexObstacles([part(square(0, 0, 40), 10, 60)], 12);

  it('leaves a clear spot where it is', () => {
    expect(nearestFree(index, 60, 60)).toEqual([60, 60]);
  });

  it('takes a spot inside a building to just outside it', () => {
    /*
     * Choosing a building and walking into it starts the camera inside the
     * thing being examined — and with solid walls, stuck there. Twenty
     * metres in from the corner of a forty-metre block, the nearest air is
     * twenty metres away.
     */
    const free = nearestFree(index, 20, 20);
    expect(free).not.toBeNull();
    const [e, n] = free!;
    expect(index.count).toBe(1);
    expect(blocked(index, e, n)).toBe(false);
    expect(Math.hypot(e - 20, n - 20)).toBeLessThan(34);
  });

  it('says so rather than handing back a blocked point', () => {
    /*
     * Returning the point that was asked for looked harmless and was not:
     * nobody checked, so the walker was placed inside the building anyway
     * and could not move in any direction.
     */
    const walled = indexObstacles([part(square(-500, -500, 1000), 10, 60)], 12);
    expect(nearestFree(walled, 0, 0, 40)).toBeNull();
  });
});

import { describe, expect, it } from 'vitest';
import { groundArrowRotation } from './SunArrow';

/*
 * The arrow points where the light goes. Getting the sign wrong produces an
 * arrow that looks entirely plausible and points at the sun instead of away
 * from it — the same class of mistake that put the street names face-down.
 *
 * Each case checks where the arrow's tip actually lands in east/north metres,
 * which is the thing a viewer sees, rather than the angle in isolation.
 */

/** Where a 100 m arrow drawn along +x ends up after the rotation. */
function tip(sunAzimuthDeg: number): { east: number; north: number } {
  const r = groundArrowRotation(sunAzimuthDeg);
  return { east: 100 * Math.cos(r), north: 100 * Math.sin(r) };
}

describe('the ground arrow points where the shadow falls', () => {
  it('runs south when the sun is due north — the Melbourne midday case', () => {
    const { east, north } = tip(0);
    expect(north).toBeCloseTo(-100, 6);
    expect(east).toBeCloseTo(0, 6);
  });

  it('runs west when the sun is in the east', () => {
    const { east, north } = tip(90);
    expect(east).toBeCloseTo(-100, 6);
    expect(north).toBeCloseTo(0, 6);
  });

  it('runs east when the sun is in the west', () => {
    const { east, north } = tip(270);
    expect(east).toBeCloseTo(100, 6);
    expect(north).toBeCloseTo(0, 6);
  });

  it('runs south-east on a winter afternoon, when the sun is north-west', () => {
    const { east, north } = tip(315);
    expect(east).toBeGreaterThan(50);
    expect(north).toBeLessThan(-50);
  });

  it('never points at the sun', () => {
    for (let azimuth = 0; azimuth < 360; azimuth += 15) {
      const { east, north } = tip(azimuth);
      const towardsSun = {
        east: Math.sin((azimuth * Math.PI) / 180),
        north: Math.cos((azimuth * Math.PI) / 180),
      };
      // Opposite directions, so the dot product is the full negative length.
      const dot = (east * towardsSun.east + north * towardsSun.north) / 100;
      expect(dot).toBeCloseTo(-1, 6);
    }
  });
});

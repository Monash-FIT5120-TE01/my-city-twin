import { describe, expect, it } from 'vitest';
import { roomShadowOf } from './roomShadow';

describe("the sun's shadow map inside the flat", () => {
  // a city 1.6 km across, its middle 60 m up; the flat at its very edge, 70 m up
  const city = { centre: [0, 0, 60] as [number, number, number], extentM: 800 };
  const shadow = roomShadowOf([780, 0], 70, city);

  it('is centred on the flat, half-way up the room, and narrow', () => {
    expect(shadow.centre).toEqual([780, 0, 71.5]);
    expect(shadow.spanM).toBe(40);
  });

  it('still reaches a tower at the far edge of the city, from any sun', () => {
    // the frustum SunLight builds: the light 2.5 depths out, near and far 1.2 depths either side
    const distance = shadow.depthM * 2.5;
    const near = distance - shadow.depthM * 1.2;
    const far = distance + shadow.depthM * 1.2;
    const towerTops: [number, number, number][] = [[-780, 0, 300], [-500, 600, 250], [0, -790, 200], [780, 0, 0]];
    for (const azimuth of [0, 45, 90, 135, 180, 225, 270, 315]) {
      for (const altitude of [5, 30, 70]) {
        const a = (azimuth * Math.PI) / 180, h = (altitude * Math.PI) / 180;
        const toSun = [Math.sin(a) * Math.cos(h), Math.cos(a) * Math.cos(h), Math.sin(h)];
        for (const p of towerTops) {
          const along = (p[0] - shadow.centre[0]) * toSun[0] + (p[1] - shadow.centre[1]) * toSun[1] + (p[2] - shadow.centre[2]) * toSun[2];
          const depth = distance - along;
          expect(depth).toBeGreaterThan(near);
          expect(depth).toBeLessThan(far);
        }
      }
    }
  });

  it('keeps the bias to a couple of centimetres across that depth', () => {
    expect(-shadow.bias * shadow.depthM * 2.4).toBeCloseTo(0.02, 6);
  });
});

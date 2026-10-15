import { describe, expect, it } from 'vitest';
import { ACTIVITY_RAMP, FADE_T, glowOpacity, RAMP_GRADIENT, rampRgb } from './activityPalette';

const lin = (c: number) => {
  const v = c / 255;
  return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
};
const lightness = ([r, g, b]: [number, number, number]) => {
  const y = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  return y > 0.008856 ? 116 * Math.cbrt(y) - 16 : 903.3 * y;
};

describe('the activity colour ramp', () => {
  it('starts and ends on its stops', () => {
    const hex = ([r, g, b]: number[]) => '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');
    expect(hex(rampRgb(0))).toBe(ACTIVITY_RAMP[0]);
    expect(hex(rampRgb(1))).toBe(ACTIVITY_RAMP[ACTIVITY_RAMP.length - 1]);
    expect(hex(rampRgb(0.5))).toBe(ACTIVITY_RAMP[2]);
  });

  it('is darker with every step towards busy: more people is never lighter', () => {
    let previous = Infinity;
    for (let i = 0; i <= 100; i++) {
      const l = lightness(rampRgb(i / 100));
      // Rounded to whole 0–255 channels: allow that rounding, a fifth of an L* step, no more.
      expect(l).toBeLessThanOrEqual(previous + 0.2);
      previous = l;
    }
    expect(lightness(rampRgb(0)) - lightness(rampRgb(1))).toBeGreaterThan(30);
  });

  it('starts darker than anything on the map under it: buildings and parks, L* 87', () => {
    expect(lightness(rampRgb(0))).toBeLessThan(87 - 5);
  });

  it('holds values outside 0–1 to its ends', () => {
    expect(rampRgb(-1)).toEqual(rampRgb(0));
    expect(rampRgb(9)).toEqual(rampRgb(1));
    expect(rampRgb(Number.NaN)).toEqual(rampRgb(0));
  });

  it('fades the quiet end out: nothing at no one, full colour from FADE_T', () => {
    expect(glowOpacity(0)).toBe(0);
    expect(glowOpacity(-1)).toBe(0);
    expect(glowOpacity(Number.NaN)).toBe(0);
    expect(glowOpacity(FADE_T / 2)).toBeCloseTo(0.5, 10);
    expect(glowOpacity(FADE_T)).toBe(1);
    expect(glowOpacity(1)).toBe(1);
    for (let i = 1; i <= 100; i++) expect(glowOpacity(i / 1000)).toBeGreaterThanOrEqual(glowOpacity((i - 1) / 1000));
  });

  it('draws the key clear at its left end', () => {
    expect(RAMP_GRADIENT).toMatch(/rgba\(124, 210, 204, 0\) 0%/);
    expect(RAMP_GRADIENT).toMatch(/#b84844 100%/);
  });
});

import { describe, expect, it } from 'vitest';
import { glowAt, type Glow } from './ActivityGlow';
import { ACTIVITY_RADII_M } from './activityPalette';

describe('choosing a counter by its glow', () => {
  const glows: Glow[] = [
    { id: 1, en: [0, 0], level: 'busy' },
    { id: 2, en: [40, 0], level: 'quiet' },
  ];

  it('gives the glow drawn on top: the busier where two overlap, else the nearer', () => {
    expect(glowAt(glows, 1, 1)?.id).toBe(1);
    // Inside both, nearer the quiet one: the busy glow is painted over it.
    expect(glowAt(glows, 25, 0)?.id).toBe(1);
    // Beyond the busy glow, only the quiet one reaches.
    expect(glowAt(glows, 70, 0)?.id).toBe(2);
    const twoQuiet: Glow[] = [
      { id: 3, en: [0, 0], level: 'quiet' },
      { id: 4, en: [20, 0], level: 'quiet' },
    ];
    expect(glowAt(twoQuiet, 15, 0)?.id).toBe(4);
  });

  it('gives nothing beyond a glow', () => {
    expect(glowAt(glows, 0, ACTIVITY_RADII_M.busy + 1)).toBeNull();
    expect(glowAt([], 0, 0)).toBeNull();
  });

  it('makes a busier glow reach further', () => {
    expect(ACTIVITY_RADII_M.quiet).toBeLessThan(ACTIVITY_RADII_M.moderate);
    expect(ACTIVITY_RADII_M.moderate).toBeLessThan(ACTIVITY_RADII_M.busy);
  });
});

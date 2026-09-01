import { describe, expect, it } from 'vitest';
import { blockedByDevelopment, sunlightAtPoint } from './sunlightAt';
import { SEASONS } from './solar';

/** The presets carry month and day; the simulation wants a year too. */
const on = (season: { month: number; day: number }) => ({ year: 2026, ...season });
import type { Development, DevelopmentMassing } from '../data/model';

/*
 * A number a resident reads as "this tower takes half an hour of winter sun
 * off my footpath" has to be right, and its failure mode is silent: a sign
 * error puts the shadow on the sunny side and the figure still looks
 * reasonable. These tests build a tower of known size at a known place and
 * check the shadow lands where trigonometry says it must.
 */

/** A 100 m tower on a 40 m square, standing at the origin. */
function tower(heightM = 100, baseAhdM = 0): Development {
  const half = 20;
  const part: DevelopmentMassing = {
    id: 'p1',
    parentId: 'd1',
    devKey: 'TEST',
    streetAddress: 'Test',
    status: 'APPROVED',
    shapeType: 'tower',
    footprint: [
      [
        [
          [-half, -half],
          [half, -half],
          [half, half],
          [-half, half],
        ],
      ],
    ],
    baseAhdM,
    topAhdM: baseAhdM + heightM,
    heightM,
    areaM2: (half * 2) ** 2,
    sinksToGround: true,
    anchorEN: [0, 0],
    landUses: [],
  };
  return {
    devId: 'd1',
    devKey: 'TEST',
    streetAddress: 'Test',
    status: 'APPROVED',
    anchorEN: [0, 0],
    maxHeightM: heightM,
    topAhdM: baseAhdM + heightM,
    parts: [part],
    landUses: [],
  };
}

describe('is the sun behind the tower', () => {
  const subject = tower();

  it('shadows a point due south when the sun is due north', () => {
    // 45° puts the shadow edge 100 m from a 100 m tower, so 60 m south of the
    // origin — 40 m beyond the footprint — is inside it.
    const shadowed = blockedByDevelopment([0, -60], 0, { altitudeDeg: 45, azimuthDeg: 0 }, subject);
    expect(shadowed).toBe(true);
  });

  it('leaves the same point sunlit once the sun is high enough', () => {
    // At 70° the shadow reaches only 36 m, which does not clear the 20 m
    // half-width plus the 40 m gap.
    const shadowed = blockedByDevelopment([0, -60], 0, { altitudeDeg: 70, azimuthDeg: 0 }, subject);
    expect(shadowed).toBe(false);
  });

  it('does not shadow the sunny side', () => {
    // North of a tower, with the sun in the north, is the lit side. A sign
    // error in the ray direction shows up here and nowhere else.
    const shadowed = blockedByDevelopment([0, 60], 0, { altitudeDeg: 45, azimuthDeg: 0 }, subject);
    expect(shadowed).toBe(false);
  });

  it('swings the shadow round with the sun', () => {
    // Sun in the east throws the shadow west.
    expect(
      blockedByDevelopment([-60, 0], 0, { altitudeDeg: 45, azimuthDeg: 90 }, subject),
    ).toBe(true);
    expect(
      blockedByDevelopment([60, 0], 0, { altitudeDeg: 45, azimuthDeg: 90 }, subject),
    ).toBe(false);
  });

  it('reaches further as the sun drops', () => {
    const far: [number, number] = [0, -260];
    expect(blockedByDevelopment(far, 0, { altitudeDeg: 45, azimuthDeg: 0 }, subject)).toBe(false);
    // cot(20°) ≈ 2.75, so 100 m of tower reaches about 275 m.
    expect(blockedByDevelopment(far, 0, { altitudeDeg: 20, azimuthDeg: 0 }, subject)).toBe(true);
  });

  it('casts nothing when the sun is down', () => {
    expect(
      blockedByDevelopment([0, -60], 0, { altitudeDeg: -2, azimuthDeg: 0 }, subject),
    ).toBe(false);
  });

  it('ignores a tower whose roof is below the point standing on it', () => {
    const low = tower(10);
    expect(
      blockedByDevelopment([0, -60], 40, { altitudeDeg: 45, azimuthDeg: 0 }, low),
    ).toBe(false);
  });

  it('lets the sun through a courtyard', () => {
    const hollow = tower();
    // Punch a hole big enough that the ray passes clean through the middle.
    hollow.parts[0].footprint[0].push([
      [-18, -18],
      [18, -18],
      [18, 18],
      [-18, 18],
    ]);
    // Straight up through the middle of the void.
    expect(
      blockedByDevelopment([0, 0], 0, { altitudeDeg: 89.9, azimuthDeg: 0 }, hollow),
    ).toBe(false);
  });
});

describe('a day of it', () => {
  const subject = tower(214);
  const winter = SEASONS.find((s) => s.key === 'winter')!;
  const summer = SEASONS.find((s) => s.key === 'summer')!;

  it('never claims more sun is lost than there was', () => {
    for (const season of SEASONS) {
      const result = sunlightAtPoint([0, -80], 0, subject, on(season));
      expect(result.lostMin).toBeGreaterThanOrEqual(0);
      expect(result.lostMin).toBeLessThanOrEqual(result.withoutProposalMin);
      expect(result.withProposalMin + result.lostMin).toBe(result.withoutProposalMin);
    }
  });

  it('has a longer day in summer than in winter', () => {
    const s = sunlightAtPoint([0, -80], 0, subject, on(summer));
    const w = sunlightAtPoint([0, -80], 0, subject, on(winter));
    expect(s.withoutProposalMin).toBeGreaterThan(w.withoutProposalMin);
  });

  it('costs a spot to the south more in winter, when the sun stays low', () => {
    const south: [number, number] = [0, -170];
    const s = sunlightAtPoint(south, 0, subject, on(summer));
    const w = sunlightAtPoint(south, 0, subject, on(winter));
    expect(w.lostMin).toBeGreaterThan(s.lostMin);
  });

  it('costs a spot to the north nothing at all', () => {
    // Melbourne's sun never goes south of the zenith, so it can never put a
    // shadow on the northern side. Any minutes here mean the hemisphere is
    // the wrong way round.
    for (const season of SEASONS) {
      const north = sunlightAtPoint([0, 300], 0, subject, on(season));
      expect(north.lostMin).toBe(0);
      expect(north.firstShadowLabel).toBeNull();
    }
  });

  it('reports when the shadow arrives and when it leaves', () => {
    const result = sunlightAtPoint([0, -170], 0, subject, on(winter));
    expect(result.lostMin).toBeGreaterThan(0);
    expect(result.firstShadowLabel).toMatch(/^\d\d:\d\d$/);
    expect(result.lastShadowLabel).toMatch(/^\d\d:\d\d$/);
    expect(result.firstShadowLabel! <= result.lastShadowLabel!).toBe(true);
  });
});

describe('what the day window has to cover', () => {
  const subject = tower(214);

  it('reaches past sunrise and sunset on the longest day', () => {
    // Melbourne's 21 December runs roughly 05:55 to 20:42 in daylight saving.
    // A window of 06:00-20:00 clipped both ends and under-reported the day.
    const summer = SEASONS.find((s) => s.key === 'summer')!;
    const result = sunlightAtPoint([0, -400], 0, subject, on(summer));
    expect(result.withoutProposalMin).toBeGreaterThan(14 * 60 + 30);
  });

  it('counts each sample once, not once per endpoint', () => {
    // Samples stand for the step that follows them, so a day can never be
    // credited with more minutes than there are between first and last light.
    for (const season of SEASONS) {
      const result = sunlightAtPoint([0, -400], 0, subject, on(season));
      expect(result.withoutProposalMin % result.stepMinutes).toBe(0);
      expect(result.withoutProposalMin).toBeLessThan(16 * 60);
    }
  });

  it('reports the sampling step, so the interface can qualify the figure', () => {
    const result = sunlightAtPoint([0, -80], 0, subject, on(SEASONS[0]));
    expect(result.stepMinutes).toBe(10);
  });
});

import { describe, expect, it } from 'vitest';
import { sunlightAtWindow } from './windowSunlight';
import { buildSkyline } from './skyline';
import type { WindowPlace } from './facades';
import type { Massing } from '../data/model';

/*
 * Melbourne is in the southern hemisphere, which is the fact that catches
 * people out: the sun is in the NORTH at midday, so a north-facing window is
 * the good one and a south-facing window gets sun only at the ends of a
 * summer day. Several of these would pass in Europe and be wrong here.
 */

const OPEN = buildSkyline([0, 0], 20, []);

const facing = (bearingDeg: number): WindowPlace => ({
  en: [0, 0],
  ahdM: 20,
  facingDeg: bearingDeg,
  floorHeightAssumed: false,
});

const MIDSUMMER = { year: 2026, month: 12, day: 21 };
const MIDWINTER = { year: 2026, month: 6, day: 21 };

function wall(atNorth: number, topAhdM: number): Massing {
  return {
    id: 'w',
    parentId: 'w',
    footprint: [
      [
        [
          [-60, atNorth],
          [60, atNorth],
          [60, atNorth + 20],
          [-60, atNorth + 20],
        ],
      ],
    ],
    baseAhdM: 0,
    topAhdM,
    heightM: topAhdM,
    areaM2: 0,
    sinksToGround: true,
  };
}

describe('a day of sun at a window', () => {
  it('gives an unobstructed north-facing window a long winter day', () => {
    const day = sunlightAtWindow(facing(0), OPEN, null, MIDWINTER);
    // Midwinter in Melbourne is about nine hours of daylight, and a north
    // window with nothing in front of it should see most of it.
    expect(day.sunAtWindowMin).toBeGreaterThan(5 * 60);
    expect(day.firstSunLabel).not.toBeNull();
    expect(day.lastSunLabel).not.toBeNull();
  });

  it('gives a south-facing window almost nothing in midwinter', () => {
    const day = sunlightAtWindow(facing(180), OPEN, null, MIDWINTER);
    expect(day.sunAtWindowMin).toBe(0);
    expect(day.firstSunLabel).toBeNull();
  });

  it('gives a south-facing window the two ENDS of a midsummer day', () => {
    /*
     * The sun rises south of east and sets south of west in December, then
     * swings north across the middle of the day. So a south window is lit
     * early, goes dark, and is lit again late -- about 7 hours in total but
     * never as one stretch. Measured: 06:00 to 20:30 with a hole in it.
     */
    const day = sunlightAtWindow(facing(180), OPEN, null, MIDSUMMER);
    expect(day.sunAtWindowMin).toBeGreaterThan(4 * 60);
    expect(day.brokenByShade).toBe(true);
  });

  it('knows a north-facing window has one unbroken stretch', () => {
    const day = sunlightAtWindow(facing(0), OPEN, null, MIDWINTER);
    expect(day.brokenByShade).toBe(false);
  });

  it('splits the day between an east and a west window', () => {
    const east = sunlightAtWindow(facing(90), OPEN, null, MIDSUMMER);
    const west = sunlightAtWindow(facing(270), OPEN, null, MIDSUMMER);
    expect(east.sunAtWindowMin).toBeGreaterThan(2 * 60);
    expect(west.sunAtWindowMin).toBeGreaterThan(2 * 60);
    // Morning for one, afternoon for the other.
    expect(east.firstSunLabel! < west.firstSunLabel!).toBe(true);
    expect(east.lastSunLabel! < west.lastSunLabel!).toBe(true);
  });

  it('takes sun away when something is put in front of the window', () => {
    const open = sunlightAtWindow(facing(0), OPEN, null, MIDWINTER);
    const blocked = buildSkyline([0, 0], 20, [wall(30, 90)]);
    const shaded = sunlightAtWindow(facing(0), blocked, null, MIDWINTER);

    expect(shaded.sunAtWindowMin).toBeLessThan(open.sunAtWindowMin);
  });
});

describe('what a proposal costs the window', () => {
  const place = facing(0);
  const city = buildSkyline([0, 0], 20, []);
  const withTower = buildSkyline([0, 0], 20, [wall(40, 120)]);

  it('reports the loss as the difference between the two', () => {
    const day = sunlightAtWindow(place, city, withTower, MIDWINTER);

    expect(day.sunWithProposalMin).not.toBeNull();
    expect(day.lostToProposalMin).toBe(day.sunAtWindowMin - day.sunWithProposalMin!);
    expect(day.lostToProposalMin!).toBeGreaterThan(0);
  });

  it('reports nothing rather than zero when there is no proposal', () => {
    /*
     * Zero would read as "this project costs you nothing", which is a claim.
     * Null is the absence of a claim, and the interface can then say nothing
     * at all rather than reassure somebody about a building that is not
     * being assessed.
     */
    const day = sunlightAtWindow(place, city, null, MIDWINTER);
    expect(day.sunWithProposalMin).toBeNull();
    expect(day.lostToProposalMin).toBeNull();
  });

  it('reports a GAIN as a negative loss, because a proposal can be shorter', () => {
    /*
     * This used to assert the loss could never be negative, on the grounds
     * that adding geometry only takes sun away. That stopped being true when
     * the comparison started demolishing what a proposal is built on: replace
     * a tall building with a shorter one and the window gains sun.
     *
     * The figure is a DIFFERENCE. The panel reads its sign and says "more"
     * or "less" accordingly; a figure that could only ever be a loss would
     * have printed "-1 h less".
     */
    const shaded = buildSkyline([0, 0], 20, [wall(40, 120)]);
    const cleared = buildSkyline([0, 0], 20, [wall(40, 30)]);

    const day = sunlightAtWindow(place, shaded, cleared, MIDWINTER);
    expect(day.lostToProposalMin!).toBeLessThan(0);
    expect(day.sunWithProposalMin!).toBeGreaterThan(day.sunAtWindowMin);
  });

  it('says the same figure whichever date it is asked for, given the same sky', () => {
    // The skyline does not depend on the date; the sun does. This is the
    // property that lets one skyline serve every date the reader tries.
    const summer = sunlightAtWindow(place, city, null, MIDSUMMER);
    const winter = sunlightAtWindow(place, city, null, MIDWINTER);
    expect(summer.sunAtWindowMin).not.toBe(winter.sunAtWindowMin);
    expect(summer.stepMinutes).toBe(winter.stepMinutes);
  });
});

describe('how long the sun was up at all', () => {
  /*
   * The context the headline figure needs. Four hours is most of a midwinter
   * day and a third of a midsummer one, and without this the reader cannot
   * tell which kind of four hours they are being shown.
   */
  it('is longer in midsummer than in midwinter', () => {
    const summer = sunlightAtWindow(facing(0), OPEN, null, MIDSUMMER);
    const winter = sunlightAtWindow(facing(0), OPEN, null, MIDWINTER);
    expect(summer.sunUpMin).toBeGreaterThan(winter.sunUpMin);
  });

  it('is about the right length for Melbourne', () => {
    // Roughly 14h40m in December and 9h30m in June, to a ten-minute step.
    const summer = sunlightAtWindow(facing(0), OPEN, null, MIDSUMMER);
    const winter = sunlightAtWindow(facing(0), OPEN, null, MIDWINTER);
    expect(summer.sunUpMin).toBeGreaterThan(14 * 60);
    expect(summer.sunUpMin).toBeLessThan(15 * 60);
    expect(winter.sunUpMin).toBeGreaterThan(9 * 60);
    expect(winter.sunUpMin).toBeLessThan(10 * 60);
  });

  it('is never less than the sun the window actually gets', () => {
    // A window cannot be lit while the sun is down, so this bounds the other.
    for (const bearing of [0, 90, 180, 270]) {
      for (const date of [MIDSUMMER, MIDWINTER]) {
        const day = sunlightAtWindow(facing(bearing), OPEN, null, date);
        expect(day.sunAtWindowMin).toBeLessThanOrEqual(day.sunUpMin);
      }
    }
  });

  it('does not change with which way the window faces', () => {
    // It is a fact about the date and the latitude, not about the flat.
    const north = sunlightAtWindow(facing(0), OPEN, null, MIDWINTER);
    const south = sunlightAtWindow(facing(180), OPEN, null, MIDWINTER);
    expect(north.sunUpMin).toBe(south.sunUpMin);
  });
});

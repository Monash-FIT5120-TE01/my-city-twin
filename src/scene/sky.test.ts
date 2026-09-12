import { describe, expect, it } from 'vitest';
import { skyAppearance, skyPhase } from './sky';
import { SEASONS, civilToInstant, solarPosition } from './solar';
import { SITE } from './frame';
import { EARLIEST_MINUTES, LATEST_MINUTES } from '../data/now';

/*
 * The sky is driven by where the sun is, so these are stated as sun altitudes
 * rather than as clock times. The figures in the comments were measured with
 * the app's own solar code at Melbourne, and are what make the four phases
 * reachable from a slider that only spans 06:00 to 20:00.
 */

/** The same sRGB mix SkyDome uses to blend the glow over the horizon. */
function mixHex(a: string, b: string, t: number): string {
  const channel = (hex: string, i: number) => parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16);
  return `#${[0, 1, 2]
    .map((i) =>
      Math.round(channel(a, i) + (channel(b, i) - channel(a, i)) * t)
        .toString(16)
        .padStart(2, '0'),
    )
    .join('')}`;
}

const s2l = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
/** CIELAB lightness, for talking about contrast without talking about hue. */
function lightness(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => s2l(parseInt(hex.slice(i, i + 2), 16) / 255));
  const y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return y > 0.008856 ? 116 * y ** (1 / 3) - 16 : 903.3 * y;
}

describe('which phase of the day it is', () => {
  it('separates morning from evening by which side of noon the sun is', () => {
    // The same altitude, rising and setting. Melbourne's sun transits north,
    // so azimuth below 180° is the morning side.
    expect(skyPhase({ altitudeDeg: 5, azimuthDeg: 80 })).toBe('morning');
    expect(skyPhase({ altitudeDeg: 5, azimuthDeg: 280 })).toBe('evening');
    expect(skyPhase({ altitudeDeg: -3, azimuthDeg: 80 })).toBe('dawn');
    expect(skyPhase({ altitudeDeg: -3, azimuthDeg: 280 })).toBe('dusk');
  });

  it('calls it night where an almanac would', () => {
    // -6° is the end of civil twilight. The threshold is a definition, not a
    // preference, so it is worth pinning.
    expect(skyPhase({ altitudeDeg: -5.9, azimuthDeg: 280 })).toBe('dusk');
    expect(skyPhase({ altitudeDeg: -6.1, azimuthDeg: 280 })).toBe('night');
  });

  it('reaches all four phases from inside the 06:00–20:00 slider', () => {
    /*
     * Measured with this app's solar code, and the reason no new control was
     * needed to see the dark: the existing slider already spans −33° to +75°.
     */
    expect(skyPhase({ altitudeDeg: -33.0, azimuthDeg: 220 })).toBe('night'); // 21 Jun 20:00
    expect(skyPhase({ altitudeDeg: -4.6, azimuthDeg: 300 })).toBe('dusk'); //  21 Jun 17:30
    expect(skyPhase({ altitudeDeg: 0.1, azimuthDeg: 120 })).toBe('morning'); // 21 Dec 06:00
    expect(skyPhase({ altitudeDeg: 75.1, azimuthDeg: 350 })).toBe('day'); //   21 Dec 13:00
  });
});

describe('how the sky looks', () => {
  /** The map's own block tone, from the Mapbox style this app publishes. */
  const MAP_BLOCK = '#d9d6cf';
  /** The city, from CityMassing. */
  const BUILDING = '#eeedf0';

  it('darkens from day to night, without stepping', () => {
    expect(lightness(skyAppearance(60).horizon)).toBeGreaterThan(
      lightness(skyAppearance(-3).horizon),
    );
    expect(lightness(skyAppearance(-3).horizon)).toBeGreaterThan(
      lightness(skyAppearance(-30).horizon),
    );

    /*
     * Continuity in altitude, which is the ramps' own business.
     */
    for (const key of ['horizon', 'haze', 'zenith'] as const) {
      let previous = lightness(skyAppearance(-40)[key]);
      for (let altitude = -39; altitude <= 80; altitude++) {
        const now = lightness(skyAppearance(altitude)[key]);
        expect(Math.abs(now - previous)).toBeLessThan(4);
        previous = now;
      }
    }
  });

  it('holds the jump between two slider positions to something a sunrise earns', () => {
    /*
     * PER STEP OF THE CONTROL, NOT PER DEGREE OF ALTITUDE.
     *
     * The test above bounds the change per degree, and a degree is not a
     * thing anybody can do. The time slider moves in ten minutes, and ten
     * minutes near sunrise is about two degrees — so a bound that looked
     * tight per degree allowed twice that in one press, and a review found
     * 7.56 L* between 07:30 and 07:40 while the earlier test passed.
     *
     * It is not smoothed away, because at sunrise the sky really does change
     * that fast and flattening it would be a lie about the one thing this
     * app is for. It is bounded, and the bound is checked against the real
     * clock and the real sun rather than against a proxy for them.
     */
    const dates = [...SEASONS.map((s) => ({ month: s.month, day: s.day })), { month: 9, day: 21 }];
    let worst = 0;

    for (const { month, day } of dates) {
      const altitudeAt = (minutes: number) =>
        solarPosition(
          civilToInstant(SITE.timeZone, 2026, month, day, Math.floor(minutes / 60), minutes % 60),
          { lat: SITE.lat, lon: SITE.lon, elevationM: SITE.elevationM },
        ).altitudeDeg;

      for (let minutes = EARLIEST_MINUTES; minutes <= LATEST_MINUTES - 10; minutes += 10) {
        const before = skyAppearance(altitudeAt(minutes));
        const after = skyAppearance(altitudeAt(minutes + 10));
        for (const key of ['horizon', 'haze', 'zenith'] as const) {
          worst = Math.max(worst, Math.abs(lightness(before[key]) - lightness(after[key])));
        }
      }
    }

    // Measured at 7.56, at the March equinox around half past seven.
    expect(worst).toBeLessThan(9);
  });

  it('keeps the skyline readable against the sky at every hour', () => {
    /*
     * The sky carries no information — every fact this app states is carried
     * by geometry and by lightness. So the horizon may not close the gap
     * against the building tone at any point in the day, or the skyline
     * dissolves into it. Ten L* is the smallest separation that survives the
     * three colour-vision simulations.
     *
     * MEASURED WITH THE GLOW IN IT. The earlier version of this test read the
     * base horizon only, and the warm cast is blended over that in SkyDome —
     * so the colour actually behind a building was never the colour being
     * checked. A review set every glow stop to white and all ten tests still
     * passed, with the sun-facing horizon coming out BRIGHTER than the
     * buildings in front of it.
     */
    for (let altitude = -40; altitude <= 80; altitude += 2) {
      const { horizon, sunGlow, glow } = skyAppearance(altitude);
      // The worst case is a building seen against the sun's own quarter,
      // where the cast is at full strength.
      const behind = mixHex(horizon, sunGlow, glow);
      expect(lightness(BUILDING) - lightness(behind)).toBeGreaterThan(10);
    }
  });

  it('never lets the ground fade into something darker than itself', () => {
    /*
     * THE BUG THIS EXISTS FOR.
     *
     * The sky's horizon and the ground's far haze were one colour, and the
     * two places want opposite things: the sky behind a building must be
     * DARKER than the building, distant ground must not be darker than the
     * map. The shared value satisfied the first and failed the second by
     * 3.5 L*, and the map grew a visible dark ring around its outer edge.
     *
     * In daylight, where the map is bright, the haze has to stay level with
     * it. Both are lit and tone-mapped the same way, so comparing the
     * authored tones is the right comparison.
     */
    /*
     * No slack. This read `- 1` once, and a review moved daylight haze to
     * #d8d5ce — below the map's own tone, the very thing the test names —
     * and every test still passed. A tolerance on the quantity being
     * protected protects nothing.
     */
    for (let altitude = 10; altitude <= 80; altitude += 2) {
      const haze = lightness(skyAppearance(altitude).haze);
      expect(haze).toBeGreaterThanOrEqual(lightness(MAP_BLOCK));
    }
  });

  it('separates the two so they cannot silently become one again', () => {
    // Distant ground is lighter than the sky above it in daylight — haze,
    // not shadow. If these ever come out equal, the split has been undone.
    for (const altitude of [15, 40, 75]) {
      const { haze, horizon } = skyAppearance(altitude);
      expect(lightness(haze)).toBeGreaterThan(lightness(horizon) + 2);
    }
  });

  it('warms the sky near the sun only while the sun is low', () => {
    // The cast at sunset is the light travelling the long way through the
    // atmosphere. By mid-morning it is not doing that any more.
    expect(skyAppearance(70).glow).toBeLessThan(0.01);
    expect(skyAppearance(3).glow).toBeGreaterThan(0.3);
    expect(skyAppearance(-30).glow).toBeLessThan(0.01);
  });

  it('brings the stars in around the end of civil twilight', () => {
    // Faded, not switched. Nothing while the sun is up; a trace by the end of
    // civil twilight, which SkyDome does not draw until it clears 0.01; full
    // by the time astronomical twilight is over.
    expect(skyAppearance(10).stars).toBe(0);
    expect(skyAppearance(-4).stars).toBe(0);
    expect(skyAppearance(-5).stars).toBeLessThan(0.01);
    expect(skyAppearance(-12).stars).toBeGreaterThan(0.1);
    expect(skyAppearance(-12).stars).toBeLessThan(1);
    expect(skyAppearance(-22).stars).toBe(1);
  });

  it('never lets the fill light reach zero', () => {
    /*
     * At night the sun contributes nothing, and this is the only thing
     * separating a building from the sky behind it. At zero the city becomes
     * a flat silhouette — and the shadows the whole app exists to show stop
     * being distinguishable from everything else that is dark.
     */
    for (const altitude of [-40, -18, -6, 0, 45]) {
      expect(skyAppearance(altitude).ambient).toBeGreaterThan(0.05);
    }
  });
});

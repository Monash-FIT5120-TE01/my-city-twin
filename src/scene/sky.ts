/*
 * ─────────────────────────────────────────────────────────────────────────
 * THE SKY, AND WHAT TIME OF DAY IT IS
 * ─────────────────────────────────────────────────────────────────────────
 *
 * WHAT THIS FILE IS
 *   How the sky, the light and the horizon look at a given sun position.
 *   Pure arithmetic; the components that draw it are in SkyDome.tsx.
 *
 * WHY IT IS DRIVEN BY THE SUN AND NOT BY A SETTING
 *   Morning, noon, evening and night are not four buttons here — they are
 *   where the sun is, which this app already computes to a tenth of a degree
 *   against pvlib. A separate control would be a second opinion about the
 *   time of day, and the two would disagree the moment anybody touched
 *   either one.
 *
 *   They are all reachable from the existing 06:00–20:00 slider, which was
 *   worth checking rather than assuming. Measured at Melbourne:
 *
 *     21 Dec 06:00   +0.1°   the sun on the horizon
 *     21 Dec 13:00  +75.1°   high summer noon
 *     21 Jun 12:00  +28.5°   winter noon, and still low
 *     21 Jun 17:30   -4.6°   civil twilight
 *     21 Jun 20:00  -33.0°   full night
 *
 *   So the slider already spans −33° to +75°, and the whole day is in it.
 *   Nothing new had to be added to the controls to reach the dark.
 *
 * THE THRESHOLDS ARE THE REAL ONES
 *   −6° is the end of civil twilight and −18° the end of astronomical
 *   twilight; both are definitions, not taste. Using them means the moment
 *   the app calls it night is the moment an almanac would.
 *
 * A NOTE ON COLOUR
 *   The sky carries no information. It is atmosphere, and every fact the app
 *   states — which buildings are proposals, where the shadow falls — is
 *   carried by geometry and by lightness, never by hue. That matters here:
 *   the sky may not be allowed to close the lightness gap between the ground
 *   and the things standing on it. sky.test.ts holds that gap open.
 */

/** Where the sun is, in the terms the rest of the scene already uses. */
export interface SunAnglesDeg {
  altitudeDeg: number;
  azimuthDeg: number;
}

export type SkyPhase = 'night' | 'dawn' | 'morning' | 'day' | 'evening' | 'dusk';

/**
 * Which of the day's phases this is.
 *
 * Altitude decides how light it is; the azimuth decides which side of noon
 * it is on, because a sun 5° up looks the same rising or setting and is not
 * the same thing to somebody planning their afternoon. In Melbourne the sun
 * transits north, so east of that — azimuth under 180° — is the morning.
 */
export function skyPhase({ altitudeDeg, azimuthDeg }: SunAnglesDeg): SkyPhase {
  const rising = azimuthDeg < 180;
  if (altitudeDeg < -6) return 'night';
  if (altitudeDeg < 0) return rising ? 'dawn' : 'dusk';
  if (altitudeDeg < 12) return rising ? 'morning' : 'evening';
  return 'day';
}

/** 0 at or below `from`, 1 at or above `to`, smooth between. */
function ramp(value: number, from: number, to: number): number {
  const t = Math.min(1, Math.max(0, (value - from) / (to - from)));
  return t * t * (3 - 2 * t);
}

export interface SkyAppearance {
  /** Straight up. */
  zenith: string;
  /** The sky at the horizon — what a building's silhouette is read against. */
  horizon: string;
  /**
   * What the GROUND fades into, far away. Not the same as `horizon`.
   *
   * These were one colour once, and that was the mistake. The sky behind a
   * building has to be darker than the building or the skyline dissolves;
   * distant ground has to be no darker than the map or the map grows a dark
   * ring around itself. In daylight those pull in opposite directions —
   * measured, the shared colour sat 3.5 L* BELOW the map's own tone, and the
   * ring was plainly visible.
   *
   * They are different places. They get different colours.
   */
  haze: string;
  /** Warm cast near the sun, strongest when it is low. */
  sunGlow: string;
  /** How much of that cast to apply, 0–1. */
  glow: number;
  /** Fills the shadows. Never zero — a black shadow hides the city in it. */
  ambient: number;
  /** Sky-to-ground bounce. */
  hemisphere: number;
  /** How much of the starfield shows, 0–1. */
  stars: number;
}

/** Two hex colours mixed in sRGB. Good enough for a sky; not for data. */
function mix(a: string, b: string, t: number): string {
  const channel = (hex: string, i: number) => parseInt(hex.slice(1 + i * 2, 3 + i * 2), 16);
  const out = [0, 1, 2].map((i) =>
    Math.round(channel(a, i) + (channel(b, i) - channel(a, i)) * t)
      .toString(16)
      .padStart(2, '0'),
  );
  return `#${out.join('')}`;
}

/*
 * The palette at three moments, mixed between by sun altitude.
 *
 * Authored rather than derived from atmospheric physics, and deliberately.
 * The Preetham model this replaced is a DAYLIGHT model: its shader carries a
 * hard floor — `vec3 L0 = vec3( 0.1 ) * Fex;` — so it cannot go dark however
 * far the sun sinks. Midnight came out the colour of an overcast afternoon,
 * the stars were invisible against it, and covering it up meant stacking one
 * workaround on another.
 *
 * Authored colours lose the physics and gain a night that is actually night,
 * one code path from noon to midnight, and a sky that comes from the same
 * arithmetic as the ground it meets — which is what stops a seam appearing
 * between them.
 */
const NIGHT = { zenith: '#05070c', horizon: '#10141c', haze: '#0d1014', glow: '#1d2436' };
const TWILIGHT = { zenith: '#2b3550', horizon: '#5b5560', haze: '#4a4650', glow: '#b0704a' };
const LOW_SUN = { zenith: '#7d9dc4', horizon: '#b8a795', haze: '#dcd5ca', glow: '#e8a765' };
const DAY = { zenith: '#5d8ec4', horizon: '#c3ced7', haze: '#e2dfd8', glow: '#f2e6cf' };

export function skyAppearance(altitudeDeg: number): SkyAppearance {
  // Overlapping ramps, so nothing steps as the slider is dragged. The time
  // control moves in ten-minute jumps and a threshold would show as the sky
  // changing in one frame.
  const afterDark = ramp(altitudeDeg, -22, -4);
  const daylight = ramp(altitudeDeg, -11, 11);
  const high = ramp(altitudeDeg, 0, 40);

  const at = (key: 'zenith' | 'horizon' | 'haze' | 'glow') =>
    mix(mix(mix(NIGHT[key], TWILIGHT[key], afterDark), LOW_SUN[key], daylight), DAY[key], high);

  return {
    zenith: at('zenith'),
    horizon: at('horizon'),
    haze: at('haze'),
    sunGlow: at('glow'),
    /*
     * Strongest with the sun low and gone once it is up: the warm cast at
     * sunset is the light travelling the long way through the atmosphere,
     * and by mid-morning it is not doing that any more.
     */
    glow: daylight * (1 - high),
    /*
     * Ambient never reaches zero. At night the sun contributes nothing and
     * this is the only thing separating a building from the sky behind it —
     * at zero the city becomes a silhouette with no form, and the shadows
     * the whole app is about are indistinguishable from everything else.
     */
    ambient: 0.06 + 0.16 * daylight,
    hemisphere: 0.12 + 1.23 * daylight,
    stars: 1 - afterDark,
  };
}

/*
 * The street activity's colours: how many people, as the map draws them and
 * the key repeats them.
 *
 * ONE RAMP, BY THE COUNT (2026-10-15)
 *   The design runs from a pale teal through yellow to red, by movements an
 *   hour on one scale for every location (0 → the most anywhere on the
 *   timeline). Its own colours held the same lightness through the first
 *   half (L* 78–82), so "quiet" and "getting busy" differed by hue alone,
 *   which a reader with a colour-vision difference may not see reliably. These
 *   keep the design's teal → yellow → red but fall in lightness all the
 *   way, so more people is always darker as well as warmer; the busier the
 *   street the larger the glow too, and the count is always written beside
 *   it in the column.
 *
 *     at     hex      L*   protan L*  deutan L*  tritan L*
 *     0      #7cd2cc  79   81         77         79
 *     0.25   #aab770  72   72         72         72
 *     0.5    #c2982a  65   62         66         65
 *     0.75   #c86f39  56   51         59         56
 *     1      #b84844  46   40         50         46
 *
 *   The quiet end is darker than anything on the map under it (buildings
 *   and parks L* 87, ground 93, roads 100), so even an empty street's glow
 *   stands apart from them by lightness, not only by its teal. A first
 *   version started at L* 88 and sat on the buildings' own lightness.
 *
 *   Simulated with Machado et al. (2009) at full severity, 2026-10-15:
 *   lightness falls stop by stop in every simulation. Between stops the
 *   colour is mixed in sRGB, which keeps it falling.
 *
 * THE LEVELS ARE SOMETHING ELSE
 *   Quiet, moderate and busy are the backend's, per location against its
 *   own usual traffic. They are words in the column with a three-bar mark,
 *   never a colour, so they cannot be read off the map's ramp by mistake.
 */
import type { ActivityLevel } from '../data/streetActivity';

export const ACTIVITY_RAMP = ['#7cd2cc', '#aab770', '#c2982a', '#c86f39', '#b84844'] as const;

const rgbOf = (hex: string): [number, number, number] => {
  const v = Number.parseInt(hex.slice(1), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
};
const STOPS = ACTIVITY_RAMP.map(rgbOf);

/** The ramp's colour at `t` (0 = no one, 1 = the most anywhere), as [r, g, b] 0–255. */
export function rampRgb(t: number): [number, number, number] {
  const x = Math.min(1, Math.max(0, Number.isFinite(t) ? t : 0)) * (STOPS.length - 1);
  const i = Math.min(STOPS.length - 2, Math.floor(x));
  const f = x - i;
  const [a, b] = [STOPS[i], STOPS[i + 1]];
  return [0, 1, 2].map((k) => Math.round(a[k] + (b[k] - a[k]) * f)) as [number, number, number];
}

/** The same, as a CSS colour. */
export function rampColour(t: number): string {
  const [r, g, b] = rampRgb(t);
  return `rgb(${r}, ${g}, ${b})`;
}

/**
 * The quiet end fades out (2026-10-15): from no one (nothing drawn) to this
 * share of the most anywhere, the glow goes from clear to its full colour;
 * above it, the ramp as it is. About 80 movements an hour on 4,000: the
 * streets nearly empty at night all but vanish, and fewer is still always
 * lighter, so the order the ramp keeps by lightness is not broken.
 */
export const FADE_T = 0.02;

/** How opaque a glow is at `t`: 0 at no one, 1 from FADE_T up. */
export function glowOpacity(t: number): number {
  if (!Number.isFinite(t) || t <= 0) return 0;
  return Math.min(1, t / FADE_T);
}

/** The ramp as a CSS gradient, for the key: clear at 0, its first colour by FADE_T. */
export const RAMP_GRADIENT = (() => {
  const [r, g, b] = rgbOf(ACTIVITY_RAMP[0]);
  const rest = ACTIVITY_RAMP.map((hex, i) => `${hex} ${Math.max(FADE_T, i / (ACTIVITY_RAMP.length - 1)) * 100}%`);
  return `linear-gradient(to right, rgba(${r}, ${g}, ${b}, 0) 0%, ${rest.join(', ')})`;
})();

/** How far a glow reaches, metres, from no one (t = 0) to the most anywhere (t = 1). */
export const GLOW_RADIUS_M = { min: 28, max: 70 } as const;

export function glowRadiusAt(t: number): number {
  const x = Math.min(1, Math.max(0, Number.isFinite(t) ? t : 0));
  return GLOW_RADIUS_M.min + (GLOW_RADIUS_M.max - GLOW_RADIUS_M.min) * x;
}

/** Least to most, the order the column lists them in. */
export const ACTIVITY_LEVELS: ActivityLevel[] = ['quiet', 'moderate', 'busy'];

export const ACTIVITY_WORDS: Record<ActivityLevel, string> = {
  quiet: 'Quiet',
  moderate: 'Moderate',
  busy: 'Busy',
};

/** How many of the three bars the level's mark fills. */
export const LEVEL_BARS: Record<ActivityLevel, 1 | 2 | 3> = { quiet: 1, moderate: 2, busy: 3 };

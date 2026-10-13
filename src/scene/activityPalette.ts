/*
 * The street activity's three levels, as the map draws them and the key
 * repeats them.
 *
 * ONE HUE, THREE LIGHTNESSES
 *   The design drew more people as a deeper red. Hue alone would not do —
 *   the reader this is checked with does not see it reliably — so the three
 *   levels are one warm red at three CIE L* steps, twenty apart, and the
 *   busier the street the larger the glow as well. The words and the count
 *   are always beside it in the column (StreetActivitySheet); the colour
 *   only repeats them.
 *
 *     level      hex      L*   protan L*  deutan L*  tritan L*
 *     quiet      #fe9c92  74   70         77         72
 *     moderate   #ce5f58  54   48         57         54
 *     busy       #922b2b  34   28         37         34
 *
 *   Simulated with Machado et al. (2009) at full severity, 2026-10-14. The
 *   steps stay about twenty L* apart in every simulation, and the lightest
 *   is still darker than the buildings (#dbd5cd, L* 85) and the light map
 *   beneath. The approved and in-progress massings (teal, peach) are hidden
 *   on this screen, so nothing else on the map is this colour.
 */
import type { ActivityLevel } from '../data/streetActivity';

export const ACTIVITY_COLOURS: Record<ActivityLevel, string> = {
  quiet: '#fe9c92',
  moderate: '#ce5f58',
  busy: '#922b2b',
};

/** How far each level's glow reaches, metres: busier is wider as well as darker. */
export const ACTIVITY_RADII_M: Record<ActivityLevel, number> = {
  quiet: 34,
  moderate: 48,
  busy: 64,
};

/** Least to most, the order the key reads and the glows are painted in. */
export const ACTIVITY_LEVELS: ActivityLevel[] = ['quiet', 'moderate', 'busy'];

export const ACTIVITY_WORDS: Record<ActivityLevel, string> = {
  quiet: 'Quiet',
  moderate: 'Moderate',
  busy: 'Busy',
};

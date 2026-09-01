import { compassLabel, shadowReachM, type SunAngles } from './sun';

/*
 * Plain English for what the shadow is doing right now.
 *
 * The Figma writes lines like "Shadow falls east of the protected area" and
 * "Direct sun remains on the forecourt". Both name a protected public space,
 * and there is no protected-space data — that is user story 1.3, and the
 * backend carries no table for it. Inventing a forecourt to make the sentence
 * match the mock would put a claim about a real street in front of a
 * resident on the strength of nothing.
 *
 * So these sentences say only what the geometry actually supports: which way
 * the shadow runs, and how far. When 1.3 lands, the named space can be
 * substituted in and the shape of the sentence does not change.
 */

export interface ShadowNarrative {
  /** "AT 15:00" */
  stamp: string;
  /** The sentence, two lines at panel width. */
  sentence: string;
  /** "Demo model · 21 December" */
  provenance: string;
  /** Short caption for the time readout: "Long west shadow". */
  caption: string;
}

/** Where the shadow points: opposite the sun. */
export function shadowBearingDeg(azimuthDeg: number): number {
  return (azimuthDeg + 180) % 360;
}

export function describeShadow(
  sun: SunAngles,
  heightM: number,
  timeLabel: string,
  dateLabel: string,
): ShadowNarrative {
  const stamp = `At ${timeLabel}`;
  const provenance = `Demo model · ${dateLabel}`;
  const reach = shadowReachM(heightM, sun.altitudeDeg);

  if (reach === null) {
    return {
      stamp,
      sentence: 'The sun is below the horizon, so the building casts no shadow.',
      provenance,
      caption: 'No direct sun',
    };
  }

  const direction = compassLabel(shadowBearingDeg(sun.azimuthDeg)).toLowerCase();
  const ratio = reach / heightM;

  // The ratio is just cot(altitude), so these bands are angles: shadows equal
  // the height at 45°, double it by 27°, and quadruple it by 14°.
  const length =
    ratio < 0.75 ? 'Shortest' : ratio < 1.6 ? 'Short' : ratio < 3 ? 'Long' : 'Longest';

  // With the sun nearly overhead the shadow barely leaves the footprint, so
  // naming a direction would point somewhere nothing is happening.
  const shortest = ratio < 0.75;

  return {
    stamp,
    sentence: shortest
      ? `The sun is high, so the tower's shadow stays close to its own footprint.`
      : `The tower's shadow runs ${direction} for about ${Math.round(reach)} m.`,
    provenance,
    caption: shortest ? 'Shortest shadow' : `${length} ${direction} shadow`,
  };
}

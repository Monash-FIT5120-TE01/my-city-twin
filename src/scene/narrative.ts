import { compassLabel, shadowReachM, type SunAngles } from './sun';
import { formatNumber, t } from '../i18n/i18n';
import type { MessageKey } from '../i18n/en';

/*
 * Plain English for what the shadow is doing right now.
 *
 * The design writes lines like "Shadow falls east of the protected area" and
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

/** The way the shadow runs, as compassLabel names it, in words for the middle of a sentence. */
const DIRECTION: Record<string, MessageKey> = {
  NORTH: 'narrative.direction.north',
  'NORTH-EAST': 'narrative.direction.northEast',
  EAST: 'narrative.direction.east',
  'SOUTH-EAST': 'narrative.direction.southEast',
  SOUTH: 'narrative.direction.south',
  'SOUTH-WEST': 'narrative.direction.southWest',
  WEST: 'narrative.direction.west',
  'NORTH-WEST': 'narrative.direction.northWest',
};

export function describeShadow(
  sun: SunAngles,
  heightM: number,
  timeLabel: string,
  dateLabel: string,
): ShadowNarrative {
  const stamp = t('narrative.stamp', { time: timeLabel });
  const provenance = t('narrative.provenance', { date: dateLabel });
  const reach = shadowReachM(heightM, sun.altitudeDeg);

  if (reach === null) {
    return {
      stamp,
      sentence: t('narrative.sentence.noSun'),
      provenance,
      caption: t('narrative.caption.noSun'),
    };
  }

  const direction = t(DIRECTION[compassLabel(shadowBearingDeg(sun.azimuthDeg))]);
  const ratio = reach / heightM;

  // The ratio is just cot(altitude), so these bands are angles: shadows equal
  // the height at 45°, double it by 27°, and quadruple it by 14°.
  const length: MessageKey =
    ratio < 1.6 ? 'narrative.caption.short' : ratio < 3 ? 'narrative.caption.long' : 'narrative.caption.longest';

  // With the sun nearly overhead the shadow barely leaves the footprint, so
  // naming a direction would point somewhere nothing is happening.
  const shortest = ratio < 0.75;

  return {
    stamp,
    sentence: shortest
      ? t('narrative.sentence.shortest')
      : t('narrative.sentence.runs', { direction, metres: formatNumber(Math.round(reach)) }),
    provenance,
    caption: shortest ? t('narrative.caption.shortest') : t(length, { direction }),
  };
}

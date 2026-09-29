/*
 * ─────────────────────────────────────────────────────────────────────────
 * WORDS THAT TWO INTERFACES SAY
 * ─────────────────────────────────────────────────────────────────────────
 *
 * The measured figure is shown on the 2D sheet and on the panel inside a
 * headset. It has to read the same in both: the same rounding, the same unit,
 * the same caveat. Written twice, the two would drift — and a figure that says
 * "2 h 10 min" on a monitor and "2.2 h" in a headset is a figure nobody can
 * quote. So the sentences that carry a number, or the limits of one, live
 * here, and both interfaces call them.
 */

import type { SunlightAtPoint } from '../scene/sunlightAt';

/** "45 min", "2 h", "2 h 10 min". */
export function durationLabel(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return `${m} min`;
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

/**
 * What a measured spot's figure does not count.
 *
 * Checked against the subject only, so everything already standing is
 * ignored and a spot in somebody else's shadow still reads as sunlit.
 */
export function spotFinePrint(stepMinutes: number): string {
  return `Sampled every ${stepMinutes} minutes. Existing buildings and the slope of the ground are not counted, so a spot already in someone else’s shadow will still be shown losing sun here. `;
}

/**
 * A measured spot, in words. `none` is set, and nothing else, when the
 * subject takes no sun from the spot at all.
 *
 * The "without" line counts every sampled minute the sun is above the
 * horizon, with the subject taken away and NO other building counted either
 * (spotFinePrint says so on screen). It is the length of the day at this
 * sampling, not an estimate of the sun this spot really gets on a street of
 * towers — the figure worth reading is the difference.
 */
export function spotWords(
  measured: SunlightAtPoint,
  noun: string,
): {
  none: string | null;
  figure: string | null;
  caption: string | null;
  against: string | null;
  shadowWindow: string | null;
} {
  if (measured.lostMin === 0) {
    return {
      none: `This ${noun} takes no direct sun from here.`,
      figure: null,
      caption: null,
      against: null,
      shadowWindow: null,
    };
  }
  return {
    none: null,
    figure: durationLabel(measured.lostMin),
    caption: `less direct sunlight from this ${noun}`,
    against: `${durationLabel(measured.withoutSubjectMin)} without this ${noun}`,
    shadowWindow: measured.firstShadowLabel
      ? `In shadow around ${measured.firstShadowLabel} – ${measured.lastShadowLabel}`
      : null,
  };
}

/** Said under every figure the product shows. */
export const NOT_AN_ASSESSMENT = 'Illustrative shadow shapes · Demo data. Not a planning assessment.';

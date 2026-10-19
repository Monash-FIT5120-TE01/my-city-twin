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
 *
 * In the language chosen on the page; in English for the headset, whose font
 * has English only — pass `inEnglish` as `say` there.
 */

import type { SunlightAtPoint } from '../scene/sunlightAt';
import { en, type MessageKey } from '../i18n/en';
import { formatNumber, t } from '../i18n/i18n';

/** Who says the words: `t` (the language chosen) or `inEnglish`. */
export type Say = typeof t;

/** The English for `key`, whatever the page's language: for the headset, whose font has English only. */
export const inEnglish: Say = (key: MessageKey, vars?: Record<string, string | number>) => {
  const text: string = en[key];
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (whole, name: string) => (name in vars ? String(vars[name]) : whole));
};

/** A number as `say`'s language writes it: plain digits in English for the headset. */
function figure(say: Say, n: number): string {
  return say === t ? formatNumber(n) : String(n);
}

/** "45 min", "2 h", "2 h 10 min". */
export function durationLabel(minutes: number, say: Say = t): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (h === 0) return say('words.duration.minutes', { minutes: figure(say, m) });
  return m === 0
    ? say('words.duration.hours', { hours: figure(say, h) })
    : say('words.duration.hoursMinutes', { hours: figure(say, h), minutes: figure(say, m) });
}

/**
 * What a measured spot's figure does not count.
 *
 * Checked against the subject only, so everything already standing is
 * ignored and a spot in somebody else's shadow still reads as sunlit.
 * Ends in a space, so NOT_AN_ASSESSMENT can follow it on one line.
 */
export function spotFinePrint(stepMinutes: number, say: Say = t): string {
  return `${say('words.spot.finePrint', { step: figure(say, stepMinutes) })} `;
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
 *
 * `noun` is 'building' (one standing) or 'project' (a proposal); each has
 * its own sentences, so a translator never has to fit a word into one.
 */
export function spotWords(
  measured: SunlightAtPoint,
  noun: string,
  say: Say = t,
): {
  none: string | null;
  figure: string | null;
  caption: string | null;
  against: string | null;
  shadowWindow: string | null;
} {
  const building = noun === 'building';
  if (measured.lostMin === 0) {
    return {
      none: say(building ? 'words.spot.noneBuilding' : 'words.spot.noneProject'),
      figure: null,
      caption: null,
      against: null,
      shadowWindow: null,
    };
  }
  return {
    none: null,
    figure: durationLabel(measured.lostMin, say),
    caption: say(building ? 'words.spot.captionBuilding' : 'words.spot.captionProject'),
    against: say(building ? 'words.spot.againstBuilding' : 'words.spot.againstProject', {
      duration: durationLabel(measured.withoutSubjectMin, say),
    }),
    shadowWindow: measured.firstShadowLabel
      ? say('words.spot.shadowWindow', { from: measured.firstShadowLabel, to: measured.lastShadowLabel ?? '' })
      : null,
  };
}

/** Said under every figure the product shows — in English, for the headset. */
export const NOT_AN_ASSESSMENT: string = en['words.notAnAssessment'];

/** The same, in the language chosen: for the page. */
export function notAnAssessment(say: Say = t): string {
  return say('words.notAnAssessment');
}

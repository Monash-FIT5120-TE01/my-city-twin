import { describe, expect, it } from 'vitest';
import { describeShadow } from './narrative';
import { compassLabel } from './sun';

/*
 * ─────────────────────────────────────────────────────────────────────────
 * THE CAPTION HAS TO FIT IN TWO LINES
 * ─────────────────────────────────────────────────────────────────────────
 *
 * The time dock reserves exactly two lines for it — see .timebar__caption.
 * The reservation exists because the dock is anchored to the bottom of the
 * screen, so a caption that took a third line would grow the card UPWARDS
 * and move the slider handle out from under the pointer mid-drag.
 *
 * Reserving the room is half the fix. This is the other half: it holds the
 * vocabulary to a length that fits in the room reserved. Adding "Extremely"
 * to the length words, or spelling out "north-north-east", would break the
 * layout silently and a long way from where the wording changed.
 *
 * The budget is in characters rather than pixels because a test cannot
 * measure text. 26 is the longest the current set produces; the column is
 * 160px and the label about 13 to 15px, which fits roughly 13 characters a
 * line at the larger size — so two lines hold about 26.
 */

const BUDGET = 26;

/** Every caption the interface can produce, by construction. */
function everyCaption(): string[] {
  const captions = new Set<string>();

  /*
   * Driven through the real function rather than by rebuilding its wording
   * here: a copy of the format string would keep passing after the original
   * changed, which is the failure this test exists to prevent.
   */
  for (let azimuth = 0; azimuth < 360; azimuth += 5) {
    for (const altitude of [0.5, 5, 12, 20, 30, 45, 60, 75, 89]) {
      const narrative = describeShadow(
        { altitudeDeg: altitude, azimuthDeg: azimuth },
        120,
        '12:00',
        '21 December',
      );
      captions.add(narrative.caption);
    }
  }

  // And the one that has no direction at all.
  captions.add(
    describeShadow(
      { altitudeDeg: -8, azimuthDeg: 180 },
      120,
      '18:30',
      '21 June',
    ).caption,
  );

  return [...captions];
}

describe('the shadow caption', () => {
  it('never runs longer than the two lines the dock reserves', () => {
    const tooLong = everyCaption().filter((caption) => caption.length > BUDGET);
    expect(tooLong).toEqual([]);
  });

  it('covers every compass point, so nothing is untested by accident', () => {
    const captions = everyCaption().join(' | ').toLowerCase();
    for (let azimuth = 0; azimuth < 360; azimuth += 45) {
      expect(captions).toContain(compassLabel(azimuth).toLowerCase());
    }
  });

  it('includes the case with no sun and the case with no direction', () => {
    const captions = everyCaption();
    expect(captions).toContain('No direct sun');
    expect(captions).toContain('Shortest shadow');
  });

  it('is never empty, which would collapse the reserved space to nothing', () => {
    for (const caption of everyCaption()) {
      expect(caption.trim().length).toBeGreaterThan(0);
    }
  });
});

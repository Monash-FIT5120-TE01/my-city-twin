import { describe, expect, it } from 'vitest';
import {
  DEFAULT_DATE,
  SEASONS,
  dateLabel,
  fromDateInput,
  matchingSeason,
  sameDayInMonth,
  toDateInput,
} from './solar';

/*
 * The date the simulation runs for is now free, not one of four presets, so
 * the round trip through the date field has to be exact — a date that shifts
 * by one day silently moves every shadow.
 */

describe('the date field round trip', () => {
  it('survives a trip through the input format', () => {
    for (const { month, day } of SEASONS) {
      const date = { year: 2026, month, day };
      expect(fromDateInput(toDateInput(date))).toEqual(date);
    }
  });

  it('does not shift the day in a zone ahead of UTC', () => {
    // `new Date('2026-12-21')` is UTC midnight; read back in Melbourne that is
    // the 21st, but in any zone behind UTC it is the 20th. Parsing the three
    // numbers literally is what keeps this stable wherever the browser is.
    const parsed = fromDateInput('2026-12-21')!;
    expect(parsed).toEqual({ year: 2026, month: 12, day: 21 });
    expect(dateLabel(parsed)).toBe('21 December');
  });

  it('pads single digits the way the field expects', () => {
    expect(toDateInput({ year: 2026, month: 3, day: 7 })).toBe('2026-03-07');
  });

  it('refuses anything that is not a date', () => {
    for (const bad of ['', '2026-13-01', '2026-00-10', '2026-06-00', '21/06/2026', 'today']) {
      expect(fromDateInput(bad)).toBeNull();
    }
  });

  /*
   * These parse and look like dates, and they are not days. The address bar
   * is the way in: ?d=2026-02-31 used to be accepted, printed as
   * "31 February", and then quietly rolled forward to 3 March when the sun
   * was placed -- so the label on screen and the shadow under it disagreed.
   */
  it('refuses a day its month does not have', () => {
    for (const bad of ['2026-02-30', '2026-02-31', '2026-04-31', '2026-06-31', '2026-09-31']) {
      expect(fromDateInput(bad)).toBeNull();
    }
  });

  it('knows which Februaries have a twenty-ninth', () => {
    expect(fromDateInput('2024-02-29')).toEqual({ year: 2024, month: 2, day: 29 });
    expect(fromDateInput('2000-02-29')).toEqual({ year: 2000, month: 2, day: 29 });
    expect(fromDateInput('2026-02-29')).toBeNull();
    expect(fromDateInput('1900-02-29')).toBeNull();
  });

  it('keeps the last day of every month in 2026', () => {
    const lengths = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    lengths.forEach((length, index) => {
      const month = String(index + 1).padStart(2, '0');
      expect(fromDateInput(`2026-${month}-${String(length).padStart(2, '0')}`)).not.toBeNull();
      expect(fromDateInput(`2026-${month}-${String(length + 1).padStart(2, '0')}`)).toBeNull();
    });
  });
});

describe('the season shortcuts', () => {
  it('lights up for its whole month, whatever day it is', () => {
    for (const season of SEASONS) {
      for (const day of [1, season.day, 28]) {
        expect(matchingSeason({ year: 2026, month: season.month, day })?.key).toBe(
          season.key,
        );
      }
    }
  });

  it('lights up for none of the other eight months', () => {
    const seasonal = new Set(SEASONS.map((season) => season.month));
    for (let month = 1; month <= 12; month++) {
      if (seasonal.has(month)) continue;
      expect(matchingSeason({ year: 2026, month, day: 15 })).toBeNull();
    }
  });

  it('matches whatever the year is, since the presets are seasonal', () => {
    expect(matchingSeason({ year: 2031, month: 6, day: 21 })?.key).toBe('winter');
  });

  it('opens on a date the summer button claims', () => {
    expect(matchingSeason(DEFAULT_DATE)?.key).toBe('summer');
  });

  it('keeps the day when it moves a date to another season', () => {
    /*
     * The buttons used to replace the day with the 21st, so every press
     * produced "the 21st of something" — which reads as a stuck default
     * rather than as a solstice, because nothing said it was one.
     */
    expect(sameDayInMonth({ year: 2026, month: 9, day: 17 }, 12)).toEqual({
      year: 2026,
      month: 12,
      day: 17,
    });
  });

  it('pulls the day back when the month it lands in is too short', () => {
    // The 31st of a 31-day month has no counterpart in a 30-day one, and a
    // date built from it rolls over into the month after.
    expect(sameDayInMonth({ year: 2026, month: 1, day: 31 }, 9)).toEqual({
      year: 2026,
      month: 9,
      day: 30,
    });
    expect(sameDayInMonth({ year: 2026, month: 1, day: 30 }, 2)).toEqual({
      year: 2026,
      month: 2,
      day: 28,
    });
    // And knows which Februaries have an extra one.
    expect(sameDayInMonth({ year: 2024, month: 1, day: 30 }, 2)).toEqual({
      year: 2024,
      month: 2,
      day: 29,
    });
  });
});

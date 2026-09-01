import { describe, expect, it } from 'vitest';
import {
  DEFAULT_DATE,
  SEASONS,
  dateLabel,
  fromDateInput,
  matchingSeason,
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
});

describe('the season shortcuts', () => {
  it('lights up only while the date really is that date', () => {
    for (const season of SEASONS) {
      expect(matchingSeason({ year: 2026, month: season.month, day: season.day })?.key).toBe(season.key);
    }
    // A day either side of a solstice is not the solstice.
    expect(matchingSeason({ year: 2026, month: 12, day: 22 })).toBeNull();
    expect(matchingSeason({ year: 2026, month: 7, day: 4 })).toBeNull();
  });

  it('matches whatever the year is, since the presets are seasonal', () => {
    expect(matchingSeason({ year: 2031, month: 6, day: 21 })?.key).toBe('winter');
  });

  it('opens on the summer solstice', () => {
    expect(matchingSeason(DEFAULT_DATE)?.key).toBe('summer');
  });
});

import { describe, expect, it } from 'vitest';
import { shiftDay } from './solar';

/*
 * Stepping a day is right about 96% of the time by adding one to the number,
 * and the other 4% is month ends, February, and leap years. These are the 4%.
 *
 * It matters here more than it looks: the arrows beside the date are for
 * comparing one day's shadow with the next, and a step that lands on the 32nd
 * of December would be handed to the solar position code as a real date.
 */

const at = (year: number, month: number, day: number) => ({ year, month, day });

describe('the day before and after', () => {
  it('moves within a month', () => {
    expect(shiftDay(at(2026, 6, 14), 1)).toEqual(at(2026, 6, 15));
    expect(shiftDay(at(2026, 6, 14), -1)).toEqual(at(2026, 6, 13));
  });

  it('crosses the end of a month', () => {
    expect(shiftDay(at(2026, 4, 30), 1)).toEqual(at(2026, 5, 1));
    expect(shiftDay(at(2026, 5, 1), -1)).toEqual(at(2026, 4, 30));
  });

  it('crosses the end of a year', () => {
    expect(shiftDay(at(2026, 12, 31), 1)).toEqual(at(2027, 1, 1));
    expect(shiftDay(at(2027, 1, 1), -1)).toEqual(at(2026, 12, 31));
  });

  it('knows February is short', () => {
    expect(shiftDay(at(2026, 2, 28), 1)).toEqual(at(2026, 3, 1));
  });

  it('knows which Februaries are not', () => {
    // 2024 is a leap year; 2026 is not.
    expect(shiftDay(at(2024, 2, 28), 1)).toEqual(at(2024, 2, 29));
    expect(shiftDay(at(2024, 3, 1), -1)).toEqual(at(2024, 2, 29));
  });

  it('knows the century rule, which the obvious leap test gets wrong', () => {
    // Divisible by 100 and not by 400: not a leap year, however it looks.
    expect(shiftDay(at(1900, 2, 28), 1)).toEqual(at(1900, 3, 1));
    // Divisible by 400: it is one.
    expect(shiftDay(at(2000, 2, 28), 1)).toEqual(at(2000, 2, 29));
  });

  it('lands on the same day it started from, going out and back', () => {
    for (const start of [at(2026, 12, 21), at(2026, 3, 21), at(2024, 2, 29)]) {
      expect(shiftDay(shiftDay(start, 1), -1)).toEqual(start);
    }
  });

  it('does not drift near midnight in a zone behind UTC', () => {
    /*
     * These are civil dates with no time in them. Built with the local
     * constructor, a machine set to a zone behind UTC resolves midnight to
     * the previous day and every step is off by one — which would show up as
     * the arrows appearing to do nothing on half the presses.
     */
    expect(shiftDay(at(2026, 1, 1), 1)).toEqual(at(2026, 1, 2));
    expect(shiftDay(at(2026, 1, 1), -1)).toEqual(at(2025, 12, 31));
  });
});

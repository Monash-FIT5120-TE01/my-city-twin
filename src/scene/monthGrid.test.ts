import { describe, expect, it } from 'vitest';
import { monthGrid, sameDay } from './solar';

/*
 * The grid behind the calendar. Off by one here shows up as a month whose
 * days sit under the wrong weekday names — which looks right at a glance and
 * is wrong in a way that only matters to somebody asking "is that footpath
 * sunny on a Saturday".
 */

const flat = (year: number, month: number) => monthGrid(year, month).flat();

describe('a month as a grid', () => {
  it('is always six rows of seven', () => {
    for (const [year, month] of [
      [2026, 2], // shortest, and in 2026 it starts on a Sunday
      [2026, 12],
      [2024, 2], // a leap February
      [2027, 8],
    ] as const) {
      const weeks = monthGrid(year, month);
      expect(weeks).toHaveLength(6);
      for (const week of weeks) expect(week).toHaveLength(7);
    }
  });

  it('starts every row on a Monday', () => {
    for (const week of monthGrid(2026, 12)) {
      const first = week[0].date;
      const weekday = new Date(
        Date.UTC(first.year, first.month - 1, first.day),
      ).getUTCDay();
      // getUTCDay: 1 is Monday.
      expect(weekday).toBe(1);
    }
  });

  it('runs without a gap, day after day', () => {
    const days = flat(2026, 12).map(({ date }) =>
      Date.UTC(date.year, date.month - 1, date.day),
    );
    const DAY = 24 * 60 * 60 * 1000;
    for (let i = 1; i < days.length; i++) {
      expect(days[i] - days[i - 1]).toBe(DAY);
    }
  });

  it('holds every day of the month it is for, exactly once', () => {
    const inMonth = flat(2026, 2).filter((cell) => cell.inMonth);
    expect(inMonth).toHaveLength(28);
    expect(new Set(inMonth.map((cell) => cell.date.day)).size).toBe(28);
    expect(inMonth[0].date.day).toBe(1);
    expect(inMonth[27].date.day).toBe(28);
  });

  it('counts a leap day as part of its month', () => {
    const inMonth = flat(2024, 2).filter((cell) => cell.inMonth);
    expect(inMonth).toHaveLength(29);
    expect(inMonth[28].date.day).toBe(29);
  });

  it('marks the days either side as not in the month', () => {
    const weeks = monthGrid(2026, 12);
    // 1 December 2026 is a Tuesday, so the row before it carries November.
    expect(weeks[0][0].inMonth).toBe(false);
    expect(weeks[0][0].date.month).toBe(11);
    expect(weeks[0][1].inMonth).toBe(true);
    expect(weeks[0][1].date.day).toBe(1);
  });

  it('carries the year across December and January', () => {
    const last = flat(2026, 12).at(-1)!;
    expect(last.date.year).toBe(2027);
    expect(last.inMonth).toBe(false);

    const first = flat(2027, 1)[0];
    expect(first.date.year).toBe(2026);
  });

  it('puts a month that begins on a Monday in the first cell', () => {
    // 1 June 2026 is a Monday.
    const weeks = monthGrid(2026, 6);
    expect(weeks[0][0].inMonth).toBe(true);
    expect(weeks[0][0].date.day).toBe(1);
  });
});

describe('the same day', () => {
  it('compares all three parts', () => {
    expect(sameDay({ year: 2026, month: 12, day: 21 }, { year: 2026, month: 12, day: 21 })).toBe(true);
    expect(sameDay({ year: 2026, month: 12, day: 21 }, { year: 2027, month: 12, day: 21 })).toBe(false);
    expect(sameDay({ year: 2026, month: 12, day: 21 }, { year: 2026, month: 11, day: 21 })).toBe(false);
    expect(sameDay({ year: 2026, month: 12, day: 21 }, { year: 2026, month: 12, day: 22 })).toBe(false);
  });
});

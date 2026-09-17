import { describe, expect, it } from 'vitest';
import { civilToInstant } from '../scene/solar';
import { SITE } from '../scene/frame';
import { clockLabel, outsideWindowNote, presentMoment } from './now';

/*
 * Every test here fixes the instant. "Now" is the one piece of state the app
 * cannot control, and a suite that read the real clock would pass or fail by
 * the hour it was run at — which is exactly the bug class it exists to catch.
 */

describe('the present moment in Melbourne', () => {
  it('reads a summer instant at UTC+11', () => {
    // Victoria is on daylight saving in January.
    const moment = presentMoment(new Date('2026-01-15T04:00:00Z'));
    expect(moment.date).toEqual({ year: 2026, month: 1, day: 15 });
    expect(clockLabel(moment.clockMinutes)).toBe('15:00');
  });

  it('reads a winter instant at UTC+10', () => {
    // The same UTC clock reading, six months later, is an hour earlier in
    // Melbourne. A hard-coded offset would put both at the same time and move
    // every shadow by an hour for half the year.
    const moment = presentMoment(new Date('2026-07-15T04:00:00Z'));
    expect(moment.date).toEqual({ year: 2026, month: 7, day: 15 });
    expect(clockLabel(moment.clockMinutes)).toBe('14:00');
  });

  it('crosses into the next Melbourne day before UTC does', () => {
    // 14:00 UTC is one in the morning in Melbourne, on the following date.
    const moment = presentMoment(new Date('2026-01-14T14:00:00Z'));
    expect(moment.date).toEqual({ year: 2026, month: 1, day: 15 });
    expect(clockLabel(moment.clockMinutes)).toBe('01:00');
  });

  it('agrees with the conversion that runs the other way', () => {
    // presentMoment and civilToInstant are inverses, and the simulation uses
    // the second to place the sun for what the first produced. A disagreement
    // between them would show as the sun being an hour off, only sometimes.
    for (const iso of ['2026-01-15T04:00:00Z', '2026-07-15T04:00:00Z', '2026-04-04T16:30:00Z']) {
      const instant = new Date(iso);
      const { date, clockMinutes } = presentMoment(instant);
      const back = civilToInstant(
        SITE.timeZone,
        date.year,
        date.month,
        date.day,
        Math.floor(clockMinutes / 60),
        clockMinutes % 60,
      );
      expect(back.getTime()).toBe(instant.getTime());
    }
  });
});

describe('when the clock is outside the hours on offer', () => {
  it('says nothing when the moment shows as it is', () => {
    const moment = presentMoment(new Date('2026-01-15T04:00:00Z')); // 15:00
    expect(moment.clamped).toBe(false);
    expect(outsideWindowNote(moment)).toBeNull();
  });

  it('says nothing for a time that was merely rounded to the slider step', () => {
    /*
     * 15:03 snaps to 15:00 because the slider moves in ten-minute steps. That
     * is not "outside the hours this simulation covers", and saying so was a
     * lie told on most page loads once the app began opening on the present
     * moment — nine minutes in ten are not multiples of ten.
     *
     * The earlier tests all used times already on the step, which is exactly
     * how this survived them.
     */
    const moment = presentMoment(new Date('2026-01-15T04:03:00Z')); // 15:03 AEDT
    expect(clockLabel(moment.clockMinutes)).toBe('15:03');
    expect(moment.minutes).toBe(15 * 60);
    expect(moment.clamped).toBe(false);
    expect(outsideWindowNote(moment)).toBeNull();
  });

  it('says so after dark rather than pretending it is 20:00', () => {
    const moment = presentMoment(new Date('2026-01-15T12:31:00Z')); // 23:31 AEDT
    expect(clockLabel(moment.clockMinutes)).toBe('23:31');
    expect(moment.minutes).toBe(20 * 60);
    expect(moment.clamped).toBe(true);

    const note = outsideWindowNote(moment);
    // Both readings in the sentence: the real one, and the one being shown.
    expect(note).toContain('23:31');
    expect(note).toContain('20:00');
  });

  it('says so before dawn too, not only after dark', () => {
    const early = presentMoment(new Date('2026-06-14T18:45:00Z')); // 04:45 AEST
    expect(clockLabel(early.clockMinutes)).toBe('04:45');
    expect(early.minutes).toBe(6 * 60);
    expect(outsideWindowNote(early)).toContain('06:00');
  });

  it('leaves the first minute of the window alone', () => {
    // The boundary itself is inside. Off by one here would put a note on
    // screen every morning at six for no reason.
    const dawn = presentMoment(new Date('2026-06-14T20:00:00Z')); // 06:00 AEST
    expect(clockLabel(dawn.clockMinutes)).toBe('06:00');
    expect(dawn.clamped).toBe(false);
    expect(outsideWindowNote(dawn)).toBeNull();
  });
});

describe('the clock label', () => {
  it('writes a whole minute as it is', () => {
    expect(clockLabel(0)).toBe('00:00');
    expect(clockLabel(6 * 60)).toBe('06:00');
    expect(clockLabel(23 * 60 + 31)).toBe('23:31');
  });

  /*
   * No caller passes a fraction: civilInZone reads whole hour and minute
   * fields, and daylightWindow rounds at the end of its bisection. These pin
   * the formatter as TOTAL, so that a later change to either source cannot
   * turn a rounding detail into a sunrise labelled an hour early.
   */
  it('rounds a fraction of a minute to the nearest one', () => {
    expect(clockLabel(419.2)).toBe('06:59');
    expect(clockLabel(419.7)).toBe('07:00');
  });

  it('carries the rounding into the hour instead of dropping it', () => {
    /*
     * The bug this replaces: the hour was floored from the raw number while
     * the minutes were rounded from it, so 419.7 read 06:00 -- the right
     * minutes against the wrong hour.
     */
    for (const minutes of [419.5, 479.6, 719.9]) {
      const [hh, mm] = clockLabel(minutes).split(':').map(Number);
      expect(hh * 60 + mm).toBe(Math.round(minutes));
    }
  });

  it('wraps rather than inventing a reading no clock has', () => {
    // 24:00 and -1:-1 are what the arithmetic gives when left open.
    expect(clockLabel(1439.6)).toBe('00:00');
    expect(clockLabel(24 * 60)).toBe('00:00');
    expect(clockLabel(-1)).toBe('23:59');
    expect(clockLabel(25 * 60)).toBe('01:00');
  });

  it('never produces anything but two digits, a colon and two digits', () => {
    for (let minutes = -120; minutes <= 24 * 60 + 120; minutes += 7) {
      expect(clockLabel(minutes)).toMatch(/^([01]\d|2[0-3]):[0-5]\d$/);
    }
  });
});

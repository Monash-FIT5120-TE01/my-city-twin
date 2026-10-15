import { describe, expect, it } from 'vitest';
import { hourLabel, whenLabel } from './activityFormat';

describe('hours in words, on a Melbourne clock', () => {
  it('writes an ordinary hour plainly', () => {
    expect(hourLabel(Date.parse('2026-10-14T20:00:00Z'))).toBe('07:00');
  });

  it('tells the two 02:00s apart on the night daylight saving ends', () => {
    // 4 April 2027: 02:00 AEDT (+11) is 15:00 UTC the day before, 02:00 AEST (+10) an hour later.
    const first = hourLabel(Date.parse('2027-04-03T15:00:00Z'));
    const second = hourLabel(Date.parse('2027-04-03T16:00:00Z'));
    expect(first).toBe('02:00 (GMT+11)');
    expect(second).toBe('02:00 (GMT+10)');
    expect(whenLabel(Date.parse('2027-04-03T15:00:00Z'))).not.toBe(whenLabel(Date.parse('2027-04-03T16:00:00Z')));
    // The hours either side are not repeated, so they stay plain.
    expect(hourLabel(Date.parse('2027-04-03T14:00:00Z'))).toBe('01:00');
    expect(hourLabel(Date.parse('2027-04-03T17:00:00Z'))).toBe('03:00');
  });
});

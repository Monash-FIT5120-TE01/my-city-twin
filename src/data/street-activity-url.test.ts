import { afterEach, describe, expect, it, vi } from 'vitest';
import { readUrlState, writeUrlState } from './urlState';

/*
 * The street activity's two parameters, through a stand-in for the window:
 * the suite runs without a document.
 */
function at(search: string) {
  const replaced: string[] = [];
  vi.stubGlobal('window', {
    location: { search, pathname: '/', hash: '' },
    history: { replaceState: (_: unknown, __: string, url: string) => replaced.push(url) },
  });
  return replaced;
}

afterEach(() => vi.unstubAllGlobals());

describe('the street activity in the address bar', () => {
  it('reads the hour and the counter on its own screen', () => {
    at('?view=activity&hour=2026-10-14T07:00:00.000Z&sensor=4');
    const state = readUrlState(new Date('2026-10-14T08:00:00+11:00'));
    expect(state.view).toBe('activity');
    expect(state.activityHour).toBe(Date.parse('2026-10-14T07:00:00.000Z'));
    expect(state.sensorId).toBe(4);
  });

  it('ignores an hour that is not on the hour, and a counter that is not a number', () => {
    at('?view=activity&hour=2026-10-14T07:30:00.000Z&sensor=4a');
    const state = readUrlState();
    expect(state.activityHour).toBeNull();
    expect(state.sensorId).toBeNull();
  });

  it('ignores both anywhere else', () => {
    at('?view=explore&hour=2026-10-14T07:00:00.000Z&sensor=4');
    const state = readUrlState();
    expect(state.activityHour).toBeNull();
    expect(state.sensorId).toBeNull();
  });

  it('writes them back on its own screen only, beside nothing of the sunlight screen', () => {
    const replaced = at('');
    const base = {
      devKey: null,
      buildingId: null,
      date: { year: 2026, month: 10, day: 14 },
      minutes: 600,
      receptor: null,
      planId: null,
      activityHour: Date.parse('2026-10-14T07:00:00.000Z'),
      sensorId: 4,
    };
    writeUrlState({ ...base, view: 'activity' });
    expect(replaced.at(-1)).toBe('/?view=activity&hour=2026-10-14T07%3A00%3A00.000Z&sensor=4');
    writeUrlState({ ...base, view: 'explore' });
    expect(replaced.at(-1)).toBe('/?view=explore');
  });
});

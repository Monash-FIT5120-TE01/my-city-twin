import { describe, expect, it } from 'vitest';
import { chooseSubject } from './urlState';

/*
 * A link names one place. Two at once was reachable by hand-editing the
 * query string, and it did not fail loudly: the building took over the
 * panels, the camera and the measurement while the 3D view kept drawing the
 * development — so the sunlight screen, whose entire claim is that you are
 * looking at one building's shadow, showed a different building's.
 */
describe('choosing the subject a URL names', () => {
  it('leaves a URL that names only one thing alone', () => {
    expect(chooseSubject('explore', 'X0015809', null)).toEqual({
      devKey: 'X0015809',
      buildingId: null,
    });
    expect(chooseSubject('explore', null, 'abc')).toEqual({
      devKey: null,
      buildingId: 'abc',
    });
    expect(chooseSubject('landing', null, null)).toEqual({
      devKey: null,
      buildingId: null,
    });
  });

  it('lets the project page keep its project', () => {
    expect(chooseSubject('development', 'X0015809', 'abc')).toEqual({
      devKey: 'X0015809',
      buildingId: null,
    });
  });

  it('lets the building page keep its building', () => {
    expect(chooseSubject('building', 'X0015809', 'abc')).toEqual({
      devKey: null,
      buildingId: 'abc',
    });
  });

  it('never returns both, on any view', () => {
    const views = ['landing', 'explore', 'development', 'building', 'sunlight'] as const;
    for (const view of views) {
      const chosen = chooseSubject(view, 'X0015809', 'abc');
      expect(Boolean(chosen.devKey && chosen.buildingId)).toBe(false);
      // And it never drops both — the link still names something.
      expect(Boolean(chosen.devKey || chosen.buildingId)).toBe(true);
    }
  });
});

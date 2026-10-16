import { describe, expect, it } from 'vitest';
import type { Massing } from '../../data/model';
import { fitRoom, toEN } from './roomPlacement';

let n = 0;
/** A part: one ring (plus optional holes), from base to top, metres AHD. */
function part(ring: [number, number][], base: number, top: number, sinks = true, holes: [number, number][][] = []): Massing {
  n += 1;
  return {
    id: `p${n}`, parentId: 'b', footprint: [[ring, ...holes]], baseAhdM: base, topAhdM: top,
    heightM: top - base, areaM2: 0, sinksToGround: sinks,
  };
}
const rect = (x0: number, y0: number, x1: number, y1: number): [number, number][] => [[x0, y0], [x1, y0], [x1, y1], [x0, y1]];
/** The same rectangle turned about the origin. */
function turned(ring: [number, number][], deg: number): [number, number][] {
  const a = (deg * Math.PI) / 180;
  return ring.map(([x, y]) => [x * Math.cos(a) - y * Math.sin(a), x * Math.sin(a) + y * Math.cos(a)]);
}

describe('placing the flat behind a side of a building', () => {
  const tower = [part(rect(-15, -15, 15, 15), 0, 90)];

  for (const [side, angle] of [['East', 0], ['North', 90], ['West', 180], ['South', 270]] as const) {
    it(`a 30 m square tower, ${side} side: placed, looking out of that side`, () => {
      const fit = fitRoom(tower, [], side, 10, null);
      expect(fit.ok).toBe(true);
      if (!fit.ok) return;
      const a = ((fit.placement.angle * 180) / Math.PI + 360) % 360;
      expect(a).toBeCloseTo(angle, 5);
      // the facade's middle (local 7.5, 3.4) is on the wall's middle, the floor on floor 10
      const [e, nn] = toEN(fit.placement, 7.5, 3.4);
      const mid = { East: [15, 0], North: [0, 15], West: [-15, 0], South: [0, -15] }[side];
      expect(e).toBeCloseTo(mid[0], 5);
      expect(nn).toBeCloseTo(mid[1], 5);
      expect(fit.placement.floorAhdM).toBeCloseTo(27, 5);
    });
  }

  it('a turned tower: the flat turns with the wall', () => {
    const t = [part(turned(rect(-15, -15, 15, 15), 30), 0, 90)];
    const fit = fitRoom(t, [], 'North-east', 10, null);
    expect(fit.ok).toBe(true);
    if (fit.ok) expect((fit.placement.angle * 180) / Math.PI).toBeCloseTo(30, 4);
  });

  it('refuses a floor the building does not have', () => {
    expect(fitRoom(tower, [], 'East', 40, null)).toEqual({ ok: false, problem: 'no-such-floor' });
  });

  it('refuses a side the building does not have at that floor', () => {
    const slab = [part(rect(-15, -15, 15, 15), 0, 90)];
    expect(fitRoom(slab, [], 'North-east', 10, null)).toEqual({ ok: false, problem: 'no-such-side' });
  });

  it('refuses a wall shorter than the flat', () => {
    const thin = [part(rect(-3.4, -20, 3.4, 20), 0, 90)];      // east wall 40 m, north wall 6.8 m
    expect(fitRoom(thin, [], 'North', 10, null)).toEqual({ ok: false, problem: 'wall-too-short' });
  });

  it('refuses a building too shallow for the flat behind that wall', () => {
    const shallow = [part(rect(-2.5, -20, 2.5, 20), 0, 90)];  // 5 m deep behind its east wall
    expect(fitRoom(shallow, [], 'East', 10, null)).toEqual({ ok: false, problem: 'building-too-shallow' });
  });

  it('refuses where the flat would stick out of the roof', () => {
    const low = [part(rect(-15, -15, 15, 15), 0, 11)];         // floor 4: 9 m, its sill 10.2, its ceiling slab 12
    expect(fitRoom(low, [], 'East', 4, null)).toEqual({ ok: false, problem: 'above-the-roof' });
  });

  it('refuses floors too low for the flat', () => {
    expect(fitRoom(tower, [], 'East', 10, 40)).toEqual({ ok: false, problem: 'ceiling-too-low' });   // 90 m over 40 storeys = 2.25 m
  });

  it('a tower on a podium: high floors go on the tower, not in mid-air beside it', () => {
    const t = [part(rect(-30, -30, 30, 30), 0, 12), part(rect(-12, -12, 12, 12), 12, 90, false)];
    const fit = fitRoom(t, [], 'East', 10, null);
    expect(fit.ok).toBe(true);
    if (fit.ok) expect(toEN(fit.placement, 7.5, 3.4)[0]).toBeCloseTo(12, 5);
  });

  it('a storey where the podium gives way to the tower part-way up: refused, not half in the air', () => {
    // floor 5 runs 12 .. 15; the wide part stops at 13.5, the narrow one above starts there
    const t = [part(rect(-30, -30, 30, 30), 0, 13.5), part(rect(-12, -30, 12, 30), 13.5, 90, false)];
    const fit = fitRoom(t, [], 'East', 5, null);
    expect(fit.ok).toBe(false);
  });

  it('an L-shaped building: the flat may not cross the inside corner', () => {
    // east wall of the lower leg is 20 m long, but the building behind its north end is only 4 m deep
    const L = [part([[-20, -20], [10, -20], [10, -12], [6, -12], [6, 20], [-20, 20]], 0, 90)];
    expect(fitRoom(L, [], 'East', 10, null).ok).toBe(true);           // the 36 m wall at x = 6 is fine
  });

  it('a courtyard behind the wall: refused', () => {
    const court = [part(rect(-20, -20, 20, 20), 0, 90, true, [rect(-18, -3, 14, 3)])];
    expect(fitRoom(court, [], 'East', 10, null)).toEqual({ ok: false, problem: 'building-too-shallow' });
  });

  it('another building where the flat would be: refused', () => {
    const neighbour = [part(rect(13, 1, 14, 2), 0, 90)];
    expect(fitRoom(tower, neighbour, 'East', 10, null)).toEqual({ ok: false, problem: 'next-building-in-the-way' });
  });

  it("the balcony would run into the building's own wing: refused", () => {
    const wing = [...tower, part(rect(15, -2, 25, 2), 0, 90, false)];
    expect(fitRoom(wing, [], 'East', 10, null)).toEqual({ ok: false, problem: 'balcony-in-the-way' });
  });

  it('a wall a few metres past the balcony: refused, there is nothing to look at', () => {
    const across = [part(rect(18, -20, 30, 20), 0, 90)];
    expect(fitRoom(tower, across, 'East', 10, null)).toEqual({ ok: false, problem: 'outlook-blocked' });
  });

  it('a building across a wide street is fine', () => {
    const across = [part(rect(45, -20, 60, 20), 0, 90)];
    expect(fitRoom(tower, across, 'East', 10, null).ok).toBe(true);
  });

  it("refuses when the sunlight screen's measuring point had to be moved off this wall", () => {
    expect(fitRoom(tower, [], 'East', 10, null, [15.5, 0]).ok).toBe(true);
    expect(fitRoom(tower, [], 'East', 10, null, [18.0, 0])).toEqual({ ok: false, problem: 'window-moved' });
  });
});

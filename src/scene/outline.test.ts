import { describe, expect, it } from 'vitest';
import type { Massing, Ring } from '../data/model';
import { outlineSegments } from './outline';

/** A rectangular block from (x0, y0) to (x1, y1), between two heights. */
function block(x0: number, y0: number, x1: number, y1: number, base: number, top: number): Massing {
  const ring: Ring = [
    [x0, y0],
    [x1, y0],
    [x1, y1],
    [x0, y1],
    [x0, y0],
  ];
  return {
    id: `${x0},${y0},${base}`,
    parentId: 'b',
    footprint: [[ring]],
    baseAhdM: base,
    topAhdM: top,
    heightM: top - base,
    areaM2: Math.abs((x1 - x0) * (y1 - y0)),
    sinksToGround: base === 0,
  };
}

/** Segments as readable rows, horizontal ones (roof lines) and uprights apart. */
function split(flat: Float32Array) {
  const roof: number[][] = [];
  const upright: number[][] = [];
  for (let i = 0; i < flat.length; i += 6) {
    const seg = Array.from(flat.slice(i, i + 6));
    (seg[2] === seg[5] ? roof : upright).push(seg);
  }
  return { roof, upright };
}

describe('the outline of a chosen building', () => {
  it('draws a plain box as its four roof lines and four corners', () => {
    const { roof, upright } = split(outlineSegments([block(0, 0, 10, 20, 0, 30)], 0));
    expect(roof).toHaveLength(4);
    expect(upright).toHaveLength(4);
    expect(roof.every((seg) => seg[2] === 30)).toBe(true);
  });

  it('keeps the podium and the tower on it, and nothing buried between them', () => {
    const podium = block(0, 0, 40, 40, 0, 10);
    const tower = block(10, 10, 30, 30, 10, 80);
    const { roof, upright } = split(outlineSegments([podium, tower], 0));
    // Four roof lines each; four corners each.
    expect(roof).toHaveLength(8);
    expect(upright).toHaveLength(8);
  });

  it('draws no seam where two blocks of one height meet', () => {
    const left = block(0, 0, 10, 10, 0, 20);
    const right = block(10, 0, 20, 10, 0, 20);
    const { roof, upright } = split(outlineSegments([left, right], 0));
    // The shared wall's roof line is gone from both sides.
    expect(roof).toHaveLength(6);
    expect(roof.some((seg) => seg[0] === 10 && seg[3] === 10)).toBe(false);
    // Only the four outer corners stand; the two on the shared wall do not.
    expect(upright).toHaveLength(4);
  });

  it('keeps the part of a corner that rises above a lower neighbour', () => {
    // A 100 m tower beside a 60 m block, sharing the wall at x = 10.
    const tower = block(0, 0, 10, 10, 0, 100);
    const lower = block(10, 0, 20, 10, 0, 60);
    const { upright } = split(outlineSegments([tower, lower], 0));
    // The tower's two corners on the shared wall show from 60 m up.
    const shared = upright.filter((seg) => seg[0] === 10);
    expect(shared.length).toBe(2);
    for (const seg of shared) {
      expect(seg[2]).toBeGreaterThanOrEqual(59);
      expect(seg[2]).toBeLessThanOrEqual(61);
      expect(seg[5]).toBe(100);
    }
  });

  it('keeps the exposed ends of a roof line a neighbour only partly covers', () => {
    // A 20 m square, with a neighbour of the same height against the middle
    // 10 m of its east side.
    const square = block(0, 0, 20, 20, 0, 30);
    const neighbour = block(20, 5, 30, 15, 0, 30);
    const { roof } = split(outlineSegments([square, neighbour], 0));
    const east = roof.filter((seg) => seg[0] === 20 && seg[3] === 20);
    // Two stretches remain: 0–5 m and 15–20 m along the side.
    expect(east).toHaveLength(2);
    const exposed = east.reduce((sum, seg) => sum + Math.abs(seg[4] - seg[1]), 0);
    expect(exposed).toBeCloseTo(10, 0);
  });

  it('leaves out the joints round a curve but keeps the corners of an octagon', () => {
    const circle = (sides: number): Massing => {
      const ring: Ring = Array.from({ length: sides }, (_, i) => {
        const a = (i / sides) * Math.PI * 2;
        return [Math.cos(a) * 20, Math.sin(a) * 20] as [number, number];
      });
      return { ...block(0, 0, 1, 1, 0, 50), footprint: [[ring]] };
    };
    expect(split(outlineSegments([circle(32)], 0)).upright).toHaveLength(0);
    expect(split(outlineSegments([circle(8)], 0)).upright).toHaveLength(8);
  });
});

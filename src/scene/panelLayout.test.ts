import { describe, expect, it } from 'vitest';
import type { Massing } from '../data/model';
import { usableRoof } from './roofParts';
import { EDGE_SETBACK_M, layOut } from './panelLayout';
import { BALLASTED_EW, MODULE, PAIR_WIDTH_M, ROW_LENGTH_M } from './panelModel';

/** A plain box building, `w` along by `l` across, `h` tall, turned `turn` radians from east, from `e0` along. */
const box = (w: number, l: number, h: number, turn = 0, id = 'b', e0 = 0): Massing[] => {
  const c = Math.cos(turn), s = Math.sin(turn);
  const ring = [[e0, 0], [e0 + w, 0], [e0 + w, l], [e0, l], [e0, 0]].map(([x, y]) => [x * c - y * s, x * s + y * c] as [number, number]);
  return [{ id, parentId: 'b', footprint: [[ring]], baseAhdM: 10, topAhdM: 10 + h, heightM: h, areaM2: w * l, sinksToGround: true }];
};
/** A part's box seen from above, turned by the layout's yaw back to east/north: its four corners. */
const cornersEN = (m: { centre: number[]; size: number[]; turnY: number }, yaw: number): [number, number][] => {
  const hx = (m.size[0] * Math.cos(m.turnY)) / 2, hy = m.size[1] / 2, c = Math.cos(yaw), s = Math.sin(yaw);
  return [[-hx, -hy], [hx, -hy], [hx, hy], [-hx, hy]].map(([dx, dy]) => {
    const x = m.centre[0] + dx, y = m.centre[1] + dy;
    return [x * c - y * s, x * s + y * c] as [number, number];
  });
};

describe('laying panels out', () => {
  const parts = box(30, 20, 20);
  const roof = usableRoof(parts, { blockM: 1 });
  const all = (energy: number, shaded = 0) => roof.blocks!.map(() => ({ energy, shaded }));

  it('fills an open roof with whole pairs, kept in from the edges', () => {
    const layout = layOut(roof.grid!, all(1), parts, 'light');
    expect(layout.frame).toBe('ballasted');
    // as many as fit in the roof less the setback: pairs across its 30 m east-west, rows along its 20 m
    const across = Math.floor((30 - 2 * EDGE_SETBACK_M) / PAIR_WIDTH_M.ballasted);
    const along = Math.floor((20 - 2 * EDGE_SETBACK_M) / ROW_LENGTH_M.ballasted);
    expect(layout.panels).toBe(2 * across * along);
    expect(layout.lightSum).toBeCloseTo(layout.panels, 6);
    // every panel's centre, turned back to east/north, sits well inside the roof
    const c = Math.cos(layout.yaw), s = Math.sin(layout.yaw);
    for (const m of layout.parts.modules) {
      const [x, y] = m.centre, e = x * c - y * s, n = x * s + y * c;
      expect(e).toBeGreaterThan(EDGE_SETBACK_M + MODULE.widthM / 2 - 0.3);
      expect(e).toBeLessThan(30 - EDGE_SETBACK_M);
      expect(n).toBeGreaterThan(EDGE_SETBACK_M);
      expect(n).toBeLessThan(20 - EDGE_SETBACK_M);
      expect(m.centre[2]).toBeGreaterThan(30);
    }
  });

  it('puts nothing where the roof keeps too little light, and counts the rule apart', () => {
    expect(layOut(roof.grid!, all(0.87), parts, 'light').panels).toBe(0);
    expect(layOut(roof.grid!, all(0.87, 0.1), parts, 'rule').panels).toBeGreaterThan(0);
  });

  it('fixes the frame to the slab on a building over 30 m', () => {
    const tall = box(30, 20, 45);
    const r = usableRoof(tall, { blockM: 1 });
    expect(layOut(r.grid!, r.blocks!.map(() => ({ energy: 1, shaded: 0 })), tall, 'light').frame).toBe('anchored');
  });

  it('keeps every panel and plate 1 m in on a turned roof, and off the dark half', () => {
    const turn = 0.44, parts = box(40, 24, 20, turn);
    const r = usableRoof(parts, { blockM: 1 });
    const c = Math.cos(turn), s = Math.sin(turn);
    const across = (e: number, n: number) => -e * s + n * c;
    // the blocks more than 12 m across the roof keep too little light
    const sun = r.blocks!.map((b) => ({ energy: across(b.centre[0], b.centre[1]) > 12 ? 0.5 : 1, shaded: 0 }));
    const layout = layOut(r.grid!, sun, parts, 'light');
    expect(layout.panels).toBeGreaterThan(0);
    for (const m of [...layout.parts.modules, ...layout.parts.plates, ...layout.parts.posts]) {
      for (const [e, n] of cornersEN(m, layout.yaw)) {
        const along = e * c + n * s, a = across(e, n);
        expect(along).toBeGreaterThanOrEqual(EDGE_SETBACK_M - 1e-6);
        expect(along).toBeLessThanOrEqual(40 - EDGE_SETBACK_M + 1e-6);
        expect(a).toBeGreaterThanOrEqual(EDGE_SETBACK_M - 1e-6);
        // a block's sample point may sit up to a block from its edge: nothing reaches past 13 m
        expect(a).toBeLessThanOrEqual(13 + 1e-6);
      }
    }
  });

  it('finds the same blocks each time for the same building (two cities compare block by block)', () => {
    const a = usableRoof(parts, { blockM: 1 }), b = usableRoof(parts, { blockM: 1 });
    expect(b.blocks).toEqual(a.blocks);
    expect(b.pieces.map((p) => p.block)).toEqual(a.pieces.map((p) => p.block));
  });

  it('does not lay a pair across two roofs at different heights', () => {
    // two parts side by side, 0.3 m apart in height: one roof level, two heights
    const parts = [...box(15, 20, 20, 0, 'a'), ...box(15, 20, 20.3, 0, 'c', 15)];
    const r = usableRoof(parts, { blockM: 1 });
    const layout = layOut(r.grid!, r.blocks!.map(() => ({ energy: 1, shaded: 0 })), parts, 'light');
    expect(layout.panels).toBeGreaterThan(0);
    // each module's roof height, from its centre less the frame's lift, is the roof under the whole of it
    const t = (10 * Math.PI) / 180;
    const lift = BALLASTED_EW.lowEdgeM + (MODULE.widthM * Math.sin(t)) / 2 + (MODULE.thickM / 2) * Math.cos(t);
    for (const m of layout.parts.modules) {
      const es = cornersEN(m, layout.yaw).map(([e]) => e);
      const under = Math.max(...es) <= 15 ? 30 : Math.min(...es) >= 15 ? 30.3 : NaN;
      expect(m.centre[2] - lift).toBeCloseTo(under, 4);   // the grid keeps heights as 32-bit floats
    }
  });
});

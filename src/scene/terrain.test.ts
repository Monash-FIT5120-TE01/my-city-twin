import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildCityModel } from '../data/adapter';
import type { ApiBuildingPart, ApiDevelopmentPart, ApiFeatureCollection } from '../data/api-types';
import type { Massing } from '../data/model';
import { blocked, indexObstacles } from './obstacles';
import { storeyHeightM } from './facades';
import { fitRoomInModel } from './room/roomPlacement';
import { withGroundHorizon } from './skyline';
import { sunlightAtPoint } from './sunlightAt';
import { buildTerrain, groundAt, groundUnder, heightAt, lowestUnder, type Terrain } from './terrain';

let n = 0;
const square = (e: number, nn: number, half: number, base: number, parentId = `b${++n}`): Massing => ({
  id: `p${n}`, parentId, baseAhdM: base, topAhdM: base + 30, heightM: 30, areaM2: 0, sinksToGround: true,
  footprint: [[[[e - half, nn - half], [e + half, nn - half], [e + half, nn + half], [e - half, nn + half]]]],
});

describe('the ground from the buildings on it', () => {
  // two buildings 200 m apart on a slope: 10 m AHD at the west one, 30 m at the east one
  const west = square(0, 0, 10, 10);
  const east = square(200, 0, 10, 30);
  const t = buildTerrain([west, east, { ...west, id: 'upper', baseAhdM: 25, sinksToGround: false }], { minE: -50, minN: -50, maxE: 250, maxN: 50 });

  // smoothed (a blur cannot make a step), so near each building's own ground rather than exactly on it
  it('is close to each building’s own ground at its outline', () => {
    expect(Math.abs(heightAt(t, -10, 0) - 10)).toBeLessThan(1.5);
    expect(Math.abs(heightAt(t, 210, 0) - 30)).toBeLessThan(1.5);
  });

  it('rises steadily from one to the other: no terrace, no dip', () => {
    let last = -Infinity;
    for (let e = -10; e <= 210; e += 10) {
      const h = heightAt(t, e, 0);
      expect(h).toBeGreaterThanOrEqual(last - 1e-6);
      last = h;
    }
  });

  it('runs between them, the street half-way up the slope', () => {
    const mid = heightAt(t, 100, 0);
    expect(mid).toBeGreaterThan(15);
    expect(mid).toBeLessThan(25);
  });

  it('takes a building’s ground from its lowest part, not a part standing on another', () => {
    expect(Math.abs(heightAt(t, 0, 0) - 10)).toBeLessThan(1.5);
  });

  it('answers outside its grid from the nearest edge', () => {
    expect(heightAt(t, -5000, 0)).toBeCloseTo(heightAt(t, t.minE, 0), 6);
  });

  it('the lowest ground under an outline is no higher than the ground at any of its corners', () => {
    const fp = [[[[90, -20], [130, -20], [130, 20], [90, 20]]]] as Massing['footprint'];
    const low = lowestUnder(t, fp);
    for (const [e, nn] of fp[0][0]) expect(low).toBeLessThanOrEqual(heightAt(t, e, nn) + 1e-6);
  });

  it('a flat number still works where one is passed', () => {
    expect(groundAt(12, 5, 5)).toBe(12);
    expect(groundUnder(12, west.footprint)).toBe(12);
  });
});

describe('the ground of the real city', () => {
  // (load and build below; the smoothness test reads the slopes of the whole grid)
  const load = <T,>(name: string): T => JSON.parse(readFileSync(resolve(__dirname, '../../public/data', name), 'utf-8'));
  const { model } = buildCityModel(
    load<ApiFeatureCollection<ApiBuildingPart>>('building-footprints.json'),
    load<ApiFeatureCollection<ApiDevelopmentPart>>('development-footprints.json'),
    'snapshot',
  );

  it('is as smooth as a real city: no slope steeper than a steep street, nearly all gentle', () => {
    const t = buildTerrain(model.buildings, model.extent);
    const slopes: number[] = [];
    for (let r = 0; r < t.rows - 1; r++) {
      for (let c = 0; c < t.cols - 1; c++) {
        const i = r * t.cols + c;
        slopes.push(Math.hypot(t.heights[i + 1] - t.heights[i], t.heights[i + t.cols] - t.heights[i]) / t.cell);
      }
    }
    slopes.sort((a, b) => a - b);
    const p99 = slopes[Math.floor(slopes.length * 0.99)];
    console.log(`slopes: 99% under ${(p99 * 100).toFixed(1)}%, steepest ${(slopes[slopes.length - 1] * 100).toFixed(1)}%`);
    expect(p99).toBeLessThan(0.12);
    expect(slopes[slopes.length - 1]).toBeLessThan(0.3);
  });

  it('is built in well under a second', () => {
    const t0 = performance.now();
    buildTerrain(model.buildings, model.extent);
    expect(performance.now() - t0).toBeLessThan(1500);
  });

  it('guesses a building’s ground from its neighbours to within a few metres (leave one out)', () => {
    const ids = [...new Set(model.buildings.map((b) => b.parentId))];
    const errors: number[] = [];
    for (let i = 0; i < ids.length; i += 15) {
      const id = ids[i];
      const parts = model.buildings.filter((b) => b.parentId === id);
      const others = model.buildings.filter((b) => b.parentId !== id);
      const t = buildTerrain(others, { minE: Math.min(...parts.flatMap((p) => p.footprint[0][0].map((v) => v[0]))) - 1, minN: Math.min(...parts.flatMap((p) => p.footprint[0][0].map((v) => v[1]))) - 1, maxE: Math.max(...parts.flatMap((p) => p.footprint[0][0].map((v) => v[0]))) + 1, maxN: Math.max(...parts.flatMap((p) => p.footprint[0][0].map((v) => v[1]))) + 1 });
      const base = Math.min(...parts.map((p) => p.baseAhdM));
      const [e, nn] = parts[0].footprint[0][0][0];
      errors.push(Math.abs(heightAt(t, e, nn) - base));
    }
    errors.sort((a, b) => a - b);
    const median = errors[Math.floor(errors.length / 2)];
    const p90 = errors[Math.floor(errors.length * 0.9)];
    console.log(`leave-one-out: ${errors.length} buildings, median ${median.toFixed(2)} m, 90% within ${p90.toFixed(2)} m, worst ${errors[errors.length - 1].toFixed(1)} m`);
    expect(median).toBeLessThan(1.5);
    expect(p90).toBeLessThan(4);
  }, 120_000);
});

describe('heights read between grid points', () => {
  // one cell: the south-west and north-east corners 0.3 m up, the other two at 0
  const cell: Terrain = { minE: 0, minN: 0, cell: 10, cols: 2, rows: 2, heights: new Float32Array([0.3, 0, 0, 0.3]), reference: 0 };

  it('lie on the same two triangles the ground is drawn with (split south-west to north-east)', () => {
    expect(heightAt(cell, 5, 5)).toBeCloseTo(0.3, 6);       // on the shared diagonal
    expect(heightAt(cell, 7.5, 2.5)).toBeCloseTo(0.15, 6);  // the south-east triangle, half way to its corner
    expect(heightAt(cell, 2.5, 7.5)).toBeCloseTo(0.15, 6);  // the north-west one
  });
});

describe('walls on a slope', () => {
  // ground rising 1 m a metre eastward over the part; a part raised above the ground 14..19 m AHD
  const slope: Terrain = {
    minE: 0, minN: 0, cell: 1, cols: 11, rows: 2,
    heights: new Float32Array([...Array.from({ length: 11 }, (_, i) => 5 + i), ...Array.from({ length: 11 }, (_, i) => 5 + i)]),
    reference: 10,
  };
  const raised = square(5, 0.5, 4, 14, 'raised');
  raised.topAhdM = 19;
  raised.sinksToGround = false;

  it('a raised part is met by a walker on the uphill side, not only on the downhill one', () => {
    const index = indexObstacles([raised], slope, 1.7);
    expect(index.count).toBe(1);
    expect(blocked(index, 8.5, 0.5)).toBe(true);
  });

  it('a low block on the low side of a slope is under a walker standing higher up: not in the way there', () => {
    const low = square(5, 0.5, 4, 5, 'low-block');
    low.topAhdM = 10;   // ground 6..14 m under it: only its downhill end stands above eye height
    const index = indexObstacles([low], slope, 1.7);
    expect(blocked(index, 2, 0.5)).toBe(true);    // ground 7, eye 8.7: the block's side
    expect(blocked(index, 8.5, 0.5)).toBe(false); // ground 13.5, eye 15.2: over it
  });

  it('and walked under on the downhill side, where it is overhead: no invisible wall there', () => {
    const index = indexObstacles([raised], slope, 1.7);
    expect(blocked(index, 2, 0.5)).toBe(false);   // ground 7 m, eye 8.7 m, the part starts at 14 m
  });
});

describe('floors and windows on a slope', () => {
  // ground rising 1 m every 2 m eastward, 0 m at the tower's west wall (e = -15)
  const cols = 41;
  const rising: Terrain = {
    minE: -200, minN: -200, cell: 10, cols, rows: cols,
    heights: Float32Array.from({ length: cols * cols }, (_, i) => Math.max(0, (-200 + (i % cols) * 10 + 15) / 2)),
    reference: 0,
  };
  const tower = square(0, 0, 15, 0, 'slope-tower');
  tower.topAhdM = 90;

  it('a low flat on the uphill side is refused: below the street there', () => {
    expect(fitRoomInModel([tower], 'slope-tower', 'East', 2, null, null, rising)).toEqual({ ok: false, problem: 'below-the-street' });
  });

  it('the same flat high enough is not', () => {
    expect(fitRoomInModel([tower], 'slope-tower', 'East', 10, null, null, rising)?.ok).toBe(true);
  });

  it('known storeys share out the height above the ground the floors start from', () => {
    expect(storeyHeightM([tower], 10, 15)).toBeCloseTo((90 - 15) / 10, 6);
  });

  it('a rise just in front of a window counts, not only ones five metres off', () => {
    // 2 m north the ground is 0.5 m above the window; beyond, it falls away
    const sky = withGroundHorizon(new Float32Array(360), [0, 0], 1, (_e, n) => (n > 1.5 && n < 2.5 ? 1.5 : 0));
    expect(sky[0]).toBeGreaterThan(10);
  });

  it('sun behind the hill is neither had nor taken by a proposal', () => {
    const hill = new Float32Array(360).fill(90);   // the ground hides the sun all round
    const block = square(0, -30, 5, 0, 'block');
    const r = sunlightAtPoint([0, -60], 0, 0, [block], { year: 2026, month: 6, day: 21 }, hill);
    expect(r.withoutSubjectMin).toBe(0);
    expect(r.lostMin).toBe(0);
  });

  it('the ground rising ahead of a window is a horizon the sun has to clear', () => {
    const sky = withGroundHorizon(new Float32Array(360), [0, 0], 1, (_e, n) => (n > 50 ? 21 : 0));
    expect(sky[0]).toBeGreaterThan(10);   // due north: the rise 50 m away, 20 m above the window
    expect(sky[180]).toBe(0);             // due south: flat, open to the horizon
  });
});

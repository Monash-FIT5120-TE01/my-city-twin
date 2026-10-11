import { describe, expect, it } from 'vitest';
import type { Massing } from '../data/model';
import type { RoofBlock } from './roofParts';
import { annualSunSamples, diffuseShareOf, MONTHLY_LIGHT, shadedShare, yearLight } from './solarShade';
import { levelOf } from './useSolarCheck';

const samples = annualSunSamples(2026);
const block: RoofBlock = { centre: [0, 0], topAhdM: 20, areaM2: 1, level: 0, cell: [0, 0] };
const box = (id: string, e0: number, n0: number, e1: number, n1: number, top: number): Massing => ({
  id, parentId: id, footprint: [[[[e0, n0], [e1, n0], [e1, n1], [e0, n1], [e0, n0]]]],
  baseAhdM: 0, topAhdM: top, heightM: top, areaM2: (e1 - e0) * (n1 - n0), sinksToGround: true,
});

describe('the energy share', () => {
  it('splits the year between the sun and the sky about as the measured light does', () => {
    const total = samples.reduce((t, s) => t + s.beam, 0);
    expect(total).toBeGreaterThan(0.6);
    // the measured diffuse share on the level, about a third, is close to the panel's
    const measured = MONTHLY_LIGHT.reduce((t, m) => t + m.globalKwhM2 * m.diffuseShare, 0) / MONTHLY_LIGHT.reduce((t, m) => t + m.globalKwhM2, 0);
    expect(Math.abs(diffuseShareOf(samples) - measured)).toBeLessThan(0.03);
  });

  it('turns the measured light onto the pairs about as PVGIS does', () => {
    // PVGIS 5.3 PVcalc for the site, kWh/m² a year on the panel: east and west at 10 degrees 1,600.8 and
    // 1,599.3, level 1,613.5; turned 20 degrees (aspects -70 and 110) 1,555.1 and 1,644.7
    const level = MONTHLY_LIGHT.reduce((t, m) => t + m.globalKwhM2, 0);
    expect(yearLight(2026, 90) / level).toBeCloseTo((1600.8 + 1599.3) / 2 / 1613.5, 2);
    expect(yearLight(2026, 70) / yearLight(2026, 90)).toBeCloseTo((1555.1 + 1644.7) / (1600.8 + 1599.3), 2);
  });

  it('carries no direct light below the altitude the shaders are cut at, and loses none to the sky', () => {
    for (const s of samples) if (s.altitudeDeg < 2) expect(s.beam).toBe(0);
    // the diffuse share left is exactly the months' diffuse light on the panel: no direct light leaked into it
    const diffuse = MONTHLY_LIGHT.reduce((t, m) => t + (m.globalKwhM2 * m.diffuseShare * (1 + Math.cos((10 * Math.PI) / 180))) / 2, 0);
    expect(diffuseShareOf(samples)).toBeCloseTo(diffuse / yearLight(2026, 90), 9);
  });

  it('weights a low sun by which way the pair is turned', () => {
    // a morning sun a few degrees up in the north-east falls more squarely on a pair turned towards it
    const turned = annualSunSamples(2026, 45);
    const k = samples.findIndex((s) => s.altitudeDeg > 3 && s.altitudeDeg < 6 && s.azimuthDeg > 40 && s.azimuthDeg < 70);
    expect(k).toBeGreaterThanOrEqual(0);
    // (about 7% more here; a calculation that ignored the turn would give the same weight within 0.2%)
    expect(turned[k].beam / samples[k].beam).toBeGreaterThan(1.04);
  });

  it('keeps all of the year for a block with nothing around it', () => {
    const sun = shadedShare(block, [], samples);
    expect(sun.shaded).toBe(0);
    expect(sun.energy).toBeCloseTo(1, 6);
    expect(levelOf(sun)).toBe(4);
  });

  it('keeps little at the foot of a tower to the north, and the sky still counts', () => {
    // a 200 m tower 10 m north of the block, 60 m wide: the sun is behind it most of the year
    const sun = shadedShare(block, [box('t', -30, 10, 30, 40, 220)], samples);
    expect(sun.shaded).toBeGreaterThan(0.5);
    expect(sun.energy).toBeLessThan(0.6);
    expect(sun.energy).toBeGreaterThan(0.15);
    expect(levelOf(sun)).toBe(1);
  });

  it('loses less energy than time to a building that only hides the low sun', () => {
    // 20 m above the block and 200 m to the west: the sun behind it is under 6 degrees, and weak
    const sun = shadedShare(block, [box('w', -260, -100, -200, 100, 40)], samples);
    expect(sun.shaded).toBeGreaterThan(0.01);
    expect(1 - sun.energy).toBeLessThan(sun.shaded / 2);
  });
});

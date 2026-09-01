import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildCityModel } from './adapter';
import { mergeMassings, groundElevationOf } from '../scene/massing';
import type { ApiBuildingPart, ApiDevelopmentPart, ApiFeatureCollection } from './api-types';

/*
 * End-to-end check of the data path, without a browser: API snapshot in,
 * merged geometry out. This is what tells us the city is standing in the
 * right place at the right size before anyone looks at it.
 */

const load = <T,>(name: string): T =>
  JSON.parse(readFileSync(resolve(__dirname, '../../public/data', name), 'utf-8'));

const buildings = load<ApiFeatureCollection<ApiBuildingPart>>('building-footprints.json');
const developments = load<ApiFeatureCollection<ApiDevelopmentPart>>(
  'development-footprints.json',
);

const { model, report } = buildCityModel(buildings, developments, 'snapshot');

describe('city model', () => {
  it('keeps every source row', () => {
    expect(report.buildingParts).toBe(4443);
    expect(report.buildings).toBe(1548);
    expect(report.developmentParts).toBe(133);
    expect(report.developments).toBe(49);
  });

  it('reports the rows whose two height columns disagree, without dropping them', () => {
    expect(report.heightDisagreements).toBe(45);
    expect(report.worstDisagreementM).toBeGreaterThan(11);
    // Flagged, still present, still casting shadow.
    const flagged = model.buildings.filter((b) => !b.readyFor3d);
    expect(flagged.length).toBeGreaterThanOrEqual(45);
    expect(model.buildings).toHaveLength(4443);
  });

  it('lands on the Hoddle Grid at roughly the right size', () => {
    const width = model.extent.maxE - model.extent.minE;
    const depth = model.extent.maxN - model.extent.minN;
    // The grid is about 2 km across. A projection mistake shows up here as
    // either metres-sized or degree-sized numbers.
    expect(width).toBeGreaterThan(1500);
    expect(width).toBeLessThan(3000);
    expect(depth).toBeGreaterThan(1500);
    expect(depth).toBeLessThan(3000);
  });

  it('keeps each roof plane on its own base rather than inventing a column', () => {
    // Extruding every plane from the structure's ground would be simpler, but
    // 201 of the elevated planes have nothing beneath them in the source, and
    // an invented solid casts an invented shadow.
    const elevated = model.buildings.filter((b) => b.baseAhdM > b.topAhdM - b.heightM + 0.001);
    expect(elevated).toHaveLength(0);
    for (const part of model.buildings) {
      expect(part.topAhdM - part.baseAhdM).toBeCloseTo(part.heightM, 6);
    }
  });

  it('sinks exactly one level of each building to the ground', () => {
    const byParent = new Map<string, typeof model.buildings>();
    for (const part of model.buildings) {
      const list = byParent.get(part.parentId) ?? [];
      list.push(part);
      byParent.set(part.parentId, list);
    }
    for (const parts of byParent.values()) {
      const lowest = Math.min(...parts.map((p) => p.baseAhdM));
      // Nothing hovers: the lowest plane always reaches down.
      expect(parts.some((p) => p.sinksToGround)).toBe(true);
      for (const part of parts) {
        expect(part.sinksToGround).toBe(part.baseAhdM <= lowest + 0.01);
      }
    }
  });

  it('has plausible heights', () => {
    const tallest = Math.max(...model.buildings.map((b) => b.heightM));
    expect(tallest).toBeGreaterThan(200);
    expect(tallest).toBeLessThan(400);
  });
});

describe('the demonstration development', () => {
  const focus = model.developments.find((d) => d.devKey === 'X0015700');

  it('is 640-652 Bourke Street, approved, three components', () => {
    expect(focus).toBeDefined();
    expect(focus!.streetAddress).toContain('640-652 Bourke Street');
    expect(focus!.status).toBe('APPROVED');
    expect(focus!.parts).toHaveLength(3);
    expect(focus!.maxHeightM).toBeCloseTo(214.1, 1);
  });

  it('sits inside the modelled city', () => {
    const [e, n] = focus!.anchorEN;
    expect(e).toBeGreaterThan(model.extent.minE);
    expect(e).toBeLessThan(model.extent.maxE);
    expect(n).toBeGreaterThan(model.extent.minN);
    expect(n).toBeLessThan(model.extent.maxN);
  });

  it('carries its land uses once, not once per component', () => {
    const types = focus!.landUses.map((u) => u.useType);
    expect(new Set(types).size).toBe(types.length);
    expect(types).toContain('Dwellings');
  });
});

describe('geometry', () => {
  const ground = groundElevationOf(model.buildings);

  it('merges the whole city into one buffer', () => {
    const merged = mergeMassings(
      model.buildings.filter((b) => b.readyFor3d),
      ground,
    );
    expect(merged).not.toBeNull();
    const position = merged!.getAttribute('position');
    expect(position.count).toBeGreaterThan(10_000);

    merged!.computeBoundingBox();
    const box = merged!.boundingBox!;
    // z is up inside the world frame; nothing should be below the ground
    // plane by more than the terrain fall across the grid.
    expect(box.max.z).toBeGreaterThan(150);
    expect(box.max.z).toBeLessThan(350);
  });

  it('builds the proposal', () => {
    const focus = model.developments.find((d) => d.devKey === 'X0015700')!;
    const merged = mergeMassings(focus.parts, ground);
    expect(merged).not.toBeNull();
    merged!.computeBoundingBox();
    expect(merged!.boundingBox!.max.z).toBeCloseTo(227.3, 0);
  });
});

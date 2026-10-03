/*
 * Double-clicking an existing building: the two pure halves of it.
 *
 * WHAT THESE PIN DOWN
 *   - The welded city still knows which building drew each triangle: for
 *     every drawn part, its first and last triangle name that part, and the
 *     triangles either side of a boundary name the two neighbours. A ray
 *     that hits a tower must open that tower, not the one merged before it.
 *   - A triangle number past the end names nothing.
 *   - Every building can be opened, with an address or without one: a
 *     building the register has no address for gets a plain label saying
 *     so, its parts' centre and its true height — not an invented address.
 *   - The search list's entries are unchanged by the shared summary.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildCityModel } from './adapter';
import { UNADDRESSED, buildingEntry } from './buildingEntry';
import { groundElevationOf, mergeMassingsOwned, ownerAt } from '../scene/massing';
import type { ApiBuildingPart, ApiDevelopmentPart, ApiFeatureCollection } from './api-types';

const load = <T,>(name: string): T =>
  JSON.parse(readFileSync(resolve(__dirname, '../../public/data', name), 'utf-8'));

const { model } = buildCityModel(
  load<ApiFeatureCollection<ApiBuildingPart>>('building-footprints.json'),
  load<ApiFeatureCollection<ApiDevelopmentPart>>('development-footprints.json'),
  'snapshot',
);
const ground = groundElevationOf(model.buildings);

describe('which building drew a triangle', () => {
  // A few hundred parts: enough boundaries to test, quick to extrude.
  const parts = model.buildings.filter((b) => b.readyFor3d).slice(0, 300);
  const owned = mergeMassingsOwned(parts, ground)!;

  it('ends where the merged geometry ends', () => {
    expect(owned.ends[owned.ends.length - 1]).toBe(owned.geometry.getAttribute('position').count);
    expect(owned.owners.length).toBe(owned.ends.length);
  });

  it('names each part by its first and last triangle', () => {
    owned.owners.forEach((owner, i) => {
      const start = i === 0 ? 0 : owned.ends[i - 1];
      expect(ownerAt(owned, start / 3)).toBe(owner);
      expect(ownerAt(owned, owned.ends[i] / 3 - 1)).toBe(owner);
    });
  });

  it('names nothing past the end, or before the start', () => {
    expect(ownerAt(owned, owned.ends[owned.ends.length - 1] / 3)).toBeNull();
    expect(ownerAt(owned, -1)).toBeNull();
  });
});

describe('a building found by its id', () => {
  it('is the search entry when it has an address', () => {
    const listed = model.searchable[0];
    expect(buildingEntry(model, listed.buildingId)).toBe(listed);
  });

  it('is summarised under a plain label when it has none', () => {
    const unaddressed = model.buildings.find((b) => b.streetAddress === null)!;
    const entry = buildingEntry(model, unaddressed.parentId)!;
    expect(entry.streetAddress).toBe(UNADDRESSED);
    const parts = model.buildings.filter((b) => b.parentId === unaddressed.parentId);
    const top = Math.max(...parts.map((p) => p.topAhdM));
    const base = Math.min(...parts.map((p) => p.baseAhdM));
    expect(entry.topAhdM).toBe(top);
    expect(entry.heightM).toBeCloseTo(top - base, 6);
    expect(entry.anchorEN.every(Number.isFinite)).toBe(true);
  });

  it('is null for an id no part has', () => {
    expect(buildingEntry(model, 'no-such-building')).toBeNull();
  });
});

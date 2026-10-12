import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildCityModel } from './adapter';
import { searchCity, shortAddress } from './search';
import { placeLandmarks } from './landmarks';
import type {
  ApiBuildingPart,
  ApiDevelopmentPart,
  ApiFeatureCollection,
  ApiLandmark,
} from './api-types';

/*
 * Search runs against the real snapshot, not a fixture, because the things
 * that break a search are all properties of real addresses: the postcode on
 * every one of them, building names in front of the street, and ranges like
 * "319-323" that nobody types in full.
 */

const load = <T,>(name: string): T =>
  JSON.parse(readFileSync(resolve(__dirname, '../../public/data', name), 'utf-8'));

const { model, report } = buildCityModel(
  load<ApiFeatureCollection<ApiBuildingPart>>('building-footprints.json'),
  load<ApiFeatureCollection<ApiDevelopmentPart>>('development-footprints.json'),
  'snapshot',
);

describe('the searchable index', () => {
  it('holds one entry per building, not one per roof plane', () => {
    // 4,443 rows collapse to 1,548 buildings; those with an address are the
    // searchable ones. Searching the rows directly would return the same
    // tower several times over.
    const ids = model.searchable.map((b) => b.buildingId);
    expect(new Set(ids).size).toBe(ids.length);
    expect(model.searchable.length).toBe(report.searchableBuildings);
    expect(model.searchable.length).toBeLessThan(1548);
  });

  it('reports how many buildings cannot be found at all', () => {
    // The property register could not be matched to 220 outlines. That is a
    // fact about the data, and the interface has to be able to say it.
    expect(report.unaddressedBuildings).toBeGreaterThan(0);
    expect(report.searchableBuildings + report.unaddressedBuildings).toBe(1548);
    expect(report.searchableBuildings / 1548).toBeGreaterThan(0.8);
  });

  it('lists the tall ones first', () => {
    for (let i = 1; i < model.searchable.length; i++) {
      expect(model.searchable[i - 1].heightM).toBeGreaterThanOrEqual(
        model.searchable[i].heightM,
      );
    }
  });
});

describe('what a person types', () => {
  it('finds a street by name', () => {
    const hits = searchCity(model, 'swanston');
    expect(hits.length).toBeGreaterThan(0);
    for (const hit of hits) expect(hit.label.toLowerCase()).toContain('swanston');
  });

  it('finds a specific address by its first number', () => {
    // The register writes ranges — "319-323 Swanston Street" — and nobody
    // types the range.
    const hits = searchCity(model, '319 swanston');
    expect(hits[0].label).toContain('319');
    expect(hits[0].label.toLowerCase()).toContain('swanston');
  });

  it('does not return the whole city for a postcode', () => {
    // 3000 is on every address in the set. Matching it would be technically
    // correct and completely useless.
    expect(searchCity(model, '3000')).toHaveLength(0);
    expect(searchCity(model, 'melbourne')).toHaveLength(0);
  });

  it('ignores one stray character', () => {
    expect(searchCity(model, 'q')).toHaveLength(0);
  });

  it('puts an approved project above an existing building at the same address', () => {
    // Somebody searching an address that has a proposal on it means the
    // proposal.
    const hits = searchCity(model, '640-652 bourke');
    expect(hits[0].kind).toBe('development');
  });

  it('returns a short enough list to read', () => {
    expect(searchCity(model, 'street').length).toBeLessThanOrEqual(8);
  });

  it('gives every hit a place to fly to', () => {
    for (const hit of searchCity(model, 'bourke')) {
      const [east, north] =
        hit.kind === 'building'
          ? hit.building.anchorEN
          : hit.kind === 'landmark'
            ? hit.landmark.en
            : hit.development.anchorEN;
      expect(Number.isFinite(east)).toBe(true);
      expect(Number.isFinite(north)).toBe(true);
      expect(Math.abs(east)).toBeLessThan(2500);
      expect(Math.abs(north)).toBeLessThan(2500);
    }
  });
});

describe('the landmarks, by name', () => {
  const landmarks = placeLandmarks(load<ApiLandmark[]>('landmarks.json'), model);

  it('finds a place by its name, ahead of the addresses on its street', () => {
    const hits = searchCity(model, 'town hall', landmarks);
    expect(hits[0].kind).toBe('landmark');
    expect(hits[0].label).toBe('Melbourne Town Hall');
    expect(hits[0].detail).toBe('Landmark · 90-130 Swanston Street');
  });

  it('matches inside a name, the way "319 swanston" matches an address', () => {
    const labels = searchCity(model, 'cathedral', landmarks).map((hit) => hit.label);
    expect(labels).toContain('St Pauls Cathedral');
  });

  it('does not match a landmark by its address', () => {
    // Every landmark is on Collins or Swanston Street like everything else;
    // matching addresses would put the Town Hall in every search for its street.
    const hits = searchCity(model, 'swanston', landmarks);
    expect(hits.some((hit) => hit.kind === 'landmark')).toBe(false);
  });

  it('is unchanged when no landmarks are given', () => {
    expect(searchCity(model, 'town hall')).toEqual(searchCity(model, 'town hall', []));
  });
});

describe('the label shown to a person', () => {
  it('drops the parts every address shares', () => {
    expect(shortAddress('319-323 Swanston Street MELBOURNE VIC 3000')).toBe(
      '319-323 Swanston Street',
    );
  });

  it('keeps a building name, because that is how people know it', () => {
    expect(
      shortAddress('City Point On Bourke Apartments 654-670 Bourke Street MELBOURNE VIC 3000'),
    ).toBe('City Point On Bourke Apartments 654-670 Bourke Street');
  });

  it('never leaves a trailing comma or space', () => {
    for (const building of model.searchable.slice(0, 200)) {
      const label = shortAddress(building.streetAddress);
      expect(label).toBe(label.trim());
      expect(label.endsWith(',')).toBe(false);
      expect(label.length).toBeGreaterThan(0);
    }
  });
});

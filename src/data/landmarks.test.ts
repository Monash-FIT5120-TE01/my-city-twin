import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildCityModel } from './adapter';
import { placeLandmarks } from './landmarks';
import { projectLonLat, unprojectMetric } from './project';
import { LOCAL_ORIGIN_WGS84 } from '../scene/frame';
import type {
  ApiBuildingPart,
  ApiDevelopmentPart,
  ApiFeatureCollection,
  ApiLandmark,
} from './api-types';

/*
 * Against the real snapshot, like the search. What can go wrong here is a
 * property of the real data — a point that lands a metre outside its own
 * building, a name spelt two ways — and a fixture would only test the
 * fixture.
 */

const load = <T,>(name: string): T =>
  JSON.parse(readFileSync(resolve(__dirname, '../../public/data', name), 'utf-8'));

const { model } = buildCityModel(
  load<ApiFeatureCollection<ApiBuildingPart>>('building-footprints.json'),
  load<ApiFeatureCollection<ApiDevelopmentPart>>('development-footprints.json'),
  'snapshot',
);
const rows = load<ApiLandmark[]>('landmarks.json');
const landmarks = placeLandmarks(rows, model);
const byName = new Map(landmarks.map((l) => [l.name, l]));

describe('the landmark list', () => {
  it('keeps every row, once, under its own spelling', () => {
    expect(landmarks.length).toBe(51);
    expect(new Set(landmarks.map((l) => l.name)).size).toBe(51);
    // The source's spelling, not a corrected one.
    expect(byName.has('Athanaeum Theatre')).toBe(true);
  });

  it('parses the coordinates that arrive as strings', () => {
    for (const landmark of landmarks) {
      expect(Number.isFinite(landmark.en[0])).toBe(true);
      expect(Number.isFinite(landmark.en[1])).toBe(true);
    }
    // The Town Hall is on Swanston Street, a few hundred metres south-east
    // of the scene origin: east and south of it, within a kilometre.
    const townHall = byName.get('Melbourne Town Hall')!;
    expect(townHall.en[0]).toBeGreaterThan(0);
    expect(townHall.en[0]).toBeLessThan(1000);
    expect(townHall.en[1]).toBeLessThan(0);
    expect(townHall.en[1]).toBeGreaterThan(-1000);
  });

  it('keeps the one landmark outside the model, unplaced, rather than dropping it', () => {
    const outside = landmarks.filter((l) => !l.inModel);
    expect(outside.map((l) => l.name)).toEqual(['Victoria Police']);
    expect(outside[0].buildingId).toBeNull();
    expect(outside[0].topAhdM).toBeNull();
  });
});

describe('tying a landmark to its building', () => {
  it('finds the building under a point that is clearly inside one', () => {
    for (const name of ['Melbourne Town Hall', 'St Pauls Cathedral', 'Flinders Street Railway Station']) {
      const landmark = byName.get(name)!;
      expect(landmark.buildingId, name).not.toBeNull();
      expect(landmark.topAhdM, name).not.toBeNull();
    }
  });

  it('names the building the register knows at that address', () => {
    const townHall = byName.get('Melbourne Town Hall')!;
    const building = model.searchable.find((b) => b.buildingId === townHall.buildingId);
    expect(building?.streetAddress.toLowerCase()).toContain('swanston');
  });

  it('stands the tag on the top of the whole building', () => {
    for (const landmark of landmarks) {
      if (!landmark.buildingId) continue;
      const parts = model.buildings.filter((p) => p.parentId === landmark.buildingId);
      expect(landmark.topAhdM).toBe(Math.max(...parts.map((p) => p.topAhdM)));
    }
  });

  it('forgives a point that lands a couple of metres outside its own wall', () => {
    // Two churches whose rounded points fall just beyond the footprint.
    const baptist = byName.get('Collins Street Baptist Church')!;
    const address = model.searchable.find((b) => b.buildingId === baptist.buildingId)?.streetAddress;
    expect(address?.toLowerCase()).toContain('collins');
    expect(byName.get('St Francis Church')!.buildingId).not.toBeNull();
  });

  it('leaves open ground open', () => {
    // Parks and squares have no building for a point to fall into, and a
    // booth in the mall ten metres from a shop is not that shop. The State
    // Library's point is on its lawn, 22 m out: a tag on the lawn, honestly.
    for (const name of [
      'Batman Park',
      'Enterprize Park',
      'Federation Square',
      'Melbourne Visitor Booth',
      'State Library Victoria',
    ]) {
      expect(byName.get(name)!.buildingId, name).toBeNull();
    }
  });

  it('reaches a point standing in a courtyard, whose nearest wall is the inner one', () => {
    // One building, 100 m square, with a 40 m square courtyard in the middle.
    // A point 2 m inside the courtyard is outside the solid part and more
    // than 6 m from the outer wall; only the courtyard's wall is near it.
    const outer: [number, number][] = [[0, 0], [100, 0], [100, 100], [0, 100]];
    const hole: [number, number][] = [[30, 30], [70, 30], [70, 70], [30, 70]];
    const part = {
      ...model.buildings[0],
      id: 'court-1',
      parentId: 'court',
      footprint: [[outer, hole]],
      topAhdM: 50,
      sinksToGround: true,
    };
    const extent = { minE: -1000, minN: -1000, maxE: 1000, maxN: 1000 };
    // Back from scene metres to degrees, so the row looks like the API's.
    const [ox, oy] = projectLonLat(LOCAL_ORIGIN_WGS84.lon, LOCAL_ORIGIN_WGS84.lat);
    const [lon, lat] = unprojectMetric(ox + 32, oy + 50);
    const [placed] = placeLandmarks(
      [{ landmark_name: 'Courtyard', longitude: String(lon), latitude: String(lat), address: 'x' }],
      { buildings: [part], extent },
    );
    expect(placed.buildingId).toBe('court');
    expect(placed.topAhdM).toBe(50);
  });

  it('ties most of the list to a building', () => {
    // 39 inside a footprint, 3 within reach of a wall (the two churches, and
    // the Melbourne Central station under Melbourne Central). The number is
    // exact against the snapshot so that a change in the data is noticed.
    const tied = landmarks.filter((l) => l.buildingId).length;
    expect(tied).toBe(42);
  });
});

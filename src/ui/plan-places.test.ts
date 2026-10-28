import { describe, expect, it } from 'vitest';
import { gridStreets } from '../scene/streets';
import { alongCrossOf, alongLongOf, PLACED_NAMES, planPlaceFor, type EN } from './planPlaces';

const plan = (name: string, topic = 'Streets & public space') => ({ id: 0, name, topic });
const offset = (name: string) => gridStreets().find((street) => street.name === name)!.offsetM;

describe('planPlaceFor', () => {
  it('puts every placed plan on the map, with its pin inside the ground the scene draws', () => {
    for (const name of PLACED_NAMES) {
      const place = planPlaceFor(plan(name));
      expect(place.onMap, name).toBe(true);
      if (!place.onMap) continue;
      // The ground plane reaches about 2.5 km (basemap.ts groundPlacement), but its map fades out past about 2 km.
      expect(Math.hypot(...place.pin), name).toBeLessThan(2050);
    }
  });

  it('keeps the lanes between their streets and Elizabeth Street on the grid', () => {
    const lane = planPlaceFor(plan('Flinders Lane streetscape upgrade'));
    if (!lane.onMap || lane.shapes[0].kind !== 'line') throw new Error('Flinders Lane not on the map');
    // Between Collins Street and Flinders Street, which is where Flinders Lane runs.
    for (const point of lane.shapes.flatMap((shape) => shape.points)) {
      expect(alongCrossOf(point)).toBeGreaterThan(offset('Collins Street'));
      expect(alongCrossOf(point)).toBeLessThan(offset('Flinders Street'));
    }
    const elizabeth = planPlaceFor(plan('Elizabeth Street Strategic Opportunities Plan'));
    if (!elizabeth.onMap) throw new Error('Elizabeth Street not on the map');
    for (const point of elizabeth.shapes[0].points as EN[]) {
      expect(alongLongOf(point)).toBeCloseTo(offset('Elizabeth Street'), 1);
    }
    expect(lane.basis).toBe('traced');
    expect(elizabeth.basis).toBe('grid');
  });

  it('puts Franklin Street in its gap north of La Trobe Street, traced rather than set by hand', () => {
    const franklin = planPlaceFor(plan('Franklin Street transformation'));
    if (!franklin.onMap || franklin.shapes[0].kind !== 'line') throw new Error('Franklin Street not on the map');
    for (const point of franklin.shapes[0].points) {
      expect(alongCrossOf(point)).toBeLessThan(offset('La Trobe Street') - 200);
      expect(alongCrossOf(point)).toBeGreaterThan(offset('La Trobe Street') - 300);
    }
    expect(franklin.basis).toBe('traced');
  });

  it('draws a band only where the model bears the place out: a place set by hand gets the pin alone', () => {
    for (const name of PLACED_NAMES) {
      const place = planPlaceFor(plan(name));
      if (place.onMap && place.basis === 'approx') expect(place.shapes, name).toEqual([]);
    }
  });

  it('keeps programmes, the suburbs and unknown plans off the map, saying why', () => {
    expect(planPlaceFor(plan('Parking & kerbside management', 'Street management programmes'))).toEqual({ onMap: false, why: 'citywide' });
    expect(planPlaceFor(plan('Sunshine Superhub', 'Transport connections'))).toEqual({ onMap: false, why: 'wider' });
    expect(planPlaceFor(plan('Melbourne Airport Rail', 'Transport connections'))).toEqual({ onMap: false, why: 'wider' });
    expect(planPlaceFor(plan('Edmund Herring Oval precinct upgrade', 'Parks & recreation'))).toEqual({ onMap: false, why: 'wider' });
    expect(planPlaceFor(plan('Laak Boorndap urban garden'))).toEqual({ onMap: false, why: 'unknown' });
    expect(planPlaceFor(plan('A plan nobody has placed'))).toEqual({ onMap: false, why: 'unknown' });
  });
});

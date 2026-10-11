import { describe, expect, it } from 'vitest';
import { GRID_DIRECTIONS } from './streets';
import { gridCrossings, roughMetres, wayfind, wayfindingWords } from './vrWayfinding';

/** A point on the grid: so far along the long-street axis and the cross-street axis. */
const at = (alongLong: number, alongCross: number): [number, number] => [
  GRID_DIRECTIONS.long[0] * alongLong + GRID_DIRECTIONS.cross[0] * alongCross,
  GRID_DIRECTIONS.long[1] * alongLong + GRID_DIRECTIONS.cross[1] * alongCross,
];
const SOUTH = Math.PI;
const EAST = Math.PI / 2;

describe('where the reader is walking', () => {
  // Swanston Street runs on the cross axis at 460.5; Collins and Flinders cross it at 286.1 and 519.9.
  const swanstonBetweenCollinsAndFlinders = at(460.5, 400);

  it('names the street they are on and the way they face', () => {
    const w = wayfind(swanstonBetweenCollinsAndFlinders, SOUTH, []);
    expect(w.street).toBe('Swanston Street');
    expect(w.onStreet).toBe(true);
    expect(w.heading).toBe('south');
  });

  it('gives the next street they will cross, ahead of them and not behind', () => {
    expect(wayfind(swanstonBetweenCollinsAndFlinders, SOUTH, []).next).toEqual({ name: 'Flinders Street', distanceM: 130 });
    expect(wayfind(swanstonBetweenCollinsAndFlinders, 0, []).next?.name).toBe('Collins Street');
  });

  it('at a crossing, takes the street their head follows', () => {
    const corner = at(460.5, 286.1);
    expect(wayfind(corner, SOUTH, []).street).toBe('Swanston Street');
    expect(wayfind(corner, EAST + (20 * Math.PI) / 180, []).street).toBe('Collins Street');
  });

  it('says "near" just off a street, and gives only the heading off the grid', () => {
    const w = wayfind(at(460.5 + 35, 400), SOUTH, []);
    expect(wayfindingWords(w).main).toBe('Near Swanston Street, heading south');
    expect(wayfindingWords(wayfind(at(5000, 5000), SOUTH, [])).main).toBe('Heading south');
  });

  it('names a landmark only when it is straight ahead', () => {
    const station = { name: 'Station', en: at(460.5, 700) };
    expect(wayfind(swanstonBetweenCollinsAndFlinders, SOUTH - (20 * Math.PI) / 180, [station]).ahead?.name).toBe('Station');
    expect(wayfind(swanstonBetweenCollinsAndFlinders, 0, [station]).ahead).toBeNull();
  });

  it('rounds distances as a person would say them', () => {
    expect(roughMetres(3)).toBe(10);
    expect(roughMetres(127)).toBe(130);
    expect(roughMetres(1240)).toBe(1200);
  });
});

describe('the corners that get a street sign', () => {
  it('include Swanston and Collins, and only crossings both streets run through', () => {
    const crossings = gridCrossings();
    expect(crossings.some((c) => c.long === 'Collins Street' && c.cross === 'Swanston Street')).toBe(true);
    expect(crossings.length).toBeGreaterThan(20);
  });
});

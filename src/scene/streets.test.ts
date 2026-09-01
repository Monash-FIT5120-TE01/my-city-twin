import { describe, expect, it } from 'vitest';
import {
  CROSS_BEARING_DEG,
  LONG_BEARING_DEG,
  streetLabelsNear,
} from './streets';

/*
 * The street grid was fitted from development addresses rather than typed in,
 * so these tests check the fit still describes the Hoddle Grid: two
 * perpendicular families, regular block spacing, and each name on its own
 * line however the view moves.
 */

const labels = streetLabelsNear(0, 0);
const byName = (name: string) => labels.find((l) => l.name === name)!;

describe('the Hoddle Grid', () => {
  it('has twelve named streets', () => {
    expect(labels).toHaveLength(12);
  });

  it('has two perpendicular families', () => {
    expect(CROSS_BEARING_DEG - LONG_BEARING_DEG).toBe(90);
  });

  it('runs Bourke Street close to the scene origin', () => {
    // The origin was placed on Bourke Street. The line sits about 50 m off it
    // because it follows the carriageway, not the frontages the addresses sit
    // on — but it is still the nearest long street to the origin.
    const bourke = byName('Bourke Street');
    const distance = Math.hypot(bourke.east, bourke.north);
    expect(distance).toBeLessThan(80);

    for (const other of labels.filter((l) => l.axis === 'long' && l.name !== 'Bourke Street')) {
      expect(Math.hypot(other.east, other.north)).toBeGreaterThan(distance);
    }
  });

  it('keeps every name off the rooftops', () => {
    // Placing a label on the address fit rather than the carriageway is what
    // put "Queen Street" on a building. Anything above a fifth of its length
    // inside a footprint means the search found no real gap.
    for (const label of labels) {
      expect(label.buildingCoverage).toBeLessThan(0.2);
    }
  });

  it('spaces the long streets about a block apart', () => {
    const order = [
      'La Trobe Street',
      'Lonsdale Street',
      'Bourke Street',
      'Collins Street',
      'Flinders Street',
    ].map(byName);

    for (let i = 1; i < order.length; i++) {
      const gap = Math.hypot(
        order[i].east - order[i - 1].east,
        order[i].north - order[i - 1].north,
      );
      expect(gap).toBeGreaterThan(150);
      expect(gap).toBeLessThan(300);
    }
  });

  it('orders the cross streets west to east', () => {
    const order = [
      'Spencer Street',
      'King Street',
      'William Street',
      'Queen Street',
      'Elizabeth Street',
      'Swanston Street',
      'Russell Street',
    ].map(byName);

    for (let i = 1; i < order.length; i++) {
      expect(order[i].east).toBeGreaterThan(order[i - 1].east);
    }
  });

  it('runs each name along its own street', () => {
    const long = byName('Bourke Street').rotation;
    const cross = byName('Queen Street').rotation;
    const between = Math.abs(long - cross) * (180 / Math.PI);
    expect(between).toBeCloseTo(90, 4);
  });

  it('marks the two offsets that were interpolated rather than measured', () => {
    const inferred = labels.filter((l) => l.inferred).map((l) => l.name);
    expect(inferred).toEqual(['Spencer Street', 'Russell Street']);
  });
});

describe('labels follow the view', () => {
  it('slides each name along its street without leaving it', () => {
    const here = streetLabelsNear(0, 0);
    const away = streetLabelsNear(-532, -198);

    for (const name of here.map((l) => l.name)) {
      const a = here.find((l) => l.name === name)!;
      const b = away.find((l) => l.name === name)!;
      // It moved...
      expect(Math.hypot(b.east - a.east, b.north - a.north)).toBeGreaterThan(1);
      // ...but only along the street, so the perpendicular offset is fixed.
      const runE = Math.cos(a.rotation);
      const runN = Math.sin(a.rotation);
      const perpendicular = (b.east - a.east) * -runN + (b.north - a.north) * runE;
      expect(Math.abs(perpendicular)).toBeLessThan(0.001);
    }
  });
});

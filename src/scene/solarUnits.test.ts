import { describe, expect, it } from 'vitest';
import { co2TonnesFor, homesFor } from './solarUnits';

describe('everyday units', () => {
  it('counts homes at 4,000 kWh a year and CO2 at 0.74 kg a kWh', () => {
    expect(homesFor(166_000)).toBeCloseTo(41.5, 6);
    expect(co2TonnesFor(166_000)).toBeCloseTo(122.84, 6);
    expect(homesFor(0)).toBe(0);
  });
});

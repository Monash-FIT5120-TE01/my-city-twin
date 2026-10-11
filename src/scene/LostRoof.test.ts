import { describe, expect, it } from 'vitest';
import { lostPieces } from './useSolarComparison';
import type { SolarCheck } from './useSolarCheck';

const piece = (block: number) => ({ corners: [[0, 0], [1, 0], [1, 1], [0, 1]] as [number, number][], topAhdM: 30, block });
const check = (energies: number[]) => ({
  pieces: energies.map((_, b) => piece(b)),
  blockSun: energies.map((energy) => ({ energy, shaded: 0 })),
}) as unknown as SolarCheck;

describe('roof lost to the developments', () => {
  it('is the roof that keeps enough light today and not with them built', () => {
    const now = check([0.95, 0.95, 0.5, 0.9]), planned = check([0.95, 0.6, 0.4, 0.88]);
    expect(lostPieces(now, planned).map((p) => p.block)).toEqual([1]);
  });

  it('is nothing until both are measured', () => {
    const now = check([0.95]);
    expect(lostPieces(now, { ...now, blockSun: null })).toEqual([]);
  });
});

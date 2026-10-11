/*
 * The solar panel check drawn on the roof: each piece a panel could go on,
 * shaded by how much of an unshaded panel's year of light it keeps (levelOf,
 * useSolarCheck.ts), in four steps of one green from light to dark slate.
 * The steps differ in lightness by 16 L* each (about 70, 54, 38, 22), so they
 * read in order without telling hues apart, and all are darker than the
 * buildings (#ffeedd, L* about 95). Pieces not yet measured are a pale grey.
 */
import { useEffect, useMemo } from 'react';
import { BufferGeometry, DoubleSide, Float32BufferAttribute } from 'three';
import type { SolarCheck } from './useSolarCheck';

/** By level, 0 (not yet measured) to 4 (the most light). */
export const SOLAR_LEVELS = ['#c4c9c5', '#2e3440', '#126733', '#1a9447', '#22c55e'] as const;
/** Drawn this far above the roof, so it does not flicker with it. */
const LIFT_M = 0.15;

function sheet(pieces: SolarCheck['pieces'], levels: number[], want: number): BufferGeometry | null {
  const pos: number[] = [];
  pieces.forEach((p, i) => {
    if (levels[i] !== want) return;
    const z = p.topAhdM + LIFT_M, [a, b, c, d] = p.corners;
    pos.push(a[0], a[1], z, b[0], b[1], z, c[0], c[1], z, a[0], a[1], z, c[0], c[1], z, d[0], d[1], z);
  });
  if (!pos.length) return null;
  const g = new BufferGeometry();
  g.setAttribute('position', new Float32BufferAttribute(pos, 3));
  return g;
}

export function SolarRoof({ check }: { check: SolarCheck }) {
  // rebuilt when the pieces or their levels change, not on every step of the progress
  const { pieces, levels } = check;
  const sheets = useMemo(() => SOLAR_LEVELS.map((_, level) => sheet(pieces, levels, level)), [pieces, levels]);
  useEffect(() => () => sheets.forEach((g) => g?.dispose()), [sheets]);
  return (
    <>
      {sheets.map((g, level) => g && (
        <mesh key={level} geometry={g} renderOrder={2}>
          <meshBasicMaterial color={SOLAR_LEVELS[level]} side={DoubleSide} polygonOffset polygonOffsetFactor={-2} polygonOffsetUnits={-2} />
        </mesh>
      ))}
    </>
  );
}

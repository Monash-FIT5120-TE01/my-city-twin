/*
 * The solar panel check drawn on the roof: each piece a panel could go on,
 * shaded by how much of an unshaded panel's year of light it keeps (levelOf,
 * useSolarCheck.ts), in four steps from golden yellow to dark grey: the more
 * light, the brighter (decided 2026-10-20). By lightness, about L* 88,
 * 72, 47 and 27, so they read in order without telling hues apart. All four
 * opaque alike. Pieces not yet measured are a pale grey.
 */
import { useEffect, useMemo } from 'react';
import { BufferGeometry, DoubleSide, Float32BufferAttribute } from 'three';
import type { SolarCheck } from './useSolarCheck';

/** By level, 0 (not yet measured) to 4 (the most light). */
export const SOLAR_LEVELS = [
  '#c4c9c5', // not yet measured
  '#3A3F4B', // under 60%: dark grey
  '#9B641F', // 60% to under 80%: dark golden brown
  '#E9A12D', // 80% to under 90%: amber
  '#FFD85C', // 90% and over: golden yellow
] as const;
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
          {/* not tone-mapped: the roof shows the legend's own colours, not the scene's lighter version of them */}
          <meshBasicMaterial color={SOLAR_LEVELS[level]} toneMapped={false} side={DoubleSide} polygonOffset polygonOffsetFactor={-2} polygonOffsetUnits={-2} />
        </mesh>
      ))}
    </>
  );
}

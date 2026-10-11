/*
 * ROOF CHECK (development only: add ?roofs to the address)
 *
 * Paints, in red, the roof a solar panel could go on (roofParts.ts): existing
 * buildings and the planned developments on show, plant rooms left out, and
 * no strip too narrow for a panel or piece too small to bother with. The
 * totals are logged to the console and kept on window.__roofs.
 */
import { useEffect, useMemo } from 'react';
import { BufferGeometry, DoubleSide, Float32BufferAttribute } from 'three';
import type { Massing } from '../data/model';
import { usableRoofs, type RoofResult } from './roofParts';

/** Red, L* about 48: far darker than the buildings (#ffeedd, L* about 95). */
const ROOF = '#e0201c';
/** Drawn this far above the roof, so it does not flicker with it. */
const LIFT_M = 0.15;

/** The red sheets, and the totals for the console. */
function build(buildings: Massing[], developments: Massing[]) {
  const t0 = performance.now();
  const roofs = new Map<string, RoofResult>([...usableRoofs(buildings), ...usableRoofs(developments)]);
  const pos: number[] = [];
  for (const r of roofs.values()) for (const p of r.pieces) {
    const z = p.topAhdM + LIFT_M, [a, b, c, d] = p.corners;
    pos.push(a[0], a[1], z, b[0], b[1], z, c[0], c[1], z, a[0], a[1], z, c[0], c[1], z, d[0], d[1], z);
  }
  const sum = (ms: Massing[]) => [...new Set(ms.map((m) => m.parentId))].reduce((t, id) => t + (roofs.get(id)?.areaM2 ?? 0), 0);
  const summary = { buildingsM2: Math.round(sum(buildings)), developmentsM2: Math.round(sum(developments)), ms: 0, terraceM2: 0 };
  const byId = Object.fromEntries([...roofs].map(([id, r]) => [id, Math.round(r.areaM2)]));
  // for choosing the smallest piece worth keeping: every piece, small ones included
  const all = [...usableRoofs(buildings, { minPieceM2: 0 }).values()].flatMap((r) => r.components);
  const terraceM2 = Math.round([...roofs.values()].reduce((t, r) => t + r.terraceM2, 0));
  let geometry: BufferGeometry | null = null;
  if (pos.length) { geometry = new BufferGeometry(); geometry.setAttribute('position', new Float32BufferAttribute(pos, 3)); }
  summary.terraceM2 = terraceM2; summary.ms = Math.round(performance.now() - t0);
  return { geometry, summary, byId, all };
}

export function RoofCheck({ buildings, developments }: { buildings: Massing[]; developments: Massing[] }) {
  const { geometry, summary, byId, all } = useMemo(() => build(buildings, developments), [buildings, developments]);
  useEffect(() => {
    console.info('[roofs] usable roof', summary);
    (window as unknown as { __roofs?: unknown }).__roofs = { ...summary, byId, all };
  }, [summary, byId, all]);
  useEffect(() => () => geometry?.dispose(), [geometry]);
  if (!geometry) return null;
  return (
    <mesh geometry={geometry} renderOrder={1}>
      <meshBasicMaterial color={ROOF} side={DoubleSide} polygonOffset polygonOffsetFactor={-2} polygonOffsetUnits={-2} />
    </mesh>
  );
}

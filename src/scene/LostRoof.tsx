/*
 * The roof that keeps enough light for panels today and would not once the
 * approved developments are built (lostPieces, useSolarComparison.ts): hatched, so it reads without colour
 * (white #ffffff and dark slate #2e3440 stripes, L* 100 and 22), laid on the
 * roof under any panels.
 */
import { useEffect, useMemo } from 'react';
import { BufferGeometry, CanvasTexture, DoubleSide, Float32BufferAttribute, RepeatWrapping, SRGBColorSpace } from 'three';
import type { SolarCheck } from './useSolarCheck';

/** Drawn above the light levels (SolarRoof, 0.15 m); the panels never stand on lost roof. */
const LIFT_M = 0.17;
/** One stripe pair every this many metres. */
const STRIPE_M = 0.6;

function stripes(): CanvasTexture {
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const g = c.getContext('2d')!;
  g.fillStyle = '#2e3440'; g.fillRect(0, 0, 64, 64);
  g.strokeStyle = '#ffffff'; g.lineWidth = 14;
  for (const k of [-64, 0, 64]) { g.beginPath(); g.moveTo(k, 64); g.lineTo(k + 64, 0); g.stroke(); }
  const t = new CanvasTexture(c);
  t.wrapS = t.wrapT = RepeatWrapping; t.colorSpace = SRGBColorSpace;
  return t;
}

export function LostRoof({ pieces }: { pieces: SolarCheck['pieces'] }) {
  const geometry = useMemo(() => {
    if (!pieces.length) return null;
    const pos: number[] = [], uv: number[] = [];
    for (const p of pieces) {
      const z = p.topAhdM + LIFT_M, [a, b, c, d] = p.corners;
      for (const q of [a, b, c, a, c, d]) { pos.push(q[0], q[1], z); uv.push(q[0] / STRIPE_M, q[1] / STRIPE_M); }
    }
    const g = new BufferGeometry();
    g.setAttribute('position', new Float32BufferAttribute(pos, 3));
    g.setAttribute('uv', new Float32BufferAttribute(uv, 2));
    return g;
  }, [pieces]);
  const map = useMemo(() => stripes(), []);
  useEffect(() => () => geometry?.dispose(), [geometry]);
  useEffect(() => () => map.dispose(), [map]);
  if (!geometry) return null;
  return (
    <mesh geometry={geometry} renderOrder={3}>
      <meshBasicMaterial map={map} side={DoubleSide} polygonOffset polygonOffsetFactor={-3} polygonOffsetUnits={-3} />
    </mesh>
  );
}

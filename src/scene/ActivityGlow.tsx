/*
 * ─────────────────────────────────────────────────────────────────────────
 * STREET ACTIVITY ON THE 3D CITY
 * ─────────────────────────────────────────────────────────────────────────
 *
 * The Street activity screen's 3D view (the 2D one is ui/ActivityMap.tsx): the same soft glow at each
 * counter, its colour and its reach by this hour's count on the same ramp (activityPalette.ts), painted
 * on one canvas and laid on the ground — draped over the terrain (terrain.ts), not a flat sheet, since
 * the ground rises and falls across the grid. The chosen counter carries the same thin dark ring.
 *
 * Unlit, and drawn over the buildings rather than behind them (as ver-4 has it): seen at an angle the
 * streets are mostly hidden behind the towers, and a glow that only showed between them was lost. The
 * colours are the palette's own rather than the sun's. A tap on it chooses the counter whose glow is on top there, as on
 * the 2D map (glowAt).
 */
import { useEffect, useMemo } from 'react';
import { BufferAttribute, CanvasTexture, PlaneGeometry, SRGBColorSpace } from 'three';
import type { ThreeEvent } from '@react-three/fiber';
import { glowOpacity, glowRadiusAt, rampRgb } from './activityPalette';
import { glowAt, type Glow } from '../ui/activityMapView';
import { groundAt, type Ground } from './terrain';

/** Metres per canvas pixel: the glows are soft, so finer would only cost memory. */
const M_PER_PX = 1.5;
/** Room round the outermost glows, metres. */
const MARGIN_M = 90;
/** The ground mesh's step, metres: as fine as the terrain is gathered (terrain.ts). */
const STEP_M = 10;
/** A little above the ground (it is drawn over everything, so this only keeps it off the terrain). */
const LIFT_M = 1;
/** The 3D view's glows are never smaller than this, metres: from over the city a 28 m glow is a speck. */
const MIN_RADIUS_M = 45;
/** The ring round the chosen counter, as on the 2D map. */
const RING = '#16302a';

const radiusOf = (t: number) => Math.max(glowRadiusAt(t), MIN_RADIUS_M);

export function ActivityGlow({
  glows,
  sensorsEN,
  ground,
  selectedId,
  onPick,
}: {
  glows: readonly Glow[];
  /** Every counter, with a count this hour or not: where the sheet lies, so it does not move with the hour. */
  sensorsEN: readonly [number, number][];
  ground: Ground;
  selectedId: number | null;
  onPick?: (id: number) => void;
}) {
  // where the sheet lies: round every counter
  const box = useMemo(() => {
    if (sensorsEN.length === 0) return null;
    let minE = Infinity, minN = Infinity, maxE = -Infinity, maxN = -Infinity;
    for (const [e, n] of sensorsEN) {
      minE = Math.min(minE, e);
      maxE = Math.max(maxE, e);
      minN = Math.min(minN, n);
      maxN = Math.max(maxN, n);
    }
    // the widest glow, and a margin
    const pad = MARGIN_M + radiusOf(1);
    return { minE: minE - pad, minN: minN - pad, maxE: maxE + pad, maxN: maxN + pad };
  }, [sensorsEN]);

  // the ground under it, in steps, each vertex at the terrain's height
  const geometry = useMemo(() => {
    if (!box) return null;
    const w = box.maxE - box.minE, h = box.maxN - box.minN;
    const plane = new PlaneGeometry(w, h, Math.max(1, Math.ceil(w / STEP_M)), Math.max(1, Math.ceil(h / STEP_M)));
    const pos = plane.getAttribute('position') as BufferAttribute;
    const cx = (box.minE + box.maxE) / 2, cy = (box.minN + box.maxN) / 2;
    for (let i = 0; i < pos.count; i++) {
      const e = pos.getX(i) + cx, n = pos.getY(i) + cy;
      pos.setXYZ(i, e, n, groundAt(ground, e, n) + LIFT_M);
    }
    pos.needsUpdate = true;
    plane.computeBoundingSphere();
    return plane;
  }, [box, ground]);
  useEffect(() => () => geometry?.dispose(), [geometry]);

  // the glows, painted
  const texture = useMemo(() => {
    if (!box) return null;
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil((box.maxE - box.minE) / M_PER_PX);
    canvas.height = Math.ceil((box.maxN - box.minN) / M_PER_PX);
    const tex = new CanvasTexture(canvas);
    tex.colorSpace = SRGBColorSpace;
    return tex;
  }, [box]);
  useEffect(() => () => texture?.dispose(), [texture]);

  useEffect(() => {
    if (!box || !texture) return;
    const canvas = texture.image as HTMLCanvasElement;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const px = (e: number, n: number): [number, number] => [(e - box.minE) / M_PER_PX, (box.maxN - n) / M_PER_PX];
    // the quieter first, so the busier lie on top (as on the 2D map)
    for (const g of [...glows].sort((a, b) => a.t - b.t)) {
      const alpha = glowOpacity(g.t);
      if (alpha <= 0) continue;
      const [x, y] = px(g.en[0], g.en[1]);
      const r = radiusOf(g.t) / M_PER_PX;
      const rgb = rampRgb(g.t).join(',');
      const gradient = ctx.createRadialGradient(x, y, 0, x, y, r);
      gradient.addColorStop(0, `rgba(${rgb},${0.95 * alpha})`);
      gradient.addColorStop(0.5, `rgba(${rgb},${0.8 * alpha})`);
      gradient.addColorStop(1, `rgba(${rgb},0)`);
      ctx.fillStyle = gradient;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    const chosen = glows.find((g) => g.id === selectedId);
    if (chosen) {
      const [x, y] = px(chosen.en[0], chosen.en[1]);
      ctx.strokeStyle = RING;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(x, y, radiusOf(chosen.t) / M_PER_PX, 0, Math.PI * 2);
      ctx.stroke();
    }
    // oxlint-disable-next-line react/immutability -- three's texture, repainted here; React holds no copy of it
    texture.needsUpdate = true;
  }, [glows, selectedId, box, texture]);

  if (!geometry || !texture || !box) return null;

  const pick = onPick
    ? (event: ThreeEvent<MouseEvent>) => {
        if (!event.uv) return;
        const e = box.minE + event.uv.x * (box.maxE - box.minE);
        const n = box.minN + event.uv.y * (box.maxN - box.minN);
        // in metres: scale 1 and a minimum of MIN_RADIUS_M "pixels" make glowAt's reach the drawn one
        const hit = glowAt(glows, e, n, 1, MIN_RADIUS_M);
        if (hit) {
          event.stopPropagation();
          onPick(hit.id);
        }
      }
    : undefined;

  return (
    <mesh geometry={geometry} renderOrder={20} onClick={pick}>
      <meshBasicMaterial map={texture} transparent opacity={0.85} depthTest={false} depthWrite={false} toneMapped={false} />
    </mesh>
  );
}

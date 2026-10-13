/*
 * ─────────────────────────────────────────────────────────────────────────
 * THE STREET ACTIVITY ON THE GROUND
 * ─────────────────────────────────────────────────────────────────────────
 *
 * A soft glow at each counter, deeper and wider the busier its street is —
 * no dot and no pin, as the design has it: the glow is the mark. One sheet
 * just above the ground carries all of them, painted on a canvas, so 46
 * counters are one draw call however many there are.
 *
 * Counters with no level (no count this hour, or no thresholds to rate one
 * by) are not painted. The column lists them instead.
 *
 * Inside <WorldFrame>, in east–north–up metres like the roads, so the sheet
 * lies on the ground without a rotation of its own. Unlit, transparent and
 * not written to depth: the buildings stand in front of it, and the colours
 * are the palette's own, not the sun's (activityPalette.ts).
 *
 * A tap on a glow chooses its counter. Where two overlap, the one painted
 * on top wins — the busier, then the nearer — so the tap gives the glow the
 * reader can see under the finger.
 */
import { useEffect, useMemo } from 'react';
import { CanvasTexture, SRGBColorSpace } from 'three';
import type { ThreeEvent } from '@react-three/fiber';
import type { ActivityLevel } from '../data/streetActivity';
import { worldToEnu } from './frame';
import { ACTIVITY_COLOURS, ACTIVITY_LEVELS, ACTIVITY_RADII_M } from './activityPalette';

export interface Glow {
  id: number;
  /** East and north of the scene's origin, metres. */
  en: [number, number];
  level: ActivityLevel;
}

/** Metres per canvas pixel. The glows are soft; finer is wasted memory. */
const M_PER_PX = 1.5;
/** Room around the outermost glows, metres. */
const MARGIN_M = 80;
/** Just above the roads (6 cm) and the open space, with polygonOffset for the distance. */
const LIFT_M = 0.25;
/** The middle of a glow; it fades to nothing at its radius. */
const CORE_ALPHA = 0.95;

function hexToRgb(hex: string): [number, number, number] {
  const v = Number.parseInt(hex.slice(1), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

export interface GlowSheet {
  canvas: HTMLCanvasElement;
  /** The sheet's middle and size, metres. */
  centre: [number, number];
  size: [number, number];
}

/** The canvas and where it lies. Null with nothing to paint. */
export function paintGlows(glows: readonly Glow[], makeCanvas: () => HTMLCanvasElement): GlowSheet | null {
  if (glows.length === 0) return null;
  let minE = Infinity, minN = Infinity, maxE = -Infinity, maxN = -Infinity;
  for (const g of glows) {
    minE = Math.min(minE, g.en[0]);
    maxE = Math.max(maxE, g.en[0]);
    minN = Math.min(minN, g.en[1]);
    maxN = Math.max(maxN, g.en[1]);
  }
  minE -= MARGIN_M; minN -= MARGIN_M; maxE += MARGIN_M; maxN += MARGIN_M;
  const width = Math.ceil((maxE - minE) / M_PER_PX);
  const height = Math.ceil((maxN - minN) / M_PER_PX);

  const canvas = makeCanvas();
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;

  // Quiet first, busy last: where two overlap, the busier is on top.
  const ordered = [...glows].sort((a, b) => ACTIVITY_LEVELS.indexOf(a.level) - ACTIVITY_LEVELS.indexOf(b.level));
  for (const g of ordered) {
    const x = (g.en[0] - minE) / M_PER_PX;
    // Canvas rows run down; north runs up.
    const y = (maxN - g.en[1]) / M_PER_PX;
    const r = ACTIVITY_RADII_M[g.level] / M_PER_PX;
    const [cr, cg, cb] = hexToRgb(ACTIVITY_COLOURS[g.level]);
    const gradient = ctx.createRadialGradient(x, y, 0, x, y, r);
    gradient.addColorStop(0, `rgba(${cr},${cg},${cb},${CORE_ALPHA})`);
    gradient.addColorStop(0.5, `rgba(${cr},${cg},${cb},${CORE_ALPHA * 0.85})`);
    gradient.addColorStop(1, `rgba(${cr},${cg},${cb},0)`);
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }

  return {
    canvas,
    centre: [(minE + maxE) / 2, (minN + maxN) / 2],
    size: [maxE - minE, maxN - minN],
  };
}

/** The counter whose glow reaches the point and is drawn on top there: busiest, then nearest. */
export function glowAt(glows: readonly Glow[], e: number, n: number): Glow | null {
  let best: Glow | null = null;
  let bestRank = -1;
  let bestD = Infinity;
  for (const g of glows) {
    const d = Math.hypot(g.en[0] - e, g.en[1] - n);
    if (d > ACTIVITY_RADII_M[g.level]) continue;
    const rank = ACTIVITY_LEVELS.indexOf(g.level);
    if (rank > bestRank || (rank === bestRank && d < bestD)) {
      best = g;
      bestRank = rank;
      bestD = d;
    }
  }
  return best;
}

export function ActivityGlow({
  glows,
  groundAhdM,
  onPick,
}: {
  glows: readonly Glow[];
  groundAhdM: number;
  onPick?: (id: number) => void;
}) {
  const sheet = useMemo(() => paintGlows(glows, () => document.createElement('canvas')), [glows]);
  const texture = useMemo(() => {
    if (!sheet) return null;
    const t = new CanvasTexture(sheet.canvas);
    t.colorSpace = SRGBColorSpace;
    return t;
  }, [sheet]);
  useEffect(() => () => texture?.dispose(), [texture]);
  // A hand left over the rest of the app when the layer goes mid-hover.
  useEffect(() => () => void (document.body.style.cursor = ''), [onPick]);

  if (!sheet || !texture) return null;

  const pointAt = (event: ThreeEvent<PointerEvent | MouseEvent>) => {
    const [e, n] = worldToEnu([event.point.x, event.point.y, event.point.z]);
    return glowAt(glows, e, n);
  };

  return (
    <mesh
      position={[sheet.centre[0], sheet.centre[1], groundAhdM + LIFT_M]}
      renderOrder={3}
      onClick={(event) => {
        if (!onPick) return;
        const hit = pointAt(event);
        if (!hit) return;
        event.stopPropagation();
        onPick(hit.id);
      }}
      onPointerMove={(event) => {
        if (!onPick) return;
        document.body.style.cursor = pointAt(event) ? 'pointer' : '';
      }}
      onPointerOut={() => {
        if (onPick) document.body.style.cursor = '';
      }}
    >
      <planeGeometry args={[sheet.size[0], sheet.size[1]]} />
      <meshBasicMaterial
        map={texture}
        transparent
        depthWrite={false}
        toneMapped={false}
        // The haze lightens far things; a busy street must stay as dark as the key says.
        fog={false}
        polygonOffset
        polygonOffsetFactor={-2}
        polygonOffsetUnits={-8}
      />
    </mesh>
  );
}

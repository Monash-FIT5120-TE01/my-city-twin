/*
 * ─────────────────────────────────────────────────────────────────────────
 * A FUTURE PLAN'S PLACE, LIT ON THE GROUND
 * ─────────────────────────────────────────────────────────────────────────
 *
 * WHAT THIS FILE IS
 *   The band laid along a plan's street or round its area (ui/planPlaces),
 *   on the ground's real heights, cut out of every building's footprint
 *   (planBands) so that none of it lies under or over a building. Inside
 *   <WorldFrame>, in east/north/up like OpenSpace; the pin that goes with
 *   it is the chosen place's own (SiteMarker), outside the frame.
 *
 * WHY THE SEARCHED BUILDING'S PINK
 *   It is a place somebody asked about, which is what that pink means
 *   everywhere else (SiteMarker, palette.ts): not a stage of a project. At
 *   L* 50 it stands apart from the pale roads and the city (L* above 90)
 *   and from the parks' green under every common colour vision difference,
 *   so it is the band's darkness, not its hue, that finds it.
 */

import { useMemo } from 'react';
import { BufferAttribute, BufferGeometry } from 'three';
import type { PolygonEN } from '../data/model';
import type { PlanShape } from '../ui/planPlaces';
import { drapeOnGround } from './drape';
import { obstaclesOf, openQuads, type BandSegment } from './planBands';
import type { Ground } from './terrain';

/** The band round an area: wide enough to read from the whole-city view. */
const RING_WIDTH_M = 14;

export function PlanHighlight({
  shapes,
  footprints,
  groundAhdM,
}: {
  shapes: PlanShape[];
  /** Every building's footprint, standing and approved: the band is cut out of them (planBands). */
  footprints: readonly PolygonEN[];
  groundAhdM: Ground;
}) {
  const obstacles = useMemo(() => obstaclesOf(footprints), [footprints]);
  const geometry = useMemo<BufferGeometry | null>(() => {
    const segments: BandSegment[] = [];
    for (const shape of shapes) {
      const points = shape.kind === 'ring' ? [...shape.points, shape.points[0]] : shape.points;
      const widthM = shape.kind === 'ring' ? RING_WIDTH_M : shape.widthM;
      for (let i = 1; i < points.length; i++) segments.push({ from: points[i - 1], to: points[i], widthM });
    }
    const quads = openQuads(segments, obstacles);
    if (quads.length === 0) return null;
    // two triangles a rectangle, flat at z = 0 until draped
    const position = new Float32Array(quads.length * 18);
    quads.forEach(([a, b, c, d], q) => {
      const corners = [a, b, c, a, c, d];
      corners.forEach(([e, n], k) => position.set([e, n, 0], q * 18 + k * 3));
    });
    const flat = new BufferGeometry();
    flat.setAttribute('position', new BufferAttribute(position, 3));
    // over the roads (0.06 m) and the parks (0.12 m), under anything standing
    const draped = drapeOnGround(flat, groundAhdM, 0.3);
    flat.dispose();
    return draped;
  }, [shapes, obstacles, groundAhdM]);

  if (!geometry) return null;

  return (
    /*
     * Not a target: a tint on the ground, as the parks are (OpenSpace). Hidden
     * by whatever stands over it, on purpose. A fainter copy drawn through
     * the buildings was tried, to join up a lane between towers, and it laid
     * pink over roofs — over the very buildings the street is not (2026-10-29).
     */
    <mesh geometry={geometry} raycast={() => null}>
      <meshBasicMaterial
        color="#c9457f"
        transparent
        opacity={0.88}
        depthWrite={false}
        polygonOffset
        polygonOffsetFactor={-2}
        polygonOffsetUnits={-12}
      />
    </mesh>
  );
}

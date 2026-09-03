/*
 * ─────────────────────────────────────────────────────────────────────────
 * FLAT OUTLINES  →  SOLID BUILDINGS
 * ─────────────────────────────────────────────────────────────────────────
 *
 * WHAT THIS FILE IS
 *   The step that gives the city height. It takes the outlines the adapter
 *   produced and turns each into a three-dimensional solid the renderer can
 *   draw and the sun can be blocked by.
 *
 * HOW EXTRUSION WORKS
 *   A footprint is a flat shape. Extruding it means sweeping it upwards and
 *   putting walls down the sides — the same motion as a biscuit cutter,
 *   except the result is filled. three.js does the work; this file decides
 *   what shape goes in and how far up it sweeps.
 *
 * THE PART THAT IS NOT OBVIOUS: WHY MERGE
 *   Drawing 4,443 separate solids means telling the graphics card 4,443
 *   times per frame to draw something, and the shadow pass doubles it. Each
 *   of those instructions costs more than the triangles inside it. Welded
 *   into one object, the whole city is a single instruction.
 *
 *   The trade is that a merged object cannot be clicked or coloured
 *   individually — which is why the 49 developments are NOT merged together
 *   (see DevelopmentMassings.tsx) while the 1,548 background buildings are.
 *
 * "LOD1"
 *   The standard term for this kind of model: flat-topped blocks at the
 *   right footprint and the right height, with no roof shape, no windows and
 *   no detail. It is what shadow work uses, because an outline and a height
 *   are what decide where a shadow falls; a pitched roof changes the picture
 *   and barely changes the shadow.
 */

import { BufferGeometry, ExtrudeGeometry, Shape } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { Massing, PolygonEN } from '../data/model';

/** Smallest ring we will trust. Below this it is noise in the source. */
const MIN_RING_VERTICES = 3;
const MIN_HEIGHT_M = 0.2;

function toShapes(footprint: PolygonEN[]): Shape[] {
  const shapes: Shape[] = [];

  for (const polygon of footprint) {
    const [outer, ...holes] = polygon;
    if (!outer || outer.length < MIN_RING_VERTICES) continue;

    const shape = new Shape();
    shape.moveTo(outer[0][0], outer[0][1]);
    for (let i = 1; i < outer.length; i++) shape.lineTo(outer[i][0], outer[i][1]);
    shape.closePath();

    for (const hole of holes) {
      if (hole.length < MIN_RING_VERTICES) continue;
      const path = new Shape();
      path.moveTo(hole[0][0], hole[0][1]);
      for (let i = 1; i < hole.length; i++) path.lineTo(hole[i][0], hole[i][1]);
      path.closePath();
      shape.holes.push(path);
    }

    shapes.push(shape);
  }

  return shapes;
}

/**
 * One solid, from the massing's own base up to its roof.
 *
 * Only the lowest part of a building is allowed to reach down to the ground
 * plane. Sinking every part would give each upper storey a column of mass
 * down to street level; measured against the source, 201 parts have nothing
 * beneath them, and an invented column casts an invented shadow.
 */
export function buildMassingGeometry(
  massing: Massing,
  floorAhdM: number,
): BufferGeometry | null {
  const top = massing.topAhdM;
  const floor = massing.sinksToGround
    ? Math.min(floorAhdM, massing.baseAhdM)
    : massing.baseAhdM;
  const depth = top - floor;
  if (depth < MIN_HEIGHT_M) return null;

  const shapes = toShapes(massing.footprint);
  if (shapes.length === 0) return null;

  const geometry = new ExtrudeGeometry(shapes, {
    depth,
    bevelEnabled: false,
    steps: 1,
  });
  geometry.translate(0, 0, floor);
  return geometry;
}

/**
 * Merges many massings into one geometry.
 *
 * 4,443 building parts as individual meshes is 4,443 draw calls per frame,
 * and the shadow pass doubles it. Merged, the whole city is one.
 */
export function mergeMassings(
  massings: Massing[],
  floorAhdM: number,
): BufferGeometry | null {
  const parts: BufferGeometry[] = [];

  for (const massing of massings) {
    const geometry = buildMassingGeometry(massing, floorAhdM);
    if (geometry) parts.push(geometry);
  }

  if (parts.length === 0) return null;

  const merged = mergeGeometries(parts, false);
  for (const part of parts) part.dispose();
  if (!merged) return null;

  merged.computeVertexNormals();
  return merged;
}

/** Elevation the flat ground plane is drawn at: the median of what stands on it. */
export function groundElevationOf(massings: Massing[]): number {
  const bases = massings.map((m) => m.baseAhdM).sort((a, b) => a - b);
  if (bases.length === 0) return 0;
  return bases[Math.floor(bases.length / 2)];
}

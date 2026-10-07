/*
 * ─────────────────────────────────────────────────────────────────────────
 * THE CHOSEN BUILDING, OUTLINED
 * ─────────────────────────────────────────────────────────────────────────
 *
 * WHAT THIS FILE IS
 *   The dark outline drawn round whichever building has been chosen: the
 *   searched-for building (HighlightedBuilding) and the project being read
 *   about (DevelopmentMassings). It sits inside that building's <mesh>.
 *
 * WHAT IT DOES
 *   - Turns the building's blocks into line segments (outline.ts).
 *   - Draws them as screen-space lines in a dark ink.
 *   - Thickens the line as the camera pulls back, every frame.
 *
 * WHY AN OUTLINE
 *   The building somebody chose was told apart by colour alone — pink for a
 *   searched building, a lighter shade for the project in focus — and in a
 *   city of pale blocks, under shadow, that was reported as hard to find. A
 *   colour is also exactly what a reader with a colour-vision difference may
 *   not get. So the chosen one also has its outline drawn in a dark ink: a
 *   difference in lightness against pale walls, which reads whatever colours
 *   somebody sees.
 *
 * WHICH LINES
 *   The roof lines and the corners, worked out from the building's blocks
 *   rather than from its triangles — see outline.ts for why the triangles
 *   gave a tangle.
 *
 * THE LINE'S WEIGHT
 *   Thin and a dark green-grey close up, where the building fills the view
 *   and a heavy black line would be the loudest thing on the screen. Heavier
 *   as the camera pulls back, so that from across the city the outline is
 *   still there to find. The width is in screen pixels — drei's <Line> draws
 *   lines as thin quads, because a plain WebGL line is one pixel everywhere.
 */

import { useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Line } from '@react-three/drei';
import { Vector3 } from 'three';
import type { Massing } from '../data/model';
import { outlineSegments } from './outline';

/**
 * Dark green-grey: the brand's darkest green, which stays far darker than
 * the pink, teal and orange it is drawn over, and is softer than black.
 */
const INK = '#1f3a32';

/** Screen pixels: near, far, and the camera distances between which it grows. */
const NEAR_PX = 1.6;
const FAR_PX = 3.2;
const NEAR_M = 400;
const FAR_M = 2600;

/**
 * The two members of drei's line object this touches each frame, named
 * rather than importing the three-stdlib Line2 type for them.
 */
interface LineLike {
  material: { linewidth: number };
  localToWorld: (v: Vector3) => Vector3;
}

/**
 * Put inside the chosen building's <mesh>, given the blocks the mesh was
 * built from and the same floor height, so the lines land on its walls.
 */
export function SelectionEdges({ parts, floorAhdM }: { parts: Massing[]; floorAhdM: number }) {
  /*
   * The segments as the point pairs <Line segments> wants, and their
   * average: the point the camera's distance is measured to.
   */
  const { points, centre } = useMemo(() => {
    const flat = outlineSegments(parts, floorAhdM);
    const triples: [number, number, number][] = [];
    const middle = new Vector3();
    for (let i = 0; i < flat.length; i += 3) {
      triples.push([flat[i], flat[i + 1], flat[i + 2]]);
      middle.x += flat[i];
      middle.y += flat[i + 1];
      middle.z += flat[i + 2];
    }
    if (triples.length) middle.divideScalar(triples.length);
    return { points: triples, centre: middle };
  }, [parts, floorAhdM]);

  const line = useRef<LineLike>(null);
  const world = useMemo(() => new Vector3(), []);

  /*
   * The width follows the camera. Set on the material directly, every
   * frame, without a React render — the same reason CameraRig moves the
   * camera that way.
   */
  useFrame(({ camera }) => {
    const target = line.current;
    if (!target) return;
    world.copy(centre);
    target.localToWorld(world);
    const t = Math.min(1, Math.max(0, (camera.position.distanceTo(world) - NEAR_M) / (FAR_M - NEAR_M)));
    target.material.linewidth = NEAR_PX + (FAR_PX - NEAR_PX) * t;
  });

  if (points.length < 2) return null;

  return (
    <Line
      ref={line as never}
      points={points}
      segments
      color={INK}
      lineWidth={NEAR_PX}
      /*
       * Drawn after the building, not before. A proposal is slightly
       * see-through, and see-through things are drawn after everything
       * solid; solid lines drawn first had nothing in front of them yet, and
       * the edges at the BACK of a proposal showed through its walls.
       * Marked transparent and ordered after the building, the lines are
       * tested against the walls already drawn.
       */
      transparent
      renderOrder={1}
      raycast={() => null}
    />
  );
}

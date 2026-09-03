/*
 * ─────────────────────────────────────────────────────────────────────────
 * THE ROAD SURFACE
 * ─────────────────────────────────────────────────────────────────────────
 *
 * WHAT THIS FILE IS
 *   Draws the pale grey of the carriageways. It reads a prepared file rather
 *   than working the shapes out, and the reason is the whole story here.
 *
 * THE FIRST ATTEMPT, AND WHY IT FAILED
 *   Each street was drawn as a long rectangle: take the centreline, give it
 *   a width, done. Measured against the buildings afterwards, 15% of the
 *   painted road was underneath one — and 40% of the narrow lanes.
 *
 *   The reason is simple once seen. A centreline is infinitely thin and can
 *   thread a gap that a 30-metre-wide band cannot. Nudging the lines
 *   sideways did not help: there was nowhere for the band to go.
 *
 * WHAT IS DONE INSTEAD
 *   Offline, once: take the union of all the street bands, then SUBTRACT the
 *   union of all 4,443 building footprints. What is left is road exactly
 *   where no building stands. Not an approximation of the truth — the truth.
 *   Residual overlap measures 0.03%.
 *
 *   A pleasant side effect: where an arcade genuinely bridges a lane, the
 *   road correctly stops and the building covers it.
 *
 * WHY IT IS A FILE AND NOT COMPUTED HERE
 *   Subtracting thousands of polygons is heavy geometry, and the answer
 *   never changes. Doing it once and shipping 40 KB is better than doing it
 *   in every visitor's browser. road-surface.test.ts checks the file still
 *   describes a street network.
 */

import { useEffect, useMemo, useState } from 'react';
import { BufferGeometry, Shape, ShapeGeometry } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { PolygonEN } from '../data/model';

interface RoadsDoc {
  /** Outer ring first, then holes, in metres east/north. */
  polygons: PolygonEN[];
}

export function Roads({ groundAhdM }: { groundAhdM: number }) {
  const [doc, setDoc] = useState<RoadsDoc | null>(null);

  useEffect(() => {
    let live = true;
    fetch('/data/roads.json')
      .then((response) => (response.ok ? response.json() : null))
      .then((data: RoadsDoc | null) => {
        if (live) setDoc(data);
      })
      // The city stands without it; a missing road layer is not worth an
      // error in front of anyone.
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);

  const geometry = useMemo<BufferGeometry | null>(() => {
    if (!doc) return null;

    const parts: BufferGeometry[] = [];
    for (const polygon of doc.polygons) {
      const [outer, ...holes] = polygon;
      if (!outer || outer.length < 3) continue;

      const shape = new Shape();
      shape.moveTo(outer[0][0], outer[0][1]);
      for (let i = 1; i < outer.length; i++) shape.lineTo(outer[i][0], outer[i][1]);
      shape.closePath();

      for (const hole of holes) {
        if (hole.length < 3) continue;
        const path = new Shape();
        path.moveTo(hole[0][0], hole[0][1]);
        for (let i = 1; i < hole.length; i++) path.lineTo(hole[i][0], hole[i][1]);
        path.closePath();
        shape.holes.push(path);
      }

      parts.push(new ShapeGeometry(shape));
    }

    if (parts.length === 0) return null;
    const merged = mergeGeometries(parts, false);
    for (const part of parts) part.dispose();
    return merged;
  }, [doc]);

  if (!geometry) return null;

  return (
    <mesh geometry={geometry} position={[0, 0, groundAhdM + 0.06]} receiveShadow>
      <meshStandardMaterial color="#f7f5ef" roughness={1} metalness={0} />
    </mesh>
  );
}

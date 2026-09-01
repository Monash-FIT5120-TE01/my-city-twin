import { useEffect, useMemo, useState } from 'react';
import { BufferGeometry, Shape, ShapeGeometry } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { PolygonEN } from '../data/model';

/*
 * The carriageways, painted a shade lighter than the ground.
 *
 * In the Figma the roads are not blank gaps: they carry their own pale tone,
 * which is what makes the grid legible from above. Without it the city reads
 * as scattered blocks rather than as streets with buildings along them.
 *
 * The shapes are not straight strips. Strips were the first attempt, drawn
 * from a centreline and a width, and 15% of the resulting surface lay under a
 * building — a centreline can thread a gap that a 30 m strip cannot. The
 * fixture is instead the union of those strips MINUS the union of all 4,443
 * footprints, computed once offline, which leaves road exactly where no
 * building stands. That is not an approximation of the truth; it is the
 * truth, and the residual overlap measures 0.03%.
 */

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

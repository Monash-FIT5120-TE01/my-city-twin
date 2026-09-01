import { useEffect, useMemo, useState } from 'react';
import { BufferGeometry, Shape, ShapeGeometry } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { PolygonEN } from '../data/model';

/*
 * Parks, gardens and civic squares.
 *
 * These are the public spaces the user stories are about — "the square they
 * eat lunch in", the ground whose sunlight is worth protecting. Without them
 * the model is buildings and roads, and a resident has nothing to locate
 * themselves by beyond a street name.
 *
 * Two filters were applied when the fixture was cut, and both matter:
 *
 *   OS_CATEGOR  keeps parks, gardens and civic squares, dropping the 68
 *               university campuses and the school grounds that the source
 *               also counts as open space.
 *   OS_ACCESS   keeps only "Open". A locked university lawn is open space on
 *               a map and not a park to somebody on a lunch break.
 */

interface OpenSpaceFeature {
  category: string;
  access: string;
  hectares: number | null;
  polygons: PolygonEN[];
}

interface OpenSpaceDoc {
  features: OpenSpaceFeature[];
}

export function OpenSpace({ groundAhdM }: { groundAhdM: number }) {
  const [doc, setDoc] = useState<OpenSpaceDoc | null>(null);

  useEffect(() => {
    let live = true;
    fetch('/data/open-space.json')
      .then((response) => (response.ok ? response.json() : null))
      .then((data: OpenSpaceDoc | null) => {
        if (live) setDoc(data);
      })
      // The city stands without it; a missing park layer is not worth an
      // error in front of anyone.
      .catch(() => undefined);
    return () => {
      live = false;
    };
  }, []);

  const geometry = useMemo<BufferGeometry | null>(() => {
    if (!doc) return null;

    const parts: BufferGeometry[] = [];
    for (const feature of doc.features) {
      for (const polygon of feature.polygons) {
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
    }

    if (parts.length === 0) return null;
    const merged = mergeGeometries(parts, false);
    for (const part of parts) part.dispose();
    return merged;
  }, [doc]);

  if (!geometry) return null;

  return (
    <mesh
      geometry={geometry}
      // Above the ground and the roads, below anything standing on it.
      position={[0, 0, groundAhdM + 0.12]}
      receiveShadow
    >
      {/*
        Deep enough to read as planting rather than as a slightly different
        pavement. The city is near-white and the roads paler still, so green
        is the only hue on the ground and it can afford to be a real one.
      */}
      <meshStandardMaterial color="#a9c795" roughness={1} metalness={0} />
    </mesh>
  );
}

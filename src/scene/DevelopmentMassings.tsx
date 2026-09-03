/*
 * ─────────────────────────────────────────────────────────────────────────
 * THE 49 APPROVED PROJECTS
 * ─────────────────────────────────────────────────────────────────────────
 *
 * WHAT THIS FILE IS
 *   Draws the proposals standing in the city, and makes them clickable.
 *
 * WHY EACH ONE IS A SEPARATE OBJECT
 *   The 1,548 existing buildings are welded into one object because nobody
 *   ever needs to click one. A proposal is different: it has to be
 *   selectable and it has to be able to change colour on its own, and
 *   neither is possible once geometry has been merged. Forty-nine objects
 *   is a cost worth paying; four and a half thousand would not be.
 *
 * WHY THE GEOMETRY IS BUILT WITHOUT KNOWING WHICH IS SELECTED
 *   Selection only changes a material. Rebuilding the shapes when it
 *   changes meant re-extruding and re-welding all 49 on every click, which
 *   was a visible pause. The shapes are built once; the colour is decided
 *   at draw time.
 *
 * COLOUR SAYS WHAT CAN BE DONE
 *
 *   selected     full mint — this is the one being read about
 *   clickable    strong green — plainly not an existing building, and
 *                plainly something to press
 *   not clickable  pale — in focus mode nothing responds, so nothing
 *                  should look like it will
 *
 *   Colour that invites a click the click will not answer is worse than no
 *   invitation at all.
 *
 * WHY ONLY ONE APPEARS ON THE SUNLIGHT SCREEN
 *   Forty-nine towers casting at once buries the single shadow that screen
 *   exists to explain.
 */

import { useEffect, useMemo } from 'react';
import type { BufferGeometry } from 'three';
import type { Development } from '../data/model';
import { mergeMassings } from './massing';

interface DevelopmentMassingsProps {
  developments: Development[];
  focus: Development | null;
  groundAhdM: number;
  /** When false, only the focused proposal is drawn. */
  showAll: boolean;
  /** False in focus mode: the view becomes something to look at, not operate. */
  interactive: boolean;
  onSelect: (development: Development) => void;
}

export function DevelopmentMassings({
  developments,
  focus,
  groundAhdM,
  showAll,
  interactive,
  onSelect,
}: DevelopmentMassingsProps) {
  /*
   * Geometry is built for every development once and kept. `focus` is
   * deliberately NOT a dependency: it only decides which material is used, and
   * including it re-extruded and re-merged all 49 massings on every selection,
   * which is a visible stall on a click.
   */
  const built = useMemo(
    () =>
      developments
        .map((development) => ({
          development,
          geometry: mergeMassings(development.parts, groundAhdM),
        }))
        .filter((entry): entry is { development: Development; geometry: BufferGeometry } =>
          Boolean(entry.geometry),
        ),
    [developments, groundAhdM],
  );

  // Free the buffers when the set is replaced — a live-API refresh rebuilds
  // every development, and the old ones would otherwise stay on the GPU.
  useEffect(() => {
    return () => {
      for (const entry of built) entry.geometry.dispose();
    };
  }, [built]);

  const meshes = showAll ? built : built.filter((entry) => entry.development === focus);

  useEffect(() => {
    return () => {
      document.body.style.cursor = '';
    };
  }, []);

  return (
    <group>
      {meshes.map(({ development, geometry }) => {
        const focused = development === focus;
        /*
         * Colour states what can be done, not just what is what.
         *
         * An unfocused proposal is only worth noticing while it can be
         * clicked, so it carries the strong green then and drops back to
         * scenery when it cannot — in focus mode, where the interface is
         * gone and nothing responds. Colour that invites a click the click
         * will not answer is worse than no invitation at all.
         */
        const invites = !focused && interactive;
        return (
          <mesh
            key={development.devId}
            geometry={geometry}
            castShadow
            receiveShadow
            onClick={
              interactive
                ? (event) => {
                    event.stopPropagation();
                    onSelect(development);
                  }
                : undefined
            }
            onPointerOver={
              interactive
                ? (event) => {
                    event.stopPropagation();
                    document.body.style.cursor = 'pointer';
                  }
                : undefined
            }
            onPointerOut={interactive ? () => { document.body.style.cursor = ''; } : undefined}
          >
            {/*
              The focused proposal carries the full mint; the rest are stated
              quietly enough that the eye still goes to the one being read
              about, but plainly enough to be seen and clicked.
            */}
            <meshStandardMaterial
              color={focused ? '#8fdcc7' : invites ? '#6fbfa6' : '#cfe6dd'}
              roughness={focused ? 0.4 : 0.55}
              metalness={0}
              emissive="#2fbfa2"
              emissiveIntensity={focused ? 0.3 : invites ? 0.16 : 0.05}
              transparent
              opacity={focused ? 0.95 : invites ? 0.9 : 0.78}
            />
          </mesh>
        );
      })}
    </group>
  );
}

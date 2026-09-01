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

/**
 * The approved proposals, standing in the city.
 *
 * Story 1.1 asks what is changing around a resident — not what is changing on
 * one site. Drawing all 49 at once is the only view that answers it, and it
 * makes them selectable: until now a development could only be reached
 * through a list, which is the opposite of "I want to know what is happening
 * to the street I am standing on".
 *
 * On the sunlight screen only the focused proposal is drawn. Forty-nine towers
 * all casting at once would bury the one shadow the screen is about.
 */
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

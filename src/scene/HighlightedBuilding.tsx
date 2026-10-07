/*
 * ─────────────────────────────────────────────────────────────────────────
 * THE BUILDING SOMEBODY SEARCHED FOR
 * ─────────────────────────────────────────────────────────────────────────
 *
 * WHAT THIS FILE IS
 *   Draws one existing building in pink, so a search result can be seen in
 *   the city rather than only named in a list.
 *
 * WHAT IT DOES
 *   - Gathers every roof plane that belongs to the chosen building.
 *   - Welds them into one pink mesh drawn over the background city.
 *   - Outlines them in dark ink (SelectionEdges), so the building can be
 *     found by its lightness as well as its colour.
 *
 * WHY IT IS A SEPARATE OBJECT
 *   The 1,548 background buildings are welded into a single object, which is
 *   what makes the scene fast — but a welded object cannot be coloured in
 *   parts. So the highlighted one is lifted out and drawn on its own, exactly
 *   as the 49 proposals are. One extra object is free; the alternative is
 *   unwelding the city.
 *
 * WHY PINK
 *   Colour in this scene already means something (palette.ts): cream is
 *   built, teal an approved project, orange one under construction, a
 *   muted beige data we do not trust. Pink is a further meaning — "this is
 *   the one you looked for" — and it has to be unmistakable against the
 *   project colours in particular, because a search result standing beside
 *   a project is the common case. On screen it is the darkest of them (L*
 *   about 63, against 73 for both project colours), and it is outlined.
 *
 *   It is deliberately temporary. It says nothing about the building itself,
 *   only about what the person asked for, so it clears the moment the
 *   question changes.
 *
 *   Pink alone was not enough: in a city of pale blocks, under shadow, it
 *   was reported as hard to find, and a colour is exactly what a reader
 *   with a colour-vision difference may not get. Hence the outline.
 */

import { useEffect, useMemo } from 'react';
import type { BufferGeometry } from 'three';
import type { BuildingMassing } from '../data/model';
import { mergeMassings } from './massing';
import { SelectionEdges } from './SelectionEdges';

interface HighlightedBuildingProps {
  /** Every part of the city; the matching ones are lifted out here. */
  buildings: BuildingMassing[];
  /** Which building to pick out, or null for none. */
  buildingId: string | null;
  /** The floor height the city was built on, so the copy lands on the original. */
  groundAhdM: number;
}

/** The searched-for building, lifted out of the welded city and drawn pink. */
export function HighlightedBuilding({
  buildings,
  buildingId,
  groundAhdM,
}: HighlightedBuildingProps) {
  // A building is several roof planes sharing an id, so all of them are
  // needed or the highlight would light up one storey. Kept apart from the
  // geometry because the outline is worked out from the same parts.
  const parts = useMemo(
    () => (buildingId ? buildings.filter((part) => part.parentId === buildingId) : []),
    [buildings, buildingId],
  );
  const geometry = useMemo<BufferGeometry | null>(
    () => (parts.length ? mergeMassings(parts, groundAhdM) : null),
    [parts, groundAhdM],
  );

  /*
   * Rebuilt for every building chosen, and react-three-fiber does not
   * dispose a geometry it is handed — so the old one is let go here. With a
   * double click on any building, choosing one after another is ordinary.
   */
  useEffect(() => () => geometry?.dispose(), [geometry]);

  if (!geometry) return null;

  return (
    <mesh geometry={geometry} castShadow receiveShadow>
      <meshStandardMaterial
        color="#e87ba8"
        roughness={0.5}
        metalness={0}
        // A little glow so it still reads as highlighted when it happens to
        // be standing in another building's shadow.
        emissive="#c9457f"
        emissiveIntensity={0.24}
      />
      {/* Outlined as well as coloured — see SelectionEdges. */}
      <SelectionEdges parts={parts} floorAhdM={groundAhdM} />
    </mesh>
  );
}

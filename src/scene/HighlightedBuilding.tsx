/*
 * ─────────────────────────────────────────────────────────────────────────
 * THE BUILDING SOMEBODY SEARCHED FOR
 * ─────────────────────────────────────────────────────────────────────────
 *
 * WHAT THIS FILE IS
 *   Draws one existing building in pink, so a search result can be seen in
 *   the city rather than only named in a list.
 *
 * WHY IT IS A SEPARATE OBJECT
 *   The 1,548 background buildings are welded into a single object, which is
 *   what makes the scene fast — but a welded object cannot be coloured in
 *   parts. So the highlighted one is lifted out and drawn on its own, exactly
 *   as the 49 proposals are. One extra object is free; the alternative is
 *   unwelding the city.
 *
 * WHY PINK
 *   Colour in this scene already means something: mint is a proposal, white
 *   is built, grey is data we do not trust. Pink is a fourth meaning — "this
 *   is the one you looked for" — and it has to be unmistakable against mint
 *   in particular, because a search result standing beside a proposal is the
 *   common case. Pink and mint sit on opposite sides of the wheel, which is
 *   why it works where another green would not.
 *
 *   It is deliberately temporary. It says nothing about the building itself,
 *   only about what the person asked for, so it clears the moment the
 *   question changes.
 */

import { useMemo } from 'react';
import type { BufferGeometry } from 'three';
import type { BuildingMassing } from '../data/model';
import { mergeMassings } from './massing';

interface HighlightedBuildingProps {
  /** Every part of the city; the matching ones are lifted out here. */
  buildings: BuildingMassing[];
  /** Which building to pick out, or null for none. */
  buildingId: string | null;
  groundAhdM: number;
}

export function HighlightedBuilding({
  buildings,
  buildingId,
  groundAhdM,
}: HighlightedBuildingProps) {
  const geometry = useMemo<BufferGeometry | null>(() => {
    if (!buildingId) return null;
    // A building is several roof planes sharing an id, so all of them are
    // needed or the highlight would light up one storey.
    const parts = buildings.filter((part) => part.parentId === buildingId);
    return parts.length ? mergeMassings(parts, groundAhdM) : null;
  }, [buildings, buildingId, groundAhdM]);

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
    </mesh>
  );
}

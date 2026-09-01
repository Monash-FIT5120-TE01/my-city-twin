import { useMemo } from 'react';
import type { CityModel, Development } from '../data/model';
import { groundElevationOf, mergeMassings } from './massing';
import { Roads } from './Roads';
import { Ground } from './Ground';
import { DevelopmentMassings } from './DevelopmentMassings';
import { ReceptorMarker } from './ReceptorMarker';
import { OpenSpace } from './OpenSpace';

interface CityMassingProps {
  model: CityModel;
  /** The development being examined. Its parts render as the proposal. */
  focus: Development | null;
  /** False shows the city as built; true adds the approved massing. */
  showProposed: boolean;
  /** True everywhere except the sunlight screen, which wants one shadow. */
  showAllProposals: boolean;
  onSelectDevelopment: (development: Development) => void;
  /** The spot being measured, if one has been picked. */
  receptor: [number, number] | null;
  onPickReceptor?: (point: [number, number]) => void;
  /** False in focus mode: nothing in the scene changes state. */
  interactive: boolean;
}

/**
 * The built city, plus the proposal when it is switched on.
 *
 * Three merged meshes, split by what the colour has to say: built form, form
 * we could not reconcile, and the proposal. The palette is the one from the
 * Figma — a near-white city so the mint proposal is the only thing that
 * carries colour, and the eye goes straight to what changed.
 */
export function CityMassing({
  model,
  focus,
  showProposed,
  showAllProposals,
  onSelectDevelopment,
  receptor,
  onPickReceptor,
  interactive,
}: CityMassingProps) {
  const groundAhdM = useMemo(
    () => groundElevationOf(model.buildings),
    [model.buildings],
  );

  const { built, unresolved } = useMemo(() => {
    const ok = model.buildings.filter((b) => b.readyFor3d);
    const bad = model.buildings.filter((b) => !b.readyFor3d);
    return {
      built: mergeMassings(ok, groundAhdM),
      unresolved: mergeMassings(bad, groundAhdM),
    };
  }, [model.buildings, groundAhdM]);

  return (
    <group>
      {/* The blocks between the streets, dissolving where the data ends. */}
      <Ground model={model} groundAhdM={groundAhdM} onPick={onPickReceptor} />

      <OpenSpace groundAhdM={groundAhdM} />

      <Roads model={model} groundAhdM={groundAhdM} />

      {receptor && <ReceptorMarker point={receptor} groundAhdM={groundAhdM} />}

      {built && (
        <mesh castShadow receiveShadow geometry={built}>
          <meshStandardMaterial color="#eeedf0" roughness={0.82} metalness={0} />
        </mesh>
      )}

      {/*
        Rows whose two height columns disagree. Shown in a muted tone rather
        than removed: a building taken out of the scene casts no shadow, and
        an absent shadow reads to a resident as sunlight.
      */}
      {unresolved && (
        <mesh castShadow receiveShadow geometry={unresolved}>
          <meshStandardMaterial color="#d9d5cf" roughness={0.95} metalness={0} />
        </mesh>
      )}

      {showProposed && (
        <DevelopmentMassings
          developments={model.developments}
          focus={focus}
          groundAhdM={groundAhdM}
          showAll={showAllProposals}
          interactive={interactive}
          onSelect={onSelectDevelopment}
        />
      )}
    </group>
  );
}

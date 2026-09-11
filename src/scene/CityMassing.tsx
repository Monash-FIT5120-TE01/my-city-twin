import { useEffect, useMemo } from 'react';
import type { CityModel, Development } from '../data/model';
import { groundElevationOf, mergeMassings } from './massing';
import { buildingCentres, buildingsUnder } from '../data/replaces';
import { groundPlacement } from './basemap';
import { useBasemapTexture } from './useBasemap';
import { useMapboxConfig } from '../data/mapboxConfig';
import { Roads } from './Roads';
import { Ground } from './Ground';
import { DevelopmentMassings } from './DevelopmentMassings';
import { ReceptorMarker } from './ReceptorMarker';
import { OpenSpace } from './OpenSpace';
import { HighlightedBuilding } from './HighlightedBuilding';

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
  /** A building found by searching, drawn in pink. */
  highlightedBuildingId: string | null;
  /**
   * Whether that building is standing.
   *
   * It is already lifted out of the welded city (see below), so switching
   * this off simply does not draw it — and the city is then genuinely
   * without it, shadow included. That is the before/after for an existing
   * building, and it costs nothing extra because the removal was already
   * happening for the highlight.
   */
  showHighlighted: boolean;
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
  highlightedBuildingId,
  showHighlighted,
}: CityMassingProps) {
  const groundAhdM = useMemo(
    () => groundElevationOf(model.buildings),
    [model.buildings],
  );

  /*
    * Keyed on the numbers, not on the object. The model is rebuilt when the
    * live API answers, and its extent is then a NEW object holding the SAME
    * four values — which changed the placement by identity, restarted the
    * image request, and took the map off the screen while an image it already
    * had was fetched again.
    */
  const { minE, minN, maxE, maxN } = model.extent;
  const { placement } = useMemo(
    () => groundPlacement({ minE, minN, maxE, maxN }),
    [minE, minN, maxE, maxN],
  );
  const mapbox = useMapboxConfig();
  const basemap = useBasemapTexture(placement, mapbox);

  /** Every building centre, once, so the sites can be looked up cheaply. */
  const centres = useMemo(() => buildingCentres(model.buildings), [model.buildings]);

  /*
   * The buildings a visible proposal is built over.
   *
   * Only the proposals actually on screen: the sunlight screen draws one, and
   * taking down the city under the other 48 would empty streets that nothing
   * on screen explains. With proposals switched off entirely the set is
   * empty, which is what makes the toggle a genuine before and after rather
   * than "the city" against "the city plus a tower standing inside it".
   */
  const replaced = useMemo(() => {
    if (!showProposed) return new Set<string>();
    const shown = showAllProposals ? model.developments : focus ? [focus] : [];
    return new Set(
      shown.flatMap((development) =>
        buildingsUnder(
          development.parts.map((part) => part.footprint).flat(),
          centres,
        ),
      ),
    );
  }, [showProposed, showAllProposals, model.developments, focus, centres]);

  const { built, unresolved } = useMemo(() => {
    /*
     * Two reasons a building is left out of the welded city, and they are the
     * same reason: something else is standing in its place.
     *
     * The highlighted one is drawn separately below — inside the merged
     * object it would show through the pink one. A replaced one is not drawn
     * at all, because the proposal above it is what the plan puts there.
     */
    const inCity = (b: (typeof model.buildings)[number]) =>
      b.parentId !== highlightedBuildingId && !replaced.has(b.parentId);
    const ok = model.buildings.filter((b) => b.readyFor3d && inCity(b));
    const bad = model.buildings.filter((b) => !b.readyFor3d && inCity(b));
    return {
      built: mergeMassings(ok, groundAhdM),
      unresolved: mergeMassings(bad, groundAhdM),
    };
  }, [model.buildings, groundAhdM, highlightedBuildingId, replaced]);

  /*
   * The merged city is rebuilt whenever a proposal is shown or hidden, and
   * react-three-fiber replaces the `geometry` property without disposing the
   * previous one. This mesh is the whole ready-built city — about 23 MiB of
   * vertex attributes — so toggling the layer a few times used to cost that
   * much GPU memory each time, with nothing left holding it.
   */
  useEffect(
    () => () => {
      built?.dispose();
      unresolved?.dispose();
    },
    [built, unresolved],
  );

  return (
    <group>
      {/* The blocks between the streets, dissolving where the data ends. */}
      <Ground
        model={model}
        groundAhdM={groundAhdM}
        basemap={basemap}
        onPick={onPickReceptor}
      />

      <OpenSpace groundAhdM={groundAhdM} />

      {/*
        The inferred carriageways stand down once a real map is under the
        city, because the map draws the same streets from surveyed data and
        these were reasoned out from 133 addresses. Measured against the map
        they are visibly out of place, worst beyond the building data, where
        there was nothing to subtract and the whole 30-metre band survives as
        guesswork.

        Not deleted, because they are still the right answer when there is no
        map: a token that has expired, a browser with no network, or a frozen
        release long after this term. The fallback and the layer it falls back
        to are the same decision, which is why the texture is loaded up here.
      */}
      {!basemap && <Roads groundAhdM={groundAhdM} />}

      {/*
        Not when the plan demolishes it. The merged city already drops a
        replaced building; drawing it again here as the search highlight put
        it straight back inside the proposal, both solids casting shadow.
      */}
      {showHighlighted && !(highlightedBuildingId && replaced.has(highlightedBuildingId)) && (
        <HighlightedBuilding
          buildings={model.buildings}
          buildingId={highlightedBuildingId}
          groundAhdM={groundAhdM}
        />
      )}

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

import { useEffect, useMemo, useRef, useState } from 'react';
import { Mesh as MeshClass, type Group, type Mesh, type Plane } from 'three';
import type { ThreeEvent } from '@react-three/fiber';
import type { CityModel, Development } from '../data/model';
import { mergeMassings, mergeMassingsOwned, ownerAt } from './massing';
import { ownedRaycast } from './ownedRaycast';
import { terrainOf } from './terrain';
import { RoofCheck } from './RoofCheck';
import { SolarOnRoof } from './SolarOnRoof';
import type { SolarScene } from './useSolarComparison';
import { roofCheckOn } from './roofParts';
import { buildingCentres, buildingsUnder } from '../data/replaces';
import { groundPlacement } from './basemap';
import { useBasemapTexture } from './useBasemap';
import { useMapboxConfig } from '../data/mapboxConfig';
import { Roads } from './Roads';
import { Ground } from './Ground';
import { HazeVeil } from './HazeVeil';
import { DevelopmentMassings } from './DevelopmentMassings';
import { ReceptorMarker } from './ReceptorMarker';
import { WindowMarker } from './WindowMarker';
import { Streetscape } from './streetscape/Streetscape';
import type { SimulationDate } from './solar';
import { OpenSpace } from './OpenSpace';
import { HighlightedBuilding } from './HighlightedBuilding';
import { ApartmentRoom } from './room/ApartmentRoom';
import type { RoomPlacement } from './room/roomPlacement';
import { BuildingPicker } from './BuildingPicker';
import { EXISTING, EXISTING_SAFE, HOVER_GLOW, HOVER_LIT, UNRESOLVED, UNRESOLVED_SAFE } from './palette';
import { useDisplay } from '../settings/display';

interface CityMassingProps {
  model: CityModel;
  /** The development being examined. Its parts render as the proposal. */
  focus: Development | null;
  /** False shows the city as built; true adds the approved massing. */
  showProposed: boolean;
  /** True everywhere except the sunlight screen, which wants one shadow. */
  showAllProposals: boolean;
  onSelectDevelopment: (development: Development) => void;
  /**
   * A double click on a building standing today, by its id. Undefined where
   * buildings are not to be opened — see BuildingPicker.
   */
  onSelectBuilding?: (buildingId: string) => void;
  /**
   * In a headset, while the menu is asking for a building (to look out from one of its flats): one pull
   * of the trigger on a building standing today, by its id. Undefined the rest of the time, when the beam
   * passes over the city without testing it.
   */
  onPickBuildingInVr?: (buildingId: string) => void;
  /** The spot being measured, if one has been picked. */
  receptor: [number, number] | null;
  /**
   * The window being measured, if the reader has chosen one. Drawn here
   * because it belongs to the city rather than to the ground -- it stands on
   * a facade, and CityMassing is what draws facades.
   */
  windowAt?: { en: [number, number]; ahdM: number; facingDeg: number } | null;
  onPickReceptor?: (point: [number, number]) => void;
  /** A building found by searching, drawn in pink. */
  highlightedBuildingId: string | null;
  /** The solar panel check for that building, drawn on its roof. */
  solar?: SolarScene | null;
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
  /** What the ground dissolves into far away — see sky.ts. */
  haze: string;
  /** Street and feature lights glowing (after sunset, if the visitor has them on). */
  lampsLit?: boolean;
  /** The page's date and time: the trams run to that day's timetable while walking. */
  clock?: { date: SimulationDate; minutes: number };
  /** Standing in the street on foot or in a headset: the trams run. Defaults to `walking`. */
  streetTrams?: boolean;
  /** The low graphics setting: the street furniture drawn as near as on a phone (Streetscape). */
  lowDetail?: boolean;
  /** Standing in the street rather than looking down at it. */
  walking: boolean;
  /**
   * Inside the flat (room/): where it is, and the planes that cut its space out of the building. Only
   * while the reader is in it — from above the building is whole.
   */
  room?: { placement: RoomPlacement; cut: Plane[]; night: number; onReady?: () => void; onFailed?: () => void } | null;
}

/**
 * The built city, plus the proposal when it is switched on.
 *
 * Three merged meshes, split by what the colour has to say: built form, form
 * we could not reconcile, and the proposal. The palette is the one from the
 * design (palette.ts) — a warm cream city, so the teal and orange projects
 * are the only things that carry strong colour, and the eye goes straight to
 * what changed.
 */
export function CityMassing({
  model,
  focus,
  showProposed,
  showAllProposals,
  onSelectDevelopment,
  onSelectBuilding,
  onPickBuildingInVr,
  receptor,
  windowAt,
  onPickReceptor,
  interactive,
  highlightedBuildingId,
  solar = null,
  showHighlighted,
  haze,
  walking,
  lampsLit = false,
  clock,
  streetTrams,
  lowDetail = false,
  room = null,
}: CityMassingProps) {
  const roofCheck = useMemo(() => roofCheckOn(), []);
  // the colour-blind friendly set of colours, if the reader has asked for it (settings/display.ts)
  const { colourSafe } = useDisplay();

  // the ground at its real heights (terrain.ts): the surface, and the foot of every building
  const terrain = useMemo(() => terrainOf(model), [model]);
  /*
   * The building under the mouse pointer (BuildingPicker), drawn lit over the welded city, so the one a
   * double click would open is seen first (decided 2026-10-20). Its parts only, made when the
   * pointer moves onto another building.
   */
  const [hovered, setHovered] = useState<string | null>(null);
  const hoverParts = useMemo(
    () => (!hovered || hovered === highlightedBuildingId ? null : model.buildings.filter((part) => part.parentId === hovered)),
    [hovered, highlightedBuildingId, model.buildings],
  );
  const hoverGeometry = useMemo(() => (hoverParts ? mergeMassings(hoverParts, terrain) : null), [hoverParts, terrain]);
  useEffect(() => () => hoverGeometry?.dispose(), [hoverGeometry]);

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
  /*
   * Where the distance haze runs. It has to finish at or beyond the ground's
   * own rim, or a ring of un-hazed ground shows past it against the sky.
   */
  const hazeExtent = useMemo(() => {
    const { centreE, centreN, span, size } = groundPlacement(model.extent);
    return { centreE, centreN, innerM: span * 0.62, outerM: size * 0.5 };
  }, [model.extent]);

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

  // the development check's roofs (?roofs): the buildings standing, and the planned ones on show
  const roofBuildings = useMemo(() => model.buildings.filter((b) => !replaced.has(b.parentId)), [model.buildings, replaced]);
  const roofDevelopments = useMemo(
    () => (showProposed ? (showAllProposals ? model.developments : focus ? [focus] : []).flatMap((d) => d.parts) : []),
    [showProposed, showAllProposals, model.developments, focus],
  );

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
      built: mergeMassingsOwned(ok, terrain),
      unresolved: mergeMassingsOwned(bad, terrain),
    };
  }, [model.buildings, terrain, highlightedBuildingId, replaced]);

  /** What BuildingPicker casts its ray at, and what can stand in front. */
  const builtMesh = useRef<Mesh>(null);
  const unresolvedMesh = useRef<Mesh>(null);
  const highlightGroup = useRef<Group>(null);
  const projectsGroup = useRef<Group>(null);

  /*
   * The headset's beam choosing a building: the merged meshes take the trigger only while it is, and are
   * tested by building box first (ownedRaycast.ts), not triangle by triangle as three does it.
   */
  // the handler read through a ref, so App's new function on every render does not re-arm the meshes
  const pickInVrRef = useRef(onPickBuildingInVr);
  useEffect(() => {
    pickInVrRef.current = onPickBuildingInVr;
  });
  const picking = onPickBuildingInVr !== undefined;
  useEffect(() => {
    if (!picking) return;
    const parts = [
      { mesh: builtMesh.current, owned: built },
      { mesh: unresolvedMesh.current, owned: unresolved },
    ];
    for (const { mesh, owned } of parts) if (mesh && owned) mesh.raycast = ownedRaycast(mesh, owned);
    return () => {
      for (const { mesh } of parts) if (mesh) mesh.raycast = MeshClass.prototype.raycast;
    };
  }, [picking, built, unresolved]);
  const pickOn = (owned: typeof built) =>
    picking && owned
      ? (event: ThreeEvent<MouseEvent>) => {
          event.stopPropagation();
          if (event.faceIndex == null) return;
          const owner = ownerAt(owned, event.faceIndex);
          if (owner) pickInVrRef.current?.(owner.parentId);
        }
      : undefined;

  /*
   * The merged city is rebuilt whenever a proposal is shown or hidden, and
   * react-three-fiber replaces the `geometry` property without disposing the
   * previous one. This mesh is the whole ready-built city — about 23 MiB of
   * vertex attributes — so toggling the layer a few times used to cost that
   * much GPU memory each time, with nothing left holding it.
   */
  useEffect(
    () => () => {
      built?.geometry.dispose();
      unresolved?.geometry.dispose();
    },
    [built, unresolved],
  );

  return (
    <group>
      {/* The blocks between the streets, dissolving where the data ends. */}
      <Ground
        model={model}
        terrain={terrain}
        basemap={basemap}
        walking={walking}
        onPick={onPickReceptor}
      />

      {/*
        Parks and squares, laid on the ground. The haze below goes over them
        too, so a park or a road at the far edge dissolves with the ground
        rather than staying sharp inside a fading surround.
      */}
      <OpenSpace groundAhdM={terrain} />

      {/*
        The street level from open data: surfaces, trees, lights, signals, tram infrastructure and street
        furniture. It draws the real road outlines, so the inferred roads below are only the fallback for
        where it has nothing; see streetscape/Streetscape.tsx.
      */}
      <Streetscape groundAhdM={terrain} lampsLit={lampsLit} walking={streetTrams ?? walking} clock={clock} lowDetail={lowDetail} />

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
      {!basemap && <Roads groundAhdM={terrain} />}

      {/*
        Not when the plan demolishes it. The merged city already drops a
        replaced building; drawing it again here as the search highlight put
        it straight back inside the proposal, both solids casting shadow.
      */}
      {showHighlighted && !(highlightedBuildingId && replaced.has(highlightedBuildingId)) && (
        <group
          ref={highlightGroup}
          /*
           * The building already chosen is drawn apart from the merged city, so the beam would go through
           * it to the one behind: it answers the trigger itself (review, 2026-10-19).
           */
          onClick={
            picking && highlightedBuildingId
              ? (event) => {
                  event.stopPropagation();
                  pickInVrRef.current?.(highlightedBuildingId);
                }
              : undefined
          }
        >
          <HighlightedBuilding
            buildings={model.buildings}
            buildingId={highlightedBuildingId}
            groundAhdM={terrain}
            roomCut={room?.cut ?? null}
          />
        </group>
      )}
      {room && <ApartmentRoom placement={room.placement} night={room.night} onReady={room.onReady} onFailed={room.onFailed} />}

      {/* the measuring marks are for looking at the city from above: not in the view from the flat */}
      {receptor && !room && <ReceptorMarker point={receptor} groundAhdM={terrain} />}
      {windowAt && !room && (
        <WindowMarker en={windowAt.en} ahdM={windowAt.ahdM} facingDeg={windowAt.facingDeg} />
      )}

      {/* development only: the solar study's roofs in red (?roofs) */}
      {roofCheck && <RoofCheck buildings={roofBuildings} developments={roofDevelopments} />}
      {solar && <SolarOnRoof view={solar} />}

      {hoverGeometry && (
        <mesh geometry={hoverGeometry} renderOrder={1}>
          {/* drawn over the same faces of the welded city: pulled forward a little, so it wins */}
          <meshStandardMaterial
            color={HOVER_LIT}
            emissive={HOVER_LIT}
            emissiveIntensity={HOVER_GLOW}
            roughness={0.7}
            metalness={0}
            polygonOffset
            polygonOffsetFactor={-1}
            polygonOffsetUnits={-1}
          />
        </mesh>
      )}

      {built && (
        <mesh ref={builtMesh} castShadow receiveShadow geometry={built.geometry} onClick={pickOn(built)}>
          <meshStandardMaterial color={colourSafe ? EXISTING_SAFE : EXISTING} roughness={0.82} metalness={0} />
        </mesh>
      )}

      {/*
        Rows whose two height columns disagree. Shown in a muted tone rather
        than removed: a building taken out of the scene casts no shadow, and
        an absent shadow reads to a resident as sunlight.
      */}
      {unresolved && (
        <mesh ref={unresolvedMesh} castShadow receiveShadow geometry={unresolved.geometry} onClick={pickOn(unresolved)}>
          <meshStandardMaterial color={colourSafe ? UNRESOLVED_SAFE : UNRESOLVED} roughness={0.95} metalness={0} />
        </mesh>
      )}

      {/*
        Not while walking.

        It is a horizontal sheet a metre above the ground, and the eye is
        only 1.7 m up — so from a footpath the line of sight runs ALONG it
        and out through its opaque outer region, washing everything below the
        horizon to the haze colour. From above, where it hides the edge of
        the modelled ground, it works; at eye height it is a fog bank lying
        on the city.

        Nothing is lost by dropping it here. The disc's rim is only visible
        from height, and past it the sky dome's lower hemisphere is already
        painted the same haze.
      */}
      {!walking && (
      <HazeVeil
        centreE={hazeExtent.centreE}
        centreN={hazeExtent.centreN}
        groundAhdM={terrain}
        innerM={hazeExtent.innerM}
        outerM={hazeExtent.outerM}
        colour={haze}
      />
      )}

      {showProposed && (
        <group ref={projectsGroup}>
          <DevelopmentMassings
            developments={model.developments}
            focus={focus}
            groundAhdM={terrain}
            showAll={showAllProposals}
            interactive={interactive}
            onSelect={onSelectDevelopment}
          />
        </group>
      )}

      <BuildingPicker
        city={[
          { mesh: builtMesh, owned: built },
          { mesh: unresolvedMesh, owned: unresolved },
        ]}
        blockers={projectsGroup}
        highlighted={{ object: highlightGroup, id: highlightedBuildingId }}
        onHover={setHovered}
        onSelect={interactive && !walking && !room ? onSelectBuilding : undefined}
      />
    </group>
  );
}

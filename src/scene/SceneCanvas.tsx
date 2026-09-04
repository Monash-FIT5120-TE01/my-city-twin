/*
 * ─────────────────────────────────────────────────────────────────────────
 * THE 3D VIEW
 * ─────────────────────────────────────────────────────────────────────────
 *
 * WHAT THIS FILE IS
 *   The canvas and everything in it: the camera, the lights, the city, the
 *   labels and the controls. Above it is App, which decides what is true;
 *   below it are the pieces that each draw one thing.
 *
 * THE THREE LIGHTS, AND WHAT EACH IS FOR
 *
 *   directional   the sun. The only one that casts a shadow, and the only
 *                 one whose direction is computed rather than chosen.
 *   hemisphere    the sky above and the pavement below, cool and warm. This
 *                 is what stops a white city collapsing into flat grey once
 *                 the sun is low and most surfaces see only sky.
 *   ambient       a small even fill so nothing is pure black.
 *
 * THE CAMERA
 *   A high oblique from the south-east, about 38° above the horizon, at a
 *   distance scaled to the height of whatever is being examined so it fills
 *   roughly two-thirds of the frame. The field of view is 30° rather than
 *   the usual 50, which flattens the perspective — the Figma views look
 *   like that, and it keeps tall buildings from leaning outwards.
 *
 * WHAT THE SHADOW CAMERA HAS TO COVER
 *   Shadows are drawn by rendering the scene once from the sun's point of
 *   view, into a square box. Anything outside that box casts nothing. The
 *   box therefore has to hold the WHOLE city, centred on the city, and be
 *   sized to half its three-dimensional diagonal — not the flat one, because
 *   a low sun swings the city's 270 m of height sideways into the box. Sized
 *   from the flat diagonal, winter afternoon shadows were cut off mid-street,
 *   which is precisely the case this product exists to show.
 *
 * THE ONE ODDITY
 *   Street names and the site pin are rendered OUTSIDE <WorldFrame>, unlike
 *   everything else. They are HTML rather than 3D objects, and the browser's
 *   own 3D transform does not survive being nested inside the frame's
 *   rotation. Each converts its own position instead; see StreetLabels.
 */

import { useMemo } from 'react';
import { Canvas } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import { ACESFilmicToneMapping, MOUSE } from 'three';
import { WorldFrame } from './WorldFrame';
import { SunLight } from './SunLight';
import { CityMassing } from './CityMassing';
import { StreetLabels } from './StreetLabels';
import { SiteMarker, type SiteMarkerSubject } from './SiteMarker';
import { SunArrow } from './SunArrow';
import { groundElevationOf } from './massing';
import { enuToWorld } from './frame';
import type { SunAngles } from './sun';
import type { CityModel, Development } from '../data/model';

interface SceneCanvasProps {
  model: CityModel;
  focus: Development | null;
  sun: SunAngles;
  showProposed: boolean;
  castShadows: boolean;
  /** The ground arrow showing which way the light travels. */
  showSunArrow: boolean;
  /** True everywhere except the sunlight screen, which wants one shadow. */
  showAllProposals: boolean;
  onSelectDevelopment: (development: Development) => void;
  receptor: [number, number] | null;
  onPickReceptor?: (point: [number, number]) => void;
  /** False in focus mode. */
  interactive: boolean;
  /** A building found by searching, drawn in pink. */
  highlightedBuildingId: string | null;
  /** False to take that building out of the city — the "before" of a search. */
  showHighlighted: boolean;
  /** The one place that carries a pin and a name, or none. */
  marker: SiteMarkerSubject | null;
  /**
   * Where to point the camera, if not at the focused development — used when
   * a search result is an existing building rather than a proposal.
   */
  lookAt: { east: number; north: number; heightM: number } | null;
}

export function SceneCanvas({
  model,
  focus,
  sun,
  showProposed,
  castShadows,
  showSunArrow,
  showAllProposals,
  onSelectDevelopment,
  receptor,
  onPickReceptor,
  interactive,
  highlightedBuildingId,
  showHighlighted,
  marker,
  lookAt,
}: SceneCanvasProps) {
  const ground = useMemo(() => groundElevationOf(model.buildings), [model.buildings]);

  /*
   * Frame on whatever was last asked for: a searched building if there is
   * one, otherwise the development under examination — and if neither, the
   * whole grid.
   *
   * That last case is the opening shot. Pointing at a particular tower
   * instead would single out a building nobody asked about, which is a claim
   * the page has no business making before anyone has chosen anything.
   */
  const wholeCity = !lookAt && !focus;
  const [targetE, targetN] = lookAt
    ? [lookAt.east, lookAt.north]
    : focus
      ? focus.anchorEN
      : [
          (model.extent.minE + model.extent.maxE) / 2,
          (model.extent.minN + model.extent.maxN) / 2,
        ];

  /*
   * The camera and the orbit target live outside <WorldFrame>, so they are
   * stated in east/north/up and converted once, here.
   *
   * A high oblique looking from the south-east, matching the Figma: about 38°
   * above the horizon, far enough back that the tallest thing on screen fills
   * roughly two-thirds of the frame at a 30° field of view.
   */
  const subjectHeight = lookAt ? Math.max(40, lookAt.heightM) : focus ? focus.maxHeightM : 120;

  /*
   * How far back to stand.
   *
   * For a single building, a little over three times its height fills about
   * two thirds of the frame. For the whole city the subject is the grid
   * itself, so the distance comes from its width and the lens: at a 30°
   * vertical field of view on a typical wide window, standing back by about
   * 1.2 times the widest span brings the far corners inside the frame.
   */
  const citySpan = Math.max(
    model.extent.maxE - model.extent.minE,
    model.extent.maxN - model.extent.minN,
  );
  const eye = wholeCity
    ? citySpan * 1.2
    : Math.max(430, subjectHeight * 3.1);
  const ELEVATION = 38 * (Math.PI / 180);
  const BEARING = 150 * (Math.PI / 180);
  const horizontal = Math.cos(ELEVATION);
  // Both the camera and what it looks at are measured from the same height,
  // so ELEVATION really is the angle between them. Placing the camera above
  // `ground` while aiming a third of the way up the tower would flatten the
  // view by several degrees, and by a different amount for every subject.
  // Looking at the whole grid, aim at the ground rather than a third of the
  // way up something — there is no something.
  const targetUp = wholeCity ? ground : ground + subjectHeight * 0.35;
  const cameraPosition = enuToWorld([
    targetE + eye * horizontal * Math.sin(BEARING),
    targetN + eye * horizontal * Math.cos(BEARING),
    targetUp + eye * Math.sin(ELEVATION),
  ]);
  const orbitTarget = enuToWorld([targetE, targetN, targetUp]);

  /*
   * The shadow camera covers the WHOLE city, centred on the city — not on
   * whatever is being examined.
   *
   * Two failures this avoids. Centring on the focus and sizing to half the
   * city span leaves the far side of the grid outside the frustum, so those
   * buildings stop casting. And because the frustum is oriented along the
   * light, a low sun swings the scene's 270 m of height into the lateral
   * axis — the extent therefore has to cover half the 3D diagonal, not half
   * the plan diagonal, or winter afternoon shadows are clipped mid-street.
   */
  const shadow = useMemo(() => {
    const { minE, minN, maxE, maxN } = model.extent;

    // A loop rather than Math.max(...array): spreading 4,443 values as
    // arguments works today but is bounded by an engine limit that has
    // nothing to do with this data.
    let height = 1;
    for (const building of model.buildings) {
      height = Math.max(height, building.topAhdM - ground);
    }
    for (const development of model.developments) {
      height = Math.max(height, development.topAhdM - ground);
    }

    const halfDiagonal = Math.hypot(maxE - minE, maxN - minN, height) / 2;
    return {
      // Half the 3D diagonal only encloses the city when it is measured from
      // the middle of it. Centred on the ground instead, the top corners fall
      // outside the fit and the tallest towers stop casting for some sun
      // directions — the very ones the product is about.
      centre: [(minE + maxE) / 2, (minN + maxN) / 2, ground + height / 2] as [
        number,
        number,
        number,
      ],
      extentM: halfDiagonal * 1.05,
    };
  }, [model.extent, model.buildings, model.developments, ground]);

  return (
    <Canvas
      // Explicit rather than `shadows` — the default soft map is deprecated
      // in three 0.185 and silently falls back to this one anyway.
      shadows="percentage"
      dpr={[1, 2]}
      // The Figma views are high obliques with little perspective distortion,
      // so a long lens rather than the 50° default.
      camera={{ position: cameraPosition, fov: 30, near: 5, far: 20000 }}
      gl={{ antialias: true, toneMapping: ACESFilmicToneMapping }}
    >
      <color attach="background" args={['#ededea']} />

      {/*
        Sky and bounce. Direction-free, so they sit outside the world frame.
        Cool from above, warm from the pavement — the pairing is what stops a
        white city reading as flat grey once the sun is low and most surfaces
        are lit by the sky alone.
      */}
      <hemisphereLight args={['#dce7f0', '#d8cfc0', 1.35]} />
      <ambientLight intensity={0.22} />

      <WorldFrame>
        <SunLight
          angles={sun}
          extentM={shadow.extentM}
          centre={shadow.centre}
          castShadows={castShadows}
        />
        <CityMassing
          model={model}
          focus={focus}
          showProposed={showProposed}
          showAllProposals={showAllProposals}
          onSelectDevelopment={onSelectDevelopment}
          receptor={receptor}
          onPickReceptor={onPickReceptor}
          interactive={interactive}
          highlightedBuildingId={highlightedBuildingId}
          showHighlighted={showHighlighted}
        />

        {/* In the world frame, so it points at the city rather than the screen. */}
        {/*
          On whatever the camera is framing — the focused proposal, or a
          searched building. Reading `focus` alone put the arrow back on a
          proposal while the screen was about a building; targetE/targetN are
          already "the subject", whichever kind it is.
        */}
        {showSunArrow && !wholeCity && (
          <SunArrow
            sun={sun}
            anchorEN={[targetE, targetN]}
            groundAhdM={ground}
            heightM={subjectHeight}
          />
        )}
      </WorldFrame>

      {/*
        Outside the world frame on purpose — see StreetLabels for why CSS3D
        cannot inherit that rotation and still land the right way up.
      */}
      <StreetLabels initialEast={targetE} initialNorth={targetN} groundAhdM={ground} />

      {/*
        One marker, on whatever is chosen. A proposal only carries one while
        the approved massing is actually being shown; a searched building
        always does, because it is there either way.
      */}
      {marker && (marker.kind === 'building' || showProposed) && (
        <SiteMarker subject={marker} groundAhdM={ground} />
      )}

      <OrbitControls
        makeDefault
        target={orbitTarget}
        enablePan
        minDistance={120}
        maxDistance={Math.max(4000, citySpan * 1.6)}
        // Never let the camera drop below the ground plane.
        maxPolarAngle={Math.PI / 2.15}
        // Swapped from the three.js default: left drag pans, right drag
        // orbits. Touch is left alone — one finger still orbits.
        mouseButtons={{
          LEFT: MOUSE.PAN,
          MIDDLE: MOUSE.DOLLY,
          RIGHT: MOUSE.ROTATE,
        }}
      />
    </Canvas>
  );
}

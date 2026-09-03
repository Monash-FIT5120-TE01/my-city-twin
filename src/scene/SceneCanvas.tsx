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
import { SiteLabel } from './SiteLabel';
import { SitePin } from './SitePin';
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
}: SceneCanvasProps) {
  const ground = useMemo(() => groundElevationOf(model.buildings), [model.buildings]);

  // Frame on the development under examination, or on the middle of the grid.
  const [targetE, targetN] = focus
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
  const subjectHeight = focus ? focus.maxHeightM : 120;
  const eye = Math.max(430, subjectHeight * 3.1);
  const ELEVATION = 38 * (Math.PI / 180);
  const BEARING = 150 * (Math.PI / 180);
  const horizontal = Math.cos(ELEVATION);
  // Both the camera and what it looks at are measured from the same height,
  // so ELEVATION really is the angle between them. Placing the camera above
  // `ground` while aiming a third of the way up the tower would flatten the
  // view by several degrees, and by a different amount for every subject.
  const targetUp = ground + subjectHeight * 0.35;
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
        />

        {/* In the world frame, so it points at the city rather than the screen. */}
        {showSunArrow && focus && (
          <SunArrow
            sun={sun}
            anchorEN={focus.anchorEN}
            groundAhdM={ground}
            heightM={focus.maxHeightM}
          />
        )}
      </WorldFrame>

      {/*
        Outside the world frame on purpose — see StreetLabels for why CSS3D
        cannot inherit that rotation and still land the right way up.
      */}
      <StreetLabels initialEast={targetE} initialNorth={targetN} groundAhdM={ground} />

      {focus && showProposed && (
        <>
          <SitePin development={focus} />
          <SiteLabel development={focus} groundAhdM={ground} />
        </>
      )}

      <OrbitControls
        makeDefault
        target={orbitTarget}
        enablePan
        minDistance={120}
        maxDistance={4000}
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

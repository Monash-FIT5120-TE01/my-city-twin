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
 * WHAT IT DOES, IN ORDER
 *   - Frames the subject: a searched building, the proposal in focus, or
 *     the whole grid — and the descent onto it on the city's first moment.
 *   - Works out where a walker is put down, and the city as drawn for them
 *     to collide with.
 *   - Decides who drives the camera: OrbitControls and CameraRig on a
 *     desktop, StreetView in the street, the headset in VR.
 *   - Sizes the shadow camera to the whole city.
 *   - Draws the sky, the lights, the city, the sun arrow, the street names
 *     and the site pin.
 *   - Shifts the lens into the front page's window (ViewInset).
 *   - Hosts the headset's walk and panel when a session is running.
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
 *   the usual 50, which flattens the perspective — the design views look
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

import { Suspense, lazy, useEffect, useMemo, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { XR } from '@react-three/xr';
import { OrbitControls } from '@react-three/drei';
import { ACESFilmicToneMapping, MOUSE } from 'three';
import { WorldFrame } from './WorldFrame';
import { SunLight } from './SunLight';
import { SkyDome } from './SkyDome';
import { EYE_HEIGHT_M, StreetView } from './StreetView';
import { indexObstacles, nearestFree } from './obstacles';
import { buildingCentres, buildingsUnder } from '../data/replaces';

/** Tells the interface, once, how far the viewpoint had to move. */
function useStandNotice(
  walking: boolean,
  metres: number,
  report: (metres: number) => void,
): void {
  useEffect(() => {
    if (walking) report(metres);
  }, [walking, metres, report]);
}
import { ScaleFigure } from './ScaleFigure';
import { skyAppearance } from './sky';
import { CityMassing } from './CityMassing';
import { StreetLabels } from './StreetLabels';
import { SiteMarker, type SiteMarkerSubject } from './SiteMarker';
import { SunArrow } from './SunArrow';
import { CameraRig } from './CameraRig';
import { VrWalk } from './VrWalk';
import { overlookFor, streetPlacement } from './vrPlacement';
import type { VrMenu, VrStage } from './vrMenu';
import { ViewControlsBridge, type ViewControlsRef } from './ViewControls';
import { exitVr, xrStore } from './xrStore';
import { useReducedMotion } from '../ui/useReducedMotion';

/*
 * The headset's panel and platform, fetched only once a session starts. They
 * bring a layout engine and a font atlas that a desktop never uses — see the
 * header of VrPanel.tsx.
 */
const VrFurniture = lazy(() => import('./VrPanel'));
import { groundElevationOf } from './massing';
import { enuToWorld } from './frame';
import { ViewInset, type ScreenInset } from './ViewInset';
import { ViewLink } from './ViewLink';
import type { CameraLink } from './cameraLink';
import type { SunAngles } from './sun';
import type { CityModel, Development } from '../data/model';

interface SceneCanvasProps {
  model: CityModel;
  focus: Development | null;
  sun: SunAngles;
  /** The plans are in the city — the "after". False shows the city as it is. */
  showProposed: boolean;
  castShadows: boolean;
  /** The ground arrow showing which way the light travels. */
  showSunArrow: boolean;
  /** True everywhere except the sunlight screen, which wants one shadow. */
  showAllProposals: boolean;
  onSelectDevelopment: (development: Development) => void;
  /** A double click on a building standing today — see BuildingPicker. */
  onSelectBuilding?: (buildingId: string) => void;
  receptor: [number, number] | null;
  /** The window being measured, if one has been chosen. */
  windowAt?: { en: [number, number]; ahdM: number; facingDeg: number } | null;
  onPickReceptor?: (point: [number, number]) => void;
  /** False in focus mode. */
  interactive: boolean;
  /** Standing in the street rather than orbiting above it. */
  walking: boolean;
  /** The pointer lock ended — Escape, or a click outside. */
  onLeaveStreet: () => void;
  /**
   * The viewpoint had to be put down this far from the measured spot.
   *
   * Zero when it landed where it was asked to. Reported because the figures
   * stay at the original point: a viewpoint quietly moved up to 120 m away
   * implies a relationship to those numbers that it does not have.
   */
  onStandMoved: (metres: number) => void;
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
  /**
   * True for the city's first moment on the front page — hold the camera
   * back, high and far.
   *
   * The city appears in the front page's window once it has loaded. Holding
   * the first frame here and releasing it a moment later makes it arrive
   * rather than pop in. See the descent below, and `arrived` in App.
   */
  approach?: boolean;
  /**
   * The hour and the day, for the wrist readout in VR.
   *
   * Passed as finished strings rather than as numbers. Formatting them a
   * second time down here would be a second place for the app to decide what
   * a time looks like, and the two would drift.
   */
  timeLabel: string;
  dateLabel: string;
  /**
   * Move the clock, by whole minutes — A and B on the controller, held (see
   * VrWalk). The headset panel moves it too, through the same App handler,
   * but reaches it by way of `vrMenu` rather than this prop.
   */
  onNudgeMinutes: (minutes: number) => void;
  /** Over the city or in the street — meaningful only inside a headset. */
  vrStage: VrStage;
  /** Changes whenever the headset player should be moved. See VrWalk. */
  vrTrip: number;
  /** What the headset's panel shows and does. */
  vrMenu: VrMenu | null;
  /**
   * Filled in with the camera commands the zoom buttons outside the canvas
   * call. They are DOM and the camera is not; see ViewControls.
   */
  viewCommands?: ViewControlsRef;
  /** Bumped by "Frame the whole city". See CameraRig. */
  refit?: number;
  /**
   * How much of the canvas the front page covers — its words and steps — so
   * the city is framed in what is left. A box App writes into and ViewInset
   * reads every frame, not a value: it changes on every scroll event. See
   * ViewInset.
   */
  inset?: { current: ScreenInset | null };
  /**
   * No headset wrapper: for the second view on the comparison screen. The
   * XR store is one per page, and a second <XR> on it would fight the first
   * for every session.
   */
  noHeadset?: boolean;
  /** The comparison screen's shared camera, and which of the two views this is. */
  link?: { link: CameraLink; id: string; seed: 'publish' | 'adopt' } | null;
  /** Whether the front page — and so the window — is up. */
  insetOn?: boolean;
}

/** The canvas, the camera, the lights and the city — the whole 3D view. */
export function SceneCanvas({
  model,
  focus,
  sun,
  showProposed,
  castShadows,
  showSunArrow,
  showAllProposals,
  onSelectDevelopment,
  onSelectBuilding,
  receptor,
  windowAt,
  onPickReceptor,
  interactive,
  highlightedBuildingId,
  showHighlighted,
  marker,
  lookAt,
  walking,
  onLeaveStreet,
  onStandMoved,
  approach = false,
  viewCommands,
  refit,
  inset,
  insetOn = false,
  noHeadset = false,
  link = null,
  timeLabel,
  dateLabel,
  onNudgeMinutes,
  vrStage,
  vrTrip,
  vrMenu,
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
   * A high oblique looking from the south-east, matching the design: about 38°
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
  const settled = wholeCity
    ? citySpan * 1.2
    : Math.max(430, subjectHeight * 3.1);

  /*
   * ── THE DESCENT ─────────────────────────────────────────────────────────
   *
   * WHY IT EXISTS
   *   The city loads a few seconds after the front page is up, and without
   *   this it would simply pop into its window. It is the same objection
   *   CameraRig was written to answer for search, and the same answer:
   *   arrive somewhere rather than appear at it.
   *
   * HOW IT IS DONE
   *   Not with a new animation. For the first moment the camera is simply
   *   asked for a DIFFERENT frame — half again as far out, and steeper. Then
   *   that request changes back (App's `arrived`, a moment after the city
   *   loads), and CameraRig, which exists to notice exactly that, flies
   *   between the two on its own easing. No animation of its own, and
   *   interrupting it works because interrupting a flight already works.
   *
   * WHY THESE TWO NUMBERS
   *   Far enough to be a journey, near enough that the city is recognisable
   *   the whole way. Under it the reader can see where they are going before
   *   they get there, which is the point of moving at all rather than fading.
   *
   *   The steeper angle is what makes it read as coming DOWN. A dolly along
   *   the same line reads as a zoom, and a zoom is a lens doing something,
   *   not a person going somewhere.
   */
  const APPROACH_BACK = 1.5;
  const APPROACH_ELEVATION_DEG = 52;

  const eye = approach ? settled * APPROACH_BACK : settled;
  const ELEVATION = (approach ? APPROACH_ELEVATION_DEG : 38) * (Math.PI / 180);
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
   * ── THE WALKER ──────────────────────────────────────────────────────────
   *
   * Where the walker is put down. The measured spot if there is one — that
   * is a place the reader chose and asked a question about — and otherwise
   * whatever the camera was already framing.
   *
   * Memoised on the numbers. As a bare literal it was a new array on every
   * render, so the spiral search below ran again each time looking for the
   * same answer.
   */
  const standAt = useMemo<[number, number]>(
    () => receptor ?? [targetE, targetN],
    [receptor, targetE, targetN],
  );

  /*
   * What the walker collides with: the city as DRAWN, not as stored.
   *
   * Indexing every building meant the walker met invisible walls where a
   * proposal had demolished one, and walked through the proposal standing in
   * its place. The same filters CityMassing applies have to be applied here,
   * or collision describes a different city from the one on screen.
   *
   * Built for the city as shown, not once per entry: it depends only on the
   * buildings, what is shown of them, and the height a person stands at.
   */
  const obstacles = useMemo(() => {
    const centres = buildingCentres(model.buildings);
    const shown = showProposed
      ? showAllProposals
        ? model.developments
        : focus
          ? [focus]
          : []
      : [];
    const replaced = new Set(
      shown.flatMap((development) =>
        buildingsUnder(development.parts.map((part) => part.footprint).flat(), centres),
      ),
    );
    const hidden = !showHighlighted && highlightedBuildingId ? highlightedBuildingId : null;

    const standing = model.buildings.filter(
      (b) => !replaced.has(b.parentId) && b.parentId !== hidden,
    );
    // The proposal is solid too: it is what the plan puts there.
    const proposals = shown.flatMap((development) => development.parts);

    return indexObstacles([...standing, ...proposals], ground + EYE_HEIGHT_M);
  }, [
    model.buildings,
    model.developments,
    ground,
    showProposed,
    showAllProposals,
    focus,
    showHighlighted,
    highlightedBuildingId,
  ]);

  /*
   * Where the walker actually lands, resolved once here rather than twice.
   * The asked-for point can be inside the building the screen is about, and
   * with solid walls that is somewhere they could not get out of.
   */
  const standPoint = useMemo(
    () => nearestFree(obstacles, standAt[0], standAt[1]) ?? standAt,
    [obstacles, standAt],
  );

  /*
   * How far the reader was moved from the place they asked about. The
   * measurement stays where it was put; the viewpoint may not be able to.
   * Saying so is the difference between a viewpoint near the spot and a
   * silent substitution.
   */
  const standOffsetM = Math.hypot(standPoint[0] - standAt[0], standPoint[1] - standAt[1]);
  useStandNotice(walking, standOffsetM, onStandMoved);

  /* A few metres away, so it is in front of the reader rather than inside them. */
  const scaleAt = useMemo(
    () => nearestFree(obstacles, standPoint[0], standPoint[1] + 4) ?? standPoint,
    [obstacles, standPoint],
  );

  /*
   * The Canvas is told where the camera starts and then never again.
   *
   * Its `camera` prop is re-applied whenever it changes, which would snap the
   * camera to each new destination the instant it was chosen — the teleport
   * CameraRig exists to replace. Captured once, it sets the opening shot and
   * then stays out of the way while the rig does the moving.
   */
  const [openingShot] = useState(() => cameraPosition);

  const reducedMotion = useReducedMotion();

  /*
   * ── WHO OWNS THE CAMERA ─────────────────────────────────────────────────
   *
   * Exactly one thing may drive it, and in an immersive session that thing is
   * the headset. WebXR overwrites the camera from the device's own tracking
   * before every frame is drawn, so anything else writing to it is not merely
   * outvoted — it is invisible, and the code looks ignored rather than wrong.
   *
   * So both desktop drivers stand down: OrbitControls is disabled and gives
   * up `makeDefault`, CameraRig pauses, and StreetView — which sets the near
   * plane and the field of view, both of which belong to the device in VR —
   * is replaced by VrWalk rather than run alongside it.
   *
   * WHY THE STORE IS READ DIRECTLY RATHER THAN THROUGH useXR
   *   `useXR` has to be called under <XR>, which is inside this component's
   *   own output. Subscribing to the store instead answers the same question
   *   from out here, without splitting the scene into an inner component for
   *   one boolean. The store is a singleton for exactly this reason — see
   *   xrStore.ts.
   *
   *   No initial read: a session cannot already be running on the frame the
   *   canvas mounts, because nothing has been able to ask for one yet.
   */
  /*
   * The headset panel: up or away, and a count that brings it back in front
   * of the eyes. Up whenever a session starts, so the first thing a visitor
   * sees is what they can do — nobody should need to know about the X button
   * to begin. Raised by the store's own notice that a session has begun, in
   * the same listener that learns it.
   */
  const [panelShown, setPanelShown] = useState(true);
  /** Whether ViewInset has the lens off-centre at this moment. */
  const [lensShifted, setLensShifted] = useState(false);
  /** Bumped to bring the headset panel back in front of the eyes. */
  const [summon, setSummon] = useState(0);
  /** Moves that have landed, counted, so the panel can measure after them. */
  const [placed, setPlaced] = useState(0);
  /** Right-stick page turns, handed to the panel: a count and a direction. */
  const [flick, setFlick] = useState({ count: 0, direction: 0 as -1 | 0 | 1 });

  const [inVr, setInVr] = useState(false);
  /*
   * Not for a view without the headset wrapper (`noHeadset`). Told a session
   * had started, it would mount VrWalk — whose controller hooks need the
   * <XR> it deliberately does not have — and throw.
   */
  useEffect(
    () =>
      noHeadset
        ? undefined
        : xrStore().subscribe((state, previous) => {
            setInVr(state.session != null);
            if (state.session != null && previous.session == null) setPanelShown(true);
          }),
    [noHeadset],
  );
  const showPanel = () => {
    setPanelShown(true);
    setSummon((n) => n + 1);
  };
  const togglePanel = () => {
    if (panelShown) setPanelShown(false);
    else showPanel();
  };

  /*
   * Where a headset puts the player. Recomputed every render and read by
   * VrWalk only when `vrTrip` changes, so it always reflects the place and
   * the measured spot as they are at the moment a move is asked for.
   *
   * Above: the platform that looks at the subject, or at the whole city when
   * there is none. In the street: the same free spot the desktop walker is
   * put down on, facing the subject.
   */
  const vrPlacement =
    vrStage === 'street'
      ? streetPlacement(standPoint, [targetE, targetN], ground)
      : overlookFor([targetE, targetN], wholeCity ? null : subjectHeight, ground);

  /** The sky's colours and the fill lights' strengths for this sun height. */
  const sky = useMemo(() => skyAppearance(sun.altitudeDeg), [sun.altitudeDeg]);

  /*
   * ── THE SHADOW CAMERA ───────────────────────────────────────────────────
   *
   * It covers the WHOLE city, centred on the city — not on whatever is being
   * examined.
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
      // The design views are high obliques with little perspective distortion,
      // so a long lens rather than the 50° default.
      camera={{ position: openingShot, fov: 30, near: 5, far: 20000 }}
      gl={{ antialias: true, toneMapping: ACESFilmicToneMapping }}
    >
      {/*
        ── EVERYTHING, WITH A HEADSET OPTIONALLY ATTACHED ───────────────────

        <XR> does nothing at all until a session starts, so the scene inside
        it is unchanged on a desktop: same tree, same cost, same behaviour.
        When one does start it takes over the camera and the render loop, and
        the SAME city is what gets drawn — this is why the VR work is a
        wrapper and four small files rather than a second application.

        It is the outermost thing in the canvas because the sky, the lights
        and the world frame all have to be inside the session's render loop
        to appear in it.
      */}
      <HeadsetFrame on={!noHeadset}>
        {/*
          The clear colour is now the horizon, so the ground has something to
          dissolve INTO that agrees with the sky above it. Fixed at beige, the
          model sat on a pale card in front of a night sky.
        */}
        <color attach="background" args={[sky.haze]} />

        <SkyDome angles={sun} />

        {/*
          Sky and bounce. Direction-free, so they sit outside the world frame.
          Cool from above, warm from the pavement — the pairing is what stops a
          white city reading as flat grey once the sun is low and most surfaces
          are lit by the sky alone.

          Both now fall with the sun. Held at their daytime values the city
          stayed brightly lit under a night sky, which read as a rendering
          fault rather than as midnight.
        */}
        <hemisphereLight args={['#dce7f0', '#d8cfc0', sky.hemisphere]} />
        <ambientLight intensity={sky.ambient} />

        <WorldFrame>
          {/*
            Only while walking on a monitor. From above, the city's own extent
            is the scale — and in a headset the reader IS the scale reference,
            standing at their own height, which is better than any marker and
            makes this one a black box in the road for no reason.
          */}
          {walking && !inVr && <ScaleFigure atEN={scaleAt} groundAhdM={ground} />}

          <SunLight
            angles={sun}
            extentM={shadow.extentM}
            centre={shadow.centre}
            castShadows={castShadows}
          />
          <CityMassing
            haze={sky.haze}
            walking={walking}
            model={model}
            focus={focus}
            showProposed={showProposed}
            showAllProposals={showAllProposals}
            onSelectDevelopment={onSelectDevelopment}
            onSelectBuilding={onSelectBuilding}
            receptor={receptor}
            windowAt={windowAt}
            onPickReceptor={onPickReceptor}
            interactive={interactive}
            highlightedBuildingId={highlightedBuildingId}
            showHighlighted={showHighlighted}
          />

          {/*
            The sun arrow. In the world frame, so it points at the city rather
            than the screen. On whatever the camera is framing — the focused
            proposal, or a searched building. Reading `focus` alone put the
            arrow back on a proposal while the screen was about a building;
            targetE/targetN are already "the subject", whichever kind it is.
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
          The street names. Outside the world frame on purpose — see
          StreetLabels for why CSS3D cannot inherit that rotation and still
          land the right way up.

          Hidden while walking. They are HTML laid flat just above the ground —
          a second map on the floor, which is the same thing that made the
          basemap read wrong from eye height — and their repositioning follows
          the orbit target, which walking does not have.

          Hidden too while the front page is up and while the lens is still
          shifted after leaving it, as the shift eases back to nothing. The
          names are CSS 3D, which ignores the shift, so they would sit beside
          their streets.
        */}
        {!walking && !insetOn && !lensShifted && (
          <StreetLabels initialEast={targetE} initialNorth={targetN} groundAhdM={ground} />
        )}

        {/*
          One marker, on whatever is chosen. A proposal only carries one while
          the approved massing is actually being shown; a searched building
          always does, because it is there either way.
        */}
        {marker && (marker.kind === 'building' || showProposed) && (
          <SiteMarker subject={marker} groundAhdM={ground} />
        )}

        {/*
          The same street, walked two ways — and never both at once.

          StreetView owns the camera: it sets the position, the near plane and
          the field of view, and turns it with the mouse. In an immersive
          session every one of those belongs to the headset, which rewrites
          them before each frame. Left mounted it would not fight and lose; it
          would silently do nothing, which is harder to diagnose than a fight.

          VrWalk owns nothing but the floor. Looking is the neck's job.
        */}
        {walking && !inVr && (
          <StreetView
            startEN={standPoint}
            groundAhdM={ground}
            boundsCentreEN={[shadow.centre[0], shadow.centre[1]]}
            boundsRadiusM={citySpan * 1.2}
            obstacles={obstacles}
            onExit={onLeaveStreet}
          />
        )}

        {inVr && (
          <VrWalk
            placement={vrPlacement}
            trip={vrTrip}
            boundsCentreEN={[shadow.centre[0], shadow.centre[1]]}
            boundsRadiusM={citySpan * 1.2}
            // Over the roofs there is nothing to walk into.
            obstacles={vrStage === 'street' ? obstacles : null}
            timeLabel={timeLabel}
            dateLabel={dateLabel}
            onNudgeMinutes={onNudgeMinutes}
            /*
              Ends the session only. Where the page comes back is App's
              decision: on the footpath if the headset left the reader in the
              street, rather than two kilometres above it.
            */
            onExit={exitVr}
            onTogglePanel={togglePanel}
            onFlick={(direction) =>
              setFlick((last) => ({ count: last.count + 1, direction }))
            }
            onPlaced={() => setPlaced((n) => n + 1)}
          >
            {vrMenu && (
              <Suspense fallback={null}>
                <VrFurniture
                  menu={vrMenu}
                  stage={vrStage}
                  shown={panelShown}
                  summon={summon}
                  flick={flick}
                  placed={placed}
                  onHide={() => setPanelShown(false)}
                  onShow={showPanel}
                />
              </Suspense>
            )}
          </VrWalk>
        )}

        {/* Tied to the other view on the comparison screen — see ViewLink. */}
        {link && <ViewLink link={link.link} id={link.id} seed={link.seed} />}

        {/* The zoom buttons' way in to the camera — see ViewControls. */}
        {viewCommands && <ViewControlsBridge commands={viewCommands} />}

        {/* The city framed in the front page's window — see ViewInset. */}
        {inset && (
          <ViewInset
            source={inset}
            on={insetOn}
            animate={!reducedMotion}
            onShifted={setLensShifted}
          />
        )}

        {/*
          CameraRig and OrbitControls both stay mounted while walking, merely
          switched off. Unmounting them threw away the reader's own view: a
          freshly mounted CameraRig has never placed the camera, so on return
          it immediately reframed the subject and discarded whatever pan,
          orbit or zoom they had set up before going down to the street.
        */}
        <CameraRig
          refit={refit}
          paused={walking || inVr}
          position={cameraPosition}
          target={orbitTarget}
          animate={!reducedMotion}
        />

        {/*
          No `target` prop on purpose. It is applied on every render, so it
          would drag the orbit centre back to the destination while a flight
          was still under way. CameraRig sets it instead.

          Damping is drei's own default, so the glide after a drag was always
          there; what was missing was a say in how much, and a way to turn it
          off for someone who asked for less movement.
        */}
        <OrbitControls
          makeDefault={!walking && !inVr}
          enabled={!walking && !inVr}
          enableDamping={!reducedMotion}
          dampingFactor={0.09}
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
      </HeadsetFrame>
    </Canvas>
  );
}

/**
 * The headset wrapper, or nothing. The first view on a page carries <XR>;
 * a second view (the comparison screen's) must not — see `noHeadset`.
 */
function HeadsetFrame({ on, children }: { on: boolean; children: React.ReactNode }) {
  return on ? <XR store={xrStore()}>{children}</XR> : <>{children}</>;
}

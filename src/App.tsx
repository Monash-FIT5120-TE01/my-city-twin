/*
 * ─────────────────────────────────────────────────────────────────────────
 * THE WHOLE APPLICATION, IN ONE COMPONENT
 * ─────────────────────────────────────────────────────────────────────────
 *
 * WHAT THIS FILE IS
 *   Every piece of state the app has, and the decision about which panels
 *   appear over the 3D view. Nothing is drawn here — the scene is one
 *   component and the panels are others. This file only decides what is
 *   true and who gets told.
 *
 * THE STATE THAT MATTERS
 *
 *   view               which screen is showing: the front page, explore,
 *                      a project, a building, or sunlight
 *   selectedKey        which development, by its planning reference
 *   selectedBuildingId which existing building, if one was searched for
 *   layers             proposals on (the "after"), shadows on
 *   date               the day being simulated
 *   minutes            the time of day, as minutes since midnight
 *   receptor           the spot someone clicked to measure, if any
 *   floor, windowSide  the flat being measured, for a standing building
 *   query              the text in both search fields
 *   focusMode, walking the two ways the interface is hidden
 *   playing            the sunlight screen's day, playing on its own
 *
 *   The first six of those are what the address bar carries (urlState.ts).
 *
 * WHAT IS IN HERE, TOP TO BOTTOM
 *   - The state, and the keyboard: Escape for the search, the ground and
 *     focus mode.
 *   - The sun: where it is for the date and hour, and when it rises and
 *     sets.
 *   - Into a headset.
 *   - The chosen place: a development or a searched building, and the
 *     fall-backs when a link names neither.
 *   - What a window in a standing building can see.
 *   - The spot measured on the ground.
 *   - The city's descent, and the day played.
 *   - The comparison screen: today and after, side by side (ComparePage).
 *   - Choosing and clearing a place, and the header's links.
 *   - While the city loads: the front page, or the loading screen.
 *   - Once it is here: the scene, then each screen's panels.
 *
 * WHY THE HOOKS ALL SIT ABOVE `if (!model)`
 *   React requires the same hooks, in the same order, on every render. The
 *   early return below happens while the city is still loading, so any hook
 *   written after it would not run on those first renders — and the moment
 *   the data arrived, the count would change and React would tear the whole
 *   tree down. That bug was written once here. Neither the tests nor the
 *   type checker can see it, because neither of them renders anything.
 *
 * WHAT FLOWS DOWNWARD
 *   The scene is told what to draw and what may be clicked. The panels are
 *   told what to show and are handed functions to call. Nothing reads state
 *   back out; there is exactly one copy of every fact.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { SceneCanvas } from './scene/SceneCanvas';
import type { ViewCommands } from './scene/ViewControls';
import { describeShadow } from './scene/narrative';
import { sunlightAtPoint } from './scene/sunlightAt';
import { groundElevationOf } from './scene/massing';
import {
  SEASONS,
  civilToInstant,
  dateLabel,
  daylightWindow,
  matchingSeason,
  sameDayInMonth,
  seasonName,
  solarPosition,
  type SimulationDate,
} from './scene/solar';
import { SITE } from './scene/frame';
import { useCityModel } from './data/useCityModel';
import { useDevelopmentDetail } from './data/useDevelopmentDetail';
import { useBuildingDetail } from './data/useBuildingDetail';
import { clearOfBuildings, facadesOf, floorAhdM, windowPlace } from './scene/facades';
import { buildingCentres, buildingsUnder } from './data/replaces';
import { buildingEntry } from './data/buildingEntry';
import { buildSkyline } from './scene/skyline';
import { sunlightAtWindow } from './scene/windowSunlight';
import { LoadingScreen } from './ui/LoadingScreen';
import { LandingPage } from './ui/LandingPage';
import { FUTURE_PLANS_ID } from './ui/LandingMore';
import { SourcesLink } from './ui/Sources';
import { ComparePage, type FrameRect } from './ui/ComparePage';
import { HowItWorksPage } from './ui/HowItWorksPage';
import { createCameraLink } from './scene/cameraLink';
import './styles/sunlight.css';
import type { ScreenInset } from './scene/ViewInset';
import { useReducedMotion } from './ui/useReducedMotion';
import { Header, MapAttribution, developmentSummary } from './ui/chrome';
import {
  DevelopmentPanel,
  SearchResults,
  ViewControls,
  MapLayers,
  BuildingPanel,
  SunlightSheet,
  TimeBar,
  type Layers,
  type WindowProblem,
} from './ui/screens';
import { readUrlState, writeUrlState, type ViewName } from './data/urlState';
import { EARLIEST_MINUTES, LATEST_MINUTES, clock12Label, clockLabel, intoWindow } from './data/now';
import { useMapboxConfig } from './data/mapboxConfig';
import { exitVr, useInVr, useVrSupported, xrStore } from './scene/xrStore';
import type { VrMenu, VrStage } from './scene/vrMenu';
import { NOT_AN_ASSESSMENT, spotFinePrint, spotWords } from './ui/words';
import type { Development, SearchableBuilding } from './data/model';
import { shortAddress, type SearchHit } from './data/search';
import './styles/ui.css';

/** Below this the sun is too low to see the city by, in a headset. See enterVr. */
const LOW_SUN_DEG = 8;
const MIDDAY_MINUTES = 12 * 60;

export default function App() {
  const { model, error, progress } = useCityModel();

  // Read once, on the first render: the address bar is the initial state.
  const [initial] = useState(() => readUrlState());

  const [view, setView] = useState<ViewName>(initial.view);
  const [selectedKey, setSelectedKey] = useState<string | null>(initial.devKey);
  const [layers, setLayers] = useState<Layers>({ developments: true, shadows: true, streetLights: true });
  const [date, setDate] = useState<SimulationDate>(initial.date);
  const [minutes, setMinutes] = useState(initial.minutes);
  const [receptor, setReceptor] = useState<[number, number] | null>(initial.receptor);

  /*
   * Which flat, for the window measurement.
   *
   * Deliberately NOT in the URL, unlike the receptor. A spot on the ground is
   * a place anybody can share a link to; "floor 12, north-east side" is where
   * a particular person lives, and putting that in the address bar makes it
   * the kind of thing that ends up in a screenshot or somebody else's history.
   */
  const [floor, setFloor] = useState(1);
  const [windowSide, setWindowSide] = useState<string | null>(null);
  const [focusMode, setFocusMode] = useState(false);
  /*
   * Standing in the street. It hides the interface for the same reason focus
   * mode does — the pointer is locked and there is nothing to click — so the
   * two are folded into one flag below rather than guarded separately in
   * fourteen places.
   */
  const [walking, setWalking] = useState(false);
  /*
   * A bare arrival: the front page, with nothing chosen in the address bar.
   *
   * Read once. Only this gets the city's descent into the front page's
   * window — a URL that names a subject is somebody being sent to a
   * particular thing, and it opens exactly where it always did.
   */
  const [bareArrival] = useState(
    () => initial.view === 'landing' && !initial.devKey && !initial.buildingId,
  );
  /*
   * The city has had its first moment on screen, held back high and far,
   * and may now come down to its proper frame. Set a moment after the model
   * arrives — see the effect below, and the descent in SceneCanvas.
   */
  const [arrived, setArrived] = useState(false);
  /*
   * Where the front page's window onto the city is. Measured by the page on
   * every resize and every scroll, and read by the scene every frame — a ref
   * and not state, because a scroll would otherwise re-render the whole app
   * sixty times a second. The scene is told separately (`insetOn`) whether
   * the page is showing. See ViewInset.
   */
  const inset = useRef<ScreenInset | null>(null);
  /*
   * Which search field has the keyboard. The front page has two — its own
   * and the header's — sharing one text, and the matches belong under the
   * one being typed into rather than under both.
   */
  const [searchAt, setSearchAt] = useState<'header' | 'front'>('header');
  /*
   * The sunlight screen's day, playing on its own. It belongs to that screen
   * alone and stops the moment it is left — see `playingNow` below.
   */
  const [playing, setPlaying] = useState(false);
  /*
   * The comparison screen: where its two windows are, measured by the page,
   * and the camera pose the two views share so they move together.
   */
  const [compareFrames, setCompareFrames] = useState<{ today: FrameRect; after: FrameRect } | null>(
    null,
  );
  const [cameraLink] = useState(createCameraLink);
  /*
   * What is typed into search — one text for both fields.
   *
   * The bar's field is on every screen and the front page has its own; they
   * share this, so what was typed in one is still there in the other and
   * survives leaving the screen it was typed on. `searchAt` says which of
   * the two shows the matches.
   */
  const [query, setQuery] = useState('');
  /*
   * How the zoom buttons reach the camera.
   *
   * A ref and not state: the canvas fills it once on mount, the buttons read
   * it on a click, and nothing about either should cause a render. See
   * ViewControls for why the two halves cannot see each other directly.
   */
  const viewCommands = useRef<ViewCommands>(null);
  /*
   * Bumped by "Frame the whole city".
   *
   * Clearing the selection is not enough on its own: with nothing selected
   * the destination is already the whole city, so after panning away there
   * was nothing for CameraRig to notice and the button did nothing.
   */
  const [refit, setRefit] = useState(0);
  /*
   * The layer list, which is now a panel of its own opened from the header
   * rather than the top of the explore screen. Not in the URL: it is a thing
   * somebody opened and will close, not a place to be sent to.
   */
  const [layersOpen, setLayersOpen] = useState(false);
  /*
   * Whether the ground is armed for a measurement.
   *
   * The ground used to be live whenever the sunlight screen was open, which
   * gave the one action this screen exists for no beginning — nothing to
   * press, nothing to cancel — and let a stray click during a pan leave a
   * measurement behind. Now a button arms it and a click spends it.
   */
  const [choosing, setChoosing] = useState(false);

  /*
   * Above the early return, like every other hook in this file — the header
   * says why. Called down in the render it would be skipped on the loading
   * passes, and the hook count would change the moment the city arrived.
   */
  const reducedMotion = useReducedMotion();
  /** How far the viewpoint had to move to find ground with no building on it. */
  const [standMoved, setStandMoved] = useState(0);
  /*
   * Said when the app opened on the present moment at an hour the time
   * control cannot reach — and cleared the moment the reader moves either
   * control, because from then on the time on screen is theirs and the note
   * would be describing a state that no longer exists.
   */
  const [nowNote, setNowNote] = useState(initial.nowNote);

  /*
   * Only to decide whether the map credit belongs on screen. The scene loads
   * the same configuration for itself; both share one request.
   */
  const mapbox = useMapboxConfig();
  /*
   * Whether this device could enter VR at all. False on every desktop, and
   * false for a moment on a headset while the browser is asked — which is
   * why the button appears rather than being there from the first frame.
   */
  const vrSupported = useVrSupported();
  /*
   * ── IN A HEADSET ──────────────────────────────────────────────────────
   *
   * Whether a session is running, where in it the reader is standing, and a
   * count that asks for them to be moved. The panel inside the headset calls
   * the same setters as the page does; these three are the only state that
   * exists for the headset alone.
   *
   * `vrTrip` is a request, not a position: SceneCanvas works out where the
   * current place and stage put somebody, and VrWalk goes there — in the
   * dark, see VrWalk — only when this number changes. A new hour or a new
   * measurement therefore never moves anybody.
   */
  const inVr = useInVr();
  const [vrStage, setVrStage] = useState<VrStage>('above');
  const [vrTrip, setVrTrip] = useState(0);
  const moveInVr = (stage: VrStage) => {
    setVrStage(stage);
    setVrTrip((n) => n + 1);
  };
  /*
   * A building somebody searched for. It is a question the person asked, not
   * a property of the building, so it clears as soon as the question changes
   * — a new search, a proposal opened, or the dismiss button.
   *
   * Held as an id and resolved against the model, the same way the focused
   * development is. Kept as the object it could not survive a reload, so a
   * link to a building reopened on the landing screen while a link to a
   * proposal worked.
   */
  const [selectedBuildingId, setSelectedBuildingId] = useState<string | null>(
    initial.buildingId,
  );
  /*
   * Where the camera was last sent. Held apart from `foundBuilding` so that
   * clearing a search result removes the highlight without also yanking the
   * view somewhere else — the person is still looking at the street they
   * asked about, they have just finished with the highlight.
   */
  const [lookAt, setLookAt] = useState<{
    east: number;
    north: number;
    heightM: number;
  } | null>(null);
  /** True once a place has actually been chosen, rather than defaulted to. */
  const [hasChosen, setHasChosen] = useState(
    Boolean(initial.devKey || initial.buildingId),
  );

  /** Either way of hiding the interface. */
  const chromeHidden = focusMode || walking;

  /*
   * Coming out of a headset.
   *
   * Somebody who took it off while standing in the street comes back to the
   * page standing in the same street, walking on a monitor — not two
   * kilometres above it. Somebody who was over the city comes back to the
   * city, which is where the page already is.
   */
  const wasInVr = useRef(false);
  useEffect(() => {
    if (wasInVr.current && !inVr && vrStage === 'street') setWalking(true);
    wasInVr.current = inVr;
  }, [inVr, vrStage]);

  /*
   * Armed, and only where being armed means anything.
   *
   * Walking is in the list because of where "Stand here" sits: it is on the
   * measured panel, one row under "Choose another point". Arm the ground,
   * change your mind, walk down to the spot instead — and the ground was
   * still live underfoot with the panel that said so now hidden, so a click
   * in the street silently moved the measurement.
   *
   * Derived rather than corrected. An effect that reset `choosing` whenever
   * the view moved worked, and was the wrong shape: it let the impossible
   * state exist for a render and then tidied it up afterwards. Anded here,
   * a `choosing` left over from an earlier visit simply cannot be true
   * anywhere it would matter.
   */
  const armed = choosing && view === 'sunlight' && !focusMode && !walking;

  /*
   * ── THE KEYBOARD ────────────────────────────────────────────────────────
   *
   * Escape puts the search away.
   *
   * The results were shown whenever the field held two characters and hidden
   * only when it did not, so the one way to dismiss them was to delete what
   * you had typed — and pressing a header button carried the whole dropdown
   * over the top of the next screen.
   *
   * Clearing the query rather than hiding the list keeps one fact instead of
   * two: there is no state in which the field says one thing and the list
   * below it shows another.
   */
  useEffect(() => {
    if (!query && !choosing) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      // Whichever is open. Backing out of choosing is the more urgent of the
      // two: it is a state the whole map is in, not a list on one panel.
      if (choosing) setChoosing(false);
      else setQuery('');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [query, choosing]);

  // Escape leaves focus mode, because there is nothing else on screen to
  // click and a viewer who cannot find the way out is stuck.
  useEffect(() => {
    if (!chromeHidden) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setFocusMode(false);
        setWalking(false);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [chromeHidden]);

  /*
   * ── THE DATE AND THE HOUR ───────────────────────────────────────────────
   *
   * The date and time controls, wrapped so that touching either retires the
   * note left by "Now in Melbourne". Handing the raw setters to the panel
   * instead left "It is 23:31 in Melbourne" sitting under a slider the reader
   * had since dragged to noon. Moving the hour by hand also stops the day
   * playing; choosing a date does not.
   */
  const chooseDate = (next: SimulationDate) => {
    setDate(next);
    setNowNote(null);
  };

  const chooseMinutes = (next: number) => {
    setMinutes(next);
    setNowNote(null);
    // A hand on the handle takes the hour back from the player.
    setPlaying(false);
  };

  /*
   * The same control, reached from inside a headset.
   *
   * Relative rather than absolute, because the controller has buttons and not
   * a slider: A and B say "later" and "earlier", and only this end knows what
   * the clock currently reads. Clamped with intoWindow — the same function
   * the slider's own bounds come from — so the hours the simulation covers
   * are stated in ONE place and the two interfaces cannot end up disagreeing
   * about when the day starts.
   */
  const nudgeMinutes = (by: number) => {
    chooseMinutes(intoWindow(minutes + by));
  };


  /*
   * ── THE SUN ─────────────────────────────────────────────────────────────
   *
   * When the sun crosses the horizon on the chosen day.
   *
   * Memoised on the date alone: it is about eighty solar positions plus two
   * bisections, which is nothing once but would be wasted on every tick of
   * the time slider. The hour does not change when sunrise is.
   */
  const daylight = useMemo(
    () =>
      daylightWindow(date, EARLIEST_MINUTES, LATEST_MINUTES, SITE.timeZone, {
        lat: SITE.lat,
        lon: SITE.lon,
        elevationM: SITE.elevationM,
      }),
    [date],
  );

  /** Where the sun is in the Melbourne sky at the date and hour on screen. */
  const sun = useMemo(
    () =>
      solarPosition(
        civilToInstant(
          SITE.timeZone,
          date.year,
          date.month,
          date.day,
          Math.floor(minutes / 60),
          minutes % 60,
        ),
        { lat: SITE.lat, lon: SITE.lon, elevationM: SITE.elevationM },
      ),
    [date, minutes],
  );

  /*
   * ── INTO A HEADSET ──────────────────────────────────────────────────────
   *
   * Into the headset, from wherever the page is.
   *
   * THE SESSION IS REQUESTED FIRST, in the same synchronous call as the
   * press — xrStore.ts explains why nothing may come before it. The state
   * below is set after, which costs the gesture nothing.
   *
   * The page is tidied for a place it cannot be seen from: desktop walking
   * and focus mode hide the interface and lock the ground against picking,
   * and both are for a monitor. Somebody who was walking arrives in the
   * street; everybody else arrives above the city, or above the place they
   * had chosen. A place's own page becomes its sunlight page, because that
   * is the one the headset panel can operate.
   *
   * THE TIDYING WAITS FOR THE SESSION. A request can be refused — a
   * permission prompt declined, a headset asleep — and tidied first, a
   * refusal left somebody who had been walking on a monitor standing nowhere
   * with their search cleared, and no session ending to put them back. So
   * only where to stand is set now (harmless if nothing starts: nothing reads
   * it outside a session), and the page is changed once there is a session
   * for it to be changed for. A refusal leaves the page exactly as it was.
   */
  const enterVr = () => {
    const entering = xrStore().enterVR();
    moveInVr(walking ? 'street' : 'above');
    void entering.then(
      (session) => {
        if (!session) return;
        /*
         * NOT INTO THE DARK. The page opens on the present moment, and in the
         * evening that is a city after sunset — on a monitor a fair picture
         * of the hour, in a headset a black room with nothing to show why.
         * On the headset that was reported as the view "going dark" on the
         * way in. So a session that starts with the sun low (under 8°, where
         * the street is already in dusk) starts at midday instead, and the
         * panel says so; the time bar is right there to go back.
         */
        if (sun.altitudeDeg < LOW_SUN_DEG) {
          setMinutes(MIDDAY_MINUTES);
          setNowNote(
            `The sun is down in Melbourne at ${clockLabel(minutes)}. Showing 12:00 - change the time below.`,
          );
        }
        setWalking(false);
        setFocusMode(false);
        setQuery('');
        setLayersOpen(false);
        /*
         * The comparison too: its second view is a page-only canvas with no
         * headset in it, and the headset panel operates the sunlight screen.
         */
        if (view === 'development' || view === 'building' || view === 'compare') {
          setView('sunlight');
        }
      },
      () => {
        // Refused. The page is untouched; the button is still there to try again.
      },
    );
  };

  /*
   * ── THE CHOSEN PLACE ────────────────────────────────────────────────────
   *
   * The development being examined, or nothing.
   *
   * There is deliberately no default. Opening on a particular tower put a pin
   * and a name on a building nobody had asked about, and called it "your
   * chosen place" — which made the first thing a visitor saw a claim that was
   * not true. With none chosen the camera takes in the whole grid instead,
   * which is the honest opening shot and also the more useful one.
   */
  const focus = useMemo<Development | null>(() => {
    if (!model || !selectedKey) return null;
    return model.developments.find((d) => d.devKey === selectedKey) ?? null;
  }, [model, selectedKey]);

  /** The searched-for building, resolved against the model the same way. */
  const foundBuilding = useMemo<SearchableBuilding | null>(() => {
    if (!model || !selectedBuildingId) return null;
    // Found by search or double-clicked on the map — with an address or not.
    return buildingEntry(model, selectedBuildingId);
  }, [model, selectedBuildingId]);

  /*
   * Send the camera to a building that arrived from the address bar.
   *
   * Searching does this in openHit, but a cold load has no search to do it,
   * and without it a shared link showed the right panel over the whole-city
   * shot. Only fills a gap — it never overrides a camera already placed.
   */
  useEffect(() => {
    if (!foundBuilding) return;
    setLookAt(
      (current) =>
        current ?? {
          east: foundBuilding.anchorEN[0],
          north: foundBuilding.anchorEN[1],
          heightM: foundBuilding.heightM,
        },
    );
  }, [foundBuilding]);

  // A link to a screen that needs a development, with no development in it,
  // has nothing to show. Fall back rather than render nothing at all.
  useEffect(() => {
    if (!model) return;
    // The project page needs a project. The sunlight screen only needs a
    // subject, and a searched building is one.
    if (view === 'development' && !focus) setView('explore');
    if (view === 'building' && !foundBuilding) setView('explore');
    if (view === 'sunlight' && !focus && !foundBuilding) setView('explore');
    if (view === 'compare' && !focus && !foundBuilding) setView('explore');
  }, [model, view, focus, foundBuilding]);

  // Keep the address bar in step, so the view on screen is always the view a
  // shared link reopens.
  useEffect(() => {
    writeUrlState({
      view,
      /*
       * The chosen subject, and only it. Writing whatever `focus` happened
       * to hold put a development in the URL alongside a searched building,
       * and kept one there after "Clear" had unchosen it — so reloading
       * restored a place the person had already dismissed.
       *
       * On the front page too. A place can be chosen there now, and a link
       * copied at that moment should open with it chosen rather than on an
       * empty search.
       */
      devKey: !foundBuilding && hasChosen ? (focus?.devKey ?? null) : null,
      buildingId: foundBuilding?.buildingId ?? null,
      date,
      minutes,
      receptor,
    });
  }, [view, focus, foundBuilding, hasChosen, date, minutes, receptor]);

  // Only requested once a project is actually open, so the landing screen
  // never waits on a sleeping API.
  const detail = useDevelopmentDetail(
    view === 'development' || view === 'sunlight' ? (focus?.devId ?? null) : null,
  );

  /*
   * The property record for a searched building. Like the development one it
   * is requested only when there is something to describe, and like it, the
   * panel renders without it — address and height come from the model.
   *
   * Above the loading guard with every other hook; see the note below.
   */
  const { detail: buildingDetail, settled: buildingSettled } = useBuildingDetail(
    view === 'building' || view === 'sunlight' ? (foundBuilding?.buildingId ?? null) : null,
  );

  const groundAhdM = useMemo(
    () => (model ? groundElevationOf(model.buildings) : 0),
    [model],
  );

  /*
   * ── WHAT A WINDOW IN THIS BUILDING CAN SEE ─────────────────────────────
   *
   * Only for a building that is already standing. A proposal has no
   * residents, and the sides of something unbuilt are not somebody's home.
   *
   * Three steps, each memoised on what it actually depends on, because they
   * cost very different amounts:
   *
   *   sides      reading the footprint. Cheap, changes with the building.
   *   windowAt   arithmetic on a floor number. Free.
   *   skyline    every building in the city against one point. About 25 ms at
   *              street level and 1 ms high up, where most roofs fall below
   *              the window and are skipped — see skyline.bench.test.ts.
   *
   * The expensive one does NOT depend on the date, so dragging the time
   * slider or stepping through a week never rebuilds it. Only moving the
   * window does. That is the whole reason the sky is an array rather than a
   * test run per time step.
   */
  /*
   * Everything standing, INCLUDING the building the window is in.
   *
   * It used to be excluded. The reason was real: the skyline sampled
   * footprints, and a wall half a metre away sampled from outside it read as
   * most of the sky. But excluding the whole building threw away the far
   * wing and the second tower of a complex, which genuinely do shade it —
   * and made the interface's "every building in the model" untrue.
   *
   * The skyline intersects edges exactly now rather than sampling them, and
   * a ray running parallel to a wall does not meet it. So the building's own
   * walls can be left in, where they belong: the one behind the window
   * blocks everything behind the window, which is correct.
   */
  const standingCity = useMemo(() => model?.buildings ?? [], [model]);

  /** The parts of the building the window is in. */
  const homeParts = useMemo(() => {
    if (!model || !foundBuilding) return [];
    return model.buildings.filter((part) => part.parentId === foundBuilding.buildingId);
  }, [model, foundBuilding]);

  const floorsAboveGround = buildingDetail?.floorsAboveGround ?? null;

  /*
   * The sides are chosen AT THE FLOOR BEING ASKED ABOUT, not for the building
   * as a whole. A tower on a podium is several parts and the podium is the
   * wider one, so a list taken from the whole building describes the podium
   * — and a tenth-floor window would be placed on its edge, in mid-air beside
   * the tower. Above the podium the tower may also face fewer ways, and the
   * list should say so.
   */
  const floorHeightAhd = useMemo(
    () => floorAhdM(homeParts, floor, floorsAboveGround),
    [homeParts, floor, floorsAboveGround],
  );

  const sides = useMemo(
    () => facadesOf(homeParts, floorHeightAhd ?? undefined),
    [homeParts, floorHeightAhd],
  );

  const chosenSide = useMemo(
    () => sides.find((side) => side.compass === windowSide) ?? null,
    [sides, windowSide],
  );

  /** The point on the chosen side and floor the window is measured at. */
  const windowAt = useMemo(() => {
    if (!chosenSide || homeParts.length === 0) return null;
    const place = windowPlace(homeParts, chosenSide, floor, floorsAboveGround);

    /*
     * A large building is several overlapping parts, and the side chosen from
     * its outline can have another wing standing on it. A point inside solid
     * geometry sees a sky made of the roof over its head and reports a
     * confident number for a place with no window in it, so it is pushed out
     * into open air first — or refused.
     */
    if (!place) return null;

    const neighbours = standingCity.filter(
      (part) => part.parentId !== foundBuilding?.buildingId,
    );
    return clearOfBuildings(place, homeParts, neighbours);
  }, [chosenSide, homeParts, floor, floorsAboveGround, standingCity, foundBuilding]);


  /** The sky from the window today: the expensive step, independent of the date. */
  const windowSkyline = useMemo(() => {
    if (!windowAt) return null;
    return buildSkyline(windowAt.en, windowAt.ahdM, standingCity);
  }, [windowAt, standingCity]);

  /*
   * The same sky with every approved project added, so the two can be
   * subtracted. Built only while the approved plan is actually being shown:
   * otherwise there is nothing on screen for the comparison to be about, and
   * a figure about invisible buildings is a figure nobody asked for.
   */
  const proposedSkyline = useMemo(() => {
    if (!windowAt || !model || !layers.developments) return null;

    /*
     * ── THE SAME CITY THE SCENE DRAWS, DEMOLITIONS INCLUDED ───────────────
     *
     * A proposal is built ON something, and the approved scenario takes that
     * something down — CityMassing drops every building under a visible
     * proposal for exactly this reason, so the toggle is a before and after
     * rather than the city against the city with a tower inside it.
     *
     * This used to add the proposals and keep the buildings underneath them.
     * A review measured 75 degrees of obstruction where the scene showed 17:
     * the panel was reporting shade from a building that, in the scenario it
     * claimed to describe, is not there.
     */
    const centres = buildingCentres(model.buildings);
    const replaced = new Set(
      model.developments.flatMap((development) =>
        buildingsUnder(
          development.parts.map((part) => part.footprint).flat(),
          centres,
        ),
      ),
    );

    /*
     * ── AND IF THE FLAT ITSELF IS WHAT GETS DEMOLISHED ────────────────────
     *
     * A proposal is built on something, and that something can be this
     * building. The comparison would then describe the sunlight at a set of
     * coordinates where the reader's home no longer stands — a confident
     * figure about a window that the scenario removes.
     *
     * There is no honest number for that, so there is no number. The panel
     * shows the today figure alone, and the fine print says why.
     */
    if (foundBuilding && replaced.has(foundBuilding.buildingId)) return null;

    const survivors = standingCity.filter((part) => !replaced.has(part.parentId));
    const proposals = model.developments.flatMap((development) => development.parts);
    return buildSkyline(windowAt.en, windowAt.ahdM, [...survivors, ...proposals]);
  }, [windowAt, model, standingCity, layers.developments, foundBuilding]);

  /*
   * Why there is no figure, when there is none.
   *
   * The three cases were once collapsed into "this building does not have a
   * floor N", which is wrong twice over: moving up past a podium onto a
   * narrower tower loses a SIDE, not a floor, and a point swallowed by an
   * abutting wing is a third thing again. Each is checked in the order that
   * makes the message true.
   */
  const windowProblem = useMemo<WindowProblem | null>(() => {
    if (windowSide === null || windowAt !== null) return null;
    if (floorHeightAhd === null) return 'no-such-floor';
    if (!chosenSide) return 'side-not-at-this-height';
    return 'inside-the-building';
  }, [windowSide, windowAt, floorHeightAhd, chosenSide]);

  /** True when the approved plan replaces the very building being measured. */
  const hostIsReplaced = useMemo(() => {
    if (!model || !foundBuilding || !layers.developments) return false;
    const centres = buildingCentres(model.buildings);
    return model.developments.some((development) =>
      buildingsUnder(
        development.parts.map((part) => part.footprint).flat(),
        centres,
      ).includes(foundBuilding.buildingId),
    );
  }, [model, foundBuilding, layers.developments]);

  /** The window's sunlight on the date: today, and after the plans if there is a figure. */
  const windowSunlight = useMemo(() => {
    if (!windowAt || !windowSkyline) return null;
    return sunlightAtWindow(windowAt, windowSkyline, proposedSkyline, date);
  }, [windowAt, windowSkyline, proposedSkyline, date]);

  /*
   * ── THE SPOT ON THE GROUND ──────────────────────────────────────────────
   *
   * The thing whose shadow is being measured, as a plain list of parts.
   *
   * A development carries its parts already. A building's parts are the rows
   * of the city that share its id — one scan of 4,443, only when a building
   * is actually open.
   */
  const subjectParts = useMemo(() => {
    if (foundBuilding) {
      return model
        ? model.buildings.filter((b) => b.parentId === foundBuilding.buildingId)
        : [];
    }
    return focus?.parts ?? [];
  }, [model, foundBuilding, focus]);

  /*
   * What the subject takes from the measured spot over the day.
   *
   * Every hook has to run on every render, so this one sits above the loading
   * guard below rather than beside the value it feeds. Putting it after the
   * early return changes the number of hooks the moment the city arrives, and
   * React tears the tree down with "rendered more hooks than during the
   * previous render" — a crash that neither the unit tests nor `tsc` can see,
   * because neither of them renders.
   *
   * Only recomputed when the spot, the subject or the date changes: a day's
   * worth of ray tests is cheap, but not cheap enough to redo on every drag
   * of the time slider.
   */
  const measured = useMemo(
    () =>
      receptor && subjectParts.length > 0
        ? sunlightAtPoint(receptor, groundAhdM, groundAhdM, subjectParts, date)
        : null,
    [receptor, subjectParts, date, groundAhdM],
  );

  /*
   * ── THE CITY'S DESCENT ──────────────────────────────────────────────────
   *
   * Let the city come down, a moment after it first appears.
   *
   * The moment is what makes it a descent: released on the same render the
   * model arrives in, the held-back frame would never be drawn and the city
   * would simply appear in its final place.
   */
  useEffect(() => {
    if (!model || arrived) return;
    const timer = window.setTimeout(() => setArrived(true), 350);
    return () => window.clearTimeout(timer);
  }, [model, arrived]);

  /*
   * ── THE SUNLIGHT SCREEN'S DAY, PLAYING ──────────────────────────────────
   *
   * Only while the sunlight screen is actually showing, and switched OFF —
   * not merely paused — the moment it stops showing. Paused, it came back
   * by itself: start the day playing, open Details, return, and it was
   * running again with nobody having pressed anything. Leaving the screen
   * (for the street, a headset, focus mode or another page) now clears it,
   * so returning finds it where the reader expects: stopped.
   *
   * Done while rendering, with the previous value kept in state, rather than
   * in an effect: React's own pattern for adjusting state to a change in
   * something else, which never lets a frame render with the stale value.
   */
  const sunScreen = view === 'sunlight' && !chromeHidden && !inVr;
  const [wasSunScreen, setWasSunScreen] = useState(sunScreen);
  if (wasSunScreen !== sunScreen) {
    setWasSunScreen(sunScreen);
    if (!sunScreen) setPlaying(false);
  }
  const playingNow = playing && sunScreen;

  /*
   * ── THE DAY, PLAYED ────────────────────────────────────────────────────
   *
   * Ten minutes of the day every fifth of a second — an hour in a little
   * over a second, the whole window in about seventeen — so the shadow
   * sweeps rather than jumps. It stops at the end of the window.
   *
   * Under a reduced-motion preference it steps an hour a second instead:
   * the shadow still changes, but as a sequence of stills rather than as a
   * sweep.
   */
  useEffect(() => {
    if (!playingNow) return;
    const step = reducedMotion ? 60 : 10;
    const timer = window.setInterval(
      () => {
        setMinutes((now) => {
          const next = Math.min(LATEST_MINUTES, now + step);
          if (next >= LATEST_MINUTES) setPlaying(false);
          return next;
        });
      },
      reducedMotion ? 1000 : 200,
    );
    return () => window.clearInterval(timer);
  }, [playingNow, reducedMotion]);

  /*
   * ── CHOOSING A PLACE ────────────────────────────────────────────────────
   *
   * Open a development on the given screen. Whatever building had been
   * searched for, and wherever the camera had been sent for it, are dropped.
   */
  const open = (development: Development, next: ViewName) => {
    setSelectedKey(development.devKey);
    setSelectedBuildingId(null);
    setLookAt(null);
    setHasChosen(true);
    setView(next);
  };

  /*
   * Choosing a place inside the headset — from the panel's list, or by
   * pointing at a proposal in the city. One function for both, because they
   * are one request, and written twice they drifted: pointing kept the old
   * measured spot, so the new proposal was measured at a spot that belonged
   * to the previous place, and "Stand at the spot" sent the reader back
   * across the city to it.
   *
   * The two differ in one thing only. A place chosen from the list may be
   * anywhere, so the reader is taken above it; a place pointed at is already
   * in view, and moving them would take away the thing they just aimed at.
   *
   * Pointing at the place that is already chosen changes nothing. While the
   * ground is armed the laser is sweeping across the subject's own walls on
   * its way to the pavement, and a stray press there must not wipe the spot.
   */
  const chooseInVr = (development: Development, travel: boolean) => {
    const already =
      development.devKey === selectedKey && !selectedBuildingId && view === 'sunlight';
    if (!already) {
      open(development, 'sunlight');
      // The old spot belonged to the old place.
      setReceptor(null);
      setChoosing(false);
    }
    if (travel) moveInVr('above');
  };

  /** A search result: a proposal opens its page, a building lights up pink. */
  const openHit = (hit: SearchHit) => {
    if (hit.kind === 'development') {
      open(hit.development, 'development');
      return;
    }
    openBuilding(hit.building);
  };

  /**
   * An existing building onto its own page — from a search result, or
   * double-clicked on the map (see BuildingPicker).
   */
  const openBuilding = (building: SearchableBuilding) => {
    // Drop the previously selected proposal. Leaving it set kept its pin and
    // its name floating over a building the person had moved on from.
    setSelectedKey(null);
    setSelectedBuildingId(building.buildingId);
    setLookAt({
      east: building.anchorEN[0],
      north: building.anchorEN[1],
      heightM: building.heightM,
    });
    setHasChosen(true);
    // Straight to its own page, the way a searched proposal opens on its
    // project page rather than on the map behind it.
    setView('building');
  };

  /*
   * A search result picked on the front page. It is chosen, not opened: the
   * city in the window flies to it and the pin goes on it, and the page's
   * main button is what takes the reader on — to its sunlight.
   *
   * The measured spot goes with the old place. It was a question about that
   * place, and answered for the new one it would be a spot nobody picked.
   */
  const chooseOnFront = (hit: SearchHit) => {
    setQuery('');
    if (hit.kind === 'development') {
      setSelectedKey(hit.development.devKey);
      setSelectedBuildingId(null);
      setLookAt(null);
    } else {
      setSelectedKey(null);
      setSelectedBuildingId(hit.building.buildingId);
      setLookAt({
        east: hit.building.anchorEN[0],
        north: hit.building.anchorEN[1],
        heightM: hit.building.heightM,
      });
    }
    setHasChosen(true);
    setReceptor(null);
    setChoosing(false);
  };

  /** Unchoose it: the city goes back to the whole grid. */
  const clearChosen = () => {
    setSelectedKey(null);
    setSelectedBuildingId(null);
    setLookAt(null);
    setHasChosen(false);
    setReceptor(null);
    setChoosing(false);
  };

  /*
   * ── THE HEADER'S LINKS ──────────────────────────────────────────────────
   *
   * "How it works" in the header: its own page (HowItWorksPage).
   */
  const showHowItWorks = () => {
    // The layer panel would stay mounted behind the page, in the tab order.
    setLayersOpen(false);
    setView('how');
  };

  /*
   * "Future plans": the section near the foot of the front page. From any
   * other screen the front page has to come back first, and the section
   * exists only once it has been drawn, so the scroll waits a moment.
   */
  const showFuturePlans = () => {
    const go = () => {
      const section = document.getElementById(FUTURE_PLANS_ID);
      section?.scrollIntoView({ behavior: reducedMotion ? 'auto' : 'smooth', block: 'start' });
      section?.focus({ preventScroll: true });
    };
    if (view === 'landing') go();
    else {
      setView('landing');
      window.setTimeout(go, 60);
    }
  };

  /** The links the header carries on the front page and the sunlight screen. */
  const frontNav = (
    <>
      <button
        type="button"
        className="header__link header__link--accent"
        onClick={showFuturePlans}
      >
        Future plans
      </button>
      <button type="button" className="header__link" onClick={() => setView('explore')}>
        Explore the city
      </button>
      <button type="button" className="header__link" onClick={showHowItWorks}>
        How it works
      </button>
    </>
  );

  /** The moment on screen, for the front page's fine print. */
  const when = `${dateLabel(date)} ${date.year}, ${clockLabel(minutes)} · ${seasonName(date.month)}`;

  /** What the front page is given in both branches below. */
  const frontProps = {
    query,
    onQuery: setQuery,
    onSearchFocus: () => setSearchAt('front'),
    onExplore: () => setView('explore'),
    when,
    onInset: (next: ScreenInset) => {
      inset.current = next;
    },
    reducedMotion,
  };

  if (!model) {
    /*
     * ── WHILE THE CITY LOADS ───────────────────────────────────────────────
     *
     * The front page goes up FIRST, before the city exists. That is the
     * point of it: the city takes a few seconds to build, and the wait
     * happens while somebody is reading rather than while they watch a bar.
     * Any other screen needs the city to show anything, so it gets the
     * loading screen as before.
     *
     * ── WHY THIS IS `<div className="app">` AND NOT A FRAGMENT ────────────
     *
     * It must be the SAME root element the loaded branch returns, with the
     * front page under the same key. React reconciles by type, position and
     * key: change the root from a fragment to a div and every child is torn
     * down and rebuilt, the front page included — and rebuilding it restarts
     * the skyline film from its first stroke, seconds in, for no reason
     * anybody watching could guess at. The keys let the page and the bar
     * survive the city arriving even though what surrounds them changes.
     */
    return (
      <div className="app">
        {view === 'landing' && (
          <LandingPage
            key="front"
            {...frontProps}
            results={null}
            chosen={null}
            onClearChosen={() => undefined}
            onSunlight={() => undefined}
            loading={{ progress, error }}
            credit={null}
          />
        )}
        {view === 'landing' ? (
          <Header
            key="header"
            query={query}
            onQuery={setQuery}
            onSearchFocus={() => setSearchAt('header')}
            layersOpen={false}
            layersHidden={0}
            onLayers={() => undefined}
            onHome={() => undefined}
            front
            hideLayers
            nav={frontNav}
          />
        ) : (
          <LoadingScreen progress={progress} error={error} />
        )}
      </div>
    );
  }

  const focusAddress = focus?.streetAddress.split(',')[0] ?? '';

  /** Everything after the street line: "Melbourne VIC 3000", or nothing. */
  const localityOf = (address: string) => address.split(',').slice(1).join(',').trim();

  /*
   * There is exactly one "here" on screen at a time.
   *
   * Searching an existing building used to move the camera and the pink
   * highlight to it while "Your chosen place" and the nearby list stayed on
   * whatever development was focused — two different answers to the same
   * question, a metre apart on the same panel. The chosen place is now
   * derived once, and everything on the screen reads from it.
   */
  const place: {
    label: string;
    anchorEN: [number, number];
    kind: 'development' | 'building';
    detail: string;
    topAhdM: number;
    /** Drives the shadow narrative, which cannot describe a 0 m subject. */
    heightM: number;
    /**
     * Suburb, state and postcode -- whatever the address carries after the
     * street line. Empty when it carries nothing, rather than guessed: not
     * every record is formatted the same way, and a header that invented
     * "Melbourne VIC 3000" would be stating a fact it had not been told.
     */
    locality: string;
    devId?: string;
  } | null = foundBuilding
    ? {
        label: shortAddress(foundBuilding.streetAddress),
        locality: localityOf(foundBuilding.streetAddress),
        anchorEN: foundBuilding.anchorEN,
        kind: 'building',
        detail: `Existing building · ${foundBuilding.heightM.toFixed(0)} m tall`,
        topAhdM: foundBuilding.topAhdM,
        heightM: foundBuilding.heightM,
      }
    : hasChosen && focus
      ? {
          label: focusAddress,
          locality: localityOf(focus.streetAddress),
          anchorEN: focus.anchorEN,
          kind: 'development',
          detail: `Approved development · ${focus.maxHeightM.toFixed(0)} m`,
          topAhdM: focus.topAhdM,
          heightM: focus.maxHeightM,
          devId: focus.devId,
        }
      : // Nothing chosen — either nobody has picked anything yet, or a search
        // result was just cleared. Saying so is the honest answer; quietly
        // substituting the default development is what made "Clear" look
        // like it had selected a different building.
        null;

  /** The comparison screen is up: two views of one place, side by side. */
  const compareShown = !chromeHidden && view === 'compare' && place !== null;

  /** The How it works page is up, over the city. */
  const howShown = !chromeHidden && view === 'how';

  /** The front page is up — and with it the window the city is framed in. */
  const frontShown = !chromeHidden && view === 'landing';

  /*
   * What the shadow is doing, in words — the time bar's caption.
   *
   * Moved below `place` so it can be told how tall the subject is. It read
   * focus?.maxHeightM ?? 0, and an existing building never sets focus — so
   * the whole sunlight screen for a building described a 0 m tower,
   * dividing the shadow's reach by zero and reporting every hour of every
   * season as the longest shadow of the day.
   */
  const narrative = describeShadow(
    sun,
    place?.heightM ?? 0,
    clockLabel(minutes),
    dateLabel(date),
  );

  /*
   * What the headset panel shows, and what its buttons do. Every handler is
   * one the page already uses, or the same few setters in the same order, so
   * the two interfaces cannot drift apart.
   */
  const noun = place?.kind === 'building' ? 'building' : 'project';
  const vrMenu: VrMenu | null = inVr
    ? {
        stage: vrStage,
        // Written as the list writes it, without "MELBOURNE VIC 3000".
        place: place ? { label: shortAddress(place.label), detail: place.detail, noun } : null,
        /*
         * Every approved development, by street and then by number, which is
         * how somebody looking for one on a particular street reads a list.
         */
        options: model.developments
          .map((development) => {
            // As the search list writes it, without "MELBOURNE VIC 3000".
            const label = shortAddress(development.streetAddress);
            return {
              key: development.devKey,
              label,
              detail: `Approved development · ${development.maxHeightM.toFixed(0)} m`,
              en: development.anchorEN,
              heightM: development.maxHeightM,
              street: label.replace(/^[^A-Za-z]*\d\S*\s+/, ''),
            };
          })
          .sort(
            (a, b) =>
              a.street.localeCompare(b.street) ||
              a.label.localeCompare(b.label, undefined, { numeric: true }),
          )
          .map(({ street: _street, ...option }) => option),
        onChoose: (key) => {
          const development = model.developments.find((d) => d.devKey === key);
          // Over the new place, looking at it.
          if (development) chooseInVr(development, true);
        },
        seasons: SEASONS,
        season: matchingSeason(date)?.key ?? null,
        onSeason: (key) => {
          const preset = SEASONS.find((option) => option.key === key);
          // The day on screen is kept; only the month moves — as on the page.
          if (preset) chooseDate(sameDayInMonth(date, preset.month));
        },
        dateLabel: dateLabel(date),
        timeLabel: clockLabel(minutes),
        note: nowNote,
        onNudgeMinutes: nudgeMinutes,
        minutes,
        railStart: EARLIEST_MINUTES,
        railEnd: LATEST_MINUTES,
        sunrise: daylight.rise,
        sunset: daylight.set,
        armed,
        onMeasure: () => {
          // Measuring belongs to the sunlight page; `armed` requires it.
          setView('sunlight');
          setChoosing(true);
        },
        onCancelMeasure: () => setChoosing(false),
        measured: measured
          ? {
              ...spotWords(measured, noun),
              withoutMin: measured.withoutSubjectMin,
              withMin: measured.withSubjectMin,
            }
          : null,
        finePrint: `${measured ? spotFinePrint(measured.stepMinutes) : ''}${NOT_AN_ASSESSMENT}`,
        onStand: () => {
          setChoosing(false);
          moveInVr('street');
        },
        onRise: () => moveInVr('above'),
        onExit: exitVr,
        /*
         * The map credit is a licence obligation wherever the map is shown,
         * and the page's credit is DOM — which a headset does not draw.
         */
        credits: [
          ...(mapbox ? ['© Mapbox  © OpenStreetMap'] : []),
          'Building Footprints 2023 and Development Activity Monitor © City of Melbourne, CC BY 4.0',
        ],
      }
    : null;

  const storeys = detail ? Number.parseFloat(detail.floorsAbove) : undefined;

  return (
    <div className="app">
      {/*
        ── THE FRONT PAGE ───────────────────────────────────────────────────
        First, and under the same key as in the loading branch, so the city
        arriving does not rebuild it. See the note there.
      */}
      {frontShown && (
        <LandingPage
          key="front"
          {...frontProps}
          results={
            searchAt === 'front' ? (
              <SearchResults model={model} query={query} onPick={chooseOnFront} />
            ) : null
          }
          chosen={place ? { label: place.label, detail: place.detail } : null}
          onClearChosen={clearChosen}
          onSunlight={() => setView('sunlight')}
          onEnterVr={vrSupported ? enterVr : undefined}
          loading={null}
          credit={mapbox ? <MapAttribution /> : null}
        />
      )}

      {/* ── THE CITY ─────────────────────────────────────────────────────── */}
      {/*
        On the comparison screen this canvas is the LEFT view, "today",
        moved into the page's left window rather than filling the screen.
        It keeps its camera, so the comparison opens from wherever the reader
        was looking (ViewLink publishes it), and going back finds it there.
        Its city is rebuilt for "today" — the approved projects come out —
        and the right view builds a city of its own.
      */}
      <div
        className={`app__scene${compareShown && compareFrames ? ' app__scene--compare' : ''}`}
        style={compareShown && compareFrames ? compareFrames.today : undefined}
      >
        <SceneCanvas
          model={model}
          focus={focus}
          sun={sun}
          /*
           * Held back for the city's first moment on the front page, then
           * released; CameraRig flies the difference. Only for a bare
           * arrival, so a shared link opens exactly where it always did.
           */
          approach={bareArrival && !arrived}
          // The front page's window: the box, and whether the page is up.
          inset={inset}
          insetOn={frontShown}
          // On the comparison screen this is "today": no approved project.
          showProposed={compareShown ? false : layers.developments}
          castShadows={layers.shadows}
          streetLights={layers.streetLights}
          showSunArrow={view === 'sunlight' && layers.shadows}
          /*
           * On the sunlight screen only the subject casts, so its shadow is
           * the one being read rather than one of forty-nine.
           *
           * EXCEPT for a building that is already standing, which has no
           * proposal of its own to be the subject. There the comparison
           * figure is "once the approved projects are built", and it counts
           * every one of them — so they have to be on screen, or the panel
           * is describing buildings the reader cannot see.
           */
          showAllProposals={view !== 'sunlight' || place?.kind === 'building'}
          // Tied to the "after" view on the comparison screen — see ViewLink.
          link={compareShown ? { link: cameraLink, id: 'today', seed: 'publish' } : null}
          /*
            In a headset, the same choice the panel's list makes — straight to
            the sunlight page, because the project page is DOM and there is no
            DOM in there to show it on. See chooseInVr.
          */
          onSelectDevelopment={(development) =>
            inVr ? chooseInVr(development, false) : open(development, 'development')
          }
          /*
            Not while a spot is being chosen: there a click is a place on the
            ground, and the second of two would leave the screen.
          */
          onSelectBuilding={
            armed
              ? undefined
              : (buildingId) => {
                  const building = buildingEntry(model, buildingId);
                  if (building) openBuilding(building);
                }
          }
          receptor={receptor}
          /*
           * Shown whenever a window has been chosen, whichever half of the
           * panel is on screen. Somebody who picks a floor and a side has
           * asked "is this my flat?", and the answer belongs in the city
           * rather than in the panel that asked.
           */
        windowAt={windowAt}
          /*
            Measuring only makes sense where the shadow is the subject, so
            only while armed. Undefined the rest of the time, which is what
            takes the crosshair and the ring off the ground as well — see
            Ground, where the presence of this handler IS the affordance.
          */
          onPickReceptor={
            armed
              ? (point) => {
                  setReceptor(point);
                  setChoosing(false);
                }
              : undefined
          }
          highlightedBuildingId={foundBuilding?.buildingId ?? null}
          showHighlighted
          /*
            The pin and the name follow the chosen place, whatever kind it
            is.
          */
          marker={
            place
              ? {
                  anchorEN: place.anchorEN,
                  topAhdM: place.topAhdM,
                  label: place.label,
                  kind: place.kind,
                }
              : null
          }
          lookAt={lookAt}
          // Focus mode is for looking. Leaving the meshes clickable meant an
          // invisible click could change the subject with nothing on screen
          // to show that it had. The comparison screen is for looking too.
          interactive={!chromeHidden && !compareShown}
          walking={walking}
          onLeaveStreet={() => setWalking(false)}
          /*
            For the wrist clock and the A/B buttons. The page's own time bar
            does not exist in a headset; the panel shows the hour too, but it
            gets it through vrMenu.
          */
          timeLabel={clockLabel(minutes)}
          dateLabel={dateLabel(date)}
          onNudgeMinutes={nudgeMinutes}
          vrStage={vrStage}
          vrTrip={vrTrip}
          vrMenu={vrMenu}
          viewCommands={viewCommands}
          refit={refit}
          onStandMoved={setStandMoved}
        />
        {/* The map is shown twice on the comparison screen, so its credit is too. */}
        {compareShown && compareFrames && mapbox && <MapAttribution />}
      </div>

      {/*
        ── THE "AFTER" VIEW ──────────────────────────────────────────────────

        The comparison screen's right window: the same city, place, spot and
        moment with every approved project built, in a canvas of its own laid
        over the page's right window. Its camera follows the left one and the
        left follows it (ViewLink). No headset wrapper — the page has one
        already — and nothing in it can be clicked open.
      */}
      {compareShown && compareFrames && place && (
        <div className="compare__canvas" style={compareFrames.after}>
          <SceneCanvas
            model={model}
            focus={focus}
            sun={sun}
            showProposed
            castShadows={layers.shadows}
            showSunArrow={false}
            showAllProposals
            onSelectDevelopment={() => undefined}
            receptor={receptor}
            windowAt={windowAt}
            highlightedBuildingId={foundBuilding?.buildingId ?? null}
            showHighlighted
            marker={{
              anchorEN: place.anchorEN,
              topAhdM: place.topAhdM,
              label: place.label,
              kind: place.kind,
            }}
            lookAt={lookAt}
            interactive={false}
            walking={false}
            onLeaveStreet={() => undefined}
            timeLabel={clockLabel(minutes)}
            dateLabel={dateLabel(date)}
            onNudgeMinutes={nudgeMinutes}
            vrStage="above"
            vrTrip={0}
            vrMenu={null}
            onStandMoved={() => undefined}
            noHeadset
            link={{ link: cameraLink, id: 'after', seed: 'adopt' }}
          />
          {mapbox && <MapAttribution />}
        </div>
      )}

      {/*
        ── THE MAP CONTROLS ─────────────────────────────────────────────────
        Bottom right, in the one corner no panel uses. Hidden with everything
        else in focus mode and while walking — down there the wheel and the
        keys are the controls, and a floating pair of buttons is chrome the
        mode exists to remove.

        Not on the front page either, which frames the city itself.
      */}
      {!chromeHidden && !frontShown && !compareShown && !howShown && (
        <ViewControls
          onZoom={(factor) => viewCommands.current?.dolly(factor)}
          onOrbit={(radians) => viewCommands.current?.orbit(radians)}
          /*
            Moved out of the header, where it was a view control among
            navigation — and where it was a button that erases the bar it
            sits in. Here it is beside the zoom and the reframe.
          */
          onFocus={() => {
            setQuery('');
            setLayersOpen(false);
            setFocusMode(true);
          }}
          /*
            Not a camera move of its own: it clears whatever the reader had
            opened, and CameraRig flies to the frame that follows from that.
            One way of deciding where the camera goes, not two.
          */
          onReset={() => {
            setSelectedKey(null);
            setSelectedBuildingId(null);
            setLookAt(null);
            setRefit((n) => n + 1);
          }}
        />
      )}

      {/*
        The layer panel, opened from "Map layers" in the plain header — the
        front page and the sunlight screen do not carry that button.
      */}
      {!chromeHidden && layersOpen && !howShown && (
        <MapLayers
          layers={layers}
          onChange={setLayers}
          onClose={() => setLayersOpen(false)}
        />
      )}

      {/*
        The map's credit. Outside every focusMode guard on purpose: the map is
        still on screen in focus mode, so the credit for it has to be too —
        see MapAttribution. On the front page it sits in the page's own
        window onto the map instead.
      */}
      {mapbox && !frontShown && !compareShown && !howShown && <MapAttribution />}

      {/* ── IN THE STREET: the keys, the way into a headset, how far the stand moved */}
      {walking && (
        <p className="walking-hint">
          <strong>W A S D</strong> to walk · <strong>Shift</strong> to hurry ·{' '}
          <strong>Esc</strong> to come back up
          {/*
            ── THE WAY INTO A HEADSET ─────────────────────────────────────

            Offered only where it can be taken. On a desktop there is no
            session to start, and a button that cannot do anything is worse
            than no button — see the padlock note in screens.tsx.

            THE CALL MUST BE THE HANDLER. A WebXR session may only begin
            inside a real user gesture, and the gesture is spent the moment
            anything is awaited. Putting a confirmation, a fetch or a state
            update in front of `enterVR()` does not delay the session; it
            prevents it, silently, and the button simply appears broken.
            The comfort warning therefore sits BESIDE the button rather than
            in front of it.
          */}
          {vrSupported && (
            <>
              <br />
              <button type="button" className="walking-hint__vr" onClick={enterVr}>
                Enter VR
              </button>
              {/*
                Said before the headset goes on. The panel inside shows what
                can be pressed, but not what the sticks and face buttons do,
                and the comfort warning has to be read before the first step,
                not after it.
              */}
              <span className="walking-hint__note">
                Left stick walks, push it to the stop to run · right stick
                turns · <strong>A</strong> and <strong>B</strong> move the
                hour · hold either <strong>grip</strong> to come back.
                <br />
                Moving by stick makes some people feel unwell.
              </span>
            </>
          )}
          {standMoved > 1 && (
            /*
             * The measured figures stay at the point that was clicked. If a
             * building stands on it there is nowhere to put a person, and
             * moving them without saying so implies the view and the numbers
             * describe the same place.
             */
            <>
              <br />
              Standing {Math.round(standMoved)} m from the measured spot — the
              nearest ground with no building modelled on it
            </>
          )}
        </p>
      )}

      {/*
        ── THE HEADER ───────────────────────────────────────────────────────
        One bar, every screen.

        It carried a "where you are" slot for a while: the city by default,
        and a back link into whatever had been opened. Both halves turned out
        to be duplicates — the city's name is on the map underneath, and
        every subject panel grew its own back link at the top of itself,
        which is nearer to hand and says where it goes.
      */}
      {!chromeHidden && (
        <Header
          key="header"
          query={query}
          onQuery={setQuery}
          onSearchFocus={() => setSearchAt('header')}
          /*
            The front page and the sunlight screen share the page's look and
            its three links (Future plans, Explore the city, How it works).
            Only the front page drops the layer button — see hideLayers.
          */
          front={frontShown || view === 'sunlight' || compareShown || howShown}
          hideLayers={frontShown}
          nav={frontShown || view === 'sunlight' || compareShown || howShown ? frontNav : undefined}
          layersOpen={layersOpen}
          /*
            How many layers are switched off. A city drawn without shadows,
            in a product about shadows, should say somewhere that it was
            asked to be — otherwise it reads as broken.
          */
          layersHidden={Number(!layers.developments) + Number(!layers.shadows) + Number(!layers.streetLights)}
          onLayers={() => {
            setQuery('');
            setLayersOpen((open) => !open);
          }}
          onHome={() => {
            setQuery('');
            setLayersOpen(false);
            setChoosing(false);
            setView('landing');
          }}
          onEnterVr={vrSupported ? enterVr : undefined}
        >
          {/*
            On the front page, only while this field has the keyboard, and a
            pick there chooses rather than opens — the same as the page's own
            field, so the two fields on one page do not do two things.
          */}
          {(!frontShown || searchAt === 'header') && (
            <SearchResults
              model={model}
              query={query}
              onPick={(hit) => {
                setQuery('');
                if (frontShown) chooseOnFront(hit);
                else openHit(hit);
              }}
            />
          )}
        </Header>
      )}

      {/*
        ── THE EXPLORE SCREEN ───────────────────────────────────────────────
        The city and nothing over it. A place is chosen by searching an
        address in the header or by double-clicking any building on the map;
        the line at the foot says so.
      */}
      {!chromeHidden && view === 'explore' && (
        <p className="explore-hint" role="note" tabIndex={-1}>
          Search an address, or double-click any building to select it.
        </p>
      )}

      {/* ── ONE PROJECT ──────────────────────────────────────────────────── */}
      {!chromeHidden && view === 'development' && focus && (
        <>
          <DevelopmentPanel
            development={focus}
            storeys={Number.isFinite(storeys) ? storeys : undefined}
            tab="overview"
            /*
              The sunlight half is a different screen, not a different block
              in this panel: it drives the shadow, the time bar and what can
              be clicked on the ground. The tab is what the reader sees; the
              view is what the app switches.
            */
            onTab={(next) => next === 'sunlight' && setView('sunlight')}
            onBack={() => setView('explore')}
            onClose={() => setView('landing')}
          />
        </>
      )}

      {/* ── ONE EXISTING BUILDING ────────────────────────────────────────── */}
      {!chromeHidden && view === 'building' && foundBuilding && place && (
        <>
          <BuildingPanel
            label={place.label}
            locality={place.locality}
            heightM={foundBuilding.heightM}
            detail={buildingDetail}
            settled={buildingSettled}
            onSunlight={() => setView('sunlight')}
            onBack={() => setView('explore')}
            onClose={() => setView('landing')}
          />
        </>
      )}

      {/*
        ── THE SUNLIGHT SCREEN ──────────────────────────────────────────────
        The column on the left, the time bar along the foot of the map, and
        the fine print under it.
      */}
      {compareShown && place && (
        <ComparePage
          title={place.label}
          kindLabel={place.kind === 'building' ? 'Existing building' : 'Approved development'}
          date={date}
          onDate={chooseDate}
          minutes={minutes}
          onMinutes={chooseMinutes}
          min={EARLIEST_MINUTES}
          max={LATEST_MINUTES}
          caption={narrative.caption}
          daylight={daylight}
          onBack={() => {
            setView('sunlight');
            /*
             * Back to the button that came here, once the sunlight screen
             * has been drawn: the back button the keyboard was on has gone.
             */
            window.requestAnimationFrame(() =>
              document.querySelector<HTMLElement>('.button--compare')?.focus(),
            );
          }}
          onChooseSpot={() => {
            setView('sunlight');
            setChoosing(true);
          }}
          onFrames={setCompareFrames}
        />
      )}

      {/* ── HOW IT WORKS: the three steps, over the city ─────────────────── */}
      {howShown && (
        <HowItWorksPage
          dateText={`${dateLabel(date)} ${date.year}`}
          timeText={clock12Label(minutes)}
          season={seasonName(date.month)}
          reducedMotion={reducedMotion}
          /*
            The page that had the keyboard is gone with either button, so the
            keyboard is given somewhere on the screen arrived at: the explore
            screen's one line, or the sunlight column's heading.
          */
          onExplore={() => {
            setView('explore');
            window.requestAnimationFrame(() =>
              document.querySelector<HTMLElement>('.explore-hint')?.focus(),
            );
          }}
          onBack={
            place
              ? () => {
                  setView('sunlight');
                  window.requestAnimationFrame(() =>
                    document.getElementById('subject-title')?.focus(),
                  );
                }
              : undefined
          }
        />
      )}

      {!chromeHidden && view === 'sunlight' && place && (
        <>
          <SunlightSheet
            status={focus?.status}
            title={place.label}
            locality={place.locality}
            meta={
              focus
                ? developmentSummary(focus, Number.isFinite(storeys) ? storeys : undefined)
                : place.detail
            }
            date={date}
            onDate={chooseDate}
            nowNote={nowNote}
            dateLabel={dateLabel(date)}
            measured={measured}
            onClearPoint={() => {
              setReceptor(null);
              setChoosing(false);
            }}
            choosing={armed}
            onChoose={() => setChoosing(true)}
            onCancelChoose={() => setChoosing(false)}
            onStand={() => {
              // Put the ground down before going to stand on it.
              setChoosing(false);
              setWalking(true);
            }}
            subjectKind={place.kind}
            /*
             * Only for a building that is standing. The panel hides the whole
             * apartment half when this is absent, which is what a proposal
             * should get: nobody lives in it yet.
             */
            apartment={
              place.kind === 'building'
                ? {
                    sides,
                    floor,
                    onFloor: setFloor,
                    side: windowSide,
                    onSide: setWindowSide,
                    floorsAboveGround,
                    floorHeightAssumed: windowAt?.floorHeightAssumed ?? floorsAboveGround === null,
                    sunlight: windowSunlight,
                    problem: windowProblem,
                    /*
                     * The approved plan takes this building down, so there is
                     * no future window to compare against. The panel says so
                     * rather than leaving the missing comparison unexplained.
                     */
                    hostDemolished: hostIsReplaced,
                  }
                : undefined
            }
            afterPlans={layers.developments}
            onAfterPlans={(next) => setLayers({ ...layers, developments: next })}
            // Today and after, side by side, on a page of their own.
            onCompare={() => {
              setChoosing(false);
              setView('compare');
            }}
            // Back to the subject's own page: the project, or the building.
            onDetails={() => {
              setChoosing(false);
              setView(place.kind === 'building' ? 'building' : 'development');
            }}
            onBack={() => {
              setChoosing(false);
              setView('explore');
            }}
          />
          <TimeBar
            minutes={minutes}
            onChange={chooseMinutes}
            min={EARLIEST_MINUTES}
            max={LATEST_MINUTES}
            caption={narrative.caption}
            daylight={daylight}
            playing={playingNow}
            onPlay={() => {
              if (playingNow) {
                setPlaying(false);
                return;
              }
              /*
               * From the start of the day if the hour is already at the end
               * of it — pressing play on a finished day means "again".
               */
              if (minutes >= LATEST_MINUTES) {
                setMinutes(Math.ceil((daylight.rise ?? EARLIEST_MINUTES) / 10) * 10);
              }
              setNowNote(null);
              setPlaying(true);
            }}
          />
          {/* The fine print, along the foot of the map as on the front page. */}
          <p className="mapfoot">
            Illustrative model · Demo data
            <SourcesLink />
          </p>
        </>
      )}
      {/* The one control focus mode leaves on screen: the way out of it. */}
      {focusMode ? (
        <button
          type="button"
          className="focus-toggle focus-toggle--exit"
          onClick={() => setFocusMode(false)}
        >
          Exit focus mode <kbd>Esc</kbd>
        </button>
      ) : null}
    </div>
  );
}

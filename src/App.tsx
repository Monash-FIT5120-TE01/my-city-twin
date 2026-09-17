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
 * THE STATE, ALL OF IT
 *
 *   view          which of the four screens is showing
 *   selectedKey   which development, by its planning reference
 *   layers        the tick boxes: proposals on, shadows on
 *   date          the day being simulated
 *   minutes       the time of day, as minutes since midnight
 *   receptor      the spot someone clicked to measure, if any
 *   focusMode     whether the interface is hidden
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
import { compassLabel } from './scene/sun';
import { describeShadow } from './scene/narrative';
import { sunlightAtPoint } from './scene/sunlightAt';
import { groundElevationOf } from './scene/massing';
import {
  civilToInstant,
  dateLabel,
  daylightWindow,
  solarPosition,
  type SimulationDate,
} from './scene/solar';
import { SITE } from './scene/frame';
import { useCityModel } from './data/useCityModel';
import { useDevelopmentDetail } from './data/useDevelopmentDetail';
import { useBuildingDetail } from './data/useBuildingDetail';
import { clearOfBuildings, facadesOf, floorAhdM, windowPlace } from './scene/facades';
import { buildingCentres, buildingsUnder } from './data/replaces';
import { buildSkyline } from './scene/skyline';
import { sunlightAtWindow } from './scene/windowSunlight';
import { LoadingScreen } from './ui/LoadingScreen';
import { Overture } from './ui/Overture';
import { useReducedMotion } from './ui/useReducedMotion';
import { Header, MapAttribution, SunChip, developmentSummary } from './ui/chrome';
import {
  DevelopmentPanel,
  Landing,
  Legend,
  SearchResults,
  ViewControls,
  type LandingPanel,
  MapLayers,
  NearbyProjects,
  BuildingPanel,
  SunlightSheet,
  TimeBar,
  type Layers,
  type WindowProblem,
} from './ui/screens';
import { readUrlState, writeUrlState, type ViewName } from './data/urlState';
import { EARLIEST_MINUTES, LATEST_MINUTES, clockLabel, intoWindow } from './data/now';
import { useMapboxConfig } from './data/mapboxConfig';
import { useVrSupported, xrStore } from './scene/xrStore';
import type { Development, SearchableBuilding } from './data/model';
import { shortAddress, type SearchHit } from './data/search';
import './styles/ui.css';

export default function App() {
  const { model, error, progress } = useCityModel();

  // Read once, on the first render: the address bar is the initial state.
  const [initial] = useState(() => readUrlState());

  const [view, setView] = useState<ViewName>(initial.view);
  const [selectedKey, setSelectedKey] = useState<string | null>(initial.devKey);
  const [layers, setLayers] = useState<Layers>({ developments: true, shadows: true });
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
   * The cover, and who does not get it.
   *
   * Read once, from the state the address bar produced. A URL that names a
   * view, a subject or an hour is somebody being sent to a particular thing,
   * and a front door in front of that breaks every link ever shared. Only a
   * bare arrival sees it.
   */
  const [overture, setOverture] = useState(
    () => initial.view === 'landing' && !initial.devKey && !initial.buildingId,
  );
  /*
   * The press, which is not the same event as the cover going.
   *
   * Two flags because the two things must OVERLAP. `entered` says the reader
   * has asked to come in, and it releases the camera from the held-back frame
   * it has been sitting in — that descent starts while the cover is still on
   * screen and fading. `overture` says the cover is still mounted, and it
   * goes off a little later, once it has finished fading.
   *
   * Folded into one flag, either the cover disappears on the press — the cut
   * this exists to remove — or the city does not start moving until the cover
   * has gone, which is a still frame followed by a lurch.
   */
  const [entered, setEntered] = useState(false);
  /*
   * What is typed in the header's search field.
   *
   * Up here because the field moved out of the landing card and into the bar
   * that is on every screen — so the text has to outlive the screen it was
   * typed on, which a `useState` inside Landing could not do.
   */
  const [query, setQuery] = useState('');
  /*
   * Which explanation is open beside the landing card — one of two, or none.
   *
   * ONE VALUE, NOT A FLAG EACH. Both panels take the right-hand column, and
   * two independent booleans can both be true; the second would simply cover
   * the first. As one value the impossible state cannot be written down.
   */
  const [landingPanel, setLandingPanel] = useState<LandingPanel>('how');
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
  /*
   * The before/after switch on the sunlight screen when the subject is an
   * existing building. Developments keep using the developments layer, so
   * that path is untouched; a building needs its own flag because hiding it
   * must not also hide every proposal in the city.
   */
  const [showSubject, setShowSubject] = useState(true);
  const [hasChosen, setHasChosen] = useState(
    Boolean(initial.devKey || initial.buildingId),
  );

  /** Either way of hiding the interface. */
  const chromeHidden = focusMode || walking;

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
   * The date and time controls, wrapped so that touching either retires the
   * note left by "Now in Melbourne". Handing the raw setters to the panel
   * instead left "It is 23:31 in Melbourne" sitting under a slider the reader
   * had since dragged to noon.
   */
  const chooseDate = (next: SimulationDate) => {
    setDate(next);
    setNowNote(null);
  };

  const chooseMinutes = (next: number) => {
    setMinutes(next);
    setNowNote(null);
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

  const foundBuilding = useMemo<SearchableBuilding | null>(() => {
    if (!model || !selectedBuildingId) return null;
    return model.searchable.find((b) => b.buildingId === selectedBuildingId) ?? null;
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
       */
      devKey:
        view !== 'landing' && !foundBuilding && hasChosen ? (focus?.devKey ?? null) : null,
      buildingId: view === 'landing' ? null : (foundBuilding?.buildingId ?? null),
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
  /*
   * The thing whose shadow is being measured, as a plain list of parts.
   *
   * A development carries its parts already. A building's parts are the rows
   * of the city that share its id — one scan of 4,443, only when a building
   * is actually open.
   */
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

  const windowSunlight = useMemo(() => {
    if (!windowAt || !windowSkyline) return null;
    return sunlightAtWindow(windowAt, windowSkyline, proposedSkyline, date);
  }, [windowAt, windowSkyline, proposedSkyline, date]);

  const subjectParts = useMemo(() => {
    if (foundBuilding) {
      return model
        ? model.buildings.filter((b) => b.parentId === foundBuilding.buildingId)
        : [];
    }
    return focus?.parts ?? [];
  }, [model, foundBuilding, focus]);

  const measured = useMemo(
    () =>
      receptor && subjectParts.length > 0
        ? sunlightAtPoint(receptor, groundAhdM, groundAhdM, subjectParts, date)
        : null,
    [receptor, subjectParts, date, groundAhdM],
  );

  const open = (development: Development, next: ViewName) => {
    setSelectedKey(development.devKey);
    setSelectedBuildingId(null);
    setLookAt(null);
    setHasChosen(true);
    setShowSubject(true);
    setView(next);
  };

  /** A search result: a proposal opens its page, a building lights up pink. */
  const openHit = (hit: SearchHit) => {
    if (hit.kind === 'development') {
      open(hit.development, 'development');
      return;
    }
    // Drop the previously selected proposal. Leaving it set kept its pin and
    // its name floating over a building the person had moved on from.
    setSelectedKey(null);
    setSelectedBuildingId(hit.building.buildingId);
    setLookAt({
      east: hit.building.anchorEN[0],
      north: hit.building.anchorEN[1],
      heightM: hit.building.heightM,
    });
    setHasChosen(true);
    setShowSubject(true);
    // Straight to its own page, the way a searched proposal opens on its
    // project page rather than on the map behind it.
    setView('building');
  };

  if (!model) {
    /*
     * The cover goes up FIRST, over the loading screen. That is the point of
     * it: the city takes a few seconds to build, and behind this the wait
     * happens while somebody is reading rather than while they watch a bar.
     * By the time the button is pressed the model is usually standing.
     *
     * ── WHY THIS IS `<div className="app">` AND NOT A FRAGMENT ────────────
     *
     * It must be the SAME root element the loaded branch returns, with the
     * cover in the SAME position under it. React reconciles by type and
     * position: change the root from a fragment to a div and every child is
     * torn down and rebuilt, cover included.
     *
     * The cover cannot survive that, and it is the one thing on the page that
     * must. Two consequences, and the second is the serious one:
     *
     *   The film restarted. Loading finishing — which it always does — threw
     *   away the video's progress and replayed the entrance from white,
     *   seconds in, for no reason anybody watching could have guessed at.
     *
     *   A press could be lost. Press Enter shortly before the city arrives
     *   and the replacement cover starts fresh: `leaving` false, the exit
     *   timer cancelled with the instance that owned it. `entered` stays true
     *   in App, so the camera descends — behind a cover that has come back
     *   and will now never leave, because the press it was waiting for
     *   happened to the previous one.
     */
    return (
      <div className="app">
        {overture && (
          <Overture
            onEnter={() => setEntered(true)}
            onGone={() => setOverture(false)}
            reducedMotion={reducedMotion}
          />
        )}
        <LoadingScreen progress={progress} error={error} />
      </div>
    );
  }

  const focusAddress = focus?.streetAddress.split(',')[0] ?? '';

  /*
   * There is exactly one "here" on screen at a time.
   *
   * Searching an existing building used to move the camera and the pink
   * highlight to it while "Your chosen place" and the nearby list stayed on
   * whatever development was focused — two different answers to the same
   * question, a metre apart on the same panel. The chosen place is now
   * derived once, and everything on the screen reads from it.
   */
  /** Everything after the street line: "Melbourne VIC 3000", or nothing. */
  const localityOf = (address: string) => address.split(',').slice(1).join(',').trim();

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

  /*
   * Moved below `place` so it can be told how tall the subject is.
   *
   * It read focus?.maxHeightM ?? 0, and an existing building never sets
   * focus — so the whole sunlight screen for a building described a 0 m
   * tower, dividing the shadow's reach by zero and reporting every hour of
   * every season as the longest shadow of the day.
   */
  const narrative = describeShadow(
    sun,
    place?.heightM ?? 0,
    clockLabel(minutes),
    dateLabel(date),
  );

  const cityCentreEN: [number, number] = [
    (model.extent.minE + model.extent.maxE) / 2,
    (model.extent.minN + model.extent.maxN) / 2,
  ];

  const storeys = detail ? Number.parseFloat(detail.floorsAbove) : undefined;

  return (
    <div className="app">
      {/*
        Over everything, the loading screen included. The city builds behind
        it — 4,443 roof planes and a five megabyte snapshot — so the wait
        happens while somebody is reading rather than while they watch a bar.
      */}
      {overture && (
        <Overture
          onEnter={() => setEntered(true)}
          onGone={() => setOverture(false)}
          reducedMotion={reducedMotion}
        />
      )}

      <div className="app__scene">
        <SceneCanvas
          model={model}
          focus={focus}
          sun={sun}
          /*
           * Held back until the reader asks to come in — not until the cover
           * has gone. The press releases this, and CameraRig flies the
           * difference while the cover is still fading over the top of it.
           *
           * `overture && !entered`, so a URL that skipped the cover never
           * sees the held frame and opens exactly where it always did.
           */
          approach={overture && !entered}
          showProposed={layers.developments}
          castShadows={layers.shadows}
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
          onSelectDevelopment={(development) => open(development, 'development')}
          receptor={receptor}
        /*
         * Shown whenever a window has been chosen, whichever half of the
         * panel is on screen. Somebody who picks a floor and a side has
         * asked "is this my flat?", and the answer belongs in the city
         * rather than in the panel that asked.
         */
        windowAt={windowAt}
          // Measuring only makes sense where the shadow is the subject.
          /*
            Only while armed. Undefined the rest of the time, which is what
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
          // Only the sunlight screen ever takes it away, and only when it is
          // the subject. Everywhere else a searched building is simply there.
          showHighlighted={
            view === 'sunlight' && place?.kind === 'building' ? showSubject : true
          }
          // The pin and the name follow the chosen place, whatever kind it is.
          marker={
            // Nothing to point at while the building is switched off: the pin
            // would otherwise hang in the air above the gap where it stood.
            place && !(view === 'sunlight' && place.kind === 'building' && !showSubject)
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
          // to show that it had.
          interactive={!chromeHidden}
          walking={walking}
          onLeaveStreet={() => setWalking(false)}
          /*
            Read on the wrist and moved by the controller buttons. In an
            immersive session none of the interface below exists, so the hour
            has to arrive in the scene or not at all.
          */
          timeLabel={clockLabel(minutes)}
          dateLabel={dateLabel(date)}
          onNudgeMinutes={nudgeMinutes}
          viewCommands={viewCommands}
          refit={refit}
          onStandMoved={setStandMoved}
        />
      </div>

      {/*
        Outside every focusMode guard on purpose. The map is still on screen in
        focus mode, so the credit for it has to be too — see MapAttribution.
      */}
      {/*
        Bottom right, in the one corner no panel uses. Hidden with everything
        else in focus mode and while walking — down there the wheel and the
        keys are the controls, and a floating pair of buttons is chrome the
        mode exists to remove.
      */}
      {!chromeHidden && (
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

      {!chromeHidden && layersOpen && (
        <MapLayers
          layers={layers}
          onChange={setLayers}
          onClose={() => setLayersOpen(false)}
        />
      )}

      {mapbox && <MapAttribution />}

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
              <button
                type="button"
                className="walking-hint__vr"
                onClick={() => void xrStore().enterVR()}
              >
                Enter VR
              </button>
              {/*
                Read here, because it cannot be read in there. An immersive
                session draws no DOM at all, so this is the only chance to
                say what the buttons do — there is no help screen to reach
                once the headset is on.
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
        One bar, every screen.

        It carried a "where you are" slot for a while: the city by default,
        and a back link into whatever had been opened. Both halves turned out
        to be duplicates — the city's name is on the map underneath, and
        every subject panel grew its own back link at the top of itself,
        which is nearer to hand and says where it goes.
      */}
      {!chromeHidden && (
        <Header
          query={query}
          onQuery={setQuery}
          layersOpen={layersOpen}
          /*
            How many layers are switched off. A city drawn without shadows,
            in a product about shadows, should say somewhere that it was
            asked to be — otherwise it reads as broken.
          */
          layersHidden={Number(!layers.developments) + Number(!layers.shadows)}
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
        >
          <SearchResults
            model={model}
            query={query}
            onPick={(hit) => {
              setQuery('');
              openHit(hit);
            }}
          />
        </Header>
      )}

      {!chromeHidden && view === 'landing' && (
        <>
          <Landing
            onExplore={() => setView('explore')}
            onPanel={setLandingPanel}
            panel={landingPanel}
          />
          <Legend />
        </>
      )}

      {/*
        Only on the landing screen, and only while the interface is showing.
        Every other screen has something of its own in the right-hand column,
        and leaving this open behind a search result would put two panels in
        the same place.
      */}
      {!chromeHidden && view === 'explore' && (
        <>
          {/*
            One panel. The layer list that used to sit above this moved to
            the header — see MapLayers — so this screen is about one thing:
            what is being built around the place in question.
          */}
          <NearbyProjects
            anchorEN={place?.anchorEN ?? cityCentreEN}
            label={place?.label ?? 'City centre'}
            excludeDevId={place?.devId}
            developments={model.developments}
            showProposed={layers.developments}
            onShowProposed={(next) => setLayers({ ...layers, developments: next })}
            onOpen={(development) => open(development, 'development')}
            onClose={() => setView('landing')}
          />
        </>
      )}

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
            showProposed={place.kind === 'building' ? showSubject : layers.developments}
            onShowProposed={(next: boolean) =>
              place.kind === 'building'
                ? setShowSubject(next)
                : setLayers({ ...layers, developments: next })
            }
            onTab={(next) => {
              if (next !== 'overview') return;
              setChoosing(false);
              setView(place.kind === 'building' ? 'building' : 'development');
            }}
            onBack={() => {
              setChoosing(false);
              setView('explore');
            }}
            onClose={() => {
              setChoosing(false);
              setView('landing');
            }}
          />
          <SunChip
            timeLabel={clockLabel(minutes)}
            compass={compassLabel(sun.azimuthDeg)}
            visible={sun.altitudeDeg > 0}
          />
          <TimeBar
            minutes={minutes}
            onChange={chooseMinutes}
            min={EARLIEST_MINUTES}
            max={LATEST_MINUTES}
            label={clockLabel(minutes)}
            caption={narrative.caption}
            daylight={daylight}
          />
        </>
      )}
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

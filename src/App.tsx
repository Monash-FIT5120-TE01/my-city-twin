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

import { useEffect, useMemo, useState } from 'react';
import { SceneCanvas } from './scene/SceneCanvas';
import { compassLabel } from './scene/sun';
import { describeShadow } from './scene/narrative';
import { sunlightAtPoint } from './scene/sunlightAt';
import { groundElevationOf } from './scene/massing';
import { civilToInstant, dateLabel, solarPosition, type SimulationDate } from './scene/solar';
import { SITE } from './scene/frame';
import { useCityModel } from './data/useCityModel';
import { useDevelopmentDetail } from './data/useDevelopmentDetail';
import { useBuildingDetail } from './data/useBuildingDetail';
import { LoadingScreen } from './ui/LoadingScreen';
import { Crumbs, Nav, SunChip } from './ui/chrome';
import {
  BackToSearch,
  DevelopmentPanel,
  ExistingApprovedToggle,
  Landing,
  LayerPanel,
  NarrativeCard,
  NearbyProjects,
  BuildingPanel,
  SunlightAtCard,
  SunlightPanel,
  TimeBar,
  type Layers,
} from './ui/screens';
import { readUrlState, writeUrlState, type ViewName } from './data/urlState';
import type { Development, SearchableBuilding } from './data/model';
import { shortAddress, type SearchHit } from './data/search';
import './styles/ui.css';

/** Minutes since midnight, local Melbourne time. */
const DAY_START = 6 * 60;
const DAY_END = 20 * 60;

const clockLabel = (minutes: number) =>
  `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

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
  const [focusMode, setFocusMode] = useState(false);
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

  // Escape leaves focus mode, because there is nothing else on screen to
  // click and a viewer who cannot find the way out is stuck.
  useEffect(() => {
    if (!focusMode) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setFocusMode(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [focusMode]);

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
    return <LoadingScreen progress={progress} error={error} />;
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
  const place: {
    label: string;
    anchorEN: [number, number];
    kind: 'development' | 'building';
    detail: string;
    topAhdM: number;
    /** Drives the shadow narrative, which cannot describe a 0 m subject. */
    heightM: number;
    devId?: string;
  } | null = foundBuilding
    ? {
        label: shortAddress(foundBuilding.streetAddress),
        anchorEN: foundBuilding.anchorEN,
        kind: 'building',
        detail: `Existing building · ${foundBuilding.heightM.toFixed(0)} m tall`,
        topAhdM: foundBuilding.topAhdM,
        heightM: foundBuilding.heightM,
      }
    : hasChosen && focus
      ? {
          label: focusAddress,
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
      <div className="app__scene">
        <SceneCanvas
          model={model}
          focus={focus}
          sun={sun}
          showProposed={layers.developments}
          castShadows={layers.shadows}
          showSunArrow={view === 'sunlight' && layers.shadows}
          // On the sunlight screen only the subject casts, so its shadow is
          // the one being read rather than one of forty-nine.
          showAllProposals={view !== 'sunlight'}
          onSelectDevelopment={(development) => open(development, 'development')}
          receptor={receptor}
          // Measuring only makes sense where the shadow is the subject.
          onPickReceptor={view === 'sunlight' && !focusMode ? setReceptor : undefined}
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
          interactive={!focusMode}
        />
      </div>

      {!focusMode && <Nav onHome={() => setView('landing')} />}

      {!focusMode && view === 'landing' && (
        <Landing
          model={model}
          onExplore={() => setView('explore')}
          onPick={openHit}
        />
      )}

      {!focusMode && view === 'explore' && (
        <>
          <LayerPanel
            eyebrow="Explore the CBD"
            layers={layers}
            onChange={setLayers}
          >
            <BackToSearch onBack={() => setView('landing')} />
            <h2 className="panel__title">
              {place ? 'Your chosen place' : 'The whole CBD'}
            </h2>
            {place ? (
              <p
                className={`chosen${place.kind === 'building' ? ' chosen--found' : ''}`}
                aria-live="polite"
              >
                {place.label}
                <span>{place.detail}</span>
              </p>
            ) : (
              <p className="chosen chosen--empty" aria-live="polite">
                No place chosen
                <span>
                  Search an address, or click any green building to open its
                  project.
                </span>
              </p>
            )}
            {/*
              The map page would otherwise be a dead end: a proposal could be
              reopened by clicking its massing, but a building's own page had
              no route back to it at all except searching again.
            */}
            {place && (
              <button
                type="button"
                className="button button--block"
                onClick={() => setView(place.kind === 'building' ? 'building' : 'development')}
              >
                {place.kind === 'building' ? 'View this building' : 'View this project'}
              </button>
            )}
            {place?.kind === 'building' && (
              <button
                type="button"
                className="button button--ghost button--block"
                onClick={() => {
                  // Clears the highlight only. The camera stays where it is,
                  // and nothing takes this building's place.
                  setSelectedBuildingId(null);
                  setHasChosen(false);
                }}
              >
                Clear this search result
              </button>
            )}
            <ExistingApprovedToggle
              showProposed={layers.developments}
              onChange={(next) => setLayers({ ...layers, developments: next })}
            />
          </LayerPanel>
          {/*
            The map page answers "what is around here" for either kind of
            place. What the place itself IS belongs on its own page — the
            project page for a proposal, the building page for a building —
            which is the split a proposal already had.
          */}
          <NearbyProjects
            anchorEN={place?.anchorEN ?? cityCentreEN}
            label={place?.label ?? 'the city centre'}
            excludeDevId={place?.devId}
            developments={model.developments}
            onOpen={(development) => open(development, 'development')}
          />
          <p className="hint">Left drag to pan · Right drag to orbit · Scroll to zoom</p>
        </>
      )}

      {!focusMode && view === 'development' && focus && (
        <>
          <Crumbs
            trail={[{ label: 'Map', to: 'explore' }, { label: focusAddress }]}
            onNavigate={() => setView('explore')}
          />
          <LayerPanel eyebrow="Visible in this view" layers={layers} onChange={setLayers} />
          <DevelopmentPanel
            development={focus}
            storeys={Number.isFinite(storeys) ? storeys : undefined}
            onSunlight={() => setView('sunlight')}
          />
          <p className="disclaimer">Demo data · not a legal conclusion</p>
        </>
      )}

      {!focusMode && view === 'building' && foundBuilding && place && (
        <>
          <Crumbs
            trail={[{ label: 'Map', to: 'explore' }, { label: place.label }]}
            onNavigate={() => setView('explore')}
          />
          <LayerPanel eyebrow="Visible in this view" layers={layers} onChange={setLayers} />
          <BuildingPanel
            label={place.label}
            heightM={foundBuilding.heightM}
            detail={buildingDetail}
            settled={buildingSettled}
            onSunlight={() => setView('sunlight')}
          />
          <p className="disclaimer">Demo data · not a legal conclusion</p>
        </>
      )}

      {!focusMode && view === 'sunlight' && place && (
        <>
          {measured && (
            <SunlightAtCard
              result={measured}
              dateLabel={dateLabel(date)}
              onClear={() => setReceptor(null)}
              subjectKind={place.kind}
            />
          )}
          <Crumbs
            trail={[
              {
                label: place.label,
                to: place.kind === 'building' ? 'building' : 'development',
              },
              { label: 'Sunlight' },
            ]}
            onNavigate={() =>
              setView(place.kind === 'building' ? 'building' : 'development')
            }
          />
          <SunlightPanel
            date={date}
            onDate={setDate}
            subjectKind={place.kind}
            showProposed={place.kind === 'building' ? showSubject : layers.developments}
            onShowProposed={(next) =>
              place.kind === 'building'
                ? setShowSubject(next)
                : setLayers({ ...layers, developments: next })
            }
          />
          <SunChip
            timeLabel={clockLabel(minutes)}
            compass={compassLabel(sun.azimuthDeg)}
            visible={sun.altitudeDeg > 0}
          />
          <NarrativeCard narrative={narrative} />
          <TimeBar
            minutes={minutes}
            onChange={setMinutes}
            min={DAY_START}
            max={DAY_END}
            label={clockLabel(minutes)}
            caption={narrative.caption}
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
      ) : (
        <button
          type="button"
          className="focus-toggle"
          onClick={() => setFocusMode(true)}
        >
          <svg width="15" height="15" viewBox="0 0 15 15" aria-hidden="true">
            <path
              d="M1 5V1h4M10 1h4v4M14 10v4h-4M5 14H1v-4"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
          Focus mode
        </button>
      )}
    </div>
  );
}

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
   */
  const [foundBuilding, setFoundBuilding] = useState<SearchableBuilding | null>(null);
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
  const [hasChosen, setHasChosen] = useState(Boolean(initial.devKey));

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

  // A link to a screen that needs a development, with no development in it,
  // has nothing to show. Fall back rather than render nothing at all.
  useEffect(() => {
    if (!model) return;
    if ((view === 'development' || view === 'sunlight') && !focus) setView('explore');
  }, [model, view, focus]);

  // Keep the address bar in step, so the view on screen is always the view a
  // shared link reopens.
  useEffect(() => {
    writeUrlState({
      view,
      devKey: view === 'landing' ? null : (focus?.devKey ?? null),
      date,
      minutes,
      receptor,
    });
  }, [view, focus, date, minutes, receptor]);

  // Only requested once a project is actually open, so the landing screen
  // never waits on a sleeping API.
  const detail = useDevelopmentDetail(
    view === 'development' || view === 'sunlight' ? (focus?.devId ?? null) : null,
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
  const measured = useMemo(
    () => (receptor && focus ? sunlightAtPoint(receptor, groundAhdM, focus, date) : null),
    [receptor, focus, date, groundAhdM],
  );

  const open = (development: Development, next: ViewName) => {
    setSelectedKey(development.devKey);
    setFoundBuilding(null);
    setLookAt(null);
    setHasChosen(true);
    setView(next);
  };

  /** A search result: a proposal opens its page, a building lights up pink. */
  const openHit = (hit: SearchHit) => {
    if (hit.kind === 'development') {
      open(hit.development, 'development');
      return;
    }
    setFoundBuilding(hit.building);
    setLookAt({
      east: hit.building.anchorEN[0],
      north: hit.building.anchorEN[1],
      heightM: hit.building.heightM,
    });
    setHasChosen(true);
    setView('explore');
  };

  if (!model) {
    return <LoadingScreen progress={progress} error={error} />;
  }

  const narrative = describeShadow(
    sun,
    focus?.maxHeightM ?? 0,
    clockLabel(minutes),
    dateLabel(date),
  );

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
    devId?: string;
  } | null = foundBuilding
    ? {
        label: shortAddress(foundBuilding.streetAddress),
        anchorEN: foundBuilding.anchorEN,
        kind: 'building',
        detail: `Existing building · ${foundBuilding.heightM.toFixed(0)} m tall`,
      }
    : hasChosen && focus
      ? {
          label: focusAddress,
          anchorEN: focus.anchorEN,
          kind: 'development',
          detail: `Approved development · ${focus.maxHeightM.toFixed(0)} m`,
          devId: focus.devId,
        }
      : // Nothing chosen — either nobody has picked anything yet, or a search
        // result was just cleared. Saying so is the honest answer; quietly
        // substituting the default development is what made "Clear" look
        // like it had selected a different building.
        null;

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
            {place?.kind === 'building' && (
              <button
                type="button"
                className="button button--ghost button--block"
                onClick={() => {
                  // Clears the highlight only. The camera stays where it is,
                  // and nothing takes this building's place.
                  setFoundBuilding(null);
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

      {!focusMode && view === 'sunlight' && focus && (
        <>
          {measured && (
            <SunlightAtCard
              result={measured}
              dateLabel={dateLabel(date)}
              onClear={() => setReceptor(null)}
            />
          )}
          <Crumbs
            trail={[{ label: focusAddress, to: 'development' }, { label: 'Sunlight' }]}
            onNavigate={() => setView('development')}
          />
          <SunlightPanel
            date={date}
            onDate={setDate}
            showProposed={layers.developments}
            onShowProposed={(next) => setLayers({ ...layers, developments: next })}
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

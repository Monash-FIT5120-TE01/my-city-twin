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

/**
 * The development the demonstration opens on: 640–652 Bourke Street.
 * Real, approved, and a podium-plus-tower massing — which is what the Figma
 * shows. The Figma's own address, 435 Bourke Street, does not exist in the
 * Development Activity Monitor.
 */
const DEMO_DEV_KEY = 'X0015700';

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

  const focus = useMemo<Development | null>(() => {
    if (!model) return null;
    if (selectedKey) {
      const chosen = model.developments.find((d) => d.devKey === selectedKey);
      if (chosen) return chosen;
    }
    return (
      model.developments.find((d) => d.devKey === DEMO_DEV_KEY) ??
      model.developments[0] ??
      null
    );
  }, [model, selectedKey]);

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
    setView(next);
  };

  /** A search result: a proposal opens its page, a building lights up pink. */
  const openHit = (hit: SearchHit) => {
    if (hit.kind === 'development') {
      open(hit.development, 'development');
      return;
    }
    setFoundBuilding(hit.building);
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
          lookAt={
            foundBuilding
              ? {
                  east: foundBuilding.anchorEN[0],
                  north: foundBuilding.anchorEN[1],
                  heightM: foundBuilding.heightM,
                }
              : null
          }
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

      {!focusMode && view === 'explore' && focus && (
        <>
          <LayerPanel
            eyebrow="Explore the CBD"
            layers={layers}
            onChange={setLayers}
          >
            <h2 className="panel__title">Your chosen place</h2>
            <p className="chosen">{focusAddress}</p>
            <ExistingApprovedToggle
              showProposed={layers.developments}
              onChange={(next) => setLayers({ ...layers, developments: next })}
            />
          </LayerPanel>
          <NearbyProjects
            around={focus}
            developments={model.developments}
            onOpen={(development) => open(development, 'development')}
          />
          {foundBuilding && (
            <aside className="found" aria-live="polite">
              <div className="found__head">
                <p className="panel__eyebrow">Search result</p>
                <button
                  type="button"
                  className="measure__close"
                  onClick={() => setFoundBuilding(null)}
                  aria-label="Clear the highlighted building"
                >
                  ×
                </button>
              </div>
              <p className="found__address">{shortAddress(foundBuilding.streetAddress)}</p>
              <p className="found__meta">
                Existing building · {foundBuilding.heightM.toFixed(0)} m tall
              </p>
            </aside>
          )}
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

/*
 * ─────────────────────────────────────────────────────────────────────────
 * THE PANELS
 * ─────────────────────────────────────────────────────────────────────────
 *
 * WHAT THIS FILE IS
 *   Every panel that floats over the 3D view, in the order a person meets
 *   them: Landing, the layer list, the nearby-projects list, the project
 *   detail, the sunlight controls, the time bar, and the two cards that
 *   report what the shadow is doing.
 *
 * WHY THEY FLOAT
 *   The thing being explained is behind the glass. A full-width page would
 *   cover the city, and the city is the argument — so every panel is a card
 *   on top of a view that never goes away.
 *
 * WHAT THESE COMPONENTS DO NOT DO
 *   They hold no state of their own beyond the landing search box. Each is
 *   given what to show and a function to call. That is what lets the same
 *   layer list appear on two different screens without either screen
 *   knowing about the other.
 *
 * WHERE THE WORDS CAME FROM
 *   Mostly the Figma. Two deliberate departures, both because the design
 *   promises something the data cannot support yet:
 *
 *     - the shadow sentences do not name a protected public space, because
 *       there is no protected-space data (user story 1.3);
 *     - the layer list shows "Protected public space", "Construction" and
 *       "Environment" locked rather than working, because nothing is behind
 *       them. A named padlock is more honest than a tick box that does
 *       nothing.
 */

import { useMemo, useState } from 'react';
import type { CityModel, Development } from '../data/model';
import {
  SEASONS,
  fromDateInput,
  matchingSeason,
  toDateInput,
  type SimulationDate,
} from '../scene/solar';
import type { ShadowNarrative } from '../scene/narrative';
import type { SunlightAtPoint } from '../scene/sunlightAt';
import { StatusBadge, developmentSummary } from './chrome';
import { searchCity, type SearchHit } from '../data/search';
import type { BuildingDetail } from '../data/useBuildingDetail';

/**
 * Back to the search box.
 *
 * The explore screen is the one screen with no breadcrumb — the design does
 * not show one there — so until now the only way back to the search was the
 * brand mark in the corner, which nobody reads as a button. Somebody who has
 * looked up one address and wants to look up another needs a way out that is
 * where they are already looking.
 */
export function BackToSearch({ onBack }: { onBack: () => void }) {
  return (
    <button type="button" className="panel__back" onClick={onBack}>
      <svg width="15" height="12" viewBox="0 0 15 12" aria-hidden="true">
        <path
          d="M6 1 L1 6 L6 11 M1 6 H14"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      Search another address
    </button>
  );
}

/** Marks a layer that is named in the design but has no data behind it. */
function Padlock() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true" className="layers__lock">
      <rect x="3.5" y="7.8" width="11" height="7.7" rx="1.8" fill="currentColor" />
      <path
        d="M6.2 7.8V5.9a2.8 2.8 0 0 1 5.6 0v1.9"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
      />
    </svg>
  );
}

/* ── 01 Landing ─────────────────────────────────────────── */

export function Landing({
  model,
  onExplore,
  onPick,
}: {
  model: CityModel;
  onExplore: () => void;
  onPick: (hit: SearchHit) => void;
}) {
  const [query, setQuery] = useState('');
  const matches = useMemo(() => searchCity(model, query), [query, model]);
  const searching = query.trim().length >= 2;

  return (
    <section className="landing">
      <p className="panel__eyebrow">Melbourne Twin · Demo data</p>
      <h1 className="landing__title">See tomorrow&rsquo;s CBD before it&rsquo;s built.</h1>
      <p className="landing__body">
        Explore approved developments in a living 3D model of Melbourne CBD.
        Follow sunlight and project history in plain English.
      </p>

      <label className="field">
        <svg width="17" height="17" viewBox="0 0 17 17" aria-hidden="true">
          <circle cx="7" cy="7" r="5.4" fill="none" stroke="#8b929a" strokeWidth="1.7" />
          <line x1="11" y1="11" x2="15.4" y2="15.4" stroke="#8b929a" strokeWidth="1.7" strokeLinecap="round" />
        </svg>
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search any address in the CBD…"
          aria-label="Search for a street or address"
        />
      </label>

      {searching && matches.length > 0 && (
        <div className="results" role="listbox" aria-label="Search results">
          {matches.map((hit) => (
            <button
              key={hit.kind === 'building' ? hit.building.buildingId : hit.development.devId}
              type="button"
              role="option"
              aria-selected="false"
              onClick={() => onPick(hit)}
            >
              <span className={`results__kind results__kind--${hit.kind}`} />
              {hit.label}
              <small>{hit.detail}</small>
            </button>
          ))}
        </div>
      )}

      {searching && matches.length === 0 && (
        <p className="results__none">
          Nothing matches that. {model.searchable.length.toLocaleString()} buildings
          and {model.developments.length} approved projects can be searched by
          address; some older buildings have no address on record.
        </p>
      )}

      <div className="landing__actions">
        <button type="button" className="button" onClick={onExplore}>
          Explore the CBD
        </button>
        <button type="button" className="button button--ghost" disabled>
          How it works
        </button>
      </div>

      <p className="landing__fine">
        Illustrative demo only. Not a legal compliance conclusion.
      </p>
      <p className="landing__soon">
        <span>Construction · Coming soon</span>
        <span>Environment · Coming soon</span>
      </p>
    </section>
  );
}

/* ── 02 Discovery Map ───────────────────────────────────── */

export interface Layers {
  developments: boolean;
  shadows: boolean;
}

export function LayerPanel({
  layers,
  onChange,
  eyebrow,
  children,
}: {
  layers: Layers;
  onChange: (next: Layers) => void;
  eyebrow: string;
  children?: React.ReactNode;
}) {
  return (
    <aside className="panel panel--left">
      <p className="panel__eyebrow">{eyebrow}</p>
      {children}

      <div className="layers">
        <label className="layers__item">
          <input
            type="checkbox"
            checked={layers.developments}
            onChange={(e) => onChange({ ...layers, developments: e.target.checked })}
          />
          Approved developments
        </label>
        <label className="layers__item">
          <input
            type="checkbox"
            checked={layers.shadows}
            onChange={(e) => onChange({ ...layers, shadows: e.target.checked })}
          />
          Sunlight &amp; shadows
        </label>
        {/*
          The remaining three layers are named because the Figma names them,
          and disabled because nothing behind them exists yet: protected space
          is user story 1.3, and construction and environment are Epics 2 and
          3. Showing an empty layer would be worse than showing a locked one.
        */}
        {(['Protected public space', 'Construction', 'Environment'] as const).map((name) => (
          <span className="layers__item" data-locked="true" key={name} aria-disabled="true">
            <Padlock />
            {name}
            <span className="visually-hidden"> — not available in this iteration</span>
          </span>
        ))}
      </div>
    </aside>
  );
}

export function ExistingApprovedToggle({
  showProposed,
  onChange,
}: {
  showProposed: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <div className="segmented" role="group" aria-label="City model">
      <button
        type="button"
        aria-pressed={!showProposed}
        onClick={() => onChange(false)}
        data-label="Existing City"
      >
        Existing City
      </button>
      <button
        type="button"
        aria-pressed={showProposed}
        onClick={() => onChange(true)}
        data-label="Approved Plan"
      >
        Approved Plan
      </button>
    </div>
  );
}

/**
 * The approved projects nearest wherever the person currently is.
 *
 * It takes a plain point and a label rather than a Development, because the
 * chosen place can now be an existing building found by searching. Passing a
 * Development meant this list stayed anchored to a proposal while the camera
 * and the highlight had moved somewhere else — two different "here" on one
 * screen.
 */
export function NearbyProjects({
  anchorEN,
  label,
  excludeDevId,
  developments,
  onOpen,
}: {
  anchorEN: [number, number];
  label: string;
  /** Omit the project itself when the chosen place IS a project. */
  excludeDevId?: string;
  developments: Development[];
  onOpen: (development: Development) => void;
}) {
  const nearby = useMemo(() => {
    return developments
      .filter((d) => d.devId !== excludeDevId)
      .map((d) => ({
        development: d,
        distance: Math.hypot(d.anchorEN[0] - anchorEN[0], d.anchorEN[1] - anchorEN[1]),
      }))
      .sort((a, b) => a.distance - b.distance)
      .slice(0, 3);
  }, [developments, anchorEN, excludeDevId]);

  return (
    <aside className="panel panel--right">
      <p className="panel__eyebrow">{nearby.length} nearby projects</p>
      <h2 className="panel__title">Around {label}</h2>

      <div className="cards">
        {nearby.map(({ development, distance }) => (
          <article key={development.devId} className="card">
            <StatusBadge status={development.status} />
            <h3 className="card__title">{development.streetAddress.split(',')[0]}</h3>
            <p className="card__meta">{developmentSummary(development)}</p>
            <p className="card__stamp">
              {Math.round(distance)} m away · Demo data
            </p>
            <button
              type="button"
              className="button button--ghost"
              onClick={() => onOpen(development)}
            >
              View project
            </button>
          </article>
        ))}
      </div>
    </aside>
  );
}

/* ── 03 Development Overview ────────────────────────────── */

export function DevelopmentPanel({
  development,
  storeys,
  onSunlight,
}: {
  development: Development;
  storeys?: number;
  onSunlight: () => void;
}) {
  const tallest = development.parts.reduce((a, b) => (a.heightM > b.heightM ? a : b));
  const others = development.parts.filter((p) => p !== tallest);

  return (
    <aside className="panel panel--right">
      <StatusBadge status={development.status} />
      <h2 className="panel__title">{development.streetAddress.split(',')[0]}</h2>
      <p className="card__meta">{developmentSummary(development, storeys)}</p>

      <div className="tabs" role="tablist">
        <button type="button" role="tab" aria-selected="true">
          Overview
        </button>
        <button type="button" role="tab" aria-selected="false" onClick={onSunlight}>
          Sunlight
        </button>
        <button type="button" role="tab" aria-selected="false" disabled>
          Protection
        </button>
        <button type="button" role="tab" aria-selected="false" disabled>
          History
        </button>
      </div>

      <div className="note">
        <span className="note__heading">What changes here</span>
        <ul>
          <li>
            {tallest.shapeType === 'tower' ? 'A tower' : 'A structure'} of{' '}
            {tallest.heightM.toFixed(0)} m, topping out at{' '}
            {tallest.topAhdM.toFixed(0)} m above the datum.
          </li>
          {others.length > 0 && (
            <li>
              With {others.length} further component{others.length > 1 ? 's' : ''}:{' '}
              {others.map((p) => `${p.shapeType} ${p.heightM.toFixed(0)} m`).join(', ')}.
            </li>
          )}
          {development.landUses.length > 0 && (
            <li>
              {development.landUses
                .slice(0, 3)
                .map((use) => `${use.quantity.toLocaleString()} ${use.useType.toLowerCase()}`)
                .join(', ')}
              .
            </li>
          )}
          <li>Shadow available for four seasonal dates · Demo data.</li>
        </ul>
      </div>

      <button type="button" className="button button--block" onClick={onSunlight}>
        Explore sunlight impact
      </button>
    </aside>
  );
}

/* ── Sunlight simulation ────────────────────────────────── */

export function SunlightPanel({
  date,
  onDate,
  showProposed,
  onShowProposed,
}: {
  date: SimulationDate;
  onDate: (next: SimulationDate) => void;
  showProposed: boolean;
  onShowProposed: (next: boolean) => void;
}) {
  // The four presets are shortcuts onto the same date, so a preset reads as
  // selected only while the date actually is that date.
  const preset = matchingSeason(date);
  return (
    <aside className="panel panel--left">
      <p className="panel__eyebrow">Sunlight simulation</p>
      <h2 className="panel__title">Follow the shadow</h2>
      <p className="panel__body">
        Choose a date and time to see how the approved building changes
        sunlight across nearby streets and public space.
      </p>

      <div className="datebox">
        <label className="datebox__head">
          <span>Simulation date</span>
          {/*
            The input is the control and the readout at once. Showing the date
            twice — once as a heading, once in the field — would leave two
            things to keep in step and one of them looking authoritative.
          */}
          <input
            type="date"
            value={toDateInput(date)}
            onChange={(event) => {
              const next = fromDateInput(event.target.value);
              if (next) onDate(next);
            }}
            aria-label="Simulation date"
          />
        </label>
        <div className="segmented segmented--four" role="group" aria-label="Season">
          {SEASONS.map((option) => (
            <button
              key={option.key}
              type="button"
              aria-pressed={option.key === preset?.key}
              onClick={() => onDate({ year: date.year, month: option.month, day: option.day })}
              data-label={option.label}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <ExistingApprovedToggle showProposed={showProposed} onChange={onShowProposed} />

      <p className="note">
        <span className="note__heading">Measure a spot</span>
        Click anywhere on the ground to see how much direct sun this
        development takes from that point across the day.
      </p>

      <p className="note note--caution">
        <span className="note__heading">Illustrative shadow model</span>
        This prototype explains modelled change. It does not determine planning
        or legal compliance.
      </p>
    </aside>
  );
}

export function TimeBar({
  minutes,
  onChange,
  min,
  max,
  label,
  caption,
}: {
  minutes: number;
  onChange: (next: number) => void;
  min: number;
  max: number;
  label: string;
  caption: string;
}) {
  return (
    <div className="timebar">
      <div className="timebar__slider">
        <div className="timebar__head">
          <span>Sunlight time</span>
          <b>{label}</b>
        </div>
        <input
          type="range"
          min={min}
          max={max}
          step={10}
          value={minutes}
          onChange={(e) => onChange(Number(e.target.value))}
          aria-label="Time of day"
          // Without this a screen reader reads "900", not "15:00".
          aria-valuetext={label}
          // Feeds the amber fill on the track; CSS cannot read a range value.
          style={
            {
              '--fill': `${((minutes - min) / (max - min)) * 100}%`,
            } as React.CSSProperties
          }
        />
      </div>
      <div className="timebar__readout">
        <b>{label}</b>
        <span>{caption}</span>
      </div>
    </div>
  );
}

/**
 * "What is happening at this time", bottom right.
 *
 * The Figma's own wording names a protected public space. That data does not
 * exist yet (user story 1.3), so the sentence is generated from the shadow
 * geometry instead — see scene/narrative.ts for why an invented forecourt was
 * not an option.
 */
export function NarrativeCard({ narrative }: { narrative: ShadowNarrative }) {
  return (
    <aside className="narrative" aria-live="polite">
      <p className="narrative__stamp">{narrative.stamp}</p>
      <p className="narrative__sentence">{narrative.sentence}</p>
      <p className="narrative__provenance">{narrative.provenance}</p>
    </aside>
  );
}

/**
 * What the proposal costs one spot on the footpath.
 *
 * The figure is the DIFFERENCE the development makes, not the sun that place
 * gets — see scene/sunlightAt.ts. Stating it as a difference is also the only
 * honest framing: the surrounding city and the terrain are modelled well
 * enough to answer "what does this tower change", and not well enough to
 * answer "how sunny is this spot".
 */
export function SunlightAtCard({
  result,
  dateLabel,
  onClear,
}: {
  result: SunlightAtPoint;
  dateLabel: string;
  onClear: () => void;
}) {
  const hours = (minutes: number) => {
    const h = Math.floor(minutes / 60);
    const m = minutes % 60;
    if (h === 0) return `${m} min`;
    return m === 0 ? `${h} h` : `${h} h ${m} min`;
  };

  return (
    <aside className="measure" aria-live="polite">
      <div className="measure__head">
        <p className="panel__eyebrow">At this spot · {dateLabel}</p>
        <button type="button" className="measure__close" onClick={onClear} aria-label="Clear the measured point">
          ×
        </button>
      </div>

      {result.lostMin === 0 ? (
        <p className="measure__headline measure__headline--none">
          This development takes no direct sun from here.
        </p>
      ) : (
        <>
          <p className="measure__headline">{hours(result.lostMin)}</p>
          <p className="measure__caption">
            less direct sun, out of {hours(result.withoutProposalMin)} the sun is up
          </p>
          {result.firstShadowLabel && (
            <dl className="stat-row">
              <dt>In shadow around</dt>
              <dd>
                {result.firstShadowLabel} – {result.lastShadowLabel}
              </dd>
            </dl>
          )}
        </>
      )}

      <p className="measure__note">
        How much of an otherwise clear sky this development blocks — sampled
        every {result.stepMinutes} minutes. Existing buildings and the slope of
        the ground are not counted, so a spot already in someone else&rsquo;s
        shadow will still be shown losing sun here.
      </p>
    </aside>
  );
}

/**
 * What is known about one existing building.
 *
 * The counterpart to DevelopmentPanel. Until now a searched building got the
 * nearby-projects list and nothing about itself, so the one thing a resident
 * had actually asked about was the one thing the screen would not describe.
 *
 * It deliberately has no "explore sunlight impact". That screen answers what
 * a PROPOSAL changes, and it works by comparing the city with and without
 * one. An existing building has no before and after — it is the before.
 */
export function BuildingPanel({
  label,
  heightM,
  anchorEN,
  detail,
  developments,
  onOpenDevelopment,
}: {
  label: string;
  /** From the massing, so a height shows even before the record arrives. */
  heightM: number;
  anchorEN: [number, number];
  detail: BuildingDetail | null;
  developments: Development[];
  onOpenDevelopment: (development: Development) => void;
}) {
  // Same rule as NearbyProjects: the three closest proposals. User Story 1.1
  // is still served from this panel, just no longer instead of the building.
  const nearest = useMemo(
    () =>
      developments
        .map((d) => ({
          development: d,
          distance: Math.hypot(d.anchorEN[0] - anchorEN[0], d.anchorEN[1] - anchorEN[1]),
        }))
        .sort((a, b) => a.distance - b.distance)
        .slice(0, 3),
    [developments, anchorEN],
  );

  const facts: { label: string; value: string }[] = [];

  if (detail?.floorsAboveGround) {
    facts.push({ label: 'Storeys', value: String(detail.floorsAboveGround) });
  }
  facts.push({ label: 'Height', value: `${heightM.toFixed(0)} m` });
  if (detail?.constructionYear) {
    facts.push({ label: 'Built', value: String(detail.constructionYear) });
  }
  if (detail?.refurbishedYear) {
    facts.push({ label: 'Refurbished', value: String(detail.refurbishedYear) });
  }
  // Zero is worth showing — "no bicycle parking" is a fact about a building.
  if (detail?.bicycleSpaces !== null && detail?.bicycleSpaces !== undefined) {
    facts.push({ label: 'Bicycle spaces', value: String(detail.bicycleSpaces) });
  }

  return (
    <aside className="panel panel--right">
      <span className="badge badge--existing">Existing</span>
      <h2 className="panel__title">{detail?.buildingName ?? label}</h2>
      {/*
        The address often already contains the name — the footprint data has
        "Pegasus Apartment Hotel 206-216 A'Beckett Street" as the address —
        so the address is only worth repeating when it adds something.
      */}
      {detail?.buildingName && !label.includes(detail.buildingName) && (
        <p className="card__meta">{label}</p>
      )}
      {detail?.predominantUse && (
        <p className="card__meta">Mainly {detail.predominantUse.toLowerCase()}</p>
      )}

      <dl className="facts">
        {facts.map((fact) => (
          <div key={fact.label}>
            <dt>{fact.label}</dt>
            <dd>{fact.value}</dd>
          </div>
        ))}
      </dl>

      {!detail && (
        <p className="card__meta">
          Loading what the property record says about this building…
        </p>
      )}

      <div className="note">
        <span className="note__heading">This is an existing building</span>
        It is standing today, and it casts a shadow in this model like every
        other building. It is not a proposal, so there is nothing to compare
        it against.
      </div>

      {nearest.length > 0 && (
        <>
          <p className="panel__eyebrow">Approved projects nearby</p>
          <div className="cards">
            {nearest.map(({ development, distance }) => (
              <article key={development.devId} className="card">
                <StatusBadge status={development.status} />
                <h3 className="card__title">{development.streetAddress.split(',')[0]}</h3>
                <p className="card__meta">{developmentSummary(development)}</p>
                <p className="card__stamp">{Math.round(distance)} m away</p>
                <button
                  type="button"
                  className="button button--ghost"
                  onClick={() => onOpenDevelopment(development)}
                >
                  View project
                </button>
              </article>
            ))}
          </div>
        </>
      )}

      {detail?.censusYear && (
        <p className="measure__note">
          Property record from the {detail.censusYear} City of Melbourne census.
          Building outline from Building Footprints 2023.
        </p>
      )}
    </aside>
  );
}

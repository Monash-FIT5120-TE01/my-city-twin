/*
 * ─────────────────────────────────────────────────────────────────────────
 * STREET ACTIVITY: THE COLUMN
 * ─────────────────────────────────────────────────────────────────────────
 *
 * The left column of the street activity screen, the same full-height cream
 * column as the sunlight and solar screens. From the top:
 *
 *   - the CBD's weather for the hour on the map — forecast hours only; for
 *     a recorded hour, the next forecast hour, said as such;
 *   - with no counter chosen: the whole CBD at this hour (how many report,
 *     how many are quiet, moderate and busy), the counters ranked, and the
 *     counters with no level of their own, listed by name;
 *   - with one chosen: its count and level, its day as bars, and "Plan a
 *     visit" — the forecast's best hours for a walk there;
 *   - what the data is, where it comes from, and whether this is the live
 *     answer or the copy that ships with the app.
 *
 * Every level is said in words beside the count. The swatches and the bars'
 * shades only repeat the words (activityPalette.ts), and a forecast bar is
 * told from a recorded one by its outline, not its colour.
 */
import { useCallback, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { createPortal } from 'react-dom';
import { Icon } from './kit/Icon';
import { BackLink } from './kit/BackLink';
import {
  dayCurve,
  melbourneClock,
  modeAt,
  nextForecastHour,
  OUTDOOR_LIMITS,
  ranked,
  readingsAt,
  searchSensors,
  suggestHours,
  summarise,
  weatherAt,
  type ActivityLevel,
  type ActivitySensor,
  type Reading,
  type StreetActivity,
} from '../data/streetActivity';
import type { StreetActivityState } from '../data/useStreetActivity';
import { ACTIVITY_LEVELS, ACTIVITY_WORDS, LEVEL_BARS, rampColour } from '../scene/activityPalette';
import { countLabel, dayLabel, hourLabel, whenLabel } from './activityFormat';

/** How many of the ranking show before "View all locations". */
const TOP = 3;

const MODE_WORDS = { recorded: 'Recorded', forecast: 'Forecast' } as const;

/**
 * A level's mark: three bars, one filled for quiet, two for moderate,
 * three for busy — a count of filled bars, in ink, never a colour, so it
 * cannot be confused with the map's ramp (which is people, not levels).
 */
function LevelMark({ level }: { level: ActivityLevel }) {
  const filled = LEVEL_BARS[level];
  return (
    <span className="activity-levelmark" aria-hidden="true">
      {[1, 2, 3].map((i) => (
        <span key={i} className={i <= filled ? 'is-filled' : undefined} />
      ))}
    </span>
  );
}

/** "Busy", with its swatch; nothing for a count with no level (the location's details say why). */
function LevelWord({ level }: { level: ActivityLevel | null }) {
  if (!level) return null;
  return (
    <span className={`activity-level activity-level--${level}`}>
      <LevelMark level={level} />
      {ACTIVITY_WORDS[level]}
    </span>
  );
}

/* ── the weather ───────────────────────────────────────────────────────── */

function WeatherCard({ activity, at }: { activity: StreetActivity; at: number }) {
  const exact = weatherAt(activity, at);
  const shownAt = exact ? at : nextForecastHour(activity, at);
  const weather = shownAt === null ? null : weatherAt(activity, shownAt);
  return (
    <section className="activity-card activity-weather" aria-labelledby="activity-weather-title">
      <div className="activity-card__head">
        <h3 className="activity-card__title" id="activity-weather-title">CBD weather</h3>
        <span className="activity-tag">Forecast</span>
      </div>
      {weather && shownAt !== null ? (
        <>
          <p className="activity-card__meta">{whenLabel(shownAt)}</p>
          <ul className="activity-weather__figures">
            <li>
              <Icon name="thermostat" size={20} />
              <strong>{weather.temperatureC.toFixed(1)}°C</strong>
              <span>Temperature</span>
            </li>
            <li>
              <Icon name="water_drop" size={20} />
              <strong>{weather.rainMm.toFixed(1)} mm</strong>
              <span>Rain / hour</span>
            </li>
            <li>
              <Icon name="air" size={20} />
              <strong>{Math.round(weather.windKmh)} km/h</strong>
              <span>Wind</span>
            </li>
          </ul>
          {!exact && (
            <p className="activity-card__note">
              Next available forecast · map {whenLabel(at)}.
              {modeAt(activity, at) === 'recorded' ? ' There is no weather for recorded hours.' : ''}
            </p>
          )}
          {exact && modeAt(activity, at) === 'recorded' && (
            <p className="activity-card__note">The forecast weather for this hour; the counts on the map are recorded.</p>
          )}
        </>
      ) : (
        <p className="activity-card__note">No forecast weather for this hour or after it.</p>
      )}
    </section>
  );
}

/* ── the whole CBD ─────────────────────────────────────────────────────── */

function RankRow({
  rank,
  reading,
  mode,
  onSelect,
}: {
  rank: number;
  reading: Reading;
  /** The hour's kind; a reading from the other kind (a forecast filling a count not yet in) says so. */
  mode: 'recorded' | 'forecast';
  onSelect: (id: number) => void;
}) {
  const { sensor, count, level } = reading;
  // A count of the other kind than the hour's (a forecast standing in for a count not yet in) says which it is.
  const borrowed = reading.source !== null && reading.source !== mode ? reading.source : null;
  const levelWords = [level ? ACTIVITY_WORDS[level] : '', borrowed ?? ''].filter(Boolean).join(', ');
  return (
    <li>
      <button
        type="button"
        className="activity-rank"
        onClick={() => onSelect(sensor.id)}
        aria-label={`${sensor.name}, ${countLabel(count ?? 0)} movements per hour${levelWords ? `, ${levelWords}` : ''}, open details`}
      >
        <span className="activity-rank__n">{rank}</span>
        <span className="activity-rank__name">{sensor.name}</span>
        <span className="activity-rank__count">
          {countLabel(count ?? 0)}
          {borrowed && <small className="activity-rank__source"> {borrowed}</small>}
        </span>
        <LevelWord level={level} />
      </button>
    </li>
  );
}

function Overview({
  activity,
  at,
  onSelect,
}: {
  activity: StreetActivity;
  at: number;
  onSelect: (id: number) => void;
}) {
  const [order, setOrder] = useState<'higher' | 'lower'>('higher');
  const [all, setAll] = useState(false);
  const moreButton = useRef<HTMLButtonElement>(null);
  const mode = modeAt(activity, at);
  const readings = useMemo(() => (mode ? readingsAt(activity, at) : []), [activity, mode, at]);
  const summary = summarise(readings);
  const list = ranked(readings, order);
  const shown = all ? list : list.slice(0, TOP);

  // An hour on the rail the backend has nothing for: said, not shown as an empty city.
  if (!mode) {
    return (
      <p className="activity-card activity-card__note activity-nodata" role="status">
        <strong>No data for {hourLabel(at)}</strong> on {dayLabel(at)}. The backend has no recorded count or forecast
        for this hour. Move to another hour to see the streets.
      </p>
    );
  }

  return (
    <>
      <section className="activity-section" aria-labelledby="activity-cbd-title">
        <div className="activity-card__head">
          <h3 className="activity-section__title" id="activity-cbd-title">Across the CBD</h3>
          {mode && <span className="activity-tag activity-tag--plain">{MODE_WORDS[mode]}</span>}
        </div>
        <p className="activity-reporting">
          <strong>
            {summary.reporting} / {summary.total}
          </strong>{' '}
          locations reporting
        </p>
        <dl className="activity-counts" aria-label="Locations by level">
          {ACTIVITY_LEVELS.map((level) => (
            <div key={level}>
              <dt>
                <LevelMark level={level} />
                {ACTIVITY_WORDS[level]}
              </dt>
              <dd>{summary[level]}</dd>
            </div>
          ))}
        </dl>
        <p className="activity-card__note">
          Each level is measured against that location's own usual traffic.
          {/* So the three counts above need not add up to the number reporting: say what is left out. */}
          {summary.unrated > 0 &&
            ` ${summary.unrated} ${summary.unrated === 1 ? 'location has' : 'locations have'} no level of ${summary.unrated === 1 ? 'its' : 'their'} own.`}
        </p>
      </section>

      <section className="activity-section" aria-labelledby="activity-compare-title">
        <div className="activity-card__head">
          <h3 className="activity-section__title" id="activity-compare-title">Compare locations</h3>
          {/*
            While the whole list is open, the way to fold it is here, beside
            where it was opened — not only at its foot, forty rows down.
          */}
          {all ? (
            <button
              type="button"
              className="activity-fold"
              onClick={() => {
                setAll(false);
                // The button goes with the long list; the keyboard goes to the one that opens it again.
                window.requestAnimationFrame(() => moreButton.current?.focus());
              }}
              aria-expanded="true"
              aria-controls="activity-ranks"
            >
              Show fewer
              <Icon name="expand_less" size={16} />
            </button>
          ) : (
            <span className="activity-card__meta">/ hour</span>
          )}
        </div>
        <div className="activity-switch" role="group" aria-label="Order">
          <button type="button" aria-pressed={order === 'higher'} onClick={() => setOrder('higher')}>
            Higher
          </button>
          <button type="button" aria-pressed={order === 'lower'} onClick={() => setOrder('lower')}>
            Lower
          </button>
        </div>
        {shown.length > 0 ? (
          <ol className="activity-ranks" id="activity-ranks">
            {shown.map((r, i) => (
              <RankRow key={r.sensor.id} rank={i + 1} reading={r} mode={mode} onSelect={onSelect} />
            ))}
          </ol>
        ) : (
          <p className="activity-card__note">No location has a count for this hour.</p>
        )}
        {list.length > TOP && (
          <button
            type="button"
            ref={moreButton}
            className="activity-more"
            onClick={() => setAll((v) => !v)}
            aria-expanded={all}
            aria-controls="activity-ranks"
          >
            {all ? 'Show the top three' : `View all ${list.length} locations`}
            <Icon name={all ? 'expand_less' : 'expand_more'} size={18} />
          </button>
        )}
      </section>

    </>
  );
}

/* ── one counter ───────────────────────────────────────────────────────── */

function DayBars({ activity, sensor, at, ceiling }: { activity: StreetActivity; sensor: ActivitySensor; at: number; ceiling: number }) {
  const date = melbourneClock(at).date;
  const curve = dayCurve(activity, sensor.id, date);
  const top = Math.max(1, ...curve.map((p) => p.count ?? 0));
  return (
    <figure className="activity-day">
      <figcaption className="activity-card__head">
        <span className="activity-section__title">Throughout the day</span>
        <span className="activity-card__meta">{dayLabel(at)}</span>
      </figcaption>
      <div className="activity-day__bars" aria-hidden="true">
        {curve.map((p) => (
          <span
            key={p.at}
            className={`activity-day__bar${p.mode === 'forecast' ? ' activity-day__bar--forecast' : ''}${p.at === at ? ' activity-day__bar--now' : ''}`}
            style={{
              height: p.count === null ? 0 : `${Math.max(3, (p.count / top) * 100)}%`,
              // The map's ramp, so a bar is the colour its hour's glow is.
              ['--bar' as string]: p.count === null ? 'transparent' : rampColour(p.count / ceiling),
            }}
          />
        ))}
      </div>
      <div className="activity-day__scale" aria-hidden="true">
        <span>{hourLabel(curve[0].at)}</span>
        <span>12:00</span>
        <span>{hourLabel(curve[curve.length - 1].at)}</span>
      </div>
      {/* The same day for a screen reader: every hour, its count, level and kind. */}
      <p className="visually-hidden">{dayDescription(curve, sensor)}</p>
      <ul className="visually-hidden">
        {curve.map((p) => (
          <li key={p.at}>
            {hourLabel(p.at)}:{' '}
            {p.count === null
              ? 'no count'
              : `${countLabel(p.count)}${p.level ? `, ${ACTIVITY_WORDS[p.level]}` : ''}, ${p.mode === 'forecast' ? 'forecast' : 'recorded'}`}
          </li>
        ))}
      </ul>
      <p className="activity-day__key" aria-hidden="true">
        <span className="activity-day__keybar" /> Recorded
        <span className="activity-day__keybar activity-day__keybar--forecast" /> Forecast
        <span className="activity-day__keybar activity-day__keybar--now" /> On the map
      </p>
    </figure>
  );
}

function dayDescription(curve: ReturnType<typeof dayCurve>, sensor: ActivitySensor): string {
  const counted = curve.filter((p) => p.count !== null);
  if (counted.length === 0) return `${sensor.name}: no counts on this day.`;
  const peak = counted.reduce((a, b) => ((b.count ?? 0) > (a.count ?? 0) ? b : a));
  return `${sensor.name}, movements per hour through the day. Busiest hour ${hourLabel(peak.at)}, ${countLabel(peak.count ?? 0)}.`;
}

function PlanVisit({
  activity,
  sensor,
  now,
  onJump,
}: {
  activity: StreetActivity;
  sensor: ActivitySensor;
  now: number;
  onJump: (at: number) => void;
}) {
  const [prefer, setPrefer] = useState<'quieter' | 'livelier'>('quieter');
  const hours = suggestHours(activity, sensor.id, prefer, now);
  const L = OUTDOOR_LIMITS;
  if (!sensor.thresholds) {
    return <p className="activity-card__note">There is no forecast for this location yet, so no hours to suggest.</p>;
  }
  return (
    <>
      <p className="activity-section__title">I prefer</p>
      <div className="activity-switch" role="group" aria-label="I prefer">
        <button type="button" aria-pressed={prefer === 'quieter'} onClick={() => setPrefer('quieter')}>
          Quieter streets
        </button>
        <button type="button" aria-pressed={prefer === 'livelier'} onClick={() => setPrefer('livelier')}>
          Livelier streets
        </button>
      </div>
      <div className="activity-card__head">
        <p className="activity-section__title">Suggested hours</p>
        <span className="activity-tag">Forecast</span>
      </div>
      {hours.length > 0 ? (
        <ol className="activity-suggest">
          {hours.map((h) => (
            <li key={h.at}>
              <button type="button" className="activity-suggest__item" onClick={() => onJump(h.at)}>
                <span className="activity-suggest__when">{whenLabel(h.at)}</span>
                <span className="activity-suggest__what">
                  {countLabel(h.count)} / h · {h.weather.temperatureC.toFixed(1)}°C
                  {h.level && <> · {ACTIVITY_WORDS[h.level]}</>}
                </span>
              </button>
            </li>
          ))}
        </ol>
      ) : (
        <p className="activity-card__note">No forecast hour ahead is within the weather limits below.</p>
      )}
      <p className="activity-card__note">
        Outdoor weather limits: {String(L.firstHour).padStart(2, '0')}:00–{L.endHour}:00 · {L.minTempC}–{L.maxTempC}°C ·
        rain ≤{L.maxRainMm} mm/h · wind ≤{L.maxWindKmh} km/h. Suggestions use the forecast hours still ahead within these
        limits.
      </p>
    </>
  );
}

type Tab = 'overview' | 'plan';
const TABS: { key: Tab; label: string }[] = [
  { key: 'overview', label: 'Overview' },
  { key: 'plan', label: 'Plan a visit' },
];

function Detail({
  activity,
  sensor,
  at,
  now,
  ceiling,
  onBack,
  onJump,
}: {
  activity: StreetActivity;
  sensor: ActivitySensor;
  at: number;
  now: number;
  /** The top of the map's colour ramp, for the day's bars. */
  ceiling: number;
  onBack: () => void;
  onJump: (at: number) => void;
}) {
  const [tab, setTab] = useState<Tab>('overview');
  const tabsId = useId();
  /** Left and right move between the tabs, Home and End to the ends: the tabs pattern. */
  const onTabKey = (event: KeyboardEvent<HTMLDivElement>) => {
    const i = TABS.findIndex((t) => t.key === tab);
    const next =
      event.key === 'ArrowRight' ? (i + 1) % TABS.length
      : event.key === 'ArrowLeft' ? (i - 1 + TABS.length) % TABS.length
      : event.key === 'Home' ? 0
      : event.key === 'End' ? TABS.length - 1
      : -1;
    if (next < 0) return;
    event.preventDefault();
    setTab(TABS[next].key);
    document.getElementById(`${tabsId}-t${next}`)?.focus();
  };
  const mode = modeAt(activity, at);
  const reading = mode ? readingsAt(activity, at).find((r) => r.sensor.id === sensor.id) : undefined;
  const count = reading?.count ?? null;
  const level = reading?.level ?? null;

  return (
    <>
      <BackLink onClick={onBack}>CBD overview</BackLink>
      <section className="activity-section" aria-labelledby={`${tabsId}-name`}>
        <p className="activity-card__meta">Location</p>
        <h3 className="activity-detail__name" id={`${tabsId}-name`} tabIndex={-1}>
          {sensor.name}
        </h3>
        <div className="activity-tabs" role="tablist" aria-label="Location" onKeyDown={onTabKey}>
          {TABS.map(({ key, label }, i) => (
            <button
              key={key}
              type="button"
              role="tab"
              id={`${tabsId}-t${i}`}
              aria-controls={`${tabsId}-p${i}`}
              aria-selected={tab === key}
              tabIndex={tab === key ? 0 : -1}
              onClick={() => setTab(key)}
            >
              {label}
            </button>
          ))}
        </div>
      </section>

      <section className="activity-section" role="tabpanel" id={`${tabsId}-p0`} aria-labelledby={`${tabsId}-t0`} hidden={tab !== 'overview'}>
        <div className="activity-card activity-hero">
          <p className="activity-hero__figure">
            {count === null ? (
              <span className="activity-hero__none">
                {mode === 'forecast' ? 'No forecast' : mode === 'recorded' ? 'No count' : 'No data for this hour'}
              </span>
            ) : (
              <strong>{countLabel(count)}</strong>
            )}
            {count !== null && <LevelWord level={level} />}
          </p>
          <p className="activity-card__meta">
            movements / hour · {whenLabel(at)}
            {/* The count's own kind: at an hour both cover, a count not yet in is the forecast's. */}
            {(reading?.source ?? mode) && ` · ${MODE_WORDS[(reading?.source ?? mode) as 'recorded' | 'forecast']}`}
          </p>
          {sensor.thresholds ? (
            <p className="activity-card__note">
              Here, quiet is up to {countLabel(sensor.thresholds.quietMax)} an hour and busy from{' '}
              {countLabel(sensor.thresholds.busyMin)}.
            </p>
          ) : (
            <p className="activity-card__note">This location has no thresholds yet, so its count has no level.</p>
          )}
        </div>
        <DayBars activity={activity} sensor={sensor} at={at} ceiling={ceiling} />
      </section>
      <section className="activity-section" role="tabpanel" id={`${tabsId}-p1`} aria-labelledby={`${tabsId}-t1`} hidden={tab !== 'plan'}>
        <PlanVisit activity={activity} sensor={sensor} now={now} onJump={onJump} />
      </section>
    </>
  );
}

/* ── about the data ────────────────────────────────────────────────────── */

/**
 * "About the data", as the design has it: a button at the foot of the
 * column that opens a card over the map's lower left, beside the column
 * and above the time bar. Not modal — the map stays usable — but it takes
 * the keyboard when it opens, gives it back to the button when it closes,
 * and closes with Escape as well as its cross.
 *
 * Drawn into the page's body rather than the column: the column scrolls,
 * and its entrance animation would carry a fixed card with it.
 */
function AboutPanel({ activity, at, onClose }: { activity: StreetActivity; at: number | null; onClose: () => void }) {
  const titleId = useId();
  const mode = at === null ? null : modeAt(activity, at);
  const reporting = mode && at !== null ? summarise(readingsAt(activity, at)).reporting : 0;
  useEffect(() => {
    document.getElementById(titleId)?.focus();
  }, [titleId]);

  return createPortal(
    /*
     * Escape on the card only: it is not modal, and an Escape meant for the
     * search or another control must not close it and pull the keyboard here.
     */
    <section
      className="activity-about-panel"
      role="dialog"
      aria-labelledby={titleId}
      onKeyDown={(event) => {
        if (event.key === 'Escape') onClose();
      }}
    >
      <div className="activity-about-panel__head">
        <h2 className="activity-about-panel__title" id={titleId} tabIndex={-1}>
          About the data
        </h2>
        <button type="button" className="activity-about-panel__close" onClick={onClose} aria-label="Close About the data">
          <Icon name="close" size={18} />
        </button>
      </div>
      <div className="activity-about-panel__body">
        <p>
          A glow's colour and size are how many people passed in the hour, on one scale for every location: teal and
          small for few, through yellow, to dark red and wide for the most in any hour on the timeline. Every location
          with a count is shown.
        </p>
        <p>
          Quiet, moderate and busy are the backend's own levels, set for each location against its usual traffic: a busy
          hour in a lane can be fewer people than a quiet one at Town Hall. The same levels are applied to the recorded
          hours. These levels are words in the list, not the map's colours; a location with no levels of its own yet
          still has its glow, by its count.
        </p>
        {at !== null && (
          <p>
            {mode
              ? `${reporting} of ${activity.sensors.length} locations have ${mode === 'recorded' ? 'recorded counts' : 'a forecast'} at ${hourLabel(at)} on ${dayLabel(at)}.`
              : `There is no data at ${hourLabel(at)} on ${dayLabel(at)}.`}
          </p>
        )}
        <p>CBD weather is the forecast for the hour shown; recorded hours have none, so the next forecast hour is shown and labelled.</p>
        {activity.fallbackCount > 0 && (
          <p>
            {activity.fallbackCount === activity.forecastCount
              ? 'No forecast here is from the trained model yet: each'
              : `${activity.fallbackCount} of the ${activity.forecastCount} forecasts are not from the trained model yet: each`}{' '}
            is estimated from past counts on the same weekday and hour, and weather and events do not change it.
          </p>
        )}
        {activity.weatherSource && (
          <p>Weather: {activity.weatherSource.replace(/\s*\(.*\)\s*$/, '')} — not official Bureau of Meteorology forecasts.</p>
        )}
        {activity.generatedAt !== null && <p>Forecast generated {whenLabel(activity.generatedAt)} (Melbourne time).</p>}
        <p className="activity-about-panel__credit">
          Pedestrian counts: City of Melbourne pedestrian counting system, through the My City Twin backend. Map:
          building footprints and road surfaces, City of Melbourne; open space, Victorian Planning Authority. All CC BY
          4.0.
        </p>
      </div>
    </section>,
    document.body,
  );
}

/* ── the column ────────────────────────────────────────────────────────── */

export function StreetActivitySheet({
  state,
  ceiling,
  at,
  sensorId,
  now,
  onSelect,
  onJump,
  onExplore,
}: {
  state: StreetActivityState;
  /** The top of the map's colour ramp: the most in any hour anywhere. */
  ceiling: number;
  /** The hour on the map. Null until the data has arrived. */
  at: number | null;
  sensorId: number | null;
  /** The present, for which forecast hours are still ahead. */
  now: number;
  onSelect: (id: number | null) => void;
  /** Move the map to an hour: a suggested visit. */
  onJump: (at: number) => void;
  onExplore: () => void;
}) {
  const { activity, source, takenAt, refreshing, failed, refresh } = state;
  const [aboutOpen, setAboutOpen] = useState(false);
  const aboutButton = useRef<HTMLButtonElement>(null);
  // Closing hands the keyboard back to the button that opened it.
  const closeAbout = useCallback(() => {
    setAboutOpen(false);
    aboutButton.current?.focus();
  }, []);
  const sensor = activity && sensorId !== null ? (activity.sensors.find((s) => s.id === sensorId) ?? null) : null;

  return (
    <aside className="panel panel--left sheet activity-sheet" aria-labelledby="activity-title">
      <BackLink onClick={onExplore}>Explore the city</BackLink>
      <div>
        <p className="panel__eyebrow">Melbourne CBD</p>
        <h2 className="activity-sheet__lede" id="activity-title" tabIndex={-1}>
          Street activity
        </h2>
      </div>

      {!activity && (
        <p className="activity-card activity-card__note" role="status">
          {failed ? 'The street activity could not be reached. Try again in a moment.' : 'Loading the street activity…'}
        </p>
      )}

      {activity && at !== null && (
        <>
          <WeatherCard activity={activity} at={at} />
          {sensor ? (
            <Detail
              key={sensor.id}
              activity={activity}
              sensor={sensor}
              at={at}
              now={now}
              ceiling={ceiling}
              onBack={() => onSelect(null)}
              onJump={onJump}
            />
          ) : (
            <Overview activity={activity} at={at} onSelect={onSelect} />
          )}
        </>
      )}

      {activity && (
        <button
          type="button"
          ref={aboutButton}
          className="activity-about-button"
          aria-expanded={aboutOpen}
          onClick={() => setAboutOpen((v) => !v)}
        >
          <Icon name="info" size={18} />
          About the data
        </button>
      )}
      {activity && aboutOpen && (
        <AboutPanel
          activity={activity}
          at={at}
          onClose={closeAbout}
        />
      )}

      <p className="activity-source">
        <span className={`activity-source__dot${source === 'live' ? ' activity-source__dot--live' : ''}`} aria-hidden="true" />
        <span role="status">
          {refreshing
            ? 'Checking for new counts…'
            : source === 'live'
              ? 'Live data'
              : source === 'snapshot'
                ? `Saved copy${takenAt !== null ? ` from ${whenLabel(takenAt)}` : ''} — live data could not be reached`
                : failed
                  ? 'Not connected'
                  : ''}
        </span>
        <button type="button" className="activity-source__refresh" onClick={refresh} disabled={refreshing} aria-label="Refresh data">
          <Icon name="refresh" size={18} />
        </button>
      </p>
    </aside>
  );
}

/**
 * The header's search on this screen: the counting locations by name, in
 * the same list the city search draws (.results). A pick opens the
 * location here rather than leaving for a building's page — and before the
 * data is in, it says so rather than offering buildings instead.
 */
export function ActivitySearchResults({
  activity,
  query,
  onPick,
}: {
  activity: StreetActivity | null;
  query: string;
  onPick: (sensorId: number) => void;
}) {
  const hits = useMemo(() => (activity ? searchSensors(activity, query) : []), [activity, query]);
  if (query.trim().length < 2) return null;
  if (!activity) return <p className="results__none">The counting locations are still loading.</p>;
  if (hits.length === 0) {
    return (
      <p className="results__none">
        No counting location matches that. {activity.sensors.length} locations can be searched by name.
      </p>
    );
  }
  return (
    // A plain list of buttons: Tab moves through them and Enter opens one (a listbox would promise arrow keys).
    <ul className="results activity-results" aria-label="Counting locations">
      {hits.map((sensor, index) => (
        <li key={sensor.id}>
          <button type="button" style={{ '--i': index } as React.CSSProperties} onClick={() => onPick(sensor.id)}>
            <Icon name="directions_walk" size={16} />
            {sensor.name}
            <small>Counting location</small>
          </button>
        </li>
      ))}
    </ul>
  );
}

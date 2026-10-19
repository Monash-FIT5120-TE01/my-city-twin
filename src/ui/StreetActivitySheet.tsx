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
import { ACTIVITY_LEVELS, LEVEL_BARS, rampColour } from '../scene/activityPalette';
import { countLabel, dayLabel, hourLabel, whenLabel } from './activityFormat';
import { formatNumber, useT } from '../i18n/i18n';
import type { MessageKey } from '../i18n/en';
import { richText } from './KeyHints';

/** How many of the ranking show before "View all locations". */
const TOP = 3;

/** The words for a level, a kind of hour ("Recorded"), and a count's kind after it ("forecast"). */
const LEVEL_KEYS: Record<ActivityLevel, MessageKey> = {
  quiet: 'activity.level.quiet',
  moderate: 'activity.level.moderate',
  busy: 'activity.level.busy',
};
const MODE_KEYS = { recorded: 'activity.mode.recorded', forecast: 'activity.mode.forecast' } as const;
const SOURCE_KEYS = { recorded: 'activity.source.recorded', forecast: 'activity.source.forecast' } as const;

/** One decimal place, as the weather is given. */
const ONE_PLACE = { minimumFractionDigits: 1, maximumFractionDigits: 1 } as const;

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
  const t = useT();
  if (!level) return null;
  return (
    <span className={`activity-level activity-level--${level}`}>
      <LevelMark level={level} />
      {t(LEVEL_KEYS[level])}
    </span>
  );
}

/* ── the weather ───────────────────────────────────────────────────────── */

function WeatherCard({ activity, at }: { activity: StreetActivity; at: number }) {
  const t = useT();
  const exact = weatherAt(activity, at);
  const shownAt = exact ? at : nextForecastHour(activity, at);
  const weather = shownAt === null ? null : weatherAt(activity, shownAt);
  return (
    <section className="activity-card activity-weather" aria-labelledby="activity-weather-title">
      <div className="activity-card__head">
        <h3 className="activity-card__title" id="activity-weather-title">{t('activity.weather.title')}</h3>
        <span className="activity-tag">{t('activity.mode.forecast')}</span>
      </div>
      {weather && shownAt !== null ? (
        <>
          <p className="activity-card__meta">{whenLabel(shownAt)}</p>
          <ul className="activity-weather__figures">
            <li>
              <Icon name="thermostat" size={20} />
              <strong>{formatNumber(weather.temperatureC, ONE_PLACE)}°C</strong>
              <span>{t('activity.weather.temperature')}</span>
            </li>
            <li>
              <Icon name="water_drop" size={20} />
              <strong>{formatNumber(weather.rainMm, ONE_PLACE)} mm</strong>
              <span>{t('activity.weather.rain')}</span>
            </li>
            <li>
              <Icon name="air" size={20} />
              <strong>{formatNumber(Math.round(weather.windKmh))} km/h</strong>
              <span>{t('activity.weather.wind')}</span>
            </li>
          </ul>
          {!exact && (
            <p className="activity-card__note">
              {t(modeAt(activity, at) === 'recorded' ? 'activity.weather.nextForecastRecorded' : 'activity.weather.nextForecast', {
                when: whenLabel(at),
              })}
            </p>
          )}
          {exact && modeAt(activity, at) === 'recorded' && (
            <p className="activity-card__note">{t('activity.weather.recordedHour')}</p>
          )}
        </>
      ) : (
        <p className="activity-card__note">{t('activity.weather.none')}</p>
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
  const t = useT();
  const { sensor, count, level } = reading;
  // A count of the other kind than the hour's (a forecast standing in for a count not yet in) says which it is.
  const borrowed = reading.source !== null && reading.source !== mode ? reading.source : null;
  const labelVars = {
    name: sensor.name,
    count: countLabel(count ?? 0),
    level: level ? t(LEVEL_KEYS[level]) : '',
    source: borrowed ? t(SOURCE_KEYS[borrowed]) : '',
  };
  const labelKey: MessageKey =
    level && borrowed ? 'activity.rank.labelLevelSource'
    : level ? 'activity.rank.labelLevel'
    : borrowed ? 'activity.rank.labelSource'
    : 'activity.rank.label';
  return (
    <li>
      <button
        type="button"
        className="activity-rank"
        onClick={() => onSelect(sensor.id)}
        aria-label={t(labelKey, labelVars)}
      >
        <span className="activity-rank__n">{rank}</span>
        <span className="activity-rank__name">{sensor.name}</span>
        <span className="activity-rank__count">
          {countLabel(count ?? 0)}
          {borrowed && <small className="activity-rank__source"> {t(SOURCE_KEYS[borrowed])}</small>}
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
  const t = useT();
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
        {richText(t('activity.overview.noData', { hour: hourLabel(at), day: dayLabel(at) }))}
      </p>
    );
  }

  return (
    <>
      <section className="activity-section" aria-labelledby="activity-cbd-title">
        <div className="activity-card__head">
          <h3 className="activity-section__title" id="activity-cbd-title">{t('activity.overview.title')}</h3>
          {mode && <span className="activity-tag activity-tag--plain">{t(MODE_KEYS[mode])}</span>}
        </div>
        <p className="activity-reporting">
          {richText(t('activity.overview.reporting', { reporting: summary.reporting, total: summary.total }))}
        </p>
        <dl className="activity-counts" aria-label={t('activity.overview.byLevel')}>
          {ACTIVITY_LEVELS.map((level) => (
            <div key={level}>
              <dt>
                <LevelMark level={level} />
                {t(LEVEL_KEYS[level])}
              </dt>
              <dd>{summary[level]}</dd>
            </div>
          ))}
        </dl>
        <p className="activity-card__note">
          {/* So the three counts above need not add up to the number reporting: say what is left out. */}
          {summary.unrated === 0
            ? t('activity.overview.levelNote')
            : t(summary.unrated === 1 ? 'activity.overview.levelNoteUnratedOne' : 'activity.overview.levelNoteUnratedOther', {
                count: formatNumber(summary.unrated),
              })}
        </p>
      </section>

      <section className="activity-section" aria-labelledby="activity-compare-title">
        <div className="activity-card__head">
          <h3 className="activity-section__title" id="activity-compare-title">{t('activity.overview.compare')}</h3>
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
              {t('activity.overview.showFewer')}
              <Icon name="expand_less" size={16} />
            </button>
          ) : (
            <span className="activity-card__meta">{t('activity.overview.perHour')}</span>
          )}
        </div>
        <div className="activity-switch" role="group" aria-label={t('activity.overview.order')}>
          <button type="button" aria-pressed={order === 'higher'} onClick={() => setOrder('higher')}>
            {t('activity.overview.higher')}
          </button>
          <button type="button" aria-pressed={order === 'lower'} onClick={() => setOrder('lower')}>
            {t('activity.overview.lower')}
          </button>
        </div>
        {shown.length > 0 ? (
          <ol className="activity-ranks" id="activity-ranks">
            {shown.map((r, i) => (
              <RankRow key={r.sensor.id} rank={i + 1} reading={r} mode={mode} onSelect={onSelect} />
            ))}
          </ol>
        ) : (
          <p className="activity-card__note">{t('activity.overview.noCounts')}</p>
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
            {all ? t('activity.overview.showTop') : t('activity.overview.viewAll', { count: formatNumber(list.length) })}
            <Icon name={all ? 'expand_less' : 'expand_more'} size={18} />
          </button>
        )}
      </section>

    </>
  );
}

/* ── one counter ───────────────────────────────────────────────────────── */

function DayBars({ activity, sensor, at, ceiling }: { activity: StreetActivity; sensor: ActivitySensor; at: number; ceiling: number }) {
  const t = useT();
  const date = melbourneClock(at).date;
  const curve = dayCurve(activity, sensor.id, date);
  const top = Math.max(1, ...curve.map((p) => p.count ?? 0));
  return (
    <figure className="activity-day">
      <figcaption className="activity-card__head">
        <span className="activity-section__title">{t('activity.day.title')}</span>
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
      <p className="visually-hidden">{dayDescription(curve, sensor, t)}</p>
      <ul className="visually-hidden">
        {curve.map((p) => (
          <li key={p.at}>
            {p.count === null
              ? t('activity.day.hourNone', { hour: hourLabel(p.at) })
              : t(p.level ? 'activity.day.hourLevel' : 'activity.day.hour', {
                  hour: hourLabel(p.at),
                  count: countLabel(p.count),
                  level: p.level ? t(LEVEL_KEYS[p.level]) : '',
                  source: t(p.mode === 'forecast' ? 'activity.source.forecast' : 'activity.source.recorded'),
                })}
          </li>
        ))}
      </ul>
      <p className="activity-day__key" aria-hidden="true">
        <span className="activity-day__keybar" /> {t('activity.mode.recorded')}
        <span className="activity-day__keybar activity-day__keybar--forecast" /> {t('activity.mode.forecast')}
        <span className="activity-day__keybar activity-day__keybar--now" /> {t('activity.day.onMap')}
      </p>
    </figure>
  );
}

function dayDescription(curve: ReturnType<typeof dayCurve>, sensor: ActivitySensor, t: ReturnType<typeof useT>): string {
  const counted = curve.filter((p) => p.count !== null);
  if (counted.length === 0) return t('activity.day.noCounts', { name: sensor.name });
  const peak = counted.reduce((a, b) => ((b.count ?? 0) > (a.count ?? 0) ? b : a));
  return t('activity.day.description', { name: sensor.name, hour: hourLabel(peak.at), count: countLabel(peak.count ?? 0) });
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
  const t = useT();
  const [prefer, setPrefer] = useState<'quieter' | 'livelier'>('quieter');
  const hours = suggestHours(activity, sensor.id, prefer, now);
  const L = OUTDOOR_LIMITS;
  if (!sensor.thresholds) {
    return <p className="activity-card__note">{t('activity.plan.noForecast')}</p>;
  }
  return (
    <>
      <p className="activity-section__title">{t('activity.plan.prefer')}</p>
      <div className="activity-switch" role="group" aria-label={t('activity.plan.prefer')}>
        <button type="button" aria-pressed={prefer === 'quieter'} onClick={() => setPrefer('quieter')}>
          {t('activity.plan.quieter')}
        </button>
        <button type="button" aria-pressed={prefer === 'livelier'} onClick={() => setPrefer('livelier')}>
          {t('activity.plan.livelier')}
        </button>
      </div>
      <div className="activity-card__head">
        <p className="activity-section__title">{t('activity.plan.suggested')}</p>
        <span className="activity-tag">{t('activity.mode.forecast')}</span>
      </div>
      {hours.length > 0 ? (
        <ol className="activity-suggest">
          {hours.map((h) => (
            <li key={h.at}>
              <button type="button" className="activity-suggest__item" onClick={() => onJump(h.at)}>
                <span className="activity-suggest__when">{whenLabel(h.at)}</span>
                <span className="activity-suggest__what">
                  {t(h.level ? 'activity.plan.whatLevel' : 'activity.plan.what', {
                    count: countLabel(h.count),
                    temperature: formatNumber(h.weather.temperatureC, ONE_PLACE),
                    level: h.level ? t(LEVEL_KEYS[h.level]) : '',
                  })}
                </span>
              </button>
            </li>
          ))}
        </ol>
      ) : (
        <p className="activity-card__note">{t('activity.plan.none')}</p>
      )}
      <p className="activity-card__note">
        {t('activity.plan.limits', {
          firstHour: String(L.firstHour).padStart(2, '0'),
          endHour: L.endHour,
          minTemp: formatNumber(L.minTempC),
          maxTemp: formatNumber(L.maxTempC),
          maxRain: formatNumber(L.maxRainMm),
          maxWind: formatNumber(L.maxWindKmh),
        })}
      </p>
    </>
  );
}

type Tab = 'overview' | 'plan';
const TABS: { key: Tab; label: MessageKey }[] = [
  { key: 'overview', label: 'activity.detail.tabOverview' },
  { key: 'plan', label: 'activity.detail.tabPlan' },
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
  const t = useT();
  const [tab, setTab] = useState<Tab>('overview');
  const tabsId = useId();
  /** Left and right move between the tabs, Home and End to the ends: the tabs pattern. */
  const onTabKey = (event: KeyboardEvent<HTMLDivElement>) => {
    const i = TABS.findIndex((each) => each.key === tab);
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
  const kind = reading?.source ?? mode;

  return (
    <>
      <BackLink onClick={onBack}>{t('activity.detail.back')}</BackLink>
      <section className="activity-section" aria-labelledby={`${tabsId}-name`}>
        <p className="activity-card__meta">{t('activity.detail.location')}</p>
        <h3 className="activity-detail__name" id={`${tabsId}-name`} tabIndex={-1}>
          {sensor.name}
        </h3>
        <div className="activity-tabs" role="tablist" aria-label={t('activity.detail.location')} onKeyDown={onTabKey}>
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
              {t(label)}
            </button>
          ))}
        </div>
      </section>

      <section className="activity-section" role="tabpanel" id={`${tabsId}-p0`} aria-labelledby={`${tabsId}-t0`} hidden={tab !== 'overview'}>
        <div className="activity-card activity-hero">
          <p className="activity-hero__figure">
            {count === null ? (
              <span className="activity-hero__none">
                {mode === 'forecast'
                  ? t('activity.detail.noForecast')
                  : mode === 'recorded'
                    ? t('activity.detail.noCount')
                    : t('activity.detail.noData')}
              </span>
            ) : (
              <strong>{countLabel(count)}</strong>
            )}
            {count !== null && <LevelWord level={level} />}
          </p>
          <p className="activity-card__meta">
            {/* The count's own kind: at an hour both cover, a count not yet in is the forecast's. */}
            {kind
              ? t('activity.detail.metaMode', { when: whenLabel(at), mode: t(MODE_KEYS[kind]) })
              : t('activity.detail.meta', { when: whenLabel(at) })}
          </p>
          {sensor.thresholds ? (
            <p className="activity-card__note">
              {t('activity.detail.thresholds', {
                quietMax: countLabel(sensor.thresholds.quietMax),
                busyMin: countLabel(sensor.thresholds.busyMin),
              })}
            </p>
          ) : (
            <p className="activity-card__note">{t('activity.detail.noThresholds')}</p>
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
  const t = useT();
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
          {t('activity.about.title')}
        </h2>
        <button type="button" className="activity-about-panel__close" onClick={onClose} aria-label={t('activity.about.close')}>
          <Icon name="close" size={18} />
        </button>
      </div>
      <div className="activity-about-panel__body">
        <p>{t('activity.about.glow')}</p>
        <p>{t('activity.about.levels')}</p>
        {at !== null && (
          <p>
            {mode
              ? t(mode === 'recorded' ? 'activity.about.reportingRecorded' : 'activity.about.reportingForecast', {
                  reporting: formatNumber(reporting),
                  total: formatNumber(activity.sensors.length),
                  hour: hourLabel(at),
                  day: dayLabel(at),
                })
              : t('activity.about.noData', { hour: hourLabel(at), day: dayLabel(at) })}
          </p>
        )}
        <p>{t('activity.about.weather')}</p>
        {activity.fallbackCount > 0 && (
          <p>
            {activity.fallbackCount === activity.forecastCount
              ? t('activity.about.fallbackAll')
              : t('activity.about.fallbackSome', {
                  fallback: formatNumber(activity.fallbackCount),
                  total: formatNumber(activity.forecastCount),
                })}
          </p>
        )}
        {activity.weatherSource && (
          <p>{t('activity.about.weatherSource', { source: activity.weatherSource.replace(/\s*\(.*\)\s*$/, '') })}</p>
        )}
        {activity.generatedAt !== null && <p>{t('activity.about.generated', { when: whenLabel(activity.generatedAt) })}</p>}
        <p className="activity-about-panel__credit">{t('activity.about.credit')}</p>
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
  const t = useT();
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
      <BackLink onClick={onExplore}>{t('activity.sheet.explore')}</BackLink>
      <div>
        <p className="panel__eyebrow">{t('activity.sheet.eyebrow')}</p>
        <h2 className="activity-sheet__lede" id="activity-title" tabIndex={-1}>
          {t('activity.sheet.title')}
        </h2>
      </div>

      {!activity && (
        <p className="activity-card activity-card__note" role="status">
          {failed ? t('activity.sheet.failed') : t('activity.sheet.loading')}
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
          {t('activity.about.title')}
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
            ? t('activity.sheet.checking')
            : source === 'live'
              ? t('activity.sheet.live')
              : source === 'snapshot'
                ? takenAt !== null
                  ? t('activity.sheet.savedCopyFrom', { when: whenLabel(takenAt) })
                  : t('activity.sheet.savedCopy')
                : failed
                  ? t('activity.sheet.notConnected')
                  : ''}
        </span>
        <button type="button" className="activity-source__refresh" onClick={refresh} disabled={refreshing} aria-label={t('activity.sheet.refresh')}>
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
  const t = useT();
  const hits = useMemo(() => (activity ? searchSensors(activity, query) : []), [activity, query]);
  if (query.trim().length < 2) return null;
  if (!activity) return <p className="results__none">{t('activity.search.loading')}</p>;
  if (hits.length === 0) {
    return (
      <p className="results__none">
        {t('activity.search.none', { count: formatNumber(activity.sensors.length) })}
      </p>
    );
  }
  return (
    // A plain list of buttons: Tab moves through them and Enter opens one (a listbox would promise arrow keys).
    <ul className="results activity-results" aria-label={t('activity.search.results')}>
      {hits.map((sensor, index) => (
        <li key={sensor.id}>
          <button type="button" style={{ '--i': index } as React.CSSProperties} onClick={() => onPick(sensor.id)}>
            <Icon name="directions_walk" size={16} />
            {sensor.name}
            <small>{t('activity.search.kind')}</small>
          </button>
        </li>
      ))}
    </ul>
  );
}

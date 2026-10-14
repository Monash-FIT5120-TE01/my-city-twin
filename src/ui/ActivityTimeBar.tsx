/*
 * ─────────────────────────────────────────────────────────────────────────
 * STREET ACTIVITY: THE HOUR ON THE MAP
 * ─────────────────────────────────────────────────────────────────────────
 *
 * The bar under the map: Recorded or Forecast, the date, the hour, Play and
 * Latest. Its own component rather than the sunlight screen's TimeBar,
 * which is a day of minutes between sunrise and sunset; this is about two
 * days of whole hours, part counted and part forecast. It is drawn to match.
 *
 * ONE TIMELINE
 *   Recorded and forecast are not two modes the reader switches between but
 *   two stretches of one timeline (streetActivity.ts). The buttons jump: to
 *   the latest recorded hour, or the first forecast one. The rail shows
 *   which stretch is which by its line — solid where counted, dashed where
 *   forecast, nothing where neither — so it does not lean on colour.
 *
 * The dates offered are only those the data touches (datesCovered), so the
 * picker never offers a day with nothing on it.
 *
 * `at` must be on the rail (onRail): an hour of a covered date, with data or
 * without. App resolves anything else — a stale link — to the nearest hour
 * with data before passing it here.
 */
import { useEffect, useRef } from 'react';
import { Icon } from './kit/Icon';
import {
  datesCovered,
  melbourneClock,
  modeAt,
  slotsOn,
  type StreetActivity,
} from '../data/streetActivity';
import type { SimulationDate } from '../scene/solar';
import { RAMP_GRADIENT } from '../scene/activityPalette';
import { countLabel, dateKey, dateLabelOf, hourLabel, offsetLabel, whenLabel } from './activityFormat';

/** "Fri 16": a day's button, short enough for a row of eight or nine. */
function dayChip({ year, month, day }: SimulationDate): string {
  return new Intl.DateTimeFormat('en-AU', { timeZone: 'UTC', weekday: 'short', day: 'numeric' })
    .format(new Date(Date.UTC(year, month - 1, day, 12)))
    .replace(',', '');
}

const sameDay = (a: SimulationDate, b: SimulationDate) => a.year === b.year && a.month === b.month && a.day === b.day;

export function ActivityTimeBar({
  activity,
  ceiling,
  now,
  at,
  onChange,
  playing,
  onPlay,
}: {
  activity: StreetActivity;
  /** The top of the map's colour ramp, for the key. */
  ceiling: number;
  /** The present: which day is "Today". */
  now: number;
  at: number;
  onChange: (at: number) => void;
  playing: boolean;
  onPlay: () => void;
}) {
  const dates = datesCovered(activity);
  const date = melbourneClock(at).date;
  const slots = slotsOn(activity, date);
  const index = Math.max(0, slots.findIndex((s) => s.at === at));
  const mode = modeAt(activity, at);
  const last = Math.max(1, slots.length - 1);
  // 02:00 twice on the night daylight saving ends: each says its offset.
  const repeated = slots.filter((s) => s.hour === melbourneClock(at).hour).length > 1;
  const clock = repeated ? `${hourLabel(at)} (${offsetLabel(at)})` : hourLabel(at);
  const place = (i: number) => (i / last) * 100;
  /** Midday's slot, which is not the middle one on a 23- or 25-hour day. */
  const noon = slots.findIndex((s) => s.hour === 12);

  const today = melbourneClock(now).date;
  const dayIndex = dates.findIndex((d) => sameDay(d, date));

  // The chosen day kept in view in its own row (a phone scrolls the row): only the row moves, never the page.
  const dayList = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const list = dayList.current;
    const chip = list?.querySelectorAll<HTMLElement>('.activity-days__day')[dayIndex];
    if (!list || !chip) return;
    const left = chip.offsetLeft; // the row is positioned, so this is measured from it
    if (left < list.scrollLeft) list.scrollLeft = left;
    else if (left + chip.offsetWidth > list.scrollLeft + list.clientWidth) list.scrollLeft = left + chip.offsetWidth - list.clientWidth;
  }, [dayIndex]);

  /** Keep the clock hour on another date, or the nearest hour that has data there. */
  const toDate = (next: SimulationDate | undefined) => {
    if (!next) return;
    const there = slotsOn(activity, next);
    const hour = melbourneClock(at).hour;
    const withData = there.filter((s) => s.recorded || s.forecast);
    const same = withData.find((s) => s.hour === hour);
    const pick =
      same ??
      withData.reduce<(typeof withData)[number] | null>(
        (best, s) => (best === null || Math.abs(s.hour - hour) < Math.abs(best.hour - hour) ? s : best),
        null,
      );
    if (pick) onChange(pick.at);
  };

  /*
   * The rail's stretches as a gradient, one stop pair per slot: counted,
   * forecast, or empty. Each slot owns the span centred on it.
   */
  const segment = (i: number) => {
    const s = slots[i];
    return s.recorded ? 'recorded' : s.forecast ? 'forecast' : 'none';
  };
  const runs: { kind: string; from: number; to: number }[] = [];
  slots.forEach((_, i) => {
    const kind = segment(i);
    const from = i === 0 ? 0 : (place(i - 1) + place(i)) / 2;
    const to = i === slots.length - 1 ? 100 : (place(i) + place(i + 1)) / 2;
    const prev = runs.at(-1);
    if (prev && prev.kind === kind) prev.to = to;
    else runs.push({ kind, from, to });
  });

  const latest = activity.latest;
  // The first hour that is forecast only: where the two overlap the record wins (modeAt),
  // so jumping to an overlapping hour would land back on "Recorded".
  const firstForecast = activity.forecastHours.find((h) => !activity.recorded.has(h)) ?? null;

  return (
    <div className="timebar activity-timebar">
      <div className="timebar__dock activity-timebar__dock">
        <div className="activity-timebar__left">
          <div className="activity-switch activity-switch--dark" role="group" aria-label="Recorded or forecast">
            <button
              type="button"
              aria-pressed={mode === 'recorded'}
              disabled={latest === null}
              onClick={() => latest !== null && onChange(latest)}
            >
              Recorded
            </button>
            <button
              type="button"
              aria-pressed={mode === 'forecast'}
              disabled={firstForecast === null}
              onClick={() => firstForecast !== null && onChange(firstForecast)}
            >
              Forecast
            </button>
          </div>
          <p className="activity-timebar__now">
            <strong>{clock}</strong>
            <span>
              {mode ? (mode === 'recorded' ? 'Recorded' : 'Forecast') : 'No data'}
              <span className="activity-timebar__zone"> · Melbourne time</span>
            </span>
          </p>
        </div>

        <div className="activity-timebar__right">
          <button
            type="button"
            className="timebar__play"
            onClick={onPlay}
            aria-pressed={playing}
            aria-label={playing ? 'Pause hourly changes' : 'Play hourly changes'}
          >
            <Icon name={playing ? 'pause' : 'play_arrow'} size={20} />
          </button>
          <button
            type="button"
            className="activity-latest"
            disabled={latest === null || at === latest}
            onClick={() => latest !== null && onChange(latest)}
          >
            Latest
          </button>
        </div>

        {/*
          The days the data covers, one press each — yesterday's record to a
          week of forecast — with a step either way. The hour stays the same
          across days (toDate).
        */}
        <div className="activity-days" role="group" aria-label="Day">
          <button
            type="button"
            className="activity-days__step"
            onClick={() => toDate(dates[dayIndex - 1])}
            disabled={dayIndex <= 0}
            aria-label="Previous day"
          >
            <Icon name="chevron_left" size={18} />
          </button>
          <div className="activity-days__list" ref={dayList}>
            {dates.map((d) => {
              const isToday = sameDay(d, today);
              const chosen = sameDay(d, date);
              return (
                <button
                  key={dateKey(d)}
                  type="button"
                  className="activity-days__day"
                  aria-pressed={chosen}
                  aria-label={`${isToday ? 'Today, ' : ''}${dateLabelOf(d)}`}
                  onClick={() => toDate(d)}
                >
                  {isToday ? 'Today' : dayChip(d)}
                </button>
              );
            })}
          </div>
          <button
            type="button"
            className="activity-days__step"
            onClick={() => toDate(dates[dayIndex + 1])}
            disabled={dayIndex < 0 || dayIndex >= dates.length - 1}
            aria-label="Next day"
          >
            <Icon name="chevron_right" size={18} />
          </button>
        </div>

        <div className="timebar__timeline activity-timebar__timeline">
          <div className="timebar__track">
            <span className="activity-rail" aria-hidden="true">
              {runs.map((r) => (
                <span
                  key={`${r.kind}-${r.from}`}
                  className={`activity-rail__run activity-rail__run--${r.kind}`}
                  style={{ left: `${r.from}%`, width: `${r.to - r.from}%` }}
                />
              ))}
            </span>
            <input
              type="range"
              min={0}
              max={slots.length - 1}
              step={1}
              value={index}
              onChange={(e) => {
                // Every slot is a stop, an empty one too: it says "No data" (onRail), so the handle never jumps.
                const slot = slots[Number(e.target.value)];
                if (slot) onChange(slot.at);
              }}
              aria-label="Hour"
              aria-valuetext={`${whenLabel(at)}${repeated ? ` ${offsetLabel(at)}` : ''}, ${mode ? (mode === 'recorded' ? 'recorded' : 'forecast') : 'no data'}`}
            />
          </div>
          <p className="timebar__scale" aria-hidden="true">
            <span className="timebar__tick" style={{ left: '0%' }}>
              {hourLabel(slots[0].at)}
            </span>
            {noon >= 0 && (
              <span className="timebar__tick" style={{ left: `${place(noon)}%` }}>
                12:00
              </span>
            )}
            <span className="timebar__tick" style={{ left: '100%' }}>
              {hourLabel(slots[slots.length - 1].at)}
            </span>
          </p>
        </div>

        {/* The map's ramp, on the scale it is drawn to: no one, to the most in any hour anywhere. */}
        <div className="activity-key" role="group" aria-labelledby="activity-key-title">
          <span className="activity-key__title" id="activity-key-title">Foot traffic</span>
          <span className="activity-key__ramp">
            <span className="activity-key__bar" style={{ background: RAMP_GRADIENT }} aria-hidden="true" />
            <span className="activity-key__scale">
              0 → {countLabel(ceiling)} movements/h
              <span className="visually-hidden">, from light teal to dark red</span>
            </span>
          </span>
          <span className="activity-key__item activity-key__item--muted">
            <span className="activity-key__line" aria-hidden="true" />
            Recorded
            <span className="activity-key__line activity-key__line--forecast" aria-hidden="true" />
            Forecast
          </span>
        </div>
      </div>
    </div>
  );
}

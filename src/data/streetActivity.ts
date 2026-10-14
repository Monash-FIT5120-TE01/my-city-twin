/*
 * ─────────────────────────────────────────────────────────────────────────
 * STREET ACTIVITY: THE PEDESTRIAN COUNTERS, READY TO DRAW
 * ─────────────────────────────────────────────────────────────────────────
 *
 * WHAT ARRIVES
 *   Four answers from the team's backend (api-types.ts): the 46 counters,
 *   the last two hours, the last twenty-five, and the next twenty-four. The
 *   recorded hours and the forecast meet without a gap — on 2026-10-14 the
 *   record ran to 06:00 Melbourne time and the forecast began at 07:00 — so
 *   the screen has one timeline of about two days, crossing three dates.
 *
 * WHAT "BUSY" MEANS HERE
 *   The backend's own word, from each counter's own thresholds: quiet up to
 *   quiet_max, busy from busy_min, moderate between. A busy hour at a side
 *   lane can be a quiet one at Town Hall. The thresholds come only with a
 *   forecast, so they are applied to the recorded hours here as well — the
 *   same rule the backend uses, applied by us. The thirteen counters with no
 *   trained model have no thresholds, and so no level: their counts are
 *   shown, unrated, until the backend gives them one.
 *
 * WHAT IS NOT IN IT
 *   Weather for recorded hours. The forecast carries Open-Meteo's weather
 *   for its own hours and nothing else, the same at every counter.
 *
 * Hours are keyed by the instant they start (milliseconds), read off a
 * Melbourne clock only for display — the instant is the same everywhere,
 * and the API speaks UTC in one place and +11:00 in another.
 */

import { projectLonLat } from './project';
import { LOCAL_ORIGIN_WGS84, SITE } from '../scene/frame';
import { civilInZone, type SimulationDate } from '../scene/solar';
import type {
  ApiActivityCount,
  ApiActivityForecast,
  ApiActivityLevel,
  ApiActivitySensor,
} from './api-types';

export type ActivityLevel = ApiActivityLevel;
export type ActivityMode = 'recorded' | 'forecast';

export interface ActivityThresholds {
  /** Quiet up to and including this many an hour. */
  quietMax: number;
  /** Busy from this many an hour. */
  busyMin: number;
}

export interface ActivitySensor {
  id: number;
  name: string;
  lon: number;
  lat: number;
  /** East and north of the scene's origin, metres. */
  en: [number, number];
  /** The counter's own thresholds; null for the counters with no model. */
  thresholds: ActivityThresholds | null;
}

export interface ActivityWeather {
  temperatureC: number;
  /** Millimetres in the hour. */
  rainMm: number;
  windKmh: number;
}

export interface StreetActivity {
  /** By id. */
  sensors: ActivitySensor[];
  /** Hour → counter id → movements in that hour. */
  recorded: Map<number, Map<number, number>>;
  forecast: Map<number, Map<number, number>>;
  /** One reading per forecast hour: it is the same at every counter. */
  weather: Map<number, ActivityWeather>;
  /** Ascending. */
  recordedHours: number[];
  forecastHours: number[];
  /** The last recorded hour — "Latest". */
  latest: number | null;
  /** When the backend made the forecast. */
  generatedAt: number | null;
  /** The backend's own words on where the weather comes from. */
  weatherSource: string | null;
  /** The backend's warnings, once each. */
  warnings: string[];
  /** How many of the forecasts are the seasonal stand-in rather than the trained model. */
  fallbackCount: number;
  /** How many counters have a forecast at all. */
  forecastCount: number;
}

/** The four answers, as they arrive or as the snapshot carries them. */
export interface StreetActivityAnswers {
  sensors: ApiActivitySensor[];
  recent: ApiActivityCount[];
  history: ApiActivityCount[];
  forecast: ApiActivityForecast;
}

const [ORIGIN_E, ORIGIN_N] = projectLonLat(LOCAL_ORIGIN_WGS84.lon, LOCAL_ORIGIN_WGS84.lat);

/** Only the shapes this file reads count as an answer. */
export function looksLikeAnswers(value: unknown): value is StreetActivityAnswers {
  const v = value as Partial<StreetActivityAnswers> | null;
  return (
    !!v &&
    Array.isArray(v.sensors) &&
    v.sensors.every((s) => typeof s?.id === 'number' && typeof s?.lon === 'number') &&
    Array.isArray(v.recent) &&
    Array.isArray(v.history) &&
    !!v.forecast &&
    Array.isArray(v.forecast.forecasts)
  );
}

/** The backend's rule, ends included: ≤ quiet_max quiet, ≥ busy_min busy. */
export function levelFor(count: number, thresholds: ActivityThresholds | null): ActivityLevel | null {
  if (!thresholds) return null;
  if (count <= thresholds.quietMax) return 'quiet';
  if (count >= thresholds.busyMin) return 'busy';
  return 'moderate';
}

function put(into: Map<number, Map<number, number>>, hour: number, id: number, count: number) {
  let row = into.get(hour);
  if (!row) into.set(hour, (row = new Map()));
  row.set(id, count);
}

export function buildStreetActivity(answers: StreetActivityAnswers): StreetActivity {
  const thresholds = new Map<number, ActivityThresholds>();
  const recorded = new Map<number, Map<number, number>>();
  const forecast = new Map<number, Map<number, number>>();
  const weather = new Map<number, ActivityWeather>();
  const warnings = new Set<string>();
  let weatherSource: string | null = null;
  let fallbackCount = 0;
  let forecastCount = 0;

  for (const entry of answers.forecast.forecasts) {
    if (entry.status !== 'available') continue;
    const { quiet_max, busy_min } = entry.activity_thresholds;
    thresholds.set(entry.sensor.id, { quietMax: quiet_max, busyMin: busy_min });
    weatherSource ??= entry.weather_source;
    forecastCount += 1;
    if (entry.model === 'seasonal_fallback') fallbackCount += 1;
    for (const w of entry.warnings ?? []) warnings.add(w);
    for (const hour of entry.hourly) {
      const at = Date.parse(hour.time);
      if (!Number.isFinite(at) || !Number.isFinite(hour.movements_per_hour)) continue;
      put(forecast, at, entry.sensor.id, hour.movements_per_hour);
      if (!weather.has(at)) {
        weather.set(at, {
          temperatureC: hour.weather.temperature_2m,
          rainMm: hour.weather.precipitation,
          windKmh: hour.weather.wind_speed_10m,
        });
      }
    }
  }

  // History first, then recent over it: the same hour in both is the same
  // count, and recent is the fresher if the two were fetched apart.
  for (const row of [...answers.history, ...answers.recent]) {
    const at = Date.parse(row.timestamp);
    const count = Number(row.count);
    if (!Number.isFinite(at) || !Number.isFinite(count)) continue;
    put(recorded, at, row.locationId, count);
  }

  const sensors = answers.sensors
    .map((s): ActivitySensor => {
      const [e, n] = projectLonLat(s.lon, s.lat);
      return {
        id: s.id,
        name: s.name.trim(),
        lon: s.lon,
        lat: s.lat,
        en: [e - ORIGIN_E, n - ORIGIN_N],
        thresholds: thresholds.get(s.id) ?? null,
      };
    })
    .sort((a, b) => a.id - b.id);

  const recordedHours = [...recorded.keys()].sort((a, b) => a - b);
  const forecastHours = [...forecast.keys()].sort((a, b) => a - b);
  const generatedAt = Date.parse(answers.forecast.generated_at);

  return {
    sensors,
    recorded,
    forecast,
    weather,
    recordedHours,
    forecastHours,
    latest: recordedHours.at(-1) ?? null,
    generatedAt: Number.isFinite(generatedAt) ? generatedAt : null,
    weatherSource,
    warnings: [...warnings],
    fallbackCount,
    forecastCount,
  };
}

/* ── Reading it ─────────────────────────────────────────────────────────── */

/** An hour's start, on a Melbourne clock. */
export function melbourneClock(at: number): { date: SimulationDate; hour: number } {
  const { date, minutes } = civilInZone(SITE.timeZone, new Date(at));
  return { date, hour: Math.floor(minutes / 60) };
}

const sameDate = (a: SimulationDate, b: SimulationDate) =>
  a.year === b.year && a.month === b.month && a.day === b.day;

/** The Melbourne dates the timeline touches, ascending — the date picker's choices. */
export function datesCovered(activity: StreetActivity): SimulationDate[] {
  const out: SimulationDate[] = [];
  for (const at of [...activity.recordedHours, ...activity.forecastHours].sort((a, b) => a - b)) {
    const { date } = melbourneClock(at);
    if (!out.some((d) => sameDate(d, date))) out.push(date);
  }
  return out;
}

const HOUR_MS = 60 * 60 * 1000;

export interface HourSlot {
  /** The instant the hour starts. Every slot has one, data or not. */
  at: number;
  /** The Melbourne clock hour, 0–23. Twice 02:00 on the night daylight saving ends. */
  hour: number;
  recorded: boolean;
  forecast: boolean;
}

/**
 * The hours of a Melbourne date, in order, each with whether the record or
 * the forecast has it. Hours outside both are there, empty, so the rail is
 * always a whole day.
 *
 * Built from instants, not from the numbers 0–23: the night daylight saving
 * starts has 23 hours and the night it ends has 25, with 02:00 twice.
 */
export function slotsOn(activity: StreetActivity, date: SimulationDate): HourSlot[] {
  const recorded = new Set(activity.recordedHours);
  const forecast = new Set(activity.forecastHours);
  // Melbourne is ten or eleven hours ahead of UTC, so its date runs from
  // 13:00 or 14:00 UTC the day before to the same the day itself. A window
  // a little wider than that, filtered by date, catches every hour of it.
  const utcMidnight = Date.UTC(date.year, date.month - 1, date.day);
  const slots: HourSlot[] = [];
  for (let at = utcMidnight - 16 * HOUR_MS; at < utcMidnight + 16 * HOUR_MS; at += HOUR_MS) {
    const clock = melbourneClock(at);
    if (!sameDate(clock.date, date)) continue;
    slots.push({ at, hour: clock.hour, recorded: recorded.has(at), forecast: forecast.has(at) });
  }
  return slots;
}

export interface Reading {
  sensor: ActivitySensor;
  /** Null when the counter has nothing for this hour. */
  count: number | null;
  /** Null when there is no count, or no thresholds to rate it by. */
  level: ActivityLevel | null;
}

/** Every counter at one hour, from the record or the forecast. */
export function readingsAt(activity: StreetActivity, mode: ActivityMode, at: number): Reading[] {
  const row = (mode === 'recorded' ? activity.recorded : activity.forecast).get(at);
  return activity.sensors.map((sensor) => {
    const count = row?.get(sensor.id) ?? null;
    return { sensor, count, level: count === null ? null : levelFor(count, sensor.thresholds) };
  });
}

export interface ActivitySummary {
  /** Counters with a count this hour, of all of them. */
  reporting: number;
  total: number;
  quiet: number;
  moderate: number;
  busy: number;
  /** With a count but no thresholds. */
  unrated: number;
}

export function summarise(readings: Reading[]): ActivitySummary {
  const out: ActivitySummary = { reporting: 0, total: readings.length, quiet: 0, moderate: 0, busy: 0, unrated: 0 };
  for (const r of readings) {
    if (r.count === null) continue;
    out.reporting += 1;
    if (r.level) out[r.level] += 1;
    else out.unrated += 1;
  }
  return out;
}

/** The counters with a count, most first ("higher") or fewest first ("lower"). */
export function ranked(readings: Reading[], order: 'higher' | 'lower'): Reading[] {
  const sign = order === 'higher' ? -1 : 1;
  return readings
    .filter((r) => r.count !== null)
    .sort((a, b) => sign * ((a.count as number) - (b.count as number)) || a.sensor.name.localeCompare(b.sensor.name));
}

export interface CurvePoint {
  hour: number;
  at: number;
  count: number | null;
  level: ActivityLevel | null;
  /** Which of the two the count came from; the record wins where both have the hour. */
  mode: ActivityMode | null;
}

/** One counter through one Melbourne date: the detail's "Throughout the day". */
export function dayCurve(activity: StreetActivity, sensorId: number, date: SimulationDate): CurvePoint[] {
  const sensor = activity.sensors.find((s) => s.id === sensorId);
  return slotsOn(activity, date).map(({ hour, at }) => {
    const recorded = activity.recorded.get(at)?.get(sensorId);
    const forecast = activity.forecast.get(at)?.get(sensorId);
    const count = recorded ?? forecast ?? null;
    return {
      hour,
      at,
      count,
      level: count === null || !sensor ? null : levelFor(count, sensor.thresholds),
      mode: recorded !== undefined ? 'recorded' : forecast !== undefined ? 'forecast' : null,
    };
  });
}

/** The weather for a forecast hour, exactly; null for any other hour. */
export function weatherAt(activity: StreetActivity, at: number): ActivityWeather | null {
  return activity.weather.get(at) ?? null;
}

/**
 * The first forecast hour at or after the given one — the weather card's
 * fallback for a recorded hour. Null past the end of the forecast: weather
 * from before the hour asked about would be a different day's.
 */
export function nextForecastHour(activity: StreetActivity, from: number): number | null {
  return activity.forecastHours.find((at) => at >= from) ?? null;
}

/* ── Plan a visit ─────────────────────────────────────────────────────── */

/**
 * The hours a walk outside is pleasant enough to suggest. The design's own
 * limits; nothing in the API says them.
 */
export const OUTDOOR_LIMITS = {
  /** From 08:00; the last hour suggested starts at 20:00 and ends at 21:00. */
  firstHour: 8,
  endHour: 21,
  minTempC: 12,
  maxTempC: 30,
  maxRainMm: 0.5,
  maxWindKmh: 30,
} as const;

export function pleasant(w: ActivityWeather, hour: number): boolean {
  const L = OUTDOOR_LIMITS;
  return (
    hour >= L.firstHour &&
    hour < L.endHour &&
    w.temperatureC >= L.minTempC &&
    w.temperatureC <= L.maxTempC &&
    w.rainMm <= L.maxRainMm &&
    w.windKmh <= L.maxWindKmh
  );
}

export interface SuggestedHour {
  at: number;
  count: number;
  level: ActivityLevel | null;
  weather: ActivityWeather;
}

/**
 * The best few forecast hours at one counter, by the reader's preference,
 * among the pleasant ones still to come. Empty for a counter with no
 * forecast. `now` matters offline: a snapshot from yesterday morning still
 * carries yesterday's afternoon, and that is no time to suggest.
 */
export function suggestHours(
  activity: StreetActivity,
  sensorId: number,
  prefer: 'quieter' | 'livelier',
  now: number,
  howMany = 3,
): SuggestedHour[] {
  const sensor = activity.sensors.find((s) => s.id === sensorId);
  if (!sensor) return [];
  const out: SuggestedHour[] = [];
  for (const at of activity.forecastHours) {
    const count = activity.forecast.get(at)?.get(sensorId);
    const weather = activity.weather.get(at);
    // The hour under way still counts; one already over does not.
    if (at + HOUR_MS <= now) continue;
    if (count === undefined || !weather || !pleasant(weather, melbourneClock(at).hour)) continue;
    out.push({ at, count, level: levelFor(count, sensor.thresholds), weather });
  }
  const sign = prefer === 'quieter' ? 1 : -1;
  return out.sort((a, b) => sign * (a.count - b.count) || a.at - b.at).slice(0, howMany);
}

/* ── One timeline ─────────────────────────────────────────────────────── */

/**
 * Whether an hour is recorded, forecast, or neither. The record wins where
 * both have it: a count beats an estimate of the same hour.
 */
export function modeAt(activity: StreetActivity, at: number): ActivityMode | null {
  if (activity.recorded.has(at)) return 'recorded';
  if (activity.forecast.has(at)) return 'forecast';
  return null;
}

/** Every hour with data, recorded or forecast, ascending — what Play steps through. */
export function timeline(activity: StreetActivity): number[] {
  return [...new Set([...activity.recordedHours, ...activity.forecastHours])].sort((a, b) => a - b);
}

/**
 * Whether an hour is a place on the rail: on the hour, on one of the dates
 * the data covers — with data or not. The backend can leave a gap between
 * the record and the forecast (2026-10-15: nothing for 06:00); the handle
 * stops on it and says there is no data, rather than jumping past it.
 */
export function onRail(activity: StreetActivity, at: number): boolean {
  if (at % HOUR_MS !== 0) return false;
  const { date } = melbourneClock(at);
  return datesCovered(activity).some((d) => sameDate(d, date));
}

/** The next hour with data after this one, for Play; null at the end. */
export function nextHourWithData(activity: StreetActivity, at: number): number | null {
  return timeline(activity).find((h) => h > at) ?? null;
}

/** The hour with data nearest the one asked for: a stale link, or a date changed. */
export function nearestHour(activity: StreetActivity, at: number): number | null {
  let best: number | null = null;
  for (const h of timeline(activity)) if (best === null || Math.abs(h - at) < Math.abs(best - at)) best = h;
  return best;
}

/**
 * The counters whose names hold every word of the query, best first: a name
 * that starts with it, then one with a word that does. Two letters at least,
 * as the city search asks.
 */
export function searchSensors(activity: StreetActivity, query: string, max = 8): ActivitySensor[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean);
  if (query.trim().length < 2 || words.length === 0) return [];
  const scored: { sensor: ActivitySensor; score: number }[] = [];
  for (const sensor of activity.sensors) {
    const name = sensor.name.toLowerCase();
    if (!words.every((w) => name.includes(w))) continue;
    const first = words[0];
    // A word of the name that starts with the first word of the query; no
    // pattern is built from what was typed, so "(north" is only text.
    const atWord = name.split(/[^a-z0-9]+/).some((part) => part.startsWith(first.replace(/[^a-z0-9]/g, '')) && part !== '');
    const score = name.startsWith(first) ? 2 : atWord ? 1 : 0;
    scored.push({ sensor, score });
  }
  return scored
    .sort((a, b) => b.score - a.score || a.sensor.name.localeCompare(b.sensor.name))
    .slice(0, max)
    .map((s) => s.sensor);
}

/**
 * The most movements in any hour anywhere on the timeline, recorded or
 * forecast: the top of the map's colour ramp. One number for the whole
 * timeline, so a colour means the same count at every hour the reader
 * moves to. Never below one, so an empty answer is not a division by zero.
 */
export function countCeiling(activity: StreetActivity): number {
  let top = 1;
  for (const rows of [activity.recorded, activity.forecast]) {
    for (const row of rows.values()) for (const count of row.values()) if (count > top) top = count;
  }
  return top;
}

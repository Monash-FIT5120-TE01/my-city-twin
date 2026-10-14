import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildCityModel } from './adapter';
import type { ApiBuildingPart, ApiDevelopmentPart, ApiFeatureCollection } from './api-types';
import {
  buildStreetActivity,
  datesCovered,
  dayCurve,
  levelFor,
  looksLikeAnswers,
  melbourneClock,
  nextForecastHour,
  pleasant,
  ranked,
  readingsAt,
  slotsOn,
  suggestHours,
  summarise,
  countCeiling,
  onRail,
  nextHourWithData,
  modeAt,
  timeline,
  searchSensors,
  type StreetActivityAnswers,
} from './streetActivity';

/*
 * Against the snapshot that ships with the app, like the landmarks: what can
 * go wrong is a property of the real answers — a count sent as a string, two
 * time zones in one response, a counter with no thresholds — and a fixture
 * would only test the fixture.
 */
const answers = JSON.parse(
  readFileSync(resolve(__dirname, '../../public/data/street-activity.json'), 'utf-8'),
) as StreetActivityAnswers;
const activity = buildStreetActivity(answers);

const load = <T,>(name: string): T =>
  JSON.parse(readFileSync(resolve(__dirname, '../../public/data', name), 'utf-8'));
const { model } = buildCityModel(
  load<ApiFeatureCollection<ApiBuildingPart>>('building-footprints.json'),
  load<ApiFeatureCollection<ApiDevelopmentPart>>('development-footprints.json'),
  'snapshot',
);

describe('street activity', () => {
  it('recognises the snapshot and nothing shaped otherwise', () => {
    expect(looksLikeAnswers(answers)).toBe(true);
    expect(looksLikeAnswers({ sensors: [] })).toBe(false);
    expect(looksLikeAnswers(null)).toBe(false);
  });

  it('keeps every counter, with thresholds only where there is a forecast', () => {
    const withForecast = answers.forecast.forecasts.filter((f) => f.status === 'available').length;
    expect(activity.sensors).toHaveLength(answers.sensors.length);
    expect(activity.sensors.filter((s) => s.thresholds)).toHaveLength(withForecast);
    expect(activity.sensors.filter((s) => !s.thresholds).length).toBe(answers.sensors.length - withForecast);
  });

  it('applies the rule the backend applies: every forecast hour gets the level it was sent with', () => {
    let checked = 0;
    for (const f of answers.forecast.forecasts) {
      if (f.status !== 'available') continue;
      const t = { quietMax: f.activity_thresholds.quiet_max, busyMin: f.activity_thresholds.busy_min };
      for (const h of f.hourly) {
        expect(levelFor(h.movements_per_hour, t)).toBe(h.activity);
        checked += 1;
      }
    }
    expect(checked).toBeGreaterThan(0);
  });

  it('counts the ends of the moderate band as quiet and busy, and rates nothing without thresholds', () => {
    const t = { quietMax: 100, busyMin: 800 };
    expect(levelFor(100, t)).toBe('quiet');
    expect(levelFor(101, t)).toBe('moderate');
    expect(levelFor(799, t)).toBe('moderate');
    expect(levelFor(800, t)).toBe('busy');
    expect(levelFor(5000, null)).toBeNull();
  });

  it('reads the counts as numbers, recent included', () => {
    for (const row of answers.recent) {
      const count = activity.recorded.get(Date.parse(row.timestamp))?.get(row.locationId);
      expect(count).toBe(Number(row.count));
    }
  });

  it('starts the forecast where the record ends (overlapping by an hour at most), with no gap of more than an hour', () => {
    expect(activity.latest).toBe(activity.recordedHours.at(-1));
    const latest = activity.latest as number;
    const first = activity.forecastHours[0];
    expect(first).toBeGreaterThanOrEqual(latest - 60 * 60 * 1000);
    // The first hour only the forecast has: at most two hours on (the backend sometimes skips one).
    const onlyForecast = activity.forecastHours.find((h) => !activity.recorded.has(h)) as number;
    expect(onlyForecast).toBeGreaterThan(latest);
    expect(onlyForecast - latest).toBeLessThanOrEqual(2 * 60 * 60 * 1000);
  });

  it('carries a week of forecast', () => {
    const span = (activity.forecastHours.at(-1) as number) - activity.forecastHours[0];
    expect(span).toBeGreaterThanOrEqual(6 * 24 * 60 * 60 * 1000);
  });

  it('reads hours off a Melbourne clock, whichever zone the API wrote them in', () => {
    // 19:00 UTC in October is 06:00 the next morning in Melbourne (AEDT, +11).
    expect(melbourneClock(Date.parse('2026-10-13T19:00:00Z'))).toEqual({
      date: { year: 2026, month: 10, day: 14 },
      hour: 6,
    });
    expect(melbourneClock(Date.parse('2026-10-14T07:00:00+11:00')).hour).toBe(7);
  });

  it('offers only the dates the timeline touches, in order', () => {
    const dates = datesCovered(activity);
    // A day of record and a week of forecast: eight or nine Melbourne dates.
    expect(dates.length).toBeGreaterThanOrEqual(7);
    expect(dates.length).toBeLessThanOrEqual(10);
    const keys = dates.map((d) => d.year * 10000 + d.month * 100 + d.day);
    expect([...keys].sort((a, b) => a - b)).toEqual(keys);
    // Every date has at least one hour on it.
    for (const date of dates) expect(slotsOn(activity, date).some((s) => s.recorded || s.forecast)).toBe(true);
  });

  it('gives each date a whole day of slots, filled where the API has the hour', () => {
    const [first] = datesCovered(activity);
    const slots = slotsOn(activity, first);
    expect(slots.map((s) => s.hour)).toEqual([...Array(24).keys()]);
    for (let i = 1; i < slots.length; i++) expect(slots[i].at - slots[i - 1].at).toBe(60 * 60 * 1000);
  });

  it('gives the night daylight saving starts 23 hours, and the night it ends 25, with 02:00 twice', () => {
    const empty = { ...activity, recordedHours: [], forecastHours: [] };
    const starts = slotsOn(empty, { year: 2026, month: 10, day: 4 });
    expect(starts).toHaveLength(23);
    expect(starts.map((s) => s.hour)).not.toContain(2);
    const ends = slotsOn(empty, { year: 2027, month: 4, day: 4 });
    expect(ends).toHaveLength(25);
    expect(ends.filter((s) => s.hour === 2)).toHaveLength(2);
    expect(new Set(ends.map((s) => s.at)).size).toBe(25);
  });

  it('summarises an hour: rated, unrated and silent counters add up', () => {
    const readings = readingsAt(activity, 'recorded', activity.latest as number);
    const s = summarise(readings);
    expect(s.total).toBe(activity.sensors.length);
    expect(s.quiet + s.moderate + s.busy + s.unrated).toBe(s.reporting);
    // Unrated counters have a count but no thresholds.
    const unrated = readings.filter((r) => r.count !== null && r.level === null);
    expect(unrated.every((r) => r.sensor.thresholds === null)).toBe(true);
  });

  it('has no forecast for the counters without a model', () => {
    const readings = readingsAt(activity, 'forecast', activity.forecastHours[0]);
    for (const r of readings) expect(r.count === null).toBe(r.sensor.thresholds === null);
  });

  it('ranks most first or fewest first, leaving out the silent', () => {
    const readings = readingsAt(activity, 'recorded', activity.latest as number);
    const higher = ranked(readings, 'higher');
    const lower = ranked(readings, 'lower');
    expect(higher[0].count).toBe(Math.max(...higher.map((r) => r.count as number)));
    expect(lower[0].count).toBe(Math.min(...lower.map((r) => r.count as number)));
    expect(higher.every((r) => r.count !== null)).toBe(true);
  });

  it('draws a day for one counter from the record, then the forecast', () => {
    const sensor = activity.sensors.find((s) => s.thresholds)!;
    const date = melbourneClock(activity.latest as number).date;
    const curve = dayCurve(activity, sensor.id, date);
    expect(curve).toHaveLength(24);
    const i = curve.findIndex((p) => p.at === activity.latest);
    expect(curve[i].mode).toBe('recorded');
    if (i < curve.length - 1) expect(curve[i + 1].mode).toBe('forecast');
  });

  it('has one weather reading per forecast hour and none for recorded ones', () => {
    expect(activity.weather.size).toBe(activity.forecastHours.length);
    for (const at of activity.weather.keys()) expect(activity.forecast.has(at)).toBe(true);
    const recordOnly = activity.recordedHours.filter((h) => !activity.forecast.has(h));
    expect(recordOnly.length).toBeGreaterThan(0);
    for (const at of recordOnly) expect(activity.weather.has(at)).toBe(false);
    const latest = activity.latest as number;
    expect(nextForecastHour(activity, latest)).toBe(activity.forecastHours.find((h) => h >= latest));
    expect(nextForecastHour(activity, (activity.forecastHours.at(-1) as number) + 1)).toBeNull();
  });

  it('says where the weather comes from and that the forecast is the stand-in', () => {
    expect(activity.weatherSource).toMatch(/Open-Meteo/);
    expect(activity.fallbackCount).toBeGreaterThan(0);
    expect(activity.fallbackCount).toBeLessThanOrEqual(activity.forecastCount);
    expect(activity.warnings.length).toBeGreaterThan(0);
  });

  it('suggests only pleasant forecast hours, quietest or liveliest first', () => {
    const sensor = activity.sensors.find((s) => s.thresholds)!;
    const before = activity.forecastHours[0];
    const quieter = suggestHours(activity, sensor.id, 'quieter', before);
    const livelier = suggestHours(activity, sensor.id, 'livelier', before);
    for (const s of [...quieter, ...livelier]) expect(pleasant(s.weather, melbourneClock(s.at).hour)).toBe(true);
    for (let i = 1; i < quieter.length; i++) expect(quieter[i].count).toBeGreaterThanOrEqual(quieter[i - 1].count);
    for (let i = 1; i < livelier.length; i++) expect(livelier[i].count).toBeLessThanOrEqual(livelier[i - 1].count);
    const without = activity.sensors.find((s) => !s.thresholds)!;
    expect(suggestHours(activity, without.id, 'quieter', before)).toEqual([]);
  });

  it('never suggests an hour already over', () => {
    const sensor = activity.sensors.find((s) => s.thresholds)!;
    const later = activity.forecastHours[12];
    for (const s of suggestHours(activity, sensor.id, 'quieter', later, 24)) expect(s.at + 60 * 60 * 1000).toBeGreaterThan(later);
    const afterAll = (activity.forecastHours.at(-1) as number) + 2 * 60 * 60 * 1000;
    expect(suggestHours(activity, sensor.id, 'livelier', afterAll)).toEqual([]);
  });

  it('keeps an evening hour out of the suggestions at 21:00, and a cold one at any hour', () => {
    const mild = { temperatureC: 18, rainMm: 0, windKmh: 10 };
    expect(pleasant(mild, 8)).toBe(true);
    expect(pleasant(mild, 20)).toBe(true);
    expect(pleasant(mild, 21)).toBe(false);
    expect(pleasant(mild, 7)).toBe(false);
    expect(pleasant({ ...mild, temperatureC: 11.9 }, 12)).toBe(false);
    expect(pleasant({ ...mild, rainMm: 0.6 }, 12)).toBe(false);
  });

  it('places the counters inside the model, but for the two at 526 La Trobe Street', () => {
    const { minE, minN, maxE, maxN } = model.extent;
    const outside = activity.sensors.filter(
      ({ en: [e, n] }) => e < minE || e > maxE || n < minN || n > maxN,
    );
    expect(outside.map((s) => s.name).sort()).toEqual(
      ['I-Hub 526 La Trobe Street (Crossing)', 'I-Hub 526 La Trobe Street (Footpath)'],
    );
  });
});

describe('finding a counter by name', () => {
  it('matches every word, names starting with it first', () => {
    const hits = searchSensors(activity, 'bourke');
    expect(hits.length).toBeGreaterThan(1);
    expect(hits[0].name.toLowerCase().startsWith('bourke')).toBe(true);
    expect(hits.every((s) => s.name.toLowerCase().includes('bourke'))).toBe(true);
    expect(searchSensors(activity, 'flinders degraves').every((s) => /flinders/i.test(s.name) && /degraves/i.test(s.name))).toBe(true);
  });

  it('asks for two letters, and survives punctuation', () => {
    expect(searchSensors(activity, 'b')).toEqual([]);
    expect(() => searchSensors(activity, 'st- (south')).not.toThrow();
    // Punctuation first, where a pattern built from the query would break.
    expect(() => searchSensors(activity, '(north')).not.toThrow();
    expect(() => searchSensors(activity, '[(*+?')).not.toThrow();
    expect(searchSensors(activity, '(north').length).toBeGreaterThan(0);
  });
});

describe('the rail, gaps included', () => {
  it('holds every hour of a covered date, with data or without, and nothing else', () => {
    const [first] = datesCovered(activity);
    const midnight = slotsOn(activity, first)[0].at;
    expect(onRail(activity, midnight)).toBe(true);
    expect(onRail(activity, midnight + 30 * 60 * 1000)).toBe(false);
    expect(onRail(activity, Date.parse('2020-01-01T00:00:00Z'))).toBe(false);
  });

  it('plays on from an empty hour to the next one with data, and stops at the end', () => {
    const [first] = datesCovered(activity);
    const empty = slotsOn(activity, first).find((s) => !s.recorded && !s.forecast);
    if (empty) {
      const next = nextHourWithData(activity, empty.at);
      expect(next).not.toBeNull();
      expect(next as number).toBeGreaterThan(empty.at);
      expect(modeAt(activity, next as number)).not.toBeNull();
    }
    expect(nextHourWithData(activity, timeline(activity).at(-1) as number)).toBeNull();
  });
});

describe('the top of the colour scale', () => {
  it('is the most in any hour anywhere, recorded or forecast', () => {
    const all = [...activity.recorded.values(), ...activity.forecast.values()].flatMap((row) => [...row.values()]);
    expect(countCeiling(activity)).toBe(Math.max(...all));
  });

  it('is at least one, with no counts at all', () => {
    expect(countCeiling({ ...activity, recorded: new Map(), forecast: new Map() })).toBe(1);
  });
});

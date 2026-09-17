import { describe, expect, it } from 'vitest';
import { daylightWindow } from './solar';
import { SITE } from './frame';

/*
 * The band the time bar paints to show when the sun is up.
 *
 * Checked against the astronomical facts of the site rather than against
 * itself: Melbourne's solstices are four and a half hours apart in daylight,
 * and an equinox is close to twelve hours everywhere. A search that latched
 * onto the wrong crossing would still return two plausible-looking numbers.
 */

const site = { lat: SITE.lat, lon: SITE.lon, elevationM: SITE.elevationM };
const window_ = (year: number, month: number, day: number) =>
  daylightWindow({ year, month, day }, 0, 24 * 60 - 1, SITE.timeZone, site);

const hhmm = (minutes: number) =>
  `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;

describe('when the sun is up', () => {
  it('finds both crossings, in order', () => {
    const { rise, set } = window_(2026, 9, 17);
    expect(rise).not.toBeNull();
    expect(set).not.toBeNull();
    expect(rise!).toBeLessThan(set!);
  });

  it('gives Melbourne about twelve hours at the September equinox', () => {
    // Within a few days of the equinox, day and night are near enough equal
    // everywhere on Earth. This is the check that does not depend on the
    // site being right.
    const { rise, set } = window_(2026, 9, 23);
    const hours = (set! - rise!) / 60;
    expect(hours).toBeGreaterThan(11.7);
    expect(hours).toBeLessThan(12.4);
  });

  it('gives the longest day in December and the shortest in June', () => {
    const summer = window_(2026, 12, 21);
    const winter = window_(2026, 6, 21);
    const summerHours = (summer.set! - summer.rise!) / 60;
    const winterHours = (winter.set! - winter.rise!) / 60;

    // Melbourne runs from about 9h 32m to about 14h 47m.
    expect(summerHours).toBeGreaterThan(14.5);
    expect(summerHours).toBeLessThan(15);
    expect(winterHours).toBeGreaterThan(9.3);
    expect(winterHours).toBeLessThan(9.8);

    // The southern hemisphere, which is the whole reason this app exists
    // where it does: the long day is the one in December.
    expect(summerHours).toBeGreaterThan(winterHours);
  });

  it('lands within a minute or two of the published sunrise', () => {
    /*
     * 21 June 2026 in Melbourne: sunrise 07:35, sunset 17:08 AEST.
     *
     * A few minutes of tolerance, because published times include
     * atmospheric refraction and the solar disc's radius while this asks for
     * the geometric centre — see solarPosition, which passes `undefined` for
     * refraction on purpose.
     */
    const { rise, set } = window_(2026, 6, 21);
    expect(Math.abs(rise! - (7 * 60 + 35))).toBeLessThanOrEqual(6);
    expect(Math.abs(set! - (17 * 60 + 8))).toBeLessThanOrEqual(6);
    expect(hhmm(rise!)).toMatch(/^07:/);
  });

  it('reports nothing when the window does not contain a crossing', () => {
    // Midday to mid-afternoon: the sun is up throughout and crosses nothing.
    const { rise, set } = daylightWindow(
      { year: 2026, month: 12, day: 21 },
      12 * 60,
      15 * 60,
      SITE.timeZone,
      site,
    );
    expect(rise).toBeNull();
    expect(set).toBeNull();
  });

  it('finds a crossing that falls inside a narrow window', () => {
    const { set } = daylightWindow(
      { year: 2026, month: 6, day: 21 },
      16 * 60,
      18 * 60,
      SITE.timeZone,
      site,
    );
    expect(set).not.toBeNull();
    expect(Math.abs(set! - (17 * 60 + 8))).toBeLessThanOrEqual(6);
  });
});

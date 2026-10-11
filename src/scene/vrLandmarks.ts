/*
 * ─────────────────────────────────────────────────────────────────────────
 * THE PLACES ANYBODY IN MELBOURNE COULD STEER BY
 * ─────────────────────────────────────────────────────────────────────────
 *
 * In a headset there is no street sign to read from a distance and no phone
 * to look at, so the map beside the reader names the places they would
 * steer by. Not every building: ten, spread over the grid, that a visitor
 * and a local would both know.
 *
 * Positions are each place's public map coordinates, rounded to four places
 * (about ten metres) and put through the app's own projection — less the
 * scene origin, as the data adapter does for every building — so they land
 * where the buildings are drawn. They mark the place, not its entrance.
 *
 * Names are ASCII, because the panel's font is — "St Paul's", not a curly
 * apostrophe.
 */

import { projectLonLat } from '../data/project';
import { LOCAL_ORIGIN_WGS84 } from './frame';

export interface Landmark {
  name: string;
  /** Metres east and north of the scene origin. */
  en: [number, number];
}

const LON_LAT: [string, number, number][] = [
  ['Flinders Street Station', 144.9671, -37.8183],
  ['Federation Square', 144.9691, -37.818],
  ["St Paul's Cathedral", 144.9677, -37.817],
  ['Town Hall', 144.9666, -37.815],
  ['Bourke Street Mall', 144.9643, -37.8136],
  ['Melbourne Central', 144.9628, -37.8102],
  ['State Library', 144.9652, -37.8098],
  ['Parliament House', 144.9737, -37.8111],
  ['Southern Cross Station', 144.9525, -37.8184],
  ['Queen Victoria Market', 144.9568, -37.8076],
];

const [ORIGIN_E, ORIGIN_N] = projectLonLat(LOCAL_ORIGIN_WGS84.lon, LOCAL_ORIGIN_WGS84.lat);

export const LANDMARKS: Landmark[] = LON_LAT.map(([name, lon, lat]) => {
  const [e, n] = projectLonLat(lon, lat);
  return { name, en: [e - ORIGIN_E, n - ORIGIN_N] };
});

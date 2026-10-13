/*
 * Takes the copy of the street activity API that ships with the app.
 *
 *   node scripts/street-activity-snapshot.mjs
 *
 * The four answers go into one file, public/data/street-activity.json, with
 * the moment they were taken. The street activity screen draws this copy
 * first and asks the live API behind it, the way the city model arrives
 * (useCityModel), so a demonstration without a network still has a street
 * to show. The counts are a day old by the next morning, which is why the
 * screen says when the copy was taken whenever it is the copy on screen.
 */
import { writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const BASE = process.env.VITE_API_BASE ?? 'https://api.mycitytwin.com';
const PARTS = ['sensors', 'recent', 'history', 'forecast'];

const answers = {};
for (const part of PARTS) {
  const url = `${BASE}/api/pedestrian-activities/${part}`;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`${response.status} ${url}`);
  answers[part] = await response.json();
}

const out = resolve(import.meta.dirname, '../public/data/street-activity.json');
writeFileSync(out, JSON.stringify({ takenAt: new Date().toISOString(), ...answers }));
console.log(
  `street-activity.json: ${answers.sensors.length} sensors, ${answers.history.length} recorded hours, ` +
    `${answers.forecast.forecasts.length} forecasts`,
);

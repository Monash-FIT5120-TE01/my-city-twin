/*
 * Writes the Mapbox token and style into the build, next to the files that
 * will be served, instead of into the bundle.
 *
 * WHY THIS EXISTS
 *   A token compiled into the bundle ends up inside every frozen release, and
 *   frozen releases are committed and never rebuilt. That means GitHub's
 *   secret scanning stops the push, and — the part that actually matters —
 *   rotating the token silently kills the map on every version already
 *   submitted. Written here, deployment rewrites it and the old versions pick
 *   the new one up untouched. See src/data/mapboxConfig.ts.
 *
 * WHERE IT WRITES
 *   `public`   for the dev server and for the next release build, which
 *              copies public/ into its output.
 *   `releases` for every version directory that is about to be uploaded,
 *              including the frozen ones that are not being rebuilt.
 *
 * NO TOKEN IS NOT AN ERROR
 *   Anyone who clones this has no .env.local and gets no file, which the app
 *   reads as "no map" and handles the same way it handles Mapbox being
 *   unreachable. Any stale file is removed rather than left behind, so a
 *   token that has been taken out of .env.local really does disappear.
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** The environment wins, so CI can supply the token without a file. */
function readEnv(name) {
  if (process.env[name]) return process.env[name];
  const file = join(root, '.env.local');
  if (!existsSync(file)) return undefined;
  const line = readFileSync(file, 'utf-8')
    .split('\n')
    .find((entry) => entry.startsWith(`${name}=`));
  return line?.slice(name.length + 1).trim() || undefined;
}

function targets(mode) {
  if (mode === 'public') return [join(root, 'public')];
  if (mode !== 'releases') throw new Error(`unknown target "${mode}" — expected public or releases`);

  const releases = join(root, 'releases');
  if (!existsSync(releases)) return [];
  return readdirSync(releases, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && /^ver-\d+$/.test(entry.name))
    .map((entry) => join(releases, entry.name));
}

const token = readEnv('VITE_MAPBOX_TOKEN');
const style = readEnv('VITE_MAPBOX_STYLE');

for (const directory of targets(process.argv[2])) {
  const file = join(directory, 'mapbox.json');
  if (!token) {
    if (existsSync(file)) rmSync(file);
    continue;
  }
  mkdirSync(directory, { recursive: true });
  writeFileSync(file, `${JSON.stringify(style ? { token, style } : { token }, null, 2)}\n`);
}

console.log(token ? 'mapbox.json written' : 'no VITE_MAPBOX_TOKEN — the app will run without a map');

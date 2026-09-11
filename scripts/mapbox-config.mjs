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
 * WHERE IT WRITES, AND WHY NOT INSIDE THE VERSIONS
 *   `public`   for the dev server, and for the dev subdomain, whose build
 *              output is served from the root.
 *   `releases` at the ROOT of the releases directory — one file shared by
 *              every version, served at /mapbox.json.
 *
 *   It was written into each version directory first, and that was wrong. A
 *   frozen release is frozen: the promise is that ver-1 in week 12 is the
 *   ver-1 that was submitted, and a deploy that reaches inside it to drop a
 *   file breaks that promise even when the file changes nothing. The version
 *   directories are therefore swept of it, including the copy the release
 *   build inherits from public/.
 *
 *   Out here it is also the more honest place for it: which token this
 *   deployment uses is a fact about the deployment, not about any version.
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
  /*
   * Quotes stripped. Vite removes them when it reads .env.local, so a token
   * written as VITE_MAPBOX_TOKEN="pk…" worked for as long as Vite was the
   * only reader. Now this script reads the same file, and without this it
   * hands Mapbox a credential with quotation marks inside it — a 401 that
   * looks exactly like a revoked token.
   */
  const value = line?.slice(name.length + 1).trim();
  return value?.replace(/^(['"])(.*)\1$/, '$2') || undefined;
}

/** Version directories, which must never end up holding this file. */
function versionDirectories() {
  const releases = join(root, 'releases');
  if (!existsSync(releases)) return [];
  return readdirSync(releases, { withFileTypes: true })
    .filter((entry) => entry.isDirectory() && /^ver-\d+$/.test(entry.name))
    .map((entry) => join(releases, entry.name));
}

const mode = process.argv[2];
if (mode !== 'public' && mode !== 'releases') {
  throw new Error(`unknown target "${mode}" — expected public or releases`);
}

const directory = mode === 'public' ? join(root, 'public') : join(root, 'releases');
const file = join(directory, 'mapbox.json');

const token = readEnv('VITE_MAPBOX_TOKEN');
const style = readEnv('VITE_MAPBOX_STYLE');

if (token) {
  mkdirSync(directory, { recursive: true });
  writeFileSync(file, `${JSON.stringify(style ? { token, style } : { token }, null, 2)}\n`);
} else if (existsSync(file)) {
  // A token taken out of .env.local really does disappear, rather than
  // leaving the last one lying in the build.
  rmSync(file);
}

let swept = 0;
if (mode === 'releases') {
  for (const version of versionDirectories()) {
    const stray = join(version, 'mapbox.json');
    if (!existsSync(stray)) continue;
    rmSync(stray);
    swept++;
  }
}

console.log(
  [
    token ? `${mode}/mapbox.json written` : `no VITE_MAPBOX_TOKEN — the app will run without a map`,
    swept ? `swept ${swept} copy(s) out of the frozen versions` : '',
  ]
    .filter(Boolean)
    .join('; '),
);

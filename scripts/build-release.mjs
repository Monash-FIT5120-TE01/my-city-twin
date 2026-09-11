/*
 * Builds the release, and decides for itself which one that is.
 *
 * WHY THIS REPLACED A GUARD
 *   The first attempt read the `--outDir` out of package.json and compared it
 *   with `LATEST`. Checking a command line as text does not work: a review
 *   defeated it with `releases/ver-2/../ver-1`, with a second `--outDir` after
 *   the first, and by planting a matching `LATEST` inside a comment. It also
 *   refused correct configurations that merely quoted the path.
 *
 *   None of that is fixable by a better regular expression, because the thing
 *   being examined was a description of the build rather than the build. So
 *   the description is gone: this script computes the version and runs Vite
 *   with it, and there is no second place for the number to be written.
 *
 * THE RULE
 *   The version being built is always the one after the newest frozen one.
 *   `LATEST` in worker/index.ts is that newest frozen version — it is what the
 *   bare domain sends people to, and bumping it is what "freezing" means. So
 *   freezing an iteration is one edit, and the build follows it. There is no
 *   state in which this can be pointed at submitted work.
 */

import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Comments stripped, so a `LATEST` written inside one cannot be read as code. */
function sourceWithoutComments(file) {
  return readFileSync(file, 'utf-8')
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^[ \t]*\/\/.*$/gm, '');
}

const worker = sourceWithoutComments(join(root, 'worker', 'index.ts'));
const declared = /\bconst\s+LATEST\s*=\s*['"]ver-(\d+)['"]/.exec(worker);
if (!declared) {
  throw new Error("worker/index.ts must declare const LATEST = 'ver-N'");
}

const frozen = Number(declared[1]);
const version = `ver-${frozen + 1}`;
const outDir = `releases/${version}`;

console.log(`building ${version}; frozen up to ver-${frozen}`);

for (const step of [
  ['node', ['scripts/mapbox-config.mjs', 'public']],
  ['npx', ['tsc', '-b']],
  ['npx', ['vite', 'build', `--base=/${version}/`, '--outDir', outDir, '--emptyOutDir']],
  // Last, so the version directory cannot keep the copy Vite inherits from
  // public/ — a frozen release must not carry deployment configuration.
  ['node', ['scripts/mapbox-config.mjs', 'releases']],
]) {
  const [command, args] = step;
  const run = spawnSync(command, args, { cwd: root, stdio: 'inherit', shell: process.platform === 'win32' });
  if (run.status !== 0) process.exit(run.status ?? 1);
}

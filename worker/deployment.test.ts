import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/*
 * What is actually about to be uploaded to mycitytwin.com.
 *
 * These read releases/ off disk rather than importing anything, because the
 * failures they are for are failures of the build command, not of the code:
 * a release built against the wrong base, a version the redirect points at
 * that was never built. Both produce a blank screen on a URL that has
 * already been handed to a marker, and neither makes the build exit
 * non-zero.
 */

const ROOT = resolve(__dirname, '..');
const RELEASES = resolve(ROOT, 'releases');

const worker = readFileSync(resolve(__dirname, 'index.ts'), 'utf-8');
const latest = /^const LATEST = '([^']+)';$/m.exec(worker)?.[1];

const frozenVersions = readdirSync(RELEASES, { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && /^ver-\d+$/.test(entry.name))
  .map((entry) => entry.name);

describe('the releases about to be deployed', () => {
  it('contains at least one frozen version', () => {
    expect(frozenVersions.length).toBeGreaterThan(0);
  });

  it('sends the bare domain to a version that was actually built', () => {
    // A LATEST that no longer matches the constant's shape reads as
    // undefined here, which fails just as loudly as pointing at a missing
    // directory — the redirect is the one thing with no fallback.
    expect(frozenVersions).toContain(latest);
  });

  it.each(frozenVersions)('builds %s against its own path', (version) => {
    /*
     * The mistake: running the release build with --base and --outDir out of
     * step, so a version's files land in ver-2/ still believing they are
     * served from ver-1/, or from the root. Vite reports success either way
     * and the page loads white.
     */
    const html = readFileSync(resolve(RELEASES, version, 'index.html'), 'utf-8');
    const local = [...html.matchAll(/(?:src|href)="([^"]+)"/g)]
      .map((match) => match[1])
      .filter((reference) => reference.startsWith('/'));

    // A build with no local references at all would pass the loop below
    // without checking anything.
    expect(local.length).toBeGreaterThan(0);
    for (const reference of local) {
      expect(reference).toMatch(new RegExp(`^/${version}/`));
    }
  });

  it.each(frozenVersions)('keeps deployment configuration out of %s', (version) => {
    /*
     * The Mapbox token is written at deploy time, and it was written into
     * each version directory first. That is wrong however harmless the file
     * is: a frozen release is the promise that ver-1 in week 12 is the ver-1
     * that was submitted, and a deploy that reaches inside one to add a file
     * has already broken it. The configuration lives at the root instead,
     * above every version — see data/mapboxConfig.ts.
     */
    expect(existsSync(resolve(RELEASES, version, 'mapbox.json'))).toBe(false);
  });

  it.each(frozenVersions)('ships the data %s draws the city from', (version) => {
    // The snapshot is what puts the city on screen before the sleeping
    // staging API answers, so a version missing it is a version that opens
    // on an empty grid for the first minute.
    expect(existsSync(resolve(RELEASES, version, 'data', 'building-footprints.json'))).toBe(true);
  });
});

import { readdirSync, readFileSync } from 'node:fs';
import { join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { joinBase } from './bundled';

/*
 * The site is served from a versioned path — /ver-1/, /ver-2/ — so that each
 * submitted iteration keeps working after the next one lands. Everything
 * shipped in public/ therefore has to be addressed through the build's base.
 *
 * The second test is the point of this file. An absolute '/data/roads.json'
 * is correct in development, where the base is '/', and wrong in every
 * release build — so nothing goes red until the version is deployed and a
 * layer quietly fails to draw on the URL the markers were given. Catching it
 * here is the only place it is cheap.
 */

const SRC = resolve(__dirname, '..');

/** Every file that ends up in a build. Tests do not ship, so they are out. */
function shippedSources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return shippedSources(path);
    if (/\.test\.tsx?$/.test(entry.name)) return [];
    return /\.(ts|tsx|css)$/.test(entry.name) ? [path] : [];
  });
}

describe('bundled', () => {
  it('joins a base to a path below it', () => {
    expect(joinBase('/', 'data/roads.json')).toBe('/data/roads.json');
    expect(joinBase('/ver-1/', 'data/roads.json')).toBe('/ver-1/data/roads.json');
  });

  it('survives the two shapes that produce a doubled slash', () => {
    // Vite always ends its base with a slash and callers are told to pass a
    // path without one, but a doubled slash is a 404 on Cloudflare's asset
    // router rather than a tidy-up, so neither is left to convention.
    expect(joinBase('/ver-1', 'data/roads.json')).toBe('/ver-1/data/roads.json');
    expect(joinBase('/ver-1/', '/data/roads.json')).toBe('/ver-1/data/roads.json');
  });

  it('never addresses a shipped file from the root of the domain', () => {
    /*
     * Anchored on the quote so this reads string literals rather than prose:
     * a comment mentioning /data/ is not a bug, and the file above is full
     * of them.
     */
    const absolute = [
      /fetch\(\s*['"`]\//, // fetch('/data/roads.json')
      /['"`]\/(?:data|assets|icons|favicon)/, // new URL, <img src>, loaders
      /url\(\s*['"]?\//, // CSS url(/…)
    ];

    const offenders = shippedSources(SRC)
      // The one deliberate exception, checked on its own terms below.
      .filter((file) => relative(SRC, file) !== join('data', 'mapboxConfig.ts'))
      .flatMap((file) => {
        const text = readFileSync(file, 'utf-8');
        return absolute
          .filter((pattern) => pattern.test(text))
          .map((pattern) => `${relative(SRC, file)} matches ${pattern.source}`);
      });

    expect(offenders).toEqual([]);
  });

  it('allows the map configuration exactly one absolute path, and no more', () => {
    /*
     * The Mapbox configuration is the one thing that is NOT part of a
     * version: writing it inside /ver-1/ would mean a deploy reaching into a
     * frozen release to change a file in it, which is the one thing freezing
     * is for. So it lives at the root and is addressed absolutely.
     *
     * That exemption is worth exactly one path. This pins it, so the file
     * cannot quietly become the place where other absolute paths go to avoid
     * the rule above.
     */
    const text = readFileSync(resolve(SRC, 'data/mapboxConfig.ts'), 'utf-8');
    const absolutePaths = [...text.matchAll(/'(\/[^']*)'/g)].map((match) => match[1]);
    expect(absolutePaths).toEqual(['/mapbox.json']);
  });

  it('never reads the Mapbox token from the build environment', () => {
    /*
     * Vite substitutes import.meta.env at build time, so one reference here
     * puts the token inside the bundle — and therefore inside every frozen
     * release, which is committed and never rebuilt. Two things follow, and
     * neither announces itself: GitHub's secret scanning refuses the push,
     * and rotating the token kills the map on versions already submitted.
     *
     * It is fetched at run time instead. This is the guard on that decision,
     * because putting it back is a one-line convenience that looks like a
     * simplification.
     */
    const offenders = shippedSources(SRC)
      .filter((file) => /VITE_MAPBOX/.test(readFileSync(file, 'utf-8')))
      .map((file) => relative(SRC, file));

    expect(offenders).toEqual([]);
  });
});

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

    const offenders = shippedSources(SRC).flatMap((file) => {
      const text = readFileSync(file, 'utf-8');
      return absolute
        .filter((pattern) => pattern.test(text))
        .map((pattern) => `${relative(SRC, file)} matches ${pattern.source}`);
    });

    expect(offenders).toEqual([]);
  });
});

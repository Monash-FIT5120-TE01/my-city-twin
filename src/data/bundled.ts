/*
 * ─────────────────────────────────────────────────────────────────────────
 * ADDRESSING THE FILES THAT SHIP WITH THE APP
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Each finished iteration is frozen and served forever at its own path —
 * mycitytwin.com/ver-1/, /ver-2/, /ver-3/ — so that a marker returning to
 * Iteration 1 in week 12 sees what was submitted, not what has happened
 * since. Vite is told that path at build time and rewrites every import and
 * every URL in index.html to match.
 *
 * It cannot rewrite a string. A path written by hand with a leading slash —
 * data/roads.json addressed as though the app sat at the root — leaves the
 * version it belongs to and asks the root of the domain, which holds no data
 * at all, so the layer silently fails to load.
 *
 * The trap is that this is invisible while developing. The base is '/' then,
 * and an absolute path happens to be correct; the mistake only surfaces in
 * the release build, which is the last one anybody looks at closely. That is
 * what bundled.test.ts is for — the browser will not tell you.
 */

/**
 * Joins a Vite base to a path below it.
 *
 * Separate from `bundled` and exported so the joining can be tested at bases
 * other than the one the test run itself was built with.
 */
export function joinBase(base: string, path: string): string {
  const root = base.endsWith('/') ? base : `${base}/`;
  // Cloudflare's asset router treats a doubled slash as a different path
  // from a single one, and has nothing at the doubled one.
  return root + path.replace(/^\/+/, '');
}

/**
 * The URL of a file shipped in public/, from wherever this build is served.
 *
 * Takes the path as it sits inside public/ — `bundled('data/roads.json')`.
 */
export function bundled(path: string): string {
  return joinBase(import.meta.env.BASE_URL, path);
}

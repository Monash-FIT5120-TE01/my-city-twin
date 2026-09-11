/*
 * ─────────────────────────────────────────────────────────────────────────
 * SERVING EVERY ITERATION AT ONCE
 * ─────────────────────────────────────────────────────────────────────────
 *
 * An iteration is submitted, marked, and then has to keep working. A marker
 * may open Iteration 1 in week 12, long after Iteration 3 has rewritten the
 * screens it was marked on. So a finished iteration is frozen as a built
 * directory under releases/ and served forever at its own path:
 *
 *   mycitytwin.com/ver-1/   ←  releases/ver-1/   built with --base=/ver-1/
 *   mycitytwin.com/ver-2/   ←  releases/ver-2/   built with --base=/ver-2/
 *
 * Cloudflare serves those files directly and this script never runs for
 * them. It exists for the two requests the asset router cannot answer on its
 * own: the bare domain, and a path inside a version that is not a file.
 *
 * Work in progress does not appear here at all — it goes to a separate
 * Worker on dev.mycitytwin.com, so that deploying it cannot touch a
 * submitted version. See wrangler.dev.jsonc.
 */

/**
 * Where the bare domain leads.
 *
 * Bump this when an iteration is FINISHED, not when one begins. Bumped early
 * it points mycitytwin.com at a half-built version, which is the one URL
 * everybody types from memory.
 */
const LATEST = 'ver-1';

/** '/ver-2/anything' and bare '/ver-2' alike. */
const VERSION_PATH = /^\/(ver-\d+)(?:\/|$)/;

interface Env {
  ASSETS: { fetch(request: Request): Promise<Response> };
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === '/') {
      /*
       * Rewriting only the path keeps the query and the fragment, which
       * carry the entire state of the app — a shared link is normally a link
       * to one building on one afternoon, and dropping the query would land
       * the reader on the front page instead.
       */
      url.pathname = `/${LATEST}/`;
      return Response.redirect(url.toString(), 302);
    }

    const version = VERSION_PATH.exec(url.pathname)?.[1];
    if (version) {
      /*
       * A single-page-application fallback, per version.
       *
       * Cloudflare's built-in one rewrites to /index.html at the root of the
       * assets directory — which here is not any version's page, and does
       * not exist. A deep link into ver-1 would have fallen through to a
       * bare 404, or worse, to another version's app.
       *
       * The DIRECTORY, not the index file. Asking for `/ver-2/index.html`
       * meets Cloudflare's HTML handling, which canonicalises index URLs by
       * REDIRECTING to the directory — and a redirect at this point sends the
       * browser to the version root, dropping the query string that carries
       * the whole shared state. `?view=sunlight&d=…&t=…` is the entire point
       * of the link.
       */
      return env.ASSETS.fetch(new Request(new URL(`/${version}/`, url)));
    }

    return new Response('Not found', { status: 404 });
  },
};

import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],

  resolve: {
    /*
     * ── ONE THREE.JS, NOT TWO ────────────────────────────────────────────
     *
     * The console said so on every load:
     *
     *   WARNING: Multiple instances of Three.js being imported.
     *
     * `stats-gl`, which arrives as a dependency of drei, asks for three
     * 0.170 while this project is on 0.185, so npm installed a second copy
     * under it. Importing drei by its barrel pulls that in even though
     * nothing here uses the stats overlay.
     *
     * WHY IT IS NOT A HARMLESS WARNING
     *   Two copies means two sets of classes. Anything that tests identity
     *   across them — `instanceof`, the layer masks the raycaster compares,
     *   the material caches the renderer keys on — can quietly disagree, and
     *   the symptom is never an error. It is an object that does not draw,
     *   or a click that hits nothing, with a clean console underneath it.
     *
     *   That is precisely the class of fault being chased when this was
     *   found, which is reason enough to remove it before looking further:
     *   a duplicate renderer is not something to leave in place while
     *   debugging what the renderer is doing.
     *
     * Deduping resolves every request for `three` to the one at the root.
     */
    dedupe: ['three'],
  },

  build: {
    rolldownOptions: {
      output: {
        /*
         * ── CLASS NAMES SURVIVE THE MINIFIER ───────────────────────────────
         *
         * @react-three/uikit registers each component with react-three-fiber
         * under a name built from its class's `name` — `Vanilla${Component.name}`
         * — and creates it from that name again when it renders. Minified, a
         * class is an anonymous `class extends …` stored in a short variable,
         * and its `name` is that variable's: "Za", "fo", "R". Those are chosen
         * per chunk, so two components in two chunks could be given the same
         * one, and the second registration replaced the first: a container
         * was then built as an image, which may not have children, and threw.
         *
         * Only the production build was affected — the dev server does not
         * minify — so the emulator, which runs on the dev server, never showed
         * it. On the headset (2026-10-09) the scene failed, the WebGL context
         * was lost and the view went black from the first second; an
         * unminified build on the same headset was fine.
         */
        keepNames: true,
      },
    },
  },
})

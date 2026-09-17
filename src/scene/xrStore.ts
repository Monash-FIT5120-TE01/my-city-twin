/*
 * ─────────────────────────────────────────────────────────────────────────
 * THE ONE XR STORE, AND WHETHER THIS DEVICE CAN USE IT
 * ─────────────────────────────────────────────────────────────────────────
 *
 * WHY IT IS A SINGLETON AND NOT STATE
 *   Two places need it and they are on opposite sides of the renderer. The
 *   button that starts a session is ordinary DOM in App; the <XR> that runs
 *   the session is inside <Canvas>. Threading one object between them through
 *   props would mean App holding a piece of three.js it never uses, and a
 *   context would have to wrap both — which is the same singleton with more
 *   ceremony.
 *
 *   There is also only ever one headset. A second store would be a second
 *   claim on a device that cannot be claimed twice.
 *
 * WHY IT IS BUILT LAZILY
 *   `createXRStore` reaches for `window` when it is made. This module is
 *   imported by App, App is imported by tests, and tests run in Node — where
 *   building it at import time would throw before a single assertion ran.
 *
 * WHY THE SUPPORT CHECK LIVES HERE AND NOT BESIDE THE OTHER FEATURE TESTS
 *   Because on this codebase support is a property of the STORE, not of the
 *   browser. Making the store is what installs the headset emulator on
 *   localhost — see below — so "can this page enter VR" cannot be answered
 *   without first having made one. Kept in two files, the answer was computed
 *   before the question could be true.
 *
 * THE RULE THIS FILE CANNOT ENFORCE, AND WHICH BREAKS EVERYTHING
 *   A WebXR session may only be started from a real user gesture, and the
 *   gesture expires the moment the handler awaits anything. So the click
 *   handler must call `enterVR()` ITSELF:
 *
 *     onClick={() => xrStore().enterVR()}          // works
 *     onClick={async () => { await x; enterVR() }} // permission denied
 *
 *   The failure is not an exception anybody sees. The headset simply does not
 *   go in, and the button looks broken.
 */

import { useEffect, useState } from 'react';
import { createXRStore, type XRStore } from '@react-three/xr';

let store: XRStore | null = null;

/** The store, made on first use. */
export function xrStore(): XRStore {
  store ??= createXRStore({
    /*
     * Hands off, literally.
     *
     * The defaults put a ray pointer on each controller and each hand, for
     * pointing at things in the scene. Nothing in the city is meant to be
     * poked at in VR yet — the whole of the interface is still DOM, and DOM
     * does not exist in an immersive session — so a pair of laser pointers
     * would be an affordance for nothing.
     *
     * The controller MODELS stay. Seeing your own hands is most of what
     * makes a headset feel like standing somewhere, and it is how anybody
     * works out which thumbstick does what.
     */
    hand: { rayPointer: false, grabPointer: false, touchPointer: false },
    controller: { rayPointer: false, grabPointer: false },
    /*
     * The emulator is left ON, which is the library's default.
     *
     * On localhost, and only on localhost, it installs a simulated headset into
     * `navigator.xr` when no real headset is there. That is the difference
     * between checking a change by reading it and checking it by walking
     * around in it, without putting a headset on for every typo.
     *
     * It cannot answer the questions that actually matter — frame rate,
     * comfort, whether the shadows survive being looked at from the
     * pavement. Those need the device. It answers the other kind: does the
     * stick move the right way, does the wall stop you, does turning pivot
     * where a person would expect.
     *
     * It is not shipped to anybody: the hostname gate keeps it off
     * dev.mycitytwin.com and off the live versions. On those it can still be
     * summoned deliberately with Alt+Meta+E, followed by a reload — the
     * support check below runs once and will already have said no.
     */
  });
  return store;
}

/**
 * End the session and come back to the page.
 *
 * There is no `exitVR()` to match `enterVR()`. The store's own documentation
 * says so, in the note on `destroy()`: "for exiting XR use
 * `store.getState().session?.end()`". Wrapped here so that the one asymmetric
 * call in the library is written once rather than everywhere it is needed,
 * and so the reason is recorded next to it.
 *
 * Safe to call when nothing is running — it does nothing.
 */
export function exitVr(): void {
  void xrStore().getState().session?.end();
}

/*
 * ── IS THERE ANYTHING TO ENTER ───────────────────────────────────────────
 *
 * `isSessionSupported('immersive-vr')` answers one question: could this
 * browser, on this device, start a VR session. It does NOT say whether
 * anybody is wearing anything. On a standalone headset, where the browser only runs inside
 * the headset, the two amount to the same thing. On a desktop with a tethered
 * headset they do not, which is why the button this drives is an offer rather
 * than an assumption.
 */

/**
 * How long to keep asking, and how often.
 *
 * ASKING ONCE IS NOT ENOUGH, and this is the part that is easy to get wrong.
 * The emulator installs itself ASYNCHRONOUSLY — making the store starts the
 * work, and `navigator.xr` appears some time later. A single check on mount
 * therefore runs before it lands, caches "no", and the button never appears
 * on localhost at all. Which looks exactly like the feature being broken.
 *
 * Three seconds is far longer than the injection takes and short enough that
 * nothing is still running by the time anybody has read the page. A real
 * headset answers on the first tick and the rest never happen.
 */
const ASK_EVERY_MS = 200;
const STOP_ASKING_AFTER_MS = 3000;

let inFlight: Promise<boolean> | null = null;

function checkSupport(): Promise<boolean> {
  inFlight ??= (async () => {
    /*
     * Made before asked about. On localhost this IS what makes the answer
     * able to become yes; everywhere else it is harmless, because the store
     * is about to be made by the canvas anyway.
     */
    xrStore();

    const deadline = Date.now() + STOP_ASKING_AFTER_MS;
    for (;;) {
      /*
       * `navigator.xr` is typed as always present — @types/webxr arrives with
       * @react-three/xr and declares it unconditionally — and it is absent on
       * most browsers in the world. The optional chain is not defensive
       * programming against the type; it is the type being wrong.
       */
      const xr = navigator.xr as XRSystem | undefined;
      if (xr?.isSessionSupported) {
        try {
          if (await xr.isSessionSupported('immersive-vr')) return true;
        } catch {
          /*
           * A rejection is a no, and a permanent one.
           *
           * Browsers reject rather than returning false in at least two
           * ordinary cases — an insecure context, and a permissions policy
           * that withholds `xr-spatial-tracking`. Neither is something
           * waiting will fix, so this stops rather than spending the whole
           * budget rediscovering it.
           */
          return false;
        }
      }
      if (Date.now() >= deadline) return false;
      await new Promise((resume) => setTimeout(resume, ASK_EVERY_MS));
    }
  })();
  return inFlight;
}

/**
 * True once this page is known to be able to enter VR.
 *
 * Starts false and may become true a moment later — which is why the button
 * appears rather than being there from the first frame. It never goes back.
 */
export function useVrSupported(): boolean {
  const [supported, setSupported] = useState(false);

  useEffect(() => {
    let live = true;
    void checkSupport().then((result) => {
      if (live) setSupported(result);
    });
    return () => {
      live = false;
    };
  }, []);

  return supported;
}

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
 *   Because on this codebase support is not only a property of the browser.
 *   On localhost the answer depends on the simulated headset this file
 *   installs — see installLocalHeadset below — so "can this page enter VR"
 *   cannot be answered before that has run. Kept in two files, the answer was
 *   computed before the question could be true.
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
import {
  CURSOR_COLOR,
  CURSOR_SIZE_M,
  OnTopCursorMaterial,
  POINTER_RENDER_ORDER,
} from './vrPointer';

let store: XRStore | null = null;

/** The store, made on first use. */
export function xrStore(): XRStore {
  store ??= createXRStore({
    /*
     * A laser from each controller, and nothing else.
     *
     * The first VR build switched the rays off: the whole interface was DOM,
     * and DOM does not exist in an immersive session, so a pair of pointers
     * would have been an affordance for nothing. There is something to point
     * at now — the panel, the proposals and the ground — and the ray, with
     * the trigger as its click, is the one way of choosing that nobody has to
     * be taught: it is how the headset's own menus work.
     *
     * Both hands, because which hand is free is the reader's business and a
     * label saying "use the right one" is a label they cannot read in time.
     * Grab and touch stay off. Nothing here is meant to be picked up, and a
     * touch pointer on a panel held at arm's length fires on a brush.
     *
     * Hands (tracking without controllers) stay off entirely. The walking,
     * the hour and the way out are all on controller buttons.
     *
     * The controller MODELS stay. Seeing your own hands is most of what
     * makes a headset feel like standing somewhere, and it is how anybody
     * works out which thumbstick does what.
     */
    hand: { rayPointer: false, grabPointer: false, touchPointer: false },
    controller: {
      /*
       * A slow pull is still a click.
       *
       * The pointer library only counts a press as a click if it is let go
       * within 300 ms. Somebody in a headset for the first time squeezes the
       * trigger deliberately, holds it while they check the laser is where
       * they meant, and lets go — and at 300 ms that press did nothing at
       * all, with nothing to say why. The desktop reached the same conclusion
       * about mouse clicks (see tap.ts): time says nothing useful about
       * intent. A press still has to start and end on the same button, which
       * is what makes pointing away the way to change your mind.
       */
      rayPointer: {
        clickThresholdMs: 2000,
        /*
         * Drawn over the panel, and the cursor visible on anything — see
         * vrPointer.ts for how the panel used to hide both.
         */
        rayModel: { renderOrder: POINTER_RENDER_ORDER },
        cursorModel: {
          renderOrder: POINTER_RENDER_ORDER,
          size: CURSOR_SIZE_M,
          color: CURSOR_COLOR,
          opacity: 1,
          materialClass: OnTopCursorMaterial,
        },
      },
      grabPointer: false,
    },
    /*
     * The library's own emulator is switched OFF, and this file installs
     * one itself — see installLocalHeadset below for why.
     */
    emulate: false,
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
 * The simulated headset on localhost is now awaited before the first question
 * (installLocalHeadset), so the old race — asking before it had landed,
 * caching "no", and never showing the button — cannot happen through that
 * path. The polling stays because a browser's own runtime can also take a
 * moment to report a headset that has only just been connected.
 *
 * Three seconds is far longer than the injection takes and short enough that
 * nothing is still running by the time anybody has read the page. A real
 * headset answers on the first tick and the rest never happen.
 */
const ASK_EVERY_MS = 200;
const STOP_ASKING_AFTER_MS = 3000;

/*
 * ── A HEADSET ON LOCALHOST ───────────────────────────────────────────────
 *
 * On localhost, and only there, a simulated Meta Quest 3 is installed into
 * `navigator.xr` when no real headset is attached. That is the difference
 * between checking a change by reading it and checking it by walking around
 * in it, without putting a headset on for every typo. The simulator draws
 * its own controls over the page — move the controllers, pull triggers,
 * press X — once a session starts.
 *
 * It cannot answer the questions that actually matter — comfort, whether
 * text is readable at arm's length, whether the shadows survive being looked
 * at from the pavement. Those need the device. It answers the other kind:
 * does the panel's button do what it says, does the stick move the right
 * way, does the wall stop you.
 *
 * WHY THIS FILE INSTALLS IT, AND NOT THE LIBRARY
 *   @react-three/xr can do it, and did. It stopped working in Chrome: current
 *   Chrome has a `navigator.xr` of its own on every desktop, headset or not,
 *   and the simulator (IWER 2.4) now treats any existing `navigator.xr` as a
 *   real runtime and declines to replace it — "skipping installRuntime". The
 *   library calls it without the one option that overrides that, so on
 *   localhost the VR button simply never appeared, which looks exactly like
 *   the feature being broken.
 *
 *   So the library's emulator is off, and this does what it did plus
 *   `forceInstall`: ask the browser first whether a REAL headset is there
 *   (a Quest on Link, say, must keep working), and only if not, replace
 *   `navigator.xr` with the simulator.
 *
 * NOT SHIPPED TO ANYBODY
 *   The hostname gate keeps it off dev.mycitytwin.com and the live versions,
 *   and the simulator is a separate chunk that only localhost ever fetches.
 */
let localHeadset: Promise<void> | null = null;

function installLocalHeadset(): Promise<void> {
  localHeadset ??= (async () => {
    if (typeof window === 'undefined' || window.location.hostname !== 'localhost') return;

    const native = navigator.xr as XRSystem | undefined;
    if (native?.isSessionSupported) {
      const real = await native.isSessionSupported('immersive-vr').catch(() => false);
      if (real) return;
    }

    const [{ XRDevice, metaQuest3 }, { DevUI }] = await Promise.all([
      import('iwer'),
      import('@iwer/devui'),
    ]);
    const device = new XRDevice(metaQuest3);
    // One image for both eyes, as the library's emulator had it: the page
    // shows a single view rather than a stereo pair.
    device.ipd = 0;
    device.installRuntime({ forceInstall: true });
    device.installDevUI(DevUI);
    // Where the library would have put it, so it can be driven imperatively
    // — from the console, or from an automated check.
    xrStore().setState({ emulator: device });
  })();
  return localHeadset;
}

let inFlight: Promise<boolean> | null = null;

function checkSupport(): Promise<boolean> {
  inFlight ??= (async () => {
    /*
     * The store first, so the simulator can be handed to it; then, on
     * localhost, the simulator — which is what makes the answer able to
     * become yes there. Everywhere else the second line does nothing.
     */
    xrStore();
    await installLocalHeadset();

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

/**
 * Whether a session is running right now.
 *
 * Read from the store rather than through `useXR`, which only works under
 * <XR> — and App, which needs to know so that choosing a place inside the
 * headset opens the page that can be operated from inside it, is above the
 * canvas. Starts false: nothing can have started a session before the page
 * that offers one has rendered.
 */
export function useInVr(): boolean {
  const [inVr, setInVr] = useState(false);
  useEffect(() => xrStore().subscribe((state) => setInVr(state.session != null)), []);
  return inVr;
}

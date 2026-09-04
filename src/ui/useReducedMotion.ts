/*
 * ─────────────────────────────────────────────────────────────────────────
 * "MOVE THINGS LESS"
 * ─────────────────────────────────────────────────────────────────────────
 *
 * WHAT THIS FILE IS
 *   One answer to one question: has this person asked their operating system
 *   to reduce motion?
 *
 * WHY IT IS A HOOK AND NOT ONLY A CSS MEDIA QUERY
 *   CSS can answer it for the panels, and does — see the block at the end of
 *   ui.css. But the camera is not CSS. A flight across the city is three.js
 *   arithmetic running inside a frame loop, and the only way that loop can
 *   know is to be told. So the preference has to exist as a value as well as
 *   a media query, and both have to be driven by the same signal or they
 *   will disagree.
 *
 * WHY IT LISTENS RATHER THAN READING ONCE
 *   The setting can be changed while the page is open — on Windows it is a
 *   single toggle in Settings, and people who need it often turn it on
 *   partway through precisely because something moved. Reading once at
 *   startup would ignore them until a reload.
 *
 * WHO SHOULD USE IT
 *   Anything that would otherwise animate. When it returns true the correct
 *   behaviour is never "a shorter animation" — it is to arrive at the final
 *   state immediately. Reduced motion is a request to remove the movement,
 *   not to hurry it.
 */

import { useEffect, useState } from 'react';

const QUERY = '(prefers-reduced-motion: reduce)';

export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(
    // Guarded because the value is read during render, and a test or a
    // server render has no matchMedia. Defaulting to false there matches
    // what a browser with no preference set would say.
    () => typeof window !== 'undefined' && window.matchMedia?.(QUERY).matches === true,
  );

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return;
    const media = window.matchMedia(QUERY);
    const onChange = () => setReduced(media.matches);
    // Re-read on mount too: the preference can have changed between the
    // first render and this effect.
    onChange();
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, []);

  return reduced;
}

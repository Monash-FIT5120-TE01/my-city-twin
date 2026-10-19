/*
 * ─────────────────────────────────────────────────────────────────────────
 * HOW THE PAGE IS DRAWN, AS THE READER HAS ASKED
 * ─────────────────────────────────────────────────────────────────────────
 *
 * The reader's own display settings (team decision, 2026-10-20), each on or off on its own:
 *
 *   colourSafe   colours for the common colour vision differences: the building kinds far apart in
 *                lightness as well as hue, with stripes and outlines on the buildings so that nothing
 *                rests on colour alone (palette.ts, DevelopmentMassings.tsx, kit.css).
 *   lowGraphics  less work for an older computer, or to use less power: fewer pixels, at most 30 frames a
 *                second, a smaller shadow map redrawn less often while the hour is being dragged, and the
 *                street furniture drawn as near as on a phone (SceneCanvas). Not in a headset. The
 *                sunlight figures are worked out apart from the drawing and do not change.
 *
 * Kept here rather than in React so the scene and the page read the same value, and on <html> as
 * data-colour="safe" so the stylesheets can follow it. Remembered in this browser only.
 */
import { useSyncExternalStore } from 'react';

export interface DisplaySettings {
  colourSafe: boolean;
  lowGraphics: boolean;
}

const STORE_KEY = 'mct-display';
const DEFAULTS: DisplaySettings = { colourSafe: false, lowGraphics: false };

let settings: DisplaySettings = DEFAULTS;
const listeners = new Set<() => void>();

function apply() {
  if (typeof document !== 'undefined') {
    if (settings.colourSafe) document.documentElement.dataset.colour = 'safe';
    else delete document.documentElement.dataset.colour;
  }
  for (const listener of listeners) listener();
}

/** At start: what was chosen on an earlier visit. */
export function restoreDisplay(): void {
  try {
    const saved = JSON.parse(window.localStorage.getItem(STORE_KEY) ?? 'null') as Partial<DisplaySettings> | null;
    if (saved && typeof saved === 'object') {
      settings = { colourSafe: saved.colourSafe === true, lowGraphics: saved.lowGraphics === true };
    }
  } catch {
    // nothing saved, or storage blocked: the defaults
  }
  apply();
}

export function setDisplay(change: Partial<DisplaySettings>): void {
  settings = { ...settings, ...change };
  try {
    window.localStorage.setItem(STORE_KEY, JSON.stringify(settings));
  } catch {
    // private window: holds for this visit only
  }
  apply();
}

export function getDisplay(): DisplaySettings {
  return settings;
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

/** The settings; a component that calls this is drawn again when they change. */
export function useDisplay(): DisplaySettings {
  return useSyncExternalStore(subscribe, getDisplay, () => DEFAULTS);
}

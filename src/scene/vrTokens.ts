/*
 * The headset panels' colours, sizes and text rules — the tokens vrKit.tsx
 * builds its parts from. Kept apart from the components so either can be
 * imported without the other.
 */

// ── The 2D sheet's tokens (src/styles/tokens.css) ──────────────────────────
export const PAPER = '#ffffff';
export const SUNKEN = '#f3f5f2';
export const TRACK = '#eceeeb';
export const PRESSED = '#e2e4e1';
export const INK = '#16181a';
export const INK_2 = '#5a6169';
export const EDGE = '#7a8087';
export const GLASS_EDGE = '#d4d8d6';
export const GREEN = '#14624a';
export const GREEN_HOVER = '#176b50';
export const GREEN_PRESSED = '#0f4d3a';
export const GREEN_SOFT = '#d8ebe3';
export const AMBER = '#e89a21';
export const AMBER_RAIL = '#e9a93f';
export const AMBER_SOFT = '#fcefcc';
export const AMBER_INK = '#8a5e0c';
export const NIGHT_RAIL = '#dce1e3';

/** One pixel of layout is one millimetre in the room. */
export const PIXEL_M = 0.001;

/**
 * Whose the laser is when things overlap. A panel as a whole outranks the
 * city; its controls outrank the panel, so a control lying in the panel's
 * own plane never loses a tie with it.
 */
export const PANEL_ORDER = 10;
export const CONTROL_ORDER = 11;

/** The smallest thing pressed with the laser, mm: about 3.4 degrees at the menu's distance of a metre. */
export const TARGET_MM = 60;

/** Characters the font has, standing in for the ones it does not. */
export function plain(text: string): string {
  return text
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, '-')
    .replace(/·/g, '|')
    .replace(/…/g, '...')
    .replace(/©/g, '(c)')
    .replace(/−/g, '-')
    .replace(/[^\x20-\x7E°]/g, '');
}

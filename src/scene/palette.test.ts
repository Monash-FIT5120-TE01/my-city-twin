/*
 * The city's colours, held in step across the places they appear, and
 * held to the lightness steps palette.ts promises.
 *
 * WHAT THESE PIN DOWN
 *   - Every key, swatch and dot (the --key-* tokens in tokens.css, drawn by
 *     kit/Swatch) uses the colours the buildings show on screen (palette.ts
 *     KEY) — a key that has drifted from the map is a key to a different map.
 *   - The city is lighter than either kind of project by a clear step, and
 *     the two kinds of project sit at opposite ends of blue–yellow (b*),
 *     which red–green colour blindness keeps: apart without relying on hue.
 *   - A project's stage picks its colours: under construction is orange,
 *     anything else teal.
 */

import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { APPROVED, IN_PROGRESS, KEY, toneOf } from './palette';

const read = (path: string) => readFileSync(resolve(__dirname, path), 'utf-8');

/** CIELAB L* and b* (blue–yellow) of an sRGB hex colour. */
function lab(hex: string): { l: number; b: number } {
  const channel = (i: number) => {
    const c = Number.parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const [r, g, bl] = [channel(1), channel(3), channel(5)];
  const f = (t: number) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const y = 0.2126 * r + 0.7152 * g + 0.0722 * bl;
  const z = (0.0193 * r + 0.1192 * g + 0.9505 * bl) / 1.08883;
  return { l: 116 * f(y) - 16, b: 200 * (f(y) - f(z)) };
}

/** The value tokens.css gives a custom property. */
function token(css: string, name: string): string | undefined {
  const at = css.indexOf(`--${name}:`);
  if (at === -1) return undefined;
  return css.slice(at).match(/:\s*(#[0-9a-f]{6})/i)?.[1]?.toLowerCase();
}

describe('the city palette', () => {
  it('is the palette every key, swatch and dot draws (tokens.css --key-*)', () => {
    const css = read('../styles/tokens.css');
    for (const [kind, colours] of Object.entries(KEY)) {
      expect(token(css, `key-${kind}`)).toBe(colours.fill);
      expect(token(css, `key-${kind}-edge`)).toBe(colours.edge);
    }
  });

  it('keeps the city lighter than either kind of project, as seen on screen', () => {
    const existing = lab(KEY.existing.fill).l;
    expect(existing - lab(KEY.approved.fill).l).toBeGreaterThanOrEqual(10);
    expect(existing - lab(KEY.progress.fill).l).toBeGreaterThanOrEqual(10);
  });

  it('puts the two kinds of project at opposite ends of blue–yellow', () => {
    // b* survives red–green colour blindness; the teal is bluish, the orange yellowish.
    expect(lab(KEY.progress.fill).b - lab(KEY.approved.fill).b).toBeGreaterThanOrEqual(25);
  });

  it('colours a project by its stage', () => {
    expect(toneOf('UNDER CONSTRUCTION')).toBe(IN_PROGRESS);
    expect(toneOf('APPROVED')).toBe(APPROVED);
    expect(toneOf('APPLIED')).toBe(APPROVED);
  });
});

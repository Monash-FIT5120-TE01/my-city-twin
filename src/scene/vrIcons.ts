/*
 * ─────────────────────────────────────────────────────────────────────────
 * ICONS FOR THE HEADSET PANELS, WITHOUT AN SVG COMPONENT
 * ─────────────────────────────────────────────────────────────────────────
 *
 * The UI library's Svg component took the whole scene down on the headset
 * once (see vrPanel-rules.test.ts), so it is not used. An icon here is a
 * few strokes — path data in the same 24-unit box icon sets use — stroked
 * onto a small canvas by the browser's own 2D drawing, and handed to the
 * panel as a texture, the way the tutorial's pictures are.
 *
 * One texture per icon and colour, made the first time it is asked for and
 * kept: there are a dozen of them, a few kilobytes each.
 */

import { CanvasTexture, SRGBColorSpace, type Texture } from 'three';

const PATHS = {
  places: ['M4 21V10a1 1 0 0 1 1-1h5a1 1 0 0 1 1 1v11', 'M13 21V5a1 1 0 0 1 1-1h5a1 1 0 0 1 1 1v16', 'M3 21h18', 'M7 13h1M7 17h1M16 8h1M16 12h1M16 16h1'],
  sun: ['M12 8a4 4 0 1 0 0 8a4 4 0 1 0 0-8', 'M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4'],
  measure: ['M12 4a8 8 0 1 0 0 16a8 8 0 1 0 0-16', 'M12 9a3 3 0 1 0 0 6a3 3 0 1 0 0-6', 'M12 1v3M12 20v3M1 12h3M20 12h3'],
  help: ['M12 2.5a9.5 9.5 0 1 0 0 19a9.5 9.5 0 1 0 0-19', 'M9.5 9.5a2.5 2.5 0 1 1 3.5 2.3c-.7.3-1 .9-1 1.6v.6', 'M12 17.2v.1'],
  map: ['M9 4 3 6v14l6-2 6 2 6-2V4l-6 2z', 'M9 4v14M15 6v14'],
  beam: ['M4 20 14 10', 'M17.5 3.5a3 3 0 1 0 0 6a3 3 0 1 0 0-6'],
  down: ['M12 4v15', 'M6 13l6 6 6-6'],
  up: ['M12 20V5', 'M6 11l6-6 6 6'],
  exit: ['M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4', 'M10 16l-4-4 4-4', 'M6 12h10'],
  close: ['M6 6l12 12M18 6 6 18'],
  plus: ['M12 5v14M5 12h14'],
  minus: ['M5 12h14'],
  chevron: ['M9 5l7 7-7 7'],
  arrow: ['M5 12h14', 'M13 6l6 6-6 6'],
  reset: ['M4.5 12a7.5 7.5 0 1 0 2.2-5.3', 'M4 4v5h5'],
  ruler: ['M3 17 17 3l4 4L7 21z', 'M7 13l2 2M10 10l2 2M13 7l2 2'],
  // Three dots: zero-length strokes with round caps.
  more: ['M5 12h0.01', 'M12 12h0.01', 'M19 12h0.01'],
} as const;

export type IconName = keyof typeof PATHS;

/** Pixels across: crisp at 30 mm on the panel, small on the GPU. */
const SIZE = 96;

const cache = new Map<string, Texture>();

/**
 * A texture over a fresh canvas, for pictures drawn at runtime (the maps, the
 * sun's arc). `ownMatrix` when it goes on a uikit Image, which sets the
 * texture's matrix itself to fit the picture to its box.
 */
export function canvasTexture(width: number, height: number, ownMatrix: boolean): CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  if (ownMatrix) texture.matrixAutoUpdate = false;
  return texture;
}

/** Draws into a canvas texture and marks it to be uploaded. */
export function paintTexture(texture: CanvasTexture, draw: (ctx: CanvasRenderingContext2D) => void) {
  const ctx = (texture.image as HTMLCanvasElement).getContext('2d');
  if (!ctx) return;
  draw(ctx);
  texture.needsUpdate = true;
}

export function iconTexture(name: IconName, color: string): Texture {
  const key = `${name}:${color}`;
  const made = cache.get(key);
  if (made) return made;

  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = SIZE;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.scale(SIZE / 24, SIZE / 24);
    ctx.strokeStyle = color;
    // The dots of 'more' are strokes with no length; thicker, so they read as dots.
    ctx.lineWidth = name === 'more' ? 4 : 2.2;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    for (const d of PATHS[name]) ctx.stroke(new Path2D(d));
  }
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  // uikit owns the matrix (it fits the picture to its box), as with any image.
  texture.matrixAutoUpdate = false;
  cache.set(key, texture);
  return texture;
}

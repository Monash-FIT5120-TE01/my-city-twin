/*
 * The ground, seen from it.
 *
 * WHY THE MAP HAS TO GO WHILE WALKING
 *   The basemap is a cartographic raster: a drawing meant to be read from
 *   directly above. At eye height you look ACROSS it at a grazing angle, and
 *   it stops being a road and becomes a printed map lying on the floor. It is
 *   also about 2.5 m per texel, so from a footpath it is a blur.
 *
 *   Nothing about the map is wrong; it is being asked to do a job it was not
 *   drawn for. From above it is the best thing there — which is why this
 *   replaces it only while walking, and the two conditions are kept apart:
 *   whether a basemap EXISTS still decides whether the inferred roads are
 *   drawn, and swapping the surface must not quietly bring them back.
 *
 * WHAT REPLACES IT, AND WHAT THAT CLAIMS
 *   A neutral, faintly grained surface at metre scale. It says "this is
 *   ground" and nothing else — not asphalt, not footpath, not carriageway.
 *   The model does not know which is which: the road widths in the data are
 *   assumed, not surveyed. Painting a carriageway would be inventing one.
 *
 *   It stays light. A convincing dark asphalt would swallow the shadows, and
 *   the shadows are the product.
 */

import { CanvasTexture, RepeatWrapping, SRGBColorSpace, type Texture } from 'three';

/** Metres across one tile. Small enough to read as texture, large enough to hide. */
export const SURFACE_TILE_M = 4;

const SIZE = 256;

let cached: Texture | null = null;

/**
 * A seamless grain, built once and shared.
 *
 * Multiplied into the ground's own colour, so the values sit near white — it
 * is a variation in the surface, not a pattern on it. Two scales, because a
 * single frequency of noise reads as television static rather than as
 * something a street is made of.
 */
export function groundSurfaceTexture(): Texture {
  if (cached) return cached;

  const canvas = document.createElement('canvas');
  canvas.width = SIZE;
  canvas.height = SIZE;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('no 2d context for the ground surface');

  const image = context.createImageData(SIZE, SIZE);

  /* A coarse field, sampled with wrap so the tile meets itself. */
  const COARSE = 16;
  const coarse = new Float32Array(COARSE * COARSE);
  for (let i = 0; i < coarse.length; i++) coarse[i] = Math.random();

  const at = (x: number, y: number) =>
    coarse[((y % COARSE) + COARSE) % COARSE * COARSE + (((x % COARSE) + COARSE) % COARSE)];

  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      // Bilinear over the coarse field: patches, the size of a paving slab.
      const fx = (x / SIZE) * COARSE;
      const fy = (y / SIZE) * COARSE;
      const x0 = Math.floor(fx);
      const y0 = Math.floor(fy);
      const tx = fx - x0;
      const ty = fy - y0;
      const patch =
        at(x0, y0) * (1 - tx) * (1 - ty) +
        at(x0 + 1, y0) * tx * (1 - ty) +
        at(x0, y0 + 1) * (1 - tx) * ty +
        at(x0 + 1, y0 + 1) * tx * ty;

      // And a fine speckle over it, the size of aggregate.
      const grain = Math.random();

      const value = 226 + patch * 20 + grain * 9;
      const i = (y * SIZE + x) * 4;
      image.data[i] = value;
      image.data[i + 1] = value;
      image.data[i + 2] = value;
      image.data[i + 3] = 255;
    }
  }

  context.putImageData(image, 0, 0);

  const texture = new CanvasTexture(canvas);
  texture.wrapS = RepeatWrapping;
  texture.wrapT = RepeatWrapping;
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 8;
  cached = texture;
  return texture;
}

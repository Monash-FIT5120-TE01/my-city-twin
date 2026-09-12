/*
 * The stars.
 *
 * WHY NOT drei's <Stars>
 *   Two things it cannot do, both of which showed.
 *
 *   It scatters over a FULL sphere, so half its stars sit below the horizon —
 *   in the hemisphere this scene paints as distant ground. Raise the camera
 *   at night, look out past the edge of the model, and stars are shining up
 *   out of the earth.
 *
 *   And it has no brightness of its own to turn down. Mounting it when the
 *   twilight fade crossed a threshold put every star on screen at once, at
 *   full strength, between one ten-minute step and the next — measured at
 *   21 June, 17:30 to 17:40. Unmounting also re-rolled every position, so
 *   they jumped as well as appeared.
 *
 * TWO LAYERS RATHER THAN A SHADER
 *   A PointsMaterial draws every point the same size, and a sky where every
 *   star is identical does not read as a sky. Per-star sizes would need a
 *   custom shader; two layers — a few large, many small — buy most of the
 *   same variety for none of the complexity.
 *
 * WHAT THIS IS NOT, YET
 *   Random points, not real stars. Putting the actual sky up there — a
 *   bright-star catalogue converted for Melbourne at the simulated instant,
 *   with the Southern Cross where it belongs — is separate work. The
 *   machinery already exists: solar.ts uses astronomy-engine's Horizon() for
 *   the sun, and it takes any right ascension and declination.
 */

import { useEffect, useMemo } from 'react';
import { AdditiveBlending, BufferAttribute, BufferGeometry } from 'three';

/** Inside the dome, and the dome rides with the camera, so this always holds. */
const RADIUS = 7000;

/**
 * A fixed sequence, so it is the same sky every time it is drawn.
 *
 * Math.random() would re-roll whenever the field was rebuilt, and stars that
 * shuffle when the clock moves read as static rather than as a sky.
 */
function seeded(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state * 1664525 + 1013904223) % 4294967296;
    return state / 4294967296;
  };
}

function hemisphere(count: number, seed: number): BufferGeometry {
  const random = seeded(seed);
  const positions = new Float32Array(count * 3);

  for (let i = 0; i < count; i++) {
    /*
     * Upper hemisphere only. Below the horizon is the ground, and a star
     * under the ground is not dimmer or hidden — it is simply wrong.
     *
     * The height is taken first and the ring radius derived from it, which
     * spreads the points evenly over the dome. Choosing an angle instead
     * crowds them at the zenith.
     */
    const y = random();
    const ring = Math.sqrt(1 - y * y);
    const theta = random() * Math.PI * 2;

    positions[i * 3] = Math.cos(theta) * ring * RADIUS;
    positions[i * 3 + 1] = y * RADIUS;
    positions[i * 3 + 2] = Math.sin(theta) * ring * RADIUS;
  }

  const geometry = new BufferGeometry();
  geometry.setAttribute('position', new BufferAttribute(positions, 3));
  return geometry;
}

function Layer({ count, seed, size, opacity }: {
  count: number;
  seed: number;
  size: number;
  opacity: number;
}) {
  const geometry = useMemo(() => hemisphere(count, seed), [count, seed]);
  useEffect(() => () => geometry.dispose(), [geometry]);

  return (
    <points geometry={geometry} frustumCulled={false}>
      <pointsMaterial
        size={size}
        sizeAttenuation
        color="#ffffff"
        transparent
        opacity={opacity}
        depthWrite={false}
        /*
         * Added rather than laid over. A star contributes light to the sky
         * behind it; drawn opaque, the faint ones punch grey holes in a dark
         * blue dusk instead of sitting in it.
         */
        blending={AdditiveBlending}
        toneMapped={false}
      />
    </points>
  );
}

export function Starfield({ opacity }: { opacity: number }) {
  // The fade is the twilight, so the sky fills in over the half hour it
  // actually takes to darken rather than arriving in one step.
  if (opacity <= 0.001) return null;

  return (
    <>
      <Layer count={2200} seed={20260913} size={11} opacity={opacity * 0.75} />
      <Layer count={220} seed={776311} size={26} opacity={opacity} />
    </>
  );
}

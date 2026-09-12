/*
 * Distance haze over the ground.
 *
 * WHY THE GROUND CANNOT FADE ITSELF
 *   It used to. Its vertex colours ran from white in the middle to the haze
 *   colour at the rim, and with a plain ground that worked. With a map on it
 *   it stopped working, for two reasons that are both about the material.
 *
 *   A vertex colour MULTIPLIES the texture. At the rim the intended colour
 *   was haze, but what was drawn was haze times whatever the map had there —
 *   so the fade never arrived at the haze colour at all, only at a darker
 *   version of the map.
 *
 *   And the ground is lit and tone-mapped, while the sky it fades into is
 *   neither. Two different colour paths from the same authored value do not
 *   land in the same place, so the horizon showed a seam wherever they met.
 *
 * WHAT THIS DOES INSTEAD
 *   Lays an unlit, un-tone-mapped ring over the ground, transparent in the
 *   middle and opaque by its rim, in exactly the colour the dome paints below
 *   its horizon. The ground underneath is untouched — still lit, still
 *   receiving shadows — and the far distance becomes the same colour as the
 *   sky's ground by the same arithmetic. There is nothing left to disagree.
 *
 *   Drawn without writing depth, so it cannot occlude the city standing in
 *   it, and offset a metre up so it is not fighting the surface below.
 */

import { useEffect, useMemo } from 'react';
import { BufferAttribute, Color, DoubleSide, RingGeometry } from 'three';

export function HazeVeil({
  centreE,
  centreN,
  groundAhdM,
  /** Where the haze begins — inside this the ground is drawn as it is. */
  innerM,
  /** Where it is complete. Should reach at least the ground's own rim. */
  outerM,
  colour,
}: {
  centreE: number;
  centreN: number;
  groundAhdM: number;
  innerM: number;
  outerM: number;
  colour: string;
}) {
  const geometry = useMemo(() => {
    const ring = new RingGeometry(0, outerM, 96, 48);
    const position = ring.getAttribute('position');

    const tint = new Color(colour);
    const colours = new Float32Array(position.count * 4);

    for (let i = 0; i < position.count; i++) {
      const distance = Math.hypot(position.getX(i), position.getY(i));
      const t = Math.min(1, Math.max(0, (distance - innerM) / (outerM - innerM)));
      // Smoothstep, so the haze has no visible band where it begins.
      const eased = t * t * (3 - 2 * t);

      colours[i * 4] = tint.r;
      colours[i * 4 + 1] = tint.g;
      colours[i * 4 + 2] = tint.b;
      colours[i * 4 + 3] = eased;
    }

    ring.setAttribute('color', new BufferAttribute(colours, 4));
    return ring;
  }, [innerM, outerM, colour]);

  useEffect(() => () => geometry.dispose(), [geometry]);

  return (
    <mesh geometry={geometry} position={[centreE, centreN, groundAhdM + 1]} renderOrder={1}>
      <meshBasicMaterial
        vertexColors
        transparent
        depthWrite={false}
        toneMapped={false}
        side={DoubleSide}
      />
    </mesh>
  );
}

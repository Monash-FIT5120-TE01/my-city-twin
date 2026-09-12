/*
 * The sky behind the city — a dome we colour ourselves.
 *
 * WHY NOT THE ATMOSPHERIC MODEL
 *   three ships a Preetham sky, and it was used here first. It is a DAYLIGHT
 *   model: its fragment shader carries a hard floor, `vec3 L0 = vec3( 0.1 ) *
 *   Fex;`, which does not fall however far below the horizon the sun goes.
 *   Midnight rendered the colour of an overcast afternoon, the stars were
 *   invisible against it, and the fix was to cover it with an opaque dome —
 *   at which point the atmospheric model was being paid for and then hidden.
 *
 *   Colouring the dome directly loses the scattering physics and gains three
 *   things worth more here: a night that is genuinely dark, one code path
 *   from noon to midnight, and a sky drawn from the same arithmetic as the
 *   ground it meets. That last one is what stops a seam appearing at the
 *   horizon, which the two-colour-paths version could not avoid.
 *
 * WHERE IT SITS IN THE FRAME
 *   Outside <WorldFrame>, with the camera — so by the rule in frame.ts the
 *   sun direction is converted once, here, at the boundary.
 *
 * HOW IT IS COLOURED
 *   Per vertex, not per pixel. A sphere of 64 by 32 is 2,145 vertices and the
 *   card interpolates between them; a gradient this smooth needs nothing
 *   finer, and it avoids shipping a shader to do it.
 */

import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { BackSide, BufferAttribute, Color, Group, SphereGeometry, Vector3 } from 'three';
import { Starfield } from './Starfield';
import { enuToWorld } from './frame';
import { sunDirectionENU } from './sun';
import { skyAppearance, type SunAnglesDeg } from './sky';

/**
 * The dome's radius.
 *
 * It does not have to contain the whole world, because it FOLLOWS THE CAMERA
 * — see the frame loop below. Fixed at the origin it did have to, and it did
 * not: orbit distance is capped, but panning moves the target as well, so the
 * camera could be walked out past 8 km and left the dome behind it entirely.
 * The sky then simply stopped, showing the clear colour instead.
 *
 * Riding with the camera also keeps it comfortably inside the 20 km far
 * plane, which must not be raised to make room: depth precision falls with
 * it, and that is what made the road surface flicker against the ground.
 */
const RADIUS = 7800;

export function SkyDome({ angles }: { angles: SunAnglesDeg }) {
  /*
   * Memoised on the number, not recomputed inline. `skyAppearance` returns a
   * fresh object every call, so an inline one is a new identity on every
   * render — and the geometry below, which depends on it, was rebuilding all
   * 2,145 vertices of the dome every frame.
   */
  const appearance = useMemo(() => skyAppearance(angles.altitudeDeg), [angles.altitudeDeg]);

  const geometry = useMemo(() => {
    const dome = new SphereGeometry(RADIUS, 64, 32);
    const position = dome.getAttribute('position');

    const direction = sunDirectionENU(angles);
    const [sx, sy, sz] = enuToWorld([direction.east, direction.north, direction.up]);
    const sun = new Vector3(sx, sy, sz).normalize();

    const zenith = new Color(appearance.zenith);
    const horizon = new Color(appearance.horizon);
    const haze = new Color(appearance.haze);
    const glow = new Color(appearance.sunGlow);

    const point = new Vector3();
    const scratch = new Color();
    const colours = new Float32Array(position.count * 3);

    for (let i = 0; i < position.count; i++) {
      point.set(position.getX(i), position.getY(i), position.getZ(i)).normalize();

      /*
       * A tolerance, not a bare sign test. The equator ring of a sphere comes
       * out a rounding step ABOVE zero, so `<= 0` left it painted as sky —
       * and every triangle from there down to the next ring, 765 m of dome,
       * interpolated between sky and ground. A ray out to the horizon met
       * that band rather than the haze it was supposed to meet.
       */
      if (point.y <= 1e-6) {
        /*
         * Below the horizon the dome is distant ground, not sky. Painting it
         * the haze colour is what removed the separate filler disc that used
         * to be out there — and, before that, the black void the eye fell
         * into past the edge of the model.
         */
        scratch.copy(haze);
      } else {
        // Squared, so the change is quick near the horizon and slow overhead,
        // which is the way a real sky is banded.
        const t = Math.min(1, point.y / 0.55) ** 2;
        scratch.copy(horizon).lerp(zenith, t);
      }

      /*
       * The warm cast around the sun. Without it the dome is identical in
       * every compass direction, and a sunset with no glow on the western
       * side reads as a colour wash rather than as an evening.
       *
       * Above the horizon only. Applied to the lower hemisphere as well it
       * tinted the "distant ground" toward orange whenever the sun was low,
       * so the one colour that has to match the ground stopped matching it
       * exactly when it mattered.
       */
      if (point.y > 1e-6) {
        const towardsSun = Math.max(0, point.dot(sun));
        const strength = towardsSun ** 6 * appearance.glow;
        if (strength > 0.001) scratch.lerp(glow, strength);
      }

      colours[i * 3] = scratch.r;
      colours[i * 3 + 1] = scratch.g;
      colours[i * 3 + 2] = scratch.b;
    }

    dome.setAttribute('color', new BufferAttribute(colours, 3));
    return dome;
  }, [angles, appearance]);

  // Rebuilt every time the sun moves, and nothing else would free the old one.
  useEffect(() => () => geometry.dispose(), [geometry]);

  /*
   * The whole sky rides with the camera. Panning is unbounded — it moves the
   * orbit target, so the distance cap does not hold the camera anywhere near
   * the origin — and a sky anchored to the origin can be left behind.
   */
  const rig = useRef<Group>(null);
  useFrame(({ camera }) => {
    rig.current?.position.copy(camera.position);
  });

  return (
    <group ref={rig}>
      <mesh geometry={geometry} renderOrder={-1}>
        {/*
          Unlit and not tone-mapped: these colours are the finished article,
          not a surface for the renderer to interpret. Tone-mapped they came
          out somewhere else, and the ground — which IS lit and tone-mapped —
          stopped meeting them at the horizon.
        */}
        <meshBasicMaterial vertexColors side={BackSide} toneMapped={false} depthWrite={false} />
      </mesh>

      <Starfield opacity={appearance.stars} />
    </group>
  );
}

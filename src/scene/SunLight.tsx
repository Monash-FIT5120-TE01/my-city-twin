import { useEffect, useRef } from 'react';
import type { DirectionalLight, Object3D } from 'three';
import { sunDirectionENU, type SunAngles } from './sun';

interface SunLightProps {
  angles: SunAngles;
  /** Half-width of the area that receives shadows, in metres. */
  extentM?: number;
  /** Where the shadow camera is centred, in east/north/up metres. */
  centre?: [number, number, number];
  /** The "Sunlight & shadows" layer. Off leaves the scene lit but flat. */
  castShadows?: boolean;
}

/**
 * The directional light that casts the modelled shadow.
 *
 * Rendered inside <WorldFrame>, so its position is read in east/north/up.
 * Its target is an explicit object at `centre` rather than the default world
 * origin — the shadow camera follows the target, and the development being
 * examined is rarely at the origin.
 */
export function SunLight({
  angles,
  extentM = 600,
  centre = [0, 0, 0],
  castShadows = true,
}: SunLightProps) {
  const light = useRef<DirectionalLight>(null);
  const target = useRef<Object3D>(null);

  useEffect(() => {
    if (!light.current || !target.current) return;
    light.current.target = target.current;
    light.current.target.updateMatrixWorld();
  }, [centre]);

  // Far enough that the near plane clears the tallest thing in the scene,
  // whatever direction the light comes from.
  const distance = extentM * 2.5;
  const direction = sunDirectionENU(angles);
  const isUp = angles.altitudeDeg > 0;

  return (
    <>
      <object3D ref={target} position={centre} />
      <directionalLight
        ref={light}
        position={[
          centre[0] + direction.east * distance,
          centre[1] + direction.north * distance,
          centre[2] + direction.up * distance,
        ]}
        // Below the horizon there is no direct sun. Dropping the intensity
        // rather than unmounting the light keeps the shadow camera warm, so
        // the time slider does not stutter at dawn and dusk.
        intensity={isUp ? 2.7 : 0}
        color="#fff4e0"
        castShadow={isUp && castShadows}
        shadow-mapSize={[4096, 4096]}
        // The frustum must span the scene on both sides of the target: the
        // light sits `distance` away, and casters reach `extentM` beyond it.
        shadow-camera-near={Math.max(1, distance - extentM * 1.2)}
        shadow-camera-far={distance + extentM * 1.2}
        shadow-camera-left={-extentM}
        shadow-camera-right={extentM}
        shadow-camera-top={extentM}
        shadow-camera-bottom={-extentM}
        // Flat roofs under a low, grazing sun are the classic acne case.
        shadow-bias={-0.0006}
        shadow-normalBias={0.9}
      />
    </>
  );
}

import { useEffect, useRef } from 'react';
import type { DirectionalLight, Object3D } from 'three';
import { sunDirectionENU, type SunAngles } from './sun';

interface SunLightProps {
  angles: SunAngles;
  /** Half-width of the area that receives shadows, in metres. */
  extentM?: number;
  /**
   * Across and up the shadow map, half-width in metres, when it is not `extentM`: narrower is sharper.
   * Inside the flat it is a few tens of metres round the flat (room/).
   */
  spanM?: number;
  /** Along the light, half-depth in metres, when it is not `extentM`: everything that can cast must be within it. */
  depthM?: number;
  /** Shadow acne against peter-panning; the defaults suit the whole city at about half a metre a pixel. */
  bias?: number;
  normalBias?: number;
  /** Where the shadow camera is centred, in east/north/up metres. */
  centre?: [number, number, number];
  /** The "Sunlight & shadows" layer. Off leaves the scene lit but flat. */
  castShadows?: boolean;
  /** The shadow map's side, pixels: 4096, or 2048 for the low graphics setting (settings/display.ts). */
  mapSize?: number;
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
  spanM = extentM,
  depthM = extentM,
  centre = [0, 0, 0],
  castShadows = true,
  bias = -0.0006,
  normalBias = 0.9,
  mapSize = 4096,
}: SunLightProps) {
  const light = useRef<DirectionalLight>(null);
  const target = useRef<Object3D>(null);

  // a new size takes a new map: three keeps the one it made at the old size until it is let go
  useEffect(() => {
    const shadow = light.current?.shadow;
    if (!shadow) return;
    shadow.map?.dispose();
    shadow.map = null;
  }, [mapSize]);

  useEffect(() => {
    if (!light.current || !target.current) return;
    light.current.target = target.current;
    light.current.target.updateMatrixWorld();
  }, [centre]);

  // Far enough that the near plane clears the tallest thing in the scene,
  // whatever direction the light comes from.
  const distance = depthM * 2.5;
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
        shadow-mapSize={[mapSize, mapSize]}
        // The frustum must span the scene on both sides of the target: the
        // light sits `distance` away, and casters reach `depthM` beyond it.
        shadow-camera-near={Math.max(1, distance - depthM * 1.2)}
        shadow-camera-far={distance + depthM * 1.2}
        shadow-camera-left={-spanM}
        shadow-camera-right={spanM}
        shadow-camera-top={spanM}
        shadow-camera-bottom={-spanM}
        // Flat roofs under a low, grazing sun are the classic acne case.
        shadow-bias={bias}
        shadow-normalBias={normalBias}
      />
    </>
  );
}

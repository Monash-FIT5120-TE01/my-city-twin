/*
 * ─────────────────────────────────────────────────────────────────────────
 * THE GROUND, AND WHERE IT STOPS
 * ─────────────────────────────────────────────────────────────────────────
 *
 * WHAT THIS FILE IS
 *   The flat surface the city stands on, and the surface a click lands on
 *   when someone measures a spot.
 *
 * WHY IT FADES AT THE EDGES
 *   The building data covers the Hoddle Grid and stops. Beyond it there is
 *   genuinely nothing — no suburbs, no river, no data of any kind. Drawn as
 *   a plain square, that boundary reads as the edge of the world. Faded, it
 *   reads as the edge of what is known, which is what it is.
 *
 * HOW THE FADE IS MADE
 *   The plane is divided into a grid of small squares, and each corner is
 *   given a colour: solid near the middle, blending to the background colour
 *   further out. The graphics card blends smoothly between them.
 *
 *   The alternative — making the ground transparent — was tried and is
 *   worse. A transparent ground still catches shadows, so the city ends up
 *   casting shadows onto empty space.
 *
 * WHY THE GROUND IS FLAT
 *   The real CBD slopes about 20 m from Latrobe Street down to the river,
 *   and that surface exists in the source data. It is not used yet, so
 *   buildings carry their true heights above sea level while the ground
 *   beneath them is a single level. Terrain is Iteration 2 work.
 *
 * THE MAP ON TOP OF IT
 *   When a Mapbox image is available it is laid on this same plane, and the
 *   fade above becomes the fade of the map. Two things make that work:
 *
 *   The texture coordinates are computed per vertex by converting each one
 *   back through the projection, because the scene's north and the image's
 *   north are 1.25° apart — see basemap.ts, which is where that is explained
 *   and measured.
 *
 *   The vertex colours stop tinting and start masking. They are multiplied
 *   into whatever the material draws, so the solid inner colour has to become
 *   white when there is a map, or the whole city would be washed with beige.
 */

import { useEffect, useMemo } from 'react';
import { BufferAttribute, Color, PlaneGeometry, type Texture } from 'three';
import type { CityModel } from '../data/model';
import { groundPlacement, textureCoordinate } from './basemap';

/** Background the ground dissolves into — the same colour the canvas clears to. */
const HORIZON = '#ededea';

export function Ground({
  model,
  groundAhdM,
  basemap,
  onPick,
}: {
  model: CityModel;
  groundAhdM: number;
  /**
   * The map image, once it has arrived. Loaded by whoever owns this rather
   * than here, because the same answer decides whether the inferred road
   * surface is drawn — and the two must not disagree about it.
   */
  basemap: Texture | null;
  /** Called with an east/north point when the ground is clicked. */
  onPick?: (point: [number, number]) => void;
}) {
  // The four numbers rather than the object holding them — see CityMassing,
  // where the same identity change was tearing the map down on every refresh.
  const { minE, minN, maxE, maxN } = model.extent;
  const { centreE, centreN, span, size, placement } = useMemo(
    () => groundPlacement({ minE, minN, maxE, maxN }),
    [minE, minN, maxE, maxN],
  );

  const geometry = useMemo(() => {
    const plane = new PlaneGeometry(size, size, 64, 64);

    // White under a map, so the fade masks it instead of tinting it; the
    // beige is the ground's own colour and is only wanted when it is the only
    // thing there.
    const solid = new Color(basemap ? '#ffffff' : '#e6e3da');
    const horizon = new Color(HORIZON);
    const scratch = new Color();

    // Opaque out to the edge of the data, then gone by the edge of the plane.
    const inner = span * 0.62;
    const outer = size * 0.5;

    const position = plane.getAttribute('position');
    const uv = plane.getAttribute('uv');
    const colours = new Float32Array(position.count * 3);

    for (let i = 0; i < position.count; i++) {
      const distance = Math.hypot(position.getX(i), position.getY(i));
      const t = Math.min(1, Math.max(0, (distance - inner) / (outer - inner)));
      // Smoothstep, so the fade has no visible band where it begins.
      const eased = t * t * (3 - 2 * t);
      scratch.copy(solid).lerp(horizon, eased);
      colours[i * 3] = scratch.r;
      colours[i * 3 + 1] = scratch.g;
      colours[i * 3 + 2] = scratch.b;

      /*
       * The plane's own coordinates are offsets from its centre, so the scene
       * position is that plus where the centre is. Converting every vertex
       * rather than the plane as a whole is what keeps the map square with
       * the buildings — 65 by 65 of them, once.
       */
      const [u, v] = textureCoordinate(
        centreE + position.getX(i),
        centreN + position.getY(i),
        placement,
      );
      uv.setXY(i, u, v);
    }

    uv.needsUpdate = true;
    plane.setAttribute('color', new BufferAttribute(colours, 3));
    return plane;
  }, [centreE, centreN, span, size, placement, basemap]);

  /*
   * The plane is rebuilt when the map arrives, and react-three-fiber replaces
   * the `geometry` property without disposing what was there. These buffers
   * live on the GPU and nothing else is holding them, so each rebuild leaked
   * one plane's worth until the tab closed.
   */
  useEffect(() => () => geometry.dispose(), [geometry]);

  return (
    <mesh
      receiveShadow
      geometry={geometry}
      position={[centreE, centreN, groundAhdM]}
      onClick={
        onPick &&
        ((event) => {
          event.stopPropagation();
          // The hit is in three's world frame; enuToWorld sent
          // (east, north, up) to (east, up, -north), so this reads it back.
          onPick([event.point.x, -event.point.z]);
        })
      }
    >
      {/*
        The key is load-bearing, not decoration.

        Whether a material samples a texture is decided when its shader is
        COMPILED, by the USE_MAP define. Assigning `map` afterwards changes
        the property and nothing else: three.js only rebuilds the program when
        `material.needsUpdate` is set, and react-three-fiber never sets it —
        it sets shadowMap.needsUpdate and no other.

        So the texture arrived, was assigned, and was never once sampled. The
        only symptom was a ground that stayed plain, which reads as the image
        having failed to download.

        Changing the key makes React discard the material and build a new one,
        which compiles with the map present.
      */}
      <meshStandardMaterial
        key={basemap ? 'with-basemap' : 'plain'}
        map={basemap}
        vertexColors
        roughness={1}
        metalness={0}
      />
    </mesh>
  );
}

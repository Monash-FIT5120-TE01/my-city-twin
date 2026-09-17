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
 * WHY IT IS A DISC
 *   The fade has always been radial — distance from the centre — but the
 *   geometry under it was a square, and its corners reached 1.7 times as far
 *   as its edges. That was invisible while the ground faded into a flat
 *   background of the same colour. With a sky behind it, the ground meets
 *   something that is NOT that colour, and a square silhouette appears: a
 *   straight horizon with corners on it, which no place has.
 *
 *   A disc whose rim is exactly where the fade finishes has no edge to see.
 *
 * HOW THE FADE IS MADE
 *   The disc is divided into rings and wedges, and each vertex is given a
 *   colour: solid near the middle, blending to the horizon further out. The
 *   graphics card blends smoothly between them.
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

import { useEffect, useMemo, useRef } from 'react';
import { BufferAttribute, Color, RingGeometry, type Group, type Texture } from 'three';
import type { CityModel } from '../data/model';
import { groundPlacement, textureCoordinate } from './basemap';
import { groundSurfaceTexture, SURFACE_TILE_M } from './groundSurface';
import { MeasureCursor } from './MeasureCursor';
import { beginTap, trackTap, wasDragged, type Gesture } from './tap';

export function Ground({
  model,
  groundAhdM,
  basemap,
  walking,
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
  /**
   * Standing on it rather than looking down at it.
   *
   * Kept apart from whether a basemap exists, deliberately: that question
   * still decides whether the inferred roads are drawn, and swapping the
   * surface must not quietly bring them back.
   */
  walking: boolean;
  /** Called with an east/north point when the ground is clicked. */
  onPick?: (point: [number, number]) => void;
}) {
  // The four numbers rather than the object holding them — see CityMassing,
  // where the same identity change was tearing the map down on every refresh.
  const { minE, minN, maxE, maxN } = model.extent;
  const { centreE, centreN, size, placement } = useMemo(
    () => groundPlacement({ minE, minN, maxE, maxN }),
    [minE, minN, maxE, maxN],
  );

  const geometry = useMemo(() => {
    /*
     * RingGeometry from zero rather than CircleGeometry: a circle is a fan
     * of triangles meeting at one point, so it has vertices on its rim and
     * nowhere else. Both things this surface does need interior vertices —
     * the fade is written into vertex colours, and the map's texture
     * coordinates are reprojected per vertex.
     *
     * 97 x 49 of them, against the 65 x 65 the square had. The rim is
     * generous because it is the only silhouette in the scene against the
     * sky, and a coarse one reads as a polygon.
     */
    const plane = new RingGeometry(0, size / 2, 96, 48);

    /*
     * White under the map so the texture shows as itself. Under the walking
     * surface a neutral tone, which the grain then varies — light enough
     * that a shadow still reads on it, because the shadow is the product.
     */
    const solid = new Color(walking ? '#cfccc4' : basemap ? '#ffffff' : '#e6e3da');

    const position = plane.getAttribute('position');
    const uv = plane.getAttribute('uv');
    const colours = new Float32Array(position.count * 3);

    for (let i = 0; i < position.count; i++) {
      colours[i * 3] = solid.r;
      colours[i * 3 + 1] = solid.g;
      colours[i * 3 + 2] = solid.b;

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
  }, [centreE, centreN, size, placement, basemap, walking]);

  /*
   * The plane is rebuilt when the map arrives, and react-three-fiber replaces
   * the `geometry` property without disposing what was there. These buffers
   * live on the GPU and nothing else is holding them, so each rebuild leaked
   * one plane's worth until the tab closed.
   */
  useEffect(() => () => geometry.dispose(), [geometry]);

  /*
   * The grain is tiled by metres, not by the map's coordinates. The vertex
   * UVs run 0..1 across the whole plane, so the repeat is how many tiles fit
   * across it — the reprojection is near enough linear at this scale for the
   * tiles to come out square.
   */
  const surface = useMemo(() => {
    if (!walking) return null;
    const texture = groundSurfaceTexture();
    texture.repeat.set(size / SURFACE_TILE_M, size / SURFACE_TILE_M);
    texture.needsUpdate = true;
    return texture;
  }, [walking, size]);

  /*
   * ── SHOWING THAT THE GROUND CAN BE CLICKED ──────────────────────────────
   *
   * Measuring a point is what this product is for, and the ground was the one
   * interactive surface in the scene that looked like scenery: buildings
   * change the cursor, this changed nothing. The panel explained the action in
   * a sentence, which is not the same as offering it — people look for
   * something pressable before they read anything.
   *
   * So while a pick is possible the cursor becomes a crosshair and a ring
   * follows the pointer across the ground. See MeasureCursor for why the ring
   * is worth having as well as the cursor.
   *
   * The position is written straight onto the object rather than into state.
   * Pointer moves arrive dozens of times a second, and re-rendering the scene
   * graph on each one to move a ring would cost more than everything else in
   * the frame put together.
   */
  const cursor = useRef<Group>(null);
  /*
   * Where the button went down, so the release can be told apart from the
   * end of a pan. The left button does both jobs here — see tap.ts.
   */
  const pressedAt = useRef<Gesture | null>(null);

  /*
   * Shown and hidden by hand, not by state.
   *
   * Held in useState this fell over the first time a point was placed: the
   * marker took the raycast, the ground reported a leave, and with the
   * reader now looking at their result rather than moving the mouse, nothing
   * arrived to turn it back on.
   *
   * Written straight onto the object there is nothing to fall out of step,
   * and no re-render in between to undo it.
   */
  const canPick = Boolean(onPick);

  const show = (on: boolean) => {
    if (cursor.current) cursor.current.visible = on;
    document.body.style.cursor = on ? 'crosshair' : '';
  };

  /*
   * Off to begin with, and off again whenever picking stops or this unmounts
   * — otherwise a crosshair is left on the document for the whole app to
   * inherit, and a ring is left lying in the street.
   */
  useEffect(() => {
    /*
     * Captured, not read through the ref in the cleanup: by the time that
     * runs the ref may point at a different object, and the one left visible
     * would be the one nobody turned off. StreetView captures its key set
     * for the same reason.
     */
    const ring = cursor.current;
    if (ring) ring.visible = false;
    document.body.style.cursor = '';
    return () => {
      if (ring) ring.visible = false;
      document.body.style.cursor = '';
    };
    /*
     * Keyed on WHETHER picking is possible, not on the function that does it.
     *
     * App builds `onPickReceptor` inline, so its identity changes on every
     * render of the whole app — a download finishing, a detail arriving, the
     * hour moving. Depending on the function meant this cleanup ran on each
     * of those and put the ring out while picking was still armed, and it
     * stayed out until the pointer happened to move again.
     */
  }, [canPick]);

  return (
    <>
    {onPick && <MeasureCursor groundAhdM={groundAhdM} innerRef={cursor} />}
    <mesh
      receiveShadow
      geometry={geometry}
      position={[centreE, centreN, groundAhdM]}
      onPointerOut={onPick && (() => show(false))}
      onPointerDown={
        onPick &&
        ((event) => {
          pressedAt.current = beginTap(event.nativeEvent);
        })
      }
      onPointerMove={
        onPick &&
        ((event) => {
          const group = cursor.current;
          if (!group) return;
          /*
           * A move over the ground IS the pointer being over the ground,
           * whatever an earlier leave claimed. There is no separate enter
           * event to trust: enters and leaves can be lost, moves cannot be
           * misread.
           */
          show(true);
          // Watched as it happens: a pan that wanders back to where it began
          // has zero displacement and is still a pan. See tap.ts.
          trackTap(pressedAt.current, event.nativeEvent);
          // Same reading back as the click below: the hit arrives in three's
          // world frame, and the ring lives inside <WorldFrame>.
          group.position.set(event.point.x, -event.point.z, 0);
        })
      }
      onClick={
        onPick &&
        ((event) => {
          event.stopPropagation();
          /*
           * Not if the camera was being moved.
           *
           * A pan is a press, a drag and a release, and the release lands on
           * whatever the pointer finished over — which the renderer reports
           * as a click. So every time somebody turned the view they also
           * placed a measurement point they had not asked for.
           */
          const from = pressedAt.current;
          pressedAt.current = null;
          if (wasDragged(from, event.nativeEvent)) return;

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
        key={surface ? 'walking' : basemap ? 'with-basemap' : 'plain'}
        map={surface ?? basemap}
        vertexColors
        roughness={1}
        metalness={0}
      />
    </mesh>
    </>
  );
}

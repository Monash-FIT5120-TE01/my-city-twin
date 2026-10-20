/*
 * ─────────────────────────────────────────────────────────────────────────
 * THE GROUND, AND WHERE IT STOPS
 * ─────────────────────────────────────────────────────────────────────────
 *
 * WHAT THIS FILE IS
 *   The surface the city stands on, at the ground's real heights
 *   (terrain.ts), and the surface a click lands on when someone measures a
 *   spot.
 *
 * WHY IT FADES AT THE EDGES
 *   The building data covers the Hoddle Grid and stops. Beyond it there is
 *   genuinely nothing — no suburbs, no river, no data of any kind. Drawn as
 *   a plain square, that boundary reads as the edge of the world. Faded, it
 *   reads as the edge of what is known, which is what it is. The fade itself
 *   is drawn over the ground by HazeVeil, which explains why the ground
 *   cannot fade itself.
 *
 * WHY IT IS A DISC
 *   The fade is radial — distance from the centre — but the geometry under
 *   it was once a square, and its corners reached 1.7 times as far as its
 *   edges. That was invisible while the ground faded into a flat background
 *   of the same colour. With a sky behind it, the ground meets something
 *   that is NOT that colour, and a square silhouette appears: a straight
 *   horizon with corners on it, which no place has.
 *
 *   A disc whose rim is exactly where the fade finishes has no edge to see.
 *
 *   Making the ground transparent instead was tried and is worse. A
 *   transparent ground still catches shadows, so the city ends up casting
 *   shadows onto empty space.
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
import { BufferAttribute, BufferGeometry, Color, type Group, type Texture } from 'three';
import type { CityModel } from '../data/model';
import { groundPlacement, textureCoordinate } from './basemap';
import { groundSurfaceTexture, SURFACE_TILE_M } from './groundSurface';
import { MeasureCursor } from './MeasureCursor';
import { heightAt, type Terrain } from './terrain';
import { beginTap, trackTap, wasDragged, type Gesture } from './tap';

export function Ground({
  model,
  terrain,
  basemap,
  walking,
  onPick,
}: {
  model: CityModel;
  /** The ground's real heights (terrain.ts): the surface follows them. */
  terrain: Terrain;
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
     * A grid that follows the ground (terrain.ts). Over the terrain's own grid its points ARE the
     * terrain's points, ten metres apart, so whatever is laid on the ground (drape.ts) reads the same
     * heights the surface was built from and cannot sink into it. Past the terrain grid, out in the
     * haze, a few coarse steps to the edge. One rectilinear grid, so no seams; squares outside the disc
     * are left out, the edge being round as the haze round it is.
     */
    const half = size / 2;
    const axisOf = (centre: number, gridMin: number, count: number) => {
      const lo = centre - half;
      const hi = centre + half;
      const inside: number[] = [];
      for (let i = 0; i < count; i++) {
        const v = gridMin + i * terrain.cell;
        if (v > lo && v < hi) inside.push(v - centre);
      }
      const first = inside[0] ?? 0;
      const last = inside[inside.length - 1] ?? 0;
      const OUTER_STEPS = 16;
      const before = Array.from({ length: OUTER_STEPS }, (_, i) => -half + ((first + half) * i) / OUTER_STEPS);
      const after = Array.from({ length: OUTER_STEPS }, (_, i) => last + ((half - last) * (i + 1)) / OUTER_STEPS);
      return [...before, ...inside, ...after];
    };
    const xs = axisOf(centreE, terrain.minE, terrain.cols);
    const ys = axisOf(centreN, terrain.minN, terrain.rows);
    const plane = new BufferGeometry();
    const W = xs.length;
    const H = ys.length;
    const positions = new Float32Array(W * H * 3);
    for (let r = 0; r < H; r++) {
      for (let c = 0; c < W; c++) {
        const i = (r * W + c) * 3;
        positions[i] = xs[c];
        positions[i + 1] = ys[r];
        positions[i + 2] = heightAt(terrain, centreE + xs[c], centreN + ys[r]);
      }
    }
    const index: number[] = [];
    for (let r = 0; r < H - 1; r++) {
      for (let c = 0; c < W - 1; c++) {
        const mx = (xs[c] + xs[c + 1]) / 2;
        const my = (ys[r] + ys[r + 1]) / 2;
        if (Math.hypot(mx, my) > half) continue;
        const a0 = r * W + c;
        const c0 = a0 + W;
        index.push(a0, a0 + 1, c0 + 1, a0, c0 + 1, c0);
      }
    }
    plane.setAttribute('position', new BufferAttribute(positions, 3));
    plane.setAttribute('uv', new BufferAttribute(new Float32Array(W * H * 2), 2));
    plane.setIndex(index);

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
       * the buildings.
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
    plane.computeVertexNormals();
    return plane;
  }, [centreE, centreN, size, placement, basemap, walking, terrain]);

  /*
   * The plane is rebuilt when the map arrives, and react-three-fiber replaces
   * the `geometry` property without disposing what was there. These buffers
   * live on the GPU and nothing else is holding them, so each rebuild leaked
   * one plane's worth until the tab closed.
   */
  useEffect(() => () => geometry.dispose(), [geometry]);

  /*
   * What the pointer is tested against while a spot is being chosen: the same ground at every fourth
   * grid point, drawn by nobody. Testing the drawn ground (some 120,000 points) on every move of the
   * pointer would cost a phone or a headset a noticeable slice of each frame; the hit's
   * height is then read off the real ground at that place.
   */
  const picking = Boolean(onPick);
  const pickGeometry = useMemo(() => {
    if (!picking) return null;
    const STRIDE = 4;
    const half = size / 2;
    const xs: number[] = [];
    const ys: number[] = [];
    for (let v = -half; v <= half + 1e-6; v += terrain.cell * STRIDE) {
      xs.push(v);
      ys.push(v);
    }
    const W = xs.length;
    const positions = new Float32Array(W * W * 3);
    for (let r = 0; r < W; r++) {
      for (let c = 0; c < W; c++) {
        const i = (r * W + c) * 3;
        positions[i] = xs[c];
        positions[i + 1] = ys[r];
        positions[i + 2] = heightAt(terrain, centreE + xs[c], centreN + ys[r]);
      }
    }
    const index: number[] = [];
    for (let r = 0; r < W - 1; r++) {
      for (let c = 0; c < W - 1; c++) {
        const a0 = r * W + c;
        index.push(a0, a0 + 1, a0 + W + 1, a0, a0 + W + 1, a0 + W);
      }
    }
    const g = new BufferGeometry();
    g.setAttribute('position', new BufferAttribute(positions, 3));
    g.setIndex(index);
    g.computeBoundingSphere();
    return g;
  }, [picking, size, terrain, centreE, centreN]);
  useEffect(() => () => pickGeometry?.dispose(), [pickGeometry]);

  /*
   * The coarse surface finds roughly where the pointer meets the ground; the real ground is then met
   * along the same ray, near there (a step search, then halving): read straight down from the coarse hit,
   * a ridge between its points sent the spot to the wrong place. East/north/up, or null
   * off the edge of the drawn ground.
   */
  const meetGround = (ray: { origin: { x: number; y: number; z: number }; direction: { x: number; y: number; z: number } }, distance: number): [number, number, number] | null => {
    const at = (t: number) => {
      const e = ray.origin.x + ray.direction.x * t;
      const n = -(ray.origin.z + ray.direction.z * t);
      return [e, n, ray.origin.y + ray.direction.y * t - heightAt(terrain, e, n)] as const;
    };
    // the FIRST place the ray goes under the ground, from where it enters the drawn disc; fine steps
    // (a metre near, growing slowly with distance), so a ridge it only grazes is not stepped over
    if (at(0)[2] <= 0) return null;
    let lo = 0;
    let hi = -1;
    const end = distance + 200;
    for (let t = 0; t < end; ) {
      const step = Math.max(0.5, t * 0.002);
      const next = t + step;
      if (at(next)[2] <= 0) {
        lo = t;
        hi = next;
        break;
      }
      t = next;
    }
    if (hi < 0) return null;
    for (let k = 0; k < 16; k++) {
      const mid = (lo + hi) / 2;
      if (at(mid)[2] > 0) lo = mid;
      else hi = mid;
    }
    const [e, n] = at(hi);
    if (Math.hypot(e - centreE, n - centreN) > size / 2) return null;
    return [e, n, heightAt(terrain, e, n)];
  };

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
    {/* placed at the point under the pointer, its height included (onPointerMove): the cursor adds only its lift */}
    {onPick && <MeasureCursor groundAhdM={0} innerRef={cursor} />}
    {pickGeometry && (
    <mesh
      geometry={pickGeometry}
      position={[centreE, centreN, 0]}
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
          const hit = meetGround(event.ray, event.distance);
          if (!hit) {
            show(false);
            return;
          }
          group.position.set(hit[0], hit[1], hit[2]);
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
          const hit = meetGround(event.ray, event.distance);
          if (hit) onPick([hit[0], hit[1]]);
        })
      }
    >
      <meshBasicMaterial visible={false} />
    </mesh>
    )}
    <mesh receiveShadow geometry={geometry} position={[centreE, centreN, 0]} raycast={() => null}>
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

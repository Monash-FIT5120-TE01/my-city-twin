// oxlint-disable react/immutability -- turning local clipping on for the renderer means writing to an
// object three.js hands back from a hook; StreetView and CameraRig do the same for the same reason.
/*
 * ─────────────────────────────────────────────────────────────────────────
 * THE FLAT, DRAWN IN ITS BUILDING
 * ─────────────────────────────────────────────────────────────────────────
 *
 * The one-bedroom flat's model (public/models/apartment/apartment.glb: built
 * in Blender, its colours baked, Draco-compressed; ProjectDoc/studio-room)
 * placed behind one side of a building on one floor. The building's own
 * massing has that block clipped away (HighlightedBuilding, roomClip.ts).
 *
 * INSIDE <WorldFrame>: positions here are east/north/up. The glTF is +Y up,
 * so the model is turned a quarter about x to stand Z-up — once, here.
 *
 * The Draco decoder is served from this site (public/draco/), never fetched
 * from anywhere else.
 */
import { Suspense, useEffect, useMemo } from 'react';
import { useThree } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import { PMREMGenerator, type Texture } from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { EXISTING } from '../palette';
import { NOTCH } from './apartmentLayout';
import type { RoomPlacement } from './roomPlacement';

const BASE = import.meta.env.BASE_URL;
const MODEL_URL = `${BASE}models/apartment/apartment.glb`;
const DRACO_URL = `${BASE}draco/`;

type Glowing = { emissiveIntensity: number };
type Reflecting = { envMap: Texture | null; envMapIntensity: number; needsUpdate: boolean };

/*
 * Reflections, for the flat only: a soft room-shaped environment (three's RoomEnvironment) on the shiny
 * things — the marble, the ceramic, the metal, the glass — so they catch light the way they do in the
 * photos rather than looking like painted card. Set on these materials, not on the scene: the city
 * outside keeps the light it has always had. Matt surfaces get none; it would only wash them out.
 */
const REFLECTION: Record<string, number> = {
  'apartment-gloss': 0.2,
  'apartment-metal': 0.8,
  'apartment-glass': 0.9,
};

function Model({ night, onReady }: { night: number; onReady?: () => void }) {
  const { scene } = useGLTF(MODEL_URL, DRACO_URL);
  const gl = useThree((s) => s.gl);
  const environment = useMemo(() => {
    const pmrem = new PMREMGenerator(gl);
    const room = new RoomEnvironment();
    const texture = pmrem.fromScene(room, 0.04).texture;
    room.dispose();
    pmrem.dispose();
    return texture;
  }, [gl]);
  useEffect(() => () => environment.dispose(), [environment]);
  const { copy, glow } = useMemo(() => {
    const c = scene.clone(true);
    let g: Glowing | null = null;
    c.traverse((o) => {
      const m = o as { isMesh?: boolean; name: string; castShadow: boolean; receiveShadow: boolean; material?: { transparent?: boolean } };
      // the lamp shades, the strip in the wardrobe (export_web.py "glow"): their own light, lit at night
      if (m.isMesh && m.name === 'apartment-glow') g = m.material as unknown as Glowing;
      if (m.isMesh && REFLECTION[m.name] !== undefined) {
        const r = m.material as unknown as Reflecting;
        r.envMap = environment;
        r.envMapIntensity = REFLECTION[m.name];
        r.needsUpdate = true;
      }
      if (m.isMesh) {
        // glass lets the sun in: a shadow map knows nothing of transparency, so glass would cast a solid one
        m.castShadow = !m.material?.transparent;
        m.receiveShadow = true;
      }
    });
    return { copy: c, glow: g as Glowing | null };
  }, [scene, environment]);
  useEffect(() => {
    if (glow) glow.emissiveIntensity = night;
  }, [glow, night]);
  // mounted means loaded: Suspense held this back until the model arrived
  useEffect(() => {
    onReady?.();
  }, [onReady]);
  // glTF is +Y up; the flat's frame is +Z up
  return <primitive object={copy} rotation={[Math.PI / 2, 0, 0]} />;
}

/*
 * The flat's own lights, after dark (night: 0 by day, 1 once the sun is a few degrees down, eased between).
 *
 * Four, standing for the six downlights and the lamps: every light is paid for by every lit pixel in the
 * whole city, not just in the flat, so they are few, without shadows, and reach only a few metres. Kept
 * mounted by day at zero, because adding or removing a light recompiles every material in the scene.
 *
 * By day there is no fill light: the sky light (SceneCanvas's hemisphere and ambient) already reaches
 * every surface inside, as it does outside, and more would only flatten the sun on the floor.
 *
 * At the middle of the room's height, not up by the downlights: a point light 0.35 m under the ceiling
 * lit a hot oval on it that fell away to dark within a metre or two (as the cube of the distance), a hard
 * ring across the ceiling (2026-10-18). Real downlights shine down and the ceiling is lit by what comes
 * back off the room; from the middle of the room the ceiling is lit evenly, as it then is.
 */
const LIGHTS: { at: [number, number, number]; intensity: number }[] = [
  { at: [2.5, 1.6, 1.7], intensity: 3.6 },   // living and kitchen
  { at: [5.8, 1.8, 1.7], intensity: 3.6 },   // living, by the balcony
  { at: [5.6, 5.2, 1.7], intensity: 3.0 },   // bedroom
  { at: [1.1, 4.3, 1.7], intensity: 2.4 },   // bathroom, laundry and hall
];
const LAMP_COLOUR = '#ffd9a8';
// far enough that the light fades out softly across the flat, not in a hard ring on the ceiling at 5 m
const LAMP_REACH_M = 12;

export function ApartmentRoom({
  placement,
  night = 0,
  onReady,
}: {
  placement: RoomPlacement;
  night?: number;
  /** Called once the model has loaded and been put in the scene. */
  onReady?: () => void;
}) {
  const gl = useThree((s) => s.gl);
  // the massing's clipping planes only act while local clipping is on
  useEffect(() => {
    const before = gl.localClippingEnabled;
    gl.localClippingEnabled = true;
    return () => {
      gl.localClippingEnabled = before;
    };
  }, [gl]);

  const notch = useMemo(() => {
    const cx = (NOTCH.x0 + NOTCH.x1) / 2;
    const cy = (NOTCH.y0 + NOTCH.y1) / 2;
    return { centre: [cx, cy, (NOTCH.z0 + NOTCH.z1) / 2] as const, size: [NOTCH.x1 - NOTCH.x0, NOTCH.y1 - NOTCH.y0, NOTCH.z1 - NOTCH.z0] as const };
  }, []);

  return (
    <group position={[placement.originEN[0], placement.originEN[1], placement.floorAhdM]} rotation={[0, 0, placement.angle]}>
      <Suspense fallback={null}>
        <Model night={night} onReady={onReady} />
      </Suspense>
      {LIGHTS.map(({ at, intensity }) => (
        <pointLight key={at.join()} position={at} color={LAMP_COLOUR} intensity={intensity * night} distance={LAMP_REACH_M} decay={2} />
      ))}
      {/* the corner of the cut-out block the flat does not fill, made solid again */}
      <mesh position={notch.centre as unknown as [number, number, number]} castShadow receiveShadow>
        <boxGeometry args={notch.size as unknown as [number, number, number]} />
        <meshStandardMaterial color={EXISTING} roughness={0.82} />
      </mesh>
    </group>
  );
}

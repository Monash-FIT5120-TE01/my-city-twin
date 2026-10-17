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
import { EXISTING } from '../palette';
import { NOTCH } from './apartmentLayout';
import type { RoomPlacement } from './roomPlacement';

const BASE = import.meta.env.BASE_URL;
const MODEL_URL = `${BASE}models/apartment/apartment.glb`;
const DRACO_URL = `${BASE}draco/`;

function Model() {
  const { scene } = useGLTF(MODEL_URL, DRACO_URL);
  const copy = useMemo(() => {
    const c = scene.clone(true);
    c.traverse((o) => {
      const m = o as { isMesh?: boolean; castShadow: boolean; receiveShadow: boolean };
      if (m.isMesh) {
        m.castShadow = true;
        m.receiveShadow = true;
      }
    });
    return c;
  }, [scene]);
  // glTF is +Y up; the flat's frame is +Z up
  return <primitive object={copy} rotation={[Math.PI / 2, 0, 0]} />;
}

export function ApartmentRoom({ placement }: { placement: RoomPlacement }) {
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
        <Model />
      </Suspense>
      {/* the corner of the cut-out block the flat does not fill, made solid again */}
      <mesh position={notch.centre as unknown as [number, number, number]} castShadow receiveShadow>
        <boxGeometry args={notch.size as unknown as [number, number, number]} />
        <meshStandardMaterial color={EXISTING} roughness={0.82} />
      </mesh>
    </group>
  );
}

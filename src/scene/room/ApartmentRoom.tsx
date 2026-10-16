// oxlint-disable react/immutability -- turning local clipping on for the renderer, and (in the
// development check) holding the camera still, mean writing to objects three.js hands back from hooks;
// StreetView and CameraRig do the same for the same reason.
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
import { useFrame, useThree } from '@react-three/fiber';
import { useGLTF } from '@react-three/drei';
import { Vector3 } from 'three';
import { enuToWorld } from '../frame';
import { EXISTING } from '../palette';
import { NOTCH } from './apartmentLayout';
import { toEN, type RoomPlacement } from './roomPlacement';

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

/* DEVELOPMENT ONLY (?roomcheck, roomCheck.ts): the camera held still in the living room, looking out. */
export function RoomCheckCamera({ placement }: { placement: RoomPlacement }) {
  const camera = useThree((s) => s.camera) as unknown as {
    position: Vector3; near: number; far: number; fov: number; lookAt: (v: Vector3) => void; updateProjectionMatrix: () => void;
  };
  const controls = useThree((s) => s.controls) as unknown as { enabled: boolean } | null;
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const pose = useMemo(() => {
    const at = (x: number, y: number, z: number) => new Vector3(...enuToWorld([...toEN(placement, x, y), placement.floorAhdM + z]));
    return { eye: at(1.2, 2.0, 1.4), target: at(7.3, 1.9, 1.1), near: 0.05 };
  }, [placement]);
  useEffect(() => {
    if (controls) controls.enabled = false;
  }, [controls]);
  // priority 1: runs after everything else that moves the camera, and draws the frame itself
  useFrame(() => {
    camera.position.copy(pose.eye);
    camera.lookAt(pose.target);
    if (camera.near !== pose.near || camera.fov !== 60) {
      camera.near = pose.near;
      camera.fov = 60;
      camera.updateProjectionMatrix();
    }
    gl.render(scene, camera as never);
  }, 1);
  return null;
}


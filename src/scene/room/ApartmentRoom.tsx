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
import { Component, Suspense, useEffect, useMemo, type ReactNode } from 'react';
import { useThree } from '@react-three/fiber';
import { useGLTF, useTexture } from '@react-three/drei';
import { PMREMGenerator, SRGBColorSpace, type Texture, type WebGLProgramParametersWithUniforms } from 'three';
import lightmaps from '../../../public/models/apartment/light/lightmaps.json';
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
// the glass only faintly: at 0.9 it reflected the bright room back and went milky white, hiding the view
const REFLECTION: Record<string, number> = {
  'apartment-gloss': 0.2,
  'apartment-metal': 0.8,
  'apartment-glass': 0.12,
};

/*
 * After dark, the light the lamps throw back off the walls, the ceiling and the floor: the same soft
 * environment on every surface of the flat, at this strength once it is night. Four point lights alone
 * left the corners and everything they did not face nearly black (2026-10-18). Only the flat's own
 * materials take it, so the city outside the window stays as dark as the night. Now 0: the night light
 * maps (below) carry the light off the walls instead.
 */
const NIGHT_FILL = 0;

/*
 * The light maps (export_web.py 4c): what Cycles finds reaching each surface, by day (the sky through the
 * windows and the sun's light bounced about) and by night (the flat's thirteen lamps). Added to the light
 * the site works out itself, blended by the hour: the walls get the warmth and the brightness they have
 * in the Blender renders, which no light in the site could give them (nothing bounces in it). Stored
 * scaled down (lightmaps.json) and brought back here; GAIN matches the renders' exposure to the site's.
 */
const LIGHT_CLASSES = lightmaps.classes as readonly string[];
const LIGHT_URLS = LIGHT_CLASSES.flatMap((k) => [`${BASE}models/apartment/light/apartment-${k}-day.png`, `${BASE}models/apartment/light/apartment-${k}-night.png`]);
const DAY_GAIN = 0.7;
const NIGHT_GAIN = 1.0;
/*
 * By day the lamps' light at this share as well: the renders the flat was matched to had the lamps on
 * through the day, and the sky alone (bluish, from one side) left the room cold and washed out.
 */
const DAY_LAMPS = 0.45;
/** The baked occlusion is in the light maps already; the AO map is kept faint so it does not darken twice. */
const AO_WITH_LIGHTMAP = 0.35;

type Lightmapped = {
  lightMap: Texture | null;
  lightMapIntensity: number;
  aoMapIntensity: number;
  needsUpdate: boolean;
  onBeforeCompile: (shader: WebGLProgramParametersWithUniforms) => void;
  customProgramCacheKey: () => string;
  userData: { night?: { value: number }; nightMap?: { value: Texture } };
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
  const lightTextures = useTexture(LIGHT_URLS) as Texture[];
  const { copy, glow, lit, mapped } = useMemo(() => {
    const c = scene.clone(true);
    let g: Glowing | null = null;
    const l: { material: Reflecting; base: number }[] = [];
    const lm: Lightmapped[] = [];
    c.traverse((o) => {
      const m = o as { isMesh?: boolean; name: string; castShadow: boolean; receiveShadow: boolean; material?: { transparent?: boolean } };
      // the lamp shades, the strip in the wardrobe (export_web.py "glow"): their own light, lit at night
      if (m.isMesh && m.name === 'apartment-glow') g = m.material as unknown as Glowing;
      if (m.isMesh && m.name.startsWith('apartment-') && m.name !== 'apartment-glow') {
        const r = m.material as unknown as Reflecting;
        r.envMap = environment;
        r.envMapIntensity = REFLECTION[m.name] ?? 0;
        r.needsUpdate = true;
        l.push({ material: r, base: REFLECTION[m.name] ?? 0 });
      }
      const cls = m.isMesh ? m.name.replace('apartment-', '') : '';
      const at = LIGHT_CLASSES.indexOf(cls);
      if (m.isMesh && at >= 0) {
        const mat = m.material as unknown as Lightmapped;
        const [day, night] = [lightTextures[at * 2], lightTextures[at * 2 + 1]];
        for (const t of [day, night]) {
          t.flipY = false;   // on the glTF's own UVs, which three reads unflipped
          t.colorSpace = SRGBColorSpace;   // stored sRGB-encoded, for precision in the dark
          t.channel = 0;
          t.needsUpdate = true;
        }
        mat.lightMap = day;
        mat.lightMapIntensity = 0;
        mat.aoMapIntensity = AO_WITH_LIGHTMAP;
        /*
         * The uniform objects are made once and kept: the shader, compiled once and cached, holds on to
         * the ones it first saw. Making new ones on the next visit left the night light at the last
         * visit's strength (review, 2026-10-18).
         */
        mat.userData.night ??= { value: 0 };
        mat.userData.nightMap ??= { value: night };
        mat.userData.nightMap.value = night;
        // the night map beside the day one, mixed by the hour (three has one light map a material)
        mat.onBeforeCompile = (shader) => {
          shader.uniforms.nightLightMap = mat.userData.nightMap!;
          shader.uniforms.nightLightMapIntensity = mat.userData.night!;
          shader.fragmentShader = shader.fragmentShader
            .replace('#include <lights_fragment_maps>', '#include <lights_fragment_maps>\n')
            .replace('void main() {', 'uniform sampler2D nightLightMap;\nuniform float nightLightMapIntensity;\nvoid main() {');
          shader.fragmentShader = shader.fragmentShader.replace(
            '#include <lights_fragment_maps>',
            `#include <lights_fragment_maps>
            #ifdef USE_LIGHTMAP
              irradiance += texture2D( nightLightMap, vLightMapUv ).rgb * nightLightMapIntensity;
            #endif`,
          );
        };
        mat.customProgramCacheKey = () => 'flat-two-lightmaps';
        mat.needsUpdate = true;
        lm.push(mat);
      }
      if (m.isMesh) {
        // glass lets the sun in: a shadow map knows nothing of transparency, so glass would cast a solid one
        m.castShadow = !m.material?.transparent;
        m.receiveShadow = true;
      }
    });
    return { copy: c, glow: g as Glowing | null, lit: l, mapped: lm };
  }, [scene, environment, lightTextures]);
  useEffect(() => {
    if (glow) glow.emissiveIntensity = night;
    // the glass takes no night fill: lit up, it turned milky and hid the view (it is the view's window)
    for (const { material, base } of lit) material.envMapIntensity = base + (base === REFLECTION['apartment-glass'] ? 0 : NIGHT_FILL * night);
    for (const mat of mapped) {
      mat.lightMapIntensity = lightmaps.scale.day * DAY_GAIN * (1 - night);
      mat.userData.night!.value = lightmaps.scale.night * NIGHT_GAIN * (night + DAY_LAMPS * (1 - night));
    }
  }, [glow, lit, mapped, night]);
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
  { at: [2.5, 1.6, 1.7], intensity: 6.5 },   // living and kitchen
  { at: [5.8, 1.8, 1.7], intensity: 6.5 },   // living, by the balcony
  { at: [5.6, 5.2, 1.7], intensity: 5.5 },   // bedroom
  { at: [1.1, 4.3, 1.7], intensity: 4.5 },   // bathroom, laundry and hall
];
const LAMP_COLOUR = '#ffd9a8';
/** What is left of them now the night light map carries the lamps' light: a little, for the shine on glossy things. */
const LAMP_SHARE = 0.25;
// far enough that the light fades out softly across the flat, not in a hard ring on the ceiling at 5 m
const LAMP_REACH_M = 12;

/*
 * A file that will not load (a dropped connection, a missing image) throws out of the model's Suspense.
 * Caught here, it is reported to App, which takes the reader back out through the fade; uncaught, the
 * screen stayed dark on "Loading the flat" (review, 2026-10-18).
 */
class LoadBoundary extends Component<{ onFailed?: () => void; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: unknown) {
    console.error('The flat could not be loaded:', error);
    this.props.onFailed?.();
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}

export function ApartmentRoom({
  placement,
  night = 0,
  onReady,
  onFailed,
}: {
  placement: RoomPlacement;
  night?: number;
  /** Called once the model has loaded and been put in the scene. */
  onReady?: () => void;
  /** The model or its light maps could not be loaded. */
  onFailed?: () => void;
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
      <LoadBoundary onFailed={onFailed}>
        <Suspense fallback={null}>
          <Model night={night} onReady={onReady} />
        </Suspense>
      </LoadBoundary>
      {LIGHTS.map(({ at, intensity }) => (
        <pointLight key={at.join()} position={at} color={LAMP_COLOUR} intensity={intensity * night * LAMP_SHARE} distance={LAMP_REACH_M} decay={2} />
      ))}
      {/* the corner of the cut-out block the flat does not fill, made solid again */}
      <mesh position={notch.centre as unknown as [number, number, number]} castShadow receiveShadow>
        <boxGeometry args={notch.size as unknown as [number, number, number]} />
        <meshStandardMaterial color={EXISTING} roughness={0.82} />
      </mesh>
    </group>
  );
}

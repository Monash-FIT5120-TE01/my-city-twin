/*
 * ─────────────────────────────────────────────────────────────────────────
 * FINDING ONE'S WAY IN THE STREET, IN THE HEADSET
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Two things, chosen together from the preview (ProjectDoc/vr-ui-redesign/
 * street-names.html, options C and D, 2026-10-10):
 *
 *   THE BAR — over the middle of the view, a little above it: the street,
 *   the way the head points, the next street to be crossed and how far, and
 *   a landmark straight ahead (vrWayfinding.ts says what). It follows the
 *   head like the small map, smoothed. Bright while walking or just after it
 *   changes; faded after a few seconds standing still, so it is there when
 *   wanted and quiet otherwise.
 *
 *   THE SIGNS — at the crossings near the reader, a pole on one corner with a
 *   blade for each street, the way a city names its corners. Part of the
 *   city, not of the view: nothing more stuck to the eyes, and the name of a
 *   crossing a block away can be read before getting there.
 *
 * Only in the street (not on the platform above the city), and the bar not
 * while the menu is open.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { DoubleSide, Vector3, type CanvasTexture, type Group, type Mesh, type MeshBasicMaterial } from 'three';
import { canvasTexture, paintTexture } from './vrIcons';
import { worldToEnu } from './frame';
import { GRID_DIRECTIONS } from './streets';
import { LANDMARKS } from './vrLandmarks';
import { gridCrossings, wayfind, wayfindingWords } from './vrWayfinding';
import { GREEN, INK, INK_2, PAPER } from './vrTokens';
import { PANEL_RENDER_ORDER } from './vrPointer';
import { groundAt, type Ground } from './terrain';

const DEG = Math.PI / 180;
const FONT = 'Inter, "Segoe UI", system-ui, sans-serif';

/* ── the bar ───────────────────────────────────────────────────────── */

const BAR_W = 0.5;
const BAR_H = 0.09;
const BAR_PX_PER_M = 2400;
const BAR_DISTANCE_M = 0.9;
const BAR_UP_RAD = 16 * DEG;
/** Catches the head up like the small map: all but e^-k of the gap each second. */
const FOLLOW_PER_S = 14;
/** Seconds between working out where the reader is. */
const EVERY_S = 0.25;
/** Standing still this long, seconds, fades it to QUIET. */
const QUIET_AFTER_S = 3;
const QUIET = 0.45;
/** Moving faster than this, m/s, counts as walking. */
const WALKING_M_S = 0.3;

function drawBar(ctx: CanvasRenderingContext2D, letters: string, main: string, sub: string) {
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = PAPER;
  ctx.beginPath();
  ctx.roundRect(0, 0, w, h, h / 2);
  ctx.fill();

  // The badge: the heading in letters, so it does not rest on colour.
  const r = h * 0.36;
  const cx = h / 2;
  ctx.fillStyle = GREEN;
  ctx.beginPath();
  ctx.arc(cx, h / 2, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#ffffff';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `800 ${letters.length > 1 ? 50 : 62}px ${FONT}`;
  ctx.fillText(letters, cx, h / 2 + 3);

  ctx.textAlign = 'left';
  ctx.textBaseline = 'alphabetic';
  const left = cx + r + 26;
  const room = w - left - h * 0.35;
  let size = 64;
  ctx.font = `800 ${size}px ${FONT}`;
  while (size > 40 && ctx.measureText(main).width > room) ctx.font = `800 ${(size -= 2)}px ${FONT}`;
  ctx.fillStyle = INK;
  ctx.fillText(main, left, sub ? h / 2 - 2 : h / 2 + size / 3, room);
  if (sub) {
    let small = 46;
    ctx.font = `500 ${small}px ${FONT}`;
    while (small > 30 && ctx.measureText(sub).width > room) ctx.font = `500 ${(small -= 2)}px ${FONT}`;
    ctx.fillStyle = INK_2;
    ctx.fillText(sub, left, h / 2 + 58, room);
  }
}

export function VrStreetBar({ shown }: { shown: boolean }) {
  const rig = useRef<Group>(null);
  const plate = useRef<Mesh>(null);
  const texture = useMemo(() => canvasTexture(BAR_W * BAR_PX_PER_M, BAR_H * BAR_PX_PER_M, false), []);
  useEffect(() => () => texture.dispose(), [texture]);

  const head = useRef(new Vector3());
  const look = useRef(new Vector3());
  const aim = useRef<{ yaw: number; pitch: number } | null>(null);
  /** What is drawn, when it was last worked out, where the reader was, and when they last moved or it last changed. */
  const kept = useRef({ words: '', since: -1, en: [0, 0] as [number, number], activeAt: 0, opacity: 0 });

  useFrame((state, delta) => {
    const group = rig.current;
    const parent = group?.parent;
    if (!group || !parent) return;
    const k = kept.current;
    if (!shown) {
      group.visible = false;
      aim.current = null;
      k.opacity = 0;
      return;
    }
    const now = state.clock.elapsedTime;

    // Where the reader is, in the city, every quarter of a second.
    if (now - k.since >= EVERY_S) {
      state.camera.getWorldPosition(head.current);
      state.camera.getWorldDirection(look.current);
      const [east, north] = worldToEnu([head.current.x, head.current.y, head.current.z]);
      const [le, ln] = worldToEnu([look.current.x, look.current.y, look.current.z]);
      const moved = Math.hypot(east - k.en[0], north - k.en[1]);
      if (k.since >= 0 && moved / (now - k.since) > WALKING_M_S) k.activeAt = now;
      k.en = [east, north];
      k.since = now;
      const found = wayfind([east, north], Math.atan2(le, ln), LANDMARKS);
      const { main, sub } = wayfindingWords(found);
      const words = `${found.headingLetters}|${main}|${sub}`;
      if (words !== k.words) {
        // A new street or a new heading is worth seeing at full strength.
        if (k.words.split('|')[1] !== main) k.activeAt = now;
        k.words = words;
        paintTexture(texture, (ctx) => drawBar(ctx, found.headingLetters, main, sub));
      }
    }

    // Where it rides: in the floor's space, ahead of the head and a little above.
    state.camera.getWorldPosition(head.current);
    state.camera.getWorldDirection(look.current);
    parent.updateWorldMatrix(true, false);
    const eyes = parent.worldToLocal(head.current);
    const dir = look.current.transformDirection(parent.matrixWorld.clone().invert());
    const yaw = Math.atan2(-dir.x, -dir.z);
    const pitch = Math.asin(Math.max(-1, Math.min(1, dir.y)));
    if (aim.current === null) aim.current = { yaw, pitch };
    const share = 1 - Math.exp(-FOLLOW_PER_S * Math.min(delta, 0.1));
    aim.current.yaw += Math.atan2(Math.sin(yaw - aim.current.yaw), Math.cos(yaw - aim.current.yaw)) * share;
    aim.current.pitch += (pitch - aim.current.pitch) * share;
    const up = Math.min(1.2, aim.current.pitch + BAR_UP_RAD);
    group.position.set(
      eyes.x - Math.sin(aim.current.yaw) * Math.cos(up) * BAR_DISTANCE_M,
      eyes.y + Math.sin(up) * BAR_DISTANCE_M,
      eyes.z - Math.cos(aim.current.yaw) * Math.cos(up) * BAR_DISTANCE_M,
    );
    group.lookAt(parent.localToWorld(eyes));
    group.visible = k.words !== '';

    // Bright while walking, quiet when standing still; eased either way.
    const target = now - k.activeAt < QUIET_AFTER_S ? 1 : QUIET;
    k.opacity += (target - k.opacity) * (1 - Math.exp(-4 * Math.min(delta, 0.1)));
    if (plate.current) (plate.current.material as MeshBasicMaterial).opacity = k.opacity;
  });

  return (
    <group ref={rig} name="vr-street-bar" visible={false}>
      <mesh ref={plate} renderOrder={PANEL_RENDER_ORDER} raycast={() => null}>
        <planeGeometry args={[BAR_W, BAR_H]} />
        <meshBasicMaterial map={texture} transparent opacity={0} depthTest={false} depthWrite={false} toneMapped={false} />
      </mesh>
    </group>
  );
}

/* ── the signs ─────────────────────────────────────────────────────── */

/** Crossings within this of the reader carry a sign. */
const SIGNS_WITHIN_M = 230;
/** The set is worked out again once the reader is this far from where it last was. */
const RESET_AFTER_M = 40;
/** The pole stands this far from both centre lines: the corner of the footpath (main streets are 30 m across). */
const CORNER_M = 12.5;
const POLE_M = 3.4;
const BLADE_W = 2.6;
const BLADE_H = 0.34;
const BLADE_PX = 400;
const SIGN_GREEN = '#14624a';

/** "Swanston Street" on a blade reads "Swanston St", as the city's own signs do. */
function short(name: string) {
  return name.replace(/ Street$/, ' St');
}

function bladeTexture(name: string): CanvasTexture {
  const texture = canvasTexture(BLADE_W * BLADE_PX, BLADE_H * BLADE_PX, false);
  paintTexture(texture, (ctx) => {
    const { width: w, height: h } = ctx.canvas;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.roundRect(0, 0, w, h, 10);
    ctx.fill();
    ctx.fillStyle = SIGN_GREEN;
    ctx.beginPath();
    ctx.roundRect(6, 6, w - 12, h - 12, 7);
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    let size = 96;
    ctx.font = `800 ${size}px ${FONT}`;
    while (size > 50 && ctx.measureText(short(name)).width > w - 50) ctx.font = `800 ${(size -= 4)}px ${FONT}`;
    ctx.fillText(short(name), w / 2, h / 2 + 4);
  });
  return texture;
}

/** A blade along a street, readable from both sides. In the world frame: z is up. */
function Blade({ texture, along, heightM }: { texture: CanvasTexture; along: readonly [number, number]; heightM: number }) {
  const turn = Math.atan2(along[1], along[0]);
  return (
    <group position={[0, 0, heightM]} rotation={[0, 0, turn]}>
      {/* Stood up: the plane's y onto z. Then the same again, turned round, for the far side. */}
      <mesh rotation={[Math.PI / 2, 0, 0]} raycast={() => null}>
        <planeGeometry args={[BLADE_W, BLADE_H]} />
        <meshBasicMaterial map={texture} toneMapped={false} />
      </mesh>
      <group rotation={[0, 0, Math.PI]}>
        <mesh rotation={[Math.PI / 2, 0, 0]} raycast={() => null}>
          <planeGeometry args={[BLADE_W, BLADE_H]} />
          <meshBasicMaterial map={texture} toneMapped={false} />
        </mesh>
      </group>
    </group>
  );
}

export function VrCornerSigns({ groundAhdM }: { groundAhdM: Ground }) {
  const crossings = useMemo(() => gridCrossings(), []);
  const textures = useMemo(() => {
    const names = new Set(crossings.flatMap((crossing) => [crossing.long, crossing.cross]));
    return new Map([...names].map((name) => [name, bladeTexture(name)]));
  }, [crossings]);
  useEffect(() => () => textures.forEach((texture) => texture.dispose()), [textures]);

  const [centre, setCentre] = useState<[number, number] | null>(null);
  const head = useRef(new Vector3());
  useFrame((state) => {
    state.camera.getWorldPosition(head.current);
    const [east, north] = worldToEnu([head.current.x, head.current.y, head.current.z]);
    if (!centre || Math.hypot(east - centre[0], north - centre[1]) > RESET_AFTER_M) setCentre([east, north]);
  });

  const near = centre
    ? crossings.filter((crossing) => Math.hypot(crossing.en[0] - centre[0], crossing.en[1] - centre[1]) <= SIGNS_WITHIN_M)
    : [];
  const [le, ln] = GRID_DIRECTIONS.long;
  const [ce, cn] = GRID_DIRECTIONS.cross;

  return (
    <group name="vr-corner-signs">
      {near.map((crossing) => {
        const long = textures.get(crossing.long);
        const cross = textures.get(crossing.cross);
        if (!long || !cross) return null;
        const corner: [number, number, number] = [
          crossing.en[0] + (le + ce) * CORNER_M,
          crossing.en[1] + (ln + cn) * CORNER_M,
          groundAt(groundAhdM, crossing.en[0] + (le + ce) * CORNER_M, crossing.en[1] + (ln + cn) * CORNER_M),
        ];
        return (
          <group key={`${crossing.long}|${crossing.cross}`} position={corner}>
            <mesh position={[0, 0, POLE_M / 2]} rotation={[Math.PI / 2, 0, 0]} raycast={() => null}>
              <cylinderGeometry args={[0.045, 0.045, POLE_M, 8]} />
              <meshBasicMaterial color="#4b5357" side={DoubleSide} />
            </mesh>
            <Blade texture={long} along={GRID_DIRECTIONS.long} heightM={POLE_M - 0.25} />
            <Blade texture={cross} along={GRID_DIRECTIONS.cross} heightM={POLE_M - 0.25 - BLADE_H - 0.08} />
          </group>
        );
      })}
    </group>
  );
}

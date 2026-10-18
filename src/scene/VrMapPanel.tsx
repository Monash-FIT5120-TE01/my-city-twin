/*
 * ─────────────────────────────────────────────────────────────────────────
 * THE MAP, IN THE MENU AND IN THE CORNER OF THE EYE
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Two of them, drawn by the same code (vrMapDraw.ts) from the same city:
 *
 *   THE MAP CARD    the middle of the menu. North up, so the names stay
 *                   where they were between glances; the reader is a blue
 *                   dot with a fan for the way they face; the place chosen is
 *                   green with a pin, and the map centres on it (the target
 *                   button centres on the reader instead). Plus and minus to
 *                   zoom; the widest step shows the whole grid.
 *
 *   THE SMALL MAP   while the panels are away, a disc in the upper left of
 *                   the view, where a glance finds it and the street ahead
 *                   stays clear. Ahead is up, because walking it is "which
 *                   way now", not "where is north"; a small N on its rim
 *                   says where north went. It follows where the head points
 *                   lazily, not rigidly: a look round of less than twenty
 *                   degrees leaves it where it is, and a bigger turn brings
 *                   it along at a steady pace. Pinned to the head it would
 *                   swing with every glance, which is the motion most likely
 *                   to make somebody feel unwell.
 *
 * Both redraw only when the reader has moved a couple of metres or turned a
 * few degrees, and at most a few times a second — the picture is a texture,
 * and uploading one every frame would cost the headset for nothing.
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Container, Text } from '@react-three/uikit';
import { Picture } from './vrPicture';
import { DoubleSide, Matrix4, Vector3, type Group } from 'three';
import { canvasTexture, paintTexture } from './vrIcons';
import type { BuildingMassing, Development, PolygonEN } from '../data/model';
import { worldToEnu } from './frame';
import { LANDMARKS } from './vrLandmarks';
import { artNear, drawBase, drawMap, drawMarks, startCityTiles, subjectPath, toPixel, type CityTiles } from './vrMapDraw';
import { Button, Label } from './vrKit';
import { GLASS_EDGE, INK, INK_2, PAPER } from './vrTokens';
import { PANEL_RENDER_ORDER } from './vrPointer';

export interface CityForMap {
  buildings: BuildingMassing[];
  developments: Development[];
  extent: { minE: number; minN: number; maxE: number; maxN: number };
}

/** Metres per canvas pixel at each zoom step; the first shows the whole grid. */
const ZOOM_STEPS = [2.4, 1.2, 0.6, 0.3];
const START_STEP = 1;
/** Canvas pixels per millimetre of card. */
const DENSITY = 2;

const DEG = Math.PI / 180;

/** Milliseconds a frame may spend turning footprints into paths, until the whole city is in. */
const BUILD_MS_PER_FRAME = 4;

/** Each city's squares of paths and its developments' footprints — made once, kept for every card made after. */
const madeFor = new WeakMap<CityForMap, { tiles: CityTiles; footprints: { key: string; footprints: PolygonEN[] }[] }>();

function cityPaths(city: CityForMap) {
  let made = madeFor.get(city);
  if (!made) {
    const footprints = city.developments.map((development) => ({
      key: development.devKey,
      footprints: development.parts.flatMap((part) => part.footprint),
    }));
    made = { tiles: startCityTiles(city.buildings, footprints), footprints };
    madeFor.set(city, made);
  }
  return made;
}

/**
 * The city's paths (vrMapDraw: THE CITY IN SQUARES) and the place being
 * looked at. Each frame it is used it adds a few milliseconds' worth more
 * until the city is in; `art` then picks the squares a picture reaches.
 */
function useCityArt(city: CityForMap | null, subjectKey: string | null) {
  const made = city ? cityPaths(city) : null;
  const subject = useMemo(() => (made ? subjectPath(made.footprints, subjectKey) : null), [made, subjectKey]);
  return {
    /** Call once a frame: builds a little more. Returns whether the city is all in. */
    build: () => (made ? made.tiles.done() || made.tiles.step(BUILD_MS_PER_FRAME) : false),
    art: (centre: [number, number] | null, radiusM: number) => (made ? artNear(made.tiles, centre, radiusM, subject) : null),
  };
}

/** A canvas texture made once and thrown away with the component. */
function useCanvasTexture(width: number, height: number, ownMatrix: boolean) {
  const [texture] = useState(() => canvasTexture(width, height, ownMatrix));
  useEffect(() => () => texture.dispose(), [texture]);
  return texture;
}

/** Where the reader is, and which way their head faces, as east/north and a compass heading. */
function readReader(camera: { getWorldPosition: (v: Vector3) => Vector3; getWorldDirection: (v: Vector3) => Vector3 }, at: Vector3, look: Vector3) {
  camera.getWorldPosition(at);
  camera.getWorldDirection(look);
  const [east, north] = worldToEnu([at.x, at.y, at.z]);
  const [le, ln] = worldToEnu([look.x, look.y, look.z]);
  return { en: [east, north] as [number, number], headingRad: Math.atan2(le, ln) };
}

/**
 * Redraw when the reader moved or turned enough, and not more often than
 * `everyS`. Every redraw is a texture upload (megabytes for the map card), so
 * the thresholds are set so that looking around — which in a headset never
 * stops — does not keep redrawing.
 */
function useRedrawGate(everyS: number, movedM: number, turnedRad: number) {
  const last = useRef<{ en: [number, number]; heading: number; t: number; key: string } | null>(null);
  return (en: [number, number], heading: number, t: number, key: string) => {
    const was = last.current;
    const turned = was ? Math.abs(Math.atan2(Math.sin(heading - was.heading), Math.cos(heading - was.heading))) : 0;
    if (
      was &&
      was.key === key &&
      (t - was.t < everyS || (Math.hypot(en[0] - was.en[0], en[1] - was.en[1]) < movedM && turned < turnedRad))
    ) {
      return false;
    }
    last.current = { en, heading, t, key };
    return true;
  };
}

/** What the map card says about the place chosen, if any. */
export interface MapSubject {
  key: string;
  label: string;
  detail: string;
  en: [number, number];
}

/** The map's own frame inside the card, mm. */
const FRAME_W = 508;
const FRAME_H = 556;

export function MapCard({
  city,
  subject,
  shown,
  onViewPlace,
}: {
  city: CityForMap | null;
  subject: MapSubject | null;
  shown: boolean;
  /** "View place": what the reader can do with it — the Measure section. */
  onViewPlace: () => void;
}) {
  const paths = useCityArt(city, subject?.key ?? null);
  const texture = useCanvasTexture(FRAME_W * DENSITY, FRAME_H * DENSITY, true);
  /*
   * The footprints are drawn once into a canvas of their own and only drawn
   * again when the map's centre or zoom changes; a redraw for the reader
   * turning copies that and puts the marks on top.
   */
  const base = useRef<{ canvas: HTMLCanvasElement; key: string } | null>(null);
  const [step, setStep] = useState(START_STEP);
  /*
   * Centred on the place chosen, so choosing one shows where it is; the
   * target button centres on the reader instead, until another place is
   * chosen. Held with the place it was pressed for, so a new choice ends it
   * without an effect to tidy up.
   */
  const [onMeFor, setOnMeFor] = useState<string | null | undefined>(undefined);
  const onMe = !subject || onMeFor === subject.key;
  const gate = useRedrawGate(0.5, 3, 20 * DEG);
  const at = useRef(new Vector3());
  const look = useRef(new Vector3());

  useFrame((state) => {
    // Built while hidden too, so the map is ready when the card first shows.
    const whole = paths.build();
    if (!shown || !city) return;
    const you = readReader(state.camera, at.current, look.current);
    if (!gate(you.en, you.headingRad, state.clock.elapsedTime, `${step}:${subject?.key}:${onMe}:${whole}`)) return;
    const { minE, minN, maxE, maxN } = city.extent;
    // The widest step frames the whole city; the others centre on the place, or on the reader.
    const centre: [number, number] = step === 0 ? [(minE + maxE) / 2, (minN + maxN) / 2] : onMe || !subject ? you.en : subject.en;
    const view = { width: FRAME_W * DENSITY, height: FRAME_H * DENSITY, centreEN: centre, metresPerPx: ZOOM_STEPS[step], upHeadingRad: 0 };
    // Drawn again once the city is all in: until then it holds what was built so far.
    const baseKey = `${step}|${centre[0].toFixed(1)}|${centre[1].toFixed(1)}|${subject?.key}|${whole}`;
    if (!base.current || base.current.key !== baseKey) {
      const canvas = base.current?.canvas ?? document.createElement('canvas');
      canvas.width = view.width;
      canvas.height = view.height;
      const ctx = canvas.getContext('2d');
      // The whole city for the widest step; otherwise only what the view and a margin can reach.
      const drawn = paths.art(step === 0 ? null : centre, (Math.hypot(view.width, view.height) / 2) * ZOOM_STEPS[step]);
      if (ctx && drawn) drawBase(ctx, drawn, view);
      base.current = { canvas, key: baseKey };
    }
    const layer = base.current.canvas;
    paintTexture(texture, (ctx) => {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.drawImage(layer, 0, 0);
      drawMarks(ctx, view, { you, landmarks: LANDMARKS, labelPx: 30, pin: subject?.en ?? null });
    });
  });

  return (
    <>
      <Container flexDirection="row" alignItems="center" justifyContent="space-between" flexShrink={0}>
        <Text fontSize={30} fontWeight="bold" color={INK}>
          City map
        </Text>
        <Text fontSize={18} fontWeight="bold" color={INK_2}>
          N ^
        </Text>
      </Container>
      <Container width={FRAME_W} height={FRAME_H} borderRadius={28} overflow="hidden" positionType="relative" flexShrink={0}>
        <Picture texture={texture} width={FRAME_W} height={FRAME_H} radius={28} />
        {/* Over the picture: without a z-index the picture, drawn later, covered their fill. */}
        <Container positionType="absolute" positionRight={14} positionTop={14} flexDirection="column" gap={8} zIndex={2}>
          <Button label="+" tone="quiet" height={56} onClick={() => setStep((s) => Math.min(ZOOM_STEPS.length - 1, s + 1))} />
          <Button label="-" tone="quiet" height={56} onClick={() => setStep((s) => Math.max(0, s - 1))} />
          <Button label="" icon="measure" tone="quiet" height={56} onClick={() => setOnMeFor(subject?.key ?? null)} />
        </Container>
        <Container
          positionType="absolute"
          positionLeft={14}
          positionRight={14}
          positionBottom={14}
          zIndex={2}
          flexDirection="row"
          alignItems="center"
          gap={12}
          paddingY={12}
          paddingLeft={20}
          paddingRight={12}
          borderRadius={24}
          backgroundColor={PAPER}
        >
          <Container flexDirection="column" gap={2} flexGrow={1} flexShrink={1}>
            <Label size={19} weight="bold">
              {subject ? subject.label : 'No place chosen'}
            </Label>
            <Label size={18} color={INK_2}>
              {subject ? subject.detail : 'Choose one in Places, or point at a green building.'}
            </Label>
          </Container>
          {subject && <Button label="View place" tone="primary" icon="arrow" onClick={onViewPlace} />}
        </Container>
      </Container>
    </>
  );
}

// ── The small map, while walking ───────────────────────────────────────────

const MINI_PX = 512;
const MINI_RADIUS_M = 0.09;
/**
 * Where it rides: this far from the eyes, this far left of and above where they point.
 * Lowered from 18° up and 30° left (2026-10-10): on the headset it sat out of sight.
 */
const MINI_DISTANCE_M = 0.65;
const MINI_LEFT_RAD = (24 * Math.PI) / 180;
const MINI_UP_RAD = (6 * Math.PI) / 180;
/**
 * How quickly it catches the head up, per second: closes all but e^-k of the gap
 * each second. It used to wait for a 20° gap and then turn at 120°/s, which on
 * the headset read as a map left behind; now it follows all the time, smoothed
 * only enough to take out the head's small tremors.
 */
const FOLLOW_PER_S = 14;
const MINI_METRES_PER_PX = 0.8;

export function MiniMap({ city, subjectKey, shown }: { city: CityForMap | null; subjectKey: string | null; shown: boolean }) {
  const paths = useCityArt(city, subjectKey);
  const texture = useCanvasTexture(MINI_PX, MINI_PX, false);
  const rig = useRef<Group>(null);
  const gate = useRedrawGate(1 / 3, 2, 8 * DEG);
  const at = useRef(new Vector3());
  const look = useRef(new Vector3());
  const headLocal = useRef(new Vector3());
  const lookLocal = useRef(new Vector3());
  const undo = useRef(new Matrix4());
  /** Where the map takes the head to be pointing, a moment behind it: yaw and pitch, radians, in the floor's space. */
  const aim = useRef<{ yaw: number; pitch: number } | null>(null);

  useFrame((state, delta) => {
    const group = rig.current;
    const parent = group?.parent;
    if (!group || !parent) return;
    group.visible = shown;
    const whole = paths.build();
    if (!shown || !city) {
      aim.current = null;
      return;
    }

    // Where it rides: in the floor's space, from the head and the body's (lagging) heading.
    state.camera.getWorldPosition(headLocal.current);
    parent.updateWorldMatrix(true, false);
    parent.worldToLocal(headLocal.current);
    state.camera.getWorldDirection(lookLocal.current);
    lookLocal.current.transformDirection(undo.current.copy(parent.matrixWorld).invert());
    const headYaw = Math.atan2(-lookLocal.current.x, -lookLocal.current.z);
    const headPitch = Math.asin(Math.max(-1, Math.min(1, lookLocal.current.y)));
    if (aim.current === null) aim.current = { yaw: headYaw, pitch: headPitch };
    const dYaw = Math.atan2(Math.sin(headYaw - aim.current.yaw), Math.cos(headYaw - aim.current.yaw));
    const share = 1 - Math.exp(-FOLLOW_PER_S * Math.min(delta, 0.1));
    aim.current.yaw += dYaw * share;
    aim.current.pitch += (headPitch - aim.current.pitch) * share;
    // Up and to the left of where the head points.
    const yaw = aim.current.yaw + MINI_LEFT_RAD;
    const pitch = Math.min(1.2, aim.current.pitch + MINI_UP_RAD);
    group.position.set(
      headLocal.current.x - Math.sin(yaw) * Math.cos(pitch) * MINI_DISTANCE_M,
      headLocal.current.y + Math.sin(pitch) * MINI_DISTANCE_M,
      headLocal.current.z - Math.cos(yaw) * Math.cos(pitch) * MINI_DISTANCE_M,
    );
    // Face the eyes.
    parent.localToWorld(headLocal.current);
    group.lookAt(headLocal.current);

    // The picture: ahead is up.
    if (!city) return;
    const you = readReader(state.camera, at.current, look.current);
    if (!gate(you.en, you.headingRad, state.clock.elapsedTime, `${subjectKey}:${whole}`)) return;
    const view = { width: MINI_PX, height: MINI_PX, centreEN: you.en, metresPerPx: MINI_METRES_PER_PX, upHeadingRad: you.headingRad };
    // The disc shows about 200 m either way; the squares within reach of it.
    const art = paths.art(you.en, 300);
    if (!art) return;
    paintTexture(texture, (ctx) => {
    drawMap(ctx, art, view, { you, landmarks: LANDMARKS, labelPx: 30 });
    // North, on the rim.
    const reach = MINI_PX / 2 - 34;
    const [nx, ny] = toPixel(view, [you.en[0], you.en[1] + reach * MINI_METRES_PER_PX]);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.beginPath();
    ctx.arc(nx, ny, 24, 0, Math.PI * 2);
    ctx.fillStyle = '#16181a';
    ctx.fill();
    ctx.fillStyle = '#ffffff';
    ctx.font = '700 28px system-ui, "Segoe UI", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('N', nx, ny + 1);
    ctx.textAlign = 'left';
    });
  });

  return (
    <group ref={rig} name="vr-mini-map" visible={false}>
      <mesh renderOrder={PANEL_RENDER_ORDER}>
        <circleGeometry args={[MINI_RADIUS_M + 0.006, 64]} />
        <meshBasicMaterial color={GLASS_EDGE} depthTest={false} transparent side={DoubleSide} />
      </mesh>
      <mesh renderOrder={PANEL_RENDER_ORDER + 1}>
        <circleGeometry args={[MINI_RADIUS_M, 64]} />
        <meshBasicMaterial map={texture} depthTest={false} transparent toneMapped={false} side={DoubleSide} />
      </mesh>
    </group>
  );
}

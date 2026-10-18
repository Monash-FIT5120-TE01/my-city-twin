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

import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useFrame } from '@react-three/fiber';
import { Container, Text } from '@react-three/uikit';
import { Picture } from './vrPicture';
import { DoubleSide, Matrix4, Vector3, type Group } from 'three';
import { canvasTexture, paintTexture } from './vrIcons';
import type { BuildingMassing, Development, PolygonEN, SearchableBuilding } from '../data/model';
import { worldToEnu } from './frame';
import { LANDMARKS } from './vrLandmarks';
import { artNear, drawBase, drawMap, drawMarks, startCityTiles, subjectPath, toPixel, type CityTiles } from './vrMapDraw';
import { Button } from './vrKit';
import { CONTROL_ORDER, EDGE, GLASS_EDGE, GREEN, GREEN_PRESSED, GREEN_SOFT, INK, INK_2, PAPER, PRESSED, SUNKEN } from './vrTokens';
import { PANEL_RENDER_ORDER } from './vrPointer';

export interface CityForMap {
  buildings: BuildingMassing[];
  /** One entry per building with an address: the list beside a spot pressed on the map. */
  searchable: SearchableBuilding[];
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
function useCityArt(city: CityForMap | null, subjectKey: string | null, buildingKey: string | null = null) {
  const made = city ? cityPaths(city) : null;
  // the one being looked at, filled in the subject's colour: a project's footprints, or a building's parts
  const subject = useMemo(() => {
    if (!made || !city) return null;
    if (buildingKey) {
      const footprints = city.buildings.filter((part) => part.parentId === buildingKey).flatMap((part) => part.footprint);
      return subjectPath([{ key: buildingKey, footprints }], buildingKey);
    }
    return subjectPath(made.footprints, subjectKey);
  }, [made, city, subjectKey, buildingKey]);
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
/** The list beside a spot pressed on the map reaches this far, metres. */
export const SPOT_REACH_M = 150;

/**
 * The map choosing a side of a building for the flat (ProjectDoc/vr-ui-redesign/flat-picker-tall.html):
 * the building large, a button round it for each side it has at the floor chosen, and a fan the way the
 * windows of the side chosen look.
 */
export interface MapSides {
  /** The building's middle, and how far across it is, metres. */
  centreEN: [number, number];
  sizeM: number;
  /** Each side; fits is null until known. */
  sides: { compass: string; midpointEN: [number, number]; bearingDeg: number; fits: boolean | null }[];
  chosen: string | null;
  onSide: (compass: string) => void;
}
/** Where the building sits in the frame choosing a side, mm from its top left; how wide it is drawn. */
const SIDES_AT: [number, number] = [FRAME_W / 2, 220];
const SIDES_BUILDING_MM = 150;
/** The side buttons, mm: their size, and how far from the building's middle they stand. */
const SIDE_W = 124;
const SIDE_H = 60;
const SIDE_RING_MM = 180;

/*
 * The city map, and the way into a place (ProjectDoc/vr-ui-redesign/map-first.html, 2026-10-19): pressing
 * the map drops a spot there — a ring, with a dashed circle as far as the list on the left reaches — and
 * the panel at the foot of the map (`footer`, from the menu) says what can be done with it. The building
 * chosen is filled in the subject's colour as well as pinned.
 *
 * WHERE THE PRESS LANDED: the press is taken on a clear sheet over the picture, whose UI library hands the
 * point on it back as a fraction across and down (uv); with the view it was drawn with, that is a place.
 */
export function MapCard({
  city,
  subject,
  buildingKey,
  spot,
  onSpot,
  shown,
  footer,
  sides = null,
}: {
  city: CityForMap | null;
  subject: MapSubject | null;
  /** A building standing today that is chosen: filled like the subject. */
  buildingKey: string | null;
  spot: [number, number] | null;
  onSpot: (en: [number, number]) => void;
  shown: boolean;
  /** What sits at the foot of the map: the spot's or the chosen building's actions. */
  footer: ReactNode;
  /** Choosing a side for the flat: the map is about that building, and presses go to the side buttons. */
  sides?: MapSides | null;
}) {
  const paths = useCityArt(city, subject?.key ?? null, buildingKey);
  const texture = useCanvasTexture(FRAME_W * DENSITY, FRAME_H * DENSITY, true);
  /*
   * The footprints are drawn once into a canvas of their own and only drawn
   * again when the map's centre or zoom changes; a redraw for the reader
   * turning copies that and puts the marks on top.
   */
  const base = useRef<{ canvas: HTMLCanvasElement; key: string } | null>(null);
  const [step, setStep] = useState(START_STEP);
  /*
   * Centred on the spot pressed, else the place chosen, so choosing shows where it is; the target button
   * centres on the reader instead until something else is chosen. Held with what it was pressed for, so a
   * new choice ends it without an effect to tidy up.
   */
  const focusKey = spot ? `${spot[0].toFixed(1)},${spot[1].toFixed(1)}` : (subject?.key ?? null);
  const [onMeFor, setOnMeFor] = useState<string | null | undefined>(undefined);
  const onMe = focusKey === null || onMeFor === focusKey;
  const gate = useRedrawGate(0.5, 3, 20 * DEG);
  const at = useRef(new Vector3());
  const look = useRef(new Vector3());
  /** The view last drawn: where a press on the picture lands. */
  const drawnView = useRef<{ centreEN: [number, number]; metresPerPx: number } | null>(null);

  useFrame((state) => {
    // Built while hidden too, so the map is ready when the card first shows.
    const whole = paths.build();
    if (!shown || !city) return;
    const you = readReader(state.camera, at.current, look.current);
    const fanSide = sides?.sides.find((side) => side.compass === sides.chosen && side.fits) ?? null;
    const sidesKey = sides ? `${sides.centreEN.join()}|${sides.sizeM}|${fanSide?.compass}|${fanSide?.midpointEN.join()}` : '';
    if (!gate(you.en, you.headingRad, state.clock.elapsedTime, `${step}:${focusKey}:${buildingKey}:${onMe}:${whole}:${sidesKey}`)) return;
    const { minE, minN, maxE, maxN } = city.extent;
    /*
     * The widest step frames the whole city; the others centre on the spot, the place, or the reader.
     * Choosing a side, the building fills the middle of the upper frame, clear of the panel at the foot.
     */
    const metresPerPx = sides ? Math.max(0.05, sides.sizeM / (SIDES_BUILDING_MM * DENSITY)) : ZOOM_STEPS[step];
    const centre: [number, number] = sides
      ? [sides.centreEN[0], sides.centreEN[1] - (FRAME_H / 2 - SIDES_AT[1]) * DENSITY * metresPerPx]
      : step === 0
        ? [(minE + maxE) / 2, (minN + maxN) / 2]
        : onMe
          ? you.en
          : (spot ?? subject?.en ?? you.en);
    const view = { width: FRAME_W * DENSITY, height: FRAME_H * DENSITY, centreEN: centre, metresPerPx, upHeadingRad: 0 };
    drawnView.current = { centreEN: centre, metresPerPx };
    // Drawn again once the city is all in: until then it holds what was built so far.
    const baseKey = `${metresPerPx.toFixed(3)}|${centre[0].toFixed(1)}|${centre[1].toFixed(1)}|${subject?.key}|${buildingKey}|${whole}`;
    if (!base.current || base.current.key !== baseKey) {
      const canvas = base.current?.canvas ?? document.createElement('canvas');
      canvas.width = view.width;
      canvas.height = view.height;
      const ctx = canvas.getContext('2d');
      // The whole city for the widest step; otherwise only what the view and a margin can reach.
      const drawn = paths.art(step === 0 && !sides ? null : centre, (Math.hypot(view.width, view.height) / 2) * metresPerPx);
      if (ctx && drawn) drawBase(ctx, drawn, view);
      base.current = { canvas, key: baseKey };
    }
    const layer = base.current.canvas;
    paintTexture(texture, (ctx) => {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.drawImage(layer, 0, 0);
      drawMarks(ctx, view, {
        you,
        landmarks: LANDMARKS,
        labelPx: 30,
        // choosing a side, the building is filled and has buttons round it: no pin over it
        pin: sides ? null : (subject?.en ?? null),
        spot: spot && !sides ? { en: spot, radiusM: SPOT_REACH_M } : null,
        fan: fanSide && sides ? { en: fanSide.midpointEN, bearingDeg: fanSide.bearingDeg, radiusM: sides.sizeM * 0.9 } : null,
      });
    });
  });

  return (
    <>
      <Container flexDirection="row" alignItems="center" justifyContent="space-between" flexShrink={0}>
        <Text fontSize={30} fontWeight="bold" color={INK}>
          {sides ? 'Which side?' : 'City map'}
        </Text>
        <Text fontSize={18} fontWeight="bold" color={INK_2}>
          N ^
        </Text>
      </Container>
      <Container width={FRAME_W} height={FRAME_H} borderRadius={28} overflow="hidden" positionType="relative" flexShrink={0}>
        <Picture texture={texture} width={FRAME_W} height={FRAME_H} radius={28} />
        {/* A clear sheet over the picture that takes the press, and says where on the picture it was. */}
        {!sides && <Container
          positionType="absolute"
          positionLeft={0}
          positionTop={0}
          width={FRAME_W}
          height={FRAME_H}
          zIndex={1}
          cursor="crosshair"
          pointerEventsOrder={CONTROL_ORDER}
          onClick={(event) => {
            event.stopPropagation();
            const uv = (event as unknown as { uv?: { x: number; y: number } }).uv;
            const view = drawnView.current;
            if (!uv || !view) return;
            // across from the left, down from the top; north is up the picture
            const dx = (uv.x - 0.5) * FRAME_W * DENSITY * view.metresPerPx;
            const dy = (0.5 - uv.y) * FRAME_H * DENSITY * view.metresPerPx;
            onSpot([view.centreEN[0] + dx, view.centreEN[1] + dy]);
          }}
        />}
        {/* Over the picture: without a z-index the picture, drawn later, covered their fill. */}
        {!sides && (
          <Container positionType="absolute" positionRight={14} positionTop={14} flexDirection="column" gap={8} zIndex={2}>
            <Button label="+" tone="quiet" height={56} onClick={() => setStep((s) => Math.min(ZOOM_STEPS.length - 1, s + 1))} />
            <Button label="-" tone="quiet" height={56} onClick={() => setStep((s) => Math.max(0, s - 1))} />
            <Button label="" icon="measure" tone="quiet" height={56} onClick={() => setOnMeFor(focusKey)} />
          </Container>
        )}
        {sides?.sides.map((side) => <SideButton key={side.compass} side={side} chosen={side.compass === sides.chosen} onSide={sides.onSide} />)}
        <Container
          positionType="absolute"
          positionLeft={14}
          positionRight={14}
          positionBottom={14}
          zIndex={2}
          flexDirection="row"
          alignItems="center"
          gap={10}
          paddingY={12}
          paddingLeft={20}
          paddingRight={12}
          borderRadius={24}
          backgroundColor={PAPER}
        >
          {footer}
        </Container>
      </Container>
    </>
  );
}

/*
 * One side of the building, as a button standing out from its middle the way the side faces: the
 * side's name, and "Not possible" under it where the flat does not fit there at this floor. Chosen is
 * filled green with white words; not possible is grey with grey words — the words say it, not the colour.
 */
function SideButton({
  side,
  chosen,
  onSide,
}: {
  side: MapSides['sides'][number];
  chosen: boolean;
  onSide: (compass: string) => void;
}) {
  const b = (side.bearingDeg * Math.PI) / 180;
  const x = SIDES_AT[0] + SIDE_RING_MM * Math.sin(b) - SIDE_W / 2;
  const y = SIDES_AT[1] - SIDE_RING_MM * Math.cos(b) - SIDE_H / 2;
  const nope = side.fits === false;
  const fill = chosen ? GREEN : nope ? SUNKEN : PAPER;
  const ink = chosen ? PAPER : nope ? INK_2 : GREEN;
  return (
    <Container
      positionType="absolute"
      positionLeft={x}
      positionTop={y}
      width={SIDE_W}
      height={SIDE_H}
      zIndex={2}
      flexDirection="column"
      alignItems="center"
      justifyContent="center"
      borderRadius={SIDE_H / 2}
      borderWidth={3}
      borderColor={chosen ? GREEN_PRESSED : nope ? EDGE : GREEN}
      backgroundColor={fill}
      hover={{ backgroundColor: chosen ? GREEN : nope ? PRESSED : GREEN_SOFT }}
      cursor="pointer"
      pointerEventsOrder={CONTROL_ORDER}
      onClick={(event) => {
        event.stopPropagation();
        onSide(side.compass);
      }}
    >
      <Text fontSize={18} fontWeight="bold" color={ink}>
        {side.compass}
      </Text>
      {nope && (
        <Text fontSize={18} color={ink}>
          Not possible
        </Text>
      )}
    </Container>
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

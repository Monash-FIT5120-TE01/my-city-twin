/*
 * ─────────────────────────────────────────────────────────────────────────
 * "GOING TO …" — WHAT THE HEADSET SHOWS WHILE A MOVE IS BEING PREPARED
 * ─────────────────────────────────────────────────────────────────────────
 *
 * WHY
 *   Choosing a place or standing in the street sets off work that can hold
 *   the page for a moment: the proposal's shape is built, the street and its
 *   trams are set up. On the headset (2026-10-09) the view simply froze, and
 *   a frozen view in a headset reads as something broken.
 *
 * HOW
 *   The move is not made when the button is pressed. This comes up first —
 *   the view dimmed around a white pill with a turning ring and the name of
 *   where they are going — and only after it has been drawn for a few frames
 *   is the move asked for. If the page then stalls, the headset keeps showing
 *   the last frame, and that frame says what is happening.
 *
 *   It goes once the move has landed (VrWalk's onPlaced) and it has been up
 *   for a short minimum, so a quick move does not flash it.
 *
 * WHERE
 *   Ahead of the eyes, a little low, at 1.2 m — placed where they were
 *   looking, not stuck to the head, which is uncomfortable in a headset. It
 *   is put back in front of them if they look well away, and after the move,
 *   which turns the player to face the place.
 *
 *   It belongs to the player's floor (rendered inside VrWalk's origin), so it
 *   travels with the move instead of being left behind at the old place.
 */

import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { BackSide, type Group, type Mesh, type MeshBasicMaterial, Vector3 } from 'three';
import { canvasTexture, paintTexture } from './vrIcons';
import { GREEN, INK, INK_2, PAPER, TRACK } from './vrTokens';
import { vrMark } from './vrMarks';

export interface VrLoading {
  /** Where they are going, e.g. "Going to 9-29 Swanston Street". ASCII or not: drawn on a canvas. */
  title: string;
  /** What is being waited for, e.g. "Loading the street". */
  detail: string;
  /** The move itself, asked for once the pill has been seen. */
  run: () => void;
}

/** Frames drawn with the pill up before the move is asked for. */
const SHOWN_FRAMES = 3;
/** Shortest time on screen, ms, so a quick move does not flash it. */
const AT_LEAST_MS = 400;
/** After the move lands, ms: the view clears over VrWalk's fade first. */
const AFTER_LANDING_MS = 250;
/** Gone however the move went, ms — a move that never lands must not leave it up. */
const AT_MOST_MS = 10_000;
const FADE_OUT_MS = 150;
/** How dark the rest of the view goes behind it: 0 is untouched, 1 is black. */
const DIM = 0.5;

const DISTANCE_M = 1.2;
const BELOW_M = 0.12;
/** Put back in front once the eyes are this far away from it, radians. */
const REPLACE_RAD = (35 * Math.PI) / 180;

/** The pill, metres; the canvas is drawn at PX_PER_M. */
const PILL_W = 0.6;
const PILL_H = 0.12;
const PX_PER_M = 2000;
const RING_R = 0.03;
const RING_W = 0.008;
const RING_X = -PILL_W / 2 + 0.018 + RING_R + RING_W / 2;
/** Turns a second. */
const RING_TURNS_S = 1.1;

/** Above everything, VrWalk's blink (10,000) included, so it shows through the move's dark too. */
const DIM_ORDER = 10_001;
const PILL_ORDER = 10_002;
const RING_ORDER = 10_003;

function drawPill(ctx: CanvasRenderingContext2D, title: string, detail: string) {
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = PAPER;
  ctx.beginPath();
  ctx.roundRect(0, 0, w, h, h / 2);
  ctx.fill();

  // The ring's track; the turning arc is a mesh of its own, over it.
  const cx = (RING_X + PILL_W / 2) * PX_PER_M;
  ctx.strokeStyle = TRACK;
  ctx.lineWidth = RING_W * PX_PER_M;
  ctx.beginPath();
  ctx.arc(cx, h / 2, RING_R * PX_PER_M, 0, Math.PI * 2);
  ctx.stroke();

  const left = cx + (RING_R + RING_W + 0.016) * PX_PER_M;
  const room = w - left - h * 0.4;
  ctx.textBaseline = 'alphabetic';
  // As large as fits: a long address is made smaller rather than cut off.
  let size = 62;
  ctx.font = `700 ${size}px Inter, "Segoe UI", system-ui, sans-serif`;
  while (size > 36 && ctx.measureText(title).width > room) {
    size -= 2;
    ctx.font = `700 ${size}px Inter, "Segoe UI", system-ui, sans-serif`;
  }
  ctx.fillStyle = INK;
  ctx.fillText(title, left, h / 2 - 4, room);
  ctx.font = `400 46px Inter, "Segoe UI", system-ui, sans-serif`;
  ctx.fillStyle = INK_2;
  ctx.fillText(`${detail}…`, left, h / 2 + 56, room);
}

/** Where one job is: frames drawn, when it came up, the moves landed when it ran, when one landed after. */
function fresh(job: VrLoading | null, since = 0) {
  return { job, frames: 0, since, ran: false, ranAt: 0, placedAtRun: 0, landedAt: 0, leavingAt: 0, place: true };
}

export function VrLoader({
  job,
  placed,
  onDone,
}: {
  job: VrLoading | null;
  /** VrWalk's count of moves landed. */
  placed: number;
  onDone: () => void;
}) {
  const rig = useRef<Group>(null);
  const dim = useRef<Mesh>(null);
  const pill = useRef<Mesh>(null);
  const ring = useRef<Mesh>(null);
  const texture = useMemo(() => canvasTexture(PILL_W * PX_PER_M, PILL_H * PX_PER_M, false), []);
  useEffect(() => () => texture.dispose(), [texture]);

  const state = useRef(fresh(null));
  const latestPlaced = useRef(placed);
  const head = useRef(new Vector3());
  const ahead = useRef(new Vector3());
  const toPill = useRef(new Vector3());

  useEffect(() => {
    latestPlaced.current = placed;
    // After the move the player faces somewhere new; the pill goes where they look.
    state.current.place = true;
  }, [placed]);

  useEffect(() => {
    if (job) paintTexture(texture, (ctx) => drawPill(ctx, job.title, job.detail));
  }, [job, texture]);

  useFrame((frame, delta) => {
    const group = rig.current;
    const parent = group?.parent;
    if (!group || !parent) return;
    group.visible = job !== null;
    if (!job) return;
    const now = performance.now();
    /*
     * A new job starts from nothing, here rather than in an effect: the frame
     * can run before the effect does, and the last job's finished state then
     * ended this one a few frames in.
     */
    if (state.current.job !== job) state.current = fresh(job, now);
    const s = state.current;

    // In the floor's space: the head, and where it looks along the ground.
    frame.camera.getWorldPosition(head.current);
    frame.camera.getWorldDirection(ahead.current);
    const eyes = head.current;
    const flat = ahead.current.setY(0);
    if (flat.lengthSq() < 1e-6) flat.set(0, 0, -1);
    flat.normalize();
    if (!s.place) {
      // Well away from where the eyes now point: put back in front.
      group.getWorldPosition(toPill.current).sub(eyes).setY(0);
      if (toPill.current.lengthSq() > 1e-6 && toPill.current.angleTo(flat) > REPLACE_RAD) s.place = true;
    }
    if (s.place) {
      const at = toPill.current.copy(eyes).addScaledVector(flat, DISTANCE_M);
      at.y -= BELOW_M;
      group.position.copy(parent.worldToLocal(at));
      group.lookAt(eyes);
      s.place = false;
    }
    // The dimming sphere is on the head, like VrWalk's blink.
    group.updateWorldMatrix(true, false);
    if (dim.current) dim.current.position.copy(group.worldToLocal(toPill.current.copy(eyes)));

    if (ring.current) ring.current.rotation.z -= delta * RING_TURNS_S * Math.PI * 2;

    s.frames += 1;
    if (!s.ran && s.frames >= SHOWN_FRAMES) {
      s.ran = true;
      s.placedAtRun = latestPlaced.current;
      s.ranAt = now;
      // For the ?vrdebug log (VrStallProbe): which move the stalls after this belong to.
      vrMark(`move asked: ${job.title}`);
      job.run();
    }
    if (s.ran && !s.landedAt && latestPlaced.current > s.placedAtRun) {
      s.landedAt = now;
      vrMark(`move landed ${(now - s.ranAt).toFixed(0)} ms after it was asked`);
    }
    const finished =
      (s.landedAt > 0 && now - s.landedAt >= AFTER_LANDING_MS && now - s.since >= AT_LEAST_MS) || now - s.since > AT_MOST_MS;
    if (finished && !s.leavingAt) {
      s.leavingAt = now;
      vrMark(`"${job.title}" taken away ${(now - s.since).toFixed(0)} ms after it came up`);
    }

    const shown = s.leavingAt ? Math.max(0, 1 - (now - s.leavingAt) / FADE_OUT_MS) : 1;
    if (dim.current) (dim.current.material as MeshBasicMaterial).opacity = DIM * shown;
    if (pill.current) (pill.current.material as MeshBasicMaterial).opacity = shown;
    if (ring.current) (ring.current.material as MeshBasicMaterial).opacity = shown;
    if (s.leavingAt && shown === 0) {
      group.visible = false;
      onDone();
    }
  });

  return (
    <group ref={rig} name="vr-loader" visible={false}>
      <mesh ref={dim} renderOrder={DIM_ORDER} frustumCulled={false}>
        <sphereGeometry args={[0.25, 16, 12]} />
        <meshBasicMaterial color="#000000" side={BackSide} transparent opacity={DIM} depthTest={false} depthWrite={false} />
      </mesh>
      <mesh ref={pill} renderOrder={PILL_ORDER} frustumCulled={false}>
        <planeGeometry args={[PILL_W, PILL_H]} />
        <meshBasicMaterial map={texture} transparent depthTest={false} depthWrite={false} toneMapped={false} />
      </mesh>
      <mesh ref={ring} position={[RING_X, 0, 0.001]} renderOrder={RING_ORDER} frustumCulled={false}>
        <ringGeometry args={[RING_R - RING_W / 2, RING_R + RING_W / 2, 48, 1, 0, Math.PI / 2]} />
        <meshBasicMaterial color={GREEN} transparent depthTest={false} depthWrite={false} toneMapped={false} />
      </mesh>
    </group>
  );
}

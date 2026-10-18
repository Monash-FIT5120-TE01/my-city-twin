/*
 * ─────────────────────────────────────────────────────────────────────────
 * STANDING IN THE STREET, IN A HEADSET
 * ─────────────────────────────────────────────────────────────────────────
 *
 * WHAT THIS IS
 *   Where the player is, in a headset, and how they move. It began as the VR
 *   half of the pedestrian view — StreetView is the same idea driven by a
 *   mouse and four keys — and now also puts the player on the platform over
 *   the city, carries them between the two in a fade (THE CUT, below), and
 *   hands the controller buttons that are not the laser's to the panel.
 *   Where each place is comes from vrPlacement.ts; this file only goes there.
 *
 * WHAT COMES FOR NOTHING, AND WHAT DOES NOT
 *   Looking around is free. WebXR drives the camera from the headset's own
 *   tracking, so all 360° of it — and leaning, and crouching to look up at a
 *   tower — need no code at all. This file does not touch the camera and must
 *   not: anything written to it is overwritten by the device before the frame
 *   is drawn, which looks like the code being ignored rather than like a rule
 *   being broken.
 *
 *   Moving is not free, and neither is being stopped by a wall.
 *
 * WHY THE STICKS ARE READ HERE RATHER THAN BY useXRControllerLocomotion
 *   The library ships a locomotion hook and this used to use it. Two things
 *   it cannot do, both of which were asked for:
 *
 *     Speed by deflection. It multiplies the raw axes by a single `speed`, so
 *     the fastest the stick can go is the only speed there is. A run at the
 *     gate and a walk short of it needs a curve — see paceFor.
 *
 *     Proportional turning. Its smooth mode reads the SIGN of the stick and
 *     nothing else (`(x < 0 ? -1 : 1) * delta * speed`), so a nudge turns at
 *     exactly the rate a shove does.
 *
 *   It also hands the same Vector3 back every frame and only writes to it
 *   when the stick has moved, so a frame that is purely a turn arrives
 *   carrying the last step — which drifted the player sideways every time
 *   they looked around. Reading the two sticks directly costs about fifteen
 *   lines and removes all three problems.
 *
 * WHERE IT SITS IN THE FRAME
 *   OUTSIDE <WorldFrame>, like the camera — so every position it states has
 *   to go through `enuToWorld`. It does not call that itself: every placement
 *   goes through `originFor` in vrPlacement.ts, which does, and
 *   frame-boundary.test.ts checks both files by name. Breaking it does not
 *   crash: it stands the player on their side, or underground.
 *
 * THE THREE PLACES A POSITION LIVES, WHICH ARE NOT THE SAME PLACE
 *   east/north    what the data is in, and what the walls are indexed in
 *   three.js      (east, up, −north) — what the renderer draws in
 *   the origin    the floor under the player, which is NOT the player
 *
 *   That last one is the whole difficulty. The app can only move the floor;
 *   the person is wherever they have walked to on it. Every question is asked
 *   of the head and every answer is applied to the floor. See vrLocomotion.ts.
 */

import { useEffect, useRef, type ReactNode } from 'react';
import { XROrigin, useXRInputSourceState } from '@react-three/xr';
import { useFrame } from '@react-three/fiber';
import { BackSide, Matrix4, Quaternion, Vector3, type Group, type Mesh, type MeshBasicMaterial } from 'three';
import { ride } from './streetscape/trams/ride';
import { slide, type ObstacleIndex } from './obstacles';
import { groundDirection, insideBounds, paceFor, turnAbout } from './vrLocomotion';
import { originFor, type VrPlacement } from './vrPlacement';
import { VrWristClock } from './VrWristClock';

/** Names from the standard mapping, the same on both controllers. */
const THUMBSTICK = 'xr-standard-thumbstick';
const SQUEEZE = 'xr-standard-squeeze';
const TRIGGER = 'xr-standard-trigger';
/** The tram layer puts a rider's eye this far above the tram's floor (StreetView's standing height). */
const RIDER_EYE_M = 1.7;

/**
 * How fast the view turns at full deflection, degrees per second.
 *
 * Smooth turning, at the reader's request, replacing a 30° snap. It is worth
 * being plain about the trade, because it is the one comfort decision in this
 * file that is not free: a continuously rotating view is the strongest known
 * trigger for simulator sickness — stronger than sliding — because there is
 * nothing a person can do with their head that matches it. A snap has no
 * motion to disagree with, which is exactly why it is the usual default.
 *
 * Given that it is smooth, the rate matters more, not less. 90°/s is brisk
 * enough to turn a corner without waiting and slow enough to follow: a right
 * angle takes a second. Faster than about 120°/s is where most people start
 * to feel it.
 */
const TURN_DEG_S = 90;

/**
 * The turning stick's floor, higher than the walking stick's.
 *
 * It is the one the thumb rests on while walking, and the world rotating
 * because somebody adjusted their grip is worse than the same nudge on the
 * other stick — a stray step is a step, a stray turn is the horizon moving.
 */
const TURN_DEAD_ZONE = 0.18;

/** The fastest a rider walks about inside a tram, m/s: a walk, whatever the stick says (a saloon is 2 m wide). */
const INSIDE_PACE_MS = 1.2;

/*
 * ── THE BUTTONS ──────────────────────────────────────────────────────────
 *
 * immersive-vr draws no DOM, so the page's controls are replaced by the
 * headset panel (VrPanel), which is pressed with the laser and the trigger —
 * the trigger belongs to the pointer library, not to this file. What is read
 * here are the buttons that work without aiming at anything:
 *
 *   A / B         the hour, forwards and back. This is the product. A view
 *                 of a shadow at one fixed moment is a photograph; being able
 *                 to move the sun while standing under it is what the headset
 *                 adds. It works with the panel put away.
 *   X             the panels, away or back in front of the eyes.
 *   right stick   left and right turn. Up and down scroll whatever list the
 *                 panel is showing; the panel reads that itself.
 *   grip          asks to leave. Held, not tapped — see below.
 */

/** Simulated minutes per real second, while A or B is held. */
const SCRUB_MINUTES_PER_S = 60;

/**
 * The step the hour moves in, matching the slider on the 2D page.
 *
 * Not one minute. The state lives in React, so every change re-renders the
 * app and recomputes the sun; at one-minute resolution a scrub would do that
 * sixty times a second. Ten is what the time bar already uses and what the
 * shadow sampling is quoted at, so the two interfaces cannot disagree about
 * what a moment is.
 */
const SCRUB_STEP_MIN = 10;

/**
 * How long a grip must be held to ask to leave, seconds.
 *
 * A tap would do it too often. The grip is squeezed by the act of holding
 * the controller at all, and leaving is not something to do by accident —
 * it ends the session, and getting back means finding a button on a page you
 * can no longer see. So a second of deliberate squeeze only ASKS: the panel
 * comes up with the same "Leave VR?" its own button gives, and nothing ends
 * until that is answered.
 */
const EXIT_HOLD_S = 1;

/**
 * The largest step one frame may take, seconds.
 *
 * A session that drops a frame badly — or a headset taken off and put back on
 * — hands back a delta of several seconds, and the player would cross the
 * city in one step, through walls, because a single step that long jumps
 * clean over them. The desktop view has the same guard for the same reason.
 */
const MAX_STEP_S = 0.1;

/**
 * How long the view takes to go dark, or to come back, when the player is
 * moved, milliseconds.
 *
 * Moving somebody is a cut, not a flight. Carrying a person three hundred
 * metres down from the platform to the footpath in a smooth glide is the
 * movement a headset is worst at — the eyes report a fall the inner ear does
 * not — and a fade to black and back is the established alternative: the
 * change happens while there is nothing to see. Short enough to feel like a
 * blink; long enough that it reads as deliberate rather than as a glitch.
 */
const FADE_MS = 200;

/**
 * The longest the view may be dark, ms, from the start of a move to the end
 * of it — the fade in included.
 *
 * Entering VR on the headset once went dark and stayed dark. The cause
 * turned out to be elsewhere (see SkyDome and VrPanel), but the fade was a
 * suspect because it was stepped by frame times, which on a device are not
 * the emulator's. It is timed by the clock now, and it cannot outlive this:
 * a move still waiting for the head's pose when the time is up is made anyway
 * and the view is cleared on the same frame, with no fade after it; and with
 * no move under way the view is never dark at all.
 */
const DARK_AT_MOST_MS = 1000;

/**
 * Frames to wait, dark, before a placement is applied.
 *
 * The head's pose arrives with the first rendered frame, not before it, so
 * placing the player on frame one reads a head at the origin's middle and
 * facing its forward — whichever way that is — and they land off target.
 * A few frames in the dark cost nothing anybody could see.
 */
const SETTLE_FRAMES = 3;

interface VrWalkProps {
  /**
   * Where to put the player, and which way to turn them. Applied when the
   * session starts and again whenever `trip` changes — not whenever this
   * object does, because it is recomputed on every render and a player who
   * had walked away would be pulled back each time the hour moved.
   */
  placement: VrPlacement;
  /**
   * In the street, the ground's height (terrain.ts): the floor follows it as the player walks, steps off a
   * tram or comes back from a ride. Absent over the roofs, where the floor is the platform's.
   */
  groundAt?: (east: number, north: number) => number;
  trip: number;
  /** How far from the model's centre the player may wander. */
  boundsCentreEN: [number, number];
  boundsRadiusM: number;
  /**
   * The fastest the stick walks, m/s, where running would be too much: inside the flat, whose rooms are a
   * few strides across. Absent in the street, where a full push runs.
   */
  paceCapMs?: number;
  /**
   * Everything solid at street level — the city as DRAWN. See obstacles.ts.
   * Null above the city, where the platform flies over the roofs.
   */
  obstacles: ObstacleIndex | null;
  /** The hour and the day, written as the rest of the interface writes them. */
  timeLabel: string;
  dateLabel: string;
  /**
   * Move the clock. Given whole minutes, already quantised to the step the
   * time bar uses; the caller clamps to the hours the simulation covers.
   */
  onNudgeMinutes: (minutes: number) => void;
  /** The grip, held: ask whether to leave. Ending the session is the panel's, once answered. */
  onAskToLeave: () => void;
  /** X on the left controller: call the panel up, or put it away. */
  onTogglePanel: () => void;
  /**
   * A move has landed: the player now stands where it put them. Anything
   * that measures where the player is — the panel's "nearest" list — should
   * measure after this, not after the move was merely asked for.
   */
  onPlaced: () => void;
  /**
   * Things that belong to the player's floor rather than to the city — the
   * panel and the platform. Rendered inside the origin, so they travel with
   * every move and turn the sticks make and stay where the player left them
   * when the player walks away physically.
   */
  children?: ReactNode;
}

export function VrWalk({
  placement,
  groundAt,
  trip,
  boundsCentreEN,
  boundsRadiusM,
  paceCapMs = Infinity,
  obstacles,
  timeLabel,
  dateLabel,
  onNudgeMinutes,
  onAskToLeave,
  onTogglePanel,
  onPlaced,
  children,
}: VrWalkProps) {
  const origin = useRef<Group>(null);
  /*
   * Reused rather than allocated. These run on every frame of a 90 Hz display
   * in both eyes; a new Vector3 each time is garbage the collector has to
   * come back for, and it comes back mid-frame.
   */
  const head = useRef(new Vector3());
  const step = useRef(new Vector3());
  const facing = useRef(new Quaternion());

  const left = useXRInputSourceState('controller', 'left');
  const right = useXRInputSourceState('controller', 'right');

  /*
   * Minutes asked for but not yet handed over.
   *
   * The clock moves in ten-minute steps and a frame is worth about one, so
   * most frames have nothing to report. Carrying the remainder here means the
   * scrub runs at the rate it says it does instead of being rounded to
   * nothing every frame and never moving at all.
   */
  const owed = useRef(0);
  // riding a tram (streetscape/trams/ride.ts): the triggers last frame, the tram's heading last frame, and
  // the floor's height on the ground to go back to
  const leftTriggerWas = useRef(false), rightTriggerWas = useRef(false);
  const rideHeading = useRef<number | null>(null), groundY = useRef<number | null>(null);
  const rayPose = useRef(new Matrix4()), rayDir = useRef(new Vector3());
  /** The laser handed to the tram layer every frame (ride.pointer): one object, rewritten. */
  const pointer = useRef<{ from: [number, number, number]; dir: [number, number, number] }>({ from: [0, 0, 0], dir: [0, 0, -1] });
  /** How long a grip has been squeezed, seconds. Reset the moment it is let go. */
  const squeezed = useRef(0);
  /** So one long squeeze leaves once, rather than every frame after a second. */
  const hasExited = useRef(false);

  /*
   * ── BEING MOVED ─────────────────────────────────────────────────────
   *
   * Imperatively, and NOT as a `position` prop. A prop is re-applied on
   * every render, and a render happens whenever the hour moves or a panel
   * opens — which would teleport the player back to where they started,
   * mid-stride, for reasons invisible from inside a headset. It is the same
   * trap the Canvas camera prop sets, and CameraRig's header explains it at
   * greater length.
   *
   * A move is asked for by changing `trip`. The placement it goes to is the
   * one current at that moment, held here until the view is dark enough to
   * make the cut unseen.
   *
   * The origin is the player's FEET, so it goes to the floor and not to eye
   * height. How tall they are is between them and the headset; a person who
   * is 1.55 m sees the city from 1.55 m, which is more honest than any
   * constant this file could pick.
   *
   * The session starts dark, with the first placement pending, so arriving
   * is the same fade-in as every later move.
   */
  const pending = useRef<VrPlacement | null>(placement);
  const settled = useRef(0);
  /** When the current move began going dark, and when the view began to clear, ms. */
  const darkSince = useRef<number | null>(null);
  const clearSince = useRef<number | null>(null);
  /** 1 is black. */
  const dark = useRef(1);
  const fade = useRef<Mesh>(null);
  const firstTrip = useRef(trip);

  useEffect(() => {
    // The mount is handled by the initial `pending`; only later trips move.
    if (trip === firstTrip.current) return;
    pending.current = placement;
    settled.current = 0;
    darkSince.current = null;
    // `placement` deliberately left out: it changes on every render, and
    // only a new trip is a request to move.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trip]);

  /** Whether X was down last frame, so one press toggles once. */
  const xWasDown = useRef(false);

  useFrame((state, rawDelta) => {
    const group = origin.current;
    if (!group) return;
    const delta = Math.min(rawDelta, MAX_STEP_S);

    /*
     * ── THE CUT ─────────────────────────────────────────────────────────
     *
     * Dark first, then moved, then light. The sphere sits on the head and
     * draws over everything, including the controllers, so the moment of the
     * move has nothing in it to see.
     */
    let eyes = state.camera.getWorldPosition(head.current);
    const target = pending.current;
    const now = performance.now();
    if (target) {
      darkSince.current ??= now;
      dark.current = Math.max(dark.current, Math.min(1, (now - darkSince.current) / FADE_MS));
      settled.current += 1;
      const ready = dark.current >= 1 && settled.current > SETTLE_FRAMES;
      const overdue = now - darkSince.current > DARK_AT_MOST_MS;
      if (ready || overdue) {
        state.camera.getWorldQuaternion(facing.current);
        const forward = step.current.set(0, 0, -1).applyQuaternion(facing.current);
        const next = originFor(
          target,
          {
            position: [group.position.x, group.position.y, group.position.z],
            yawRad: group.rotation.y,
          },
          [eyes.x, eyes.y, eyes.z],
          [forward.x, forward.y, forward.z],
        );
        group.position.set(...next.position);
        group.rotation.set(0, next.yawRad, 0);
        pending.current = null;
        /*
         * Read again, now that the floor has moved. The head was sampled
         * before the move; left at that sample, the veil stayed at the place
         * being left while this frame drew the place arrived at — one frame
         * of the destination with nothing over it, on every move. Reading
         * the world position refreshes the origin's matrix on the way.
         */
        eyes = state.camera.getWorldPosition(head.current);
        if (overdue) {
          // Out of time: clear now rather than fade, so the whole blackout
          // stays within DARK_AT_MOST_MS.
          dark.current = 0;
          clearSince.current = null;
        } else {
          clearSince.current = now;
        }
        darkSince.current = null;
        onPlaced();
      }
    } else if (clearSince.current !== null) {
      dark.current = Math.max(0, 1 - (now - clearSince.current) / FADE_MS);
      if (dark.current === 0) clearSince.current = null;
    } else {
      // Nothing moving and nothing clearing: never dark. See DARK_AT_MOST_MS.
      dark.current = 0;
    }
    const veil = fade.current;
    if (veil) {
      veil.visible = dark.current > 0;
      veil.position.copy(eyes);
      (veil.material as MeshBasicMaterial).opacity = dark.current;
    }
    // Nothing else while being moved: a step taken now would be measured
    // from where the player is about to stop being.
    if (target) return;

    /*
     * ── THE PANEL ───────────────────────────────────────────────────────
     *
     * On the press, not while held. X is the one face button left free: A
     * and B move the hour, and the grip is the way out.
     */
    const xDown = left?.gamepad?.['x-button']?.state === 'pressed';
    if (xDown && !xWasDown.current) onTogglePanel();
    xWasDown.current = xDown;

    /*
     * ── ASKING TO LEAVE ──────────────────────────────────────────────────
     *
     * Either grip. Whichever hand is free is the one that gets used, and
     * requiring a specific one means remembering which, from inside a
     * headset, with no label to read.
     */
    const gripping =
      left?.gamepad?.[SQUEEZE]?.state === 'pressed' ||
      right?.gamepad?.[SQUEEZE]?.state === 'pressed';
    if (gripping) {
      squeezed.current += delta;
      if (squeezed.current >= EXIT_HOLD_S && !hasExited.current) {
        hasExited.current = true;
        onAskToLeave();
      }
    } else {
      squeezed.current = 0;
      // Armed again, so a second hold works after coming back in.
      hasExited.current = false;
    }

    /*
     * ── THE HOUR ────────────────────────────────────────────────────────
     *
     * Held, not tapped: a shadow at 9 a.m. and a shadow at 3 p.m. are two
     * facts, and the thing worth seeing is the sweep between them.
     *
     * Both at once cancel, rather than one winning. Two buttons held is
     * somebody's hand closing on the controller, not a request.
     */
    const forward = right?.gamepad?.['a-button']?.state === 'pressed';
    const backward = right?.gamepad?.['b-button']?.state === 'pressed';
    const direction = Number(forward) - Number(backward);
    if (direction === 0) {
      // Dropped rather than banked. Held over, a long pause would spend
      // itself in one jump the next time the button was touched.
      owed.current = 0;
    } else {
      owed.current += direction * SCRUB_MINUTES_PER_S * delta;
      /*
       * Truncated towards zero, so the leftover keeps its sign and the
       * remainder carries correctly when scrubbing backwards. Math.floor
       * would bias every backward step by a whole ten minutes.
       */
      const steps = Math.trunc(owed.current / SCRUB_STEP_MIN);
      if (steps !== 0) {
        owed.current -= steps * SCRUB_STEP_MIN;
        onNudgeMinutes(steps * SCRUB_STEP_MIN);
      }
    }

    // Where the person actually is, which is the origin plus however far they
    // have physically walked across their room.
    const at = state.camera.getWorldPosition(head.current);

    /*
     * ── TRAMS (streetscape/trams) ───────────────────────────────────────
     *
     * A trigger pulled with the laser on a tram's door boards it; on a tram at a stop, it steps off. The laser
     * is handed over as a ray in world coordinates; the tram layer decides what it meant. The right hand's
     * laser (the left's when there is no right) is also handed over every frame, so a door it is on lights up
     * with a label saying the trigger boards: the light followed the head before, and said nothing (2026-10-16).
     */
    const laserOf = (hand: typeof left, out: { from: [number, number, number]; dir: [number, number, number] }) => {
      const frame = state.gl.xr.getFrame(), space = state.gl.xr.getReferenceSpace();
      const pose = hand?.inputSource && frame && space ? frame.getPose(hand.inputSource.targetRaySpace, space) : null;
      if (!pose) return false;
      rayPose.current.fromArray(pose.transform.matrix).premultiply(group.matrixWorld);
      const from = step.current.setFromMatrixPosition(rayPose.current), dir = rayDir.current.set(0, 0, -1).transformDirection(rayPose.current);
      out.from[0] = from.x; out.from[1] = from.y; out.from[2] = from.z; out.dir[0] = dir.x; out.dir[1] = dir.y; out.dir[2] = dir.z;
      return true;
    };
    ride.pointer = laserOf(right, pointer.current) || laserOf(left, pointer.current) ? pointer.current : null;
    for (const [hand, was] of [[left, leftTriggerWas], [right, rightTriggerWas]] as const) {
      const down = hand?.gamepad?.[TRIGGER]?.state === 'pressed';
      if (down && !was.current) {
        const ray = { from: [0, 0, 0] as [number, number, number], dir: [0, 0, -1] as [number, number, number] };
        if (laserOf(hand, ray)) ride.ray = ray;
      }
      was.current = down;
    }
    /*
     * The turning stick, as radians this frame (TURNING below): proportional, a nudge turns slowly, a shove
     * quickly. Rescaled so the dead zone is a floor rather than a step; negated, since pushing RIGHT turns
     * the view right and a positive turn about +y in three.js is to the left.
     */
    const turnAxis = right?.gamepad?.[THUMBSTICK]?.xAxis ?? 0;
    const turnBy = Math.abs(turnAxis) > TURN_DEAD_ZONE
      ? -Math.sign(turnAxis) * Math.min(1, (Math.abs(turnAxis) - TURN_DEAD_ZONE) / (1 - TURN_DEAD_ZONE)) * TURN_DEG_S * (Math.PI / 180) * delta
      : 0;
    const walkX = left?.gamepad?.[THUMBSTICK]?.xAxis ?? 0;
    const walkY = left?.gamepad?.[THUMBSTICK]?.yAxis ?? 0;

    /*
     * Riding: the floor goes with the tram, at the height of its floor, and turns as it turns, about the
     * head so a look out of the window stays one. The sticks work as on the ground: the turning stick turns
     * the rider, and the walking stick walks about inside, handed to the tram layer as a step east/north
     * (ride.move), which keeps it off the walls and seats. Back on the ground where the tram layer says.
     */
    if (ride.active && ride.eyeWorld) {
      groundY.current ??= group.position.y;
      const radians = (rideHeading.current !== null ? ride.heading - rideHeading.current : 0) + turnBy;
      if (radians) {
        const [x, z] = turnAbout([group.position.x, group.position.z], [at.x, at.z], radians);
        group.position.x = x; group.position.z = z; group.rotation.y += radians;
      }
      rideHeading.current = ride.heading;
      const pace = Math.min(paceFor(Math.hypot(walkX, walkY)), INSIDE_PACE_MS);
      if (pace > 0) {
        state.camera.getWorldQuaternion(facing.current);
        if (groundDirection(walkX, walkY, facing.current, step.current)) {
          const dE = step.current.x * pace * delta, dN = -step.current.z * pace * delta;
          ride.move = ride.move ? [ride.move[0] + dE, ride.move[1] + dN] : [dE, dN];
        }
      }
      group.position.x += ride.eyeWorld[0] - at.x;
      group.position.z += ride.eyeWorld[2] - at.z;
      group.position.y = ride.eyeWorld[1] - RIDER_EYE_M;   // the floor: the tram's, where the ground was
      return;
    }
    rideHeading.current = null;
    if (groundY.current !== null) { group.position.y = groundAt ? groundAt(at.x, -at.z) : groundY.current; groundY.current = null; }
    if (ride.stepOffWorld) {
      group.position.x += ride.stepOffWorld[0] - at.x;
      group.position.z += ride.stepOffWorld[2] - at.z;
      if (groundAt) group.position.y = groundAt(ride.stepOffWorld[0], -ride.stepOffWorld[2]);
      ride.stepOffWorld = null; ride.stepOff = null;
      return;
    }
    // under the head, every frame: walking for real across the room up a slope moves the floor too
    if (groundAt) group.position.y = groundAt(at.x, -at.z);

    /*
     * A tram that has come at the player since the last frame pushes them aside (ride.clearOf, as at a desk),
     * no further than the walls let it. Trams were not solid in a headset before (2026-10-16).
     */
    if (ride.blockerCount) {
      const e0 = at.x, n0 = -at.z, [e, n] = ride.clearOf(e0, n0);
      if (e !== e0 || n !== n0) {
        const [we, wn] = obstacles ? slide(obstacles, e0, n0, e, n) : [e, n];
        group.position.x += we - e0; group.position.z -= wn - n0; at.x += we - e0; at.z -= wn - n0;
      }
    }

    /*
     * ── TURNING ─────────────────────────────────────────────────────────
     *
     * Proportional: a nudge turns slowly, a shove turns quickly. Only the
     * horizontal axis turns — pitching the view is the neck's job, and doing
     * it in software is both unnecessary and a good way to make somebody ill.
     * The vertical axis of this stick turns the panel's pages instead (see
     * A PAGE OF THE LIST above).
     */
    if (turnBy !== 0) {
      const radians = turnBy;   // worked out above, before the tram (the same stick turns a rider)

      /*
       * About the head, not the origin. Turning the origin spins the player
       * around the middle of their ROOM, which swings anybody who has taken
       * a physical step or two through an arc they did not ask for. See
       * turnAbout.
       */
      const [x, z] = turnAbout([group.position.x, group.position.z], [at.x, at.z], radians);
      group.position.x = x;
      group.position.z = z;
      group.rotation.y += radians;
    }

    /*
     * ── WALKING ─────────────────────────────────────────────────────────
     *
     * Deflection decides speed, not just direction: a gentle push strolls, a
     * push to the gate runs. The curve is in paceFor, which keeps most of the
     * stick's travel below walking pace and puts the run where the hardware
     * has an edge you can feel.
     */
    const pace = Math.min(paceFor(Math.hypot(walkX, walkY)), paceCapMs);
    if (pace === 0) return;

    /*
     * Where the stick points, in the world, along the ground.
     *
     * THE WORLD QUATERNION, NOT `camera.quaternion`. This is the one mistake
     * in this file that a desktop can never show you.
     *
     *   @react-three/xr parents the XR camera to the origin group — literally
     *   `group.add(xrCamera)` in its XROrigin — so the camera's own
     *   quaternion is its orientation WITHIN the origin, and the stick
     *   rotation applied to `group.rotation.y` a few lines above is missing
     *   from it. Having turned right 90°, the view faced east and pushing
     *   forward still walked north; at 180° forward walked backwards.
     *
     *   Read from the world, the origin's rotation is included. It is also
     *   what the library's own locomotion helper does, by decomposing
     *   `camera.matrixWorld` — worth knowing, because it means this is the
     *   established reading and not a workaround. vrLocomotion.test.ts keeps
     *   the wrong reading as a counter-example so it cannot come back.
     *
     * Read AFTER the turn above deliberately: `getWorldQuaternion` refreshes
     * the ancestor matrices, so this picks up the rotation applied this same
     * frame rather than trailing it by one.
     */
    state.camera.getWorldQuaternion(facing.current);
    // False when the head is looking straight down and there is no
    // horizontal direction left to walk in. Standing still is the only
    // honest answer; guessing one would send the walker somewhere arbitrary.
    if (!groundDirection(walkX, walkY, facing.current, step.current)) return;

    /*
     * Into east/north, because that is the frame the walls are in. Converting
     * the head back here is far cheaper than converting 4,443 footprints the
     * other way, and it keeps the collision question in the same terms as the
     * data that answers it.
     */
    const fromE = at.x;
    const fromN = -at.z;
    const wantE = fromE + step.current.x * pace * delta;
    const wantN = fromN - step.current.z * pace * delta;

    // The same walls the desktop view meets, by the same swept test that
    // stops a fast step jumping clean over a thin one. It matters more here:
    // a run at 5.5 m/s covers 0.55 m in a capped frame.
    const [slidE, slidN] = obstacles
      ? slide(obstacles, fromE, fromN, wantE, wantN)
      : [wantE, wantN];
    // and not into a tram, no further than the walls let the push go
    const [pushE, pushN] = ride.blockerCount ? ride.clearOf(slidE, slidN) : [slidE, slidN];
    const [heldE, heldN] = obstacles && (pushE !== slidE || pushN !== slidN) ? slide(obstacles, slidE, slidN, pushE, pushN) : [pushE, pushN];
    const [nextE, nextN] = insideBounds([heldE, heldN], boundsCentreEN, boundsRadiusM);

    /*
     * Applied as a DIFFERENCE, not as a destination. The origin is not the
     * head — the gap between them is whatever physical walking the person has
     * done — so moving the origin TO the head's new position would yank them
     * by that gap on the first step.
     */
    group.position.x += nextE - fromE;
    group.position.z -= nextN - fromN;
    // and up or down with the street
    if (groundAt) group.position.y = groundAt(nextE, nextN);
  });

  return (
    <>
      <XROrigin ref={origin}>{children}</XROrigin>
      {/*
        The blink. A small sphere around the head, drawn from inside, last,
        and through everything — see "THE CUT" above.
      */}
      <mesh ref={fade} renderOrder={10_000} frustumCulled={false}>
        <sphereGeometry args={[0.3, 16, 12]} />
        <meshBasicMaterial
          color="#000000"
          side={BackSide}
          transparent
          opacity={1}
          depthTest={false}
          depthWrite={false}
        />
      </mesh>
      {/*
        On the walking hand, so the hour can be read without letting go of
        the buttons that change it.
      */}
      <VrWristClock controller={left} timeLabel={timeLabel} dateLabel={dateLabel} />
    </>
  );
}

/*
 * ─────────────────────────────────────────────────────────────────────────
 * STANDING IN THE STREET, IN A HEADSET
 * ─────────────────────────────────────────────────────────────────────────
 *
 * WHAT THIS IS
 *   The VR half of the pedestrian view. StreetView is the same idea driven by
 *   a mouse and four keys; this is the same idea with the looking done by a
 *   neck. See ProgramDoc/VR-implementation-plan.md for how the two were meant
 *   to arrive in that order, and why.
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
 *   OUTSIDE <WorldFrame>, like the camera — so every position it states goes
 *   through `enuToWorld`. The rule is in frame.ts and frame-boundary.test.ts
 *   checks this file by name. Breaking it does not crash: it stands the
 *   player on their side, or underground.
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

import { useEffect, useRef } from 'react';
import { XROrigin, useXRInputSourceState } from '@react-three/xr';
import { useFrame } from '@react-three/fiber';
import { Quaternion, Vector3, type Group } from 'three';
import { enuToWorld } from './frame';
import { slide, type ObstacleIndex } from './obstacles';
import { groundDirection, insideBounds, paceFor, turnAbout } from './vrLocomotion';
import { VrWristClock } from './VrWristClock';

/** Names from the standard mapping, the same on both controllers. */
const THUMBSTICK = 'xr-standard-thumbstick';
const SQUEEZE = 'xr-standard-squeeze';

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

/*
 * ── THE BUTTONS ──────────────────────────────────────────────────────────
 *
 * Nothing on the page can be reached from inside a headset: immersive-vr
 * draws no DOM, so the date field, the time bar and every panel are simply
 * gone. Whatever the controllers do is the entire interface.
 *
 * Two things, because two is what there is room to remember without a manual
 * and without being able to read one:
 *
 *   A / B     the hour, forwards and back. This is the product. A view of a
 *             shadow at one fixed moment is a photograph; being able to move
 *             the sun while standing under it is the thing the headset adds.
 *   grip      out. Held, not tapped — see below.
 *
 * The trigger is deliberately left alone. It is the button a hand rests on,
 * and there is nothing yet that should happen by accident.
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
 * How long a grip must be held to leave, seconds.
 *
 * A tap would do it too often. The grip is squeezed by the act of holding
 * the controller at all, and leaving is not something to do by accident —
 * it ends the session, and getting back means finding a button on a page you
 * can no longer see. A second of deliberate squeeze is unmistakable and
 * still faster than reaching for the controller's system button.
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

interface VrWalkProps {
  /** Where to put the player down, east/north metres. */
  startEN: [number, number];
  /** The ground under the whole model, metres AHD. */
  groundAhdM: number;
  /** How far from the model's centre the player may wander. */
  boundsCentreEN: [number, number];
  boundsRadiusM: number;
  /** Everything solid at street level — the city as DRAWN. See obstacles.ts. */
  obstacles: ObstacleIndex;
  /** The hour and the day, written as the rest of the interface writes them. */
  timeLabel: string;
  dateLabel: string;
  /**
   * Move the clock. Given whole minutes, already quantised to the step the
   * time bar uses; the caller clamps to the hours the simulation covers.
   */
  onNudgeMinutes: (minutes: number) => void;
  /** Leave the session — the grip, held. */
  onExit: () => void;
}

export function VrWalk({
  startEN,
  groundAhdM,
  boundsCentreEN,
  boundsRadiusM,
  obstacles,
  timeLabel,
  dateLabel,
  onNudgeMinutes,
  onExit,
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
  /** How long a grip has been squeezed, seconds. Reset the moment it is let go. */
  const squeezed = useRef(0);
  /** So one long squeeze leaves once, rather than every frame after a second. */
  const hasExited = useRef(false);

  /*
   * Put down once, imperatively.
   *
   * NOT as a `position` prop. A prop is re-applied on every render, and a
   * render happens whenever the hour moves or a panel opens — which would
   * teleport the player back to where they started, mid-stride, for reasons
   * invisible from inside a headset. It is the same trap the Canvas camera
   * prop sets, and CameraRig's header explains it at greater length.
   *
   * The origin is the player's FEET, so it goes to the ground and not to eye
   * height. How tall they are is between them and the headset; a person who
   * is 1.55 m sees the city from 1.55 m, which is more honest than any
   * constant this file could pick.
   */
  useEffect(() => {
    const group = origin.current;
    if (!group) return;
    const [x, y, z] = enuToWorld([startEN[0], startEN[1], groundAhdM]);
    group.position.set(x, y, z);
    group.rotation.set(0, 0, 0);
    // Once per session, like StreetView's entry. A live model refresh rebuilds
    // the start point, and re-running this would drag a player who had walked
    // halfway down Bourke Street back to the beginning.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useFrame((state, rawDelta) => {
    const group = origin.current;
    if (!group) return;
    const delta = Math.min(rawDelta, MAX_STEP_S);

    /*
     * ── OUT ─────────────────────────────────────────────────────────────
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
        onExit();
        return;
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
     * ── TURNING ─────────────────────────────────────────────────────────
     *
     * Proportional: a nudge turns slowly, a shove turns quickly. Only the
     * horizontal axis — pushing the turning stick forward does nothing,
     * because pitching the view is the neck's job and doing it in software
     * is both unnecessary and a good way to make somebody ill.
     */
    const turnAxis = right?.gamepad?.[THUMBSTICK]?.xAxis ?? 0;
    if (Math.abs(turnAxis) > TURN_DEAD_ZONE) {
      /*
       * Rescaled so the dead zone is a floor rather than a step. Without
       * this, the instant the stick crosses 0.18 the view jumps straight to
       * 18% of full rate, which is the discontinuity the dead zone existed
       * to remove.
       */
      const beyond = (Math.abs(turnAxis) - TURN_DEAD_ZONE) / (1 - TURN_DEAD_ZONE);
      /*
       * Negated: pushing the stick RIGHT should turn the view right, and a
       * positive rotation about +y in three.js turns to the left.
       */
      const radians =
        -Math.sign(turnAxis) * Math.min(1, beyond) * TURN_DEG_S * (Math.PI / 180) * delta;

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
    const walkX = left?.gamepad?.[THUMBSTICK]?.xAxis ?? 0;
    const walkY = left?.gamepad?.[THUMBSTICK]?.yAxis ?? 0;
    const pace = paceFor(Math.hypot(walkX, walkY));
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
    const [slidE, slidN] = slide(obstacles, fromE, fromN, wantE, wantN);
    const [nextE, nextN] = insideBounds([slidE, slidN], boundsCentreEN, boundsRadiusM);

    /*
     * Applied as a DIFFERENCE, not as a destination. The origin is not the
     * head — the gap between them is whatever physical walking the person has
     * done — so moving the origin TO the head's new position would yank them
     * by that gap on the first step.
     */
    group.position.x += nextE - fromE;
    group.position.z -= nextN - fromN;
  });

  return (
    <>
      <XROrigin ref={origin} />
      {/*
        On the walking hand, so the hour can be read without letting go of
        the buttons that change it.
      */}
      <VrWristClock controller={left} timeLabel={timeLabel} dateLabel={dateLabel} />
    </>
  );
}

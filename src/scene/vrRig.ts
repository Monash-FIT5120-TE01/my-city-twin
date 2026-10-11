/*
 * ─────────────────────────────────────────────────────────────────────────
 * WHERE A HEADSET PANEL STANDS, AND MOVING IT WITH THE BEAM
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Every panel — the map, the window, the time — is put in front of the
 * reader when it is called up, on an arc at the panel distance, the side
 * ones turned to face the head (see panelPose). After that it stays where
 * it is: it lives in the player's floor, so it travels with every move and
 * turn the sticks make, and stays put when the reader walks across the room.
 *
 * MOVING ONE
 *   The white bar under a panel, pointed at with the trigger held, carries
 *   the panel with the beam — the way a window is moved. The panel keeps the
 *   distance it had from the hand when it was picked up, the offset between
 *   where the beam met it and its centre, and how far it was turned from
 *   facing the head, so it neither jumps nor twists; it turns with the head
 *   as it goes. Letting go of the trigger leaves it
 *   there. Calling the panels up again (X, or Menu) puts them all back on
 *   the arc.
 *
 *   The beam is read from the controller itself every frame rather than from
 *   pointer events: once the beam leaves the bar — which it does the moment
 *   the panel lags a frame — the bar would stop hearing about it.
 */

import { useEffect, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { useXRInputSourceState } from '@react-three/xr';
import { Matrix4, Quaternion, Vector3, type Group } from 'three';
import { panelPose, yawFacing } from './vrPlacement';

/**
 * Frames to wait before a panel is first put in front of the eyes. The
 * head's pose only arrives with the first rendered frame; placed on frame
 * one, a panel is placed against a head at the floor's middle and appears at
 * the player's feet.
 */
const FIRST_PLACEMENT_FRAMES = 5;

const TRIGGER = 'xr-standard-trigger';

interface Grab {
  hand: 'left' | 'right';
  /** Set on the first frame of the grab. */
  distance: number | null;
  offset: Vector3;
  /** How far the panel was turned from facing the head when picked up; kept while it is carried. */
  turn: number;
}

export function usePanelRig({
  asideRad,
  summon,
  turnShare = 1,
  distanceM,
}: {
  asideRad: number;
  summon: number;
  turnShare?: number;
  /** How far ahead of the eyes it is put, metres; panelPose's own distance if not given. */
  distanceM?: number;
}) {
  const rig = useRef<Group>(null);
  const placeIn = useRef(FIRST_PLACEMENT_FRAMES);
  const grab = useRef<Grab | null>(null);
  const left = useXRInputSourceState('controller', 'left');
  const right = useXRInputSourceState('controller', 'right');

  const head = useRef(new Vector3());
  const facing = useRef(new Quaternion());
  const forward = useRef(new Vector3());
  const turn = useRef(new Quaternion());
  const ray = useRef(new Matrix4());
  const from = useRef(new Vector3());
  const dir = useRef(new Vector3());
  const at = useRef(new Vector3());
  const undo = useRef(new Matrix4());

  const firstSummon = useRef(summon);
  useEffect(() => {
    // The first placement is already counting down; later ones are at once.
    if (summon !== firstSummon.current) {
      placeIn.current = 1;
      grab.current = null;
    }
  }, [summon]);

  /** Start carrying the panel: the hand whose trigger is down now (the right, if both). */
  const startGrab = () => {
    const down = (hand: typeof left) => hand?.gamepad?.[TRIGGER]?.state === 'pressed';
    const hand = down(right) ? 'right' : down(left) ? 'left' : 'right';
    grab.current = { hand, distance: null, offset: new Vector3(), turn: 0 };
  };

  useFrame((state) => {
    const group = rig.current;
    const parent = group?.parent;
    if (!group || !parent) return;

    state.camera.getWorldPosition(head.current);
    parent.updateWorldMatrix(true, false);
    parent.worldToLocal(head.current);

    // ── Carried by the beam ──
    if (grab.current) {
      const hand = grab.current.hand === 'left' ? left : right;
      const pressed = hand?.gamepad?.[TRIGGER]?.state === 'pressed';
      const frame = state.gl.xr.getFrame();
      const space = state.gl.xr.getReferenceSpace();
      const pose = hand?.inputSource && frame && space ? frame.getPose(hand.inputSource.targetRaySpace, space) : null;
      if (!pressed || !pose) {
        grab.current = null;
        return;
      }
      // The pose is in the headset's reference space, which is the origin's own; brought into the panel's parent.
      const origin = state.gl.xr.getCamera().parent ?? parent;
      origin.updateWorldMatrix(true, false);
      ray.current.fromArray(pose.transform.matrix).premultiply(origin.matrixWorld);
      ray.current.premultiply(undo.current.copy(parent.matrixWorld).invert());
      from.current.setFromMatrixPosition(ray.current);
      dir.current.set(0, 0, -1).transformDirection(ray.current);

      if (grab.current.distance === null) {
        grab.current.distance = Math.max(0.3, from.current.distanceTo(group.position));
        at.current.copy(dir.current).multiplyScalar(grab.current.distance).add(from.current);
        grab.current.offset.copy(group.position).sub(at.current);
        const facingNow = yawFacing([group.position.x, group.position.y, group.position.z], [head.current.x, head.current.y, head.current.z]);
        grab.current.turn = Math.atan2(Math.sin(group.rotation.y - facingNow), Math.cos(group.rotation.y - facingNow));
      }
      at.current.copy(dir.current).multiplyScalar(grab.current.distance).add(from.current).add(grab.current.offset);
      group.position.copy(at.current);
      group.rotation.set(0, yawFacing([at.current.x, at.current.y, at.current.z], [head.current.x, head.current.y, head.current.z]) + grab.current.turn, 0);
      return;
    }

    // ── Put on the arc when called up ──
    if (placeIn.current === 0) return;
    if (--placeIn.current > 0) return;
    state.camera.getWorldQuaternion(facing.current);
    forward.current.set(0, 0, -1).applyQuaternion(facing.current);
    parent.getWorldQuaternion(turn.current).invert();
    forward.current.applyQuaternion(turn.current);
    const pose = panelPose(
      [head.current.x, head.current.y, head.current.z],
      [forward.current.x, forward.current.y, forward.current.z],
      asideRad,
      turnShare,
      distanceM,
    );
    group.position.set(...pose.position);
    group.rotation.set(0, pose.yawRad, 0);
  });

  return { rig, startGrab };
}

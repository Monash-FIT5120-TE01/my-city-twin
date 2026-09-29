import { describe, expect, it } from 'vitest';
import { Group, Quaternion, Vector3 } from 'three';
import {
  CITY_OVERLOOK_HEIGHT_M,
  PANEL_DISTANCE_M,
  PANEL_DROP_M,
  originFor,
  overlookFor,
  panelPose,
  streetPlacement,
  yawToward,
} from './vrPlacement';
import { enuToWorld, worldToEnu } from './frame';

/*
 * Checked the way the renderer will use them: rotate a real three.js group
 * by the yaw and see where its forward ends up. A sign error here puts
 * somebody down with their back to the building they chose, which no type
 * and no exception would ever report.
 */
function facingEN(yawRad: number): [number, number] {
  const group = new Group();
  group.rotation.y = yawRad;
  group.updateMatrixWorld();
  const forward = new Vector3(0, 0, -1).applyQuaternion(
    group.getWorldQuaternion(new Quaternion()),
  );
  const [east, north] = worldToEnu([forward.x, forward.y, forward.z]);
  return [east, north];
}

describe('yawToward', () => {
  it.each([
    ['north', [0, 1]],
    ['east', [1, 0]],
    ['south', [0, -1]],
    ['west', [-1, 0]],
    ['north-east', [1, 1]],
  ] as const)('turns forward to face %s', (_, direction) => {
    const [e, n] = facingEN(yawToward([10, 20], [10 + direction[0], 20 + direction[1]]));
    const length = Math.hypot(direction[0], direction[1]);
    expect(e).toBeCloseTo(direction[0] / length, 9);
    expect(n).toBeCloseTo(direction[1] / length, 9);
  });

  it('faces north when there is nowhere to face', () => {
    expect(yawToward([5, 5], [5, 5])).toBe(0);
  });

  it('agrees with the one conversion in frame.ts', () => {
    // Forward after the yaw, taken to three.js, should be the target
    // direction taken to three.js.
    const yaw = yawToward([0, 0], [3, -4]);
    const group = new Group();
    group.rotation.y = yaw;
    const forward = new Vector3(0, 0, -1).applyEuler(group.rotation);
    const [x, , z] = enuToWorld([3 / 5, -4 / 5, 0]);
    expect(forward.x).toBeCloseTo(x, 9);
    expect(forward.z).toBeCloseTo(z, 9);
  });
});

describe('overlookFor', () => {
  it('frames the whole city from high above, facing its centre', () => {
    const at = overlookFor([100, 200], null, 29.5);
    expect(at.floorAhdM).toBe(29.5 + CITY_OVERLOOK_HEIGHT_M);
    const [e, n] = facingEN(at.yawRad);
    const toward = [100 - at.en[0], 200 - at.en[1]];
    const length = Math.hypot(toward[0], toward[1]);
    expect(e).toBeCloseTo(toward[0] / length, 9);
    expect(n).toBeCloseTo(toward[1] / length, 9);
  });

  it('stands south-south-east of the subject, like the desktop view', () => {
    const at = overlookFor([0, 0], 100, 0);
    // Bearing 150°: east of the subject and further south than east.
    expect(at.en[0]).toBeGreaterThan(0);
    expect(at.en[1]).toBeLessThan(0);
    expect(Math.abs(at.en[1])).toBeGreaterThan(at.en[0]);
  });

  it('never puts the platform under the top of the subject', () => {
    for (const height of [5, 30, 120, 234, 300]) {
      const at = overlookFor([0, 0], height, 29.5);
      expect(at.floorAhdM).toBeGreaterThan(29.5 + height);
    }
  });

  it('stays close enough to read a small building and far enough to take in a tall one', () => {
    const small = overlookFor([0, 0], 12, 0);
    const tall = overlookFor([0, 0], 234, 0);
    expect(Math.hypot(...small.en)).toBeCloseTo(180, 6);
    expect(Math.hypot(...tall.en)).toBeGreaterThan(Math.hypot(...small.en));
    expect(Math.hypot(...tall.en)).toBeLessThanOrEqual(600);
  });
});

describe('streetPlacement', () => {
  it('stands on the ground and faces the subject', () => {
    const at = streetPlacement([0, -30], [0, 0], 29.5);
    expect(at.floorAhdM).toBe(29.5);
    const [e, n] = facingEN(at.yawRad);
    expect(e).toBeCloseTo(0, 9);
    expect(n).toBeCloseTo(1, 9);
  });
});

describe('panelPose', () => {
  it('puts the panel ahead of the eyes, a little low, facing back at them', () => {
    const pose = panelPose([0.2, 1.6, -0.1], [0, 0, -1]);
    expect(pose.position[0]).toBeCloseTo(0.2, 9);
    expect(pose.position[1]).toBeCloseTo(1.6 - PANEL_DROP_M, 9);
    expect(pose.position[2]).toBeCloseTo(-0.1 - PANEL_DISTANCE_M, 9);
    // The panel's face is its +Z; turned by the yaw it must point back at
    // the eyes, i.e. opposite to the heading.
    const face = new Vector3(0, 0, 1).applyAxisAngle(new Vector3(0, 1, 0), pose.yawRad);
    expect(face.z).toBeCloseTo(1, 9);
  });

  it('uses the heading only, not where the eyes are pitched', () => {
    const level = panelPose([0, 1.6, 0], [1, 0, 0]);
    const downcast = panelPose([0, 1.6, 0], [0.5, -0.8, 0]);
    expect(downcast.position[0]).toBeCloseTo(level.position[0], 9);
    expect(downcast.position[1]).toBeCloseTo(level.position[1], 9);
    expect(downcast.yawRad).toBeCloseTo(level.yawRad, 9);
  });

  it('still answers when the head points straight down', () => {
    const pose = panelPose([0, 1.6, 0], [0, -1, 0]);
    expect(Number.isFinite(pose.yawRad)).toBe(true);
    expect(pose.position[2]).toBeCloseTo(-PANEL_DISTANCE_M, 9);
  });
});

describe('originFor', () => {
  /*
   * Built as the renderer builds it: an origin group with the head as its
   * child, at some offset and turned some way within it — somebody who has
   * stepped across their room and turned their body before asking to move.
   */
  function rig(originAt: [number, number, number], originYaw: number, headLocal: [number, number, number], headLocalYaw: number) {
    const origin = new Group();
    origin.position.set(...originAt);
    origin.rotation.y = originYaw;
    const head = new Group();
    head.position.set(...headLocal);
    head.rotation.y = headLocalYaw;
    origin.add(head);
    origin.updateMatrixWorld(true);
    return { origin, head };
  }

  function headPose(head: Group) {
    head.parent!.updateMatrixWorld(true);
    const at = head.getWorldPosition(new Vector3());
    const forward = new Vector3(0, 0, -1).applyQuaternion(head.getWorldQuaternion(new Quaternion()));
    return { at, forward };
  }

  it.each([
    ['standing in the middle, facing forward', [0, 0, 0], 0, [0, 1.6, 0], 0],
    ['a step to the side', [5, 30, -2], 0.4, [0.8, 1.7, -0.5], 0],
    ['turned round in the room', [-40, 30, 12], -1.1, [-1.2, 1.5, 0.9], 2.3],
  ] as const)('puts the head on the target and facing the subject: %s', (_, at, yaw, local, localYaw) => {
    const { origin, head } = rig([...at], yaw, [...local], localYaw);
    const before = headPose(head);

    const placement = streetPlacement([120, -60], [120, 0], 29.5);
    const next = originFor(
      placement,
      { position: [origin.position.x, origin.position.y, origin.position.z], yawRad: origin.rotation.y },
      [before.at.x, before.at.y, before.at.z],
      [before.forward.x, before.forward.y, before.forward.z],
    );
    origin.position.set(...next.position);
    origin.rotation.y = next.yawRad;
    const after = headPose(head);

    const [tx, ty, tz] = enuToWorld([120, -60, 29.5]);
    expect(after.at.x).toBeCloseTo(tx, 6);
    expect(after.at.z).toBeCloseTo(tz, 6);
    // The floor is at the target height; the head stands on it at its own.
    expect(next.position[1]).toBeCloseTo(ty, 9);
    // Facing north, toward [120, 0].
    expect(after.forward.x).toBeCloseTo(0, 6);
    expect(-after.forward.z).toBeGreaterThan(0.99);
  });
});

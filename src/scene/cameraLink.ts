/*
 * The camera pose the comparison screen's two views share — see ViewLink.
 *
 * Kept apart from ViewLink.tsx so that file exports only a component (which
 * fast refresh needs), and so App can make one without importing the scene.
 */

import { Vector3 } from 'three';

/** The pose both views share. Changed in place; never React state. */
export interface CameraLink {
  position: Vector3;
  target: Vector3;
  /** Which view wrote last. */
  from: string;
  /** Bumped on every write, so a reader knows there is something new. */
  stamp: number;
  /**
   * The view being operated — the one a drag or a wheel last began in. Only
   * it writes; the other follows. Without an owner, both views write while
   * both are still gliding (OrbitControls damps after a drag), each
   * overwriting the other's pose before it is read, and the two drift apart.
   */
  owner: string;
  /** Records a new pose from view `from`, and returns the new counter. */
  write: (position: Vector3, target: Vector3, from: string) => number;
  /** Makes view `id` the one being operated. */
  claim: (id: string) => void;
}

/** A fresh link, before either view has written to it. */
export function createCameraLink(): CameraLink {
  const link: CameraLink = {
    position: new Vector3(),
    target: new Vector3(),
    from: '',
    stamp: 0,
    owner: '',
    write(position, target, from) {
      link.position.copy(position);
      link.target.copy(target);
      link.from = from;
      link.stamp += 1;
      return link.stamp;
    },
    claim(id) {
      link.owner = id;
    },
  };
  return link;
}

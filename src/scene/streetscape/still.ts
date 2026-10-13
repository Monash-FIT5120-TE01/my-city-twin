/*
 * ─────────────────────────────────────────────────────────────────────────
 * THE STREET STANDS STILL — SO ITS MATRICES ARE WORKED OUT ONCE
 * ─────────────────────────────────────────────────────────────────────────
 *
 * WHY
 *   three.js works out every object's place in the world again on every
 *   frame. The streetscape is about 3,600 objects (surfaces, signals,
 *   planters, lights, the cells of street furniture), and because the groups
 *   above it are re-placed each frame too, every one of them was multiplied
 *   out again each frame: about a sixth of a frame in the street
 *   (2026-10-14, the headset check's --profile), where nothing in it moves.
 *
 * HOW
 *   The parts built at load stop updating their own matrices, and the root
 *   walks into them only when its own place in the world has changed. What
 *   is added to the root afterwards — the trams, the crossing sounds, which
 *   do move — is updated as usual. Turning a part on and off by distance
 *   (lod.ts) changes visibility, not position, so it needs nothing from here.
 *
 *   Anything that moves a still part later must call `part.updateMatrix()`
 *   and then `root.updateMatrixWorld(true)` itself.
 */

import { Matrix4, type Object3D } from 'three';

/** Holds the root's current children still; returns the undo. */
export function keepStill(root: Object3D): () => void {
  const still = new Set<Object3D>(root.children);
  /** The objects switched off here, so the undo switches back only those. */
  const switched: Object3D[] = [];
  for (const part of still) {
    part.traverse((o) => {
      if (!o.matrixAutoUpdate) return;
      o.updateMatrix();
      o.matrixAutoUpdate = false;
      switched.push(o);
    });
  }
  const placedAt = new Matrix4();
  let placed = false;
  const own = root.updateMatrixWorld;

  root.updateMatrixWorld = function updateMatrixWorld(this: Object3D, force?: boolean) {
    if (this.matrixAutoUpdate) this.updateMatrix();
    if (this.matrixWorldNeedsUpdate || force) {
      if (this.parent === null) this.matrixWorld.copy(this.matrix);
      else this.matrixWorld.multiplyMatrices(this.parent.matrixWorld, this.matrix);
      this.matrixWorldNeedsUpdate = false;
    }
    // The groups above re-place themselves every frame, so `force` arrives every frame: whether the root
    // really moved is read from its matrix instead.
    const moved = !placed || !this.matrixWorld.equals(placedAt);
    if (moved) {
      placedAt.copy(this.matrixWorld);
      placed = true;
    }
    for (const child of this.children) {
      if (still.has(child)) {
        if (moved) child.updateMatrixWorld(true);
      } else {
        child.updateMatrixWorld(force || moved);
      }
    }
  };

  return () => {
    root.updateMatrixWorld = own;
    for (const o of switched) o.matrixAutoUpdate = true;
  };
}

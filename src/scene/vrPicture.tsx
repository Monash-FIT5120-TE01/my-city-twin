/*
 * ─────────────────────────────────────────────────────────────────────────
 * PICTURES ON THE HEADSET MENU, WITHOUT THE IMAGE COMPONENT
 * ─────────────────────────────────────────────────────────────────────────
 *
 * WHY NOT uikit's Image
 *   It was blamed for the headset going black on 2026-10-09 ("the image
 *   component can not have any children"). The real cause was the minifier
 *   giving two uikit classes the same name — see vite.config.ts and
 *   vrPanel-rules.test.ts — and the same had happened to Svg in September.
 *   Image itself would now work; this stays because it is simpler: one plate
 *   with a texture, cropped and rounded by its own geometry.
 *
 * WHAT INSTEAD
 *   uikit's Content, which is made to hold ordinary three.js objects, with a
 *   flat plate inside carrying the picture as its texture. Content lays the
 *   plate out like any other part of the menu, and gives it the menu's draw
 *   order and its "drawn over the city" setting.
 *
 *   The plate is the rounded rectangle itself (a ShapeGeometry), so corners
 *   are rounded without a mask, and its texture coordinates do the cropping
 *   an "object-fit: cover" would: a 3:2 photograph in a wider box shows its
 *   middle band, undistorted.
 *
 *   Not for anything inside a scrolling list: Content cuts off what scrolls
 *   out of view with clipping planes, which the renderer may not honour; the
 *   list's own parts are drawn from boxes instead.
 */

import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { Content } from '@react-three/uikit';
import { DataTexture, RGBAFormat, Shape, ShapeGeometry, type Mesh, type MeshBasicMaterial, type Texture } from 'three';

/**
 * Shown while a picture is still loading: one clear pixel. The material always
 * has a map, so its shader never has to be rebuilt when the real one arrives.
 */
const NOTHING_YET = new DataTexture(new Uint8Array([255, 255, 255, 0]), 1, 1, RGBAFormat);
NOTHING_YET.needsUpdate = true;

/** Frames a new plate stays hidden: Content places and scales it on a timer after it is added. */
const HIDDEN_FRAMES = 2;

/** A rounded rectangle centred on the origin, its texture coordinates covering the box with a picture of `aspect`. */
function pictureGeometry(width: number, height: number, radius: number, aspect: number | null): ShapeGeometry {
  /*
   * In metres, the size it will be drawn at. Content rescales whatever it is
   * given, so the units are its business — except for the frame or two before
   * it has, when a plate measured in millimetres was drawn 508 metres wide and
   * filled the headset with white.
   */
  const w = width / 2000;
  const h = height / 2000;
  const r = Math.max(0, Math.min(radius / 1000, w, h));
  const shape = new Shape();
  shape.moveTo(-w + r, -h);
  shape.lineTo(w - r, -h);
  if (r) shape.quadraticCurveTo(w, -h, w, -h + r);
  shape.lineTo(w, h - r);
  if (r) shape.quadraticCurveTo(w, h, w - r, h);
  shape.lineTo(-w + r, h);
  if (r) shape.quadraticCurveTo(-w, h, -w, h - r);
  shape.lineTo(-w, -h + r);
  if (r) shape.quadraticCurveTo(-w, -h, -w + r, -h);
  const geometry = new ShapeGeometry(shape, r ? 6 : 1);

  // Texture coordinates from position, then narrowed to the middle of the picture where the box is a different shape.
  const box = width / height;
  const W = w * 2;
  const H = h * 2;
  const sx = aspect && aspect > box ? box / aspect : 1;
  const sy = aspect && aspect < box ? aspect / box : 1;
  const position = geometry.getAttribute('position');
  const uv = geometry.getAttribute('uv');
  for (let i = 0; i < position.count; i++) {
    const u = (position.getX(i) + w) / W;
    const v = (position.getY(i) + h) / H;
    uv.setXY(i, 0.5 + (u - 0.5) * sx, 0.5 + (v - 0.5) * sy);
  }
  uv.needsUpdate = true;
  return geometry;
}

export function Picture({
  texture,
  width,
  height,
  radius = 0,
  aspect = null,
}: {
  texture: Texture | null | undefined;
  /** mm, as everything on the menu. */
  width: number;
  height: number;
  radius?: number;
  /** The picture's own width / height, to crop to the box; null to stretch it to fill. */
  aspect?: number | null;
}) {
  const geometry = useMemo(() => pictureGeometry(width, height, radius, aspect), [width, height, radius, aspect]);
  useEffect(() => () => geometry.dispose(), [geometry]);

  /*
   * One plate for the life of the picture, its texture swapped in place.
   * Replacing the plate when the picture changed (a tutorial page turned) gave
   * Content a new mesh to place and order, and for the frames before it had,
   * the headset flashed white.
   */
  const mesh = useRef<Mesh>(null);
  const material = useRef<MeshBasicMaterial>(null);
  useEffect(() => {
    if (material.current) material.current.map = texture ?? NOTHING_YET;
  }, [texture]);
  const shownAfter = useRef(HIDDEN_FRAMES);
  useFrame(() => {
    if (shownAfter.current > 0 && --shownAfter.current === 0 && mesh.current) mesh.current.visible = true;
  });

  return (
    <Content width={width} height={height} keepAspectRatio={false} depthWrite={false} flexShrink={0}>
      <mesh ref={mesh} geometry={geometry} visible={false}>
        <meshBasicMaterial ref={material} map={texture ?? NOTHING_YET} transparent toneMapped={false} />
      </mesh>
    </Content>
  );
}

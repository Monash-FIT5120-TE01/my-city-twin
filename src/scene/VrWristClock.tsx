/*
 * ─────────────────────────────────────────────────────────────────────────
 * THE ONLY THING YOU CAN READ IN A HEADSET
 * ─────────────────────────────────────────────────────────────────────────
 *
 * WHY IT HAS TO EXIST
 *   WebXR's `dom-overlay` is in practice an AR feature. In an immersive-vr
 *   session NO DOM IS DRAWN AT ALL — every panel, the time bar, the map
 *   credit, all 110 elements of the interface are simply absent. See §9 of
 *   ProgramDoc/VR-implementation-plan.md.
 *
 *   That is survivable for most of the interface and not for this. The
 *   controller buttons move the sun, and a control whose effect cannot be
 *   read is not a control: press a button, something changes somewhere in a
 *   city of 1,548 buildings, and there is no way to know what. Time is the
 *   one number the whole product is about.
 *
 * WHY IT IS ON THE WRIST AND NOT IN FRONT OF YOUR FACE
 *   Anything pinned to the head is in the way permanently and cannot be
 *   looked AT — it moves as your eyes reach it. It is also one of the more
 *   reliable ways to make somebody feel unwell, because it is the one thing
 *   in the scene that never responds to the head moving.
 *
 *   A watch is checked by choosing to check it, and ignored the rest of the
 *   time. It costs nothing when it is not wanted, which for a view whose
 *   subject is the city is most of the time.
 *
 * WHY THE TEXT IS PAINTED RATHER THAN TYPESET
 *   drei's <Text> would need a font, and troika fetches a default one from a
 *   CDN — an external request this app does not make, and one that would
 *   fail behind the same strictness that keeps the Mapbox token out of the
 *   bundle. A 2D canvas needs nothing, uses the fonts already on the device,
 *   and is the approach groundSurface.ts already takes for the same reason.
 *
 * COLOUR
 *   Near-white on near-black, separated by lightness alone at about 15:1.
 *   Nothing here is distinguished by hue, so it reads the same to any colour
 *   vision and through a lens that is not colour-accurate at the edges.
 */

import { useEffect, useMemo, useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import { CanvasTexture, LinearFilter, SRGBColorSpace, type Group, type Object3D } from 'three';

/** Pixels. Wide and short, because so is a line of text. */
const TEXTURE_W = 512;
const TEXTURE_H = 176;

/** Metres. About the size of a watch face, at the end of an arm. */
const PANEL_W = 0.1;
const PANEL_H = PANEL_W * (TEXTURE_H / TEXTURE_W);

/*
 * Where it sits relative to the grip, and which way it faces.
 *
 * Up the back of the hand and tilted towards the face, so that turning the
 * wrist over brings it into view — the gesture a person already makes to
 * check the time. These are the one part of this file that cannot be got
 * right without a headset on; they are a considered starting point, not a
 * measurement.
 */
const OFFSET: [number, number, number] = [0, 0.035, 0.055];
const TILT: [number, number, number] = [-Math.PI / 2.6, 0, 0];

function paint(canvas: HTMLCanvasElement, line: string, under: string): void {
  const context = canvas.getContext('2d');
  if (!context) return;

  context.clearRect(0, 0, TEXTURE_W, TEXTURE_H);

  // The plate. Rounded, so it reads as an object rather than as a decal.
  context.fillStyle = 'rgba(18, 20, 22, 0.88)';
  context.beginPath();
  context.roundRect(0, 0, TEXTURE_W, TEXTURE_H, 34);
  context.fill();

  context.textAlign = 'center';

  context.fillStyle = '#f4f3f0';
  context.font = '600 74px system-ui, sans-serif';
  context.fillText(line, TEXTURE_W / 2, 92);

  context.fillStyle = '#c3c7cc';
  context.font = '400 34px system-ui, sans-serif';
  context.fillText(under, TEXTURE_W / 2, 140);
}

export function VrWristClock({
  /** The controller to ride on. Undefined while it is asleep or absent. */
  controller,
  /** The hour, as the rest of the interface writes it. */
  timeLabel,
  /** The day, likewise. */
  dateLabel,
}: {
  controller: { object?: Object3D } | undefined;
  timeLabel: string;
  dateLabel: string;
}) {
  const rig = useRef<Group>(null);

  const { canvas, texture } = useMemo(() => {
    const element = document.createElement('canvas');
    element.width = TEXTURE_W;
    element.height = TEXTURE_H;
    const made = new CanvasTexture(element);
    made.colorSpace = SRGBColorSpace;
    // Seen at a steep angle from close up; the default mipmapping turns
    // small text to mush well before the panel is edge-on.
    made.minFilter = LinearFilter;
    made.magFilter = LinearFilter;
    made.generateMipmaps = false;
    return { canvas: element, texture: made };
  }, []);

  // Repainted only when the words change — which is a few times a second
  // while the time is being scrubbed, and never otherwise.
  useEffect(() => {
    paint(canvas, timeLabel, dateLabel);
    /*
     * The flag IS the API. A CanvasTexture has no way to be told its canvas
     * changed other than by setting this, and there is nothing to replace it
     * with: building a new texture every time the minute changes would
     * upload a fresh image to the GPU several times a second and leak the
     * old one. StreetView carries the same exemption for the same reason —
     * a renderer is mutable, and pretending otherwise costs more than it
     * protects.
     */
    // oxlint-disable-next-line react/immutability
    texture.needsUpdate = true;
  }, [canvas, texture, timeLabel, dateLabel]);

  // Built once and never rebuilt, so it has to be disposed by hand.
  useEffect(() => () => texture.dispose(), [texture]);

  /*
   * Follows the controller by copying its world transform rather than by
   * being parented to it.
   *
   * The controller's Object3D is created and destroyed by the library as the
   * device is picked up and put down. Adding children to something with that
   * lifetime means they disappear with it and do not come back; copying a
   * matrix has no such relationship, and simply stops updating.
   */
  useFrame(() => {
    const group = rig.current;
    if (!group) return;
    const object = controller?.object;
    if (!object) {
      // Hidden rather than left behind at the last place the hand was.
      group.visible = false;
      return;
    }
    group.visible = true;
    object.updateWorldMatrix(true, false);
    group.position.setFromMatrixPosition(object.matrixWorld);
    group.quaternion.setFromRotationMatrix(object.matrixWorld);
  });

  return (
    <group ref={rig} visible={false}>
      <mesh position={OFFSET} rotation={TILT} raycast={() => null}>
        <planeGeometry args={[PANEL_W, PANEL_H]} />
        {/*
          Unlit and never tone-mapped: it is an instrument, not part of the
          city, and it has to be as readable at midnight as at noon. Lit, it
          would go dark exactly when the reader most wants to know the hour.
        */}
        <meshBasicMaterial map={texture} transparent toneMapped={false} />
      </mesh>
    </group>
  );
}

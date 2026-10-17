// oxlint-disable react/immutability -- a camera controller mutates the camera;
// that is what one is. OrbitControls and CameraRig do the same, and the
// alternative is copying it into state and writing it back a frame late.
/*
 * ─────────────────────────────────────────────────────────────────────────
 * STANDING IN THE STREET
 * ─────────────────────────────────────────────────────────────────────────
 *
 * WHAT THIS IS
 *   The city at eye height, walked rather than orbited. It is the desktop
 *   half of the VR work — see ProgramDoc/VR-implementation-plan.md — and
 *   deliberately built first, because everything that makes a street-level
 *   view hard is hard on a monitor too: the shadow resolution, the near
 *   plane, the scale of a person against a tower. None of that needs a
 *   headset to find out.
 *
 * WHY IT IS WORTH HAVING ON ITS OWN
 *   The whole product is an argument about what a shadow does to a footpath.
 *   Seen from two kilometres up that is a grey shape on a diagram; seen from
 *   the footpath it is the thing itself. A resident asking whether their
 *   street loses its afternoon sun is asking a question at eye height.
 *
 * WHERE IT SITS IN THE FRAME
 *   The camera lives OUTSIDE <WorldFrame>, so every position handed to it
 *   goes through `enuToWorld` — the rule in frame.ts. Getting that wrong
 *   here puts the walker underground or on their side.
 *
 * WALLS ARE SOLID
 *   Walking through a tower was the first thing that broke the illusion. The
 *   footprints are indexed into a coarse grid — see obstacles.ts — so the
 *   check costs a handful of point-in-polygon tests a frame rather than four
 *   thousand, and a blocked move slides along the wall instead of stopping
 *   dead.
 *
 *   The walker has width and the step is swept. Testing only where a step
 *   ends misses any wall thinner than the step itself, and a body radius of
 *   zero lets the eye reach a wall exactly — at which point the wall crosses
 *   the 0.3 m near plane and vanishes while the test still says the way is
 *   clear.
 *
 *   What is solid is the city as DRAWN, which is not the city as stored:
 *   see the index built in SceneCanvas. Only the parts that exist at
 *   standing height count. A roof plane forty
 *   metres up is not something a person on the pavement can walk into, and
 *   treating it as one would wall off arcades that are genuinely open.
 */

import { useEffect, useMemo, useRef } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { PointerLockControls } from '@react-three/drei';
import { Euler, Vector3 } from 'three';
import { enuToWorld } from './frame';
import { slide, type ObstacleIndex } from './obstacles';
import { ride } from './streetscape/trams/ride';
import { touchWalk, walksByTouch } from './touchWalk';
import { walkPace } from './walkPace';
import { groundAt, type Ground } from './terrain';

/** Standing height, metres. */
export const EYE_HEIGHT_M = 1.7;

/*
 * Walking pace, and a way to hurry: walkPace.ts.
 *
 * 1.4 m/s is what a person actually does, and every walk starts there. It
 * was 3.6 to make crossing the grid bearable, and that is the wrong trade:
 * moving faster than a body can move is one of the things that made the
 * street read as a camera flying through a model rather than as somewhere
 * you are standing. Crossing the city quickly is a convenience, so it is
 * something you ask for — the wheel, or a key you have to hold.
 */
/**
 * How much wheel makes one step of pace. A mouse notch is about 100; a
 * trackpad sends a stream of small deltas, and stepping on each of them
 * would run through every pace in one stroke.
 */
const WHEEL_STEP = 100;
/** On a phone, a full push of the stick: a brisk walk, as there is no key to hurry with. */
const TOUCH_WALK_MS = 2.5;
/** Radians the view turns per pixel dragged. */
const TOUCH_TURN = 0.005;

/**
 * A jump: about half a metre, which is what a person standing still manages.
 * Only height — nothing is climbed onto and no wall is cleared, because the
 * walls (obstacles.ts) are tested at standing height whatever the eye does.
 */
const GRAVITY_MS2 = 9.8;
const JUMP_M = 0.5;
const JUMP_MS = Math.sqrt(2 * GRAVITY_MS2 * JUMP_M);

/**
 * A wider lens for walking.
 *
 * The orbiting view uses 30° because the design's high obliques want little
 * perspective distortion. At eye height that is a telephoto: it strips out
 * the peripheral vision that tells you a wall is beside you, and a street
 * seen through it feels like a corridor viewed down a tube.
 */
const WALK_FOV = 55;

/**
 * The largest step one frame may take.
 *
 * A tab left in the background hands back a delta of several seconds, and
 * the walker would cross the city — through walls, because a single step
 * that long jumps clean over them.
 */
const MAX_STEP_S = 0.1;

/**
 * The near plane while walking.
 *
 * The orbiting camera uses 5 m, which is fine two kilometres up and useless
 * on a footpath — at eye height it clips the ground you are standing on and
 * the wall beside you. It has to come in, and it costs depth precision to do
 * it, which is why the far plane comes in at the same time: the sky dome is
 * 7.8 km and nothing needs to be drawn past it.
 */
const WALK_NEAR = 0.3;
const WALK_FAR = 12000;

/** World up (y), the axis a tram's turn turns the rider's view about. */
const UP = new Vector3(0, 1, 0);


interface StreetViewProps {
  /** Where to stand, east/north metres. */
  startEN: [number, number];
  /** The ground under the whole model, metres AHD. */
  /** The ground (terrain.ts): the eye is held this far above it where the walker stands. Flat in the flat. */
  groundAhdM: Ground;
  /** How far from the model's centre the walker may wander. */
  boundsCentreEN: [number, number];
  boundsRadiusM: number;
  /** Everything solid at street level. */
  obstacles: ObstacleIndex;
  /** Called when the pointer lock ends — Escape, or clicking away. */
  onExit: () => void;
  /**
   * Out on the street, or inside the flat (room/). In the flat there are no trams to board or be pushed
   * by, and no running: the pace stops at a brisk walk.
   */
  place?: 'street' | 'room';
  /** Which way to face on entry, east/north; otherwise the way the camera already faces, levelled. */
  startFacingEN?: [number, number];
}

/** The fastest pace inside the flat, m/s: a brisk walk, whatever the wheel says. */
const ROOM_MAX_MS = 1.4;

export function StreetView({
  startEN,
  groundAhdM,
  boundsCentreEN,
  boundsRadiusM,
  obstacles,
  onExit,
  place = 'street',
  startFacingEN,
}: StreetViewProps) {
  const inRoom = place === 'room';
  const camera = useThree((state) => state.camera);
  const gl = useThree((state) => state.gl);
  const held = useRef(new Set<string>());
  /** A phone or tablet: the stick and a drag instead of keys and a locked pointer (touchWalk.ts). */
  const touch = useMemo(() => walksByTouch(), []);
  const forward = useRef(new Vector3());
  const sideways = useRef(new Vector3());
  /** The tram's heading last frame while riding, so the view turns with it; null on foot. */
  const rideHeading = useRef<number | null>(null);
  /** Height of the eye above standing height, and how fast it is rising (m, m/s); zero on the ground. */
  const lift = useRef({ height: 0, rise: 0 });
  /** Space pressed and not yet taken by a frame. */
  const jumpAsked = useRef(false);

  /*
   * Down into the street on entry, and back where we came from on the way
   * out.
   *
   * Putting the view back matters more than it sounds. Leaving the camera at
   * eye height and handing it to OrbitControls, whose minimum orbit is 120 m,
   * strands the reader inside a building looking at the inside of a wall with
   * no obvious way to recover. The exit has to return the view it borrowed.
   */
  useEffect(() => {
    const perspective = camera as typeof camera & { near: number; far: number; fov: number };
    const before = {
      position: camera.position.clone(),
      quaternion: camera.quaternion.clone(),
      near: perspective.near,
      far: perspective.far,
      fov: perspective.fov,
    };

    /*
     * Outside, whatever was asked for. The entry point is the measured spot
     * when there is one and the building the screen is about when there is
     * not — and that second case starts the walker inside it, where solid
     * walls now also keep them.
     */
    const [x, y, z] = enuToWorld([startEN[0], startEN[1], groundAt(groundAhdM, startEN[0], startEN[1]) + EYE_HEIGHT_M]);
    camera.position.set(x, y, z);

    /*
     * Level the view without turning it.
     *
     * This used to rebuild the direction from `rotation.y` with a sine and a
     * cosine, and got the sign wrong: a heading of +60° came back as −60°,
     * so entering the street span you round to face the opposite side of it.
     * Flattening the direction the camera already has cannot introduce that
     * error, and `rotation.y` is not a heading for a pitched camera anyway.
     */
    const facing = new Vector3();
    if (startFacingEN) facing.set(startFacingEN[0], 0, -startFacingEN[1]);
    else camera.getWorldDirection(facing);
    facing.y = 0;
    if (facing.lengthSq() < 1e-6) facing.set(0, 0, -1);
    facing.normalize();
    camera.lookAt(x + facing.x, y, z + facing.z);

    perspective.near = WALK_NEAR;
    perspective.far = WALK_FAR;
    perspective.fov = WALK_FOV;
    perspective.updateProjectionMatrix();

    return () => {
      camera.position.copy(before.position);
      camera.quaternion.copy(before.quaternion);
      perspective.near = before.near;
      perspective.far = before.far;
      perspective.fov = before.fov;
      perspective.updateProjectionMatrix();
    };
    // Once per session. Keyed on the camera alone: a live model refresh
    // rebuilds the obstacle index and the entry point, and re-running this
    // teleported a walker who had already walked away back to the start.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [camera]);

  useEffect(() => {
    // Captured, not read through the ref in the cleanup: by the time the
    // cleanup runs the ref may point somewhere else, and the set that would
    // be cleared is not the set the listeners were filling.
    const keys = held.current;
    const down = (event: KeyboardEvent) => {
      keys.add(event.code);
      if (event.code === 'Space') {
        /*
         * Space is also the browser's own key: it presses whatever button has
         * focus — which, just after entering, is the "Stand here" that was
         * clicked — and scrolls the page. Down here it is only a jump.
         */
        event.preventDefault();
        if (!event.repeat) jumpAsked.current = true;
      }
    };
    const up = (event: KeyboardEvent) => keys.delete(event.code);
    // Held keys must not survive the tab losing focus, or the walker keeps
    // going while nobody is pressing anything.
    const clear = () => keys.clear();

    const escape = (event: KeyboardEvent) => {
      /*
       * The way out cannot depend on the pointer lock.
       *
       * drei requests the lock on a later click, not on mount, and the
       * browser can refuse it outright. Relying on `onUnlock` meant that
       * entering by keyboard, or having the request denied, hid the entire
       * interface with no way back: no unlock event ever arrives, and
       * Escape was only being read by focus mode.
       */
      if (event.key === 'Escape') onExit();
    };

    window.addEventListener('keydown', escape);
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    window.addEventListener('blur', clear);
    return () => {
      window.removeEventListener('keydown', escape);
      window.removeEventListener('keydown', down);
      window.removeEventListener('keyup', up);
      window.removeEventListener('blur', clear);
      keys.clear();
    };
  }, [onExit]);

  /*
   * The wheel sets the pace on a desktop: away from you is faster. Every
   * walk starts at a person's pace (walkPace.ts). The orbit controls that
   * own the wheel from above are off while walking (SceneCanvas).
   */
  useEffect(() => {
    if (touch) return;
    walkPace.reset();
    let banked = 0;
    const wheel = (event: WheelEvent) => {
      // a line or a page of scrolling, as some mice report it, counts as a notch
      banked += event.deltaMode === 0 ? event.deltaY : Math.sign(event.deltaY) * WHEEL_STEP;
      while (Math.abs(banked) >= WHEEL_STEP) {
        walkPace.step(banked < 0 ? 1 : -1);
        banked -= Math.sign(banked) * WHEEL_STEP;
      }
    };
    window.addEventListener('wheel', wheel, { passive: true });
    return () => window.removeEventListener('wheel', wheel);
  }, [touch]);

  /*
   * Looking round by touch: a drag on the city turns the view (left and right, and up and down within
   * reason). A touch that hardly moves and lets go quickly is a tap: it is handed to the trams as a point on
   * the screen (a tram door boards it). The stick is not part of the city, so its touches never get here.
   */
  useEffect(() => {
    if (!touch) return;
    const el = gl.domElement, look = new Euler(0, 0, 0, 'YXZ');
    let id: number | null = null, lastX = 0, lastY = 0, moved = 0, since = 0;
    const down = (e: PointerEvent) => {
      if (e.pointerType === 'mouse' || id !== null) return;
      // the input's own time, not when this runs: on a busy phone the two can be most of a second apart
      id = e.pointerId; lastX = e.clientX; lastY = e.clientY; moved = 0; since = e.timeStamp;
    };
    const move = (e: PointerEvent) => {
      if (e.pointerId !== id) return;
      const dx = e.clientX - lastX, dy = e.clientY - lastY; lastX = e.clientX; lastY = e.clientY; moved += Math.abs(dx) + Math.abs(dy);
      look.setFromQuaternion(camera.quaternion);
      look.y += dx * TOUCH_TURN; look.x = Math.max(-1.3, Math.min(1.3, look.x + dy * TOUCH_TURN));
      camera.quaternion.setFromEuler(look);
    };
    const up = (e: PointerEvent) => {
      if (e.pointerId !== id) return;
      id = null;
      if (moved < 10 && e.timeStamp - since < 500) {
        const box = el.getBoundingClientRect();
        if (!inRoom) ride.tap = [((e.clientX - box.left) / box.width) * 2 - 1, -((e.clientY - box.top) / box.height) * 2 + 1];
      }
    };
    // the browser took the touch over (a system gesture, a call): no tap from it
    const cancel = (e: PointerEvent) => { if (e.pointerId === id) id = null; };
    const before = el.style.touchAction; el.style.touchAction = 'none';
    el.addEventListener('pointerdown', down); window.addEventListener('pointermove', move); window.addEventListener('pointerup', up); window.addEventListener('pointercancel', cancel);
    return () => {
      el.style.touchAction = before;
      el.removeEventListener('pointerdown', down); window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', cancel);
    };
  }, [touch, gl, camera, inRoom]);

  useFrame((_, rawDelta) => {
    /*
     * On a tram (streetscape/trams/ride.ts): the eye is carried by it and the view turns as it turns, so a
     * look out of the side window stays a look out of the side window round a corner. The walking keys move
     * the rider about inside (below); stepping off puts them where the tram layer says.
     */
    if (ride.active && !inRoom) {
      // the eye's height is already on the real ground (TramLayer reads terrain.ts), not above a flat one
      const [x, y, z] = enuToWorld([ride.eye[0], ride.eye[1], ride.eye[2]]);
      camera.position.set(x, y, z);
      if (ride.look !== null) {
        // sat down: facing the way the seat faces
        camera.lookAt(x + Math.cos(ride.look), y, z - Math.sin(ride.look)); ride.look = null;
      } else if (rideHeading.current !== null) camera.rotateOnWorldAxis(UP, ride.heading - rideHeading.current);
      rideHeading.current = ride.heading;
      // no jump carried onto the tram, or saved up for stepping off it
      lift.current.height = 0; lift.current.rise = 0; jumpAsked.current = false;
      /*
       * Walking about inside (keys only): the step is worked out as on the street and handed to the tram
       * layer, which turns it into the tram's terms and keeps it inside the saloon.
       */
      const k = held.current;
      const inAhead = Number(k.has('KeyW') || k.has('ArrowUp')) - Number(k.has('KeyS') || k.has('ArrowDown'));
      const inAcross = Number(k.has('KeyD') || k.has('ArrowRight')) - Number(k.has('KeyA') || k.has('ArrowLeft'));
      if (inAhead || inAcross) {
        camera.getWorldDirection(forward.current); forward.current.y = 0; forward.current.normalize();
        sideways.current.crossVectors(forward.current, camera.up).normalize();
        const step = walkPace.walk() * Math.min(rawDelta, MAX_STEP_S) / Math.hypot(inAhead, inAcross);
        const dE = (forward.current.x * inAhead + sideways.current.x * inAcross) * step;
        const dN = -(forward.current.z * inAhead + sideways.current.z * inAcross) * step;
        ride.move = ride.move ? [ride.move[0] + dE, ride.move[1] + dN] : [dE, dN];
      }
      return;
    }
    rideHeading.current = null;
    if (ride.stepOff && !inRoom) {
      const [x, , z] = enuToWorld([ride.stepOff[0], ride.stepOff[1], 0]);
      camera.position.set(x, groundAt(groundAhdM, ride.stepOff[0], ride.stepOff[1]) + EYE_HEIGHT_M, z);
      ride.stepOff = null; ride.stepOffWorld = null;
    }

    const delta = Math.min(rawDelta, MAX_STEP_S);

    /*
     * Up and down, before anything to do with walking: a jump on the spot is
     * still a jump, and the walking below stops early when no key is held.
     */
    const air = lift.current;
    if (jumpAsked.current) {
      jumpAsked.current = false;
      if (air.height === 0) air.rise = JUMP_MS;
    }
    if (air.height > 0 || air.rise > 0) {
      air.height += air.rise * delta - 0.5 * GRAVITY_MS2 * delta * delta;
      air.rise -= GRAVITY_MS2 * delta;
      if (air.height <= 0) { air.height = 0; air.rise = 0; }
    }
    // Feet on the ground, whatever the view is doing — or off it, mid-jump.
    camera.position.y = groundAt(groundAhdM, camera.position.x, -camera.position.z) + EYE_HEIGHT_M + air.height;
    // a tram that has come at the walker since the last frame
    // (and no further than the walls let it: a push does not go through a building)
    if (ride.blockerCount && !inRoom) {
      const e0 = camera.position.x, n0 = -camera.position.z, [e, n] = ride.clearOf(e0, n0);
      if (e !== e0 || n !== n0) { const [we, wn] = slide(obstacles, e0, n0, e, n); camera.position.x = we; camera.position.z = -wn; }
    }
    const keys = held.current;
    // keys, or the on-screen stick (touchWalk.ts), which also says how far: a little push is a slow walk
    const keyAhead = Number(keys.has('KeyW') || keys.has('ArrowUp')) - Number(keys.has('KeyS') || keys.has('ArrowDown'));
    const keyAcross = Number(keys.has('KeyD') || keys.has('ArrowRight')) - Number(keys.has('KeyA') || keys.has('ArrowLeft'));
    const ahead = keyAhead || touchWalk.move[1], across = keyAcross || touchWalk.move[0];
    const push = Math.min(1, Math.hypot(ahead, across));

    if (push < 0.05) return;

    /*
     * Along the ground, not along the view. Looking up at a tower and walking
     * forward should not lift you off the pavement, which is what using the
     * camera's own direction unmodified would do.
     */
    camera.getWorldDirection(forward.current);
    forward.current.y = 0;
    forward.current.normalize();
    sideways.current.crossVectors(forward.current, camera.up).normalize();

    // keys walk at the wheel's pace and Shift hurries; a full push of the stick walks briskly
    const chosen = keyAhead || keyAcross
      ? keys.has('ShiftLeft') || keys.has('ShiftRight') ? walkPace.hurry() : walkPace.walk()
      : TOUCH_WALK_MS;
    const pace = inRoom ? Math.min(chosen, ROOM_MAX_MS) : chosen;
    const speed = pace * delta * push;
    // Normalised, so pressing two keys (or pushing the stick corner-wise) does not walk faster diagonally.
    const scale = 1 / Math.hypot(ahead, across);

    const fromE = camera.position.x;
    const fromN = -camera.position.z;
    const stepE = (forward.current.x * ahead + sideways.current.x * across) * speed * scale;
    const stepN = -(forward.current.z * ahead + sideways.current.z * across) * speed * scale;
    const wantE = fromE + stepE;
    const wantN = fromN + stepN;

    /*
     * Walls, in east/north — the frame the footprints are in. Converting the
     * camera's world position back here rather than converting 4,443
     * footprints the other way is the cheaper direction, and it keeps the
     * obstacle index in the same terms as the data it came from.
     */
    const [slidE, slidN] = slide(obstacles, fromE, fromN, wantE, wantN);
    // and not into a tram (one standing at a stop, or one going by)
    const [pushE, pushN] = ride.blockerCount && !inRoom ? ride.clearOf(slidE, slidN) : [slidE, slidN];
    const [nextE, nextN] = pushE !== slidE || pushN !== slidN ? slide(obstacles, slidE, slidN, pushE, pushN) : [slidE, slidN];
    camera.position.x = nextE;
    camera.position.z = -nextN;

    /*
     * Held to the modelled ground. Past its edge there is only haze, and a
     * walker out there is standing on nothing, looking back at a city
     * floating in the middle distance.
     */
    const [cx, , cz] = enuToWorld([boundsCentreEN[0], boundsCentreEN[1], 0]);
    const dx = camera.position.x - cx;
    const dz = camera.position.z - cz;
    const distance = Math.hypot(dx, dz);
    if (distance > boundsRadiusM) {
      camera.position.x = cx + (dx / distance) * boundsRadiusM;
      camera.position.z = cz + (dz / distance) * boundsRadiusM;
    }
  });

  // a locked pointer turns the view on a desktop; a phone has none, and is turned by the drag above
  return touch ? null : <PointerLockControls makeDefault onUnlock={onExit} />;
}

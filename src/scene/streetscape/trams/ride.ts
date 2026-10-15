/*
 * RIDING A TRAM — what the street view needs to know, and what the page shows about it.
 *
 * The trams live inside the streetscape (inside <WorldFrame>, east/north/up); the walking camera lives
 * outside it (StreetView.tsx). This is the meeting point between them: the tram layer writes where the rider's
 * eye is and which way the tram faces, and the street view reads it every frame. Positions are east/north
 * metres and height above the ground plane; StreetView adds the ground and converts them to its frame.
 */

export interface RideStatus {
  /** On a tram. */
  riding: boolean;
  /** A tram at a stop is near enough to board (doors open). */
  canBoard: boolean;
  /** The tram being ridden is at a stop. */
  canAlight: boolean;
  /** Route number and where it is going next, while riding. */
  route: string;
  next: string;
  /** What the centre of the view is on, for the prompt there: a door to board by, a door to get off by, a seat. */
  aim: '' | 'board' | 'alight' | 'seat';
  /** Sitting on a seat of the tram being ridden. */
  seated: boolean;
}

const IDLE: RideStatus = { riding: false, canBoard: false, canAlight: false, route: '', next: '', aim: '', seated: false };

class Ride {
  /** On a tram: the eye's position (east, north, height above ground) and the tram's heading (rad from east). */
  active = false;
  eye: [number, number, number] = [0, 0, 0];
  heading = 0;
  /** Set when a ride ends: where the walker steps off (east, north). The street view takes it and clears it. */
  stepOff: [number, number] | null = null;
  /*
   * The same two in three.js world coordinates, for the headset (VrWalk), which moves the floor under the
   * player and does not convert frames itself. Filled in by the streetscape each frame.
   */
  eyeWorld: [number, number, number] | null = null;
  stepOffWorld: [number, number, number] | null = null;

  /*
   * Asked of the tram layer from outside the streetscape, taken by it on its next frame:
   *   tap    a tap on a phone's screen, as normalised device coordinates (-1..1, y up)
   *   ray    a headset controller's laser, in three.js world coordinates (from, unit direction)
   *   alight the "Get off" button
   * A tap or a ray at a door of a tram at a stop boards it; while riding, at a stop, either steps off. Seats
   * are a desktop's (a click, TramLayer.click): neither a tap nor a ray sits down.
   */
  tap: [number, number] | null = null;
  ray: { from: [number, number, number]; dir: [number, number, number] } | null = null;
  alight = false;

  /*
   * Walking about inside the tram (a desktop's keys): the street view hands over the step it would have
   * taken (east, north metres), the tram layer turns it into a step along and across the tram and keeps it
   * inside. Added to until the tram layer takes it.
   */
  move: [number, number] | null = null;
  /** Asked by the tram layer when the rider sits down: the street view turns to this heading (rad from east), once. */
  look: number | null = null;

  /*
   * The trams near the walker as boxes, one per section, for the street view to keep the walker out of
   * (east, north metres): centre x, y, the box's direction cos, sin, half length, half width, six numbers each.
   * Rewritten by the tram layer every frame; `blockerCount` boxes are valid.
   */
  blockers: number[] = [];
  blockerCount = 0;

  private status = IDLE;
  private listeners = new Set<() => void>();
  readonly subscribe = (fn: () => void) => { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; };
  readonly getStatus = () => this.status;
  setStatus(next: RideStatus): void {
    const s = this.status;
    if (s.riding === next.riding && s.canBoard === next.canBoard && s.canAlight === next.canAlight && s.route === next.route && s.next === next.next
      && s.aim === next.aim && s.seated === next.seated) return;
    this.status = next; for (const fn of this.listeners) fn();
  }
  reset(): void {
    this.active = false; this.stepOff = null; this.eyeWorld = null; this.stepOffWorld = null;
    this.tap = null; this.ray = null; this.alight = false; this.move = null; this.look = null; this.blockerCount = 0; this.setStatus(IDLE);
  }
}

export const ride = new Ride();

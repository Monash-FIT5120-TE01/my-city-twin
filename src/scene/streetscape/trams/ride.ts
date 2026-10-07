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
}

const IDLE: RideStatus = { riding: false, canBoard: false, canAlight: false, route: '', next: '' };

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
   * A tap or a ray at a door of a tram at a stop boards it; while riding, at a stop, either steps off.
   */
  tap: [number, number] | null = null;
  ray: { from: [number, number, number]; dir: [number, number, number] } | null = null;
  alight = false;

  private status = IDLE;
  private listeners = new Set<() => void>();
  readonly subscribe = (fn: () => void) => { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; };
  readonly getStatus = () => this.status;
  setStatus(next: RideStatus): void {
    const s = this.status;
    if (s.riding === next.riding && s.canBoard === next.canBoard && s.canAlight === next.canAlight && s.route === next.route && s.next === next.next) return;
    this.status = next; for (const fn of this.listeners) fn();
  }
  reset(): void {
    this.active = false; this.stepOff = null; this.eyeWorld = null; this.stepOffWorld = null;
    this.tap = null; this.ray = null; this.alight = false; this.setStatus(IDLE);
  }
}

export const ride = new Ride();

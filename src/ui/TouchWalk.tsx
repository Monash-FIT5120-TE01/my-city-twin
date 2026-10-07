/*
 * WALKING ON A PHONE — the stick, and the buttons that stand in for keys.
 *
 * In the street a phone has no keys and no pointer to lock (StreetView.tsx): a stick at the bottom left to
 * walk (pushed further, faster), "Back up" in place of Esc, and "Get off" in place of E while a tram being
 * ridden is at a stop. Looking round is a drag on the city; a tap on a tram's door boards it.
 */
import { useEffect, useRef, useSyncExternalStore, type PointerEvent as ReactPointerEvent } from 'react';
import { touchWalk } from '../scene/touchWalk';
import { ride } from '../scene/streetscape/trams/ride';
import { Button } from './kit/Button';

/** How far the knob travels from the middle, px. */
const REACH_PX = 44;

export function TouchWalk({ onBackUp }: { onBackUp: () => void }) {
  const status = useSyncExternalStore(ride.subscribe, ride.getStatus);
  const pad = useRef<HTMLDivElement>(null);
  const knob = useRef<HTMLDivElement>(null);
  const finger = useRef<number | null>(null);

  // never left pushed: off the screen, or the street left, the walker stops
  useEffect(() => () => { touchWalk.move = [0, 0]; }, []);

  const steer = (e: ReactPointerEvent) => {
    const box = pad.current!.getBoundingClientRect();
    let dx = e.clientX - (box.left + box.width / 2), dy = e.clientY - (box.top + box.height / 2);
    const d = Math.hypot(dx, dy); if (d > REACH_PX) { dx *= REACH_PX / d; dy *= REACH_PX / d; }
    touchWalk.move = [dx / REACH_PX, -dy / REACH_PX];
    knob.current!.style.transform = `translate(${dx}px, ${dy}px)`;
  };
  const release = () => {
    finger.current = null; touchWalk.move = [0, 0];
    if (knob.current) knob.current.style.transform = '';
  };

  return (
    <div className="touch-walk">
      <div
        className="touch-walk__pad"
        ref={pad}
        role="presentation"
        onPointerDown={(e) => { finger.current = e.pointerId; e.currentTarget.setPointerCapture(e.pointerId); steer(e); }}
        onPointerMove={(e) => { if (e.pointerId === finger.current) steer(e); }}
        onPointerUp={release}
        onPointerCancel={release}
      >
        <div className="touch-walk__knob" ref={knob} />
      </div>
      <div className="touch-walk__actions">
        {status.canAlight && (
          <Button onClick={() => { ride.alight = true; }}>Get off</Button>
        )}
        <Button variant="secondary" onClick={onBackUp}>Back up</Button>
      </div>
    </div>
  );
}

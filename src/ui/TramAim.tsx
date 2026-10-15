import { useSyncExternalStore } from 'react';
import { ride } from '../scene/streetscape/trams/ride';

const ASK = {
  board: ['Board this tram?', 'Click to board'],
  alight: ['Get off here?', 'Click to get off'],
  seat: ['Sit here?', 'Click to sit'],
} as const;

/**
 * The centre of the view while walking on a desktop: a small dot, and when it is on something a tram offers
 * (streetscape/trams/TramLayer.ts lights it up), a ring and what a click does. Not on a phone (it taps the
 * door itself) or in a headset (it has its laser). Not read out: it changes as the view sweeps across a
 * tram, and the walking hint (TramHint) already says what can be done.
 */
export function TramAim() {
  const s = useSyncExternalStore(ride.subscribe, ride.getStatus);
  const ask = s.aim ? ASK[s.aim] : null;
  return (
    <div className={`tram-aim${ask ? ' tram-aim--on' : ''}`} aria-hidden="true">
      <span className="tram-aim__dot" />
      {ask ? (
        <p className="tram-aim__ask">
          <strong>{ask[0]}</strong>
          <span>{ask[1]}</span>
        </p>
      ) : s.seated ? (
        <p className="tram-aim__ask tram-aim__ask--quiet"><span>W A S D to stand up</span></p>
      ) : null}
    </div>
  );
}

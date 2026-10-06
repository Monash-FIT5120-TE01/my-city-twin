import { useSyncExternalStore } from 'react';
import { ride } from '../scene/streetscape/trams/ride';

/**
 * What can be done with the trams from where the walker is: board one standing at a stop, and while riding,
 * which route and stop, and when stepping off is possible. Part of the walking hint.
 */
export function TramHint() {
  const s = useSyncExternalStore(ride.subscribe, ride.getStatus);
  if (s.riding) {
    return (
      <>
        {' · '}On route <strong>{s.route}</strong>{s.next ? <> to {s.next}</> : null}
        {s.canAlight ? <> · <strong>E</strong> to get off</> : null}
      </>
    );
  }
  return s.canBoard ? <>{' · '}<strong>Click</strong> a tram door to board</> : null;
}

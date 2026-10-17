import { useSyncExternalStore } from 'react';
import { ride } from '../scene/streetscape/trams/ride';
import { walksByTouch } from '../scene/touchWalk';
import { Icon } from './kit/Icon';
import { HintChip } from './KeyHints';

/**
 * What can be done with the trams from where the walker is: board one standing at a stop, and while riding,
 * which route and stop, and when stepping off is possible. Part of the walking hint.
 */
export function TramHint() {
  const s = useSyncExternalStore(ride.subscribe, ride.getStatus);
  const touch = walksByTouch();
  if (s.riding) {
    return (
      <>
        <HintChip icon={<Icon name="train" size={14} />}>
          On route <strong>{s.route}</strong>
          {s.next ? <> to {s.next}</> : null}
        </HintChip>
        {s.canAlight && !touch ? <HintChip><strong>E</strong> to get off</HintChip> : null}
      </>
    );
  }
  return s.canBoard ? (
    <HintChip icon={<Icon name="train" size={14} />}>
      <strong>{touch ? 'Tap' : 'Aim at'}</strong> a tram door to board
    </HintChip>
  ) : null;
}

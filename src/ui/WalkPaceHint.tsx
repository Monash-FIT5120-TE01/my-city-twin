import { useSyncExternalStore } from 'react';
import { walkPace } from '../scene/walkPace';

/**
 * The walking pace the wheel has chosen, as a figure: part of the walking hint on a desktop. Said in words
 * and numbers, never by a colour.
 */
export function WalkPaceHint() {
  const pace = useSyncExternalStore(walkPace.subscribe, walkPace.getPace);
  return (
    <>
      {' · '}Pace <strong>{pace.toFixed(1)} m/s</strong> (<strong>wheel</strong> to change)
    </>
  );
}

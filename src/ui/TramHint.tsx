import { useSyncExternalStore } from 'react';
import { ride } from '../scene/streetscape/trams/ride';
import { walksByTouch } from '../scene/touchWalk';
import { Icon } from './kit/Icon';
import { HintChip, richText } from './KeyHints';
import { useT } from '../i18n/i18n';

/**
 * What can be done with the trams from where the walker is: board one standing at a stop, and while riding,
 * which route and stop, and when stepping off is possible. Part of the walking hint.
 */
export function TramHint() {
  const t = useT();
  const s = useSyncExternalStore(ride.subscribe, ride.getStatus);
  const touch = walksByTouch();
  if (s.riding) {
    return (
      <>
        <HintChip icon={<Icon name="train" size={14} />}>
          {s.next
            ? richText(t('walk.onRouteTo'), { route: s.route, stop: s.next })
            : richText(t('walk.onRoute'), { route: s.route })}
        </HintChip>
        {s.canAlight && !touch ? <HintChip>{richText(t('walk.keyToGetOff'), { key: 'E' })}</HintChip> : null}
      </>
    );
  }
  return s.canBoard ? (
    <HintChip icon={<Icon name="train" size={14} />}>
      {richText(t(touch ? 'walk.boardByTap' : 'walk.boardByAim'))}
    </HintChip>
  ) : null;
}

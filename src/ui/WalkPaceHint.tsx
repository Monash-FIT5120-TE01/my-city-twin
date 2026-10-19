import { useSyncExternalStore } from 'react';
import { walkPace } from '../scene/walkPace';
import { HintChip, richText } from './KeyHints';
import { formatNumber, useT } from '../i18n/i18n';

/**
 * The walking pace the wheel has chosen, as a figure: part of the walking hint on a desktop. Said in words
 * and numbers, never by a colour.
 */
export function WalkPaceHint() {
  const t = useT();
  const pace = useSyncExternalStore(walkPace.subscribe, walkPace.getPace);
  return (
    <HintChip>
      {richText(t('walk.pace'), {
        pace: formatNumber(pace, { minimumFractionDigits: 1, maximumFractionDigits: 1 }),
      })}
    </HintChip>
  );
}

/*
 * ─────────────────────────────────────────────────────────────────────────
 * THE MAP KEY
 * ─────────────────────────────────────────────────────────────────────────
 *
 * The key to the city's colours, wherever it appears: on the front page's
 * window, along the time bar, on the comparison page, and — `full`, with a
 * title — on How it works. One component, so the keys cannot disagree;
 * there used to be a second, hand-written one with square swatches.
 *
 * Each colour is named in words beside it, so a reader who cannot tell the
 * colours apart loses the shortcut and nothing else (and each sits at its
 * own lightness — see palette.ts). "In progress" is a project already under
 * construction. The full key adds the two states of a chosen building: the
 * pink of a searched one, and the outline of the selected one.
 */

import type { ReactNode } from 'react';
import { Swatch, type SwatchTone } from './Swatch';
import { useT } from '../../i18n/i18n';
import type { MessageKey } from '../../i18n/en';

const BASE: [SwatchTone, MessageKey][] = [
  ['existing', 'legend.existing'],
  ['approved', 'legend.approved'],
  ['progress', 'legend.inProgress'],
];

const CHOSEN: [SwatchTone, MessageKey][] = [
  ['searched', 'legend.searched'],
  ['selected', 'legend.selected'],
];

export function MapKey({
  className,
  full = false,
  title,
  note,
}: {
  /** Places it; each screen puts it somewhere different. */
  className?: string;
  /** Add the searched and selected states. */
  full?: boolean;
  /** A heading at the start of the row. */
  title?: string;
  /** A line at the end of the row. */
  note?: ReactNode;
}) {
  const t = useT();
  const entries = full ? [...BASE, ...CHOSEN] : BASE;
  return (
    <aside className={`map-key${className ? ` ${className}` : ''}`} aria-label={title ?? t('legend.mapKey')}>
      {title && <span className="map-key__title">{title}</span>}
      {entries.map(([tone, label]) => (
        <span className="map-key__row" key={tone}>
          <Swatch tone={tone} />
          {t(label)}
        </span>
      ))}
      {note && <span className="map-key__note">{note}</span>}
    </aside>
  );
}

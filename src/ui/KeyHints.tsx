/*
 * What the walker needs to know, in two places (the street, the flat):
 *   - a place card in the top-left corner: where they are, in a title, and the status — the hour, the
 *     floor, the pace, the tram — in chips, with any note and the way into a headset under them;
 *   - a keys bar at the foot of the view: each action its keys drawn as keycaps and a verb. It fades
 *     back a few seconds in, once the keys have been read, and comes back under the pointer.
 * Both in the app's own light card style, so they read as part of it rather than as a debug overlay.
 * Styles: walk-hints.css.
 */
import type { ReactNode } from 'react';
import { Icon, type IconName } from './kit/Icon';
import '../styles/walk-hints.css';

export function KeyHint({ keys, label }: { keys: string[]; label: string }) {
  return (
    <span className="key-hint">
      <span className="key-hint__keys">
        {keys.map((k) => (
          <kbd key={k} className="key-hint__key">
            {k}
          </kbd>
        ))}
      </span>
      <span className="key-hint__label">{label}</span>
    </span>
  );
}

export function HintChip({ icon, children }: { icon?: ReactNode; children: ReactNode }) {
  return (
    <span className="hint-chip">
      {icon}
      {children}
    </span>
  );
}

export function WalkHints({
  title,
  icon,
  actions,
  chips,
  children,
}: {
  /** Where the walker is: "In the street", "Inside the flat". */
  title: string;
  icon: IconName;
  actions: ReactNode;
  chips?: ReactNode;
  /** Under the chips: a note, the way into a headset. */
  children?: ReactNode;
}) {
  return (
    <>
      <section className="walk-place" aria-label={title}>
        <p className="walk-place__title">
          <span className="walk-place__icon" aria-hidden="true">
            <Icon name={icon} size={18} />
          </span>
          {title}
        </p>
        {chips && <div className="walk-place__chips">{chips}</div>}
        {children}
      </section>
      <div className="walk-keys" role="note" aria-label="Controls">
        {actions}
      </div>
    </>
  );
}

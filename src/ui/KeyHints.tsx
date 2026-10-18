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

/*
 * The mouse with its wheel picked out and arrows up and down: the wheel sets the pace. Drawn here rather
 * than taken from the icon set (a mouse diagram is the app's own drawing, as in the map help), and not a
 * keycap, which read as a key to press.
 */
export function WheelHint({ label }: { label: string }) {
  return (
    <span className="key-hint">
      <svg className="wheel-hint" width="30" height="30" viewBox="0 0 30 30" aria-hidden="true">
        <rect x="8.5" y="3.5" width="13" height="22" rx="6.5" fill="#ffffff" stroke="#9fb3aa" strokeWidth="1.5" />
        <line x1="15" y1="3.5" x2="15" y2="12" stroke="#c9d6d0" strokeWidth="1.2" />
        <rect x="13.4" y="6.5" width="3.2" height="5" rx="1.6" fill="#1f7a5c" />
        <path d="M24.5 8.5 26.5 5.5 28.5 8.5" fill="none" stroke="#1f7a5c" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M24.5 20.5 26.5 23.5 28.5 20.5" fill="none" stroke="#1f7a5c" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span className="visually-hidden">Mouse wheel:</span>
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

/*
 * The keys while walking (the street, the flat): each action a few keycaps and a verb, in a row, so the
 * eye finds "Esc" without reading a sentence. Status (the hour, the floor, the pace, the tram) goes in
 * small chips on a second row, and a note, when there is one, under those. Styles: walk-hints.css.
 */
import type { ReactNode } from 'react';
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

/**
 * The dock: actions on the first row, chips on the second, then anything else (a note, a button). Read
 * aloud as a short list of the keys and the status, as it was before as a sentence.
 */
export function WalkHints({
  className,
  actions,
  chips,
  children,
}: {
  className?: string;
  actions: ReactNode;
  chips?: ReactNode;
  children?: ReactNode;
}) {
  return (
    <div className={`walk-hints${className ? ` ${className}` : ''}`} role="note" aria-label="Controls">
      <div className="walk-hints__row">{actions}</div>
      {chips && <div className="walk-hints__chips">{chips}</div>}
      {children}
    </div>
  );
}

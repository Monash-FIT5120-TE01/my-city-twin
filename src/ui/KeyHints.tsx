/*
 * What the walker needs to know, in two places (the street, the flat):
 *   - a place card in the top-left corner: where they are, in a title, and the status — the hour, the
 *     floor, the pace, the tram — in chips, with any note and the way into a headset under them;
 *   - a keys bar at the foot of the view: each action its keys drawn as keycaps and a verb. It fades
 *     back a few seconds in, once the keys have been read, and comes back under the pointer.
 * Both in the app's own light card style, so they read as part of it rather than as a debug overlay.
 * Styles: walk-hints.css.
 */
import { Fragment, type ReactNode } from 'react';
import { Icon, type IconName } from './kit/Icon';
import { useT } from '../i18n/i18n';
import '../styles/walk-hints.css';

/**
 * A translated sentence with parts drawn differently: each {name} becomes `vars[name]` (text or an
 * element), and <b>…</b> is drawn in bold — so the words around the bold part stay one sentence a
 * translator can reorder. Pass the sentence as t(key) gives it, without its vars.
 */
export function richText(sentence: string, vars: Record<string, ReactNode> = {}): ReactNode {
  const fill = (text: string, at: string) =>
    text.split(/(\{\w+\})/).map((piece, i) => {
      const name = /^\{(\w+)\}$/.exec(piece)?.[1];
      return <Fragment key={`${at}-${i}`}>{name !== undefined && name in vars ? vars[name] : piece}</Fragment>;
    });
  return sentence.split(/(<b>.*?<\/b>)/).map((piece, i) => {
    const bold = /^<b>(.*)<\/b>$/.exec(piece);
    return bold ? <strong key={i}>{fill(bold[1], `b${i}`)}</strong> : <Fragment key={i}>{fill(piece, `t${i}`)}</Fragment>;
  });
}

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

/** A touch gesture (the stick, a drag): an icon and words, not a keycap, which reads as a key to press. */
export function GestureHint({ icon, gesture, label }: { icon: IconName; gesture: string; label: string }) {
  return (
    <span className="key-hint">
      <span className="gesture-hint">
        <Icon name={icon} size={16} />
        {gesture}
      </span>
      <span className="key-hint__label">{label}</span>
    </span>
  );
}

/*
 * The mouse with its wheel picked out and an arrow just above and below the wheel (not beside the mouse,
 * which read as moving the mouse up and down): rolling the wheel sets the pace. Drawn here rather
 * than taken from the icon set (a mouse diagram is the app's own drawing, as in the map help), and not a
 * keycap, which read as a key to press.
 */
export function WheelHint({ label }: { label: string }) {
  const t = useT();
  return (
    <span className="key-hint">
      <svg className="wheel-hint" width="30" height="40" viewBox="0 0 24 32" aria-hidden="true">
        {/* the mouse, and the wheel between them with an arrow just above and below it */}
        <rect x="2.75" y="1.75" width="18.5" height="28.5" rx="9.25" fill="#ffffff" stroke="#9fb3aa" strokeWidth="1.5" />
        <line x1="12" y1="1.75" x2="12" y2="4.2" stroke="#c9d6d0" strokeWidth="1.2" />
        <rect x="10.4" y="10" width="3.2" height="5.5" rx="1.6" fill="#1f7a5c" />
        <path d="M9.6 7.6 12 5.2 14.4 7.6" fill="none" stroke="#1f7a5c" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        <path d="M9.6 17.9 12 20.3 14.4 17.9" fill="none" stroke="#1f7a5c" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span className="visually-hidden">{t('walk.mouseWheel')}</span>
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
  const t = useT();
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
      <div className="walk-keys" role="note" aria-label={t('walk.controls')}>
        {actions}
      </div>
    </>
  );
}

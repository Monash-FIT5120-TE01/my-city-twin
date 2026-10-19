/*
 * The reader's display settings (settings/display.ts): a chip in the header that opens a card of
 * switches, in the same style as the language list beside it: colours for colour vision deficiency, and
 * a lighter way of drawing for older computers or to use less power. Each switch is a real checkbox (the same markup as
 * the map layers), so the keyboard and screen readers work as they do anywhere.
 *
 * Escape closes it and gives the keyboard back to the chip; so does a click anywhere else.
 */
import { useEffect, useId, useRef, useState } from 'react';
import { setDisplay, useDisplay } from '../settings/display';
import { useT } from '../i18n/i18n';
import { Icon } from './kit/Icon';

export function DisplayMenu() {
  const t = useT();
  const display = useDisplay();
  const [open, setOpen] = useState(false);
  /** Where the card starts, px from the top of the window: under the chip, for a phone (ui.css). */
  const [top, setTop] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const chip = useRef<HTMLButtonElement>(null);
  const card = useRef<HTMLDivElement>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    card.current?.querySelector<HTMLInputElement>('input')?.focus();
    const away = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', away);
    return () => document.removeEventListener('pointerdown', away);
  }, [open]);

  return (
    <div className="display-menu" ref={root}>
      <button
        ref={chip}
        type="button"
        className="chip chip--icon"
        aria-expanded={open}
        aria-controls={`${id}-card`}
        onClick={() => {
          setTop((chip.current?.getBoundingClientRect().bottom ?? 0) + 6);
          setOpen((now) => !now);
        }}
      >
        <Icon name="tune" size={20} />
        {t('settings.display')}
        <Icon name={open ? 'expand_less' : 'expand_more'} size={18} className="menu-chevron" />
      </button>
      {open && (
        <div
          ref={card}
          id={`${id}-card`}
          className="menu-card display-menu__card"
          role="group"
          aria-labelledby={`${id}-title`}
          style={{ '--menu-top': `${top}px` } as React.CSSProperties}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.preventDefault();
              setOpen(false);
              chip.current?.focus();
            }
          }}
        >
          <p className="display-menu__title" id={`${id}-title`}>
            {t('settings.title')}
          </p>
          <div className="switches">
            <label className="switch">
              <span className="switch__text">
                <span className="switch__name">{t('settings.colourSafe')}</span>
                <span className="switch__note">{t('settings.colourSafeNote')}</span>
              </span>
              <input
                type="checkbox"
                className="switch__input"
                checked={display.colourSafe}
                onChange={(event) => setDisplay({ colourSafe: event.target.checked })}
              />
              <span className="switch__track" aria-hidden="true" />
            </label>
            <label className="switch">
              <span className="switch__text">
                <span className="switch__name">{t('settings.lowGraphics')}</span>
                <span className="switch__note">{t('settings.lowGraphicsNote')}</span>
              </span>
              <input
                type="checkbox"
                className="switch__input"
                checked={display.lowGraphics}
                onChange={(event) => setDisplay({ lowGraphics: event.target.checked })}
              />
              <span className="switch__track" aria-hidden="true" />
            </label>
          </div>
        </div>
      )}
    </div>
  );
}

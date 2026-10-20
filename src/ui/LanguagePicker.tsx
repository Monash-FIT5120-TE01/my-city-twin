/*
 * The language the interface is in (i18n/): a chip in the header — the globe, the language's own name and
 * a chevron — that opens a list of the nine, drawn in the app's own card style rather than the system's
 * select (decided 2026-10-20). Each language is named in its own words, with its English name under
 * it, so a reader who cannot yet read the page can still find theirs; the one in use carries a tick.
 *
 * A listbox, worked as one: the arrows move through it, Home and End jump, Enter or Space chooses,
 * Escape and Tab close it and give the keyboard back to the chip; a click anywhere else closes it.
 */
import { useEffect, useId, useRef, useState } from 'react';
import { LOCALES } from '../i18n/locales';
import { setLocale, useLocale, useT } from '../i18n/i18n';
import { Icon } from './kit/Icon';

export function LanguagePicker() {
  const t = useT();
  const locale = useLocale();
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  /** Where the list starts, px from the top of the window: under the chip, for a phone (ui.css). */
  const [top, setTop] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const chip = useRef<HTMLButtonElement>(null);
  const list = useRef<HTMLUListElement>(null);
  const id = useId();
  const current = LOCALES.find((option) => option.code === locale) ?? LOCALES[0];

  const openList = () => {
    setActive(Math.max(0, LOCALES.findIndex((option) => option.code === locale)));
    setTop((chip.current?.getBoundingClientRect().bottom ?? 0) + 6);
    setOpen(true);
  };
  const close = (refocus: boolean) => {
    setOpen(false);
    if (refocus) chip.current?.focus();
  };
  const choose = (index: number) => {
    void setLocale(LOCALES[index].code);
    close(true);
  };

  // the list takes the keyboard when it opens
  useEffect(() => {
    if (open) list.current?.focus();
  }, [open]);

  // a press anywhere outside closes it
  useEffect(() => {
    if (!open) return;
    const away = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', away);
    return () => document.removeEventListener('pointerdown', away);
  }, [open]);

  return (
    <div className="language-picker" ref={root}>
      <button
        ref={chip}
        type="button"
        className="chip chip--icon language-picker__chip"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={`${id}-list`}
        aria-label={`${t('header.language')}: ${current.name}`}
        onClick={() => (open ? close(false) : openList())}
        onKeyDown={(event) => {
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault();
            openList();
          }
        }}
      >
        <Icon name="language" size={20} />
        <span lang={current.intl}>{current.name}</span>
        <Icon name={open ? 'expand_less' : 'expand_more'} size={18} className="menu-chevron" />
      </button>
      {open && (
        <ul
          ref={list}
          id={`${id}-list`}
          className="language-picker__list menu-card"
          role="listbox"
          tabIndex={-1}
          aria-label={t('header.language')}
          style={{ '--menu-top': `${top}px` } as React.CSSProperties}
          aria-activedescendant={`${id}-${LOCALES[active].code}`}
          onKeyDown={(event) => {
            const last = LOCALES.length - 1;
            const moves: Record<string, number> = {
              ArrowDown: Math.min(last, active + 1),
              ArrowUp: Math.max(0, active - 1),
              Home: 0,
              End: last,
            };
            if (event.key in moves) {
              event.preventDefault();
              setActive(moves[event.key]);
            } else if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              choose(active);
            } else if (event.key === 'Escape') {
              event.preventDefault();
              close(true);
            } else if (event.key === 'Tab') {
              close(false);
            }
          }}
        >
          {LOCALES.map((option, index) => {
            const chosen = option.code === locale;
            return (
              <li
                key={option.code}
                id={`${id}-${option.code}`}
                role="option"
                aria-selected={chosen}
                className={`language-picker__option${index === active ? ' is-active' : ''}${chosen ? ' is-chosen' : ''}`}
                onPointerEnter={() => setActive(index)}
                onClick={() => choose(index)}
              >
                <span className="language-picker__names">
                  <span className="language-picker__name" lang={option.intl}>
                    {option.name}
                  </span>
                  {option.english !== option.name && <span className="language-picker__english">{option.english}</span>}
                </span>
                {chosen && <Icon name="check" size={18} className="language-picker__tick" />}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

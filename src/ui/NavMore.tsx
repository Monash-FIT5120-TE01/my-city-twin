/*
 * "More" in the bar: the pages that are not the 3D twin (Street activity,
 * Future plans, How it works), behind one chip, so the bar leads with the
 * twin rather than listing them all with the same weight beside it
 * (decided 2026-10-29). The card is the header's own (.menu-card), as the
 * display and language menus beside it are.
 *
 * Each page is a plain button in a list: Tab moves through them, Escape
 * closes the card and gives the keyboard back to the chip, and a click
 * anywhere else closes it. The page on screen, if it is one of them, says
 * so (aria-current) and carries a tick.
 */
import { useEffect, useId, useRef, useState } from 'react';
import { useT } from '../i18n/i18n';
import { Icon, type IconName } from './kit/Icon';

export interface NavPage {
  label: string;
  icon: IconName;
  onOpen: () => void;
  current?: boolean;
}

export function NavMore({ pages }: { pages: NavPage[] }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  /** Where the card starts, px from the top of the window: under the chip, for a phone (ui.css). */
  const [top, setTop] = useState(0);
  const root = useRef<HTMLDivElement>(null);
  const chip = useRef<HTMLButtonElement>(null);
  const card = useRef<HTMLUListElement>(null);
  const id = useId();

  useEffect(() => {
    if (!open) return;
    card.current?.querySelector<HTMLButtonElement>('button')?.focus();
    const away = (event: PointerEvent) => {
      if (!root.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', away);
    return () => document.removeEventListener('pointerdown', away);
  }, [open]);

  return (
    <div className="nav-more" ref={root}>
      <button
        ref={chip}
        type="button"
        className={`chip chip--icon${pages.some((page) => page.current) ? ' nav-more__chip--current' : ''}`}
        aria-expanded={open}
        aria-controls={`${id}-list`}
        onClick={() => {
          setTop((chip.current?.getBoundingClientRect().bottom ?? 0) + 6);
          setOpen((now) => !now);
        }}
      >
        {t('nav.more')}
        <Icon name={open ? 'expand_less' : 'expand_more'} size={18} className="menu-chevron" />
      </button>
      {open && (
        <ul
          ref={card}
          id={`${id}-list`}
          className="menu-card nav-more__list"
          aria-label={t('nav.more')}
          style={{ '--menu-top': `${top}px` } as React.CSSProperties}
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.preventDefault();
              setOpen(false);
              chip.current?.focus();
            }
          }}
        >
          {pages.map((page) => (
            <li key={page.label}>
              <button
                type="button"
                className="nav-more__page"
                aria-current={page.current ? 'page' : undefined}
                onClick={() => {
                  setOpen(false);
                  page.onOpen();
                }}
              >
                <Icon name={page.icon} size={20} />
                <span>{page.label}</span>
                {page.current && <Icon name="check" size={18} className="nav-more__tick" />}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

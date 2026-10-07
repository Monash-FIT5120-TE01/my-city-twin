/*
 * The head of a full page (How it works, the comparison): an optional way
 * back, the title, and a line under it. The title takes the keyboard when
 * the page opens — the control that opened it has gone. Styles: kit.css.
 */

import { useEffect, useRef, type ReactNode } from 'react';
import { BackLink } from './BackLink';

export function PageHead({
  id,
  title,
  lede,
  back,
}: {
  /** The heading's id, for the page's aria-labelledby. */
  id: string;
  title: string;
  lede?: ReactNode;
  back?: { label: string; onClick: () => void };
}) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
  }, []);
  return (
    <div className="page-head">
      {back && <BackLink onClick={back.onClick}>{back.label}</BackLink>}
      <h1 className="page-title" id={id} ref={heading} tabIndex={-1}>
        {title}
      </h1>
      {lede && <p className="page-lede">{lede}</p>}
    </div>
  );
}

/*
 * A figure that counts up from 0 to its value when it scrolls into view —
 * "89%" on the front page as its section comes up.
 *
 * Each time it comes into view it counts again: out of view it goes back to
 * 0, ready. A screen reader is given the value itself, never the count; and
 * with reduced motion asked for, the value simply stands there.
 */

import { useEffect, useRef, useState } from 'react';

export function CountUp({
  value,
  suffix = '',
  durationMs = 1400,
}: {
  value: number;
  /** After the number, e.g. "%". */
  suffix?: string;
  durationMs?: number;
}) {
  const reduced = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  const [shown, setShown] = useState(reduced ? value : 0);
  const el = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const node = el.current;
    if (!node || reduced || typeof IntersectionObserver !== 'function') return;
    let frame = 0;
    const observer = new IntersectionObserver(([entry]) => {
      cancelAnimationFrame(frame);
      if (!entry.isIntersecting) { setShown(0); return; }
      const start = performance.now();
      const step = (now: number) => {
        const u = Math.min(1, (now - start) / durationMs);
        setShown(Math.round(value * (1 - (1 - u) ** 3)));   // eases out: quick at first, settling on the value
        if (u < 1) frame = requestAnimationFrame(step);
      };
      frame = requestAnimationFrame(step);
    }, { threshold: 0.6 });
    observer.observe(node);
    return () => { observer.disconnect(); cancelAnimationFrame(frame); };
  }, [value, durationMs, reduced]);

  return (
    <>
      <span ref={el} aria-hidden="true">{shown}{suffix}</span>
      <span className="visually-hidden">{value}{suffix}</span>
    </>
  );
}

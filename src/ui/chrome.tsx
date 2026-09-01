import type { Development } from '../data/model';

/**
 * Persistent navigation. "My Area" and "About" are Iteration 2 work.
 *
 * The unavailable links use aria-disabled rather than the disabled attribute:
 * a disabled button drops out of the tab order entirely, so someone using a
 * keyboard cannot even discover that the section exists. This way it is
 * reachable and announced as unavailable.
 */
export function Nav({ onHome }: { onHome: () => void }) {
  const unavailable = {
    className: 'nav__link',
    'aria-disabled': true,
    onClick: (event: React.MouseEvent) => event.preventDefault(),
  } as const;

  return (
    <nav className="nav" aria-label="Main">
      <button type="button" className="nav__mark" onClick={onHome}>
        MY CITY TWIN
      </button>
      <div className="nav__links">
        <button type="button" className="nav__link" aria-current="page" onClick={onHome}>
          Explore
        </button>
        <button type="button" {...unavailable}>
          My Area
        </button>
        <button type="button" {...unavailable}>
          About
        </button>
      </div>
    </nav>
  );
}

export function Crumbs({
  trail,
  onNavigate,
}: {
  trail: { label: string; to?: string }[];
  onNavigate: (to: string) => void;
}) {
  return (
    <nav className="crumbs" aria-label="Breadcrumb">
      {trail.map((crumb, i) => (
        <span key={crumb.label} style={{ display: 'contents' }}>
          {i > 0 && <span aria-hidden="true">/</span>}
          {crumb.to ? (
            <button type="button" onClick={() => onNavigate(crumb.to!)}>
              {i === 0 ? '← ' : ''}
              {crumb.label}
            </button>
          ) : (
            <span>{crumb.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}

export function StatusBadge({ status }: { status: Development['status'] }) {
  const construction = status === 'UNDER CONSTRUCTION';
  return (
    <span className={`badge${construction ? ' badge--construction' : ''}`}>{status}</span>
  );
}

/**
 * The one-line summary under a project's address.
 *
 * The Figma reads "Office + Retail · 46 storeys · 162 m". Storeys are only on
 * the details endpoint, so the line is built from what the footprint payload
 * actually carries and simply leaves out what it does not have — rather than
 * showing a plausible number nobody measured.
 */
export function developmentSummary(development: Development, storeys?: number): string {
  const uses = development.landUses
    .map((use) => use.useType)
    .filter((use, i, all) => all.indexOf(use) === i)
    .slice(0, 2)
    .join(' + ');

  const parts = [uses || 'Mixed use'];
  if (storeys && storeys > 0) parts.push(`${Math.round(storeys)} storeys`);
  parts.push(`${development.maxHeightM.toFixed(0)} m`);
  return parts.join(' · ');
}

export function SunChip({
  timeLabel,
  compass,
  visible,
}: {
  timeLabel: string;
  compass: string;
  visible: boolean;
}) {
  if (!visible) return null;
  return (
    <p className="sunchip">
      <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true">
        <circle cx="11" cy="11" r="4.4" fill="currentColor" />
        {[0, 45, 90, 135, 180, 225, 270, 315].map((angle) => (
          <line
            key={angle}
            x1="11"
            y1="2.6"
            x2="11"
            y2="5.4"
            stroke="currentColor"
            strokeWidth="1.6"
            strokeLinecap="round"
            transform={`rotate(${angle} 11 11)`}
          />
        ))}
      </svg>
      SUN {timeLabel} · FROM {compass}
    </p>
  );
}

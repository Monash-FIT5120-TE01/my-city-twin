/*
 * ─────────────────────────────────────────────────────────────────────────
 * THE PIN AND THE NAME ON THE CHOSEN PLACE
 * ─────────────────────────────────────────────────────────────────────────
 *
 * WHAT THIS FILE IS
 *   The teardrop marker and the name chip that sit above whatever place is
 *   currently chosen — an approved development, or an existing building
 *   somebody searched for.
 *
 * WHY IT IS ONE COMPONENT AND NOT TWO
 *   It used to take a Development, which meant only a proposal could ever be
 *   marked. Searching an existing building therefore moved the camera and lit
 *   the building pink but left the pin and the name floating over whichever
 *   proposal had been chosen before — one place highlighted, a different one
 *   labelled. Taking a plain point and a label instead means there is one
 *   marker, on one place, and it cannot disagree with itself.
 *
 * WHY BOTH SIT OUTSIDE <WorldFrame>
 *   They are HTML, not 3D objects. The browser's own 3D transform does not
 *   survive being nested inside the frame's rotation, so each converts its
 *   own position. See StreetLabels for the longer version.
 */

import { Html } from '@react-three/drei';
import { enuToWorld } from './frame';

export interface SiteMarkerSubject {
  /** Where it stands, east/north metres. */
  anchorEN: [number, number];
  /** Its highest point, metres AHD, so the pin clears the roof. */
  topAhdM: number;
  /** What to write on the chip. */
  label: string;
  /** Decides the colour, so the marker matches the massing beneath it. */
  kind: 'development' | 'building';
}

/** Clearance above the roof, so the pin reads as pointing at the whole thing. */
const PIN_LIFT_M = 34;

export function SiteMarker({
  subject,
  groundAhdM,
}: {
  subject: SiteMarkerSubject;
  groundAhdM: number;
}) {
  const [east, north] = subject.anchorEN;
  const found = subject.kind === 'building';

  // Pink for a search result, green for a proposal — the same rule the
  // buildings themselves follow, so the marker never contradicts the colour
  // of the thing it is marking.
  const colour = found ? '#c9457f' : '#14624a';

  return (
    <>
      <Html
        position={enuToWorld([east, north, subject.topAhdM + PIN_LIFT_M])}
        center
        zIndexRange={[1, 0]}
      >
        <svg width="38" height="48" viewBox="0 0 38 48" aria-hidden="true" className="site-pin">
          <path
            d="M19 47C19 47 35 28.6 35 18.4 35 9 27.8 1.6 19 1.6S3 9 3 18.4C3 28.6 19 47 19 47Z"
            fill={colour}
          />
          <circle cx="19" cy="18" r="10.4" fill="#ffffff" />
          {found ? (
            // A search result is a place you asked about, not a thing that
            // has been approved — so no tick.
            <circle cx="19" cy="18" r="4.2" fill={colour} />
          ) : (
            <path
              d="M13.6 18.2 17.5 22.1 24.6 14.6"
              fill="none"
              stroke={colour}
              strokeWidth="2.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          )}
        </svg>
      </Html>

      <Html
        position={enuToWorld([
          east,
          north,
          // Beside the middle of the mass rather than above the roof, so the
          // name does not collide with the pin on a short building.
          groundAhdM + Math.max(24, (subject.topAhdM - groundAhdM) * 0.52),
        ])}
        center
        zIndexRange={[1, 0]}
      >
        <span className={`site-label${found ? ' site-label--found' : ''}`}>
          {subject.label}
        </span>
      </Html>
    </>
  );
}

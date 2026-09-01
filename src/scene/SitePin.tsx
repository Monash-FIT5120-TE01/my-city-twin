import { Html } from '@react-three/drei';
import { enuToWorld } from './frame';
import type { Development } from '../data/model';

/**
 * The teardrop marker above the development, with a tick inside it.
 *
 * A billboard like the name chip, and for the same reason: a pin that leaned
 * with the camera would read as part of the model rather than as an
 * annotation on it.
 */
export function SitePin({ development }: { development: Development }) {
  const [east, north] = development.anchorEN;
  // Clear of the roof, so the pin reads as pointing at the whole massing.
  const up = development.topAhdM + 34;

  return (
    <Html position={enuToWorld([east, north, up])} center zIndexRange={[1, 0]}>
      <svg width="38" height="48" viewBox="0 0 38 48" aria-hidden="true" className="site-pin">
        <path
          d="M19 47C19 47 35 28.6 35 18.4 35 9 27.8 1.6 19 1.6S3 9 3 18.4C3 28.6 19 47 19 47Z"
          fill="#14624a"
        />
        <circle cx="19" cy="18" r="10.4" fill="#ffffff" />
        <path
          d="M13.6 18.2 17.5 22.1 24.6 14.6"
          fill="none"
          stroke="#14624a"
          strokeWidth="2.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </Html>
  );
}

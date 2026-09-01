import { Html } from '@react-three/drei';
import { enuToWorld } from './frame';
import type { Development } from '../data/model';

/**
 * The name chip floating beside the development under examination.
 *
 * Unlike the street names this one is a billboard, not a plane laid on the
 * ground — in the Figma it stays square to the screen at any camera angle,
 * which is what an annotation on a subject should do while a label painted on
 * a road should not.
 */
export function SiteLabel({
  development,
  groundAhdM,
}: {
  development: Development;
  groundAhdM: number;
}) {
  const [east, north] = development.anchorEN;
  const up = groundAhdM + Math.max(24, development.maxHeightM * 0.52);

  return (
    <Html position={enuToWorld([east, north, up])} center zIndexRange={[1, 0]}>
      <span className="site-label">{development.streetAddress.split(',')[0]}</span>
    </Html>
  );
}

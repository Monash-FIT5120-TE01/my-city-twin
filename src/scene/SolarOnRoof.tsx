/*
 * The solar panel check on the roof, in the east/north/up frame: the panels
 * laid out, or the light each part of the roof keeps (when the panels are
 * switched off, or none fit), and the roof the approved developments would
 * take, hatched.
 */
import { LostRoof } from './LostRoof';
import { PanelArray } from './PanelArray';
import { SolarRoof } from './SolarRoof';
import type { SolarScene } from './useSolarComparison';

export function SolarOnRoof({ view }: { view: SolarScene }) {
  const { check, lost, showPanels } = view;
  if (check.finding) return null;
  const panels = showPanels && check.panels > 0 && check.layout;
  return (
    <>
      {!panels && <SolarRoof check={check} />}
      {lost.length > 0 && <LostRoof pieces={lost} />}
      {panels && (
        <group rotation={[0, 0, panels.yaw]}>
          <PanelArray parts={panels.parts} />
        </group>
      )}
    </>
  );
}

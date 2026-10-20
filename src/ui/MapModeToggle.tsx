/*
 * The Street activity map in 2D or 3D (as ver-4 has it): two buttons in a small card at the map's top
 * right, the one in use filled. 2D is the flat map (ActivityMap); 3D is the city with the same glows on
 * its ground (scene/ActivityGlow.tsx). "2D" and "3D" read the same in every language; the group is named.
 */
import { useT } from '../i18n/i18n';

export type MapMode = '2d' | '3d';

export function MapModeToggle({ mode, onMode }: { mode: MapMode; onMode: (mode: MapMode) => void }) {
  const t = useT();
  return (
    <div className="map-mode" role="group" aria-label={t('activity.mapView')}>
      {(['2d', '3d'] as const).map((m) => (
        <button key={m} type="button" aria-pressed={mode === m} onClick={() => onMode(m)}>
          {m.toUpperCase()}
        </button>
      ))}
    </div>
  );
}

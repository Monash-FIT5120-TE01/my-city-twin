/*
 * A future plan on the 3D map: the panel beside the city while its place is
 * lit (scene/PlanHighlight) and the camera has flown to it. It says what is
 * lit, how good the position is (on the model's own street grid, traced
 * through its buildings, or placed by hand from the plan's description),
 * whether it is past the 3D buildings, and that there is no "once built"
 * to switch to — the data has no 3D shape for any of these plans. Its way
 * back is to the plan's own page, where it came from. Styles: future.css.
 */
import { useEffect, useRef } from 'react';
import type { FuturePlan } from '../data/useFuturePlans';
import { useT } from '../i18n/i18n';
import { BackLink } from './kit/BackLink';
import { Swatch } from './kit/Swatch';
import type { PlanPlace } from './planPlaces';

export function PlanMapSheet({
  plan,
  place,
  onBack,
}: {
  plan: FuturePlan;
  place: Extract<PlanPlace, { onMap: true }>;
  onBack: () => void;
}) {
  const t = useT();
  const title = useRef<HTMLHeadingElement>(null);
  // The keyboard comes here from the button that opened the map, which has gone.
  useEffect(() => {
    title.current?.focus({ preventScroll: true });
  }, [plan.id]);

  return (
    <aside className="panel panel--left sheet plan-map" aria-labelledby="plan-map-title">
      <BackLink onClick={onBack}>{t('future.map.back')}</BackLink>
      <div>
        <p className="panel__eyebrow">{plan.topic}</p>
        <h2 className="sheet__lede plan-map__title" id="plan-map-title" ref={title} tabIndex={-1}>
          {plan.name}
        </h2>
      </div>

      <section className="plan-map__card" aria-label={t('future.map.onMap')}>
        <p className="plan-map__where">
          <Swatch tone="searched" />
          <span>{t('future.map.highlighted', { place: place.where })}</span>
        </p>
        <p className="plan-map__note">{t(place.basis === 'grid' ? 'future.map.grid' : place.basis === 'traced' ? 'future.map.traced' : 'future.map.approx')}</p>
        {place.beyondModel && <p className="plan-map__note">{t('future.map.beyond')}</p>}
        <p className="plan-map__note">{t('future.map.noShape')}</p>
      </section>
    </aside>
  );
}

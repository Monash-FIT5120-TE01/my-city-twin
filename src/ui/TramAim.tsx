import { useSyncExternalStore } from 'react';
import { ride } from '../scene/streetscape/trams/ride';
import { useT } from '../i18n/i18n';

const ASK = {
  board: ['walk.boardAsk', 'walk.boardClick'],
  alight: ['walk.getOffAsk', 'walk.getOffClick'],
  seat: ['walk.sitAsk', 'walk.sitClick'],
} as const;

/**
 * The centre of the view while walking on a desktop: a small dot, and when it is on something a tram offers
 * (streetscape/trams/TramLayer.ts lights it up), a ring and what a click does. Not on a phone (it taps the
 * door itself) or in a headset (it has its laser). Not read out: it changes as the view sweeps across a
 * tram, and the walking hint (TramHint) already says what can be done.
 */
export function TramAim() {
  const t = useT();
  const s = useSyncExternalStore(ride.subscribe, ride.getStatus);
  const ask = s.aim ? ASK[s.aim] : null;
  return (
    <div className={`tram-aim${ask ? ' tram-aim--on' : ''}`} aria-hidden="true">
      <span className="tram-aim__dot" />
      {ask ? (
        <p className="tram-aim__ask">
          <strong>{t(ask[0])}</strong>
          <span>{t(ask[1])}</span>
        </p>
      ) : s.seated ? (
        <p className="tram-aim__ask tram-aim__ask--quiet"><span>{t('walk.standUp')}</span></p>
      ) : null}
    </div>
  );
}

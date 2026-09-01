import { useEffect, useState } from 'react';
import { API_BASE } from './useCityModel';
import type { ApiDevelopmentDetail } from './api-types';

/**
 * Storeys, floor areas and the permit number for one development.
 *
 * Only the footprint endpoints are bundled as a snapshot, so this is the one
 * call that genuinely needs the staging API to be awake. It is therefore
 * treated as an enhancement: the panel renders without it, and fills in the
 * storey count if and when it arrives. A sleeping Render instance costs the
 * demonstration a line of text, not a screen.
 */
export function useDevelopmentDetail(devId: string | null) {
  const [detail, setDetail] = useState<ApiDevelopmentDetail | null>(null);

  useEffect(() => {
    if (!devId) {
      setDetail(null);
      return;
    }

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);

    fetch(`${API_BASE}/api/development/details/${devId}`, { signal: controller.signal })
      .then((response) => (response.ok ? response.json() : null))
      .then((data: ApiDevelopmentDetail | null) => setDetail(data))
      .catch(() => setDetail(null))
      .finally(() => clearTimeout(timer));

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [devId]);

  return detail;
}

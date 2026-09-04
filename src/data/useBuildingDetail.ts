/*
 * ─────────────────────────────────────────────────────────────────────────
 * WHAT IS KNOWN ABOUT ONE EXISTING BUILDING
 * ─────────────────────────────────────────────────────────────────────────
 *
 * WHAT THIS FILE IS
 *   Fetches the property record behind a building somebody looked up — when
 *   it was built, how many storeys, what it is used for.
 *
 * WHY IT IS FETCHED AND NOT BUNDLED
 *   The footprints endpoint carries geometry for all 4,443 rows and would be
 *   several times larger if it carried every property field too. One request
 *   when a building is actually opened is the cheaper trade.
 *
 * IT IS AN ENHANCEMENT, NOT A REQUIREMENT
 *   The panel renders from what the model already knows — address, height,
 *   footprint — and fills in the rest if and when this arrives. A sleeping
 *   backend costs a few lines of detail, not the screen.
 *
 * NOTE ON NAMING
 *   Fields inside `details` are snake_case, unlike the camelCase everywhere
 *   else in the API. That is the shape it sends; it is translated here rather
 *   than leaking into the interface.
 */

import { useEffect, useState } from 'react';
import { API_BASE } from './useCityModel';

interface ApiBuildingDetail {
  buildingId: string;
  height: string;
  details: {
    street_address: string | null;
    building_name: string | null;
    construction_year: number | null;
    refurbished_year: number | null;
    floors_above_ground: number | null;
    predominant_space_use: string | null;
    bicycle_spaces: number | null;
    accessibility_rating: number | null;
    census_year: number | null;
    block_id: string | null;
  } | null;
}

/** What the panel actually shows, with the nulls already resolved. */
export interface BuildingDetail {
  buildingName: string | null;
  constructionYear: number | null;
  refurbishedYear: number | null;
  floorsAboveGround: number | null;
  predominantUse: string | null;
  bicycleSpaces: number | null;
  censusYear: number | null;
}

/** Zero is a real answer for bike spaces; null means nobody recorded one. */
const asNumber = (value: number | null | undefined): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

const asText = (value: string | null | undefined): string | null =>
  value && value.trim() ? value.trim() : null;

export function useBuildingDetail(buildingId: string | null) {
  const [detail, setDetail] = useState<BuildingDetail | null>(null);

  useEffect(() => {
    // Clear immediately, so a previous building's facts never sit under a
    // new building's address while the request is in flight.
    setDetail(null);
    if (!buildingId) return;

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);

    fetch(`${API_BASE}/api/building/details/${buildingId}`, { signal: controller.signal })
      .then((response) => (response.ok ? response.json() : null))
      .then((data: ApiBuildingDetail | null) => {
        const d = data?.details;
        if (!d) return;
        setDetail({
          buildingName: asText(d.building_name),
          constructionYear: asNumber(d.construction_year),
          refurbishedYear: asNumber(d.refurbished_year),
          floorsAboveGround: asNumber(d.floors_above_ground),
          predominantUse: asText(d.predominant_space_use),
          bicycleSpaces: asNumber(d.bicycle_spaces),
          censusYear: asNumber(d.census_year),
        });
      })
      .catch(() => undefined)
      .finally(() => clearTimeout(timer));

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [buildingId]);

  return detail;
}

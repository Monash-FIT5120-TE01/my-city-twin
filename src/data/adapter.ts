import type {
  ApiBuildingPart,
  ApiDevelopmentPart,
  ApiFeatureCollection,
} from './api-types';
import type {
  BuildingMassing,
  CityModel,
  Development,
  DevelopmentMassing,
  LandUse,
} from './model';
import { centroidOf, projectLonLat, projectMultiPolygon, ringArea } from './project';
import { LOCAL_ORIGIN_WGS84 } from '../scene/frame';

const num = (v: string | number | null | undefined): number => {
  const n = typeof v === 'number' ? v : Number.parseFloat(v ?? '');
  return Number.isFinite(n) ? n : 0;
};

/** How far the two height routes may disagree before a row is distrusted. */
const HEIGHT_AGREEMENT_TOLERANCE_M = 0.01;

export interface AdapterReport {
  buildingParts: number;
  buildings: number;
  developmentParts: number;
  developments: number;
  /** Rows where absolute AHD and relative heights disagree. Reported, not dropped. */
  heightDisagreements: number;
  worstDisagreementM: number;
}

export function buildCityModel(
  buildingFc: ApiFeatureCollection<ApiBuildingPart>,
  developmentFc: ApiFeatureCollection<ApiDevelopmentPart>,
  source: 'live' | 'snapshot',
): { model: CityModel; report: AdapterReport } {
  const [originX, originY] = projectLonLat(LOCAL_ORIGIN_WGS84.lon, LOCAL_ORIGIN_WGS84.lat);

  let heightDisagreements = 0;
  let worstDisagreementM = 0;

  const buildings: BuildingMassing[] = [];

  for (const feature of buildingFc.features) {
    if (!feature.geometry) continue;
    const p = feature.properties;

    const structureBase = num(p.structureMinElevationAhdM);
    const planeTopAhd = num(p.footprintMaxElevationAhdM);
    const planeBaseAhd = num(p.footprintMinElevationAhdM);

    /*
     * Two independent routes to the same height. Checking them is how the
     * 1% of rows where the source disagrees with itself become visible
     * rather than silently wrong.
     */
    const disagreement = Math.max(
      Math.abs(planeBaseAhd - structureBase - num(p.relativeBaseHeightM)),
      Math.abs(planeTopAhd - structureBase - num(p.relativeTopHeightM)),
    );
    const agrees = disagreement <= HEIGHT_AGREEMENT_TOLERANCE_M;
    if (!agrees) {
      heightDisagreements += 1;
      worstDisagreementM = Math.max(worstDisagreementM, disagreement);
    }

    /*
     * Each row is one roof plane, and 2,651 of 4,443 start above ground.
     *
     * Those planes keep their OWN base. Extruding them from the structure's
     * ground instead would be simpler and would guarantee nothing floats, but
     * it invents mass: measured against the data, 2,450 of the 2,651 already
     * have a sibling plane occupying the space beneath them, so the extra
     * column is merely redundant — while for the remaining 201 it is a solid
     * that does not exist, and solids cast shadow.
     *
     * Nothing floats either, because the lowest plane of each building is
     * sunk to the ground plane instead (see sinksToGround below).
     */
    const baseAhdM = planeBaseAhd;
    const topAhdM = planeTopAhd;
    const heightM = Math.max(0, topAhdM - baseAhdM);

    const footprint = projectMultiPolygon(feature.geometry, originX, originY);
    const areaM2 = Math.max(
      0,
      ...footprint.map((poly) => (poly[0] ? Math.abs(ringArea(poly[0])) : 0)),
    );

    buildings.push({
      id: feature.id ?? `${p.buildingId}-${feature.objectId ?? buildings.length}`,
      parentId: p.buildingId,
      structureId: p.structureId,
      roofType: p.roofType,
      footprint,
      baseAhdM,
      topAhdM,
      heightM,
      areaM2,
      // Filled in once the whole building is known.
      sinksToGround: false,
      // A row we cannot reconcile is still rendered — just marked. Removing it
      // would delete its shadow, and a missing shadow reads as sunlight.
      readyFor3d: agrees && heightM > 0,
    });
  }

  markLowestPartOfEach(buildings);

  const developmentParts: DevelopmentMassing[] = [];

  for (const feature of developmentFc.features) {
    if (!feature.geometry) continue;
    const p = feature.properties;

    const baseAhdM = num(p.baseAhdM);
    const topAhdM = num(p.topAhdM);
    const footprint = projectMultiPolygon(feature.geometry, originX, originY);
    const areaM2 = Math.max(
      0,
      ...footprint.map((poly) => (poly[0] ? Math.abs(ringArea(poly[0])) : 0)),
    );

    developmentParts.push({
      id: feature.id ?? `${p.devId}-${developmentParts.length}`,
      parentId: p.devId,
      devKey: p.devKey,
      streetAddress: p.streetAddress,
      status: p.status,
      shapeType: p.shapeType,
      footprint,
      baseAhdM,
      // The proposal's own base is authoritative; unlike the building rows
      // these components are already modelled as stacked massing.
      topAhdM,
      heightM: Math.max(0, topAhdM - baseAhdM),
      areaM2,
      sinksToGround: false,
      anchorEN: projectedAnchor(p.longitude, p.latitude, originX, originY),
      landUses: toLandUses(p.landUses),
    });
  }

  markLowestPartOfEach(developmentParts);

  const developments = groupDevelopments(developmentParts);
  const extent = extentOf(buildings, developmentParts);

  return {
    model: { buildings, developments, extent, source },
    report: {
      buildingParts: buildings.length,
      buildings: new Set(buildings.map((b) => b.parentId)).size,
      developmentParts: developmentParts.length,
      developments: developments.length,
      heightDisagreements,
      worstDisagreementM,
    },
  };
}

/**
 * Flags the lowest part of every parent so it, and only it, can be sunk to
 * the ground plane.
 *
 * The scene draws flat ground at a single elevation while parts carry their
 * true AHD feet. Without this a building standing on higher ground hovers;
 * with it applied to every part, upper storeys would grow a column down to
 * the ground that the source does not describe.
 */
function markLowestPartOfEach<T extends { parentId: string; baseAhdM: number; sinksToGround: boolean }>(
  parts: T[],
): void {
  const lowest = new Map<string, number>();
  for (const part of parts) {
    const current = lowest.get(part.parentId);
    if (current === undefined || part.baseAhdM < current) {
      lowest.set(part.parentId, part.baseAhdM);
    }
  }
  for (const part of parts) {
    part.sinksToGround = part.baseAhdM <= (lowest.get(part.parentId) ?? part.baseAhdM) + 0.01;
  }
}

function projectedAnchor(
  lon: number,
  lat: number,
  originX: number,
  originY: number,
): [number, number] {
  const [x, y] = projectLonLat(lon, lat);
  return [x - originX, y - originY];
}

function toLandUses(raw: ApiDevelopmentPart['landUses']): LandUse[] {
  return (raw ?? []).map((u) => ({
    useType: u.use_type,
    quantity: u.quantity,
    unit: u.unit,
  }));
}

function groupDevelopments(parts: DevelopmentMassing[]): Development[] {
  const byId = new Map<string, DevelopmentMassing[]>();
  for (const part of parts) {
    const list = byId.get(part.parentId);
    if (list) list.push(part);
    else byId.set(part.parentId, [part]);
  }

  const out: Development[] = [];
  for (const [devId, group] of byId) {
    const first = group[0];
    // Land uses repeat on every component of a development; keep one copy.
    const seen = new Set<string>();
    const landUses: LandUse[] = [];
    for (const part of group) {
      for (const use of part.landUses) {
        const key = `${use.useType}|${use.quantity}|${use.unit}`;
        if (seen.has(key)) continue;
        seen.add(key);
        landUses.push(use);
      }
    }

    out.push({
      devId,
      devKey: first.devKey,
      streetAddress: first.streetAddress,
      status: first.status,
      anchorEN: centroidOf(group.flatMap((part) => part.footprint)),
      maxHeightM: Math.max(...group.map((part) => part.heightM)),
      topAhdM: Math.max(...group.map((part) => part.topAhdM)),
      parts: group,
      landUses,
    });
  }

  return out.sort((a, b) => b.maxHeightM - a.maxHeightM);
}

function extentOf(
  buildings: BuildingMassing[],
  developments: DevelopmentMassing[],
): CityModel['extent'] {
  let minE = Infinity;
  let minN = Infinity;
  let maxE = -Infinity;
  let maxN = -Infinity;

  for (const item of [...buildings, ...developments]) {
    for (const polygon of item.footprint) {
      for (const ring of polygon) {
        for (const [e, n] of ring) {
          if (e < minE) minE = e;
          if (e > maxE) maxE = e;
          if (n < minN) minN = n;
          if (n > maxN) maxN = n;
        }
      }
    }
  }

  // Every bound has to be checked: a collection where one axis never varied
  // would otherwise leak an Infinity into the camera and the shadow frustum.
  const finite =
    Number.isFinite(minE) &&
    Number.isFinite(minN) &&
    Number.isFinite(maxE) &&
    Number.isFinite(maxN);

  return finite ? { minE, minN, maxE, maxN } : { minE: 0, minN: 0, maxE: 0, maxN: 0 };
}

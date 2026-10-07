/*
 * The card beside a chosen building: what it says, worked out from the
 * records (placeFacts), and how it is written out (PlaceCard).
 *
 * WHAT THESE PIN DOWN
 *   - A project's floor area is read from the records' own unit, "sq.m",
 *     and shown with m² — it was missed before and printed as a bare count.
 *   - Figures the record lacks are left out, never shown empty; there are
 *     never more than three.
 *   - The stage and the use are written in words, so the coloured dot is
 *     never the only way to tell what a building is.
 *   - The card's figures are a description list, label and value paired.
 */

import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { buildingFacts, developmentFacts } from './placeFacts';
import { PlaceCard } from './PlaceCard';
import type { BuildingDetail } from '../data/useBuildingDetail';

const part = (heightM: number) => ({ heightM }) as never;
const project = {
  status: 'UNDER CONSTRUCTION' as const,
  parts: [part(120), part(172)],
  landUses: [
    { useType: 'Office', quantity: 57810, unit: 'sq.m' },
    { useType: 'Car parks', quantity: 80, unit: null },
    { useType: 'Retail', quantity: 525, unit: 'sq.m' },
  ],
};

const record = (fields: Partial<BuildingDetail>): BuildingDetail => ({
  buildingName: null,
  constructionYear: null,
  refurbishedYear: null,
  floorsAboveGround: null,
  predominantUse: null,
  bicycleSpaces: null,
  censusYear: null,
  ...fields,
});

describe('what the card says about a project', () => {
  it('gives the height, the storeys and the largest floor area in m²', () => {
    const facts = developmentFacts(project, 47);
    expect(facts.figures).toEqual([
      { value: '172 m', label: 'Height' },
      { value: '47', label: 'Storeys' },
      { value: '57,810 m²', label: 'Office' },
    ]);
  });

  it('names the stage and the uses in words', () => {
    const facts = developmentFacts(project);
    expect(facts.kind).toBe('Under construction');
    expect(facts.use).toBe('Office + Car parks');
  });

  it('leaves the storeys out until the record has them', () => {
    const labels = developmentFacts(project).figures.map((figure) => figure.label);
    expect(labels).toEqual(['Height', 'Office']);
  });

  it('falls back to the largest count when there is no floor area', () => {
    const counted = { ...project, status: 'APPROVED' as const, landUses: [{ useType: 'Dwellings', quantity: 312, unit: 'count' }] };
    const facts = developmentFacts(counted);
    expect(facts.kind).toBe('Approved');
    expect(facts.figures.at(-1)).toEqual({ value: '312', label: 'Dwellings' });
  });
});

describe('what the card says about a building standing today', () => {
  it('gives height, storeys and year built from the property record', () => {
    const facts = buildingFacts(185, record({ floorsAboveGround: 54, constructionYear: 1981, predominantUse: 'Office' }));
    expect(facts.kind).toBe('Existing building');
    expect(facts.use).toBe('Mainly office');
    expect(facts.figures.map((figure) => figure.value)).toEqual(['185 m', '54', '1981']);
  });

  it('shows the height alone when there is no record', () => {
    const facts = buildingFacts(42, null);
    expect(facts.figures).toEqual([{ value: '42 m', label: 'Height' }]);
    expect(facts.use).toBeNull();
  });

  it('uses the refurbishment year when that is all there is', () => {
    const facts = buildingFacts(60, record({ refurbishedYear: 2004 }));
    expect(facts.figures.at(-1)).toEqual({ value: '2004', label: 'Refurbished' });
  });
});

describe('the card', () => {
  const html = renderToStaticMarkup(
    <PlaceCard
      title="582-606 Collins Street"
      facts={developmentFacts(project, 47)}
      tone="progress"
      variant="anchored"
      onSunlight={() => undefined}
      onClose={() => undefined}
    />,
  );

  it('carries the address, the stage in words and the way on to sunlight', () => {
    expect(html).toContain('582-606 Collins Street');
    expect(html).toContain('Under construction');
    expect(html).toContain('Explore sunlight');
    expect(html).toContain('aria-label="Back to the map"');
  });

  it('pairs each figure with its label, the unit set apart and smaller', () => {
    expect(html).toContain('<dt>Height</dt><dd>172<span class="place-card__unit"> m</span></dd>');
    expect(html).toContain('<dt>Office</dt><dd>57,810<span class="place-card__unit"> m²</span></dd>');
    expect(html).toContain('<dt>Storeys</dt><dd>47</dd>');
  });
});

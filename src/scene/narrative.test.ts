import { describe, expect, it } from 'vitest';
import { describeShadow, shadowBearingDeg } from './narrative';

/*
 * The sentence a resident reads is a claim about their street, so it is
 * tested like any other output — including the case the Figma's own wording
 * cannot cover, where the sun has set.
 */

const TOWER_M = 214.1;

describe('shadow direction', () => {
  it('points away from the sun', () => {
    expect(shadowBearingDeg(0)).toBe(180);
    expect(shadowBearingDeg(90)).toBe(270);
    expect(shadowBearingDeg(315)).toBe(135);
  });

  it('says south when the sun is north, as it is at a Melbourne noon', () => {
    const { sentence } = describeShadow(
      { altitudeDeg: 28.7, azimuthDeg: 0 },
      TOWER_M,
      '12:20',
      '21 June',
    );
    expect(sentence).toContain('south');
  });

  it('says south-east in the winter afternoon', () => {
    const { sentence, caption } = describeShadow(
      { altitudeDeg: 19, azimuthDeg: 323 },
      TOWER_M,
      '15:00',
      '21 June',
    );
    expect(sentence).toContain('south-east');
    expect(caption).toContain('south-east');
  });
});

describe('shadow length', () => {
  it('calls a high sun the shortest shadow', () => {
    const { caption } = describeShadow(
      { altitudeDeg: 72, azimuthDeg: 0 },
      TOWER_M,
      '13:20',
      '21 December',
    );
    expect(caption).toBe('Shortest shadow');
  });

  it('lengthens the description as the sun drops', () => {
    const bands = [72, 40, 25, 8].map(
      (altitudeDeg) =>
        describeShadow({ altitudeDeg, azimuthDeg: 0 }, TOWER_M, '00:00', '21 June').caption,
    );
    expect(bands[0]).toContain('Shortest');
    expect(bands[3]).toContain('Longest');
    expect(new Set(bands).size).toBe(4);
  });

  it('quotes a distance that matches the geometry', () => {
    // 45° puts the shadow at exactly the building's height.
    const { sentence } = describeShadow(
      { altitudeDeg: 45, azimuthDeg: 0 },
      200,
      '10:00',
      '21 March',
    );
    expect(sentence).toContain('200 m');
  });
});

describe('after sunset', () => {
  it('says there is no shadow rather than an infinite one', () => {
    const { sentence, caption } = describeShadow(
      { altitudeDeg: -4, azimuthDeg: 250 },
      TOWER_M,
      '18:10',
      '21 June',
    );
    expect(sentence).toContain('no shadow');
    expect(caption).toBe('No direct sun');
  });
});

describe('what the sentence does not claim', () => {
  it('never names a protected space, because there is no such data yet', () => {
    // The Figma reads "Shadow falls east of the protected area". Protected
    // space is user story 1.3 and has no table behind it; asserting one here
    // would put an unfounded claim about a real street in front of a resident.
    for (const altitudeDeg of [-5, 5, 20, 45, 70]) {
      const { sentence } = describeShadow(
        { altitudeDeg, azimuthDeg: 40 },
        TOWER_M,
        '11:00',
        '21 March',
      );
      expect(sentence.toLowerCase()).not.toContain('protected');
      expect(sentence.toLowerCase()).not.toContain('forecourt');
      expect(sentence.toLowerCase()).not.toContain('plaza');
    }
  });
});

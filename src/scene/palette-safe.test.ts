import { describe, expect, it } from 'vitest';
import { APPROVED_SAFE, EXISTING_SAFE, IN_PROGRESS_SAFE } from './palette';

/** CIE L* of an sRGB colour. */
function lightness(hex: string): number {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = Number.parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  const y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return 116 * (y > 0.008856 ? Math.cbrt(y) : 7.787 * y + 16 / 116) - 16;
}

describe('the colour-blind friendly building colours', () => {
  it('sets the three kinds and the searched pink at least 14 apart in lightness', () => {
    const kinds = [EXISTING_SAFE, APPROVED_SAFE.base, IN_PROGRESS_SAFE.base, '#e0569a'].map(lightness);
    for (let i = 0; i < kinds.length; i++) {
      for (let j = i + 1; j < kinds.length; j++) expect(Math.abs(kinds[i] - kinds[j])).toBeGreaterThanOrEqual(14);
    }
  });
});

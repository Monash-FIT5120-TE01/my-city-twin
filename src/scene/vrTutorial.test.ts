import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { TUTORIAL } from './vrTutorial';

describe('the VR controls tutorial', () => {
  it('ships every picture it names', () => {
    for (const page of TUTORIAL) {
      expect(existsSync(resolve(__dirname, '../../public', page.image)), page.image).toBe(true);
    }
  });

  /*
   * The headset's font has plain ASCII and little else; a curly quote or a
   * dash would come out as nothing. `plain` would strip it, silently — so it
   * is caught here instead, where it can be fixed.
   */
  it('says everything in characters the headset font has', () => {
    for (const page of TUTORIAL) {
      const words = [page.title, page.body, ...page.legend.flat()];
      for (const text of words) expect(text, text).toMatch(/^[\x20-\x7E]*$/);
    }
  });

  it('teaches pressing on the very first page, by doing it', () => {
    // Every later page is reached by pressing Next, so pressing has to be taught before it is needed.
    expect(TUTORIAL.findIndex((page) => page.practice)).toBe(0);
    expect(TUTORIAL[0].legend.map(([key]) => key)).toContain('Trigger');
  });
});

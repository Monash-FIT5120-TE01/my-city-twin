import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/*
 * Rules for the headset menu that no emulator can check, because the
 * failures they prevent only happened on the headset itself.
 */
const FILES = ['VrPanel.tsx', 'vrKit.tsx', 'VrMapPanel.tsx', 'VrTimePanel.tsx', 'vrIcons.ts', 'vrPicture.tsx'];
const source = (file: string) => readFileSync(resolve(__dirname, file), 'utf-8');
const panel = source('VrPanel.tsx');

describe('the headset menu', () => {
  /*
   * THE BLACK SCREEN, TWICE (2026-09-28 and 2026-10-09)
   *
   * Both times the headset showed black from the first second, the emulator
   * was fine, and the headset's log said a uikit component had been given a
   * child it refuses — "the svg component can not have any children", then
   * "the image component …". The component was not at fault: the minifier
   * had given two uikit classes in two chunks the same short name, and
   * uikit's React wrapper registers each component under its class's name,
   * so one was built as the other. The dev server does not minify, which is
   * why the emulator never showed it; an unminified build on the headset was
   * fine. vite.config.ts now keeps class names (keepNames), and this test
   * keeps it so.
   */
  it('builds with class names kept, which uikit registers its components by', () => {
    const config = readFileSync(resolve(__dirname, '../../vite.config.ts'), 'utf-8');
    expect(config).toMatch(/keepNames:\s*true/);
  });

  /*
   * Kept as well: pictures go through vrPicture.tsx, not through uikit's Svg
   * or Image, so a picture is one well-understood plate in a Content.
   */
  it.each(FILES)('%s uses neither the Svg nor the Image component', (file) => {
    const text = source(file);
    for (const banned of ['Svg', 'Image']) {
      expect(text).not.toMatch(new RegExp(`import\\s*\\{[^}]*\\b${banned}\\b[^}]*\\}\\s*from\\s*'@react-three/uikit'`));
      expect(text).not.toMatch(new RegExp(`<${banned}\\b`));
    }
  });

  /*
   * Read at 1 m, 1 mm is 0.057 degrees; under 18 mm (about 1 degree) words blur on a headset's screen
   * (ProjectDoc/vr-ui-redesign/flat-menu-fix.html, 2026-10-19).
   */
  it.each(['VrPanel.tsx', 'vrKit.tsx', 'VrMapPanel.tsx', 'VrTimePanel.tsx'])('%s writes nothing smaller than 18 mm', (file) => {
    const words = [...source(file).matchAll(/<(?:Text|Label)\b[^>]*?(?:fontSize|size)=\{(\d+)\}/g)].map((match) => Number(match[1]));
    expect(words.length).toBeGreaterThan(0);
    expect(words.filter((size) => size < 18)).toEqual([]);
  });

  it('keeps a failure inside the menu from taking the scene down', () => {
    expect(panel).toMatch(/<PanelBoundary>/);
    expect(panel).toMatch(/getDerivedStateFromError/);
  });

  it('only ends the session from the confirmation, never from a button of its own', () => {
    // "Leave VR" (under More) opens the question; "Yes, leave VR" is the
    // only button wired to the exit.
    const exits = [...panel.matchAll(/onExit/g)].length;
    expect(panel).toMatch(/<LeaveDialog[^>]*onLeave=\{menu\.onExit\}/);
    expect(exits).toBe(1);
  });
});

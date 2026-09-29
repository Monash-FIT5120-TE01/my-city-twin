import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

/*
 * Rules for the headset panel that no emulator can check, because the
 * failures they prevent only happened on the Quest.
 */
const panel = readFileSync(resolve(__dirname, 'VrPanel.tsx'), 'utf-8');

describe('the headset panel', () => {
  it('uses no SVG component', () => {
    // On the Quest, uikit's Svg threw "the svg component can not have any
    // children", the scene failed, and the WebGL context was lost: black.
    expect(panel).not.toMatch(/import\s*\{[^}]*\bSvg\b[^}]*\}\s*from\s*'@react-three\/uikit'/);
    expect(panel).not.toMatch(/<Svg\b/);
  });

  it('keeps a failure inside the panel from taking the scene down', () => {
    expect(panel).toMatch(/<PanelBoundary>/);
    expect(panel).toMatch(/getDerivedStateFromError/);
  });
});

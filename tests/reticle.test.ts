/** @vitest-environment jsdom */
import { describe, expect, it } from 'vitest';
import { createReticleUi } from '../src/ui/reticle';

describe('reticle UI', () => {
  it('toggles visibility and hit flash', () => {
    const ui = createReticleUi();
    ui.setState({ visible: true, hasTarget: false });
    const root = document.querySelector('.dr-reticle') as HTMLElement;
    expect(root).toBeTruthy();
    expect(root.style.display).toBe('block');

    ui.setState({ visible: true, hasTarget: true, locked: true, hitFlash: true });
    expect(root.classList.contains('target')).toBe(true);
    expect(root.classList.contains('locked')).toBe(true);
    const hit = document.querySelector('.dr-hit') as HTMLElement;
    expect(hit.classList.contains('on')).toBe(true);
  });
});

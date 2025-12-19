import { describe, expect, it } from 'vitest';
import { computeTargetHighlightVisual } from '../src/render/targetHighlightMath';

describe('computeTargetHighlightVisual', () => {
  it('increases opacity with lock progress when not locked', () => {
    const a = computeTargetHighlightVisual({ lockProgress: 0, locked: false, timeS: 0 });
    const b = computeTargetHighlightVisual({ lockProgress: 1, locked: false, timeS: 0 });
    expect(b.opacity).toBeGreaterThan(a.opacity);
  });

  it('locked state is more intense than unlocked', () => {
    const u = computeTargetHighlightVisual({ lockProgress: 0.5, locked: false, timeS: 0 });
    const l = computeTargetHighlightVisual({ lockProgress: 0.5, locked: true, timeS: 0 });
    expect(l.emissiveIntensity).toBeGreaterThan(u.emissiveIntensity);
    expect(l.opacity).toBeGreaterThan(u.opacity);
  });

  it('outputs remain within reasonable ranges', () => {
    for (const locked of [false, true]) {
      for (const lp of [-2, 0, 0.3, 1, 2]) {
        const v = computeTargetHighlightVisual({ lockProgress: lp, locked, timeS: 12.34 });
        expect(v.scale).toBeGreaterThan(0.5);
        expect(v.scale).toBeLessThan(2.5);
        expect(v.opacity).toBeGreaterThanOrEqual(0);
        expect(v.opacity).toBeLessThanOrEqual(1.2);
      }
    }
  });
});

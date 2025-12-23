import { describe, it, expect } from 'vitest';
import { mulberry32 } from '../src/sim/rng';

describe('mulberry32 RNG contract', () => {
  it('is deterministic for the same seed', () => {
    const a = mulberry32(1337);
    const b = mulberry32(1337);
    const outA = Array.from({ length: 8 }, () => a());
    const outB = Array.from({ length: 8 }, () => b());
    expect(outA).toEqual(outB);
  });

  it('produces numbers in [0,1)', () => {
    const r = mulberry32(42);
    for (let i = 0; i < 64; i++) {
      const v = r();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

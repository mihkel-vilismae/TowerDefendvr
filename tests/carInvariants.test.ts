import { describe, it, expect } from 'vitest';
import { Car } from '../src/game/car';
import { mulberry32 } from '../src/sim/rng';

function isFiniteNumber(n: number) {
  return Number.isFinite(n) && !Number.isNaN(n);
}

describe('Car simulation invariants', () => {
  it('does not generate NaNs and respects maxSpeed clamp under random inputs', () => {
    const c = new Car();
    const rnd = mulberry32(20251223);
    c.maxSpeed = 18;
    // Make it work a bit: a few seconds of mixed inputs.
    for (let i = 0; i < 600; i++) {
      const dt = 1 / 60;
      const accelerate = rnd() > 0.35;
      const brake = rnd() < 0.1;
      const left = rnd() < 0.22;
      const right = rnd() > 0.78;
      c.update(dt, { accelerate, brake, left, right });

      expect(isFiniteNumber(c.position.x)).toBe(true);
      expect(isFiniteNumber(c.position.y)).toBe(true);
      expect(isFiniteNumber(c.velocity.x)).toBe(true);
      expect(isFiniteNumber(c.velocity.y)).toBe(true);
      expect(isFiniteNumber(c.heading)).toBe(true);
      expect(c.velocity.length()).toBeLessThanOrEqual(c.maxSpeed + 1e-6);
    }
  });
});

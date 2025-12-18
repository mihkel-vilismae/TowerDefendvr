import { describe, it, expect } from 'vitest';
import { HealthPickup, AmmoPickup, ShieldPickup, ScorePickup } from '../src/sim/pickups';

describe('pickups expose a position accessor for render layers', () => {
  it('position matches x/y for all pickup types', () => {
    const pickups = [
      new HealthPickup(1, 2, 10),
      new AmmoPickup(-3, 4, 5),
      new ShieldPickup(9, -8, 25),
      new ScorePickup(7, 7, 100)
    ];

    for (const p of pickups) {
      expect(p.position).toEqual({ x: p.x, y: p.y });
      // render layer expects numeric fields
      expect(typeof p.position.x).toBe('number');
      expect(typeof p.position.y).toBe('number');
    }
  });
});

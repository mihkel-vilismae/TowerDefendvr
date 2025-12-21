import { describe, it, expect } from 'vitest';
import { Friendly } from '../src/sim/friendly';

describe('Friendly placement rules', () => {
  it('validates placement within bounds and non-overlapping', () => {
    const existing: Friendly[] = [];
    // within bounds
    expect(Friendly.isPlacementValid(0, 0, existing)).toBe(true);
    // place a unit at (0,0)
    existing.push(new Friendly('auto', 0, 0));
    // overlapping at same location is invalid
    expect(Friendly.isPlacementValid(0, 0, existing)).toBe(false);
    // far away from first unit is valid
    expect(Friendly.isPlacementValid(10, 10, existing)).toBe(true);
    // outside build bounds is invalid
    expect(Friendly.isPlacementValid(200, 200, existing)).toBe(false);
  });
});
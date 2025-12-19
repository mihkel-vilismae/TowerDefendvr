import { describe, expect, it } from 'vitest';
import { WEAPON_VFX } from '../src/render/weaponStyle';

describe('WEAPON_VFX palette', () => {
  it('defines styles for all weapon keys used by the game', () => {
    const keys = Object.keys(WEAPON_VFX).sort();
    expect(keys).toEqual([
      'airstrike',
      'emp',
      'machinegun',
      'minigun',
      'mine',
      'missile',
      'rocket',
      'shotgun',
    ]);
  });

  it('has sensible tracer point counts for tracer-based weapons', () => {
    expect(WEAPON_VFX.machinegun.tracerPoints).toBeGreaterThanOrEqual(6);
    expect(WEAPON_VFX.minigun.tracerPoints).toBeGreaterThan(WEAPON_VFX.machinegun.tracerPoints);
    expect(WEAPON_VFX.shotgun.tracerPoints).toBeGreaterThanOrEqual(4);
  });

  it('colors are valid 24-bit integers', () => {
    for (const style of Object.values(WEAPON_VFX)) {
      for (const k of ['tracerColor', 'trailColor', 'projectileColor', 'impactColor'] as const) {
        const v = style[k];
        expect(Number.isInteger(v)).toBe(true);
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(0xffffff);
      }
    }
  });
});

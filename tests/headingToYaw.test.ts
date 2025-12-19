import { describe, it, expect } from 'vitest';
import { headingToYaw } from '../src/render/headingToYaw';

describe('headingToYaw', () => {
  it('maps heading=0 (sim +X) to yaw=+90° (mesh +Z)', () => {
    expect(headingToYaw(0)).toBeCloseTo(Math.PI * 0.5, 6);
  });

  it('maps heading=+90° (sim +Y) to yaw=0 (mesh +Z rotated to +Y)', () => {
    expect(headingToYaw(Math.PI * 0.5)).toBeCloseTo(0, 6);
  });

  it('is periodic across 2π', () => {
    const a = headingToYaw(0.123);
    const b = headingToYaw(0.123 + Math.PI * 2);
    expect(a).toBeCloseTo(b, 6);
  });
});

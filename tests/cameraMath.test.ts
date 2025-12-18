import { describe, it, expect } from 'vitest';
import { computeDesktopCamera } from '../src/render/cameraMath';

describe('computeDesktopCamera', () => {
  it('top mode positions camera behind player on +Z axis with fixed height', () => {
    const { position, target } = computeDesktopCamera(10, -5, 0, 'top', 80);
    expect(target.x).toBeCloseTo(10);
    expect(target.z).toBeCloseTo(-5);
    expect(position.x).toBeCloseTo(10);
    expect(position.y).toBeCloseTo(65);
    expect(position.z).toBeCloseTo(-5 + 80);
  });

  it('chase mode positions camera behind heading direction', () => {
    // heading 0: forward +X, so "behind" is -X.
    const { position } = computeDesktopCamera(0, 0, 0, 'chase', 50);
    expect(position.x).toBeCloseTo(-50);
    expect(position.y).toBeCloseTo(34);
    expect(position.z).toBeCloseTo(0);
  });
});

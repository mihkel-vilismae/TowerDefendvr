import { describe, expect, it } from 'vitest';
import { RecoilSpring } from '../src/fps/recoil';

describe('RecoilSpring', () => {
  it('kicks and settles back toward zero', () => {
    const s = new RecoilSpring();
    s.kick(1);
    let v = 0;
    // after some updates, value should be non-zero
    for (let i = 0; i < 5; i++) v = s.update(1 / 60);
    expect(Math.abs(v)).toBeGreaterThan(0);
    // after longer, it should settle
    for (let i = 0; i < 240; i++) v = s.update(1 / 60);
    expect(Math.abs(v)).toBeLessThan(0.02);
  });
});

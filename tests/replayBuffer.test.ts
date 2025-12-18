import { describe, it, expect } from 'vitest';
import { ReplayBuffer } from '../src/game/replay';

describe('ReplayBuffer', () => {
  it('keeps only recent frames within maxSeconds', () => {
    const rb = new ReplayBuffer<{ v: number }>(2);
    rb.push(0, { v: 0 });
    rb.push(1, { v: 1 });
    rb.push(2.1, { v: 2 });
    rb.push(2.2, { v: 3 });
    const frames = rb.getLast(10, 2.2);
    // min time should be ~0.2
    expect(frames.some(f => f.t === 0)).toBe(false);
    expect(frames[0].t).toBeGreaterThanOrEqual(0.2);
  });

  it('samples at or before time', () => {
    const rb = new ReplayBuffer<number>(5);
    rb.push(1, 10);
    rb.push(2, 20);
    rb.push(3, 30);
    expect(rb.sampleAt(2.5)?.data).toBe(20);
    expect(rb.sampleAt(3)?.data).toBe(30);
    expect(rb.sampleAt(0.1)?.data).toBe(10);
  });
});

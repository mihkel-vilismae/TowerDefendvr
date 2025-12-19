import { describe, it, expect } from 'vitest';
import { TracerRenderer } from '../src/render/tracers';

describe('TracerRenderer', () => {
  it('adds segments and expires them over time', () => {
    const tr = new TracerRenderer(4);
    tr.add(0, 0, 0, 1, 0, 1, 0xffffff, 0.05);
    // update a little: still alive
    tr.update(0.02);
    // @ts-expect-error accessing private for test via any
    expect((tr as any).segments.length).toBe(1);
    // update beyond lifetime: should be gone
    tr.update(0.2);
    // @ts-expect-error accessing private for test via any
    expect((tr as any).segments.length).toBe(0);
  });

  it('keeps at most maxSegments and drops oldest first', () => {
    const tr = new TracerRenderer(2);
    tr.add(0, 0, 0, 1, 0, 1, 0xff0000, 1);
    tr.add(0, 0, 0, 1, 0, 1, 0x00ff00, 1);
    tr.add(0, 0, 0, 1, 0, 1, 0x0000ff, 1);
    // @ts-expect-error accessing private for test via any
    const segs = (tr as any).segments as any[];
    expect(segs.length).toBe(2);
    // Oldest should have been dropped; remaining should include green and blue
    expect(segs.some((s) => s.color === 0x00ff00)).toBe(true);
    expect(segs.some((s) => s.color === 0x0000ff)).toBe(true);
  });
});

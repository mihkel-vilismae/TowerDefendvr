import { describe, it, expect } from 'vitest';
import { TracerRenderer } from '../src/render/tracers';

describe('TracerRenderer', () => {
  it('adds segments and expires them over time', () => {
    const tr = new TracerRenderer(4);
    tr.add(0, 0, 0, 1, 0, 1, 0xffffff, 0.05);
    // update a little: still alive
    tr.update(0.02);
    expect(tr.getSegmentCount()).toBe(1);
    // update beyond lifetime: should be gone
    tr.update(0.2);
    expect(tr.getSegmentCount()).toBe(0);
  });

  it('keeps at most maxSegments and drops oldest first', () => {
    const tr = new TracerRenderer(2);
    tr.add(0, 0, 0, 1, 0, 1, 0xff0000, 1);
    tr.add(0, 0, 0, 1, 0, 1, 0x00ff00, 1);
    tr.add(0, 0, 0, 1, 0, 1, 0x0000ff, 1);
    expect(tr.getSegmentCount()).toBe(2);
    // Oldest should have been dropped; remaining should include green and blue
    const colors = tr.getSegmentColors();
    expect(colors.includes(0x00ff00)).toBe(true);
    expect(colors.includes(0x0000ff)).toBe(true);
  });
});

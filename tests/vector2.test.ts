import { describe, it, expect } from 'vitest';
import { Vector2 } from '../src/game/vector2';

describe('Vector2', () => {
  it('set updates both components and is chainable', () => {
    const v = new Vector2(1, 2);
    const ret = v.set(9, -3);
    expect(v.x).toBe(9);
    expect(v.y).toBe(-3);
    expect(ret).toBe(v);
  });
});

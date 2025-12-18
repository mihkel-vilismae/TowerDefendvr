import { describe, it, expect } from 'vitest';
import { TargetingSystem } from '../src/sim/targeting';
import { Entity } from '../src/sim/entities';
import { Car } from '../src/game/car';
import { Vector2 } from '../src/game/vector2';

describe('TargetingSystem', () => {
  it('cycles targets in provided order and resets lock progress on cycle', () => {
    const ts = new TargetingSystem();
    const a = new Entity(new Car(), 10);
    const b = new Entity(new Car(), 10);
    const c = new Entity(new Car(), 10);

    expect(ts.cycleTargets([a, b, c])).toBe(a);
    // simulate partial lock
    ts.updateLock(0.2, new Vector2(0, 0), 0, { range: 999, coneRadians: Math.PI, lockTime: 1 });
    expect(ts.cycleTargets([a, b, c])).toBe(b);
    const st = ts.updateLock(0.2, new Vector2(0, 0), 0, { range: 999, coneRadians: Math.PI, lockTime: 1 });
    expect(st.lockProgress01).toBeGreaterThan(0);
  });

  it('lock progresses over time within range and cone', () => {
    const ts = new TargetingSystem();
    const t = new Entity(new Car(), 10);
    t.car.position.x = 5;
    ts.cycleTargets([t]);

    const params = { range: 10, coneRadians: Math.PI / 2, lockTime: 1 };
    // shooter heading 0 -> facing +X, target at +X within cone
    let s = ts.updateLock(0.4, new Vector2(0, 0), 0, params);
    expect(s.locked).toBe(false);
    expect(s.lockProgress01).toBeCloseTo(0.4, 2);
    s = ts.updateLock(0.7, new Vector2(0, 0), 0, params);
    expect(s.locked).toBe(true);
    expect(s.lockProgress01).toBe(1);
  });

  it('lock resets when target is out of range or outside cone', () => {
    const ts = new TargetingSystem();
    const t = new Entity(new Car(), 10);
    t.car.position.x = 5;
    ts.cycleTargets([t]);
    const params = { range: 6, coneRadians: Math.PI / 4, lockTime: 1 };

    // build some progress
    let s = ts.updateLock(0.5, new Vector2(0, 0), 0, params);
    expect(s.lockProgress01).toBeGreaterThan(0);

    // rotate away so target is outside cone
    s = ts.updateLock(0.2, new Vector2(0, 0), Math.PI, params);
    expect(s.lockProgress01).toBe(0);
    expect(s.locked).toBe(false);

    // move target out of range
    t.car.position.x = 50;
    s = ts.updateLock(0.2, new Vector2(0, 0), 0, params);
    expect(s.lockProgress01).toBe(0);
    expect(s.locked).toBe(false);
  });
});

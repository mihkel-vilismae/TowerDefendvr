import { describe, it, expect } from 'vitest';
import { Entity } from '../src/sim/entities';
import { Car } from '../src/game/car';
import { AirstrikeWeapon } from '../src/sim/weapons';
import { AirstrikeInstance } from '../src/sim/game';

describe('AirstrikeWeapon', () => {
  it('schedules an airstrike via sink and respects cooldown', () => {
    const owner = new Entity(new Car(), 100);
    const target = new Entity(new Car(), 100);

    let calls = 0;
    let last: AirstrikeInstance | null = null;
    const sink = {
      addAirstrike: (o: Entity, x: number, y: number, delay: number, radius: number, dmg: number) => {
        calls++;
        last = new AirstrikeInstance(o, x, y, delay, radius, dmg);
      }
    };
    const w = new AirstrikeWeapon(owner, sink, 3.0, 1.0, 5.0, 55);
    expect(w.canFire(0)).toBe(true);
    w.fire(0, target);
    expect(calls).toBe(1);
    expect(last?.position.x).toBe(target.car.position.x);
    expect(w.canFire(1)).toBe(false);
    expect(w.canFire(3.01)).toBe(true);
  });
});

describe('AirstrikeInstance', () => {
  it('damages entities in radius after delay, but respects invulnerability', () => {
    const owner = new Entity(new Car(), 100);
    const victim = new Entity(new Car(), 100);
    victim.car.position.x = 0;
    victim.car.position.y = 0;
    const invuln = new Entity(new Car(), 100);
    invuln.invulnerable = true;
    invuln.car.position.x = 0;
    invuln.car.position.y = 0;

    const strike = new AirstrikeInstance(owner, 0, 0, 0.5, 3, 40);
    expect(victim.hp).toBe(100);
    strike.update(0.25, [owner, victim, invuln]);
    expect(victim.hp).toBe(100);
    strike.update(0.30, [owner, victim, invuln]);
    expect(victim.hp).toBe(60);
    expect(invuln.hp).toBe(100);
  });
});
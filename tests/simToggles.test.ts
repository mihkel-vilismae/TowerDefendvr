import { describe, it, expect } from 'vitest';
import { GameSimulation, OnlookerKillRule } from '../src/sim/game';
import { Entity, Enemy } from '../src/sim/entities';
import { Car } from '../src/game/car';
import { MachineGun } from '../src/sim/weapons';

describe('GameSimulation toggles', () => {
  it('freezeEnemiesMovement prevents enemy position updates', () => {
    const player = new Entity(new Car(), 100);
    const sim = new GameSimulation(player, { onlookerRule: OnlookerKillRule.ArcadeBonus });
    const e = new Enemy(new Car(), 100);
    e.car.position.x = 0;
    e.car.position.y = 0;
    // give it movement intent
    sim.enemies.push(e);
    sim.freezeEnemiesMovement = true;
    sim.update(0.5);
    expect(e.car.position.x).toBe(0);
    expect(e.car.position.y).toBe(0);
  });

  it('disableEnemyAttacks prevents firing effects', () => {
    const player = new Entity(new Car(), 100);
    const sim = new GameSimulation(player, { onlookerRule: OnlookerKillRule.ArcadeBonus });
    const e = new Enemy(new Car(), 100);
    e.car.position.x = 2;
    e.car.position.y = 0;
    player.car.position.x = 0;
    player.car.position.y = 0;
    e.weapons.push(new MachineGun(e, 0.05, null, 10, 10));
    sim.enemies.push(e);
    sim.disableEnemyAttacks = true;
    sim.update(0.2);
    expect(player.hp).toBe(100);
  });
});

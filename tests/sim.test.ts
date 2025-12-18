import { describe, it, expect } from 'vitest';
import { Car } from '../src/game/car';
import { Entity, Enemy } from '../src/sim/entities';
import { MachineGun, MineWeapon, HomingMissileWeapon } from '../src/sim/weapons';
import { GameSimulation, OnlookerKillRule } from '../src/sim/game';

describe('simulation basics', () => {
  it('machine gun respects cooldown at sim time', () => {
    const pCar = new Car();
    const eCar = new Car();
    const player = new Entity(pCar, 100);
    const enemy = new Entity(eCar, 50);
    const mg = new MachineGun(player, 1, null, 100, 5);
    player.weapons.push(mg);

    mg.fire(0, enemy);
    expect(enemy.hp).toBe(45);

    mg.fire(0.5, enemy); // still on cooldown
    expect(enemy.hp).toBe(45);

    mg.fire(1.01, enemy);
    expect(enemy.hp).toBe(40);
  });

  it('mine arms then explodes on proximity', () => {
    const pCar = new Car();
    const eCar = new Car();
    const player = new Entity(pCar, 100);
    const enemy = new Entity(eCar, 50);
    enemy.car.position.x = 2;
    const mines = new MineWeapon(player, 0, null, 0.25, 3, 10);
    player.weapons.push(mines);
    mines.fire(0, enemy);
    expect(mines.activeMines.length).toBe(1);
    mines.updateMines(0.1, [player, enemy]);
    expect(enemy.hp).toBe(50);
    mines.updateMines(0.2, [player, enemy]);
    expect(enemy.hp).toBe(40);
  });

  it('homing missile moves toward target and damages in radius', () => {
    const pCar = new Car();
    const eCar = new Car();
    const player = new Entity(pCar, 100);
    const enemy = new Entity(eCar, 50);
    enemy.car.position.x = 5;
    const hm = new HomingMissileWeapon(player, 0, null, 10, 10, 1.5, 20);
    player.weapons.push(hm);
    hm.fire(0, enemy);
    expect(hm.missiles.length).toBe(1);
    for (let i = 0; i < 60; i++) hm.updateMissiles(1 / 60);
    expect(enemy.hp).toBeLessThan(50);
  });

  it('game sim removes dead enemy and awards score', () => {
    const p = new Entity(new Car(), 100);
    const sim = new GameSimulation(p, { onlookerRule: OnlookerKillRule.ArcadeBonus });
    const e = new Enemy(new Car(), 10);
    sim.addEnemy(e);
    e.takeDamage(999);
    sim.update(0.016);
    expect(sim.score).toBeGreaterThanOrEqual(100);
  });
});

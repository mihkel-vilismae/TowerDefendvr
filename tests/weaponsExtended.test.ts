import { describe, it, expect } from 'vitest';
import { Car } from '../src/game/car';
import { Entity, Enemy } from '../src/sim/entities';
import { BazookaWeapon, GrenadeLauncher, FlamethrowerWeapon, Minigun } from '../src/sim/weapons';
import { GameSimulation, OnlookerKillRule } from '../src/sim/game';

describe('extended weapons', () => {
  it('bazooka (rocket) damages target via sim projectile updates', () => {
    const player = new Entity(new Car(), 100);
    const enemy = new Enemy(new Car(), 120);
    enemy.car.position.x = 10;

    const bazooka = new BazookaWeapon(player, 0, 2, 30, 4, 50);
    player.weapons.push(bazooka);

    const sim = new GameSimulation(player, { onlookerRule: OnlookerKillRule.ArcadeBonus });
    sim.addEnemy(enemy);

    bazooka.fire(0, enemy);
    expect(bazooka.ammo).toBe(1);

    // advance a bit; rocket should reach and explode
    for (let i = 0; i < 120; i++) sim.update(1 / 60);
    expect(enemy.hp).toBeLessThan(120);
  });

  it('grenade launcher explodes after fuse and applies splash damage', () => {
    const player = new Entity(new Car(), 100);
    const enemy = new Enemy(new Car(), 60);
    // Place enemy so grenade will detonate within splash radius.
    enemy.car.position.x = 3;

    const gl = new GrenadeLauncher(player, 0, 3, 10, 0.2, 5, 25);
    player.weapons.push(gl);

    const sim = new GameSimulation(player, { onlookerRule: OnlookerKillRule.ArcadeBonus });
    sim.addEnemy(enemy);

    gl.fire(0, enemy);
    expect(gl.grenades.length).toBe(1);

    // move sim past fuse time
    for (let i = 0; i < 30; i++) sim.update(1 / 60);
    expect(gl.grenades.length).toBe(0);
    expect(enemy.hp).toBe(35);
  });

  it('flamethrower applies cone damage only to targets in front', () => {
    const player = new Entity(new Car(), 100);
    player.car.heading = 0; // facing +X

    const front = new Enemy(new Car(), 30);
    front.car.position.x = 5;
    front.car.position.y = 0;

    const behind = new Enemy(new Car(), 30);
    behind.car.position.x = -5;
    behind.car.position.y = 0;

    const flame = new FlamethrowerWeapon(player, 0, null, 10, Math.PI / 3, 3);
    player.weapons.push(flame);

    // cooldown 0, so it can spray immediately
    flame.spray(0, [front, behind]);
    expect(front.hp).toBe(27);
    expect(behind.hp).toBe(30);
  });

  it('minigun fires faster than machinegun and respects cooldown', () => {
    const player = new Entity(new Car(), 100);
    const enemy = new Entity(new Car(), 50);
    const mg = new Minigun(player, 0.05, null, 20, 2);
    player.weapons.push(mg);

    mg.fire(0.0, enemy);
    expect(enemy.hp).toBe(48);

    mg.fire(0.02, enemy); // still on cooldown
    expect(enemy.hp).toBe(48);

    mg.fire(0.051, enemy);
    expect(enemy.hp).toBe(46);
  });
});

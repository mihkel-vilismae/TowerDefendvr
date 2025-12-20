import { Enemy, Entity } from './entities';
import { GameSimulation } from './game';
import { Vector2 } from '../game/vector2';
import { Car } from '../game/car';

/**
 * A simple tower that automatically damages the nearest enemy within range.
 * Towers do not occupy grid tiles; they are free-form objects placed at given
 * world coordinates (sim X/Y). They manage their own firing cooldown and
 * damage output. Visuals are handled externally by the caller.
 */
export class Tower {
  /** Position in simulation coordinates. */
  position: Vector2;
  /** Damage radius for this tower. */
  range: number;
  /** Seconds between consecutive shots. */
  cooldown: number;
  /** Damage dealt per shot. */
  damage: number;
  private lastFireTime: number = -Infinity;

  constructor(x: number, y: number, range = 35, cooldown = 0.8, damage = 8) {
    this.position = new Vector2(x, y);
    this.range = range;
    this.cooldown = cooldown;
    this.damage = damage;
  }

  /**
   * Update tower logic: if the cooldown has expired, find the closest live enemy
   * within range and apply damage. Returns true if a shot was fired.
   */
  update(simTime: number, enemies: Enemy[]): boolean {
    if (simTime < this.lastFireTime + this.cooldown) return false;
    let target: Enemy | null = null;
    let minDist = Infinity;
    for (const e of enemies) {
      if (!e.alive) continue;
      const dx = e.car.position.x - this.position.x;
      const dy = e.car.position.y - this.position.y;
      const d2 = dx * dx + dy * dy;
      if (d2 <= this.range * this.range && d2 < minDist) {
        target = e;
        minDist = d2;
      }
    }
    if (target) {
      target.takeDamage(this.damage);
      this.lastFireTime = simTime;
      return true;
    }
    return false;
  }
}

/**
 * TowerDefence manager responsible for spawning waves of enemies and updating
 * towers every simulation tick. A wave spawns when there are no enemies
 * remaining. Each wave increases the enemy count by one to gradually ramp
 * difficulty. Enemies spawned by this class have no weapons (they rely
 * entirely on their ramming damage) and simple behaviour defined in
 * Enemy.aiUpdate.
 */
export class TowerDefense {
  private sim: GameSimulation;
  private towers: Tower[] = [];
  private wave: number = 0;
  constructor(sim: GameSimulation) {
    this.sim = sim;
  }

  /** Add a tower to the defence system. */
  addTower(tower: Tower): void {
    this.towers.push(tower);
  }

  /**
   * Spawn the next wave of enemies. Enemies appear at the edges of the arena and
   * drive toward the centre by using the existing AI. To keep things simple,
   * enemies spawned here are standard ground vehicles without weapons.
   */
  private spawnWave(): void {
    this.wave++;
    // base count grows with wave number to slowly ramp difficulty
    const count = 2 + this.wave;
    for (let i = 0; i < count; i++) {
      const e = new Enemy(new Car(), 60);
      // choose a random side of the square arena to spawn
      const side = Math.floor(Math.random() * 4);
      const dist = 90; // spawn slightly outside the play area to give players a warning
      let x = 0;
      let y = 0;
      if (side === 0) { x = -dist; y = (Math.random() - 0.5) * 160; }
      else if (side === 1) { x = dist; y = (Math.random() - 0.5) * 160; }
      else if (side === 2) { x = (Math.random() - 0.5) * 160; y = -dist; }
      else { x = (Math.random() - 0.5) * 160; y = dist; }
      e.car.position.x = x;
      e.car.position.y = y;
      // Increase awareness so towers are engaged quickly
      e.sightRange = 70;
      e.fov = Math.PI;
      // Remove default weapons – towers will do the shooting
      e.weapons = [];
      this.sim.addEnemy(e);
    }
  }

  /**
   * Should be called once per simulation step to update towers and spawn waves.
   */
  update(simTime: number): void {
    // First update all towers so they can fire on current enemies.
    for (const t of this.towers) {
      t.update(simTime, this.sim.enemies);
    }
    // If there are no active enemies, start the next wave.
    if (this.sim.enemies.length === 0) {
      this.spawnWave();
    }
  }
}
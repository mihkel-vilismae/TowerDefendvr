import { Car } from '../game/car';
import { Enemy, Onlooker, Entity } from './entities';
import { MachineGun, MineWeapon, HomingMissileWeapon, RocketWeapon, Shotgun, EMPWeapon } from './weapons';
import { Pickup, HealthPickup, AmmoPickup, ShieldPickup, ScorePickup, WeaponPickup } from './pickups';
import { Vector2 } from '../game/vector2';

export class AirstrikeInstance {
  owner: Entity;
  position: Vector2;
  delay: number;
  radius: number;
  damage: number;
  elapsed: number = 0;
  exploded: boolean = false;

  constructor(owner: Entity, x: number, y: number, delay: number, radius: number, damage: number) {
    this.owner = owner;
    this.position = new Vector2(x, y);
    this.delay = delay;
    this.radius = radius;
    this.damage = damage;
  }

  update(dt: number, entities: Entity[]): boolean {
    if (this.exploded) return true;
    this.elapsed += dt;
    if (this.elapsed < this.delay) return false;

    // Explode
    const r2 = this.radius * this.radius;
    for (const e of entities) {
      if (!e.alive) continue;
      if (e === this.owner) continue;
      const dx = e.car.position.x - this.position.x;
      const dy = e.car.position.y - this.position.y;
      if (dx * dx + dy * dy <= r2) {
        e.takeDamage(this.damage);
      }
    }
    this.exploded = true;
    return true;
  }
}

/**
 * Options for scoring behaviour when killing non-hostile onlookers.
 */
export enum OnlookerKillRule {
  ArcadeBonus, // give a small bonus and increase heat
  Penalty // subtract points and increase heat
}

export interface GameOptions {
  onlookerRule: OnlookerKillRule;
}

/**
 * Main game simulation. This class holds the state of all entities, projectiles,
 * pickups and the scoring system. It exposes an `update` method which advances
 * the simulation by a fixed timestep. Rendering is handled elsewhere.
 */
export class GameSimulation {
  simTime: number = 0;
  player: Entity;
  enemies: Enemy[] = [];
  onlookers: Onlooker[] = [];
  pickups: Pickup[] = [];
  score: number = 0;
  multiplier: number = 1;
  streak: number = 0;
  heat: number = 0; // wanted level; increases on onlooker kills
  options: GameOptions;

  /** Debug/gameplay toggles controlled by UI. */
  freezeEnemiesMovement: boolean = false;
  disableEnemyAttacks: boolean = false;

  /** Pending airstrikes (helicopter-only weapon). */
  airstrikes: AirstrikeInstance[] = [];
  // timers for spawning
  enemySpawnCooldown = 5;
  pickupSpawnCooldown = 10;
  timeSinceEnemySpawn = 0;
  timeSincePickupSpawn = 0;
  // projectiles updates
  private mineWeapons: MineWeapon[] = [];
  private homingWeapons: HomingMissileWeapon[] = [];
  private rocketWeapons: RocketWeapon[] = [];

  constructor(player: Entity, options: GameOptions) {
    this.player = player;
    this.options = options;
  }

  addEnemy(enemy: Enemy): void {
    this.enemies.push(enemy);
    for (const w of enemy.weapons) {
      if (w instanceof MineWeapon) this.mineWeapons.push(w);
      else if (w instanceof HomingMissileWeapon) this.homingWeapons.push(w);
      else if (w instanceof RocketWeapon) this.rocketWeapons.push(w);
    }
  }

  /**
   * Adds a pickup to the world.
   */
  addPickup(pickup: Pickup): void {
    this.pickups.push(pickup);
  }

  /** Adds a pending airstrike. */
  addAirstrike(strike: AirstrikeInstance): void {
    this.airstrikes.push(strike);
  }

  /**
   * Updates the simulation by dt seconds. Inputs for player must be handled externally
   * by updating the player's Car before calling this method. Enemy AI will be updated here.
   */
  update(dt: number): void {
    this.simTime += dt;

    // Expire temporary effects
    const entitiesAll = [this.player, ...this.enemies, ...this.onlookers];
    for (const ent of entitiesAll) {
      if (this.simTime >= ent.moveScaleUntil) {
        ent.moveScale = 1;
      }
    }
    // 1. Update AI for enemies
    for (const enemy of this.enemies) {
      if (!enemy.alive) continue;
      enemy.aiUpdate(this.simTime, dt, this.player, [], {
        allowMove: !this.freezeEnemiesMovement,
        allowAttack: !this.disableEnemyAttacks,
      });
    }
    // 2. Update Onlookers wandering
    for (const ol of this.onlookers) {
      if (!ol.alive) continue;
      ol.update(dt);
    }
    // 3. Update mines and rockets and missiles
    for (const mineW of this.mineWeapons) {
      mineW.updateMines(dt, [this.player, ...this.enemies, ...this.onlookers]);
    }
    for (const homW of this.homingWeapons) {
      homW.updateMissiles(dt);
    }
    for (const rw of this.rocketWeapons) {
      rw.updateRockets(dt);
    }

    // 3b. Update airstrikes
    if (this.airstrikes.length > 0) {
      const ents = [this.player, ...this.enemies, ...this.onlookers];
      for (let i = this.airstrikes.length - 1; i >= 0; i--) {
        const strike = this.airstrikes[i];
        const done = strike.update(dt, ents);
        if (done) this.airstrikes.splice(i, 1);
      }
    }

    // 4. Handle pickups collisions with player and enemies
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const p = this.pickups[i];
      // Only player can pick up for now
      if (p.collides(this.player)) {
        p.applyTo(this.player);
        // scoring for score pickups handled externally
        if (p instanceof ScorePickup) {
          this.addScore(p.value);
        }
        this.pickups.splice(i, 1);
        continue;
      }
    }
    // 5. Check for deaths and update score + respawn
    // Player death not handled (game over) for simplicity
    for (let i = this.enemies.length - 1; i >= 0; i--) {
      const e = this.enemies[i];
      if (!e.alive) {
        this.enemies.splice(i, 1);
        this.addScore(100 * this.multiplier);
        this.streak++;
        this.updateMultiplier();
      }
    }
    for (let i = this.onlookers.length - 1; i >= 0; i--) {
      const ol = this.onlookers[i];
      if (!ol.alive) {
        this.onlookers.splice(i, 1);
        // scoring rule for onlooker kill
        if (this.options.onlookerRule === OnlookerKillRule.ArcadeBonus) {
          this.addScore(10);
          this.heat += 1;
        } else if (this.options.onlookerRule === OnlookerKillRule.Penalty) {
          this.score = Math.max(0, this.score - 20);
          this.heat += 1;
        }
        this.streak++;
        this.updateMultiplier();
      }
    }
    // 6. Spawn new enemies and pickups periodically
    this.timeSinceEnemySpawn += dt;
    if (this.timeSinceEnemySpawn >= this.enemySpawnCooldown) {
      this.spawnEnemy();
      this.timeSinceEnemySpawn = 0;
    }
    this.timeSincePickupSpawn += dt;
    if (this.timeSincePickupSpawn >= this.pickupSpawnCooldown) {
      this.spawnRandomPickup();
      this.timeSincePickupSpawn = 0;
    }
  }

  /** Updates multiplier based on streak; resets multiplier if streak resets due to damage etc. */
  updateMultiplier(): void {
    // Simple rule: every 3 consecutive kills increments multiplier by 1, max 5
    this.multiplier = 1 + Math.min(4, Math.floor(this.streak / 3));
  }

  /** Adds points to score (no multiplier applied because caller should include it). */
  addScore(points: number): void {
    this.score += Math.floor(points);
  }

  /** Spawns a simple enemy with base weapons */
  spawnEnemy(): void {
    // Create new Car starting at random position around arena origin
    const car = new Car();
    car.position.x = (Math.random() - 0.5) * 50;
    car.position.y = (Math.random() - 0.5) * 50;
    const enemy = new Enemy(car, 50);
    enemy.chooseRandomPark(80);
    // Give enemy basic MG and occasional mine
    enemy.weapons.push(new MachineGun(enemy, 0.5, null, 30, 5));
    enemy.weapons.push(new MineWeapon(enemy, 5, 5, 1, 5, 10));
    this.addEnemy(enemy);
  }

  /** Spawns a random pickup */
  spawnRandomPickup(): void {
    const px = (Math.random() - 0.5) * 50;
    const py = (Math.random() - 0.5) * 50;
    const roll = Math.random();
    if (roll < 0.3) {
      this.addPickup(new HealthPickup(px, py, 30));
    } else if (roll < 0.5) {
      this.addPickup(new AmmoPickup(px, py, 5));
    } else if (roll < 0.7) {
      this.addPickup(new ShieldPickup(px, py, 20));
    } else if (roll < 0.85) {
      // score pickup
      this.addPickup(new ScorePickup(px, py, 50));
    } else {
      // random weapon pickup: shotgun or rocket or emp
      // We'll use player's entity as temporary owner (owner will be updated when picked)
      const dummyOwner = this.player;
      const choice = Math.random();
      let weapon;
      if (choice < 0.33) {
        weapon = new Shotgun(dummyOwner, 1.5, 5, 20, Math.PI / 3, 8, 10);
      } else if (choice < 0.66) {
        weapon = new RocketWeapon(dummyOwner, 3, 3, 25, 3, 20);
      } else {
        weapon = new EMPWeapon(dummyOwner, 5, 2, 15, 3, 0.5);
      }
      this.addPickup(new WeaponPickup(px, py, weapon));
    }
  }
}

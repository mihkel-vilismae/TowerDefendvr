import { Car } from '../game/car';
import { Vector2 } from '../game/vector2';

/**
 * Base entity class. An entity wraps a `Car` for movement and stores HP/weapon inventory.
 */
export class Entity {
  car: Car;
  maxHP: number;
  hp: number;
  alive: boolean;
  weapons: WeaponBase[] = [];
  /** Multiplicative movement scaling, e.g. from EMP slow. */
  moveScale: number = 1;
  /** If > simTime, moveScale is considered active (EMP slow). */
  moveScaleUntil: number = 0;
  /** If > simTime, entity cannot fire weapons (EMP disable). */
  weaponsDisabledUntil: number = 0;

  /** If true, entity cannot take damage (used for player helicopter). */
  invulnerable: boolean = false;

  /** If true, renderer may lift this entity above ground (helicopters). */
  hovering: boolean = false;

  constructor(car: Car, maxHP: number) {
    this.car = car;
    this.maxHP = maxHP;
    this.hp = maxHP;
    this.alive = true;
  }

  /**
   * Inflict damage on this entity. Marks entity as dead when HP <= 0.
   */
  takeDamage(amount: number): void {
    if (this.invulnerable) return;
    if (!this.alive) return;
    if (this.invulnerable) return;
    this.hp -= amount;
    if (this.hp <= 0) {
      this.hp = 0;
      this.alive = false;
    }
  }

  /**
   * Heal this entity by a given amount up to max HP.
   */
  heal(amount: number): void {
    if (!this.alive) return;
    this.hp = Math.min(this.maxHP, this.hp + amount);
  }
}

export function applyEMP(simTime: number, target: Entity, duration: number, slowFactor: number): void {
  target.weaponsDisabledUntil = Math.max(target.weaponsDisabledUntil, simTime + duration);
  target.moveScale = Math.min(target.moveScale, slowFactor);
  target.moveScaleUntil = Math.max(target.moveScaleUntil, simTime + duration);
}

/**
 * Enemy entity. Enemies have simple AI: seek player and optionally attack.
 */
export class Enemy extends Entity {
  /** simplistic AI update: accelerate toward player and optionally fire weapons */
  aiUpdate(
    simTime: number,
    dt: number,
    player: Entity,
    obstacles: Vector2[],
    opts: { allowMove?: boolean; allowAttack?: boolean } = {}
  ): void {
    const allowMove = opts.allowMove !== false;
    const allowAttack = opts.allowAttack !== false;
    // Seek player: compute vector from enemy to player and accelerate toward it
    const toPlayer = new Vector2(player.car.position.x - this.car.position.x,
                                player.car.position.y - this.car.position.y);
    // Determine if we should turn left or right based on cross product sign
    const forward = Vector2.fromAngle(this.car.heading);
    const cross = forward.x * toPlayer.y - forward.y * toPlayer.x;
    const input = {
      accelerate: true,
      brake: false,
      left: cross < 0,
      right: cross > 0
    };
    // Drive the car
    if (allowMove) {
      this.car.update(dt, input);
    }
    // Simple avoidance: if near any obstacle, turn away (not implemented due to time)
    // Weapon usage: fire first available weapon if target in range
    if (allowAttack && simTime >= this.weaponsDisabledUntil) {
      for (const weapon of this.weapons) {
        if (weapon.autoFire && weapon.canFire(simTime)) {
          // For AI, always choose player as target
          weapon.fire(simTime, player);
          break;
        }
      }
    }
  }
}

/**
 * Onlooker entity. They wander slowly or stand still.
 */
export class Onlooker extends Entity {
  wanderTimer = 0;

  update(dt: number): void {
    // Simple wandering: every few seconds, choose a random heading and speed
    this.wanderTimer -= dt;
    if (this.wanderTimer <= 0) {
      this.wanderTimer = 3 + Math.random() * 5;
      this.car.heading = Math.random() * Math.PI * 2;
      // Assign a slow speed by setting velocity directly
      const dir = Vector2.fromAngle(this.car.heading);
      this.car.velocity = dir.scale(2);
    }
    // friction slows them down
    this.car.update(dt, { accelerate: false, brake: false, left: false, right: false });
  }
}

/**
 * Simplified weapon base class. Real weapon classes should extend this.
 * We keep it here so Entity can reference without circular import.
 */
export abstract class WeaponBase {
  owner: Entity;
  cooldown: number;
  lastFireTime = -Infinity;
  ammo: number | null; // null means infinite
  autoFire: boolean;

  constructor(owner: Entity, cooldown: number, ammo: number | null = null, autoFire = false) {
    this.owner = owner;
    this.cooldown = cooldown;
    this.ammo = ammo;
    this.autoFire = autoFire;
  }

  /** Returns true if weapon can fire at the given simulation time (seconds). */
  canFire(simTime: number): boolean {
    return this.ammo !== 0 && (simTime - this.lastFireTime) >= this.cooldown;
  }

  /**
   * Fires the weapon at the specified target. Concrete classes override this to implement
   * specific behaviour. By default, decreases ammo and sets lastFireTime.
   */
  fire(simTime: number, target: Entity): void {
    if (!this.canFire(simTime)) return;
    this.lastFireTime = simTime;
    if (this.ammo !== null) {
      this.ammo!--;
    }
    // default weapon does nothing.
  }
}
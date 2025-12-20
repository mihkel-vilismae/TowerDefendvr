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
  /** Where this enemy prefers to park/idle. */
  parkPos: Vector2 = new Vector2(0, 0);
  /** If true, enemy is currently in "attack" mode. */
  attacking: boolean = false;
  /** Detection range in sim units. Increased so enemies react from farther away. */
  sightRange: number = 60;
  /** Field of view (radians). Broader FOV makes enemy AI feel more aware. */
  fov: number = Math.PI * 0.8;
  /** If > simTime, enemy will keep attacking even if LOS drops briefly. */
  attackGraceUntil: number = 0;

  /** Call after spawning to give this enemy a random idle destination. */
  chooseRandomPark(areaRadius: number): void {
    this.parkPos = new Vector2((Math.random() - 0.5) * areaRadius, (Math.random() - 0.5) * areaRadius);
    // Start roughly facing randomly so parked enemies look natural.
    this.car.heading = Math.random() * Math.PI * 2;
  }

  private angleDiff(a: number, b: number): number {
    // returns signed smallest difference a-b in [-pi, pi]
    let d = a - b;
    while (d > Math.PI) d -= Math.PI * 2;
    while (d < -Math.PI) d += Math.PI * 2;
    return d;
  }

  private canSeePlayer(player: Entity): boolean {
    const dx = player.car.position.x - this.car.position.x;
    const dy = player.car.position.y - this.car.position.y;
    const d2 = dx * dx + dy * dy;
    if (d2 > this.sightRange * this.sightRange) return false;

    const desired = Math.atan2(dy, dx);
    const diff = Math.abs(this.angleDiff(desired, this.car.heading));
    return diff <= this.fov * 0.5;
  }

  /** simplistic AI update: park/idle until the player is seen, then attack. */
  aiUpdate(
    simTime: number,
    dt: number,
    player: Entity,
    obstacles: Vector2[],
    opts: { allowMove?: boolean; allowAttack?: boolean } = {}
  ): void {
    const allowMove = opts.allowMove !== false;
    const allowAttack = opts.allowAttack !== false;

    // Acquire / maintain aggro
    const sees = this.canSeePlayer(player);
    if (sees) {
      this.attacking = true;
      this.attackGraceUntil = Math.max(this.attackGraceUntil, simTime + 1.2);
    } else if (simTime > this.attackGraceUntil) {
      this.attacking = false;
    }

    // Decide driving target: park position or player
    const tx = this.attacking ? player.car.position.x : this.parkPos.x;
    const ty = this.attacking ? player.car.position.y : this.parkPos.y;

    const toTarget = new Vector2(tx - this.car.position.x, ty - this.car.position.y);
    const dist = Math.sqrt(toTarget.x * toTarget.x + toTarget.y * toTarget.y);

    // If parked and close, stop moving (looks like "parked in area")
    const shouldMove = this.attacking ? (dist > 2.0) : (dist > 1.25);

    const desiredHeading = Math.atan2(toTarget.y, toTarget.x);
    const diff = this.angleDiff(desiredHeading, this.car.heading);

    const input = {
      accelerate: shouldMove,
      brake: !shouldMove,
      left: diff < -0.08,
      right: diff > 0.08,
    };

    if (allowMove) {
      this.car.update(dt, input);
    }

    // Weapon usage: fire first available weapon if target in range and in attack mode
    if (this.attacking && allowAttack && simTime >= this.weaponsDisabledUntil) {
      for (const weapon of this.weapons) {
        if (weapon.autoFire && weapon.canFire(simTime)) {
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
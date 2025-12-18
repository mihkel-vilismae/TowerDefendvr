import { Entity, WeaponBase } from './entities';

export enum PickupType {
  Health,
  Ammo,
  Weapon,
  Shield,
  Score
}

/**
 * Base class for pickups. Pickups exist in the world and when collected
 * apply an effect to the collector.
 */
export abstract class Pickup {
  x: number;
  y: number;
  type: PickupType;
  radius: number;
  constructor(x: number, y: number, type: PickupType, radius: number = 5) {
    this.x = x;
    this.y = y;
    this.type = type;
    this.radius = radius;
  }
  /** returns true if entity is within pickup radius */
  collides(entity: Entity): boolean {
    const dx = entity.car.position.x - this.x;
    const dy = entity.car.position.y - this.y;
    return dx * dx + dy * dy <= this.radius * this.radius;
  }
  abstract applyTo(entity: Entity): void;
}

/** Health pack: heals entity by fixed amount up to max HP. */
export class HealthPickup extends Pickup {
  amount: number;
  constructor(x: number, y: number, amount: number) {
    super(x, y, PickupType.Health);
    this.amount = amount;
  }
  applyTo(entity: Entity): void {
    entity.heal(this.amount);
  }
}

/** Ammo pack: adds ammo to all weapons of entity. */
export class AmmoPickup extends Pickup {
  amount: number;
  constructor(x: number, y: number, amount: number) {
    super(x, y, PickupType.Ammo);
    this.amount = amount;
  }
  applyTo(entity: Entity): void {
    for (const w of entity.weapons) {
      if (w.ammo !== null) w.ammo += this.amount;
    }
  }
}

/** Weapon pickup: grants a new weapon to entity for limited ammo or time. */
export class WeaponPickup extends Pickup {
  weapon: WeaponBase;
  constructor(x: number, y: number, weapon: WeaponBase) {
    super(x, y, PickupType.Weapon);
    this.weapon = weapon;
  }
  applyTo(entity: Entity): void {
    // Add weapon to entity's inventory
    entity.weapons.push(this.weapon);
  }
}

/** Shield pickup: increases entity's HP temporarily (acts as extra buffer). */
export class ShieldPickup extends Pickup {
  extraHP: number;
  constructor(x: number, y: number, extraHP: number) {
    super(x, y, PickupType.Shield);
    this.extraHP = extraHP;
  }
  applyTo(entity: Entity): void {
    entity.maxHP += this.extraHP;
    entity.hp += this.extraHP;
  }
}

/** Score pickup: increases player's score or multiplier. Score logic handled outside. */
export class ScorePickup extends Pickup {
  value: number;
  constructor(x: number, y: number, value: number) {
    super(x, y, PickupType.Score);
    this.value = value;
  }
  applyTo(entity: Entity): void {
    // Score is managed by simulation; no direct effect here
  }
}
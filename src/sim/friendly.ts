import { Vector2 } from '../game/vector2';
import { Enemy } from './entities';

// Types of friendly units. More types can be added in future as tech unlocks.
// Types of friendly units. Additional types may be unlocked via tech.
export type FriendlyType = 'auto' | 'sniper' | 'emp' | 'trooper' | 'missile';

/**
 * Base class for friendly units and towers that the player can build.
 * Each friendly has a position in sim coordinates, a cost, a bounding radius
 * used for placement collision checks, and simple combat stats. Troopers can
 * optionally move (targetPosition is used by the command system).
 */
export class Friendly {
  static nextId = 1;
  readonly id: number;
  readonly type: FriendlyType;
  position: Vector2;
  /** Credit cost to build this unit. */
  readonly cost: number;
  /** Collision radius used to prevent overlapping placement. */
  readonly radius: number;
  /** Attack range (for auto, sniper, emp; trooper uses default range). */
  readonly range: number;
  /** Seconds between shots. */
  readonly cooldown: number;
  /** Damage per shot or effect strength. */
  readonly damage: number;
  private lastFireTime: number = -Infinity;
  // For movable units like troopers: optional target destination
  targetPosition: Vector2 | null = null;

  constructor(type: FriendlyType, x: number, y: number) {
    this.id = Friendly.nextId++;
    this.type = type;
    this.position = new Vector2(x, y);
    // Define default stats per type
    switch (type) {
      case 'auto':
        this.cost = 50;
        this.radius = 2.0;
        this.range = 30;
        this.cooldown = 0.6;
        this.damage = 6;
        break;
      case 'sniper':
        this.cost = 75;
        this.radius = 2.0;
        this.range = 60;
        this.cooldown = 1.4;
        this.damage = 12;
        break;
      case 'emp':
        this.cost = 60;
        this.radius = 2.0;
        this.range = 25;
        this.cooldown = 3.5;
        this.damage = 0; // EMP deals no damage directly
        break;
      case 'trooper':
        this.cost = 120;
        this.radius = 2.2;
        this.range = 25;
        this.cooldown = 0.8;
        this.damage = 4;
        break;
      case 'missile':
        // Missile turret: high damage, long range, slow rate. Unlock via tech.
        this.cost = 200;
        this.radius = 2.5;
        this.range = 55;
        this.cooldown = 1.8;
        this.damage = 18;
        break;
      default:
        this.cost = 0;
        this.radius = 2.0;
        this.range = 25;
        this.cooldown = 1.0;
        this.damage = 1;
    }
  }

  /**
   * Check if a new unit can be placed at (x, y) given existing friendlies. It
   * ensures the placement is within arena bounds (±95 units) and does not
   * overlap any existing friendly's radius. This function intentionally
   * ignores roads: it uses a simple square boundary for build zones.
   */
  static isPlacementValid(x: number, y: number, existing: Friendly[], bound: number = 95): boolean {
    // must be within square area centered at origin
    if (x < -bound || x > bound || y < -bound || y > bound) return false;
    // cannot overlap existing friendlies
    for (const f of existing) {
      const dx = f.position.x - x;
      const dy = f.position.y - y;
      const dist2 = dx * dx + dy * dy;
      const minDist = f.radius * f.radius * 4; // approximate sum of radii squared
      if (dist2 < minDist) return false;
    }
    return true;
  }

  /**
   * Update this friendly during combat. Auto/sniper/emp units attempt to
   * attack the nearest enemy if the cooldown has elapsed and the enemy is
   * within range. Troopers follow their targetPosition if set. For EMP type,
   * this method reduces the enemy's moveScale for a short duration instead of
   * dealing damage.
   */
  update(simTime: number, enemies: Enemy[]): void {
    // Move troopers toward targetPosition if assigned
    if (this.type === 'trooper' && this.targetPosition) {
      const tp = this.targetPosition;
      const dx = tp.x - this.position.x;
      const dy = tp.y - this.position.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > 0.1) {
        // basic steering: move at 5 units/sec toward target
        const speed = 5;
        const dt = 1 / 60; // assume fixed update; actual dt handled elsewhere
        const step = Math.min(dist, speed * dt);
        this.position = new Vector2(this.position.x + (dx / dist) * step, this.position.y + (dy / dist) * step);
      } else {
        this.targetPosition = null;
      }
    }
    // Towers attack enemies
    if (this.type === 'auto' || this.type === 'sniper' || this.type === 'emp' || this.type === 'trooper') {
      if (simTime < this.lastFireTime + this.cooldown) return;
      let target: Enemy | null = null;
      let minDist2 = Infinity;
      for (const e of enemies) {
        if (!e.alive) continue;
        const dx = e.car.position.x - this.position.x;
        const dy = e.car.position.y - this.position.y;
        const d2 = dx * dx + dy * dy;
        if (d2 <= this.range * this.range && d2 < minDist2) {
          target = e;
          minDist2 = d2;
        }
      }
      if (target) {
        if (this.type === 'emp') {
          // slow the enemy by reducing its moveScale temporarily
          target.moveScale = Math.min(target.moveScale, 0.5);
          target.moveScaleUntil = Math.max(target.moveScaleUntil, simTime + 1.5);
        } else {
          // deal direct damage
          target.takeDamage(this.damage);
        }
        this.lastFireTime = simTime;
      }
    }
  }
}
import { Entity, WeaponBase, applyEMP } from './entities';
import { Vector2 } from '../game/vector2';

/**
 * Represents a mine dropped by a MineWeapon. A mine arms after a delay, and then
 * explodes when an enemy enters its radius.
 */
export class MineInstance {
  position: Vector2;
  armDelay: number;
  armed: boolean = false;
  radius: number;
  damage: number;
  timeSinceDrop: number = 0;
  owner: Entity;

  constructor(owner: Entity, position: Vector2, armDelay: number, radius: number, damage: number) {
    this.owner = owner;
    this.position = position.clone();
    this.armDelay = armDelay;
    this.radius = radius;
    this.damage = damage;
  }

  update(dt: number, entities: Entity[]): boolean {
    this.timeSinceDrop += dt;
    if (!this.armed && this.timeSinceDrop >= this.armDelay) {
      this.armed = true;
    }
    if (this.armed) {
      for (const e of entities) {
        if (e === this.owner || !e.alive) continue;
        const dx = e.car.position.x - this.position.x;
        const dy = e.car.position.y - this.position.y;
        const distSq = dx*dx + dy*dy;
        if (distSq <= this.radius * this.radius) {
          // explode
          e.takeDamage(this.damage);
          return true; // remove mine
        }
      }
    }
    return false;
  }
}

/**
 * Represents a homing missile in flight. The missile steers toward its target and
 * deals damage when within explosion radius.
 */
export class MissileInstance {
  position: Vector2;
  speed: number;
  turnRate: number;
  target: Entity;
  alive: boolean = true;
  radius: number;
  damage: number;
  direction: Vector2;

  constructor(position: Vector2, speed: number, turnRate: number, target: Entity, radius: number, damage: number) {
    this.position = position.clone();
    this.speed = speed;
    this.turnRate = turnRate;
    this.target = target;
    this.radius = radius;
    this.damage = damage;
    // initial direction pointing toward target
    const toTarget = new Vector2(target.car.position.x - position.x, target.car.position.y - position.y);
    this.direction = toTarget.normalize();
  }

  update(dt: number): void {
    if (!this.alive) return;
    // steer toward target
    const toTarget = new Vector2(this.target.car.position.x - this.position.x, this.target.car.position.y - this.position.y);
    toTarget.normalize();
    // linearly interpolate direction limited by turn rate
    const angleCurrent = Math.atan2(this.direction.y, this.direction.x);
    const angleTarget = Math.atan2(toTarget.y, toTarget.x);
    let delta = angleTarget - angleCurrent;
    while (delta > Math.PI) delta -= 2 * Math.PI;
    while (delta < -Math.PI) delta += 2 * Math.PI;
    const maxDelta = this.turnRate * dt;
    if (Math.abs(delta) > maxDelta) {
      delta = Math.sign(delta) * maxDelta;
    }
    const newAngle = angleCurrent + delta;
    this.direction = Vector2.fromAngle(newAngle);
    // move
    this.position.add(this.direction.clone().scale(this.speed * dt));
    // check explosion
    const dx = this.target.car.position.x - this.position.x;
    const dy = this.target.car.position.y - this.position.y;
    const distSq = dx*dx + dy*dy;
    if (distSq <= this.radius * this.radius) {
      this.target.takeDamage(this.damage);
      this.alive = false;
    }
  }
}

/**
 * Machine gun weapon (hitscan). Instant damage on target if in range.
 */
export class MachineGun extends WeaponBase {
  range: number;
  damage: number;

  constructor(owner: Entity, cooldown: number, ammo: number | null, range: number, damage: number) {
    super(owner, cooldown, ammo);
    this.range = range;
    this.damage = damage;
  }

  fire(simTime: number, target: Entity): void {
    if (!this.canFire(simTime)) return;
    this.lastFireTime = simTime;
    if (this.ammo !== null) this.ammo!--;
    // simple hitscan: if target within range, apply damage
    const dx = target.car.position.x - this.owner.car.position.x;
    const dy = target.car.position.y - this.owner.car.position.y;
    const distSq = dx * dx + dy * dy;
    if (distSq <= this.range * this.range) {
      target.takeDamage(this.damage);
    }
  }
}

/**
 * Shotgun weapon: fires multiple pellets in a cone.
 * We approximate by checking if target is within angle and range.
 */
export class Shotgun extends WeaponBase {
  range: number;
  cone: number; // in radians
  pellets: number;
  damage: number;

  constructor(owner: Entity, cooldown: number, ammo: number, range: number, cone: number, pellets: number, damage: number) {
    super(owner, cooldown, ammo);
    this.range = range;
    this.cone = cone;
    this.pellets = pellets;
    this.damage = damage;
  }
  fire(simTime: number, target: Entity): void {
    if (!this.canFire(simTime)) return;
    this.lastFireTime = simTime;
    if (this.ammo !== null) this.ammo!--;
    // check if target within range and within cone
    const dx = target.car.position.x - this.owner.car.position.x;
    const dy = target.car.position.y - this.owner.car.position.y;
    const distSq = dx*dx + dy*dy;
    if (distSq > this.range * this.range) return;
    const dirToTarget = new Vector2(dx, dy).normalize();
    const forward = Vector2.fromAngle(this.owner.car.heading);
    const dot = forward.x * dirToTarget.x + forward.y * dirToTarget.y;
    const angle = Math.acos(Math.min(Math.max(dot, -1), 1));
    if (angle <= this.cone / 2) {
      // apply damage scaled by pellet count (we just multiply)
      target.takeDamage(this.damage);
    }
  }
}

/**
 * Mine weapon: drops a mine instance that arms after delay and explodes when an entity enters its radius.
 */
export class MineWeapon extends WeaponBase {
  armDelay: number;
  radius: number;
  damage: number;
  activeMines: MineInstance[] = [];
  constructor(owner: Entity, cooldown: number, ammo: number | null, armDelay: number, radius: number, damage: number) {
    super(owner, cooldown, ammo);
    this.armDelay = armDelay;
    this.radius = radius;
    this.damage = damage;
  }
  fire(simTime: number, target: Entity): void {
    // mines don't require target
    if (!this.canFire(simTime)) return;
    this.lastFireTime = simTime;
    if (this.ammo !== null) this.ammo!--;
    const mine = new MineInstance(this.owner, this.owner.car.position.clone(), this.armDelay, this.radius, this.damage);
    this.activeMines.push(mine);
  }
  updateMines(dt: number, entities: Entity[]): void {
    for (let i = this.activeMines.length - 1; i >= 0; i--) {
      const mine = this.activeMines[i];
      const exploded = mine.update(dt, entities);
      if (exploded) {
        this.activeMines.splice(i, 1);
      }
    }
  }
}

/**
 * Rocket weapon: fires a dumb projectile straight ahead.
 */
export class RocketWeapon extends WeaponBase {
  speed: number;
  radius: number;
  damage: number;
  rockets: MissileInstance[] = [];
  constructor(owner: Entity, cooldown: number, ammo: number | null, speed: number, radius: number, damage: number) {
    super(owner, cooldown, ammo);
    this.speed = speed;
    this.radius = radius;
    this.damage = damage;
  }
  fire(simTime: number, target: Entity): void {
    if (!this.canFire(simTime)) return;
    this.lastFireTime = simTime;
    if (this.ammo !== null) this.ammo!--;
    const dir = Vector2.fromAngle(this.owner.car.heading);
    const pos = this.owner.car.position.clone().add(dir.clone().scale(2));
    // Use MissileInstance but without steering; set turnRate = 0
    const rocket = new MissileInstance(pos, this.speed, 0, target, this.radius, this.damage);
    this.rockets.push(rocket);
  }
  updateRockets(dt: number): void {
    for (let i = this.rockets.length - 1; i >= 0; i--) {
      const rocket = this.rockets[i];
      if (!rocket.alive) {
        this.rockets.splice(i, 1);
        continue;
      }
      rocket.update(dt);
      if (!rocket.alive) {
        this.rockets.splice(i, 1);
      }
    }
  }
}

/**
 * EMP weapon: radial effect that slows/disables enemies for a duration.
 */
export class EMPWeapon extends WeaponBase {
  radius: number;
  duration: number;
  slowFactor: number;
  constructor(owner: Entity, cooldown: number, ammo: number | null, radius: number, duration: number, slowFactor: number) {
    super(owner, cooldown, ammo);
    this.radius = radius;
    this.duration = duration;
    this.slowFactor = slowFactor;
  }
  /**
   * Triggers an EMP pulse. The caller must provide potential targets.
   */
  pulse(simTime: number, entities: Entity[]): void {
    if (!this.canFire(simTime)) return;
    this.lastFireTime = simTime;
    if (this.ammo !== null) this.ammo!--;

    for (const e of entities) {
      if (!e.alive) continue;
      if (e === this.owner) continue;
      const dx = e.car.position.x - this.owner.car.position.x;
      const dy = e.car.position.y - this.owner.car.position.y;
      if (dx * dx + dy * dy <= this.radius * this.radius) {
        applyEMP(simTime, e, this.duration, this.slowFactor);
      }
    }
  }

  fire(simTime: number, target: Entity): void {
    // Backwards-compatible: if caller uses fire(), treat it as a self-centered pulse with only the provided target.
    this.pulse(simTime, [target]);
  }
}

/**
 * Homing missile weapon: spawns a MissileInstance that steers toward target.
 */
export class HomingMissileWeapon extends WeaponBase {
  speed: number;
  turnRate: number;
  radius: number;
  damage: number;
  missiles: MissileInstance[] = [];
  constructor(owner: Entity, cooldown: number, ammo: number | null, speed: number, turnRate: number, radius: number, damage: number) {
    super(owner, cooldown, ammo);
    this.speed = speed;
    this.turnRate = turnRate;
    this.radius = radius;
    this.damage = damage;
  }
  fire(simTime: number, target: Entity): void {
    if (!this.canFire(simTime) || !target.alive) return;
    this.lastFireTime = simTime;
    if (this.ammo !== null) this.ammo!--;
    const pos = this.owner.car.position.clone();
    const missile = new MissileInstance(pos, this.speed, this.turnRate, target, this.radius, this.damage);
    this.missiles.push(missile);
  }
  updateMissiles(dt: number): void {
    for (let i = this.missiles.length - 1; i >= 0; i--) {
      const m = this.missiles[i];
      if (!m.alive) {
        this.missiles.splice(i, 1);
        continue;
      }
      m.update(dt);
      if (!m.alive) {
        this.missiles.splice(i, 1);
      }
    }
  }
}

/**
 * Minigun: a faster-firing machinegun variant. Still hitscan, but with a shorter cooldown.
 */
export class Minigun extends MachineGun {
  constructor(owner: Entity, cooldown = 0.03, ammo: number | null = null, range = 30, damage = 2) {
    super(owner, cooldown, ammo, range, damage);
  }
}

export interface AirstrikeSink {
  addAirstrike(owner: Entity, x: number, y: number, delay: number, radius: number, damage: number): void;
}

/**
 * Airstrike weapon: schedules an explosion at a target's current position after a short delay.
 * This is intended for helicopter-only loadouts.
 */
export class AirstrikeWeapon extends WeaponBase {
  delay: number;
  radius: number;
  damage: number;
  sink: AirstrikeSink;

  constructor(owner: Entity, cooldown: number, ammo: number | null, delay: number, radius: number, damage: number, sink: AirstrikeSink) {
    super(owner, cooldown, ammo);
    this.delay = delay;
    this.radius = radius;
    this.damage = damage;
    this.sink = sink;
  }

  fire(simTime: number, target: Entity): void {
    if (!this.canFire(simTime)) return;
    this.lastFireTime = simTime;
    if (this.ammo !== null) this.ammo!--;
    // Schedule strike at target location (even if target later moves; this is a simple strike).
    this.sink.addAirstrike(this.owner, target.car.position.x, target.car.position.y, this.delay, this.radius, this.damage);
  }
}
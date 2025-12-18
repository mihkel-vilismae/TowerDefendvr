import { Entity } from './entities';
import { Vector2 } from '../game/vector2';

export interface LockState {
  target: Entity | null;
  lockProgress01: number;
  locked: boolean;
}

export interface TargetingParams {
  range: number;
  coneRadians: number;
  lockTime: number;
}

/**
 * Simple target cycling + lock-on helper.
 *
 * Rules:
 * - cycleTargets picks next valid target in list order (caller provides sorted list)
 * - updateLock requires target to stay within range+cone; otherwise lock resets.
 */
export class TargetingSystem {
  private targetIndex = -1;
  private currentTarget: Entity | null = null;
  private lockAccum = 0;

  cycleTargets(sortedCandidates: Entity[]): Entity | null {
    if (sortedCandidates.length === 0) {
      this.targetIndex = -1;
      this.currentTarget = null;
      this.lockAccum = 0;
      return null;
    }

    // If current target vanished, reset.
    if (this.currentTarget && !sortedCandidates.includes(this.currentTarget)) {
      this.currentTarget = null;
      this.targetIndex = -1;
      this.lockAccum = 0;
    }

    this.targetIndex = (this.targetIndex + 1) % sortedCandidates.length;
    this.currentTarget = sortedCandidates[this.targetIndex] ?? null;
    this.lockAccum = 0;
    return this.currentTarget;
  }

  getTarget(): Entity | null {
    return this.currentTarget;
  }

  clear(): void {
    this.targetIndex = -1;
    this.currentTarget = null;
    this.lockAccum = 0;
  }

  updateLock(dt: number, shooterPos: Vector2, shooterHeading: number, params: TargetingParams): LockState {
    const t = this.currentTarget;
    if (!t || !t.alive) {
      this.clear();
      return { target: null, lockProgress01: 0, locked: false };
    }

    const toTarget = new Vector2(t.car.position.x - shooterPos.x, t.car.position.y - shooterPos.y);
    const dist = toTarget.length();
    if (dist > params.range) {
      this.lockAccum = 0;
      return { target: t, lockProgress01: 0, locked: false };
    }

    const dir = toTarget.normalize();
    const forward = Vector2.fromAngle(shooterHeading);
    const dot = forward.x * dir.x + forward.y * dir.y;
    const angle = Math.acos(Math.min(1, Math.max(-1, dot)));
    if (angle > params.coneRadians * 0.5) {
      this.lockAccum = 0;
      return { target: t, lockProgress01: 0, locked: false };
    }

    this.lockAccum += dt;
    const progress01 = Math.min(1, this.lockAccum / params.lockTime);
    return { target: t, lockProgress01: progress01, locked: progress01 >= 1 };
  }
}

import { Vector2 } from '../game/vector2';

export type VfxColor = 'green' | 'red';

export type BuildGhostInput = {
  /** True when in build/research phase (between waves). */
  buildPhase: boolean;
  /** True when the player has chosen a build type and is placing. */
  hasPendingBuild: boolean;
  /** True when placement rules + credits allow building at the preview spot. */
  valid: boolean;
};

export type BuildGhostOutput = {
  visible: boolean;
  color: VfxColor;
};

export type FlamethrowerVfxInput = {
  simTime: number;
  /** The last sim time when flamethrower dealt damage. */
  lastFireTime: number;
  origin: Vector2;
  /** Normalized direction of firing in sim coordinates (x,z). */
  dir: Vector2;
};

export type GrenadeState = {
  id: number;
  alive: boolean;
  pos: Vector2;
  vel: Vector2;
};

export type VfxSpawns = {
  spawnFlameSparks: (origin: Vector2, dir: Vector2) => void;
  setHeatHaze: (active: boolean) => void;
  spawnGrenadeTrail: (pos: Vector2, vel: Vector2) => void;
  spawnScorchDecal: (pos: Vector2) => void;
  spawnHitFeedback: (pos: Vector2, normal: Vector2) => void;
};

const NOOP_SPAWNS: VfxSpawns = {
  spawnFlameSparks: () => {},
  setHeatHaze: () => {},
  spawnGrenadeTrail: () => {},
  spawnScorchDecal: () => {},
  spawnHitFeedback: () => {},
};

/**
 * Small, testable VFX state machine.
 *
 * This module is intentionally rendering-agnostic: it decides *when* to spawn
 * effects and keeps minimal state for lifetimes/visibility.
 */
export class VfxManager {
  private readonly spawns: VfxSpawns;

  // Flamethrower
  private heatHazeUntil = -Infinity;

  // Grenades
  private readonly grenadeAlive = new Map<number, boolean>();
  private grenadeTrailAcc = 0;

  constructor(spawns: Partial<VfxSpawns> = {}) {
    // Allow tests to pass a minimal stub (or `{}`) and fall back to no-ops.
    this.spawns = { ...NOOP_SPAWNS, ...spawns };
  }

  /**
   * Update flamethrower visuals. Consider it "active" shortly after the last fire.
   * This avoids changing gameplay: the sim already controls lastFireTime.
   */
  updateFlamethrower(input: FlamethrowerVfxInput): void {
    const firing = (input.simTime - input.lastFireTime) <= 0.10;
    if (firing) {
      this.spawns.spawnFlameSparks(input.origin, input.dir);
      this.heatHazeUntil = Math.max(this.heatHazeUntil, input.simTime + 0.08);
    }
    this.spawns.setHeatHaze(input.simTime < this.heatHazeUntil);
  }

  /**
   * Update grenade trails + scorch decals. This is purely visual.
   *
   * - Trail spawns while grenade is alive.
   * - Scorch decal spawns once when the grenade transitions alive->dead.
   */
  updateGrenades(dt: number, grenades: GrenadeState[]): void {
    // Thin out trail spawns for performance.
    this.grenadeTrailAcc += dt;
    const emitTrail = this.grenadeTrailAcc >= (1 / 45);
    if (emitTrail) this.grenadeTrailAcc = 0;

    const seen = new Set<number>();
    for (const g of grenades) {
      seen.add(g.id);
      const wasAlive = this.grenadeAlive.get(g.id) ?? false;
      this.grenadeAlive.set(g.id, g.alive);

      if (g.alive) {
        if (emitTrail) this.spawns.spawnGrenadeTrail(g.pos, g.vel);
      } else {
        // Spawn scorch decal exactly once on alive->dead transition.
        if (wasAlive) this.spawns.spawnScorchDecal(g.pos);
      }
    }

    // Clean up grenades that disappeared.
    for (const id of Array.from(this.grenadeAlive.keys())) {
      if (!seen.has(id)) this.grenadeAlive.delete(id);
    }
  }

  /**
   * Spawn directional impact feedback when a hit is confirmed.
   * Callers must ensure this isn't triggered by build/placement actions.
   */
  onEnemyHit(pos: Vector2, normal: Vector2): void {
    this.spawns.spawnHitFeedback(pos, normal);
  }

  computeBuildGhost(input: BuildGhostInput): BuildGhostOutput {
    if (!input.buildPhase || !input.hasPendingBuild) {
      return { visible: false, color: 'red' };
    }
    return { visible: true, color: input.valid ? 'green' : 'red' };
  }

  /**
   * Backwards/compat alias for tests and callers that expect an update-style API.
   * Extra fields (e.g. isXR) are ignored.
   */
  updateBuildGhost(input: BuildGhostInput & Record<string, unknown>): BuildGhostOutput {
    return this.computeBuildGhost(input);
  }
}

import * as THREE from 'three';

// The Entity type lives in the simulation layer, but bounds/clamping is a world-level
// concern. We accept a minimal shape here (an object with car.position).
export interface ClampableEntity {
  car: {
    position: THREE.Vector3;
  };
}

/**
 * Clamp an entity's car position to arena bounds.
 *
 * Note: default lim=106 matches the enlarged arena used by this repo.
 */
export function clampArena(ent: ClampableEntity, lim = 106): void {
  ent.car.position.x = THREE.MathUtils.clamp(ent.car.position.x, -lim, lim);
  ent.car.position.y = THREE.MathUtils.clamp(ent.car.position.y, -lim, lim);
}

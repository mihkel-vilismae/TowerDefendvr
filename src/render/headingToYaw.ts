/**
 * Convert simulation heading (radians) to a Three.js yaw rotation.
 *
 * Simulation convention:
 * - heading=0 points along +X.
 *
 * Render convention for our procedural vehicle meshes:
 * - "forward" faces +Z.
 */
export function headingToYaw(headingRad: number): number {
  return -headingRad + Math.PI * 0.5;
}

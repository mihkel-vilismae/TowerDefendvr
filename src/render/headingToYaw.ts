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
  // Ensure the returned yaw is *periodic* across 2π.
  // Without normalization, equivalent headings (h and h+2π) can map to yaws
  // that differ by 2π, which breaks comparisons and can cause jitter when
  // feeding the value into code that expects a canonical angle.
  return wrapToPi(-headingRad + Math.PI * 0.5);
}

/**
 * Wrap an angle in radians to the canonical interval [-π, π).
 */
function wrapToPi(rad: number): number {
  const twoPi = Math.PI * 2;
  // JavaScript % keeps the sign, so we do a positive modulo first.
  const wrapped = ((rad + Math.PI) % twoPi + twoPi) % twoPi;
  return wrapped - Math.PI;
}

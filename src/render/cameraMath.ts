import * as THREE from 'three';

export type DesktopCameraMode = 'top' | 'chase' | 'rear';

export function cycleDesktopCameraMode(mode: DesktopCameraMode): DesktopCameraMode {
  // Order is intentionally: overview -> chase -> close rear-follow.
  if (mode === 'top') return 'chase';
  if (mode === 'chase') return 'rear';
  return 'top';
}

export function computeDesktopCamera(
  playerX: number,
  playerZ: number,
  headingRad: number,
  mode: DesktopCameraMode,
  zoom: number,
) {
  const target = new THREE.Vector3(playerX, 0, playerZ);
  if (mode === 'top') {
    const position = new THREE.Vector3(playerX, 65, playerZ + zoom);
    return { position, target };
  }

  // Follow behind the vehicle.
  const dist = mode === 'rear' ? Math.max(12, zoom * 0.28) : zoom;
  const height = mode === 'rear' ? 10 : 34;
  const behindX = Math.cos(headingRad + Math.PI) * dist;
  const behindZ = Math.sin(headingRad + Math.PI) * dist;
  const position = new THREE.Vector3(playerX + behindX, height, playerZ + behindZ);

  // In rear mode, look a bit ahead of the car to feel more “right behind”.
  if (mode === 'rear') {
    const ahead = 10;
    const aheadX = Math.cos(headingRad) * ahead;
    const aheadZ = Math.sin(headingRad) * ahead;
    const rearTarget = new THREE.Vector3(playerX + aheadX, 0, playerZ + aheadZ);
    return { position, target: rearTarget };
  }

  return { position, target };
}

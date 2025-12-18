import * as THREE from 'three';

export type DesktopCameraMode = 'top' | 'chase';

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
  const dist = zoom;
  const behindX = Math.cos(headingRad + Math.PI) * dist;
  const behindZ = Math.sin(headingRad + Math.PI) * dist;
  const position = new THREE.Vector3(playerX + behindX, 34, playerZ + behindZ);
  return { position, target };
}

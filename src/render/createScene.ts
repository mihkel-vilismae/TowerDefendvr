import * as THREE from 'three';
import { APP_CONFIG } from '../config/appConfig';

export type CreatedScene = {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
};

export function createSceneAndCamera(): CreatedScene {
  const scene = new THREE.Scene();
  // Brighten the atmosphere and push the fog farther out. A longer fog end distance
  // improves visibility now that the world is larger.
  scene.fog = new THREE.Fog(APP_CONFIG.FOG_COLOR, APP_CONFIG.FOG_NEAR, APP_CONFIG.FOG_FAR);

  const camera = new THREE.PerspectiveCamera(
    APP_CONFIG.CAMERA_FOV_DEG,
    window.innerWidth / window.innerHeight,
    APP_CONFIG.CAMERA_NEAR,
    APP_CONFIG.CAMERA_FAR
  );
  // Desktop defaults: a closer view so the game is playable in regular browser mode.
  camera.position.set(APP_CONFIG.CAMERA_START_POS.x, APP_CONFIG.CAMERA_START_POS.y, APP_CONFIG.CAMERA_START_POS.z);
  camera.lookAt(0, 0, 0);

  return { scene, camera };
}

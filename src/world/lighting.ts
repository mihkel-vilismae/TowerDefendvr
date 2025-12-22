import * as THREE from 'three';

export interface LightingHandles {
  sun: THREE.DirectionalLight;
  hemi: THREE.HemisphereLight;
}

/**
 * Apply the default lighting for the district arena.
 *
 * Keep values in sync with historical main.ts defaults so refactors do not
 * change visual output.
 */
export function applyDefaultLighting(scene: THREE.Scene): LightingHandles {
  // Stronger sunlight and a higher position makes the environment brighter and more dynamic.
  const sun = new THREE.DirectionalLight(0xffffff, 2.2);
  sun.position.set(100, 200, 100);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  sun.shadow.camera.near = 1;
  sun.shadow.camera.far = 240;
  sun.shadow.camera.left = -90;
  sun.shadow.camera.right = 90;
  sun.shadow.camera.top = 90;
  sun.shadow.camera.bottom = -90;
  scene.add(sun);

  // Replace ambient light with a hemisphere light for softer, more natural lighting.
  const hemi = new THREE.HemisphereLight(0xbfcfff, 0x1a2538, 1.25);
  scene.add(hemi);

  return { sun, hemi };
}

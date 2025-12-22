import * as THREE from 'three';
import type { Friendly } from '../sim/friendly';

/**
 * Create a simple mesh for each friendly unit type.
 * Colors hint at their role. Keep geometry/material identical to historical main.ts.
 */
export function createFriendlyMesh(f: Friendly): THREE.Object3D {
  let mesh: THREE.Mesh;
  switch (f.type) {
    case 'auto':
      mesh = new THREE.Mesh(
        new THREE.CylinderGeometry(0.4, 0.4, 1.2, 10),
        new THREE.MeshStandardMaterial({ color: 0x4df3ff, emissive: 0x4df3ff, emissiveIntensity: 0.6, roughness: 0.4, metalness: 0.2 })
      );
      break;
    case 'sniper':
      mesh = new THREE.Mesh(
        new THREE.CylinderGeometry(0.35, 0.35, 1.4, 12),
        new THREE.MeshStandardMaterial({ color: 0xff7cff, emissive: 0xff7cff, emissiveIntensity: 0.5, roughness: 0.4, metalness: 0.2 })
      );
      break;
    case 'emp':
      mesh = new THREE.Mesh(
        new THREE.CylinderGeometry(0.5, 0.5, 0.8, 8),
        new THREE.MeshStandardMaterial({ color: 0x7cfffa, emissive: 0x7cfffa, emissiveIntensity: 0.5, roughness: 0.5, metalness: 0.2 })
      );
      break;
    case 'trooper':
      mesh = new THREE.Mesh(
        new THREE.BoxGeometry(0.6, 1.0, 0.6),
        new THREE.MeshStandardMaterial({ color: 0xffc86b, emissive: 0xffc86b, emissiveIntensity: 0.45, roughness: 0.6, metalness: 0.15 })
      );
      break;
    case 'missile':
      mesh = new THREE.Mesh(
        new THREE.CylinderGeometry(0.5, 0.5, 1.5, 10),
        new THREE.MeshStandardMaterial({ color: 0xff6058, emissive: 0xff6058, emissiveIntensity: 0.6, roughness: 0.35, metalness: 0.25 })
      );
      break;
    default:
      mesh = new THREE.Mesh(
        new THREE.CylinderGeometry(0.4, 0.4, 1.2, 10),
        new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.3 })
      );
  }

  mesh.castShadow = true;
  mesh.receiveShadow = true;
  mesh.position.set(f.position.x, 0.6, f.position.y);
  return mesh;
}

/** Sync positions of friendly visuals to match sim coordinates. */
export function syncFriendlyVisualPositions(map: Map<Friendly, THREE.Object3D>): void {
  for (const [f, mesh] of map) {
    mesh.position.x = f.position.x;
    mesh.position.z = f.position.y;
  }
}

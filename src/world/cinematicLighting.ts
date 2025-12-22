import * as THREE from 'three';

export type CinematicLightingOptions = {
  /** Enable soft fog and atmosphere. */
  fog?: boolean;
  /** Approx exposure for ACES tone mapping. */
  exposure?: number;
  /** Enable shadows for desktop. In XR we may disable shadows dynamically. */
  shadows?: boolean;
};

export type CinematicLightingHandles = {
  key: THREE.DirectionalLight;
  fill: THREE.HemisphereLight;
  rim: THREE.DirectionalLight;
};

function createCheapEquirectEnvTexture(): THREE.Texture {
  // Cheap, dependency-free environment reflections using a gradient canvas.
  // This is not physically accurate, but gives Metal/Rough materials something
  // to reflect and immediately improves "shipped game" feel.
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    const tex = new THREE.Texture();
    tex.needsUpdate = true;
    return tex;
  }
  const g = ctx.createLinearGradient(0, 0, 0, canvas.height);
  g.addColorStop(0.00, '#2c3a53');
  g.addColorStop(0.45, '#6f7f97');
  g.addColorStop(0.70, '#c7c2b0');
  g.addColorStop(1.00, '#1a1a1a');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  // Subtle horizon glow.
  ctx.globalAlpha = 0.22;
  ctx.fillStyle = '#ffd6a3';
  ctx.fillRect(0, canvas.height * 0.56, canvas.width, canvas.height * 0.08);
  ctx.globalAlpha = 1;

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.mapping = THREE.EquirectangularReflectionMapping;
  tex.needsUpdate = true;
  return tex;
}

/**
 * Cinematic, game-like lighting that stays VR-safe.
 *
 * - Key / Fill / Rim (readable silhouettes)
 * - Cheap environment reflections (canvas gradient)
 * - Fog/atmosphere (optional)
 */
export function applyCinematicLighting(
  scene: THREE.Scene,
  renderer: THREE.WebGLRenderer,
  opts: CinematicLightingOptions = {}
): CinematicLightingHandles {
  const fog = opts.fog ?? true;
  const exposure = opts.exposure ?? 1.08;
  const shadows = opts.shadows ?? true;

  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = exposure;
  renderer.shadowMap.enabled = shadows;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  // Atmosphere
  if (fog) {
    scene.fog = new THREE.FogExp2(0x141a22, 0.012);
  }

  // Cheap environment reflections for PBR materials.
  const env = createCheapEquirectEnvTexture();
  scene.environment = env;

  // Key light (warm)
  const key = new THREE.DirectionalLight(0xfff0dc, 2.25);
  key.position.set(110, 170, 80);
  key.castShadow = shadows;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.camera.near = 1;
  key.shadow.camera.far = 320;
  key.shadow.camera.left = -120;
  key.shadow.camera.right = 120;
  key.shadow.camera.top = 120;
  key.shadow.camera.bottom = -120;
  scene.add(key);

  // Fill light (cool sky)
  const fill = new THREE.HemisphereLight(0xbcd2ff, 0x101820, 0.85);
  scene.add(fill);

  // Rim light (cool edge)
  const rim = new THREE.DirectionalLight(0xb7d8ff, 0.85);
  rim.position.set(-140, 90, -120);
  rim.castShadow = false;
  scene.add(rim);

  return { key, fill, rim };
}

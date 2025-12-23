import * as THREE from 'three';
import { APP_CONFIG } from '../config/appConfig';

export type CreatedRenderer = {
  renderer: THREE.WebGLRenderer;
  desktopPixelRatio: number;
};

export function createRenderer(app: HTMLElement): CreatedRenderer {
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  const desktopPixelRatio = Math.min(APP_CONFIG.DESKTOP_PIXEL_RATIO_CAP, window.devicePixelRatio);
  renderer.setPixelRatio(desktopPixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.xr.enabled = true;

  // Increase exposure to lift overall scene brightness. This works in tandem with
  // the brighter sun/hemisphere lights to produce a more vivid image.
  renderer.toneMappingExposure = 1.25;

  app.appendChild(renderer.domElement);

  // VR performance tuning: drop pixel ratio + particle spawn counts while in XR.
  // This keeps CPU/GPU budgets reasonable on SteamVR, especially with heavy VFX.
  const vrPixelRatio = APP_CONFIG.VR_PIXEL_RATIO;

  renderer.xr.addEventListener('sessionstart', () => {
    renderer.setPixelRatio(vrPixelRatio);
    // Some runtimes expose foveation; safe to call when available.
    try {
      (renderer.xr as any).setFoveation?.(1);
    } catch {
      // ignore
    }
  });

  renderer.xr.addEventListener('sessionend', () => {
    renderer.setPixelRatio(desktopPixelRatio);
  });

  return { renderer, desktopPixelRatio };
}

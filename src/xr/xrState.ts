import * as THREE from 'three';

/**
 * Central XR state helpers.
 *
 * Avoid sprinkling `renderer.xr.getSession()` and `renderer.xr.isPresenting`
 * checks throughout the app. Keep all XR state reads here.
 */
export function isXRPresenting(renderer: THREE.WebGLRenderer): boolean {
  return !!renderer.xr?.isPresenting;
}

export function getXRSession(renderer: THREE.WebGLRenderer): XRSession | null {
  return (renderer.xr?.getSession?.() as XRSession | null) ?? null;
}

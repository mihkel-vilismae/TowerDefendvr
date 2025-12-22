import * as THREE from 'three';
import { getXRSession } from './xrState';

export interface VrStick {
  steer: number;
  throttle: number;
}

/**
 * Reads the primary thumbstick/trackpad axes from the first available XR input source.
 *
 * Vive wands typically expose 2 axes; many modern controllers expose 4 axes.
 * We prefer axes 2/3 when available (right stick), otherwise fall back to 0/1.
 */
export function readVRStick(renderer: THREE.WebGLRenderer): VrStick {
  const session = getXRSession(renderer);
  if (!session) return { steer: 0, throttle: 0 };
  for (const src of session.inputSources) {
    const gp = src.gamepad;
    if (!gp) continue;
    const hasTwoAxes = gp.axes.length <= 2;
    const axX = hasTwoAxes ? (gp.axes[0] ?? 0) : (gp.axes[2] ?? gp.axes[0] ?? 0);
    const axY = hasTwoAxes ? (gp.axes[1] ?? 0) : (gp.axes[3] ?? gp.axes[1] ?? 0);
    return { steer: axX, throttle: -axY };
  }
  return { steer: 0, throttle: 0 };
}

export function isVRButtonPressed(renderer: THREE.WebGLRenderer, buttonIndex: number): boolean {
  const session = getXRSession(renderer);
  if (!session) return false;
  for (const src of session.inputSources) {
    const gp = src.gamepad;
    if (!gp) continue;
    const b = gp.buttons[buttonIndex];
    if (b?.pressed) return true;
  }
  return false;
}

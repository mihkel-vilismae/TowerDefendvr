import * as THREE from 'three';
import { XRControllerModelFactory } from 'three/examples/jsm/webxr/XRControllerModelFactory.js';
import { VRButtonCompat } from './VRButtonCompat';

export type WebXRControllers = {
  c1: THREE.Group;
  c2: THREE.Group;
  g1: THREE.Group;
  g2: THREE.Group;
};

export type SetupWebXROpts = {
  /** Defaults to true. */
  addVrButton?: boolean;
};

/**
 * Centralized WebXR setup.
 *
 * - Adds the VR entry button (minimal, compatibility-first config)
 * - Creates controller + grip objects
 * - Attaches controller models for visual fidelity
 */
export function setupWebXR(renderer: THREE.WebGLRenderer, scene: THREE.Scene, opts: SetupWebXROpts = {}): WebXRControllers {
  const addVrButton = opts.addVrButton ?? true;

  if (addVrButton) {
    // SteamVR (HTC Vive Pro) can throw NotSupportedError if we request unsupported features.
    // Keep session init minimal and broadly compatible.
    document.body.appendChild(VRButtonCompat.createButton(renderer));
  }

  const controllerModelFactory = new XRControllerModelFactory();
  const c1 = renderer.xr.getController(0);
  const c2 = renderer.xr.getController(1);
  const g1 = renderer.xr.getControllerGrip(0);
  const g2 = renderer.xr.getControllerGrip(1);
  g1.add(controllerModelFactory.createControllerModel(g1));
  g2.add(controllerModelFactory.createControllerModel(g2));
  scene.add(c1, c2, g1, g2);

  return { c1, c2, g1, g2 };
}

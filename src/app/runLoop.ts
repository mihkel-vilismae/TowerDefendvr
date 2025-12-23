import type * as THREE from 'three';
import type { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import type { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';

export type RenderStep = (t: number) => void;

export type RunLoopDeps = {
  renderer: THREE.WebGLRenderer;
  camera: THREE.PerspectiveCamera;
  composer: EffectComposer;
  bloomPass: UnrealBloomPass;
  step: RenderStep;
};

export function startRunLoop(deps: RunLoopDeps): { dispose(): void } {
  const { renderer, camera, composer, bloomPass, step } = deps;

  renderer.setAnimationLoop(step);

  const onResize = () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    composer.setSize(window.innerWidth, window.innerHeight);
    bloomPass.setSize(window.innerWidth, window.innerHeight);
  };

  window.addEventListener('resize', onResize);

  return {
    dispose() {
      window.removeEventListener('resize', onResize);
      renderer.setAnimationLoop(null);
    },
  };
}

import type { RenderPort } from '../../app/AppContext';

export type ThreeRenderDeps = {
  renderer: { render: (scene: any, camera: any) => void; xr?: { isPresenting: boolean } };
  composer?: { render: () => void };
  bloomPass?: { enabled: boolean };
  scene: any;
  camera: any;
  isXRPresenting?: () => boolean;
};

/**
 * Small adapter for the final render call. It intentionally stays dumb and reads
 * only what it needs from the supplied dependencies.
 */
export class ThreeRenderPort<TState> implements RenderPort<TState> {
  constructor(private readonly deps: ThreeRenderDeps) {}

  render(_state: TState): void {
    const { renderer, composer, bloomPass, scene, camera, isXRPresenting } = this.deps;
    const xrPresenting = Boolean(isXRPresenting ? isXRPresenting() : renderer.xr?.isPresenting);
    const useBloom = Boolean(bloomPass?.enabled) && !xrPresenting && Boolean(composer);
    if (useBloom) composer!.render();
    else renderer.render(scene, camera);
  }
}

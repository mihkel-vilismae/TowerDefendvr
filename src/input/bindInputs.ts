import type { DesktopCameraMode } from '../render/cameraMath';
import { cycleDesktopCameraMode } from '../render/cameraMath';
import { APP_CONFIG } from '../config/appConfig';

export type DesktopCameraInputState = {
  mode: DesktopCameraMode;
  zoom: number;
};

export function bindDesktopCameraInputs(state: DesktopCameraInputState): { dispose(): void } {
  const onWheel = (ev: WheelEvent) => {
    // Don't affect page scroll in some browsers.
    (ev as any).preventDefault?.();
    state.zoom += Math.sign(ev.deltaY) * APP_CONFIG.DESKTOP_ZOOM_WHEEL_STEP;
    state.zoom = Math.max(APP_CONFIG.DESKTOP_ZOOM_MIN, Math.min(APP_CONFIG.DESKTOP_ZOOM_MAX, state.zoom));
  };

  const onKeyDown = (ev: KeyboardEvent) => {
    if (ev.key.toLowerCase() === 'c') {
      state.mode = cycleDesktopCameraMode(state.mode);
    }
  };

  window.addEventListener('wheel', onWheel as any, { passive: false } as any);
  window.addEventListener('keydown', onKeyDown);

  return {
    dispose() {
      window.removeEventListener('wheel', onWheel as any);
      window.removeEventListener('keydown', onKeyDown);
    },
  };
}

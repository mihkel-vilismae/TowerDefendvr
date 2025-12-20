import type { WebGLRenderer } from 'three';

type XRButtonSessionInit = XRSessionInit & {
  optionalFeatures?: string[];
  requiredFeatures?: string[];
};

/**
 * Minimal WebXR "Enter VR" button.
 *
 * Some SteamVR setups (including HTC Vive Pro) will fail session creation if the
 * sessionInit requests unsupported optional features such as the WebXR Layers API.
 *
 * This button intentionally requests only a conservative feature set.
 */
export class VRButtonCompat {
  static createButton(renderer: WebGLRenderer, sessionInit?: XRButtonSessionInit): HTMLElement {
    const button = document.createElement('button');
    button.style.cssText = [
      'position: absolute',
      'bottom: 20px',
      'right: 20px',
      'padding: 12px 18px',
      'border: 1px solid rgba(255,255,255,0.25)',
      'border-radius: 10px',
      'background: rgba(0,0,0,0.55)',
      'color: #fff',
      'font: 600 14px/1 system-ui, -apple-system, Segoe UI, Roboto, Arial, sans-serif',
      'cursor: pointer',
      'user-select: none',
      'z-index: 9999',
    ].join(';');

    const xr = (navigator as any).xr as XRSystem | undefined;
    if (!xr) {
      button.textContent = 'VR not available';
      button.disabled = true;
      button.style.opacity = '0.5';
      return button;
    }

    // Conservative defaults: avoid 'layers' and other optional features.
    // 'local-floor' yields stable standing/seated height.
    const baseInit: XRButtonSessionInit = {
      requiredFeatures: [],
      optionalFeatures: ['local-floor'],
      ...(sessionInit ?? {}),
    };

    // Ensure we never request features that trigger runtime errors for the user's setup.
    // (If you want to opt-in later, do it behind a runtime capability check.)
    baseInit.requiredFeatures = (baseInit.requiredFeatures ?? []).filter((f) => f !== 'layers');
    baseInit.optionalFeatures = (baseInit.optionalFeatures ?? []).filter((f) => f !== 'layers');

    // Some SteamVR/OpenXR builds will still fail if *any* optionalFeatures are provided.
    // We keep a retry init with absolutely no optional/required features.
    const fallbackInit: XRButtonSessionInit = {
      requiredFeatures: [],
      optionalFeatures: [],
    };

    let currentSession: XRSession | null = null;

    const onSessionStarted = async (session: XRSession) => {
      currentSession = session;
      await renderer.xr.setSession(session);
      button.textContent = 'Exit VR';
      button.onclick = () => session.end();
      session.addEventListener('end', onSessionEnded);
    };

    const onSessionEnded = () => {
      currentSession = null;
      button.textContent = 'Enter VR';
      button.onclick = onRequestSession;
    };

    const onRequestSession = async () => {
      if (currentSession) {
        // Defensive: avoid "There is already an active, immersive XRSession".
        try {
          await currentSession.end();
        } catch {
          // ignore
        }
        return;
      }

      try {
        const session = await xr.requestSession('immersive-vr', baseInit);
        await onSessionStarted(session);
      } catch (err) {
        // Retry with a fully empty init for runtimes that choke on optional features.
        try {
          const session = await xr.requestSession('immersive-vr', fallbackInit);
          await onSessionStarted(session);
          return;
        } catch (err2) {
          // Provide useful feedback in dev console.
          // eslint-disable-next-line no-console
          console.error('[XR] requestSession failed', err);
          // eslint-disable-next-line no-console
          console.error('[XR] requestSession fallback failed', err2);
        }
      }
    };

    // Update initial state based on support.
    xr.isSessionSupported('immersive-vr')
      .then((supported) => {
        if (!supported) {
          button.textContent = 'VR not supported';
          button.disabled = true;
          button.style.opacity = '0.5';
          return;
        }
        button.textContent = 'Enter VR';
        button.onclick = onRequestSession;
      })
      .catch(() => {
        button.textContent = 'VR not supported';
        button.disabled = true;
        button.style.opacity = '0.5';
      });

    return button;
  }
}

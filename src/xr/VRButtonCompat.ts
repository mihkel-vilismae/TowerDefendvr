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
    const init: XRButtonSessionInit = {
      requiredFeatures: [],
      optionalFeatures: ['local-floor'],
      ...(sessionInit ?? {}),
    };

    // Ensure we never request features that trigger runtime errors for the user's setup.
    // (If you want to opt-in later, do it behind a runtime capability check.)
    init.requiredFeatures = (init.requiredFeatures ?? []).filter((f) => f !== 'layers');
    init.optionalFeatures = (init.optionalFeatures ?? []).filter((f) => f !== 'layers');

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
        const session = await xr.requestSession('immersive-vr', init);
        await onSessionStarted(session);
      } catch (err) {
        // Provide useful feedback in dev console.
        // eslint-disable-next-line no-console
        console.error('[XR] requestSession failed', err);
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

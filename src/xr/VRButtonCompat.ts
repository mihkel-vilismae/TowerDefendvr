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

    // IMPORTANT (Vive Pro + some SteamVR/OpenXR builds):
    // Even harmless-looking sessionInit fields (e.g. optionalFeatures: ['local-floor'])
    // can cause requestSession() to fail with:
    //   NotSupportedError: The specified session configuration is not supported.
    // So we default to the MOST compatible init: no optional/required features.
    // If you want floor-level reference later, request it via requestReferenceSpace
    // with a graceful fallback (local-floor -> local).
    const baseInit: XRButtonSessionInit = {
      requiredFeatures: [],
      optionalFeatures: [],
      ...(sessionInit ?? {}),
    };

    // Ensure we never request features that trigger runtime errors for the user's setup.
    // (If you want to opt-in later, do it behind a runtime capability check.)
    baseInit.requiredFeatures = (baseInit.requiredFeatures ?? []).filter((f) => f !== 'layers');
    baseInit.optionalFeatures = (baseInit.optionalFeatures ?? []).filter((f) => f !== 'layers');

    // Secondary retry: try asking for a floor-aligned space if the runtime supports it.
    // (This is less compatible than the empty init above on some systems, hence "fallback".)
    const fallbackInit: XRButtonSessionInit = {
      requiredFeatures: [],
      optionalFeatures: ['local-floor'],
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
        // Retry with local-floor in case the runtime wants it explicitly.
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

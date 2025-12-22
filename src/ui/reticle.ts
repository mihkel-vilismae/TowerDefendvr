export type ReticleState = {
  visible: boolean;
  hasTarget: boolean;
  locked?: boolean;
  hitFlash?: boolean;
};

export type ReticleUi = {
  setState: (s: ReticleState) => void;
  flashHit: () => void;
};

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className?: string): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (className) e.className = className;
  return e;
}

/**
 * Lightweight FPS reticle + hitmarker.
 * Visual-only, DOM-based (no WebGL cost).
 */
export function createReticleUi(): ReticleUi {
  const root = el('div', 'dr-reticle');
  const dot = el('div', 'dr-reticle__dot');
  const ring = el('div', 'dr-reticle__ring');
  const hit = el('div', 'dr-hit');
  root.append(dot, ring, hit);
  document.body.appendChild(root);

  // CSS
  const style = el('style');
  style.textContent = `
  .dr-reticle{position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);pointer-events:none;z-index:50;}
  .dr-reticle__dot{width:4px;height:4px;border-radius:999px;background:rgba(255,255,255,0.95);box-shadow:0 0 6px rgba(255,255,255,0.35);} 
  .dr-reticle__ring{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:28px;height:28px;border-radius:999px;border:1px solid rgba(255,255,255,0.35);}
  .dr-reticle.target .dr-reticle__ring{border-color:rgba(255,215,128,0.7);box-shadow:0 0 10px rgba(255,215,128,0.25);} 
  .dr-reticle.locked .dr-reticle__ring{border-color:rgba(120,255,170,0.85);box-shadow:0 0 14px rgba(120,255,170,0.25);} 
  .dr-hit{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%) scale(0.8);width:26px;height:26px;opacity:0;transition:opacity 90ms linear, transform 90ms ease-out;}
  .dr-hit::before,.dr-hit::after{content:'';position:absolute;left:50%;top:50%;width:26px;height:2px;background:rgba(255,255,255,0.9);transform-origin:center;}
  .dr-hit::before{transform:translate(-50%,-50%) rotate(45deg);} 
  .dr-hit::after{transform:translate(-50%,-50%) rotate(-45deg);} 
  .dr-hit.on{opacity:0.9;transform:translate(-50%,-50%) scale(1.0);} 
  `;
  document.head.appendChild(style);

  let hitFrames = 0;
  function tickHitFlash() {
    if (hitFrames > 0) {
      hitFrames--;
      if (hitFrames <= 0) hit.classList.remove('on');
    }
    requestAnimationFrame(tickHitFlash);
  }
  requestAnimationFrame(tickHitFlash);

  return {
    setState: (s) => {
      root.style.display = s.visible ? 'block' : 'none';
      root.classList.toggle('target', !!s.hasTarget);
      root.classList.toggle('locked', !!s.locked);
      if (s.hitFlash) {
        hit.classList.add('on');
        hitFrames = 2;
      }
    },
    flashHit: () => {
      hit.classList.add('on');
      hitFrames = 2;
    },
  };
}

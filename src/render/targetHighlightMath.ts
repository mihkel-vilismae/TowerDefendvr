export type TargetHighlightParams = {
  /** 0..1 lock progress */
  lockProgress: number;
  locked: boolean;
  /** seconds */
  timeS: number;
};

export type TargetHighlightVisual = {
  scale: number;
  opacity: number;
  emissiveIntensity: number;
};

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

/**
 * Pure math for the target highlight ring.
 *
 * Designed to be unit-testable (no Three.js dependency).
 */
export function computeTargetHighlightVisual(p: TargetHighlightParams): TargetHighlightVisual {
  const lp = clamp01(p.lockProgress);
  const pulse = 0.5 + 0.5 * Math.sin(p.timeS * (p.locked ? 8.0 : 5.0));
  const baseScale = 1.0 + (1 - lp) * 0.35;
  const scale = baseScale * (p.locked ? (1.03 + pulse * 0.06) : (0.98 + pulse * 0.04));
  const opacity = p.locked ? (0.85 + pulse * 0.12) : (0.35 + lp * 0.45);
  const emissiveIntensity = p.locked ? (1.7 + pulse * 0.6) : (0.9 + lp * 0.9);
  return { scale, opacity, emissiveIntensity };
}

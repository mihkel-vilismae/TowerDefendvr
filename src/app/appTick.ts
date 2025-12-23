import type { AppContext, StepState } from './AppContext';
import { stepSim } from '../core/sim/stepSim';

export type FixedStepClockConfig = {
  fixedDtSec: number;
  maxFrameDtSec?: number;
};

export type FixedStepAdvance = {
  dtSec: number;
  stepCount: number;
  stepDtSec: number;
  alpha: number; // leftover fraction in [0..1)
};

/**
 * Small, deterministic helper that converts variable-rate rAF frames into a fixed-step simulation schedule.
 * Pure and unit-testable.
 */
export function createFixedStepClock(config: FixedStepClockConfig) {
  const fixedDtSec = config.fixedDtSec;
  const maxFrameDtSec = config.maxFrameDtSec ?? 0.05;

  let lastNowSec = NaN;
  let accSec = 0;

  return {
    /** Advance the clock by a new timestamp (in seconds) and return how many fixed steps to execute. */
    advance(nowSec: number, timeScale = 1): FixedStepAdvance {
      if (!Number.isFinite(lastNowSec)) {
        lastNowSec = nowSec;
        return { dtSec: 0, stepCount: 0, stepDtSec: fixedDtSec, alpha: 0 };
      }

      const rawDt = nowSec - lastNowSec;
      const dtSec = Math.max(0, Math.min(maxFrameDtSec, rawDt));
      lastNowSec = nowSec;

      accSec += dtSec * timeScale;

      let stepCount = 0;
      while (accSec >= fixedDtSec) {
        accSec -= fixedDtSec;
        stepCount++;
        // Safety against spiral of death if timeScale is huge.
        if (stepCount > 10_000) break;
      }

      const alpha = fixedDtSec > 0 ? accSec / fixedDtSec : 0;
      return { dtSec, stepCount, stepDtSec: fixedDtSec, alpha };
    },

    reset(nowSec: number) {
      lastNowSec = nowSec;
      accSec = 0;
    },
  };
}

/**
 * Per-frame app tick.
 * Thin wiring layer that is friendly to unit tests via ports.
 */
export function appTick<TState extends StepState<TState>>(ctx: AppContext<TState>, dtMs: number): void {
  const input = ctx.dom.input.sample();
  ctx.state = stepSim(ctx.state, input, dtMs);
  ctx.gfx.render(ctx.state);
  ctx.dom.hud.update(ctx.state);
}

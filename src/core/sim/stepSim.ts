import type { InputSnapshot, StepState } from '../../app/AppContext';

/**
 * Pure coordinator: delegates the simulation update to the provided state.
 * The implementation of `state.step` may mutate internal structures, but this
 * function itself has no global side effects.
 */
export function stepSim<TState extends StepState<TState>>(
  state: TState,
  input: InputSnapshot,
  dtMs: number
): TState {
  return state.step(input, dtMs);
}

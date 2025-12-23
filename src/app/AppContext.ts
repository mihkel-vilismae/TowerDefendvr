export type InputSnapshot = {
  accelerate: boolean;
  brake: boolean;
  left: boolean;
  right: boolean;
};

export interface InputPort {
  sample(): InputSnapshot;
}

export interface HudPort<TState> {
  update(state: TState): void;
}

export interface RenderPort<TState> {
  render(state: TState): void;
}

export interface StepState<TState> {
  step(input: InputSnapshot, dtMs: number): TState;
}

export type DomPorts<TState> = {
  input: InputPort;
  hud: HudPort<TState>;
};

export type GfxPorts<TState> = {
  render: RenderPort<TState>['render'];
};

export type AppContext<TState extends StepState<TState>> = {
  nowMs: () => number;
  raf: (cb: FrameRequestCallback) => number;
  cancelRaf: (id: number) => void;
  log: (s: string) => void;

  dom: DomPorts<TState>;
  gfx: GfxPorts<TState>;
  xr?: unknown;

  state: TState;
};

export type InputSnapshot = {
  accelerate: boolean;
  brake: boolean;
  left: boolean;
  right: boolean;
};

export interface InputPort {
  sample(): InputSnapshot;
}

export type DomPorts = {
  input: InputPort;
  hud: { update: (state: unknown) => void };
};

export type GfxPorts = {
  render: (state: unknown) => void;
};

export type XrPorts = Record<string, unknown>;

export type AppContext = {
  nowMs: () => number;
  raf: (cb: FrameRequestCallback) => number;
  cancelRaf: (id: number) => void;
  log: (s: string) => void;

  dom: DomPorts;
  gfx: GfxPorts;
  xr?: XrPorts;

  state: unknown;
};

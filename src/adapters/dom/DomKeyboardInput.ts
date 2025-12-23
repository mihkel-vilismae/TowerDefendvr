import type { InputPort, InputSnapshot } from '../../app/AppContext';

export type Keymap = {
  accelerate: string;
  brake: string;
  left: string;
  right: string;
};

/**
 * DOM keyboard adapter: registers key listeners and provides an InputPort.
 * No import-time side effects: listeners are registered only on construction.
 */
export class DomKeyboardInput implements InputPort {
  private readonly keys = new Set<string>();
  private readonly onKeyDown = (e: KeyboardEvent) => {
    this.keys.add(e.code);
    if (e.code === 'Tab') e.preventDefault();
  };
  private readonly onKeyUp = (e: KeyboardEvent) => {
    this.keys.delete(e.code);
  };

  constructor(private readonly win: Window, private readonly keymap: Keymap) {
    this.win.addEventListener('keydown', this.onKeyDown);
    this.win.addEventListener('keyup', this.onKeyUp);
  }

  dispose(): void {
    this.win.removeEventListener('keydown', this.onKeyDown);
    this.win.removeEventListener('keyup', this.onKeyUp);
    this.keys.clear();
  }

  sample(): InputSnapshot {
    const km = this.keymap;
    return {
      accelerate: this.keys.has(km.accelerate),
      brake: this.keys.has(km.brake),
      left: this.keys.has(km.left),
      right: this.keys.has(km.right),
    };
  }
}

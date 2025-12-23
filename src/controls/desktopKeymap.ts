export type DesktopDriveAction = 'accelerate' | 'brake' | 'left' | 'right';

export type DesktopDriveKeymap = Readonly<Record<DesktopDriveAction, readonly string[]>>;

/**
 * Desktop driving key bindings.
 *
 * This is a public contract used by both the runtime and unit tests.
 * Tests must validate behavior (bindings), not entry-point file layout.
 */
export const DESKTOP_DRIVE_KEYMAP: DesktopDriveKeymap = Object.freeze({
  accelerate: ['KeyW', 'ArrowUp'],
  brake: ['KeyS', 'ArrowDown'],
  left: ['KeyA', 'ArrowLeft'],
  right: ['KeyD', 'ArrowRight'],
});

export function keymapAnyPressed(isPressed: (code: string) => boolean, codes: readonly string[]) {
  for (const c of codes) if (isPressed(c)) return true;
  return false;
}

/**
 * Tiny DOM safety helpers.
 *
 * These exist because optional UI widgets (like toggles) may be missing from
 * some HTML variants. We want the game to continue running instead of crashing
 * at startup.
 */

export function checkedOr(el: { checked: boolean } | null | undefined, fallback: boolean): boolean {
  return el ? el.checked : fallback;
}

export function onChange(
  el: { addEventListener: (type: string, listener: () => void) => void } | null | undefined,
  listener: () => void,
): void {
  if (!el) return;
  el.addEventListener('change', listener);
}

/**
 * Query an element and throw a friendly error if missing.
 */
export function requireEl<T extends Element>(selector: string): T {
  const found = document.querySelector(selector);
  if (!found) {
    throw new Error(`Missing required element: ${selector}`);
  }
  return found as T;
}

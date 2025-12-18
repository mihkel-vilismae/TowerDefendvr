import { describe, it, expect, vi } from 'vitest';
import { checkedOr, onChange } from '../src/ui/safeDom';

describe('safeDom helpers', () => {
  it('checkedOr returns fallback when element is null', () => {
    expect(checkedOr(null, true)).toBe(true);
    expect(checkedOr(undefined, false)).toBe(false);
  });

  it('checkedOr returns element.checked when element exists', () => {
    expect(checkedOr({ checked: true }, false)).toBe(true);
    expect(checkedOr({ checked: false }, true)).toBe(false);
  });

  it('onChange is a no-op when element is null', () => {
    expect(() => onChange(null, () => {})).not.toThrow();
  });

  it('onChange wires change handler when element exists', () => {
    const addEventListener = vi.fn();
    const el = { addEventListener };
    const fn = vi.fn();
    onChange(el, fn);
    expect(addEventListener).toHaveBeenCalledTimes(1);
    expect(addEventListener).toHaveBeenCalledWith('change', fn);
  });
});

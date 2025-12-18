import { describe, it, expect, beforeEach } from 'vitest';
import { JSDOM } from 'jsdom';
import { requireEl, checkedOr, onChange } from '../src/ui/safeDom';

describe('safeDom contract with real DOM', () => {
  beforeEach(() => {
    const dom = new JSDOM(`<!doctype html><html><body>
      <input id="cb" type="checkbox" checked />
      <button id="btn"></button>
    </body></html>`);
    // @ts-expect-error test-only global override
    globalThis.document = dom.window.document;
  });

  it('requireEl returns the element when present and throws when missing', () => {
    const btn = requireEl<HTMLButtonElement>('#btn');
    expect(btn.id).toBe('btn');
    expect(() => requireEl('#nope')).toThrow(/Missing required element/);
  });

  it('checkedOr returns fallback for null, and reads checked state when present', () => {
    const cb = requireEl<HTMLInputElement>('#cb');
    expect(checkedOr(null, true)).toBe(true);
    expect(checkedOr(cb, false)).toBe(true);
    cb.checked = false;
    expect(checkedOr(cb, true)).toBe(false);
  });

  it('onChange is a no-op for null and wires events for real element', () => {
    const cb = requireEl<HTMLInputElement>('#cb');
    let called = 0;
    onChange(null, () => called++);
    onChange(cb, () => called++);
    cb.dispatchEvent(new (cb.ownerDocument.defaultView!.Event)('change'));
    expect(called).toBe(1);
  });
});

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { JSDOM } from 'jsdom';

/**
 * Guardrail: ensure critical UI controls exist in index.html.
 * This prevents runtime null errors when wiring UI in main.ts.
 */
describe('index.html required UI elements', () => {
  it('contains required UI elements used by the app', () => {
    const html = readFileSync(resolve(process.cwd(), 'index.html'), 'utf8');
    const dom = new JSDOM(html);
    const { document } = dom.window;

    // Required controls used by main.ts via requireEl()/getElementById()
    expect(document.querySelector('#app')).not.toBeNull();
    expect(document.querySelector('#hud')).not.toBeNull();
    expect(document.querySelector('#panel')).not.toBeNull();
    expect(document.querySelector('#startBtn')).not.toBeNull();
    expect(document.querySelector('#vehicleSel')).not.toBeNull();
    expect(document.querySelector('#vrHelp')).not.toBeNull();

    // Optional controls (must not be required by code)
    // If present, should be an input checkbox.
    const bloom = document.querySelector('#bloomToggle');
    if (bloom) {
      expect((bloom as HTMLInputElement).type).toBe('checkbox');
    }
  });
});

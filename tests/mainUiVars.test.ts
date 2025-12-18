import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

function count(haystack: string, needle: string): number {
  let i = 0;
  let n = 0;
  while (true) {
    const idx = haystack.indexOf(needle, i);
    if (idx < 0) return n;
    n += 1;
    i = idx + needle.length;
  }
}

describe('main.ts UI refs are declared once', () => {
  it('does not redeclare key UI variables (prevents esbuild duplicate symbol errors)', () => {
    const mainPath = path.join(process.cwd(), 'src', 'main.ts');
    const src = fs.readFileSync(mainPath, 'utf8');

    // These should each be declared exactly once.
    expect(count(src, 'const slowmoToggle')).toBe(1);
    expect(count(src, 'const enemyHeliToggle')).toBe(1);
    expect(count(src, 'const startHpLabel')).toBe(1);
    expect(count(src, 'const startHpSlider')).toBe(1);
    expect(count(src, 'const minimap')).toBe(1);

    // Regression: ensure we don't reference an old variable name that isn't declared.
    expect(src.includes('minimapCanvas')).toBe(false);
  });
});

import { describe, it, expect } from 'vitest';
import { TechTree, defaultTechs } from '../src/sim/techTree';

describe('TechTree', () => {
  it('unlocks tech with prerequisites and costs', () => {
    const tree = new TechTree(defaultTechs);
    tree.availablePoints = 100;
    // Tier 1 unlocks
    expect(tree.canUnlock('improvedBarrels')).toBe(true);
    expect(tree.unlock('improvedBarrels')).toBe(true);
    expect(tree.isUnlocked('improvedBarrels')).toBe(true);
    // Tier 2 requires two Tier 1s
    expect(tree.canUnlock('autoloader')).toBe(false);
    expect(tree.unlock('betterOptics')).toBe(true);
    expect(tree.canUnlock('autoloader')).toBe(true);
    expect(tree.unlock('autoloader')).toBe(true);
    expect(tree.isUnlocked('autoloader')).toBe(true);
    // After unlocking, points deducted
    expect(tree.availablePoints).toBeLessThan(100);
  });
});
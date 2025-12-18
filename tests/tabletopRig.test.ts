import { describe, it, expect } from 'vitest';
import { TabletopRig } from '../src/xr/tabletop';

describe('TabletopRig', () => {
  it('starts in desktop mode (scale=1, height=0)', () => {
    const rig = new TabletopRig();
    expect(rig.root.scale.x).toBeCloseTo(1.0);
    expect(rig.root.position.y).toBeCloseTo(0.0);
  });

  it('switches to tabletop mode and back', () => {
    const rig = new TabletopRig();
    rig.setTabletopMode();
    expect(rig.root.scale.x).toBeCloseTo(0.12);
    expect(rig.root.position.y).toBeCloseTo(1.05);
    rig.setDesktopMode();
    expect(rig.root.scale.x).toBeCloseTo(1.0);
    expect(rig.root.position.y).toBeCloseTo(0.0);
  });
});

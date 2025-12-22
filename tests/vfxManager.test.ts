import { describe, expect, it } from 'vitest';
import { VfxManager } from '../src/render/vfxManager';
import { Vector2 } from '../src/game/vector2';

describe('VfxManager', () => {
  it('flamethrower VFX only active while firing and stops when firing stops', () => {
    const calls = { sparks: 0, hazeOn: 0, hazeOff: 0 };
    const vfx = new VfxManager({
      spawnFlameSparks: () => calls.sparks++,
      setHeatHazeActive: (on) => (on ? calls.hazeOn++ : calls.hazeOff++),
    });
    // Firing (lastFireTime within window)
    vfx.updateFlamethrower({ simTime: 10, lastFireTime: 9.95, origin: new Vector2(0, 0), dir: new Vector2(1, 0) });
    expect(calls.sparks).toBeGreaterThan(0);
    expect(calls.hazeOn).toBe(1);
    // After enough time passes, haze should turn off.
    vfx.update(0.25);
    expect(calls.hazeOff).toBe(1);
  });

  it('grenade smoke spawns while airborne; scorch decal spawns only after explosion', () => {
    const calls = { smoke: 0, scorch: 0 };
    const vfx = new VfxManager({
      spawnGrenadeSmoke: () => calls.smoke++,
      spawnScorchDecal: () => calls.scorch++,
    });
    const g = { id: 1, alive: true, pos: new Vector2(1, 2), vel: new Vector2(0, 0) };
    // Airborne
    vfx.updateGrenades(0.1, [g]);
    expect(calls.smoke).toBeGreaterThan(0);
    expect(calls.scorch).toBe(0);
    // Detonated
    vfx.updateGrenades(0.1, [{ ...g, alive: false }]);
    expect(calls.scorch).toBe(1);
    // Remains dead should not keep spawning scorch
    vfx.updateGrenades(0.1, [{ ...g, alive: false }]);
    expect(calls.scorch).toBe(1);
  });

  it('enemy hit feedback spawns on hit and does not trigger from build ghost updates', () => {
    const calls = { hit: 0 };
    const vfx = new VfxManager({
      spawnHitImpact: () => calls.hit++,
    });
    vfx.onEnemyHit(new Vector2(0, 0), new Vector2(1, 0));
    expect(calls.hit).toBe(1);
    // Build ghost update should not spawn hit impacts.
    vfx.updateBuildGhost({ buildPhase: true, hasPendingBuild: true, valid: true, isXR: true });
    expect(calls.hit).toBe(1);
  });

  it('VR build ghost is visible only in build phase and color-codes validity', () => {
    const vfx = new VfxManager({});
    const off = vfx.updateBuildGhost({ buildPhase: false, hasPendingBuild: true, valid: true, isXR: true });
    expect(off.visible).toBe(false);
    const onValid = vfx.updateBuildGhost({ buildPhase: true, hasPendingBuild: true, valid: true, isXR: true });
    expect(onValid.visible).toBe(true);
    expect(onValid.color).toBe('green');
    const onInvalid = vfx.updateBuildGhost({ buildPhase: true, hasPendingBuild: true, valid: false, isXR: true });
    expect(onInvalid.visible).toBe(true);
    expect(onInvalid.color).toBe('red');
  });
});

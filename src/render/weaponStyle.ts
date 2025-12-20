export type WeaponVfxKey =
  | 'machinegun'
  | 'antimateriel'
  | 'minigun'
  | 'shotgun'
  | 'mine'
  | 'missile'
  | 'rocket'
  | 'emp'
  | 'airstrike';

export type WeaponVfxStyle = {
  /** Dotted tracer line for hitscan/burst weapons. */
  tracerColor: number;
  /** Trail particles for projectiles. */
  trailColor: number;
  /** 3D projectile emissive color. */
  projectileColor: number;
  /** Impact / explosion tint. */
  impactColor: number;
  /** Number of points used when drawing a tracer. */
  tracerPoints: number;
};

/**
 * Centralized weapon VFX palette.
 *
 * This is intentionally pure data so it can be unit-tested and changed without
 * touching WebGL code.
 */
export const WEAPON_VFX: Record<WeaponVfxKey, WeaponVfxStyle> = {
  machinegun: {
    tracerColor: 0xffd16a,
    trailColor: 0xffc86b,
    projectileColor: 0xfff0c8,
    impactColor: 0xffb86a,
    tracerPoints: 11,
  },
  antimateriel: {
    // bright, high-energy white tracer that reads well in VR
    tracerColor: 0xf6f8ff,
    trailColor: 0xf6f8ff,
    projectileColor: 0xf6f8ff,
    impactColor: 0xffc86b,
    tracerPoints: 19,
  },
  minigun: {
    tracerColor: 0x7cfffa,
    trailColor: 0x4df3ff,
    projectileColor: 0xa9fffb,
    impactColor: 0x7cfffa,
    tracerPoints: 15,
  },
  shotgun: {
    tracerColor: 0xff4df1,
    trailColor: 0xff4df1,
    projectileColor: 0xffb8ff,
    impactColor: 0xff4df1,
    tracerPoints: 7,
  },
  mine: {
    tracerColor: 0x63ff7a,
    trailColor: 0x63ff7a,
    projectileColor: 0x63ff7a,
    impactColor: 0x63ff7a,
    tracerPoints: 0,
  },
  missile: {
    tracerColor: 0x7cfffa,
    trailColor: 0x7cfffa,
    projectileColor: 0x7cfffa,
    impactColor: 0x7cfffa,
    tracerPoints: 0,
  },
  rocket: {
    tracerColor: 0xffe5a2,
    trailColor: 0xffc86b,
    projectileColor: 0xffe5a2,
    impactColor: 0xffc86b,
    tracerPoints: 0,
  },
  emp: {
    tracerColor: 0x4df3ff,
    trailColor: 0x4df3ff,
    projectileColor: 0x4df3ff,
    impactColor: 0x4df3ff,
    tracerPoints: 0,
  },
  airstrike: {
    tracerColor: 0xff4df1,
    trailColor: 0xff4df1,
    projectileColor: 0xff4df1,
    impactColor: 0xff4df1,
    tracerPoints: 0,
  },
};

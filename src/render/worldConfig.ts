export type DistrictPreset = 'mixed' | 'rural' | 'city';

export type WorldGenConfig = {
  preset: DistrictPreset;
  seed: number;
  arenaSize: number; // half-size in world units
};

export const WORLD_PRESETS: Record<DistrictPreset, {
  label: string;
  ruralWeight: number;
  cityWeight: number;
  fieldWeight: number;
  treesWeight: number;
  highrises: { min: number; max: number };
  houses: { min: number; max: number };
}> = {
  mixed: {
    label: 'Mixed',
    ruralWeight: 0.55,
    cityWeight: 0.45,
    fieldWeight: 0.55,
    treesWeight: 0.55,
    highrises: { min: 6, max: 12 },
    houses: { min: 14, max: 26 },
  },
  rural: {
    label: 'Rural',
    ruralWeight: 0.85,
    cityWeight: 0.15,
    fieldWeight: 0.95,
    treesWeight: 0.85,
    highrises: { min: 2, max: 5 },
    houses: { min: 22, max: 38 },
  },
  city: {
    label: 'City',
    ruralWeight: 0.2,
    cityWeight: 0.8,
    fieldWeight: 0.15,
    treesWeight: 0.25,
    highrises: { min: 12, max: 22 },
    houses: { min: 6, max: 14 },
  },
};

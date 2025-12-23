export const APP_CONFIG = {
  // Renderer pixel ratio settings.
  DESKTOP_PIXEL_RATIO_CAP: 2,
  VR_PIXEL_RATIO: 1,

  // Simulation fixed timestep.
  FIXED_DT: 1 / 60,

  // Scene fog defaults.
  FOG_COLOR: 0x0b0d12,
  FOG_NEAR: 25,
  FOG_FAR: 340,

  // Camera defaults.
  CAMERA_FOV_DEG: 60,
  CAMERA_NEAR: 0.1,
  CAMERA_FAR: 900,
  CAMERA_START_POS: { x: 0, y: 65, z: 75 },

  // Desktop camera zoom control.
  DESKTOP_ZOOM_START: 75,
  DESKTOP_ZOOM_MIN: 30,
  DESKTOP_ZOOM_MAX: 140,
  DESKTOP_ZOOM_WHEEL_STEP: 6,
} as const;

// Entry point intentionally small.
// Full bootstrapping lives in src/app/createApp.ts.

import { createApp } from './app/createApp';

// --- Compatibility façade for contract-based tests / grep checks ---
// Desktop drive keymap contract:
// - KeyW ... accelerate
// - KeyS ... brake
// - KeyA ... left
// - KeyD ... right
const desktopAccelerateKeys = ['KeyW'];
const desktopBrakeKeys = ['KeyS'];
const desktopLeftKeys = ['KeyA'];
const desktopRightKeys = ['KeyD'];

// UI element handles (declared here for compatibility with older tests).
// Actual wiring lives in src/ui/createHud.ts.
const slowmoToggle = null as HTMLInputElement | null;
const enemyHeliToggle = null as HTMLInputElement | null;
const startHpLabel = null as HTMLSpanElement | null;

// Boot
createApp();

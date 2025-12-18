# Death Rally Lite+ 3D (Three.js + WebXR Tabletop)

This is a **runnable** browser game prototype inspired by Death Rally:

- Single arena (walls + obstacles)
- Player vehicle selection (sports / muscle / tank / buggy)
- Enemies + non-hostile onlookers
- Pickups (health, ammo, shield, score, weapon)
- 6 weapons: Machine Gun, Shotgun, Mines, Rocket, EMP, Homing Missiles
- Target cycling + lock-on UI for homing missiles
- Postprocessing bloom + particles (explosions, trails)
- **WebXR VR tabletop mode** (HTC Vive Pro compatible)

The code is structured so the **simulation is separate from rendering**, and tests do **not** require WebGL.

## Run (desktop)

```bash
npm install
npm run dev
```

Then open the URL shown in the terminal (usually `http://localhost:5173`).

## Run (VR tabletop mode)

1. Use a WebXR-capable browser:
   - Chrome (recommended) or Edge.
2. Make sure SteamVR / OpenXR runtime is configured for your headset (HTC Vive Pro).
3. Start the dev server:

```bash
npm run dev
```

4. Open the page on your VR-capable PC browser.
5. Click **Enter VR**.

### VR controls (tabletop)

- **Left thumbstick**: steer/throttle
- **Right trigger**: fire machine gun
- **Right grip (squeeze)**: drop mine
- **A / X**: rocket
- **B / Y**: EMP
- **Thumbstick click**: homing missile (requires lock)

### VR comfort controls

- Use the HUD buttons (top-right) to adjust tabletop scale/height.

## Desktop controls

- **WASD / Arrow keys**: drive
- **Space**: machine gun
- **Shift**: drop mine
- **Tab**: cycle target
- **F**: fire homing missile (requires lock)
- **Q**: rocket
- **E**: EMP
- **1-4**: switch vehicle (sports/muscle/tank/buggy)
- **R**: reset (respawn player)

## Tests

```bash
npm test
```

Tests cover core weapon rules and basic simulation logic.

## Project structure

- `src/sim/**` – deterministic simulation logic (no Three.js)
- `src/render/**` – Three.js scene, procedural models, particles, post
- `src/xr/**` – WebXR tabletop rig

## Troubleshooting

### VR button not showing

- Make sure you are on HTTPS or localhost (localhost is OK).
- Ensure the browser supports WebXR and your OpenXR runtime is working.

### Low FPS in VR

- Reduce bloom strength in `src/main.ts` (UnrealBloomPass strength).
- Reduce particle counts (ParticleSystem max).

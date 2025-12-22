import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { VRButtonCompat } from './xr/VRButtonCompat';
import { XRControllerModelFactory } from 'three/examples/jsm/webxr/XRControllerModelFactory.js';

import { Car } from './game/car';
import { Entity, Enemy, Onlooker } from './sim/entities';
import { MachineGun, AntiMaterielRifle, MineWeapon, HomingMissileWeapon, StingerWeapon, RocketWeapon, Shotgun, EMPWeapon, Minigun, BazookaWeapon, GrenadeLauncher, FlamethrowerWeapon, AirstrikeWeapon } from './sim/weapons';
import { HealthPickup, AmmoPickup, ShieldPickup, ScorePickup, WeaponPickup } from './sim/pickups';
import { GameSimulation, OnlookerKillRule, AirstrikeInstance } from './sim/game';
import { TargetingSystem } from './sim/targeting';
import { createArena, createVehicleMesh, VehicleVisualType } from './render/models';
import { DistrictPreset } from './render/worldConfig';
import { ParticleSystem } from './render/particles';
import { VfxManager } from './render/vfxManager';
import { TracerRenderer } from './render/tracers';
import { ShockwavePool } from './render/shockwaves';
import { ReplayBuffer } from './game/replay';
import { computeDesktopCamera, DesktopCameraMode, cycleDesktopCameraMode } from './render/cameraMath';
import { TabletopRig } from './xr/tabletop';
import { checkedOr, onChange, requireEl } from './ui/safeDom';
import { RaceTracker } from './sim/race';
import { Vector2 } from './game/vector2';
import { WEAPON_VFX } from './render/weaponStyle';
import { computeTargetHighlightVisual } from './render/targetHighlightMath';
import { headingToYaw } from './render/headingToYaw';

// Tower defence support: towers and wave management
import { TowerDefense, Tower } from './sim/towerDefense';
// TD-RTS-FPS hybrid imports
import { Friendly, FriendlyType } from './sim/friendly';
import { CommandSystem } from './sim/commands';
import { WaveScheduler, Phase } from './sim/waves';
import { TechTree, defaultTechs } from './sim/techTree';
import { PossessionState } from './sim/possession';
import { initTdPanel } from './ui/tdPanel';
import { createMainMenu } from './ui/mainMenu';
import { createReticleUi } from './ui/reticle';
import { isXRPresenting } from './xr/xrState';
import { readVRStick, isVRButtonPressed } from './xr/vrInput';
import { RecoilSpring } from './fps/recoil';
import { hookXRButtons } from './xr/xrBindings';

// Refactor helpers
import { clampArena as clampArenaWorld } from './world/bounds';
import { applyCinematicLighting } from './world/cinematicLighting';
import { createFriendlyMesh as createFriendlyMeshRender, syncFriendlyVisualPositions } from './renderSync/friendlyVisuals';

type VehicleChoice = 'sports' | 'muscle' | 'buggy' | 'tank' | 'heli' | 'human';

const app = document.getElementById('app')!;
const hud = document.getElementById('hud')!;
const panel = document.getElementById('panel')!;

// Screen-space health bars for vehicles.
const healthLayer = document.createElement('div');
healthLayer.style.position = 'absolute';
healthLayer.style.left = '0';
healthLayer.style.top = '0';
healthLayer.style.width = '100%';
healthLayer.style.height = '100%';
healthLayer.style.pointerEvents = 'none';
healthLayer.style.zIndex = '8';
app.appendChild(healthLayer);

const healthBars = new Map<Entity, HTMLDivElement>();

function ensureHealthBar(ent: Entity): HTMLDivElement {
  let el = healthBars.get(ent);
  if (el) return el;
  el = document.createElement('div');
  el.style.position = 'absolute';
  el.style.width = '64px';
  el.style.height = '6px';
  el.style.borderRadius = '999px';
  el.style.background = 'rgba(255,255,255,0.14)';
  el.style.border = '1px solid rgba(255,255,255,0.14)';
  el.style.boxShadow = '0 6px 14px rgba(0,0,0,0.35)';
  const fill = document.createElement('div');
  fill.style.height = '100%';
  fill.style.width = '100%';
  fill.style.borderRadius = '999px';
  fill.style.background = 'rgba(120,255,160,0.85)';
  fill.dataset['role'] = 'fill';
  el.appendChild(fill);
  healthLayer.appendChild(el);
  healthBars.set(ent, el);
  return el;
}

function removeHealthBar(ent: Entity): void {
  const el = healthBars.get(ent);
  if (!el) return;
  el.remove();
  healthBars.delete(ent);
}

function worldToScreen(pos: THREE.Vector3): { x: number; y: number; onScreen: boolean } {
  const v = pos.clone().project(camera);
  const onScreen = v.z >= -1 && v.z <= 1;
  const x = (v.x * 0.5 + 0.5) * window.innerWidth;
  const y = (-v.y * 0.5 + 0.5) * window.innerHeight;
  return { x, y, onScreen };
}

function updateHealthBars(): void {
  if (!sim) {
    for (const [e] of healthBars) removeHealthBar(e);
    return;
  }
  const ents = sim.enemies.filter(e => e.alive);
  const alive = new Set<Entity>();
  for (const e of ents) {
    const r = e.maxHP > 0 ? (e.hp / e.maxHP) : 0;

    // Hide health bars for enemies that have not been hurt yet (full HP).
    // This keeps the screen clean until combat starts.
    if (r >= 0.999) {
      removeHealthBar(e);
      continue;
    }

    alive.add(e);
    const bar = ensureHealthBar(e);
    const fill = bar.querySelector('[data-role="fill"]') as HTMLDivElement | null;
    if (fill) {
      fill.style.width = `${Math.max(0, Math.min(1, r)) * 100}%`;
      // color shift: green -> yellow -> red
      if (r > 0.55) fill.style.background = 'rgba(120,255,160,0.85)';
      else if (r > 0.25) fill.style.background = 'rgba(255,210,120,0.88)';
      else fill.style.background = 'rgba(255,120,120,0.9)';
    }

    const mesh = visuals.get(e);
    if (!mesh) continue;
    const yOff = getEntityBaseY(e) + (e.hovering ? 2.15 : 1.25);
    const p3 = new THREE.Vector3(e.car.position.x, yOff, e.car.position.y);
    const { x, y, onScreen } = worldToScreen(p3);
    const visible = onScreen && !renderer.xr.isPresenting;
    bar.style.display = visible ? 'block' : 'none';
    if (visible) {
      bar.style.transform = `translate(${Math.round(x - 32)}px, ${Math.round(y)}px)`;
    }
  }

  // cleanup
  for (const [e] of list(healthBars)) {
    if (!alive.has(e)) removeHealthBar(e);
  }
}

function list<K,V>(m: Map<K,V>): [K,V][] { return Array.from(m.entries()); }


function el<T extends HTMLElement>(sel: string): T | null {
  return document.querySelector(sel) as T | null;
}

// UI elements
const startBtn = requireEl<HTMLButtonElement>('#startBtn');
const restartBtn = requireEl<HTMLButtonElement>('#btnRestart');
const freezeEnemiesBtn = requireEl<HTMLButtonElement>('#btnFreezeEnemies');
const stopAttacksBtn = requireEl<HTMLButtonElement>('#btnStopAttacks');
const enterBuildingBtn = requireEl<HTMLButtonElement>('#btnEnterBuilding');
const districtSel = requireEl<HTMLSelectElement>('#districtSel');
const vehicleSel = requireEl<HTMLSelectElement>('#vehicleSel');
const bloomToggle = el<HTMLInputElement>('#bloomToggle');
const slowmoToggle = el<HTMLInputElement>('#slowmoToggle');
const enemyHeliToggle = el<HTMLInputElement>('#enemyHeliToggle');
const mouseAimChk = el<HTMLInputElement>('#mouseAimChk');
const mouseAimStatus = el<HTMLElement>('#mouseAimStatus');
const modeSel = requireEl<HTMLSelectElement>('#modeSel');
const lapsSel = requireEl<HTMLSelectElement>('#lapsSel');
const startHpSlider = el<HTMLInputElement>('#startHp');
const startHpLabel = el<HTMLSpanElement>('#startHpLabel');

// ---------------- Main menu (start gate) ----------------
// The in-game control panel remains available after starting, but the user flow
// begins with a simple main menu overlay.
let mainMenu: ReturnType<typeof createMainMenu> | null = null;

function showMainMenu() {
  mainMenu?.show();
  const controls = document.getElementById('controls');
  if (controls) controls.style.display = 'none';
}

// District preset (world generation)
const savedDistrict = (localStorage.getItem('deathrally.district') as DistrictPreset | null) ?? 'mixed';
districtSel.value = savedDistrict;
districtSel.addEventListener('change', () => {
  localStorage.setItem('deathrally.district', districtSel.value);
});

// minimap is required for non-VR UX; fail early with a clear error if missing.
const minimap = requireEl<HTMLCanvasElement>('#minimap');
const vrHelp = requireEl<HTMLDivElement>('#vrHelp');

// --- Three.js setup ---
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(2, window.devicePixelRatio));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.xr.enabled = true;
// Increase exposure to lift overall scene brightness. This works in tandem with
// the brighter sun/hemisphere lights to produce a more vivid image.
renderer.toneMappingExposure = 1.25;
app.appendChild(renderer.domElement);

// VR performance tuning: drop pixel ratio + particle spawn counts while in XR.
// This keeps CPU/GPU budgets reasonable on SteamVR, especially with heavy VFX.
const DESKTOP_PIXEL_RATIO = Math.min(2, window.devicePixelRatio);
const VR_PIXEL_RATIO = 1; // conservative for Vive Pro

renderer.xr.addEventListener('sessionstart', () => {
  renderer.setPixelRatio(VR_PIXEL_RATIO);
  // Some runtimes expose foveation; safe to call when available.
  try {
    (renderer.xr as any).setFoveation?.(1);
  } catch {
    // ignore
  }
});

renderer.xr.addEventListener('sessionend', () => {
  renderer.setPixelRatio(DESKTOP_PIXEL_RATIO);
});

// WebXR button
// SteamVR (HTC Vive Pro) can throw NotSupportedError if we request unsupported features like "layers".
// Keep the session init minimal and broadly compatible.
// NOTE: Do not pass optionalFeatures by default.
// On some SteamVR/OpenXR builds (incl. Vive Pro setups), even optionalFeatures: ['local-floor']
// can cause requestSession() to fail with "NotSupportedError: ... configuration is not supported".
// We'll request the most compatible session init (empty) in VRButtonCompat.
document.body.appendChild(VRButtonCompat.createButton(renderer));

const scene = new THREE.Scene();
// Brighten the atmosphere and push the fog farther out. A longer fog end distance
// improves visibility now that the world is larger.
scene.fog = new THREE.Fog(0x0b0d12, 25, 340);

const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 900);
// Desktop defaults: a closer view so the game is playable in regular browser mode.
camera.position.set(0, 65, 75);
camera.lookAt(0, 0, 0);

// --- Desktop camera controls (non-VR) ---
let desktopCamMode: DesktopCameraMode = 'top';
let desktopZoom = 75;

window.addEventListener('wheel', (ev) => {
  // Don't affect page scroll in some browsers.
  ev.preventDefault?.();
  desktopZoom += Math.sign(ev.deltaY) * 6;
  desktopZoom = Math.max(30, Math.min(140, desktopZoom));
}, { passive: false });

window.addEventListener('keydown', (ev) => {
  if (ev.key.toLowerCase() === 'c') {
    desktopCamMode = cycleDesktopCameraMode(desktopCamMode);
  }
});

// Lights
// Kept in a module so main.ts stays focused on orchestration.
const { key: sun, fill: hemiLight } = applyCinematicLighting(scene, renderer, {
  fog: true,
  exposure: 1.08,
  shadows: true,
});

// Arena + tabletop root
const tabletop = new TabletopRig();
scene.add(tabletop.root);

let arena: THREE.Object3D | null = null;
let buildingMeshes: THREE.Mesh[] = [];

// Tower defence manager for the current simulation. Null when not in a game.
let towerDef: TowerDefense | null = null;

// --- TD-RTS-FPS hybrid state ---
// Friendly units placed by the player during TD mode.
let friendlies: Friendly[] = [];
// Mapping from friendly unit to its 3D mesh for rendering/updates.
const friendlyVisuals = new Map<Friendly, THREE.Object3D>();
// Player currency used to build units and research tech. Earned per enemy kill.
let credits = 0;
// Command system manages selection and move orders for movable units.
let commandSys: CommandSystem | null = null;
// Wave scheduler controls build/combat phases and enemy spawns.
let waveScheduler: WaveScheduler | null = null;
// Tech tree for research unlocks and upgrades.
let techTree: TechTree | null = null;
// Possession state for taking control of a friendly unit (FPS). Currently unused beyond stub.
let possession: PossessionState | null = null;
// Pending build type selected in the UI. When set, a click on the world will attempt to place this unit.
let pendingBuildType: FriendlyType | null = null;
// Global stat multipliers modified by research. Multiplicative to base stats.
let friendlyDamageBoost = 1;
let friendlyRangeBoost = 1;
let friendlyCooldownMultiplier = 1;
// Unlockable unit types. Start with core set; Tier 3 tech may add more.
let unlockedTypes: FriendlyType[] = ['auto', 'sniper', 'emp', 'trooper'];

// Track enemy count from previous update to award credits when kills occur.
let prevEnemyCount = 0;

// Build the main menu overlay once TD globals exist so the tech tree preview can
// reference the live TechTree instance when available.
mainMenu = createMainMenu({
  onStart: (mode) => {
    modeSel.value = mode;
    // Reuse existing start flow to preserve behavior.
    startBtn.click();
    mainMenu?.hide();
    const controls = document.getElementById('controls');
    if (controls) controls.style.display = '';
  },
  getTechTree: () => techTree,
});

// Screen-space FPS feedback (desktop only)
const reticleUi = createReticleUi();

// Create a simple mesh for each friendly unit type. Kept in renderSync so main.ts stays smaller.
function createFriendlyMesh(f: Friendly): THREE.Object3D {
  return createFriendlyMeshRender(f);
}

// Add a friendly unit to the game world and create its visual representation.
function addFriendlyUnit(f: Friendly): void {
  friendlies.push(f);
  const mesh = createFriendlyMesh(f);
  friendlyVisuals.set(f, mesh);
  tabletop.root.add(mesh);
}

// Remove all friendly visuals from the scene (called on reset).
function clearFriendlyVisuals(): void {
  for (const mesh of friendlyVisuals.values()) {
    tabletop.root.remove(mesh);
  }
  friendlyVisuals.clear();
}

// Update positions of friendly visuals to match simulation coordinates.
function updateFriendlyVisuals(): void {
  syncFriendlyVisualPositions(friendlyVisuals);
}

function rebuildArena(): void {
  if (arena) {
    arena.removeFromParent();
  }
  const preset = (districtSel.value as DistrictPreset) ?? 'mixed';
  // Seed is stable per rebuild so replays / debugging are consistent.
  const seed = Math.floor(Math.random() * 1_000_000_000);
  arena = createArena({ preset, seed });
  tabletop.root.add(arena);
  // Obstacles/buildings are tagged as buildings in createArena(). Used for the human rooftop mechanic.
  buildingMeshes = arena.children.filter((c) => (c as any).userData?.isBuilding) as THREE.Mesh[];
}

rebuildArena();

// --- Race track visuals + tracker (simple loop) ---
// Extend game modes with tower defense/RTS/FPS hybrid. New mode preserves
// existing functionality and adds build/research/possession features.
type GameMode = 'arena' | 'race' | 'td_rts_fps';
let gameMode: GameMode = 'arena';
let raceTracker: RaceTracker | null = null;
let raceStartSimTime = 0;

const raceTrackGroup = new THREE.Group();
raceTrackGroup.visible = false;
tabletop.root.add(raceTrackGroup);

// A simple rectangular loop inside the arena.
const raceLoopPts = [
  new Vector2(-38, -24),
  new Vector2(38, -24),
  new Vector2(38, 24),
  new Vector2(-38, 24),
];

// Finish line segment on the left edge.
const raceFinishA = new Vector2(-38, -6);
const raceFinishB = new Vector2(-38, 6);

// Checkpoints: midpoints of each edge (must be hit in order).
const raceCheckpoints = [
  new Vector2(0, -24),
  new Vector2(38, 0),
  new Vector2(0, 24),
  new Vector2(-38, 0),
];

function buildRaceTrackVisuals() {
  raceTrackGroup.clear();

  // Track centerline
  const linePts = [...raceLoopPts, raceLoopPts[0]].map(p => new THREE.Vector3(p.x, 0.06, p.y));
  const geo = new THREE.BufferGeometry().setFromPoints(linePts);
  const mat = new THREE.LineBasicMaterial({ color: 0x4df3ff, transparent: true, opacity: 0.55 });
  const line = new THREE.Line(geo, mat);
  raceTrackGroup.add(line);

  // Low walls
  const wallMat = new THREE.MeshStandardMaterial({ color: 0x101624, metalness: 0.1, roughness: 0.6, emissive: new THREE.Color(0x05060a) });
  const wallH = 1.2;
  const wallT = 0.8;
  for (let i = 0; i < raceLoopPts.length; i++) {
    const a = raceLoopPts[i];
    const b = raceLoopPts[(i + 1) % raceLoopPts.length];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.sqrt(dx * dx + dy * dy);
    const wall = new THREE.Mesh(new THREE.BoxGeometry(len, wallH, wallT), wallMat);
    wall.position.set((a.x + b.x) * 0.5, wallH * 0.5, (a.y + b.y) * 0.5);
    wall.rotation.y = Math.atan2(dy, dx);
    wall.castShadow = true;
    wall.receiveShadow = true;
    raceTrackGroup.add(wall);
  }

  // Finish line
  const finish = new THREE.Mesh(
    new THREE.PlaneGeometry(12, 2.6),
    new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: new THREE.Color(0x9cf4ff), emissiveIntensity: 1.2, transparent: true, opacity: 0.85 })
  );
  finish.rotation.x = -Math.PI / 2;
  finish.position.set((raceFinishA.x + raceFinishB.x) * 0.5, 0.07, (raceFinishA.y + raceFinishB.y) * 0.5);
  raceTrackGroup.add(finish);

  // Checkpoints markers
  const cpMat = new THREE.MeshStandardMaterial({ color: 0xff4df1, emissive: new THREE.Color(0x551144), emissiveIntensity: 0.9, transparent: true, opacity: 0.75 });
  for (const p of raceCheckpoints) {
    const m = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 0.15, 18), cpMat);
    m.position.set(p.x, 0.08, p.y);
    m.rotation.x = Math.PI / 2;
    raceTrackGroup.add(m);
  }
}

buildRaceTrackVisuals();

function setGameMode(m: GameMode) {
  gameMode = m;
  raceTrackGroup.visible = (m === 'race');
}

// Keep mode toggle responsive even before starting.
modeSel.addEventListener('change', () => {
  // Cast the selected value to GameMode. Fall back to 'arena' if unknown.
  const v = modeSel.value as GameMode;
  setGameMode(v);
});
// Initialize game mode based on selected value. Cast ensures type safety.
setGameMode(modeSel.value as GameMode);

// Switch between desktop 1:1 world and VR tabletop diorama.
renderer.xr.addEventListener('sessionstart', () => {
  tabletop.setTabletopMode();
});
renderer.xr.addEventListener('sessionend', () => {
  tabletop.setDesktopMode();
});

// Particles
// Fire/explosion core (additive)
const particles = new ParticleSystem(2600, {
  blending: THREE.AdditiveBlending,
  sizePx: 9,
  color: 0xffc86b,
});
const DEFAULT_PARTICLE_COLOR = 0xffc86b;
tabletop.root.add(particles.points);

// Fast sparks for impacts (additive, smaller)
const sparks = new ParticleSystem(2200, {
  blending: THREE.AdditiveBlending,
  sizePx: 5.5,
  color: 0xffffff,
});
tabletop.root.add(sparks.points);

// Smoke (normal blending so it reads as smoke instead of neon glow)
const smoke = new ParticleSystem(2600, {
  blending: THREE.NormalBlending,
  depthWrite: false,
  sizePx: 18,
  color: 0x4e5a66,
});

// World-space shockwaves for explosions (VR-safe, no camera shake).
const shockwaves = new ShockwavePool(tabletop.root);
tabletop.root.add(smoke.points);

// --- Visual-only VFX helpers (VR-safe) ---
// Heat haze: a few translucent quads near the FPS muzzle. No postprocessing.
const heatHazeGroup = new THREE.Group();
heatHazeGroup.name = 'heatHazeGroup';
camera.add(heatHazeGroup);
heatHazeGroup.visible = false;

function makeSoftBlobTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = 64;
  c.height = 64;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(32, 32, 2, 32, 32, 32);
  g.addColorStop(0, 'rgba(255,255,255,0.85)');
  g.addColorStop(1, 'rgba(255,255,255,0.0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.needsUpdate = true;
  return tex;
}

const softBlobTex = makeSoftBlobTexture();
const heatHazeMat = new THREE.MeshBasicMaterial({
  color: 0xffffff,
  transparent: true,
  opacity: 0.08,
  depthWrite: false,
  map: softBlobTex,
});
const heatHazePlanes: THREE.Mesh[] = [];
for (let i = 0; i < 3; i++) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.22), heatHazeMat);
  m.position.set(0.06, -0.06, -0.73 - i * 0.04);
  heatHazeGroup.add(m);
  heatHazePlanes.push(m);
}

// Scorch decals (grenade impacts): simple dark circular decal that fades out.
function makeScorchTexture(): THREE.Texture {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const ctx = c.getContext('2d')!;
  ctx.clearRect(0, 0, c.width, c.height);
  const g = ctx.createRadialGradient(64, 64, 8, 64, 64, 64);
  g.addColorStop(0, 'rgba(0,0,0,0.55)');
  g.addColorStop(0.55, 'rgba(0,0,0,0.25)');
  g.addColorStop(1, 'rgba(0,0,0,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c);
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.needsUpdate = true;
  return tex;
}

const scorchTex = makeScorchTexture();
const scorchMat = new THREE.MeshBasicMaterial({
  map: scorchTex,
  transparent: true,
  opacity: 0.85,
  depthWrite: false,
});
const scorchGeo = new THREE.PlaneGeometry(4.2, 4.2);
type Scorch = { mesh: THREE.Mesh; age: number; dur: number };
const scorchDecals: Scorch[] = [];

function spawnScorchDecal(x: number, z: number): void {
  const mesh = new THREE.Mesh(scorchGeo, scorchMat.clone());
  mesh.rotation.x = -Math.PI * 0.5;
  mesh.position.set(x, 0.011, z);
  mesh.renderOrder = 1;
  tabletop.root.add(mesh);
  scorchDecals.push({ mesh, age: 0, dur: 7.5 + Math.random() * 2.5 });
}

function updateScorchDecals(dt: number): void {
  for (let i = scorchDecals.length - 1; i >= 0; i--) {
    const d = scorchDecals[i];
    d.age += dt;
    const t = THREE.MathUtils.clamp(d.age / d.dur, 0, 1);
    const alpha = 0.85 * (1 - t);
    const mat = d.mesh.material as THREE.MeshBasicMaterial;
    mat.opacity = alpha;
    if (t >= 1) {
      tabletop.root.remove(d.mesh);
      d.mesh.geometry.dispose();
      (d.mesh.material as THREE.Material).dispose();
      scorchDecals.splice(i, 1);
    }
  }
}

let heatHazeT = 0;
function updateHeatHaze(dt: number): void {
  if (!heatHazeGroup.visible) return;
  heatHazeT += dt;
  for (let i = 0; i < heatHazePlanes.length; i++) {
    const p = heatHazePlanes[i];
    const wob = Math.sin(heatHazeT * (8 + i * 2.5)) * 0.015;
    p.rotation.z = wob;
    p.scale.setScalar(1.0 + Math.sin(heatHazeT * 6.0 + i) * 0.08);
  }
}

// VR build ghost: a simple preview mesh driven by controller raycast.
const vrBuildGhost = new THREE.Mesh(
  new THREE.CylinderGeometry(1.2, 1.2, 0.12, 18),
  new THREE.MeshBasicMaterial({ color: 0x00ff00, transparent: true, opacity: 0.35, depthWrite: false })
);
vrBuildGhost.rotation.x = Math.PI * 0.5;
vrBuildGhost.visible = false;
tabletop.root.add(vrBuildGhost);

// Central VFX logic (testable)
const vfx = new VfxManager({
  spawnFlameSparks: (origin2, dir2) => {
    const p = new THREE.Vector3(origin2.x, 0.62, origin2.y);
    const d = new THREE.Vector3(dir2.x, 0.2, dir2.y).normalize();
    sparks.setColor(0xffd39b);
    sparks.spawnDirectionalSparks(p, d, 0.28);
  },
  setHeatHaze: (active) => {
    heatHazeGroup.visible = active && fpsGunRoot.visible;
  },
  spawnGrenadeTrail: (pos2, vel2) => {
    smoke.setColor(0x4e5a66);
    smoke.spawnTrailPoint(new THREE.Vector3(pos2.x, 0.55, pos2.y), new THREE.Vector3(vel2.x * 0.05, 0.5, vel2.y * 0.05), 0.35);
  },
  spawnScorchDecal: (pos2) => spawnScorchDecal(pos2.x, pos2.y),
  spawnHitFeedback: (pos2, normal2) => {
    const p = new THREE.Vector3(pos2.x, 0.6, pos2.y);
    // small flash
    particles.setColor(0xffffff);
    particles.spawnExplosion(p, 0.04 * EXPLOSION_INTENSITY_SCALE);
    // sparks biased away from normal
    const n = new THREE.Vector3(normal2.x, 0.15, normal2.y).normalize();
    sparks.setColor(0xfff3c7);
    sparks.spawnDirectionalSparks(p, n, 0.22);
    particles.setColor(DEFAULT_PARTICLE_COLOR);
  },
});

function updateFlamethrowerVfx(simTime: number): void {
  if (!sim || !player) return;
  // World sparks for any flamethrower firing (player or enemies).
  const sources: Entity[] = [player, ...sim.enemies];
  for (const ent of sources) {
    for (const w of ent.weapons) {
      if (!(w instanceof FlamethrowerWeapon)) continue;
      const firing = (simTime - w.lastFireTime) <= 0.10;
      if (!firing) continue;
      const origin = new Vector2(ent.car.position.x, ent.car.position.y);
      const dir = new Vector2(Math.cos(ent.car.heading), Math.sin(ent.car.heading));
      // If player is in Human mode, use muzzle for heat haze + nicer sparks.
      if (ent === player && (vehicleSel.value as VehicleChoice) === 'human' && fpsGunRoot.visible && !isXRPresenting(renderer)) {
        const muzzle = new THREE.Vector3();
        fpsMuzzleFlash.getWorldPosition(muzzle);
        const q = new THREE.Quaternion();
        camera.getWorldQuaternion(q);
        const worldDir = new THREE.Vector3(0, 0, -1).applyQuaternion(q).normalize();
        vfx.updateFlamethrower({
          simTime,
          lastFireTime: w.lastFireTime,
          origin: new Vector2(muzzle.x, muzzle.z),
          dir: new Vector2(worldDir.x, worldDir.z).normalize(),
        });
      } else {
        // Non-player / non-FPS: sparks only.
        vfx.updateFlamethrower({ simTime, lastFireTime: w.lastFireTime, origin, dir });
      }
    }
  }
}

function updateVrBuildGhost(): void {
  if (!isXRPresenting(renderer) || gameMode !== 'td_rts_fps') {
    vrBuildGhost.visible = false;
    return;
  }
  // Only show during build phase and when user is actively placing something.
  const buildPhase = !!waveScheduler && waveScheduler.isReadyForNextWave();
  const hasPendingBuild = !!pendingBuildType;
  if (!buildPhase || !hasPendingBuild) {
    vrBuildGhost.visible = false;
    return;
  }
  // Raycast controller (c1) to the tabletop ground plane (y=0).
  const origin = new THREE.Vector3();
  c1.getWorldPosition(origin);
  const q = new THREE.Quaternion();
  c1.getWorldQuaternion(q);
  const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(q).normalize();
  if (Math.abs(dir.y) < 1e-4) {
    vrBuildGhost.visible = false;
    return;
  }
  const t = (0 - origin.y) / dir.y;
  if (!(t > 0)) {
    vrBuildGhost.visible = false;
    return;
  }
  const hit = origin.clone().add(dir.multiplyScalar(t));
  // Validate placement (bounds + overlap + credits).
  const cost = getBuildCost(pendingBuildType as any);
  const valid = credits >= cost && Friendly.isPlacementValid(hit.x, hit.z, friendlies);
  const res = vfx.updateBuildGhost({
    buildPhase,
    hasPendingBuild,
    valid,
    isXR: true,
  });
  vrBuildGhost.visible = res.visible;
  vrBuildGhost.position.set(hit.x, 0.02, hit.z);
  const mat = vrBuildGhost.material as THREE.MeshBasicMaterial;
  mat.color.setHex(res.color === 'green' ? 0x18ff4a : 0xff2d2d);
}

// Global explosion intensity scale (visual only). Keep explosions compact.
const EXPLOSION_INTENSITY_SCALE = 0.12;

// Bullet/pellet tracers: clearly visible streaks for hitscan weapons.
const tracers = new TracerRenderer(700);
tabletop.root.add(tracers.lines);

// Simple projectile meshes (so missiles/rockets are visible in-flight)
const projectileGroup = new THREE.Group();
tabletop.root.add(projectileGroup);
// Make each weapon visually distinct (projectile silhouettes + emissive palette)
// Slightly larger missiles + brighter emissive to ensure they're visible in VR.
const missileGeo = new THREE.ConeGeometry(0.18, 0.72, 12);
const rocketGeo = new THREE.CylinderGeometry(0.12, 0.08, 0.55, 10);
const missileMat = new THREE.MeshStandardMaterial({
  color: WEAPON_VFX.missile.projectileColor,
  emissive: WEAPON_VFX.missile.projectileColor,
  emissiveIntensity: 1.85,
  roughness: 0.25,
  metalness: 0.15,
});
const rocketMat = new THREE.MeshStandardMaterial({
  color: WEAPON_VFX.rocket.projectileColor,
  emissive: WEAPON_VFX.rocket.impactColor,
  emissiveIntensity: 0.95,
  roughness: 0.35,
  metalness: 0.25,
});
const missileMeshes: THREE.Mesh[] = [];
const rocketMeshes: THREE.Mesh[] = [];
const missilePrev: { x: number; y: number }[] = [];
const rocketPrev: { x: number; y: number }[] = [];
const missileWasAlive: boolean[] = [];
const rocketWasAlive: boolean[] = [];

// Grenades (visual mesh + smoke trail)
const grenadeGroup = new THREE.Group();
tabletop.root.add(grenadeGroup);
const grenadeGeo = new THREE.SphereGeometry(0.12, 10, 10);
const grenadeMat = new THREE.MeshStandardMaterial({ color: 0x2b2f3a, roughness: 0.7, metalness: 0.1 });
const grenadeMeshes = new Map<number, THREE.Mesh>();
const grenadePrevAlive = new Map<number, boolean>();
let grenadeIdCounter = 1;
const grenadeIds = new WeakMap<object, number>();

function getGrenadeId(g: object): number {
  const ex = grenadeIds.get(g);
  if (ex) return ex;
  const id = grenadeIdCounter++;
  grenadeIds.set(g, id);
  return id;
}

// Missile/rocket exhaust "flame" so projectiles read clearly while moving.
const exhaustGeo = new THREE.ConeGeometry(0.12, 0.35, 10);
const missileExhaustMat = new THREE.MeshStandardMaterial({
  color: WEAPON_VFX.missile.trailColor,
  emissive: WEAPON_VFX.missile.trailColor,
  emissiveIntensity: 2.2,
  roughness: 0.2,
  metalness: 0.05,
  transparent: true,
  opacity: 0.95,
});
const rocketExhaustMat = new THREE.MeshStandardMaterial({
  color: WEAPON_VFX.rocket.trailColor,
  emissive: WEAPON_VFX.rocket.trailColor,
  emissiveIntensity: 1.75,
  roughness: 0.25,
  metalness: 0.05,
  transparent: true,
  opacity: 0.9,
});
const missileExhaustMeshes: THREE.Mesh[] = [];
const rocketExhaustMeshes: THREE.Mesh[] = [];

type DisintegratingVisual = {
  obj: THREE.Object3D;
  age: number;
  dur: number;
  mats: THREE.Material[];
};

type DebrisPiece = {
  mesh: THREE.Mesh;
  vel: THREE.Vector3;
  angVel: THREE.Vector3;
  age: number;
  dur: number;
};

// Keep a short-lived disintegration effect when an entity dies.
const disintegrations = new Map<any, DisintegratingVisual>();

// Debris: small physical-looking chunks that fly out of vehicles on destruction.
const debrisGroup = new THREE.Group();
tabletop.root.add(debrisGroup);
const debrisPieces: DebrisPiece[] = [];
const debrisGeo = new THREE.BoxGeometry(0.18, 0.12, 0.28);
const debrisMat = new THREE.MeshStandardMaterial({
  color: 0x2a2f3a,
  roughness: 0.65,
  metalness: 0.35,
});

function spawnDebris(pos: THREE.Vector3, count: number, tint?: number) {
  for (let i = 0; i < count; i++) {
    const mesh = new THREE.Mesh(debrisGeo, debrisMat.clone());
    const m = mesh.material as THREE.MeshStandardMaterial;
    if (typeof tint === 'number') {
      // Give debris a subtle tint so it feels connected to the hit.
      m.emissive = new THREE.Color(tint);
      m.emissiveIntensity = 0.25;
    }
    mesh.position.copy(pos);
    mesh.position.y += 0.25 + Math.random() * 0.35;
    mesh.rotation.set(Math.random() * Math.PI, Math.random() * Math.PI, Math.random() * Math.PI);
    mesh.scale.setScalar(0.85 + Math.random() * 1.25);
    debrisGroup.add(mesh);

    const vel = new THREE.Vector3(
      (Math.random() - 0.5) * 5.2,
      3.2 + Math.random() * 4.8,
      (Math.random() - 0.5) * 5.2
    );
    const angVel = new THREE.Vector3(
      (Math.random() - 0.5) * 8,
      (Math.random() - 0.5) * 10,
      (Math.random() - 0.5) * 8
    );
    debrisPieces.push({ mesh, vel, angVel, age: 0, dur: 1.6 + Math.random() * 1.1 });
  }
}

function updateDebris(dt: number) {
  for (let i = debrisPieces.length - 1; i >= 0; i--) {
    const d = debrisPieces[i];
    d.age += dt;
    if (d.age >= d.dur) {
      d.mesh.removeFromParent();
      (d.mesh.material as THREE.Material).dispose?.();
      debrisPieces.splice(i, 1);
      continue;
    }

    // Integrate
    d.vel.multiplyScalar(0.985);
    d.vel.y -= 9.81 * dt * 0.75;
    d.mesh.position.addScaledVector(d.vel, dt);
    d.mesh.rotation.x += d.angVel.x * dt;
    d.mesh.rotation.y += d.angVel.y * dt;
    d.mesh.rotation.z += d.angVel.z * dt;

    // Fake ground contact + skid
    if (d.mesh.position.y < 0.06) {
      d.mesh.position.y = 0.06;
      d.vel.y = Math.abs(d.vel.y) * 0.35;
      d.vel.x *= 0.7;
      d.vel.z *= 0.7;
    }

    // Fade out near end
    const t = THREE.MathUtils.clamp(d.age / d.dur, 0, 1);
    const alpha = 1 - t;
    const mat = d.mesh.material as any;
    if (typeof mat.opacity === 'number') {
      mat.transparent = true;
      mat.opacity = alpha;
    } else {
      mat.transparent = true;
      mat.opacity = alpha;
    }
  }
}

function updateDisintegrations(dt: number) {
  for (const [key, d] of disintegrations) {
    d.age += dt;
    const t = THREE.MathUtils.clamp(d.age / d.dur, 0, 1);
    const fade = 1 - t;
    // Fade and slightly shrink for a "disintegrate" feel.
    d.obj.scale.setScalar(0.92 + fade * 0.08);
    for (const m of d.mats) {
      setMaterialFade(m, fade);
      const anyM: any = m;
      if (anyM.emissive && typeof anyM.emissiveIntensity === 'number') {
        anyM.emissiveIntensity = Math.max(anyM.emissiveIntensity, 1.25) * fade;
      }
    }

    if (t >= 1) {
      disintegrations.delete(key);
      // Caller removes the visual from the scene.
    }
  }
}

function cloneMaterialsForFade(root: THREE.Object3D): THREE.Material[] {
  const mats: THREE.Material[] = [];
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const m = mesh.material as any;
    if (Array.isArray(m)) {
      const cloned = m.map((mm: THREE.Material) => (mm ? mm.clone() : mm));
      mesh.material = cloned as any;
      for (const cm of cloned) if (cm) mats.push(cm);
    } else if (m) {
      const cm = (m as THREE.Material).clone();
      mesh.material = cm as any;
      mats.push(cm);
    }
  });
  return mats;
}

function setMaterialFade(m: THREE.Material, alpha: number) {
  const anyM = m as any;
  if (typeof anyM.opacity === 'number') {
    anyM.transparent = true;
    anyM.opacity = THREE.MathUtils.clamp(alpha, 0, 1);
  }
}

function spawnGreatExplosion(pos: THREE.Vector3, tint: number, intensity = 1.0) {
  // Core fireball
  particles.setColor(tint);
  particles.spawnExplosion(pos, 0.85 * intensity * EXPLOSION_INTENSITY_SCALE);

  // Hot white sparks
  sparks.setColor(0xffffff);
  sparks.spawnSparks(pos.clone().add(new THREE.Vector3(0, 0.08, 0)), 1.55 * intensity);

  // Secondary glowing burst (quick pop)
  particles.setColor(0xffffff);
  particles.spawnExplosion(pos.clone().add(new THREE.Vector3(0, 0.08, 0)), 0.35 * intensity * EXPLOSION_INTENSITY_SCALE);

  // Smoke plume (lingers)
  smoke.setColor(0x55606b);
  smoke.spawnSmoke(pos.clone().add(new THREE.Vector3(0, 0.15, 0)), 0.62 * intensity);

  // Shockwave ring (ground-facing)
  shockwaves.spawn(pos, tint, intensity);

  // Radial streaks (readable in VR and on desktop)
  const n = 14;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + Math.random() * 0.25;
    const r = 1.2 + Math.random() * 1.2;
    const bx = pos.x + Math.cos(a) * r;
    const bz = pos.z + Math.sin(a) * r;
    tracers.add(pos.x, pos.y + 0.1, pos.z, bx, pos.y + 0.1, bz, tint, 0.22);
  }

  particles.setColor(DEFAULT_PARTICLE_COLOR);
}

function startDisintegration(key: any, obj: THREE.Object3D, pos: THREE.Vector3, tint: number) {
  if (disintegrations.has(key)) return;
  const mats = cloneMaterialsForFade(obj);
  // A slightly longer effect feels satisfying.
  disintegrations.set(key, { obj, mats, age: 0, dur: 0.85 });
  // Big satisfying hit: fireball + sparks + smoke + debris chunks.
  spawnGreatExplosion(pos, tint, 1.35);
  spawnDebris(pos, 10 + Math.floor(Math.random() * 6), tint);
  // Extra secondary sparks for "metal tearing" feel.
  sparks.setColor(0xfff3c7);
  sparks.spawnSparks(pos.clone().add(new THREE.Vector3(0, 0.12, 0)), 0.9);
}

// Mine visuals (so all weapons have a 3D representation)
const mineGroup = new THREE.Group();
tabletop.root.add(mineGroup);
const mineGeo = new THREE.IcosahedronGeometry(0.22, 0);
const mineMat = new THREE.MeshStandardMaterial({
  color: 0x1b1f2a,
  emissive: WEAPON_VFX.mine.projectileColor,
  emissiveIntensity: 1.0,
  roughness: 0.55,
  metalness: 0.2,
});
const mineArmedMat = new THREE.MeshStandardMaterial({
  color: 0x1b1f2a,
  emissive: WEAPON_VFX.mine.projectileColor,
  emissiveIntensity: 1.55,
  roughness: 0.45,
  metalness: 0.25,
});
const mineMeshes: THREE.Mesh[] = [];

// Target highlight ring (3D)
const targetHighlight = new THREE.Mesh(
  new THREE.TorusGeometry(1.05, 0.09, 10, 26),
  new THREE.MeshStandardMaterial({
    color: 0xffffff,
    emissive: new THREE.Color(0xffffff),
    emissiveIntensity: 1.2,
    roughness: 0.35,
    metalness: 0.05,
    transparent: true,
    opacity: 0.9,
  })
);
targetHighlight.rotation.x = Math.PI * 0.5;
targetHighlight.visible = false;
tabletop.root.add(targetHighlight);

// Postprocessing
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 0.85, 0.4, 0.9);
composer.addPass(bloomPass);

function setBloom(enabled: boolean) {
  bloomPass.enabled = enabled;
}
setBloom(checkedOr(bloomToggle, true));
onChange(bloomToggle, () => setBloom(checkedOr(bloomToggle, true)));

let timeScale = 1;
timeScale = checkedOr(slowmoToggle, false) ? 0.35 : 1;
onChange(slowmoToggle, () => {
  timeScale = checkedOr(slowmoToggle, false) ? 0.35 : 1;
});

// Mouse aiming (FPS) toggle UI
function syncMouseAimUi() {
  if (!mouseAimStatus) return;
  mouseAimStatus.textContent = checkedOr(mouseAimChk, false) ? 'Mouse aiming: ON' : 'Mouse aiming: OFF';
}
syncMouseAimUi();
onChange(mouseAimChk, () => {
  syncMouseAimUi();
  // If disabled while pointer-locked, exit pointer lock.
  if (!checkedOr(mouseAimChk, false) && document.pointerLockElement === renderer.domElement) {
    document.exitPointerLock().catch(() => {});
  }
});

// Start HP slider
if (startHpSlider && startHpLabel) {
  const sync = () => {
    startHpLabel.textContent = String(startHpSlider.value);
  };
  sync();
  startHpSlider.addEventListener('input', sync);
}

// Controller models (nice touch)
const controllerModelFactory = new XRControllerModelFactory();
const c1 = renderer.xr.getController(0);
const c2 = renderer.xr.getController(1);
const g1 = renderer.xr.getControllerGrip(0);
const g2 = renderer.xr.getControllerGrip(1);
g1.add(controllerModelFactory.createControllerModel(g1));
g2.add(controllerModelFactory.createControllerModel(g2));
scene.add(c1, c2, g1, g2);

// --- Simulation wiring ---
let sim: GameSimulation | null = null;
let player: Entity | null = null;
let targeting: TargetingSystem | null = null;

// Replay / kill-cam (very lightweight)
type ReplaySnap = { px: number; pz: number; heading: number };
const replayBuf = new ReplayBuffer<ReplaySnap>(6);
let replayActive = false;
let replayT = 0;
let replayStartT = 0;
let replayEndT = 0;

// Enemy helicopter pool (toggled by UI)
const enemyHelis: Enemy[] = [];

const visuals = new Map<Entity, THREE.Object3D>();
const vehicleType = new Map<Entity, VehicleVisualType>();

// Per-entity visual Y offsets (used for rooftop positioning, etc.).
const entityYOffset = new Map<Entity, number>();

// Low-cost "damaged vehicle" smoke timers. We spawn a few smoke puffs
// per second depending on HP ratio.
const smokeAcc = new Map<Entity, number>();

function getEntityBaseY(ent: Entity): number {
  // Helicopters are lifted to read well in tabletop VR; other entities use the map.
  if (ent.hovering) return 1.25;
  return entityYOffset.get(ent) ?? 0;
}

function makePlayer(choice: VehicleChoice): Entity {
  const car = new Car();
  // baseline tuning per vehicle
  if (choice === 'sports') {
    car.maxSpeed = 28;
    car.accelerationRate = 20;
    car.turnRate = 3.0;
    return new Entity(car, 80);
  }
  if (choice === 'muscle') {
    car.maxSpeed = 24;
    car.accelerationRate = 16;
    car.turnRate = 2.6;
    return new Entity(car, 110);
  }
  if (choice === 'buggy') {
    car.maxSpeed = 26;
    car.accelerationRate = 18;
    car.turnRate = 3.2;
    return new Entity(car, 90);
  }
  if (choice === 'heli') {
    car.maxSpeed = 22;
    car.accelerationRate = 18;
    car.turnRate = 2.8;
    const e = new Entity(car, 140);
    e.invulnerable = true;
    e.hovering = true;
    return e;
  }
  if (choice === 'human') {
    // Human: slower movement but tight turning. Invulnerable by request.
    car.maxSpeed = 9;
    car.accelerationRate = 18;
    car.brakeDeceleration = 28;
    car.turnRate = 3.6;
    const e = new Entity(car, 9999);
    e.invulnerable = true;
    return e;
  }
  // tank
  car.maxSpeed = 17;
  car.accelerationRate = 11;
  car.turnRate = 1.9;
  return new Entity(car, 160);
}

function attachDefaultLoadout(ent: Entity, opts: { airstrikeSink?: { addAirstrike: (owner: Entity, x: number, y: number, delay: number, radius: number, damage: number) => void } } = {}) {
  const isHeli = ent.hovering === true;

  if (isHeli) {
    // Helicopter-only: minigun + airstrike. Also keep homing missiles as a fun bonus.
    ent.weapons.push(new Minigun(ent, 0.03, null, 30, 2));
    ent.weapons.push(new HomingMissileWeapon(ent, 2.3, 8, 28, 7.6, 2.6, 36));
    if (opts.airstrikeSink) {
      // AirstrikeWeapon signature: (owner, sink, cooldown, delay, radius, damage, ammo?)
      ent.weapons.push(new AirstrikeWeapon(ent, opts.airstrikeSink, 6.5, 0.85, 7.5, 55, 6));
    }
    return;
  }

  // Default ground vehicles
  ent.weapons.push(new MachineGun(ent, 0.08, null, 28, 3));
  ent.weapons.push(new MineWeapon(ent, 1.4, 10, 0.35, 3.2, 18));
  ent.weapons.push(new HomingMissileWeapon(ent, 2.2, 6, 26, 7.5, 2.4, 35));
  ent.weapons.push(new RocketWeapon(ent, 1.25, 10, 30, 2.8, 26));
  ent.weapons.push(new Shotgun(ent, 0.9, 18, 14, Math.PI / 2.8, 8, 18));
  ent.weapons.push(new EMPWeapon(ent, 6, 4, 15, 2.25, 0.55));
}

function attachHumanLoadout(ent: Entity) {
  // Human weapons are cycled with middle mouse (desktop) or a VR button.
  // 0) Anti-materiel rifle: slow cadence, huge damage, long range.
  ent.weapons.push(new AntiMaterielRifle(ent, 0.55, null, 120, 34));
  // 1) Carbine: reliable hitscan.
  ent.weapons.push(new MachineGun(ent, 0.11, null, 40, 6));
  // 2) Minigun: close-mid range bullet hose.
  ent.weapons.push(new Minigun(ent, 0.035, null, 34, 3));
  // 3) Bazooka: slow, heavy rocket.
  ent.weapons.push(new BazookaWeapon(ent, 1.1, 8, 18, 4.0, 75));
  // 4) Grenade launcher: timed splash.
  ent.weapons.push(new GrenadeLauncher(ent, 0.9, 14, 16, 0.75, 3.5, 40));
  // 5) Flamethrower: very short range cone.
  ent.weapons.push(new FlamethrowerWeapon(ent, 0.06, null, 9.5, Math.PI / 3.2, 2));
  // 6) Stinger: lock-on anti-air missile. Intended for enemy helicopters.
  ent.weapons.push(new StingerWeapon(ent, 2.15, 6, 36, 4.8, 2.4, 110));
}

function addVisual(ent: Entity, type: VehicleVisualType) {
  const mesh = createVehicleMesh(type);
  mesh.position.set(ent.car.position.x, 0, ent.car.position.y);
  tabletop.root.add(mesh);
  visuals.set(ent, mesh);
  vehicleType.set(ent, type);
}

function removeVisual(ent: Entity) {
  const v = visuals.get(ent);
  if (v) {
    tabletop.root.remove(v);
    v.traverse((c) => {
      const m = c as THREE.Mesh;
      if (m.isMesh) {
        m.geometry.dispose();
        const mat = m.material as THREE.Material;
        mat.dispose();
      }
    });
  }
  removeHealthBar(ent);
  visuals.delete(ent);
  vehicleType.delete(ent);
}

function spawnOnlookers(count: number) {
  if (!sim) return;
  for (let i = 0; i < count; i++) {
    const ol = new Onlooker(new Car(), 20);
    ol.car.position.x = (Math.random() - 0.5) * 80;
    ol.car.position.y = (Math.random() - 0.5) * 80;
    sim.onlookers.push(ol);
    addVisual(ol, 'onlooker');
  }
}

function spawnEnemies(count: number) {
  if (!sim) return;
  for (let i = 0; i < count; i++) {
    const e = new Enemy(new Car(), 60);
    e.car.position.x = (Math.random() - 0.5) * 80;
    e.car.position.y = (Math.random() - 0.5) * 80;
    e.chooseRandomPark(80);
    e.chooseRandomPark(80);
    // Simple enemy loadout: MG + mines + occasional rocket
    e.weapons.push(new MachineGun(e, 0.18, null, 24, 2));
    e.weapons.push(new MineWeapon(e, 3.2, 999, 0.45, 3.0, 16));
    e.weapons[0].autoFire = true;
    e.weapons[1].autoFire = false;
    sim.addEnemy(e);
    addVisual(e, 'enemy');
  }
}

function spawnEnemyHelicopters(count: number) {
  if (!sim) return;
  for (let i = 0; i < count; i++) {
    const e = new Enemy(new Car(), 80);
    e.hovering = true;
    e.car.maxSpeed = 20;
    e.car.accelerationRate = 18;
    e.car.turnRate = 2.6;
    e.car.position.x = (Math.random() - 0.5) * 80;
    e.car.position.y = (Math.random() - 0.5) * 80;
    e.chooseRandomPark(90);
    e.chooseRandomPark(80);
    e.chooseRandomPark(80);
    e.weapons.push(new Minigun(e, 0.05, null, 28, 2));
    e.weapons[0].autoFire = true;
    sim.addEnemy(e);
    enemyHelis.push(e);
    addVisual(e, 'enemyHeli');
  }
}

function setEnemyHelicoptersEnabled(enabled: boolean) {
  if (!sim) return;
  if (enabled) {
    if (enemyHelis.length === 0) spawnEnemyHelicopters(2);
    return;
  }
  // disable: remove existing
  for (const e of enemyHelis) {
    e.alive = false;
    removeVisual(e);
  }
  enemyHelis.length = 0;
}

function spawnPickup() {
  if (!sim) return;
  const px = (Math.random() - 0.5) * 70;
  const py = (Math.random() - 0.5) * 70;
  const roll = Math.random();
  if (roll < 0.25) sim.addPickup(new HealthPickup(px, py, 35));
  else if (roll < 0.45) sim.addPickup(new AmmoPickup(px, py, 6));
  else if (roll < 0.65) sim.addPickup(new ShieldPickup(px, py, 25));
  else if (roll < 0.85) sim.addPickup(new ScorePickup(px, py, 60));
  else {
    // weapon pickup gives extra ammo to shotgun/rocket/EMP by re-granting a weapon instance
    const dummy = sim.player;
    const w = Math.random() < 0.5
      ? new Shotgun(dummy, 0.9, 10, 14, Math.PI / 2.8, 8, 18)
      : new EMPWeapon(dummy, 6, 2, 15, 2.25, 0.55);
    sim.addPickup(new WeaponPickup(px, py, w));
  }
}

// Visual markers for pickups (simple emissive spheres)
const pickupMesh = new THREE.Mesh(
  new THREE.SphereGeometry(0.35, 12, 12),
  new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0x4df3ff, emissiveIntensity: 0.9, roughness: 0.25, metalness: 0.1 })
);
pickupMesh.castShadow = true;

const pickupVisuals: THREE.Object3D[] = [];

// Keep track of tower visuals so they can be cleaned up between resets. These
// correspond 1:1 with towers managed by `towerDef`.
const towerVisuals: THREE.Object3D[] = [];
function syncPickupVisuals() {
  // remove old
  for (const o of pickupVisuals) tabletop.root.remove(o);
  pickupVisuals.length = 0;
  if (!sim) return;
  for (const p of sim.pickups) {
    const m = pickupMesh.clone();
    m.position.set(p.position.x, 0.55, p.position.y);
    // type hint by emissive
    const mat = (m as THREE.Mesh).material as THREE.MeshStandardMaterial;
    if (p instanceof HealthPickup) mat.emissive.set(0x63ff7a);
    else if (p instanceof AmmoPickup) mat.emissive.set(0xffd04a);
    else if (p instanceof ShieldPickup) mat.emissive.set(0x46d2ff);
    else if (p instanceof ScorePickup) mat.emissive.set(0xff7cff);
    else mat.emissive.set(0xffffff);
    tabletop.root.add(m);
    pickupVisuals.push(m);
  }
}

// --- Input ---
const keys = new Set<string>();
window.addEventListener('keydown', (e) => {
  keys.add(e.code);
  // prevent tab focus-steal
  if (e.code === 'Tab') e.preventDefault();
});
window.addEventListener('keyup', (e) => keys.delete(e.code));

// Middle mouse cycles human weapons on desktop.
window.addEventListener('mousedown', (e) => {
  if (e.button !== 1) return;
  const choice = (vehicleSel.value as VehicleChoice) || 'sports';
  if (choice !== 'human' || !player) return;
  humanWeaponIndex = (humanWeaponIndex + 1) % Math.max(1, player.weapons.length);
  e.preventDefault();
});

// Desktop mouse aiming (FPS Human): pointer lock + mouse look + left-click fire.
function isMouseAimActive(): boolean {
  if (isXRPresenting(renderer)) return false;
  if (!checkedOr(mouseAimChk, false)) return false;
  const choice = (vehicleSel.value as VehicleChoice) || 'sports';
  return choice === 'human' && !!player;
}

document.addEventListener('pointerlockchange', () => {
  mouseAimPointerLocked = (document.pointerLockElement === renderer.domElement);
});

document.addEventListener('mousemove', (e) => {
  if (!isMouseAimActive() || !mouseAimPointerLocked) return;
  mouseAimYaw += e.movementX * mouseAimSensitivity;
  mouseAimPitch -= e.movementY * mouseAimSensitivity;
  mouseAimPitch = Math.max(-mouseAimPitchClamp, Math.min(mouseAimPitchClamp, mouseAimPitch));
});

// Request pointer lock on left click on the canvas. If already locked, fire.
renderer.domElement.addEventListener('mousedown', (e) => {
  if (e.button !== 0) return;
  if (!isMouseAimActive()) return;
  // Do not lock when clicking UI.
  const target = e.target as HTMLElement;
  if (target.closest('#panel') || target.closest('#hud') || target.closest('#minimap') || target.closest('#mainMenu')) return;
  if (document.pointerLockElement !== renderer.domElement) {
    renderer.domElement.requestPointerLock?.();
    e.preventDefault();
    return;
  }
  // Already locked: left-click fires.
  fireHumanWeaponMouseAim();
  e.preventDefault();
});

// --- TD-RTS-FPS mode input handlers (desktop) ---
// Convert screen coordinates to world (simulation) coordinates on the ground plane (y=0).
function screenToWorld(clientX: number, clientY: number): { x: number; y: number; } | null {
  const rect = renderer.domElement.getBoundingClientRect();
  const ndcX = ((clientX - rect.left) / rect.width) * 2 - 1;
  const ndcY = -((clientY - rect.top) / rect.height) * 2 + 1;
  const ndc = new THREE.Vector3(ndcX, ndcY, 0.5);
  ndc.unproject(camera);
  const dir = ndc.sub(camera.position).normalize();
  // Intersect with ground plane y=0. If camera is below ground, ignore.
  if (Math.abs(dir.y) < 1e-4) return null;
  const t = -camera.position.y / dir.y;
  if (t < 0) return null;
  const worldX = camera.position.x + dir.x * t;
  const worldY = camera.position.z + dir.z * t;
  return { x: worldX, y: worldY };
}

// Handle left/right clicks for building, selecting and commanding in TD mode.
renderer.domElement.addEventListener('mousedown', (ev) => {
  // Only intercept in TD mode and when not interacting with UI (panel/minimap).
  if (gameMode !== 'td_rts_fps') return;
  // Ignore if clicking on HUD or panel
  const target = ev.target as HTMLElement;
  if (target.closest('#panel') || target.closest('#hud') || target.closest('#minimap')) return;
  // Determine world position
  const pos = screenToWorld(ev.clientX, ev.clientY);
  if (!pos || !sim) return;
  // Left click: build or select
  if (ev.button === 0) {
    ev.preventDefault();
    // Build if pending type and build phase
    if (waveScheduler && waveScheduler.isReadyForNextWave() && pendingBuildType) {
      // Validate placement
      if (techTree && commandSys) {
        const type: FriendlyType = pendingBuildType;
        // Determine cost by creating a dummy friendly to read its cost
        const dummy = new Friendly(type, pos.x, pos.y);
        const cost = dummy.cost;
        if (credits >= cost && Friendly.isPlacementValid(pos.x, pos.y, friendlies)) {
          credits -= cost;
          const f = new Friendly(type, pos.x, pos.y);
          addFriendlyUnit(f);
          // Clear pending after placement
          pendingBuildType = null;
        }
      }
      return;
    }
    // Otherwise, attempt to select a friendly (closest within small radius)
    if (commandSys) {
      let closest: Friendly | null = null;
      let bestDist2 = 3.5 * 3.5;
      for (const f of friendlies) {
        const dx = f.position.x - pos.x;
        const dy = f.position.y - pos.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < bestDist2) {
          bestDist2 = d2;
          closest = f;
        }
      }
      if (closest) {
        commandSys.select(closest, ev.shiftKey);
      } else {
        // Clear selection if clicked empty
        commandSys.clearSelection();
      }
    }
  }
  // Right click: move command for selected troopers
  if (ev.button === 2) {
    ev.preventDefault();
    if (commandSys) {
      commandSys.moveSelected(new Vector2(pos.x, pos.y));
    }
  }
});

// Prevent context menu when right-clicking on the canvas in TD mode.
renderer.domElement.addEventListener('contextmenu', (ev) => {
  if (gameMode === 'td_rts_fps') {
    ev.preventDefault();
  }
});

function key(code: string) { return keys.has(code); }

// Targeting and lock state
let lockProgress = 0;

// Human weapon cycling (desktop: middle mouse; VR: button)
let humanWeaponIndex = 0;

// --- Desktop mouse aiming (FPS Human) ---
let mouseAimYaw = 0; // radians in world space
let mouseAimPitch = 0; // radians (clamped)
let mouseAimPointerLocked = false;
const mouseAimSensitivity = 0.0022;
const mouseAimPitchClamp = Math.PI * 0.47; // ~85 deg

// Simple FPS gun + muzzle flash (camera-attached, desktop only)
const fpsGunRoot = new THREE.Group();
fpsGunRoot.name = 'fpsGunRoot';
const fpsGun = new THREE.Group();
{
  const body = new THREE.Mesh(
    new THREE.BoxGeometry(0.18, 0.12, 0.45),
    new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.55, metalness: 0.25 })
  );
  body.position.set(0, -0.08, -0.35);
  const barrel = new THREE.Mesh(
    new THREE.CylinderGeometry(0.025, 0.025, 0.28, 10),
    new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.45, metalness: 0.35 })
  );
  barrel.rotation.x = Math.PI * 0.5;
  barrel.position.set(0.06, -0.06, -0.56);
  const grip = new THREE.Mesh(
    new THREE.BoxGeometry(0.09, 0.16, 0.14),
    new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.6, metalness: 0.15 })
  );
  grip.position.set(0.05, -0.18, -0.28);
  fpsGun.add(body, barrel, grip);
}
// Muzzle flash mesh (briefly visible)
const fpsMuzzleFlash = new THREE.Mesh(
  new THREE.SphereGeometry(0.06, 10, 10),
  new THREE.MeshStandardMaterial({ color: 0xfff1b8, emissive: 0xffc04a, emissiveIntensity: 2.0, roughness: 0.2, metalness: 0.0, transparent: true, opacity: 0.95 })
);
fpsMuzzleFlash.position.set(0.06, -0.06, -0.67);
fpsMuzzleFlash.visible = false;
fpsGun.add(fpsMuzzleFlash);
fpsGunRoot.add(fpsGun);
camera.add(fpsGunRoot);
fpsGunRoot.visible = false;
let fpsMuzzleFlashFramesLeft = 0;
let vrCycleWeaponPrev = false;

// Visual-only recoil springs (desktop only; XR uses world-space feedback).
const recoilKick = new RecoilSpring(); // viewmodel kickback
const recoilPitch = new RecoilSpring(); // slight upward tilt
// Slight offset so the weapon reads clearly, even with wider FOV.
fpsGunRoot.position.set(0.18, -0.15, -0.12);
const fpsGunBasePos = fpsGunRoot.position.clone();

let locked = false;

function getTargetsSorted(): Entity[] {
  if (!sim || !player) return [];
  const aliveEnemies = sim.enemies.filter(e => e.alive);
  const aliveOnlookers = sim.onlookers.filter(o => o.alive);
  return [...aliveEnemies, ...aliveOnlookers];
}

function getHeliTargetsSorted(): Entity[] {
  if (!sim || !player) return [];
  return sim.enemies.filter(e => e.alive && e.hovering);
}

function clampArena(ent: Entity) {
  // Delegate to world/bounds module. Keep behavior identical.
  clampArenaWorld(ent);
}

// --- Human rooftop system ---
let humanOnRoof = false;
let humanBuilding: THREE.Mesh | null = null;
let vrEnterRoofPrev = false;

function nearestBuildingWithinRadius(x: number, z: number, radius: number): THREE.Mesh | null {
  let best: THREE.Mesh | null = null;
  let bestD2 = radius * radius;
  for (const b of buildingMeshes) {
    const dx = b.position.x - x;
    const dz = b.position.z - z;
    const d2 = dx * dx + dz * dz;
    if (d2 < bestD2) {
      bestD2 = d2;
      best = b;
    }
  }
  return best;
}

function setHumanRoofState(onRoof: boolean, building: THREE.Mesh | null) {
  humanOnRoof = onRoof;
  humanBuilding = building;
  if (!player) return;
  if (!onRoof || !building) {
    entityYOffset.delete(player);
    return;
  }
  const roofY = (building as any).userData?.roofY ?? (building.position.y + 1.0);
  entityYOffset.set(player, roofY);
}

function tryEnterBuildingRoof() {
  if (!player) return;
  const b = nearestBuildingWithinRadius(player.car.position.x, player.car.position.y, 4.0);
  if (!b) return;
  // Teleport to roof center.
  player.car.position.x = b.position.x;
  player.car.position.y = b.position.z;
  setHumanRoofState(true, b);
}

function stepHumanRoofConstraint() {
  if (!player || !humanOnRoof || !humanBuilding) return;
  const he = (humanBuilding as any).userData?.halfExtents as { x: number; z: number } | undefined;
  if (!he) return;
  const pad = 0.35;
  player.car.position.x = THREE.MathUtils.clamp(player.car.position.x, humanBuilding.position.x - he.x + pad, humanBuilding.position.x + he.x - pad);
  player.car.position.y = THREE.MathUtils.clamp(player.car.position.y, humanBuilding.position.z - he.z + pad, humanBuilding.position.z + he.z - pad);
}

// --- VR input ---
// Centralized XR controller bindings (keep main.ts smaller).
hookXRButtons({
  c1,
  c2,
  isHumanMode: () => !!player && (vehicleSel.value as VehicleChoice) === 'human',
  firePrimary: () => firePrimary(),
  fireBazooka: () => fireBazooka(),
  dropMine: () => dropMine(),
});


function cycleHumanWeapon(): void {
  if (!player) return;
  const choice = (vehicleSel.value as VehicleChoice) || 'sports';
  if (choice !== 'human') return;
  // Human loadout order is stable; clamp index.
  humanWeaponIndex = (humanWeaponIndex + 1) % Math.max(1, player.weapons.length);
}

function currentHumanWeaponName(): string {
  if (!player) return '';
  const w = player.weapons[humanWeaponIndex];
  if (!w) return '';
  if (w instanceof AntiMaterielRifle) return 'Anti-materiel rifle';
  if (w instanceof StingerWeapon) return 'Stinger (AA)';
  if (w instanceof BazookaWeapon || w instanceof RocketWeapon) return 'Bazooka';
  if (w instanceof GrenadeLauncher) return 'Grenade launcher';
  if (w instanceof FlamethrowerWeapon) return 'Flamethrower';
  if (w instanceof Minigun) return 'Minigun';
  if (w instanceof MachineGun) return 'Carbine';
  return 'Weapon';
}


// --- Weapon actions (player) ---
function getWeapon<T>(cls: new (...args: any[]) => T): T | null {
  if (!player) return null;
  for (const w of player.weapons) if (w instanceof cls) return w as any;
  return null;
}

function firePrimary(): void {
  const choice = (vehicleSel.value as VehicleChoice) || 'sports';
  if (choice === 'human') {
    fireHumanWeapon();
    return;
  }
  fireMachineGun();
}

function spawnEnemyHitFeedback(shooter: Entity, target: Entity): void {
  const pos = new Vector2(target.car.position.x, target.car.position.y);
  const n = new Vector2(
    target.car.position.x - shooter.car.position.x,
    target.car.position.y - shooter.car.position.y
  ).normalize();
  vfx.onEnemyHit(pos, n);

  // Screen-space hit marker only for desktop FPS/Human mode.
  if (shooter === player && fpsGunRoot.visible && !isXRPresenting(renderer)) {
    reticleUi.flashHit();
  }
}

function fireHumanWeapon(): void {
  if (!sim || !player || !targeting) return;
  const w = player.weapons[humanWeaponIndex];
  if (!w) return;

  // Decide a target set depending on weapon.
  const candidates = (w instanceof StingerWeapon) ? getHeliTargetsSorted() : getTargetsSorted();
  const t = targeting.getTarget();
  const target = (t && candidates.includes(t)) ? t : (candidates[0] ?? null);
  if (!target) return;

  if (w instanceof StingerWeapon) {
    // Requires lock; lock is computed in the fixed-step update.
    if (!locked) return;
    w.fire(sim.simTime, target);
    triggerFpsMuzzleFlash();
    kickFpsRecoil(0.85);
    // visible missile tracer hint (actual projectile visuals are in updateParticlesFromProjectiles)
    spawnTracer(player.car.position.x, player.car.position.y, target.car.position.x, target.car.position.y, 'missile');
    return;
  }

  if (w instanceof RocketWeapon) {
    // Bazooka is treated as a short-range rocket.
    fireBazooka();
    return;
  }

  if (w instanceof GrenadeLauncher) {
    w.fire(sim.simTime, target);
    triggerFpsMuzzleFlash();
    kickFpsRecoil(0.9);
    // Light tracer hint toward the aim target.
    spawnTracer(player.car.position.x, player.car.position.y, target.car.position.x, target.car.position.y, 'rocket');
    particles.setColor(WEAPON_VFX.rocket.impactColor);
    particles.spawnExplosion(new THREE.Vector3(player.car.position.x, getEntityBaseY(player) + 0.35, player.car.position.y), 0.03 * EXPLOSION_INTENSITY_SCALE);
    particles.setColor(DEFAULT_PARTICLE_COLOR);
    return;
  }

  if (w instanceof FlamethrowerWeapon) {
    w.spray(sim.simTime, getTargetsSorted());
    // Continuous weapon: subtle constant recoil while firing.
    triggerFpsMuzzleFlash();
    kickFpsRecoil(0.35);
    if (target.alive) spawnEnemyHitFeedback(player, target);
    particles.setColor(WEAPON_VFX.machinegun.impactColor);
    particles.spawnExplosion(new THREE.Vector3(player.car.position.x, getEntityBaseY(player) + 0.33, player.car.position.y), 0.02 * EXPLOSION_INTENSITY_SCALE);
    particles.setColor(DEFAULT_PARTICLE_COLOR);
    return;
  }

  if (w instanceof AntiMaterielRifle) {
    w.fire(sim.simTime, target);
    triggerFpsMuzzleFlash();
    kickFpsRecoil(1.25);
    if (target.alive) spawnEnemyHitFeedback(player, target);
    spawnTracer(player.car.position.x, player.car.position.y, target.car.position.x, target.car.position.y, 'antimateriel');
    // smaller muzzle flash
    particles.setColor(WEAPON_VFX.antimateriel.impactColor);
    particles.spawnExplosion(new THREE.Vector3(player.car.position.x, getEntityBaseY(player) + 0.35, player.car.position.y), 0.028 * EXPLOSION_INTENSITY_SCALE);
    particles.setColor(DEFAULT_PARTICLE_COLOR);
    return;
  }

  if (w instanceof MachineGun) {
    w.fire(sim.simTime, target);
    triggerFpsMuzzleFlash();
    kickFpsRecoil(0.65);
    if (target.alive) spawnEnemyHitFeedback(player, target);
    spawnTracer(player.car.position.x, player.car.position.y, target.car.position.x, target.car.position.y, 'machinegun');
    particles.setColor(WEAPON_VFX.machinegun.impactColor);
    particles.spawnExplosion(new THREE.Vector3(player.car.position.x, getEntityBaseY(player) + 0.35, player.car.position.y), 0.032 * EXPLOSION_INTENSITY_SCALE);
    particles.setColor(DEFAULT_PARTICLE_COLOR);
    return;
  }
}

function getMouseAimedTarget(candidates: Entity[]): Entity | null {
  if (!player) return null;
  if (candidates.length === 0) return null;
  const px = player.car.position.x;
  const pz = player.car.position.y;
  // Forward direction from mouse aim yaw (on XZ plane)
  const fx = Math.cos(mouseAimYaw);
  const fz = Math.sin(mouseAimYaw);
  let best: Entity | null = null;
  let bestScore = -Infinity;
  for (const c of candidates) {
    if (!c.alive) continue;
    const dx = c.car.position.x - px;
    const dz = c.car.position.y - pz;
    const d2 = dx * dx + dz * dz;
    if (d2 < 0.001) continue;
    const invLen = 1 / Math.sqrt(d2);
    const nx = dx * invLen;
    const nz = dz * invLen;
    const dot = nx * fx + nz * fz; // [-1..1]
    // Prefer targets near the center of aim and closer distance.
    const score = dot * 2.0 - Math.sqrt(d2) * 0.01;
    if (score > bestScore) {
      bestScore = score;
      best = c;
    }
  }
  // Require target to be generally in front
  if (bestScore < 0.25) return null;
  return best;
}

function triggerFpsMuzzleFlash(): void {
  fpsMuzzleFlashFramesLeft = 2;
  fpsMuzzleFlash.visible = true;
}

function kickFpsRecoil(strength: number): void {
  if (isXRPresenting(renderer)) return;
  // Keep subtle to avoid nausea; viewmodel recoil only.
  recoilKick.kick(0.9 * strength);
  recoilPitch.kick(0.6 * strength);
}

function fireHumanWeaponMouseAim(): void {
  if (!sim || !player) return;
  const w = player.weapons[humanWeaponIndex];
  if (!w) return;
  // Only override aiming for hitscan weapons to keep the change minimal.
  if (w instanceof AntiMaterielRifle) {
    const candidates = getTargetsSorted();
    const target = getMouseAimedTarget(candidates);
    if (!target) return;
    w.fire(sim.simTime, target);
    if (target.alive) spawnEnemyHitFeedback(player, target);
    spawnTracer(player.car.position.x, player.car.position.y, target.car.position.x, target.car.position.y, 'antimateriel');
    triggerFpsMuzzleFlash();
    kickFpsRecoil(1.25);
    return;
  }
  if (w instanceof MachineGun) {
    const candidates = getTargetsSorted();
    const target = getMouseAimedTarget(candidates);
    if (!target) return;
    w.fire(sim.simTime, target);
    if (target.alive) spawnEnemyHitFeedback(player, target);
    spawnTracer(player.car.position.x, player.car.position.y, target.car.position.x, target.car.position.y, 'machinegun');
    triggerFpsMuzzleFlash();
    kickFpsRecoil(0.65);
    return;
  }
  // For other weapons (bazooka / stinger), fall back to existing targeting logic.
  fireHumanWeapon();
  triggerFpsMuzzleFlash();
  kickFpsRecoil(0.85);
}

function spawnTracer(startX: number, startY: number, endX: number, endY: number, key: keyof typeof WEAPON_VFX) {
  // Render a short-lived line segment so bullets are clearly visible.
  const style = WEAPON_VFX[key];
  const y = (player ? getEntityBaseY(player) : 0) + 0.62;
  // Slight forward bias so the segment isn't hidden inside the vehicle mesh.
  tracers.add(startX, y, startY, endX, y, endY, style.tracerColor, 0.09);
}

function fireMachineGun() {
  if (!sim || !player) return;
  // Human uses anti-materiel rifle; heli uses minigun; ground uses MG
  const am = getWeapon(AntiMaterielRifle) as any;
  const mg = am ?? ((getWeapon(Minigun) as any) ?? (getWeapon(MachineGun) as any));
  if (!mg) return;
  const t = targeting?.getTarget();
  // Machine gun is hitscan; allow firing without target by picking nearest enemy in front
  const candidates = getTargetsSorted();
  const target = t ?? candidates[0] ?? null;
  if (!target) return;
  const sx = player.car.position.x;
  const sz = player.car.position.y;
  const ex = target.car.position.x;
  const ez = target.car.position.y;
  mg.fire(sim.simTime, target);
  if (target.alive) spawnEnemyHitFeedback(player, target);
  const styleKey = am ? 'antimateriel' : (player.hovering ? 'minigun' : 'machinegun');
  spawnTracer(sx, sz, ex, ez, styleKey as any);
  // muzzle flash (keep it small; previous value was too "grenade-like")
  particles.setColor(am ? WEAPON_VFX.antimateriel.impactColor : (player.hovering ? WEAPON_VFX.minigun.impactColor : WEAPON_VFX.machinegun.impactColor));
  particles.spawnExplosion(
    new THREE.Vector3(sx, getEntityBaseY(player) + 0.35, sz),
    (am ? 0.03 : (player.hovering ? 0.045 : 0.035)) * EXPLOSION_INTENSITY_SCALE
  );
  particles.setColor(DEFAULT_PARTICLE_COLOR);
}

function dropMine() {
  if (!sim || !player) return;
  const mw = getWeapon(MineWeapon);
  if (!mw) return;
  mw.fire(sim.simTime, player);
  // drop flash
  particles.setColor(WEAPON_VFX.mine.impactColor);
  particles.spawnExplosion(new THREE.Vector3(player.car.position.x, 0.25, player.car.position.y), 0.12 * EXPLOSION_INTENSITY_SCALE);
  particles.setColor(DEFAULT_PARTICLE_COLOR);
}

function fireMissile() {
  if (!sim || !player) return;
  const hm = getWeapon(HomingMissileWeapon);
  const t = targeting?.getTarget();
  if (!hm || !t) return;
  // require lock
  if (!locked) return;
  hm.fire(sim.simTime, t);
}

function fireRocket() {
  if (!sim || !player) return;
  const rw = getWeapon(RocketWeapon);
  const t = targeting?.getTarget() ?? (getTargetsSorted()[0] ?? null);
  if (!rw || !t) return;
  rw.fire(sim.simTime, t);
}

function fireBazooka() {
  if (!sim || !player) return;
  // Prefer BazookaWeapon, fall back to RocketWeapon for backwards compatibility.
  const rw = (getWeapon(BazookaWeapon) as any) ?? getWeapon(RocketWeapon);
  const t = targeting?.getTarget() ?? (getTargetsSorted()[0] ?? null);
  if (!rw || !t) return;
  rw.fire(sim.simTime, t);
  // compact muzzle pop so it reads but doesn't overwhelm
  particles.setColor(WEAPON_VFX.rocket.impactColor);
  particles.spawnExplosion(
    new THREE.Vector3(player.car.position.x, getEntityBaseY(player) + 0.4, player.car.position.y),
    0.055 * EXPLOSION_INTENSITY_SCALE
  );
  particles.setColor(DEFAULT_PARTICLE_COLOR);
}

function fireShotgun() {
  if (!sim || !player) return;
  const sg = getWeapon(Shotgun);
  const t = targeting?.getTarget() ?? (getTargetsSorted()[0] ?? null);
  if (!sg || !t) return;
  sg.fire(sim.simTime, t);
  // pellet burst: multiple short tracers around the main direction
  const sx = player.car.position.x;
  const sz = player.car.position.y;
  const ex = t.car.position.x;
  const ez = t.car.position.y;
  for (let i = 0; i < 4; i++) {
    const ox = (Math.random() - 0.5) * 1.8;
    const oz = (Math.random() - 0.5) * 1.8;
    spawnTracer(sx, sz, ex + ox, ez + oz, 'shotgun');
  }
}

function fireEMP() {
  if (!sim || !player) return;
  const emp = getWeapon(EMPWeapon);
  if (!emp) return;
  emp.pulse(sim.simTime, [...sim.enemies, ...sim.onlookers]);
  // Visual pulse ring
  particles.setColor(WEAPON_VFX.emp.impactColor);
  particles.spawnExplosion(new THREE.Vector3(player.car.position.x, 0.45, player.car.position.y), 0.55 * EXPLOSION_INTENSITY_SCALE);
  particles.setColor(DEFAULT_PARTICLE_COLOR);
}

function fireAirstrike() {
  if (!sim || !player) return;
  const as = getWeapon(AirstrikeWeapon);
  if (!as) return;
  const t = targeting?.getTarget() ?? (getTargetsSorted()[0] ?? null);
  if (!t) return;
  as.fire(sim.simTime, t);
  // marker pulse
  particles.setColor(WEAPON_VFX.airstrike.impactColor);
  particles.spawnExplosion(new THREE.Vector3(t.car.position.x, 0.8, t.car.position.y), 0.35 * EXPLOSION_INTENSITY_SCALE);
  particles.setColor(DEFAULT_PARTICLE_COLOR);
}

// --- Start / reset ---
function resetWorld() {
  // Apply selected district preset on each start/restart.
  rebuildArena();
  replayActive = false;
  replayBuf.clear();
  tracers.clear();
  missilePrev.length = 0;
  rocketPrev.length = 0;
  // Clear visuals
  for (const [ent] of visuals) removeVisual(ent);
  for (const o of pickupVisuals) tabletop.root.remove(o);
  pickupVisuals.length = 0;

  // Remove any existing tower visuals and reset tower defence manager when
  // starting a new game. Without this cleanup, towers would accumulate after
  // multiple restarts.
  for (const o of towerVisuals) tabletop.root.remove(o);
  towerVisuals.length = 0;
  towerDef = null;

  const choice = (vehicleSel.value as VehicleChoice) || 'sports';
  player = makePlayer(choice);
  // Initialize desktop mouse aim to current heading for a stable first lock.
  mouseAimYaw = player.car.heading;
  mouseAimPitch = 0;
  // reset rooftop state every restart
  setHumanRoofState(false, null);
  // Respect mode selection for all supported game modes.
  setGameMode(modeSel.value as GameMode);

  if (gameMode === 'race') {
    // Spawn just before the finish line so the first cross starts the lap once checkpoints are met.
    player.car.position.set(-44, 0);
    const laps = Math.max(1, Math.min(10, Number(lapsSel.value) || 3));
    raceTracker = new RaceTracker({
      checkpoints: raceCheckpoints,
      checkpointRadius: 4.0,
      finishA: raceFinishA,
      finishB: raceFinishB,
      lapsToFinish: laps,
    });
    raceStartSimTime = 0;
  } else {
    raceTracker = null;
    player.car.position.set(0, 0);
  }

  // Apply start HP slider (up to 1000)
  const hp0 = Math.max(50, Math.min(1000, Number(startHpSlider?.value ?? 160)));
  player.maxHP = hp0;
  player.hp = hp0;

  sim = new GameSimulation(player, { onlookerRule: OnlookerKillRule.ArcadeBonus });
  if (((vehicleSel.value as VehicleChoice) || 'sports') === 'human') {
    attachHumanLoadout(player);
  } else {
    attachDefaultLoadout(player, {
      airstrikeSink: {
        addAirstrike: (owner, x, y, delay, radius, damage) => {
          sim?.addAirstrike(new AirstrikeInstance(owner, x, y, delay, radius, damage));
        },
      },
    });
  }
  targeting = new TargetingSystem();

  addVisual(player, choice);
  // In race mode we keep the chaos light so the track is readable.
  if (gameMode === 'race') {
    // Reduced enemy count for race mode. Fewer opponents makes races less chaotic and
    // easier to follow, especially with the new larger world.
    spawnEnemies(2);
    spawnOnlookers(6);
    for (let i = 0; i < 4; i++) spawnPickup();
    // Avoid infinite scaling mid-race.
    sim.enemySpawnCooldown = 9999;
  } else {
    // Arena/tower defence mode starts with fewer enemies to give towers time to act.
    spawnEnemies(3);
    spawnOnlookers(10);
    for (let i = 0; i < 6; i++) spawnPickup();
  }

  // Initialize tower defence only in non-race and non-RTS modes. Classic tower defence
  // towers provide static automated defences that attack incoming waves of enemies.
  // They are placed at fixed positions around the centre of the arena. Visuals are
  // created here and stored in `towerVisuals` for cleanup on reset.
  if (gameMode !== 'race' && gameMode !== 'td_rts_fps') {
    towerDef = new TowerDefense(sim);
    // Tower positions chosen to roughly cover all approaches into the looped road.
    const towerPositions: [number, number][] = [
      [-35, -35], [35, -35], [-35, 35], [35, 35]
    ];
    for (const [tx, ty] of towerPositions) {
      const tower = new Tower(tx, ty, 45, 0.8, 10);
      towerDef.addTower(tower);
      // Base: squat cylinder representing the turret housing
      const baseGeo = new THREE.CylinderGeometry(0.6, 0.6, 1.4, 10);
      const baseMat = new THREE.MeshStandardMaterial({ color: 0x353f5d, metalness: 0.2, roughness: 0.6 });
      const base = new THREE.Mesh(baseGeo, baseMat);
      base.position.set(tx, 0.7, ty);
      base.castShadow = true;
      base.receiveShadow = true;
      // Barrel: emissive cylinder that hints at a muzzle. It points along +Z.
      const barrelGeo = new THREE.CylinderGeometry(0.1, 0.1, 1.4, 8);
      const barrelMat = new THREE.MeshStandardMaterial({ color: 0x4df3ff, emissive: 0x4df3ff, emissiveIntensity: 0.8, metalness: 0.2, roughness: 0.4 });
      const barrel = new THREE.Mesh(barrelGeo, barrelMat);
      barrel.rotation.x = Math.PI / 2;
      barrel.position.set(tx, 1.2, ty + 0.7);
      barrel.castShadow = true;
      barrel.receiveShadow = true;
      tabletop.root.add(base);
      tabletop.root.add(barrel);
      towerVisuals.push(base, barrel);
    }
  } else {
    towerDef = null;
  }

  // --- TD-RTS-FPS hybrid init ---
  // Only initialise these structures when entering the hybrid mode. Other modes
  // leave them null so no TD-specific logic runs.
  if (gameMode === 'td_rts_fps') {
    friendlies = [];
    friendlyVisuals.clear();
    credits = 120; // starting credits for the player
    commandSys = new CommandSystem();
    waveScheduler = new WaveScheduler(sim);
    techTree = new TechTree(defaultTechs);
    possession = new PossessionState();
    pendingBuildType = null;
    friendlyDamageBoost = 1;
    friendlyRangeBoost = 1;
    friendlyCooldownMultiplier = 1;
    unlockedTypes = ['auto', 'sniper', 'emp', 'trooper'];
    // Immediately show the build/research panel. The callbacks update global state.
    initTdPanel(techTree, (type: FriendlyType) => {
      // When clicking a build button, set the pending type if unlocked.
      if (!unlockedTypes.includes(type)) return;
      pendingBuildType = type;
    }, (techId: string) => {
      // Research callback: adjust global multipliers and unlock units.
      switch (techId) {
        case 'improvedBarrels':
          friendlyDamageBoost *= 1.1;
          break;
        case 'betterOptics':
          friendlyRangeBoost *= 1.15;
          break;
        case 'autoloader':
          friendlyCooldownMultiplier *= 0.85;
          break;
        case 'empCapacitors':
          // Future: modify EMP slowdown duration; noop for now.
          break;
        case 'missileTurret':
          // Unlock a powerful missile turret. We'll treat it as a sniper-like tower with high damage.
          // Use the 'sniper' type extended by this tech; new type string 'missile' is supported by build UI.
          (unlockedTypes as any).push('missile');
          break;
        case 'trooperArmor':
          // Trooper squads gain stronger damage in lieu of HP. Increase damage multiplier.
          friendlyDamageBoost *= 1.2;
          break;
      }
    });
    // Start the first wave automatically when entering the game. Players can build during combat phase
    // between waves as well.
    waveScheduler.startNextWave();
    // Initialize previous enemy count for credit tracking
    prevEnemyCount = sim.enemies.filter(e => e.alive).length;
  } else {
    // When not in TD mode, hide TD panel by clearing it. This prevents leftover UI
    // from the hybrid mode when switching back to race or arena.
    const existing = document.getElementById('tdPanel');
    if (existing) existing.innerHTML = '';
    techTree = null;
    commandSys = null;
    waveScheduler = null;
    possession = null;
  }

  // Apply enemy helicopter toggle
  setEnemyHelicoptersEnabled(checkedOr(enemyHeliToggle, true));

  // Reset debug toggles UI state
  if (sim) {
    sim.freezeEnemiesMovement = false;
    sim.disableEnemyAttacks = false;
  }
  freezeEnemiesBtn.textContent = 'Freeze';
  stopAttacksBtn.textContent = 'No-Attack';

  vrHelp.textContent = gameMode === 'race'
    ? 'Race mode: hit checkpoints in order, then cross the finish line. VR: Enter VR button (bottom).'
    : 'Arena mode: survive and score. VR: Enter VR button (bottom).';
}

startBtn.addEventListener('click', () => resetWorld());
restartBtn.addEventListener('click', () => resetWorld());

freezeEnemiesBtn.addEventListener('click', () => {
  if (!sim) return;
  sim.freezeEnemiesMovement = !sim.freezeEnemiesMovement;
  freezeEnemiesBtn.textContent = sim.freezeEnemiesMovement ? 'Unfreeze' : 'Freeze';
});

stopAttacksBtn.addEventListener('click', () => {
  if (!sim) return;
  sim.disableEnemyAttacks = !sim.disableEnemyAttacks;
  stopAttacksBtn.textContent = sim.disableEnemyAttacks ? 'Attack ON' : 'No-Attack';
});

enterBuildingBtn.addEventListener('click', () => {
  if (!player) return;
  const choice = (vehicleSel.value as VehicleChoice) || 'sports';
  if (choice !== 'human') return;
  tryEnterBuildingRoof();
});


onChange(enemyHeliToggle, () => {
  if (!sim) return;
  setEnemyHelicoptersEnabled(checkedOr(enemyHeliToggle, true));
});

// --- Main loop ---
let last = performance.now();
let acc = 0;
const fixedDt = 1 / 60;

function updateHUD() {
  if (!sim || !player) {
    hud.textContent = 'Press Start';
    return;
  }
  const tgt = targeting?.getTarget();
  const speed = player.car.velocity.length().toFixed(1);
  const raceLine = (raceTracker && gameMode === 'race')
    ? ` | Lap ${raceTracker.lap}/${Math.max(1, Number(lapsSel.value) || 3)} | CP ${raceTracker.checkpointIndex}/${raceCheckpoints.length} | Time ${(sim.simTime - (raceStartSimTime || sim.simTime)).toFixed(1)}s${raceTracker.finished ? ' (FINISH!)' : ''}`
    : '';
  const tdLine = (gameMode === 'td_rts_fps' && waveScheduler)
    ? ` | Credits ${credits.toFixed(0)} | Wave ${waveScheduler.currentWave + 1} | Phase ${waveScheduler.phase}`
    : '';
  hud.textContent = `HP ${player.hp.toFixed(0)}/${player.maxHP}  |  Speed ${speed}  |  Score ${sim.score}  |  Streak ${sim.streak}  |  x${sim.multiplier}  |  Heat ${sim.heat}${raceLine}${tdLine}\n` +
    `Target: ${tgt ? (vehicleType.get(tgt) ?? 'target') : 'none'}  |  Lock ${(lockProgress * 100).toFixed(0)}%${locked ? ' (LOCKED)' : ''}`;
}

function drawMinimap() {
  // `minimap` is required (validated at startup via requireEl).
  const ctx = minimap.getContext('2d');
  if (!ctx) return;
  ctx.clearRect(0, 0, minimap.width, minimap.height);
  if (!sim || !player) {
    ctx.globalAlpha = 0.6;
    ctx.fillStyle = '#e6eaf5';
    ctx.font = '14px system-ui';
    ctx.fillText('Press Start', 56, 104);
    ctx.globalAlpha = 1;
    return;
  }
  const w = minimap.width;
  const h = minimap.height;
  const cx = w * 0.5;
  const cy = h * 0.5;
  // world extent (match arena size roughly)
  const worldHalf = 55;
  const s = (Math.min(w, h) * 0.42) / worldHalf;

  const toPx = (x: number, y: number) => ({
    x: cx + x * s,
    y: cy + y * s,
  });

  // border
  ctx.strokeStyle = 'rgba(255,255,255,0.16)';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(cx, cy, Math.min(w, h) * 0.44, 0, Math.PI * 2);
  ctx.stroke();

  // Race overlay (centerline + finish)
  if (gameMode === 'race') {
    ctx.strokeStyle = 'rgba(77,243,255,0.35)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    const p0 = toPx(raceLoopPts[0].x, raceLoopPts[0].y);
    ctx.moveTo(p0.x, p0.y);
    for (let i = 1; i < raceLoopPts.length; i++) {
      const p = toPx(raceLoopPts[i].x, raceLoopPts[i].y);
      ctx.lineTo(p.x, p.y);
    }
    ctx.closePath();
    ctx.stroke();

    // finish line
    ctx.strokeStyle = 'rgba(156,244,255,0.8)';
    ctx.lineWidth = 3;
    const fa = toPx(raceFinishA.x, raceFinishA.y);
    const fb = toPx(raceFinishB.x, raceFinishB.y);
    ctx.beginPath();
    ctx.moveTo(fa.x, fa.y);
    ctx.lineTo(fb.x, fb.y);
    ctx.stroke();
  }

  // pickups
  ctx.fillStyle = 'rgba(77,243,255,0.85)';
  for (const p of sim.pickups) {
    const pt = toPx(p.position.x, p.position.y);
    ctx.fillRect(pt.x - 2, pt.y - 2, 4, 4);
  }

  // onlookers
  ctx.fillStyle = 'rgba(185,193,217,0.65)';
  for (const o of sim.onlookers) {
    if (!o.alive) continue;
    const pt = toPx(o.car.position.x, o.car.position.y);
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, 2.5, 0, Math.PI * 2);
    ctx.fill();
  }

  // enemies
  ctx.fillStyle = 'rgba(255,124,255,0.95)';
  for (const e of sim.enemies) {
    if (!e.alive) continue;
    const pt = toPx(e.car.position.x, e.car.position.y);
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, 4.2, 0, Math.PI * 2);
    ctx.fill();
  }

  // player
  ctx.fillStyle = 'rgba(77,243,255,1)';
  const pp = toPx(player.car.position.x, player.car.position.y);
  ctx.beginPath();
  ctx.arc(pp.x, pp.y, 5.5, 0, Math.PI * 2);
  ctx.fill();

  // target reticle
  const tgt = targeting?.getTarget();
  if (tgt && tgt.alive) {
    const tp = toPx(tgt.car.position.x, tgt.car.position.y);
    ctx.strokeStyle = 'rgba(255,255,255,0.95)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(tp.x, tp.y, 8, 0, Math.PI * 2);
    ctx.stroke();
  }
}

function syncEntityVisuals(dt: number) {
  if (!sim || !player) return;

  // handle removals and death VFX (great explosion + disintegration)
  const allEntities = [player, ...sim.enemies, ...sim.onlookers];
  for (const e of [...visuals.keys()]) {
    const shouldRemove = !allEntities.includes(e) || (!e.alive && !(replayActive && e === player));
    if (!shouldRemove) continue;

    const v = visuals.get(e);
    if (!v) continue;

    // Start disintegration once, then keep the visual briefly while it fades out.
    if (!disintegrations.has(e)) {
      const y = getEntityBaseY(e);
      const pos = new THREE.Vector3(e.car.position.x, y + 0.45, e.car.position.y);
      const tint = e.hovering ? WEAPON_VFX.minigun.impactColor : WEAPON_VFX.rocket.impactColor;
      startDisintegration(e, v, pos, tint);
    }
  }

  // advance disintegration timers and remove finished visuals
  updateDisintegrations(dt);
  for (const e of [...visuals.keys()]) {
    const shouldRemove = !allEntities.includes(e) || (!e.alive && !(replayActive && e === player));
    if (!shouldRemove) continue;
    if (disintegrations.has(e)) continue;
    removeVisual(e);
  }

  // ensure visuals exist
  for (const e of allEntities) {
    if (!e.alive && !(replayActive && e === player)) continue;
    if (!visuals.has(e)) {
      const t = e === player
        ? ((vehicleSel.value as VehicleChoice) || 'sports')
        : (e instanceof Enemy ? (e.hovering ? 'enemyHeli' : 'enemy') : 'onlooker');
      addVisual(e, t as VehicleVisualType);
    }
  }

  // update transforms
  for (const [e, v] of visuals) {
    const y = getEntityBaseY(e);
    v.position.set(e.car.position.x, y, e.car.position.y);
    v.rotation.y = headingToYaw(e.car.heading);

    // --- Damage smoke ---
    // Emits smoke from damaged (alive) non-hovering entities. Keeps it subtle
    // at high HP, ramps up heavily below ~35%.
    if (e.alive && !e.hovering) {
      const hp01 = e.maxHP > 0 ? (e.hp / e.maxHP) : 1;
      const dmg = 1 - THREE.MathUtils.clamp(hp01, 0, 1);
      if (dmg > 0.22) {
        const prev = smokeAcc.get(e) ?? 0;
        const next = prev + dt;
        smokeAcc.set(e, next);

        // Spawn interval tightens as damage increases.
        const interval = THREE.MathUtils.lerp(0.35, 0.10, THREE.MathUtils.clamp((dmg - 0.22) / 0.78, 0, 1));
        if (next >= interval) {
          smokeAcc.set(e, 0);
          const sx = e.car.position.x + (Math.random() - 0.5) * 0.45;
          const sz = e.car.position.y + (Math.random() - 0.5) * 0.45;
          const sy = y + 0.55 + Math.random() * 0.18;
          const vel = new THREE.Vector3(
            (Math.random() - 0.5) * 0.25,
            0.55 + Math.random() * 0.55,
            (Math.random() - 0.5) * 0.25
          );
          // Use longer-lived trail points for continuous smoke.
          smoke.spawnTrailPoint(new THREE.Vector3(sx, sy, sz), vel, 1.4 + Math.random() * 0.9);

          // Occasional orange sparks at very low HP.
          if (dmg > 0.65 && Math.random() < 0.35) {
            sparks.setColor(0xffd59b);
            sparks.spawnSparks(new THREE.Vector3(e.car.position.x, sy - 0.15, e.car.position.y), 0.45);
          }
        }
      }
    }

    // Helicopter rotors
    if (e.hovering) {
      const rotorA = v.getObjectByName('rotor_main');
      const rotorB = v.getObjectByName('rotor_main_2');
      const tail = v.getObjectByName('rotor_tail');
      const spin = performance.now() * 0.03;
      if (rotorA) rotorA.rotation.y = spin;
      if (rotorB) rotorB.rotation.y = -spin * 1.2;
      if (tail) tail.rotation.z = spin * 1.8;
    }
  }

  // 3D target highlight
  const tgt = targeting?.getTarget();
  if (tgt && tgt.alive) {
    const ty = getEntityBaseY(tgt);
    targetHighlight.position.set(tgt.car.position.x, ty + 0.06, tgt.car.position.y);
    const mat = targetHighlight.material as THREE.MeshStandardMaterial;
    const viz = computeTargetHighlightVisual({ lockProgress, locked, timeS: sim?.simTime ?? 0 });
    targetHighlight.scale.setScalar(viz.scale);
    mat.opacity = viz.opacity;
    mat.emissiveIntensity = viz.emissiveIntensity;
    const c = locked ? 0x7cfffa : 0xffffff;
    mat.color.setHex(c);
    mat.emissive.setHex(c);
    targetHighlight.visible = true;
  } else {
    targetHighlight.visible = false;
  }
}

function updateParticlesFromProjectiles() {
  if (!player) return;
  const hm = getWeapon(HomingMissileWeapon);
  if (hm) {
    // ensure meshes
    while (missileMeshes.length < hm.missiles.length) {
      const mesh = new THREE.Mesh(missileGeo, missileMat);
      mesh.castShadow = true;
      projectileGroup.add(mesh);
      missileMeshes.push(mesh);
      // Add a small exhaust flame as a child so the missile reads clearly in VR.
      const flame = new THREE.Mesh(exhaustGeo, missileExhaustMat);
      flame.position.set(0, -0.35, 0);
      flame.rotation.x = Math.PI; // point backward
      mesh.add(flame);
      missileExhaustMeshes.push(flame);
      missilePrev.push({ x: 0, y: 0 });
      missileWasAlive.push(false);
    }
    for (let i = 0; i < missileMeshes.length; i++) {
      const mesh = missileMeshes[i];
      const m = hm.missiles[i];
      const prevAlive = missileWasAlive[i] ?? false;
      if (!m || !m.alive) {
        // Spawn a satisfying detonation where the missile last was.
        if (prevAlive) {
          const prev = missilePrev[i];
          if (prev) spawnGreatExplosion(new THREE.Vector3(prev.x, 0.95, prev.y), WEAPON_VFX.missile.impactColor, 1.1);
        }
        missileWasAlive[i] = false;
        mesh.visible = false;
        continue;
      }
      missileWasAlive[i] = true;
      mesh.visible = true;
      mesh.position.set(m.position.x, 0.95, m.position.y);
      const prev = missilePrev[i] ?? (missilePrev[i] = { x: m.position.x, y: m.position.y });
      // visible trail segment (helps readability in non-VR)
      tracers.add(prev.x, 0.92, prev.y, m.position.x, 0.92, m.position.y, WEAPON_VFX.missile.trailColor, 0.14);
      prev.x = m.position.x;
      prev.y = m.position.y;
      // Point cone forward
      const ang = Math.atan2(m.direction.y, m.direction.x);
      mesh.rotation.y = -ang + Math.PI * 0.5;

      // Exhaust pulse
      const flame = missileExhaustMeshes[i];
      if (flame) flame.scale.setScalar(0.8 + Math.sin(performance.now() * 0.04 + i) * 0.2);
      particles.setColor(WEAPON_VFX.missile.trailColor);
      particles.spawnTrailPoint(new THREE.Vector3(m.position.x, 0.85, m.position.y), new THREE.Vector3(0, 0.22, 0), 0.18);
      particles.setColor(DEFAULT_PARTICLE_COLOR);
    }
  }
  const rw = getWeapon(RocketWeapon);
  if (rw) {
    while (rocketMeshes.length < rw.rockets.length) {
      const mesh = new THREE.Mesh(rocketGeo, rocketMat);
      mesh.castShadow = true;
      projectileGroup.add(mesh);
      rocketMeshes.push(mesh);
      const flame = new THREE.Mesh(exhaustGeo, rocketExhaustMat);
      flame.position.set(0, -0.3, 0);
      flame.rotation.x = Math.PI;
      mesh.add(flame);
      rocketExhaustMeshes.push(flame);
      rocketPrev.push({ x: 0, y: 0 });
      rocketWasAlive.push(false);
    }
    for (let i = 0; i < rocketMeshes.length; i++) {
      const mesh = rocketMeshes[i];
      const r = rw.rockets[i];
      const prevAlive = rocketWasAlive[i] ?? false;
      if (!r || !r.alive) {
        if (prevAlive) {
          const prev = rocketPrev[i];
          if (prev) spawnGreatExplosion(new THREE.Vector3(prev.x, 0.85, prev.y), WEAPON_VFX.rocket.impactColor, 1.0);
        }
        rocketWasAlive[i] = false;
        mesh.visible = false;
        continue;
      }
      rocketWasAlive[i] = true;
      mesh.visible = true;
      mesh.position.set(r.position.x, 0.85, r.position.y);
      const prev = rocketPrev[i] ?? (rocketPrev[i] = { x: r.position.x, y: r.position.y });
      tracers.add(prev.x, 0.82, prev.y, r.position.x, 0.82, r.position.y, WEAPON_VFX.rocket.trailColor, 0.16);
      prev.x = r.position.x;
      prev.y = r.position.y;
      const ang = Math.atan2(r.direction.y, r.direction.x);
      mesh.rotation.y = -ang;

      const flame = rocketExhaustMeshes[i];
      if (flame) flame.scale.setScalar(0.75 + Math.sin(performance.now() * 0.05 + i) * 0.25);
      particles.setColor(WEAPON_VFX.rocket.trailColor);
      particles.spawnTrailPoint(new THREE.Vector3(r.position.x, 0.75, r.position.y), new THREE.Vector3(0, 0.12, 0), 0.18);
      particles.setColor(DEFAULT_PARTICLE_COLOR);
    }
  }

  // Grenades: smoke trail while airborne + scorch decal on impact.
  if (sim) {
    const sources: Entity[] = [player, ...sim.enemies];
    const states: { id: number; alive: boolean; pos: Vector2; vel: Vector2 }[] = [];
    for (const ent of sources) {
      for (const w of ent.weapons) {
        if (w instanceof GrenadeLauncher) {
          for (const g of w.grenades) {
            const id = getGrenadeId(g as any);
            states.push({
              id,
              alive: g.alive,
              pos: new Vector2(g.position.x, g.position.y),
              vel: new Vector2(g.velocity.x, g.velocity.y),
            });
            // Mesh sync (simple sphere)
            let mesh = grenadeMeshes.get(id);
            if (!mesh) {
              mesh = new THREE.Mesh(grenadeGeo, grenadeMat);
              mesh.castShadow = true;
              grenadeGroup.add(mesh);
              grenadeMeshes.set(id, mesh);
            }
            if (g.alive) {
              mesh.visible = true;
              mesh.position.set(g.position.x, 0.6, g.position.y);
            } else {
              mesh.visible = false;
            }
          }
        }
      }
    }
    // Let VFX manager handle smoke/scorch lifetimes and transitions.
    vfx.updateGrenades(1 / 60, states);
  }

  // Mine meshes (from all mine weapons in the world)
  if (sim) {
    const sources: Entity[] = [player, ...sim.enemies];
    const mines: { x: number; z: number; armed: boolean }[] = [];
    for (const ent of sources) {
      for (const w of ent.weapons) {
        if (w instanceof MineWeapon) {
          for (const m of w.activeMines) {
            mines.push({ x: m.position.x, z: m.position.y, armed: m.armed });
          }
        }
      }
    }
    while (mineMeshes.length < mines.length) {
      const mesh = new THREE.Mesh(mineGeo, mineMat);
      mesh.castShadow = true;
      mineGroup.add(mesh);
      mineMeshes.push(mesh);
    }
    for (let i = 0; i < mineMeshes.length; i++) {
      const mesh = mineMeshes[i];
      const m = mines[i];
      if (!m) {
        mesh.visible = false;
        continue;
      }
      mesh.visible = true;
      mesh.position.set(m.x, 0.12, m.z);
      mesh.rotation.y = performance.now() * 0.0015;
      mesh.material = m.armed ? mineArmedMat : mineMat;
    }
  }

  // airstrike markers
  if (sim && sim.airstrikes.length > 0) {
    particles.setColor(WEAPON_VFX.airstrike.trailColor);
    for (const a of sim.airstrikes) {
      if (a.exploded) continue;
      const t = a.elapsed / Math.max(0.001, a.delay);
      const y = 1.2 + t * 2.4;
      particles.spawnTrailPoint(new THREE.Vector3(a.position.x, y, a.position.y), new THREE.Vector3(0, 0.28, 0), 0.2);
    }
    particles.setColor(DEFAULT_PARTICLE_COLOR);
  }
}

// VFX throttling: in VR we update particle systems at a lower fixed rate.
// This dramatically reduces main-thread spikes (SteamVR is sensitive to them).
let vfxAccum = 0;

function step(now: number) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  acc += dt * timeScale;

  // VR safety/perf: disable expensive shadows while presenting in XR.
  // This is a purely visual quality toggle.
  const xrNow = isXRPresenting(renderer);
  if (renderer.shadowMap.enabled === xrNow) {
    renderer.shadowMap.enabled = !xrNow;
  }

  // Replay / kill-cam mode: play last few seconds, then restart
  if (replayActive && sim && player) {
    replayT += dt; // replay in real time
    const snap = replayBuf.sampleAt(replayT);
    if (snap) {
      player.car.position.x = snap.data.px;
      player.car.position.y = snap.data.pz;
      player.car.heading = snap.data.heading;
    }

    // advance visuals without sim
    const isXR = renderer.xr.isPresenting;
    const vfxScale = isXR ? 0.45 : 1;
    particles.setSpawnScale(vfxScale);
    sparks.setSpawnScale(vfxScale);
    smoke.setSpawnScale(vfxScale);

    // In VR, throttle particle updates to reduce rAF spikes.
    vfxAccum = isXR ? vfxAccum + dt : 0;
    const doVfxTick = !isXR || vfxAccum >= 1 / 45;
    const vfxDt = isXR ? vfxAccum : dt;
    if (doVfxTick) {
      if (isXR) vfxAccum = 0;
      syncPickupVisuals();
      // Update friendly units visuals in both VR and desktop modes. They are static geometry so no heavy VFX.
      if (gameMode === 'td_rts_fps') updateFriendlyVisuals();
      syncEntityVisuals(vfxDt);
      updateParticlesFromProjectiles();
      updateFlamethrowerVfx(sim?.simTime ?? 0);
      updateScorchDecals(vfxDt);
      updateHeatHaze(vfxDt);
      particles.update(vfxDt);
      sparks.update(vfxDt);
      smoke.update(vfxDt);
      shockwaves.update(vfxDt);
      updateDebris(vfxDt);
      tracers.update(vfxDt);
    } else {
      // Keep HUD/minimap responsive even when throttling VFX.
      syncPickupVisuals();
      if (gameMode === 'td_rts_fps') updateFriendlyVisuals();
      syncEntityVisuals(dt);
    }
    updateHUD();
    updateHealthBars();
    drawMinimap();

    if (replayT >= replayEndT) {
      resetWorld();
    }

    // camera + render
    
    // FPS gun visible only for desktop Human mode.
    if (!renderer.xr.isPresenting) {
      const choiceNow = (vehicleSel.value as VehicleChoice) || 'sports';
      fpsGunRoot.visible = (choiceNow === 'human');
    } else {
      fpsGunRoot.visible = false;
    }

    // Reticle feedback is desktop-only (pointer lock / mouse look workflows).
    reticleUi.setState({
      visible: fpsGunRoot.visible && !isXRPresenting(renderer),
      hasTarget: !!targeting?.getTarget(),
      locked,
    });

    // Muzzle flash lifetime (1–2 frames)
    if (fpsMuzzleFlashFramesLeft > 0) {
      fpsMuzzleFlashFramesLeft--;
      if (fpsMuzzleFlashFramesLeft <= 0) fpsMuzzleFlash.visible = false;
    }

    // Recoil motion design: quick kick + spring return (desktop only).
    if (fpsGunRoot.visible && !isXRPresenting(renderer)) {
      const k = recoilKick.update(dt);
      const p = recoilPitch.update(dt);
      fpsGunRoot.position.copy(fpsGunBasePos);
      fpsGunRoot.position.z += -k * 0.06;
      fpsGunRoot.position.y += -k * 0.01;
      fpsGunRoot.rotation.x = -p * 0.03;
    } else {
      recoilKick.reset();
      recoilPitch.reset();
      fpsGunRoot.position.copy(fpsGunBasePos);
      fpsGunRoot.rotation.x = 0;
    }

if (!renderer.xr.isPresenting) {
      const px = player.car.position.x;
      const pz = player.car.position.y;
      const choiceNow = (vehicleSel.value as VehicleChoice) || 'sports';
      if (choiceNow === 'human') {
        const eye = new THREE.Vector3(px, getEntityBaseY(player) + 1.55, pz);
        // If mouse aiming is enabled + pointer locked, use mouse yaw/pitch for view direction.
        const yaw = (isMouseAimActive() && mouseAimPointerLocked) ? mouseAimYaw : player.car.heading;
        const pitch = (isMouseAimActive() && mouseAimPointerLocked) ? mouseAimPitch : 0;
        const f = new THREE.Vector3(
          Math.cos(yaw) * Math.cos(pitch),
          Math.sin(pitch),
          Math.sin(yaw) * Math.cos(pitch)
        );
        camera.position.lerp(eye, 0.25);
        camera.lookAt(eye.clone().add(f.multiplyScalar(3)));
      } else {
        const { position, target } = computeDesktopCamera(px, pz, player.car.heading, desktopCamMode, desktopZoom);
        camera.position.lerp(position, 0.14);
        camera.lookAt(target);
      }
    }
    const useBloom = bloomPass.enabled && !isXRPresenting(renderer);
    if (useBloom) composer.render();
    else renderer.render(scene, camera);
    return;
  }

  if (sim && player && targeting) {
    // Desktop input
    const isXR = renderer.xr.isPresenting;
    const vr = readVRStick(renderer);
    let accelerate = isXR ? vr.throttle > 0.2 : (key('KeyW') || key('ArrowUp'));
    let brake = isXR ? vr.throttle < -0.2 : (key('KeyS') || key('ArrowDown'));
    const left = isXR ? vr.steer < -0.2 : (key('KeyA') || key('ArrowLeft'));
    const right = isXR ? vr.steer > 0.2 : (key('KeyD') || key('ArrowRight'));

    // If both are held, prefer forward (prevents jitter from canceling).
    if (accelerate && brake) brake = false;

    const input = { accelerate, brake, left, right };

    // One-shot actions
    const choice = (vehicleSel.value as VehicleChoice) || 'sports';
    if (choice === 'human') {
      if (key('Space')) firePrimary();
      if (key('KeyQ')) fireBazooka();
      if (key('KeyE')) {
        keys.delete('KeyE');
        tryEnterBuildingRoof();
      }
      // Vive wand: trackpad press commonly maps to button index 2 in WebXR gamepads.
      const vrEnterNow = isXR && isVRButtonPressed(renderer, 2);
      if (vrEnterNow && !vrEnterRoofPrev) tryEnterBuildingRoof();
      vrEnterRoofPrev = vrEnterNow;
      const vrCycleNow = isXR && isVRButtonPressed(renderer, 3);
      if (vrCycleNow && !vrCycleWeaponPrev) cycleHumanWeapon();
      vrCycleWeaponPrev = vrCycleNow;
    } else {
      if (key('Space')) fireMachineGun();
      if (key('ShiftLeft') || key('ShiftRight')) dropMine();
      if (key('KeyF')) fireMissile();
      if (key('KeyQ')) {
        if (player.hovering) fireAirstrike();
        else fireRocket();
      }
      if (key('KeyR')) fireShotgun();
      if (key('KeyE')) fireEMP();
    }

    // target cycle
    if (key('Tab')) {
      keys.delete('Tab');
      const choiceNow = (vehicleSel.value as VehicleChoice) || 'sports';
      const isStinger = choiceNow === 'human' && player && (player.weapons[humanWeaponIndex] instanceof StingerWeapon);
      targeting.cycleTargets(isStinger ? getHeliTargetsSorted() : getTargetsSorted());
    }

    // tabletop adjustments in VR (use bracket keys on desktop too)
    if (key('BracketLeft')) tabletop.adjustScale(-0.004);
    if (key('BracketRight')) tabletop.adjustScale(0.004);
    if (key('Minus')) tabletop.adjustHeight(-0.01);
    if (key('Equal')) tabletop.adjustHeight(0.01);

    // Fixed simulation steps
    while (acc >= fixedDt) {
      // apply movement slow scaling
      const effectiveDt = fixedDt * (player.moveScale ?? 1);
      const prevPos = player.car.position.clone();
      player.car.update(effectiveDt, input);
      clampArenaWorld(player);
      if (choice === 'human') stepHumanRoofConstraint();
      sim.update(fixedDt);

      // Tower defence update: towers fire on enemies and new waves spawn when
      // the field is clear. Runs on fixed timesteps alongside the simulation.
      if (towerDef) {
        towerDef.update(sim.simTime);
      }
      // Hybrid TD/RTS/FPS update. Only runs in td_rts_fps mode.
      if (gameMode === 'td_rts_fps' && waveScheduler && commandSys && techTree) {
        // Update friendlies (movement + attacks). Use current sim time.
        for (const f of friendlies) {
          // Apply global tech multipliers before update. We temporarily adjust range/damage/cooldown then restore.
          const origRange = f.range;
          const origDamage = f.damage;
          const origCooldown = f.cooldown;
          // Note: Friendly fields are readonly on range/damage/cooldown? Actually they are not read-only except damage is defined readonly? In class, range and damage are not readonly; we update them temporarily but revert.
          (f as any).range = origRange * friendlyRangeBoost;
          (f as any).damage = origDamage * friendlyDamageBoost;
          (f as any).cooldown = origCooldown * friendlyCooldownMultiplier;
          f.update(sim.simTime, sim.enemies);
          // restore base stats
          (f as any).range = origRange;
          (f as any).damage = origDamage;
          (f as any).cooldown = origCooldown;
        }
        // When a wave has been cleared (all enemies dead), waveScheduler switches to build phase.
        waveScheduler.update();
        // Award credits when enemies die. Compare previous alive count to current.
        const aliveNow = sim.enemies.filter(e => e.alive).length;
        const kills = Math.max(0, prevEnemyCount - aliveNow);
        if (kills > 0) {
          credits += kills * 10;
        }
        prevEnemyCount = aliveNow;
      }

      // Race mode: checkpoints + finish line.
      if (raceTracker && gameMode === 'race') {
        // start time when simulation begins
        if (raceStartSimTime === 0) raceStartSimTime = sim.simTime;
        const rr = raceTracker.update(prevPos, player.car.position);
        if (rr.lapJustCompleted) {
          sim.score += 250;
        }
        if (rr.finished) {
          // Soft-freeze enemies so player can celebrate.
          sim.freezeEnemiesMovement = true;
          sim.disableEnemyAttacks = true;
        }
      }

      // record replay frame
      replayBuf.push(sim.simTime, { px: player.car.position.x, pz: player.car.position.y, heading: player.car.heading });

      // trigger replay on player death (non-helicopter only)
      if (!player.alive && !player.invulnerable && !replayActive) {
        replayActive = true;
        const dur = 2.6;
        replayEndT = sim.simTime;
        replayStartT = Math.max(0, replayEndT - dur);
        replayT = replayStartT;
      }

      // lock update
      const choiceNow = (vehicleSel.value as VehicleChoice) || 'sports';
      const isStinger = choiceNow === 'human' && player.weapons[humanWeaponIndex] instanceof StingerWeapon;
      const ls = targeting.updateLock(fixedDt, player.car.position, player.car.heading, isStinger ? { range: 60, coneRadians: Math.PI / 3.2, lockTime: 1.0 } : { range: 32, coneRadians: Math.PI / 2.2, lockTime: 0.75 });
      lockProgress = ls.lockProgress01;
      locked = ls.locked;

      // keep tabletop centered on player in VR
      if (renderer.xr.isPresenting) {
        tabletop.setCenter(player.car.position.x, player.car.position.y);
      }

      acc -= fixedDt;
    }
  }

  // visuals
  if (sim) {
    const isXR = renderer.xr.isPresenting;
    const vfxScale = isXR ? 0.45 : 1;
    particles.setSpawnScale(vfxScale);
    sparks.setSpawnScale(vfxScale);
    smoke.setSpawnScale(vfxScale);

    vfxAccum = isXR ? vfxAccum + dt : 0;
    const doVfxTick = !isXR || vfxAccum >= 1 / 45;
    const vfxDt = isXR ? vfxAccum : dt;
    if (doVfxTick) {
      if (isXR) vfxAccum = 0;
      syncPickupVisuals();
      syncEntityVisuals(vfxDt);
      updateParticlesFromProjectiles();
      updateFlamethrowerVfx(sim.simTime);
      updateScorchDecals(vfxDt);
      updateHeatHaze(vfxDt);
      updateVrBuildGhost();
      particles.update(vfxDt);
      sparks.update(vfxDt);
      smoke.update(vfxDt);
      updateDebris(vfxDt);
      tracers.update(vfxDt);
    } else {
      syncPickupVisuals();
      syncEntityVisuals(dt);
    }
    updateHUD();
    updateHealthBars();
    drawMinimap();
  }

  // Desktop camera: playable view with toggleable top/chase mode + mouse wheel zoom.
  
  // Desktop camera: playable view.
  if (player && !renderer.xr.isPresenting) {
    const px = player.car.position.x;
    const pz = player.car.position.y;
    const choiceNow = (vehicleSel.value as VehicleChoice) || 'sports';
    // FPS gun visible only for desktop Human mode.
    fpsGunRoot.visible = (choiceNow === 'human');

    // Muzzle flash lifetime (1–2 frames)
    if (fpsMuzzleFlashFramesLeft > 0) {
      fpsMuzzleFlashFramesLeft--;
      if (fpsMuzzleFlashFramesLeft <= 0) fpsMuzzleFlash.visible = false;
    }
    if (choiceNow === 'human') {
      const eye = new THREE.Vector3(px, getEntityBaseY(player) + 1.55, pz);
      // If mouse aiming is enabled + pointer locked, use mouse yaw/pitch for view direction.
      const yaw = (isMouseAimActive() && mouseAimPointerLocked) ? mouseAimYaw : player.car.heading;
      const pitch = (isMouseAimActive() && mouseAimPointerLocked) ? mouseAimPitch : 0;
      const f = new THREE.Vector3(
        Math.cos(yaw) * Math.cos(pitch),
        Math.sin(pitch),
        Math.sin(yaw) * Math.cos(pitch)
      );
      camera.position.lerp(eye, 0.25);
      camera.lookAt(eye.clone().add(f.multiplyScalar(3)));
    } else {
      const { position, target } = computeDesktopCamera(px, pz, player.car.heading, desktopCamMode, desktopZoom);
      camera.position.lerp(position, desktopCamMode === 'top' ? 0.12 : 0.14);
      camera.lookAt(target);
    }
  }

  // render
  {
    const useBloom = bloomPass.enabled && !isXRPresenting(renderer);
    if (useBloom) composer.render();
    else renderer.render(scene, camera);
  }
}

renderer.setAnimationLoop(step);

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
  composer.setSize(window.innerWidth, window.innerHeight);
  bloomPass.setSize(window.innerWidth, window.innerHeight);
});

// boot
updateHUD();
// Start at a clean main menu. Game begins only after selecting a start option.
showMainMenu();
import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { VRButton } from 'three/examples/jsm/webxr/VRButton.js';
import { XRControllerModelFactory } from 'three/examples/jsm/webxr/XRControllerModelFactory.js';

import { Car } from './game/car';
import { Entity, Enemy, Onlooker } from './sim/entities';
import { MachineGun, MineWeapon, HomingMissileWeapon, RocketWeapon, Shotgun, EMPWeapon, Minigun, AirstrikeWeapon } from './sim/weapons';
import { HealthPickup, AmmoPickup, ShieldPickup, ScorePickup, WeaponPickup } from './sim/pickups';
import { GameSimulation, OnlookerKillRule, AirstrikeInstance } from './sim/game';
import { TargetingSystem } from './sim/targeting';
import { createArena, createVehicleMesh, VehicleVisualType } from './render/models';
import { ParticleSystem } from './render/particles';
import { TracerRenderer } from './render/tracers';
import { ReplayBuffer } from './game/replay';
import { computeDesktopCamera, DesktopCameraMode, cycleDesktopCameraMode } from './render/cameraMath';
import { TabletopRig } from './xr/tabletop';
import { checkedOr, onChange, requireEl } from './ui/safeDom';
import { RaceTracker } from './sim/race';
import { Vector2 } from './game/vector2';
import { WEAPON_VFX } from './render/weaponStyle';
import { computeTargetHighlightVisual } from './render/targetHighlightMath';

type VehicleChoice = 'sports' | 'muscle' | 'buggy' | 'tank' | 'heli';

const app = document.getElementById('app')!;
const hud = document.getElementById('hud')!;
const panel = document.getElementById('panel')!;

function el<T extends HTMLElement>(sel: string): T | null {
  return document.querySelector(sel) as T | null;
}

// UI elements
const startBtn = requireEl<HTMLButtonElement>('#startBtn');
const restartBtn = requireEl<HTMLButtonElement>('#btnRestart');
const freezeEnemiesBtn = requireEl<HTMLButtonElement>('#btnFreezeEnemies');
const stopAttacksBtn = requireEl<HTMLButtonElement>('#btnStopAttacks');
const vehicleSel = requireEl<HTMLSelectElement>('#vehicleSel');
const bloomToggle = el<HTMLInputElement>('#bloomToggle');
const slowmoToggle = el<HTMLInputElement>('#slowmoToggle');
const enemyHeliToggle = el<HTMLInputElement>('#enemyHeliToggle');
const modeSel = requireEl<HTMLSelectElement>('#modeSel');
const lapsSel = requireEl<HTMLSelectElement>('#lapsSel');
const startHpSlider = el<HTMLInputElement>('#startHp');
const startHpLabel = el<HTMLSpanElement>('#startHpLabel');
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
app.appendChild(renderer.domElement);

// WebXR button
document.body.appendChild(VRButton.createButton(renderer));

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x0b0d12, 25, 170);

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
const sun = new THREE.DirectionalLight(0xffffff, 2.0);
sun.position.set(60, 90, 40);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 240;
sun.shadow.camera.left = -90;
sun.shadow.camera.right = 90;
sun.shadow.camera.top = 90;
sun.shadow.camera.bottom = -90;
scene.add(sun);

scene.add(new THREE.AmbientLight(0x9db2ff, 0.35));

// Arena + tabletop root
const tabletop = new TabletopRig();
scene.add(tabletop.root);
const arena = createArena();
tabletop.root.add(arena);

// --- Race track visuals + tracker (simple loop) ---
type GameMode = 'arena' | 'race';
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
  const v = (modeSel.value === 'race') ? 'race' : 'arena';
  setGameMode(v);
});
setGameMode(modeSel.value === 'race' ? 'race' : 'arena');

// Switch between desktop 1:1 world and VR tabletop diorama.
renderer.xr.addEventListener('sessionstart', () => {
  tabletop.setTabletopMode();
});
renderer.xr.addEventListener('sessionend', () => {
  tabletop.setDesktopMode();
});

// Particles
const particles = new ParticleSystem(2600);
particles.setSize(14);
const DEFAULT_PARTICLE_COLOR = 0xffc86b;
particles.setColor(DEFAULT_PARTICLE_COLOR);
tabletop.root.add(particles.points);

// Bullet/pellet tracers: clearly visible streaks for hitscan weapons.
const tracers = new TracerRenderer(700);
tabletop.root.add(tracers.lines);

// Simple projectile meshes (so missiles/rockets are visible in-flight)
const projectileGroup = new THREE.Group();
tabletop.root.add(projectileGroup);
// Make each weapon visually distinct (projectile silhouettes + emissive palette)
const missileGeo = new THREE.ConeGeometry(0.14, 0.62, 10);
const rocketGeo = new THREE.CylinderGeometry(0.12, 0.08, 0.55, 10);
const missileMat = new THREE.MeshStandardMaterial({
  color: WEAPON_VFX.missile.projectileColor,
  emissive: WEAPON_VFX.missile.projectileColor,
  emissiveIntensity: 1.35,
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

function key(code: string) { return keys.has(code); }

// Targeting and lock state
let lockProgress = 0;
let locked = false;

function getTargetsSorted(): Entity[] {
  if (!sim || !player) return [];
  const aliveEnemies = sim.enemies.filter(e => e.alive);
  const aliveOnlookers = sim.onlookers.filter(o => o.alive);
  return [...aliveEnemies, ...aliveOnlookers];
}

function clampArena(ent: Entity) {
  const lim = 53;
  ent.car.position.x = THREE.MathUtils.clamp(ent.car.position.x, -lim, lim);
  ent.car.position.y = THREE.MathUtils.clamp(ent.car.position.y, -lim, lim);
}

// --- VR input ---
function readVRStick(): { steer: number; throttle: number; } {
  const session = renderer.xr.getSession();
  if (!session) return { steer: 0, throttle: 0 };
  for (const src of session.inputSources) {
    const gp = src.gamepad;
    if (!gp) continue;
    // Typical XR: axes[2], axes[3] is right stick, axes[0], axes[1] left stick; varies.
    const axX = gp.axes[2] ?? gp.axes[0] ?? 0;
    const axY = gp.axes[3] ?? gp.axes[1] ?? 0;
    return { steer: axX, throttle: -axY };
  }
  return { steer: 0, throttle: 0 };
}

// Trigger fires MG; squeeze drops mine; A/X fires missile if locked
function hookXRButtons() {
  const onSelect = () => fireMachineGun();
  const onSqueeze = () => dropMine();
  c1.addEventListener('selectstart', onSelect);
  c1.addEventListener('squeezestart', onSqueeze);
  c2.addEventListener('selectstart', onSelect);
  c2.addEventListener('squeezestart', onSqueeze);
}
hookXRButtons();

// --- Weapon actions (player) ---
function getWeapon<T>(cls: new (...args: any[]) => T): T | null {
  if (!player) return null;
  for (const w of player.weapons) if (w instanceof cls) return w as any;
  return null;
}

function spawnTracer(startX: number, startY: number, endX: number, endY: number, key: keyof typeof WEAPON_VFX) {
  // Render a short-lived line segment so bullets are clearly visible.
  const style = WEAPON_VFX[key];
  const y = player?.hovering ? 1.35 : 0.62;
  // Slight forward bias so the segment isn't hidden inside the vehicle mesh.
  tracers.add(startX, y, startY, endX, y, endY, style.tracerColor, 0.09);
}

function fireMachineGun() {
  if (!sim || !player) return;
  // Heli uses minigun; ground uses MG
  const mg = (getWeapon(Minigun) as any) ?? (getWeapon(MachineGun) as any);
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
  spawnTracer(sx, sz, ex, ez, player.hovering ? 'minigun' : 'machinegun');
  // muzzle flash
  particles.setColor(player.hovering ? WEAPON_VFX.minigun.impactColor : WEAPON_VFX.machinegun.impactColor);
  particles.spawnExplosion(new THREE.Vector3(sx, player.hovering ? 1.25 : 0.35, sz), 0.12);
  particles.setColor(DEFAULT_PARTICLE_COLOR);
}

function dropMine() {
  if (!sim || !player) return;
  const mw = getWeapon(MineWeapon);
  if (!mw) return;
  mw.fire(sim.simTime, player);
  // drop flash
  particles.setColor(WEAPON_VFX.mine.impactColor);
  particles.spawnExplosion(new THREE.Vector3(player.car.position.x, 0.25, player.car.position.y), 0.12);
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
  particles.spawnExplosion(new THREE.Vector3(player.car.position.x, 0.45, player.car.position.y), 0.55);
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
  particles.spawnExplosion(new THREE.Vector3(t.car.position.x, 0.8, t.car.position.y), 0.35);
  particles.setColor(DEFAULT_PARTICLE_COLOR);
}

// --- Start / reset ---
function resetWorld() {
  replayActive = false;
  replayBuf.clear();
  tracers.clear();
  missilePrev.length = 0;
  rocketPrev.length = 0;
  // Clear visuals
  for (const [ent] of visuals) removeVisual(ent);
  for (const o of pickupVisuals) tabletop.root.remove(o);
  pickupVisuals.length = 0;

  const choice = (vehicleSel.value as VehicleChoice) || 'sports';
  player = makePlayer(choice);
  // Respect mode selection.
  setGameMode(modeSel.value === 'race' ? 'race' : 'arena');

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
  attachDefaultLoadout(player, {
    airstrikeSink: {
      addAirstrike: (owner, x, y, delay, radius, damage) => {
        sim?.addAirstrike(new AirstrikeInstance(owner, x, y, delay, radius, damage));
      },
    },
  });
  targeting = new TargetingSystem();

  addVisual(player, choice);
  // In race mode we keep the chaos light so the track is readable.
  if (gameMode === 'race') {
    spawnEnemies(3);
    spawnOnlookers(6);
    for (let i = 0; i < 4; i++) spawnPickup();
    // Avoid infinite scaling mid-race.
    sim.enemySpawnCooldown = 9999;
  } else {
    spawnEnemies(5);
    spawnOnlookers(16);
    for (let i = 0; i < 6; i++) spawnPickup();
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
  hud.textContent = `HP ${player.hp.toFixed(0)}/${player.maxHP}  |  Speed ${speed}  |  Score ${sim.score}  |  Streak ${sim.streak}  |  x${sim.multiplier}  |  Heat ${sim.heat}${raceLine}\n` +
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

function syncEntityVisuals() {
  if (!sim || !player) return;

  // handle removals and explosions
  const allEntities = [player, ...sim.enemies, ...sim.onlookers];
  for (const e of [...visuals.keys()]) {
    if (!allEntities.includes(e) || (!e.alive && !(replayActive && e === player))) {
      // explosion VFX
      particles.spawnExplosion(new THREE.Vector3(e.car.position.x, 0.45, e.car.position.y), 1.0);
      removeVisual(e);
    }
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
    const y = e.hovering ? 1.25 : 0;
    v.position.set(e.car.position.x, y, e.car.position.y);
    v.rotation.y = -e.car.heading;

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
    const ty = tgt.hovering ? 1.25 : 0;
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
      missilePrev.push({ x: 0, y: 0 });
    }
    for (let i = 0; i < missileMeshes.length; i++) {
      const mesh = missileMeshes[i];
      const m = hm.missiles[i];
      if (!m) {
        mesh.visible = false;
        continue;
      }
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
      rocketPrev.push({ x: 0, y: 0 });
    }
    for (let i = 0; i < rocketMeshes.length; i++) {
      const mesh = rocketMeshes[i];
      const r = rw.rockets[i];
      if (!r) {
        mesh.visible = false;
        continue;
      }
      mesh.visible = true;
      mesh.position.set(r.position.x, 0.85, r.position.y);
      const prev = rocketPrev[i] ?? (rocketPrev[i] = { x: r.position.x, y: r.position.y });
      tracers.add(prev.x, 0.82, prev.y, r.position.x, 0.82, r.position.y, WEAPON_VFX.rocket.trailColor, 0.16);
      prev.x = r.position.x;
      prev.y = r.position.y;
      const ang = Math.atan2(r.direction.y, r.direction.x);
      mesh.rotation.y = -ang;
      particles.setColor(WEAPON_VFX.rocket.trailColor);
      particles.spawnTrailPoint(new THREE.Vector3(r.position.x, 0.75, r.position.y), new THREE.Vector3(0, 0.12, 0), 0.18);
      particles.setColor(DEFAULT_PARTICLE_COLOR);
    }
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

function step(now: number) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  acc += dt * timeScale;

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
    syncPickupVisuals();
    syncEntityVisuals();
    updateParticlesFromProjectiles();
    particles.update(dt);
    tracers.update(dt);
    updateHUD();
    drawMinimap();

    if (replayT >= replayEndT) {
      resetWorld();
    }

    // camera + render
    if (!renderer.xr.isPresenting) {
      const px = player.car.position.x;
      const pz = player.car.position.y;
      const { position, target } = computeDesktopCamera(px, pz, player.car.heading, desktopCamMode, desktopZoom);
      camera.position.lerp(position, 0.14);
      camera.lookAt(target);
    }
    if (bloomPass.enabled) composer.render();
    else renderer.render(scene, camera);
    return;
  }

  if (sim && player && targeting) {
    // Desktop input
    const isXR = renderer.xr.isPresenting;
    const vr = readVRStick();
    let accelerate = isXR ? vr.throttle > 0.2 : (key('KeyW') || key('ArrowUp'));
    let brake = isXR ? vr.throttle < -0.2 : (key('KeyS') || key('ArrowDown'));
    const left = isXR ? vr.steer < -0.2 : (key('KeyA') || key('ArrowLeft'));
    const right = isXR ? vr.steer > 0.2 : (key('KeyD') || key('ArrowRight'));

    // If both are held, prefer forward (prevents jitter from canceling).
    if (accelerate && brake) brake = false;

    const input = { accelerate, brake, left, right };

    // One-shot actions
    if (key('Space')) fireMachineGun();
    if (key('ShiftLeft') || key('ShiftRight')) dropMine();
    if (key('KeyF')) fireMissile();
    if (key('KeyQ')) {
      if (player.hovering) fireAirstrike();
      else fireRocket();
    }
    if (key('KeyR')) fireShotgun();
    if (key('KeyE')) fireEMP();

    // target cycle
    if (key('Tab')) {
      keys.delete('Tab');
      targeting.cycleTargets(getTargetsSorted());
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
      clampArena(player);
      sim.update(fixedDt);

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
      const ls = targeting.updateLock(fixedDt, player.car.position, player.car.heading, { range: 32, coneRadians: Math.PI / 2.2, lockTime: 0.75 });
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
    syncPickupVisuals();
    syncEntityVisuals();
    updateParticlesFromProjectiles();
    particles.update(dt);
    tracers.update(dt);
    updateHUD();
    drawMinimap();
  }

  // Desktop camera: playable view with toggleable top/chase mode + mouse wheel zoom.
  if (player && !renderer.xr.isPresenting) {
    const px = player.car.position.x;
    const pz = player.car.position.y;
    const { position, target } = computeDesktopCamera(px, pz, player.car.heading, desktopCamMode, desktopZoom);
    camera.position.lerp(position, desktopCamMode === 'top' ? 0.12 : 0.14);
    camera.lookAt(target);
  }

  // render
  if (bloomPass.enabled) composer.render();
  else renderer.render(scene, camera);
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

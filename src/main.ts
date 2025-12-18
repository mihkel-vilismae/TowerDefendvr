import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { VRButton } from 'three/examples/jsm/webxr/VRButton.js';
import { XRControllerModelFactory } from 'three/examples/jsm/webxr/XRControllerModelFactory.js';

import { Car } from './game/car';
import { Entity, Enemy, Onlooker } from './sim/entities';
import { MachineGun, MineWeapon, HomingMissileWeapon, RocketWeapon, Shotgun, EMPWeapon } from './sim/weapons';
import { HealthPickup, AmmoPickup, ShieldPickup, ScorePickup, WeaponPickup } from './sim/pickups';
import { GameSimulation, OnlookerKillRule } from './sim/game';
import { TargetingSystem } from './sim/targeting';
import { createArena, createVehicleMesh, VehicleVisualType } from './render/models';
import { ParticleSystem } from './render/particles';
import { computeDesktopCamera, DesktopCameraMode } from './render/cameraMath';
import { TabletopRig } from './xr/tabletop';
import { checkedOr, onChange, requireEl } from './ui/safeDom';

type VehicleChoice = 'sports' | 'muscle' | 'buggy' | 'tank';

const app = document.getElementById('app')!;
const hud = document.getElementById('hud')!;
const panel = document.getElementById('panel')!;

function el<T extends HTMLElement>(sel: string): T | null {
  return document.querySelector(sel) as T | null;
}

// UI elements
const startBtn = requireEl<HTMLButtonElement>('#startBtn');
const vehicleSel = requireEl<HTMLSelectElement>('#vehicleSel');
const bloomToggle = el<HTMLInputElement>('#bloomToggle');
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
    desktopCamMode = desktopCamMode === 'top' ? 'chase' : 'top';
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
particles.setColor(0xffc86b);
tabletop.root.add(particles.points);

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

const visuals = new Map<Entity, THREE.Object3D>();
const vehicleType = new Map<Entity, VehicleVisualType>();

function makePlayer(choice: VehicleChoice): Entity {
  const car = new Car();
  // baseline tuning per vehicle
  if (choice === 'sports') {
    car.maxSpeed = 28;
    car.accel = 20;
    car.turnRate = 3.0;
    return new Entity(car, 80);
  }
  if (choice === 'muscle') {
    car.maxSpeed = 24;
    car.accel = 16;
    car.turnRate = 2.6;
    return new Entity(car, 110);
  }
  if (choice === 'buggy') {
    car.maxSpeed = 26;
    car.accel = 18;
    car.turnRate = 3.2;
    return new Entity(car, 90);
  }
  // tank
  car.maxSpeed = 17;
  car.accel = 11;
  car.turnRate = 1.9;
  return new Entity(car, 160);
}

function attachDefaultLoadout(ent: Entity) {
  // Primary: MG (auto-fire off for player)
  ent.weapons.push(new MachineGun(ent, 0.08, null, 28, 3));
  // Mines
  ent.weapons.push(new MineWeapon(ent, 1.4, 10, 0.35, 3.2, 18));
  // Homing missiles
  ent.weapons.push(new HomingMissileWeapon(ent, 2.2, 6, 26, 7.5, 2.4, 35));
  // Rocket
  ent.weapons.push(new RocketWeapon(ent, 1.25, 10, 30, 2.8, 26));
  // Shotgun
  ent.weapons.push(new Shotgun(ent, 0.9, 18, 14, Math.PI / 2.8, 8, 18));
  // EMP
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

function fireMachineGun() {
  if (!sim || !player) return;
  const mg = getWeapon(MachineGun);
  if (!mg) return;
  const t = targeting?.getTarget();
  // Machine gun is hitscan; allow firing without target by picking nearest enemy in front
  const candidates = getTargetsSorted();
  const target = t ?? candidates[0] ?? null;
  if (!target) return;
  mg.fire(sim.simTime, target);
}

function dropMine() {
  if (!sim || !player) return;
  const mw = getWeapon(MineWeapon);
  if (!mw) return;
  mw.fire(sim.simTime, player);
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
}

function fireEMP() {
  if (!sim || !player) return;
  const emp = getWeapon(EMPWeapon);
  if (!emp) return;
  emp.pulse(sim.simTime, [...sim.enemies, ...sim.onlookers]);
  // Visual pulse ring
  particles.setColor(0x4df3ff);
  particles.spawnExplosion(new THREE.Vector3(player.car.position.x, 0.45, player.car.position.y), 0.55);
  particles.setColor(0xffc86b);
}

// --- Start / reset ---
function resetWorld() {
  // Clear visuals
  for (const [ent] of visuals) removeVisual(ent);
  for (const o of pickupVisuals) tabletop.root.remove(o);
  pickupVisuals.length = 0;

  const choice = (vehicleSel.value as VehicleChoice) || 'sports';
  player = makePlayer(choice);
  player.car.position.set(0, 0);
  attachDefaultLoadout(player);
  sim = new GameSimulation(player, { onlookerRule: OnlookerKillRule.ArcadeBonus });
  targeting = new TargetingSystem();

  addVisual(player, choice);
  spawnEnemies(5);
  spawnOnlookers(16);
  for (let i = 0; i < 6; i++) spawnPickup();

  vrHelp.textContent = 'VR: Enter VR button (bottom). In VR: stick steers/throttle; trigger fires MG; grip drops mine; Tab cycles target on desktop.';
}

startBtn.addEventListener('click', () => resetWorld());

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
  hud.textContent = `HP ${player.hp.toFixed(0)}/${player.maxHP}  |  Speed ${speed}  |  Score ${sim.score}  |  Streak ${sim.streak}  |  x${sim.multiplier}  |  Heat ${sim.heat}\n` +
    `Target: ${tgt ? (vehicleType.get(tgt) ?? 'target') : 'none'}  |  Lock ${(lockProgress * 100).toFixed(0)}%${locked ? ' (LOCKED)' : ''}`;
}

function syncEntityVisuals() {
  if (!sim || !player) return;

  // handle removals and explosions
  const allEntities = [player, ...sim.enemies, ...sim.onlookers];
  for (const e of [...visuals.keys()]) {
    if (!allEntities.includes(e) || !e.alive) {
      // explosion VFX
      particles.spawnExplosion(new THREE.Vector3(e.car.position.x, 0.45, e.car.position.y), 1.0);
      removeVisual(e);
    }
  }

  // ensure visuals exist
  for (const e of allEntities) {
    if (!e.alive) continue;
    if (!visuals.has(e)) {
      const t = e === player ? ((vehicleSel.value as VehicleChoice) || 'sports') : (e instanceof Enemy ? 'enemy' : 'onlooker');
      addVisual(e, t as VehicleVisualType);
    }
  }

  // update transforms
  for (const [e, v] of visuals) {
    v.position.set(e.car.position.x, 0, e.car.position.y);
    v.rotation.y = -e.car.heading;
  }
}

function updateParticlesFromProjectiles() {
  if (!player) return;
  const hm = getWeapon(HomingMissileWeapon);
  if (hm) {
    for (const m of hm.missiles) {
      particles.spawnTrailPoint(new THREE.Vector3(m.position.x, 0.45, m.position.y), new THREE.Vector3(0, 0.2, 0), 0.18);
    }
  }
  const rw = getWeapon(RocketWeapon);
  if (rw) {
    for (const r of rw.rockets) {
      particles.spawnTrailPoint(new THREE.Vector3(r.position.x, 0.45, r.position.y), new THREE.Vector3(0, 0.1, 0), 0.18);
    }
  }
}

function step(now: number) {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  acc += dt;

  if (sim && player && targeting) {
    // Desktop input
    const isXR = renderer.xr.isPresenting;
    const vr = readVRStick();
    const input = {
      accelerate: isXR ? vr.throttle > 0.2 : (key('KeyW') || key('ArrowUp')),
      brake: isXR ? vr.throttle < -0.2 : (key('KeyS') || key('ArrowDown')),
      left: isXR ? vr.steer < -0.2 : (key('KeyA') || key('ArrowLeft')),
      right: isXR ? vr.steer > 0.2 : (key('KeyD') || key('ArrowRight')),
    };

    // One-shot actions
    if (key('Space')) fireMachineGun();
    if (key('ShiftLeft') || key('ShiftRight')) dropMine();
    if (key('KeyF')) fireMissile();
    if (key('KeyQ')) fireRocket();
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
      player.car.update(effectiveDt, input);
      clampArena(player);
      sim.update(fixedDt);

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
    updateHUD();
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

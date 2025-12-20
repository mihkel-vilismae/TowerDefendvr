import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { VRButtonCompat } from './xr/VRButtonCompat';
import { XRControllerModelFactory } from 'three/examples/jsm/webxr/XRControllerModelFactory.js';

import { Car } from './game/car';
import { Entity, Enemy, Onlooker } from './sim/entities';
import { MachineGun, AntiMaterielRifle, MineWeapon, HomingMissileWeapon, StingerWeapon, RocketWeapon, Shotgun, EMPWeapon, Minigun, AirstrikeWeapon } from './sim/weapons';
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
import { headingToYaw } from './render/headingToYaw';

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
    alive.add(e);
    const bar = ensureHealthBar(e);
    const fill = bar.querySelector('[data-role="fill"]') as HTMLDivElement | null;
    const r = e.maxHP > 0 ? (e.hp / e.maxHP) : 0;
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
document.body.appendChild(
  VRButtonCompat.createButton(renderer, {
    // local-floor gives a stable, seated/standing reference space.
    // Keep it minimal to avoid SteamVR complaining about unsupported features (e.g. "layers").
    optionalFeatures: ['local-floor'],
  })
);

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

// Obstacles are tagged as buildings in createArena(). Used for the human "enter building" rooftop mechanic.
const buildingMeshes: THREE.Mesh[] = arena.children.filter((c) => (c as any).userData?.isBuilding) as THREE.Mesh[];

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
tabletop.root.add(smoke.points);

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
  // 1) Carbine/SMG: faster, lower damage, good for soft targets.
  ent.weapons.push(new MachineGun(ent, 0.11, null, 40, 6));
  // 2) Bazooka: dumb rocket with a chunky, mostly-spark explosion.
  ent.weapons.push(new RocketWeapon(ent, 1.25, 18, 22, 3.4, 70));
  // 3) Stinger: lock-on anti-air missile. Intended for enemy helicopters.
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

function key(code: string) { return keys.has(code); }

// Targeting and lock state
let lockProgress = 0;

// Human weapon cycling (desktop: middle mouse; VR: button)
let humanWeaponIndex = 0;
let vrCycleWeaponPrev = false;

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
  const lim = 53;
  ent.car.position.x = THREE.MathUtils.clamp(ent.car.position.x, -lim, lim);
  ent.car.position.y = THREE.MathUtils.clamp(ent.car.position.y, -lim, lim);
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
function readVRStick(): { steer: number; throttle: number; } {
  const session = renderer.xr.getSession();
  if (!session) return { steer: 0, throttle: 0 };
  for (const src of session.inputSources) {
    const gp = src.gamepad;
    if (!gp) continue;
    // Vive wands typically expose only 2 axes (trackpad), while many controllers
    // expose 4 axes (2 sticks). Prefer 0/1 when only 2 are available.
    const hasTwoAxes = gp.axes.length <= 2;
    const axX = hasTwoAxes ? (gp.axes[0] ?? 0) : (gp.axes[2] ?? gp.axes[0] ?? 0);
    const axY = hasTwoAxes ? (gp.axes[1] ?? 0) : (gp.axes[3] ?? gp.axes[1] ?? 0);
    return { steer: axX, throttle: -axY };
  }
  return { steer: 0, throttle: 0 };
}

function isVRButtonPressed(buttonIndex: number): boolean {
  const session = renderer.xr.getSession();
  if (!session) return false;
  for (const src of session.inputSources) {
    const gp = src.gamepad;
    if (!gp) continue;
    const b = gp.buttons[buttonIndex];
    if (b?.pressed) return true;
  }
  return false;
}

// Trigger fires MG; squeeze drops mine; A/X fires missile if locked
function hookXRButtons() {
  const onSelect = () => firePrimary();
  const onSqueeze = () => {
    // Human uses squeeze as bazooka; vehicles use squeeze as mine drop.
    if (player && (vehicleSel.value as VehicleChoice) === 'human') fireBazooka();
    else dropMine();
  };
  c1.addEventListener('selectstart', onSelect);
  c1.addEventListener('squeezestart', onSqueeze);
  c2.addEventListener('selectstart', onSelect);
  c2.addEventListener('squeezestart', onSqueeze);
}
hookXRButtons();


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
  if (w instanceof RocketWeapon) return 'Bazooka';
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
    // visible missile tracer hint (actual projectile visuals are in updateParticlesFromProjectiles)
    spawnTracer(player.car.position.x, player.car.position.y, target.car.position.x, target.car.position.y, 'missile');
    return;
  }

  if (w instanceof RocketWeapon) {
    // Bazooka is treated as a short-range rocket.
    fireBazooka();
    return;
  }

  if (w instanceof AntiMaterielRifle) {
    w.fire(sim.simTime, target);
    spawnTracer(player.car.position.x, player.car.position.y, target.car.position.x, target.car.position.y, 'antimateriel');
    // smaller muzzle flash
    particles.setColor(WEAPON_VFX.antimateriel.impactColor);
    particles.spawnExplosion(new THREE.Vector3(player.car.position.x, getEntityBaseY(player) + 0.35, player.car.position.y), 0.028 * EXPLOSION_INTENSITY_SCALE);
    particles.setColor(DEFAULT_PARTICLE_COLOR);
    return;
  }

  if (w instanceof MachineGun) {
    w.fire(sim.simTime, target);
    spawnTracer(player.car.position.x, player.car.position.y, target.car.position.x, target.car.position.y, 'machinegun');
    particles.setColor(WEAPON_VFX.machinegun.impactColor);
    particles.spawnExplosion(new THREE.Vector3(player.car.position.x, getEntityBaseY(player) + 0.35, player.car.position.y), 0.032 * EXPLOSION_INTENSITY_SCALE);
    particles.setColor(DEFAULT_PARTICLE_COLOR);
    return;
  }
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
  // Bazooka = RocketWeapon in human mode.
  if (!sim || !player) return;
  const rw = getWeapon(RocketWeapon);
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
  // reset rooftop state every restart
  setHumanRoofState(false, null);
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
      syncEntityVisuals(vfxDt);
      updateParticlesFromProjectiles();
      particles.update(vfxDt);
      sparks.update(vfxDt);
      smoke.update(vfxDt);
      updateDebris(vfxDt);
      tracers.update(vfxDt);
    } else {
      // Keep HUD/minimap responsive even when throttling VFX.
      syncPickupVisuals();
      syncEntityVisuals(dt);
    }
    updateHUD();
    updateHealthBars();
    drawMinimap();

    if (replayT >= replayEndT) {
      resetWorld();
    }

    // camera + render
    
if (!renderer.xr.isPresenting) {
      const px = player.car.position.x;
      const pz = player.car.position.y;
      const choiceNow = (vehicleSel.value as VehicleChoice) || 'sports';
      if (choiceNow === 'human') {
        const eye = new THREE.Vector3(px, getEntityBaseY(player) + 1.55, pz);
        const f = new THREE.Vector3(Math.cos(player.car.heading), 0, Math.sin(player.car.heading));
        camera.position.lerp(eye, 0.25);
        camera.lookAt(eye.clone().add(f.multiplyScalar(3)));
      } else {
        const { position, target } = computeDesktopCamera(px, pz, player.car.heading, desktopCamMode, desktopZoom);
        camera.position.lerp(position, 0.14);
        camera.lookAt(target);
      }
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
    const choice = (vehicleSel.value as VehicleChoice) || 'sports';
    if (choice === 'human') {
      if (key('Space')) firePrimary();
      if (key('KeyQ')) fireBazooka();
      if (key('KeyE')) {
        keys.delete('KeyE');
        tryEnterBuildingRoof();
      }
      // Vive wand: trackpad press commonly maps to button index 2 in WebXR gamepads.
      const vrEnterNow = isXR && isVRButtonPressed(2);
      if (vrEnterNow && !vrEnterRoofPrev) tryEnterBuildingRoof();
      vrEnterRoofPrev = vrEnterNow;
      const vrCycleNow = isXR && isVRButtonPressed(3);
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
      clampArena(player);
      if (choice === 'human') stepHumanRoofConstraint();
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
  
if (player && !renderer.xr.isPresenting) {
    const px = player.car.position.x;
    const pz = player.car.position.y;
    const choiceNow = (vehicleSel.value as VehicleChoice) || 'sports';
    if (choiceNow === 'human') {
      const eye = new THREE.Vector3(px, getEntityBaseY(player) + 1.55, pz);
      const f = new THREE.Vector3(Math.cos(player.car.heading), 0, Math.sin(player.car.heading));
      camera.position.lerp(eye, 0.25);
      camera.lookAt(eye.clone().add(f.multiplyScalar(3)));
    } else {
      const { position, target } = computeDesktopCamera(px, pz, player.car.heading, desktopCamMode, desktopZoom);
      camera.position.lerp(position, desktopCamMode === 'top' ? 0.12 : 0.14);
      camera.lookAt(target);
    }
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
import * as THREE from 'three';
import { DistrictPreset, WORLD_PRESETS } from './worldConfig';

export type VehicleVisualType = 'sports' | 'muscle' | 'tank' | 'buggy' | 'heli' | 'human' | 'enemy' | 'enemyHeli' | 'onlooker';

function makeMat(color: THREE.ColorRepresentation, metalness = 0.2, roughness = 0.55, emissive?: THREE.ColorRepresentation) {
  const m = new THREE.MeshStandardMaterial({ color, metalness, roughness });
  if (emissive) {
    m.emissive.set(emissive);
    m.emissiveIntensity = 0.55;
  }
  return m;
}

export function createVehicleMesh(type: VehicleVisualType): THREE.Object3D {
  const g = new THREE.Group();

  const shadow = (obj: THREE.Object3D) => {
    obj.traverse((c) => {
      const m = c as THREE.Mesh;
      if (m.isMesh) {
        m.castShadow = true;
        m.receiveShadow = true;
      }
    });
  };

  if (type === 'onlooker') {
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.18, 0.35, 4, 8), makeMat(0xb9c1d9, 0.0, 0.8));
    body.position.y = 0.45;
    g.add(body);
    shadow(g);
    return g;
  }

  if (type === 'human') {
    // A simple stylized human with a visible weapon silhouette.
    const bodyMat = makeMat(0xd6d9e6, 0.0, 0.85);
    const headMat = makeMat(0x2a2f3d, 0.1, 0.65, 0x4df3ff);
    const weaponMat = makeMat(0x1b1f2a, 0.25, 0.55, 0xffc86b);
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 0.46, 4, 10), bodyMat);
    body.position.y = 0.62;
    g.add(body);
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.16, 16, 12), headMat);
    head.position.y = 0.98;
    g.add(head);
    // rifle / bazooka silhouette (one combined)
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.9, 10), weaponMat);
    barrel.rotation.z = Math.PI * 0.5;
    barrel.position.set(0.35, 0.72, 0.12);
    g.add(barrel);
    const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.55, 12), weaponMat);
    tube.rotation.z = Math.PI * 0.5;
    tube.position.set(0.28, 0.68, -0.05);
    g.add(tube);
    shadow(g);
    return g;
  }

  const baseColor =
    type === 'sports' ? 0x46d2ff :
    type === 'muscle' ? 0xff4b4b :
    type === 'buggy' ? 0xffd04a :
    type === 'tank' ? 0x63ff7a :
    type === 'heli' ? 0xa9b6ff :
    type === 'enemyHeli' ? 0xff7cff :
    type === 'enemy' ? 0xff7cff : 0xffffff;

  const accent = (type === 'enemy' || type === 'enemyHeli') ? 0xff2a2a : 0x4df3ff;

  if (type === 'heli' || type === 'enemyHeli') {
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.05, 0.28, 1.35), makeMat(baseColor, 0.28, 0.45));
    body.position.y = 0.62;
    g.add(body);
    const cabin = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.25, 0.6), makeMat(0x1b1f2a, 0.35, 0.25, accent));
    cabin.position.set(0, 0.78, 0.15);
    g.add(cabin);
    const tail = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.18, 1.2), makeMat(baseColor, 0.25, 0.55));
    tail.position.set(0, 0.66, -1.25);
    g.add(tail);
    const skidsMat = makeMat(0x1b1f2a, 0.2, 0.85);
    const skid1 = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.1, 8), skidsMat);
    skid1.rotation.z = Math.PI * 0.5;
    skid1.position.set(-0.35, 0.4, 0);
    const skid2 = skid1.clone();
    skid2.position.x = 0.35;
    const crossBar = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.8, 8), skidsMat);
    crossBar.rotation.x = Math.PI * 0.5;
    crossBar.position.set(0, 0.42, 0);
    g.add(skid1, skid2, crossBar);

    // Main rotor (named so main loop can spin it)
    const rotor = new THREE.Mesh(new THREE.BoxGeometry(3.2, 0.03, 0.18), makeMat(0x1b1f2a, 0.25, 0.65, accent));
    rotor.name = 'rotor_main';
    rotor.position.set(0, 0.93, 0.05);
    g.add(rotor);
    const rotor2 = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.03, 2.6), makeMat(0x1b1f2a, 0.25, 0.65, accent));
    rotor2.position.copy(rotor.position);
    rotor2.name = 'rotor_main_2';
    g.add(rotor2);

    // Tail rotor
    const tailRotor = new THREE.Mesh(new THREE.BoxGeometry(0.65, 0.02, 0.12), makeMat(0x1b1f2a, 0.25, 0.65));
    tailRotor.name = 'rotor_tail';
    tailRotor.position.set(0, 0.72, -1.85);
    tailRotor.rotation.y = Math.PI * 0.5;
    g.add(tailRotor);

    shadow(g);
    return g;
  }

  if (type === 'tank') {
    const hull = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.35, 1.7), makeMat(baseColor, 0.25, 0.55));
    hull.position.y = 0.23;
    g.add(hull);
    const turret = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.45, 0.24, 16), makeMat(baseColor, 0.25, 0.48, accent));
    turret.rotation.x = Math.PI * 0.5;
    turret.position.y = 0.46;
    g.add(turret);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 1.1, 12), makeMat(0x1b1f2a, 0.4, 0.45));
    barrel.rotation.x = Math.PI * 0.5;
    barrel.position.set(0, 0.46, 0.9);
    g.add(barrel);
    const trackMat = makeMat(0x1b1f2a, 0.15, 0.85);
    const trackL = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.25, 1.85), trackMat);
    const trackR = trackL.clone();
    trackL.position.set(-0.8, 0.18, 0);
    trackR.position.set(0.8, 0.18, 0);
    g.add(trackL, trackR);
    shadow(g);
    return g;
  }

  // car-ish
  const chassis = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.28, 2.0), makeMat(baseColor, 0.22, 0.52));
  chassis.position.y = 0.22;
  g.add(chassis);
  const cabin = new THREE.Mesh(new THREE.BoxGeometry(0.85, 0.28, 0.8), makeMat(0x1b1f2a, 0.35, 0.25, accent));
  cabin.position.set(0, 0.45, -0.1);
  g.add(cabin);

  const wheelMat = makeMat(0x1b1f2a, 0.2, 0.9);
  const wheelGeo = new THREE.CylinderGeometry(0.22, 0.22, 0.16, 16);
  const makeWheel = () => {
    const w = new THREE.Mesh(wheelGeo, wheelMat);
    w.rotation.z = Math.PI * 0.5;
    w.position.y = 0.14;
    return w;
  };
  const w1 = makeWheel(); w1.position.set(-0.55, 0.14, 0.65);
  const w2 = makeWheel(); w2.position.set(0.55, 0.14, 0.65);
  const w3 = makeWheel(); w3.position.set(-0.55, 0.14, -0.75);
  const w4 = makeWheel(); w4.position.set(0.55, 0.14, -0.75);
  g.add(w1, w2, w3, w4);

  // little spoiler on sports
  if (type === 'sports') {
    const spoiler = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.06, 0.18), makeMat(0x1b1f2a, 0.4, 0.35, accent));
    spoiler.position.set(0, 0.45, -1.02);
    g.add(spoiler);
  }

  // roll cage on buggy
  if (type === 'buggy') {
    const cageMat = makeMat(0x1b1f2a, 0.35, 0.4);
    const bar1 = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.9, 10), cageMat);
    bar1.rotation.x = Math.PI * 0.5;
    bar1.position.set(-0.35, 0.55, -0.2);
    const bar2 = bar1.clone();
    bar2.position.x = 0.35;
    g.add(bar1, bar2);
  }

  shadow(g);
  return g;
}



type ArenaOpts = { preset?: DistrictPreset; seed?: number };

function mulberry32(seed: number) {
  let t = seed >>> 0;
  return () => {
    t += 0x6D2B79F5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function randRange(rng: () => number, a: number, b: number) {
  return a + (b - a) * rng();
}

function randInt(rng: () => number, a: number, b: number) {
  return Math.floor(randRange(rng, a, b + 1));
}

function clamp(v: number, a: number, b: number) {
  return Math.max(a, Math.min(b, v));
}

function makeRibbonGeometry(points: THREE.Vector3[], halfWidth: number, y: number): THREE.BufferGeometry {
  const n = points.length;
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  for (let i = 0; i < n; i++) {
    const p = points[i];
    const pPrev = points[Math.max(0, i - 1)];
    const pNext = points[Math.min(n - 1, i + 1)];
    const dx = pNext.x - pPrev.x;
    const dz = pNext.z - pPrev.z;
    const len = Math.hypot(dx, dz) || 1;
    // left normal in XZ plane
    const nx = -dz / len;
    const nz = dx / len;

    const lx = p.x + nx * halfWidth;
    const lz = p.z + nz * halfWidth;
    const rx = p.x - nx * halfWidth;
    const rz = p.z - nz * halfWidth;

    positions.push(lx, y, lz);
    positions.push(rx, y, rz);

    const v = i / (n - 1);
    uvs.push(0, v);
    uvs.push(1, v);

    if (i < n - 1) {
      const a = i * 2;
      const b = i * 2 + 1;
      const c = i * 2 + 2;
      const d = i * 2 + 3;
      indices.push(a, b, c, b, d, c);
    }
  }

  const g = new THREE.BufferGeometry();
  g.setIndex(indices);
  g.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  g.computeVertexNormals();
  return g;
}


function offsetPoints(points: THREE.Vector3[], offset: number): THREE.Vector3[] {
  const out: THREE.Vector3[] = [];
  for (let i = 0; i < points.length; i++) {
    const p = points[i];
    const pPrev = points[Math.max(0, i - 1)];
    const pNext = points[Math.min(points.length - 1, i + 1)];
    const dx = pNext.x - pPrev.x;
    const dz = pNext.z - pPrev.z;
    const len = Math.hypot(dx, dz) || 1;
    const nx = -dz / len;
    const nz = dx / len;
    out.push(new THREE.Vector3(p.x + nx * offset, 0, p.z + nz * offset));
  }
  return out;
}

function addBuildingMetadata(m: THREE.Mesh, w: number, h: number, d: number) {
  m.userData.isBuilding = true;
  m.userData.roofY = m.position.y + h / 2;
  m.userData.halfExtents = { x: w / 2, z: d / 2 };
}

function createHouse(rng: () => number): THREE.Object3D {
  const g = new THREE.Group();
  const w = randRange(rng, 2.4, 4.2);
  const d = randRange(rng, 2.6, 5.2);
  const h = randRange(rng, 1.8, 3.0);

  const wallColors = [0xf2efe9, 0xe7f0ff, 0xf6e7e7, 0xeaf6ea, 0xf5f0db, 0xe8e8ee];
  const roofColors = [0xd35400, 0xb03a2e, 0x7f8c8d, 0xc0392b, 0xa93226];
  const wall = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    makeMat(wallColors[randInt(rng, 0, wallColors.length - 1)], 0.05, 0.85)
  );
  wall.position.y = h / 2;
  wall.castShadow = true;
  wall.receiveShadow = true;
  addBuildingMetadata(wall, w, h, d);
  g.add(wall);

  // roof: gable or simple slope
  const roofH = randRange(rng, 0.7, 1.4);
  const roofMat = makeMat(roofColors[randInt(rng, 0, roofColors.length - 1)], 0.05, 0.75);
  const roof = new THREE.Mesh(new THREE.ConeGeometry(Math.max(w, d) * 0.6, roofH, 4), roofMat);
  roof.rotation.y = Math.PI * 0.25;
  roof.position.y = h + roofH * 0.5;
  roof.castShadow = true;
  roof.receiveShadow = true;
  g.add(roof);

  return g;
}

function createHighrise(rng: () => number): THREE.Mesh {
  const w = randRange(rng, 4, 10);
  const d = randRange(rng, 4, 10);
  const floors = randInt(rng, 6, 18);
  const h = floors * randRange(rng, 1.4, 2.0);
  const base = new THREE.Mesh(
    new THREE.BoxGeometry(w, h, d),
    makeMat(0x9aa3b2, 0.2, 0.55, 0x111827)
  );
  base.position.y = h / 2;
  base.castShadow = true;
  base.receiveShadow = true;
  addBuildingMetadata(base, w, h, d);
  return base;
}

function addTrees(root: THREE.Object3D, rng: () => number, count: number, bounds: number, avoid: (x: number, z: number) => boolean) {
  const trunkMat = makeMat(0x5b4636, 0.05, 0.9);
  const leafMat = makeMat(0x2ecc71, 0.05, 0.85);
  const trunkGeo = new THREE.CylinderGeometry(0.12, 0.16, 1.0, 7);
  const leafGeo = new THREE.ConeGeometry(0.8, 1.6, 8);
  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, count);
  const leaves = new THREE.InstancedMesh(leafGeo, leafMat, count);
  trunks.castShadow = true;
  leaves.castShadow = true;
  trunks.receiveShadow = true;
  leaves.receiveShadow = true;

  const m = new THREE.Matrix4();
  let placed = 0;
  for (let i = 0; i < count * 8 && placed < count; i++) {
    const x = (rng() - 0.5) * bounds * 2;
    const z = (rng() - 0.5) * bounds * 2;
    if (avoid(x, z)) continue;
    const s = randRange(rng, 0.7, 1.25);
    m.compose(
      new THREE.Vector3(x, 0.5 * s, z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rng() * Math.PI * 2, 0)),
      new THREE.Vector3(s, s, s)
    );
    trunks.setMatrixAt(placed, m);
    m.compose(
      new THREE.Vector3(x, 1.55 * s, z),
      new THREE.Quaternion().setFromEuler(new THREE.Euler(0, rng() * Math.PI * 2, 0)),
      new THREE.Vector3(s, s, s)
    );
    leaves.setMatrixAt(placed, m);
    placed += 1;
  }
  trunks.instanceMatrix.needsUpdate = true;
  leaves.instanceMatrix.needsUpdate = true;
  root.add(trunks, leaves);
}

function addStreetlights(root: THREE.Object3D, points: THREE.Vector3[], every: number) {
  const poleMat = makeMat(0x303644, 0.3, 0.65);
  const lampMat = makeMat(0xfff2b2, 0.0, 0.4, 0xfff2b2);
  const poleGeo = new THREE.CylinderGeometry(0.06, 0.08, 3.2, 10);
  const lampGeo = new THREE.SphereGeometry(0.12, 10, 8);

  const instCount = Math.max(1, Math.floor(points.length / every));
  const poles = new THREE.InstancedMesh(poleGeo, poleMat, instCount);
  const lamps = new THREE.InstancedMesh(lampGeo, lampMat, instCount);
  poles.castShadow = true;
  poles.receiveShadow = true;
  lamps.castShadow = false;

  const m = new THREE.Matrix4();
  let j = 0;
  for (let i = 0; i < points.length && j < instCount; i += every) {
    const p = points[i];
    m.compose(new THREE.Vector3(p.x, 1.6, p.z), new THREE.Quaternion(), new THREE.Vector3(1,1,1));
    poles.setMatrixAt(j, m);
    m.compose(new THREE.Vector3(p.x, 3.2, p.z), new THREE.Quaternion(), new THREE.Vector3(1,1,1));
    lamps.setMatrixAt(j, m);
    j++;
  }
  poles.instanceMatrix.needsUpdate = true;
  lamps.instanceMatrix.needsUpdate = true;
  root.add(poles, lamps);
}

function addLaneMarkings(root: THREE.Object3D, points: THREE.Vector3[], spacing: number) {
  const dashMat = makeMat(0xffffff, 0.0, 0.65);
  (dashMat as any).transparent = true;
  (dashMat as any).opacity = 0.75;
  const dashGeo = new THREE.PlaneGeometry(0.18, 1.2);
  const count = Math.max(8, Math.floor((points.length) / spacing));
  const dashes = new THREE.InstancedMesh(dashGeo, dashMat, count);
  dashes.receiveShadow = false;
  dashes.castShadow = false;
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  let j = 0;
  for (let i = 1; i < points.length && j < count; i += spacing) {
    const p = points[i];
    const prev = points[Math.max(0, i - 1)];
    const dx = p.x - prev.x;
    const dz = p.z - prev.z;
    const yaw = Math.atan2(dx, dz);
    q.setFromEuler(new THREE.Euler(-Math.PI/2, yaw, 0));
    m.compose(new THREE.Vector3(p.x, 0.028, p.z), q, new THREE.Vector3(1,1,1));
    dashes.setMatrixAt(j, m);
    j++;
  }
  dashes.instanceMatrix.needsUpdate = true;
  root.add(dashes);
}

export function createArena(opts: ArenaOpts = {}): THREE.Object3D {
  const root = new THREE.Group();

  const preset = opts.preset ?? 'mixed';
  const seed = opts.seed ?? 1337;
  const rng = mulberry32(seed);
  const cfg = WORLD_PRESETS[preset];

  // Floor/base ground
  const groundMat = new THREE.MeshStandardMaterial({ color: 0x101826, metalness: 0.0, roughness: 0.98 });
  // Expand the arena floor to allow more breathing room. Doubling both dimensions
  // increases the playable space without changing world generation logic.
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(320, 320, 1, 1), groundMat);
  floor.rotation.x = -Math.PI * 0.5;
  floor.receiveShadow = true;
  root.add(floor);

  // Boundary walls (keep classic arena containment)
  const wallMat = new THREE.MeshStandardMaterial({ color: 0x22293a, metalness: 0.05, roughness: 0.85 });
  const makeWall = (w: number, h: number, d: number) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wallMat);
    m.castShadow = true;
    m.receiveShadow = true;
    return m;
  };

  // Expand boundary walls to match the larger floor. Doubling the size keeps
  // proportionate containment while allowing longer sight lines.
  const size = 110;
  const h = 2.2;
  const thickness = 1.2;
  const w1 = makeWall(size * 2, h, thickness); w1.position.set(0, h / 2, size);
  const w2 = makeWall(size * 2, h, thickness); w2.position.set(0, h / 2, -size);
  const w3 = makeWall(thickness, h, size * 2); w3.position.set(size, h / 2, 0);
  const w4 = makeWall(thickness, h, size * 2); w4.position.set(-size, h / 2, 0);
  root.add(w1, w2, w3, w4);

  // --- Roads: CatmullRom-based curvy loop + a cross road ---
  const roadY = 0.02;
  const roadHalf = 3.6;
  const curbHalf = roadHalf + 0.22;
  const sidewalkHalf = roadHalf + 1.35;

  const loopCtrl = [
    new THREE.Vector3(-42, 0, -18),
    new THREE.Vector3(-10, 0, -40),
    new THREE.Vector3(26, 0, -30),
    new THREE.Vector3(42, 0, -2),
    new THREE.Vector3(28, 0, 34),
    new THREE.Vector3(-18, 0, 40),
    new THREE.Vector3(-44, 0, 14),
  ];
  const loopCurve = new THREE.CatmullRomCurve3(loopCtrl, true, 'catmullrom', 0.25);
  const loopPts = loopCurve.getPoints(280);

  const crossCtrl = [
    new THREE.Vector3(-52, 0, 6),
    new THREE.Vector3(-18, 0, 10),
    new THREE.Vector3(16, 0, 6),
    new THREE.Vector3(54, 0, -6),
  ];
  const crossCurve = new THREE.CatmullRomCurve3(crossCtrl, false, 'catmullrom', 0.2);
  const crossPts = crossCurve.getPoints(180);

  const roadMat = new THREE.MeshStandardMaterial({ color: 0x2a2f3b, metalness: 0.05, roughness: 0.92 });
  const curbMat = new THREE.MeshStandardMaterial({ color: 0x353b47, metalness: 0.05, roughness: 0.88 });
  const sidewalkMat = new THREE.MeshStandardMaterial({ color: 0x2f3b52, metalness: 0.06, roughness: 0.86 });

  const addRoadBundle = (pts: THREE.Vector3[]) => {
    const road = new THREE.Mesh(makeRibbonGeometry(pts, roadHalf, roadY), roadMat);
    road.receiveShadow = true;
    root.add(road);

    // Curbs + sidewalks as *side strips*, not full-width overlays.
    const curbW = 0.24;
    const sideW = 1.15;

    const curbOffset = roadHalf + curbW * 0.5;
    const sOffset = roadHalf + curbW + sideW * 0.5;

    const curbL = offsetPoints(pts, curbOffset);
    const curbR = offsetPoints(pts, -curbOffset);

    const sideL = offsetPoints(pts, sOffset);
    const sideR = offsetPoints(pts, -sOffset);

    const curbMeshL = new THREE.Mesh(makeRibbonGeometry(curbL, curbW * 0.5, roadY + 0.04), curbMat);
    const curbMeshR = new THREE.Mesh(makeRibbonGeometry(curbR, curbW * 0.5, roadY + 0.04), curbMat);
    curbMeshL.receiveShadow = true;
    curbMeshR.receiveShadow = true;
    root.add(curbMeshL, curbMeshR);

    const sideMeshL = new THREE.Mesh(makeRibbonGeometry(sideL, sideW * 0.5, roadY + 0.06), sidewalkMat);
    const sideMeshR = new THREE.Mesh(makeRibbonGeometry(sideR, sideW * 0.5, roadY + 0.06), sidewalkMat);
    sideMeshL.receiveShadow = true;
    sideMeshR.receiveShadow = true;
    root.add(sideMeshL, sideMeshR);


    // Center lane dashes
    addLaneMarkings(root, pts, 10);

    // Streetlights along the sidewalk line
    addStreetlights(root, pts, 18);
  };

  addRoadBundle(loopPts);
  addRoadBundle(crossPts);

  // Avoid placing props/buildings too close to roads.
  const roadAvoid = (x: number, z: number) => {
    // cheap: check distance to sampled points (fast enough at these counts)
    const check = (pts: THREE.Vector3[]) => {
      for (let i = 0; i < pts.length; i += 8) {
        const p = pts[i];
        const dx = x - p.x;
        const dz = z - p.z;
        if (dx * dx + dz * dz < (sidewalkHalf + 1.2) ** 2) return true;
      }
      return false;
    };
    return check(loopPts) || check(crossPts);
  };

  // --- Fields (rural patchwork) ---
  if (rng() < cfg.fieldWeight) {
    const fieldColors = [0x4f9d62, 0x7fbf52, 0xc8c06a, 0x6fb7a9, 0xa6c97a];
    const fieldMat = new THREE.MeshStandardMaterial({ color: fieldColors[randInt(rng,0,fieldColors.length-1)], metalness: 0.0, roughness: 0.95 });
    for (let i = 0; i < randInt(rng, 8, 14); i++) {
      const w = randRange(rng, 10, 24);
      const d = randRange(rng, 10, 26);
      const x = randRange(rng, -48, 48);
      const z = randRange(rng, -48, 48);
      if (roadAvoid(x, z)) continue;
      const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), fieldMat.clone());
      m.rotation.x = -Math.PI/2;
      m.position.set(x, 0.01, z);
      (m.material as any).color.set(fieldColors[randInt(rng,0,fieldColors.length-1)]);
      m.receiveShadow = true;
      root.add(m);
    }
  }

  // --- Buildings: rural village + city corner ---
  const housesCount = randInt(rng, cfg.houses.min, cfg.houses.max);
  for (let i = 0; i < housesCount; i++) {
    const obj = createHouse(rng);
    const x = randRange(rng, -46, 46);
    const z = randRange(rng, -46, 46);
    if (roadAvoid(x, z)) continue;
    obj.position.set(x, 0, z);
    obj.rotation.y = rng() * Math.PI * 2;
    root.add(obj);
  }

  const hiCount = randInt(rng, cfg.highrises.min, cfg.highrises.max);
  for (let i = 0; i < hiCount; i++) {
    const tower = createHighrise(rng);
    // Bias city toward +X +Z corner
    const x = randRange(rng, 10, 50) * (rng() < 0.85 ? 1 : -1);
    const z = randRange(rng, 10, 50) * (rng() < 0.85 ? 1 : -1);
    if (roadAvoid(x, z)) continue;
    tower.position.x = x;
    tower.position.z = z;
    tower.rotation.y = rng() * Math.PI * 2;
    root.add(tower);
  }

  // --- District-specific props ---
  // Rural: more trees
  if (rng() < cfg.treesWeight) {
    addTrees(root, rng, randInt(rng, 60, 120), 55, roadAvoid);
  } else {
    addTrees(root, rng, randInt(rng, 24, 55), 55, roadAvoid);
  }

  // City props: a couple of billboards near roads
  if (cfg.cityWeight > 0.5) {
    const boardMat = makeMat(0x1b1f2a, 0.15, 0.65, 0x4df3ff);
    for (let i = 0; i < 4; i++) {
      const board = new THREE.Mesh(new THREE.BoxGeometry(4.2, 2.2, 0.25), boardMat);
      const p = loopPts[randInt(rng, 0, loopPts.length-1)];
      board.position.set(p.x + randRange(rng, -6, 6), 2.2, p.z + randRange(rng, -6, 6));
      board.rotation.y = rng() * Math.PI*2;
      board.castShadow = true;
      root.add(board);
    }
  }

  return root;
}

import * as THREE from 'three';

export type VehicleVisualType = 'sports' | 'muscle' | 'tank' | 'buggy' | 'heli' | 'enemy' | 'enemyHeli' | 'onlooker';

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

export function createArena(): THREE.Object3D {
  const root = new THREE.Group();

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(120, 120, 1, 1),
    new THREE.MeshStandardMaterial({ color: 0x0f1522, metalness: 0.0, roughness: 0.95 })
  );
  floor.rotation.x = -Math.PI * 0.5;
  floor.receiveShadow = true;
  root.add(floor);

  const wallMat = new THREE.MeshStandardMaterial({ color: 0x22293a, metalness: 0.05, roughness: 0.85 });
  const makeWall = (w: number, h: number, d: number) => {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), wallMat);
    m.castShadow = true;
    m.receiveShadow = true;
    return m;
  };

  const size = 55;
  const h = 2.2;
  const thickness = 1.2;
  const w1 = makeWall(size * 2, h, thickness); w1.position.set(0, h / 2, size);
  const w2 = makeWall(size * 2, h, thickness); w2.position.set(0, h / 2, -size);
  const w3 = makeWall(thickness, h, size * 2); w3.position.set(size, h / 2, 0);
  const w4 = makeWall(thickness, h, size * 2); w4.position.set(-size, h / 2, 0);
  root.add(w1, w2, w3, w4);

  // obstacles
  const obsMat = new THREE.MeshStandardMaterial({ color: 0x2f3b52, metalness: 0.1, roughness: 0.75 });
  for (let i = 0; i < 22; i++) {
    const box = new THREE.Mesh(new THREE.BoxGeometry(1.8 + Math.random() * 2.2, 1.2 + Math.random() * 1.6, 1.8 + Math.random() * 2.2), obsMat);
    box.position.set((Math.random() - 0.5) * 80, box.geometry.parameters.height / 2, (Math.random() - 0.5) * 80);
    box.castShadow = true;
    box.receiveShadow = true;
    root.add(box);
  }

  return root;
}

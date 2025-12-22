import * as THREE from 'three';

type Shock = {
  mesh: THREE.Mesh;
  age: number;
  dur: number;
  start: number;
  end: number;
};

/**
 * VR-safe world-space shockwaves (no camera shake, no post FX).
 */
export class ShockwavePool {
  private readonly group = new THREE.Group();
  private readonly ringGeo = new THREE.RingGeometry(0.2, 0.4, 32);
  private readonly shocks: Shock[] = [];

  constructor(parent: THREE.Object3D) {
    this.group.name = 'shockwaves';
    parent.add(this.group);
  }

  spawn(pos: THREE.Vector3, color: number, intensity = 1): void {
    const dur = 0.28 + 0.08 * intensity;
    const start = 0.55;
    const end = 4.0 + 2.0 * intensity;
    const mesh = new THREE.Mesh(
      this.ringGeo,
      new THREE.MeshBasicMaterial({
        color,
        transparent: true,
        opacity: 0.85,
        depthWrite: false,
        blending: THREE.AdditiveBlending,
      })
    );
    mesh.rotation.x = -Math.PI * 0.5;
    mesh.position.copy(pos);
    mesh.position.y += 0.02;
    this.group.add(mesh);
    this.shocks.push({ mesh, age: 0, dur, start, end });
  }

  update(dt: number): void {
    for (let i = this.shocks.length - 1; i >= 0; i--) {
      const s = this.shocks[i];
      s.age += dt;
      const t = Math.min(1, s.age / s.dur);
      const k = t * t * (3 - 2 * t);
      const scale = s.start + (s.end - s.start) * k;
      s.mesh.scale.setScalar(scale);
      const m = s.mesh.material as THREE.MeshBasicMaterial;
      m.opacity = (1 - t) * 0.85;
      if (t >= 1) {
        this.group.remove(s.mesh);
        (s.mesh.material as THREE.Material).dispose();
        this.shocks.splice(i, 1);
      }
    }
  }
}

import * as THREE from 'three';

export class TabletopRig {
  readonly root = new THREE.Group();
  private scale = 0.12;
  private height = 1.05;
  private center = new THREE.Vector3(0, 0, 0);

  constructor() {
    this.apply();
  }

  setCenter(x: number, z: number) {
    this.center.set(x, 0, z);
    this.apply();
  }

  adjustScale(delta: number) {
    this.scale = THREE.MathUtils.clamp(this.scale + delta, 0.06, 0.22);
    this.apply();
  }

  adjustHeight(delta: number) {
    this.height = THREE.MathUtils.clamp(this.height + delta, 0.65, 1.6);
    this.apply();
  }

  private apply() {
    this.root.scale.setScalar(this.scale);
    this.root.position.set(-this.center.x * this.scale, this.height, -this.center.z * this.scale);
  }
}

import * as THREE from 'three';

export class TabletopRig {
  readonly root = new THREE.Group();
  private scale = 0.12;
  private height = 1.05;
  private center = new THREE.Vector3(0, 0, 0);

  private desktopScale = 1.0;
  private desktopHeight = 0.0;
  private tabletopScale = 0.12;
  private tabletopHeight = 1.05;

  constructor() {
    // Start in desktop mode; VR session start will switch to tabletop mode.
    this.setDesktopMode();
    this.apply();
  }

  /**
   * Desktop mode renders the arena at 1:1 scale in world space.
   */
  setDesktopMode() {
    this.scale = this.desktopScale;
    this.height = this.desktopHeight;
    this.apply();
  }

  /**
   * Tabletop mode is used for VR: scaled down diorama floating in front of the user.
   */
  setTabletopMode() {
    this.scale = this.tabletopScale;
    this.height = this.tabletopHeight;
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

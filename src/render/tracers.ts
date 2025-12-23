import * as THREE from 'three';

export type TracerSegment = {
  ax: number;
  ay: number;
  az: number;
  bx: number;
  by: number;
  bz: number;
  color: number; // 0xRRGGBB
  life: number;
  maxLife: number;
};

/**
 * CPU-side bullet tracer renderer using LineSegments.
 *
 * Why this exists:
 * - Our ParticleSystem uses a single uniform color, so bullet tracers were easy to miss.
 * - LineSegments make bullets/rockets clearly visible as they fly.
 */
export class TracerRenderer {
  private readonly maxSegments: number;
  private readonly segments: TracerSegment[] = [];

  private readonly geometry: THREE.BufferGeometry;
  private readonly positions: Float32Array;
  private readonly colors: Float32Array;
  private readonly material: THREE.LineBasicMaterial;
  readonly lines: THREE.LineSegments;

  constructor(maxSegments = 512) {
    this.maxSegments = maxSegments;
    this.positions = new Float32Array(maxSegments * 2 * 3);
    this.colors = new Float32Array(maxSegments * 2 * 3);
    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.geometry.setAttribute('color', new THREE.BufferAttribute(this.colors, 3));

    this.material = new THREE.LineBasicMaterial({
      vertexColors: true,
      transparent: true,
      opacity: 0.95,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
    });

    this.lines = new THREE.LineSegments(this.geometry, this.material);
    this.lines.frustumCulled = false;
  }

  /** Add a tracer segment that will fade out over `lifeS` seconds. */
  add(ax: number, ay: number, az: number, bx: number, by: number, bz: number, color: number, lifeS = 0.08) {
    // Keep newest; drop oldest if needed.
    if (this.segments.length >= this.maxSegments) this.segments.shift();
    this.segments.push({ ax, ay, az, bx, by, bz, color, life: 0, maxLife: Math.max(0.01, lifeS) });
  }

  clear() {
    this.segments.length = 0;
    // Force buffers empty.
    for (let i = 0; i < this.positions.length; i++) this.positions[i] = 0;
    for (let i = 0; i < this.colors.length; i++) this.colors[i] = 0;
    (this.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    (this.geometry.getAttribute('color') as THREE.BufferAttribute).needsUpdate = true;
  }

  update(dt: number) {
    // Age out.
    for (let i = this.segments.length - 1; i >= 0; i--) {
      const s = this.segments[i];
      s.life += dt;
      if (s.life >= s.maxLife) this.segments.splice(i, 1);
    }

    // Write buffers.
    const n = Math.min(this.segments.length, this.maxSegments);
    for (let i = 0; i < this.maxSegments; i++) {
      const base = i * 6; // 2 verts * 3
      if (i < n) {
        const s = this.segments[i];
        const t = 1 - (s.life / s.maxLife);
        const r = ((s.color >> 16) & 0xff) / 255;
        const g = ((s.color >> 8) & 0xff) / 255;
        const b = (s.color & 0xff) / 255;

        this.positions[base + 0] = s.ax;
        this.positions[base + 1] = s.ay;
        this.positions[base + 2] = s.az;
        this.positions[base + 3] = s.bx;
        this.positions[base + 4] = s.by;
        this.positions[base + 5] = s.bz;

        // Fade by scaling the vertex color.
        this.colors[base + 0] = r * t;
        this.colors[base + 1] = g * t;
        this.colors[base + 2] = b * t;
        this.colors[base + 3] = r * t;
        this.colors[base + 4] = g * t;
        this.colors[base + 5] = b * t;
      } else {
        this.positions[base + 0] = 0;
        this.positions[base + 1] = -9999;
        this.positions[base + 2] = 0;
        this.positions[base + 3] = 0;
        this.positions[base + 4] = -9999;
        this.positions[base + 5] = 0;
        this.colors[base + 0] = 0;
        this.colors[base + 1] = 0;
        this.colors[base + 2] = 0;
        this.colors[base + 3] = 0;
        this.colors[base + 4] = 0;
        this.colors[base + 5] = 0;
      }
    }

    (this.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    (this.geometry.getAttribute('color') as THREE.BufferAttribute).needsUpdate = true;
  }

  /** Number of currently alive tracer segments (test/debug contract). */
  getSegmentCount(): number {
    return this.segments.length;
  }

  /** Colors of currently alive segments in insertion order (test/debug contract). */
  getSegmentColors(): number[] {
    return this.segments.map((s) => s.color);
  }
}

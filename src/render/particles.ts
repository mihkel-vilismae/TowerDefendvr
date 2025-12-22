import * as THREE from 'three';

type Particle = {
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  life: number;
  maxLife: number;
  /** Per-particle drag multiplier applied each tick (e.g. 0.92). */
  drag: number;
  /** Gravity scale factor (0 = no gravity). */
  gravityScale: number;
};

/**
 * Lightweight CPU particle system rendered as Points.
 * Intended for explosions, smoke bursts, and impacts.
 */
export class ParticleSystem {
  private readonly maxParticles: number;
  private readonly particles: Particle[] = [];
  /**
   * Scales spawn counts for performance. Useful for VR where CPU budgets are tighter.
   * 1.0 = full effect, 0.5 = half the particles.
   */
  private spawnScale = 1;
  private readonly geometry: THREE.BufferGeometry;
  private readonly positions: Float32Array;
  private readonly alphas: Float32Array;
  private readonly material: THREE.ShaderMaterial;
  readonly points: THREE.Points;

  constructor(
    maxParticles = 2000,
    opts: {
      blending?: THREE.Blending;
      depthWrite?: boolean;
      sizePx?: number;
      color?: THREE.ColorRepresentation;
    } = {}
  ) {
    this.maxParticles = maxParticles;
    this.positions = new Float32Array(maxParticles * 3);
    this.alphas = new Float32Array(maxParticles);
    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    this.geometry.setAttribute('aAlpha', new THREE.BufferAttribute(this.alphas, 1));

    this.material = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: opts.depthWrite ?? false,
      blending: opts.blending ?? THREE.AdditiveBlending,
      uniforms: {
        // Smaller base size for readability (explosions were overwhelming the scene).
        uSize: { value: opts.sizePx ?? 6.0 },
        uColor: { value: new THREE.Color(opts.color ?? 0xffffff) },
      },
      vertexShader: `
        attribute float aAlpha;
        varying float vAlpha;
        uniform float uSize;
        void main(){
          vAlpha = aAlpha;
          vec4 mvPosition = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = uSize * (300.0 / -mvPosition.z);
          gl_Position = projectionMatrix * mvPosition;
        }
      `,
      fragmentShader: `
        varying float vAlpha;
        uniform vec3 uColor;
        void main(){
          // soft round particle
          vec2 c = gl_PointCoord - vec2(0.5);
          float d = dot(c,c);
          float falloff = smoothstep(0.25, 0.0, d);
          gl_FragColor = vec4(uColor, vAlpha * falloff);
        }
      `,
    });

    this.points = new THREE.Points(this.geometry, this.material);
    this.points.frustumCulled = false;
  }

  setSize(px: number) {
    this.material.uniforms.uSize.value = px;
  }

  setColor(color: THREE.ColorRepresentation) {
    this.material.uniforms.uColor.value.set(color);
  }

  /** Scale spawn counts (not maxParticles). */
  setSpawnScale(scale: number) {
    // Clamp defensively.
    this.spawnScale = Math.max(0, Math.min(1, scale));
    return this;
  }

  spawnExplosion(center: THREE.Vector3, intensity = 1) {
    // Keep explosions compact; intensity still scales, but far less aggressively.
    const count = Math.min(70, Math.floor((28 + intensity * 55) * this.spawnScale));
    for (let i = 0; i < count; i++) {
      if (this.particles.length >= this.maxParticles) break;
      const dir = new THREE.Vector3(
        (Math.random() - 0.5),
        (Math.random() - 0.5) * 0.25,
        (Math.random() - 0.5)
      ).normalize();
      const speed = (2.2 + Math.random() * 7.5) * intensity;
      const p: Particle = {
        pos: center.clone(),
        vel: dir.multiplyScalar(speed),
        life: 0,
        maxLife: 0.6 + Math.random() * 0.6,
        drag: 0.92,
        gravityScale: 0.25,
      };
      this.particles.push(p);
    }
  }

  /**
   * Short-lived, fast sparks for impacts.
   * Use an additive system with a small point size for best readability.
   */
  spawnSparks(center: THREE.Vector3, intensity = 1) {
    const count = Math.min(90, Math.floor((18 + intensity * 70) * this.spawnScale));
    for (let i = 0; i < count; i++) {
      if (this.particles.length >= this.maxParticles) break;
      const dir = new THREE.Vector3(
        (Math.random() - 0.5),
        (Math.random() - 0.1),
        (Math.random() - 0.5)
      ).normalize();
      const speed = (6 + Math.random() * 12) * intensity;
      this.particles.push({
        pos: center.clone(),
        vel: dir.multiplyScalar(speed),
        life: 0,
        maxLife: 0.18 + Math.random() * 0.22,
        drag: 0.86,
        gravityScale: 1.35,
      });
    }
  }

  /**
   * Directional sparks that prefer a hemisphere around `dir`.
   * Useful for impact feedback where sparks should travel away from the hit normal.
   */
  spawnDirectionalSparks(center: THREE.Vector3, dir: THREE.Vector3, intensity = 1) {
    const count = Math.min(75, Math.floor((12 + intensity * 55) * this.spawnScale));
    const d = dir.clone().normalize();
    for (let i = 0; i < count; i++) {
      if (this.particles.length >= this.maxParticles) break;
      // Random vector biased toward `d`.
      const r = new THREE.Vector3(
        (Math.random() - 0.5),
        (Math.random() - 0.2),
        (Math.random() - 0.5)
      ).normalize();
      const biased = r.addScaledVector(d, 1.15).normalize();
      const speed = (7 + Math.random() * 13) * intensity;
      this.particles.push({
        pos: center.clone(),
        vel: biased.multiplyScalar(speed),
        life: 0,
        maxLife: 0.10 + Math.random() * 0.12,
        drag: 0.86,
        gravityScale: 1.35,
      });
    }
  }

  /**
   * Longer-lived smoke. Best used with NormalBlending and larger point size.
   */
  spawnSmoke(center: THREE.Vector3, intensity = 1) {
    const count = Math.min(55, Math.floor((8 + intensity * 40) * this.spawnScale));
    for (let i = 0; i < count; i++) {
      if (this.particles.length >= this.maxParticles) break;
      const dir = new THREE.Vector3(
        (Math.random() - 0.5) * 0.6,
        1.0 + Math.random() * 0.6,
        (Math.random() - 0.5) * 0.6
      ).normalize();
      const speed = (0.6 + Math.random() * 1.4) * intensity;
      this.particles.push({
        pos: center.clone(),
        vel: dir.multiplyScalar(speed),
        life: 0,
        maxLife: 1.4 + Math.random() * 1.6,
        drag: 0.97,
        gravityScale: 0.05,
      });
    }
  }

  spawnTrailPoint(pos: THREE.Vector3, vel: THREE.Vector3, life = 0.25) {
    if (this.particles.length >= this.maxParticles) return;
    this.particles.push({
      pos: pos.clone(),
      vel: vel.clone(),
      life: 0,
      maxLife: life,
      drag: 0.94,
      gravityScale: 0.0,
    });
  }

  update(dt: number) {
    // integrate + remove dead
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life += dt;
      if (p.life >= p.maxLife) {
        this.particles.splice(i, 1);
        continue;
      }
      // basic drag + gravity
      p.vel.multiplyScalar(p.drag);
      p.vel.y -= 9.81 * dt * p.gravityScale;
      p.pos.addScaledVector(p.vel, dt);
    }

    // write buffers
    const n = this.particles.length;
    for (let i = 0; i < this.maxParticles; i++) {
      const base = i * 3;
      if (i < n) {
        const p = this.particles[i];
        this.positions[base + 0] = p.pos.x;
        this.positions[base + 1] = p.pos.y;
        this.positions[base + 2] = p.pos.z;
        this.alphas[i] = 1 - (p.life / p.maxLife);
      } else {
        this.positions[base + 0] = 0;
        this.positions[base + 1] = -9999;
        this.positions[base + 2] = 0;
        this.alphas[i] = 0;
      }
    }
    (this.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    (this.geometry.getAttribute('aAlpha') as THREE.BufferAttribute).needsUpdate = true;
  }
}

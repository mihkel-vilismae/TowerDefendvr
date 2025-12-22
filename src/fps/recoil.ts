/**
 * Lightweight recoil spring for FPS viewmodels.
 *
 * Visual-only: does not affect hit logic.
 */
export class RecoilSpring {
  private vel = 0;
  private value = 0;
  private target = 0;

  /** Add an instantaneous kick (positive values kick backward / upward). */
  kick(amount: number): void {
    this.vel += amount;
  }

  /**
   * Update spring.
   * @returns current spring value
   */
  update(dt: number): number {
    // Critically-damped-ish spring.
    const stiffness = 55;
    const damping = 14;
    const x = this.value - this.target;
    this.vel += (-stiffness * x - damping * this.vel) * dt;
    this.value += this.vel * dt;
    // Numerical clamp
    if (Math.abs(this.value) < 1e-5 && Math.abs(this.vel) < 1e-5) {
      this.value = 0;
      this.vel = 0;
    }
    return this.value;
  }

  reset(): void {
    this.vel = 0;
    this.value = 0;
    this.target = 0;
  }
}

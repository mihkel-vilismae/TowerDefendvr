/**
 * Simple 2D vector class used for position and velocity in the simulation layer.
 */
export class Vector2 {
  constructor(public x: number = 0, public y: number = 0) {}

  clone(): Vector2 {
    return new Vector2(this.x, this.y);
  }

  add(v: Vector2): this {
    this.x += v.x;
    this.y += v.y;
    return this;
  }

  sub(v: Vector2): this {
    this.x -= v.x;
    this.y -= v.y;
    return this;
  }

  scale(s: number): this {
    this.x *= s;
    this.y *= s;
    return this;
  }

  length(): number {
    return Math.sqrt(this.x * this.x + this.y * this.y);
  }

  normalize(): this {
    const len = this.length();
    if (len > 0) {
      this.x /= len;
      this.y /= len;
    }
    return this;
  }

  static fromAngle(angle: number): Vector2 {
    return new Vector2(Math.cos(angle), Math.sin(angle));
  }
}
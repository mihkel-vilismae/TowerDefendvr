import { Vector2 } from './vector2';

/**
 * Represents the control inputs for a car for a single simulation step.
 */
export interface InputState {
  accelerate: boolean;
  brake: boolean;
  left: boolean;
  right: boolean;
}

/**
 * Simple arcade-style car model. The simulation layer is deterministic and does not depend
 * on any rendering library. It exposes position, velocity and heading in a 2D plane.
 */
export class Car {
  /** Position of the car in world coordinates. */
  public position: Vector2 = new Vector2();
  /** Velocity vector of the car. */
  public velocity: Vector2 = new Vector2();
  /** Heading angle in radians. 0 rad corresponds to facing along +X. */
  public heading: number = 0;

  // Tunable parameters for the driving model
  public maxSpeed: number = 20; // units per second
  public accelerationRate: number = 30; // units per second squared
  public brakeDeceleration: number = 40; // deceleration when braking
  public friction: number = 10; // general drag deceleration
  public turnRate: number = Math.PI; // radians per second when turning at full input

  /**
   * Advances the car's simulation by a fixed timestep using the provided input.
   * @param dt Delta time in seconds.
   * @param input State of the input controls.
   */
  update(dt: number, input: InputState): void {
    // Turning influences heading irrespective of speed (arcade handling)
    if (input.left) {
      this.heading -= this.turnRate * dt;
    }
    if (input.right) {
      this.heading += this.turnRate * dt;
    }

    // Compute forward direction
    const forward = Vector2.fromAngle(this.heading);

    // Acceleration and braking modify velocity along the forward axis
    let acceleration = 0;
    if (input.accelerate) {
      acceleration += this.accelerationRate;
    }
    if (input.brake) {
      // Brake deceleration acts opposite to velocity direction
      acceleration -= this.brakeDeceleration;
    }

    // Apply acceleration component along forward direction
    if (acceleration !== 0) {
      const accelVec = forward.clone().scale(acceleration * dt);
      this.velocity.add(accelVec);
    }

    // Apply friction opposite to current velocity (simple linear drag)
    const speed = this.velocity.length();
    if (speed > 0) {
      const dragMagnitude = this.friction * dt;
      // Limit drag to not reverse velocity direction
      const drag = Math.min(dragMagnitude, speed);
      const dragVec = this.velocity.clone().normalize().scale(-drag);
      this.velocity.add(dragVec);
    }

    // Clamp speed to maxSpeed
    const newSpeed = this.velocity.length();
    if (newSpeed > this.maxSpeed) {
      this.velocity.normalize().scale(this.maxSpeed);
    }

    // Update position
    const displacement = this.velocity.clone().scale(dt);
    this.position.add(displacement);
  }
}
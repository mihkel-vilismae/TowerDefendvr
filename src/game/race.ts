import { Car, InputState } from './car';
import { Vector2 } from './vector2';

/**
 * Represents a simple circular race track. A lap is counted when a car crosses
 * the finish line located at x >= 0 and y approximately 0 while moving in the positive x direction.
 */
export class Race {
  private cars: Car[];
  private previousPositions: Map<Car, Vector2> = new Map();
  private lapsCompleted: Map<Car, number> = new Map();
  private lapCount: number;
  private finishThreshold: number;

  constructor(cars: Car[], lapCount: number = 3, finishThreshold = 5) {
    this.cars = cars;
    this.lapCount = lapCount;
    this.finishThreshold = finishThreshold;
    for (const car of cars) {
      this.previousPositions.set(car, car.position.clone());
      this.lapsCompleted.set(car, 0);
    }
  }

  /**
   * Number of laps completed by a given car.
   */
  getLaps(car: Car): number {
    return this.lapsCompleted.get(car) ?? 0;
  }

  /**
   * Returns true if the given car has finished the race.
   */
  isFinished(car: Car): boolean {
    return (this.lapsCompleted.get(car) ?? 0) >= this.lapCount;
  }

  /**
   * Steps the race simulation forward. All cars are updated using their respective inputs,
   * after which lap counts are updated based on finish line crossings.
   * @param dt Delta time in seconds.
   * @param inputs Array of input states corresponding to each car.
   */
  update(dt: number, inputs: InputState[]): void {
    // Update each car
    for (let i = 0; i < this.cars.length; i++) {
      const car = this.cars[i];
      const input = inputs[i];
      car.update(dt, input);
    }
    // Check finish line crossings
    for (const car of this.cars) {
      const prevPos = this.previousPositions.get(car)!;
      const currPos = car.position;
      // Determine if car crossed from negative x to positive x near y ~0
      if (prevPos.x < 0 && currPos.x >= 0 && Math.abs(currPos.y) < this.finishThreshold) {
        // Count lap only if car is heading roughly along +X direction (prevent backward lap)
        const forward = Vector2.fromAngle(car.heading);
        if (forward.x > 0) {
          const currentLap = this.lapsCompleted.get(car) ?? 0;
          this.lapsCompleted.set(car, currentLap + 1);
        }
      }
      // Store current position as previous for next frame
      this.previousPositions.set(car, currPos.clone());
    }
  }

  /**
   * Returns true if all cars have completed the race.
   */
  allFinished(): boolean {
    for (const car of this.cars) {
      if (!this.isFinished(car)) {
        return false;
      }
    }
    return true;
  }
}
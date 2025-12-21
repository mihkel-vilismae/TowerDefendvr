import { Friendly } from './friendly';
import { Entity } from './entities';

/**
 * Represents the possession state of the player. Only one unit may be
 * possessed at a time. The possessed friendly unit can be controlled by the
 * player's inputs. When possession ends, control returns to the player
 * character (Entity).
 */
export class PossessionState {
  private possessed: Friendly | null = null;
  private previousPlayer: Entity | null = null;
  /**
   * Possess a friendly unit. Stores reference to current player so control
   * can be restored later. Returns true if possession succeeded.
   */
  possess(unit: Friendly, currentPlayer: Entity): boolean {
    if (this.possessed) return false;
    this.possessed = unit;
    this.previousPlayer = currentPlayer;
    return true;
  }
  /** Exit possession and return to controlling the original player. */
  release(): Friendly | null {
    const u = this.possessed;
    this.possessed = null;
    return u;
  }
  /** Returns the currently possessed unit or null if none. */
  getCurrent(): Friendly | null {
    return this.possessed;
  }
  /** Returns whether the player is in possession state. */
  isPossessing(): boolean {
    return this.possessed !== null;
  }
}
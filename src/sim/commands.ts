import { Friendly } from './friendly';
import { Vector2 } from '../game/vector2';

/**
 * Minimal RTS command system. Manages a set of selected friendly units and
 * dispatches move commands to trooper-type units. Selection uses a Set to
 * avoid duplicates and supports additive selection (shift-click behaviour).
 */
export class CommandSystem {
  private selected: Set<Friendly> = new Set();
  constructor() {}
  /** Clear current selection. */
  clearSelection(): void {
    this.selected.clear();
  }
  /** Select a friendly unit. If additive is false, replaces the selection. */
  select(unit: Friendly, additive: boolean = false): void {
    if (!additive) this.selected.clear();
    this.selected.add(unit);
  }
  /** Deselect a friendly unit. */
  deselect(unit: Friendly): void {
    this.selected.delete(unit);
  }
  /** Get array of currently selected units. */
  getSelection(): Friendly[] {
    return Array.from(this.selected);
  }
  /** Issue a move command to all selected troopers. Sets their targetPosition. */
  moveSelected(target: Vector2): void {
    for (const f of this.selected) {
      if (f.type === 'trooper') {
        f.targetPosition = new Vector2(target.x, target.y);
      }
    }
  }
}
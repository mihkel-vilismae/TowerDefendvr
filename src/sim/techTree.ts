// Definition of a technology node in the tech tree.
export interface Tech {
  id: string;
  name: string;
  cost: number;
  prereqs: string[];
  // Optional effect function that can modify game state when unlocked.
  // This is left unimplemented here; callers can apply effects manually.
  effect?: () => void;
}

/**
 * TechTree manages research nodes and unlocks. Each node has an ID, cost,
 * prerequisites, and an optional effect. Points must be available to unlock
 * technologies. Unlocked techs are stored in a set. External code is
 * responsible for applying effects when techs are unlocked.
 */
export class TechTree {
  private techs: Map<string, Tech>;
  public unlocked: Set<string>;
  public availablePoints: number;
  constructor(techList: Tech[]) {
    this.techs = new Map();
    for (const t of techList) {
      this.techs.set(t.id, t);
    }
    this.unlocked = new Set();
    this.availablePoints = 0;
  }
  /** Returns true if a tech is unlocked. */
  isUnlocked(id: string): boolean {
    return this.unlocked.has(id);
  }
  /** Returns true if prerequisites are met and sufficient points are available. */
  canUnlock(id: string): boolean {
    const tech = this.techs.get(id);
    if (!tech) return false;
    if (this.unlocked.has(id)) return false;
    // check prerequisites
    for (const prereq of tech.prereqs) {
      if (!this.unlocked.has(prereq)) return false;
    }
    return this.availablePoints >= tech.cost;
  }
  /** Attempt to unlock a tech. Subtracts cost from available points. Returns true on success. */
  unlock(id: string): boolean {
    if (!this.canUnlock(id)) return false;
    const tech = this.techs.get(id)!;
    this.availablePoints -= tech.cost;
    this.unlocked.add(id);
    // Apply effect if provided
    if (tech.effect) tech.effect();
    return true;
  }
  /**
   * Get a tech by ID. Returns null if not found. Useful for tests and UI.
   */
  getTech(id: string): Tech | null {
    return this.techs.get(id) || null;
  }

  /**
   * Returns an array of all defined tech nodes. Useful for UI iteration.
   */
  getAllTechs(): Tech[] {
    return Array.from(this.techs.values());
  }
}

// Define default tech tree. Each tech has an ID, name, cost, prerequisites, and effect.
export const defaultTechs: Tech[] = [
  // Tier 1
  { id: 'improvedBarrels', name: 'Improved Barrels', cost: 30, prereqs: [] },
  { id: 'betterOptics', name: 'Better Optics', cost: 30, prereqs: [] },
  // Tier 2 (requires any two Tier 1 to unlock)
  // Costs are tuned so a player can unlock both Tier 1 techs and one Tier 2 tech
  // with 100 research points (as used in unit tests and early-game pacing).
  { id: 'autoloader', name: 'Autoloader', cost: 40, prereqs: ['improvedBarrels', 'betterOptics'] },
  { id: 'empCapacitors', name: 'EMP Capacitors', cost: 40, prereqs: ['improvedBarrels', 'betterOptics'] },
  // Tier 3
  { id: 'missileTurret', name: 'Missile Turret', cost: 70, prereqs: ['autoloader', 'empCapacitors'] },
  { id: 'trooperArmor', name: 'Trooper Armor', cost: 70, prereqs: ['autoloader', 'empCapacitors'] },
];
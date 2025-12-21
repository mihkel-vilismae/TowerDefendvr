import { GameSimulation } from './game';
import { Enemy } from './entities';
import { Car } from '../game/car';

// Spawn configuration for a single wave: types and counts of enemies.
export interface SpawnConfig {
  type: 'car' | 'fast' | 'armor' | 'boss';
  count: number;
}

export interface WaveDefinition {
  id: number;
  config: SpawnConfig[];
}

// Define a set of wave definitions used by the wave scheduler. Later waves have
// mixed enemy types and increased counts.
export const defaultWaves: WaveDefinition[] = [
  { id: 1, config: [ { type: 'car', count: 4 } ] },
  { id: 2, config: [ { type: 'car', count: 6 }, { type: 'fast', count: 2 } ] },
  { id: 3, config: [ { type: 'car', count: 6 }, { type: 'armor', count: 3 } ] },
  { id: 4, config: [ { type: 'car', count: 8 }, { type: 'fast', count: 4 }, { type: 'armor', count: 2 } ] },
  { id: 5, config: [ { type: 'car', count: 10 }, { type: 'fast', count: 4 }, { type: 'armor', count: 3 }, { type: 'boss', count: 1 } ] },
];

export type Phase = 'build' | 'combat';

/**
 * WaveScheduler manages the flow of waves and phases in the tower defence RTS
 * mode. It spawns enemies according to the current wave definition when
 * startNextWave() is called. The scheduler exposes methods to check if
 * currently in build or combat phase and transitions back to build phase when
 * all enemies are defeated.
 */
export class WaveScheduler {
  private sim: GameSimulation;
  private waves: WaveDefinition[];
  private currentWaveIndex: number = -1;
  public phase: Phase = 'build';
  constructor(sim: GameSimulation, waves: WaveDefinition[] = defaultWaves) {
    this.sim = sim;
    this.waves = waves;
  }
  /**
   * Begin the next wave. This sets the phase to 'combat' and spawns
   * enemies for the next wave based on predefined definitions. If no more
   * waves are defined, it repeats the last wave indefinitely with scaled
   * counts.
   */
  startNextWave(): void {
    this.currentWaveIndex++;
    this.phase = 'combat';
    const def = (this.currentWaveIndex < this.waves.length)
      ? this.waves[this.currentWaveIndex]
      : { id: this.currentWaveIndex + 1, config: this.scaleConfig(this.waves[this.waves.length - 1].config) };
    this.spawnWave(def);
  }
  /** Scale the last wave config for waves beyond the defined list. */
  private scaleConfig(config: SpawnConfig[]): SpawnConfig[] {
    return config.map(sc => ({ ...sc, count: Math.floor(sc.count * 1.3) + 1 }));
  }
  /**
   * Spawn enemies for a given wave definition. Enemies appear near the edges
   * of the arena with small random offsets. Enemy stats differ by type.
   */
  private spawnWave(wave: WaveDefinition): void {
    for (const sc of wave.config) {
      for (let i = 0; i < sc.count; i++) {
        const e = new Enemy(new Car(), 60);
        // Spawn near edge
        const side = Math.floor(Math.random() * 4);
        const arenaExtent = 90;
        const offset = 160;
        let x = 0; let y = 0;
        if (side === 0) { x = -arenaExtent; y = (Math.random() - 0.5) * offset; }
        else if (side === 1) { x = arenaExtent; y = (Math.random() - 0.5) * offset; }
        else if (side === 2) { x = (Math.random() - 0.5) * offset; y = -arenaExtent; }
        else { x = (Math.random() - 0.5) * offset; y = arenaExtent; }
        e.car.position.x = x;
        e.car.position.y = y;
        // Customize enemy based on type
        switch (sc.type) {
          case 'fast':
            e.car.maxSpeed = 28;
            e.car.accelerationRate = 14;
            break;
          case 'armor':
            e.maxHP = 120;
            e.hp = 120;
            break;
          case 'boss':
            e.maxHP = 300;
            e.hp = 300;
            e.car.maxSpeed = 16;
            e.car.accelerationRate = 8;
            break;
          // default 'car' uses normal stats
        }
        // Remove default weapons so enemies rely on ramming or default behaviour
        e.weapons = [];
        this.sim.addEnemy(e);
      }
    }
  }
  /**
   * Should be called every frame. If all enemies are dead during a combat
   * phase, this switches back to build phase. When in build phase, nothing
   * happens until startNextWave() is called.
   */
  update(): void {
    if (this.phase === 'combat' && this.sim.enemies.length === 0) {
      this.phase = 'build';
    }
  }
  /** Returns current wave index (0-based) */
  get currentWave(): number {
    return this.currentWaveIndex;
  }
  /** Returns true if ready to start next wave (in build phase). */
  isReadyForNextWave(): boolean {
    return this.phase === 'build';
  }
}
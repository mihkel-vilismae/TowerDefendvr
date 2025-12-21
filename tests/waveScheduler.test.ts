import { describe, it, expect } from 'vitest';
import { WaveScheduler, WaveDefinition } from '../src/sim/waves';
import { Enemy } from '../src/sim/entities';
import { Car } from '../src/game/car';

// A simple simulation stub that records enemies spawned by the wave scheduler.
class MockSim {
  public enemies: Enemy[] = [];
  addEnemy(e: Enemy) {
    this.enemies.push(e);
  }
}

describe('WaveScheduler', () => {
  it('spawns defined waves and returns to build phase when enemies cleared', () => {
    const sim = new MockSim();
    const waves: WaveDefinition[] = [
      { id: 1, config: [ { type: 'car', count: 2 } ] },
      { id: 2, config: [ { type: 'car', count: 1 } ] },
    ];
    const sched = new WaveScheduler(sim as any, waves);
    // Start first wave
    sched.startNextWave();
    // Should spawn 2 enemies
    expect(sim.enemies.length).toBe(2);
    // All enemies cleared -> build phase
    sim.enemies = [];
    sched.update();
    expect(sched.phase).toBe('build');
    // Next wave
    sched.startNextWave();
    expect(sched.currentWave).toBe(1);
    // Should spawn 1 enemy according to wave definition
    expect(sim.enemies.length).toBe(1);
  });
});
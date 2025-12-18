import { describe, expect, it } from 'vitest';
import { RaceTracker, segmentsIntersect } from '../src/sim/race';
import { Vector2 } from '../src/game/vector2';

describe('segmentsIntersect', () => {
  it('detects a simple crossing', () => {
    const a1 = new Vector2(0, 0);
    const a2 = new Vector2(2, 0);
    const b1 = new Vector2(1, -1);
    const b2 = new Vector2(1, 1);
    expect(segmentsIntersect(a1, a2, b1, b2)).toBe(true);
  });

  it('returns false for non-intersecting segments', () => {
    const a1 = new Vector2(0, 0);
    const a2 = new Vector2(2, 0);
    const b1 = new Vector2(0, 1);
    const b2 = new Vector2(2, 1);
    expect(segmentsIntersect(a1, a2, b1, b2)).toBe(false);
  });
});

describe('RaceTracker', () => {
  it('requires checkpoints in order before counting a lap', () => {
    const tracker = new RaceTracker({
      checkpoints: [new Vector2(5, 0), new Vector2(10, 0)],
      checkpointRadius: 1,
      finishA: new Vector2(0, -2),
      finishB: new Vector2(0, 2),
      lapsToFinish: 2,
    });

    // Cross finish without checkpoints -> no lap
    let r = tracker.update(new Vector2(-1, 0), new Vector2(1, 0));
    expect(r.lap).toBe(0);

    // Hit first checkpoint
    r = tracker.update(new Vector2(4.2, 0), new Vector2(5, 0));
    expect(r.checkpointIndex).toBe(1);

    // Cross finish early -> still no lap
    r = tracker.update(new Vector2(-1, 0), new Vector2(1, 0));
    expect(r.lap).toBe(0);

    // Hit second checkpoint
    r = tracker.update(new Vector2(9.2, 0), new Vector2(10, 0));
    expect(r.checkpointIndex).toBe(2);

    // Now crossing finish counts lap
    r = tracker.update(new Vector2(-1, 0), new Vector2(1, 0));
    expect(r.lap).toBe(1);
    expect(r.lapJustCompleted).toBe(true);
    expect(r.finished).toBe(false);
  });

  it('finishes after the configured number of laps', () => {
    const tracker = new RaceTracker({
      checkpoints: [new Vector2(5, 0)],
      checkpointRadius: 1,
      finishA: new Vector2(0, -2),
      finishB: new Vector2(0, 2),
      lapsToFinish: 1,
    });

    // Hit checkpoint
    tracker.update(new Vector2(4.2, 0), new Vector2(5, 0));
    // Cross finish => done
    const r = tracker.update(new Vector2(-1, 0), new Vector2(1, 0));
    expect(r.lap).toBe(1);
    expect(r.finished).toBe(true);
  });
});

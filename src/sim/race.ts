import { Vector2 } from '../game/vector2';

export interface RaceConfig {
  checkpoints: Vector2[];
  checkpointRadius: number;
  finishA: Vector2;
  finishB: Vector2;
  lapsToFinish: number;
}

export interface RaceUpdateResult {
  checkpointIndex: number;
  lap: number;
  finished: boolean;
  lapJustCompleted: boolean;
}

/**
 * Lightweight race tracker for a single player.
 *
 * Rules:
 * - Checkpoints must be hit in order.
 * - A lap completes only when crossing the finish segment after all checkpoints are hit.
 */
export class RaceTracker {
  private cfg: RaceConfig;
  private _checkpointIndex = 0;
  private _lap = 0;
  private _finished = false;

  constructor(cfg: RaceConfig) {
    this.cfg = cfg;
  }

  get checkpointIndex() { return this._checkpointIndex; }
  get lap() { return this._lap; }
  get finished() { return this._finished; }

  reset(): void {
    this._checkpointIndex = 0;
    this._lap = 0;
    this._finished = false;
  }

  update(prevPos: Vector2, pos: Vector2): RaceUpdateResult {
    if (this._finished) {
      return { checkpointIndex: this._checkpointIndex, lap: this._lap, finished: true, lapJustCompleted: false };
    }

    const next = this.cfg.checkpoints[this._checkpointIndex];
    if (next) {
      const dx = pos.x - next.x;
      const dy = pos.y - next.y;
      if (dx * dx + dy * dy <= this.cfg.checkpointRadius * this.cfg.checkpointRadius) {
        this._checkpointIndex = Math.min(this._checkpointIndex + 1, this.cfg.checkpoints.length);
      }
    }

    let lapJustCompleted = false;
    const allHit = this._checkpointIndex >= this.cfg.checkpoints.length;
    if (allHit && segmentsIntersect(prevPos, pos, this.cfg.finishA, this.cfg.finishB)) {
      this._lap += 1;
      lapJustCompleted = true;
      this._checkpointIndex = 0;
      if (this._lap >= this.cfg.lapsToFinish) {
        this._finished = true;
      }
    }

    return { checkpointIndex: this._checkpointIndex, lap: this._lap, finished: this._finished, lapJustCompleted };
  }
}

// --- geometry helpers ---
function orient(a: Vector2, b: Vector2, c: Vector2): number {
  return (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
}

function onSeg(a: Vector2, b: Vector2, p: Vector2): boolean {
  return Math.min(a.x, b.x) <= p.x && p.x <= Math.max(a.x, b.x) &&
    Math.min(a.y, b.y) <= p.y && p.y <= Math.max(a.y, b.y);
}

/** Proper segment intersection including collinear overlap. */
export function segmentsIntersect(a1: Vector2, a2: Vector2, b1: Vector2, b2: Vector2): boolean {
  const o1 = orient(a1, a2, b1);
  const o2 = orient(a1, a2, b2);
  const o3 = orient(b1, b2, a1);
  const o4 = orient(b1, b2, a2);

  if ((o1 > 0) !== (o2 > 0) && (o3 > 0) !== (o4 > 0)) return true;

  if (o1 === 0 && onSeg(a1, a2, b1)) return true;
  if (o2 === 0 && onSeg(a1, a2, b2)) return true;
  if (o3 === 0 && onSeg(b1, b2, a1)) return true;
  if (o4 === 0 && onSeg(b1, b2, a2)) return true;
  return false;
}

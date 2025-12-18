export type ReplayFrame<T> = { t: number; data: T };

/**
 * A small circular replay buffer storing recent simulation frames.
 * Pure logic; rendering can consume the frames to play back a "kill cam".
 */
export class ReplayBuffer<T> {
  private readonly maxSeconds: number;
  private frames: ReplayFrame<T>[] = [];

  constructor(maxSeconds: number) {
    this.maxSeconds = Math.max(0.5, maxSeconds);
  }

  clear() {
    this.frames = [];
  }

  push(t: number, data: T) {
    this.frames.push({ t, data });
    this.trim(t);
  }

  /** Returns frames in chronological order within the last `seconds`. */
  getLast(seconds: number, nowT: number): ReplayFrame<T>[] {
    const s = Math.max(0, seconds);
    const minT = nowT - s;
    return this.frames.filter(f => f.t >= minT && f.t <= nowT);
  }

  /** Returns the newest frame at or before t, if available. */
  sampleAt(t: number): ReplayFrame<T> | null {
    if (this.frames.length === 0) return null;
    // frames are already in time order
    let lo = 0;
    let hi = this.frames.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      const mt = this.frames[mid].t;
      if (mt === t) return this.frames[mid];
      if (mt < t) lo = mid + 1;
      else hi = mid - 1;
    }
    // hi is index of last frame < t
    if (hi < 0) return this.frames[0];
    return this.frames[Math.min(hi, this.frames.length - 1)];
  }

  private trim(nowT: number) {
    const minT = nowT - this.maxSeconds;
    // drop from the front while too old
    let idx = 0;
    while (idx < this.frames.length && this.frames[idx].t < minT) idx++;
    if (idx > 0) this.frames.splice(0, idx);
  }
}

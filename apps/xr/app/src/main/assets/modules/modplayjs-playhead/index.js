// ../../packages/playhead/src/playhead.ts
var FALLBACK_CLOCK = () => {
  const perf = globalThis.performance;
  if (perf !== void 0 && typeof perf.now === "function") return perf.now();
  return Date.now();
};
var Playhead = class {
  marks = [];
  rate;
  historyMs;
  latencyMs;
  clock;
  provider = null;
  /** Frames per row is derived from the core's binding time model:
   *  ticksize = (int)(rate × 2.5 / bpm), row = ticksize × speed. */
  constructor(opts = {}) {
    this.rate = opts.rate ?? 44100;
    this.historyMs = opts.historyMs ?? 5e3;
    this.latencyMs = opts.latencyMs ?? 0;
    this.clock = opts.clock ?? FALLBACK_CLOCK;
  }
  /** Set the output rate (call after `core.setSampleRate`). Existing marks
   *  keep the row timing they were recorded with. */
  setRate(hz) {
    if (hz > 0 && hz !== this.rate) this.rate = hz;
  }
  /** Extra latency in ms on top of the sink's own accounting. */
  setLatencyMs(ms) {
    this.latencyMs = Number.isFinite(ms) ? ms : 0;
  }
  getLatencyMs() {
    return this.latencyMs;
  }
  /**
   * Install the sink's played-frames counter. The callback runs on every
   * `positionAt()`; it must be cheap (Atomic load / field read) and must
   * return the count of frames that have LEFT the sink (not the count
   * still buffered in it).
   */
  setConsumedProvider(fn) {
    this.provider = fn;
  }
  /** Drop all history (new module, seek, transport restart). */
  reset() {
    this.marks.length = 0;
  }
  /** Number of recorded marks (diagnostics). */
  get markCount() {
    return this.marks.length;
  }
  /**
   * Record the player state reached at the end of one pull.
   * `frames` is the CUMULATIVE number of frames handed to the sink.
   * Monotonic frames are the timeline; the wall clock is only used for
   * history expiry and for the fallback mode.
   */
  mark(frames, pos, atMs) {
    const at = atMs ?? this.clock();
    const last = this.marks[this.marks.length - 1];
    if (last !== void 0) {
      if (frames < last.frames) this.marks.length = 0;
      else if (frames === last.frames) {
        last.pos = pos;
        last.atMs = at;
        last.rowFrames = this.rowFrames(pos);
        last.rowStart = this.rowStart(frames, pos, last.rowFrames);
        return;
      }
    }
    const rowFrames = this.rowFrames(pos);
    this.marks.push({
      frames,
      atMs: at,
      pos,
      rowFrames,
      rowStart: this.rowStart(frames, pos, rowFrames)
    });
    this.trim(at);
  }
  /**
   * The position audible now (or at `atMs` / at frame `atFrames` when
   * given). Returns null before the first mark — callers fall back to
   * `core.playState`, which is correct while nothing has been rendered.
   *
   * The lookup is O(log n) and allocates one small object; it is meant to
   * be called from a 60 fps render loop.
   */
  positionAt(atMs) {
    const marks = this.marks;
    const len = marks.length;
    if (len === 0) return null;
    const now = atMs ?? this.clock();
    const last = marks[len - 1];
    const first = marks[0];
    let consumed = this.consumedFrames(now, last);
    consumed -= Math.round(this.latencyMs * this.rate / 1e3);
    let target = consumed;
    if (target < first.frames) target = first.frames;
    if (target > last.frames) target = last.frames;
    let lo = 0;
    let hi = len - 1;
    while (lo < hi) {
      const mid = lo + hi >> 1;
      if (marks[mid].frames < target) lo = mid + 1;
      else hi = mid;
    }
    const m = marks[lo];
    const prev = lo > 0 ? marks[lo - 1] : null;
    let row = m.pos.row;
    let rowProgress = 1;
    let timeMs = m.pos.timeMs - (m.frames - target) / this.rate * 1e3;
    if (m.rowFrames > 0) {
      const intoRow = target - m.rowStart;
      if (intoRow > 0) {
        rowProgress = intoRow / m.rowFrames;
        if (rowProgress > 1) rowProgress = 1;
      } else {
        const back = 1 + Math.floor(-intoRow / m.rowFrames);
        row = m.pos.row - back;
        rowProgress = (back * m.rowFrames + intoRow) / m.rowFrames;
      }
      if (prev !== null && row < prev.pos.row) row = prev.pos.row;
      if (row > m.pos.row) row = m.pos.row;
      if (row < 0) row = 0;
      if (rowProgress < 0) rowProgress = 0;
    }
    return {
      ord: m.pos.ord,
      row,
      frame: m.pos.frame,
      speed: m.pos.speed,
      bpm: m.pos.bpm,
      timeMs: timeMs > 0 ? timeMs : 0,
      consumedFrames: consumed,
      rowProgress,
      queuedFrames: last.frames - consumed,
      markAgeMs: now - m.atMs
    };
  }
  consumedFrames(now, last) {
    if (this.provider !== null) {
      const v2 = this.provider();
      if (Number.isFinite(v2)) return v2;
    }
    const elapsed = (now - last.atMs) * this.rate / 1e3;
    const v = last.frames - elapsed;
    return v < 0 ? 0 : v;
  }
  /** frames per row from the core's binding time model. */
  rowFrames(pos) {
    if (!(pos.bpm > 0) || !(pos.speed > 0)) return 0;
    const ticks = this.tickFrames(pos.bpm);
    return ticks * pos.speed;
  }
  /** ticksize (samples per tick) — truncated, like libxmp's (int) cast. */
  tickFrames(bpm) {
    return Math.trunc(this.rate * 2.5 / bpm);
  }
  /** Output frame at which `pos.row` started. `pos.frame` is the index of
   *  the tick that just finished, so the row began `pos.frame + 1` ticks
   *  before the reported position. */
  rowStart(frames, pos, rowFrames) {
    if (rowFrames <= 0) return frames;
    return frames - (pos.frame + 1) * this.tickFrames(pos.bpm);
  }
  trim(now) {
    const marks = this.marks;
    while (marks.length > 4 && now - marks[0].atMs > this.historyMs) {
      marks.shift();
    }
  }
};
export {
  Playhead
};

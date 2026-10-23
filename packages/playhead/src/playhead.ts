// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Bitti09 — modplayjs contributors
// Project-original code.
// @modplayjs/playhead — playback clock for UIs.
//
// A tracker player renders AHEAD of the speaker: out-webaudio keeps a ring
// at its high-water mark (HIGH_WATER_FRAMES = 0.68 s at 48 kHz) and a
// terminal sink adds its own buffer on top. Reading `core.playState` from a
// UI therefore shows the row the renderer is working on, not the row the
// listener hears — several rows early on a fast song.
//
// This module records (rendered-frames, position) marks while the output
// pulls `core.playBuffer`, then answers "which row was audible at time T"
// by looking up the frame the SINK has consumed. Nothing here knows about
// AudioWorklet, ALSA or a pipe: the output supplies the consumption counter
// (a provider), and the UI only asks for a position.
//
// Two modes:
//   - provider mode: consumedFrames comes from the sink (exact; the ring
//     depth, the device latency and pause/resume are all already in it).
//   - fallback mode (no provider): consumed ≈ last mark − latency − elapsed,
//     for sinks that cannot report depth (a plain pipe, a file writer).

/** Row-resolution snapshot of the player at the moment of a pull. Matches
 *  the fields of `core.playState` so it can be passed straight through. */
export interface PlaybackPosition {
  /** Order index (pattern position in the sequence). */
  ord: number;
  /** Row inside the current pattern. */
  row: number;
  /** Tick inside the row (0-based). */
  frame: number;
  /** Ticks per row (effect Fxx / Axx). */
  speed: number;
  /** Beats per minute (effect Fxx). */
  bpm: number;
  /** Elapsed playback time in ms as reported by the core. */
  timeMs: number;
}

/** The position that is audible at the query time. */
export interface AudiblePosition extends PlaybackPosition {
  /** Frames actually played out at the query time. */
  consumedFrames: number;
  /** How far into the row the playhead is, 0..1 (estimated). */
  rowProgress: number;
  /** How far render is ahead of the sink, in frames (ring + device). */
  queuedFrames: number;
  /** How old (ms) the newest mark was at the query time. */
  markAgeMs: number;
}

export interface PlayheadOptions {
  /** Output rate in Hz; must match `core.setSampleRate`. Default 44100. */
  rate?: number;
  /** History retained for backward lookups, ms. Default 5000. */
  historyMs?: number;
  /** Extra offset applied on top of the sink's accounting, in ms.
   *  Positive makes the view run LATER (use when the sink's counter is
   *  known to under-report the buffered audio). Default 0. */
  latencyMs?: number;
  /** Monotonic clock in ms. Defaults to performance.now(), else Date.now(). */
  clock?: () => number;
}

interface Mark {
  /** Cumulative frames handed to the sink after this pull. */
  frames: number;
  /** Clock time at the END of this pull. */
  atMs: number;
  pos: PlaybackPosition;
  /** Output frames per row at this point (ticksize × speed). */
  rowFrames: number;
  /** Output frame where `pos.row` started (tick 0 of that row). */
  rowStart: number;
}

const FALLBACK_CLOCK = (): number => {
  // `performance` is not in the ES2022 lib (this package compiles without
  // DOM/Node types); reach it through globalThis so a browser/Node runtime
  // gets the monotonic clock and anything else falls back to wall time.
  const perf = (globalThis as { performance?: { now(): number } }).performance;
  if (perf !== undefined && typeof perf.now === 'function') return perf.now();
  return Date.now();
};

export class Playhead {
  private marks: Mark[] = [];
  private rate: number;
  private readonly historyMs: number;
  private latencyMs: number;
  private readonly clock: () => number;
  private provider: (() => number) | null = null;
  /** Frames per row is derived from the core's binding time model:
   *  ticksize = (int)(rate × 2.5 / bpm), row = ticksize × speed. */

  constructor(opts: PlayheadOptions = {}) {
    this.rate = opts.rate ?? 44100;
    this.historyMs = opts.historyMs ?? 5000;
    this.latencyMs = opts.latencyMs ?? 0;
    this.clock = opts.clock ?? FALLBACK_CLOCK;
  }

  /** Set the output rate (call after `core.setSampleRate`). Existing marks
   *  keep the row timing they were recorded with. */
  setRate(hz: number): void {
    if (hz > 0 && hz !== this.rate) this.rate = hz;
  }

  /** Extra latency in ms on top of the sink's own accounting. */
  setLatencyMs(ms: number): void {
    this.latencyMs = Number.isFinite(ms) ? ms : 0;
  }

  getLatencyMs(): number {
    return this.latencyMs;
  }

  /**
   * Install the sink's played-frames counter. The callback runs on every
   * `positionAt()`; it must be cheap (Atomic load / field read) and must
   * return the count of frames that have LEFT the sink (not the count
   * still buffered in it).
   */
  setConsumedProvider(fn: (() => number) | null): void {
    this.provider = fn;
  }

  /** Drop all history (new module, seek, transport restart). */
  reset(): void {
    this.marks.length = 0;
  }

  /** Number of recorded marks (diagnostics). */
  get markCount(): number {
    return this.marks.length;
  }

  /**
   * Record the player state reached at the end of one pull.
   * `frames` is the CUMULATIVE number of frames handed to the sink.
   * Monotonic frames are the timeline; the wall clock is only used for
   * history expiry and for the fallback mode.
   */
  mark(frames: number, pos: PlaybackPosition, atMs?: number): void {
    const at = atMs ?? this.clock();
    const last = this.marks[this.marks.length - 1];
    if (last !== undefined) {
      // A counter that went backwards means the transport restarted (a new
      // start() resets the ring / the posted-frame counter). Start a new
      // epoch instead of corrupting the lookup.
      if (frames < last.frames) this.marks.length = 0;
      else if (frames === last.frames) {
        // Same pull reported twice: keep the newer position.
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
      rowStart: this.rowStart(frames, pos, rowFrames),
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
  positionAt(atMs?: number): AudiblePosition | null {
    const marks = this.marks;
    const len = marks.length;
    if (len === 0) return null;
    const now = atMs ?? this.clock();
    const last = marks[len - 1]!;
    const first = marks[0]!;

    let consumed = this.consumedFrames(now, last);
    consumed -= Math.round((this.latencyMs * this.rate) / 1000);

    let target = consumed;
    // Clamp into the recorded window: before the first pull nothing is
    // audible yet (the sink has not been fed), after the last pull the
    // renderer has nothing newer to show.
    if (target < first.frames) target = first.frames;
    if (target > last.frames) target = last.frames;

    // First mark whose cumulative frame count reaches the target: the
    // target frame lies inside (marks[i-1].frames, marks[i].frames].
    let lo = 0;
    let hi = len - 1;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (marks[mid]!.frames < target) lo = mid + 1;
      else hi = mid;
    }
    const m = marks[lo]!;
    const prev = lo > 0 ? marks[lo - 1]! : null;

    // Resolve the row from where it STARTED, not from the pull boundary:
    // a pull spans several ticks, so the last tick's row began mid-pull
    // and the frames before that belonged to the previous row.
    let row = m.pos.row;
    let rowProgress = 1;
    let timeMs = m.pos.timeMs - ((m.frames - target) / this.rate) * 1000;
    if (m.rowFrames > 0) {
      const intoRow = target - m.rowStart;
      if (intoRow > 0) {
        // Frames have been played past the row start, so this row sounds.
        rowProgress = intoRow / m.rowFrames;
        if (rowProgress > 1) rowProgress = 1;
      } else {
        // Target is at (or before) the row start: the newest played frame
        // still belongs to the previous row. Step back whole rows at this
        // tempo/speed; a tempo or speed change inside the pull makes the
        // earlier rows a different length, so the previous mark bounds it.
        const back = 1 + Math.floor(-intoRow / m.rowFrames);
        row = m.pos.row - back;
        rowProgress = (back * m.rowFrames + intoRow) / m.rowFrames;
      }
      if (prev !== null && row < prev.pos.row) row = prev.pos.row;
      if (row > m.pos.row) row = m.pos.row;
      if (row < 0) row = 0; // crossed into the previous pattern: clamp
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
      markAgeMs: now - m.atMs,
    };
  }

  private consumedFrames(now: number, last: Mark): number {
    if (this.provider !== null) {
      const v = this.provider();
      if (Number.isFinite(v)) return v;
    }
    // Fallback: assume the sink holds `latencyMs` of audio and drains at
    // the output rate; clamp into the recorded window.
    const elapsed = ((now - last.atMs) * this.rate) / 1000;
    const v = last.frames - elapsed;
    return v < 0 ? 0 : v;
  }

  /** frames per row from the core's binding time model. */
  private rowFrames(pos: PlaybackPosition): number {
    if (!(pos.bpm > 0) || !(pos.speed > 0)) return 0;
    const ticks = this.tickFrames(pos.bpm);
    return ticks * pos.speed;
  }

  /** ticksize (samples per tick) — truncated, like libxmp's (int) cast. */
  private tickFrames(bpm: number): number {
    return Math.trunc((this.rate * 2.5) / bpm);
  }

  /** Output frame at which `pos.row` started. `pos.frame` is the index of
   *  the tick that just finished, so the row began `pos.frame + 1` ticks
   *  before the reported position. */
  private rowStart(frames: number, pos: PlaybackPosition, rowFrames: number): number {
    if (rowFrames <= 0) return frames;
    return frames - (pos.frame + 1) * this.tickFrames(pos.bpm);
  }

  private trim(now: number): void {
    const marks = this.marks;
    // Keep a short tail even when the render loop stalls, and never drop
    // below two marks (a lookup needs a bounding interval).
    while (marks.length > 4 && now - marks[0]!.atMs > this.historyMs) {
      marks.shift();
    }
  }
}

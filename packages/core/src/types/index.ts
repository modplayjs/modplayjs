// Plugin contracts (the four plugin kinds) + the Core interface.
// Mirrors libxmp `struct format_loader` (format.h:9-13) generalized into
// four kinds, with the DSP render mirroring libxmp_mixer_softmixer and the
// Paula engine's mixAudio shape.
//
// BINDING TIME MODEL (applies to every todo): 1 tick = `ticksize` samples.
// libxmp uses ONE formula for ALL FOUR formats:
//   ticksize = (int)(sampleRate × time_factor × rrate / bpm / 1000)
// — TRUNCATION, not rounding (C (int) cast) — with time_factor = 10
// (DEFAULT_TIME_FACTOR, common.h:454, set at load_helpers.c:330) and
// rrate = 250 (PAL_RATE, common.h:135, set at load_helpers.c:301).
// So in v1: ticksize = (int)(sampleRate × 2.5 / bpm) for EVERY format.
// Sanity check: 44100 Hz, bpm 125 → 882 samples/tick (20 ms).
// Source: libxmp_mixer_get_ticksize (mixer.c:426-446).

import type { CoreState, Quirks } from '../model/constants';
import type {
  CoreContext,
  ModuleData,
  SampleData,
  SampleMeta,
  Event,
  ChannelState,
  VoiceState,
  RawSample,
  PlayStateView,
} from '../model/model';
import type { VirtualLayer } from '../virtual';

// ---------------------------------------------------------------------------
// Core interface (implemented by class Core in T4)
// ---------------------------------------------------------------------------

/** Core creation config. */
export interface CoreConfig {
  /** Output sample rate (default 44100). */
  sampleRate?: number;
  /** Interpolation: 0 nearest, 1 linear (default), 2 spline. */
  interp?: number;
  /** Maximum number of channels (default 64, XMP_MAX_CHANNELS). */
  maxChannels?: number;
  /** Number of softmixer voices (default 32). */
  numVoices?: number;
}

/**
 * The core context + lifecycle. Output plugins PULL audio by calling
 * `playBuffer(out, size)`.
 */
export interface Core {
  // -- lifecycle --
  /** Load a module from raw bytes. Throws a typed error if no format
   *  plugin recognizes it. */
  loadModule(bytes: Uint8Array): void;
  /** Begin playback. Throws a typed error if no module is loaded. */
  startPlayer(): void;
  /** Stop playback. */
  stopPlayer(): void;
  /** Release all state. */
  destroy(): void;

  // -- audio rendering --
  /**
   * Render exactly ONE tick = `ticksize` samples into `out` (interleaved
   * stereo). `out` must hold at least `ticksize × 2` floats.
   * Returns the number of interleaved floats written.
   */
  frame(out: Float32Array): number;
  /**
   * Render into `out` as long as it can hold a whole tick.
   * Returns the number of interleaved floats written.
   */
  playBuffer(out: Float32Array, size: number, loop?: number): number;

  // -- sample store --
  /**
   * Hot-swap a sample's data at runtime. Active voices pick up the new
   * data on their next read (voices reference samples by ID).
   * Throws a typed error for empty/oversized arrays or unknown ids.
   */
  swapSample(id: number, data: Float32Array, meta?: SampleMeta): void;
  /** Get a sample by ID. Throws a typed error for unknown ids. */
  getSample(id: number): SampleData;

  // -- tempo / speed / rate --
  /** Set BPM (recomputes ticksize per the binding time model). */
  setTempo(bpm: number): void;
  /** Set speed (ticks per row). */
  setSpeed(speed: number): void;
  /** Set output sample rate (recomputes ticksize). */
  setSampleRate(hz: number): void;
  /** Set time factor (default 10.0). */
  setTempoFactor(f: number): void;

  // -- plugin registry --
  /** Select the active DSP by name. Only while the player is stopped. */
  setDsp(name: string): void;
  /** Get the active DSP (no arg) or a registered DSP by name. */
  dsp(name?: string): DspPlugin;
  /** Get a registered output plugin by name. */
  output(name: string): OutputPlugin;
  /** Get a registered format plugin by name. */
  format(name: string): FormatPlugin;

  // -- getters --
  /** Player state. */
  readonly state: CoreState;
  /** Loaded module (or null). */
  readonly module: ModuleData | null;
  /** Number of channels in the loaded module. */
  readonly channels: number;
  /** Playback state (row/order/tick). */
  readonly playState: PlayStateView;
  /** Per-channel state (DSP in-params / effect out-params). */
  readonly channelStates: readonly ChannelState[];
  /** Active voices (one per channel in v0.1). */
  readonly voiceStates: readonly VoiceState[];
  /** Module quirks (0 when no module). */
  readonly quirks: Quirks;
  /** Output sample rate. */
  readonly sampleRate: number;
  /** Current ticksize (samples per tick). */
  readonly ticksize: number;
  /** Internal context view (libxmp `context_data`). */
  readonly ctx: CoreContext;
  /** Virtual channel layer (libxmp virt_*). */
  readonly virt: VirtualLayer;
  /** libxmp_read_event (read_event.c:1624-1664) — process one event cell
   *  through the format reader (used for delayed events). */
  readEvent(chn: number): void;
  /** Delayed/injected event source for format readers. */
  readEventScratch(chn: number): Event | undefined;
  /** Pattern track event cell (read_row path). */
  readEventAt(patIdx: number, chn: number, row: number): Event;
}

// ---------------------------------------------------------------------------
// Format plugins
// ---------------------------------------------------------------------------

/**
 * Context handed to a format plugin's load().
 * Mirrors libxmp's `struct context_data` load surface (load.c:233-332):
 * the loader fills ModuleData and the sample store via addSample.
 */
export interface LoadCtx {
  /** Sample rate the core will render at. */
  readonly sampleRate: number;
  /** Store a raw sample in the core sample store; returns the sample id. */
  addSample(raw: RawSample): number;
  /** Output rate hint (same as sampleRate in v0.1). */
  readonly outputRate: number;
}

/**
 * A format plugin (parser + event reader). Mirrors libxmp's
 * `struct format_loader` (name/test/loader) with the event reader added
 * (libxmp dispatches on read_event_type; we call it per row).
 */
export interface FormatPlugin {
  readonly name: string;
  /** Returns true if bytes are this format (signature check). */
  test(bytes: Uint8Array): boolean;
  /** Parse the module. Throws a typed error on malformed input. */
  load(bytes: Uint8Array, ctx: LoadCtx): ModuleData;
  /**
   * Read one event cell (chn, row) and apply it to channel state.
   * This is libxmp's read_event_* (read_event.c:267/475/736/933).
   */
  readEvent(core: Core, chn: number, row: number): void;
}

// ---------------------------------------------------------------------------
// Effect plugins
// ---------------------------------------------------------------------------

/**
 * An effect plugin: row-triggered (onRow) and/or per-tick (onTick)
 * handlers. The core dispatches in registration order.
 */
export interface EffectPlugin {
  readonly name: string;
  /** Called at tick 0 for each channel with its event. */
  onRow?(core: Core, chn: number, ev: Event): void;
  /** Called for each channel on every tick. */
  onTick?(core: Core, chn: number): void;
}

// ---------------------------------------------------------------------------
// DSP plugins
// ---------------------------------------------------------------------------

/**
 * A DSP (mixer) plugin. `renderFrame` renders `ticks` TICKS, where
 * 1 tick = `ticksize` samples, filling `out` with `ticks × ticksize × 2`
 * interleaved stereo floats.
 */
export interface DspPlugin {
  readonly name: string;
  /** Number of channels this DSP mixes (Paula = 4, softmixer = module chn). */
  readonly channels: number;
  /** Render `ticks` ticks into `out` (interleaved stereo). */
  renderFrame(core: Core, out: Float32Array, ticks: number): void;
  /** Optional per-row hook: called after the format event reader for each
   * channel (implementations that need retrigger notification, e.g. the
   * paula sample-position reset). */
  onRow?(core: Core, chn: number, ev: Event): void;
  /** Reset internal state (called on start/stop). */
  reset(): void;
}

// ---------------------------------------------------------------------------
// Output plugins
// ---------------------------------------------------------------------------

/**
 * An output plugin. PULLs audio by calling ctx.playBuffer.
 */
export interface OutputPlugin {
  readonly name: string;
  /** Begin output (called after startPlayer). */
  start(core: Core): void;
  /** Stop output. */
  stop(): void;
}
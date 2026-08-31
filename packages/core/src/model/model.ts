// Core data-model types: the normalized module data produced by format
// plugins (mirrors struct xmp_module / module_data) plus the per-playback
// runtime state (mirrors player_data / channel_data / mixer_voice).
//
// Types only — no logic.

import type { CoreState, Quirks, ReadEventType, PeriodType, FlowMode, Interp } from './constants';

export { NoteFlag } from './constants';
// ---------------------------------------------------------------------------
// Module data (parsed, static)
// ---------------------------------------------------------------------------

/**
 * Sample metadata for runtime hot-swap (subset of SampleData fields).
 */
export interface SampleMeta {
  length?: number;
  loopStart?: number;
  loopEnd?: number;
  sustainStart?: number;
  sustainEnd?: number;
  finetune?: number;
  volume?: number;
  flags?: number;
}

/** Read-only playback position view (ord/row/frame/speed/bpm/time). */
export interface PlayStateView {
  ord: number;
  row: number;
  frame: number;
  speed: number;
  bpm: number;
  /** Elapsed playback time in ms. */
  timeMs: number;
}

/**
 * Sample flags, mirroring XMP_SAMPLE_* in xmp.h:220-231.
 * The plan's T3 naming: NONE/LOOP/BIDIR/SUSTAIN map onto libxmp's bits
 * (LOOP, LOOP_BIDIR, SLOOP); LOOP_FULL and STEREO are kept too since the
 * loaders carry them into parsed samples.
 */
export const SampleFlags = {
  /** 16-bit sample data. */
  BITS16: 1 << 0,
  /** Forward loop (loopStart/loopEnd). */
  LOOP: 1 << 1,
  /** Bidirectional (ping-pong) loop. */
  BIDIR: 1 << 2,
  /** Backwards sample loop. */
  LOOP_REVERSE: 1 << 3,
  /** Play full sample before looping. */
  LOOP_FULL: 1 << 4,
  /** IT sustain loop (sustainStart/sustainEnd). */
  SUSTAIN: 1 << 5,
  /** IT bidirectional sustain loop. */
  SUSTAIN_BIDIR: 1 << 6,
  /** Interlaced stereo sample (data = L R L R). */
  STEREO: 1 << 7,
} as const;
export type SampleFlags = number;

/**
 * A sample's parsed data, normalized to Float32 by the core sample store.
 * Mirrors struct xmp_sample (xmp.h:233-244).
 */
export interface SampleData {
  /** Stable sample id (index into ModuleData.samples); voices reference by ID. */
  id: number;
  /** Decoded mono float samples, normalized to [-1, 1]. */
  data: Float32Array;
  length: number;
  /** Loop start (samples). 0 if not looping. */
  loopStart: number;
  /** Loop end (samples, exclusive in libxmp semantics). */
  loopEnd: number;
  /** IT sustain loop start. */
  sustainStart: number;
  /** IT sustain loop end. */
  sustainEnd: number;
  /** Sample finetune (MOD-style 0-15, or IT 0-31 / S3M -64..63 raw value). */
  finetune: number;
  /** Sample volume (MOD-style 0-64 / S3M 0-64 / IT gvl). */
  volume: number;
  /** SampleFlags bitmask. */
  flags: SampleFlags;
  /** C-5 playback rate in Hz (xmp_sample.xtra c5spd; mixer.c:406-422). */
  c5spd?: number;
}

/** Raw sample bytes handed from a format plugin to the core sample store. */
export interface RawSample {
  /** Mono byte data (stereo already downmixed by the loader, or STEREO flag set). */
  data: Uint8Array;
  /** Length in samples (for STEREO, frames per channel). */
  length: number;
  loopStart: number;
  loopEnd: number;
  sustainStart: number;
  sustainEnd: number;
  finetune: number;
  volume: number;
  flags: SampleFlags;
  /** C-5 playback rate in Hz (init_instrument c5spd = m->c4rate, common.c:36-66). */
  c5spd?: number;
}

/**
 * Envelope, mirroring struct xmp_envelope (xmp.h:168-186).
 * Positions are 0-63 (x) and 0-127 (y).
 */
export interface Envelope {
  /** Bitmask: XMP_ENVELOPE_ON/SUS/LOOP/FLT/SLOOP/CARRY. */
  flags: number;
  /** Number of points (0-32). */
  npt: number;
  /** Envelope scaling: 0 = 64x, 1 = 32x (XMP_ENV scale). */
  scl: number;
  /** Sustain start point (y, 0-127). */
  sus: number;
  /** Sustain end point (y, 0-127). */
  sue: number;
  /** Loop start point (y, 0-127). */
  lps: number;
  /** Loop end point (y, 0-127). */
  lpe: number;
  /** Point x,y pairs, npt entries. */
  x: number[];
  y: number[];
}

export const EnvelopeFlags = {
  ON: 1 << 0,
  SUS: 1 << 1,
  LOOP: 1 << 2,
  FLT: 1 << 3,
  SLOOP: 1 << 4,
  CARRY: 1 << 5,
} as const;

/**
 * One instrument, mirroring struct xmp_instrument (xmp.h:204-219) plus the
 * per-key map and sub-instrument table flattened for the big-four formats.
 */
export interface Instrument {
  name: string;
  /** Instrument volume (0-64 basevol for MOD/XM; 0-127 S3M/IT style is normalized at load). */
  volume: number;
  /** Number of samples mapped into this instrument. */
  nsm: number;
  /** Release (fadeout) value in ms (S3M/IT). */
  rls: number;
  /** Key map: 121 entries, key → sample index within the instrument. */
  map: number[];
  /** Per-key transposition (xmp_map.xpo), defaults 0. Used by IT/MED. */
  mapXpo: number[];
  /** Sub-instrument per key (121 entries), mirroring xmp_subinstrument fields used by the big four. */
  sub: SubInstrument[];
  /** Amplitude (volume) envelope. */
  aei: Envelope;
  /** Frequency (pitch) envelope. */
  fei: Envelope;
  /** Pan envelope (S3M/IT; unused by XM/MOD). */
  pei: Envelope;
}

/** Flattened xmp_subinstrument fields (xmp.h:188-202) for the big four. */
export interface SubInstrument {
  vol: number;
  gvl: number;
  /** XMP_INST_NO_DEFAULT_PAN = -1. */
  pan: number;
  xpo: number;
  fin: number;
  /** Vibrato waveform (EX_* codes). */
  vwf: number;
  vde: number;
  vra: number;
  vsw: number;
  /** Sample number (index into ModuleData.samples). */
  sid: number;
  /** New note action (XMP_INST_NNA_*). */
  nna: Nna;
  /** Duplicate check type (XMP_INST_DCT_*). */
  dct: Dct;
  /** Duplicate check action (XMP_INST_DCA_*). */
  dca: Nna;
  /** IT initial filter cutoff/resonance. */
  ifc: number;
  ifr: number;
  /** IT random volume/pan variation: low byte = volume swing 0..100,
   *  high byte = pan swing 0..64 (struct xmp_subinstrument rvv, it.h). */
  rvv: number;
}

/** New note action, mirroring XMP_INST_NNA_* in xmp.h:195-198. */
export const Nna = {
  CUT: 0x00,
  CONT: 0x01,
  OFF: 0x02,
  FADE: 0x03,
} as const;
export type Nna = (typeof Nna)[keyof typeof Nna];

/** Duplicate check type, mirroring XMP_INST_DCT_* in xmp.h:200-203. */
export const Dct = {
  OFF: 0x00,
  NOTE: 0x01,
  SMP: 0x02,
  INST: 0x03,
} as const;
export type Dct = (typeof Dct)[keyof typeof Dct];

/** Channel definition, mirroring struct xmp_channel (xmp.h:148-157). */
export interface Channel {
  /** Pan, 0x00 (full left) .. 0xff (full right), 0x80 center. */
  pan: number;
  /** Channel volume. */
  vol: number;
  /** XMP_CHANNEL_* flag bitmask. */
  flg: number;
}

export const ChannelFlags = {
  SYNTH: 1 << 0,
  MUTE: 1 << 1,
  SPLIT: 1 << 2,
  SURROUND: 1 << 4,
} as const;

/**
 * One event cell, mirroring struct xmp_event (xmp.h:165-174).
 * Two effect slots: fxt/fxp and f2t/f2p (XM stores its secondary volume
 * slide in f2t — xm_load.c:238-242).
 */
export interface Event {
  /** Note number, 0 = no note; XMP_KEY_OFF/CUT/FADE markers allowed. */
  note: number;
  /** Patch number, 0 = no change. */
  ins: number;
  /** Volume, 0 = no change, 1..basevol. */
  vol: number;
  /** Effect type. */
  fxt: number;
  /** Effect parameter. */
  fxp: number;
  /** Secondary effect type. */
  f2t: number;
  /** Secondary effect parameter. */
  f2p: number;
}

/** Empty event (all fields zero). */
export const EMPTY_EVENT: Event = Object.freeze({
  note: 0,
  ins: 0,
  vol: 0,
  fxt: 0,
  fxp: 0,
  f2t: 0,
  f2p: 0,
});

/**
 * A track (one channel's column of a pattern).
 * Mirrors struct xmp_track (xmp.h:176-179).
 */
export interface Track {
  rows: number;
  event: Event[];
}

/**
 * A pattern. Rows are stored as tracks (one per channel), matching how
 * libxmp normalizes every format.
 * Mirrors struct xmp_pattern (xmp.h:172-175).
 */
export interface Pattern {
  rows: number;
  tracks: Track[];
}

/**
 * Sequence (order) data, mirroring struct ord_data (common.h:476-484) plus
 * the sequence entry/duration from xmp_sequence (xmp.h:246-249).
 */
export interface Sequence {
  /** Order index. */
  ord: number;
  entry_point: number;
  duration: number;
  /** Replay time (ms) at start of this order. */
  time: number;
  speed: number;
  bpm: number;
  /** Global volume override for this order (-1 = none). */
  gvl: number;
  start_row: number;
}

/**
 * IT MIDI macro configuration (struct midi_macro_info via
 * load_it_midi_config, it_load.c:640-684): 16 parameter macros + 128
 * fixed macros, each a NUL-terminated 32-byte string.
 */
export interface MidiConfig {
  /** 16 parameter macros (Z0..ZF). */
  param: Uint8Array[];
  /** 128 fixed macros (F0F0z selection via Z value >= 0x80). */
  fixed: Uint8Array[];
}

/**
 * The normalized module, mirroring struct xmp_module (xmp.h:251-283) +
 * module_data (common.h:514-556).
 */
export interface ModuleData {
  title: string;
  format: 'mod' | 's3m' | 'xm' | 'it';
  /** Comment (S3M/IT). */
  comment: string;
  /** Number of channels. */
  chn: number;
  /** Number of patterns. */
  pat: number;
  /** Number of instruments. */
  ins: number;
  /** Song length (orders). */
  len: number;
  /** Restart position. */
  restart: number;
  /** Pattern order table (len entries). */
  xxo: number[];
  /** Channel definitions. */
  channels: Channel[];
  /** Patterns: one per pattern, each with per-channel tracks. */
  patterns: Pattern[];
  /** Instruments (1-indexed access: instruments[0] is instrument #1). */
  instruments: Instrument[];
  /** Samples. */
  samples: RawSample[];
  /** Number of sequences (1 = single song). */
  num_sequences: number;
  /** Sequences. */
  sequences: Sequence[];
  /** Speed (rows/tick; ticks per row). */
  speed: number;
  /** BPM (raw tempo; 125 = normal). */
  bpm: number;
  /** Volume base (64 for MOD/XM, 128 for S3M/IT — the loader normalizes). */
  volbase: number;
  /** Global volume base (128). */
  gvolbase: number;
  /** Global volume at load. */
  gvol: number;
  /** Player quirks bitmask (Quirk). */
  quirks: Quirks;
  /** Flow mode (FlowFlag bits). */
  flowMode: FlowMode;
  /** Event reader to use (ReadEventType). */
  readEventType: ReadEventType;
  /** Period semantics (PeriodType). */
  periodType: PeriodType;
  /** Default pan setting (0x80 center). */
  defpan: number;
  /** Time factor (10.0 = DEFAULT_TIME_FACTOR). */
  time_factor: number;
  /** Replay rate (250 = PAL_RATE). */
  rrate: number;
  /** C4 replay rate (e.g. 8287 for MODRNG PAL). */
  c4rate: number;
  /** compare_vblank (mod_load.c VBlank timing detection, non-CORE_PLAYER). */
  compare_vblank?: boolean;
  /** IT master volume (it_load.c:1528-1530, m->mvol = ifh.mv) and its
   *  base (48). MPT-116 preamp transforms mvol. 0/undefined = no scaling. */
  mvol?: number;
  mvolbase?: number;
  /** IT MIDI macro configuration (load_it_midi_config, it_load.c:640-684). */
  midi?: MidiConfig;
  /** Tracker version string (XM) / tracker id (other formats). */
  tracker: string;
}

// ---------------------------------------------------------------------------
// Runtime state (per-playback)
// ---------------------------------------------------------------------------

/**
 * LFO state, mirroring struct lfo (lfo.h:7-12) plus the waveform type.
 */
export interface LfoState {
  /** Waveform: 0=linear, 1=ballistic, 2=random, 3=irregular (EX_* codes). */
  type: number;
  rate: number;
  depth: number;
  phase: number;
}

/** Retrigger state, mirroring channel_data.retrig. */
export interface RetriggerState {
  val: number;
  count: number;
  type: number;
  limit: number;
}

/** Tremor state, mirroring channel_data.tremor. */
export interface TremorState {
  up: number;
  down: number;
  count: number;
  memory: number;
}

/**
 * Per-channel effect state + final out-params.
 * Mirrors struct channel_data (player.h:89-280), reduced to the fields the
 * big-four core player (v0.1: MOD/S3M/XM/IT) uses.
 */
export interface ChannelState {
  /** Channel flags (XMP_CHANNEL_* + runtime bits). */
  flags: number;
  /** Persistent-effect flags (PTM only; kept for parity). */
  per_flags: number;
  /** Note release/fade/end flags (NOTE_*). */
  note_flags: number;
  /** Current note number. */
  note: number;
  /** Key number (0-119). */
  key: number;
  /** Current period (Amiga or linear, per module periodType). */
  period: number;
  /** Amiga/MODRNG period with finetune applied — what the mixer reads. */
  finalPeriod: number;
  /** Instrument number (-1 = none). */
  ins: number;
  old_ins: number;
  /** Sample number (-1 = none). */
  smp: number;
  /** Master (track) volume (IT). */
  mastervol: number;
  /** Note delay in frames (EX_DELAY). */
  delay: number;
  /** Key off counter. */
  keyoff: number;
  /** Current fadeout (release) value. */
  fadeout: number;
  /** Instrument fadeout value. */
  ins_fade: number;
  /** Current volume (0..volbase). */
  volume: number;
  /** Instrument global volume (IT). */
  gvl: number;
  /** Random volume variation. */
  rvv: number;
  /** Random pan variation. */
  rpv: number;
  /** Split channel (Amiga). */
  split: number;
  /** Split channel pair. */
  pair: number;

  // Envelope positions
  /** Volume envelope index (0..63). */
  v_idx: number;
  /** Pan envelope index. */
  p_idx: number;
  /** Frequency envelope index. */
  f_idx: number;

  /** Key for portamento target (IT xpo handling). */
  key_porta: number;
  /** Channel finetune (EX_FINETUNE / FX_FINETUNE), int8 range <<4. */
  finetune: number;
  /** MED period/pitch adjustment factor hack (player.h:96). */
  per_adj: number;

  // LFOs + memories
  vibrato: { lfo: LfoState; memory: number };
  tremolo: { lfo: LfoState; memory: number };
  panbrello: { lfo: LfoState; memory: number };
  arpeggio: { val: number[]; size: number; count: number; memory: number };
  insvib: { lfo: LfoState; sweep: number };
  offset: { val: number; val2: number; memory: number };
  retrig: RetriggerState;
  tremor: TremorState;

  // Slides
  vol: {
    slide: number;
    fslide: number;
    slide2: number;
    memory: number;
    fslide2: number;
    memory2: number;
  };
  fine_vol: { up_memory: number; down_memory: number };
  gvol: { slide: number; fslide: number; memory: number };
  trackvol: { slide: number; fslide: number; memory: number };
  freq: {
    slide: number;
    fslide: number;
    memory: number;
    down_memory: number;
  };
  porta: {
    target: number;
    dir: number;
    slide: number;
    memory: number;
    note_memory: number;
  };
  fine_porta: { up_memory: number; down_memory: number; xf_up_memory: number; xf_down_memory: number };
  pan: {
    val: number;
    slide: number;
    fslide: number;
    memory: number;
    surround: number;
  };
  invloop: { speed: number; count: number; pos: number };

  /** IT tempo slide. */
  tempo_slide: number;
  /** IT filter state. */
  filter: { cutoff: number; resonance: number; envelope: number; can_disable: number };

  /** IT midi macro state (channel_data.macro, LIBXMP_CORE_PLAYER off). */
  macro: {
    /** Current macro effect (use float for slides). */
    val: number;
    /** Current macro target (smooth macro). */
    target: number;
    /** Current macro slide (smooth macro). */
    slide: number;
    /** Current active parameterized macro. */
    active: number;
    /** Previous tick calculated volume (0-0x400). */
    finalvol: number;
    /** Previous tick note panning (0x80 center). */
    notepan: number;
  };

  /** Note slide (libxmp channel_data.noteslide). */
  noteslide: { slide: number; fslide: number; count: number; speed: number };
  /** Delayed event (EX_DELAY). */
  delayed_event: Event;
  /** Delayed instrument. */
  delayed_ins: number;
  /** Previous key (XM). */
  key_memory: number;

  // --- Per-tick out-params consumed by the DSP (channel_data.info_*) ---
  /** Period for this tick (Amiga period or linear frequency). */
  info_period: number;
  /** Linear pitchbend. */
  info_pitchbend: number;
  /** Sample position before mixing. */
  info_position: number;
  /** Final volume including envelopes (0..volbase). */
  info_finalvol: number;
  /** Final pan including envelopes (0x00..0xff, 0x80 center). */
  info_finalpan: number;
  /** Final pan with IT notepan applied. */
  info_notepan: number;
}

/**
 * Per-tick voice state, mirroring struct mixer_voice (mixer.h:19-70).
 * v0.1 (1 voice per channel): the core keeps one active voice per channel.
 */
export interface VoiceState {
  /** Channel this voice belongs to. */
  chn: number;
  /** Root channel this voice was allocated from (mixer_voice.root,
   * virtual.c:271 — the CHANNEL, used by virt_getroot for channel vol). */
  root: number;
  /** NNA action tag of the note that started this voice
   * (mixer_voice.act, virtual.c:543 — 0 CUT, 1 CONT, 2 OFF, 3 FADE;
   * nonzero = the voice keeps sounding after its channel is reused). */
  nnaAct: number;
  /** Note number. */
  note: number;
  /** Pan (0x00..0xff; PAN_SURROUND 0x8000 flag). */
  pan: number;
  /** Volume (0..volbase). */
  vol: number;
  /** Current period (float). */
  period: number;
  /** Position in sample (integer, 16.16 fixed-point: integer part). */
  pos: number;
  /** Fractional position accumulator (0..0xFFFF, C mixer_voice.frac). */
  frac: number;
  /** Position before this tick's mixing. */
  pos0: number;
  /** Mixer function index (kernel + stereo flags). */
  fidx: number;
  /** Instrument number. */
  ins: number;
  /** Sample number (references the core sample store by ID). */
  smp: number;
  /** Loop start. */
  start: number;
  /** Loop end. */
  end: number;
  /** NNA info & voice status (ACT_*). */
  act: number;
  /** Key for DCA note check. */
  key: number;
  /** Previous volume, left channel. */
  old_vl: number;
  /** Previous volume, right channel. */
  old_vr: number;
  /** Last left sample output (32-bit scaled). */
  sleft: number;
  /** Last right sample output (32-bit scaled). */
  sright: number;
  /** Voice flags (VoiceFlag bits). */
  flags: number;

  /** Queued sample for Protracker-style swap (mixer_voice.queued,
   * mixer.c:909-919). smp=-1 = "stop after current loop" request. */
  queued: { smp: number };

  /** IT filter biquad state (kept for v0.2 IT). */
  filter: {
    r1: number;
    r2: number;
    l1: number;
    l2: number;
    a0: number;
    b0: number;
    b1: number;
    cutoff: number;
    resonance: number;
  };
}

/** Voice status bits (ACT_*), mirroring virtual.c voice act codes. */
export const Act = {
  NONE: 0,
  NOTE: 1,
  KEY: 2,
  VOL: 4,
  PAN: 8,
  PER: 16,
} as const;

/** Voice flag bits, mirroring mixer_voice flags (mixer.h:38-45). */
export const VoiceFlag = {
  RELEASE: 1 << 0,
  ANTICLICK: 1 << 1,
  SAMPLE_LOOP: 1 << 2,
  VOICE_REVERSE: 1 << 3,
  VOICE_BIDIR: 1 << 4,
  SAMPLE_QUEUED: 1 << 5,
  SAMPLE_PAUSED: 1 << 6,
} as const;

/** Invalid voice/channel index. */
export const INVALID = 0xffff;

/**
 * Flow control state, mirroring struct flow_control (common.h:560-595).
 */
export interface FlowState {
  /** Pattern break pending. */
  pbreak: number;
  /** Jump destination order (-1 = none). */
  jump: number;
  /** Pattern delay in rows. */
  delay: number;
  /** Jump line (Archimedes). */
  jumpline: number;
  /** Pattern loop destination, -1 = none. */
  loop_dest: number;
  /** Last loop param. */
  loop_param: number;
  /** Global loop target for S3M et al. */
  loop_start: number;
  /** Global loop count. */
  loop_count: number;
  /** Number of active loops (for scan). */
  loop_active_num: number;
  /** Per-channel pattern loop state (start/count). */
  loop: { start: number; count: number }[];
  /** Number of rows in current pattern. */
  num_rows: number;
  /** End point of current sequence. */
  end_point: number;
  /** ROWDELAY bits (ROWDELAY_ON / ROWDELAY_FIRST_FRAME). */
  rowdelay: number;
  rowdelay_set: number;
  /** Force reposition flag. */
  force_reposition: number;
}

export const RowDelay = {
  ON: 1 << 0,
  FIRST_FRAME: 1 << 1,
} as const;

/**
 * Playback state (the "p" of libxmp), mirroring struct player_data
 * (common.h:597-652) reduced to the big-four core player fields.
 */
export interface PlayState {
  /** Current order. */
  ord: number;
  /** Target order (for reposition; -1 = restart, -2 = stop). */
  pos: number;
  /** Current row. */
  row: number;
  /** Current tick (frame within row). */
  frame: number;
  /** Speed (ticks per row). */
  speed: number;
  /** BPM. */
  bpm: number;
  /** Current sequence. */
  sequence: number;
  /** Loop count. */
  loop_count: number;
  /** Sequence control (one byte per order; -1 = none). */
  sequence_control: number[];
  /** Global volume. */
  gvol: number;
  /** Master volume (128). */
  master_vol: number;
  /** Smix volume for channels >= mod.chn (smix.c; 100 = default). */
  smix_vol: number;
  /** Per-channel volume overrides (0 = default). */
  channel_vol: number[];
  /** Per-channel mute flags. */
  channel_mute: boolean[];
  /** User-injected events (per channel; _flag > 0 = pending). */
  inject_event: Event[];
  /** Flow control. */
  flow: FlowState;
  /** Current time in ms. */
  current_time: number;
  /** Filter (Amiga LED). */
  filter: number;
  /** Player flags (XMP_FLAGS_*, e.g. VBLANK, FX9BUG). */
  flags: number;
}

/** XMP_FLAGS player option bits (include/xmp.h:100-107). */
export const PlayerFlag = {
  VBLANK: 1 << 0,
  FIXVOL: 1 << 2,
  FX9BUG: 1 << 4,
  A500: 1 << 6,
  A500FILTER: 1 << 7,
} as const;

/**
 * Mixer state, mirroring struct mixer_data (common.h:654-672) reduced.
 */
export interface MixerState {
  /** Output sample rate. */
  freq: number;
  /** Output format (XMP_FORMAT_*). */
  format: number;
  /** Interpolation. */
  interp: Interp;
  /** Amplification multiplier (default 1.0). */
  amplify: number;
  /** Percentage of channel separation (default 50). */
  mix: number;
  /** Number of softmixer voices. */
  numvoc: number;
  /** Samples per tick (1 tick = ticksize samples). */
  ticksize: number;
  /** Anticlick control, right channel. */
  dtright: number;
  /** Anticlick control, left channel. */
  dtleft: number;
  /** Bidirectional loop adjustment (IT). */
  bidir_adjust: number;
}

/**
 * The whole core context state, exposed to plugins.
 */
export interface CoreContext {
  /** Player state (libxmp "p"). */
  readonly p: PlayState;
  /** Mixer state (libxmp "s"). */
  readonly s: MixerState;
  /** Module data (libxmp "m"). */
  readonly m: ModuleData;
  /** Per-channel state. */
  readonly channelStates: readonly ChannelState[];
  /** Active voices (one per channel in v0.1). */
  readonly voiceStates: readonly VoiceState[];
  /** Player state enum (State). */
  readonly state: CoreState;
  /** Quirks of the loaded module. */
  readonly quirks: Quirks;
}

// ---------------------------------------------------------------------------
// Period tables (constants)
// ---------------------------------------------------------------------------

/** Amiga period table: note 1 (C-1) = 1712 .. note 113 (B-12) = 21. */
export const AMIGA_PERIODS: readonly number[] = [
  1712, 1663, 1619, 1538, 1481, 1437, 1390, 1328, 1286, 1244, 1193, 1141,
  856, 831, 809, 769, 740, 718, 695, 664, 643, 622, 596, 570,
  428, 415, 404, 384, 370, 359, 347, 332, 321, 311, 298, 285,
  214, 207, 202, 192, 185, 179, 173, 166, 160, 155, 149, 143,
  107, 103, 101, 96, 92, 89, 87, 83, 80, 78, 75, 71,
  53, 52, 50, 48, 46, 45, 43, 42, 40, 39, 37, 36,
  27, 26, 25, 24, 23, 22, 22, 21, 20, 20, 19, 18,
  14, 13, 13, 12, 12, 11, 11, 10, 10, 10, 9, 9,
  7, 7, 6, 6, 6, 6, 5, 5, 5, 5, 5, 4,
  4, 4, 4, 4, 3, 3, 3, 3, 3, 3, 3, 2,
  2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1, 1,
  1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1,
];

/**
 * MODRNG period table (Amiga period range with 12-note octaves from
 * the standard ProTracker table), mirroring libxmp period.c MODRNG.
 */
export const MODRNG_PERIODS: readonly number[] = [
  1712, 1663, 1619, 1538, 1481, 1437, 1390, 1328, 1286, 1244, 1193, 1141,
  1071, 1035, 1005, 953, 918, 891, 863, 821, 791, 764, 732, 700,
  664, 643, 622, 596, 571, 551, 535, 509, 490, 474, 453, 436,
  428, 415, 404, 384, 370, 359, 347, 332, 321, 311, 298, 285,
  269, 260, 252, 239, 231, 224, 217, 207, 201, 195, 186, 180,
  179, 173, 166, 159, 153, 148, 144, 138, 134, 131, 125, 121,
  115, 112, 109, 103, 100, 97, 94, 91, 88, 85, 82, 79,
  75, 73, 70, 67, 65, 63, 61, 59, 57, 55, 53, 51,
];

/** C4 period constant (mixer.h:6). */
export const C4_PERIOD = 428.0;

/**
 * Note number to note name helper table is intentionally NOT included:
 * note numbers are 1-based (1 = C-1) throughout, matching the references.
 */
export const XMP_KEY_OFF = 0x81;
export const XMP_KEY_CUT = 0x82;
export const XMP_KEY_FADE = 0x83;
export const XMP_KEY_CUT_FADE = 0x84;
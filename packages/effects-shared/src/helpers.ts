// Effect helpers shared by all format event readers and the per-tick stage.
// Direct port of reference/libxmp/src/lfo.c (LFO) and parts of
// player.c/effects.c that operate on ChannelState between rows/ticks.

import type { Core } from '@modplayjs/core';
import { Quirk, PeriodType } from '@modplayjs/core';
import type { ChannelState } from '@modplayjs/core';

/** WAVEFORM_SIZE (lfo.c:26). */
export const WAVEFORM_SIZE = 64;

/** sine_wave table (lfo.c:28-34). */
export const SINE_WAVE: readonly number[] = [
  0, 24, 49, 74, 97, 120, 141, 161, 180, 197, 212, 224,
  235, 244, 250, 253, 255, 253, 250, 244, 235, 224, 212, 197,
  180, 161, 141, 120, 97, 74, 49, 24, 0, -24, -49, -74,
  -97, -120, -141, -161, -180, -197, -212, -224, -235, -244, -250, -253,
  -255, -253, -250, -244, -235, -224, -212, -197, -180, -161, -141, -120,
  -97, -74, -49, -24,
];

// -- MSN/LSN/flag macros (common.h:146-150, player.h:10-24) -------------------

export const MSN = (x: number): number => (x & 0xf0) >> 4;
export const LSN = (x: number): number => x & 0x0f;

/** SET(f): set a persistent-effect flag on xc->flags. */
export const SET = (xc: ChannelState, f: number): void => {
  xc.flags |= f;
};
export const RESET = (xc: ChannelState, f: number): void => {
  xc.flags &= ~f;
};
export const TEST = (xc: ChannelState, f: number): number =>
  (xc.flags & f) !== 0 ? 1 : 0;

export const SET_PER = (xc: ChannelState, f: number): void => {
  xc.per_flags |= f;
};
export const RESET_PER = (xc: ChannelState, f: number): void => {
  xc.per_flags &= ~f;
};
export const TEST_PER = (xc: ChannelState, f: number): number =>
  (xc.per_flags & f) !== 0 ? 1 : 0;

export const SET_NOTE = (xc: ChannelState, f: number): void => {
  xc.note_flags |= f;
};
export const RESET_NOTE = (xc: ChannelState, f: number): void => {
  xc.note_flags &= ~f;
};
export const TEST_NOTE = (xc: ChannelState, f: number): number =>
  (xc.note_flags & f) !== 0 ? 1 : 0;

// Persistent effect flags (player.h:38-65).
export const VOL_SLIDE = 1 << 0;
export const PAN_SLIDE = 1 << 1;
export const TONEPORTA = 1 << 2;
export const PITCHBEND = 1 << 3;
export const VIBRATO = 1 << 4;
export const TREMOLO = 1 << 5;
export const FINE_VOLS = 1 << 6;
export const FINE_BEND = 1 << 7;
export const OFFSET_FLAG = 1 << 8;
export const TRK_VSLIDE = 1 << 9;
export const TRK_FVSLIDE = 1 << 10;
export const NEW_INS = 1 << 11;
export const NEW_VOL = 1 << 12;
export const VOL_SLIDE_2 = 1 << 13;
export const NOTE_SLIDE = 1 << 14;
export const FINE_NSLIDE = 1 << 15;
export const NEW_NOTE = 1 << 16;
export const FINE_TPORTA = 1 << 17;
export const RETRIG = 1 << 18;
export const PANBRELLO = 1 << 19;
export const GVOL_SLIDE = 1 << 20;
export const TEMPO_SLIDE = 1 << 21;
export const VENV_PAUSE = 1 << 22;
export const PENV_PAUSE = 1 << 23;
export const FENV_PAUSE = 1 << 24;
export const FINE_VOLS_2 = 1 << 25;
export const KEY_OFF_FLAG = 1 << 26; /* for IT release on envloop end */
export const TREMOR_FLAG = 1 << 27; /* for XM tremor */
export const MIDI_MACRO = 1 << 28;

// Note flags (player.h:59-70).
export const NOTE_FADEOUT = 1 << 0;
export const NOTE_ENV_RELEASE = 1 << 1;
export const NOTE_END = 1 << 2;
export const NOTE_CUT = 1 << 3;
export const NOTE_ENV_END = 1 << 4;
export const NOTE_SAMPLE_END = 1 << 5;
export const NOTE_SET = 1 << 6;
export const NOTE_SUSEXIT = 1 << 7;
export const NOTE_KEY_CUT = 1 << 8;
export const NOTE_GLISSANDO = 1 << 9;
export const NOTE_SAMPLE_RELEASE = 1 << 10;
export const NOTE_RELEASE = NOTE_ENV_RELEASE | NOTE_SAMPLE_RELEASE;

// Quirks ---------------------------------------------------------------

export { Quirk };

/** HAS_QUIRK(QUIRK_X). */
export const hasQuirk = (core: Core, flag: number): boolean =>
  (core.quirks & flag) !== 0;

/**
 * EFFECT_MEMORY(p, m) (effects.c:48-55); ST3BUGS redirects memory to
 * xc->vol.memory.
 */
export function effectMemory(
  core: Core,
  p: number,
  m: { get(): number; set(v: number): void },
  st3Fallback: () => number,
  st3Assign: (v: number) => void,
): number {
  let val = p;
  if (hasQuirk(core, Quirk.ST3BUGS)) {
    if (val === 0) {
      val = st3Fallback();
    } else {
      st3Assign(val);
    }
  } else {
    if (val === 0) {
      val = m.get();
    } else {
      m.set(val);
    }
  }
  return val;
}

/** EFFECT_MEMORY_GET (effects.c:57-64). */
export function effectMemoryGet(
  core: Core,
  p: number,
  mem: number,
  volMemory: number,
): number {
  return hasQuirk(core, Quirk.ST3BUGS) ? volMemory : p === 0 ? mem : p;
}

/** EFFECT_MEMORY_SETONLY (effects.c:66-73). */
export function effectMemorySetOnly(
  core: Core,
  p: number,
  memRef: { get(): number; set(v: number): void },
  volMemoryRef: { get(): number; set(v: number): void },
): number {
  let val = p;
  if (val === 0) {
    val = memRef.get();
  } else {
    memRef.set(val);
  }
  if (hasQuirk(core, Quirk.ST3BUGS)) {
    if (val !== 0) volMemoryRef.set(val);
  }
  return val;
}

/** EFFECT_MEMORY_S3M (effects.c:75-79): only under ST3BUGS. */
export function effectMemoryS3m(
  core: Core,
  p: number,
  volMemory: { get(): number; set(v: number): void },
): number {
  let val = p;
  if (hasQuirk(core, Quirk.ST3BUGS)) {
    if (val === 0) {
      val = volMemory.get();
    } else {
      volMemory.set(val);
    }
  }
  return val;
}

// Period conversion (period.c) -------------------------------------------

/** PERIOD_BASE (period.h:6), C0 period. */
export const PERIOD_BASE = 13696.0;
export const MIN_PERIOD_L = 0x0000;
export const MAX_PERIOD_L = 0x1e00;
export const MIN_NOTE_MOD = 48;
export const MAX_NOTE_MOD = 83;

const M_LN2 = Math.LN2;

function libxmpRound(val: number): number {
  return val >= 0 ? Math.floor(val + 0.5) : Math.ceil(val - 0.5);
}

/**
 * libxmp_note_to_period (period.c:167-196).
 * `periodType`: module period_type; `adj` = xc->per_adj.
 */
export function noteToPeriod(
  periodType: number,
  n: number,
  f: number,
  adj: number,
): number {
  const d = n + f / 128;

  switch (periodType) {
    case PeriodType.LINEAR:
      return (240.0 - d) * 16; /* Linear */
    case PeriodType.CSPD:
      return (8363.0 * Math.pow(2, n / 12.0)) / 32 + f; /* Hz */
    default:
      // Amiga
      return PERIOD_BASE / Math.pow(2, d / 12) * (adj > 0.1 ? adj : 1);
  }
}

/**
 * libxmp_period_to_bend (period.c:222+). Used by linear-period formats to
 * convert amiga period + finetune into mixer pitchbend (linear case).
 */
export function periodToBend(
  periodType: number,
  p: number,
  n: number,
  adj: number,
): number {
  if (n === 0 || p < 0.1) {
    return 0;
  }

  switch (periodType) {
    case PeriodType.LINEAR:
      return 100 * (8 * ((240 - n) * 16 - p));
    case PeriodType.CSPD: {
      const d = noteToPeriod(periodType, n, 0, adj);
      return libxmpRound((100.0 * (1536.0 / M_LN2)) * Math.log(p / d));
    }
    default: {
      /* Amiga */
      const d = noteToPeriod(periodType, n, 0, adj);
      return libxmpRound((100.0 * (1536.0 / M_LN2)) * Math.log(d / p));
    }
  }
}

// LFO (lfo.c) --------------------------------------------------------------

/** lfo struct (lfo.h). */
export interface Lfo {
  lfo: { type: number; rate: number; depth: number; phase: number };
}

/** get_lfo_mod (lfo.c:39-67). Needs RNG access for random waveform. */
function getLfoMod(lfo: { type: number; rate: number; depth: number; phase: number }): number {
  if (lfo.rate === 0) return 0;

  switch (lfo.type) {
    case 0:
      return SINE_WAVE[lfo.phase]! * lfo.depth;
    case 1:
      return (255 - (lfo.phase << 3)) * lfo.depth;
    case 2:
      return (lfo.phase < WAVEFORM_SIZE / 2 ? 255 : -255) * lfo.depth;
    case 3:
      // Random waveform: caller provides randomness via phase jitter — but
      // faithful port uses libxmp_get_random(&ctx->rng, 512) - 256. The core's
      // RNG state lives on PlayState; see getRandom below.
      return (getRandom(512) - 256) * lfo.depth;
    default:
      return 0;
  }
}

let rngSeed = 0x1234abcd;

/**
 * libxmp_get_random (rng.c:36-42): xorshift32 step then
 * (range * state) >> 32. State lives module-wide here; libxmp seeds it with
 * time(NULL) so exact values are nondeterministic by design.
 */
export function getRandom(range: number): number {
  let state = rngSeed | 0;
  if (state === 0) state = 1;
  state = (state ^ ((state << 13) | 0)) | 0;
  state = (state ^ (state >>> 17)) | 0;
  state = Math.imul(state, 32); /* state << 5, wraps like C unsigned */
  rngSeed = state;
  return Math.floor((range * (state >>> 0)) / 4294967296);
}

/** get_lfo_st3 (lfo.c:69-80): S3M square is unipolar. */
function getLfoSt3(lfo: { type: number; rate: number; depth: number; phase: number }): number {
  if (lfo.rate === 0) return 0;
  if (lfo.type === 2) {
    return (lfo.phase < WAVEFORM_SIZE / 2 ? 255 : 0) * lfo.depth;
  }
  return getLfoMod(lfo);
}

/** get_lfo_ft2 (lfo.c:88-100): FT2 ramp is flipped. */
function getLfoFt2(lfo: { type: number; rate: number; depth: number; phase: number }): number {
  if (lfo.rate === 0) return 0;
  if (lfo.type === 1) {
    const phase = (lfo.phase + (WAVEFORM_SIZE >> 1)) % WAVEFORM_SIZE;
    return ((phase << 3) - 255) * lfo.depth;
  }
  return getLfoMod(lfo);
}

/**
 * libxmp_lfo_get (lfo.c:117-137). `isVibrato` picks FT2 ramp for vibrato only.
 * `readEventType` comes from mod.readEventType.
 */
export function lfoGet(
  readEventType: number,
  lfo: { type: number; rate: number; depth: number; phase: number },
  isVibrato: boolean,
): number {
  switch (readEventType) {
    case 2 /* ST3 */:
      return getLfoSt3(lfo);
    case 1 /* FT2 */:
      return isVibrato ? getLfoFt2(lfo) : getLfoMod(lfo);
    case 3 /* IT */:
      return getLfoSt3(lfo);
    default:
      return getLfoMod(lfo);
  }
}

/** libxmp_lfo_update (lfo.c:140-144). */
export function lfoUpdate(lfo: { type: number; rate: number; depth: number; phase: number }): void {
  lfo.phase += lfo.rate;
  lfo.phase &= WAVEFORM_SIZE - 1; /* Rate may be negative, don't %= */
}

/** libxmp_lfo_set_phase (lfo.c:146-149). */
export function lfoSetPhase(lfo: { phase: number }, phase: number): void {
  lfo.phase = phase;
}

/** libxmp_lfo_set_depth (lfo.c:151-154). */
export function lfoSetDepth(lfo: { depth: number }, depth: number): void {
  lfo.depth = depth;
}

/** libxmp_lfo_set_rate (lfo.c:156-159). */
export function lfoSetRate(lfo: { rate: number }, rate: number): void {
  lfo.rate = rate;
}

/** libxmp_lfo_set_waveform (lfo.c:161-164). */
export function lfoSetWaveform(lfo: { type: number }, type: number): void {
  lfo.type = type;
}

/** SET_LFO_NOTZERO (player.c:56-60): sets depth/rate only when both nonzero. */
export function setLfoNotzero(
  lfo: { type: number; rate: number; depth: number; phase: number },
  depth: number,
  rate: number,
): void {
  if (depth !== 0 && rate !== 0) {
    lfo.depth = depth;
    lfo.rate = rate;
  }
}

// Tone portamento (effects.c:78-106) --------------------------------------

/** IS_VALID_NOTE macro equivalent (common.h). */
export const isValidNote = (note: number): boolean => note >= 0 && note <= 119;
export const IS_VALID_INSTRUMENT = (ins: number): boolean => ins >= 0 && ins < 64;

/**
 * do_toneporta (effects.c:78-106).
 *
 * Reads mapped subinstrument xpo from the loaded module when present. When no
 * module is bound (effect unit tests), map/xpo lookups degrade gracefully.
 */
export function doToneporta(core: Core, xc: ChannelState, noteIn: number): void {
  const mod = core.module!;
  const instrument = mod.instruments[xc.ins];
  if (!instrument) return;
  let mappedXpo = 0;
  let mapped = 0;

  if (isValidNote(xc.key)) {
    mapped = instrument.map[xc.key] ?? 0;
  }

  if (mapped >= instrument.nsm) {
    mapped = 0;
  }

  const sub = instrument.sub[mapped];

  if (isValidNote(noteIn - 1) && xc.ins < mod.instruments.length) {
    const note = noteIn - 1;
    if (isValidNote(xc.key_porta)) {
      mappedXpo = instrument.mapXpo[xc.key_porta] ?? 0;
    }
    xc.porta.target = noteToPeriod(
      mod.periodType,
      note + (sub?.xpo ?? 0) + mappedXpo,
      xc.finetune,
      xc.per_adj,
    );
  }
  xc.porta.dir = xc.period < xc.porta.target ? 1 : -1;
}

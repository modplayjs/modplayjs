// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Bitti09 — modplayjs contributors
// Ported from: TinySoundFont tsf.h (v0.9).
// SoundFont2 synthesizer. Verbatim port of reference/tinysoundfont/tsf.h's
// TSF_IMPLEMENTATION section plus the public API declarations. Function
// names, struct names and field names follow the C source 1:1 so every
// line maps back to tsf.h. Deviations are mechanical only:
//   - float discipline: every operation the C performs on `float` values
//     is wrapped in Math.fround so results are IEEE-754 binary32 exactly
//     as with SSE compilation of the C source (`const f32 = Math.fround`).
//     C `double` operations are plain TS number (binary64) operations.
//     struct fields that are `float` in C are rounded on every write.
//   - pointer/offset arithmetic (tsf_region_operator's _TSFREGIONOFFSET
//     float*/int* indexing into the region struct) is replaced by named
//     field accessors with the same semantics (see genMetas).
//   - the STB_VORBIS ifdef path (SF3/ogg sample decoding) is not ported,
//     matching a C build without STB_VORBIS_INCLUDE_STB_VORBIS_H.
//   - malloc/realloc/free are TS arrays/objects; the tsf_copy refcount
//     is a small box object.
//
// MIT-licensed TinySoundFont by Bernhard Schelling (2017-2025), based on
// SFZero by Steve Folta (2012) — see NOTICE.md.
// https://github.com/schellingb/TinySoundFont

const f32 = Math.fround;

// The deterministic reference math layer (port of tools/refmath.h) — tsf.h
// routes its TSF_POW/TSF_POWF/TSF_EXPF/TSF_LOG/TSF_TAN/TSF_LOG10 macros to
// the same functions on the C side, so results are bit-identical.
import { rm_pow, rm_powf, rm_expf, rm_log, rm_log10, rm_tan } from './refmath.js';

// The lower this block size is the more accurate the effects are.
// (tsf.h TSF_RENDER_EFFECTSAMPLEBLOCK)
export const TSF_RENDER_EFFECTSAMPLEBLOCK = 64;

// tsf.h TSF_RENDER_SHORTBUFFERBLOCK
const TSF_RENDER_SHORTBUFFERBLOCK = 512;

// Grace release time for quick voice off (avoid clicking noise)
// (#define TSF_FASTRELEASETIME 0.01f)
const TSF_FASTRELEASETIME = f32(0.01);

const TSF_TRUE = true;
const TSF_FALSE = false;
const TSF_PI = 3.14159265358979323846264338327950288;

// enum TSFOutputMode
export const TSF_STEREO_INTERLEAVED = 0;
export const TSF_STEREO_UNWEAVED = 1;
export const TSF_MONO = 2;

// enum { TSF_LOOPMODE_NONE, TSF_LOOPMODE_CONTINUOUS, TSF_LOOPMODE_SUSTAIN }
const TSF_LOOPMODE_NONE = 0;
const TSF_LOOPMODE_CONTINUOUS = 1;
const TSF_LOOPMODE_SUSTAIN = 2;

// enum { TSF_SEGMENT_NONE, ... TSF_SEGMENT_DONE }
const TSF_SEGMENT_NONE = 0;
const TSF_SEGMENT_DELAY = 1;
const TSF_SEGMENT_ATTACK = 2;
const TSF_SEGMENT_HOLD = 3;
const TSF_SEGMENT_DECAY = 4;
const TSF_SEGMENT_SUSTAIN = 5;
const TSF_SEGMENT_RELEASE = 6;
const TSF_SEGMENT_DONE = 7;

// Float-literal constants (the C `f` suffix values).
const F32767_5 = f32(32767.5);
const F_THRES_LO = f32(-1.00004566);
const F_THRES_HI = f32(1.00001514);
const F_8176 = f32(8.176);
const F_N9226 = f32(-9.226);
const F_005 = f32(0.05);
const F_16383 = f32(16383);
const F_1200 = f32(1200);
const F_1000 = f32(1000);

// ---------------------------------------------------------------------------
// Types (tsf.h typedefs and structs)
// ---------------------------------------------------------------------------

interface TsfHydraGenamount {
  lo: number;
  hi: number;
  shortAmount: number;
  wordAmount: number;
}

interface TsfHydraPhdr {
  presetName: string;
  preset: number;
  bank: number;
  presetBagNdx: number;
  library: number;
  genre: number;
  morphology: number;
}
interface TsfHydraPbag {
  genNdx: number;
  modNdx: number;
}
interface TsfHydraPmod {
  modSrcOper: number;
  modDestOper: number;
  modAmount: number;
  modAmtSrcOper: number;
  modTransOper: number;
}
interface TsfHydraPgen {
  genOper: number;
  genAmount: TsfHydraGenamount;
}
interface TsfHydraInst {
  instName: string;
  instBagNdx: number;
}
interface TsfHydraIbag {
  instGenNdx: number;
  instModNdx: number;
}
interface TsfHydraImod {
  modSrcOper: number;
  modDestOper: number;
  modAmount: number;
  modAmtSrcOper: number;
  modTransOper: number;
}
interface TsfHydraIgen {
  genOper: number;
  genAmount: TsfHydraGenamount;
}
interface TsfHydraShdr {
  sampleName: string;
  start: number;
  end: number;
  startLoop: number;
  endLoop: number;
  sampleRate: number;
  originalPitch: number;
  pitchCorrection: number;
  sampleLink: number;
  sampleType: number;
}

interface TsfHydra {
  phdrs: TsfHydraPhdr[];
  pbags: TsfHydraPbag[];
  pmods: TsfHydraPmod[];
  pgens: TsfHydraPgen[];
  insts: TsfHydraInst[];
  ibags: TsfHydraIbag[];
  imods: TsfHydraImod[];
  igens: TsfHydraIgen[];
  shdrs: TsfHydraShdr[];
  phdrNum: number;
  pbagNum: number;
  pmodNum: number;
  pgenNum: number;
  instNum: number;
  ibagNum: number;
  imodNum: number;
  igenNum: number;
  shdrNum: number;
}

interface TsfRiffchunk {
  id: string;
  size: number;
}

interface TsfEnvelope {
  delay: number;
  attack: number;
  hold: number;
  decay: number;
  sustain: number;
  release: number;
  keynumToHold: number;
  keynumToDecay: number;
}

function newEnvelope(): TsfEnvelope {
  return {
    delay: 0,
    attack: 0,
    hold: 0,
    decay: 0,
    sustain: 0,
    release: 0,
    keynumToHold: 0,
    keynumToDecay: 0,
  };
}

interface TsfVoiceEnvelope {
  segment: number;
  segmentIsExponential: boolean;
  isAmpEnv: boolean;
  midiVelocity: number;
  level: number;
  slope: number;
  samplesUntilNextSegment: number;
  parameters: TsfEnvelope;
}

function newVoiceEnvelope(): TsfVoiceEnvelope {
  return {
    segment: 0,
    segmentIsExponential: false,
    isAmpEnv: false,
    midiVelocity: 0,
    level: 0,
    slope: 0,
    samplesUntilNextSegment: 0,
    parameters: newEnvelope(),
  };
}

interface TsfVoiceLowpass {
  QInv: number;
  a0: number;
  a1: number;
  b1: number;
  b2: number;
  z1: number;
  z2: number;
  active: boolean;
}

function newVoiceLowpass(): TsfVoiceLowpass {
  return { QInv: 0, a0: 0, a1: 0, b1: 0, b2: 0, z1: 0, z2: 0, active: false };
}

interface TsfVoiceLfo {
  samplesUntil: number;
  level: number;
  delta: number;
}

function newVoiceLfo(): TsfVoiceLfo {
  return { samplesUntil: 0, level: 0, delta: 0 };
}

interface TsfRegion {
  loop_mode: number;
  sample_rate: number;
  lokey: number;
  hikey: number;
  lovel: number;
  hivel: number;
  group: number;
  offset: number;
  end: number;
  loop_start: number;
  loop_end: number;
  transpose: number;
  tune: number;
  pitch_keycenter: number;
  pitch_keytrack: number;
  attenuation: number;
  pan: number;
  ampenv: TsfEnvelope;
  modenv: TsfEnvelope;
  initialFilterQ: number;
  initialFilterFc: number;
  modEnvToPitch: number;
  modEnvToFilterFc: number;
  modLfoToFilterFc: number;
  modLfoToVolume: number;
  delayModLFO: number;
  freqModLFO: number;
  modLfoToPitch: number;
  delayVibLFO: number;
  freqVibLFO: number;
  vibLfoToPitch: number;
}

function newRegion(): TsfRegion {
  return {
    loop_mode: 0,
    sample_rate: 0,
    lokey: 0,
    hikey: 0,
    lovel: 0,
    hivel: 0,
    group: 0,
    offset: 0,
    end: 0,
    loop_start: 0,
    loop_end: 0,
    transpose: 0,
    tune: 0,
    pitch_keycenter: 0,
    pitch_keytrack: 0,
    attenuation: 0,
    pan: 0,
    ampenv: newEnvelope(),
    modenv: newEnvelope(),
    initialFilterQ: 0,
    initialFilterFc: 0,
    modEnvToPitch: 0,
    modEnvToFilterFc: 0,
    modLfoToFilterFc: 0,
    modLfoToVolume: 0,
    delayModLFO: 0,
    freqModLFO: 0,
    modLfoToPitch: 0,
    delayVibLFO: 0,
    freqVibLFO: 0,
    vibLfoToPitch: 0,
  };
}

interface TsfPreset {
  presetName: string;
  preset: number;
  bank: number;
  regions: TsfRegion[];
  regionNum: number;
}

interface TsfVoice {
  playingPreset: number;
  playingKey: number;
  playingChannel: number;
  heldSustain: number;
  region: TsfRegion | null;
  pitchInputTimecents: number;
  pitchOutputFactor: number;
  sourceSamplePosition: number;
  noteGainDB: number;
  panFactorLeft: number;
  panFactorRight: number;
  playIndex: number;
  loopStart: number;
  loopEnd: number;
  ampenv: TsfVoiceEnvelope;
  modenv: TsfVoiceEnvelope;
  lowpass: TsfVoiceLowpass;
  modlfo: TsfVoiceLfo;
  viblfo: TsfVoiceLfo;
}

function newVoice(): TsfVoice {
  return {
    playingPreset: -1,
    playingKey: 0,
    playingChannel: 0,
    heldSustain: 0,
    region: null,
    pitchInputTimecents: 0,
    pitchOutputFactor: 0,
    sourceSamplePosition: 0,
    noteGainDB: 0,
    panFactorLeft: 0,
    panFactorRight: 0,
    playIndex: 0,
    loopStart: 0,
    loopEnd: 0,
    ampenv: newVoiceEnvelope(),
    modenv: newVoiceEnvelope(),
    lowpass: newVoiceLowpass(),
    modlfo: newVoiceLfo(),
    viblfo: newVoiceLfo(),
  };
}

interface TsfChannel {
  presetIndex: number;
  bank: number;
  pitchWheel: number;
  midiPan: number;
  midiVolume: number;
  midiExpression: number;
  midiRPN: number;
  /** C bitfield :14 */
  midiData: number;
  /** C bitfield :1 */
  sustain: number;
  panOffset: number;
  gainDB: number;
  pitchRange: number;
  tuning: number;
}

function newChannel(): TsfChannel {
  return {
    presetIndex: 0,
    bank: 0,
    pitchWheel: 8192,
    midiPan: 8192,
    midiVolume: 16383,
    midiExpression: 16383,
    midiRPN: 0xffff,
    midiData: 0,
    sustain: 0,
    panOffset: 0,
    gainDB: 0,
    pitchRange: 2,
    tuning: 0,
  };
}

interface TsfChannels {
  channelNum: number;
  activeChannel: number;
  channels: TsfChannel[];
}

/** struct tsf (tsf.h:330) */
export class Tsf {
  presets: TsfPreset[] = [];
  fontSamples: Float32Array = new Float32Array(0);
  voices: TsfVoice[] = [];
  channels: TsfChannels | null = null;

  presetNum = 0;
  voiceNum = 0;
  maxVoiceNum = 0;
  voicePlayIndex = 0;

  outputmode = TSF_STEREO_INTERLEAVED;
  outSampleRate = 0;
  globalGainDB = 0;
  refCount: { n: number } | null = null;
}

// ---------------------------------------------------------------------------
// Stream + memory loading (tsf.h tsf_stream / tsf_stream_memory)
// ---------------------------------------------------------------------------

interface TsfStream {
  read(ptr: Uint8Array, size: number): number;
  skip(count: number): boolean;
}

function tsf_load_memory(buffer: Uint8Array): Tsf | null {
  let pos = 0;
  return tsf_load_stream({
    read(ptr, size) {
      if (size > buffer.length - pos) size = buffer.length - pos;
      ptr.set(buffer.subarray(pos, pos + size));
      pos += size;
      return size;
    },
    skip(count) {
      if (pos + count > buffer.length) return false;
      pos += count;
      return true;
    },
  });
}

// ---------------------------------------------------------------------------
// Low-level readers. The C reads little-endian struct fields via fread
// (x86); the TS port reads explicit little-endian values.
// ---------------------------------------------------------------------------

// Adapt a TsfStream to whole-struct field reads (tsf_hydra_read_* TSFR macro).
function makeReader(stream: TsfStream) {
  const one = new Uint8Array(1);
  const two = new Uint8Array(2);
  const four = new Uint8Array(4);
  return {
    u8(): number {
      if (stream.read(one, 1) !== 1) return 0;
      return one[0]!;
    },
    s8(): number {
      if (stream.read(one, 1) !== 1) return 0;
      return (one[0]! << 24) >> 24;
    },
    u16(): number {
      if (stream.read(two, 2) !== 2) return 0;
      return two[0]! | (two[1]! << 8);
    },
    s16(): number {
      if (stream.read(two, 2) !== 2) return 0;
      return ((two[0]! | (two[1]! << 8)) << 16) >> 16;
    },
    u32(): number {
      if (stream.read(four, 4) !== 4) return 0;
      return (four[0]! | (four[1]! << 8) | (four[2]! << 16) | (four[3]! << 24)) >>> 0;
    },
    /** tsf_char20: 20 raw bytes as a C string (last byte forced NUL on copy). */
    char20(): string {
      const b = new Uint8Array(20);
      if (stream.read(b, 20) !== 20) return '';
      let s = '';
      for (let i = 0; i < 20; i++) {
        const c = b[i]!;
        if (c === 0) break;
        s += String.fromCharCode(c);
      }
      return s;
    },
    readRaw(ptr: Uint8Array, size: number): number {
      return stream.read(ptr, size);
    },
    skip(count: number): boolean {
      return stream.skip(count);
    },
  };
}
type Reader = ReturnType<typeof makeReader>;

// tsf.h:409 tsf_hydra_read_* (TSFR macro per field)
function tsf_hydra_read_phdr(i: TsfHydraPhdr, r: Reader): void {
  i.presetName = r.char20();
  i.preset = r.u16();
  i.bank = r.u16();
  i.presetBagNdx = r.u16();
  i.library = r.u32();
  i.genre = r.u32();
  i.morphology = r.u32();
}
function tsf_hydra_read_pbag(i: TsfHydraPbag, r: Reader): void {
  i.genNdx = r.u16();
  i.modNdx = r.u16();
}
function tsf_hydra_read_pmod(i: TsfHydraPmod, r: Reader): void {
  i.modSrcOper = r.u16();
  i.modDestOper = r.u16();
  i.modAmount = r.s16();
  i.modAmtSrcOper = r.u16();
  i.modTransOper = r.u16();
}
function readGenamount(r: Reader): TsfHydraGenamount {
  // union tsf_hydra_genamount: 2 bytes total — {u8 lo, u8 hi} | s16 | u16
  const lo = r.u8();
  const hi = r.u8();
  const wordAmount = (lo | (hi << 8)) >>> 0;
  return {
    lo,
    hi,
    wordAmount,
    shortAmount: (wordAmount << 16) >> 16,
  };
}
function tsf_hydra_read_pgen(i: TsfHydraPgen, r: Reader): void {
  i.genOper = r.u16();
  i.genAmount = readGenamount(r);
}
function tsf_hydra_read_inst(i: TsfHydraInst, r: Reader): void {
  i.instName = r.char20();
  i.instBagNdx = r.u16();
}
function tsf_hydra_read_ibag(i: TsfHydraIbag, r: Reader): void {
  i.instGenNdx = r.u16();
  i.instModNdx = r.u16();
}
function tsf_hydra_read_imod(i: TsfHydraImod, r: Reader): void {
  i.modSrcOper = r.u16();
  i.modDestOper = r.u16();
  i.modAmount = r.s16();
  i.modAmtSrcOper = r.u16();
  i.modTransOper = r.u16();
}
function tsf_hydra_read_igen(i: TsfHydraIgen, r: Reader): void {
  i.genOper = r.u16();
  i.genAmount = readGenamount(r);
}
function tsf_hydra_read_shdr(i: TsfHydraShdr, r: Reader): void {
  i.sampleName = r.char20();
  i.start = r.u32();
  i.end = r.u32();
  i.startLoop = r.u32();
  i.endLoop = r.u32();
  i.sampleRate = r.u32();
  i.originalPitch = r.u8();
  i.pitchCorrection = r.s8();
  i.sampleLink = r.u16();
  i.sampleType = r.u16();
}

function TSF_FourCCEquals(value: string, fourcc: string): boolean {
  return value === fourcc;
}

// ---------------------------------------------------------------------------
// Math helpers (tsf.h:477-481)
// ---------------------------------------------------------------------------

function tsf_timecents2Secsd(timecents: number): number {
  return rm_pow(2.0, timecents / 1200.0);
}
function tsf_timecents2Secsf(timecents: number): number {
  return f32(rm_pow(2.0, f32(timecents / 1200)));
}
function tsf_cents2Hertz(cents: number): number {
  return f32(F_8176 * f32(rm_pow(2.0, f32(cents / F_1200))));
}
function tsf_decibelsToGain(db: number): number {
  return db > -100 ? f32(rm_pow(10.0, f32(db * F_005))) : 0;
}
function tsf_gainToDecibels(gain: number): number {
  return gain <= 0.00001 ? -100 : f32(20.0 * rm_log10(gain));
}

// tsf.h:483 tsf_riffchunk_read
function tsf_riffchunk_read(
  parent: TsfRiffchunk | null,
  chunk: TsfRiffchunk,
  r: Reader,
): boolean {
  let IsRiff: boolean, IsList: boolean;
  const four = new Uint8Array(4);
  const sizebuf = new Uint8Array(4);
  if (parent && 8 > parent.size) return false;
  if (!r.readRaw(four, 4)) return false;
  chunk.id = String.fromCharCode(four[0]!, four[1]!, four[2]!, four[3]!);
  if (four[0]! <= 0x20 /* ' ' */ || four[0]! >= 0x7a /* 'z' */) return false;
  if (!r.readRaw(sizebuf, 4)) return false;
  chunk.size =
    (sizebuf[0]! | (sizebuf[1]! << 8) | (sizebuf[2]! << 16) | (sizebuf[3]! << 24)) >>> 0;
  if (parent && 8 + chunk.size > parent.size) return false;
  if (parent) parent.size = (parent.size - (8 + chunk.size)) >>> 0;
  IsRiff = TSF_FourCCEquals(chunk.id, 'RIFF');
  IsList = TSF_FourCCEquals(chunk.id, 'LIST');
  if (IsRiff && parent) return false; //not allowed
  if (!IsRiff && !IsList) return true; //custom type without sub type
  if (!r.readRaw(four, 4)) return false;
  chunk.id = String.fromCharCode(four[0]!, four[1]!, four[2]!, four[3]!);
  if (four[0]! <= 0x20 || four[0]! >= 0x7a) return false;
  chunk.size = (chunk.size - 4) >>> 0;
  return true;
}

// ---------------------------------------------------------------------------
// Region handling (tsf.h:499-706). The C indexes the tsf_region struct
// through float*/int* offsets (_TSFREGIONOFFSET); the port uses named
// field accessors with identical semantics.
// ---------------------------------------------------------------------------

type GenField =
  | 'offset'
  | 'end'
  | 'loop_start'
  | 'loop_end'
  | 'modLfoToPitch'
  | 'vibLfoToPitch'
  | 'modEnvToPitch'
  | 'initialFilterFc'
  | 'initialFilterQ'
  | 'modLfoToFilterFc'
  | 'modEnvToFilterFc'
  | 'modLfoToVolume'
  | 'pan'
  | 'delayModLFO'
  | 'freqModLFO'
  | 'delayVibLFO'
  | 'freqVibLFO'
  | 'modenv.delay'
  | 'modenv.attack'
  | 'modenv.hold'
  | 'modenv.decay'
  | 'modenv.sustain'
  | 'modenv.release'
  | 'modenv.keynumToHold'
  | 'modenv.keynumToDecay'
  | 'ampenv.delay'
  | 'ampenv.attack'
  | 'ampenv.hold'
  | 'ampenv.decay'
  | 'ampenv.sustain'
  | 'ampenv.release'
  | 'ampenv.keynumToHold'
  | 'ampenv.keynumToDecay'
  | 'transpose'
  | 'tune'
  | 'loop_mode'
  | 'pitch_keytrack'
  | 'group'
  | 'attenuation'
  | 'pitch_keycenter';

// Field accessors. 'u' = unsigned int (32-bit wrap), 'i' = int (32-bit),
// 'f' = float (rounded on write).
function regFieldGet(r: TsfRegion, f: GenField): number {
  switch (f) {
    case 'offset':
      return r.offset;
    case 'end':
      return r.end;
    case 'loop_start':
      return r.loop_start;
    case 'loop_end':
      return r.loop_end;
    case 'modLfoToPitch':
      return r.modLfoToPitch;
    case 'vibLfoToPitch':
      return r.vibLfoToPitch;
    case 'modEnvToPitch':
      return r.modEnvToPitch;
    case 'initialFilterFc':
      return r.initialFilterFc;
    case 'initialFilterQ':
      return r.initialFilterQ;
    case 'modLfoToFilterFc':
      return r.modLfoToFilterFc;
    case 'modEnvToFilterFc':
      return r.modEnvToFilterFc;
    case 'modLfoToVolume':
      return r.modLfoToVolume;
    case 'pan':
      return r.pan;
    case 'attenuation':
      return r.attenuation;
    case 'delayModLFO':
      return r.delayModLFO;
    case 'freqModLFO':
      return r.freqModLFO;
    case 'delayVibLFO':
      return r.delayVibLFO;
    case 'freqVibLFO':
      return r.freqVibLFO;
    case 'modenv.delay':
      return r.modenv.delay;
    case 'modenv.attack':
      return r.modenv.attack;
    case 'modenv.hold':
      return r.modenv.hold;
    case 'modenv.decay':
      return r.modenv.decay;
    case 'modenv.sustain':
      return r.modenv.sustain;
    case 'modenv.release':
      return r.modenv.release;
    case 'modenv.keynumToHold':
      return r.modenv.keynumToHold;
    case 'modenv.keynumToDecay':
      return r.modenv.keynumToDecay;
    case 'ampenv.delay':
      return r.ampenv.delay;
    case 'ampenv.attack':
      return r.ampenv.attack;
    case 'ampenv.hold':
      return r.ampenv.hold;
    case 'ampenv.decay':
      return r.ampenv.decay;
    case 'ampenv.sustain':
      return r.ampenv.sustain;
    case 'ampenv.release':
      return r.ampenv.release;
    case 'ampenv.keynumToHold':
      return r.ampenv.keynumToHold;
    case 'ampenv.keynumToDecay':
      return r.ampenv.keynumToDecay;
    case 'transpose':
      return r.transpose;
    case 'tune':
      return r.tune;
    case 'loop_mode':
      return r.loop_mode;
    case 'pitch_keytrack':
      return r.pitch_keytrack;
    case 'group':
      return r.group;
    case 'pitch_keycenter':
      return r.pitch_keycenter;
  }
}

function regFieldSet(r: TsfRegion, f: GenField, v: number): void {
  switch (f) {
    case 'offset':
      r.offset = v >>> 0;
      return;
    case 'end':
      r.end = v >>> 0;
      return;
    case 'loop_start':
      r.loop_start = v >>> 0;
      return;
    case 'loop_end':
      r.loop_end = v >>> 0;
      return;
    case 'group':
      r.group = v >>> 0;
      return;
    case 'modLfoToPitch':
      r.modLfoToPitch = v | 0;
      return;
    case 'vibLfoToPitch':
      r.vibLfoToPitch = v | 0;
      return;
    case 'modEnvToPitch':
      r.modEnvToPitch = v | 0;
      return;
    case 'initialFilterFc':
      r.initialFilterFc = v | 0;
      return;
    case 'initialFilterQ':
      r.initialFilterQ = v | 0;
      return;
    case 'modLfoToFilterFc':
      r.modLfoToFilterFc = v | 0;
      return;
    case 'modEnvToFilterFc':
      r.modEnvToFilterFc = v | 0;
      return;
    case 'modLfoToVolume':
      r.modLfoToVolume = v | 0;
      return;
    case 'freqModLFO':
      r.freqModLFO = v | 0;
      return;
    case 'freqVibLFO':
      r.freqVibLFO = v | 0;
      return;
    case 'transpose':
      r.transpose = v | 0;
      return;
    case 'tune':
      r.tune = v | 0;
      return;
    case 'loop_mode':
      r.loop_mode = v | 0;
      return;
    case 'pitch_keytrack':
      r.pitch_keytrack = v | 0;
      return;
    case 'pitch_keycenter':
      r.pitch_keycenter = v | 0;
      return;
    case 'pan':
      r.pan = f32(v);
      return;
    case 'attenuation':
      r.attenuation = f32(v);
      return;
    case 'delayModLFO':
      r.delayModLFO = f32(v);
      return;
    case 'delayVibLFO':
      r.delayVibLFO = f32(v);
      return;
    case 'modenv.delay':
      r.modenv.delay = f32(v);
      return;
    case 'modenv.attack':
      r.modenv.attack = f32(v);
      return;
    case 'modenv.hold':
      r.modenv.hold = f32(v);
      return;
    case 'modenv.decay':
      r.modenv.decay = f32(v);
      return;
    case 'modenv.sustain':
      r.modenv.sustain = f32(v);
      return;
    case 'modenv.release':
      r.modenv.release = f32(v);
      return;
    case 'modenv.keynumToHold':
      r.modenv.keynumToHold = f32(v);
      return;
    case 'modenv.keynumToDecay':
      r.modenv.keynumToDecay = f32(v);
      return;
    case 'ampenv.delay':
      r.ampenv.delay = f32(v);
      return;
    case 'ampenv.attack':
      r.ampenv.attack = f32(v);
      return;
    case 'ampenv.hold':
      r.ampenv.hold = f32(v);
      return;
    case 'ampenv.decay':
      r.ampenv.decay = f32(v);
      return;
    case 'ampenv.sustain':
      r.ampenv.sustain = f32(v);
      return;
    case 'ampenv.release':
      r.ampenv.release = f32(v);
      return;
    case 'ampenv.keynumToHold':
      r.ampenv.keynumToHold = f32(v);
      return;
    case 'ampenv.keynumToDecay':
      r.ampenv.keynumToDecay = f32(v);
      return;
  }
}

// Struct-copy semantics: the C assigns whole structs (`presetRegion =
// globalRegion`), TS needs explicit deep copies of the nested envelopes.
// dst keeps its OWN envelope objects — sharing them would let one zone's
// in-place envtosecs conversion pollute the next zone (parity bug).
function copyEnvelopeInto(dst: TsfEnvelope, src: TsfEnvelope): void {
  dst.delay = src.delay;
  dst.attack = src.attack;
  dst.hold = src.hold;
  dst.decay = src.decay;
  dst.sustain = src.sustain;
  dst.release = src.release;
  dst.keynumToHold = src.keynumToHold;
  dst.keynumToDecay = src.keynumToDecay;
}
function copyRegionInto(dst: TsfRegion, src: TsfRegion): void {
  const ae = dst.ampenv,
    me = dst.modenv;
  Object.assign(dst, src);
  dst.ampenv = ae;
  dst.modenv = me;
  copyEnvelopeInto(ae, src.ampenv);
  copyEnvelopeInto(me, src.modenv);
}
function cloneRegion(src: TsfRegion): TsfRegion {
  const r = newRegion();
  copyRegionInto(r, src);
  return r;
}

// tsf.h tsf_region_operator genMetas table (mode per generator).
const _GEN_TYPE_MASK = 0x0f;
const GEN_FLOAT = 0x01;
const GEN_INT = 0x02;
const GEN_UINT_ADD = 0x03;
const GEN_UINT_ADD15 = 0x04;
const GEN_KEYRANGE = 0x05;
const GEN_VELRANGE = 0x06;
const GEN_LOOPMODE = 0x07;
const GEN_GROUP = 0x08;
const GEN_KEYCENTER = 0x09;

const _GEN_LIMIT_MASK = 0xf0;
const GEN_INT_LIMIT12K = 0x10; //min -12000, max 12000
const GEN_INT_LIMITFC = 0x20; //min 1500, max 13500
const GEN_INT_LIMITQ = 0x30; //min 0, max 960
const GEN_INT_LIMIT960 = 0x40; //min -960, max 960
const GEN_INT_LIMIT16K4500 = 0x50; //min -16000, max 4500
const GEN_FLOAT_LIMIT12K5K = 0x60; //min -12000, max 5000
const GEN_FLOAT_LIMIT12K8K = 0x70; //min -12000, max 8000
const GEN_FLOAT_LIMIT1200 = 0x80; //min -1200, max 1200
const GEN_FLOAT_LIMITPAN = 0x90; //* .001f, min -.5f, max .5f
const GEN_FLOAT_LIMITATTN = 0xa0; //* .1f, min 0, max 144.0
const GEN_FLOAT_MAX1000 = 0xb0; //min 0, max 1000
const GEN_FLOAT_MAX1440 = 0xc0; //min 0, max 1440

const _GEN_MAX = 59;
const genMetas: { mode: number; field: GenField | null }[] = [
  { mode: GEN_UINT_ADD, field: 'offset' }, // 0 StartAddrsOffset
  { mode: GEN_UINT_ADD, field: 'end' }, // 1 EndAddrsOffset
  { mode: GEN_UINT_ADD, field: 'loop_start' }, // 2 StartloopAddrsOffset
  { mode: GEN_UINT_ADD, field: 'loop_end' }, // 3 EndloopAddrsOffset
  { mode: GEN_UINT_ADD15, field: 'offset' }, // 4 StartAddrsCoarseOffset
  { mode: GEN_INT | GEN_INT_LIMIT12K, field: 'modLfoToPitch' }, // 5 ModLfoToPitch
  { mode: GEN_INT | GEN_INT_LIMIT12K, field: 'vibLfoToPitch' }, // 6 VibLfoToPitch
  { mode: GEN_INT | GEN_INT_LIMIT12K, field: 'modEnvToPitch' }, // 7 ModEnvToPitch
  { mode: GEN_INT | GEN_INT_LIMITFC, field: 'initialFilterFc' }, // 8 InitialFilterFc
  { mode: GEN_INT | GEN_INT_LIMITQ, field: 'initialFilterQ' }, // 9 InitialFilterQ
  { mode: GEN_INT | GEN_INT_LIMIT12K, field: 'modLfoToFilterFc' }, //10 ModLfoToFilterFc
  { mode: GEN_INT | GEN_INT_LIMIT12K, field: 'modEnvToFilterFc' }, //11 ModEnvToFilterFc
  { mode: GEN_UINT_ADD15, field: 'end' }, //12 EndAddrsCoarseOffset
  { mode: GEN_INT | GEN_INT_LIMIT960, field: 'modLfoToVolume' }, //13 ModLfoToVolume
  { mode: 0, field: null }, //   Unused
  { mode: 0, field: null }, //15 ChorusEffectsSend (unsupported)
  { mode: 0, field: null }, //16 ReverbEffectsSend (unsupported)
  { mode: GEN_FLOAT | GEN_FLOAT_LIMITPAN, field: 'pan' }, //17 Pan
  { mode: 0, field: null }, //   Unused
  { mode: 0, field: null }, //   Unused
  { mode: 0, field: null }, //   Unused
  { mode: GEN_FLOAT | GEN_FLOAT_LIMIT12K5K, field: 'delayModLFO' }, //21 DelayModLFO
  { mode: GEN_INT | GEN_INT_LIMIT16K4500, field: 'freqModLFO' }, //22 FreqModLFO
  { mode: GEN_FLOAT | GEN_FLOAT_LIMIT12K5K, field: 'delayVibLFO' }, //23 DelayVibLFO
  { mode: GEN_INT | GEN_INT_LIMIT16K4500, field: 'freqVibLFO' }, //24 FreqVibLFO
  { mode: GEN_FLOAT | GEN_FLOAT_LIMIT12K5K, field: 'modenv.delay' }, //25 DelayModEnv
  { mode: GEN_FLOAT | GEN_FLOAT_LIMIT12K8K, field: 'modenv.attack' }, //26 AttackModEnv
  { mode: GEN_FLOAT | GEN_FLOAT_LIMIT12K5K, field: 'modenv.hold' }, //27 HoldModEnv
  { mode: GEN_FLOAT | GEN_FLOAT_LIMIT12K8K, field: 'modenv.decay' }, //28 DecayModEnv
  { mode: GEN_FLOAT | GEN_FLOAT_MAX1000, field: 'modenv.sustain' }, //29 SustainModEnv
  { mode: GEN_FLOAT | GEN_FLOAT_LIMIT12K8K, field: 'modenv.release' }, //30 ReleaseModEnv
  { mode: GEN_FLOAT | GEN_FLOAT_LIMIT1200, field: 'modenv.keynumToHold' }, //31 KeynumToModEnvHold
  { mode: GEN_FLOAT | GEN_FLOAT_LIMIT1200, field: 'modenv.keynumToDecay' }, //32 KeynumToModEnvDecay
  { mode: GEN_FLOAT | GEN_FLOAT_LIMIT12K5K, field: 'ampenv.delay' }, //33 DelayVolEnv
  { mode: GEN_FLOAT | GEN_FLOAT_LIMIT12K8K, field: 'ampenv.attack' }, //34 AttackVolEnv
  { mode: GEN_FLOAT | GEN_FLOAT_LIMIT12K5K, field: 'ampenv.hold' }, //35 HoldVolEnv
  { mode: GEN_FLOAT | GEN_FLOAT_LIMIT12K8K, field: 'ampenv.decay' }, //36 DecayVolEnv
  { mode: GEN_FLOAT | GEN_FLOAT_MAX1440, field: 'ampenv.sustain' }, //37 SustainVolEnv
  { mode: GEN_FLOAT | GEN_FLOAT_LIMIT12K8K, field: 'ampenv.release' }, //38 ReleaseVolEnv
  { mode: GEN_FLOAT | GEN_FLOAT_LIMIT1200, field: 'ampenv.keynumToHold' }, //39 KeynumToVolEnvHold
  { mode: GEN_FLOAT | GEN_FLOAT_LIMIT1200, field: 'ampenv.keynumToDecay' }, //40 KeynumToVolEnvDecay
  { mode: 0, field: null }, //   Instrument (special)
  { mode: 0, field: null }, //   Reserved
  { mode: GEN_KEYRANGE, field: null }, //43 KeyRange
  { mode: GEN_VELRANGE, field: null }, //44 VelRange
  { mode: GEN_UINT_ADD15, field: 'loop_start' }, //45 StartloopAddrsCoarseOffset
  { mode: 0, field: null }, //46 Keynum (special)
  { mode: 0, field: null }, //47 Velocity (special)
  { mode: GEN_FLOAT | GEN_FLOAT_LIMITATTN, field: 'attenuation' }, //48 InitialAttenuation
  { mode: 0, field: null }, //   Reserved
  { mode: GEN_UINT_ADD15, field: 'loop_end' }, //50 EndloopAddrsCoarseOffset
  { mode: GEN_INT, field: 'transpose' }, //51 CoarseTune
  { mode: GEN_INT, field: 'tune' }, //52 FineTune
  { mode: 0, field: null }, //   SampleID (special)
  { mode: GEN_LOOPMODE, field: 'loop_mode' }, //54 SampleModes
  { mode: 0, field: null }, //   Reserved
  { mode: GEN_INT, field: 'pitch_keytrack' }, //56 ScaleTuning
  { mode: GEN_GROUP, field: 'group' }, //57 ExclusiveClass
  { mode: GEN_KEYCENTER, field: 'pitch_keycenter' }, //58 OverridingRootKey
];

// tsf.h:499 tsf_region_clear
function tsf_region_clear(i: TsfRegion, for_relative: boolean): void {
  const zero = newRegion();
  zero.hikey = 127;
  zero.hivel = 127;
  zero.pitch_keycenter = 60; // C4
  Object.assign(i, zero);
  if (for_relative) return;

  i.pitch_keytrack = 100;

  i.pitch_keycenter = -1;

  // SF2 defaults in timecents.
  i.ampenv.delay = i.ampenv.attack = i.ampenv.hold = i.ampenv.decay = i.ampenv.release = -12000.0;
  i.modenv.delay = i.modenv.attack = i.modenv.hold = i.modenv.decay = i.modenv.release = -12000.0;

  i.initialFilterFc = 13500;

  i.delayModLFO = -12000.0;
  i.delayVibLFO = -12000.0;
}

// tsf.h:520 tsf_region_operator — apply path (`if (amount)`).
function tsf_region_apply(
  region: TsfRegion,
  genOper: number,
  amount: TsfHydraGenamount,
): void {
  if (genOper >= _GEN_MAX) return;
  const meta = genMetas[genOper]!;
  switch (meta.mode & _GEN_TYPE_MASK) {
    case GEN_FLOAT:
      regFieldSet(region, meta.field!, amount.shortAmount);
      return;
    case GEN_INT:
      regFieldSet(region, meta.field!, amount.shortAmount);
      return;
    case GEN_UINT_ADD:
      regFieldSet(region, meta.field!, (regFieldGet(region, meta.field!) + amount.shortAmount) >>> 0);
      return;
    case GEN_UINT_ADD15:
      regFieldSet(
        region,
        meta.field!,
        (regFieldGet(region, meta.field!) + (amount.shortAmount << 15)) >>> 0,
      );
      return;
    case GEN_KEYRANGE:
      region.lokey = amount.lo;
      region.hikey = amount.hi;
      return;
    case GEN_VELRANGE:
      region.lovel = amount.lo;
      region.hivel = amount.hi;
      return;
    case GEN_LOOPMODE:
      region.loop_mode =
        (amount.wordAmount & 3) === 3
          ? TSF_LOOPMODE_SUSTAIN
          : (amount.wordAmount & 3) === 1
            ? TSF_LOOPMODE_CONTINUOUS
            : TSF_LOOPMODE_NONE;
      return;
    case GEN_GROUP:
      region.group = amount.wordAmount;
      return;
    case GEN_KEYCENTER:
      region.pitch_keycenter = amount.shortAmount;
      return;
  }
}

// tsf.h:520 tsf_region_operator — merge path (`else`, loops all _GEN_MAX).
// Note the C merge switch has cases only for GEN_FLOAT / GEN_INT /
// GEN_UINT_ADD: GEN_UINT_ADD15 rows are skipped exactly as in the source.
function tsf_region_merge(region: TsfRegion, merge_region: TsfRegion): void {
  for (let genOper = 0; genOper !== _GEN_MAX; genOper++) {
    const meta = genMetas[genOper]!;
    if (!meta.field) continue;
    switch (meta.mode & _GEN_TYPE_MASK) {
      case GEN_FLOAT: {
        let v = regFieldGet(region, meta.field!);
        const mv = regFieldGet(merge_region, meta.field!);
        v = f32(v + mv);
        // C writes `*val += merge` through the pointer BEFORE the limit
        // switch — `default: continue` keeps the sum and only skips the
        // scale+clamp.
        regFieldSet(region, meta.field!, v);
        let vfactor: number, vmin: number, vmax: number;
        switch (meta.mode & _GEN_LIMIT_MASK) {
          case GEN_FLOAT_LIMIT12K5K:
            vfactor = 1.0;
            vmin = -12000.0;
            vmax = 5000.0;
            break;
          case GEN_FLOAT_LIMIT12K8K:
            vfactor = 1.0;
            vmin = -12000.0;
            vmax = 8000.0;
            break;
          case GEN_FLOAT_LIMIT1200:
            vfactor = 1.0;
            vmin = -1200.0;
            vmax = 1200.0;
            break;
          case GEN_FLOAT_LIMITPAN:
            vfactor = f32(0.001);
            vmin = -0.5;
            vmax = 0.5;
            break;
          case GEN_FLOAT_LIMITATTN:
            vfactor = f32(0.01);
            vmin = 0.0;
            vmax = 14.4;
            break;
          case GEN_FLOAT_MAX1000:
            vfactor = 1.0;
            vmin = 0.0;
            vmax = 1000.0;
            break;
          case GEN_FLOAT_MAX1440:
            vfactor = 1.0;
            vmin = 0.0;
            vmax = 1440.0;
            break;
          default:
            continue;
        }
        v = f32(v * vfactor);
        if (v < vmin) v = vmin;
        else if (v > vmax) v = vmax;
        regFieldSet(region, meta.field!, v);
        continue;
      }
      case GEN_INT: {
        let v = regFieldGet(region, meta.field!) | 0;
        const mv = regFieldGet(merge_region, meta.field!) | 0;
        v = (v + mv) | 0;
        // C writes `*val += merge` before the limit switch (see above).
        regFieldSet(region, meta.field!, v);
        let vmin: number, vmax: number;
        switch (meta.mode & _GEN_LIMIT_MASK) {
          case GEN_INT_LIMIT12K:
            vmin = -12000;
            vmax = 12000;
            break;
          case GEN_INT_LIMITFC:
            vmin = 1500;
            vmax = 13500;
            break;
          case GEN_INT_LIMITQ:
            vmin = 0;
            vmax = 960;
            break;
          case GEN_INT_LIMIT960:
            vmin = -960;
            vmax = 960;
            break;
          case GEN_INT_LIMIT16K4500:
            vmin = -16000;
            vmax = 4500;
            break;
          default:
            continue;
        }
        if (v < vmin) v = vmin;
        else if (v > vmax) v = vmax;
        regFieldSet(region, meta.field!, v);
        continue;
      }
      case GEN_UINT_ADD: {
        regFieldSet(
          region,
          meta.field!,
          (regFieldGet(region, meta.field!) + regFieldGet(merge_region, meta.field!)) >>> 0,
        );
        continue;
      }
    }
  }
}

// tsf.h:689 tsf_region_envtosecs
function tsf_region_envtosecs(p: TsfEnvelope, sustainIsGain: boolean): void {
  // EG times need to be converted from timecents to seconds.
  // Pin very short EG segments.  Timecents don't get to zero, and our EG is
  // happier with zero values.
  p.delay = p.delay < -11950.0 ? 0.0 : tsf_timecents2Secsf(p.delay);
  p.attack = p.attack < -11950.0 ? 0.0 : tsf_timecents2Secsf(p.attack);
  p.release = p.release < -11950.0 ? 0.0 : tsf_timecents2Secsf(p.release);

  // If we have dynamic hold or decay times depending on key number we need
  // to keep the values in timecents so we can calculate it during startNote
  if (!p.keynumToHold) p.hold = p.hold < -11950.0 ? 0.0 : tsf_timecents2Secsf(p.hold);
  if (!p.keynumToDecay) p.decay = p.decay < -11950.0 ? 0.0 : tsf_timecents2Secsf(p.decay);

  if (p.sustain < 0.0) p.sustain = 0.0;
  else if (sustainIsGain) p.sustain = tsf_decibelsToGain(f32(-p.sustain / 10.0));
  else p.sustain = f32(1.0 - f32(p.sustain / F_1000));
}

// tsf.h:708 tsf_load_presets
function tsf_load_presets(res: Tsf, hydra: TsfHydra, fontSampleCount: number): boolean {
  const GenInstrument = 41,
    GenKeyRange = 43,
    GenVelRange = 44,
    GenSampleID = 53;
  // Read each preset.
  res.presetNum = hydra.phdrNum - 1;
  // C: TSF_MALLOC((phdrNum-1) * sizeof) with phdrNum == 0 is UB; reject
  // such malformed fonts instead.
  if (res.presetNum < 0) return false;
  res.presets = [];
  for (let i = 0; i !== res.presetNum; i++)
    res.presets.push({ presetName: '', preset: 0, bank: 0, regions: [], regionNum: 0 });

  for (let pi = 0; pi !== hydra.phdrNum - 1; pi++) {
    const pphdr = hydra.phdrs[pi]!;
    const pphdrMax = hydra.phdrNum - 1;
    let sortedIndex = 0,
      region_index = 0;
    for (let oi = 0; oi !== pphdrMax; oi++) {
      const otherphdr = hydra.phdrs[oi]!;
      if (oi === pi || otherphdr.bank > pphdr.bank) continue;
      else if (otherphdr.bank < pphdr.bank) sortedIndex++;
      else if (otherphdr.preset > pphdr.preset) continue;
      else if (otherphdr.preset < pphdr.preset) sortedIndex++;
      else if (oi < pi) sortedIndex++;
    }

    const preset = res.presets[sortedIndex]!;
    preset.presetName = pphdr.presetName;
    preset.bank = pphdr.bank;
    preset.preset = pphdr.preset;
    preset.regionNum = 0;

    //count regions covered by this preset
    for (
      let bi = pphdr.presetBagNdx, bEnd = hydra.phdrs[pi + 1]!.presetBagNdx;
      bi !== bEnd;
      bi++
    ) {
      const ppbag = hydra.pbags[bi]!;
      let plokey = 0,
        phikey = 127,
        plovel = 0,
        phivel = 127;
      for (
        let gi = ppbag.genNdx, gEnd = hydra.pbags[bi + 1]!.genNdx;
        gi !== gEnd;
        gi++
      ) {
        const ppgen = hydra.pgens[gi]!;
        if (ppgen.genOper === GenKeyRange) {
          plokey = ppgen.genAmount.lo;
          phikey = ppgen.genAmount.hi;
          continue;
        }
        if (ppgen.genOper === GenVelRange) {
          plovel = ppgen.genAmount.lo;
          phivel = ppgen.genAmount.hi;
          continue;
        }
        if (ppgen.genOper !== GenInstrument) continue;
        if (ppgen.genAmount.wordAmount >= hydra.instNum) continue;
        const pinst = hydra.insts[ppgen.genAmount.wordAmount]!;
        for (
          let ii = pinst.instBagNdx, iEnd = hydra.insts[ppgen.genAmount.wordAmount + 1]!.instBagNdx;
          ii !== iEnd;
          ii++
        ) {
          const pibag = hydra.ibags[ii]!;
          let ilokey = 0,
            ihikey = 127,
            ilovel = 0,
            ihivel = 127;
          for (
            let jj = pibag.instGenNdx, jEnd = hydra.ibags[ii + 1]!.instGenNdx;
            jj !== jEnd;
            jj++
          ) {
            const pigen = hydra.igens[jj]!;
            if (pigen.genOper === GenKeyRange) {
              ilokey = pigen.genAmount.lo;
              ihikey = pigen.genAmount.hi;
              continue;
            }
            if (pigen.genOper === GenVelRange) {
              ilovel = pigen.genAmount.lo;
              ihivel = pigen.genAmount.hi;
              continue;
            }
            if (
              pigen.genOper === GenSampleID &&
              ihikey >= plokey &&
              ilokey <= phikey &&
              ihivel >= plovel &&
              ilovel <= phivel
            )
              preset.regionNum++;
          }
        }
      }
    }

    preset.regions = [];
    const globalRegion = newRegion();
    tsf_region_clear(globalRegion, TSF_TRUE);

    // Zones.
    for (
      let bi = pphdr.presetBagNdx, bEnd = hydra.phdrs[pi + 1]!.presetBagNdx;
      bi !== bEnd;
      bi++
    ) {
      const ppbag = hydra.pbags[bi]!;
      const presetRegion = newRegion();
      copyRegionInto(presetRegion, globalRegion);
      let hadGenInstrument = 0;

      // Generators.
      for (
        let gi = ppbag.genNdx, gEnd = hydra.pbags[bi + 1]!.genNdx;
        gi !== gEnd;
        gi++
      ) {
        const ppgen = hydra.pgens[gi]!;
        // Instrument.
        if (ppgen.genOper === GenInstrument) {
          const whichInst = ppgen.genAmount.wordAmount;
          if (whichInst >= hydra.instNum) continue;

          const instRegion = newRegion();
          tsf_region_clear(instRegion, TSF_FALSE);
          const pinst = hydra.insts[whichInst]!;
          for (
            let ii = pinst.instBagNdx, iEnd = hydra.insts[whichInst + 1]!.instBagNdx;
            ii !== iEnd;
            ii++
          ) {
            // Generators.
            const zoneRegion = newRegion();
            copyRegionInto(zoneRegion, instRegion);
            let hadSampleID = 0;
            for (
              let jj = hydra.ibags[ii]!.instGenNdx, jEnd = hydra.ibags[ii + 1]!.instGenNdx;
              jj !== jEnd;
              jj++
            ) {
              const pigen = hydra.igens[jj]!;
              if (pigen.genOper === GenSampleID) {
                //preset region key and vel ranges are a filter for the zone regions
                if (zoneRegion.hikey < presetRegion.lokey || zoneRegion.lokey > presetRegion.hikey)
                  continue;
                if (zoneRegion.hivel < presetRegion.lovel || zoneRegion.lovel > presetRegion.hivel)
                  continue;
                if (presetRegion.lokey > zoneRegion.lokey) zoneRegion.lokey = presetRegion.lokey;
                if (presetRegion.hikey < zoneRegion.hikey) zoneRegion.hikey = presetRegion.hikey;
                if (presetRegion.lovel > zoneRegion.lovel) zoneRegion.lovel = presetRegion.lovel;
                if (presetRegion.hivel < zoneRegion.hivel) zoneRegion.hivel = presetRegion.hivel;

                //sum regions
                tsf_region_merge(zoneRegion, presetRegion);

                // EG times need to be converted from timecents to seconds.
                tsf_region_envtosecs(zoneRegion.ampenv, TSF_TRUE);
                tsf_region_envtosecs(zoneRegion.modenv, TSF_FALSE);

                // LFO times need to be converted from timecents to seconds.
                zoneRegion.delayModLFO =
                  zoneRegion.delayModLFO < -11950.0 ? 0.0 : tsf_timecents2Secsf(zoneRegion.delayModLFO);
                zoneRegion.delayVibLFO =
                  zoneRegion.delayVibLFO < -11950.0 ? 0.0 : tsf_timecents2Secsf(zoneRegion.delayVibLFO);

                // Fixup sample positions
                const pshdr = hydra.shdrs[pigen.genAmount.wordAmount]!;
                zoneRegion.offset = (zoneRegion.offset + pshdr.start) >>> 0;
                zoneRegion.end = (zoneRegion.end + pshdr.end) >>> 0;
                zoneRegion.loop_start = (zoneRegion.loop_start + pshdr.startLoop) >>> 0;
                zoneRegion.loop_end = (zoneRegion.loop_end + pshdr.endLoop) >>> 0;
                if (pshdr.endLoop > 0) zoneRegion.loop_end = (zoneRegion.loop_end - 1) >>> 0;
                if (zoneRegion.loop_end > fontSampleCount) zoneRegion.loop_end = fontSampleCount;
                if (zoneRegion.pitch_keycenter === -1) zoneRegion.pitch_keycenter = pshdr.originalPitch;
                zoneRegion.tune = (zoneRegion.tune + pshdr.pitchCorrection) | 0;
                zoneRegion.sample_rate = pshdr.sampleRate;
                if (zoneRegion.end && zoneRegion.end < fontSampleCount) zoneRegion.end++;
                else zoneRegion.end = fontSampleCount;

                preset.regions[region_index] = cloneRegion(zoneRegion);
                region_index++;
                hadSampleID = 1;
              } else tsf_region_apply(zoneRegion, pigen.genOper, pigen.genAmount);
            }

            // Handle instrument's global zone.
            if (ii === pinst.instBagNdx && !hadSampleID) copyRegionInto(instRegion, zoneRegion);

            // Modulators (TODO)
          }
          hadGenInstrument = 1;
        } else tsf_region_apply(presetRegion, ppgen.genOper, ppgen.genAmount);
      }

      // Modulators (TODO)

      // Handle preset's global zone.
      if (bi === pphdr.presetBagNdx && !hadGenInstrument) copyRegionInto(globalRegion, presetRegion);
    }
  }
  return true;
}

// tsf.h:975 tsf_load_samples (non-STB_VORBIS path)
function tsf_load_samples(
  pFloatBuffer: { v: Float32Array | null },
  pSmplCount: { v: number },
  chunkSmpl: TsfRiffchunk,
  r: Reader,
): boolean {
  // Inline convert the samples from short to float
  pSmplCount.v = Math.floor(chunkSmpl.size / 2);
  const raw = new Uint8Array(chunkSmpl.size);
  if (!r.readRaw(raw, chunkSmpl.size)) return false;
  const res = new Float32Array(pSmplCount.v);
  // Convert the samples from short to float (walking backward in C to
  // convert in place; a fresh buffer here).
  const inView = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
  for (let i = 0; i < pSmplCount.v; i++)
    res[i] = f32(inView.getInt16(i * 2, true) / 32767.0);
  pFloatBuffer.v = res;
  return true;
}

// ---------------------------------------------------------------------------
// Voice machinery (tsf.h:1005-1359)
// ---------------------------------------------------------------------------

function tsf_voice_envelope_release_samples(e: TsfVoiceEnvelope, outSampleRate: number): number {
  return Math.trunc(
    f32((e.parameters.release <= 0 ? TSF_FASTRELEASETIME : e.parameters.release) * outSampleRate),
  );
}

function tsf_voice_envelope_nextsegment(
  e: TsfVoiceEnvelope,
  active_segment: number,
  outSampleRate: number,
): void {
  // The C is a switch on active_segment that FALLS THROUGH to the next
  // case when a segment would be zero-length; this chain preserves that
  // exactly (TS forbids switch fallthrough).
  let seg = active_segment;
  if (seg === TSF_SEGMENT_NONE) {
    e.samplesUntilNextSegment = Math.trunc(f32(e.parameters.delay * outSampleRate));
    if (e.samplesUntilNextSegment > 0) {
      e.segment = TSF_SEGMENT_DELAY;
      e.segmentIsExponential = TSF_FALSE;
      e.level = 0.0;
      e.slope = 0.0;
      return;
    }
    seg = TSF_SEGMENT_DELAY;
  }
  if (seg === TSF_SEGMENT_DELAY) {
    e.samplesUntilNextSegment = Math.trunc(f32(e.parameters.attack * outSampleRate));
    if (e.samplesUntilNextSegment > 0) {
      if (!e.isAmpEnv) {
        //mod env attack duration scales with velocity (velocity of 1 is full duration, max velocity is 0.125 times duration)
        e.samplesUntilNextSegment = Math.trunc(
          f32(f32(e.parameters.attack * f32((145 - e.midiVelocity) / 144)) * outSampleRate),
        );
      }
      e.segment = TSF_SEGMENT_ATTACK;
      e.segmentIsExponential = TSF_FALSE;
      e.level = 0.0;
      e.slope = f32(1 / e.samplesUntilNextSegment);
      return;
    }
    seg = TSF_SEGMENT_ATTACK;
  }
  if (seg === TSF_SEGMENT_ATTACK) {
    e.samplesUntilNextSegment = Math.trunc(f32(e.parameters.hold * outSampleRate));
    if (e.samplesUntilNextSegment > 0) {
      e.segment = TSF_SEGMENT_HOLD;
      e.segmentIsExponential = TSF_FALSE;
      e.level = 1.0;
      e.slope = 0.0;
      return;
    }
    seg = TSF_SEGMENT_HOLD;
  }
  if (seg === TSF_SEGMENT_HOLD) {
    e.samplesUntilNextSegment = Math.trunc(f32(e.parameters.decay * outSampleRate));
    if (e.samplesUntilNextSegment > 0) {
      e.segment = TSF_SEGMENT_DECAY;
      e.level = 1.0;
      if (e.isAmpEnv) {
        // I don't truly understand this; just following what LinuxSampler does.
        const mysterySlope = f32(F_N9226 / e.samplesUntilNextSegment);
        e.slope = rm_expf(mysterySlope);
        e.segmentIsExponential = TSF_TRUE;
        if (e.parameters.sustain > 0.0) {
          // Again, this is following LinuxSampler's example, which is similar to
          // SF2-style decay, where "decay" specifies the time it would take to
          // get to zero, not to the sustain level.
          e.samplesUntilNextSegment = Math.trunc(rm_log(e.parameters.sustain) / mysterySlope);
        }
      } else {
        e.slope = f32(-1 / e.samplesUntilNextSegment);
        e.samplesUntilNextSegment = Math.trunc(
          f32(f32(e.parameters.decay * f32(1.0 - e.parameters.sustain)) * outSampleRate),
        );
        e.segmentIsExponential = TSF_FALSE;
      }
      return;
    }
    seg = TSF_SEGMENT_DECAY;
  }
  if (seg === TSF_SEGMENT_DECAY) {
    e.segment = TSF_SEGMENT_SUSTAIN;
    e.level = e.parameters.sustain;
    e.slope = 0.0;
    e.samplesUntilNextSegment = 0x7fffffff;
    e.segmentIsExponential = TSF_FALSE;
    return;
  }
  if (seg === TSF_SEGMENT_SUSTAIN) {
    e.segment = TSF_SEGMENT_RELEASE;
    e.samplesUntilNextSegment = tsf_voice_envelope_release_samples(e, outSampleRate);
    if (e.isAmpEnv) {
      // I don't truly understand this; just following what LinuxSampler does.
      const mysterySlope = f32(F_N9226 / e.samplesUntilNextSegment);
      e.slope = rm_expf(mysterySlope);
      e.segmentIsExponential = TSF_TRUE;
    } else {
      e.slope = f32(-e.level / e.samplesUntilNextSegment);
      e.segmentIsExponential = TSF_FALSE;
    }
    return;
  }
  // TSF_SEGMENT_RELEASE and default:
  e.segment = TSF_SEGMENT_DONE;
  e.segmentIsExponential = TSF_FALSE;
  e.level = e.slope = 0.0;
  e.samplesUntilNextSegment = 0x7ffffff;
}

function tsf_voice_envelope_setup(
  e: TsfVoiceEnvelope,
  new_parameters: TsfEnvelope,
  midiNoteNumber: number,
  midiVelocity: number,
  isAmpEnv: boolean,
  outSampleRate: number,
): void {
  e.parameters = { ...new_parameters };
  if (e.parameters.keynumToHold) {
    e.parameters.hold = f32(
      e.parameters.hold + f32(e.parameters.keynumToHold * f32(60 - midiNoteNumber)),
    );
    e.parameters.hold = e.parameters.hold < -10000.0 ? 0.0 : tsf_timecents2Secsf(e.parameters.hold);
  }
  if (e.parameters.keynumToDecay) {
    e.parameters.decay = f32(
      e.parameters.decay + f32(e.parameters.keynumToDecay * f32(60 - midiNoteNumber)),
    );
    e.parameters.decay = e.parameters.decay < -10000.0 ? 0.0 : tsf_timecents2Secsf(e.parameters.decay);
  }
  e.midiVelocity = midiVelocity;
  e.isAmpEnv = isAmpEnv;
  tsf_voice_envelope_nextsegment(e, TSF_SEGMENT_NONE, outSampleRate);
}

function tsf_voice_envelope_process(
  e: TsfVoiceEnvelope,
  numSamples: number,
  outSampleRate: number,
): void {
  if (e.slope) {
    if (e.segmentIsExponential) e.level = f32(e.level * rm_powf(e.slope, numSamples));
    else e.level = f32(e.level + f32(e.slope * numSamples));
  }
  if ((e.samplesUntilNextSegment -= numSamples) <= 0)
    tsf_voice_envelope_nextsegment(e, e.segment, outSampleRate);
}

function tsf_voice_lowpass_setup(e: TsfVoiceLowpass, Fc: number): void {
  // Lowpass filter from http://www.earlevel.com/main/2012/11/26/biquad-c-source-code/
  const K = rm_tan(TSF_PI * Fc),
    KK = K * K;
  const norm = 1 / (1 + K * e.QInv + KK);
  e.a0 = KK * norm;
  e.a1 = 2 * e.a0;
  e.b1 = 2 * (KK - 1) * norm;
  e.b2 = (1 - K * e.QInv + KK) * norm;
}

function tsf_voice_lowpass_process(e: TsfVoiceLowpass, In: number): number {
  const Out = In * e.a0 + e.z1;
  e.z1 = In * e.a1 + e.z2 - e.b1 * Out;
  e.z2 = In * e.a0 - e.b2 * Out;
  return f32(Out);
}

function tsf_voice_lfo_setup(
  e: TsfVoiceLfo,
  delay: number,
  freqCents: number,
  outSampleRate: number,
): void {
  e.samplesUntil = Math.trunc(f32(delay * outSampleRate));
  e.delta = f32(f32(4.0 * tsf_cents2Hertz(freqCents)) / outSampleRate);
  e.level = 0;
}

function tsf_voice_lfo_process(e: TsfVoiceLfo, blockSamples: number): void {
  if (e.samplesUntil > blockSamples) {
    e.samplesUntil -= blockSamples;
    return;
  }
  e.level = f32(e.level + f32(e.delta * blockSamples));
  if (e.level > 1.0) {
    e.delta = -e.delta;
    e.level = f32(2.0 - e.level);
  } else if (e.level < -1.0) {
    e.delta = -e.delta;
    e.level = f32(-2.0 - e.level);
  }
}

function tsf_voice_kill(v: TsfVoice): void {
  v.playingPreset = -1;
}

function tsf_voice_end(f: Tsf, v: TsfVoice): void {
  // if maxVoiceNum is set, assume that voice rendering and note queuing are on separate threads
  // so to minimize the chance that voice rendering would advance the segment at the same time
  // we just do it twice here and hope that it sticks
  let repeats = f.maxVoiceNum ? 2 : 1;
  while (repeats--) {
    tsf_voice_envelope_nextsegment(v.ampenv, TSF_SEGMENT_SUSTAIN, f.outSampleRate);
    tsf_voice_envelope_nextsegment(v.modenv, TSF_SEGMENT_SUSTAIN, f.outSampleRate);
    if (v.region!.loop_mode === TSF_LOOPMODE_SUSTAIN) {
      // Continue playing, but stop looping.
      v.loopEnd = v.loopStart;
    }
  }
}

function tsf_voice_endquick(f: Tsf, v: TsfVoice): void {
  let repeats = f.maxVoiceNum ? 2 : 1;
  while (repeats--) {
    v.ampenv.parameters.release = 0.0;
    tsf_voice_envelope_nextsegment(v.ampenv, TSF_SEGMENT_SUSTAIN, f.outSampleRate);
    v.modenv.parameters.release = 0.0;
    tsf_voice_envelope_nextsegment(v.modenv, TSF_SEGMENT_SUSTAIN, f.outSampleRate);
  }
}

function tsf_voice_calcpitchratio(v: TsfVoice, pitchShift: number, outSampleRate: number): void {
  const region = v.region!;
  const note = v.playingKey + region.transpose + region.tune / 100.0;
  let adjustedPitch = region.pitch_keycenter + (note - region.pitch_keycenter) * (region.pitch_keytrack / 100.0);
  if (pitchShift) adjustedPitch += pitchShift;
  v.pitchInputTimecents = adjustedPitch * 100.0;
  v.pitchOutputFactor =
    region.sample_rate / (tsf_timecents2Secsd(region.pitch_keycenter * 100.0) * outSampleRate);
}

/**
 * tsf.h:1220 tsf_voice_render. `outputBuffer` must be a Float32Array
 * (float stores round like the C float* stores). C pointer walking (outL /
 * outR) is index arithmetic on `outOffset`; for TSF_STEREO_UNWEAVED the R
 * plane starts at outOffset + numSamples exactly as `outR = outL + numSamples`.
 */
function tsf_voice_render(
  f: Tsf,
  v: TsfVoice,
  outputBuffer: Float32Array,
  outOffset: number,
  numSamples: number,
): void {
  const region = v.region!;
  const input = f.fontSamples;
  /** input[pos] with the C one-past-end read mapped to 0 (see notes). */
  const smp = (i: number): number => (i < input.length ? input[i]! : 0);
  let outL = outOffset;
  let outR = f.outputmode === TSF_STEREO_UNWEAVED ? outL + numSamples : -1;

  // Cache some values, to give them at least some chance of ending up in registers.
  const updateModEnv = !!(region.modEnvToPitch || region.modEnvToFilterFc);
  const updateModLFO = !!(
    v.modlfo.delta &&
    (region.modLfoToPitch || region.modLfoToFilterFc || region.modLfoToVolume)
  );
  const updateVibLFO = !!(v.viblfo.delta && region.vibLfoToPitch);
  const isLooping = v.loopStart < v.loopEnd;
  const tmpLoopStart = v.loopStart,
    tmpLoopEnd = v.loopEnd;
  const tmpSampleEndDbl = region.end,
    tmpLoopEndDbl = tmpLoopEnd + 1.0;
  let tmpSourceSamplePosition = v.sourceSamplePosition;
  const tmpLowpass: TsfVoiceLowpass = { ...v.lowpass };

  const dynamicLowpass = !!(region.modLfoToFilterFc || region.modEnvToFilterFc);
  const tmpSampleRate = f.outSampleRate;
  let tmpInitialFilterFc: number, tmpModLfoToFilterFc: number, tmpModEnvToFilterFc: number;

  const dynamicPitchRatio = !!(region.modLfoToPitch || region.modEnvToPitch || region.vibLfoToPitch);
  let pitchRatio: number;
  let tmpModLfoToPitch: number, tmpVibLfoToPitch: number, tmpModEnvToPitch: number;

  const dynamicGain = region.modLfoToVolume !== 0;
  let noteGain = 0;
  let tmpModLfoToVolume: number;

  if (dynamicLowpass)
    (tmpInitialFilterFc = region.initialFilterFc),
      (tmpModLfoToFilterFc = region.modLfoToFilterFc),
      (tmpModEnvToFilterFc = region.modEnvToFilterFc);
  else (tmpInitialFilterFc = 0), (tmpModLfoToFilterFc = 0), (tmpModEnvToFilterFc = 0);

  if (dynamicPitchRatio)
    (pitchRatio = 0),
      (tmpModLfoToPitch = region.modLfoToPitch),
      (tmpVibLfoToPitch = region.vibLfoToPitch),
      (tmpModEnvToPitch = region.modEnvToPitch);
  else
    (pitchRatio = tsf_timecents2Secsd(v.pitchInputTimecents) * v.pitchOutputFactor),
      (tmpModLfoToPitch = 0),
      (tmpVibLfoToPitch = 0),
      (tmpModEnvToPitch = 0);

  if (dynamicGain) tmpModLfoToVolume = f32(region.modLfoToVolume * f32(0.1));
  else (noteGain = tsf_decibelsToGain(v.noteGainDB)), (tmpModLfoToVolume = 0);

  while (numSamples) {
    let gainMono: number, gainLeft: number, gainRight: number;
    let blockSamples = numSamples > TSF_RENDER_EFFECTSAMPLEBLOCK ? TSF_RENDER_EFFECTSAMPLEBLOCK : numSamples;
    numSamples -= blockSamples;

    if (dynamicLowpass) {
      const fres = f32(
        f32(tmpInitialFilterFc + f32(v.modlfo.level * tmpModLfoToFilterFc)) +
          f32(v.modenv.level * tmpModEnvToFilterFc),
      );
      const lowpassFc = fres <= 13500 ? f32(tsf_cents2Hertz(fres) / tmpSampleRate) : 1.0;
      tmpLowpass.active = lowpassFc < 0.499;
      if (tmpLowpass.active) tsf_voice_lowpass_setup(tmpLowpass, lowpassFc);
    }

    if (dynamicPitchRatio)
      pitchRatio =
        tsf_timecents2Secsd(
          v.pitchInputTimecents +
            f32(
              f32(f32(v.modlfo.level * tmpModLfoToPitch) + f32(v.viblfo.level * tmpVibLfoToPitch)) +
                f32(v.modenv.level * tmpModEnvToPitch),
            ),
        ) * v.pitchOutputFactor;

    if (dynamicGain)
      noteGain = tsf_decibelsToGain(f32(v.noteGainDB + f32(v.modlfo.level * tmpModLfoToVolume)));

    gainMono = f32(noteGain * v.ampenv.level);

    // Update EG.
    tsf_voice_envelope_process(v.ampenv, blockSamples, tmpSampleRate);
    if (updateModEnv) tsf_voice_envelope_process(v.modenv, blockSamples, tmpSampleRate);

    // Update LFOs.
    if (updateModLFO) tsf_voice_lfo_process(v.modlfo, blockSamples);
    if (updateVibLFO) tsf_voice_lfo_process(v.viblfo, blockSamples);

    switch (f.outputmode) {
      case TSF_STEREO_INTERLEAVED:
        gainLeft = f32(gainMono * v.panFactorLeft);
        gainRight = f32(gainMono * v.panFactorRight);
        while (blockSamples-- && tmpSourceSamplePosition < tmpSampleEndDbl) {
          const pos = Math.floor(tmpSourceSamplePosition) >>> 0,
            nextPos = pos >= tmpLoopEnd && isLooping ? tmpLoopStart : pos + 1;

          // Simple linear interpolation.
          const alpha = f32(tmpSourceSamplePosition - pos);
          let val = f32(f32(smp(pos) * f32(1.0 - alpha)) + f32(smp(nextPos) * alpha));

          // Low-pass filter.
          if (tmpLowpass.active) val = tsf_voice_lowpass_process(tmpLowpass, val);

          outputBuffer[outL] = outputBuffer[outL]! + f32(val * gainLeft);
          outputBuffer[outL + 1] = outputBuffer[outL + 1]! + f32(val * gainRight);
          outL += 2;

          // Next sample.
          tmpSourceSamplePosition += pitchRatio;
          if (tmpSourceSamplePosition >= tmpLoopEndDbl && isLooping)
            tmpSourceSamplePosition -= tmpLoopEnd - tmpLoopStart + 1.0;
        }
        break;

      case TSF_STEREO_UNWEAVED:
        gainLeft = f32(gainMono * v.panFactorLeft);
        gainRight = f32(gainMono * v.panFactorRight);
        while (blockSamples-- && tmpSourceSamplePosition < tmpSampleEndDbl) {
          const pos = Math.floor(tmpSourceSamplePosition) >>> 0,
            nextPos = pos >= tmpLoopEnd && isLooping ? tmpLoopStart : pos + 1;

          // Simple linear interpolation.
          const alpha = f32(tmpSourceSamplePosition - pos);
          let val = f32(f32(smp(pos) * f32(1.0 - alpha)) + f32(smp(nextPos) * alpha));

          // Low-pass filter.
          if (tmpLowpass.active) val = tsf_voice_lowpass_process(tmpLowpass, val);

          outputBuffer[outL] = outputBuffer[outL]! + f32(val * gainLeft);
          outputBuffer[outR] = outputBuffer[outR]! + f32(val * gainRight);
          outL += 1;
          outR += 1;

          // Next sample.
          tmpSourceSamplePosition += pitchRatio;
          if (tmpSourceSamplePosition >= tmpLoopEndDbl && isLooping)
            tmpSourceSamplePosition -= tmpLoopEnd - tmpLoopStart + 1.0;
        }
        break;

      case TSF_MONO:
        while (blockSamples-- && tmpSourceSamplePosition < tmpSampleEndDbl) {
          const pos = Math.floor(tmpSourceSamplePosition) >>> 0,
            nextPos = pos >= tmpLoopEnd && isLooping ? tmpLoopStart : pos + 1;

          // Simple linear interpolation.
          const alpha = f32(tmpSourceSamplePosition - pos);
          let val = f32(f32(smp(pos) * f32(1.0 - alpha)) + f32(smp(nextPos) * alpha));

          // Low-pass filter.
          if (tmpLowpass.active) val = tsf_voice_lowpass_process(tmpLowpass, val);

          outputBuffer[outL] = outputBuffer[outL]! + f32(val * gainMono);
          outL += 1;

          // Next sample.
          tmpSourceSamplePosition += pitchRatio;
          if (tmpSourceSamplePosition >= tmpLoopEndDbl && isLooping)
            tmpSourceSamplePosition -= tmpLoopEnd - tmpLoopStart + 1.0;
        }
        break;
    }

    if (tmpSourceSamplePosition >= tmpSampleEndDbl || v.ampenv.segment === TSF_SEGMENT_DONE) {
      tsf_voice_kill(v);
      return;
    }
  }

  v.sourceSamplePosition = tmpSourceSamplePosition;
  if (tmpLowpass.active || dynamicLowpass) v.lowpass = tmpLowpass;
}

// ---------------------------------------------------------------------------
// Loading + instance management (tsf.h:1361-1501)
// ---------------------------------------------------------------------------

function tsf_load_stream(stream: TsfStream): Tsf | null {
  const r = makeReader(stream);
  let res: Tsf | null = null;
  const chunkHead: TsfRiffchunk = { id: '', size: 0 };
  const chunkList: TsfRiffchunk = { id: '', size: 0 };
  const hydra: TsfHydra = {
    phdrs: [],
    pbags: [],
    pmods: [],
    pgens: [],
    insts: [],
    ibags: [],
    imods: [],
    igens: [],
    shdrs: [],
    phdrNum: 0,
    pbagNum: 0,
    pmodNum: 0,
    pgenNum: 0,
    instNum: 0,
    ibagNum: 0,
    imodNum: 0,
    igenNum: 0,
    shdrNum: 0,
  };
  let floatBuffer: Float32Array | null = null;
  let smplCount = 0;

  if (!tsf_riffchunk_read(null, chunkHead, r) || !TSF_FourCCEquals(chunkHead.id, 'sfbk')) {
    return res;
  }

  // Read hydra and locate sample data.
  const chunkSizes: Record<string, number> = {
    phdr: 38,
    pbag: 4,
    pmod: 10,
    pgen: 4,
    inst: 22,
    ibag: 4,
    imod: 10,
    igen: 4,
    shdr: 46,
  };
  let out_of_memory = false;

  while (tsf_riffchunk_read(chunkHead, chunkList, r)) {
    const chunk: TsfRiffchunk = { id: '', size: 0 };
    if (TSF_FourCCEquals(chunkList.id, 'pdta')) {
      while (tsf_riffchunk_read(chunkList, chunk, r)) {
        const name = chunk.id;
        const sizeInFile = chunkSizes[name];
        if (sizeInFile !== undefined && chunk.size % sizeInFile === 0) {
          const num = chunk.size / sizeInFile;
          switch (name) {
            case 'phdr':
              hydra.phdrNum = num;
              hydra.phdrs = [];
              for (let i = 0; i < num; ++i) {
                const e: TsfHydraPhdr = {
                  presetName: '',
                  preset: 0,
                  bank: 0,
                  presetBagNdx: 0,
                  library: 0,
                  genre: 0,
                  morphology: 0,
                };
                tsf_hydra_read_phdr(e, r);
                hydra.phdrs.push(e);
              }
              break;
            case 'pbag':
              hydra.pbagNum = num;
              hydra.pbags = [];
              for (let i = 0; i < num; ++i) {
                const e: TsfHydraPbag = { genNdx: 0, modNdx: 0 };
                tsf_hydra_read_pbag(e, r);
                hydra.pbags.push(e);
              }
              break;
            case 'pmod':
              hydra.pmodNum = num;
              hydra.pmods = [];
              for (let i = 0; i < num; ++i) {
                const e: TsfHydraPmod = {
                  modSrcOper: 0,
                  modDestOper: 0,
                  modAmount: 0,
                  modAmtSrcOper: 0,
                  modTransOper: 0,
                };
                tsf_hydra_read_pmod(e, r);
                hydra.pmods.push(e);
              }
              break;
            case 'pgen':
              hydra.pgenNum = num;
              hydra.pgens = [];
              for (let i = 0; i < num; ++i) {
                const e: TsfHydraPgen = {
                  genOper: 0,
                  genAmount: { lo: 0, hi: 0, shortAmount: 0, wordAmount: 0 },
                };
                tsf_hydra_read_pgen(e, r);
                hydra.pgens.push(e);
              }
              break;
            case 'inst':
              hydra.instNum = num;
              hydra.insts = [];
              for (let i = 0; i < num; ++i) {
                const e: TsfHydraInst = { instName: '', instBagNdx: 0 };
                tsf_hydra_read_inst(e, r);
                hydra.insts.push(e);
              }
              break;
            case 'ibag':
              hydra.ibagNum = num;
              hydra.ibags = [];
              for (let i = 0; i < num; ++i) {
                const e: TsfHydraIbag = { instGenNdx: 0, instModNdx: 0 };
                tsf_hydra_read_ibag(e, r);
                hydra.ibags.push(e);
              }
              break;
            case 'imod':
              hydra.imodNum = num;
              hydra.imods = [];
              for (let i = 0; i < num; ++i) {
                const e: TsfHydraImod = {
                  modSrcOper: 0,
                  modDestOper: 0,
                  modAmount: 0,
                  modAmtSrcOper: 0,
                  modTransOper: 0,
                };
                tsf_hydra_read_imod(e, r);
                hydra.imods.push(e);
              }
              break;
            case 'igen':
              hydra.igenNum = num;
              hydra.igens = [];
              for (let i = 0; i < num; ++i) {
                const e: TsfHydraIgen = {
                  genOper: 0,
                  genAmount: { lo: 0, hi: 0, shortAmount: 0, wordAmount: 0 },
                };
                tsf_hydra_read_igen(e, r);
                hydra.igens.push(e);
              }
              break;
            case 'shdr':
              hydra.shdrNum = num;
              hydra.shdrs = [];
              for (let i = 0; i < num; ++i) {
                const e: TsfHydraShdr = {
                  sampleName: '',
                  start: 0,
                  end: 0,
                  startLoop: 0,
                  endLoop: 0,
                  sampleRate: 0,
                  originalPitch: 0,
                  pitchCorrection: 0,
                  sampleLink: 0,
                  sampleType: 0,
                };
                tsf_hydra_read_shdr(e, r);
                hydra.shdrs.push(e);
              }
              break;
          }
        } else r.skip(chunk.size);
      }
    } else if (TSF_FourCCEquals(chunkList.id, 'sdta')) {
      while (tsf_riffchunk_read(chunkList, chunk, r)) {
        if (
          TSF_FourCCEquals(chunk.id, 'smpl') &&
          !floatBuffer &&
          chunk.size >= 2
        ) {
          const fb: { v: Float32Array | null } = { v: floatBuffer };
          const sc: { v: number } = { v: smplCount };
          if (!tsf_load_samples(fb, sc, chunk, r)) {
            out_of_memory = true;
            break;
          }
          floatBuffer = fb.v;
          smplCount = sc.v;
        } else r.skip(chunk.size);
      }
    } else r.skip(chunkList.size);
    if (out_of_memory) break;
  }

  if (
    !hydra.phdrs.length ||
    !hydra.pbags.length ||
    !hydra.pmods.length ||
    !hydra.pgens.length ||
    !hydra.insts.length ||
    !hydra.ibags.length ||
    !hydra.imods.length ||
    !hydra.igens.length ||
    !hydra.shdrs.length
  ) {
    // TSF_INVALID_INCOMPLETE
  } else if (!floatBuffer) {
    // TSF_INVALID_NOSAMPLEDATA
  } else if (!out_of_memory) {
    res = new Tsf();
    if (!tsf_load_presets(res, hydra, smplCount)) {
      res = null;
      out_of_memory = true;
    } else {
      res.outSampleRate = 44100.0;
      res.fontSamples = floatBuffer;
      floatBuffer = null; // don't free below
    }
  }
  return res;
}

function tsf_copy(f: Tsf): Tsf | null {
  if (!f) return null;
  if (!f.refCount) {
    f.refCount = { n: 1 };
  }
  const res = new Tsf();
  Object.assign(res, f);
  res.voices = [];
  res.voiceNum = 0;
  res.channels = null;
  res.refCount = f.refCount;
  f.refCount.n++;
  return res;
}

function tsf_close(f: Tsf): void {
  if (!f) return;
  if (!f.refCount || !--f.refCount.n) {
    // free presets + fontSamples (GC handles the TS side)
  }
  // GC handles channels/voices
}

function tsf_reset(f: Tsf): void {
  for (const v of f.voices)
    if (v.playingPreset !== -1 && (v.ampenv.segment < TSF_SEGMENT_RELEASE || v.ampenv.parameters.release))
      tsf_voice_endquick(f, v);
  f.channels = null;
}

// ---------------------------------------------------------------------------
// Preset queries (tsf.h:1503-1526)
// ---------------------------------------------------------------------------

function tsf_get_presetindex(f: Tsf, bank: number, preset_number: number): number {
  for (let i = 0, iMax = f.presetNum; i < iMax; i++)
    if (f.presets[i]!.preset === preset_number && f.presets[i]!.bank === bank) return i;
  return -1;
}

function tsf_get_presetcount(f: Tsf): number {
  return f.presetNum;
}

function tsf_get_presetname(f: Tsf, preset: number): string | null {
  return preset < 0 || preset >= f.presetNum ? null : f.presets[preset]!.presetName;
}

function tsf_bank_get_presetname(f: Tsf, bank: number, preset_number: number): string | null {
  return tsf_get_presetname(f, tsf_get_presetindex(f, bank, preset_number));
}

// ---------------------------------------------------------------------------
// Output setup (tsf.h:1528-1551)
// ---------------------------------------------------------------------------

function tsf_set_output(
  f: Tsf,
  outputmode: number,
  samplerate: number,
  global_gain_db = 0,
): void {
  f.outputmode = outputmode;
  f.outSampleRate = f32(samplerate >= 1 ? samplerate : 44100);
  f.globalGainDB = f32(global_gain_db);
}

function tsf_set_volume(f: Tsf, global_volume: number): void {
  f.globalGainDB =
    global_volume === 1.0 ? 0 : f32(-tsf_gainToDecibels(f32(1.0 / global_volume)));
}

function tsf_set_max_voices(f: Tsf, max_voices: number): boolean {
  let i = f.voiceNum;
  const newVoiceNum = f.voiceNum > max_voices ? f.voiceNum : max_voices;
  while (f.voices.length < newVoiceNum) f.voices.push(newVoice());
  f.voiceNum = f.maxVoiceNum = newVoiceNum;
  for (; i < max_voices; i++) f.voices[i]!.playingPreset = -1;
  return true;
}

// ---------------------------------------------------------------------------
// Note on/off (tsf.h:1553-1708)
// ---------------------------------------------------------------------------

function tsf_note_on(f: Tsf, preset_index: number, key: number, vel: number): number {
  const midiVelocity = Math.trunc(f32(vel * 127));
  let voicePlayIndex: number;

  if (preset_index < 0 || preset_index >= f.presetNum) return 1;
  if (vel <= 0.0) {
    tsf_note_off(f, preset_index, key);
    return 1;
  }

  // Play all matching regions.
  voicePlayIndex = f.voicePlayIndex;
  f.voicePlayIndex = (f.voicePlayIndex + 1) >>> 0;
  const preset = f.presets[preset_index]!;
  for (let ri = 0; ri < preset.regionNum; ri++) {
    const region = preset.regions[ri];
    if (!region) continue; // malformed font (count/fill mismatch): C reads malloc garbage
    let voice: TsfVoice | null = null;
    if (key < region.lokey || key > region.hikey || midiVelocity < region.lovel || midiVelocity > region.hivel)
      continue;

    voice = null;
    if (region.group) {
      for (const v of f.voices) {
        if (v.playingPreset === preset_index && v.region!.group === region.group) tsf_voice_endquick(f, v);
        else if (v.playingPreset === -1 && !voice) voice = v;
      }
    } else
      for (const v of f.voices)
        if (v.playingPreset === -1) {
          voice = v;
          break;
        }

    if (!voice) {
      if (f.maxVoiceNum) {
        // Voices have been pre-allocated and limited to a maximum, try to kill a voice off in its release envelope
        let bestKillReleaseSamplePos = -999999999;
        for (const v of f.voices) {
          if (v.ampenv.segment === TSF_SEGMENT_RELEASE) {
            // We're looking for the voice furthest into its release
            const releaseSamplesDone =
              tsf_voice_envelope_release_samples(v.ampenv, f.outSampleRate) -
              v.ampenv.samplesUntilNextSegment;
            if (releaseSamplesDone > bestKillReleaseSamplePos) {
              bestKillReleaseSamplePos = releaseSamplesDone;
              voice = v;
            }
          }
        }
        if (!voice) continue;
        tsf_voice_kill(voice);
      } else {
        // Allocate more voices so we don't need to kill one off.
        f.voiceNum += 4;
        while (f.voices.length < f.voiceNum) f.voices.push(newVoice());
        voice = f.voices[f.voiceNum - 4]!;
        f.voices[f.voiceNum - 3]!.playingPreset = -1;
        f.voices[f.voiceNum - 2]!.playingPreset = -1;
        f.voices[f.voiceNum - 1]!.playingPreset = -1;
      }
    }

    voice.region = region;
    voice.playingPreset = preset_index;
    voice.playingKey = key;
    voice.playIndex = voicePlayIndex;
    voice.heldSustain = 0;
    voice.noteGainDB = f32(
      f32(f.globalGainDB - region.attenuation) - tsf_gainToDecibels(f32(1.0 / vel)),
    );

    if (f.channels) {
      tsf_channel_setup_voice(f, voice);
    } else {
      tsf_voice_calcpitchratio(voice, 0, f.outSampleRate);
      // The SFZ spec is silent about the pan curve, but a 3dB pan law seems common.
      voice.panFactorLeft = f32(Math.sqrt(f32(0.5 - region.pan)));
      voice.panFactorRight = f32(Math.sqrt(f32(0.5 + region.pan)));
    }

    // Offset/end.
    voice.sourceSamplePosition = region.offset;

    // Loop.
    const doLoop = region.loop_mode !== TSF_LOOPMODE_NONE && region.loop_start < region.loop_end;
    voice.loopStart = doLoop ? region.loop_start : 0;
    voice.loopEnd = doLoop ? region.loop_end : 0;

    // Setup envelopes.
    tsf_voice_envelope_setup(voice.ampenv, region.ampenv, key, midiVelocity, TSF_TRUE, f.outSampleRate);
    tsf_voice_envelope_setup(voice.modenv, region.modenv, key, midiVelocity, TSF_FALSE, f.outSampleRate);

    // Setup lowpass filter.
    const lowpassFc =
      region.initialFilterFc <= 13500
        ? f32(tsf_cents2Hertz(region.initialFilterFc) / f.outSampleRate)
        : 1.0;
    const lowpassFilterQDB = f32(region.initialFilterQ / 10);
    voice.lowpass.QInv = 1.0 / rm_pow(10.0, lowpassFilterQDB / 20.0);
    voice.lowpass.z1 = voice.lowpass.z2 = 0;
    voice.lowpass.active = lowpassFc < 0.499;
    if (voice.lowpass.active) tsf_voice_lowpass_setup(voice.lowpass, lowpassFc);

    // Setup LFO filters.
    tsf_voice_lfo_setup(voice.modlfo, region.delayModLFO, region.freqModLFO, f.outSampleRate);
    tsf_voice_lfo_setup(voice.viblfo, region.delayVibLFO, region.freqVibLFO, f.outSampleRate);
  }
  return 1;
}

function tsf_bank_note_on(f: Tsf, bank: number, preset_number: number, key: number, vel: number): number {
  const preset_index = tsf_get_presetindex(f, bank, preset_number);
  if (preset_index === -1) return 0;
  return tsf_note_on(f, preset_index, key, vel);
}

function tsf_note_off(f: Tsf, preset_index: number, key: number): void {
  let vMatchFirst: TsfVoice | null = null,
    vMatchLast: TsfVoice | null = null;
  for (const v of f.voices) {
    //Find the first and last entry in the voices list with matching preset, key and look up the smallest play index
    if (v.playingPreset !== preset_index || v.playingKey !== key || v.ampenv.segment >= TSF_SEGMENT_RELEASE)
      continue;
    else if (!vMatchFirst || v.playIndex < vMatchFirst.playIndex) vMatchFirst = vMatchLast = v;
    else if (v.playIndex === vMatchFirst.playIndex) vMatchLast = v;
  }
  if (!vMatchFirst) return;
  const first = vMatchFirst;
  const iFirst = f.voices.indexOf(first),
    iLast = f.voices.indexOf(vMatchLast!); // C: set together with vMatchFirst
  for (let i = iFirst; i <= iLast; i++) {
    const v = f.voices[i]!;
    //Stop all voices with matching preset, key and the smallest play index which was enumerated above
    if (
      v !== first &&
      v !== vMatchLast &&
      (v.playIndex !== first.playIndex ||
        v.playingPreset !== preset_index ||
        v.playingKey !== key ||
        v.ampenv.segment >= TSF_SEGMENT_RELEASE)
    )
      continue;
    tsf_voice_end(f, v);
  }
}

function tsf_bank_note_off(f: Tsf, bank: number, preset_number: number, key: number): number {
  const preset_index = tsf_get_presetindex(f, bank, preset_number);
  if (preset_index === -1) return 0;
  tsf_note_off(f, preset_index, key);
  return 1;
}

function tsf_note_off_all(f: Tsf): void {
  for (const v of f.voices)
    if (v.playingPreset !== -1 && v.ampenv.segment < TSF_SEGMENT_RELEASE) tsf_voice_end(f, v);
}

function tsf_active_voice_count(f: Tsf): number {
  let count = 0;
  for (const v of f.voices) if (v.playingPreset !== -1) count++;
  return count;
}

// ---------------------------------------------------------------------------
// Rendering (tsf.h:1710-1745)
// ---------------------------------------------------------------------------

function tsf_render_float(f: Tsf, buffer: Float32Array, offset: number, samples: number, flag_mixing: boolean): void {
  const channels = f.outputmode === TSF_MONO ? 1 : 2;
  if (!flag_mixing) buffer.fill(0, offset, offset + channels * samples);
  for (const v of f.voices) if (v.playingPreset !== -1) tsf_voice_render(f, v, buffer, offset, samples);
}

function tsf_render_short(f: Tsf, buffer: Int16Array, offset: number, samples: number, flag_mixing: boolean): void {
  const outputSamples = new Float32Array(TSF_RENDER_SHORTBUFFERBLOCK);
  const channels = f.outputmode === TSF_MONO ? 1 : 2,
    maxChannelSamples = TSF_RENDER_SHORTBUFFERBLOCK / channels;
  let bi = offset;
  while (samples > 0) {
    const channelSamples = samples > maxChannelSamples ? maxChannelSamples : samples;
    tsf_render_float(f, outputSamples, 0, channelSamples, TSF_FALSE);
    samples -= channelSamples;

    if (flag_mixing)
      for (let i = 0; i < channelSamples * channels; i++) {
        const v = outputSamples[i]!;
        const vi =
          buffer[bi]! +
          (v < F_THRES_LO ? -32768 : v > F_THRES_HI ? 32767 : Math.trunc(f32(v * F32767_5)));
        buffer[bi++] = vi < -32768 ? -32768 : vi > 32767 ? 32767 : vi;
      }
    else
      for (let i = 0; i < channelSamples * channels; i++) {
        const v = outputSamples[i]!;
        buffer[bi++] = v < F_THRES_LO ? -32768 : v > F_THRES_HI ? 32767 : Math.trunc(f32(v * F32767_5));
      }
  }
}

// ---------------------------------------------------------------------------
// Channels (tsf.h:1747-2073)
// ---------------------------------------------------------------------------

function tsf_channel_setup_voice(f: Tsf, v: TsfVoice): void {
  const c = f.channels!.channels[f.channels!.activeChannel]!;
  const newpan = f32(v.region!.pan + c.panOffset);
  v.playingChannel = f.channels!.activeChannel;
  v.noteGainDB = f32(v.noteGainDB + c.gainDB);
  tsf_voice_calcpitchratio(
    v,
    c.pitchWheel === 8192
      ? c.tuning
      : f32(f32(f32(f32(f32(c.pitchWheel / F_16383) * c.pitchRange) * 2.0) - c.pitchRange) + c.tuning),
    f.outSampleRate,
  );
  if (newpan <= -0.5) {
    v.panFactorLeft = 1.0;
    v.panFactorRight = 0.0;
  } else if (newpan >= 0.5) {
    v.panFactorLeft = 0.0;
    v.panFactorRight = 1.0;
  } else {
    v.panFactorLeft = f32(Math.sqrt(f32(0.5 - newpan)));
    v.panFactorRight = f32(Math.sqrt(f32(0.5 + newpan)));
  }
}

function tsf_channel_init(f: Tsf, channel: number): TsfChannel | null {
  if (f.channels && channel < f.channels.channelNum) return f.channels.channels[channel]!;
  if (!f.channels) {
    f.channels = { channelNum: 0, activeChannel: 0, channels: [] };
  }
  let i = f.channels.channelNum;
  f.channels.channelNum = channel + 1;
  for (; i <= channel; i++) {
    const c = newChannel();
    f.channels.channels[i] = c;
  }
  return f.channels.channels[channel]!;
}

function tsf_channel_applypitch(f: Tsf, channel: number, c: TsfChannel): void {
  const pitchShift =
    c.pitchWheel === 8192
      ? c.tuning
      : f32(f32(f32(f32(f32(c.pitchWheel / F_16383) * c.pitchRange) * 2.0) - c.pitchRange) + c.tuning);
  for (const v of f.voices)
    if (v.playingPreset !== -1 && v.playingChannel === channel)
      tsf_voice_calcpitchratio(v, pitchShift, f.outSampleRate);
}

function tsf_channel_set_presetindex(f: Tsf, channel: number, preset_index: number): number {
  const c = tsf_channel_init(f, channel);
  if (!c) return 0;
  c.presetIndex = preset_index & 0xffff;
  return 1;
}

function tsf_channel_set_presetnumber(
  f: Tsf,
  channel: number,
  preset_number: number,
  flag_mididrums = false,
): number {
  let preset_index: number;
  const c = tsf_channel_init(f, channel);
  if (!c) return 0;
  if (flag_mididrums) {
    preset_index = tsf_get_presetindex(f, 128 | (c.bank & 0x7fff), preset_number);
    if (preset_index === -1) preset_index = tsf_get_presetindex(f, 128, preset_number);
    if (preset_index === -1) preset_index = tsf_get_presetindex(f, 128, 0);
    if (preset_index === -1) preset_index = tsf_get_presetindex(f, c.bank & 0x7fff, preset_number);
  } else preset_index = tsf_get_presetindex(f, c.bank & 0x7fff, preset_number);
  if (preset_index === -1) preset_index = tsf_get_presetindex(f, 0, preset_number);
  if (preset_index !== -1) {
    c.presetIndex = preset_index & 0xffff;
    return 1;
  }
  return 0;
}

function tsf_channel_set_bank(f: Tsf, channel: number, bank: number): number {
  const c = tsf_channel_init(f, channel);
  if (!c) return 0;
  c.bank = bank & 0xffff;
  return 1;
}

function tsf_channel_set_bank_preset(f: Tsf, channel: number, bank: number, preset_number: number): number {
  const c = tsf_channel_init(f, channel);
  if (!c) return 0;
  const preset_index = tsf_get_presetindex(f, bank, preset_number);
  if (preset_index === -1) return 0;
  c.presetIndex = preset_index & 0xffff;
  c.bank = bank & 0xffff;
  return 1;
}

function tsf_channel_set_pan(f: Tsf, channel: number, pan: number): number {
  const c = tsf_channel_init(f, channel);
  if (!c) return 0;
  for (const v of f.voices)
    if (v.playingPreset !== -1 && v.playingChannel === channel) {
      const newpan = f32(f32(v.region!.pan + pan) - 0.5);
      if (newpan <= -0.5) {
        v.panFactorLeft = 1.0;
        v.panFactorRight = 0.0;
      } else if (newpan >= 0.5) {
        v.panFactorLeft = 0.0;
        v.panFactorRight = 1.0;
      } else {
        v.panFactorLeft = f32(Math.sqrt(f32(0.5 - newpan)));
        v.panFactorRight = f32(Math.sqrt(f32(0.5 + newpan)));
      }
    }
  c.panOffset = f32(pan - 0.5);
  return 1;
}

function tsf_channel_set_volume(f: Tsf, channel: number, volume: number): number {
  const gainDB = tsf_gainToDecibels(volume);
  const c = tsf_channel_init(f, channel);
  if (!c) return 0;
  if (gainDB === c.gainDB) return 1;
  const gainDBChange = f32(gainDB - c.gainDB);
  for (const v of f.voices)
    if (v.playingPreset !== -1 && v.playingChannel === channel) v.noteGainDB = f32(v.noteGainDB + gainDBChange);
  c.gainDB = gainDB;
  return 1;
}

function tsf_channel_set_pitchwheel(f: Tsf, channel: number, pitch_wheel: number): number {
  const c = tsf_channel_init(f, channel);
  if (!c) return 0;
  if (c.pitchWheel === pitch_wheel) return 1;
  c.pitchWheel = pitch_wheel & 0xffff;
  tsf_channel_applypitch(f, channel, c);
  return 1;
}

function tsf_channel_set_pitchrange(f: Tsf, channel: number, pitch_range: number): number {
  const c = tsf_channel_init(f, channel);
  if (!c) return 0;
  if (c.pitchRange === pitch_range) return 1;
  c.pitchRange = pitch_range;
  if (c.pitchWheel !== 8192) tsf_channel_applypitch(f, channel, c);
  return 1;
}

function tsf_channel_set_tuning(f: Tsf, channel: number, tuning: number): number {
  const c = tsf_channel_init(f, channel);
  if (!c) return 0;
  if (c.tuning === tuning) return 1;
  c.tuning = tuning;
  tsf_channel_applypitch(f, channel, c);
  return 1;
}

function tsf_channel_set_sustain(f: Tsf, channel: number, flag_sustain: number | boolean): number {
  const c = tsf_channel_init(f, channel);
  if (!c) return 0;
  if (!c.sustain === !flag_sustain) return 1;
  c.sustain = flag_sustain ? 1 : 0;
  //Turning on sustain does no action now, just starts note_off behaving differently
  if (flag_sustain) return 1;
  //Turning off sustain, actually end voices that got a note_off and were set to heldSustain status
  for (const v of f.voices)
    if (
      v.playingPreset !== -1 &&
      v.playingChannel === channel &&
      v.ampenv.segment < TSF_SEGMENT_RELEASE &&
      v.heldSustain
    )
      tsf_voice_end(f, v);
  return 1;
}

function tsf_channel_note_on(f: Tsf, channel: number, key: number, vel: number): number {
  if (!f.channels || channel >= f.channels.channelNum) return 1;
  f.channels.activeChannel = channel;
  if (!vel) {
    tsf_channel_note_off(f, channel, key);
    return 1;
  }
  return tsf_note_on(f, f.channels.channels[channel]!.presetIndex, key, vel);
}

function tsf_channel_note_off(f: Tsf, channel: number, key: number): void {
  let vMatchFirst: TsfVoice | null = null,
    vMatchLast: TsfVoice | null = null;
  for (const v of f.voices) {
    //Find the first and last entry in the voices list with matching channel, key and look up the smallest play index
    if (
      v.playingPreset === -1 ||
      v.playingChannel !== channel ||
      v.playingKey !== key ||
      v.ampenv.segment >= TSF_SEGMENT_RELEASE ||
      v.heldSustain
    )
      continue;
    else if (!vMatchFirst || v.playIndex < vMatchFirst.playIndex) vMatchFirst = vMatchLast = v;
    else if (v.playIndex === vMatchFirst.playIndex) vMatchLast = v;
  }
  if (!vMatchFirst) return;
  const first = vMatchFirst;
  const sustain = f.channels!.channels[channel]!.sustain;
  const iFirst = f.voices.indexOf(first),
    iLast = f.voices.indexOf(vMatchLast!); // C: set together with vMatchFirst
  for (let i = iFirst; i <= iLast; i++) {
    const v = f.voices[i]!;
    //Stop all voices with matching channel, key and the smallest play index which was enumerated above
    if (
      v !== first &&
      v !== vMatchLast &&
      (v.playIndex !== first.playIndex ||
        v.playingPreset === -1 ||
        v.playingChannel !== channel ||
        v.playingKey !== key ||
        v.ampenv.segment >= TSF_SEGMENT_RELEASE)
    )
      continue;
    //Don't turn off if sustain is active, just mark as held by sustain so we don't forget it
    if (sustain) v.heldSustain = 1;
    else tsf_voice_end(f, v);
  }
}

function tsf_channel_note_off_all(f: Tsf, channel: number): void {
  //Ignore sustain channel settings, note_off_all overrides
  for (const v of f.voices)
    if (v.playingPreset !== -1 && v.playingChannel === channel && v.ampenv.segment < TSF_SEGMENT_RELEASE)
      tsf_voice_end(f, v);
}

function tsf_channel_sounds_off_all(f: Tsf, channel: number): void {
  for (const v of f.voices)
    if (
      v.playingPreset !== -1 &&
      v.playingChannel === channel &&
      (v.ampenv.segment < TSF_SEGMENT_RELEASE || v.ampenv.parameters.release)
    )
      tsf_voice_endquick(f, v);
}

function tsf_channel_midi_control(f: Tsf, channel: number, controller: number, control_value: number): number {
  const c = tsf_channel_init(f, channel);
  if (!c) return 0;
  switch (controller) {
    case 7 /*VOLUME_MSB*/:
      c.midiVolume = ((c.midiVolume & 0x7f) | (control_value << 7)) & 0xffff;
      break;
    case 39 /*VOLUME_LSB*/:
      c.midiVolume = ((c.midiVolume & 0x3f80) | control_value) & 0xffff;
      break;
    case 11 /*EXPRESSION_MSB*/:
      c.midiExpression = ((c.midiExpression & 0x7f) | (control_value << 7)) & 0xffff;
      break;
    case 43 /*EXPRESSION_LSB*/:
      c.midiExpression = ((c.midiExpression & 0x3f80) | control_value) & 0xffff;
      break;
    case 10 /*PAN_MSB*/:
      c.midiPan = ((c.midiPan & 0x7f) | (control_value << 7)) & 0xffff;
      break;
    case 42 /*PAN_LSB*/:
      c.midiPan = ((c.midiPan & 0x3f80) | control_value) & 0xffff;
      break;
    case 6 /*DATA_ENTRY_MSB*/:
      c.midiData = ((c.midiData & 0x7f) | (control_value << 7)) & 0x3fff;
      break;
    case 38 /*DATA_ENTRY_LSB*/:
      c.midiData = ((c.midiData & 0x3f80) | control_value) & 0x3fff;
      break;
    case 0 /*BANK_SELECT_MSB*/:
      c.bank = (0x8000 | control_value) & 0xffff;
      return 1; //bank select MSB alone acts like LSB
    case 32 /*BANK_SELECT_LSB*/:
      c.bank = ((c.bank & 0x8000 ? ((c.bank & 0x7f) << 7) : 0) | control_value) & 0xffff;
      return 1;
    case 101 /*RPN_MSB*/:
      c.midiRPN = (((c.midiRPN === 0xffff ? 0 : c.midiRPN) & 0x7f) | (control_value << 7)) & 0xffff;
      return 1;
    case 100 /*RPN_LSB*/:
      c.midiRPN = (((c.midiRPN === 0xffff ? 0 : c.midiRPN) & 0x3f80) | control_value) & 0xffff;
      return 1;
    case 98 /*NRPN_LSB*/:
      c.midiRPN = 0xffff;
      return 1;
    case 99 /*NRPN_MSB*/:
      c.midiRPN = 0xffff;
      return 1;
    case 64 /*SUSTAIN*/:
      tsf_channel_set_sustain(f, channel, control_value >= 64 ? 1 : 0);
      return 1;
    case 120 /*ALL_SOUND_OFF*/:
      tsf_channel_sounds_off_all(f, channel);
      return 1;
    case 123 /*ALL_NOTES_OFF*/:
      tsf_channel_note_off_all(f, channel);
      return 1;
    case 121 /*ALL_CTRL_OFF*/:
      c.midiVolume = c.midiExpression = 16383;
      c.midiPan = 8192;
      c.bank = 0;
      c.midiRPN = 0xffff;
      c.midiData = 0;
      tsf_channel_set_volume(f, channel, 1.0);
      tsf_channel_set_pan(f, channel, 0.5);
      tsf_channel_set_pitchrange(f, channel, 2.0);
      tsf_channel_set_tuning(f, channel, 0);
      return 1;
    default:
      return 1;
  }
  switch (controller) {
    case 7:
    case 39:
    case 11:
    case 43:
      //Raising to the power of 3 seems to result in a decent sounding volume curve for MIDI
      tsf_channel_set_volume(
        f,
        channel,
        f32(rm_pow(f32(f32(c.midiVolume / F_16383) * f32(c.midiExpression / F_16383)), 3.0)),
      );
      return 1;
    case 10:
    case 42:
      tsf_channel_set_pan(f, channel, f32(c.midiPan / F_16383));
      return 1;
    case 6:
    case 38:
      if (c.midiRPN === 0)
        tsf_channel_set_pitchrange(
          f,
          channel,
          f32((c.midiData >> 7) + f32(f32(0.01) * (c.midiData & 0x7f))),
        );
      else if (c.midiRPN === 1)
        tsf_channel_set_tuning(
          f,
          channel,
          f32(Math.trunc(c.tuning) + f32(f32(c.midiData - 8192) / 8192)),
        ); //fine tune
      else if (c.midiRPN === 2 && controller === 6)
        tsf_channel_set_tuning(
          f,
          channel,
          f32(f32(control_value - 64) + f32(c.tuning - Math.trunc(c.tuning))),
        ); //coarse tune
      return 1;
    default:
      return 1;
  }
}

// tsf.h:2035-2073 channel getters
function tsf_channel_get_preset_index(f: Tsf, channel: number): number {
  return f.channels && channel < f.channels.channelNum ? f.channels.channels[channel]!.presetIndex : 0;
}
function tsf_channel_get_preset_bank(f: Tsf, channel: number): number {
  return f.channels && channel < f.channels.channelNum ? f.channels.channels[channel]!.bank & 0x7fff : 0;
}
function tsf_channel_get_preset_number(f: Tsf, channel: number): number {
  return f.channels && channel < f.channels.channelNum
    ? f.presets[f.channels.channels[channel]!.presetIndex]!.preset
    : 0;
}
function tsf_channel_get_pan(f: Tsf, channel: number): number {
  return f.channels && channel < f.channels.channelNum
    ? f32(f.channels.channels[channel]!.panOffset - 0.5)
    : 0.5;
}
function tsf_channel_get_volume(f: Tsf, channel: number): number {
  return f.channels && channel < f.channels.channelNum
    ? tsf_decibelsToGain(f.channels.channels[channel]!.gainDB)
    : 1.0;
}
function tsf_channel_get_pitchwheel(f: Tsf, channel: number): number {
  return f.channels && channel < f.channels.channelNum ? f.channels.channels[channel]!.pitchWheel : 8192;
}
function tsf_channel_get_pitchrange(f: Tsf, channel: number): number {
  return f.channels && channel < f.channels.channelNum ? f.channels.channels[channel]!.pitchRange : 2.0;
}
function tsf_channel_get_tuning(f: Tsf, channel: number): number {
  return f.channels && channel < f.channels.channelNum ? f.channels.channels[channel]!.tuning : 0.0;
}

// ---------------------------------------------------------------------------
// Public API surface (used by the plugin glue; kept 1:1 named)
// ---------------------------------------------------------------------------

export {
  tsf_load_memory,
  tsf_copy,
  tsf_close,
  tsf_reset,
  tsf_get_presetindex,
  tsf_get_presetcount,
  tsf_get_presetname,
  tsf_bank_get_presetname,
  tsf_set_output,
  tsf_set_volume,
  tsf_set_max_voices,
  tsf_note_on,
  tsf_bank_note_on,
  tsf_note_off,
  tsf_bank_note_off,
  tsf_note_off_all,
  tsf_active_voice_count,
  tsf_render_short,
  tsf_render_float,
  tsf_channel_set_presetindex,
  tsf_channel_set_presetnumber,
  tsf_channel_set_bank,
  tsf_channel_set_bank_preset,
  tsf_channel_set_pan,
  tsf_channel_set_volume,
  tsf_channel_set_pitchwheel,
  tsf_channel_set_pitchrange,
  tsf_channel_set_tuning,
  tsf_channel_set_sustain,
  tsf_channel_note_on,
  tsf_channel_note_off,
  tsf_channel_note_off_all,
  tsf_channel_sounds_off_all,
  tsf_channel_midi_control,
  tsf_channel_get_preset_index,
  tsf_channel_get_preset_bank,
  tsf_channel_get_preset_number,
  tsf_channel_get_pan,
  tsf_channel_get_volume,
  tsf_channel_get_pitchwheel,
  tsf_channel_get_pitchrange,
  tsf_channel_get_tuning,
};

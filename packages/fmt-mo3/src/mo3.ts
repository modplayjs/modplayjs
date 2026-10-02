// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Bitti09 — modplayjs contributors
// Ported from: OpenMPT soundlib/Load_mo3.cpp — container/header/pattern/
// instrument/sample parsing (MO3 v0-v5), with the UNMO3-derived LZ music
// depacker (mo3LZ.ts) and a minimp3 Layer-3 port (minimp3.ts) for
// MP3-compressed samples.

import type { Core, FormatPlugin, LoadCtx, ModuleData } from '@modplayjs/core';
import type { Event, Instrument, Pattern, RawSample, SubInstrument, Envelope } from '@modplayjs/core';
import { ParseError, PeriodType, C4_NTSC_RATE } from '@modplayjs/core';
import {
  FX_ARPEGGIO, FX_PORTA_UP, FX_PORTA_DN, FX_TONEPORTA, FX_VIBRATO,
  FX_TONE_VSLIDE, FX_VIBRA_VSLIDE, FX_TREMOLO, FX_SETPAN, FX_OFFSET,
  FX_VOLSLIDE, FX_JUMP, FX_VOLSET, FX_BREAK, FX_EXTENDED, FX_SPEED,
  FX_GLOBALVOL, FX_GVOL_SLIDE, FX_KEYOFF, FX_ENVPOS, FX_PANSLIDE,
  FX_MULTI_RETRIG, FX_TREMOR, FX_XF_PORTA, FX_TRK_VOL, FX_TRK_VSLIDE,
  FX_IT_BPM, FX_PANBRELLO, FX_MACRO,
  FX_FINE_VIBRATO,
} from '@modplayjs/core';
import { ReadEventType } from '@modplayjs/core';
import { depackMO3Music, lastConsumed } from './mo3LZ.js';
import { parseMPEGFrame } from './mpegFrame.js';
import { mp3decInit, mp3decDecodeFrame, type Mp3Dec } from './minimp3.js';

// MO3HeaderFlags (Load_mo3.cpp:69-85)
const FLAG_LINEAR_SLIDES = 0x0001;
const FLAG_IS_S3M = 0x0002;
// const _unused_FLAG_S3M_FAST_SLIDES = 0x0004;void 0 as unknown;
const FLAG_IS_MTM = 0x0008;
// const _unused_FLAG_S3M_AMIGA_LIMITS = 0x0010;
const FLAG_IS_MOD = 0x0080;
const FLAG_IS_IT = 0x0100;
const FLAG_INSTRUMENT_MODE = 0x0200;
// const _unused_FLAG_IT_COMPAT_GXX = 0x0400;
// const _unused_FLAG_IT_OLD_FX = 0x0800;
// const _unused_FLAG_MODPLUG_MODE = 0x10000;
// const _unused_FLAG_UNKNOWN = 0x20000;
// const _unused_FLAG_MOD_VBLANK = 0x80000;
// const _unused_FLAG_HAS_PLUGINS = 0x100000;
const FX_NONE = 0x00;

// MO3SampleFlags (Load_mo3.cpp:269-282)
const SMP_16BIT = 0x01;
// const _SMP_LOOP = 0x10;
// const _SMP_PINGPONG = 0x20;
// const _SMP_SUSTAIN = 0x100;
// const _SMP_SUSTAIN_PINGPONG = 0x200;
const SMP_STEREO = 0x400;
const SMP_COMPRESSION_MPEG = 0x1000;
// const _SMP_COMPRESSION_OGG = 0x3000;
// const _SMP_SHARED_OGG = 0x7000;
const SMP_DELTA_COMPRESSION = 0x2000;
const SMP_DELTA_PREDICTION = 0x4000;
// const SMP_OPL_INSTRUMENT = 0x8000;
const SMP_COMPRESSION_MASK = 0xf000;

// OpenMPT CMD_* codes are the effTrans INDEX (not values) — the table maps
// straight to libxmp FX codes (effects.h). Volume-command enum values are
// OpenMPT VOLCMD_* (Sndfile.h) handled in applyVolCmd.

/** effTrans (Load_mo3.cpp:1009-1067) — OpenMPT CMD_* index → libxmp FX code.
 * Values match effects.h (our Event.fxt codes). */
const EFF_TRANS: number[] = [
  FX_NONE, FX_NONE, FX_NONE, FX_ARPEGGIO,          // 00-03
  FX_PORTA_UP, FX_PORTA_DN, FX_TONEPORTA, FX_VIBRATO, // 04-07
  FX_TONE_VSLIDE, FX_VIBRA_VSLIDE, FX_TREMOLO, FX_SETPAN, // 08-0b
  FX_OFFSET, FX_VOLSLIDE, FX_JUMP, FX_VOLSET,       // 0c-0f
  FX_BREAK, FX_EXTENDED, FX_SPEED, FX_TREMOR,       // 10-13
  FX_NONE, FX_NONE, FX_GLOBALVOL, FX_GVOL_SLIDE,    // 14-17
  FX_KEYOFF, FX_ENVPOS, FX_PANSLIDE, FX_NONE,       // 18-1b
  FX_MULTI_RETRIG, FX_XF_PORTA, FX_XF_PORTA, FX_NONE, // 1c-1f
  FX_NONE, FX_SPEED, FX_VOLSLIDE, FX_PORTA_DN,      // 20-23 (IT/S3M)
  FX_PORTA_UP, FX_TREMOR, FX_MULTI_RETRIG, FX_FINE_VIBRATO, // 24-27
  FX_TRK_VOL, FX_TRK_VSLIDE, FX_PANSLIDE, FX_EXTENDED, // 28-2b (S3MCMDEX → extended)
  FX_IT_BPM, FX_GVOL_SLIDE, FX_PANBRELLO, FX_MACRO, // 2c-2f
  FX_NONE, FX_NONE, FX_NONE, FX_NONE,               // 30-33
  FX_NONE, FX_NONE, FX_NONE, FX_NONE,               // 34-37
  0xa6, 0xbe,                                        // 38-39 (MPTM)
];

// OpenMPT volume command enum values (Sndfile.h VOLCMD_*)
const VOLCMD_NONE = 0;
const VOLCMD_VOLUME = 1;
const VOLCMD_PANNING = 2;
const VOLCMD_VOLSLIDEUP = 3;
const VOLCMD_VOLSLIDEDOWN = 4;
const VOLCMD_FINEVOLUP = 5;
const VOLCMD_FINEVOLDOWN = 6;
const VOLCMD_VIBRATOSPEED = 7;
const VOLCMD_VIBRATODEPTH = 8;
const VOLCMD_PANSLIDELEFT = 9;
const VOLCMD_PANSLIDERIGHT = 10;
const VOLCMD_TONEPORTAMENTO = 11;
const VOLCMD_PORTAUP = 12;
const VOLCMD_PORTADOWN = 13;
const VOLCMD_OFFSET = 14;

// OpenMPT envelope flag bits → our Envelope.flags (XMP_ENVELOPE_*)
const ENV_ENABLED = 0x01;
const ENV_SUSTAIN = 0x02;
const ENV_LOOP = 0x04;
const ENV_FILTER = 0x10;
const ENV_CARRY = 0x20;

const NOTE_MIN = 13; // C-0 in libxmp note numbering
const NOTE_KEYOFF = 0x78; // 120
const NOTE_NOTECUT = 0x79; // 121
const NOTE_FADE = 0x7a; // 122

interface Reader {
  buf: Uint8Array;
  pos: number;
}

function rU8(r: Reader): number {
  return r.buf[r.pos++] ?? 0;
}
function rU16(r: Reader): number {
  const v = (r.buf[r.pos]! | (r.buf[r.pos + 1]! << 8)) >>> 0;
  r.pos += 2;
  return v;
}
function rI16(r: Reader): number {
  const v = rU16(r);
  return v >= 0x8000 ? v - 0x10000 : v;
}
function rU32(r: Reader): number {
  const v = (r.buf[r.pos]! | (r.buf[r.pos + 1]! << 8) | (r.buf[r.pos + 2]! << 16) | (r.buf[r.pos + 3]! << 24)) >>> 0;
  r.pos += 4;
  return v;
}
function rI32(r: Reader): number {
  const v = rU32(r);
  return v | 0;
}
function rNullString(r: Reader): string {
  let s = '';
  while (r.pos < r.buf.length) {
    const c = r.buf[r.pos++]!;
    if (c === 0) break;
    s += String.fromCharCode(c);
  }
  return s;
}
// AutoVibratoIT2XM (Load_mo3.cpp:289-295 area) — IT vibrato type → XM type
const AUTO_VIBRATO_IT2XM = [0, 2, 4, 1, 3, 0, 0, 0];

function zeroEnvelope(): Envelope {
  return { flags: 0, npt: 0, scl: 0, sus: 0, sue: 0, lps: 0, lpe: 0, x: [], y: [] };
}

function zeroInstrument(name: string, sub: SubInstrument[]): Instrument {
  return {
    name,
    volume: 0x40,
    nsm: 0,
    rls: 0,
    map: new Array<number>(121).fill(0),
    mapXpo: new Array<number>(121).fill(0),
    sub,
    aei: zeroEnvelope(),
    fei: zeroEnvelope(),
    pei: zeroEnvelope(),
  };
}

// MO3Envelope read + convert (Load_mo3.cpp:112-153)
function readMo3Envelope(r: Reader, envShift: number, isXm: boolean, env: Envelope): void {
  const flags = rU8(r);
  const numNodes = rU8(r);
  const sustainStart = rU8(r);
  const sustainEnd = rU8(r);
  const loopStart = rU8(r);
  const loopEnd = rU8(r);
  const points: number[][] = [];
  for (let i = 0; i < 25; i++) {
    points.push([rI16(r), rI16(r)]);
  }
  env.flags =
    ((flags & 0x01) !== 0 ? ENV_ENABLED : 0) |
    ((flags & 0x02) !== 0 ? ENV_SUSTAIN : 0) |
    ((flags & 0x04) !== 0 ? ENV_LOOP : 0) |
    ((flags & 0x10) !== 0 ? ENV_FILTER : 0) |
    ((flags & 0x20) !== 0 ? ENV_CARRY : 0);
  const n = Math.min(numNodes, 25);
  env.npt = n;
  env.sus = sustainStart;
  env.sue = isXm ? sustainStart : sustainEnd;
  env.lps = loopStart;
  env.lpe = loopEnd;
  env.x = [];
  env.y = [];
  for (let i = 0; i < n; i++) {
    let tick = points[i]![0]!;
    if (i > 0 && tick < env.x[i - 1]!) tick = env.x[i - 1]! + 1;
    env.x.push(tick);
    env.y.push(Math.min(64, Math.max(0, points[i]![1]! >> envShift)));
  }
}

export function mo3Test(bytes: Uint8Array): boolean {
  return (
    bytes.length > 8 &&
    bytes[0] === 0x4d /* M */ && bytes[1] === 0x4f /* O */ && bytes[2] === 0x33 /* 3 */ &&
    bytes[3]! <= 5 &&
    ((bytes[4]! | (bytes[5]! << 8) | (bytes[6]! << 16) | (bytes[7]! << 24)) >>> 0) > 422 &&
    ((bytes[4]! | (bytes[5]! << 8) | (bytes[6]! << 16) | (bytes[7]! << 24)) >>> 0) < 0x20000000
  );
}

interface Parsed {
  mod: ModuleData;
  sampleChunks: Array<{ data: Uint8Array; off: number; size: number }>;
  sampleHeaders: Array<{
    flags: number;
    length: number;
    loopStart: number;
    loopEnd: number;
    sustainStart: number;
    sustainEnd: number;
    compressedSize: number;
    encoderDelay: number;
    vibType: number; vibSweep: number; vibDepth: number; vibRate: number;
    globalVol: number;
    finetune: number;
    transpose: number;
    volume: number;
    panning: number;
  }>;
  version: number;
}

function parseMO3(bytes: Uint8Array, fail: (m: string) => never): Parsed {
  const version = bytes[3]!;
  const musicSize = ((bytes[4]! | (bytes[5]! << 8) | (bytes[6]! << 16) | (bytes[7]! << 24)) >>> 0);
  if (musicSize <= 422 || musicSize >= 0x20000000) fail('MO3: bad music size');
  if (version > 5) fail('MO3: bad version');

  let compressedSize = 0;
  let inner: Uint8Array;
  if (version >= 5) {
    compressedSize = ((bytes[8]! | (bytes[9]! << 8) | (bytes[10]! << 16) | (bytes[11]! << 24)) >>> 0);
    inner = depackMO3Music(bytes.subarray(0, 12 + compressedSize));
  } else {
    inner = depackMO3Music(bytes);
  }

  const r: Reader = { buf: inner, pos: 0 };
  const songName = rNullString(r);
  const songMessage = rNullString(r);

  const numChannels = rU8(r);
  const numOrders = rU16(r);
  const restartPos = rU16(r);
  const numPatterns = rU16(r);
  const numTracks = rU16(r);
  const numInstruments = rU16(r);
  const numSamples = rU16(r);
  const defaultSpeed = rU8(r);
  const defaultTempo = rU8(r);
  const flags = rU32(r) >>> 0;
  const globalVol = rU8(r);
  const panSeparation = rU8(r);
  const sampleVolume = (rU8(r) << 24) >> 24;
  const chnVolume: number[] = [];
  for (let i = 0; i < 64; i++) chnVolume.push(rU8(r));
  const chnPan: number[] = [];
  for (let i = 0; i < 64; i++) chnPan.push(rU8(r));
  const sfxMacros: number[] = [];
  for (let i = 0; i < 16; i++) sfxMacros.push(rU8(r));
  const fixedMacros: number[][] = [];
  for (let i = 0; i < 128; i++) fixedMacros.push([rU8(r), rU8(r)]);

  if (numChannels === 0 || numChannels > 64) fail('MO3: bad channel count');
  if (restartPos > numOrders) fail('MO3: bad restart pos');
  if (numInstruments >= 255 || numSamples >= 255) fail('MO3: bad ins/smp count');

  const isIT = (flags & FLAG_IS_IT) !== 0;
  const isS3M = (flags & FLAG_IS_S3M) !== 0;
  const isMOD = (flags & FLAG_IS_MOD) !== 0;
  const isMTM = (flags & FLAG_IS_MTM) !== 0;
  const modType = isIT ? 'it' : isS3M ? 's3m' : isMOD ? 'mod' : isMTM ? 'mtm' : 'xm';
  const isXm = modType === 'xm';

  // Orders (hasOrderSeparators for IT/S3M: 0xFF separators, 0xFE marks)
  const hasOrderSeparators = !(modType === 'mod' || isXm);
  const orders: number[] = [];
  for (let i = 0; i < numOrders; i++) {
    const b = rU8(r);
    if (hasOrderSeparators && b === 0xff) break; // order separator = end
    orders.push(hasOrderSeparators && b === 0xfe ? 254 : b);
  }
  const len = orders.length;

  // Track assignments + pattern lengths
  const trackChunkOff = r.pos;
  r.pos += numPatterns * numChannels * 2;
  const patLengthChunkOff = r.pos;
  r.pos += numPatterns * 2;

  const trackOffsets: number[] = [];
  const trackLens: number[] = [];
  for (let i = 0; i < numTracks; i++) {
    trackLens.push(rU32(r));
    trackOffsets.push(r.pos);
    r.pos += trackLens[i]!;
  }

  // Patterns
  const patterns: Pattern[] = [];
  const noteOffset = modType === 'mtm' ? 13 + NOTE_MIN : !isIT ? 12 + NOTE_MIN : NOTE_MIN;
  for (let pat = 0; pat < numPatterns; pat++) {
    const numRows = inner[patLengthChunkOff + pat * 2]! | (inner[patLengthChunkOff + pat * 2 + 1]! << 8);
    const rows = numRows === 0 ? 64 : numRows;
    const tracks: Pattern['tracks'] = [];
    for (let chn = 0; chn < numChannels; chn++) {
      const ev: Event[] = [];
      for (let row = 0; row < rows; row++) {
        ev.push({ note: 0, ins: 0, vol: 0, fxt: 0, fxp: 0, f2t: 0, f2p: 0 });
      }
      tracks.push({ rows, event: ev });
    }
    patterns.push({ rows, tracks });
  }
  // decode tracks per pattern/channel
  for (let pat = 0; pat < numPatterns; pat++) {
    const numRows = inner[patLengthChunkOff + pat * 2]! | (inner[patLengthChunkOff + pat * 2 + 1]! << 8);
    const rows = numRows === 0 ? 64 : numRows;
    for (let chn = 0; chn < numChannels; chn++) {
      const trackIndex = inner[trackChunkOff + (pat * numChannels + chn) * 2]! |
        (inner[trackChunkOff + (pat * numChannels + chn) * 2 + 1]! << 8);
      if (trackIndex >= numTracks) continue;
      const tr: Reader = { buf: inner, pos: trackOffsets[trackIndex]! };
      let row = 0;
      while (row < rows) {
        const b = rU8(tr);
        if (b === 0) break;
        const numCommands = b & 0x0f;
        const rep = b >> 4;
        const m: Event = { note: 0, ins: 0, vol: 0, fxt: 0, fxp: 0, f2t: 0, f2p: 0 };
        let volcmd = VOLCMD_NONE;
        let volParam = 0;
        for (let c = 0; c < numCommands; c++) {
          const cmd0 = rU8(tr);
          const cmd1 = rU8(tr);
          switch (cmd0) {
            case 0x01: { // Note
              let note = cmd1;
              if (note < 120) note += noteOffset;
              else if (note === 0xff) note = NOTE_KEYOFF;
              else if (note === 0xfe) note = NOTE_NOTECUT;
              else note = NOTE_FADE;
              m.note = note;
              break;
            }
            case 0x02: // Instrument
              m.ins = cmd1 + 1;
              break;
            case 0x06: { // Tone portamento
              if (volcmd === VOLCMD_NONE && isXm && !(cmd1 & 0x0f)) {
                volcmd = VOLCMD_TONEPORTAMENTO;
                volParam = cmd1 >> 4;
              } else if (volcmd === VOLCMD_NONE && isIT) {
                const IT_PORTA_VOL = [0, 4, 8, 16, 32, 64, 96, 128, 255];
                let found = false;
                for (let i = 0; i < 9; i++) {
                  if (IT_PORTA_VOL[i] === cmd1) { volcmd = VOLCMD_TONEPORTAMENTO; volParam = i; found = true; break; }
                }
                if (!found) { m.fxt = FX_TONEPORTA; m.fxp = cmd1; }
              } else {
                m.fxt = FX_TONEPORTA;
                m.fxp = cmd1;
              }
              break;
            }
            case 0x07: { // Vibrato
              if (volcmd === VOLCMD_NONE && cmd1 < 10 && isIT) {
                volcmd = VOLCMD_VIBRATODEPTH;
                volParam = cmd1;
              } else {
                m.fxt = FX_VIBRATO;
                m.fxp = cmd1;
              }
              break;
            }
            case 0x0b: { // Panning
              if (volcmd === VOLCMD_NONE) {
                if (isIT && cmd1 === 0xff) {
                  volcmd = VOLCMD_PANNING;
                  volParam = 64;
                  break;
                }
                if ((isIT && !(cmd1 & 0x03)) || (isXm && !(cmd1 & 0x0f))) {
                  volcmd = VOLCMD_PANNING;
                  volParam = cmd1 / 4;
                  break;
                }
              }
              m.fxt = FX_SETPAN;
              m.fxp = cmd1;
              break;
            }
            case 0x0f: { // Volume
              if (modType !== 'mod' && volcmd === VOLCMD_NONE && cmd1 <= 64) {
                volcmd = VOLCMD_VOLUME;
                volParam = cmd1;
              } else {
                m.fxt = FX_VOLSET;
                m.fxp = cmd1;
              }
              break;
            }
            case 0x10: { // Pattern break (BCD in MOD/XM/S3M/MTM)
              m.fxt = FX_BREAK;
              m.fxp = cmd1;
              if (!isIT) m.fxp = ((cmd1 >> 4) * 10) + (cmd1 & 0x0f);
              break;
            }
            case 0x12: { // Combined tempo/speed
              m.fxt = cmd1 < 0x20 ? FX_SPEED : FX_IT_BPM;
              m.fxp = cmd1;
              break;
            }
            case 0x14:
            case 0x15: { // XM volume column volume slides
              if ((cmd1 & 0xf0) !== 0) {
                volcmd = cmd0 === 0x14 ? VOLCMD_VOLSLIDEUP : VOLCMD_FINEVOLUP;
                volParam = cmd1 >> 4;
              } else {
                volcmd = cmd0 === 0x14 ? VOLCMD_VOLSLIDEDOWN : VOLCMD_FINEVOLDOWN;
                volParam = cmd1 & 0x0f;
              }
              break;
            }
            case 0x1b: { // XM volume column pan slides
              if ((cmd1 & 0xf0) !== 0) {
                volcmd = VOLCMD_PANSLIDERIGHT;
                volParam = cmd1 >> 4;
              } else {
                volcmd = VOLCMD_PANSLIDELEFT;
                volParam = cmd1 & 0x0f;
              }
              break;
            }
            case 0x1d: // XM extra fine porta up
              m.fxt = FX_XF_PORTA;
              m.fxp = 0x10 | cmd1;
              break;
            case 0x1e: // XM extra fine porta down
              m.fxt = FX_XF_PORTA;
              m.fxp = 0x20 | cmd1;
              break;
            case 0x1f:
            case 0x20: { // XM volume column vibrato
              volcmd = cmd0 === 0x1f ? VOLCMD_VIBRATOSPEED : VOLCMD_VIBRATODEPTH;
              volParam = cmd1;
              break;
            }
            case 0x22: { // IT/S3M volume slide
              if (m.fxt === FX_TONEPORTA) m.fxt = FX_TONE_VSLIDE;
              else if (m.fxt === FX_VIBRATO) m.fxt = FX_VIBRA_VSLIDE;
              else m.fxt = FX_VOLSLIDE;
              m.fxp = cmd1;
              break;
            }
            case 0x30: { // IT volume column volume slides
              m.vol = cmd1 % 10;
              if (cmd1 < 10) { volcmd = VOLCMD_FINEVOLUP; m.vol = cmd1 % 10; }
              else if (cmd1 < 20) { volcmd = VOLCMD_FINEVOLDOWN; m.vol = cmd1 % 10; }
              else if (cmd1 < 30) { volcmd = VOLCMD_VOLSLIDEUP; m.vol = cmd1 % 10; }
              else if (cmd1 < 40) { volcmd = VOLCMD_VOLSLIDEDOWN; m.vol = cmd1 % 10; }
              break;
            }
            case 0x31:
            case 0x32: { // IT volume column portamento
              volcmd = cmd0 === 0x31 ? VOLCMD_PORTADOWN : VOLCMD_PORTAUP;
              volParam = cmd1;
              break;
            }
            case 0x34: { // IT volume column offset etc.
              if (cmd1 >= 223 && cmd1 <= 232) {
                volcmd = VOLCMD_OFFSET;
                volParam = cmd1 - 223;
              }
              break;
            }
            default: {
              if (cmd0 < EFF_TRANS.length) {
                const fx = EFF_TRANS[cmd0]!;
                if (fx !== FX_NONE || cmd0 === 0) {
                  m.fxt = fx;
                  m.fxp = cmd1;
                }
              }
              break;
            }
          }
        }
        // Translate OpenMPT volume command → libxmp volume-column encoding
        applyVolCmd(m, volcmd, volParam, modType);

        const targetRow = Math.min(row + rep, rows);
        while (row < targetRow) {
          const t = patterns[pat]!.tracks[chn]!;
          t.event[row] = { ...m };
          row++;
        }
      }
    }
  }

  // Instruments
  const instruments: Instrument[] = [];
  const instrVibrato: Array<{ type: number; sweep: number; depth: number; rate: number }> = [];
  const isSampleMode = !isXm && !(flags & FLAG_INSTRUMENT_MODE);
  const insCount = modType === 'xm' || !isSampleMode ? numInstruments : numInstruments;
  for (let ins = 0; ins < insCount; ins++) {
    const name = rNullString(r);
    if (version >= 5) rNullString(r); // filename
    const insFlags = rU32(r) >>> 0;
    const sampleMap: number[][] = [];
    for (let i = 0; i < 120; i++) {
      sampleMap.push([rU16(r), rU16(r)]);
    }
    const aei = zeroEnvelope();
    const pei = zeroEnvelope();
    const fei = zeroEnvelope();
    readMo3Envelope(r, 0, isXm, aei);
    readMo3Envelope(r, 0, isXm, pei);
    readMo3Envelope(r, 5, isXm, fei);
    const vibType = rU8(r);
    const vibSweep = rU8(r);
    const vibDepth = rU8(r);
    const vibRate = rU8(r);
    const fadeOut = rU16(r);
    const midiChannel = rU8(r);
    const midiBank = rU8(r);
    const midiPatch = rU8(r);
    const midiBend = rU8(r);
    const globalVol = rU8(r);
    const panning = rU16(r);
    const nna = rU8(r);
    void nna;
    const pps = rU8(r);
    const ppc = rU8(r);
    const dct = rU8(r);
    const dca = rU8(r);
    const volSwing = rU16(r);
    const panSwing = rU16(r);
    const cutoff = rU8(r);
    const resonance = rU8(r);
    void insFlags; void midiChannel; void midiBank; void midiPatch; void midiBend;
    void volSwing; void panSwing; void pps; void ppc;

    const xxi = zeroInstrument(name, []);
    if (isXm) {
      for (let i = 0; i < 96; i++) {
        xxi.map[i + 12] = sampleMap[i]![1]! + 1 === 0 ? 0 : sampleMap[i]![1]!;
        xxi.map[i + 12] = sampleMap[i]![1]! === 0xffff ? 0xff : sampleMap[i]![1]!;
      }
    } else {
      for (let i = 0; i < 120; i++) {
        xxi.mapXpo[i] = sampleMap[i]![0]! - (i - 12);
        xxi.map[i] = sampleMap[i]![1]! === 0xffff ? 0xff : sampleMap[i]![1]! + 1;
      }
    }
    // Envelope flags: our Envelope.flags uses XMP_ENVELOPE_* bits (same values)
    xxi.aei = aei;
    xxi.pei = pei;
    xxi.fei = fei;
    xxi.rls = fadeOut;
    xxi.volume = isIT ? Math.min(globalVol, 128) / 2 : 0x40;
    if (panning <= 256) {
      // baked into sub pan below
    }
    xxi.nsm = 0; // filled by sample registration
    instruments.push(xxi);
    if (isXm) {
      instrVibrato.push({ type: AUTO_VIBRATO_IT2XM[vibType & 7]!, sweep: vibSweep, depth: vibDepth, rate: vibRate });
    }
    void dct; void dca; void cutoff; void resonance; void panSeparation; void sampleVolume;
  }
  if (isSampleMode) {
    // sample mode: no instruments
    instruments.length = 0;
  }

  // Samples
  const frequencyIsHertz = version >= 5 || !(flags & FLAG_LINEAR_SLIDES);
  const sampleHeaders: Parsed['sampleHeaders'] = [];
  const sampleNames: string[] = [];
  for (let smp = 0; smp < numSamples; smp++) {
    const name = rNullString(r);
    if (version >= 5) rNullString(r);
    const freqFinetune = rU32(r);
    const transpose = (rU8(r) << 24) >> 24;
    const defaultVolume = rU8(r);
    const panning = rU16(r);
    const length = rU32(r);
    const loopStart = rU32(r);
    const loopEnd = rU32(r);
    const sflags = rU16(r) >>> 0;
    const vibType = rU8(r);
    const vibSweep = rU8(r);
    const vibDepth = rU8(r);
    const vibRate = rU8(r);
    const globalVol = rU8(r);
    const sustainStart = rU32(r);
    const sustainEnd = rU32(r);
    const compressedSize = rI32(r);
    const encoderDelay = rU16(r);
    sampleNames.push(name);
    sampleHeaders.push({
      flags: sflags, length, loopStart, loopEnd, sustainStart, sustainEnd,
      compressedSize, encoderDelay, vibType, vibSweep, vibDepth, vibRate,
      globalVol, finetune: freqFinetune, transpose, volume: defaultVolume, panning,
    });
    void frequencyIsHertz;
  }

  // Build ModuleData
  const channels = [];
  for (let i = 0; i < numChannels; i++) {
    let pan = 0x80;
    let flg = 0;
    if (isIT) {
      // volume from header
    }
    if (!isXm) {
      if (chnPan[i] === 127) flg |= 0x10; // SURROUND
      else if (chnPan[i] === 255) pan = 256;
      else pan = chnPan[i]!;
    }
    channels.push({ pan: Math.min(255, pan), vol: isIT ? Math.min(chnVolume[i]!, 64) : 0x40, flg });
  }

  let c4rate = 8363;
  let periodType: PeriodType = PeriodType.AMIGA;
  let quirks = 0;
  let readEventType: ReadEventType = ReadEventType.FT2;
  if (isIT) {
    readEventType = ReadEventType.IT;
    quirks = 0x3f16cf0; // QUIRKS_IT (matches fmt-it)
    periodType = (flags & FLAG_LINEAR_SLIDES) !== 0 ? PeriodType.LINEAR : PeriodType.AMIGA;
  } else if (isS3M) {
    readEventType = ReadEventType.ST3;
    periodType = (flags & FLAG_LINEAR_SLIDES) !== 0 ? PeriodType.LINEAR : PeriodType.AMIGA;
  } else if (isXm) {
    readEventType = ReadEventType.FT2;
    periodType = (flags & FLAG_LINEAR_SLIDES) !== 0 ? PeriodType.LINEAR : PeriodType.AMIGA;
  }

  const mod: ModuleData = {
    title: songName,
    format: 'mo3', // dispatch key — our plugin name (readEventType carries the semantics)
    comment: songMessage,
    chn: numChannels,
    pat: numPatterns,
    ins: isSampleMode ? 0 : numInstruments,
    len,
    restart: restartPos >= len ? 0 : restartPos,
    xxo: orders,
    channels,
    patterns,
    instruments: isSampleMode ? [] : instruments,
    samples: [],
    num_sequences: 0,
    sequences: [],
    speed: defaultSpeed || 6,
    bpm: defaultTempo || 125,
    volbase: 0x40,
    gvolbase: isIT ? 0x80 : isS3M ? 0x40 : 0x40,
    gvol: isIT ? Math.min(globalVol, 128) * 2 : isS3M ? Math.min(globalVol, 64) * 4 : 0x40,
    quirks,
    flowMode: 0,
    readEventType,
    periodType,
    defpan: 0x80,
    time_factor: 10,
    rrate: 250,
    c4rate,
    compare_vblank: false,
    tracker: `MO3 v${version}`,
  };
  void sampleVolume;

  // Sample chunks live in the FILE after the depacked music chunk
  let filePos = version >= 5 ? 12 + compressedSize : lastConsumed();
  const sampleChunks: Parsed['sampleChunks'] = [];
  for (let smp = 0; smp < numSamples; smp++) {
    const h = sampleHeaders[smp]!;
    if (h.compressedSize > 0) {
      sampleChunks.push({ data: bytes, off: filePos, size: h.compressedSize });
      filePos += h.compressedSize;
    } else if (h.compressedSize === 0 && h.length > 0) {
      const frames = h.length * ((h.flags & SMP_16BIT ? 2 : 1) * ((h.flags & SMP_STEREO) ? 2 : 1));
      sampleChunks.push({ data: bytes, off: filePos, size: frames });
      filePos += frames;
    } else {
      sampleChunks.push({ data: bytes, off: 0, size: 0 });
    }
  }

  return { mod, sampleChunks, sampleHeaders, version };
}

/** Apply OpenMPT volume command → libxmp volume column encoding. */
function applyVolCmd(m: Event, volcmd: number, volParam: number, modType: string): void {
  const isIT = modType === 'it';
  const isXm = modType === 'xm';
  const volFx = (code: number, param: number): void => {
    // our events carry the volume column as f2t/f2p with libxmp FX codes
    m.f2t = code;
    m.f2p = param;
  };
  switch (volcmd) {
    case VOLCMD_VOLUME:
      m.vol = volParam + 1;
      break;
    case VOLCMD_PANNING:
      volFx(0x08 /* FX_SETPAN */, volParam * 4);
      break;
    case VOLCMD_VOLSLIDEUP:
      volFx(isIT ? 0xa4 : 0x0a /* volslide */, isIT ? volParam : (volParam << 4));
      break;
    case VOLCMD_VOLSLIDEDOWN:
      volFx(isIT ? 0xa4 : 0x0a, isIT ? volParam : volParam);
      break;
    case VOLCMD_FINEVOLUP:
      if (isXm) volFx(0x0e /* FX_EXTENDED */, (0x0a << 4) | volParam);
      else if (isIT) volFx(0x82, volParam);
      else volFx(0x0e, (0x0a << 4) | volParam);
      break;
    case VOLCMD_FINEVOLDOWN:
      if (isXm) volFx(0x0e, (0x0b << 4) | volParam);
      else if (isIT) volFx(0x82, volParam);
      else volFx(0x0e, (0x0b << 4) | volParam);
      break;
    case VOLCMD_TONEPORTAMENTO:
      volFx(0x03, isXm ? volParam << 4 : volParam);
      break;
    case VOLCMD_VIBRATODEPTH:
      volFx(isIT ? 0xac : 0x04, volParam);
      break;
    case VOLCMD_VIBRATOSPEED:
      volFx(0x04, volParam << 4);
      break;
    case VOLCMD_PANSLIDELEFT:
      volFx(0xb5 /* FX_PANSL_NOMEM */, volParam << 4);
      break;
    case VOLCMD_PANSLIDERIGHT:
      volFx(0xb5, volParam);
      break;
    case VOLCMD_PORTAUP:
      volFx(0x01, volParam);
      break;
    case VOLCMD_PORTADOWN:
      volFx(0x02, volParam);
      break;
    case VOLCMD_OFFSET:
      volFx(0x09, volParam);
      break;
    default:
      break;
  }
}

// ---------------------------------------------------------------------------
// Sample data decoding (Load_mo3.cpp:1598-2039)
// ---------------------------------------------------------------------------

// UnpackMO3DeltaSample (Load_mo3.cpp:617-662)
function unpackMo3DeltaSample(
  data: Uint8Array, off: number, dst: Int8Array | Int16Array, length: number, numChannels: number, is16: boolean,
): void {
  let dh = is16 ? 8 : 4;
  let carry = 0;
  let dataAcc = 0;
  let pos = off;
  const end = data.length;

  const readCtrlBit = (): boolean => {
    dataAcc = (dataAcc << 1) & 0x1ff;
    carry = dataAcc > 0xff ? 1 : 0;
    dataAcc &= 0xff;
    if (dataAcc === 0) {
      if (pos >= end) return false;
      dataAcc = data[pos++]!;
      dataAcc = ((dataAcc << 1) + 1) & 0x1ff;
      carry = dataAcc > 0xff ? 1 : 0;
      dataAcc &= 0xff;
    }
    return true;
  };

  const shift = is16 ? 15 : 7;
  const mask = is16 ? 0xffff : 0xff;

  for (let chn = 0; chn < numChannels; chn++) {
    let p = chn;
    const pEnd = length * numChannels;
    let previous = 0;
    while (p < pEnd) {
      let val = 0;
      // Properties::Decode
      if (is16) {
        if (dh < 5) {
          do {
            if (!readCtrlBit()) return;
            val = ((val << 1) + carry) & mask;
            if (!readCtrlBit()) return;
            val = ((val << 1) + carry) & mask;
            if (!readCtrlBit()) return;
            val = ((val << 1) + carry) & mask;
          } while (carry);
        } else {
          do {
            if (!readCtrlBit()) return;
            val = ((val << 1) + carry) & mask;
            if (!readCtrlBit()) return;
            val = ((val << 1) + carry) & mask;
          } while (carry);
        }
      } else {
        do {
          if (!readCtrlBit()) return;
          val = ((val << 1) + carry) & mask;
          if (!readCtrlBit()) return;
        } while (carry);
      }
      let cl = dh;
      while (cl > 0) {
        if (!readCtrlBit()) return;
        val = ((val << 1) + carry) & mask;
        cl--;
      }
      let cl2 = 1;
      if (val >= 4) {
        cl2 = shift;
        while (((1 << cl2) & val) === 0 && cl2 > 1) cl2--;
      }
      dh = (dh + cl2) >> 1;
      carry = val & 1;
      val >>= 1;
      if (carry === 0) val = (~val) & mask;
      val = (val + previous) & mask;
      // write
      const signed = is16
        ? (val >= 0x8000 ? val - 0x10000 : val)
        : (val >= 0x80 ? val - 0x100 : val);
      (dst as Int16Array)[p] = signed;
      previous = signed;
      p += numChannels;
    }
  }
}

// UnpackMO3DeltaPredictionSample (Load_mo3.cpp:663-715)
function unpackMo3DeltaPredictionSample(
  data: Uint8Array, off: number, dst: Int8Array | Int16Array, length: number, numChannels: number, is16: boolean,
): void {
  let dh = is16 ? 8 : 4;
  let carry = 0;
  let dataAcc = 0;
  let pos = off;
  const end = data.length;

  const readCtrlBit = (): boolean => {
    dataAcc = (dataAcc << 1) & 0x1ff;
    carry = dataAcc > 0xff ? 1 : 0;
    dataAcc &= 0xff;
    if (dataAcc === 0) {
      if (pos >= end) return false;
      dataAcc = data[pos++]!;
      dataAcc = ((dataAcc << 1) + 1) & 0x1ff;
      carry = dataAcc > 0xff ? 1 : 0;
      dataAcc &= 0xff;
    }
    return true;
  };

  const shift = is16 ? 15 : 7;
  const mask = is16 ? 0xffff : 0xff;
  const minV = is16 ? -0x8000 : -0x80;
  const maxV = is16 ? 0x7fff : 0x7f;

  for (let chn = 0; chn < numChannels; chn++) {
    let p = chn;
    const pEnd = length * numChannels;
    let next = 0;
    let previous = 0;
    while (p < pEnd) {
      let val = 0;
      if (is16) {
        if (dh < 5) {
          do {
            if (!readCtrlBit()) return;
            val = ((val << 1) + carry) & mask;
            if (!readCtrlBit()) return;
            val = ((val << 1) + carry) & mask;
            if (!readCtrlBit()) return;
            val = ((val << 1) + carry) & mask;
          } while (carry);
        } else {
          do {
            if (!readCtrlBit()) return;
            val = ((val << 1) + carry) & mask;
            if (!readCtrlBit()) return;
            val = ((val << 1) + carry) & mask;
          } while (carry);
        }
      } else {
        do {
          if (!readCtrlBit()) return;
          val = ((val << 1) + carry) & mask;
          if (!readCtrlBit()) return;
        } while (carry);
      }
      let cl = dh;
      while (cl > 0) {
        if (!readCtrlBit()) return;
        val = ((val << 1) + carry) & mask;
        cl--;
      }
      let cl2 = 1;
      if (val >= 4) {
        cl2 = shift;
        while (((1 << cl2) & val) === 0 && cl2 > 1) cl2--;
      }
      dh = (dh + cl2) >> 1;
      carry = val & 1;
      val >>= 1;
      if (carry === 0) val = (~val) & mask;

      const delta = val >= 0x8000 ? val - 0x10000 : val >= 0x80 ? val - 0x100 : val;
      val = (val + next) & mask;
      const out = val >= 0x8000 ? val - 0x10000 : val >= 0x80 ? val - 0x100 : val;
      (dst as Int16Array)[p] = out;
      p += numChannels;
      const sval = out;
      next = sval * 2 + (delta >> 1) - previous;
      if (next < minV) next = minV;
      if (next > maxV) next = maxV;
      previous = sval;
    }
  }
}

/** Decode MP3 sample data with the minimp3 port (SampleFormatMP3 path). */
function decodeMp3Sample(data: Uint8Array, off: number, size: number, encoderDelay: number, hdrLength: number, stereo: boolean, is16: boolean): { pcm: Int16Array; channels: number; hz: number } | null {
  const dec: Mp3Dec = {
    mdctOverlap: [], qmfState: new Float32Array(0), reserv: 0,
    freeFormatBytes: 0, header: new Uint8Array(4), reservBuf: new Uint8Array(0),
  };
  mp3decInit(dec);
  const mp3 = data.subarray(off, off + size);
  const pcm = new Int16Array(1152 * 2);
  const info = { frameBytes: 0, channels: 0, hz: 0, layer: 0, bitrateKbps: 0 };

  // LAME info frame skip (Load_mo3.cpp:2007-2023)
  let mpegData = mp3;
  const frame = parseMPEGFrame(mp3, 0);
  let encoderDelay2 = encoderDelay;
  if (frame && frame.isLAME) {
    const frameDelay = frame.numSamples * 2;
    if (encoderDelay >= frameDelay) {
      encoderDelay2 -= frameDelay;
      mpegData = mp3.subarray(frame.frameSize);
    }
  }

  const chunks: Int16Array[] = [];
  let pos = 0;
  let total = 0;
  let channels = 0;
  let hz = 0;
  let bytesLeft = mpegData.length;
  do {
    const n = mp3decDecodeFrame(dec, mpegData.subarray(pos), bytesLeft, pcm, info);
    if (n < 0 || info.frameBytes < 0) break;
    if (n > 0 && info.frameBytes === 0) break;
    if (n === 0 && info.frameBytes === 0) break;
    if (info.frameBytes > 0) {
      if (hz !== 0 && hz !== info.hz) break;
      if (channels !== 0 && channels !== info.channels) break;
      hz = info.hz;
      channels = info.channels;
      if (hz <= 0) break;
      if (channels !== 1 && channels !== 2) break;
      const advance = Math.min(Math.max(info.frameBytes, 0), bytesLeft);
      pos += advance;
      bytesLeft -= advance;
      if (n > 0) {
        chunks.push(pcm.slice(0, n * channels));
        total += n * channels;
      }
    }
    if (total / channels > 0x1000000) break;
  } while (bytesLeft > 0);
  if (total === 0) return null;

  // Concatenate + apply encoder delay
  const all = new Int16Array(total);
  let o = 0;
  for (const c of chunks) {
    all.set(c, o);
    o += c.length;
  }
  let delay = encoderDelay2;
  if (delay > 0 && delay < all.length) {
    all.copyWithin(0, delay);
    total -= delay;
  }
  const samplesPerCh = Math.min(Math.floor(total / (channels || 1)), hdrLength);
  void stereo; void is16;
  return { pcm: all.subarray(0, samplesPerCh * (channels || 1)), channels: channels || 1, hz };
}

/** MO3 sample loop flags → our SampleFlags (Load_mo3.cpp:293-299). */
function mo3LoopFlags(flags: number): number {
  const SMP_LOOP = 0x10, SMP_PINGPONG = 0x20, SMP_SUSTAIN = 0x100, SMP_SUSTAIN_PINGPONG = 0x200;
  return (
    ((flags & SMP_LOOP) !== 0 ? 0x02 : 0) | // SampleFlags.LOOP
    ((flags & SMP_PINGPONG) !== 0 ? 0x02 | 0x04 : 0) | // LOOP | BIDIR
    ((flags & SMP_SUSTAIN) !== 0 ? 0x20 : 0) | // SUSTAIN
    ((flags & SMP_SUSTAIN_PINGPONG) !== 0 ? 0x20 | 0x40 : 0) // SUSTAIN | SUSTAIN_BIDIR
  );
}

export function mo3Load(bytes: Uint8Array, ctx: LoadCtx): ModuleData {
  const fail = (msg: string): never => {
    throw new ParseError(msg);
  };
  const parsed = parseMO3(bytes, fail);
  const { mod, sampleChunks, sampleHeaders, version } = parsed;
  const isXm = mod.readEventType === ReadEventType.FT2; // XM semantics (mod.format = 'mo3')

  // Sample data → RawSample (Load_mo3.cpp:1598-2039)
  const rawSamples: RawSample[] = [];
  for (let smp = 0; smp < sampleHeaders.length; smp++) {
    const h = sampleHeaders[smp]!;
    const chunk = sampleChunks[smp]!;
    const stereo = (h.flags & SMP_STEREO) !== 0;
    const is16 = (h.flags & SMP_16BIT) !== 0;
    const numChannels = stereo ? 2 : 1;
    const compression = h.flags & SMP_COMPRESSION_MASK;

    let raw: RawSample;
    if (h.compressedSize < 0 && smp + h.compressedSize > 0) {
      // Duplicate sample: handled after registration by copying data ref
      raw = {
        name: '', data: new Uint8Array(0), length: 0,
        loopStart: h.loopStart, loopEnd: h.loopEnd,
        sustainStart: h.sustainStart, sustainEnd: h.sustainEnd,
        finetune: 0, volume: Math.min(h.volume, 64), flags: mo3LoopFlags(h.flags), c5spd: C4_NTSC_RATE,
      };
    } else if (h.length === 0 || chunk.size === 0) {
      raw = {
        name: '', data: new Uint8Array(0), length: 0,
        loopStart: h.loopStart, loopEnd: h.loopEnd,
        sustainStart: h.sustainStart, sustainEnd: h.sustainEnd,
        finetune: 0, volume: Math.min(h.volume, 64), flags: mo3LoopFlags(h.flags), c5spd: C4_NTSC_RATE,
      };
    } else if (compression === 0 && h.compressedSize === 0) {
      // Uncompressed (signed PCM)
      const frames = h.length;
      const byteLen = frames * (is16 ? 2 : 1) * numChannels;
      raw = {
        name: '', data: bytes.subarray(chunk.off, chunk.off + byteLen),
        length: frames, loopStart: h.loopStart, loopEnd: h.loopEnd,
        sustainStart: h.sustainStart, sustainEnd: h.sustainEnd,
        finetune: 0, volume: Math.min(h.volume, 64),
        flags: mo3LoopFlags(h.flags) | (is16 ? 0x01 : 0) | (stereo ? 0x80 : 0),
        c5spd: C4_NTSC_RATE,
      };
    } else if (compression === SMP_DELTA_COMPRESSION || compression === SMP_DELTA_PREDICTION) {
      const total = h.length * numChannels;
      const buf = is16 ? new Int16Array(total) : new Int8Array(total);
      if (compression === SMP_DELTA_COMPRESSION) {
        unpackMo3DeltaSample(chunk.data, chunk.off, buf, h.length, numChannels, is16);
      } else {
        unpackMo3DeltaPredictionSample(chunk.data, chunk.off, buf, h.length, numChannels, is16);
      }
      // raw bytes = little-endian signed PCM
      const byteLen = total * (is16 ? 2 : 1);
      const out = new Uint8Array(byteLen);
      const dv = new DataView(out.buffer);
      for (let i = 0; i < total; i++) {
        if (is16) dv.setInt16(i * 2, buf[i]!, true);
        else out[i] = (buf as Int8Array)[i]! & 0xff;
      }
      raw = {
        name: '', data: out, length: h.length,
        loopStart: h.loopStart, loopEnd: h.loopEnd,
        sustainStart: h.sustainStart, sustainEnd: h.sustainEnd,
        finetune: 0, volume: Math.min(h.volume, 64),
        flags: mo3LoopFlags(h.flags) | (is16 ? 0x01 : 0),
        c5spd: C4_NTSC_RATE,
      };
      if (stereo) raw.flags |= 0x80;
    } else if (compression === SMP_COMPRESSION_MPEG) {
      const res = decodeMp3Sample(chunk.data, chunk.off, chunk.size, h.encoderDelay, h.length, stereo, is16);
      if (!res) {
        raw = {
          name: '', data: new Uint8Array(0), length: 0,
          loopStart: h.loopStart, loopEnd: h.loopEnd,
          sustainStart: h.sustainStart, sustainEnd: h.sustainEnd,
          finetune: 0, volume: Math.min(h.volume, 64), flags: mo3LoopFlags(h.flags), c5spd: C4_NTSC_RATE,
        };
      } else {
        const ch = res.channels;
        const bytesPer = 2;
        const out = new Uint8Array(res.pcm.length * bytesPer);
        const dv = new DataView(out.buffer);
        for (let i = 0; i < res.pcm.length; i++) dv.setInt16(i * 2, res.pcm[i]!, true);
        raw = {
          name: '', data: out,
          length: Math.floor(res.pcm.length / ch),
          loopStart: h.loopStart, loopEnd: h.loopEnd,
          sustainStart: h.sustainStart, sustainEnd: h.sustainEnd,
          finetune: 0, volume: Math.min(h.volume, 64),
          flags: mo3LoopFlags(h.flags) | 0x01 | (ch === 2 ? 0x80 : 0),
          c5spd: res.hz,
        };
      }
    } else {
      // Ogg / OPL / unsupported — treat as empty
      raw = {
        name: '', data: new Uint8Array(0), length: 0,
        loopStart: h.loopStart, loopEnd: h.loopEnd,
        sustainStart: h.sustainStart, sustainEnd: h.sustainEnd,
        finetune: 0, volume: Math.min(h.volume, 64), flags: mo3LoopFlags(h.flags), c5spd: C4_NTSC_RATE,
      };
    }

    // XM sample fields: finetune/transpose (Load_mo3.cpp:305-312)
    if (isXm) {
      raw.finetune = ((h.finetune - 128) << 24) >> 24;
      raw.flags |= 0; // transpose handled via sub.xpo
    }

    ctx.addSample(raw);
    rawSamples.push(raw);
  }
  mod.samples = rawSamples;

  // Wire instruments to samples + per-sample fields (XM semantics).
  // map values are 0-based SAMPLE ids; subs are built per distinct sample
  // and map[note] rewritten to the SUB index (libxmp xxi.map[k].ins
  // semantics — getSubinstrument(mod, ins, map[k])).
  if (isXm) {
    for (const ins of mod.instruments) {
      if (ins.sub.length !== 0) continue;
      const used = new Set<number>();
      for (let k = 12; k < 108; k++) {
        const sid = ins.map[k]!;
        if (sid !== 0xff && sid !== 0) used.add(sid);
      }
      const subIndexBySid = new Map<number, number>();
      let n = 0;
      for (const sid of used) {
        const h = sampleHeaders[sid];
        if (!h) continue;
        ins.sub.push({
          vol: Math.min(h.volume, 64),
          gvl: 0x40,
          pan: h.panning <= 256 ? h.panning : -1,
          xpo: h.transpose,
          fin: ((h.finetune - 128) << 24) >> 24,
          vwf: 0, vde: 0, vra: 0, vsw: 0,
          sid,
          rvv: 0, nna: 0, dct: 0, dca: 0, ifc: 0, ifr: 0,
        });
        subIndexBySid.set(sid, n);
        n++;
      }
      if (n === 0) {
        ins.sub.push({
          vol: 0, gvl: 0x40, pan: -1, xpo: 0, fin: 0, vwf: 0, vde: 0, vra: 0, vsw: 0,
          sid: 0, rvv: 0, nna: 0, dct: 0, dca: 0, ifc: 0, ifr: 0,
        });
      } else {
        for (let k = 12; k < 108; k++) {
          const sid = ins.map[k]!;
          ins.map[k] = subIndexBySid.get(sid) ?? 0xff;
        }
      }
      ins.nsm = ins.sub.length;
    }
  }

  void version;
  return mod;
}

export const plugin: FormatPlugin = {
  name: 'mo3',
  test: mo3Test,
  load: mo3Load,
  readEvent(core, chn, row) {
    // dispatch through the inner format's reader via readEventType
    const mod = core.module;
    void mod; void chn; void row;
    // The core dispatches on mod.readEventType; we reuse the shared readers
    // by deferring to the core's dispatch (same as fmt-mod's dispatch).
    const e = core.readEventScratch(chn) ?? core.readEventAt(mod!.xxo[core.ctx.p.ord] ?? 0, chn, row);
    void e;
    // Call the appropriate reader via the registry: simplest is to import
    // the shared dispatch from fmt-mod at registration time.
    dispatchReadEvent(core, chn, row);
  },
};

import { readEvent as fmtModReadEvent } from '@modplayjs/fmt-mod';
function dispatchReadEvent(core: Core, chn: number, row: number): void {
  fmtModReadEvent(core, chn, row);
}

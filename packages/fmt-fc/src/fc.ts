// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Bitti09 — modplayjs contributors
// Ported from: OpenMPT soundlib/Load_fc.cpp (BSD-3-Clause) — Future
// Composer 1.0-1.3 (SMOD) and 1.4 (FC14) module loader, with the synth
// scripts from soundlib/InstrumentSynth.cpp driving playback.

import type {
  ChannelState,
  Core,
  VoiceState,
  EffectPlugin,
  Event,
  FormatPlugin,
  Instrument,
  LoadCtx,
  ModuleData,
  Pattern,
  RawSample,
  SubInstrument,
} from '@modplayjs/core';
import {
  C4_PAL_RATE,
  EMPTY_EVENT,
  FX_BREAK,
  FX_SPEED,
  FX_FC_AUTO_PORTA,
  FX_FC_TONEPORTA_DURATION,
  FX_FC_MED_SYNTH_JUMP,
  ParseError,
  PeriodType,
  Quirk,
  ReadEventType,
  SampleFlags,
} from '@modplayjs/core';
import {
  SynthEventType,
  SynthState,
  synthStateNextTick,
  evDelay,
  evFcPitchSlide,
  evFcSetPitch,
  evFcSetVibrato,
  evFcSetWaveform,
  evFcVolumeSlide,
  evJump,
  evJumpMarker,
  evMedSetVolume,
  evSetStepSpeed,
  evStopScript,
  fixupJumpTarget,
  type SynthEvent,
} from './synth.js';

// ---------------------------------------------------------------------------
// Structs (Load_fc.cpp:17-141)
// ---------------------------------------------------------------------------

/** FCSampleInfo (Load_fc.cpp:32-58). */
interface FcSampleInfo {
  /** u16be — in words. */
  length: number;
  /** u16be — in bytes. */
  loopStart: number;
  /** u16be — in words. */
  loopLength: number;
}

const FC_MAX_SIZE = 0x80000;

interface FcFileHeader {
  magic: string; // "SMOD" (1.0-1.3) or "FC14" (1.4)
  sequenceSize: number; // u32be
  patternsOffset: number; // u32be
  patternsSize: number;
  freqSequenceOffset: number;
  freqSequenceSize: number;
  volSequenceOffset: number;
  volSequenceSize: number;
  sampleDataOffset: number;
  waveTableOffset: number; // sample data size if version < 1.4
  sampleInfo: FcSampleInfo[];
  isFc14: boolean;
}

function sequenceSizeOf(h: FcFileHeader): number {
  // SequenceSize (Load_fc.cpp:124-134): a broken copy of cult.smod has a
  // sequence size of 0 but the sequence data is actually in the place
  // where it's supposed to be.
  if (h.sequenceSize > 0) return h.sequenceSize;
  const headerSize = h.isFc14 ? 180 : 100;
  if (h.patternsOffset > headerSize) return h.patternsOffset - headerSize;
  return 0;
}

function headerIsValid(h: FcFileHeader): boolean {
  if (h.magic !== 'SMOD' && h.magic !== 'FC14') return false;
  const seqSize = sequenceSizeOf(h);
  if (
    seqSize % 13 > 1 || // Some files have a mysterious extra byte
    seqSize < 13 ||
    seqSize > 256 * 13 ||
    h.patternsSize % 64 !== 0 ||
    h.patternsSize === 0 ||
    h.patternsSize > 64 * 256 ||
    h.patternsOffset > FC_MAX_SIZE ||
    h.freqSequenceSize % 64 !== 0 ||
    h.freqSequenceSize === 0 ||
    h.freqSequenceSize > 64 * 256 ||
    h.freqSequenceOffset > FC_MAX_SIZE ||
    h.volSequenceSize % 64 !== 0 ||
    h.volSequenceSize === 0 ||
    h.volSequenceSize > 64 * 256 ||
    h.volSequenceOffset > FC_MAX_SIZE ||
    h.sampleDataOffset > FC_MAX_SIZE ||
    h.waveTableOffset > FC_MAX_SIZE
  ) {
    return false;
  }
  return true;
}

function readHeader(b: Uint8Array): FcFileHeader | null {
  if (b.length < 100) return null;
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const magic = String.fromCharCode(b[0]!, b[1]!, b[2]!, b[3]!);
  if (magic !== 'SMOD' && magic !== 'FC14') return null;
  const h: FcFileHeader = {
    magic,
    sequenceSize: dv.getUint32(4, false),
    patternsOffset: dv.getUint32(8, false),
    patternsSize: dv.getUint32(12, false),
    freqSequenceOffset: dv.getUint32(16, false),
    freqSequenceSize: dv.getUint32(20, false),
    volSequenceOffset: dv.getUint32(24, false),
    volSequenceSize: dv.getUint32(28, false),
    sampleDataOffset: dv.getUint32(32, false),
    waveTableOffset: dv.getUint32(36, false),
    sampleInfo: [],
    isFc14: magic === 'FC14',
  };
  for (let i = 0; i < 10; i++) {
    const off = 40 + i * 6;
    h.sampleInfo.push({
      length: dv.getUint16(off, false),
      loopStart: dv.getUint16(off + 2, false),
      loopLength: dv.getUint16(off + 4, false),
    });
  }
  if (!headerIsValid(h)) return null;
  return h;
}

// ---------------------------------------------------------------------------
// TranslateFCScript (Load_fc.cpp:146-320)
// ---------------------------------------------------------------------------

/** Event list builder state for the script translator. */
interface ScriptEvents {
  events: SynthEvent[];
}

function translateFcScript(
  events: ScriptEvents,
  script: Uint8Array,
  isFc14: boolean,
  startSequence = 0xffff,
): void {
  const isVolume = startSequence > 255;
  const volScriptSpeed = script[0]! > 0 ? script[0]! : 255;
  if (isVolume) {
    events.events.push(evSetStepSpeed(volScriptSpeed, true));
  }

  const sequencesToParse: number[] = [isVolume ? 0 : startSequence & 0xff];
  const parsedSequences = new Set<number>(sequencesToParse);

  const entryFromByte = new Map<number, number>();
  events.events.push(evJumpMarker(0));

  while (sequencesToParse.length > 0) {
    const sequence = sequencesToParse.pop()!;
    const currentSequenceOffset = sequence * 64;
    if (isVolume) {
      // volume scripts skip the 5-byte header
    }
    const maxScriptJumpPos = (currentSequenceOffset + (isVolume ? 260 : 63)) & 0xffff;
    let maxJump = 0;
    let nextByteIsPitch = false;
    let pos = currentSequenceOffset;
    if (isVolume) pos += 5;

    while (pos < script.length) {
      const scriptPos = pos & 0xffff;
      if (scriptPos <= maxScriptJumpPos) {
        entryFromByte.set(scriptPos, events.events.length);
      }
      const b = script[pos++]!;

      // After several pitch Ex commands, the next byte is always
      // interpreted as Set Pitch.
      if (nextByteIsPitch) {
        events.events.push(evFcSetPitch((b << 24) >> 24));
        nextByteIsPitch = false;
        continue;
      }

      const volumeCommand = evMedSetVolume(Math.min(b & 0x7f, 64));
      let handled = true;
      switch (b) {
        case 0xe0: {
          // Loop (position)
          let target = script[pos++]! & 0x3f;
          if (isVolume && target < 5) {
            // Volume sequence offset is relative to the first volume
            // command at offset 5, so FC subtracts 5 from the jump target
            // and happily underflows the byte value.
            target += 256;
          }
          target += currentSequenceOffset;
          if (!isVolume && target < script.length && (script[target] === 0xe0 || script[target] === 0xe1)) {
            // The first byte that is executed after an E0 jump is never
            // interpreted as command E0 or E1.
            events.events.push(evFcSetPitch((script[target]! << 24) >> 24));
            target++;
            if (target < script.length && script[target - 1] === 0xe0) {
              events.events.push(evFcSetPitch((script[target]! << 24) >> 24));
              target++;
            }
          }
          maxJump = Math.max(maxJump, target);
          events.events.push(evJump(target & 0xffff));
          break;
        }
        case 0xe1: // End (none)
          events.events.push(evStopScript());
          break;
        case 0xe2: // Set waveform (waveform)
          if (!isVolume) {
            pos++; // waveform byte consumed (FC_SetWaveform)
            events.events.push(evFcSetWaveform(b, script[pos - 1]!, 0));
          } else {
            handled = false;
          }
          break;
        case 0xe3: // Set new vibrato (speed, amplitude)
          if (isVolume) {
            handled = false;
          } else {
            const speed = script[pos++]!;
            const depth = script[pos++]!;
            events.events.push(evFcSetVibrato(speed, depth, 0));
          }
          break;
        case 0xe4: // Change waveform (waveform)
          if (isVolume) {
            handled = false;
          } else {
            const waveform = script[pos++]!;
            events.events.push(evFcSetWaveform(b, waveform, 0));
          }
          break;
        case 0xe7: {
          // Jump to freq. sequence (sequence)
          if (isVolume) {
            handled = false;
          } else {
            const sequence2 = script[pos++]!;
            events.events.push(evJump((sequence2 * 64) & 0xffff));
            if (!parsedSequences.has(sequence2)) {
              parsedSequences.add(sequence2);
              sequencesToParse.push(sequence2);
            }
          }
          break;
        }
        case 0xe8: {
          // Sustain (time)
          const delay = script[pos++]!;
          if (isVolume && volScriptSpeed > 1) {
            events.events.push(evSetStepSpeed(1, true));
            events.events.push(evDelay(delay + volScriptSpeed - 2));
            events.events.push(evSetStepSpeed(volScriptSpeed, true));
          } else if (delay !== 0) {
            events.events.push(evDelay(delay - 1));
          }
          break;
        }
        case 0xe9: {
          // Set waveform (waveform, number)
          if (isVolume) {
            handled = false;
          } else if (isFc14) {
            const waveform = script[pos++]!;
            const subSample = script[pos++]!;
            events.events.push(evFcSetWaveform(b, subSample, waveform));
          } else {
            events.events.push(evFcSetPitch((b << 24) >> 24));
          }
          break;
        }
        case 0xea: {
          // Volume slide / Pitch bend (step, time)
          if (isFc14) {
            const speed = script[pos++]!;
            const time = script[pos++]!;
            if (isVolume) {
              events.events.push(evFcVolumeSlide(speed, time));
            } else {
              events.events.push(evFcPitchSlide(speed, time));
            }
            break;
          }
          handled = false;
          break;
        }
        default:
          handled = false;
          break;
      }
      if (!handled) {
        if (isVolume) {
          events.events.push(volumeCommand);
        } else {
          events.events.push(evFcSetPitch((b << 24) >> 24));
        }
      }
      if (!isVolume) {
        nextByteIsPitch = (b >= 0xe2 && b <= 0xe4) || (isFc14 && (b === 0xe9 || b === 0xea));
      }

      // If a sequence doesn't end with an E0/E1/E7 command, execution will
      // continue in the next sequence. E0 commands cannot jump beyond the
      // end of the initial sequence, so we can stop translating additional
      // sequences when we hit command E0/E1 there.
      if (
        (b === 0xe0 || b === 0xe1 || (b === 0xe7 && !isVolume)) &&
        (maxJump <= scriptPos || scriptPos >= maxScriptJumpPos)
      ) {
        break;
      }
    }
  }

  for (const e of events.events) {
    fixupJumpTarget(e, entryFromByte);
  }
}

// ---------------------------------------------------------------------------
// Built-in waveforms (Load_fc.cpp:496-552)
// ---------------------------------------------------------------------------

const FC_SAMPLE_LENGTHS: readonly number[] = [
  16, 16, 16, 16, 16, 16, 16, 16, 16, 16, 16, 16, 16, 16, 16, 16,
  16, 16, 16, 16, 16, 16, 16, 16, 16, 16, 16, 16, 16, 16, 16, 16,
  8, 8, 8, 8, 8, 8, 8, 8, 16, 8, 16, 16, 8, 8, 24, // FC 1.4 imports the last sample with a length of 32 instead of 48
];

const FC_SAMPLE_DATA: readonly number[] = (() => {
  // (Load_fc.cpp:499-552) — 47 rows; the first 16 rows are 32-byte saw
  // ramps, then flat/noise rows.
  const rows: string[] = [
    'C0 C0 D0 D8 E0 E8 F0 F8 00 F8 F0 E8 E0 D8 D0 C8 3F 37 2F 27 1F 17 0F 07 FF 07 0F 17 1F 27 2F 37',
    'C0 C0 D0 D8 E0 E8 F0 F8 00 F8 F0 E8 E0 D8 D0 C8 C0 37 2F 27 1F 17 0F 07 FF 07 0F 17 1F 27 2F 37',
    'C0 C0 D0 D8 E0 E8 F0 F8 00 F8 F0 E8 E0 D8 D0 C8 C0 B8 2F 27 1F 17 0F 07 FF 07 0F 17 1F 27 2F 37',
    'C0 C0 D0 D8 E0 E8 F0 F8 00 F8 F0 E8 E0 D8 D0 C8 C0 B8 B0 27 1F 17 0F 07 FF 07 0F 17 1F 27 2F 37',
    'C0 C0 D0 D8 E0 E8 F0 F8 00 F8 F0 E8 E0 D8 D0 C8 C0 B8 B0 A8 1F 17 0F 07 FF 07 0F 17 1F 27 2F 37',
    'C0 C0 D0 D8 E0 E8 F0 F8 00 F8 F0 E8 E0 D8 D0 C8 C0 B8 B0 A8 A0 17 0F 07 FF 07 0F 17 1F 27 2F 37',
    'C0 C0 D0 D8 E0 E8 F0 F8 00 F8 F0 E8 E0 D8 D0 C8 C0 B8 B0 A8 A0 98 0F 07 FF 07 0F 17 1F 27 2F 37',
    'C0 C0 D0 D8 E0 E8 F0 F8 00 F8 F0 E8 E0 D8 D0 C8 C0 B8 B0 A8 A0 98 90 07 FF 07 0F 17 1F 27 2F 37',
    'C0 C0 D0 D8 E0 E8 F0 F8 00 F8 F0 E8 E0 D8 D0 C8 C0 B8 B0 A8 A0 98 90 88 FF 07 0F 17 1F 27 2F 37',
    'C0 C0 D0 D8 E0 E8 F0 F8 00 F8 F0 E8 E0 D8 D0 C8 C0 B8 B0 A8 A0 98 90 88 80 07 0F 17 1F 27 2F 37',
    'C0 C0 D0 D8 E0 E8 F0 F8 00 F8 F0 E8 E0 D8 D0 C8 C0 B8 B0 A8 A0 98 90 88 80 88 0F 17 1F 27 2F 37',
    'C0 C0 D0 D8 E0 E8 F0 F8 00 F8 F0 E8 E0 D8 D0 C8 C0 B8 B0 A8 A0 98 90 88 80 88 90 17 1F 27 2F 37',
    'C0 C0 D0 D8 E0 E8 F0 F8 00 F8 F0 E8 E0 D8 D0 C8 C0 B8 B0 A8 A0 98 90 88 80 88 90 98 1F 27 2F 37',
    'C0 C0 D0 D8 E0 E8 F0 F8 00 F8 F0 E8 E0 D8 D0 C8 C0 B8 B0 A8 A0 98 90 88 80 88 90 98 A0 27 2F 37',
    'C0 C0 D0 D8 E0 E8 F0 F8 00 F8 F0 E8 E0 D8 D0 C8 C0 B8 B0 A8 A0 98 90 88 80 88 90 98 A0 A8 2F 37',
    'C0 C0 D0 D8 E0 E8 F0 F8 00 F8 F0 E8 E0 D8 D0 C8 C0 B8 B0 A8 A0 98 90 88 80 88 90 98 A0 A8 B0 37',
    '81 81 81 81 81 81 81 81 81 81 81 81 81 81 81 81 7F 7F 7F 7F 7F 7F 7F 7F 7F 7F 7F 7F 7F 7F 7F 7F',
    '81 81 81 81 81 81 81 81 81 81 81 81 81 81 81 81 81 7F 7F 7F 7F 7F 7F 7F 7F 7F 7F 7F 7F 7F 7F 7F',
    '81 81 81 81 81 81 81 81 81 81 81 81 81 81 81 81 81 81 7F 7F 7F 7F 7F 7F 7F 7F 7F 7F 7F 7F 7F 7F',
    '81 81 81 81 81 81 81 81 81 81 81 81 81 81 81 81 81 81 81 7F 7F 7F 7F 7F 7F 7F 7F 7F 7F 7F 7F 7F',
    '81 81 81 81 81 81 81 81 81 81 81 81 81 81 81 81 81 81 81 81 7F 7F 7F 7F 7F 7F 7F 7F 7F 7F 7F 7F',
    '81 81 81 81 81 81 81 81 81 81 81 81 81 81 81 81 81 81 81 81 81 7F 7F 7F 7F 7F 7F 7F 7F 7F 7F 7F',
    '81 81 81 81 81 81 81 81 81 81 81 81 81 81 81 81 81 81 81 81 81 81 7F 7F 7F 7F 7F 7F 7F 7F 7F 7F',
    '81 81 81 81 81 81 81 81 81 81 81 81 81 81 81 81 81 81 81 81 81 81 81 7F 7F 7F 7F 7F 7F 7F 7F 7F',
    '81 81 81 81 81 81 81 81 81 81 81 81 81 81 81 81 81 81 81 81 81 81 81 81 7F 7F 7F 7F 7F 7F 7F 7F',
    '81 81 81 81 81 81 81 81 81 81 81 81 81 81 81 81 81 81 81 81 81 81 81 81 81 7F 7F 7F 7F 7F 7F 7F',
    '81 81 81 81 81 81 81 81 81 81 81 81 81 81 81 81 81 81 81 81 81 81 81 81 81 81 7F 7F 7F 7F 7F 7F',
    '81 81 81 81 81 81 81 81 81 81 81 81 81 81 81 81 81 81 81 81 81 81 81 81 81 81 81 7F 7F 7F 7F 7F',
    '81 81 81 81 81 81 81 81 81 81 81 81 81 81 81 81 81 81 81 81 81 81 81 81 81 81 81 81 7F 7F 7F 7F',
    '80 80 80 80 80 80 80 80 80 80 80 80 80 80 80 80 80 80 80 80 80 80 80 80 80 80 80 80 80 80 7F 7F',
    '80 80 80 80 80 80 80 80 80 80 80 80 80 80 80 80 80 80 80 80 80 80 80 80 80 80 80 80 80 80 80 7F',
    '80 80 80 80 80 80 80 80 7F 7F 7F 7F 7F 7F 7F 7F',
    '80 80 80 80 80 80 80 7F 7F 7F 7F 7F 7F 7F 7F 7F 7F',
    '80 80 80 80 80 80 7F 7F 7F 7F 7F 7F 7F 7F 7F 7F 7F',
    '80 80 80 80 80 7F 7F 7F 7F 7F 7F 7F 7F 7F 7F 7F 7F',
    '80 80 80 80 7F 7F 7F 7F 7F 7F 7F 7F 7F 7F 7F 7F 7F',
    '80 80 80 7F 7F 7F 7F 7F 7F 7F 7F 7F 7F 7F 7F 7F 7F',
    '80 80 7F 7F 7F 7F 7F 7F 7F 7F 7F 7F 7F 7F 7F 7F 7F',
    '80 80 7F 7F 7F 7F 7F 7F 7F 7F 7F 7F 7F 7F 7F 7F 7F',
    '80 80 90 98 A0 A8 B0 B8 C0 C8 D0 D8 E0 E8 F0 F8 00 08 10 18 20 28 30 38 40 48 50 58 60 68 70 7F',
    '80 80 A0 B0 C0 D0 E0 F0 00 10 20 30 40 50 60 70',
    '45 45 79 7D 7A 77 70 66 61 58 53 4D 2C 20 18 12 04 DB D3 CD C6 BC B5 AE A8 A3 9D 99 93 8E 8B 8A',
    '45 45 79 7D 7A 77 70 66 5B 4B 43 37 2C 20 18 12 04 F8 E8 DB CF C6 BE B0 A8 A4 9E 9A 95 94 8D 83',
    '00 00 40 60 7F 60 40 20 00 E0 C0 A0 80 A0 C0 E0',
    '00 00 40 60 7F 60 40 20 00 E0 C0 A0 80 A0 C0 E0',
    '80 80 90 98 A0 A8 B0 B8 C0 C8 D0 D8 E0 E8 F0 F8 00 08 10 18 20 28 30 38 40 48 50 58 60 68 70 7F 80 80 A0 B0 C0 D0 E0 F0 00 10 20 30 40 50 60 70',
  ];
  const out: number[] = [];
  for (const row of rows) {
    for (const tok of row.split(' ')) {
      out.push(parseInt(tok, 16));
    }
  }
  return out;
})();

/** 8-bit signed sample from the built-in waveform table. */
function sampleFromBuiltin(offset: number, length: number): Uint8Array {
  const data = new Uint8Array(length);
  for (let i = 0; i < length; i++) {
    const v = FC_SAMPLE_DATA[offset + i] ?? 0x80;
    data[i] = v;
  }
  return data;
}

// ---------------------------------------------------------------------------
// fc_test / fc_load (Load_fc.cpp:331-562)
// ---------------------------------------------------------------------------

export function fcTest(bytes: Uint8Array): boolean {
  return readHeader(bytes) !== null;
}

/** OpenMPT NOTE_MIDDLEC = 61, NOTE_MIN = 1. Our note convention: the same
 *  OpenMPT note values (1..128) + keyoff/cut/fade markers ≥ 0x79, matching
 *  fmt-xm's event storage. */
const NOTE_MIDDLEC = 61;

/** FCSampleInfo::ConvertToMPT (Load_fc.cpp:42-58). */
function convertSample(
  info: FcSampleInfo,
  bytes: Uint8Array,
  filePos: { v: number },
  isFc14: boolean,
  raw: RawSample,
): void {
  let length = info.length * 2;
  if (isFc14 && length !== 0) length += 2;
  const loopStart = info.loopStart;
  const loopEnd = loopStart + info.loopLength * 2;
  const looped = info.loopLength > 1;

  // Fix for axel foley remix.smod (loop extends into next sample)
  const nextSampleStart = filePos.v + length;
  if (looped && loopEnd > length) {
    length = loopEnd;
  }

  raw.length = length;
  raw.loopStart = loopStart;
  raw.loopEnd = loopEnd;
  raw.flags = looped ? SampleFlags.LOOP : 0;
  raw.finetune = 0;
  raw.volume = 64;
  raw.c5spd = 8363; // MOD c5speed (Amiga)

  // SampleIO{8bit, mono, bigEndian, signedPCM}.ReadSample
  const take = Math.min(length, Math.max(0, bytes.length - filePos.v));
  const data = new Uint8Array(length);
  for (let i = 0; i < take; i++) {
    data[i] = bytes[filePos.v + i]!;
  }
  // Big-endian signed 8-bit → our signed 8-bit (same bytes; the store's
  // signedByte() reinterprets).
  raw.data = data;

  filePos.v = nextSampleStart;
}

export function fcLoad(bytes: Uint8Array, ctx: LoadCtx): ModuleData {
  const header = readHeader(bytes);
  if (!header) throw new ParseError('FC: invalid header');
  const isFc14 = header.isFc14;

  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);

  // InitializeGlobals(MOD_TYPE_MOD, 4) + SetupMODPanning(true).
  const chnCount = 4;
  const numInstruments = Math.min(
    Math.trunc(header.volSequenceSize / 64) + 1,
    255,
  );

  // std::array<uint8, 80> waveTableLengths (only for FC 1.4).
  const waveTableLengths = new Uint8Array(80);
  let pos = 100;
  if (isFc14) {
    waveTableLengths.set(bytes.subarray(pos, pos + 80));
    pos += 80;
  }

  const numOrders = Math.trunc(sequenceSizeOf(header) / 13);
  const orderData: Array<{
    pattern: number[];
    noteTranspose: number[];
    instrTranspose: number[];
    speed: number;
  }> = [];
  for (let ord = 0; ord < numOrders; ord++) {
    const off = pos + ord * 13;
    const entry = {
      pattern: [0, 0, 0, 0],
      noteTranspose: [0, 0, 0, 0],
      instrTranspose: [0, 0, 0, 0],
      speed: 0,
    };
    for (let c = 0; c < 4; c++) {
      entry.pattern[c] = bytes[off + c * 3]!;
      entry.noteTranspose[c] = (bytes[off + c * 3 + 1]! << 24) >> 24;
      entry.instrTranspose[c] = (bytes[off + c * 3 + 2]! << 24) >> 24;
    }
    entry.speed = bytes[off + 12]!;
    orderData.push(entry);
  }
  pos += numOrders * 13;

  // Pattern data (patternsSize / 2 u16 pairs, big-endian).
  const patternData: Array<[number, number]> = [];
  {
    let p = header.patternsOffset;
    const count = header.patternsSize / 2;
    for (let i = 0; i < count; i++) {
      patternData.push([dv.getUint16(p + i * 2, false) >> 8, dv.getUint16(p + i * 2, false) & 0xff]);
    }
  }

  // Patterns: one per order, 32 rows (Load_fc.cpp:382-439).
  const patterns: Pattern[] = [];
  const prevNote = [0, 0, 0, 0];
  for (let ord = 0; ord < numOrders; ord++) {
    const rows = 32;
    const tracks: Pattern['tracks'] = [];
    for (let c = 0; c < chnCount; c++) {
      const ev: Event[] = [];
      for (let r = 0; r < rows; r++) ev.push({ ...EMPTY_EVENT });
      tracks.push({ rows, event: ev });
    }
    patterns.push({ rows, tracks });

    let lastRow = rows;
    const order = orderData[ord]!;
    for (let c = 0; c < chnCount; c++) {
      const chnInfo = order;
      const patternOffset = chnInfo.pattern[c]! * 32;
      if (patternOffset >= patternData.length) continue;
      const track = patterns[ord]!.tracks[c]!;
      for (let row = 0; row < rows; row++) {
        const p = patternData[patternOffset + row] ?? [0, 0];
        const m = track.event[row]!;
        if (p[0] === 0x49) {
          lastRow = Math.min(lastRow, row);
        }

        if (p[0] > 0 && p[0] !== 0x49) {
          prevNote[c] = p[0];
          // m->note = NOTE_MIN + ((noteTranspose + p[0]) & 0x7F) — an
          // OpenMPT note value; our events store OpenMPT values too.
          m.note = 1 + ((chnInfo.noteTranspose[c]! + p[0]) & 0x7f);
          const instr = (p[1] & 0x3f) + chnInfo.instrTranspose[c]! + 1;
          m.ins = instr >= 1 && instr <= numInstruments ? instr : numInstruments;
        } else if (
          row === 0 &&
          ord > 0 &&
          orderData[ord - 1]!.noteTranspose[c] !== chnInfo.noteTranspose[c] &&
          prevNote[c]! > 0
        ) {
          m.note = 1 + ((chnInfo.noteTranspose[c]! + prevNote[c]!) & 0x7f);
          if ((p[1] & 0xc0) !== 0) {
            // VOLCMD_TONEPORTAMENTO, param 9
            m.f2t = 0x03; // FX_TONEPORTA via volume column path
            m.f2p = 9;
          } else {
            m.fxt = FX_FC_TONEPORTA_DURATION;
            m.fxp = 0;
          }
        }
        if ((p[1] & 0xc0) !== 0) {
          // CMD_AUTO_PORTAMENTO_FC
          m.f2t = FX_FC_AUTO_PORTA;
          m.f2p = 0;
        }
        if ((p[1] & 0x80) !== 0) {
          const data = row + 1 < 32 ? (patternData[patternOffset + row + 1] ?? [0, 0])[1]! : 0;
          let param = (data & 0x1f) as number;
          if (!isFc14) param *= 2;
          if (data > 0x1f) param = -param;
          m.fxp = param & 0xff;
        }
      }
    }
    if (order.speed !== 0) {
      // WriteEffect(CMD_SPEED, speed).RetryNextRow() — the speed lands on
      // row 0 and is retried until it takes effect; we can write it
      // directly into row 0 of channel 0 (Fxc speed semantics).
      const m = patterns[ord]!.tracks[0]!.event[0]!;
      if (m.fxt === 0) {
        m.fxt = FX_SPEED;
        m.fxp = order.speed;
      }
    }
    if (lastRow < rows) {
      const row = Math.max(lastRow, 1) - 1;
      // WriteEffect(CMD_PATTERNBREAK, 0).Row(row)
      const m = patterns[ord]!.tracks[3]!.event[row]!;
      if (m.fxt === 0) {
        m.fxt = FX_BREAK;
        m.fxp = 0;
      }
    }
  }

  // Sequences (Load_fc.cpp:443-452).
  const freqSequences = new Uint8Array(64 * 256);
  {
    let p = header.freqSequenceOffset;
    const len = header.freqSequenceSize;
    for (let i = 0; i < len; i++) {
      freqSequences[i] = bytes[p + i] ?? 0;
    }
  }
  const volSequences = new Uint8Array(header.volSequenceSize + 8);
  {
    let p = header.volSequenceOffset;
    const len = header.volSequenceSize;
    for (let i = 0; i < len; i++) {
      volSequences[i] = bytes[p + i] ?? 0;
    }
  }
  // Empty instrument for out-of-range instrument numbers
  // (Load_fc.cpp:455-458).
  const emptyInstr = [0x01, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0xe1];
  for (let i = 0; i < 8; i++) {
    volSequences[header.volSequenceSize + i] = emptyInstr[i]!;
  }

  // Instruments (Load_fc.cpp:460-487).
  const instruments: Instrument[] = [];
  for (let ins = 1; ins <= numInstruments; ins++) {
    const volSeqOff = (ins - 1) * 64;
    const volSeq = volSequences.subarray(volSeqOff, volSeqOff + 64);
    const freqSeqOff = (volSeq[1] ?? 0) * 64;
    const freqSeq = freqSequences.subarray(freqSeqOff, freqSeqOff + 64);
    let defaultSample = freqSeq[1] ?? 0;
    if (freqSeq[0] === 0xe9) {
      defaultSample = 90 + defaultSample * 10 + (freqSeq[2] ?? 0);
    }

    // NoteMap (Load_fc.cpp:471-479):
    //   note < 48:  note + NOTE_MIDDLEC - 24
    //   note < 60 or >= 120: NOTE_MIDDLEC + 23
    //   else: note + NOTE_MIDDLEC - 36 - 60
    const map = new Array<number>(121).fill(0xff);
    const mapXpo = new Array<number>(121).fill(0);
    // C: instr->NoteMap[note] remaps played notes (Load_fc.cpp:471-479).
    // Our sub-instrument model expresses that as a per-key transpose:
    // map[key] = 0 (the single sub), mapXpo[key] = NoteMap[note] - note.
    for (let note = 0; note <= 127; note++) {
      let mapped: number;
      if (note < 48) mapped = note + NOTE_MIDDLEC - 24;
      else if (note < 60 || note >= 120) mapped = NOTE_MIDDLEC + 23;
      else mapped = note + NOTE_MIDDLEC - 36 - 60;
      const key = note + 1; // our events store OpenMPT note values
      if (key >= 1 && key <= 120) {
        map[key - 1] = 0; // sub index 0
        mapXpo[key - 1] = mapped - note;
      }
    }

    // TranslateFCScript for the freq + volume scripts.
    const freqEvents: ScriptEvents = { events: [] };
    const volEvents: ScriptEvents = { events: [] };
    freqEvents.events.push(evFcSetVibrato(volSeq[2] ?? 0, volSeq[3] ?? 0, volSeq[4] ?? 0));
    translateFcScript(freqEvents, freqSequences, isFc14, volSeq[1] ?? 0);
    translateFcScript(volEvents, volSequences, isFc14);

    const sub: SubInstrument = {
      vol: 64,
      gvl: 0x40,
      pan: -1,
      xpo: 0,
      fin: 0,
      vwf: 0,
      vde: 0,
      vra: 0,
      vsw: 0,
      sid: defaultSample, // 0-based sample id (C: defaultSample + 1 - 1)
      rvv: 0,
      nna: 0,
      dct: 0,
      dca: 0,
      ifc: 0,
      ifr: 0,
    };

    const instrument: Instrument = {
      name: '',
      volume: 64,
      nsm: 1,
      rls: 0,
      map,
      mapXpo,
      sub: [sub],
      aei: zeroEnvelope(),
      pei: zeroEnvelope(),
      fei: zeroEnvelope(),
    };
    instruments.push(instrument);
    fcScripts.set(instrument, [freqEvents.events, volEvents.events]);
  }

  // Sample data (Load_fc.cpp:489-524). Dense 0..189 slot list (C keeps
  // MAX_SAMPLES slots; FC 1.4 sub-samples live at 91+).
  const rawSamples: RawSample[] = [];
  for (let i = 0; i < 190; i++) rawSamples.push(blankSample());
  const sampleFilePos = { v: header.sampleDataOffset };
  for (let smp = 0; smp < 10; smp++) {
    const info = header.sampleInfo[smp]!;
    if (info.length === 0) continue;

    if (isFc14 && bytes[sampleFilePos.v] === 0x53 /* S */ && bytes[sampleFilePos.v + 1] === 0x53 && bytes[sampleFilePos.v + 2] === 0x4d && bytes[sampleFilePos.v + 3] === 0x50) {
      // "SSMP" — FC 1.4 sub-samples
      sampleFilePos.v += 4;
      const sampleHeaders = bytes.subarray(sampleFilePos.v, sampleFilePos.v + 160);
      sampleFilePos.v += 160;
      for (let subSmp = 0; subSmp < 10; subSmp++) {
        const hOff = subSmp * 16;
        const subInfo: FcSampleInfo = {
          length: (sampleHeaders[hOff + 4]! << 8) | sampleHeaders[hOff + 5]!,
          loopStart: (sampleHeaders[hOff + 6]! << 8) | sampleHeaders[hOff + 7]!,
          loopLength: (sampleHeaders[hOff + 8]! << 8) | sampleHeaders[hOff + 9]!,
        };
        const raw = blankSample();
        convertSample(subInfo, bytes, sampleFilePos, true, raw);
        ctx.addSample(raw);
        rawSamples[91 + smp * 10 + subSmp - 1] = raw;
      }
    } else {
      const raw = rawSamples[smp]!;
      convertSample(info, bytes, sampleFilePos, isFc14, raw);
    }
  }

  // Built-in waveform samples (Load_fc.cpp:526-556): samples 11..(10+n).
  const sampleLengths: readonly number[] = isFc14
    ? Array.from(waveTableLengths)
    : FC_SAMPLE_LENGTHS;
  let builtinOffset = 0;
  for (let smp = 0; smp < sampleLengths.length; smp++) {
    const len = sampleLengths[smp]! * 2;
    const raw = rawSamples[10 + smp]!;
    raw.length = len;
    raw.loopStart = 0;
    raw.loopEnd = len;
    raw.flags = SampleFlags.LOOP;
    raw.data = isFc14
      ? bytes.subarray(header.waveTableOffset + builtinOffset, header.waveTableOffset + builtinOffset + len)
      : sampleFromBuiltin(builtinOffset, len);
    if (isFc14) builtinOffset += len;
    else builtinOffset += len;
  }
  // Register every slot in order so store ids align with slot indices.
  for (const raw of rawSamples) ctx.addSample(raw);

  // Assemble the module (Load_fc.cpp:337-380 semantics).
  const mod: ModuleData = {
    title: '',
    format: 'mod',
    comment: '',
    chn: chnCount,
    pat: numOrders,
    ins: numInstruments,
    len: numOrders,
    restart: 0,
    xxo: Array.from({ length: numOrders }, (_, i) => i),
    channels: [],
    patterns,
    instruments,
    samples: rawSamples,
    num_sequences: 1,
    sequences: [
      {
        ord: 0,
        entry_point: 0,
        duration: 0,
        time: 0,
        speed: 3,
        bpm: 125,
        gvl: -1,
        start_row: 0,
      },
    ],
    speed: 3, // Order().SetDefaultSpeed(3)
    bpm: 125,
    volbase: 0x40,
    gvolbase: 0x40,
    gvol: 0x40,
    quirks: Quirk.PROTRACK,
    flowMode: 0,
    readEventType: ReadEventType.MOD,
    periodType: PeriodType.AMIGA,
    defpan: 0x80,
    time_factor: 10,
    rrate: 250,
    c4rate: C4_PAL_RATE,
    compare_vblank: false,
    tracker: isFc14 ? 'Future Composer 1.4' : 'Future Composer 1.0 - 1.3',
    extras: { kind: 'fc' },
  };

  // SetupMODPanning(true) (Sndfile.cpp) — LRLR Amiga panning.
  for (let i = 0; i < chnCount; i++) {
    const pan = Math.floor((i + 1) / 2) % 2 === 0 ? 0x20 : 0xe0; // 64/224 of 255
    mod.channels.push({
      pan: i % 2 === 0 ? 0x20 : 0xe0,
      vol: 0x40,
      flg: 0,
    });
    void pan;
  }

  void dv;
  return mod;
}

function zeroEnvelope() {
  return { flags: 0, npt: 0, scl: 0, sus: 0, sue: 0, lps: 0, lpe: 0, x: [], y: [] };
}

function blankSample(): RawSample {
  return {
    name: '',
    data: new Uint8Array(0),
    length: 0,
    loopStart: 0,
    loopEnd: 0,
    sustainStart: 0,
    sustainEnd: 0,
    finetune: 0,
    volume: 64,
    flags: 0,
    c5spd: 8363,
  };
}

// declare the channels() helper used above (orderData rows)
declare module './fc.js' {}

// ---------------------------------------------------------------------------
// Script registry + player hooks
// ---------------------------------------------------------------------------

/** Per-instrument synth scripts (C: instr->synth.m_scripts). Keyed by the
 *  Instrument object identity. */
const fcScripts = new WeakMap<Instrument, SynthEvent[][]>();

/** Per-channel synth state (C: chn.synthState.states) + last applied
 *  values for the post-tick hook. */
interface FcChannelExtras {
  states: SynthState[];
  /** Scripts of the instrument currently on the channel. */
  scripts: SynthEvent[][] | null;
  /** C: chn.swapSampleIndex (kMODSampleSwap deferral). */
  swapSampleIndex: number;
  /** C: chn.fcPortaTick (PortamentoFC toggle). */
  fcPortaTick: boolean;
  /** C: chn.autoSlide PortamentoFC active. */
  fcPortaActive: boolean;
  fcPortaParam: number;
  /** C: TonePortamentoWithDuration state. */
  portaDurationActive: boolean;
  portamentoSlide: number;
}

const fcChannelState: FcChannelExtras[] = [];

function getChannelExtras(core: Core, chn: number): FcChannelExtras {
  void core;
  let st = fcChannelState[chn];
  if (!st) {
    st = {
      states: [],
      scripts: null,
      swapSampleIndex: 0,
      fcPortaTick: false,
      fcPortaActive: false,
      fcPortaParam: 0,
      portaDurationActive: false,
      portamentoSlide: 0,
    };
    fcChannelState[chn] = st;
  }
  return st;
}

// ---------------------------------------------------------------------------
// Effect plugin (drives the synth engine per tick)
// ---------------------------------------------------------------------------

/** OpenMPT Sndmix.cpp:2197 (NextTick before volume) + :2371
 *  (ApplyChannelState after volume) — the plugin's onTick/onTickPost run at
 *  exactly those points in our per-channel loop. */
export const fcEffect: EffectPlugin = {
  name: 'fc-synth',

  onRow(core: Core, chn: number, ev: Event): void {
    void core;
    const mod = core.module!;
    if (mod.extras?.kind !== 'fc') return;
    const st = getChannelExtras(core, chn);

    // AutoSlide activation (Snd_fx.cpp:3444-3447):
    // CMD_AUTO_PORTAMENTO_FC → fcPortaActive = param != 0.
    if (ev.fxt === FX_FC_AUTO_PORTA) {
      st.fcPortaActive = ev.fxp !== 0;
      st.fcPortaParam = ev.fxp;
    }

    // Instrument change → rebind scripts (C: chn.pModInstrument changes).
    if (ev.ins > 0 && ev.ins <= mod.instruments.length) {
      const instr = mod.instruments[ev.ins - 1]!;
      const scripts = fcScripts.get(instr);
      if (scripts) {
        st.scripts = scripts;
        st.states = scripts.map(() => new SynthState());
      }
    }

    // New note → reset synth state (C: chn.triggerNote → reconstruct).
    if (ev.note > 0 && ev.note < 0x78) {
      for (const s of st.states) s.reconstruct();
    }

    // CMD_TONEPORTA_DURATION (Snd_fx.cpp:1284-1287 + :4535-4560):
    if (ev.fxt === FX_FC_TONEPORTA_DURATION) {
      if (ev.note > 0) {
        st.portaDurationActive = ev.fxp !== 0;
        if (ev.fxp === 0) {
          // chn.nPeriod = chn.nPortamentoDest
        } else {
          const xc = core.ctx.channelStates[chn]!;
          const speed = core.ctx.p.speed;
          st.portamentoSlide = Math.trunc((Math.abs(xc.note - (xc.note)) * 64) / (speed * ev.fxp)) || 1;
        }
      }
    }

    // CMD_MED_SYNTH_JUMP: jump the volume script (C: GlobalScriptState +
    // chn.synthState special case at InstrumentSynth.cpp:214-224).
    if (ev.fxt === FX_FC_MED_SYNTH_JUMP) {
      if (st.scripts && st.scripts[1]) {
        const script = st.scripts[1];
        if (st.states.length < 2) st.states.push(new SynthState());
        const state = st.states[1]!;
        if (state.nextRow === 0 && script.length > 0 && script[0]!.type === SynthEventType.SetStepSpeed) {
          state.nextRow = 0;
        }
        state.jumpToPosition(script, ev.fxp);
      }
    }
  },

  onTick(core: Core, chn: number): void {
    const mod = core.module!;
    if (mod.extras?.kind !== 'fc') return;
    const st = getChannelExtras(core, chn);
    if (!st.scripts) return;

    // InstrumentSynth::States::NextTick (Sndmix.cpp:2197) — before volume.
    for (let i = 0; i < st.scripts.length; i++) {
      const script = st.scripts[i]!;
      let state = st.states[i];
      if (!state) {
        state = new SynthState();
        st.states[i] = state;
      }
      const xc = core.ctx.channelStates[chn]!;
      if (xc.note !== 0 && (xc.note_flags & (1 << 6)) !== 0) {
        // C: chn.triggerNote → reconstruct (new note this row)
        state.reconstruct();
      }
      synthStateNextTick(core, chn, script, state);
    }
  },

  onTickPost(core: Core, chn: number): void {
    const mod = core.module!;
    if (mod.extras?.kind !== 'fc') return;
    const st = getChannelExtras(core, chn);
    if (!st.scripts) return;

    const xc = core.ctx.channelStates[chn]!;
    const instr = xc.ins >= 0 ? mod.instruments[xc.ins] : null;
    if (!instr) return;

    // PortamentoFC (Sndmix.cpp:4017-4019 → Snd_fx.cpp:4151-4159):
    if (st.fcPortaActive) {
      st.fcPortaTick = !st.fcPortaTick;
      if (st.fcPortaTick) {
        const vi = core.virt.mapChannel(chn);
        const v: VoiceState | null = vi >= 0 ? (core.virt.voices[vi] ?? null) : null;
        if (v !== null && v.period > 0) {
          const delta = (st.fcPortaParam << 24) >> 24; // int8 param
          v.period -= delta * 4;
        }
      }
    }

    // ApplyChannelState (Sndmix.cpp:2371) per script state.
    for (let i = 0; i < st.scripts.length; i++) {
      const script = st.scripts[i]!;
      const state = st.states[i];
      if (!state) continue;
      const applied = applyState(core, chn, xc, instr, state);
      if (applied && i === 0) {
        // The frequency script drives pitch; the volume script drives
        // volume (C: both ApplyChannelState in order).
      }
      void script;
    }

    // kMODSampleSwap deferral (ChannelSetSample → swapSampleIndex):
    // C swaps at the end of the running loop; our mixer performs the swap
    // at loop end via queued samples. Apply now if the voice stopped.
    if (st.swapSampleIndex > 0) {
      const vi = core.virt.mapChannel(chn);
      const v: VoiceState | null = vi >= 0 ? (core.virt.voices[vi] ?? null) : null;
      const stillActive = v !== null && v.smp >= 0 && v.end > v.start;
      if (!stillActive) {
        const smp0 = st.swapSampleIndex - 1;
        if (smp0 >= 0 && smp0 < mod.samples.length) {
          core.virt.setPatchSmp(chn, xc.ins, smp0, xc.note);
        }
        st.swapSampleIndex = 0;
      }
    }
  },
};

/** ApplyChannelState (InstrumentSynth.cpp:468-554) — write the synth's
 *  volume/pan/period results into the channel/voice. */
function applyState(
  core: Core,
  chn: number,
  xc: ChannelState,
  instr: Instrument,
  state: SynthState,
): boolean {
  const vi = core.virt.mapChannel(chn);
  const v: VoiceState | null = vi >= 0 ? (core.virt.voices[vi] ?? null) : null;

  // Volume (C: chn.nRealVolume scaling).
  if (v !== null && v.smp >= 0) {
    if (state.volumeFactor !== 16384) {
      v.vol = Math.trunc((v.vol * state.volumeFactor) / 16384);
    }
    if (state.volumeAdd !== -32768) {
      v.vol = clampVol(v.vol + state.volumeAdd / 4);
    }
    if ((state.flags & (1 << 1) /* kGTKTremorEnabled */) !== 0 &&
        (state.flags & (1 << 2) /* kGTKTremorMute */) !== 0) {
      v.vol = 0;
    }
  }

  // Panning (C: chn.nRealPan adjustments) — FC doesn't change panning.
  void state.panning;

  // Period (C: period += m_periodAdd etc. before the final clamp).
  if (v !== null && v.period > 0) {
    let period = v.period;
    if (state.periodFreqSlide !== 0) {
      // DoFreqSlide with MOD semantics: period -= amount
      period -= state.periodFreqSlide;
    }
    period += state.periodAdd;
    if (state.linearPitchFactor !== 0) {
      // Linear-pitch formats only; FC uses Amiga periods.
    }
    if (state.medVibratoDepth !== 0) {
      period += Math.trunc((state.medVibratoValue * state.medVibratoDepth) / 64);
    }

    // FC pitch + vibrato (InstrumentSynth.cpp:505-535).
    const vibratoFc = state.fcVibratoValue - state.fcVibratoDepth;
    const doVibratoFc = vibratoFc !== 0 && state.fcVibratoDelay < 1;
    if (state.fcPitch !== 0 || doVibratoFc) {
      const lastNote = xc.note - 12; // OpenMPT note (nLastNote)
      let fcNote: number;
      if (state.fcPitch >= 0) {
        fcNote = (state.fcPitch + lastNote - 1) & 0x7f;
      } else {
        fcNote = state.fcPitch & 0x7f;
      }
      if (state.fcPitch !== 0 && lastNote >= 1 && lastNote <= 128) {
        const mapped = instr.map[fcNote] ?? 0;
        const base = instr.map[(lastNote - 1) & 0x7f] ?? 0;
        if (mapped > 0 && base > 0) {
          period += notePeriod(core, mapped) - notePeriod(core, base);
        }
      }
      if (doVibratoFc) {
        let note = fcNote * 2 + 160;
        let vf = vibratoFc;
        while (note < 256) {
          vf *= 2;
          note += 24;
        }
        period += vf * 4;
      }
    }

    // Period limits (Load_fc.cpp:343-344: 113*4 .. 3424*4).
    if (period < 113 * 4) period = 113 * 4;
    else if (period > 3424 * 4) period = 3424 * 4;
    if (period < 1) period = 1;

    v.period = period;
  }

  return true;
}

function notePeriod(core: Core, openmptNote: number): number {
  void core;
  // GetPeriodFromNote for MOD: 8363 * FreqS3MTable[n%12] << 5 / (8363 << n/12)
  const FREQ = [1712, 1616, 1524, 1440, 1356, 1280, 1208, 1140, 1076, 1016, 960, 907];
  const n = openmptNote - 1; // NOTE_MIN = 1
  if (n < 0) return 0;
  return Math.trunc((8363 * (FREQ[n % 12]! << 5)) / (8363 << Math.floor(n / 12)));
}

function clampVol(v: number): number {
  return Math.max(0, Math.min(64, v));
}

/** The plugin the demo/core registers. Also wires the channel extras reset
 *  on module start (C: new_channel_extras). */
export const plugin: FormatPlugin = {
  name: 'fc',
  test: fcTest,
  load: fcLoad,
  readEvent(core: Core, chn: number, row: number): void {
    // FC modules use the MOD event reader (MOD_TYPE_MOD) — the FC-specific
    // commands are interpreted in the effect hooks above.
    const mod = core.module!;
    void mod; void chn; void row;
    // Defer to fmt-mod's MOD reader via re-registration ordering: the core
    // dispatches on mod.format ('fc') — we replicate read_event_mod here.
    const e =
      core.readEventScratch(chn) ?? core.readEventAt(mod.xxo[core.ctx.p.ord] ?? 0, chn, row);
    if (e.ins !== 0) {
      const xc = core.ctx.channelStates[chn]!;
      xc.old_ins = e.ins;
    }
    // Use the shared MOD reader through the registered fmt-mod plugin so
    // note/volume handling is identical; our effect hooks layer the FC
    // behaviour on top.
    modReadEvent(core, chn, row);
  },
};

// Injected by the demo/registry wiring (avoids a package cycle).
let modReadEvent: (core: Core, chn: number, row: number) => void = () => {
  throw new ParseError('FC: fmt-mod reader not wired');
};

/** Wire the shared MOD event reader (called by the host after registering
 *  both plugins — C: MOD_TYPE_MOD shares read_event_mod). */
export function setModEventReader(fn: (core: Core, chn: number, row: number) => void): void {
  modReadEvent = fn;
}


// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Bitti09 — modplayjs contributors
// Ported from: libxmp src/loaders/mmd_common.c + loaders/med.h.
// Common MED/OctaMED code: tempo conversion, effect translation, BPM setup,
// tracker version detection, and the expdata/InstrExt struct carriers.

import type { Event } from '@modplayjs/core';
import {
  FX,
  ParseError,
  XMP_KEY_CUT,
  MED_VER_210 as IMPORTED_MED_VER_210,
  MED_VER_300 as IMPORTED_MED_VER_300,
  MED_VER_320 as IMPORTED_MED_VER_320,
  MED_VER_OCTAMED_100 as IMPORTED_MED_VER_OCTAMED_100,
  MED_VER_OCTAMED_200 as IMPORTED_MED_VER_OCTAMED_200,
  MED_VER_OCTAMED_300 as IMPORTED_MED_VER_OCTAMED_300,
  MED_VER_OCTAMED_500 as IMPORTED_MED_VER_OCTAMED_500,
  MED_VER_OCTAMED_502 as IMPORTED_MED_VER_OCTAMED_502,
  MED_VER_OCTAMED_SS_1 as IMPORTED_MED_VER_OCTAMED_SS_1,
  MED_VER_OCTAMED_SS_2 as IMPORTED_MED_VER_OCTAMED_SS_2,
} from '@modplayjs/core';

/** MED_VER constants (loaders/med.h:9-19), re-exported for the loaders. */
export const MED_VER_210 = IMPORTED_MED_VER_210;
export const MED_VER_300 = IMPORTED_MED_VER_300;
export const MED_VER_320 = IMPORTED_MED_VER_320;
export const MED_VER_OCTAMED_100 = IMPORTED_MED_VER_OCTAMED_100;
export const MED_VER_OCTAMED_200 = IMPORTED_MED_VER_OCTAMED_200;
export const MED_VER_OCTAMED_300 = IMPORTED_MED_VER_OCTAMED_300;
export const MED_VER_OCTAMED_500 = IMPORTED_MED_VER_OCTAMED_500;
export const MED_VER_OCTAMED_502 = IMPORTED_MED_VER_OCTAMED_502;
export const MED_VER_OCTAMED_SS_1 = IMPORTED_MED_VER_OCTAMED_SS_1;
export const MED_VER_OCTAMED_SS_2 = IMPORTED_MED_VER_OCTAMED_SS_2;

/** DEFAULT_TIME_FACTOR (common.h:454) and MED_TIME_FACTOR (common.h:455). */
export const DEFAULT_TIME_FACTOR = 10;
export const MED_TIME_FACTOR = 2.64;

/** MMD song flags (med.h:49-56). */
export const FLAG_FILTERON = 0x1;
export const FLAG_JUMPINGON = 0x2;
export const FLAG_JUMP8TH = 0x4;
export const FLAG_INSTRSATT = 0x8;
export const FLAG_VOLHEX = 0x10;
export const FLAG_STSLIDE = 0x20;
export const FLAG_8CHANNEL = 0x40;
export const FLAG_SLOWHQ = 0x80;

/** MMD song flags2 (med.h:58-60). */
export const FLAG2_BMASK = 0x1f;
export const FLAG2_BPM = 0x20;
export const FLAG2_MIX = 0x80;

/** InstrExt instr_flags (med.h:219-222). */
export const SSFLG_LOOP = 0x01;
export const SSFLG_EXTPSET = 0x02;
export const SSFLG_DISABLED = 0x04;
export const SSFLG_PINGPONG = 0x08;

/** MMD3_DEFAULT_NOTE (med.h:210). */
export const MMD3_DEFAULT_NOTE = 53;

/** InstrHdr type bits (med.h:161-163). */
export const S_16 = 0x10;
export const MD16 = 0x18;
export const STEREO = 0x20;

/** Number of octaves in IFFOCT samples (mmd_common.c:910). */
export const MMD_NUM_OCT: readonly number[] = [5, 3, 2, 4, 6, 7];

/** struct MMD0sample (med.h:33-39). */
export interface MedSample {
  rep: number;
  replen: number;
  midich: number;
  midipreset: number;
  svol: number;
  /** int8. */
  strans: number;
}

/** struct InstrExt (med.h:212-231), only the fields the loaders consume. */
export interface MedInstrExt {
  hold: number;
  decay: number;
  suppress_midi_off: number;
  /** int8. */
  finetune: number;
  default_pitch: number;
  instr_flags: number;
  long_repeat: number;
  long_replen: number;
}

export function zeroInstrExt(): MedInstrExt {
  return {
    hold: 0, decay: 0, suppress_midi_off: 0, finetune: 0,
    default_pitch: 0, instr_flags: 0, long_repeat: 0, long_replen: 0,
  };
}

/** struct MMD0exp (med.h:279-301), only the fields the loaders consume. */
export interface MedExpData {
  s_ext_entries: number;
  s_ext_entrsz: number;
  i_ext_entries: number;
  i_ext_entrsz: number;
  annolen: number;
  songnamelen: number;
}

export function zeroExpData(): MedExpData {
  return { s_ext_entries: 0, s_ext_entrsz: 0, i_ext_entries: 0, i_ext_entrsz: 0, annolen: 0, songnamelen: 0 };
}

/** mmd_convert_tempo (mmd_common.c:48-82). */
export function mmdConvertTempo(tempo: number, bpmOn: number, med8ch: number): number {
  const temposCompat = [195, 97, 65, 49, 39, 32, 28, 24, 22, 20];
  const tempos8ch = [179, 164, 152, 141, 131, 123, 116, 110, 104, 99];

  if (tempo > 0) {
    // 8-channel mode: left tempo gadget values 1-10; 11-240 = 10.
    if (med8ch) {
      const t = tempo > 10 ? 10 : tempo;
      return tempos8ch[t - 1]!;
    }
    // Tempos 1-10 in tempo mode are compatibility tempos that
    // approximate Soundtracker speeds.
    if (tempo <= 10 && !bpmOn) {
      return temposCompat[tempo - 1]!;
    }
  }
  return tempo;
}

/** mmd_xlat_fx (mmd_common.c:84-397). */
export function mmdXlatFx(
  event: Event, bpmOn: number, bpmlen: number, med8ch: number, hexvol: number,
): void {
  switch (event.fxt) {
    case 0x00: // arpeggio
      break;
    case 0x01: // slide up — param 0 does nothing
      if (!event.fxp) event.fxt = 0;
      break;
    case 0x02: // slide down
      if (!event.fxp) event.fxt = 0;
      break;
    case 0x03: // portamento
      break;
    case 0x04: // vibrato (twice as deep as Protracker's)
      event.fxt = FX.FX_VIBRATO2;
      break;
    case 0x05: // slide + fade
    case 0x06: // vibrato + fade
    case 0x07: // tremolo
      break;
    case 0x08: // hold and decay
      event.fxt = FX.FX_MED_HOLD;
      break;
    case 0x09: // secondary tempo
      if (event.fxp >= 0x01 && event.fxp <= 0x20) {
        event.fxt = FX.FX_SPEED;
      } else {
        event.fxt = 0;
        event.fxp = 0;
      }
      break;
    case 0x0a: // protracker-compatible
    case 0x0b: // position jump
    case 0x0c: // set volume
      if (!hexvol) {
        const p = event.fxp;
        event.fxp = ((p >> 8) & 0xff) * 10 + (p & 0xff);
      }
      break;
    case 0x0d: // volume slide
      event.fxt = FX.FX_VOLSLIDE;
      break;
    case 0x0e: // synth jump
      event.fxt = 0;
      event.fxp = 0;
      break;
    case 0x0f: // miscellaneous
      if (event.fxp === 0x00) { // jump to next block
        event.fxt = FX.FX_BREAK;
        break;
      } else if (event.fxp <= 0xf0) {
        event.fxt = FX.FX_S3M_BPM;
        event.fxp = mmdConvertTempo(event.fxp, bpmOn, med8ch);
        break;
      } else {
        switch (event.fxp) {
          case 0xf1: // play note twice
            event.fxt = FX.FX_EXTENDED;
            event.fxp = (0x9 /* EX_RETRIG */ << 4) | 3;
            break;
          case 0xf2: // delay note
            event.fxt = FX.FX_EXTENDED;
            event.fxp = (0xd /* EX_DELAY */ << 4) | 3;
            break;
          case 0xf3: // play note three times
            event.fxt = FX.FX_MED_RETRIG;
            event.fxp = 0x02;
            break;
          case 0xf8: // turn filter off
          case 0xf9: // turn filter on
          case 0xfa: // MIDI pedal on
          case 0xfb: // MIDI pedal off
          case 0xfd: // set pitch
          case 0xfe: // end of song
            event.fxt = 0;
            event.fxp = 0;
            break;
          case 0xff: // turn note off
            event.fxt = 0;
            event.fxp = 0;
            event.note = XMP_KEY_CUT;
            break;
          default:
            event.fxt = 0;
            event.fxp = 0;
        }
      }
      break;
    case 0x11: // slide pitch up (only once)
      event.fxt = FX.FX_F_PORTA_UP;
      break;
    case 0x12: // slide down (only once)
      event.fxt = FX.FX_F_PORTA_DN;
      break;
    case 0x14: // vibrato (protracker depth)
      event.fxt = FX.FX_VIBRATO;
      break;
    case 0x15: // set finetune
      event.fxt = FX.FX_FINETUNE;
      event.fxp = (event.fxp + 8) << 4;
      break;
    case 0x16: // loop
      event.fxt = FX.FX_EXTENDED;
      if (event.fxp > 0x0f) event.fxp = 0x0f;
      event.fxp |= 0x60;
      break;
    case 0x18: // stop note
      event.fxt = FX.FX_EXTENDED;
      if (event.fxp > 0x0f) event.fxp = 0x0f;
      event.fxp |= 0xc0;
      break;
    case 0x19: // set sample start offset
      event.fxt = FX.FX_OFFSET;
      break;
    case 0x1a: // slide volume up once
      event.fxt = event.fxp ? FX.FX_F_VSLIDE_UP : 0;
      break;
    case 0x1b: // slide volume down once
      event.fxt = event.fxp ? FX.FX_F_VSLIDE_DN : 0;
      break;
    case 0x1d: // jump to next block
      event.fxt = FX.FX_BREAK;
      break;
    case 0x1e: // play line x times
      event.fxt = FX.FX_PATT_DELAY;
      break;
    case 0x1f: // note delay and retrigger
      if (event.fxp !== 0 && event.note !== 0) {
        event.fxt = FX.FX_MED_RETRIG;
      } else {
        event.fxt = 0;
        event.fxp = 0;
      }
      break;
    case 0x20: // reverse sample / relative sample offset
      if (event.fxp === 0 && event.note !== 0) {
        event.fxt = FX.FX_REVERSE;
        event.fxp = 1;
      } else {
        event.fxt = 0;
        event.fxp = 0;
      }
      break;
    case 0x2e: { // set track panning
      if (event.fxp >= 0xf0 || event.fxp <= 0x10) {
        let fxp = (((event.fxp << 24) >> 24) + 16); // (signed char)fxp + 16
        fxp <<= 3;
        if (fxp === 0x100) fxp--;
        event.fxt = FX.FX_SETPAN;
        event.fxp = fxp;
      }
      break;
    }
    default:
      event.fxt = 0;
      event.fxp = 0;
      break;
  }
  void bpmlen;
  void hexvol;
}

/** mmd_set_bpm (mmd_common.c:1038-1053). Returns the effective time_factor
 *  (C sets m->time_factor) and writes mod.bpm. */
export function mmdSetBpm(
  med8ch: number, deftempo: number, bpmOn: number, bpmlen: number,
): { bpm: number; timeFactor: number } {
  const bpm = mmdConvertTempo(deftempo, bpmOn, med8ch);

  // 8-channel mode completely overrides regular timing.
  let timeFactor = MED_TIME_FACTOR;
  if (med8ch) {
    timeFactor = DEFAULT_TIME_FACTOR;
  } else if (bpmOn) {
    timeFactor = (DEFAULT_TIME_FACTOR * 4) / bpmlen;
  }
  return { bpm, timeFactor };
}

/** mmd_tracker_version (mmd_common.c:1092-1162). Returns the MED version
 *  constant plus the tracker type string (libxmp_set_type). */
export function mmdTrackerVersion(
  mmdver: number, mmdc: number, med8ch: number, expdata: MedExpData | null,
): { medver: number; type: string } {
  let soundstudio = 0;
  let medver = 0;
  const sExtEntrsz = expdata ? expdata.s_ext_entrsz : 0;
  const songnamelen = expdata ? expdata.songnamelen : 0;
  let mmdch = '0'.charCodeAt(0) + mmdver;

  if (sExtEntrsz > 18) { // s_ext_entrsz == 24
    medver = MED_VER_OCTAMED_SS_2;
    soundstudio = 2;
  } else if (mmdver >= 3) {
    medver = MED_VER_OCTAMED_SS_1;
    soundstudio = 1;
  } else if (sExtEntrsz > 10) { // s_ext_entrsz == 18
    medver = MED_VER_OCTAMED_SS_1;
    soundstudio = 1;
  } else if (sExtEntrsz > 8) { // s_ext_entrsz == 10
    medver = MED_VER_OCTAMED_502;
  } else if (sExtEntrsz > 4) { // s_ext_entrsz == 8
    medver = MED_VER_OCTAMED_500;
  } else if (mmdver >= 2) {
    medver = MED_VER_OCTAMED_500;
  } else if (songnamelen > 0) { // added in OctaMED 3.00
    medver = MED_VER_OCTAMED_300;
  } else if (mmdver >= 1) {
    medver = MED_VER_OCTAMED_300;
  } else if (sExtEntrsz > 2) { // s_ext_entrsz == 4
    if (med8ch) {
      medver = MED_VER_OCTAMED_200;
    } else {
      medver = MED_VER_320;
    }
  } else if (expdata !== null) { // s_ext_entrsz == 2
    if (med8ch) {
      medver = MED_VER_OCTAMED_100;
    } else {
      medver = MED_VER_300;
    }
  } else {
    medver = MED_VER_210;
  }

  if (mmdc) {
    mmdch = 'C'.charCodeAt(0);
  }

  const ch = String.fromCharCode(mmdch);
  let type: string;
  if (soundstudio === 2) {
    type = `MED Soundstudio 2.00 MMD${ch}`;
  } else if (soundstudio === 1) {
    type = `OctaMED Soundstudio MMD${ch}`;
  } else if (medver > MED_VER_320) {
    type = `OctaMED ${medver >> 12}.${(medver & 0xff).toString(16).padStart(2, '0')} MMD${ch}`;
  } else {
    type = `MED ${medver >> 8}.${(medver & 0xff).toString(16).padStart(2, '0')} MMD${ch}`;
  }
  return { medver, type };
}

/** Read a MMD0/MMD1-style InstrExt array (mmd1_load.c:538-563 /
 *  mmd3_load.c:483-523). ver2plus adds the OctaMED V5/V5.02/V7 fields. */
export function readInstrExtArray(
  u8: (n?: number) => number,
  u16: () => number,
  u32: () => number,
  seek: (delta: number) => void,
  count: number,
  expdata: MedExpData,
  ver2plus: boolean,
): MedInstrExt[] {
  const out: MedInstrExt[] = [];
  for (let i = 0; i < count && i < expdata.s_ext_entries; i++) {
    const e = zeroInstrExt();
    let skip = expdata.s_ext_entrsz;

    if (expdata.s_ext_entrsz >= 2) { // MED 3.00 / OctaMED V1
      e.hold = u8();
      e.decay = u8();
      skip -= 2;
    }
    if (expdata.s_ext_entrsz >= 4) { // MED 3.20 / OctaMED V2
      e.suppress_midi_off = u8();
      e.finetune = u8();
      skip -= 2;
    }
    if (ver2plus && expdata.s_ext_entrsz >= 8) { // OctaMED V5
      e.default_pitch = u8();
      e.instr_flags = u8();
      void u16();
      skip -= 4;
    }
    if (ver2plus && expdata.s_ext_entrsz >= 10) { // OctaMED V5.02
      void u16();
      skip -= 2;
    }
    if (ver2plus && expdata.s_ext_entrsz >= 18) { // OctaMED V7
      e.long_repeat = u32();
      e.long_replen = u32();
      skip -= 8;
    }

    out.push(e);
    if (skip) seek(skip);
  }
  return out;
}

/** Read MMDInstrInfo names (mmd1_load.c:567-591). */
export function readInstrInfoArray(
  raw: (n: number) => Uint8Array,
  seek: (delta: number) => void,
  count: number,
  expdata: MedExpData,
): string[] {
  const out: string[] = [];
  for (let i = 0; i < count && i < expdata.i_ext_entries; i++) {
    const skip = expdata.i_ext_entrsz - 40;
    const name = raw(40);
    if (name.length < 40) throw new ParseError('MED: iinfo truncated');
    out.push(copyAdjustName(name, 40));
    if (skip) seek(skip);
  }
  return out;
}

/** libxmp_copy_adjust-style name (printable ASCII, trim, stop at NUL). */
export function copyAdjustName(r: Uint8Array, n: number): string {
  let s = '';
  for (let i = 0; i < n && i < r.length; i++) {
    const c = r[i]!;
    if (c === 0) break;
    s += c > 127 || c < 0x20 || c === 0x7f ? '.' : String.fromCharCode(c);
  }
  return s.replace(/ +$/, '');
}

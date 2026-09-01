// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Bitti09 — modplayjs contributors
// Ported from: libxmp src/loaders/it_load.c.
// IT loader. Verbatim port of reference/libxmp/src/loaders/it_load.c
// (it_test :46-55, xlat_fx :97-181, xlat_volfx :186-232, fix_name
// :234-249, load_it_midi_config :261-285, read_envelope :287-350,
// identify_tracker :346-437, load_old_it_instrument :448-571,
// load_new_it_instrument :573-770, force_sample_length :772-786,
// unpack_it_sample :788-823, load_it_sample :825-1030,
// load_it_pattern :1032-1170, it_load :1172-1551) plus helpers:
// libxmp_schism_tracker_string (common.c:546-580) with
// schism_tracker_date (common.c:528-537), libxmp_apply_mpt_preamp
// (common.c:596-613), libxmp_copy_adjust (loaders/common.c:237-256)
// and libxmp_c2spd_to_note (period.c:251-264).
//
// Constants from reference/libxmp/src/loaders/it.h.

import type {
  ChannelState,
  Core,
  Envelope,
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
  C4_NTSC_RATE,
  ChannelFlags,
  DecodeFlag,
  Dct,
  EMPTY_EVENT,
  EnvelopeFlags,
  FLOW_MODE_IT_100,
  FLOW_MODE_IT_104,
  FLOW_MODE_IT_200,
  FLOW_MODE_IT_210,
  FLOW_MODE_MPT_116,
  FX,
  Nna,
  ParseError,
  PeriodType,
  Quirk,
  QUIRKS_IT,
  ReadEventType,
  SampleFlags,
  XMP_KEY_CUT,
  XMP_KEY_FADE,
  XMP_KEY_OFF,
} from '@modplayjs/core';
import { SET_NOTE, TEST_NOTE, NoteFlag, readEventIt } from '@modplayjs/effects-shared';
import { itsexDecompress8, itsexDecompress16, TEMP_BUFFER_LEN } from './itsex.js';

// ---------------------------------------------------------------------------
// Constants (it.h + it_load.c)
// ---------------------------------------------------------------------------

/** MAGIC4('I','M','P','M') — module signature (it_load.c:31). */
const MAGIC_IMPM = 0x494d504d;
/** MAGIC4('I','M','P','I') — instrument signature (it.h). */
const MAGIC_IMPI = 0x494d5049;
/** MAGIC4('I','M','P','S') — sample signature (it.h). */
const MAGIC_IMPS = 0x494d5053;

/** L_CHANNELS (it_load.c:41). */
const L_CHANNELS = 64;
/** XMP_MAX_KEYS (xmp.h:129). */
const XMP_MAX_KEYS = 121;
/** XMP_MAX_MOD_LENGTH (xmp.h:131). */
const XMP_MAX_MOD_LENGTH = 256;
/** MAX_SAMPLE_SIZE (common.h:460). */
const MAX_SAMPLE_SIZE = 0x10000000;

/** FX_NONE / FX_XTND (it_load.c:53-54). */
const FX_NONE = 0xff;
const FX_XTND = 0xfe;

// Header flags (it.h:19-27).
const IT_STEREO = 0x01;
const IT_USE_INST = 0x04;
const IT_LINEAR_FREQ = 0x08;
const IT_OLD_FX = 0x10;
const IT_LINK_GXX = 0x20;
const IT_MIDI_CONFIG = 0x80;

// special field flags (it.h:29-31).
const IT_HAS_MSG = 0x01;
const IT_EDIT_HISTORY = 0x02;
const IT_SPEC_MIDICFG = 0x08;

// Instrument envelope flags (it.h:41-45).
const IT_ENV_ON = 0x01;
const IT_ENV_LOOP = 0x02;
const IT_ENV_SLOOP = 0x04;
const IT_ENV_CARRY = 0x08;
const IT_ENV_FILTER = 0x80;

// Sample flags (it.h:53-60).
const IT_SMP_SAMPLE = 0x01;
const IT_SMP_16BIT = 0x02;
const IT_SMP_STEREO = 0x04;
const IT_SMP_COMP = 0x08;
const IT_SMP_LOOP = 0x10;
const IT_SMP_SLOOP = 0x20;
const IT_SMP_BLOOP = 0x40;
const IT_SMP_BSLOOP = 0x80;

// Sample convert flags (it.h:63-66).
const IT_CVT_SIGNED = 0x01;
const IT_CVT_DIFF = 0x04;
const IT_CVT_ADPCM = 0xff;
/** DecodeFlag.UNSIGNED — SAMPLE_FLAG_UNS numeric parity (samples.ts). */
const SAMPLE_FLAG_UNS = 1 << 10;
const SAMPLE_FLAG_ADPCM = 1 << 13;

/** Chibi "CHBI" magic as readmem32l of bytes 43,42,41,40 order — rsvd is
 * read with hio_read32l, memcmp(&rsvd,"CHBI",4) compares the raw little
 * endian buffer bytes 'C','H','B','I' (it_load.c:398). */
const MAGIC_CHBI = 0x49424843; /* "CHBI" little-endian u32 */
/** "OMPT" magic for the rsvd compatibility-tag check (it_load.c:431). */
const MAGIC_OMPT = 0x54504d4f; /* "OMPT" little-endian u32 */

/** fx[32] effect translation table (it_load.c:63-96). */
const fx: number[] = [
  /*   */ FX_NONE,
  /* A */ FX.FX_S3M_SPEED,
  /* B */ FX.FX_JUMP,
  /* C */ FX.FX_IT_BREAK,
  /* D */ FX.FX_VOLSLIDE,
  /* E */ FX.FX_PORTA_DN,
  /* F */ FX.FX_PORTA_UP,
  /* G */ FX.FX_TONEPORTA,
  /* H */ FX.FX_VIBRATO,
  /* I */ FX.FX_TREMOR,
  /* J */ FX.FX_S3M_ARPEGGIO,
  /* K */ FX.FX_VIBRA_VSLIDE,
  /* L */ FX.FX_TONE_VSLIDE,
  /* M */ FX.FX_TRK_VOL,
  /* N */ FX.FX_TRK_VSLIDE,
  /* O */ FX.FX_OFFSET,
  /* P */ FX.FX_IT_PANSLIDE,
  /* Q */ FX.FX_MULTI_RETRIG,
  /* R */ FX.FX_TREMOLO,
  /* S */ FX_XTND,
  /* T */ FX.FX_IT_BPM,
  /* U */ FX.FX_FINE_VIBRATO,
  /* V */ FX.FX_GLOBALVOL,
  /* W */ FX.FX_GVOL_SLIDE,
  /* X */ FX.FX_SETPAN,
  /* Y */ FX.FX_PANBRELLO,
  /* Z */ FX.FX_MACRO,
  /* ? */ FX_NONE,
  /* / */ FX.FX_MACROSMOOTH,
  /* ? */ FX_NONE,
  /* ? */ FX_NONE,
  /* ? */ FX_NONE,
];

/** bytes_in_packed_event[16] (it_load.c:1367-1369) — scan-pass sizes. */
const bytesInPackedEvent: number[] = [0, 1, 1, 2, 1, 2, 2, 3, 2, 3, 3, 4, 3, 4, 4, 5];

// ---------------------------------------------------------------------------
// Local helpers (dataio.c / loaders/common.c / period.c / common.c ports)
// ---------------------------------------------------------------------------

/** readmem16l (dataio.c) — little-endian 16-bit from a byte buffer. */
function readmem16l(m: Uint8Array, off: number): number {
  return (m[off]! | (m[off + 1]! << 8)) >>> 0;
}

/** readmem32l (dataio.c) — little-endian 32-bit from a byte buffer. */
function readmem32l(m: Uint8Array, off: number): number {
  return (
    (m[off]! | (m[off + 1]! << 8) | (m[off + 2]! << 16) | (m[off + 3]! << 24)) >>> 0
  );
}

/** readmem32b (dataio.c) — big-endian 32-bit from a byte buffer. */
function readmem32b(m: Uint8Array, off: number): number {
  return (
    ((m[off]! << 24) | (m[off + 1]! << 16) | (m[off + 2]! << 8) | m[off + 3]!) >>> 0
  );
}

/** libxmp_copy_adjust (loaders/common.c:237-256): first NUL terminates
 * (strncpy), non-printable → '.', trailing spaces stripped. */
function copyAdjust(r: Uint8Array, n: number): string {
  let s = '';
  for (let i = 0; i < n && i < r.length; i++) {
    const c = r[i]!;
    if (c === 0) break; // strncpy stops at NUL
    s += c > 127 || c < 0x20 || c === 0x7f ? '.' : String.fromCharCode(c);
  }
  return s.replace(/ +$/, '');
}

/** fix_name (it_load.c:234-249): embedded NULs in the first l-1 bytes →
 * space, then trailing spaces → NUL (via truncation here). Mutates the
 * caller's buffer like C. */
function fixName(s: Uint8Array, l: number): void {
  let i: number;
  for (l--, i = 0; i < l; i++) {
    if (s[i] === 0) s[i] = 0x20;
  }
  for (i--; i >= 0 && s[i] === 0x20; i--) {
    s[i] = 0;
  }
}

/** schism_tracker_date (common.c:528-537): days since 1970-01-01 for the
 * given civil date. */
function schismTrackerDate(year: number, month: number, day: number): number {
  let mm = (month + 9) % 12;
  let yy = year - Math.floor(mm / 10);

  yy = yy * 365 + Math.floor(yy / 4) - Math.floor(yy / 100) + Math.floor(yy / 400);
  mm = Math.floor((mm * 306 + 5) / 10);

  return yy + mm + (day - 1);
}

/** libxmp_schism_tracker_string (common.c:546-580). */
function schismTrackerString(sVer: number, lVer: number): string {
  if (sVer >= 0x50) {
    let t = schismTrackerDate(2009, 10, 31);

    if (sVer === 0xfff) {
      t += lVer;
    } else {
      t += sVer - 0x50;
    }

    // Date algorithm reimplemented from OpenMPT (common.c:556-570).
    let year = Math.trunc((t * 10000 + 14780) / 3652425);
    let dayofyear =
      t - (365 * year + Math.floor(year / 4) - Math.floor(year / 100) + Math.floor(year / 400));
    if (dayofyear < 0) {
      year--;
      dayofyear =
        t - (365 * year + Math.floor(year / 4) - Math.floor(year / 100) + Math.floor(year / 400));
    }
    let month = Math.trunc((100 * dayofyear + 52) / 3060);
    const day = dayofyear - Math.floor((month * 306 + 5) / 10) + 1;

    year += Math.floor((month + 2) / 12);
    month = ((month + 2) % 12) + 1;

    const pad = (v: number, w: number) => String(v).padStart(w, '0');
    return `Schism Tracker ${pad(year, 4)}-${pad(month, 2)}-${pad(day, 2)}`;
  }
  return `Schism Tracker 0.${sVer.toString(16)}`;
}

/** libxmp_c2spd_to_note (period.c:251-264). */
function c2spdToNote(c2spd: number): { n: number; f: number } {
  if (c2spd <= 0) {
    return { n: 0, f: 0 };
  }
  const c = Math.trunc((1536.0 * Math.log(c2spd / 8363)) / Math.LN2);
  return { n: Math.trunc(c / 128), f: c % 128 };
}

/** fail(): throw a typed parse error with context. */
function fail(msg: string): never {
  throw new ParseError(`IT: ${msg}`);
}

/** libxmp_apply_mpt_preamp (common.c:596-613): scale mvol by the
 * channel-count preamp table. Set mod.chn and mvol first! */
function applyMptPreamp(mod: ModuleData): void {
  // OpenMPT uses a slightly different table (common.c:598-604).
  const preampTable: number[] = [
    0x60, 0x60, 0x60, 0x70, // 0-7
    0x80, 0x88, 0x90, 0x98, // 8-15
    0xa0, 0xa4, 0xa8, 0xb0, // 16-23
    0xb4, 0xb8, 0xbc, 0xc0, // 24-31
  ];

  let chn = mod.chn;
  if (chn < 1) chn = 1; // CLAMP(chn, 1, 31)
  if (chn > 31) chn = 31;

  mod.mvol = Math.trunc(((mod.mvol ?? 0) * 96) / preampTable[chn >> 1]!);
}

// ---------------------------------------------------------------------------
// Shared loader state
// ---------------------------------------------------------------------------

interface ItFileHeader {
  name: Uint8Array; // 26 bytes
  hiliteMin: number; // buf[30]
  hiliteMaj: number; // buf[31]
  ordnum: number; // readmem16l(buf+32)
  insnum: number; // readmem16l(buf+34)
  smpnum: number; // readmem16l(buf+36)
  patnum: number; // readmem16l(buf+38)
  cwt: number; // readmem16l(buf+40)
  cmwt: number; // readmem16l(buf+42)
  flags: number; // readmem16l(buf+44)
  special: number; // readmem16l(buf+46)
  gv: number; // buf[48]
  mv: number; // buf[49]
  is: number; // buf[50]
  it: number; // buf[51]
  sep: number; // buf[52]
  pwd: number; // buf[53]
  msglen: number; // readmem16l(buf+54)
  msgofs: number; // readmem32l(buf+56)
  rsvd: number; // readmem32l(buf+60)
  chpan: Uint8Array; // 64 bytes at 64
  chvol: Uint8Array; // 64 bytes at 128
}

/** Zeroed envelope (per-node x[]/y[] representation). */
function zeroEnvelope(): Envelope {
  return { flags: 0, npt: 0, scl: 0, sus: 0, sue: 0, lps: 0, lpe: 0, x: [], y: [] };
}

/** calloc'd subinstrument (struct xmp_subinstrument zero-fill; NO_DEFAULT_PAN
 * is NOT calloc — pan stays 0 until the loader sets it). */
function zeroSub(): SubInstrument {
  return {
    vol: 0,
    gvl: 0,
    pan: 0,
    xpo: 0,
    fin: 0,
    vwf: 0,
    vde: 0,
    vra: 0,
    vsw: 0,
    sid: 0,
    rvv: 0,
    nna: 0,
    dct: 0,
    dca: 0,
    ifc: 0,
    ifr: 0,
  };
}

/** libxmp_init_instrument shape: calloc'd instrument with 121-entry zero
 * key maps (common.c libxmp_init_instrument). */
function zeroInstrument(): Instrument {
  return {
    name: '',
    volume: 0,
    nsm: 0,
    rls: 0,
    map: new Array<number>(XMP_MAX_KEYS).fill(0),
    mapXpo: new Array<number>(XMP_MAX_KEYS).fill(0),
    sub: [],
    aei: zeroEnvelope(),
    fei: zeroEnvelope(),
    pei: zeroEnvelope(),
  };
}

// ---------------------------------------------------------------------------
// it_test (it_load.c:46-55)
// ---------------------------------------------------------------------------

export function itTest(bytes: Uint8Array): boolean {
  // hio_read32b(f) != MAGIC_IMPM → -1
  if (bytes.length < 4) return false;
  if (readmem32b(bytes, 0) !== MAGIC_IMPM) return false;
  // libxmp_read_title(f, t, 26) — no failure path.
  return true;
}

// ---------------------------------------------------------------------------
// load_it_midi_config (it_load.c:261-285)
// ---------------------------------------------------------------------------

function loadItMidiConfig(
  bytes: Uint8Array,
  pos: number,
): { midi: NonNullable<ModuleData['midi']>; end: number } | null {
  let p = pos;

  // Skip global MIDI macros (it_load.c:267-269): 9 slots of 32 bytes.
  p += 9 * 32;
  if (p > bytes.length) return null;

  // SFx macros (it_load.c:271-276): 16 × 32 bytes, data[31] = '\0'.
  const param: Uint8Array[] = [];
  for (let i = 0; i < 16; i++) {
    if (p + 32 > bytes.length) return null;
    const d = bytes.slice(p, p + 32);
    d[31] = 0;
    param.push(d);
    p += 32;
  }
  // Zxx macros (it_load.c:277-282): 128 × 32 bytes.
  const fixed: Uint8Array[] = [];
  for (let i = 0; i < 128; i++) {
    if (p + 32 > bytes.length) return null;
    const d = bytes.slice(p, p + 32);
    d[31] = 0;
    fixed.push(d);
    p += 32;
  }
  return { midi: { param, fixed }, end: p };
}

// ---------------------------------------------------------------------------
// read_envelope (it_load.c:287-350)
// ---------------------------------------------------------------------------

function readEnvelope(
  bytes: Uint8Array,
  pos: number,
): { env: Envelope; envRawFlg: number; envRawNum: number; end: number } | null {
  if (pos + 82 > bytes.length) return null;
  const buf = bytes.subarray(pos, pos + 82);

  const flg = buf[0]!;
  const num = Math.min(buf[1]!, 25); /* Clamp to IT max */
  const lpb = buf[2]!;
  const lpe = buf[3]!;
  const slb = buf[4]!;
  const sle = buf[5]!;

  const ei: Envelope = zeroEnvelope();

  if (flg & IT_ENV_ON) ei.flags |= EnvelopeFlags.ON;
  if (flg & IT_ENV_LOOP) ei.flags |= EnvelopeFlags.LOOP;
  if (flg & IT_ENV_SLOOP) ei.flags |= EnvelopeFlags.SUS | EnvelopeFlags.SLOOP;
  if (flg & IT_ENV_CARRY) ei.flags |= EnvelopeFlags.CARRY;

  ei.npt = num;
  ei.sus = slb;
  ei.sue = sle;
  ei.lps = lpb;
  ei.lpe = lpe;

  if (num > 0 && num <= 25 /* XMP_MAX_ENV_POINTS */) {
    for (let i = 0; i < num; i++) {
      ei.x[i] = readmem16l(buf, 7 + i * 3);
      ei.y[i] = buf[6 + i * 3]!;
    }
  } else {
    ei.flags &= ~EnvelopeFlags.ON;
  }

  // Raw pre-mask flag byte and clamped num (it_load.c `env` struct,
  // reused by the caller for the FILTER branch).
  return { env: ei, envRawFlg: flg, envRawNum: num, end: pos + 82 };
}

// ---------------------------------------------------------------------------
// identify_tracker (it_load.c:346-437)
// ---------------------------------------------------------------------------

function identifyTracker(
  ifh: ItFileHeader,
  patBeforeSmp: boolean,
  sampleMode: boolean,
): { tracker: string; flowMode: number; cmwt: number; isMpt116: boolean } {
  let trackerName: string;
  let flowMode: number = FLOW_MODE_IT_210;
  let cmwt = ifh.cmwt;
  let isMpt116 = false;

  switch (ifh.cwt >> 8) {
    case 0x00:
      trackerName = 'unmo3';
      break;
    case 0x01:
    case 0x02: {
      // Test from Schism Tracker sources (it_load.c:363-377).
      if (
        cmwt === 0x0200 &&
        ifh.cwt === 0x0214 &&
        ifh.flags === 9 &&
        ifh.special === 0 &&
        ifh.hiliteMaj === 0 &&
        ifh.hiliteMin === 0 &&
        ifh.insnum === 0 &&
        ifh.patnum + 1 === ifh.ordnum &&
        ifh.gv === 128 &&
        ifh.mv === 100 &&
        ifh.is === 1 &&
        ifh.sep === 128 &&
        ifh.pwd === 0 &&
        ifh.msglen === 0 &&
        ifh.msgofs === 0 &&
        ifh.rsvd === 0
      ) {
        trackerName = 'OpenSPC conversion';
      } else if (cmwt === 0x0200 && ifh.cwt === 0x0217) {
        trackerName = 'ModPlug Tracker 1.16';
        // ModPlug Tracker files aren't really IMPM 2.00.
        cmwt = sampleMode ? 0x100 : 0x214;
        flowMode = FLOW_MODE_MPT_116;
        isMpt116 = true;
      } else if (cmwt === 0x0200 && ifh.cwt === 0x0202 && patBeforeSmp) {
        // ModPlug Tracker ITs from pre-alpha 4 (it_load.c:387-394).
        trackerName = 'ModPlug Tracker 1.0 pre-alpha';
        cmwt = sampleMode ? 0x100 : 0x200;
        flowMode = FLOW_MODE_MPT_116;
        isMpt116 = true;
      } else if (ifh.cwt === 0x0216) {
        trackerName = 'Impulse Tracker 2.14v3';
      } else if (ifh.cwt === 0x0217) {
        trackerName = 'Impulse Tracker 2.14v5';
      } else if (ifh.cwt === 0x0214 && ifh.rsvd === MAGIC_CHBI) {
        trackerName = 'Chibi Tracker';
      } else {
        trackerName = `Impulse Tracker ${(ifh.cwt & 0x0f00) >> 8}.${(ifh.cwt & 0xff).toString(16).padStart(2, '0')}`;

        if (ifh.cwt < 0x104) {
          flowMode = FLOW_MODE_IT_100;
        } else if (ifh.cwt < 0x200) {
          flowMode = FLOW_MODE_IT_104;
        } else if (ifh.cwt < 0x210) {
          flowMode = FLOW_MODE_IT_200;
        }
      }
      break;
    }
    case 0x08:
    case 0x7f:
      if (ifh.cwt === 0x0888) {
        trackerName = 'OpenMPT 1.17';
        flowMode = FLOW_MODE_MPT_116;
        isMpt116 = true;
      } else if (ifh.cwt === 0x7fff) {
        trackerName = 'munch.py';
      } else {
        trackerName = `unknown (${ifh.cwt.toString(16).padStart(4, '0')})`;
      }
      break;
    default:
      switch (ifh.cwt >> 12) {
        case 0x1:
          trackerName = schismTrackerString(ifh.cwt & 0x0fff, ifh.rsvd);
          break;
        case 0x5:
          trackerName = `OpenMPT ${(ifh.cwt & 0x0f00) >> 8}.${(ifh.cwt & 0xff).toString(16).padStart(2, '0')}`;
          if (ifh.rsvd !== MAGIC_OMPT) trackerName += ' (compat.)';
          break;
        case 0x06:
          trackerName = `BeRoTracker ${(ifh.cwt & 0x0f00) >> 8}.${(ifh.cwt & 0xff).toString(16).padStart(2, '0')}`;
          break;
        default:
          trackerName = `unknown (${ifh.cwt.toString(16).padStart(4, '0')})`;
      }
  }

  // libxmp_set_type(m, "%s IT %d.%02x", tracker_name, cmwt>>8, cmwt&0xff)
  return {
    tracker: `${trackerName} IT ${(cmwt >> 8).toString()}.${(cmwt & 0xff).toString(16).padStart(2, '0')}`,
    flowMode,
    cmwt,
    isMpt116,
  };
}

// ---------------------------------------------------------------------------
// load_old_it_instrument (it_load.c:448-571)
// ---------------------------------------------------------------------------

function loadOldItInstrument(bytes: Uint8Array, pos: number): { ins: Instrument; end: number } | null {
  let p = pos;
  if (p + 64 > bytes.length) return null;
  const buf = bytes.slice(p, p + 64); // fixName mutates: copy
  p += 64;

  if (readmem32b(buf, 0) !== MAGIC_IMPI) {
    return null; // bad instrument magic (it_load.c:459-462)
  }
  const flags = buf[17]!;
  const vls = buf[18]!;
  const vle = buf[19]!;
  const sls = buf[20]!;
  const sle = buf[21]!;
  const fadeout = readmem16l(buf, 24);
  const nna = buf[26]!;
  const dnc = buf[27]!;
  const nameBuf = buf.slice(32, 58);
  fixName(nameBuf, 26);
  const name = copyAdjust(nameBuf, 25); // libxmp_copy_adjust(xxi->name, 25)

  if (p + 240 > bytes.length) return null; // keys
  const keys = bytes.subarray(p, p + 240);
  p += 240;
  if (p + 200 > bytes.length) return null; // epoint (discarded)
  p += 200;
  if (p + 50 > bytes.length) return null; // enode
  const enode = bytes.subarray(p, p + 50);
  p += 50;

  const xxi = zeroInstrument();
  xxi.name = name;

  xxi.rls = fadeout << 7;

  // Old-format envelope flags (it_load.c:492-511): CARRY also implies SUS,
  // unlike the new format.
  if (flags & IT_ENV_ON) xxi.aei.flags |= EnvelopeFlags.ON;
  if (flags & IT_ENV_LOOP) xxi.aei.flags |= EnvelopeFlags.LOOP;
  if (flags & IT_ENV_SLOOP) xxi.aei.flags |= EnvelopeFlags.SUS | EnvelopeFlags.SLOOP;
  if (flags & IT_ENV_CARRY) xxi.aei.flags |= EnvelopeFlags.SUS | EnvelopeFlags.CARRY;
  xxi.aei.lps = vls;
  xxi.aei.lpe = vle;
  xxi.aei.sus = sls;
  xxi.aei.sue = sle;

  let k = 0;
  for (; k < 25 && enode[k * 2] !== 0xff; k++);

  // Sanity check (it_load.c:519-522).
  if (k >= 25 || enode[k * 2] !== 0xff) {
    return null;
  }

  xxi.aei.npt = k;
  for (k--; k >= 0; k--) {
    xxi.aei.x[k] = enode[k * 2]!;
    xxi.aei.y[k] = enode[k * 2 + 1]!;
  }

  // See how many different instruments we have (it_load.c:525-543).
  const instMap: number[] = new Array<number>(255).fill(0xff);
  const instRmap: number[] = new Array<number>(XMP_MAX_KEYS).fill(0);
  let n = 0;
  for (let j = 0; j < XMP_MAX_KEYS; j++) {
    const c = j < 120 ? keys[j * 2 + 1]! - 1 : -1;
    if (c < 0) {
      xxi.map[j] = 0; // NOTE: 0 (not 0xff) in the old format
      xxi.mapXpo[j] = 0;
      continue;
    }
    if (instMap[c] === 0xff) {
      instMap[c] = n;
      instRmap[n] = c;
      n++;
    }
    xxi.map[j] = instMap[c]!;
    xxi.mapXpo[j] = keys[j * 2]! - j;
  }

  xxi.nsm = n;
  xxi.volume = 0x40;

  if (n) {
    for (let j = 0; j < n; j++) {
      const sub = zeroSub();
      sub.sid = instRmap[j]!;
      sub.nna = nna as Nna;
      sub.dct = (dnc ? Dct.NOTE : Dct.OFF) as Dct;
      sub.dca = Nna.CUT;
      sub.pan = -1; // XMP_INST_NO_DEFAULT_PAN
      xxi.sub.push(sub);
    }
  }

  return { ins: xxi, end: p };
}

// ---------------------------------------------------------------------------
// load_new_it_instrument (it_load.c:573-770)
// ---------------------------------------------------------------------------

function loadNewItInstrument(bytes: Uint8Array, pos: number): { ins: Instrument; end: number } | null {
  let p = pos;
  if (p + 64 > bytes.length) return null;
  const buf = bytes.slice(p, p + 64);
  p += 64;

  if (readmem32b(buf, 0) !== MAGIC_IMPI) {
    return null; // bad instrument magic
  }
  const nna = buf[17]!;
  const dct = buf[18]!;
  let dca = buf[19]!;

  // Sanity check (it_load.c:599-603): Northern Sky (cj-north.it) has an
  // instrument with DCA 3.
  if (dca > 3) {
    dca = 0;
  }

  const fadeout = readmem16l(buf, 20);
  const gbv = buf[24]!;
  const dfp = buf[25]!;
  const rv = buf[26]!;
  const rp = buf[27]!;
  const nameBuf = buf.slice(32, 58);
  fixName(nameBuf, 26);
  const name = copyAdjust(nameBuf, 25); // libxmp_copy_adjust(xxi->name, 25)
  const ifc = buf[58]!;
  const ifr = buf[59]!;

  if (p + 240 > bytes.length) return null; // key map read error
  const keys = bytes.subarray(p, p + 240);
  p += 240;

  const xxi = zeroInstrument();
  xxi.name = name;
  xxi.rls = fadeout << 6;

  // Envelopes (it_load.c:626-635): `env` is reused for all three reads;
  // its final value (the filter env) is what the FILTER check below sees.
  const aeiRes = readEnvelope(bytes, p);
  if (!aeiRes) return null;
  xxi.aei = aeiRes.env;
  p = aeiRes.end;
  const peiRes = readEnvelope(bytes, p);
  if (!peiRes) return null;
  xxi.pei = peiRes.env;
  p = peiRes.end;
  const feiRes = readEnvelope(bytes, p);
  if (!feiRes) return null;
  xxi.fei = feiRes.env;
  p = feiRes.end;

  // Raw final-env flg/num (it_load.c:626 env, checked at :666/:671).
  const envFlg = feiRes.envRawFlg;
  const envNum = feiRes.envRawNum;

  if (xxi.pei.flags & EnvelopeFlags.ON) {
    for (let j = 0; j < xxi.pei.npt; j++) xxi.pei.y[j]! += 32;
  }

  if (xxi.aei.flags & EnvelopeFlags.ON && xxi.aei.npt === 0) {
    xxi.aei.npt = 1;
  }
  if (xxi.pei.flags & EnvelopeFlags.ON && xxi.pei.npt === 0) {
    xxi.pei.npt = 1;
  }
  if (xxi.fei.flags & EnvelopeFlags.ON && xxi.fei.npt === 0) {
    xxi.fei.npt = 1;
  }

  if (envFlg & IT_ENV_FILTER) {
    xxi.fei.flags |= EnvelopeFlags.FLT;
    for (let j = 0; j < envNum; j++) {
      xxi.fei.y[j]! += 32;
      xxi.fei.y[j]! *= 4;
    }
  } else {
    // Pitch envelope is *50 to get fine interpolation (it_load.c:689-692).
    for (let j = 0; j < envNum; j++) xxi.fei.y[j]! *= 50;
  }

  // See how many different instruments we have (it_load.c:697-714).
  const instMap: number[] = new Array<number>(255).fill(0xff);
  const instRmap: number[] = new Array<number>(XMP_MAX_KEYS).fill(0);
  let n = 0;
  for (let j = 0; j < 120; j++) {
    const c = keys[j * 2 + 1]! - 1;
    if (c < 0) {
      xxi.map[j] = 0xff; // No sample (new format uses 0xff)
      xxi.mapXpo[j] = 0;
      continue;
    }
    if (instMap[c] === 0xff) {
      instMap[c] = n;
      instRmap[n] = c;
      n++;
    }
    xxi.map[j] = instMap[c]!;
    xxi.mapXpo[j] = keys[j * 2]! - j;
  }

  xxi.nsm = n;
  xxi.volume = Math.min(gbv, 128) >> 1;

  if (n) {
    // dca2nna (it_load.c:581): { 0, 2, 3, 3 }.
    const dca2nna = [0, 2, 3, 3];
    for (let j = 0; j < n; j++) {
      const sub = zeroSub();
      sub.sid = instRmap[j]!;
      sub.nna = nna as Nna;
      sub.dct = dct as Dct;
      sub.dca = (dca2nna[dca] ?? 0) as Nna;
      sub.pan = dfp & 0x80 ? -1 /* NO_DEFAULT_PAN */ : dfp * 4;
      sub.ifc = ifc;
      sub.ifr = ifr;
      sub.rvv = ((rp << 8) | rv) | 0; // ((int)i2h.rp << 8) | i2h.rv
      xxi.sub.push(sub);
    }
  }

  return { ins: xxi, end: p };
}

// ---------------------------------------------------------------------------
// force_sample_length (it_load.c:772-786)
// ---------------------------------------------------------------------------

function forceSampleLength(raw: RawSample, len: number): void {
  raw.length = len;

  if (raw.loopEnd > raw.length) raw.loopEnd = raw.length;

  if (raw.loopStart >= raw.length) {
    raw.flags &= ~SampleFlags.LOOP;
  }

  if (raw.sustainEnd > raw.length) raw.sustainEnd = raw.length;
  if (raw.sustainStart >= raw.length) {
    raw.flags &= ~(SampleFlags.SUSTAIN | SampleFlags.SUSTAIN_BIDIR);
  }
}

// ---------------------------------------------------------------------------
// unpack_it_sample (it_load.c:788-823). C ignores the decompressor's
// internal state (no failure signal); on truncated blocks the dst tail
// stays zero-filled, matching calloc.
// ---------------------------------------------------------------------------

function unpackItSample(
  bytes: Uint8Array,
  srcPos: { pos: number },
  raw: RawSample,
  flags: number,
  convertDiff: number,
  tmp: Uint8Array,
): Uint8Array {
  let size = raw.length; // samples per channel
  let channels = 1;

  if (flags & IT_SMP_16BIT) size <<= 1; // bytes per channel
  if (flags & IT_SMP_STEREO) {
    size <<= 1;
    channels = 2;
  }

  const decbuf = new Uint8Array(size);

  if (flags & IT_SMP_16BIT) {
    // C: pos walks int16 elements → per-channel stride = len × 2 bytes.
    for (let i = 0; i < channels; i++) {
      itsexDecompress16(
        bytes,
        srcPos,
        decbuf.subarray(i * raw.length * 2),
        raw.length,
        tmp,
        TEMP_BUFFER_LEN,
        convertDiff !== 0,
      );
    }
  } else {
    for (let i = 0; i < channels; i++) {
      itsexDecompress8(
        bytes,
        srcPos,
        decbuf.subarray(i * raw.length),
        raw.length,
        tmp,
        TEMP_BUFFER_LEN,
        convertDiff !== 0,
      );
    }
  }
  return decbuf;
}

// ---------------------------------------------------------------------------
// load_it_sample (it_load.c:825-1030). Returns 0 = ok/skip, throws via
// fail() where C returns -1 (load error).
// ---------------------------------------------------------------------------

function loadItSample(
  bytes: Uint8Array,
  pos: number,
  dest: RawSample,
  i: number,
  start: number,
  sampleMode: boolean,
  xxi: Instrument,
  instruments: Instrument[],
  tmp: Uint8Array,
): number {
  let p = pos;

  if (sampleMode) {
    // Create an instrument for each sample (it_load.c:836-840): sub[0]
    // is calloc'd BEFORE the header read.
    xxi.sub = [zeroSub()];
  }

  if (p + 80 > bytes.length) {
    return -1; // hio_read(buf, 1, 80, f) != 80
  }
  const buf = bytes.slice(p, p + 80); // fixName mutates: copy
  p += 80;

  // Changed to continue to allow use-brdg.it and use-funk.it to load
  // correctly (it_load.c:849-851).
  if (readmem32b(buf, 0) !== MAGIC_IMPS) {
    return 0;
  }

  const gvl = buf[17]!;
  const flags = buf[18]!;
  const vol = buf[19]!;
  const nameBuf = buf.slice(20, 46);
  fixName(nameBuf, 26);
  const name = copyAdjust(nameBuf, 25); // 25-char name (xxs->name / xxi)
  const convert = buf[46]!;
  const dfp = buf[47]!;
  const length = readmem32l(buf, 48);
  const loopbeg = readmem32l(buf, 52);
  const loopend = readmem32l(buf, 56);
  const c5spd = readmem32l(buf, 60);
  const sloopbeg = readmem32l(buf, 64);
  const sloopend = readmem32l(buf, 68);
  const samplePtr = readmem32l(buf, 72);
  const vis = buf[76]!;
  const vid = buf[77]!;
  const vir = buf[78]!;
  const vit = buf[79]!;
  const raw = dest; // C: xxs = &mod->xxs[i] (it_load.c:820) — fills the
  // module sample slot directly.
  raw.length = length;
  raw.loopStart = loopbeg;
  raw.loopEnd = loopend;
  raw.sustainStart = 0;
  raw.sustainEnd = 0;
  raw.finetune = 0;
  raw.volume = 0;
  raw.flags = 0;
  // xxs->c5spd is set by libxmp_init_instrument to m->c4rate; the IT
  // loader overwrites pitch via c2spd → sub->xpo/sub->fin below.
  raw.c5spd = C4_NTSC_RATE;
  // xxs->flg (it_load.c:873-890).
  if (flags & IT_SMP_16BIT) {
    raw.flags = SampleFlags.BITS16;
  }
  if (flags & IT_SMP_STEREO) {
    raw.flags |= SampleFlags.STEREO;
  }
  raw.flags |= flags & IT_SMP_LOOP ? SampleFlags.LOOP : 0;
  raw.flags |= flags & IT_SMP_BLOOP ? SampleFlags.BIDIR : 0;
  raw.flags |= flags & IT_SMP_SLOOP ? SampleFlags.SUSTAIN : 0;
  raw.flags |= flags & IT_SMP_BSLOOP ? SampleFlags.SUSTAIN_BIDIR : 0;

  if (flags & IT_SMP_SLOOP) {
    raw.sustainStart = sloopbeg;
    raw.sustainEnd = sloopend;
  }

  if (sampleMode) {
    // Create an instrument for each sample (it_load.c:895-902).
    xxi.volume = 64;
    xxi.sub[0]!.vol = vol;
    xxi.sub[0]!.pan = -1; // XMP_INST_NO_DEFAULT_PAN
    xxi.sub[0]!.sid = i;
    xxi.nsm = length !== 0 ? 1 : 0; // !!(xxs->len)
    // libxmp_instrument_name(mod, i, ish.name, 25): name on the instrument.
    xxi.name = name;
  } else {
    // libxmp_copy_adjust(xxs->name, ish.name, 25): name lives on the sample.
    raw.name = name;
  }
  raw.name = name;
  raw.volume = vol;

  // Convert C5SPD to relnote/finetune (it_load.c:919-949): a sample can be
  // associated with two or more instruments, so scan ALL instruments' subs
  // for sid == i.
  for (const xj of instruments) {
    for (const sub of xj.sub) {
      if (sub.sid === i) {
        sub.vol = vol;
        sub.gvl = Math.min(gvl, 64);
        sub.vra = vis; // sample to sub-instrument vibrato rate
        sub.vde = vid << 1; // depth
        sub.vwf = vit; // waveform
        sub.vsw = (0xff - vir) >> 1; // sweep
        const { n, f } = c2spdToNote(c5spd);
        sub.xpo = n;
        sub.fin = f;

        // Set sample pan (overrides subinstrument) (it_load.c:944-949).
        if (dfp & 0x80) {
          sub.pan = (dfp & 0x7f) * 4;
        } else if (sampleMode) {
          sub.pan = -1; // XMP_INST_NO_DEFAULT_PAN
        }
      }
    }
  }

  if (flags & IT_SMP_SAMPLE && raw.length > 1) {
    let cvt = 0;

    // Sanity check — some modules may have invalid sizes on unused
    // samples so only check this if the sample flag is set (it_load.c:955).
    if (raw.length > MAX_SAMPLE_SIZE) {
      return -1;
    }

    // hio_seek(f, start + ish.sample_ptr, SEEK_SET)
    const dataPos = start + samplePtr;
    if (dataPos >= bytes.length) {
      return -1;
    }

    if (raw.loopEnd > raw.length || raw.loopStart >= raw.loopEnd) {
      raw.flags &= ~SampleFlags.LOOP;
    }

    if (convert === IT_CVT_ADPCM) {
      cvt |= SAMPLE_FLAG_ADPCM;
    }

    if (~(convert & 0xff) & IT_CVT_SIGNED) {
      cvt |= SAMPLE_FLAG_UNS;
    }

    // Compressed samples (it_load.c:974-1017).
    if (flags & IT_SMP_COMP) {
      const samples = (flags & IT_SMP_STEREO ? raw.length << 1 : raw.length) | 0;
      const fileLen = bytes.length;
      const minSize = samples >> 3;
      // NOTE: C uses `file_len - (long)ish.sample_ptr` — no `start +`!
      const left = fileLen - samplePtr;
      // No data to read at all? Just skip it...
      if (left <= 0) {
        return 0;
      }

      if (fileLen > 0 && left < minSize) {
        forceSampleLength(raw, left << 3);
      }

      const srcPos = { pos: dataPos };
      const decbuf = unpackItSample(bytes, srcPos, raw, flags, convert & IT_CVT_DIFF, tmp);

      // libxmp_load_sample(m, NULL, NOLOAD | cvt, xxs, decbuf): data comes
      // from the decompressed buffer; decode flags travel on raw.flags.
      raw.data = decbuf;
      if (cvt & SAMPLE_FLAG_UNS) raw.flags |= DecodeFlag.UNSIGNED;
      if (cvt & SAMPLE_FLAG_ADPCM) raw.flags |= DecodeFlag.ADPCM;
    } else {
      // Uncompressed: libxmp_load_sample(m, f, cvt, xxs, NULL) reads from
      // the file at the current position (after the sample_ptr seek).
      // Planar layout: sequential file bytes, no INTERLEAVED flag.
      const is16 = (flags & IT_SMP_16BIT) !== 0;
      const stereo = (flags & IT_SMP_STEREO) !== 0;
      const framelen = (is16 ? 2 : 1) * (stereo ? 2 : 1);
      const bytelen = raw.length * framelen;
      const take = Math.min(bytelen, bytes.length - dataPos);
      raw.data = bytes.subarray(dataPos, dataPos + Math.max(0, take));
      if (cvt & SAMPLE_FLAG_UNS) raw.flags |= DecodeFlag.UNSIGNED;
    }
  }

  return p;
}

// ---------------------------------------------------------------------------
// xlat_fx (it_load.c:97-181)
// ---------------------------------------------------------------------------

function xlatFx(c: number, e: Event, lastFxp: Uint8Array, newFx: boolean): void {
  let h = (e.fxp & 0xf0) >> 4; // MSN
  let l = e.fxp & 0x0f; // LSN

  e.fxt = fx[e.fxt]!;

  if (e.fxt === FX_XTND) {
    // Extended effect
    e.fxt = FX.FX_EXTENDED;

    if (h === 0 && e.fxp === 0) {
      e.fxp = lastFxp[c]!;
      h = (e.fxp & 0xf0) >> 4;
      l = e.fxp & 0x0f;
    } else {
      lastFxp[c] = e.fxp;
    }

    switch (h) {
      case 0x1: // Glissando
        e.fxp = 0x30 | l;
        break;
      case 0x2: // Finetune -- not supported
        e.fxt = 0;
        e.fxp = 0;
        break;
      case 0x3: // Vibrato wave
        e.fxp = 0x40 | l;
        break;
      case 0x4: // Tremolo wave
        e.fxp = 0x70 | l;
        break;
      case 0x5: // Panbrello wave
        if (l <= 3) {
          e.fxt = FX.FX_PANBRELLO_WF;
          e.fxp = l;
        } else {
          e.fxt = 0;
          e.fxp = 0;
        }
        break;
      case 0x6: // Pattern delay
        e.fxp = 0xe0 | l;
        break;
      case 0x7: // Instrument functions
        e.fxt = FX.FX_IT_INSTFUNC;
        e.fxp &= 0x0f;
        break;
      case 0x8: // Set pan position
        e.fxt = FX.FX_SETPAN;
        e.fxp = l << 4;
        break;
      case 0x9:
        if (l === 0 || l === 1) {
          // 0x91 = set surround
          e.fxt = FX.FX_SURROUND;
          e.fxp = l;
        } else if (l === 0xe || l === 0xf) {
          // 0x9f Play reverse (MPT)
          e.fxt = FX.FX_REVERSE;
          e.fxp = l - 0xe;
        }
        break;
      case 0xa: // High offset
        e.fxt = FX.FX_HIOFFSET;
        e.fxp = l;
        break;
      case 0xb: // Pattern loop
        e.fxp = 0x60 | l;
        break;
      case 0xc: // Note cut
      case 0xd: // Note delay
        e.fxp = l;
        if (e.fxp === 0) e.fxp++; // SD0 and SC0 become SD1 and SC1
        e.fxp |= h << 4;
        break;
      case 0xe: // Pattern row delay
        e.fxt = FX.FX_IT_ROWDELAY;
        e.fxp = l;
        break;
      case 0xf: // Set parametered macro
        e.fxt = FX.FX_MACRO_SET;
        e.fxp = l;
        break;
      default:
        e.fxt = 0;
        e.fxp = 0;
    }
    return;
  }

  if (e.fxt === FX.FX_TREMOR) {
    if (!newFx && e.fxp !== 0) {
      e.fxp = (((e.fxp & 0xf0) >> 4) + 1) * 0x10 | ((e.fxp & 0x0f) + 1);
    }
    return;
  }

  if (e.fxt === FX.FX_GLOBALVOL) {
    if (e.fxp > 0x80) {
      // See storlek test 16
      e.fxt = 0;
      e.fxp = 0;
    }
    return;
  }

  if (e.fxt === FX_NONE) {
    // No effect
    e.fxt = 0;
    e.fxp = 0;
  }
}

// ---------------------------------------------------------------------------
// xlat_volfx (it_load.c:186-232)
// ---------------------------------------------------------------------------

function xlatVolfx(e: Event): void {
  const b = e.vol;
  e.vol = 0;

  if (b <= 0x40) {
    e.vol = b + 1;
  } else if (b >= 65 && b <= 74) {
    // A
    e.f2t = FX.FX_F_VSLIDE_UP_2;
    e.f2p = b - 65;
  } else if (b >= 75 && b <= 84) {
    // B
    e.f2t = FX.FX_F_VSLIDE_DN_2;
    e.f2p = b - 75;
  } else if (b >= 85 && b <= 94) {
    // C
    e.f2t = FX.FX_VSLIDE_UP_2;
    e.f2p = b - 85;
  } else if (b >= 95 && b <= 104) {
    // D
    e.f2t = FX.FX_VSLIDE_DN_2;
    e.f2p = b - 95;
  } else if (b >= 105 && b <= 114) {
    // E
    e.f2t = FX.FX_PORTA_DN;
    e.f2p = (b - 105) << 2;
  } else if (b >= 115 && b <= 124) {
    // F
    e.f2t = FX.FX_PORTA_UP;
    e.f2p = (b - 115) << 2;
  } else if (b >= 128 && b <= 192) {
    // pan
    if (b === 192) {
      e.f2p = 0xff;
    } else {
      e.f2p = (b - 128) << 2;
    }
    e.f2t = FX.FX_SETPAN;
  } else if (b >= 193 && b <= 202) {
    // G
    const val = [0x00, 0x01, 0x04, 0x08, 0x10, 0x20, 0x40, 0x60, 0x80, 0xff];
    e.f2t = FX.FX_TONEPORTA;
    e.f2p = val[b - 193]!;
  } else if (b >= 203 && b <= 212) {
    // H
    e.f2t = FX.FX_VIBRATO;
    e.f2p = b - 203;
  }
}

// ---------------------------------------------------------------------------
// load_it_pattern (it_load.c:1032-1170). `tracks` is pre-sized to num_rows
// events per channel; writes go through the C EVENT(i,c,r) array.
// ---------------------------------------------------------------------------

function loadItPattern(
  bytes: Uint8Array,
  pos: number,
  chn: number,
  numRows: number,
  tracks: Pattern['tracks'],
  newFx: boolean,
): void {
  let patPos = pos;
  const patLen = readmem16l(bytes, patPos) /* - 4 */;
  patPos += 2;
  // num_rows u16 (rows already known by the caller) + two reserved u16
  // reads (it_load.c:1024-1029): 4 more bytes before the packed payload.
  patPos += 2 + 4;
  if (patPos + patLen > bytes.length) {
    fail(`read error loading pattern`); // hio_read(patbuf,1,pat_len) short
  }
  const patbuf = bytes.subarray(patPos, patPos + patLen);
  patPos += patLen;
  let ipos = 0; // index into patbuf
  const iend = patLen;

  const lastFxp = new Uint8Array(64);
  const lastevent: Event[] = [];
  for (let c = 0; c < L_CHANNELS; c++) lastevent.push({ ...EMPTY_EVENT });
  const mask = new Uint8Array(L_CHANNELS);
  const dummy: Event = { ...EMPTY_EVENT };

  let r = 0;

  while (r < numRows && ipos < iend) {
    let b = patbuf[ipos++]!;
    if (b === 0) {
      r++;
      continue;
    }
    const c = (b - 1) & 63;

    if (b & 0x80) {
      if (ipos >= iend) break;
      mask[c] = patbuf[ipos++]!;
    }
    // WARNING: we IGNORE events in disabled channels (it_load.c:1064-1071).
    const event = c >= chn ? dummy : tracks[c]!.event[r]!;

    if ((mask[c]! & 0x0f) === 0) {
      // skip_packed_event
    } else {
      if (mask[c]! & 0x01) {
        if (ipos >= iend) break;
        b = patbuf[ipos++]!;

        /* From ittech.txt (it_load.c:1083-1089):
         * Note ranges from 0->119 (C-0 -> B-9)
         * 255 = note off, 254 = notecut
         * Others = note fade */
        if (b === 0xff) {
          b = XMP_KEY_OFF; // key off
        } else if (b === 0xfe) {
          b = XMP_KEY_CUT; // cut
        } else if (b > 119) {
          b = XMP_KEY_FADE; // fade
        } else {
          b = b + 1; // note
        }
        lastevent[c]!.note = event.note = b;
      }
      if (mask[c]! & 0x02) {
        if (ipos >= iend) break;
        b = patbuf[ipos++]!;
        lastevent[c]!.ins = event.ins = b;
      }
      if (mask[c]! & 0x04) {
        if (ipos >= iend) break;
        b = patbuf[ipos++]!;
        lastevent[c]!.vol = event.vol = b;
        xlatVolfx(event);
      }
      if (mask[c]! & 0x08) {
        if (ipos >= iend - 1) break;
        b = patbuf[ipos++]!;
        if (b >= fx.length) {
          // invalid effect — skip parameter, warn
          ipos++;
        } else {
          event.fxt = b;
          event.fxp = patbuf[ipos++]!;

          xlatFx(c, event, lastFxp, newFx);
          lastevent[c]!.fxt = event.fxt;
          lastevent[c]!.fxp = event.fxp;
        }
      }
    }

    // skip_packed_event (it_load.c:1150-1163)
    if ((mask[c]! & 0xf0) !== 0) {
      if (mask[c]! & 0x10) {
        event.note = lastevent[c]!.note;
      }
      if (mask[c]! & 0x20) {
        event.ins = lastevent[c]!.ins;
      }
      if (mask[c]! & 0x40) {
        // C re-runs xlat_volfx on the raw lastevent byte here (:1130-1132).
        event.vol = lastevent[c]!.vol;
        xlatVolfx(event);
      }
      if (mask[c]! & 0x80) {
        event.fxt = lastevent[c]!.fxt;
        event.fxp = lastevent[c]!.fxp;
      }
    }
  }
}

// ---------------------------------------------------------------------------
// it_load (it_load.c:1172-1551)
// ---------------------------------------------------------------------------

export function itLoad(bytes: Uint8Array, ctx: LoadCtx): ModuleData {
  const start = 0; // file offset base (no depacker)

  if (bytes.length < 192) fail('file too short');

  // Read IT header (it_load.c:1181-1231).
  if (readmem32b(bytes, 0) !== MAGIC_IMPM) fail('bad magic');
  const nameBuf = bytes.slice(4, 30);
  fixName(nameBuf, 26);
  const name = copyAdjust(nameBuf, 25);

  const ifh: ItFileHeader = {
    name: nameBuf,
    hiliteMin: bytes[30]!,
    hiliteMaj: bytes[31]!,
    ordnum: readmem16l(bytes, 32),
    insnum: readmem16l(bytes, 34),
    smpnum: readmem16l(bytes, 36),
    patnum: readmem16l(bytes, 38),
    cwt: readmem16l(bytes, 40),
    cmwt: readmem16l(bytes, 42),
    flags: readmem16l(bytes, 44),
    special: readmem16l(bytes, 46),
    gv: bytes[48]!,
    mv: bytes[49]!,
    is: bytes[50]!,
    it: bytes[51]!,
    sep: bytes[52]!,
    pwd: bytes[53]!,
    msglen: readmem16l(bytes, 54),
    msgofs: readmem32l(bytes, 56),
    rsvd: readmem32l(bytes, 60),
    chpan: bytes.slice(64, 128),
    chvol: bytes.slice(128, 192),
  };

  if (ifh.gv > 0x80) fail('invalid global volume'); // GV > 128

  // Sanity check on instrument/sample/pattern counts (it_load.c:1240-1249).
  if (ifh.insnum > 255 || ifh.smpnum > 255 || ifh.patnum > 255) {
    fail('too many instruments or patterns');
  }
  if (ifh.insnum > 0 && ifh.smpnum === 0) fail('instruments without samples');
  const sampleMode = (~ifh.flags & IT_USE_INST) !== 0;
  let cmwt = ifh.cmwt;

  const mod: ModuleData = {
    title: name,
    format: 'it',
    comment: '',
    chn: L_CHANNELS,
    pat: ifh.patnum,
    ins: ifh.insnum, // C: mod->ins = ifh.insnum first (it_load.c:1213);
    // sample mode rewrites mod->ins = mod->smp AFTER identify_tracker.
    len: ifh.ordnum > XMP_MAX_MOD_LENGTH ? XMP_MAX_MOD_LENGTH : ifh.ordnum,
    restart: 0,
    xxo: [],
    channels: [],
    patterns: [],
    instruments: [],
    samples: [],
    num_sequences: 0,
    sequences: [],
    speed: ifh.is,
    bpm: ifh.it,
    volbase: 0x40, // load_helpers.c:303 default; IT never overrides
    gvolbase: 0x80,
    gvol: ifh.gv,
    quirks: QUIRKS_IT,
    flowMode: FLOW_MODE_IT_210, // set by identify_tracker below (C :351)
    readEventType: ReadEventType.IT,
    periodType: PeriodType.AMIGA,
    defpan: 0x80,
    time_factor: 10,
    rrate: 250,
    c4rate: C4_NTSC_RATE,
    tracker: '', // set by identify_tracker below
  };

  if (ifh.flags & IT_LINEAR_FREQ) {
    mod.periodType = PeriodType.LINEAR;
  }

  // Orders (it_load.c:1268-1275): read len (= min(ordnum,256)) entries.
  {
    let op = start + 192;
    if (op + mod.len > bytes.length) fail('read error on orders');
    for (let i = 0; i < mod.len; i++) {
      mod.xxo.push(bytes[op + i]!);
    }
  }
  // Pointer tables start after the orders: position = start + 192 + len
  // (mod->len is ALREADY clamped when C seeks; see it_load.c:1268-1275).
  const opos = start + 192 + mod.len;

  // Channel settings (it_load.c:1241-1266): 64 entries, pan/mute/surround.
  for (let i = 0; i < L_CHANNELS; i++) {
    const pan = ifh.chpan[i]! & 0x7f;
    let flg = 0;
    if (pan === 100) {
      flg |= ChannelFlags.SURROUND;
    }
    if (ifh.chpan[i]! & 0x80) {
      flg |= ChannelFlags.MUTE;
    }
    let p = pan;
    if (ifh.flags & IT_STEREO) {
      p = (pan * 0x80) >> 5;
      if (p > 0xff) p = 0xff;
    } else {
      p = 0x80;
    }
    mod.channels.push({ pan: p, vol: ifh.chvol[i]!, flg });
  }

  // Offset table (it_load.c:1323-1331): ins/smp/pat pointers in file order.
  const ppIns: number[] = [];
  const ppSmp: number[] = [];
  const ppPat: number[] = [];
  let ptr = opos; // start + 192 + len
  // C reads mod->ins entries, which is STILL ifh.insnum here — sample mode
  // rewrites mod->ins only later (it_load.c:1278-1279 vs :1309-1310).
  for (let i = 0; i < ifh.insnum; i++) {
    if (ptr + 4 > bytes.length) fail('read instrument offsets');
    ppIns.push(readmem32l(bytes, ptr));
    ptr += 4;
  }
  for (let i = 0; i < ifh.smpnum; i++) {
    if (ptr + 4 > bytes.length) fail('read sample offsets');
    ppSmp.push(readmem32l(bytes, ptr));
    ptr += 4;
  }
  for (let i = 0; i < ifh.patnum; i++) {
    if (ptr + 4 > bytes.length) fail('read pattern offsets');
    ppPat.push(readmem32l(bytes, ptr));
    ptr += 4;
  }

  // Edit history (it_load.c:1337-1344).
  if (ifh.special & IT_EDIT_HISTORY) {
    if (ptr + 2 > bytes.length) fail('read edit history');
    const skip = readmem16l(bytes, ptr) * 8;
    ptr += 2 + skip;
  }

  // MIDI config (it_load.c:1346-1350).
  let midiCfg: NonNullable<ModuleData['midi']> | null = null;
  if (ifh.flags & IT_MIDI_CONFIG || ifh.special & IT_SPEC_MIDICFG) {
    const res = loadItMidiConfig(bytes, ptr);
    if (!res) fail('read MIDI config');
    midiCfg = res.midi;
    ptr = res.end;
  }

  // Get event offset and pattern rows (it_load.c:1355-1371): scan first.
  const numRows: number[] = [];
  for (let i = 0; i < ifh.patnum; i++) {
    if (ppPat[i]! + 4 > bytes.length) {
      numRows.push(64); // empty pattern
      continue;
    }
    const patLen = readmem16l(bytes, ppPat[i]!);
    const num = readmem16l(bytes, ppPat[i]! + 2);

    if (num > 1024) {
      numRows.push(0); // flag: unloadable pattern
      continue;
    }
    numRows.push(num);
    void patLen;
  }

  // identify_tracker (it_load.c:1382-1383): called once, after the pointer
  // tables are read — needs pat_before_smp.
  const patBeforeSmp =
    ifh.smpnum !== 0 && ifh.patnum !== 0 && ppPat[0] !== 0 && ppPat[0]! < ppSmp[0]!;
  const id = identifyTracker(ifh, patBeforeSmp, sampleMode);
  mod.tracker = id.tracker;
  mod.flowMode = id.flowMode;
  cmwt = id.cmwt;
  if (sampleMode) mod.ins = ifh.smpnum; // it_load.c:1309-1310

  return finalizeIt(mod, ifh, bytes, ctx, sampleMode, cmwt, id.isMpt116,
    ppIns, ppSmp, ppPat, numRows, midiCfg, start);
}

// ---------------------------------------------------------------------------
// it_load tail: instruments, samples, scan, patterns, message, quirks
// (it_load.c:1369-1543, in C file order: scan → init_pattern → read
// patterns → instruments → samples → message → quirks).
// ---------------------------------------------------------------------------

function finalizeIt(
  mod: ModuleData,
  ifh: ItFileHeader,
  bytes: Uint8Array,
  ctx: LoadCtx,
  sampleMode: boolean,
  cmwt: number,
  isMpt116: boolean,
  ppIns: number[],
  ppSmp: number[],
  ppPat: number[],
  numRows: number[],
  midiCfg: NonNullable<ModuleData['midi']> | null,
  start: number,
): ModuleData {
  const newFx = (ifh.flags & IT_OLD_FX) === 0; // old_fx ? 0 : 1
  const tracks: Pattern['tracks'][] = [];
  const tmp = new Uint8Array(TEMP_BUFFER_LEN);

  // ---------- Scan pass (it_load.c:1372-1438) ----------
  let maxCh = 0;
  for (let i = 0; i < ifh.patnum; i++) {
    if (ppPat[i] === 0) continue;
    if (numRows[i] === undefined) continue; // num_rows>1024 → pp_pat zeroed

    const pos0 = start + ppPat[i]!;
    const patLen = readmem16l(bytes, pos0); /* - 4 */
    // pat_len u16 + num_rows u16 + 2 reserved u16 = payload at +8
    const scan = bytes.subarray(pos0 + 8, pos0 + 8 + patLen);
    if (scan.length < patLen) fail('error scanning pattern');

    const mask = new Uint8Array(L_CHANNELS);
    let ipos = 0;
    const iend = patLen;
    let row = 0;
    while (row < numRows[i]! && ipos < iend) {
      const b = scan[ipos++]!;
      if (b === 0) {
        row++;
        continue;
      }
      const c = (b - 1) & 63;
      if (c > maxCh) maxCh = c;
      if (b & 0x80) {
        if (ipos >= iend) break;
        mask[c] = scan[ipos++]! & 0x0f;
      }
      ipos += bytesInPackedEvent[mask[c]!]!;
    }
  }
  const chn = maxCh + 1;
  mod.chn = chn;

  // ---------- Pattern allocation (it_load.c:1443-1493) ----------
  for (let i = 0; i < ifh.patnum; i++) {
    const rows = numRows[i] === undefined ? 64 : numRows[i]!;
    if (ppPat[i] === 0 || numRows[i] === undefined) {
      // Empty pattern: 64 rows, all channels fresh 64-row tracks.
      const t: Pattern['tracks'] = [];
      for (let j = 0; j < chn; j++) {
        const ev: Event[] = [];
        for (let r = 0; r < 64; r++) ev.push({ ...EMPTY_EVENT });
        t.push({ rows: 64, event: ev });
      }
      tracks.push(t);
      continue;
    }
    const t: Pattern['tracks'] = [];
    for (let j = 0; j < chn; j++) {
      const ev: Event[] = [];
      for (let r = 0; r < rows; r++) ev.push({ ...EMPTY_EVENT });
      t.push({ rows, event: ev });
    }
    tracks.push(t);
  }

  // ---------- Read patterns (it_load.c:1456-1492) ----------
  for (let i = 0; i < ifh.patnum; i++) {
    if (ppPat[i] === 0 || numRows[i] === undefined) continue;
    const rows = numRows[i]!;
    loadItPattern(bytes, start + ppPat[i]!, chn, rows, tracks[i]!, newFx);
  }

  // ---------- Instruments (it_load.c:586-594) ----------
  const instruments: Instrument[] = [];
  for (let i = 0; i < mod.ins; i++) {
    const ins = zeroInstrument();
    instruments.push(ins);
  }

  // ---------- Sample offsets / data (it_load.c:587-594 + 596-1030) ----------
  const raws: RawSample[] = [];
  if (!sampleMode && cmwt >= 0x0200) {
    // New format
    for (let i = 0; i < ifh.insnum; i++) {
      if (ppIns[i] === 0) continue;
      const res = loadNewItInstrument(bytes, start + ppIns[i]!);
      if (!res) continue;
      instruments[i] = res.ins;
    }
  } else if (!sampleMode) {
    // Old format
    for (let i = 0; i < ifh.insnum; i++) {
      if (ppIns[i] === 0) continue;
      const res = loadOldItInstrument(bytes, start + ppIns[i]!);
      if (!res) continue;
      instruments[i] = res.ins;
    }
  }

  for (let i = 0; i < ifh.smpnum; i++) {
    const raw: RawSample = {
      data: new Uint8Array(0),
      length: 0,
      loopStart: 0,
      loopEnd: 0,
      sustainStart: 0,
      sustainEnd: 0,
      finetune: 0,
      volume: 0,
      flags: 0,
    };
    raws.push(raw);
    if (loadItSample(bytes, start + ppSmp[i]!, raws[i]!, i, start, sampleMode,
      instruments[i]!, instruments, tmp) < 0) {
      fail(`error loading sample ${i}`);
    }
    ctx.addSample(raws[i]!);
  }

  // hio_error after samples is cleared (truncation tolerance,
  // it_load.c after sample loop) — buffered loads have no stream error.

  // ---------- Song message (it_load.c:1483-1502) ----------
  let comment: string | undefined;
  if (ifh.special & IT_HAS_MSG && ifh.msglen > 0) {
    const mp = start + ifh.msgofs;
    const take = Math.min(ifh.msglen, Math.max(0, bytes.length - mp));
    if (take > 0) {
      let s = '';
      for (let j = 0; j < take; j++) {
        let b = bytes[mp + j]!;
        if (b === 13) {
          b = 10; // \r → \n
        } else if ((b < 32 || b > 127) && b !== 10 && b !== 9) {
          b = 0x2e; // '.'
        }
        s += String.fromCharCode(b);
      }
      comment = s;
    }
  }
  mod.comment = comment ?? '';

  // ---------- Format quirks (it_load.c:1504-1524) ----------
  mod.quirks |= Quirk.ARPMEM | Quirk.INSVOL;

  if (ifh.flags & IT_LINK_GXX) {
    mod.quirks |= Quirk.PRENV;
  } else {
    mod.quirks |= Quirk.UNISLD;
  }


  mod.instruments = instruments;
  mod.samples = raws;
  if (newFx) {
    mod.quirks |= Quirk.VIBHALF | Quirk.VIBINV;
  } else {
    mod.quirks &= ~Quirk.VIBALL;
    mod.quirks |= Quirk.ITOLDFX;
  }

  if (sampleMode) {
    mod.quirks &= ~(Quirk.VIRTUAL | Quirk.RSTCHN);
  }

  mod.gvolbase = 0x80;
  mod.gvol = ifh.gv;
  mod.mvolbase = 48;
  mod.mvol = ifh.mv;
  mod.readEventType = ReadEventType.IT;
  mod.midi = midiCfg ?? undefined;

  if (isMpt116) {
    applyMptPreamp(mod);
  }

  // Assemble pattern list for the module.
  mod.patterns = [];
  for (let i = 0; i < ifh.patnum; i++) {
    mod.patterns.push({ rows: numRows[i] ?? 64, tracks: tracks[i]! });
  }

  return mod;
}

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

export const plugin: FormatPlugin = {
  name: 'it',
  test: itTest,
  load: itLoad,
  readEvent(core: Core, chn: number, row: number): void {
    const mod = core.module as ModuleData;
    const xc = core.ctx.channelStates[chn] as ChannelState;
    const e =
      core.readEventScratch(chn) ??
      core.readEventAt(mod.xxo[core.ctx.p.ord] ?? 0, chn, row);

    // (read_event.c:934-937) — IT extras handled in readEventIt.
    if (e.ins !== 0) xc.old_ins = e.ins;
    if (TEST_NOTE(xc, NoteFlag.SAMPLE_END) !== 0) {
      SET_NOTE(xc, NoteFlag.END);
    }

    readEventIt(core, e, chn);
  },
};

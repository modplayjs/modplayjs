// S3M loader. Verbatim port of reference/libxmp/src/loaders/s3m_load.c
// s3m_test (:78-92) and s3m_load (:207-698), non-CORE_PLAYER variant,
// plus helpers: xlat_fx (:129-205), the version>>12 tracker-name tree
// (:397-474), libxmp_schism_tracker_string (common.c:546-580) with
// schism_tracker_date (common.c:528-537), and libxmp_c2spd_to_note
// (period.c:251-264).
//
// Constants from reference/libxmp/src/loaders/s3m.h.

import type { ChannelState, Core, FormatPlugin, LoadCtx, ModuleData, Event } from '@modplayjs/core';
import {
  C4_NTSC_RATE,
  FLOW_MODE_IT_210,
  FLOW_MODE_MPT_116,
  FLOW_MODE_ORPHEUS,
  FLOW_MODE_ST3_301,
  FLOW_MODE_ST3_321,
  ParseError,
  PeriodType,
  Quirk,
  QUIRKS_ST3,
  ReadEventType,
  SampleFlags,
  XMP_KEY_OFF,
} from '@modplayjs/core';
import {
  EMPTY_EVENT,
  type Channel,
  type Instrument,
  type Pattern,
  type RawSample,
  type SubInstrument,
} from '@modplayjs/core';
import {
  LSN,
  MSN,
  SET_NOTE,
  TEST_NOTE,
  NoteFlag,
  readEventSt3,
} from '@modplayjs/effects-shared';
import { FX, EX_GLISS, EX_VIBRATO_WF, EX_FINETUNE, EX_PATTERN_LOOP, EX_TREMOLO_WF } from '@modplayjs/core';

// ---------------------------------------------------------------------------
// Constants (s3m.h)
// ---------------------------------------------------------------------------

/** MAGIC4('S','C','R','M') — module signature. */
const MAGIC_SCRM = 0x5343524d;
/** MAGIC4('S','C','R','S') — sample signature. */
const MAGIC_SCRS = 0x53435253;
// Pattern event markers (s3m.h:27-31).
const S3M_EOR = 0; // End of row
const S3M_CH_MASK = 0x1f; // Channel
const S3M_NI_FOLLOW = 0x20; // Note and instrument follow
const S3M_VOL_FOLLOWS = 0x40; // Volume follows
const S3M_FX_FOLLOWS = 0x80; // Effect and parameter follow

// Module flags (s3m.h:39-55).
const S3M_CH_OFF = 0xff;
const S3M_CH_NUMBER = 0x1f;
const S3M_CH_RIGHT = 0x08;
const S3M_CH_ADLIB = 0x10;
const S3M_PAN_SET = 0x20;
const S3M_AMIGA_RANGE = 0x10;
const S3M_ST300_VOLS = 0x40;

// Sample flags (s3m.h:68-70).
const S3M_SAMP_LOOP = 0x01;
const S3M_SAMP_STEREO = 0x02;
const S3M_SAMP_16BIT = 0x04;

/** XMP_MAX_MOD_LENGTH (xmp.h:131). */
const XMP_MAX_MOD_LENGTH = 256;
/** MAX_SAMPLE_SIZE (common.h:460) — enforced again by SampleStore.add. */
const MAX_SAMPLE_SIZE = 0x10000000;

/** libxmp CLAMP (common.h). */
function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

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

/** libxmp_copy_adjust (common.c:237-253): keep printable ASCII, pad '.'. */
function copyAdjust(r: Uint8Array, n: number): string {
  let s = '';
  for (let i = 0; i < n && i < r.length; i++) {
    const c = r[i]!;
    s += c > 127 || c < 0x20 || c === 0x7f ? '.' : String.fromCharCode(c);
  }
  return s.replace(/ +$/, '');
}

// ---------------------------------------------------------------------------
// s3m_test (s3m_load.c:78-92)
// ---------------------------------------------------------------------------

export function s3mTest(bytes: Uint8Array): boolean {
  // hio_seek(44); hio_read32b != MAGIC_SCRM → -1
  if (bytes.length < 48) return false;
  if (readmem32b(bytes, 44) !== MAGIC_SCRM) return false;
  // hio_seek(29); hio_read8 != 0x10 → -1
  if (bytes[29] !== 0x10) return false;
  // libxmp_read_title(t, 28) — no failure path.
  return true;
}

// ---------------------------------------------------------------------------
// Effect translation (s3m_load.c:98-205)
// ---------------------------------------------------------------------------

const FX_NONE = 0xff;
const FX_S3M_EXTENDED = 0xfe;

/** Effect conversion table (s3m_load.c:102-126), 27 entries. */
const FX_TABLE: readonly number[] = [
  FX_NONE,
  FX.FX_S3M_SPEED, // Axx  Set speed to xx (the default is 06)
  FX.FX_JUMP, // Bxx  Jump to order xx (hexadecimal)
  FX.FX_BREAK, // Cxx  Break pattern to row xx (decimal)
  FX.FX_VOLSLIDE, // Dxy  Volume slide down by y/up by x
  FX.FX_PORTA_DN, // Exx  Slide down by xx
  FX.FX_PORTA_UP, // Fxx  Slide up by xx
  FX.FX_TONEPORTA, // Gxx  Tone portamento with speed xx
  FX.FX_VIBRATO, // Hxy  Vibrato with speed x and depth y
  FX.FX_TREMOR, // Ixy  Tremor with ontime x and offtime y
  FX.FX_S3M_ARPEGGIO, // Jxy  Arpeggio with halfnote additions
  FX.FX_VIBRA_VSLIDE, // Kxy  Dual command: H00 and Dxy
  FX.FX_TONE_VSLIDE, // Lxy  Dual command: G00 and Dxy
  FX_NONE,
  FX_NONE,
  FX.FX_OFFSET, // Oxy  Set sample offset
  FX_NONE,
  FX.FX_MULTI_RETRIG, // Qxy  Retrig (+volumeslide) note
  FX.FX_TREMOLO, // Rxy  Tremolo with speed x and depth y
  FX_S3M_EXTENDED, // Sxx  (misc effects)
  FX.FX_S3M_BPM, // Txx  Tempo = xx (hex)
  FX.FX_FINE_VIBRATO, // Uxx  Fine vibrato
  FX.FX_GLOBALVOL, // Vxx  Set global volume
  FX_NONE,
  FX.FX_SETPAN, // Xxx  Set pan
  FX_NONE,
  FX_NONE,
];

/** FX_SETPAN (effects.h) — value from core FX table. */
const FX_SETPAN = FX.FX_SETPAN;
/** FX_SURROUND (effects.h) — value from core FX table. */
const FX_SURROUND = FX.FX_SURROUND;

/**
 * xlat_fx (s3m_load.c:129-205). Mutates the event's fxt/fxp in place.
 * `c` is unused in the C code body (kept for signature parity).
 */
function xlatFx(_c: number, e: Event): void {
  const h = MSN(e.fxp);
  const l = LSN(e.fxp);

  if (e.fxt >= FX_TABLE.length) {
    e.fxt = 0;
    e.fxp = 0;
    return;
  }

  e.fxt = FX_TABLE[e.fxt]!;
  switch (e.fxt) {
    case FX.FX_S3M_BPM:
      if (e.fxp < 0x20) {
        e.fxp = 0;
        e.fxt = 0;
      }
      break;
    case FX_S3M_EXTENDED: {
      // Extended effects
      e.fxt = FX.FX_EXTENDED;
      switch (h) {
        case 0x1: // Glissando
          e.fxp = LSN(e.fxp) | (EX_GLISS << 4);
          break;
        case 0x2: // Finetune
          e.fxp = ((LSN(e.fxp) - 8) & 0x0f) | (EX_FINETUNE << 4);
          break;
        case 0x3: // Vibrato wave
          e.fxp = LSN(e.fxp) | (EX_VIBRATO_WF << 4);
          break;
        case 0x4: // Tremolo wave
          e.fxp = LSN(e.fxp) | (EX_TREMOLO_WF << 4);
          break;
        case 0x5:
        case 0x6:
        case 0x7:
        case 0x9:
        case 0xa: // Ignore
          e.fxt = 0;
          e.fxp = 0;
          break;
        case 0x8: // Set pan
          e.fxt = FX_SETPAN;
          e.fxp = l << 4;
          break;
        case 0xb: // Pattern loop
          e.fxp = LSN(e.fxp) | (EX_PATTERN_LOOP << 4);
          break;
        case 0xc:
          if (l === 0) {
            e.fxt = 0;
            e.fxp = 0;
          }
          break;
      }
      break;
    }
    case FX_SETPAN:
      // Saga Musix: X00-X80 is left...right, XA4 is surround (like S91 in
      // IT), other values do nothing.
      if (e.fxp === 0xa4) {
        // surround
        e.fxt = FX_SURROUND;
        e.fxp = 1;
      } else {
        const pan = ((e.fxp as number) << 1) as number;
        if (pan > 0xff) {
          e.fxp = 0xff;
        } else {
          e.fxp = pan;
        }
      }
      break;
    case FX_NONE: // No effect
      e.fxt = 0;
      e.fxp = 0;
      break;
  }
}

// ---------------------------------------------------------------------------
// Tracker name helpers (s3m_load.c:397-474, common.c:528-580)
// ---------------------------------------------------------------------------

/**
 * schism_tracker_date (common.c:528-537): days since epoch for the given
 * civil date (same algorithm as C).
 */
function schismTrackerDate(year: number, month: number, day: number): number {
  let mm = (month + 9) % 12;
  let yy = year - Math.floor(mm / 10);

  yy = yy * 365 + Math.floor(yy / 4) - Math.floor(yy / 100) + Math.floor(yy / 400);
  mm = Math.floor((mm * 306 + 5) / 10);

  return yy + mm + (day - 1);
}

/**
 * libxmp_schism_tracker_string (common.c:546-580). s_ver <= 0x50: "0.s_ver";
 * above: build date from epoch 2009-10-31 (+ s_ver-0x50 days, or + l_ver
 * when s_ver == 0xfff) using the OpenMPT date algorithm.
 */
function schismTrackerString(sVer: number, lVer: number): string {
  if (sVer >= 0x50) {
    // time_t epoch_sec = 1256947200;
    let t = schismTrackerDate(2009, 10, 31);

    if (sVer === 0xfff) {
      t += lVer;
    } else {
      t += sVer - 0x50;
    }

    // Date algorithm reimplemented from OpenMPT.
    let year = Math.trunc((t * 10000 + 14780) / 3652425);
    let dayofyear = t - (365 * year + Math.floor(year / 4) - Math.floor(year / 100) + Math.floor(year / 400));
    if (dayofyear < 0) {
      year--;
      dayofyear = t - (365 * year + Math.floor(year / 4) - Math.floor(year / 100) + Math.floor(year / 400));
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

// ---------------------------------------------------------------------------
// c2spd conversion (period.c:251-264)
// ---------------------------------------------------------------------------

/**
 * libxmp_c2spd_to_note (period.c:251-264): c2spd → note/finetune pair.
 * c = (int)(1536.0 * log(c2spd/8363) / M_LN2); n = c/128; f = c%128.
 */
function c2spdToNote(c2spd: number): { n: number; f: number } {
  if (c2spd <= 0) {
    return { n: 0, f: 0 };
  }
  const c = Math.trunc((1536.0 * Math.log(c2spd / 8363)) / Math.LN2);
  return { n: Math.trunc(c / 128), f: c % 128 };
}

// ---------------------------------------------------------------------------
// s3m_load (s3m_load.c:207-698)
// ---------------------------------------------------------------------------

interface S3mFileHeader {
  name: Uint8Array; // 28 bytes
  type: number; // buf[30]
  ordnum: number; // readmem16l(buf+32)
  insnum: number; // readmem16l(buf+34)
  patnum: number; // readmem16l(buf+36)
  flags: number; // readmem16l(buf+38)
  version: number; // readmem16l(buf+40)
  ffi: number; // readmem16l(buf+42)
  magic: number; // readmem32b(buf+44)
  gv: number; // buf[48]
  is: number; // buf[49]
  it: number; // buf[50]
  mv: number; // buf[51]
  uc: number; // buf[52]
  dp: number; // buf[53]
  rsvd2: Uint8Array; // 8 bytes at buf+54
  special: number; // readmem16l(buf+62)
  chset: Uint8Array; // 32 bytes at buf+64
}

interface S3mInstrumentHeader {
  dosname: Uint8Array; // buf+1, 12 bytes
  memsegHi: number; // buf[13]
  memseg: number; // readmem16l(buf+14)
  length: number; // readmem32l(buf+16)
  loopbeg: number; // readmem32l(buf+20)
  loopend: number; // readmem32l(buf+24)
  vol: number; // buf[28]
  pack: number; // buf[30]
  flags: number; // buf[31]
  c2spd: number; // readmem16l(buf+32)
  name: Uint8Array; // buf+48, 28 bytes
  magic: number; // readmem32b(buf+76)
}

/** Zeroed envelope (libxmp_init_instrument calloc semantics). */
function zeroEnvelope(): Instrument['aei'] {
  return { flags: 0, npt: 0, scl: 0, sus: 0, sue: 0, lps: 0, lpe: 0, x: [], y: [] };
}

/** Zeroed instrument with one sub; maps are calloc'd zeros (S3M parity). */
function zeroInstrument(name: string, sub: SubInstrument[]): Instrument {
  return {
    name,
    volume: 0x40,
    nsm: 0,
    rls: 0,
    // S3M maps are calloc'd zeros: key → sub[0] (getSubinstrument).
    map: new Array<number>(121).fill(0),
    mapXpo: new Array<number>(121).fill(0),
    sub,
    aei: zeroEnvelope(),
    fei: zeroEnvelope(),
    pei: zeroEnvelope(),
  };
}

/** DecodeFlag.UNSIGNED (samples.ts:25) — SAMPLE_FLAG_UNS parity. */
const SAMPLE_FLAG_UNS = 1 << 10;
/** DecodeFlag.ADPCM (samples.ts:31) — SAMPLE_FLAG_ADPCM parity. */
const SAMPLE_FLAG_ADPCM = 1 << 13;

export function s3mLoad(bytes: Uint8Array, ctx: LoadCtx): ModuleData {
  const size = bytes.length;

  const fail = (msg: string): never => {
    throw new ParseError(msg);
  };

  // hio_read(buf, 1, 96, f) != 96 → err
  if (size < 96) fail('S3M: short header');

  const sfh: S3mFileHeader = {
    name: bytes.subarray(0, 28),
    type: bytes[30]!,
    ordnum: readmem16l(bytes, 32),
    insnum: readmem16l(bytes, 34),
    patnum: readmem16l(bytes, 36),
    flags: readmem16l(bytes, 38),
    version: readmem16l(bytes, 40),
    ffi: readmem16l(bytes, 42),
    magic: readmem32b(bytes, 44),
    gv: bytes[48]!,
    is: bytes[49]!,
    it: bytes[50]!,
    mv: bytes[51]!,
    uc: bytes[52]!,
    dp: bytes[53]!,
    rsvd2: bytes.subarray(54, 62),
    special: readmem16l(bytes, 62),
    chset: bytes.subarray(64, 96),
  };

  // Sanity check (s3m_load.c:224-231)
  if (sfh.ffi !== 1 && sfh.ffi !== 2) fail('S3M: bad ffi');
  if (sfh.ordnum > 255 || sfh.insnum > 255 || sfh.patnum > 255) {
    fail('S3M: count > 255');
  }

  if (sfh.magic !== MAGIC_SCRM) fail('S3M: bad magic');

  const title = copyAdjust(sfh.name, 28);

  // pp_ins / pp_pat calloc (s3m_load.c:236-246)
  const ppIns = new Array<number>(sfh.insnum).fill(0);
  const ppPat = new Array<number>(sfh.patnum).fill(0);

  if (sfh.flags & S3M_AMIGA_RANGE) {
    // m->period_type = PERIOD_MODRNG
  }
  const periodType = sfh.flags & S3M_AMIGA_RANGE ? PeriodType.MODRNG : PeriodType.AMIGA;
  let quirk = 0;
  if (sfh.flags & S3M_ST300_VOLS) {
    quirk |= Quirk.VSALL;
  }

  let spd = sfh.is;
  let bpm = sfh.it;
  let chn = 0;

  // Mix volume and stereo flag conversion (s3m_load.c:287-318).
  // mvolbase = 48 in C; stored on ModuleData (mixer.c mixer_prepare).
  let mvol: number;
  let stereo: number;

  if (sfh.ffi === 1) {
    mvol = ((sfh.mv & 0xf) + 1) * 0x10;
    stereo = sfh.mv & 0x10;
    mvol = clamp(mvol, 0x10, 0x7f);
  } else if (sfh.mv === 0x02 || sfh.mv === 0x12) {
    mvol = 0x20;
    stereo = sfh.mv & 0x10;
  } else {
    mvol = sfh.mv & 0x7f; // S3M_MV_VOLUME
    stereo = sfh.mv & 0x80; // S3M_MV_STEREO

    if (mvol === 0) {
      mvol = 48; // Default is 48
    } else if (mvol < 16) {
      mvol = 16; // Minimum is 16
    }
  }

  // "Note that in stereo, the mastermul is internally multiplied by 11/8
  // inside the player..." Do the inverse to affect fewer modules.
  if (!stereo) {
    mvol = Math.trunc((mvol * 8) / 11);
  }
  // Channel settings → mod.chn + default pans (s3m_load.c:320-333)
  const channels: Channel[] = [];
  for (let i = 0; i < 32; i++) {
    if (sfh.chset[i] === S3M_CH_OFF) {
      continue;
    }

    chn = i + 1;

    const x = sfh.chset[i]! & S3M_CH_NUMBER;
    let pan: number;
    if (stereo && x < S3M_CH_ADLIB) {
      pan = x < S3M_CH_RIGHT ? 0x30 : 0xc0;
    } else {
      pan = 0x80;
    }

    // xxc entries are calloc'd; only pan is set here. Channels array is
    // finalized after chn is known (below), preserving i-indexed pan.
    channels[i] = { pan, vol: 0x40, flg: 0 };
  }

  // Order list (s3m_load.c:335-350)
  let len: number;
  let xxo: number[];
  if (sfh.ordnum <= XMP_MAX_MOD_LENGTH) {
    len = sfh.ordnum;
    if (96 + len > size) fail('S3M: read error in orders');
    xxo = Array.from(bytes.subarray(96, 96 + len));
  } else {
    len = XMP_MAX_MOD_LENGTH;
    if (96 + len > size) fail('S3M: read error in orders');
    xxo = Array.from(bytes.subarray(96, 96 + len));
    // hio_seek(f, sfh.ordnum - XMP_MAX_MOD_LENGTH, SEEK_CUR) — skip the rest.
  }

  // Don't trust sfh.patnum (s3m_load.c:353-364)
  let pat = -1;
  for (let i = 0; i < len; i++) {
    const o = xxo[i]!;
    if (o < 0xfe && o > pat) {
      pat = o;
    }
  }
  pat++;
  if (pat > sfh.patnum) {
    pat = sfh.patnum;
  }
  if (pat === 0) {
    fail('S3M: no patterns');
  }

  const ins = sfh.insnum;

  // Parapointers (s3m_load.c:371-379)
  let pos = 96 + len;
  if (pos + sfh.insnum * 2 + sfh.patnum * 2 > size) {
    fail('S3M: read error in parapointers');
  }
  for (let i = 0; i < sfh.insnum; i++) {
    ppIns[i] = readmem16l(bytes, pos);
    pos += 2;
  }
  for (let i = 0; i < sfh.patnum; i++) {
    ppPat[i] = readmem16l(bytes, pos);
    pos += 2;
  }

  // Default pan positions (s3m_load.c:381-387)
  if (sfh.dp === 0xfc) {
    if (pos + 32 > size) fail('S3M: read error in default pan');
    for (let i = 0; i < 32; i++) {
      const x = bytes[pos + i]!;
      if (x & S3M_PAN_SET) {
        const pan = (x << 4) & 0xff;
        if (channels[i]) {
          channels[i]!.pan = pan;
        } else {
          channels[i] = { pan, vol: 0x40, flg: 0 };
        }
      }
    }
    pos += 32;
  }

  // c4rate / flow_mode / version tree (s3m_load.c:389-474)
  const c4rate = C4_NTSC_RATE;
  let flowMode: number = FLOW_MODE_ST3_321;

  if (sfh.version === 0x1300) {
    quirk |= Quirk.VSALL;
  }

  let trackerName: string;
  switch (Math.floor(sfh.version / 0x1000)) {
    case 1:
      if (
        sfh.version === 0x1320 &&
        sfh.special === 0 &&
        (sfh.ordnum & 0x0f) === 0 &&
        sfh.uc === 0 &&
        (sfh.flags & ~0x50) === 0 &&
        sfh.dp === 0xfc
      ) {
        if ((sfh.mv & 0x80) !== 0) {
          trackerName = 'ModPlug Tracker / OpenMPT 1.17';
        } else {
          // MPT 1.0 alpha5 doesn't set the stereo flag, but MPT 1.0 alpha6 does.
          trackerName = 'ModPlug Tracker 1.0 alpha';
        }
        flowMode = FLOW_MODE_MPT_116;
      } else if (sfh.version === 0x1320 && sfh.special === 0 && sfh.uc === 0 && sfh.flags === 0 && sfh.dp === 0) {
        if (sfh.gv === 64 && sfh.mv === 48) {
          trackerName = 'PlayerPRO';
        } else {
          // Always stereo
          trackerName = 'Velvet Studio';
        }
      } else {
        trackerName = `Scream Tracker ${((sfh.version & 0x0f00) >> 8).toString()}.${(sfh.version & 0xff).toString(16).padStart(2, '0')}`;
        quirk |= Quirk.ST3BUGS;
        if (sfh.version < 0x1303) {
          flowMode = FLOW_MODE_ST3_301;
        }
      }
      break;
    case 2:
      if (sfh.version === 0x2013) {
        // PlayerPRO on Intel doesn't byte-swap the tracker ID bytes
        trackerName = 'PlayerPRO';
      } else {
        trackerName = `Imago Orpheus ${((sfh.version & 0x0f00) >> 8).toString()}.${(sfh.version & 0xff).toString(16).padStart(2, '0')}`;
        flowMode = FLOW_MODE_ORPHEUS;
      }
      break;
    case 3:
      flowMode = FLOW_MODE_IT_210;
      if (sfh.version === 0x3216) {
        trackerName = 'Impulse Tracker 2.14v3';
      } else if (sfh.version === 0x3217) {
        trackerName = 'Impulse Tracker 2.14v5';
      } else {
        trackerName = `Impulse Tracker ${((sfh.version & 0x0f00) >> 8).toString()}.${(sfh.version & 0xff).toString(16).padStart(2, '0')}`;
      }
      break;
    case 5:
      if (sfh.version === 0x5447) {
        trackerName = 'Graoumf Tracker';
      } else if (sfh.rsvd2[0] || sfh.rsvd2[1]) {
        trackerName = `OpenMPT ${((sfh.version & 0x0f00) >> 8).toString()}.${(sfh.version & 0xff).toString(16).padStart(2, '0')}.${sfh.rsvd2[1]!.toString(16).padStart(2, '0')}.${sfh.rsvd2[0]!.toString(16).padStart(2, '0')}`;
      } else {
        trackerName = `OpenMPT ${((sfh.version & 0x0f00) >> 8).toString()}.${(sfh.version & 0xff).toString(16).padStart(2, '0')}`;
      }
      quirk |= Quirk.ST3BUGS;
      break;
    case 4:
    case 6:
      if (sfh.version === 0x4100 || Math.floor(sfh.version / 0x1000) === 6) {
        trackerName = `BeRoTracker ${((sfh.version & 0x0f00) >> 8).toString()}.${(sfh.version & 0xff).toString(16).padStart(2, '0')}`;
      } else {
        trackerName = schismTrackerString(sfh.version & 0x0fff, sfh.rsvd2[0]! | (sfh.rsvd2[1]! << 8));
      }
      break;
    default:
      trackerName = `unknown (${sfh.version.toString(16).padStart(4, '0')})`;
  }

  const type = `${trackerName} S3M`;

  // CHANNEL count sanity: chn from chset can exceed XMP_MAX_CHANNELS only
  // if >32 set — impossible (32 entries). No explicit check in C.

  // init_pattern: allocate patterns with 64 rows (s3m_load.c:478-540)
  const patterns: Pattern[] = [];
  const tracksByEvent: Array<Pattern['tracks']> = [];
  for (let i = 0; i < pat; i++) {
    const tracks: Pattern['tracks'] = [];
    // libxmp_alloc_pattern_tracks(mod, i, 64): 64 empty rows per channel.
    // chn isn't final until all chset scanned (done above), so tracks are
    // sized mod.chn here.
    for (let c = 0; c < chn; c++) {
      const events: Event[] = [];
      for (let r = 0; r < 64; r++) {
        events.push({ ...EMPTY_EVENT });
      }
      tracks.push({ rows: 64, event: events });
    }
    tracksByEvent.push(tracks);
  }

  // Read patterns (s3m_load.c:485-540)
  for (let i = 0; i < pat; i++) {
    if (ppPat[i] === 0) {
      continue;
    }

    const base = ppPat[i]! * 16;
    if (base + 2 > size) fail('S3M: read error in pattern header');

    let patPos = base;
    const patLen = readmem16l(bytes, patPos) - 2;
    patPos += 2;

    let r = 0;
    let remaining = patLen;
    const tracks = tracksByEvent[i]!;
    while (remaining >= 0 && r < 64) {
      if (patPos >= size) fail('S3M: read error in pattern data');
      const b = bytes[patPos]!;
      patPos++;

      if (b === S3M_EOR) {
        r++;
        continue;
      }

      const c = b & S3M_CH_MASK;
      // event = c >= mod->chn ? &dummy : &EVENT(i, c, r)
      const dummy: Event = { ...EMPTY_EVENT };
      const event = c >= chn ? dummy : tracks[c]!.event[r]!;

      if (b & S3M_NI_FOLLOW) {
        if (patPos + 2 > size) fail('S3M: read error in pattern data');
        let n = bytes[patPos]!;
        switch (n) {
          case 255:
            n = 0; // Empty note
            break;
          case 254:
            n = XMP_KEY_OFF; // Key off
            break;
          default:
            n = 13 + 12 * MSN(n) + LSN(n);
        }
        event.note = n;
        event.ins = bytes[patPos + 1]!;
        remaining -= 2;
        patPos += 2;
      }

      if (b & S3M_VOL_FOLLOWS) {
        if (patPos + 1 > size) fail('S3M: read error in pattern data');
        event.vol = bytes[patPos]! + 1;
        remaining -= 1;
        patPos += 1;
      }

      if (b & S3M_FX_FOLLOWS) {
        if (patPos + 2 > size) fail('S3M: read error in pattern data');
        event.fxt = bytes[patPos]!;
        event.fxp = bytes[patPos + 1]!;
        xlatFx(c, event);
        remaining -= 2;
        patPos += 2;
      }
    }

    patterns.push({ rows: 64, tracks });
  }

  // init_instrument (s3m_load.c:545-682)
  const instruments: Instrument[] = [];
  const rawSamples: RawSample[] = [];

  for (let i = 0; i < ins; i++) {
    const sub: SubInstrument = {
      vol: 0,
      gvl: 0,
      pan: -1, // XMP_INST_NO_DEFAULT_PAN
      xpo: 0,
      fin: 0,
      vwf: 0,
      vde: 0,
      vra: 0,
      vsw: 0,
      sid: i,
      rvv: 0,
      nna: 0,
      dct: 0,
      dca: 0,
      ifc: 0,
      ifr: 0,
    };

    const hdrBase = ppIns[i]! * 16;
    if (hdrBase + 80 > size) fail('S3M: read error in instrument header');
    const buf = bytes.subarray(hdrBase, hdrBase + 80);

    if (buf[0]! >= 2) {
      // OPL2 FM instrument (s3m_load.c:574-608). LIBXMP_CORE_PLAYER path:
      // goto err3 (load error). No OPL synth exists in this port, so a
      // non-sample instrument is a hard load error, matching the C core.
      fail(`S3M: FM instrument not supported (${i})`);
    }

    const sih: S3mInstrumentHeader = {
      dosname: buf.subarray(1, 13),
      memsegHi: buf[13]!,
      memseg: readmem16l(buf, 14),
      length: readmem32l(buf, 16),
      loopbeg: readmem32l(buf, 20),
      loopend: readmem32l(buf, 24),
      vol: buf[28]!,
      pack: buf[30]!,
      flags: buf[31]!,
      c2spd: readmem16l(buf, 32),
      name: buf.subarray(48, 76),
      magic: readmem32b(buf, 76),
    };

    // ST3 64000 limit is disabled in C (#if 0, s3m_load.c:615-619).

    if (sih.length > MAX_SAMPLE_SIZE) {
      fail('S3M: sample too large');
    }

    if (buf[0] === 1 && sih.magic !== MAGIC_SCRS) {
      fail('S3M: instrument magic');
    }

    const name = copyAdjust(sih.name, 28);
    const xxi = zeroInstrument(name, [sub]);
    xxi.nsm = sih.length > 0 ? 1 : 0;

    const raw: RawSample = {
      name: name, // copyAdjust(sih.name, 28)
      data: new Uint8Array(0),
      length: sih.length,
      loopStart: sih.loopbeg,
      loopEnd: sih.loopend,
      sustainStart: 0,
      sustainEnd: 0,
      finetune: 0,
      volume: sih.vol,
      flags: 0,
      // libxmp_init_instrument: m->xtra[i].c5spd = m->c4rate; S3M overwrites
      // pitch via c2spd → xpo/fin below (sub->xpo/sub->fin), not c5spd.
      c5spd: C4_NTSC_RATE,
    };

    // xxs->flg (s3m_load.c:644-651)
    let xflg = sih.flags & S3M_SAMP_LOOP ? SampleFlags.LOOP : 0;
    if (sih.flags & S3M_SAMP_STEREO) {
      xflg |= SampleFlags.STEREO;
    }
    if (sih.flags & S3M_SAMP_16BIT) {
      xflg |= SampleFlags.BITS16;
    }
    // Decode flags ride on raw.flags high bits (xm.ts parity); the store's
    // normalize() applies them (loaders/sample.c load_sample_flags).
    raw.flags = xflg;
    // load_sample_flags (s3m_load.c:653-656): old-format files (ffi==1)
    // store signed data; ffi==2 files store unsigned PCM (SAMPLE_FLAG_UNS).
    // ADPCM (pack === 4) overrides. These are DecodeFlag bits consumed by
    // SampleStore.normalize (convert_signal / itsex).
    let loadSampleFlags = sfh.ffi === 1 ? 0 : SAMPLE_FLAG_UNS;
    if (sih.pack === 4) {
      loadSampleFlags = SAMPLE_FLAG_ADPCM;
    }
    raw.flags |= loadSampleFlags;

    sub.vol = sih.vol;

    // libxmp_c2spd_to_note (s3m_load.c:670)
    const { n, f } = c2spdToNote(sih.c2spd);
    sub.xpo = n;
    sub.fin = f;

    // Sample data (s3m_load.c:672-681)
    const sampleSegment = (sih.memseg + sih.memsegHi * 0x10000) >>> 0;
    const dataPos = sampleSegment * 16;
    if (dataPos > size) fail('S3M: seek error in sample data');

    if (sih.length > 0) {
      const framelen = (sih.flags & S3M_SAMP_16BIT ? 2 : 1) * (sih.flags & S3M_SAMP_STEREO ? 2 : 1);
      const bytelen = sih.pack === 4 ? ((sih.length + 1) >> 1) + 16 : sih.length * framelen;
      const remaining = size - dataPos;
      const take = Math.min(bytelen, Math.max(0, remaining));
      // EOF handling (sample.c:236-282): past EOF → truncate (frame-aligned
      // in normalize); ADPCM table + nibbles are read as one block.
      raw.data = bytes.subarray(dataPos, dataPos + take);
    }

    // Every sample slot is registered so store ids align with sid = i.
    ctx.addSample(raw);

    instruments.push(xxi);
    rawSamples.push(raw);

  }

  // Final quirks (s3m_load.c:687-688)
  quirk |= QUIRKS_ST3 | Quirk.ARPMEM;
  const readEventType = ReadEventType.ST3;

  // Channels array: fill holes for channels never seen in chset (S3M files
  // can set dp pan for channel i < 32 with chset[i] == 0xff). chn is the
  // highest i+1 with chset[i] != 0xff, so holes can only exist at i < chn.
  for (let i = 0; i < chn; i++) {
    if (!channels[i]) {
      channels[i] = { pan: 0x80, vol: 0x40, flg: 0 };
    }
  }
  channels.length = chn;

  const mod: ModuleData = {
    title,
    format: 's3m',
    comment: '',
    chn,
    pat,
    ins,
    len,
    restart: 0,
    xxo,
    channels,
    patterns,
    instruments,
    samples: rawSamples,
    num_sequences: 0,
    sequences: [],
    speed: spd,
    bpm,
    volbase: 0x40,
    gvolbase: 0x40,
    gvol: sfh.gv,
    quirks: quirk,
    flowMode,
    readEventType,
    periodType,
    defpan: 0x80,
    time_factor: 10,
    rrate: 250,
    c4rate,
    // Mix volume (s3m_load.c:714-715: m->mvolbase = 48; m->mvol = mvol).
    mvolbase: 48,
    mvol,
    tracker: type,
  };

  void ctx.sampleRate;
  void ctx.outputRate;
  return mod;
}

// ---------------------------------------------------------------------------
// Plugin (mirrors fmt-mod: reader dispatch via fmt-mod's readEventDispatch)
// ---------------------------------------------------------------------------

/** S3M format plugin (libxmp loaders/s3m_load.c + read_event_st3). */
export const plugin: FormatPlugin = {
  name: 's3m',
  test: s3mTest,
  load: s3mLoad,
  readEvent(core: Core, chn: number, row: number): void {
    // libxmp_read_event (read_event.c:1624-1664) prologue: scratch event
    // fetch, old_ins update, NOTE_END propagation from NOTE_SAMPLE_END,
    // then dispatch on readEventType. S3M modules always dispatch ST3.
    const mod = core.module as ModuleData;
    const xc = core.ctx.channelStates[chn] as ChannelState;
    const e =
      core.readEventScratch(chn) ?? core.readEventAt(mod.xxo[core.ctx.p.ord] ?? 0, chn, row);

    if (e.ins !== 0) xc.old_ins = e.ins;

    if (TEST_NOTE(xc, NoteFlag.SAMPLE_END) !== 0) {
      SET_NOTE(xc, NoteFlag.END);
    }

    readEventSt3(core, e, chn);
  },
};

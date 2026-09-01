// XM loader. Verbatim port of reference/libxmp/src/loaders/xm_load.c
// xm_test (:66-79), load_xm_pattern (:81-277), load_patterns (:279-330),
// load_instruments (:433-760), xm_load (:762-1024) — non-CORE_PLAYER
// variant (MPT extension chunks, ADPCM, Ogg Vorbis samples).
// Constants from reference/libxmp/src/loaders/xm.h.

import type {
  Core,
  FormatPlugin,
  LoadCtx,
  ModuleData,
} from '@modplayjs/core';
import {
  C4_NTSC_RATE,
  FLOW_MODE_MPT_116,
  FLOW_MODE_GENERIC,
  ParseError,
  PeriodType,
  Quirk,
  QUIRKS_FT2,
  ReadEventType,
  SampleFlags,
  XMP_KEY_OFF,
} from '@modplayjs/core';
import {
  EMPTY_EVENT,
  type Channel,
  type Envelope,
  type Event,
  type Instrument,
  type Pattern,
  type RawSample,
  type SubInstrument,
  type Track,
  type ChannelState,
} from '@modplayjs/core';
import {
  DecodeFlag,
} from '@modplayjs/core';
import {
  EX_FINETUNE,
  FX,
  FX_PANSL_NOMEM,
  FX_REVERSE,
  FX_SURROUND,
  FX_VOLSLIDE_2,
  FX_XF_PORTA,
} from '@modplayjs/core';
import { EX_F_VSLIDE_DN, EX_F_VSLIDE_UP } from '@modplayjs/core';
import { LSN, MSN, readEventFt2, TEST_NOTE, NoteFlag, SET_NOTE } from '@modplayjs/effects-shared';
import { StbVorbis } from 'stb-vorbis';

// ---------------------------------------------------------------------------
// Constants (xm.h)
// ---------------------------------------------------------------------------

// XM event flags (xm.h:4-10).
const XM_EVENT_PACKING = 0x80;
const XM_EVENT_NOTE_FOLLOWS = 0x01;
const XM_EVENT_INSTRUMENT_FOLLOWS = 0x02;
const XM_EVENT_VOLUME_FOLLOWS = 0x04;
const XM_EVENT_FXTYPE_FOLLOWS = 0x08;
const XM_EVENT_FXPARM_FOLLOWS = 0x10;

// XM sample type bits (xm.h:11-21).
const XM_LINEAR_PERIOD_MODE = 0x01;
const XM_LOOP_FORWARD = 1;
const XM_LOOP_PINGPONG = 2;
const XM_SAMPLE_16BIT = 0x10;
const XM_SAMPLE_STEREO = 0x20;

// Packed structure sizes (xm_load.c:334-335).
const XM_INST_HEADER_SIZE = 29;
const XM_INST_SIZE = 212;

/** grass.near.the.house.xm defines 23 samples (issue #168). */
const XM_MAX_SAMPLES_PER_INST = 32;

/** XMP_MAX_CHANNELS (xmp.h:132). */
const XMP_MAX_CHANNELS = 64;
/** MAX_SAMPLE_SIZE (common.h:460). */
const MAX_SAMPLE_SIZE = 0x10000000;
/** MAGIC4('O','g','g','S') (xm_load.c:395). */
const MAGIC_OGGS = 0x4f676753;

/** libxmp_copy_adjust (common.c:237-253): printable ASCII, pad '.'. */
function copyAdjust(r: Uint8Array, n: number): string {
  let s = '';
  for (let i = 0; i < n && i < r.length; i++) {
    const c = r[i]!;
    s += c > 127 || c < 0x20 || c === 0x7f ? '.' : String.fromCharCode(c);
  }
  return s.replace(/ +$/, '');
}

function readmem16l(m: Uint8Array, off: number): number {
  return (m[off]! | (m[off + 1]! << 8)) >>> 0;
}

function readmem32l(m: Uint8Array, off: number): number {
  return (
    (m[off]! | (m[off + 1]! << 8) | (m[off + 2]! << 16) | (m[off + 3]! << 24)) >>> 0
  );
}

/** readmem32b (dataio.c). */
function readmem32b(m: Uint8Array, off: number): number {
  return (
    ((m[off]! << 24) | (m[off + 1]! << 16) | (m[off + 2]! << 8) | m[off + 3]!) >>> 0
  );
}

// ---------------------------------------------------------------------------
// xm_test (xm_load.c:66-79)
// ---------------------------------------------------------------------------

export function xmTest(bytes: Uint8Array): boolean {
  // hio_read(buf, 1, 17) — "Extended Module: " ID text.
  if (bytes.length < 17) return false;
  for (let i = 0; i < 17; i++) {
    if (bytes[i] !== 'Extended Module: '.charCodeAt(i)) return false;
  }
  // libxmp_read_title(t, 20) — no failure path.
  return true;
}

// ---------------------------------------------------------------------------
// load_xm_pattern (xm_load.c:81-277)
// ---------------------------------------------------------------------------

const XM_FT2_EVENT_FXT_BLACKLIST = new Set([18, 19, 22, 23, 24, 26, 28, 30, 31, 32]);

/**
 * Decode one XM pattern into `tracks` (mod->xxp[num] after
 * libxmp_alloc_pattern_tracks with r rows). `patbuf` is the raw pattern
 * data region of the file (zero-padded to datasize by the caller);
 * `patOff` is where the packed data starts.
 */
function loadXmPattern(
  mod: { chn: number },
  version: number,
  patbuf: Uint8Array,
  patStart: number,
  pattern: Pattern,
  bytes: Uint8Array,
  fileSize: number,
): void {
  const headsize = version > 0x0102 ? 9 : 8;

  // Pattern header (xm_load.c:91-98)
  let pos = patStart;
  const xphLength = readmem32l(bytes, pos);
  pos += 4;
  // xph.packing = hio_read8 — unused beyond read
  pos += 1;
  const xphRows = version > 0x0102 ? readmem16l(bytes, pos) : bytes[pos]! + 1;
  pos += version > 0x0102 ? 2 : 1;

  // Sanity check (xm_load.c:100-103)
  if (xphRows > 256) {
    throw new ParseError('XM: bad pattern rows');
  }

  const xphDatasize = readmem16l(bytes, pos);
  pos += 2;
  // hio_seek(xph.length - headsize, SEEK_CUR) — skip to packed data.
  pos += xphLength - headsize;
  if (pos > fileSize) {
    throw new ParseError('XM: pattern seek past EOF');
  }

  let r = xphRows;
  if (r === 0) {
    r = 0x100;
  }

  // libxmp_alloc_pattern_tracks(mod, num, r): sets xxp->rows = r and
  // allocates r-row tracks for each channel.
  pattern.rows = r;
  const tracks = pattern.tracks;
  for (const tr of tracks) {
    const events: Event[] = [];
    for (let i = 0; i < r; i++) events.push({ ...EMPTY_EVENT });
    tr.rows = r;
    tr.event = events;
  }

  if (xphDatasize === 0) {
    return;
  }

  // Read pattern data into a zero-padded 64K patbuf (xm_load.c:313-321).
  // C reads datasize bytes; short read zero-fills. We take a window view
  // over the file limited by datasize, zero-padding via bounds checks.
  const size0 = xphDatasize;
  const avail = Math.min(size0, fileSize - pos);
  const patbufView = bytes.subarray(pos, pos + avail);

  let size = size0;
  let p = 0; // index into patbuf (C: pat pointer)
  const rd = (): number => {
    const v = p < patbufView.length ? patbufView[p]! : 0;
    p++;
    return v;
  };

  const dummy: Event = { ...EMPTY_EVENT };

  for (let j = 0; j < r; j++) {
    for (let k = 0; k < mod.chn; k++) {
      // Some XMs have cleanly truncated patterns (xm_load.c:114-127).
      if (p === size0) {
        return; // early_pattern_end
      }

      const event = k >= tracks.length ? dummy : tracks[k]!.event[j]!;

      if (--size < 0) {
        throw new ParseError('XM: pattern data overrun');
      }

      const b = rd();

      if (b & XM_EVENT_PACKING) {
        if (b & XM_EVENT_NOTE_FOLLOWS) {
          if (--size < 0) throw new ParseError('XM: pattern data overrun');
          event.note = rd();
        }
        if (b & XM_EVENT_INSTRUMENT_FOLLOWS) {
          if (--size < 0) throw new ParseError('XM: pattern data overrun');
          event.ins = rd();
        }
        if (b & XM_EVENT_VOLUME_FOLLOWS) {
          if (--size < 0) throw new ParseError('XM: pattern data overrun');
          event.vol = rd();
        }
        if (b & XM_EVENT_FXTYPE_FOLLOWS) {
          if (--size < 0) throw new ParseError('XM: pattern data overrun');
          event.fxt = rd();
        }
        if (b & XM_EVENT_FXPARM_FOLLOWS) {
          if (--size < 0) throw new ParseError('XM: pattern data overrun');
          event.fxp = rd();
        }
      } else {
        size -= 4;
        if (size < 0) throw new ParseError('XM: pattern data overrun');
        event.note = b;
        event.ins = rd();
        event.vol = rd();
        event.fxt = rd();
        event.fxp = rd();
      }

      // Sanity check (xm_load.c:180-199)
      if (XM_FT2_EVENT_FXT_BLACKLIST.has(event.fxt)) {
        event.fxt = 0;
      }
      if (event.fxt > 34) {
        event.fxt = 0;
      }

      if (event.note === 0x61) {
        event.note = XMP_KEY_OFF;
      } else if (event.note > 0) {
        event.note += 12;
      }

      if (event.fxt === 0x0e) {
        if (MSN(event.fxp) === EX_FINETUNE) {
          const val = (LSN(event.fxp) - 8) & 0xf;
          event.fxp = (EX_FINETUNE << 4) | val;
        }
        switch (event.fxp) {
          case 0x43:
          case 0x73:
            event.fxp--;
            break;
        }
      }
      if (event.fxt === FX_XF_PORTA && MSN(event.fxp) === 0x09) {
        // Translate MPT hacks (xm_load.c:215-228)
        switch (LSN(event.fxp)) {
          case 0x0: // Surround off
          case 0x1: // Surround on
            event.fxt = FX_SURROUND;
            event.fxp = LSN(event.fxp);
            break;
          case 0xe: // Play forward
          case 0xf: // Play reverse
            event.fxt = FX_REVERSE;
            event.fxp = LSN(event.fxp) - 0xe;
            break;
        }
      }

      if (event.vol === 0) {
        continue;
      }

      // Volume set (xm_load.c:236-242)
      if (event.vol >= 0x10 && event.vol <= 0x50) {
        event.vol -= 0x0f;
        continue;
      }

      // Volume column effects (xm_load.c:244-275)
      switch (event.vol >> 4) {
        case 0x06: // Volume slide down
          event.f2t = FX_VOLSLIDE_2;
          event.f2p = event.vol - 0x60;
          break;
        case 0x07: // Volume slide up
          event.f2t = FX_VOLSLIDE_2;
          event.f2p = (event.vol - 0x70) << 4;
          break;
        case 0x08: // Fine volume slide down
          event.f2t = FX.FX_EXTENDED;
          event.f2p = (EX_F_VSLIDE_DN << 4) | (event.vol - 0x80);
          break;
        case 0x09: // Fine volume slide up
          event.f2t = FX.FX_EXTENDED;
          event.f2p = (EX_F_VSLIDE_UP << 4) | (event.vol - 0x90);
          break;
        case 0x0a: // Set vibrato speed
          event.f2t = FX.FX_VIBRATO;
          event.f2p = (event.vol - 0xa0) << 4;
          break;
        case 0x0b: // Vibrato
          event.f2t = FX.FX_VIBRATO;
          event.f2p = event.vol - 0xb0;
          break;
        case 0x0c: // Set panning
          event.f2t = FX.FX_SETPAN;
          event.f2p = (event.vol - 0xc0) << 4;
          break;
        case 0x0d: // Pan slide left
          event.f2t = FX_PANSL_NOMEM;
          event.f2p = (event.vol - 0xd0) << 4;
          break;
        case 0x0e: // Pan slide right
          event.f2t = FX_PANSL_NOMEM;
          event.f2p = event.vol - 0xe0;
          break;
        case 0x0f: // Tone portamento
          event.f2t = FX.FX_TONEPORTA;
          event.f2p = (event.vol - 0xf0) << 4;
          break;
      }
      event.vol = 0;
    }
  }
  void patbuf;
}

// ---------------------------------------------------------------------------
// load_patterns (xm_load.c:279-330)
// ---------------------------------------------------------------------------

function loadPatterns(
  mod: ModuleData,
  version: number,
  bytes: Uint8Array,
  pos: number,
): number {
  // mod->pat++ then init_pattern: one extra pattern allocated.
  const patCount = mod.pat;
  mod.pat = patCount + 1;

  const patterns: Pattern[] = [];
  // Pre-create pattern shells with 64-row tracks (alloc_pattern default);
  // load_xm_pattern resizes to its own row count.
  for (let i = 0; i < patCount + 1; i++) {
    const tracks: Track[] = [];
    for (let c = 0; c < mod.chn; c++) {
      const events: Event[] = [];
      for (let rr = 0; rr < 64; rr++) events.push({ ...EMPTY_EVENT });
      tracks.push({ rows: 64, event: events });
    }
    patterns.push({ rows: 64, tracks });
  }

  const patbuf = new Uint8Array(65536); // calloc'd scratch (xm_load.c:309)
  void patbuf;

  let p = pos;
  for (let i = 0; i < patCount; i++) {
    loadXmPattern(mod, version, patbuf, p, patterns[i]!, bytes, bytes.length);
    // Advance past this pattern: header (length field) + datasize.
    // Recompute the same way load_xm_pattern's C caller consumed the file:
    // hio reads sequentially; pattern header length tells the skip.
    // C file pointer after load_xm_pattern: pattern start + xph.length
    // (header read) + xph.datasize (data read).
    const phLength = readmem32l(bytes, p);
    const dsOff = version > 0x0102 ? 7 : 6;
    const ds = readmem16l(bytes, p + dsOff);
    p += phLength + ds;
  }

  // Alloc one extra pattern (xm_load.c:318-329): all tracks point at one
  // shared empty 64-row track.
  {
    const t = patCount * mod.chn;
    const extra: Track = { rows: 64, event: [] };
    for (let rr = 0; rr < 64; rr++) extra.event.push({ ...EMPTY_EVENT });
    patterns[patCount]!.rows = 64;
    patterns[patCount]!.tracks = [];
    for (let j = 0; j < mod.chn; j++) {
      patterns[patCount]!.tracks.push(extra);
    }
    void t;
  }

  mod.patterns = patterns;
  return p;
}

// ---------------------------------------------------------------------------
// Ogg Vorbis sample decode (xm_load.c:397-457)
// ---------------------------------------------------------------------------

/** is_ogg_sample (xm_load.c:355-372). len = xxs->len (post-halving). */
function isOggSample(bytes: Uint8Array, pos: number, len: number): boolean {
  // Sample must be at least 4 bytes long to be an OGG sample.
  // Bonnie's Bookstore music.oxm contains zero length samples followed
  // immediately by OGG samples.
  if (len < 4) return false;
  if (pos + 8 > bytes.length) return false;
  // size = hio_read32l(f); id = hio_read32b(f) — id at pos+4, big-endian.
  const id = readmem32b(bytes, pos + 4);
  return id === MAGIC_OGGS;
}

/**
 * oggdec (xm_load.c:374-421): decode via bundled stb-vorbis. Returns the
 * byte buffer libxmp_load_sample would consume with SAMPLE_FLAG_NOLOAD and
 * the resulting xxs->len. flg is the decoded xxs->flg (BITS16/STEREO).
 */
function oggDecode(
  bytes: Uint8Array,
  pos: number,
  len: number,
  flg: number,
): { pcm: Uint8Array; frames: number } {
  // hio_read32b(f) skips the size dword; data = next len-4 bytes.
  const data = bytes.subarray(pos + 4, pos + len);
  const decoded = StbVorbis.decode(data);
  // C: stb_vorbis_decode_memory → interleaved s16; ch != 1 → error.
  if (decoded.channels.length !== 1) {
    throw new ParseError('XM: Ogg sample is not mono');
  }
  const pcm16 = decoded.channels[0]!;
  let n = pcm16.length;

  const is16bit = (flg & SampleFlags.BITS16) !== 0;
  if (!is16bit && n > 0) {
    // 8-bit: take the high byte of each s16 frame.
    const pcm = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      pcm[i] = (Math.round(pcm16[i]! * 32768) >> 8) & 0xff;
    }
    if ((flg & SampleFlags.STEREO) !== 0) {
      // OXM stereo is a single channel non-interleaved stream.
      n >>= 1;
    }
    return { pcm, frames: n };
  }

  const pcm = new Uint8Array(n * 2);
  const dv = new DataView(pcm.buffer);
  for (let i = 0; i < n; i++) {
    dv.setInt16(i * 2, Math.round(pcm16[i]! * 32768) | 0, true);
  }
  if ((flg & SampleFlags.STEREO) !== 0) {
    n >>= 1;
  }
  return { pcm, frames: n };
}

// ---------------------------------------------------------------------------
// load_instruments (xm_load.c:433-760)
// ---------------------------------------------------------------------------

interface XmSampleHeader {
  length: number;
  loopStart: number;
  loopLength: number;
  volume: number;
  finetune: number;
  type: number;
  pan: number;
  relnote: number;
  reserved: number;
  name: Uint8Array;
}

/** Zeroed envelope (calloc parity). */
function zeroEnvelope(): Envelope {
  return { flags: 0, npt: 0, scl: 0, sus: 0, sue: 0, lps: 0, lpe: 0, x: [], y: [] };
}

function loadInstruments(
  mod: ModuleData,
  version: number,
  bytes: Uint8Array,
  startPos: number,
  ctx: LoadCtx,
): { endPos: number; mptInsHeaders: number } {
  let mptInsHeaders = 0;
  const instruments: Instrument[] = [];
  // Sample store: sid = running sample_num (C mod->xxs[sample_num]).
  const rawSamples: RawSample[] = [];
  let sampleNum = 0;
  let pos = startPos;

  for (let i = 0; i < mod.ins; i++) {
    const instrPos = pos;

    // hio_read(buf, XM_INST_HEADER_SIZE + 4, 1) — short read breaks the
    // loop (xm_load.c:465-471): modules truncated mid-file keep earlier
    // instruments.
    if (pos + XM_INST_HEADER_SIZE + 4 > bytes.length) {
      break;
    }
    const buf = bytes.subarray(pos, pos + XM_INST_HEADER_SIZE + 4);

    let yWave = 0;
    let ySweep = 0;
    let yDepth = 0;
    let yRate = 0;

    const xihSize = readmem32l(buf, 0);
    const xihName = buf.subarray(4, 26);
    // xih.type = buf[26] — always 0
    const xihSamples = readmem16l(buf, 27);
    const xihShSize = readmem32l(buf, 29);

    // Sanity check (xm_load.c:478-487)
    if (xihSize < XM_INST_HEADER_SIZE) {
      throw new ParseError(`XM: instrument ${i + 1}: header size ${xihSize}`);
    }
    if (xihSamples > XM_MAX_SAMPLES_PER_INST || (xihSamples > 0 && xihShSize > 0x100)) {
      throw new ParseError(`XM: instrument ${i + 1}: samples ${xihSamples} sh_size ${xihShSize}`);
    }

    // Modplug Tracker tell (xm_load.c:490-496)
    if (xihSize === 0x107 && xihSamples === 0 && xihShSize === 0) {
      mptInsHeaders = 1;
    }

    const name = copyAdjust(xihName, 22);

    const xxi: Instrument = {
      name,
      volume: 0x40,
      nsm: xihSamples,
      rls: 0,
      map: new Array<number>(121).fill(0xff),
      mapXpo: new Array<number>(121).fill(0),
      sub: [],
      aei: zeroEnvelope(),
      fei: zeroEnvelope(),
      pei: zeroEnvelope(),
    };

    if (xihSamples === 0) {
      // Reserved data space after header even with 0 samples
      // (xm_load.c:504-520): hio_seek(xih.size - (29 + 4), SEEK_CUR) — a
      // RELATIVE seek from the stream position, which in C is already past
      // the 33-byte header read. C allows it to go NEGATIVE when
      // xih.size < 33 (ABAKUS Indian Mission instrument 3, size 29):
      // net advance = instrPos + xihSize. Clamping the negative part to
      // zero advanced the stream +4 per such instrument, landing every
      // later instrument header on garbage ('header size 0').
      pos = instrPos + xihSize;
      instruments.push(xxi);
      continue;
    }

    // Subinstrument slots (libxmp_alloc_subinstrument).
    const subs: SubInstrument[] = [];
    for (let j = 0; j < xihSamples; j++) {
      subs.push({
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
      });
    }
    xxi.sub = subs;

    // BoobieSqueezer: stripped instrument data (xm_load.c:534-538).
    if (xihSize < XM_INST_HEADER_SIZE + XM_INST_SIZE) {
      // memset(&xi, 0, ...) + seek past declared size.
      pos += xihSize - (XM_INST_HEADER_SIZE + 4);
      pos += XM_INST_HEADER_SIZE + 4;
      // xi is all-zero: envelopes off, maps 0.
      for (let j = 12; j < 108; j++) {
        const v = 0;
        xxi.map[j] = v >= xxi.nsm ? 0xff : v;
      }
    } else {
      // Full instrument data: 208 bytes (xm_load.c:540-577).
      if (pos + XM_INST_HEADER_SIZE + 4 + 208 > bytes.length) {
        throw new ParseError('XM: short read in instrument data');
      }
      const b = bytes.subarray(pos + XM_INST_HEADER_SIZE + 4, pos + XM_INST_HEADER_SIZE + 4 + 208);

      const sample: number[] = [];
      for (let j = 0; j < 96; j++) sample.push(b[j]!);
      let o = 96;
      const vEnv: number[] = [];
      for (let j = 0; j < 24; j++) {
        vEnv.push(readmem16l(b, o));
        o += 2;
      }
      const pEnv: number[] = [];
      for (let j = 0; j < 24; j++) {
        pEnv.push(readmem16l(b, o));
        o += 2;
      }
      const vPts = b[o]!;
      o += 1;
      const pPts = b[o]!;
      o += 1;
      const vSus = b[o]!;
      o += 1;
      const vStart = b[o]!;
      o += 1;
      const vEnd = b[o]!;
      o += 1;
      const pSus = b[o]!;
      o += 1;
      const pStart = b[o]!;
      o += 1;
      const pEnd = b[o]!;
      o += 1;
      const vType = b[o]!;
      o += 1;
      const pType = b[o]!;
      o += 1;
      yWave = b[o]!;
      o += 1;
      ySweep = b[o]!;
      o += 1;
      yDepth = b[o]!;
      o += 1;
      yRate = b[o]!;
      o += 1;
      const vFade = readmem16l(b, o);
      o += 2;
      void o;

      // Skip reserved space to the declared size (xm_load.c:579-582).
      // File consumed: 33-byte header + 208-byte body = 29+212 = 241.
      pos += XM_INST_HEADER_SIZE + 4 + 208;
      pos += Math.max(0, xihSize - (XM_INST_HEADER_SIZE + XM_INST_SIZE));

      // Envelope (xm_load.c:584-615)
      xxi.rls = vFade << 1;
      xxi.aei.npt = vPts;
      xxi.aei.sus = vSus;
      xxi.aei.lps = vStart;
      xxi.aei.lpe = vEnd;
      xxi.aei.flags = vType;
      xxi.pei.npt = pPts;
      xxi.pei.sus = pSus;
      xxi.pei.lps = pStart;
      xxi.pei.lpe = pEnd;
      xxi.pei.flags = pType;

      if (xxi.aei.npt <= 0 || xxi.aei.npt > 12) {
        xxi.aei.flags &= ~1; // XMP_ENVELOPE_ON
      } else {
        for (let j = 0; j < xxi.aei.npt; j++) {
          xxi.aei.x.push(vEnv[j * 2]!);
          xxi.aei.y.push(vEnv[j * 2 + 1]!);
        }
      }

      if (xxi.pei.npt <= 0 || xxi.pei.npt > 12) {
        xxi.pei.flags &= ~1;
      } else {
        for (let j = 0; j < xxi.pei.npt; j++) {
          xxi.pei.x.push(pEnv[j * 2]!);
          xxi.pei.y.push(pEnv[j * 2 + 1]!);
        }
      }

      // Note map (xm_load.c:617-622)
      for (let j = 12; j < 108; j++) {
        let v = sample[j - 12]!;
        if (v >= xxi.nsm) v = 0xff;
        xxi.map[j] = v;
      }
    }

    // Read subinstrument and sample parameters (xm_load.c:625-718)
    const xsh: XmSampleHeader[] = [];
    for (let j = 0; j < xxi.nsm; j++, sampleNum++) {
      const sub = xxi.sub[j]!;

      if (pos + 40 > bytes.length) {
        throw new ParseError('XM: short read in sample data');
      }
      const sb = bytes.subarray(pos, pos + 40);
      pos += 40;

      const length = readmem32l(sb, 0);
      if (length > MAX_SAMPLE_SIZE) {
        throw new ParseError(`XM: sample ${j}: bad sample size`);
      }
      const loopStart = readmem32l(sb, 4);
      const loopLength = readmem32l(sb, 8);
      const volume = sb[12]!;
      const finetune = (sb[13]! << 24) >> 24; // int8
      const type = sb[14]!;
      const pan = sb[15]!;
      const relnote = (sb[16]! << 24) >> 24; // int8
      const reserved = sb[17]!;
      const sname = sb.subarray(18, 40);

      xsh.push({ length, loopStart, loopLength, volume, finetune, type, pan, relnote, reserved, name: sname });

      sub.vol = volume;
      sub.pan = pan;
      sub.xpo = relnote;
      sub.fin = finetune;
      // C reads xi.y_wave/y_sweep/y_depth/y_rate (xm_load.c:646-649) —
      // zero when the instrument header was stripped (BoobieSqueezer).
      sub.vwf = yWave;
      sub.vde = yDepth << 2;
      sub.vra = yRate;
      sub.vsw = ySweep;
      sub.sid = sampleNum;

      const raw: RawSample = {
        // C: libxmp_copy_adjust(xxs->name, xi.name, 22) — the sample name is
        // the instrument name in XM (xm_load.c:708).
        name,
        data: new Uint8Array(0),
        length,
        loopStart,
        loopEnd: loopStart + loopLength,
        sustainStart: 0,
        sustainEnd: 0,
        finetune,
        volume,
        flags: 0,
        c5spd: C4_NTSC_RATE,
      };

      // xxs->flg (xm_load.c:687-707)
      let flg = 0;
      let len = length;
      let lps = loopStart;
      let lpe = loopStart + loopLength;
      if (type & XM_SAMPLE_16BIT) {
        flg |= SampleFlags.BITS16;
        len >>= 1;
        lps >>= 1;
        lpe >>= 1;
      }
      if (type & XM_SAMPLE_STEREO) {
        flg |= SampleFlags.STEREO;
        len >>= 1;
        lps >>= 1;
        lpe >>= 1;
      }
      flg |= type & XM_LOOP_FORWARD ? SampleFlags.LOOP : 0;
      flg |= type & XM_LOOP_PINGPONG ? SampleFlags.LOOP | SampleFlags.BIDIR : 0;

      raw.flags = flg;
      raw.length = len;
      raw.loopStart = lps;
      raw.loopEnd = lpe;

      rawSamples.push(raw);
      // C: xxs->len is halved (len above) but xsh[j].length keeps the RAW
      // in-file length — used by oggdec and the total_sample_size sum.
    }

    // Read actual sample data (xm_load.c:721-757)
    let totalSampleSize = 0;
    for (let j = 0; j < xxi.nsm; j++) {
      const sub = xxi.sub[j]!;
      const raw = rawSamples[sub.sid]!;
      const sh = xsh[j]!;

      let flags = DecodeFlag.DIFF;
      if (sh.reserved === 0xad) {
        flags = DecodeFlag.ADPCM;
      }

      if (version > 0x0103) {
        const dataPos = pos;
        if (isOggSample(bytes, dataPos, raw.length)) {
          // oggdec: reads xsh[j].length raw bytes, sets xxs->len = n frames.
          const { pcm, frames } = oggDecode(bytes, dataPos, sh.length, raw.flags);
          raw.data = pcm;
          raw.length = frames;
          raw.flags = raw.flags & ~DecodeFlag.DIFF; // NOLOAD: raw PCM
          totalSampleSize += sh.length;
          pos += sh.length;
          continue;
        }

        // libxmp_load_sample(m, f, flags, xxs, NULL): reads bytelen =
        // xxs->len * framesize bytes, EOF zero-fills (sample.c:218-228,
        // 355-360). xxs->len is the post-halving frame count, so bytelen
        // equals the raw in-file byte length (sh.length) — except odd
        // 16-bit lengths, fixed by the reposition below.
        const framelen = (raw.flags & SampleFlags.BITS16 ? 2 : 1) * (raw.flags & SampleFlags.STEREO ? 2 : 1);
        const bytelen = raw.length * framelen;
        const take = Math.max(0, Math.min(bytelen, bytes.length - dataPos));
        raw.data = bytes.subarray(dataPos, dataPos + take);
        raw.flags = raw.flags | flags;
        if (flags & DecodeFlag.ADPCM) {
          totalSampleSize += 16 + ((sh.length + 1) >> 1);
        } else {
          totalSampleSize += sh.length;
        }
        pos += bytelen;
      }
    }

    // Reposition for odd 16-bit in-file length (xm_load.c:759-763).
    pos = instrPos + xihSize + 40 * xihSamples + totalSampleSize;

    instruments.push(xxi);
  }

  // Final sample number adjustment (xm_load.c:766-769): mod->smp = sampleNum.
  // Register every collected raw sample; store ids == sid == array index.
  for (const raw of rawSamples) {
    ctx.addSample(raw);
  }

  mod.instruments = instruments;
  mod.samples = rawSamples;
  return { endPos: pos, mptInsHeaders };
}

// ---------------------------------------------------------------------------
// xm_load (xm_load.c:762-1024)
// ---------------------------------------------------------------------------

export function xmLoad(bytes: Uint8Array, ctx: LoadCtx): ModuleData {
  const size = bytes.length;
  const fail = (msg: string): never => {
    throw new ParseError(msg);
  };

  // hio_read(buf, 80, 1) (xm_load.c:776-779)
  if (size < 80) fail('XM: short header');

  // ID text at 0 (17 bytes), name at 17 (20), 0x1a at 37,
  // tracker at 38 (20), version at 58, headersz at 60.
  const version = readmem16l(bytes, 58);
  const headersz = readmem32l(bytes, 60);
  const songlen = readmem16l(bytes, 64);
  const restart = readmem16l(bytes, 66);
  const channels = readmem16l(bytes, 68);
  const patterns = readmem16l(bytes, 70);
  const instruments = readmem16l(bytes, 72);
  const flags = readmem16l(bytes, 74);
  const tempo = readmem16l(bytes, 76);
  const bpm = readmem16l(bytes, 78);

  // Sanity checks (xm_load.c:807-829)
  if (songlen > 256) fail(`XM: bad song length ${songlen}`);
  if (patterns > 256) fail(`XM: bad pattern count ${patterns}`);
  if (instruments > 255) fail(`XM: bad instrument count ${instruments}`);
  if (channels > XMP_MAX_CHANNELS) fail(`XM: bad channel count ${channels}`);

  // FT2/MPT allow 255 BPM; OpenMPT 1000 (xm_load.c:832-838).
  const tracker = bytes.subarray(38, 58);
  const isMed2xm = (() => {
    for (let i = 0; i < 6; i++) {
      if (tracker[i] !== 'MED2XM'.charCodeAt(i)) return false;
    }
    return true;
  })();
  if (tempo >= 32 || bpm < 32 || bpm > 1000) {
    if (!isMed2xm) {
      fail(`XM: bad tempo or BPM ${tempo} ${bpm}`);
    }
  }

  // Honor header size — BoobieSqueezer (xm_load.c:841-847)
  const len = headersz - 0x14;
  if (len < 0 || len > 256) {
    fail(`XM: bad XM header length ${len}`);
  }

  // Order table (xm_load.c:849-852): read AFTER the 80-byte fixed header.
  if (80 + len > size) fail('XM: error reading orders');
  const order = bytes.subarray(80, 80 + len);

  // Title: 20 bytes at 17 (C strncpy of xfh.name).
  const titleBytes = bytes.subarray(17, 37);
  let title = '';
  {
    // strncpy stops at NUL; C copies raw bytes incl. NULs. Module names
    // display: take up to 20 bytes, stop at first NUL.
    for (let i = 0; i < 20 && i < titleBytes.length; i++) {
      const c = titleBytes[i]!;
      if (c === 0) break;
      title += String.fromCharCode(c);
    }
  }

  const mod: ModuleData = {
    title,
    format: 'xm',
    comment: '',
    chn: channels,
    pat: patterns,
    ins: instruments,
    len: songlen,
    restart: restart >= songlen ? 0 : restart,
    xxo: Array.from(order.subarray(0, songlen)),
    channels: [],
    patterns: [],
    instruments: [],
    samples: [],
    num_sequences: 0,
    sequences: [],
    speed: tempo,
    bpm,
    volbase: 0x40,
    gvolbase: 0x40,
    gvol: 0x40,
    quirks: 0,
    flowMode: FLOW_MODE_GENERIC,
    readEventType: ReadEventType.FT2,
    periodType: flags & XM_LINEAR_PERIOD_MODE ? PeriodType.LINEAR : PeriodType.AMIGA,
    defpan: 0x80,
    time_factor: 10,
    rrate: 250,
    c4rate: C4_NTSC_RATE,
    tracker: '',
  };

  // Tracker name cleanup (xm_load.c:864-872): snprintf %-20.20s then trim
  // trailing spaces from the end.
  let trackerName = '';
  for (let i = 0; i < 20; i++) {
    trackerName += String.fromCharCode(tracker[i] ?? 0x20);
  }
  trackerName = trackerName.slice(0, 20);
  // Trim trailing spaces (C loop replaces 0x20 with 0 from the end).
  let end = 20;
  while (end > 0 && trackerName[end - 1] === ' ') end--;
  trackerName = trackerName.slice(0, end);
  // C's snprintf pads with spaces then the loop null-terminates runs of
  // trailing spaces — embedded NULs in the tracker field already ended the
  // string in our JS build (String.fromCharCode(0) kept); trim at first NUL:
  {
    const nul = trackerName.indexOf('\0');
    if (nul >= 0) trackerName = trackerName.slice(0, nul);
  }

  const claimsFt2 = (() => {
    // strncmp(tracker_name, "FastTracker v2.00", 17)
    let m = true;
    for (let i = 0; i < 17; i++) {
      if (trackerName[i] !== 'FastTracker v2.00'[i]) { m = false; break; }
    }
    return m;
  })();

  let quirk = 0;
  let isMptOld = false;
  let isMpt116 = false;
  let mptInsHeaders = 0;

  if (claimsFt2) {
    quirk |= Quirk.FT2BUGS;
  } else if (trackerName.startsWith('Fasttracker II clone')) {
    quirk |= Quirk.FT2BUGS;
  } else if (trackerName.startsWith('OpenMPT ')) {
    // OpenMPT accurately emulates weird FT2 bugs
    quirk |= Quirk.FT2BUGS;
  }

  if (headersz === 0x0113) {
    trackerName = 'unknown tracker';
    quirk &= ~Quirk.FT2BUGS;
  } else if (trackerName.length === 0) {
    trackerName = 'Digitrakker'; // best guess
    quirk &= ~Quirk.FT2BUGS;
  }

  if (trackerName.startsWith('MED2XM by J.Pynnone')) {
    if (mod.bpm <= 10) {
      mod.bpm = Math.trunc((125 * (0x35 - mod.bpm * 2)) / 33);
    }
    quirk &= ~Quirk.FT2BUGS;
  }

  if (trackerName.startsWith('FastTracker v 2.00')) {
    trackerName = 'old ModPlug Tracker';
    quirk &= ~Quirk.FT2BUGS;
    isMptOld = true;
  }

  let flowMode = FLOW_MODE_GENERIC;
  if (trackerName === 'Skale Tracker' || trackerName === 'Sk@le Tracker') {
    // Skale Tracker allows Dxx Byy to jump to row X.
    flowMode |= (1 << 30); // FLOW_JUMP_NO_ROW_SET
  }

  const type = `${trackerName} XM ${version >> 8}.${String(version & 0xff).padStart(2, '0')}`;

  // Honor header size; then patterns/instruments order depends on version
  // (xm_load.c:895-919). File position after 80-byte header + len order
  // bytes = 80 + len = 60 + headersz (headersz = len + 0x14).
  let pos = 80 + len;

  if (version <= 0x0103) {
    const r = loadInstruments(mod, version, bytes, pos, ctx);
    mptInsHeaders = r.mptInsHeaders;
    pos = loadPatterns(mod, version, bytes, r.endPos);
  } else {
    pos = loadPatterns(mod, version, bytes, pos);
    const r = loadInstruments(mod, version, bytes, pos, ctx);
    mptInsHeaders = r.mptInsHeaders;
    pos = r.endPos;
  }

  // XM 1.02 stores all samples after the patterns (xm_load.c:921-930) —
  // sample data already read inline by loadInstruments; version<=0x0103
  // skips the data read (C: `if (version > 0x0103)` guard) and reads it
  // here. Our loadInstruments only reads data for version > 0x0103, so
  // handle 1.02 data here.
  if (version <= 0x0103) {
    let p2 = pos;
    for (let i = 0; i < mod.ins; i++) {
      const xxi = mod.instruments[i];
      if (!xxi) continue;
      for (let j = 0; j < xxi.nsm; j++) {
        const sid = xxi.sub[j]!.sid;
        const raw = mod.samples[sid]!;
        const framelen = (raw.flags & SampleFlags.BITS16 ? 2 : 1) * (raw.flags & SampleFlags.STEREO ? 2 : 1);
        // C: length was halved for 16-bit; bytelen uses xxs->len — the
        // stored (halved) length * 2 for 16-bit = original file bytes.
        const bytelen = raw.length * framelen;
        const take = Math.max(0, Math.min(bytelen, bytes.length - p2));
        raw.data = bytes.subarray(p2, p2 + take);
        raw.flags |= DecodeFlag.DIFF;
        p2 += bytelen;
      }
    }
  }

  // MPT extension chunks (xm_load.c:933-1010): 'text' comment, MIDI/PNAM/
  // CNAM/CHFX/XTPM/FX.. known markers.
  {
    let p = pos;
    let claims = claimsFt2;
    while (true) {
      if (p + 8 > size) break;
      const ext = readmem32b(bytes, p);
      const sz = readmem32l(bytes, p + 4);
      if (sz > 0x7fffffff) break;

      let known = false;
      if (ext === 0x74657874 /* 'text' */) {
        known = true;
        // C: if ((int64)sz > hio_size(f)) break — exits the whole loop.
        if (sz > size) break;
        if (mod.comment === '') {
          if (p + 8 + sz <= size) {
            const cb = bytes.subarray(p + 8, p + 8 + sz);
            let s = '';
            for (let i = 0; i < cb.length; i++) {
              const b = cb[i]!;
              if (b === 0x0d) s += '\n';
              else if ((b < 32 || b > 127) && b !== 0x0a && b !== 0x09) s += '.';
              else s += String.fromCharCode(b);
            }
            mod.comment = s;
          }
        }
        // C: hio_read consumed the comment; sz = 0 → no extra seek.
        p += 8 + sz;
      } else if (
        ext === 0x4d494449 /* MIDI */ ||
        ext === 0x504e414d /* PNAM */ ||
        ext === 0x434e414d /* CNAM */ ||
        ext === 0x43484658 /* CHFX */ ||
        ext === 0x5854504d /* XTPM */
      ) {
        known = true;
      } else if ((ext & 0xffff0000) === 0x46580000 /* FX.. */) {
        known = true;
      }

      if (known && claims) isMpt116 = true;

      if (sz && p + 8 + sz > size) break;
      p += 8 + sz;
      if (ext === 0x5854504d /* XTPM */) break;
    }
    void claims;
  }

  if (claimsFt2 && mptInsHeaders) {
    isMpt116 = true;
  }

  if (isMpt116) {
    mod.tracker = `ModPlug Tracker 1.16 XM ${version >> 8}.${String(version & 0xff).padStart(2, '0')}`;
  } else {
    mod.tracker = type;
  }

  if (isMpt116 || isMptOld) {
    quirk &= ~Quirk.FT2BUGS;
    flowMode = FLOW_MODE_MPT_116;
    // mvolbase=48, mvol=48, libxmp_apply_mpt_preamp — ModuleData has no
    // mvol fields yet (T18 wiring, same as S3M); preamp not applied.
  }

  // Channel default pans (xm_load.c:1017-1019)
  const chs: Channel[] = [];
  for (let i = 0; i < mod.chn; i++) {
    chs.push({ pan: 0x80, vol: 0x40, flg: 0 });
  }
  mod.channels = chs;

  quirk |= QUIRKS_FT2 | Quirk.FT2ENV;

  mod.quirks = quirk;
  mod.flowMode = flowMode;
  mod.readEventType = ReadEventType.FT2;

  return mod;
}

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

/** XM format plugin (libxmp loaders/xm_load.c + read_event_ft2). */
export const plugin: FormatPlugin = {
  name: 'xm',
  test: xmTest,
  load: xmLoad,
  readEvent(core: Core, chn: number, row: number): void {
    // libxmp_read_event (read_event.c:1624-1664) prologue + FT2 dispatch
    // (XM modules always dispatch FT2).
    const mod = core.module as ModuleData;
    const xc = core.ctx.channelStates[chn] as ChannelState;
    const e =
      core.readEventScratch(chn) ?? core.readEventAt(mod.xxo[core.ctx.p.ord] ?? 0, chn, row);

    if (e.ins !== 0) xc.old_ins = e.ins;

    if (TEST_NOTE(xc, NoteFlag.SAMPLE_END) !== 0) {
      SET_NOTE(xc, NoteFlag.END);
    }

    readEventFt2(core, e, chn);
  },
};

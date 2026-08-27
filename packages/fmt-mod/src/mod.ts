// MOD loader. Verbatim port of reference/libxmp/src/loaders/mod_load.c
// mod_test (:162-281) and mod_load (:473-1136), non-CORE_PLAYER variant.

import type { Core, LoadCtx, ModuleData } from '@modplayjs/core';
import type { Event } from '@modplayjs/core';
import {
  C4_NTSC_RATE,
  C4_PAL_RATE,
  FLOW_MODE_DTM_2015,
  FLOW_MODE_OCTALYSER,
  PeriodType,
  Quirk,
  QUIRKS_ST3,
  ReadEventType,
} from '@modplayjs/core';
import {
  EMPTY_EVENT,
  type Channel,
  type Instrument,
  type Pattern,
  type RawSample,
  type SubInstrument,
} from '@modplayjs/core';
import { SampleFlags } from '@modplayjs/core';
import { LSN, MSN, PERIOD_BASE } from '@modplayjs/effects-shared';
import { ParseError } from '@modplayjs/core';
import {
  MOD_MAGIC,
  TrackerId,
  flipWordBytes,
  getTrackerId,
  trackerIsVblank,
  validatePattern,
  type ModHeaderView,
  type ModHeaderIns,
} from './tracker.js';

/** SAMPLE_FLAG_* bits handed to the core's normalize (loader.h:10-24). */
const SF_FULLREP = 0x0200;
const SF_ADPCM = 0x4000;

/** XMP_MAX_CHANNELS (xmp.h:132). */
const XMP_MAX_CHANNELS = 64;

/** libxmp_period_to_note (period.c:213-220). */
function periodToNote(p: number): number {
  if (p <= 0) return 0;
  return Math.round(12.0 * Math.log(PERIOD_BASE / p) / Math.LN2) + 1;
}

/** readmem16b (dataio.c:168-175). */
function readmem16b(m: Uint8Array, off: number): number {
  return (m[off]! << 8) | m[off + 1]!;
}

/** isdigit (ASCII). */
function isDigit(c: number): boolean {
  return c >= 0x30 && c <= 0x39;
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

/** Zeroed envelope (libxmp_init_instrument calloc semantics). */
function zeroEnvelope(): Instrument['aei'] {
  return { flags: 0, npt: 0, scl: 0, sus: 0, sue: 0, lps: 0, lpe: 0, x: [], y: [] };
}

function zeroInstrument(name: string, sub: SubInstrument[]): Instrument {
  return {
    name,
    volume: 0x40,
    nsm: 0,
    rls: 0,
    // MOD/S3M maps are calloc'd zeros: key→sub[0] (getSubinstrument).
    map: new Array<number>(121).fill(0),
    mapXpo: new Array<number>(121).fill(0),
    sub,
    aei: zeroEnvelope(),
    fei: zeroEnvelope(),
    pei: zeroEnvelope(),
  };
}

// ---------------------------------------------------------------------------
// Header structs (mod_load.c:32-45)
// ---------------------------------------------------------------------------

interface Header {
  name: string;
  ins: ModHeaderIns[];
  len: number;
  restart: number;
  order: Uint8Array;
}

function readHeader(patbuf: Uint8Array): Header {
  const ins: ModHeaderIns[] = [];
  for (let i = 0; i < 31; i++) {
    const pos = 20 + i * 30;
    ins.push({
      name: String.fromCharCode(...patbuf.subarray(pos, pos + 22)),
      size: readmem16b(patbuf, pos + 22),
      finetune: patbuf[pos + 24]!,
      volume: patbuf[pos + 25]!,
      loop_start: readmem16b(patbuf, pos + 26),
      loop_size: readmem16b(patbuf, pos + 28),
    });
  }
  return {
    name: String.fromCharCode(...patbuf.subarray(0, 20)),
    ins,
    len: patbuf[950]!,
    restart: patbuf[951]!,
    order: patbuf.slice(952, 1080),
  };
}

// ---------------------------------------------------------------------------
// mod_test (mod_load.c:162-281)
// ---------------------------------------------------------------------------

export function modTest(bytes: Uint8Array): boolean {
  // hio_seek(start + 1080); read 4 bytes of magic.
  if (bytes.length < 1084) return false;
  const buf = bytes.subarray(1080, 1084);

  // "##CH" (mod_load.c:174-181)
  if (
    buf[2] === 0x43 /* C */ && buf[3] === 0x48 /* H */ &&
    isDigit(buf[0]!) && isDigit(buf[1]!)
  ) {
    const i = (buf[0]! - 0x30) * 10 + (buf[1]! - 0x30);
    if (i > 0 && i <= 32) return true;
  }

  // "#CHN" (mod_load.c:183-188)
  if (buf[1] === 0x43 && buf[2] === 0x48 && buf[3] === 0x4e && isDigit(buf[0]!)) {
    if (buf[0]! - 0x30 !== 0) return true;
  }

  // mod_magic table (mod_load.c:190-199)
  let detected = 0;
  let id = 0;
  let found = false;
  for (const m of MOD_MAGIC) {
    if (
      buf[0] === m.magic.charCodeAt(0) && buf[1] === m.magic.charCodeAt(1) &&
      buf[2] === m.magic.charCodeAt(2) && buf[3] === m.magic.charCodeAt(3)
    ) {
      detected = m.flag;
      id = m.id;
      found = true;
      break;
    }
  }
  if (!found) return false;

  // Sanity check (mod_load.c:205-231): NoiseRunner etc. with valid magic.
  let smpSize = 0;
  for (let i = 0; i < 31; i++) {
    const pos = 20 + i * 30;
    const patBuf = bytes.subarray(pos, pos + 30);
    if (id === TrackerId.SOFTWAREVISIONS) {
      // flip_word_bytes(pat_buf + 22, 8) — operate on a copy.
      const f = patBuf.slice(0);
      flipWordBytes(f, 30);
      patBuf.set(f.subarray(22, 30), 22);
    }
    smpSize += readmem16b(patBuf, 22) << 1;
    const x = patBuf[24]!;
    // sandman.mod has 0x20 in finetune.
    if ((x & 0xf0) !== 0 && x !== 0x20) return false;
    if (patBuf[25]! > 0x40) return false;
  }

  if (detected) return true; // goto found

  // UNIC checks (mod_load.c:248-280)
  const size = bytes.length;
  let numPat = 0;
  for (let i = 0; i < 128; i++) {
    const x = bytes[952 + i]!;
    if (x > 0x7f) break;
    if (x > numPat) numPat = x;
  }
  numPat++;

  if (1084 + numPat * 0x300 + smpSize === size) return false; // UNIC size match

  let count = 0;
  for (let i = 0; i < numPat; i++) {
    const pbuf = bytes.subarray(1084 + 1024 * i, 1084 + 1024 * i + 1024);
    if (pbuf.length < 1024) return false; // failed to read pattern data
    if (validatePattern(pbuf) < 0) {
      // Allow a few errors, "lexstacy" has 0x52.
      count++;
    }
  }
  if (count > 2) return false;

  return true;
}

// ---------------------------------------------------------------------------
// mod_load (mod_load.c:473-1136)
// ---------------------------------------------------------------------------

interface TrackerState {
  tracker: string;
  trackerId: number;
  ptkloop: number;
}

/** Parse one 4-byte MOD event cell (noisetracker/protracker variants). */
function decodeEvent(dst: Event, modEvent: Uint8Array, off: number, trackerId: number): void {
  // libxmp_decode_noisetracker_event / libxmp_decode_protracker_event
  // (common.c:366-412).
  dst.note = periodToNote((LSN(modEvent[off]!) << 8) | modEvent[off + 1]!);
  dst.ins = (MSN(modEvent[off]!) << 4) | MSN(modEvent[off + 2]!);
  const fxt = LSN(modEvent[off + 2]!);
  if (trackerId === TrackerId.PROBABLY_NOISETRACKER || trackerId === TrackerId.NOISETRACKER) {
    // noisetracker: keep only <=0x06 or (>=0x0a && !=0x0e)
    if (fxt <= 0x06 || (fxt >= 0x0a && fxt !== 0x0e)) {
      dst.fxt = fxt;
      dst.fxp = modEvent[off + 3]!;
    }
  } else {
    // protracker: skip 0x08
    if (fxt !== 0x08) {
      dst.fxt = fxt;
      dst.fxp = modEvent[off + 3]!;
    }
  }
  disableContinueFx(dst);
}

/** libxmp_disable_continue_fx (common.c:414-432). */
function disableContinueFx(ev: Event): void {
  if (ev.fxp === 0) {
    switch (ev.fxt) {
      case 0x05: ev.fxt = 0x03; break;
      case 0x06: ev.fxt = 0x04; break;
      case 0x01:
      case 0x02:
      case 0x0a: ev.fxt = 0x00; break;
    }
  } else if (ev.fxt === 0x0e) {
    if (ev.fxp === 0xa0 || ev.fxp === 0xb0) {
      ev.fxt = 0;
      ev.fxp = 0;
    }
  }
}

export function modLoad(bytes: Uint8Array, ctx: LoadCtx): ModuleData {
  const size = bytes.length;
  const patbuf0 = bytes.subarray(0, 1084);
  if (patbuf0.length < 1084) throw new ParseError('read error in MOD header');

  let magic = '';
  for (let i = 0; i < 4; i++) magic += String.fromCharCode(patbuf0[1080 + i]!);

  let chn = 0;
  let trackerId: number = TrackerId.PROTRACKER;
  let detected = 0;

  for (const m of MOD_MAGIC) {
    if (magic === m.magic) {
      chn = m.ch;
      trackerId = m.id;
      detected = m.flag;
      break;
    }
  }

  // Enable timing detection for M.K. and M!K! modules.
  let needsTimingDetection = 0;
  if (trackerId === TrackerId.PROTRACKER) needsTimingDetection = 1;

  // Digital Tracker MODs have an extra four bytes after the magic.
  // These are always 00h 40h 00h 00h and can probably be ignored.
  if (trackerId === TrackerId.DIGITALTRACKER) {
    // hio_read32b(f) — skip 4 bytes; pattern data starts at 1088.
  }

  if (chn === 0) {
    // "##CH" or "#CHN" (mod_load.c:519-538)
    if (
      magic.charCodeAt(2) === 0x43 && magic.charCodeAt(3) === 0x48 &&
      isDigit(magic.charCodeAt(0)) && isDigit(magic.charCodeAt(1))
    ) {
      chn = (magic.charCodeAt(0) - 0x30) * 10 + (magic.charCodeAt(1) - 0x30);
    } else if (
      magic.charCodeAt(1) === 0x43 && magic.charCodeAt(2) === 0x48 &&
      magic.charCodeAt(3) === 0x4e && isDigit(magic.charCodeAt(0))
    ) {
      chn = magic.charCodeAt(0) - 0x30;
    } else {
      throw new ParseError('MOD: unknown magic');
    }
    trackerId = (chn & 1) !== 0 ? TrackerId.TAKETRACKER : TrackerId.FASTTRACKER2;
    detected = 1;
  }

  const header = readHeader(patbuf0);
  const mh: Header = header;

  // Software Visions DMF word flip (mod_load.c:546-552).
  if (trackerId === TrackerId.SOFTWAREVISIONS) {
    const flipped = patbuf0.slice(0);
    flipWordBytes(flipped, 1084);
    const mh2 = readHeader(flipped);
    mh.name = mh2.name;
    mh.ins = mh2.ins;
    mh.len = mh2.len;
    mh.restart = mh2.restart;
    mh.order = mh2.order;
  }

  let maybeWow = 1;
  let smpSize = 0;
  for (let i = 0; i < 31; i++) {
    const ins = mh.ins[i]!;
    // Mod's Grave WOW files are converted from 669s and have default
    // finetune and volume.
    if (ins.size !== 0 && (ins.finetune !== 0 || ins.volume !== 64)) maybeWow = 0;
    smpSize += 2 * ins.size;
  }

  // Mod's Grave WOW files always have a 0 restart byte.
  if (mh.restart !== 0) maybeWow = 0;

  // mod->rst (mod_load.c:607-611)
  let rst = 0;
  if (mh.restart < 0x7f && mh.restart !== 0x78 && mh.restart < mh.len) {
    rst = mh.restart;
  }

  // Order table → pat count (mod_load.c:613-622).
  let pat = 0;
  const xxo: number[] = [];
  let xxoCount = 0;
  for (let i = 0; i < 128; i++) {
    const x = mh.order[i]!;
    // This fixes dragnet.mod (garbage in the order list).
    if (x > 0x7f) break;
    xxo.push(x);
    if (x > pat) pat = x;
    xxoCount++;
  }
  pat++;
  const len = mh.len;

  // Instruments (mod_load.c:624-674). libxmp_init_instrument: 31 zeroed
  // instruments, each with one calloc'd subinstrument.
  const instruments: Instrument[] = [];
  const rawSamples: RawSample[] = [];
  const subDefaults: Array<{ vol: number; fin: number; sid: number }> = [];
  for (let i = 0; i < 31; i++) {
    const hins = mh.ins[i]!;
    if (hins.size >= 0x8000) {
      // sample %d >64k length -> OpenMPT
      trackerId = TrackerId.OPENMPT;
      needsTimingDetection = 0;
      detected = 1;
    }

    const xlen = 2 * hins.size;
    const lps = 2 * hins.loop_start;
    let lpe = lps + 2 * hins.loop_size;
    if (lpe > xlen) lpe = xlen;
    const xflg = hins.loop_size > 1 && lpe >= 4 ? SampleFlags.LOOP : 0;

    const sub: SubInstrument = {
      vol: hins.volume,
      gvl: 0,
      pan: -1, // XMP_INST_NO_DEFAULT_PAN
      xpo: 0,
      fin: (hins.finetune << 4) & 0xff, // (int8)((uint8)finetune << 4)
      vwf: 0,
      vde: 0,
      vra: 0,
      vsw: 0,
      sid: i,
      nna: 0,
      dct: 0,
      dca: 0,
      ifc: 0,
      ifr: 0,
    };
    // libxmp_instrument_name → copy_adjust(22)
    const name = copyAdjust(patbuf0.subarray(20 + i * 30, 20 + i * 30 + 22), 22);
    const ins: Instrument = zeroInstrument(name, [sub]);
    if (xlen > 0) ins.nsm = 1;
    instruments.push(ins);

    rawSamples.push({
      data: new Uint8Array(0), // filled below; meta fields kept on raw
      length: xlen,
      loopStart: lps,
      loopEnd: lpe,
      sustainStart: 0,
      sustainEnd: 0,
      finetune: sub.fin,
      volume: sub.vol,
      flags: xflg,
      c5spd: C4_PAL_RATE, // libxmp_init_instrument before tracker switch (mod_load.c:626)
    });
    subDefaults.push({ vol: sub.vol, fin: sub.fin, sid: i });
  }

  // Experimental tracker-detection routine (mod_load.c:676-742).
  let ptsong = 0;
  if (!detected) {
    // Flextrax probe
    if (0x43c + pat * 4 * chn * 0x40 + smpSize < size) {
      const pos = 0x43c + pat * 4 * chn * 0x40 + smpSize;
      if (
        bytes[pos] === 0x46 /* F */ && bytes[pos + 1] === 0x4c /* L */ &&
        bytes[pos + 2] === 0x45 /* E */ && bytes[pos + 3] === 0x58 /* X */
      ) {
        trackerId = TrackerId.FLEXTRAX;
        needsTimingDetection = 0;
        detected = 1;
      }
    }

    if (!detected) {
      // Mod's Grave WOW
      if (magic === 'M.K.' && maybeWow === 1 && 0x43c + pat * 32 * 0x40 + smpSize === (size & ~1)) {
        chn = 8;
        trackerId = TrackerId.MODSGRAVE;
        needsTimingDetection = 0;
        detected = 1;
      } else {
        // Protracker song files
        ptsong = magic === 'M.K.' && 0x43c + pat * 0x400 === size ? 1 : 0;
        if (ptsong) {
          trackerId = TrackerId.PROTRACKER;
          detected = 1;
        } else {
          // get_tracker_id mutates mod->rst.
          const view: ModHeaderView = {
            name: mh.name,
            ins: mh.ins,
            len: mh.len,
            restart: mh.restart,
            order: mh.order,
          };
          const rstBox = { rst };
          trackerId = getTrackerId(rstBox, view, pat, chn, trackerId);
          rst = rstBox.rst;
        }
      }
    }
  }

  if (chn >= XMP_MAX_CHANNELS) throw new ParseError('MOD: too many channels');

  // Patterns (mod_load.c:745-875).
  const patterns: Pattern[] = [];
  const patHighFxx = new Uint8Array(256);
  let outOfRange = 0;
  let samerowFxx = 0;
  let highFxx = 0;
  let invertLoop = 0;
  let compareVblank = 0;
  let quirkFlags = 0;

  const patlen = 64 * 4 * chn;
  const patbuf = new Uint8Array(patlen);
  for (let i = 0; i < pat; i++) {
    // DT: one 4-byte skip after the magic ⇒ ALL patterns at 1088 + i*patlen.
    const base = (trackerId === TrackerId.DIGITALTRACKER ? 1088 : 1084) + i * patlen;
    // hio_read(patbuf, 1, patlen, f) < patlen → error.
    const src = bytes.subarray(base, base + patlen);
    if (src.length < patlen) throw new ParseError(`MOD: pattern ${i} truncated`);
    patbuf.set(src);

    // First pattern of Software Visions DMF is word flipped.
    if (trackerId === TrackerId.SOFTWAREVISIONS && i === 0) {
      flipWordBytes(patbuf, patlen);
    }

    // Pre-scan (mod_load.c:766-827).
    {
      let off = 0;
      for (let j = 0; j < 64; j++) {
        let speedRow = 0;
        let bpmRow = 0;
        for (let k = 0; k < chn; k++) {
          const period = (LSN(patbuf[off]!) << 8) | patbuf[off + 1]!;
          if (period !== 0 && (period < 108 || period > 907)) outOfRange = 1;

          if (trackerId === TrackerId.PROBABLY_NOISETRACKER) {
            const fxt = LSN(patbuf[off + 2]!);
            const fxp = LSN(patbuf[off + 3]!);
            if ((fxt > 0x06 && fxt < 0x0a) || (fxt === 0x0e && fxp > 1)) {
              trackerId = TrackerId.UNKNOWN;
            }
          }
          if (LSN(patbuf[off + 2]!) === 0x0f) {
            const fxp = patbuf[off + 3]!;
            if (fxp >= 0x20) {
              patHighFxx[i] = fxp;
              compareVblank = 1;
              highFxx = 1;
              bpmRow = 1;
            } else {
              speedRow = 1;
            }
          }
          if (LSN(patbuf[off + 2]!) === 0xe && MSN(patbuf[off + 3]!) === 0xf) {
            invertLoop = 1;
          }
          off += 4;
        }
        if (bpmRow !== 0 && speedRow !== 0) samerowFxx = 1;
      }
    }

    if (outOfRange !== 0) {
      if (trackerId === TrackerId.UNKNOWN && mh.restart === 0x7f) {
        trackerId = TrackerId.SCREAMTRACKER3;
      }
      if (
        trackerId === TrackerId.PROTRACKER || trackerId === TrackerId.NOISETRACKER ||
        trackerId === TrackerId.PROBABLY_NOISETRACKER || trackerId === TrackerId.SOUNDTRACKER
      ) {
        trackerId = TrackerId.UNKNOWN;
      }
    } else if (
      invertLoop !== 0 && detected === 0 &&
      (trackerId === TrackerId.NOISETRACKER || trackerId === TrackerId.PROBABLY_NOISETRACKER)
    ) {
      // Switch Noisetracker to Protracker to disable event filtering.
      trackerId = TrackerId.PROTRACKER;
    }

    // Decode events into tracks (mod_load.c:833-860).
    const tracks: Pattern['tracks'] = [];
    for (let k = 0; k < chn; k++) {
      const events: Event[] = [];
      for (let j = 0; j < 64; j++) {
        const ev: Event = { ...EMPTY_EVENT };
        const off = (j * chn + k) * 4;
        decodeEvent(ev, patbuf, off, trackerId);
        events.push(ev);
      }
      tracks.push({ rows: 64, event: events });
    }
    patterns.push({ rows: 64, tracks });
  }

  // VBlank detection (mod_load.c:877-941).
  if (needsTimingDetection === 0) {
    if (trackerIsVblank(trackerId) !== 0) quirkFlags |= Quirk.NOBPM;
    compareVblank = 0;
  } else if (samerowFxx !== 0) {
    if (
      trackerId === TrackerId.NOISETRACKER ||
      trackerId === TrackerId.PROBABLY_NOISETRACKER ||
      trackerId === TrackerId.SOUNDTRACKER
    ) {
      trackerId = TrackerId.UNKNOWN;
    }
    compareVblank = 0;
  } else if (highFxx !== 0 && len >= 8) {
    const threshold = len - 2;
    let i = 0;
    for (; i < threshold; i++) {
      if (patHighFxx[xxo[i]!] !== 0) break;
    }
    if (i === threshold) {
      for (i = len - 1; i >= threshold; i--) {
        const fxx = patHighFxx[xxo[i]!]!;
        if (fxx === 0x00) continue;
        if (fxx === 0x7d) break;
        compareVblank = 0;
        quirkFlags |= Quirk.NOBPM;
        break;
      }
    }
  }

  if (invertLoop !== 0 && detected === 0 && outOfRange === 0) {
    // EFx and no out-of-range notes -> Protracker or OpenMPT.
    if (trackerId !== TrackerId.OPENMPT) trackerId = TrackerId.PROTRACKER;
    detected = 1;
  }

  // Tracker switch (mod_load.c:952-1027).
  const st: TrackerState = { tracker: '', trackerId, ptkloop: 0 };
  switch (st.trackerId) {
    case TrackerId.PROTRACKER:
      st.tracker = 'Protracker';
      st.ptkloop = 1;
      break;
    case TrackerId.PROBABLY_NOISETRACKER:
    case TrackerId.NOISETRACKER:
      st.tracker = 'Noisetracker';
      break;
    case TrackerId.SOUNDTRACKER:
      st.tracker = 'Soundtracker';
      break;
    case TrackerId.FASTTRACKER:
    case TrackerId.FASTTRACKER2:
      st.tracker = 'Fast Tracker';
      break;
    case TrackerId.TAKETRACKER:
      st.tracker = 'Take Tracker';
      break;
    case TrackerId.OCTALYSER:
      st.tracker = 'Octalyser';
      if (detected !== 0) {
        // m->flow_mode = FLOW_MODE_OCTALYSER
      }
      break;
    case TrackerId.DIGITALTRACKER:
      st.tracker = 'Digital Tracker';
      break;
    case TrackerId.FLEXTRAX:
      st.tracker = 'Flextrax';
      break;
    case TrackerId.MODSGRAVE:
      st.tracker = "Mod's Grave";
      break;
    case TrackerId.SCREAMTRACKER3:
      st.tracker = 'Scream Tracker';
      break;
    case TrackerId.SOFTWAREVISIONS:
      st.tracker = 'Software Visions DMF';
      break;
    case TrackerId.CONVERTEDST:
    case TrackerId.CONVERTED:
      st.tracker = 'Converted';
      break;
    case TrackerId.CLONE:
      st.tracker = 'Protracker clone';
      break;
    case TrackerId.OPENMPT:
      st.tracker = 'OpenMPT';
      st.ptkloop = 1;
      break;
    default:
    case TrackerId.UNKNOWN_CONV:
    case TrackerId.UNKNOWN:
      st.tracker = 'Unknown tracker';
      break;
  }
  if (outOfRange !== 0) {
    // period AMIGA applied below via outOfRange
  }

  // type string (mod_load.c:1029-1035)
  let type: string;
  if (st.trackerId === TrackerId.MODSGRAVE || st.trackerId === TrackerId.SOFTWAREVISIONS) {
    type = st.tracker;
  } else {
    type = `${st.tracker} ${magic}`;
  }

  // Samples (mod_load.c:1039-1099).
  let filePos = 1084 + pat * patlen + (trackerId === TrackerId.DIGITALTRACKER ? 4 : 0);
  for (let i = 0; i < 31; i++) {
    const raw = rawSamples[i]!;
    if (raw.length === 0) {
      // Skip; loader must still register the sample slot (addSample parity
      // is done for every index regardless — see below).
    }

    let flags = st.ptkloop !== 0 && raw.loopStart === 0 ? SF_FULLREP : 0;

    if (ptsong !== 0) {
      // Protracker song: samples live in external files; we keep metadata
      // only and skip data entirely (documented adaptation — no FS access).
      // libxmp continues (continue on missing file) without reading bytes.
    } else {
      if (raw.length !== 0) {
        const pos = filePos;
        let num = Math.min(5, size - pos);
        let isAdpcm = false;
        if (num === 5) {
          const b = bytes.subarray(pos, pos + 5);
          if (
            b[0] === 0x41 /* A */ && b[1] === 0x44 /* D */ && b[2] === 0x50 /* P */ &&
            b[3] === 0x43 /* C */ && b[4] === 0x4d /* M */
          ) {
            isAdpcm = true;
          }
        }
        if (isAdpcm) {
          flags |= SF_ADPCM;
          filePos += 5;
        }
        // Else: seek back (no-op; we never advanced).
      }

      if (raw.length !== 0) {
        // libxmp_load_sample (sample.c:181-466): reads bytelen bytes.
        const isAdpcm = (flags & SF_ADPCM) !== 0;
        let bytelen = raw.length; // 8-bit MOD: len == bytelen
        if (isAdpcm) {
          const x2 = (bytelen + 1) >> 1;
          // Table (16 bytes) + packed nibbles.
          const avail = size - filePos;
          if (avail < 16) {
            // "ignoring truncated ADPCM sample": skip bytes entirely.
            raw.length = 0;
            raw.data = new Uint8Array(0);
            raw.loopStart = 0;
            raw.loopEnd = 0;
            raw.flags = 0;
            continue;
          }
          const remaining = avail;
          const bound = 16 + x2;
          if (bound > remaining) {
            bytelen = (remaining - 16) << 1;
          }
          const data = bytes.subarray(filePos, filePos + Math.min(16 + x2, remaining));
          raw.data = data;
          raw.length = bytelen;
          raw.flags |= SF_ADPCM;
          filePos += Math.min(16 + x2, remaining);
        } else {
          const remaining = size - filePos;
          const take = Math.min(bytelen, Math.max(0, remaining));
          // EOF handling (sample.c:236-282): pos >= file_len → skip; past
          // EOF → truncate (frame-aligned in normalize).
          raw.data = bytes.subarray(filePos, filePos + take);
          filePos += bytelen; // hio_read advances by requested count
        }
        if ((flags & SF_FULLREP) !== 0) raw.flags |= SF_FULLREP;
      }
    }

    // Every sample slot is registered so store ids align with sid = i.
    ctx.addSample(raw);
  }

  // Final quirks (mod_load.c:1101-1121).
  let readEventType: ReadEventType = ReadEventType.MOD;
  let c4rate = C4_PAL_RATE;
  let periodType: PeriodType = PeriodType.MODRNG;
  let flowMode = 0;
  if (st.trackerId === TrackerId.PROTRACKER || st.trackerId === TrackerId.OPENMPT) {
    quirkFlags |= Quirk.PROTRACK;
  } else if (st.trackerId === TrackerId.SCREAMTRACKER3) {
    c4rate = C4_NTSC_RATE;
    quirkFlags |= QUIRKS_ST3;
    readEventType = ReadEventType.ST3;
  } else if (
    st.trackerId === TrackerId.FASTTRACKER || st.trackerId === TrackerId.FASTTRACKER2 ||
    st.trackerId === TrackerId.TAKETRACKER || st.trackerId === TrackerId.MODSGRAVE || chn > 4
  ) {
    c4rate = C4_NTSC_RATE;
    quirkFlags |= 0; // QUIRKS_FT2 = 0
    readEventType = ReadEventType.FT2;
    periodType = PeriodType.AMIGA;
  }

  // period_type overrides (tracker switch + out_of_range).
  if (
    st.trackerId === TrackerId.FASTTRACKER || st.trackerId === TrackerId.FASTTRACKER2 ||
    st.trackerId === TrackerId.TAKETRACKER || st.trackerId === TrackerId.SCREAMTRACKER3 ||
    st.trackerId === TrackerId.CLONE || st.trackerId === TrackerId.UNKNOWN ||
    st.trackerId === TrackerId.UNKNOWN_CONV || outOfRange !== 0
  ) {
    periodType = PeriodType.AMIGA;
  }
  if (st.trackerId === TrackerId.OCTALYSER && detected !== 0) {
    flowMode = FLOW_MODE_OCTALYSER;
  }
  if (st.trackerId === TrackerId.DIGITALTRACKER) {
    flowMode = FLOW_MODE_DTM_2015;
  }

  // Epilogue (load_helpers.c:366-369): restart position sanity.
  const epilogueRst = rst >= len ? 0 : rst;

  // Channel defaults (load_helpers.c:294-339): pan LRLR, vol 0x40, flg 0.
  const channels: Channel[] = [];
  for (let i = 0; i < chn; i++) {
    const pan = (((i + 1) / 2) % 2) * 0xff;
    channels.push({ pan: 0x80 + (pan - 0x80), vol: 0x40, flg: 0 }); // defpan=100
  }

  const mod: ModuleData = {
    title: copyAdjust(patbuf0.subarray(0, 20), 20),
    format: 'mod',
    comment: '',
    chn,
    pat,
    ins: 31,
    len,
    restart: epilogueRst,
    xxo: xxo.slice(0, Math.max(len, xxoCount)),
    channels,
    patterns,
    instruments,
    // ModuleData.samples is a load-time scratch list; ids were assigned by
    // addSample in order (0..30) so samples[i] corresponds to sid i.
    samples: rawSamples,
    num_sequences: 0,
    sequences: [],
    speed: 6,
    bpm: 125,
    volbase: 0x40,
    gvolbase: 0x40,
    gvol: 0x40,
    quirks: quirkFlags,
    flowMode,
    readEventType,
    periodType,
    defpan: 0x80,
    time_factor: 10,
    rrate: 250,
    c4rate,
    compare_vblank: compareVblank !== 0,
    tracker: type,
  };

  void ctx.sampleRate;
  void ctx.outputRate;
  return mod;
}

/** Read the load-time plugin context (unused fields kept for parity). */
export type { Core };

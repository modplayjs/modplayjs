// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Bitti09 — modplayjs contributors
// Ported from: libxmp src/loaders/stm_load.c (stm_test :104-156,
// stm_load :184-496, stm_convert_tempo :194-208, stm_calculate_bpm :172-192,
// fx table :163-181).

import type { Core, FormatPlugin, LoadCtx, ModuleData } from '@modplayjs/core';
import type { Channel, Event, Instrument, Pattern, RawSample, SubInstrument } from '@modplayjs/core';
import { SampleFlags } from '@modplayjs/core';
import { LSN, MSN } from '@modplayjs/core';
import { ParseError } from '@modplayjs/core';
import {
  FX_ARPEGGIO,
  FX_BREAK,
  FX_JUMP,
  FX_PORTA_DN,
  FX_PORTA_UP,
  FX_S3M_BPM,
  FX_S3M_SPEED,
  FX_SPEED,
  FX_TONEPORTA,
  FX_TREMOR,
  FX_VIBRATO,
  FX_VOLSLIDE,
} from '@modplayjs/core';
import { FLOW_MODE_ST2, Quirk, QUIRKS_ST3, XMP_KEY_OFF } from '@modplayjs/core';
import { readEventSt3 } from '@modplayjs/core';

/** STM_MIX_RATE (stm_load.c:24) — highest mix rate in released ST2 versions. */
const STM_MIX_RATE = 23863;

/** STM_TYPE_SONG / STM_TYPE_MODULE (stm_load.c:27-28). */
const STM_TYPE_SONG = 0x01;
const STM_TYPE_MODULE = 0x02;

/** XMP_MIN_BPM (xmp.h:135) = 20. */
const XMP_MIN_BPM = 20;

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
    map: new Array<number>(121).fill(0),
    mapXpo: new Array<number>(121).fill(0),
    sub,
    aei: zeroEnvelope(),
    fei: zeroEnvelope(),
    pei: zeroEnvelope(),
  };
}

function readmem16l(m: Uint8Array, off: number): number {
  return m[off]! | (m[off + 1]! << 8);
}

function readmem32l(m: Uint8Array, off: number): number {
  return (m[off]! | (m[off + 1]! << 8) | (m[off + 2]! << 16) | (m[off + 3]! << 24)) >>> 0;
}

/** libxmp_copy_adjust (common.c:237-253): printable ASCII, trim. */
function copyAdjust(r: Uint8Array, n: number): string {
  let s = '';
  for (let i = 0; i < n && i < r.length; i++) {
    const c = r[i]!;
    s += c > 127 || c < 0x20 || c === 0x7f ? ' ' : String.fromCharCode(c);
  }
  return s.replace(/ +$/, '');
}

/** libxmp_test_name (common.c:274-292, flags=0): printable ASCII check. */
function testName(s: Uint8Array, n: number): boolean {
  for (let i = 0; i < n && i < s.length; i++) {
    if (s[i]! > 0x7f) return false;
    if (s[i]! > 0 && s[i]! < 32 && s[i] !== 0x08 && s[i] !== 0x0e) return false;
  }
  return true;
}

/** libxmp_c2spd_to_note (period.c:251-264). */
function c2spdToNote(c2spd: number): { n: number; f: number } {
  if (c2spd <= 0) return { n: 0, f: 0 };
  const c = Math.trunc((1536.0 * Math.log(c2spd / 8363)) / Math.LN2);
  return { n: Math.trunc(c / 128), f: c % 128 };
}

// ---------------------------------------------------------------------------
// stm_test (stm_load.c:104-156)
// ---------------------------------------------------------------------------

export function stmTest(bytes: Uint8Array): boolean {
  if (bytes.length < 64) return false;

  // Tracker name should be ASCII (stm_load.c:110-112).
  const buf = bytes.subarray(20, 28);
  if (!testName(buf, 8)) return false;

  // EOF should be 0x1a; putup10/11.stm have 2 (stm_load.c:114-117).
  if (bytes[28] !== 0x1a && bytes[28] !== 0x02) return false;
  if (bytes[29]! > STM_TYPE_MODULE) return false;

  const version = 100 * bytes[30]! + bytes[31]!;
  if (
    version !== 110 && version !== 200 && version !== 210 &&
    version !== 220 && version !== 221
  ) {
    return false;
  }

  // We don't want STX files (stm_load.c:137-140): 'SCRM' @ 60.
  if (
    bytes[60] === 0x53 && bytes[61] === 0x43 &&
    bytes[62] === 0x52 && bytes[63] === 0x4d
  ) {
    return false;
  }

  return true;
}

// ---------------------------------------------------------------------------
// fx table (stm_load.c:163-181)
// ---------------------------------------------------------------------------

const FX_NONE_VAL = 0xff;
const fxTable: readonly number[] = [
  FX_NONE_VAL,
  FX_SPEED,      // A - set tempo
  FX_JUMP,       // B - break pattern + jump to order
  FX_BREAK,      // C - break pattern
  FX_VOLSLIDE,   // D - volume slide
  FX_PORTA_DN,   // E - slide down
  FX_PORTA_UP,   // F - slide up
  FX_TONEPORTA,  // G - tone portamento
  FX_VIBRATO,    // H - vibrato
  FX_TREMOR,     // I - tremor
  FX_ARPEGGIO,   // J - arpeggio
  FX_NONE_VAL, FX_NONE_VAL, FX_NONE_VAL, FX_NONE_VAL, FX_NONE_VAL,
];

// ---------------------------------------------------------------------------
// Tempo conversion (stm_load.c:172-208)
// ---------------------------------------------------------------------------

/**
 * stm_calculate_bpm (stm_load.c:172-192). ST2 tempo derives from the mix
 * buffer size at STM_MIX_RATE.
 */
function stmCalculateBpm(spd: number, tempoFactor: number): number {
  const speedFactor = [140, 50, 25, 15, 10, 7, 6, 4, 3, 3, 2, 2, 2, 2, 1, 1];
  const divisor = 50 - ((speedFactor[spd]! * tempoFactor) >> 4);
  let tickFrames = divisor !== 0 ? Math.trunc(STM_MIX_RATE / divisor) : -1;
  // (unsigned)tick_frames & 0xffff
  tickFrames = (tickFrames >>> 0) & 0xffff;
  // (STM_MIX_RATE * 5 + tick_frames) / (tick_frames * 2) — C integer division
  if (tickFrames === 0) return XMP_MIN_BPM;
  return Math.trunc((STM_MIX_RATE * 5 + tickFrames) / (tickFrames * 2));
}

/** stm_convert_tempo (stm_load.c:194-208). */
function stmConvertTempo(tempo: number, version: number): { spd: number; bpm: number } {
  let spd: number;
  let bpm: number;
  if (version >= 221) {
    spd = MSN(tempo);
    bpm = stmCalculateBpm(spd, LSN(tempo));
  } else if (version >= 110) {
    spd = Math.trunc(tempo / 10);
    bpm = stmCalculateBpm(Math.min(spd, 15), tempo % 10);
  } else {
    spd = tempo;
    bpm = 125;
  }
  spd = Math.max(spd, 1);
  bpm = Math.max(bpm, XMP_MIN_BPM);
  return { spd, bpm };
}

// ---------------------------------------------------------------------------
// stm_load (stm_load.c:210-496)
// ---------------------------------------------------------------------------

export function stmLoad(bytes: Uint8Array, ctx: LoadCtx): ModuleData {
  let pos = 0;
  const u8 = () => bytes[pos++]!;
  const u16 = () => { const v = readmem16l(bytes, pos); pos += 2; return v; };
  const u32 = () => { const v = readmem32l(bytes, pos); pos += 4; return v; };
  const raw = (n: number) => { const s = bytes.subarray(pos, pos + n); pos += n; return s; };

  const name = raw(20);
  const magic = raw(8);
  const rsvd1 = u8(); void rsvd1;
  const type = u8();
  const vermaj = u8();
  const vermin = u8();
  const version = 100 * vermaj + vermin;

  if (
    version !== 110 && version !== 200 && version !== 210 &&
    version !== 220 && version !== 221
  ) {
    throw new ParseError(`STM: unknown version ${version}`);
  }

  let chn: number;
  let pat: number;
  let ins: number;
  let len: number;
  let spd: number;
  let bpm: number;
  let gvol = 0x40;

  if (version >= 200) {
    // v2 subheader (stm_load.c:248-258)
    const tempo = u8();
    const patterns = u8();
    gvol = u8();
    raw(13); // rsvd2
    chn = 4;
    pat = patterns;
    const t = stmConvertTempo(tempo, version);
    spd = t.spd;
    bpm = t.bpm;
    ins = 31;
    len = version === 200 ? 64 : 128;
  } else {
    // v1 subheader (stm_load.c:260-291)
    const insnum = u16();
    if (insnum > 32) throw new ParseError(`STM: too many instruments ${insnum}`);
    const ordnum = u16();
    if (ordnum > 256) throw new ParseError(`STM: too many orders ${ordnum}`);
    const patnum = u16();
    if (patnum > 256) throw new ParseError(`STM: too many patterns ${patnum}`);
    u16(); // srate
    const tempo = u8();
    const channels = u8();
    if (channels !== 4) throw new ParseError(`STM: wrong channel count ${channels}`);
    const psize = u16();
    if (psize !== 64) throw new ParseError(`STM: wrong rows per pattern ${psize}`);
    u16(); // rsvd2
    const skip = u16();
    pos += skip; // hio_seek(f, skip, SEEK_CUR)
    chn = channels;
    pat = patnum;
    const t = stmConvertTempo(tempo, version);
    spd = t.spd;
    bpm = t.bpm;
    ins = insnum;
    len = ordnum;
  }

  // Instrument headers (stm_load.c:295-313): 32 entries always read
  // (struct-sized), but only mod->ins are used.
  interface StmIns {
    name: Uint8Array;
    rsvd1: number;
    length: number;
    loopbeg: number;
    loopend: number;
    volume: number;
    c2spd: number;
    paralen: number;
  }
  const insHeaders: StmIns[] = [];
  const insCount = version >= 200 ? 31 : ins;
  for (let i = 0; i < insCount; i++) {
    const iname = raw(13);
    u8(); // idisk
    const irsvd1 = u16();
    const ilength = u16();
    const iloopbeg = u16();
    const iloopend = u16();
    const ivolume = u8();
    u8(); // rsvd2
    const ic2spd = u16();
    u32(); // rsvd3
    const iparalen = u16();
    insHeaders.push({
      name: iname, rsvd1: irsvd1, length: ilength, loopbeg: iloopbeg,
      loopend: iloopend, volume: ivolume, c2spd: ic2spd, paralen: iparalen,
    });
  }

  // m->c4rate = C4_NTSC_RATE (stm_load.c:323)
  const c4rate = 8363;

  // Type string (stm_load.c:330-338)
  const magicStr = String.fromCharCode(...magic);
  let typeStr: string;
  if (!magic[0] || magicStr.startsWith('PCSTV') || magicStr === '!Scream!') {
    typeStr = `Scream Tracker ${vermaj}.${String(vermin).padStart(2, '0')}`;
  } else if (magicStr.startsWith('SWavePro')) {
    typeStr = `SoundWave Pro ${vermaj}.${String(vermin).padStart(2, '0')}`;
  } else {
    typeStr = copyAdjust(magic, 8);
  }

  // Instruments + samples (stm_load.c:344-377)
  const instruments: Instrument[] = [];
  const rawSamples: RawSample[] = [];
  for (let i = 0; i < ins; i++) {
    const h = insHeaders[i]!;
    const ilpe = h.loopend === 0xffff ? 0 : h.loopend;
    const xflg = ilpe > 0 ? SampleFlags.LOOP : 0;

    const sub: SubInstrument = {
      vol: h.volume,
      gvl: 0,
      pan: -1, // XMP_INST_NO_DEFAULT_PAN
      xpo: 0,
      fin: 0,
      vwf: 0, vde: 0, vra: 0, vsw: 0,
      sid: i,
      rvv: 0, nna: 0, dct: 0, dca: 0, ifc: 0, ifr: 0,
    };
    // libxmp_c2spd_to_note (stm_load.c:374-376)
    const cn = c2spdToNote(h.c2spd);
    sub.xpo = cn.n;
    sub.fin = cn.f;

    const nameStr = copyAdjust(h.name.subarray(0, 12), 12);
    const xi = zeroInstrument(nameStr, [sub]);
    if (h.length > 0) xi.nsm = 1;
    instruments.push(xi);

    rawSamples.push({
      name: copyAdjust(h.name.subarray(0, 12), 12),
      data: new Uint8Array(0),
      length: h.length,
      loopStart: h.loopbeg,
      loopEnd: ilpe,
      sustainStart: 0,
      sustainEnd: 0,
      finetune: 0,
      volume: h.volume,
      flags: xflg,
      c5spd: c4rate,
    });
  }

  // Order table (stm_load.c:379-396)
  const xxoRaw = raw(len);
  const xxo: number[] = [];
  let blankPattern = 0;
  let i = 0;
  for (; i < len; i++) {
    const x = xxoRaw[i]!;
    if (x >= 99) break;
    if (x >= pat) {
      xxo.push(pat);
      blankPattern = 1;
    } else {
      xxo.push(x);
    }
  }
  const storedPatterns = pat;
  if (blankPattern !== 0) pat++;
  len = i;

  // Patterns (stm_load.c:413-483). The blank pattern (orders pointing past
  // the stored count) is index stored_patterns — C allocates it AFTER the
  // stored ones (:420-423 then the loop reads stored_patterns patterns).
  const patterns: Pattern[] = [];
  const mkTrack = (): Event[] =>
    Array.from({ length: 64 }, () => ({ note: 0, ins: 0, vol: 0, fxt: 0, fxp: 0, f2t: 0, f2p: 0 }));

  for (i = 0; i < storedPatterns; i++) {
    const tracksArr: Pattern['tracks'] = [];
    for (let k = 0; k < chn; k++) tracksArr.push({ rows: 64, event: mkTrack() });
    const pattern: Pattern = { rows: 64, tracks: tracksArr };

    for (let j = 0; j < 64; j++) {
      for (let k = 0; k < chn; k++) {
        const e = pattern.tracks[k]!.event[j]!;
        let b = u8();
        if (b === 251 || b === 252) continue; // empty note
        if (b === 253) {
          e.note = XMP_KEY_OFF;
          continue; // key off
        }
        if (b === 254) {
          e.note = XMP_KEY_OFF;
        } else if (b === 255) {
          e.note = 0;
        } else {
          e.note = 1 + LSN(b) + 12 * (3 + MSN(b));
        }

        b = u8();
        let vol = b & 0x07;
        e.ins = (b & 0xf8) >> 3;

        b = u8();
        vol += (b & 0xf0) >> 1;
        if (version >= 200) {
          e.vol = vol > 0x40 ? 0 : vol + 1;
        } else {
          if (vol > 0) {
            e.vol = vol > 0x40 ? 1 : vol + 1;
          }
        }

        e.fxt = fxTable[LSN(b)]!;
        e.fxp = u8();
        switch (e.fxt) {
          case FX_BREAK:
            // ST2 always breaks to row 0 (stm_load.c:462-465)
            e.fxp = 0;
            break;
          case FX_SPEED:
            if (e.fxp !== 0) {
              const t = stmConvertTempo(e.fxp, version);
              e.fxt = FX_S3M_SPEED;
              e.fxp = t.spd;
              if (version >= 110) {
                e.f2t = FX_S3M_BPM;
                e.f2p = t.bpm;
              }
            } else {
              // A00 is a no-op (stm_load.c:476-479)
              e.fxt = 0;
              e.fxp = 0;
            }
            break;
          case FX_NONE_VAL:
            e.fxp = 0;
            e.fxt = 0;
            break;
        }
      }
    }
    patterns.push(pattern);
  }

  // Blank pattern (stm_load.c:420-423) — index stored_patterns, all-empty.
  if (blankPattern !== 0) {
    const tracksArr: Pattern['tracks'] = [];
    for (let k = 0; k < chn; k++) tracksArr.push({ rows: 64, event: mkTrack() });
    patterns.push({ rows: 64, tracks: tracksArr });
  }

  // Sample data (stm_load.c:486-510): STM_TYPE_SONG loads from external
  // files (no FS access — keep metadata only, documented adaptation);
  // STM_TYPE_MODULE seeks rsvd1 << 4 paragraphs. Every slot is registered
  // (C's xxs[] has one entry per instrument regardless of emptiness).
  for (i = 0; i < ins; i++) {
    const h = insHeaders[i]!;
    const rawS = rawSamples[i]!;
    if (h.volume === 0 || h.length === 0) {
      instruments[i]!.nsm = 0;
      ctx.addSample(rawS);
      continue;
    }
    if (type === STM_TYPE_SONG) {
      // External instrument file — unavailable in-browser (documented
      // adaptation; libxmp continues silently on missing files).
      ctx.addSample(rawS);
      continue;
    }
    const dataPos = h.rsvd1 << 4;
    if (dataPos > bytes.length) {
      throw new ParseError(`STM: seek error in sample data (${i})`);
    }
    const remaining = bytes.length - dataPos;
    const take = Math.min(h.length, Math.max(0, remaining));
    rawS.data = bytes.subarray(dataPos, dataPos + take);
    // STM stores signed PCM by default (no SAMPLE_FLAG_UNS here —
    // stm_load.c:507 libxmp_load_sample(m, f, 0, ...)).
    ctx.addSample(rawS);
  }

  // Final quirks (stm_load.c:512-515)
  const quirkFlags = Quirk.VSALL | QUIRKS_ST3;

  // Channel defaults: load prologue LRLR (load_helpers.c:334-339)
  const chan: Channel[] = [];
  for (let k = 0; k < chn; k++) {
    const pan = Math.floor((k + 1) / 2) % 2 * 0xff;
    chan.push({ pan: Math.min(255, Math.max(0, 0x80 + (pan - 0x80))), vol: 0x40, flg: 0 });
  }

  const mod: ModuleData = {
    title: copyAdjust(name, 20),
    format: 'stm',
    comment: '',
    chn,
    pat,
    ins,
    len,
    restart: 0,
    xxo,
    channels: chan,
    patterns,
    instruments,
    samples: rawSamples,
    num_sequences: 0,
    sequences: [],
    speed: spd,
    bpm,
    volbase: 0x40,
    gvolbase: 0x40,
    gvol,
    quirks: quirkFlags,
    flowMode: FLOW_MODE_ST2,
    readEventType: 2, // READ_EVENT_ST3
    periodType: 0, // PERIOD_AMIGA
    defpan: 0x80,
    time_factor: 10,
    rrate: 250,
    c4rate,
    compare_vblank: false,
    tracker: typeStr,
  };

  void ctx.sampleRate;
  void ctx.outputRate;
  return mod;
}

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

/** STM format plugin (libxmp loaders/stm_load.c + read_event_st3). */
export const plugin: FormatPlugin = {
  name: 'stm',
  test: stmTest,
  load: stmLoad,
  readEvent(core: Core, chn: number, row: number): void {
    const mod = core.module as ModuleData;
    const e =
      core.readEventScratch(chn) ?? core.readEventAt(mod.xxo[core.ctx.p.ord] ?? 0, chn, row);
    readEventSt3(core, e, chn);
  },
};

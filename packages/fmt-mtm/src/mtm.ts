// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Bitti09 — modplayjs contributors
// Ported from: libxmp src/loaders/mtm_load.c (mtm_test :65-82,
// mtm_load :84-345).
//
// Multitracker (.mtm): row format is 3 bytes/note; one shared track bank
// (track 0 = empty) referenced by per-pattern per-channel track numbers.

import type { Core, FormatPlugin, LoadCtx, ModuleData } from '@modplayjs/core';
import type { Channel, Event, Instrument, Pattern, RawSample, SubInstrument } from '@modplayjs/core';
import { SampleFlags } from '@modplayjs/core';
import { LSN, MSN } from '@modplayjs/core';
import { ParseError } from '@modplayjs/core';
import {
  FX_BREAK,
  FX_EXTENDED,
  FX_IT_BREAK,
  FX_SETPAN,
  FX_SPEED,
} from '@modplayjs/core';
import { readEventMod } from '@modplayjs/fmt-mod';

/** MAX_SAMPLE_SIZE (common.h:460). */
const MAX_SAMPLE_SIZE = 0x10000000;

/** XMP_MAX_CHANNELS (xmp.h:132). */
const XMP_MAX_CHANNELS = 64;

/** SAMPLE_FLAG_UNS parity (loader.h; DecodeFlag.UNSIGNED). */
const SAMPLE_FLAG_UNS = 1 << 10;

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

/** libxmp_copy_adjust-style name (printable ASCII, trim). */
function copyAdjust(r: Uint8Array, n: number): string {
  let s = '';
  for (let i = 0; i < n && i < r.length; i++) {
    const c = r[i]!;
    s += c > 127 || c < 0x20 || c === 0x7f ? ' ' : String.fromCharCode(c);
  }
  return s.replace(/ +$/, '');
}

// ---------------------------------------------------------------------------
// mtm_test (mtm_load.c:65-82)
// ---------------------------------------------------------------------------

export function mtmTest(bytes: Uint8Array): boolean {
  if (bytes.length < 4) return false;
  if (bytes[0] !== 0x4d || bytes[1] !== 0x54 || bytes[2] !== 0x4d) return false; // "MTM"
  if (bytes[3] !== 0x10) return false; // version 1.0 only
  return true;
}

// ---------------------------------------------------------------------------
// mtm_load (mtm_load.c:84-345)
// ---------------------------------------------------------------------------

export function mtmLoad(bytes: Uint8Array, ctx: LoadCtx): ModuleData {
  let pos = 0;
  const u8 = () => bytes[pos++]!;
  const u16 = () => { const v = readmem16l(bytes, pos); pos += 2; return v; };
  const u32 = () => { const v = readmem32l(bytes, pos); pos += 4; return v; };
  const raw = (n: number) => { const s = bytes.subarray(pos, pos + n); pos += n; return s; };

  // Header (mtm_load.c:90-123)
  const magic = raw(3);
  if (magic[0] !== 0x4d || magic[1] !== 0x54 || magic[2] !== 0x4d) {
    throw new ParseError('MTM: bad magic');
  }
  const version = u8();
  const name = raw(20);
  const tracks = u16(); // number of tracks saved
  const patternCount = u8(); // number of patterns saved
  const modlen = u8(); // module length
  const extralen = u16(); // comment field length
  const samples = u8();
  if (samples > 63) throw new ParseError('MTM: too many samples');
  const attr = u8(); // always zero
  void attr;
  const rows = u8();
  if (rows !== 64) throw new ParseError('MTM: rows != 64');
  const channels = u8();
  if (channels > Math.min(32, XMP_MAX_CHANNELS)) throw new ParseError('MTM: too many channels');
  const pan = raw(32);

  // mtm_load.c:127-137 — counts are stored -1.
  const trk = tracks + 1; // + shared empty track 0
  const patCount = patternCount + 1;
  const len = modlen + 1;
  const ins = samples;

  // Instruments (mtm_load.c:145-183)
  const instruments: Instrument[] = [];
  const rawSamples: RawSample[] = [];
  for (let i = 0; i < ins; i++) {
    const iname = raw(22);
    const ilength = u32(); // length in bytes
    if (ilength > MAX_SAMPLE_SIZE) throw new ParseError('MTM: sample too large');
    const loopStart = u32();
    const loopend = u32();
    const finetune = u8();
    const volume = u8();
    const iattr = u8(); // &0x01: 16-bit sample

    let xlen = ilength;
    let lps = loopStart;
    let lpe = loopend;
    let xflg = lpe > 2 ? SampleFlags.LOOP : 0;
    if ((iattr & 1) !== 0) {
      xflg |= SampleFlags.BITS16;
      xlen >>= 1;
      lps >>= 1;
      lpe >>= 1;
    }

    const sub: SubInstrument = {
      vol: volume,
      gvl: 0,
      pan: -1, // XMP_INST_NO_DEFAULT_PAN
      xpo: 0,
      fin: (((finetune << 4) & 0xff) << 24) >> 24, // (int8)(finetune << 4)
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
    const nameStr = copyAdjust(iname, 22);
    const xi = zeroInstrument(nameStr, [sub]);
    if (xlen > 0) xi.nsm = 1;
    instruments.push(xi);

    rawSamples.push({
      name: nameStr,
      data: new Uint8Array(0), // filled below
      length: xlen,
      loopStart: lps,
      loopEnd: lpe,
      sustainStart: 0,
      sustainEnd: 0,
      finetune: sub.fin,
      volume,
      flags: xflg,
      // libxmp_init_instrument (loaders/common.c:63): xtra[i].c5spd = m->c4rate.
      // MTM never overrides c4rate → PAL prologue default (8287).
      c5spd: 8287,
    });
  }

  // Order table (mtm_load.c:186): 128 bytes.
  const xxoRaw = raw(128);
  const xxo: number[] = [];
  for (let i = 0; i < len && i < 128; i++) xxo.push(xxoRaw[i]!);

  // Track bank (mtm_load.c:191-232): track 0 is the empty shared track;
  // tracks are 3 bytes per row, `rows` rows.
  type Ev = Event;
  const trackBank: Ev[][] = [];
  // Track 0: all empty.
  {
    const ev: Ev[] = [];
    for (let j = 0; j < rows; j++) ev.push({ note: 0, ins: 0, vol: 0, fxt: 0, fxp: 0, f2t: 0, f2p: 0 });
    trackBank.push(ev);
  }
  // Tempo-mode detection markers (mtm_load.c:199).
  let fxxLow = 0;
  let fxxHigh = 0;
  for (let i = 1; i < trk; i++) {
    const mt = raw(3 * 64);
    if (mt.length < 3 * 64) throw new ParseError('MTM: track data truncated');
    const ev: Ev[] = [];
    for (let j = 0; j < 64; j++) {
      const d = j * 3;
      const e: Ev = { note: 0, ins: 0, vol: 0, fxt: 0, fxp: 0, f2t: 0, f2p: 0 };
      e.note = mt[d]! >> 2;
      if (e.note !== 0) e.note += 37;
      e.ins = ((mt[d]! & 0x3) << 4) | MSN(mt[d + 1]!);
      e.fxt = LSN(mt[d + 1]!);
      e.fxp = mt[d + 2]!;
      if (e.fxt > FX_SPEED) {
        e.fxt = 0;
        e.fxp = 0;
      }
      // Break is hex (mtm_load.c:226-229).
      if (e.fxt === FX_BREAK) e.fxt = FX_IT_BREAK;
      // Tempo-mode detection markers (mtm_load.c:232-235).
      if (e.fxt === FX_SPEED) {
        if (e.fxp >= 0x20) fxxHigh = 1; else fxxLow = 1;
      }
      // Set pan effect translation (mtm_load.c:238-242).
      if (e.fxt === FX_EXTENDED && MSN(e.fxp) === 0x8) {
        e.fxt = FX_SETPAN;
        e.fxp <<= 4;
      }
      ev.push(e);
    }
    trackBank.push(ev);
  }

  // Patterns (mtm_load.c:237-258): 32 track numbers per pattern, u16 each.
  const patterns: Pattern[] = [];
  for (let i = 0; i < patCount; i++) {
    const index: number[] = [];
    for (let j = 0; j < 32; j++) {
      let track = u16();
      if (track >= trk) track = 0;
      if (j < channels) index.push(track);
    }
    const tracksArr: Pattern['tracks'] = [];
    for (let j = 0; j < channels; j++) {
      tracksArr.push({ rows, event: trackBank[index[j]!]! });
    }
    patterns.push({ rows, tracks: tracksArr });
  }

  // Tempo mode detection (mtm_load.c:261-318).
  if (fxxLow !== 0 && fxxHigh !== 0) {
    // Both used — check for same-row usage (DMP-style, no injection needed).
    let dmp = false;
    outer: for (let i = 0; i < patCount; i++) {
      for (let j = 0; j < rows; j++) {
        let lo = 0;
        let hi = 0;
        for (let k = 0; k < channels; k++) {
          const e2 = patterns[i]!.tracks[k]!.event[j]!;
          if (e2.fxt === FX_SPEED) {
            if (e2.fxp >= 0x20) hi = 1; else lo = 1;
          }
        }
        if (lo !== 0 && hi !== 0) {
          // Same row, no change required (mtm_load.c:289-294).
          dmp = true;
          break outer;
        }
      }
    }
    if (!dmp) {
      // Probably MT; inject speed/BPM reset effects into the secondary slot
      // (mtm_load.c:296-315): speed set → tempo 125; tempo set → speed 6.
      for (let i = 0; i < patCount; i++) {
        for (let j = 0; j < channels; j++) {
          for (const e of patterns[i]!.tracks[j]!.event) {
            if (e.fxt === FX_SPEED) {
              e.f2t = FX_SPEED;
              e.f2p = e.fxp < 0x20 ? 125 : 6;
            }
          }
        }
      }
    }
  }

  // Comments (mtm_load.c:320-341): 40-byte ASCIIZ lines.
  let comment = '';
  if (extralen !== 0) {
    const cbuf = raw(extralen);
    let lastLine = 0;
    for (let i = 0; i + 40 <= cbuf.length; i += 40) {
      if (cbuf[i] !== 0) lastLine = i + 40;
    }
    for (let line = 0; line < lastLine; line += 40) {
      for (let i = 0; i < 39; i++) {
        const c = cbuf[line + i]!;
        if (c === 0) break;
        comment += String.fromCharCode(c);
      }
      comment += '\n';
    }
  }

  // Samples (mtm_load.c:344-347): SAMPLE_FLAG_UNS (unsigned PCM).
  let sampleDataPos = pos;
  for (let i = 0; i < ins; i++) {
    const rawS = rawSamples[i]!;
    const is16bit = (rawS.flags & SampleFlags.BITS16) !== 0;
    const bytelen = rawS.length * (is16bit ? 2 : 1);
    const remaining = bytes.length - sampleDataPos;
    const take = Math.min(bytelen, Math.max(0, remaining));
    rawS.data = bytes.subarray(sampleDataPos, sampleDataPos + take);
    rawS.flags |= SAMPLE_FLAG_UNS;
    sampleDataPos += bytelen; // hio_read advances by requested count
    ctx.addSample(rawS);
  }

  // Channel pans (mtm_load.c:349-350): pan[i] << 4.
  const chan: Channel[] = [];
  for (let i = 0; i < channels; i++) {
    chan.push({ pan: pan[i]! << 4, vol: 0x40, flg: 0 });
  }

  const mod: ModuleData = {
    title: copyAdjust(name, 20),
    format: 'mtm',
    comment,
    chn: channels,
    pat: patCount,
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
    speed: 6,
    bpm: 125,
    volbase: 0x40,
    gvolbase: 0x40,
    gvol: 0x40,
    quirks: 0,
    flowMode: 0,
    readEventType: 0, // READ_EVENT_MOD
    periodType: 0,
    defpan: 0x80,
    time_factor: 10,
    rrate: 250,
    // mtm_load.c never sets c4rate — libxmp_load_prologue default applies
    // (load_helpers.c:302): m->c4rate = C4_PAL_RATE (8287).
    c4rate: 8287,
    compare_vblank: false,
    tracker: `MultiTracker ${(version >> 4)}.${String(version & 0xf).padStart(2, '0')} MTM`,
  };

  void ctx.sampleRate;
  void ctx.outputRate;
  return mod;
}

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

/** MTM format plugin (libxmp loaders/mtm_load.c + read_event MOD). */
export const plugin: FormatPlugin = {
  name: 'mtm',
  test: mtmTest,
  load: mtmLoad,
  readEvent(core: Core, chn: number, row: number): void {
    // MTM dispatches READ_EVENT_MOD (mtm_load.c leaves read_event_type at
    // the prologue default).
    const mod = core.module as ModuleData;
    const e =
      core.readEventScratch(chn) ?? core.readEventAt(mod.xxo[core.ctx.p.ord] ?? 0, chn, row);
    readEventMod(core, e, chn);
  },
};

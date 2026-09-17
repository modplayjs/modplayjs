// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Bitti09 — modplayjs contributors
// Ported from: libxmp src/loaders/asylum_load.c (asylum_test :31-45,
// asylum_load :47-183). Based on the AMF->MOD converter by Mr. P /
// Powersource, 1995.

import type { Core, FormatPlugin, LoadCtx, ModuleData } from '@modplayjs/core';
import type { Channel, Event, Instrument, Pattern, RawSample, SubInstrument } from '@modplayjs/core';
import { SampleFlags } from '@modplayjs/core';
import { ParseError } from '@modplayjs/core';
import { FX_MULTI_RETRIG } from '@modplayjs/core';
import { readEventMod } from '@modplayjs/fmt-mod';

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

// ---------------------------------------------------------------------------
// asylum_test (asylum_load.c:31-45)
// ---------------------------------------------------------------------------

const MAGIC = 'ASYLUM Music Format V1.0';

export function asylumTest(bytes: Uint8Array): boolean {
  if (bytes.length < 32) return false;
  for (let i = 0; i < 24; i++) {
    if (bytes[i] !== MAGIC.charCodeAt(i)) return false;
  }
  // Trailing 8 NULs (\0\0\0\0\0\0\0\0)
  for (let i = 24; i < 32; i++) {
    if (bytes[i] !== 0) return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// asylum_load (asylum_load.c:47-183)
// ---------------------------------------------------------------------------

export function asylumLoad(bytes: Uint8Array, ctx: LoadCtx): ModuleData {
  let pos = 32; // skip magic (asylum_load.c:56)

  const u8 = () => bytes[pos++]!;
  const raw = (n: number) => { const s = bytes.subarray(pos, pos + n); pos += n; return s; };

  const spd = u8(); // initial speed
  const bpm = u8(); // initial BPM
  const ins = u8(); // number of instruments
  const pat = u8(); // number of patterns
  const len = u8(); // module length
  const rst = u8(); // restart byte

  // Sanity (asylum_load.c:68-73): 64 sample structures max.
  if (ins > 64) throw new ParseError(`ASYLUM: invalid sample count ${ins}`);

  const xxoRaw = raw(len); // orders
  pos = 294; // hio_seek(start + 294)

  const chn = 8;

  // Instruments (asylum_load.c:82-124): 37-byte structs.
  const instruments: Instrument[] = [];
  const rawSamples: RawSample[] = [];
  for (let i = 0; i < ins; i++) {
    const insbuf = raw(37);
    if (insbuf.length < 37) throw new ParseError(`ASYLUM: instrument ${i} truncated`);

    // libxmp_instrument_name → copy_adjust(22)
    const nameStr = copyAdjust(insbuf.subarray(0, 22), 22);
    const fin = (((insbuf[22]! << 4) & 0xff) << 24) >> 24; // (int8)(insbuf[22] << 4)
    const vol = insbuf[23]!;
    const xpo = (insbuf[24]! << 24) >> 24; // (int8)insbuf[24]
    const xlen = readmem32l(insbuf, 25);
    const lps = readmem32l(insbuf, 29);
    const lpe = lps + readmem32l(insbuf, 33);

    // Sanity (asylum_load.c:111-117): converted from MODs, len < 0x20000.
    if (xlen >= 0x20000) throw new ParseError(`ASYLUM: invalid sample ${i} length ${xlen}`);

    const xflg = lpe > 2 ? SampleFlags.LOOP : 0;

    const sub: SubInstrument = {
      vol,
      gvl: 0,
      pan: -1, // XMP_INST_NO_DEFAULT_PAN
      xpo,
      fin,
      vwf: 0, vde: 0, vra: 0, vsw: 0,
      sid: i,
      rvv: 0, nna: 0, dct: 0, dca: 0, ifc: 0, ifr: 0,
    };
    const xi: Instrument = {
      name: nameStr,
      volume: 0x40,
      nsm: 0, // set to 1 only after sample load succeeds (:176-180)
      rls: 0,
      map: new Array<number>(121).fill(0),
      mapXpo: new Array<number>(121).fill(0),
      sub: [sub],
      aei: { flags: 0, npt: 0, scl: 0, sus: 0, sue: 0, lps: 0, lpe: 0, x: [], y: [] },
      fei: { flags: 0, npt: 0, scl: 0, sus: 0, sue: 0, lps: 0, lpe: 0, x: [], y: [] },
      pei: { flags: 0, npt: 0, scl: 0, sus: 0, sue: 0, lps: 0, lpe: 0, x: [], y: [] },
    };
    instruments.push(xi);

    rawSamples.push({
      name: nameStr,
      data: new Uint8Array(0),
      length: xlen,
      loopStart: lps,
      loopEnd: lpe,
      sustainStart: 0,
      sustainEnd: 0,
      finetune: fin,
      volume: vol,
      flags: xflg,
      c5spd: 8287, // prologue PAL default
    });
  }

  // Skip unused sample slots (asylum_load.c:127): 37 * (64 - ins).
  pos += 37 * (64 - ins);

  // Patterns (asylum_load.c:136-172): 2048-byte blocks, 64 rows × 8 ch,
  // 4 bytes per cell: note (0 = none, else +13), ins, fxt, fxp.
  const patterns: Pattern[] = [];
  for (let i = 0; i < pat; i++) {
    const buf = raw(2048);
    if (buf.length < 2048) throw new ParseError(`ASYLUM: pattern ${i} truncated`);

    const tracksArr: Pattern['tracks'] = [];
    for (let k = 0; k < chn; k++) {
      const events: Event[] = [];
      for (let j = 0; j < 64; j++) {
        events.push({ note: 0, ins: 0, vol: 0, fxt: 0, fxp: 0, f2t: 0, f2p: 0 });
      }
      tracksArr.push({ rows: 64, event: events });
    }
    const pattern: Pattern = { rows: 64, tracks: tracksArr };

    let p = 0;
    for (let j = 0; j < 64 * 8; j++) {
      const e = pattern.tracks[j % 8]!.event[Math.trunc(j / 8)]!;
      const note = buf[p++]!;

      if (note !== 0) {
        e.note = note + 13;
      }
      e.ins = buf[p++]!;
      e.fxt = buf[p++]!;
      e.fxp = buf[p++]!;

      // Effects >= 0x10 are unknown except the plausible 0x1b retrig
      // (asylum_load.c:163-169).
      if (e.fxt >= 0x10 && e.fxt !== FX_MULTI_RETRIG) {
        e.fxt = 0;
        e.fxp = 0;
      }
    }
    patterns.push(pattern);
  }

  // Samples (asylum_load.c:175-182): signed PCM, sequential; len > 1 only;
  // nsm = 1 set AFTER successful load.
  let samplePos = pos;
  for (let i = 0; i < ins; i++) {
    const rawS = rawSamples[i]!;
    if (rawS.length > 1) {
      const take = Math.min(rawS.length, Math.max(0, bytes.length - samplePos));
      rawS.data = bytes.subarray(samplePos, samplePos + take);
      samplePos += rawS.length;
      instruments[i]!.nsm = 1;
    }
    ctx.addSample(rawS);
  }

  // Channel defaults: prologue LRLR
  const chan: Channel[] = [];
  for (let k = 0; k < chn; k++) {
    const pan = Math.floor((k + 1) / 2) % 2 * 0xff;
    chan.push({ pan: Math.min(255, Math.max(0, 0x80 + (pan - 0x80))), vol: 0x40, flg: 0 });
  }

  const xxo: number[] = [];
  for (let i = 0; i < len; i++) xxo.push(xxoRaw[i]!);

  const mod: ModuleData = {
    title: '',
    format: 'amf',
    comment: '',
    chn,
    pat,
    ins,
    len,
    restart: rst,
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
    gvol: 0x40,
    quirks: 0,
    flowMode: 0,
    readEventType: 0, // READ_EVENT_MOD
    periodType: 0, // PERIOD_AMIGA (prologue default)
    defpan: 0x80,
    time_factor: 10,
    rrate: 250,
    c4rate: 8287, // PAL prologue default — asylum never sets c4rate
    compare_vblank: false,
    tracker: 'Asylum Music Format v1.0',
  };

  void ctx.sampleRate;
  void ctx.outputRate;
  return mod;
}

// ---------------------------------------------------------------------------
// Plugin
// ---------------------------------------------------------------------------

/** Asylum format plugin (libxmp loaders/asylum_load.c + read_event MOD). */
export const plugin: FormatPlugin = {
  name: 'asylum',
  test: asylumTest,
  load: asylumLoad,
  readEvent(core: Core, chn: number, row: number): void {
    const mod = core.module as ModuleData;
    const e =
      core.readEventScratch(chn) ?? core.readEventAt(mod.xxo[core.ctx.p.ord] ?? 0, chn, row);
    readEventMod(core, e, chn);
  },
};

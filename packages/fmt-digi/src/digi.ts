// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Bitti09 — modplayjs contributors
// Ported from: libxmp src/loaders/digi_load.c (digi_test :36-56,
// digi_load :91-247).
//
// Based on the DIGI Booster player v1.6 by Tap (Tomasz Piasta). Unrecognized
// effects (C header comment): 8xx robot, e00/e01 filter, e30/e31 backward
// play, e50/e51 channel on/off, e8x sample offset 2, e9x retrace.

import type { Core, FormatPlugin, LoadCtx, ModuleData } from '@modplayjs/core';
import type { Channel, Event, Instrument, Pattern, RawSample, SubInstrument } from '@modplayjs/core';
import { SampleFlags } from '@modplayjs/core';
import { LSN, MSN, EMPTY_EVENT } from '@modplayjs/core';
import { ParseError } from '@modplayjs/core';
import { FX_VOLSET } from '@modplayjs/core';
import { readEventMod, decodeEvent, periodToNote } from '@modplayjs/fmt-mod';

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

function readmem32b(m: Uint8Array, off: number): number {
  return ((m[off]! << 24) | (m[off + 1]! << 16) | (m[off + 2]! << 8) | m[off + 3]!) >>> 0;
}

function readmem16b(m: Uint8Array, off: number): number {
  return (m[off]! << 8) | m[off + 1]!;
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
// digi_test (digi_load.c:36-56)
// ---------------------------------------------------------------------------

export function digiTest(bytes: Uint8Array): boolean {
  if (bytes.length < 20) return false;
  // "DIGI Booster module\0" (19 bytes + NUL)
  const id = 'DIGI Booster module';
  for (let i = 0; i < 19; i++) {
    if (bytes[i] !== id.charCodeAt(i)) return false;
  }
  // Skip: vstr(4)+ver(1)+chn(1)+pack(1)+unknown(19) = 26? C seeks 156 from
  // offset 20 → 176; then 3*4*32 = 384 → 560; then 2*1*32 = 64 → 624.
  // C: hio_seek(156, SEEK_CUR) after reading 20 → offset 176. That skips
  // vstr..ord (26) + 128 orders + ... let's just mirror the seeks: from
  // current position (20), +156 → 176, +384 → 560, +64 → 624 (title).
  // Title read of 32 bytes needs file >= 656.
  return bytes.length >= 624 + 32;
}

// ---------------------------------------------------------------------------
// digi_load (digi_load.c:91-247)
// ---------------------------------------------------------------------------

// digi_load (digi_load.c:91-247):
export function digiLoad(bytes: Uint8Array, ctx: LoadCtx): ModuleData {
  let pos = 0;
  const u8 = () => bytes[pos++]!;
  const u16 = () => { const v = readmem16b(bytes, pos); pos += 2; return v; };
  const u32 = () => { const v = readmem32b(bytes, pos); pos += 4; return v; };
  const raw = (n: number) => { const s = bytes.subarray(pos, pos + n); pos += n; return s; };
  const s8 = () => { const v = (bytes[pos++]! << 24) >> 24; return v; };

  raw(20); // id
  const vstr = raw(4);
  const ver = u8();
  void ver;
  const chn = u8();
  const pack = u8();
  raw(19); // unknown
  const patStored = u8();
  const lenStored = u8();
  if (lenStored > 127) throw new ParseError('DIGI: song length > 127');
  const ord = raw(128);

  const slen: number[] = [];
  const sloop: number[] = [];
  const sllen: number[] = [];
  const vol: number[] = [];
  const fin: number[] = [];
  for (let i = 0; i < 31; i++) slen.push(u32());
  for (let i = 0; i < 31; i++) sloop.push(u32());
  for (let i = 0; i < 31; i++) sllen.push(u32());
  for (let i = 0; i < 31; i++) vol.push(u8());
  for (let i = 0; i < 31; i++) fin.push(s8());

  const title = raw(32);
  const insNames: Uint8Array[] = [];
  for (let i = 0; i < 31; i++) insNames.push(raw(30));

  const ins = 31;
  const pat = patStored + 1;
  const len = lenStored + 1;

  // m->period_type = PERIOD_MODRNG (digi_load.c:135)
  const periodType = 1; // MODRNG

  const typeStr = `DIGI Booster ${String.fromCharCode(...vstr).slice(0, 4)}`;

  const xxo: number[] = [];
  for (let i = 0; i < len; i++) xxo.push(ord[i]!);

  // Instruments (digi_load.c:146-174)
  const instruments: Instrument[] = [];
  const rawSamples: RawSample[] = [];
  for (let i = 0; i < ins; i++) {
    const xlen = slen[i]!;
    const lps = sloop[i]!;
    const lpe = sloop[i]! + sllen[i]!;
    const xflg = lpe > 0 ? SampleFlags.LOOP : 0;

    const sub: SubInstrument = {
      vol: vol[i]!,
      gvl: 0,
      pan: -1, // XMP_INST_NO_DEFAULT_PAN
      xpo: 0,
      fin: fin[i]!,
      vwf: 0, vde: 0, vra: 0, vsw: 0,
      sid: i,
      rvv: 0, nna: 0, dct: 0, dca: 0, ifc: 0, ifr: 0,
    };
    const nameStr = copyAdjust(insNames[i]!, 30);
    const xi = zeroInstrument(nameStr, [sub]);
    if (xlen > 0) xi.nsm = 1;
    instruments.push(xi);

    rawSamples.push({
      name: nameStr,
      data: new Uint8Array(0),
      length: xlen,
      loopStart: lps,
      loopEnd: lpe,
      sustainStart: 0,
      sustainEnd: 0,
      finetune: fin[i]!,
      volume: vol[i]!,
      flags: xflg,
      c5spd: 8287, // prologue PAL default — DIGI never sets c4rate
    });
  }

  // Patterns (digi_load.c:180-232)
  const patterns: Pattern[] = [];
  for (let i = 0; i < pat; i++) {
    const tracksArr: Pattern['tracks'] = [];
    for (let k = 0; k < chn; k++) {
      const events: Event[] = [];
      for (let j = 0; j < 64; j++) events.push({ ...EMPTY_EVENT });
      tracksArr.push({ rows: 64, event: events });
    }
    const pattern: Pattern = { rows: 64, tracks: tracksArr };

    let w: number;
    const chnTable = new Uint8Array(64);
    if (pack !== 0) {
      w = (u16() - 64) >> 2;
      const tbl = raw(64);
      if (tbl.length < 64) throw new ParseError(`DIGI: channel table ${i} truncated`);
      chnTable.set(tbl);
    } else {
      w = 64 * chn;
      chnTable.fill(0xff);
    }

    for (let j = 0; j < 64; j++) {
      for (let c = 0, k = 0x80; c < chn; c++, k >>= 1) {
        if ((chnTable[j]! & k) !== 0) {
          const ev4 = raw(4);
          if (ev4.length < 4) throw new ParseError(`DIGI: read error at pattern ${i}`);
          const e = pattern.tracks[c]!.event[j]!;
          // libxmp_decode_protracker_event — reuse fmt-mod's decoder with the
          // PROTRACKER tracker id (skips fx 0x08, then we re-zero it anyway).
          decodeEvent(e, ev4, 0, 0 /* TrackerId.PROTRACKER */);
          e.note = periodToNote((LSN(ev4[0]!) << 8) | ev4[1]!);
          switch (e.fxt) {
            case 0x08: // Robot — unrecognized (digi_load.c:220-223)
              e.fxt = 0;
              e.fxp = 0;
              break;
            case 0x0e:
              switch (MSN(e.fxp)) {
                case 0x00:
                case 0x03:
                case 0x08:
                case 0x09:
                  e.fxt = 0;
                  e.fxp = 0;
                  break;
                case 0x04:
                  e.fxt = FX_VOLSET; // 0x0c
                  e.fxp = 0x00;
                  break;
              }
              break;
          }
          w--;
        }
      }
    }

    if (w !== 0) {
      // C logs "Corrupted file" and continues (digi_load.c:234-237).
    }

    patterns.push(pattern);
  }

  // Samples (digi_load.c:237-243): signed PCM, sequential.
  let samplePos = pos;
  for (let i = 0; i < ins; i++) {
    const rawS = rawSamples[i]!;
    if (rawS.length > 0) {
      const take = Math.min(rawS.length, Math.max(0, bytes.length - samplePos));
      rawS.data = bytes.subarray(samplePos, samplePos + take);
      samplePos += rawS.length;
    }
    ctx.addSample(rawS);
  }

  // Channel defaults: prologue LRLR
  const chan: Channel[] = [];
  for (let k = 0; k < chn; k++) {
    const pan = Math.floor((k + 1) / 2) % 2 * 0xff;
    chan.push({ pan: Math.min(255, Math.max(0, 0x80 + (pan - 0x80))), vol: 0x40, flg: 0 });
  }

  const mod: ModuleData = {
    title: copyAdjust(title, 32),
    format: 'digi',
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
    speed: 6,
    bpm: 125,
    volbase: 0x40,
    gvolbase: 0x40,
    gvol: 0x40,
    quirks: 0,
    flowMode: 0,
    readEventType: 0, // READ_EVENT_MOD
    periodType,
    defpan: 0x80,
    time_factor: 10,
    rrate: 250,
    c4rate: 8287, // PAL prologue default
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

/** DIGI Booster format plugin (libxmp loaders/digi_load.c + read_event MOD). */
export const plugin: FormatPlugin = {
  name: 'digi',
  test: digiTest,
  load: digiLoad,
  readEvent(core: Core, chn: number, row: number): void {
    const mod = core.module as ModuleData;
    const e =
      core.readEventScratch(chn) ?? core.readEventAt(mod.xxo[core.ctx.p.ord] ?? 0, chn, row);
    readEventMod(core, e, chn);
  },
};

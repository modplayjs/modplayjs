// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Bitti09 — modplayjs contributors
// Ported from: libxmp src/loaders/669_load.c (c669_test :32-58,
// c669_load :89-258) with the fx table (:66-73).

import type { Core, FormatPlugin, LoadCtx, ModuleData } from '@modplayjs/core';
import type { Channel, Event, Instrument, Pattern, RawSample, SubInstrument } from '@modplayjs/core';
import { SampleFlags } from '@modplayjs/core';
import { LSN, MSN } from '@modplayjs/core';
import { ParseError } from '@modplayjs/core';
import {
  FX_BREAK,
  FX_PER_CANCEL,
  FX_SPEED_CP,
  FX_669_FINETUNE,
  FX_669_PORTA_DN,
  FX_669_PORTA_UP,
  FX_669_TPORTA,
  FX_669_VIBRATO,
} from '@modplayjs/core';
import { PeriodType, Quirk } from '@modplayjs/core';
import { readEventMod } from '@modplayjs/fmt-mod';

/** MAX_SAMPLE_SIZE (common.h:460). */
const MAX_SAMPLE_SIZE = 0x10000000;

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
// c669_test (669_load.c:32-58)
// ---------------------------------------------------------------------------

export function c669Test(bytes: Uint8Array): boolean {
  if (bytes.length < 241) return false;

  // Marker: u16be 0x6966 ('if') or 0x4a4e ('JN').
  const id = (bytes[0]! << 8) | bytes[1]!;
  if (id !== 0x6966 && id !== 0x4a4e) return false;

  // c669_load.c:43-46 — nos <= 64, nop <= 128.
  if (bytes[110]! > 64) return false;
  if (bytes[111]! > 128) return false;

  // Order table starts with 0xff terminator check (669_load.c:49-51):
  // byte at 240 must be 0xff... in practice C checks order[0]? It reads
  // offset 240 = first order slot region after 128 orders at 112..239?
  // Layout: 2 marker + 108 message + 1 nos + 1 nop + 1 loop = 113; orders
  // at 113..240, speed at 241..368, pbrk at 369..496. C checks byte 240 =
  // the LAST order slot must be 0xff.
  if (bytes[240] !== 0xff) return false;

  return true;
}

// ---------------------------------------------------------------------------
// fx table (669_load.c:66-73)
// ---------------------------------------------------------------------------

const fxTable: readonly number[] = [
  FX_669_PORTA_UP,
  FX_669_PORTA_DN,
  FX_669_TPORTA,
  FX_669_FINETUNE,
  FX_669_VIBRATO,
  FX_SPEED_CP,
];

// ---------------------------------------------------------------------------
// c669_load (669_load.c:89-258)
// ---------------------------------------------------------------------------

export function c669Load(bytes: Uint8Array, ctx: LoadCtx): ModuleData {
  let pos = 0;
  const u8 = () => bytes[pos++]!;
  const u32 = () => { const v = readmem32l(bytes, pos); pos += 4; return v; };
  const raw = (n: number) => { const s = bytes.subarray(pos, pos + n); pos += n; return s; };

  const marker = raw(2);
  const message = raw(108);
  const nos = u8(); // number of samples (0-64)
  const nop = u8(); // number of patterns (0-128)
  if (nos > 64 || nop > 128) throw new ParseError('669: bad sample/pattern count');
  const loop = u8(); void loop; // loop order number
  const order = raw(128);
  const speed = raw(128);
  const pbrkTable = raw(128);

  const chn = 8;
  const ins = nos;
  const pat = nop;

  // len = first index where order[i] > nop (669_load.c:118-122)
  let len = 0;
  for (let i = 0; i < 128; i++) {
    if (order[i]! > nop) break;
    len = i + 1;
  }
  const xxo: number[] = [];
  for (let i = 0; i < len; i++) xxo.push(order[i]!);

  // m->period_type = PERIOD_CSPD; m->c4rate = C4_NTSC_RATE (:127-128)
  const periodType = PeriodType.CSPD;
  const c4rate = 8363;

  const markerStr = String.fromCharCode(marker[0]!, marker[1]!);
  const typeStr = markerStr === 'if' ? 'Composer 669' : 'UNIS 669';

  // Comment = the 108-byte song message (:136-138)
  let comment = '';
  for (let i = 0; i < 108; i++) comment += String.fromCharCode(message[i]!);
  comment = comment.replace(/\0.*$/, '');

  // Instruments (:142-174)
  const instruments: Instrument[] = [];
  const rawSamples: RawSample[] = [];
  for (let i = 0; i < ins; i++) {
    const iname = raw(13);
    const ilength = u32();
    if (ilength > MAX_SAMPLE_SIZE) throw new ParseError('669: sample too large');
    const iloopStart = u32();
    const iloopend = u32();

    const lpe = iloopend >= 0xfffff ? 0 : iloopend;
    const xflg = lpe !== 0 ? SampleFlags.LOOP : 0;

    const sub: SubInstrument = {
      vol: 0x40,
      gvl: 0,
      pan: -1, // XMP_INST_NO_DEFAULT_PAN
      xpo: 0,
      fin: 0,
      vwf: 0, vde: 0, vra: 0, vsw: 0,
      sid: i,
      rvv: 0, nna: 0, dct: 0, dca: 0, ifc: 0, ifr: 0,
    };
    const nameStr = copyAdjust(iname, 13);
    const xi = zeroInstrument(nameStr, [sub]);
    if (ilength > 0) xi.nsm = 1;
    instruments.push(xi);

    rawSamples.push({
      name: nameStr,
      data: new Uint8Array(0),
      length: ilength,
      loopStart: iloopStart,
      loopEnd: lpe,
      sustainStart: 0,
      sustainEnd: 0,
      finetune: 0,
      volume: 0x40,
      flags: xflg,
      c5spd: c4rate,
    });
  }

  // Patterns (:179-227)
  const patterns: Pattern[] = [];
  for (let i = 0; i < pat; i++) {
    const tracksArr: Pattern['tracks'] = [];
    for (let k = 0; k < chn; k++) {
      const events: Event[] = [];
      for (let j = 0; j < 64; j++) {
        events.push({ note: 0, ins: 0, vol: 0, fxt: 0, fxp: 0, f2t: 0, f2p: 0 });
      }
      tracksArr.push({ rows: 64, event: events });
    }
    const pattern: Pattern = { rows: 64, tracks: tracksArr };

    // Speed CP on pattern 0 row 0 channel 0 (:183-186)
    const ev00 = pattern.tracks[0]!.event[0]!;
    ev00.f2t = FX_SPEED_CP;
    ev00.f2p = speed[i]!;

    // Break row on channel 1 (:188-193)
    const pbrk = pbrkTable[i]!;
    if (pbrk >= 64) throw new ParseError('669: bad break row');
    const evBrk = pattern.tracks[1]!.event[pbrk]!;
    evBrk.f2t = FX_BREAK;
    evBrk.f2p = 0;

    for (let j = 0; j < 64 * 8; j++) {
      const e = pattern.tracks[j % 8]!.event[Math.trunc(j / 8)]!;
      const ev = raw(3);
      if (ev.length < 3) throw new ParseError(`669: read error at pattern ${i}`);

      if ((ev[0]! & 0xfe) !== 0xfe) {
        e.note = 1 + 36 + (ev[0]! >> 2);
        e.ins = 1 + MSN(ev[1]!) + ((ev[0]! & 0x03) << 4);
      }
      if (ev[0] !== 0xff) {
        e.vol = (LSN(ev[1]!) << 2) + 1;
      }
      if (ev[2] !== 0xff) {
        if (MSN(ev[2]!) >= fxTable.length) continue;
        e.fxt = fxTable[MSN(ev[2]!)]!;
        e.fxp = LSN(ev[2]!);
        if (e.fxt === FX_SPEED_CP) {
          e.f2t = FX_PER_CANCEL;
        }
      }
    }
    patterns.push(pattern);
  }

  // Samples (:230-237): skip len <= 2; SAMPLE_FLAG_UNS.
  let samplePos = pos;
  for (let i = 0; i < ins; i++) {
    const rawS = rawSamples[i]!;
    if (rawS.length <= 2) {
      // C: continue — no load, no seek. Data slot still registered.
      rawS.data = new Uint8Array(0);
      ctx.addSample(rawS);
      continue;
    }
    const take = Math.min(rawS.length, Math.max(0, bytes.length - samplePos));
    rawS.data = bytes.subarray(samplePos, samplePos + take);
    rawS.flags |= SAMPLE_FLAG_UNS;
    samplePos += rawS.length;
    ctx.addSample(rawS);
  }

  // Channel pans (:240-242): DEFPAN((i % 2) * 0xff) = (i%2)*0xff, defpan 0x80.
  const chan: Channel[] = [];
  for (let k = 0; k < chn; k++) {
    const pan = (k % 2) * 0xff;
    chan.push({ pan: Math.min(255, Math.max(0, 0x80 + (pan - 0x80))), vol: 0x40, flg: 0 });
  }

  // m->quirk |= QUIRK_PBALL|QUIRK_PERPAT (:244)
  const quirkFlags = Quirk.PBALL | Quirk.PERPAT;

  const mod: ModuleData = {
    title: copyAdjust(message, 36),
    format: '669',
    comment,
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
    bpm: 78,
    volbase: 0x40,
    gvolbase: 0x40,
    gvol: 0x40,
    quirks: quirkFlags,
    flowMode: 0,
    readEventType: 0, // READ_EVENT_MOD
    periodType,
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

/** 669 format plugin (libxmp loaders/669_load.c + read_event MOD). */
export const plugin: FormatPlugin = {
  name: '669',
  test: c669Test,
  load: c669Load,
  readEvent(core: Core, chn: number, row: number): void {
    const mod = core.module as ModuleData;
    const e =
      core.readEventScratch(chn) ?? core.readEventAt(mod.xxo[core.ctx.p.ord] ?? 0, chn, row);
    readEventMod(core, e, chn);
  },
};

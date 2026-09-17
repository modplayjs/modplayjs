// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Bitti09 — modplayjs contributors
// Ported from: libxmp src/loaders/ice_load.c (ice_test :33-45, ice_load
// :47-204). Loader for Soundtracker 2.6 / Ice Tracker modules (MTN\0 / IT10).

import type { Core, FormatPlugin, LoadCtx, ModuleData } from '@modplayjs/core';
import type { Channel, Event, Instrument, Pattern, RawSample, SubInstrument } from '@modplayjs/core';
import { SampleFlags } from '@modplayjs/core';
import { ParseError } from '@modplayjs/core';
import { FX_ICE_SPEED, FX_SPEED } from '@modplayjs/core';
import { readEventMod, decodeEvent } from '@modplayjs/fmt-mod';

/** MAGIC4('M','T','N',0) / MAGIC4('I','T','1','0') (ice_load.c:20-21). */
const MAGIC_MTN_ = 0x4d544e00;
const MAGIC_IT10 = 0x49543130;

/** readmem32b (dataio.c:190-198) — big-endian. */
function readmem32b(m: Uint8Array, off: number): number {
  return ((m[off]! << 24) | (m[off + 1]! << 16) | (m[off + 2]! << 8) | m[off + 3]!) >>> 0;
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

// ---------------------------------------------------------------------------
// ice_test (ice_load.c:33-45)
// ---------------------------------------------------------------------------

export function iceTest(bytes: Uint8Array): boolean {
  if (bytes.length < 1468) return false;
  const magic = readmem32b(bytes, 1464);
  return magic === MAGIC_MTN_ || magic === MAGIC_IT10;
}

// ---------------------------------------------------------------------------
// ice_load (ice_load.c:47-204)
// ---------------------------------------------------------------------------

/** Tracker id for decodeEvent: protracker variant (fx 0x08 skipped). */
const TRACKER_PROTRACKER = 0;

export function iceLoad(bytes: Uint8Array, ctx: LoadCtx): ModuleData {
  let pos = 0;
  const u8 = () => bytes[pos++]!;
  const u16 = () => { const v = (bytes[pos]! << 8) | bytes[pos + 1]!; pos += 2; return v; };
  const raw = (n: number) => { const s = bytes.subarray(pos, pos + n); pos += n; return s; };

  const title = raw(20);

  // Instrument headers (ice_load.c:81-90): 31 × (22 + 2 + 1 + 1 + 2 + 2)
  interface IceIns {
    name: Uint8Array;
    len: number; // /2
    finetune: number;
    volume: number;
    loopStart: number; // in file
    loopSize: number; // /2
  }
  const insHeaders: IceIns[] = [];
  for (let i = 0; i < 31; i++) {
    insHeaders.push({
      name: raw(22),
      len: u16(),
      finetune: u8(),
      volume: u8(),
      loopStart: u16(),
      loopSize: u16(),
    });
  }

  const len = u8(); // size of the pattern list
  const trk = u8(); // number of tracks
  const ord: number[][] = [];
  for (let i = 0; i < 128; i++) {
    ord.push(Array.from(raw(4)));
  }
  const magic = readmem32b(bytes, pos);
  pos += 4;

  // Sanity (ice_load.c:96-104)
  if (len > 128) throw new ParseError('ICE: pattern list too long');
  for (let i = 0; i < len; i++) {
    for (let j = 0; j < 4; j++) {
      if (ord[i]![j]! >= trk) throw new ParseError('ICE: track number out of range');
    }
  }

  let typeStr: string;
  if (magic === MAGIC_IT10) {
    typeStr = 'Ice Tracker';
  } else if (magic === MAGIC_MTN_) {
    typeStr = 'Soundtracker 2.6';
  } else {
    throw new ParseError('ICE: bad magic');
  }

  const chn = 4; // trk count per pattern = 4 (mod->chn default; ice uses 4
  // track references per pattern — see ord[i][4])

  // Instruments (ice_load.c:107-141): note finetune is COMMENTED OUT in C.
  const instruments: Instrument[] = [];
  const rawSamples: RawSample[] = [];
  for (let i = 0; i < 31; i++) {
    const h = insHeaders[i]!;
    const xlen = 2 * h.len;
    const lps = 2 * h.loopStart;
    const lpe = lps + 2 * h.loopSize;
    const xflg = h.loopSize > 1 ? SampleFlags.LOOP : 0;

    const sub: SubInstrument = {
      vol: h.volume,
      gvl: 0,
      pan: -1, // XMP_INST_NO_DEFAULT_PAN
      xpo: 0,
      fin: 0, // finetune assignment commented out upstream
      vwf: 0, vde: 0, vra: 0, vsw: 0,
      sid: i,
      rvv: 0, nna: 0, dct: 0, dca: 0, ifc: 0, ifr: 0,
    };
    // C ice_load.c never calls libxmp_instrument_name — names stay empty.
    const nameStr = '';
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
      finetune: 0,
      volume: h.volume,
      flags: xflg,
      c5spd: 8287, // prologue PAL default
    });
  }

  // Patterns via shared track bank (ice_load.c:144-158): pattern i channel j
  // references track ord[i][j]; mod->xxo[i] = i.
  const trackBank: Event[][] = [];
  for (let t = 0; t < trk; t++) {
    const events: Event[] = [];
    for (let j = 0; j < 64; j++) {
      const ev = raw(4);
      if (ev.length < 4) throw new ParseError(`ICE: read error at track ${t}`);
      const e: Event = { note: 0, ins: 0, vol: 0, fxt: 0, fxp: 0, f2t: 0, f2p: 0 };
      decodeEvent(e, ev, 0, TRACKER_PROTRACKER);
      // Fxx with both nibbles set → FX_ICE_SPEED (ice_load.c:177-182)
      if (e.fxt === FX_SPEED) {
        if (((e.fxp & 0xf0) >> 4) !== 0 && (e.fxp & 0x0f) !== 0) {
          e.fxt = FX_ICE_SPEED;
        }
      }
      events.push(e);
    }
    trackBank.push(events);
  }

  const patterns: Pattern[] = [];
  const xxo: number[] = [];
  for (let i = 0; i < len; i++) {
    const tracksArr: Pattern['tracks'] = [];
    for (let j = 0; j < chn; j++) {
      tracksArr.push({ rows: 64, event: trackBank[ord[i]![j]!]! });
    }
    patterns.push({ rows: 64, tracks: tracksArr });
    xxo.push(i);
  }

  // m->period_type = PERIOD_MODRNG (ice_load.c:187)
  const periodType = 1; // MODRNG

  // Samples (ice_load.c:192-199): skip len <= 4; signed PCM.
  let samplePos = pos;
  for (let i = 0; i < 31; i++) {
    const rawS = rawSamples[i]!;
    if (rawS.length <= 4) {
      ctx.addSample(rawS);
      continue;
    }
    const take = Math.min(rawS.length, Math.max(0, bytes.length - samplePos));
    rawS.data = bytes.subarray(samplePos, samplePos + take);
    samplePos += rawS.length;
    ctx.addSample(rawS);
  }

  // Channel defaults: prologue LRLR
  const chan: Channel[] = [];
  for (let k = 0; k < chn; k++) {
    const pan = Math.floor((k + 1) / 2) % 2 * 0xff;
    chan.push({ pan: Math.min(255, Math.max(0, 0x80 + (pan - 0x80))), vol: 0x40, flg: 0 });
  }

  const mod: ModuleData = {
    // strncpy(mod->name, ih.title, 20): NUL-terminated C string semantics.
    title: String.fromCharCode(...title).replace(/\0.*$/, ''),
    format: 'ice',
    comment: '',
    chn,
    pat: len,
    ins: 31,
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

/** Ice format plugin (libxmp loaders/ice_load.c + read_event MOD). */
export const plugin: FormatPlugin = {
  name: 'ice',
  test: iceTest,
  load: iceLoad,
  readEvent(core: Core, chn: number, row: number): void {
    const mod = core.module as ModuleData;
    const e =
      core.readEventScratch(chn) ?? core.readEventAt(mod.xxo[core.ctx.p.ord] ?? 0, chn, row);
    readEventMod(core, e, chn);
  },
};

// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Bitti09 — modplayjs contributors
// Ported from: libxmp src/loaders/pw_load.c (pw_load, :68-185).
//
// Reusable parse core for ProWizard-depacked modules. ProWizard depackers
// (reference/libxmp/src/loaders/prowizard/) emit a synthetic standard
// 31-sample "M.K." MOD; pw_load feeds those bytes through this fixed
// 4-channel Protracker path instead of the full mod_load heuristic chain:
//
//   pw_wizardry(h, temp, &name)  → depacker writes M.K. bytes
//   read header + 31 ins + order + magic check ("M.K." or bail)
//   pat = max(order)+1, chn = 4
//   instruments: len=2*size, lps=2*loop_start, lpe=lps+2*loop_size,
//                LOOP iff loop_size>1, fin=(int8)(finetune<<4), rls=0xfff
//   patterns: 64 rows × 4 ch, libxmp_decode_protracker_event
//   m->period_type = PERIOD_MODRNG
//   samples via libxmp_load_sample (plain PCM, no ADPCM for packed MODs)
//
// The depacker side lands in @modplayjs/prowizard (Wave 2 of
// plans/FORMAT-PLUGINS.md); MTM/669/SFX/etc. (Wave 1) reuse this core too
// where their C loaders share the same "31 ins + M.K.-style cells" shape.

import type { LoadCtx, ModuleData } from '@modplayjs/core';
import type { Event } from '@modplayjs/core';
import {
  C4_PAL_RATE,
  PeriodType,
  Quirk,
  ReadEventType,
} from '@modplayjs/core';
import type { Channel, Instrument, Pattern, RawSample, SubInstrument } from '@modplayjs/core';
import { SampleFlags } from '@modplayjs/core';
import { LSN, MSN, EMPTY_EVENT } from '@modplayjs/core';
import { ParseError } from '@modplayjs/core';
import { periodToNote } from './mod.js';

/** SAMPLE_FLAG_FULLREP — ptkloop is always set in pw_load (protracker path). */
const SF_FULLREP = 0x0200;

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
    rls: 0xfff, // pw_load.c:140 — xxi[i].rls = 0xfff
    map: new Array<number>(121).fill(0),
    mapXpo: new Array<number>(121).fill(0),
    sub,
    aei: zeroEnvelope(),
    fei: zeroEnvelope(),
    pei: zeroEnvelope(),
  };
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

/**
 * libxmp_decode_protracker_event (common.c:391-412): protracker variant —
 * decode all fx except 0x08. This is what pw_load.c uses (:167).
 */
function decodeProtrackerEvent(dst: Event, modEvent: Uint8Array, off: number): void {
  dst.note = periodToNote((LSN(modEvent[off]!) << 8) | modEvent[off + 1]!);
  dst.ins = (MSN(modEvent[off]!) << 4) | MSN(modEvent[off + 2]!);
  const fxt = LSN(modEvent[off + 2]!);
  if (fxt !== 0x08) {
    dst.fxt = fxt;
    dst.fxp = modEvent[off + 3]!;
  }
  disableContinueFx(dst);
}

/** pw_load.c header read (:93-114). */
interface PwHeader {
  name: string;
  ins: Array<{
    name: string;
    size: number;
    finetune: number;
    volume: number;
    loop_start: number;
    loop_size: number;
  }>;
  len: number;
  restart: number;
  order: Uint8Array;
}

function readPwHeader(b: Uint8Array): PwHeader {
  const ins: PwHeader['ins'] = [];
  for (let i = 0; i < 31; i++) {
    const pos = 20 + i * 30;
    ins.push({
      name: String.fromCharCode(...b.subarray(pos, pos + 22)),
      // readmem16b (dataio.c:168-175)
      size: (b[pos + 22]! << 8) | b[pos + 23]!,
      finetune: b[pos + 24]!,
      volume: b[pos + 25]!,
      loop_start: (b[pos + 26]! << 8) | b[pos + 27]!,
      loop_size: (b[pos + 28]! << 8) | b[pos + 29]!,
    });
  }
  return {
    name: String.fromCharCode(...b.subarray(0, 20)),
    ins,
    len: b[950]!,
    restart: b[951]!,
    order: b.slice(952, 1080),
  };
}

/**
 * pw_load (pw_load.c:68-185): parse depacked M.K. bytes into ModuleData.
 *
 * @param bytes  the depacked module bytes (standard 31-sample M.K. MOD)
 * @param ctx    load context (addSample registration)
 * @param name   pw_format.name — becomes mod->type (pw_load.c:127)
 */
export function loadDepackedMod(bytes: Uint8Array, ctx: LoadCtx, name: string): ModuleData {
  // Minimum depacked MOD: header (1084) + at least 1 pattern (1024).
  if (bytes.length < 1084 + 1024) throw new ParseError('depacked MOD too small');

  const mh = readPwHeader(bytes);

  // pw_load.c:116-118 — magic must be "M.K." exactly.
  if (
    bytes[1080] !== 0x4d /* M */ || bytes[1081] !== 0x2e /* . */ ||
    bytes[1082] !== 0x4b /* K */ || bytes[1083] !== 0x2e /* . */
  ) {
    throw new ParseError('depacked MOD: bad magic');
  }

  const chn = 4; // pw_load.c:119 — mod->chn = 4
  const len = mh.len;

  // pw_load.c:125-133 — pat = max(order)+1 over all 128 slots.
  let pat = 0;
  for (let i = 0; i < 128; i++) {
    if (mh.order[i]! > pat) pat = mh.order[i]!;
  }
  pat++;

  // Instruments (pw_load.c:135-172).
  const instruments: Instrument[] = [];
  const rawSamples: RawSample[] = [];
  for (let i = 0; i < 31; i++) {
    const hins = mh.ins[i]!;
    const xlen = 2 * hins.size;
    const lps = 2 * hins.loop_start;
    const lpe = lps + 2 * hins.loop_size;
    const xflg = hins.loop_size > 1 ? SampleFlags.LOOP : 0;

    const fin = (((hins.finetune << 4) & 0xff) << 24) >> 24; // (int8)((uint8)finetune << 4)
    const sub: SubInstrument = {
      vol: hins.volume,
      gvl: 0,
      pan: -1, // XMP_INST_NO_DEFAULT_PAN
      xpo: 0,
      fin,
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
    const iname = copyAdjust(bytes.subarray(20 + i * 30, 20 + i * 30 + 22), 22);
    const ins: Instrument = zeroInstrument(iname, [sub]);
    if (xlen > 0) ins.nsm = 1;
    instruments.push(ins);

    rawSamples.push({
      name: iname,
      data: new Uint8Array(0),
      length: xlen,
      loopStart: lps,
      loopEnd: lpe,
      sustainStart: 0,
      sustainEnd: 0,
      finetune: fin,
      volume: hins.volume,
      flags: xflg,
      c5spd: C4_PAL_RATE,
    });
  }

  // Patterns (pw_load.c:175-192): 64 rows × 4 ch, protracker events.
  const patlen = 64 * 4 * chn;
  const patterns: Pattern[] = [];
  for (let i = 0; i < pat; i++) {
    const base = 1084 + i * patlen;
    const src = bytes.subarray(base, base + patlen);
    if (src.length < patlen) throw new ParseError(`depacked MOD: pattern ${i} truncated`);
    const tracks: Pattern['tracks'] = [];
    for (let k = 0; k < chn; k++) {
      const events: Event[] = [];
      for (let j = 0; j < 64; j++) {
        const ev: Event = { ...EMPTY_EVENT };
        decodeProtrackerEvent(ev, src, (j * chn + k) * 4);
        events.push(ev);
      }
      tracks.push({ rows: 64, event: events });
    }
    patterns.push({ rows: 64, tracks });
  }

  // Samples (pw_load.c:194-201): libxmp_load_sample, plain PCM.
  let filePos = 1084 + pat * patlen;
  for (let i = 0; i < 31; i++) {
    const raw = rawSamples[i]!;
    // ptkloop is always set on this path (protracker) → FULLREP when loop
    // starts at 0, matching mod_load.c:1045 with st.ptkloop != 0.
    if (raw.loopStart === 0) raw.flags |= SF_FULLREP;
    if (raw.length !== 0) {
      const remaining = Math.max(0, bytes.length - filePos);
      const take = Math.min(raw.length, remaining);
      // EOF handling (sample.c:236-282): truncate, frame-aligned in normalize.
      raw.data = bytes.subarray(filePos, filePos + take);
      filePos += raw.length; // hio_read advances by requested count
    }
    ctx.addSample(raw);
  }

  // pw_load.c:192 — m->period_type = PERIOD_MODRNG (no tracker detection).
  const periodType = PeriodType.MODRNG;
  const readEventType = ReadEventType.MOD;
  const quirkFlags = Quirk.PROTRACK; // protracker path (mod_load.c:1104)

  // Channel defaults (load_helpers.c:334-339): pan LRLR, vol 0x40, flg 0.
  const channels: Channel[] = [];
  for (let i = 0; i < chn; i++) {
    const pan = Math.floor((i + 1) / 2) % 2 * 0xff;
    channels.push({ pan: Math.min(255, Math.max(0, 0x80 + (pan - 0x80))), vol: 0x40, flg: 0 });
  }

  // pw_load.c:129 — rst = mh.restart verbatim (no mod_load.c:607-611 clamp).
  const rst = mh.restart;

  const mod: ModuleData = {
    title: copyAdjust(bytes.subarray(0, 20), 20),
    format: 'mod',
    comment: '',
    chn,
    pat,
    ins: 31,
    len,
    restart: rst >= len ? 0 : rst, // load_helpers.c:366-369 epilogue clamp
    xxo: Array.from(mh.order),
    channels,
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
    quirks: quirkFlags,
    flowMode: 0,
    readEventType,
    periodType,
    defpan: 0x80,
    time_factor: 10,
    rrate: 250,
    c4rate: C4_PAL_RATE,
    compare_vblank: false,
    tracker: name, // pw_load.c:128 — mod->type = pw_format name
  };

  void ctx.sampleRate;
  void ctx.outputRate;
  return mod;
}

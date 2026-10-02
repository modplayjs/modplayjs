// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Bitti09 — modplayjs contributors
// Ported from: libxmp loaders/flt_load.c + src/flt_extras.c.
// Startrekker FLT4/FLT8 loader with AudioSculpture/Startrekker-1.2/1.3 AM
// synth support via the `.NT` sidecar file. The AM synth extras run through
// the core's extras hooks (effects/extras.ts).

import type {
  Channel,
  Core,
  Event,
  FormatPlugin,
  Instrument,
  LoadCtx,
  ModuleData,
  Pattern,
  RawSample,
  SubInstrument,
  FltInstrumentExtras,
} from '@modplayjs/core';
import {
  C4_PAL_RATE,
  EMPTY_EVENT,
  PeriodType,
  ReadEventType,
  SampleFlags,
} from '@modplayjs/core';
import { ParseError } from '@modplayjs/core';
import { LSN, MSN } from '@modplayjs/core';
import { periodToNote } from './mod.js';
import { readEventDispatch } from './readevent.js';

const SF_FULLREP = 0x0200;

function readmem16b(m: Uint8Array, o: number): number {
  return (m[o]! << 8) | m[o + 1]!;
}

/** libxmp_copy_adjust (common.c:237-253). */
function copyTitle(r: Uint8Array, n: number): string {
  // C: strncpy(mod->name, name, n) is RAW — the control→' ' mapping happens
  // later in libxmp_adjust_string (load.c:298). Only instrument/sample names
  // go through libxmp_copy_adjust's dot substitution.
  let s = '';
  for (let i = 0; i < n && i < r.length; i++) {
    const c = r[i]!;
    if (c === 0) break;
    s += String.fromCharCode(c);
  }
  return s.replace(/ +$/, '');
}
function copyAdjust(r: Uint8Array, n: number): string {
  let s = '';
  for (let i = 0; i < n && i < r.length; i++) {
    const c = r[i]!;
    if (c === 0) break; // strncpy stops at NUL (common.c:244)
    s += c > 127 || c < 0x20 || c === 0x7f ? '.' : String.fromCharCode(c);
  }
  return s.replace(/ +$/, '');
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

/** libxmp_decode_noisetracker_event (common.c:366-382). */
function decodeNoisetrackerEvent(dst: Event, m: Uint8Array, off: number): void {
  dst.note = periodToNote((LSN(m[off]!) << 8) | m[off + 1]!);
  dst.ins = (MSN(m[off]!) << 4) | MSN(m[off + 2]!);
  const fxt = LSN(m[off + 2]!);
  // noisetracker: keep only <=0x06 or (>=0x0a && !=0x0e)
  if (fxt <= 0x06 || (fxt >= 0x0a && fxt !== 0x0e)) {
    dst.fxt = fxt;
    dst.fxp = m[off + 3]!;
  }
  disableContinueFx(dst);
}

/** flt_test (flt_load.c:41-61): FLT4/FLT8/FLTM/EXO. */
export function fltTest(bytes: Uint8Array): boolean {
  if (bytes.length < 1084) return false;
  const buf = bytes.subarray(1080, 1084);
  const isFlt = buf[0] === 0x46 && buf[1] === 0x4c && buf[2] === 0x54;
  const isExo = buf[0] === 0x45 && buf[1] === 0x58 && buf[2] === 0x4f;
  if (!isFlt && !isExo) return false;
  return buf[3] === 0x34 || buf[3] === 0x38 || buf[3] === 0x4d;
}

/** struct am_instrument (flt_load.c:89-104). */
interface AmInstrument {
  l0: number;
  a1l: number;
  a1s: number;
  a2l: number;
  a2s: number;
  sl: number;
  ds: number;
  st: number;
  rs: number;
  wf: number;
  p_fall: number;
  v_amp: number;
  v_spd: number;
  fq: number;
}

/** Waveforms from the Startrekker 1.2 AM synth replayer (flt_load.c:64-81). */
const AM_WAVEFORM: Int8Array[] = [
  new Int8Array([
    0, 25, 49, 71, 90, 106, 117, 125, 127, 125, 117, 106, 90, 71, 49, 25,
    0, -25, -49, -71, -90, -106, -117, -125, -127, -125, -117, -106, -90, -71, -49, -25,
  ]),
  new Int8Array([
    -128, -120, -112, -104, -96, -88, -80, -72, -64, -56, -48, -40, -32, -24, -16, -8,
    0, 8, 16, 24, 32, 40, 48, 56, 64, 72, 80, 88, 96, 104, 112, 120,
  ]),
  new Int8Array([
    -128, -128, -128, -128, -128, -128, -128, -128, -128, -128, -128, -128, -128, -128, -128, -128,
    127, 127, 127, 127, 127, 127, 127, 127, 127, 127, 127, 127, 127, 127, 127, 127,
  ]),
];

/**
 * is_am_instrument (flt_load.c:99-110): the .NT sidecar marks instrument i
 * as an AM synth (bytes "AM" at 144 + i*120, WF <= 3).
 */
function isAmInstrument(nt: Uint8Array, i: number): boolean {
  const off = 144 + i * 120;
  if (off + 28 > nt.length) return false;
  if (nt[off] !== 0x41 || nt[off + 1] !== 0x4d) return false;
  if (readmem16b(nt, off + 26) > 3) return false; /* WF */
  return true;
}

/**
 * read_am_instrument (flt_load.c:212-333). Returns the AM extras plus the
 * generated waveform sample. The 1024-entry noise branch reproduces C's
 * xorshift32 RNG (rng.c:28-41); C time-seeds it, so noise content differs
 * per run on both sides — the mixer-state parity targets don't read noise.
 */
function readAmInstrument(
  nt: Uint8Array,
  i: number,
): { extras: FltInstrumentExtras; data: Uint8Array; len: number; xpo: number; vde: number; vra: number } | null {
  const off = 144 + i * 120 + 2 + 4;
  // Allow partial/missing AM instruments (flt_load.c:220-224): C warns and
  // continues with whatever bytes are available (zero-filled remainder).
  if (off >= nt.length) return null;
  const buf = new Uint8Array(30);
  buf.set(nt.subarray(off, Math.min(off + 30, nt.length)).subarray(0, 30));
  const am: AmInstrument = {
    l0: readmem16b(buf, 0),
    a1l: readmem16b(buf, 2),
    a1s: readmem16b(buf, 4),
    a2l: readmem16b(buf, 6),
    a2s: readmem16b(buf, 8),
    sl: readmem16b(buf, 10),
    ds: readmem16b(buf, 12),
    st: readmem16b(buf, 14),
    rs: readmem16b(buf, 18),
    wf: readmem16b(buf, 20),
    p_fall: (readmem16b(buf, 22) << 16) >> 16,
    v_amp: readmem16b(buf, 24),
    v_spd: readmem16b(buf, 26),
    fq: readmem16b(buf, 28),
  };

  let len: number;
  let data: Uint8Array;
  if (am.wf < 3) {
    len = 32; // flt_load.c:261-266
    data = new Uint8Array(32);
    const wave = AM_WAVEFORM[am.wf]!;
    for (let k = 0; k < 32; k++) data[k] = wave[k]! & 0xff;
  } else {
    // flt_load.c:267-281 — 1024 noise samples, rng.c xorshift32 with three
    // warm-up calls (init_random, rng.c:49-55).
    len = 1024;
    data = new Uint8Array(1024);
    let state = (Date.now() & 0x7fffffff) >>> 0;
    const step = (): number => {
      if (state === 0) state = 1;
      state = (state ^ (state << 13)) >>> 0;
      state = (state ^ (state >>> 17)) >>> 0;
      state = (state << 5) >>> 0;
      return state;
    };
    step(); step(); step();
    for (let j = 0; j < 1024; j++) {
      // (uint64)range*state>>32 with range=256 → top byte of state.
      data[j] = Math.trunc((256 * state) / 4294967296) & 0xff;
      state = step();
    }
  }

  const extras: FltInstrumentExtras = {
    l0: am.l0,
    a1l: am.a1l,
    a1s: am.a1s,
    a2l: am.a2l,
    a2s: am.a2s,
    sl: am.sl,
    ds: am.ds,
    st: am.st,
    rs: am.rs,
    p_fall: am.p_fall,
    fq: am.fq, // required to fix toneporta (flt_load.c:296)
  };

  return { extras, data, len, xpo: -12 * am.fq, vde: am.v_amp * 4, vra: am.v_spd };
}

function zeroEnvelope(): Instrument['aei'] {
  return { flags: 0, npt: 0, scl: 0, sus: 0, sue: 0, lps: 0, lpe: 0, x: [], y: [] };
}

export function fltLoad(bytes: Uint8Array, ctx: LoadCtx): ModuleData {
  if (bytes.length < 1084) throw new ParseError('FLT: short header');
  const patbuf = bytes.subarray(0, 1084);

  const magic = String.fromCharCode(...patbuf.subarray(1080, 1084));

  // Sidecar (flt_load.c:338-358): <basename>.NT/.nt/.AS/.as next to the
  // module; the harness/preview reads it and passes ctx.sidecarNt.
  const sidecar = ctx.sidecarNt ?? null;
  let amSynth = false;
  let trackerName = 'Startrekker';
  if (sidecar && sidecar.length >= 16) {
    const sig = String.fromCharCode(...sidecar.subarray(0, 16));
    if (sig === 'ST1.2 ModuleINFO') {
      amSynth = true;
      trackerName = 'Startrekker 1.2';
    } else if (sig === 'ST1.3 ModuleINFO') {
      amSynth = true;
      trackerName = 'Startrekker 1.3';
    } else if (sig === 'AudioSculpture10') {
      amSynth = true;
      trackerName = 'AudioSculpture 1.0';
    }
  }

  const chn = magic[3] === '4' ? 4 : 8; // flt_load.c:398-402
  const ins = 31;
  const smp = ins;

  const len = patbuf[950]!;
  const restartRaw = patbuf[951]!;
  const xxoRaw = Array.from(patbuf.slice(952, 1080));

  const insHeaders: Array<{ name: Uint8Array; size: number; finetune: number; volume: number; loop_start: number; loop_size: number }> = [];
  for (let i = 0; i < 31; i++) {
    const pos = 20 + i * 30;
    insHeaders.push({
      name: patbuf.subarray(pos, pos + 22),
      size: readmem16b(patbuf, pos + 22),
      finetune: patbuf[pos + 24]!,
      volume: patbuf[pos + 25]!,
      loop_start: readmem16b(patbuf, pos + 26),
      loop_size: readmem16b(patbuf, pos + 28),
    });
  }

  // FLT8 order halving (flt_load.c:404-408): xxo[i] >>= 1 for chn > 4.
  const xxo = xxoRaw.map((v) => (chn > 4 ? v >> 1 : v));
  let pat = 0;
  for (let i = 0; i < 128; i++) {
    if (xxo[i]! > pat) pat = xxo[i]!;
  }
  pat++;

  // Instruments (flt_load.c:420-446).
  const instruments: Instrument[] = [];
  const rawSamples: RawSample[] = [];
  const amIdx: number[] = [];
  for (let i = 0; i < ins; i++) {
    const il = insHeaders[i]!;
    const xlen = 2 * il.size;
    const lps = 2 * il.loop_start;
    const lpe = lps + 2 * il.loop_size;
    const xflg = il.loop_size > 1 ? SampleFlags.LOOP : 0;
    const fin = (((il.finetune << 4) & 0xff) << 24) >> 24; // (int8)((uint8)ft << 4)
    let xi_nsm_override: number | undefined;
    const sub: SubInstrument = {
      vol: il.volume,
      gvl: 0x40, // no QUIRK_INSVOL: load_epilogue (load_helpers.c:377-383)
      pan: -1, // XMP_INST_NO_DEFAULT_PAN
      xpo: 0,
      fin,
      vwf: 0, vde: 0, vra: 0, vsw: 0,
      sid: i,
      rvv: 0,
      nna: 0,
      dct: 0,
      dca: 0,
      ifc: 0,
      ifr: 0,
    };
    rawSamples.push({
      name: '',
      data: new Uint8Array(0),
      length: xlen,
      loopStart: lps,
      loopEnd: lpe,
      sustainStart: 0,
      sustainEnd: 0,
      finetune: fin,
      volume: il.volume,
      flags: xflg,
      c5spd: C4_PAL_RATE,
    });
    // AudioSculpture/Startrekker-1.2 AM synth (flt_load.c:427-432).
    let extras: FltInstrumentExtras | undefined;
    if (amSynth && sidecar && isAmInstrument(sidecar, i)) {
      const am = readAmInstrument(sidecar, i);
      if (am) {
        extras = am.extras;
        sub.xpo = am.xpo;
        sub.vde = am.vde;
        sub.vra = am.vra;
        rawSamples[i] = {
          name: '',
          data: am.data,
          length: am.len,
          loopStart: 0,
          loopEnd: am.len,
          sustainStart: 0,
          sustainEnd: 0,
          finetune: 0,
          volume: il.volume,
          flags: SampleFlags.LOOP, // flt_load.c:273
          c5spd: C4_PAL_RATE,
        };
        amIdx.push(i);
      } else {
        amIdx.push(-1);
      }
    } else {
      amIdx.push(-1);
    }
    if (extras && amIdx[amIdx.length - 1] === i) {
      xi_nsm_override = 1; // flt_load.c:274 — AM synth sets nsm = 1
    }
    const xi: Instrument = {
      name: copyAdjust(il.name, 22),
      volume: 0x40,
      nsm: xi_nsm_override ?? (xlen > 0 ? 1 : 0), // flt_load.c:447
      rls: 0xfff, // flt_load.c:439
      map: Array.from({ length: 121 }, () => 0),
      mapXpo: Array.from({ length: 121 }, () => 0),
      sub: [sub],
      aei: zeroEnvelope(),
      fei: zeroEnvelope(),
      pei: zeroEnvelope(),
      extras,
    };
    instruments.push(xi);
  }

  // Patterns (flt_load.c:451-497): 64 rows, noisetracker decode. FLT8
  // reads 4 more pattern tracks into chn 4..7 ("no macros": Exx dropped).
  const patlen = 64 * 4 * chn;
  const patterns: Pattern[] = [];
  for (let i = 0; i < pat; i++) {
    const tracks: Pattern['tracks'] = [];
    for (let k = 0; k < chn; k++) {
      const events: Event[] = [];
      for (let j = 0; j < 64; j++) {
        events.push({ ...EMPTY_EVENT });
      }
      tracks.push({ rows: 64, event: events });
    }
    patterns.push({ rows: 64, tracks });
  }
  for (let i = 0; i < pat; i++) {
    const baseFirst = 1084 + i * (chn > 4 ? 2 : 1) * 1024;
    // flt_load reads 4×64 events per 4ch-pattern; for FLT8 the second
    // 4-ch block right after becomes channels 4-7.
    for (let half = 0; half < (chn > 4 ? 2 : 1); half++) {
      const base = baseFirst + half * 1024;
      const src = bytes.subarray(base, base + 1024);
      if (src.length < 1024) throw new ParseError(`FLT: pattern ${i} truncated`);
      for (let j = 0; j < 64 * 4; j++) {
        const ev =
          patterns[i]!.tracks[(j % 4) + (chn > 4 ? half * 4 : 0)]!.event[j >> 2]!;
        decodeNoisetrackerEvent(ev, src, j * 4);
        // flt_load.c:491-493 — FLT8 second-half "no macros".
        if (chn > 4 && half === 1 && ev.fxt === 0x0e) {
          ev.fxt = 0;
          ev.fxp = 0;
        }
      }
    }
  }
  void patlen;

  // Samples (flt_load.c:503-521): AM synth subs auto-skip their PCM, then
  // plain PCM with SAMPLE_FLAG_FULLREP for the rest.
  let filePos = 1084 + pat * (chn > 4 ? 2 : 1) * 1024;
  void amIdx;
  for (let i = 0; i < smp; i++) {
    const raw = rawSamples[i]!;
    if (amSynth && sidecar && isAmInstrument(sidecar, i)) {
      // flt_load.c:507-511 — skip the PCM, synth already generated data.
      filePos += raw.length;
      continue;
    }
    if (raw.loopStart === 0) raw.flags |= SF_FULLREP;
    if (raw.length !== 0) {
      const remaining = Math.max(0, bytes.length - filePos);
      const take = Math.min(raw.length, remaining);
      raw.data = bytes.subarray(filePos, filePos + take);
      filePos += raw.length;
    }
  }
  for (const raw of rawSamples) ctx.addSample(raw);

  // Channel defaults (load_helpers.c:334-339).
  const channels: Channel[] = [];
  for (let i = 0; i < chn; i++) {
    const pan = Math.floor((i + 1) / 2) % 2 * 0xff;
    channels.push({ pan: Math.min(255, Math.max(0, 0x80 + (pan - 0x80))), vol: 0x40, flg: 0 });
  }

  // flt_load.c:487 comment — no MODRNG limit for synth instruments.
  const mod: ModuleData = {
    title: copyTitle(patbuf.subarray(0, 20), 20),
    format: 'mod',
    comment: '',
    chn,
    pat,
    ins,
    len,
    restart: restartRaw >= len ? 0 : restartRaw,
    xxo,
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
    // flt_load.c:485-486 comment + QUIRKS_FT2 default (ft2 quirks = 0).
    quirks: 0,
    flowMode: 0,
    readEventType: ReadEventType.MOD,
    periodType: PeriodType.AMIGA, // prologue default; MODRNG commented out (flt_load.c:499)
    defpan: 0x80,
    time_factor: 10,
    rrate: 250,
    c4rate: 8287,
    compare_vblank: false,
    tracker: `${trackerName} ${magic}`, // flt_load.c:421 snprintf "%s %4.4s"; name already carries 1.2/1.3/AS
    extras: amSynth ? { kind: 'flt' } : { kind: 'none' },
  };

  void smp;
  void len;
  void restartRaw;
  void xxoRaw;
  return mod;
}

export const fltPlugin: FormatPlugin = {
  name: 'flt',
  test: fltTest,
  load: fltLoad,
  readEvent(core: Core, chn: number, row: number): void {
    // flt uses the plain MOD read_event (read_event_type = READ_EVENT_MOD).
    readEventDispatch(core, chn, row);
  },
};

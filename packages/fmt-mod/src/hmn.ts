// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Bitti09 — modplayjs contributors
// Ported from: libxmp loaders/hmn_load.c + src/hmn_extras.c.
// His Master's Noise loader. Both FEST and M&K! match hmn_test, but in C's
// format_loaders order the `mod` loader probes FIRST and eats M&K! files
// (mod_magics carries M&K!) — only FEST reaches hmn. This plugin is
// registered after the mod plugin to mirror that order.

import type {
  Channel,
  Event,
  Instrument,
  LoadCtx,
  ModuleData,
  Pattern,
  RawSample,
  SubInstrument,
  HmnInstrumentExtras,
} from '@modplayjs/core';
import {
  C4_PAL_RATE,
  EMPTY_EVENT,
  FX_MEGAARP,
  PeriodType,
  Quirk,
  ReadEventType,
  SampleFlags,
} from '@modplayjs/core';
import { ParseError } from '@modplayjs/core';
import { LSN, MSN } from '@modplayjs/core';
import { periodToNote } from './mod.js';

const SF_FULLREP = 0x0200;

function readmem16b(m: Uint8Array, o: number): number {
  return (m[o]! << 8) | m[o + 1]!;
}

/** libxmp_copy_adjust (common.c:237-253). */
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

/** libxmp_decode_protracker_event (common.c:384-398) + HMN fx filtering
 *  (hmn_load.c:262-273). */
function decodeHmnEvent(dst: Event, m: Uint8Array, off: number): void {
  dst.note = periodToNote((LSN(m[off]!) << 8) | m[off + 1]!);
  dst.ins = (MSN(m[off]!) << 4) | MSN(m[off + 2]!);
  const fxt = LSN(m[off + 2]!);
  if (fxt !== 0x08) {
    dst.fxt = fxt;
    dst.fxp = m[off + 3]!;
  }
  disableContinueFx(dst);
  switch (dst.fxt) {
    case 0x07:
      dst.fxt = FX_MEGAARP;
      break;
    case 0x08:
    case 0x09:
    case 0x0e:
      dst.fxt = 0;
      dst.fxp = 0;
      break;
  }
}

/** struct mupp (hmn_load.c:113-118). */
interface Mupp {
  prgon: number;
  pattno: number;
  dataloopstart: number;
  dataloopend: number;
}

const MAGIC_FEST = 'FEST';
const MAGIC_MK = 'M&K!';

/**
 * hmn_test (hmn_load.c:93-107). See the file head comment about M&K!.
 */
export function hmnTest(bytes: Uint8Array): boolean {
  if (bytes.length < 1084) return false;
  const magic = String.fromCharCode(...bytes.subarray(1080, 1084));
  return magic === MAGIC_FEST || magic === MAGIC_MK;
}

function zeroEnvelope(): Instrument['aei'] {
  return { flags: 0, npt: 0, scl: 0, sus: 0, sue: 0, lps: 0, lpe: 0, x: [], y: [] };
}

function pad2(v: number): string {
  return (v & 0xff).toString(16).padStart(2, '0');
}

export function hmnLoad(bytes: Uint8Array, ctx: LoadCtx): ModuleData {
  const patbuf = bytes.subarray(0, 1084);
  if (patbuf.length < 1084) throw new ParseError('HMN: short header');

  // Wavetable header read (hmn_load.c:142-155): MOD layout, with Mupp
  // program bytes in the first four chars of instrument names "Mupp…".
  const mupp: Mupp[] = [];
  let numMupp = 0;
  for (let i = 0; i < 31; i++) {
    const nm = patbuf.subarray(20 + i * 30, 20 + i * 30 + 22);
    if (nm[0] === 0x4d && nm[1] === 0x75 && nm[2] === 0x70 && nm[3] === 0x70) {
      mupp.push({
        prgon: 1,
        pattno: nm[4]!,
        dataloopstart: nm[5]!,
        dataloopend: nm[6]!,
      });
      numMupp++;
    } else {
      mupp.push({ prgon: 0, pattno: 0, dataloopstart: 0, dataloopend: 0 });
    }
  }

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
  const len = patbuf[950]!;
  const restart = patbuf[951]!;
  const xxo = Array.from(patbuf.slice(952, 1080));
  const magic = String.fromCharCode(...patbuf.subarray(1080, 1084));

  const chn = 4; // hmn_load.c:169
  const ins = 31; // hmn_load.c:170
  const smp = ins + 28 * numMupp; // hmn_load.c:171

  let pat = 0;
  for (let i = 0; i < 128; i++) {
    if (xxo[i]! > pat) pat = xxo[i]!;
  }
  pat++;

  // Instruments + samples (hmn_load.c:216-253).
  const instruments: Instrument[] = [];
  const rawSamples: RawSample[] = [];
  const muppIdx: number[] = []; // per instrument: its mupp slot or -1
  let muppCursor = 0;
  for (let i = 0; i < ins; i++) {
    const il = insHeaders[i]!;
    const m = mupp[i]!;
    const subs: SubInstrument[] = [];
    // libxmp_alloc_subinstrument(mod, i, nsm) calloc semantics: count first.
    if (m.prgon) {
      for (let j = 0; j < 28; j++) {
        subs.push({
          vol: il.volume,
          gvl: 0x40, // no QUIRK_INSVOL: load_epilogue (load_helpers.c:377-383)
          pan: -1, // XMP_INST_NO_DEFAULT_PAN
          xpo: 0,
          fin: -(((il.finetune << 3) & 0xff) << 24 >> 24), // -(int8)((uint8)ft << 3)
          vwf: 0, vde: 0, vra: 0, vsw: 0,
          sid: i, // reassigned to the mupp sample id below (hmn_load.c:305)
          rvv: 0, nna: 0, dct: 0, dca: 0, ifc: 0, ifr: 0,
        });
      }
      // C calloc's xxs[i] for the mupp instrument too (len 0, no data) —
      // reserve the slot so rawSamples indices match C's xxs indices.
      rawSamples.push({
        name: '',
        data: new Uint8Array(0),
        length: 0,
        loopStart: 0,
        loopEnd: 0,
        sustainStart: 0,
        sustainEnd: 0,
        finetune: 0,
        volume: il.volume,
        flags: 0,
        c5spd: C4_PAL_RATE,
      });
      // Its 32-sample waveforms get appended AFTER the 31 main samples
      // (hmn_load.c:305-312: k = 31 + 28*mupp_index + j); tracked via
      // muppIdx so the fill pass below finds them.
      muppIdx.push(muppCursor);
      muppCursor++;
    } else {
      const xlen = 2 * il.size;
      const lps = 2 * il.loop_start;
      const lpe = lps + 2 * il.loop_size;
      const xflg = il.loop_size > 1 ? SampleFlags.LOOP : 0;
      subs.push({
        vol: il.volume,
        gvl: 0x40,
        pan: -1,
        xpo: 0,
        fin: -(il.finetune << 24 >> 24) * 8,
        vwf: 0, vde: 0, vra: 0, vsw: 0,
        sid: i,
        rvv: 0, nna: 0, dct: 0, dca: 0, ifc: 0, ifr: 0,
      });
      rawSamples.push({
        name: '',
        data: new Uint8Array(0),
        length: xlen,
        loopStart: lps,
        loopEnd: lpe,
        sustainStart: 0,
        sustainEnd: 0,
        finetune: 0,
        volume: il.volume,
        flags: xflg,
        c5spd: C4_PAL_RATE,
      });
      muppIdx.push(-1);
    }
    const xi: Instrument = {
      name: m.prgon
        ? `Mupp ${pad2(m.pattno)} ${pad2(m.dataloopstart)} ${pad2(m.dataloopend)}`
        : copyAdjust(il.name, 22),
      volume: 0x40,
      nsm: m.prgon ? 28 : 1, // hmn_load.c:227 — nsm=1 unconditionally
      rls: 0,
      map: Array.from({ length: 121 }, () => 0),
      mapXpo: Array.from({ length: 121 }, () => 0),
      sub: subs,
      aei: zeroEnvelope(),
      fei: zeroEnvelope(),
      pei: zeroEnvelope(),
      extras: m.prgon
        ? {
            dataloopstart: m.dataloopstart,
            dataloopend: m.dataloopend,
            data: new Array(64).fill(0) as number[],
            progvolume: new Array(64).fill(0) as number[],
          }
        : undefined,
    };
    instruments.push(xi);
  }

  // Mupp sample slots: xxs[31 + 28*mupp_index + j] (hmn_load.c:303-312) —
  // appended after the 31 main samples.
  for (let mi = 0; mi < numMupp; mi++) {
    for (let j = 0; j < 28; j++) {
      rawSamples.push({
        name: '',
        data: new Uint8Array(0), // filled in the mupp pass below
        length: 32, // hmn_load.c:306
        loopStart: 0,
        loopEnd: 32,
        sustainStart: 0,
        sustainEnd: 0,
        finetune: 0,
        volume: 0x40,
        flags: SampleFlags.LOOP, // hmn_load.c:309
        c5spd: C4_PAL_RATE,
      });
    }
  }


  // Patterns (hmn_load.c:258-280): 64 rows × 4 ch protracker events with
  // the HMN fx post-processing.
  const patlen = 64 * 4 * chn;
  const patterns: Pattern[] = [];
  for (let i = 0; i < pat; i++) {
    const base = 1084 + i * patlen;
    const src = bytes.subarray(base, base + patlen);
    if (src.length < patlen) throw new ParseError(`HMN: pattern ${i} truncated`);
    const tracks: Pattern['tracks'] = [];
    for (let k = 0; k < chn; k++) {
      const events: Event[] = [];
      for (let j = 0; j < 64; j++) {
        const ev: Event = { ...EMPTY_EVENT };
        decodeHmnEvent(ev, src, (j * chn + k) * 4);
        events.push(ev);
      }
      tracks.push({ rows: 64, event: events });
    }
    patterns.push({ rows: 64, tracks });
  }

  // Samples (hmn_load.c:285-293): plain PCM, SAMPLE_FLAG_FULLREP. The
  // store must receive ids in xxs order (0..30 regular, then mupp slots),
  // so fill data first and add ALL samples after.
  let filePos = 1084 + pat * patlen;
  for (let i = 0; i < ins; i++) {
    const raw = rawSamples[i]!;
    if (raw.loopStart === 0) raw.flags |= SF_FULLREP;
    if (raw.length !== 0) {
      const remaining = Math.max(0, bytes.length - filePos);
      const take = Math.min(raw.length, remaining);
      raw.data = bytes.subarray(filePos, filePos + take);
      filePos += raw.length; // hio_read advances by requested count
    }
  }

  // Mupp samples (hmn_load.c:296-322): read each 32-sample waveform from
  // pattern slot pattno, then the 64-byte wave table + volume table.
  muppCursor = 0;
  for (let i = 0; i < ins; i++) {
    const m = mupp[i]!;
    if (!m.prgon) continue;

    const waveBase = 1084 + 1024 * m.pattno;
    const xi = instruments[i]!;
    const extras = xi.extras as HmnInstrumentExtras;
    for (let j = 0; j < 28; j++) {
      const k = ins + 28 * muppCursor + j;
      xi.sub[j]!.sid = k;
      const raw = rawSamples[k]!;
      raw.data = bytes.slice(waveBase + j * 32, waveBase + (j + 1) * 32);
    }
    extras.dataloopstart = m.dataloopstart;
    extras.dataloopend = m.dataloopend;
    for (let j = 0; j < 64; j++) {
      extras.data[j] = bytes[waveBase + 28 * 32 + j] ?? 0; // data[64]
      extras.progvolume[j] = bytes[waveBase + 28 * 32 + 64 + j] ?? 0;
    }
    muppCursor++;
  }

  // Register every sample slot in xxs order (C libxmp_load_sample runs
  // inside the per-sample loop over mod->smp).
  for (const raw of rawSamples) ctx.addSample(raw);

  void smp;

  // hmn_load.c:282-284 — noisetracker timing + MODRNG periods.
  const quirkFlags = Quirk.NOBPM;
  const periodType = PeriodType.MODRNG;

  // Channel defaults (load_helpers.c:334-339).
  const channels: Channel[] = [];
  for (let i = 0; i < chn; i++) {
    const pan = Math.floor((i + 1) / 2) % 2 * 0xff;
    channels.push({ pan: Math.min(255, Math.max(0, 0x80 + (pan - 0x80))), vol: 0x40, flg: 0 });
  }

  // hmn_load.c:204-206 — raw MOD title, type from magic.
  const mod: ModuleData = {
    title: copyAdjust(patbuf.subarray(0, 20), 20),
    format: 'mod',
    comment: '',
    chn,
    pat,
    ins, // hmn instrument count is 31; the 28*n mupp waveforms are SAMPLES
    len,
    restart: restart >= len ? 0 : restart,
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
    quirks: quirkFlags,
    flowMode: 0,
    readEventType: ReadEventType.MOD,
    periodType,
    defpan: 0x80,
    time_factor: 10,
    rrate: 250,
    c4rate: 8287,
    compare_vblank: false,
    tracker: `His Master's Noise (${magic})`, // hmn_load.c:208 set_type
    extras: { kind: 'hmn' },
  };

  void ctx.sampleRate;
  void ctx.outputRate;
  return mod;
}

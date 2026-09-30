// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Bitti09 — modplayjs contributors
// Ported from: libxmp src/loaders/mmd_common.c (mmd_load_instrument and the
// per-type loaders, :400-990). Shared by the MMD0/1 and MMD2/3 loaders.

import type {
  Instrument,
  MedInstrumentExtras,
  RawSample,
} from '@modplayjs/core';
import {
  C4_NTSC_RATE,
  ParseError,
  SampleFlags,
} from '@modplayjs/core';
import {
  MMD_NUM_OCT,
  S_16,
  STEREO,
  type MedExpData,
  type MedInstrExt,
  type MedSample,
} from './mmdCommon.js';

/** InstrHdr view (med.h:159-166). */
export interface InstrHdr {
  length: number;
  type: number;
}

/** Everything the instrument loaders need from the calling loader. */
export interface InstrumentLoadState {
  bytes: Uint8Array;
  start: number;
  /** Current byte cursor (advances as samples are consumed). */
  pos: number;
  ver: number;
  samples: RawSample[];
  instruments: Instrument[];
  expdata: MedExpData;
  expSmp: MedInstrExt[];
  song: MedSample[];
}

/** SynthInstr (med.h:175-190) + the absolute file positions of the tables. */
export interface SynthInstr {
  defaultdecay: number;
  rep: number;
  replen: number;
  voltbllen: number;
  wftbllen: number;
  volspeed: number;
  wfspeed: number;
  wforms: number;
  wf: number[];
  voltblPos?: number;
  wftblPos?: number;
}

export function emptySynth(): SynthInstr {
  return {
    defaultdecay: 0, rep: 0, replen: 0, voltbllen: 0, wftbllen: 0,
    volspeed: 0, wfspeed: 0, wforms: 0, wf: [],
  };
}

/** Big-endian cursor (shared with mmd1's Reader; declared here so the
 *  instrument loader can seek the raw bytes). */
export class Reader {
  pos: number;
  constructor(readonly bytes: Uint8Array, start: number) { this.pos = start; }
  get length(): number { return this.bytes.length; }
  u8(): number { return this.bytes[this.pos++] ?? 0; }
  s8(): number { return (this.u8() << 24) >> 24; }
  u16(): number {
    const v = (this.bytes[this.pos]! << 8) | this.bytes[this.pos + 1]!;
    this.pos += 2;
    return v;
  }
  s16(): number { return (this.u16() << 16) >> 16; }
  u32(): number {
    const v =
      ((this.bytes[this.pos]! << 24) | (this.bytes[this.pos + 1]! << 16) |
       (this.bytes[this.pos + 2]! << 8) | this.bytes[this.pos + 3]!) >>> 0;
    this.pos += 4;
    return v;
  }
  raw(n: number): Uint8Array {
    const s = this.bytes.subarray(this.pos, this.pos + n);
    this.pos += n;
    return s;
  }
  seek(p: number): void { this.pos = p; }
  skip(n: number): void { this.pos += n; }
  eof(): boolean { return this.pos >= this.bytes.length; }
}

function makeSub(): import('@modplayjs/core').SubInstrument {
  return {
    vol: 0, gvl: 0x40, pan: -1, xpo: 0, fin: 0, vwf: 0, vde: 0,
    vra: 0, vsw: 0, sid: 0, rvv: 0, nna: 0, dct: 0, dca: 0, ifc: 0, ifr: 0,
  };
}

/** mmd_load_instrument_common (mmd_common.c:413-482). */
export function instrumentInfo(
  st: InstrumentLoadState,
  instr: InstrHdr | null,
  e: MedInstrExt,
  sample: MedSample,
): {
  length: number; rep: number; replen: number;
  sampletrans: number; synthtrans: number; flg: number; enable: number;
} {
  const ver = st.ver;
  let flg = 0;
  let enable = 1;
  if (ver >= 2 && st.expdata.s_ext_entrsz >= 8) { // MMD2+ instrument flags
    if (e.instr_flags & 0x01 /* SSFLG_LOOP */) flg |= SampleFlags.LOOP;
    if (e.instr_flags & 0x08 /* SSFLG_PINGPONG */) flg |= SampleFlags.BIDIR;
    if (e.instr_flags & 0x04 /* SSFLG_DISABLED */) enable = 0;
  } else {
    if (sample.replen > 1) flg |= SampleFlags.LOOP;
  }

  let sampletrans = 36 + sample.strans;
  const synthtrans = 12 + sample.strans;

  let length = 0;
  let rep = 0;
  let replen = 0;
  if (instr) {
    const sampleType = instr.type & ~(S_16 | 0x18 /* MD16 */ | STEREO);

    if ((ver >= 3 && sampleType === 0) || sampleType === 7) {
      // Mix mode transposes samples down two octaves. ExtSamples (7)
      // are transposed regardless.
      sampletrans -= 24;
    }

    length = instr.length;

    if (ver >= 3 && st.expdata.s_ext_entrsz >= 18) {
      rep = e.long_repeat;
      replen = e.long_replen;
    } else {
      rep = sample.rep << 1;
      replen = sample.replen << 1;
    }

    if (instr.type & S_16) {
      flg |= SampleFlags.BITS16;
      // Length is (bytes / channels) but the loop is measured in frames.
      length >>= 1;
    }

    if (instr.type & STEREO) {
      flg |= SampleFlags.STEREO;
    }
  }

  return { length, rep, replen, sampletrans, synthtrans, flg, enable };
}

/** mmd_set_default_pitch_note (mmd_common.c:492-504). */
function mmdSetDefaultPitchNote(
  st: InstrumentLoadState, i: number, e: MedInstrExt, ver: number,
): void {
  if (ver >= 3) {
    let note = 53; // MMD3_DEFAULT_NOTE
    if (e.default_pitch) note = e.default_pitch - 1;
    if (note >= 0 && note < 121) {
      st.instruments[i]!.mapXpo[12] = note;
    }
  }
}

/** mmd_alloc_tables (mmd_common.c:506-526). */
function mmdAllocTables(
  st: InstrumentLoadState, i: number, synth: SynthInstr,
): void {
  const ie = st.instruments[i]!.extras as MedInstrumentExtras | undefined;
  if (!ie) return;
  ie.volTable = st.bytes.slice(
    st.start + (synth.voltblPos ?? 0),
    st.start + (synth.voltblPos ?? 0) + synth.voltbllen,
  );
  ie.wavTable = st.bytes.slice(
    st.start + (synth.wftblPos ?? 0),
    st.start + (synth.wftblPos ?? 0) + synth.wftbllen,
  );
}

/** libxmp_load_sample equivalent over the byte buffer. */
export function loadSampleInto(
  st: InstrumentLoadState & Partial<{ r: Reader }>, smpIdx: number, bigend: number,
): void {
  const s = st.samples[smpIdx]!;
  const is16 = (s.flags & SampleFlags.BITS16) !== 0;
  const stereo = (s.flags & SampleFlags.STEREO) !== 0;
  const bytelen = s.length * (is16 ? 2 : 1) * (stereo ? 2 : 1);
  // The C loader reads through the SAME hio handle the struct header came
  // from. Keep the reader cursor (r) authoritative when present so the
  // instrument header reads and the sample data share one position.
  const cur = 'r' in st && st.r ? st.r : st;
  const take = Math.min(bytelen, Math.max(0, st.bytes.length - cur.pos));
  s.data = st.bytes.subarray(cur.pos, cur.pos + take);
  if (bigend) s.flags |= 1 << 11; // DecodeFlag.BIGEND
  cur.pos += bytelen; // hio_read advances by requested count
  if (cur !== st) st.pos = cur.pos;
}
interface CursorState extends InstrumentLoadState {
  r: Reader;
}

/** Read a SynthInstr body (mmd_common.c:548-558 / 663-673). */
function readSynthInstr(r: Reader, pos: number): SynthInstr {
  r.seek(pos);
  const synth = emptySynth();
  synth.defaultdecay = r.u8();
  r.skip(3);
  synth.rep = r.u16();
  synth.replen = r.u16();
  synth.voltbllen = r.u16();
  synth.wftbllen = r.u16();
  synth.volspeed = r.u8();
  synth.wfspeed = r.u8();
  synth.wforms = r.u16();
  synth.voltblPos = r.pos;
  r.skip(synth.voltbllen);
  synth.wftblPos = r.pos;
  r.skip(synth.wftbllen);
  for (let j = 0; j < synth.wforms; j++) synth.wf.push(r.u32());
  return synth;
}

function synthExtras(synth: SynthInstr): MedInstrumentExtras {
  return {
    vts: synth.volspeed, wts: synth.wfspeed,
    vtlen: synth.voltbllen, wtlen: synth.wftbllen,
    hold: 0, decay: 0, default_pitch: 0, finetune: 0,
    suppress_midi_off: 0, long_repeat: 0, long_replen: 0,
    volTable: null, wavTable: null,
  };
}

function holdDecayExtras(e: MedInstrExt): MedInstrumentExtras {
  return {
    vts: 0, wts: 0, vtlen: 0, wtlen: 0,
    hold: e.hold, decay: e.decay, default_pitch: e.default_pitch,
    finetune: e.finetune, suppress_midi_off: e.suppress_midi_off,
    long_repeat: 0, long_replen: 0,
    volTable: null, wavTable: null,
  };
}

/** mmd_load_hybrid_instrument (mmd_common.c:528-646). */
function loadHybridInstrument(
  st: CursorState, i: number, smpIdx0: number,
  e: MedInstrExt, sample: MedSample,
): number {
  const r = st.r;
  let smpIdx = smpIdx0;
  const pos = r.pos;
  const synth = readSynthInstr(r, pos);

  if (synth.voltbllen > 128 || synth.wftbllen > 128 ||
      synth.wforms < 1 || synth.wforms > 64) {
    throw new ParseError(`MED: invalid synth tables at instrument ${i}`);
  }

  // Sample header at wf[0]; hybrids don't carry IFFOCT/ext samples.
  r.seek(pos - 6 + synth.wf[0]!);
  const length = r.u32();
  const type = r.s16();

  if (type !== 0) {
    throw new ParseError(`MED: unsupported sample type ${type} for hybrid`);
  }

  const xxi = st.instruments[i]!;
  xxi.nsm = synth.wforms;
  xxi.sub = [];
  for (let j = 0; j < synth.wforms; j++) xxi.sub.push(makeSub());
  const ie = synthExtras(synth);
  xxi.extras = ie;

  const info = instrumentInfo(st, { length, type }, e, sample);
  mmdSetDefaultPitchNote(st, i, e, st.ver);

  const fin = (((e.finetune << 4) & 0xff) << 24) >> 24;

  // sub 0 = the sample.
  {
    const sub = xxi.sub[0]!;
    sub.vol = info.enable ? sample.svol : 0;
    sub.xpo = info.sampletrans;
    sub.sid = smpIdx;
    sub.fin = fin;

    st.samples[smpIdx] = {
      name: '',
      data: new Uint8Array(0),
      length: info.length,
      loopStart: info.rep,
      loopEnd: info.rep + info.replen,
      sustainStart: 0,
      sustainEnd: 0,
      finetune: fin,
      volume: sub.vol,
      flags: info.flg,
      c5spd: C4_NTSC_RATE,
    };
    loadSampleInto(st, smpIdx, 0);
    smpIdx++;
  }

  for (let j = 1; j < synth.wforms; j++) {
    const sub = xxi.sub[j]!;

    sub.vol = info.enable ? 64 : 0;
    sub.xpo = info.synthtrans;
    sub.sid = smpIdx;
    sub.fin = fin;

    r.seek(pos - 6 + synth.wf[j]!);

    const len = r.u16() * 2;
    st.samples[smpIdx] = {
      name: '',
      data: new Uint8Array(0),
      length: len,
      loopStart: 0,
      loopEnd: len,
      sustainStart: 0,
      sustainEnd: 0,
      finetune: fin,
      volume: sub.vol,
      flags: SampleFlags.LOOP,
      c5spd: C4_NTSC_RATE,
    };
    loadSampleInto(st, smpIdx, 0);
    smpIdx++;
  }

  mmdAllocTables(st, i, synth);
  return smpIdx;
}

/** mmd_load_synth_instrument (mmd_common.c:648-739). Returns smpIdx
 *  unchanged when wforms == 0xffff (empty synth). */
function loadSynthInstrument(
  st: CursorState, i: number, smpIdx: number,
  e: MedInstrExt, sample: MedSample,
): { smpIdx: number; wforms: number } {
  const r = st.r;
  const pos = r.pos;

  const info = instrumentInfo(st, null, e, sample);
  mmdSetDefaultPitchNote(st, i, e, st.ver);

  const synth = readSynthInstr(r, pos);

  if (synth.wforms === 0xffff) {
    st.instruments[i]!.nsm = 0;
    return { smpIdx, wforms: 0 };
  }
  if (synth.voltbllen > 128 || synth.wftbllen > 128 || synth.wforms > 64) {
    throw new ParseError(`MED: invalid synth tables at instrument ${i}`);
  }

  const xxi = st.instruments[i]!;
  xxi.nsm = synth.wforms;
  xxi.sub = [];
  for (let j = 0; j < synth.wforms; j++) xxi.sub.push(makeSub());
  const ie = synthExtras(synth);
  xxi.extras = ie;

  const fin = (((e.finetune << 4) & 0xff) << 24) >> 24;
  for (let j = 0; j < synth.wforms; j++) {
    const sub = xxi.sub[j]!;

    sub.vol = info.enable ? 64 : 0;
    sub.xpo = info.synthtrans;
    sub.sid = smpIdx;
    sub.fin = fin;

    r.seek(pos - 6 + synth.wf[j]!);

    const len = r.u16() * 2;
    st.samples[smpIdx] = {
      name: '',
      data: new Uint8Array(0),
      length: len,
      loopStart: 0,
      loopEnd: len,
      sustainStart: 0,
      sustainEnd: 0,
      finetune: fin,
      volume: sub.vol,
      flags: SampleFlags.LOOP,
      c5spd: C4_NTSC_RATE,
    };
    loadSampleInto(st, smpIdx, 0);
    smpIdx++;
  }

  mmdAllocTables(st, i, synth);
  return { smpIdx, wforms: synth.wforms };
}

/** iffoct_insmap / iffoct_xpomap (mmd_common.c:814-830). */
const IFFOCT_INSMAP: readonly number[][] = [
  [1, 1, 1, 0, 0, 0, 0, 0, 0],
  [2, 2, 2, 2, 2, 2, 1, 1, 0],
  [3, 3, 3, 2, 2, 2, 1, 1, 0],
  [4, 4, 4, 3, 2, 2, 1, 1, 0],
  [5, 5, 5, 5, 4, 3, 2, 1, 0],
  [6, 6, 6, 6, 5, 4, 3, 2, 1],
];
const IFFOCT_XPOMAP: readonly number[][] = [
  [12, 12, 12, 0, 0, 0, 0, 0, 0],
  [12, 12, 12, 12, 12, 12, 0, 0, -12],
  [12, 12, 12, 0, 0, 0, -12, -12, -24],
  [24, 24, 24, 12, 0, 0, -12, -24, -36],
  [12, 12, 12, 12, 0, -12, -24, -36, -48],
  [12, 12, 12, 12, 0, -12, -24, -36, -48],
];

/** mmd_load_iffoct_instrument (mmd_common.c:832-907). */
function loadIffoctInstrument(
  st: CursorState, i: number, smpIdx0: number,
  instr: InstrHdr, numOct: number, e: MedInstrExt, sample: MedSample,
): number {
  let smpIdx = smpIdx0;
  if (numOct < 2 || numOct > 7) {
    throw new ParseError(`MED: invalid octave count at instrument ${i}`);
  }
  if ((instr.length | 0) < 0) {
    throw new ParseError(`MED: absurd IFFOCT instrument ${i}`);
  }

  const xxi = st.instruments[i]!;
  xxi.nsm = numOct;
  xxi.sub = [];
  for (let j = 0; j < numOct; j++) xxi.sub.push(makeSub());
  xxi.extras = holdDecayExtras(e);

  // Base octave size.
  let size = Math.trunc(instr.length / ((1 << numOct) - 1));
  const info = instrumentInfo(st, instr, e, sample);

  const fin = (((e.finetune << 4) & 0xff) << 24) >> 24;
  for (let j = 0; j < numOct; j++) {
    const sub = xxi.sub[j]!;

    sub.vol = info.enable ? sample.svol : 0;
    sub.xpo = info.sampletrans - 12;
    sub.sid = smpIdx;
    sub.fin = fin;

    st.samples[smpIdx] = {
      name: '',
      data: new Uint8Array(0),
      length: size,
      loopStart: info.rep,
      loopEnd: info.rep + info.replen,
      sustainStart: 0,
      sustainEnd: 0,
      finetune: fin,
      volume: sub.vol,
      flags: info.flg,
      c5spd: C4_NTSC_RATE,
    };
    loadSampleInto(st, smpIdx, 1); // SAMPLE_FLAG_BIGEND
    smpIdx++;
    size <<= 1;
    info.rep <<= 1;
    info.replen <<= 1;
  }

  // Instrument mapping.
  for (let j = 0; j < 9; j++) {
    for (let k = 0; k < 12; k++) {
      xxi.map[12 * j + k] = IFFOCT_INSMAP[numOct - 2]![j]!;
      xxi.mapXpo[12 * j + k] = IFFOCT_XPOMAP[numOct - 2]![j]!;
    }
  }

  return smpIdx;
}

/** mmd_load_sampled_instrument (mmd_common.c:741-812). */
function loadSampledInstrument(
  st: CursorState, i: number, smpIdx: number,
  instr: InstrHdr, e: MedInstrExt, sample: MedSample,
): number {
  const xxi = st.instruments[i]!;
  xxi.nsm = 1;
  xxi.sub = [makeSub()];
  xxi.extras = holdDecayExtras(e);

  const info = instrumentInfo(st, instr, e, sample);
  mmdSetDefaultPitchNote(st, i, e, st.ver);
  const sub = xxi.sub[0]!;

  sub.vol = info.enable ? sample.svol : 0;
  sub.xpo = info.sampletrans;
  sub.sid = smpIdx;
  sub.fin = (((e.finetune << 4) & 0xff) << 24) >> 24;

  st.samples[smpIdx] = {
    name: '',
    data: new Uint8Array(0),
    length: info.length,
    loopStart: info.rep,
    loopEnd: info.rep + info.replen,
    sustainStart: 0,
    sustainEnd: 0,
    finetune: sub.fin,
    volume: sub.vol,
    flags: info.flg,
    c5spd: C4_NTSC_RATE,
  };

  // Restrict sampled instruments to a 3-octave range except for MMD3.
  // ExtSamples have two extra octaves.
  if (st.ver < 3) {
    const octaves = (instr.type & 7) === 7 ? 5 : 3;
    for (let j = 0; j < 9; j++) {
      for (let k = 0; k < 12; k++) {
        let xpo = 0;
        if (j < 1) xpo = 12 * (1 - j);
        else if (j > octaves) xpo = -12 * (j - octaves);
        xxi.mapXpo[12 * j + k] = xpo;
      }
    }
  }

  loadSampleInto(st, smpIdx, 1); // SAMPLE_FLAG_BIGEND
  return smpIdx + 1;
}

/** mmd_load_instrument (mmd_common.c:912-990). Returns the next smp_idx. */
export function mmdLoadInstrument(
  st: InstrumentLoadState, i: number, smpIdx: number,
): number {
  const r = new Reader(st.bytes, st.pos);
  const cst: CursorState = { ...st, r };

  const length = r.u32();
  const type = r.s16();
  const sampleType = type & ~(S_16 | 0x18 | STEREO);
  const e = st.expSmp[i] ?? {
    hold: 0, decay: 0, suppress_midi_off: 0, finetune: 0,
    default_pitch: 0, instr_flags: 0, long_repeat: 0, long_replen: 0,
  };
  const sample = st.song[i] ?? {
    rep: 0, replen: 0, midich: 0, midipreset: 0, svol: 0, strans: 0,
  };

  let out: number;
  if (type === -2) { // Hybrid
    out = loadHybridInstrument(cst, i, smpIdx, e, sample);
  } else if (type === -1) { // Synthetic
    const res = loadSynthInstrument(cst, i, smpIdx, e, sample);
    out = res.smpIdx;
  } else if (type >= 1 && type <= 6) { // IFFOCT
    const oct = MMD_NUM_OCT[type - 1]!;
    out = loadIffoctInstrument(cst, i, smpIdx, { length, type }, oct, e, sample);
  } else if (sampleType === 0 || sampleType === 7) { // Sample
    out = loadSampledInstrument(cst, i, smpIdx, { length, type }, e, sample);
  } else {
    throw new ParseError(`MED: invalid instrument type ${type}`);
  }

  st.pos = r.pos;
  return out;
}

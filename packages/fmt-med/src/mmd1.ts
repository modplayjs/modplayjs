// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Bitti09 — modplayjs contributors
// Ported from: libxmp src/loaders/mmd1_load.c (mmd1_test :40-65,
// mmd1_load :68-628). MMD0/MMD1/MMDC = MED 2.10 / OctaMED. Instrument
// loading lives in instr.ts (mmd_common.c port).

import type {
  Channel,
  Event,
  Instrument,
  LoadCtx,
  ModuleData,
  Pattern,
  RawSample,
} from '@modplayjs/core';
import {
  C4_NTSC_RATE,
  ParseError,
  Quirk,
  ReadEventType,
} from '@modplayjs/core';
import {
  FLAG2_BMASK,
  FLAG2_BPM,
  FLAG_8CHANNEL,
  FLAG_STSLIDE,
  FLAG_VOLHEX,
  MMD_NUM_OCT,
  mmdSetBpm,
  mmdTrackerVersion,
  mmdXlatFx,
  readInstrExtArray,
  readInstrInfoArray,
  zeroExpData,
  zeroInstrExt,
  type MedInstrExt,
  type MedSample,
} from './mmdCommon.js';
import {
  mmdLoadInstrument,
  type InstrumentLoadState,
} from './instr.js';

/** XMP_MAX_KEYS — note clamp. */
const XMP_MAX_KEYS = 121;

/** mmd1_test (mmd1_load.c:40-49) — signature check only; the title probe
 *  is folded into the registry test() contract. */
export function mmd1Test(bytes: Uint8Array): boolean {
  if (bytes.length < 4) return false;
  const id = String.fromCharCode(bytes[0]!, bytes[1]!, bytes[2]!, bytes[3]!);
  return id === 'MMD0' || id === 'MMD1' || id === 'MMDC';
}

/** Title read (mmd1_test :51-62 / mmd3_test :55-68): expdata->songname. */
export function mmdReadTitle(bytes: Uint8Array, start = 0): string {
  if (bytes.length < 36) return '';
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const offset = dv.getUint32(32, false); // expdata_offset
  if (offset) {
    const p = start + offset + 44;
    if (p + 8 > bytes.length) return '';
    const off2 = dv.getUint32(p, false);
    const len = dv.getUint32(p + 4, false);
    const q = start + off2;
    if (q >= bytes.length) return '';
    let s = '';
    for (let i = 0; i < len && q + i < bytes.length; i++) {
      const c = bytes[q + i]!;
      if (c === 0) break;
      s += String.fromCharCode(c);
    }
    return s;
  }
  return '';
}

/**
 * mmd1_load (mmd1_load.c:68-628). Handles MMD0, MMD1 and MMDC (packed MMD0).
 */
export function mmd1Load(bytes: Uint8Array, ctx: LoadCtx): ModuleData {
  const start = 0;
  let pos = start;
  const u8 = () => bytes[pos++] ?? 0;
  const s8 = () => ((u8() << 24) >> 24);
  const u16 = () => { const v = (bytes[pos]! << 8) | bytes[pos + 1]!; pos += 2; return v; };
  const s16 = () => (u16() << 16) >> 16;
  const u32 = () => {
    const v = ((bytes[pos]! << 24) | (bytes[pos + 1]! << 16) |
      (bytes[pos + 2]! << 8) | bytes[pos + 3]!) >>> 0;
    pos += 4;
    return v;
  };
  const seek = (p: number) => { pos = p; };
  const skip = (n: number) => { pos += n; };
  const raw = (n: number) => { const s = bytes.subarray(pos, pos + n); pos += n; return s; };

  // ver = id[3] - '1' + 1; MMDC ("C" > "1") wraps to ver 0 + mmdc flag.
  let ver = bytes[3]! - '1'.charCodeAt(0) + 1;
  let mmdc = 0;
  if (ver > 1) {
    ver = 0;
    mmdc = 1;
  }

  // Header (mmd1_load.c:107-128).
  seek(start + 4);
  u32(); // modlen
  const songOffset = u32();
  skip(4); // psecnum + pseq
  const blockarrOffset = u32();
  u32(); // reserved
  const smplarrOffset = u32();
  u32(); // reserved2
  const expdataOffset = u32();
  u32(); // reserved3
  skip(10); // pstate/pblock/pline/pseqnum/actplayline
  u8(); // counter
  u8(); // extra_songs

  // Song structure (mmd1_load.c:133-173).
  seek(start + songOffset);
  const song: MedSample[] = [];
  for (let i = 0; i < 63; i++) {
    song.push({
      rep: u16(), replen: u16(), midich: u8(), midipreset: u8(),
      svol: u8(), strans: s8(),
    });
  }
  const numblocks = u16();
  const songlen = u16();

  // Sanity check.
  if (numblocks > 255 || songlen > 256) {
    throw new ParseError(`MED: unsupported block count (${numblocks}) or song length (${songlen})`);
  }

  const playseq: number[] = [];
  for (let i = 0; i < 256; i++) playseq.push(u8());
  const deftempo = u16();
  const playtransp = s8();
  const flags = u8();
  const flags2 = u8();
  const tempo2 = u8();
  const trkvol: number[] = [];
  for (let i = 0; i < 16; i++) trkvol.push(u8());
  u8(); // mastervol
  const numsamples = u8();

  if (numsamples > 63) {
    throw new ParseError(`MED: invalid instrument count ${numsamples}`);
  }

  // Convert header (mmd1_load.c:176-196).
  let quirks: number = Quirk.RTONCE; /* FF1 */
  const stslide = (flags & FLAG_STSLIDE) !== 0;
  if (!stslide) quirks |= Quirk.VSALL | Quirk.PBALL;
  const hexvol = (flags & FLAG_VOLHEX) !== 0 ? 1 : 0;
  const med8ch = (flags & FLAG_8CHANNEL) !== 0 ? 1 : 0;
  const bpmOn = (flags2 & FLAG2_BPM) !== 0 ? 1 : 0;
  const bpmlen = 1 + (flags2 & FLAG2_BMASK);

  const { bpm, timeFactor } = mmdSetBpm(med8ch, deftempo, bpmOn, bpmlen);

  const pat = numblocks;
  const ins = numsamples;
  const len = songlen;
  const xxo = playseq.slice(0, len);

  // Read smplarr (mmd1_load.c:201-216).
  const smplarr: number[] = [];
  seek(start + smplarrOffset);
  for (let i = 0; i < ins; i++) {
    if (pos >= bytes.length) throw new ParseError(`MED: read error at smplarr pos ${i}`);
    smplarr.push(u32());
  }

  // Sample count scan (mmd1_load.c:221-250).
  let smp = 0;
  for (let i = 0; i < ins; i++) {
    if (smplarr[i] === 0) continue;
    seek(start + smplarr[i]!);
    u32(); // length
    const type = s16();
    if (type === -1 || type === -2) { // synth
      skip(14);
      const wforms = u16();
      if (wforms > 256) {
        throw new ParseError(`MED: invalid wform count at instrument ${i}`);
      }
      smp += wforms;
    } else if (type >= 1 && type <= 6) {
      smp += MMD_NUM_OCT[type - 1]!;
    } else {
      smp++;
    }
  }

  // Expdata (mmd1_load.c:255-315).
  const expdata = zeroExpData();
  let expsmpOffset = 0;
  let iinfoOffset = 0;
  let annotxtOffset = 0;
  let songnameOffset = 0;
  let title = '';
  let comment = '';
  if (expdataOffset) {
    seek(start + expdataOffset);
    u32(); // nextmod
    expsmpOffset = u32();
    expdata.s_ext_entries = u16();
    expdata.s_ext_entrsz = u16();
    annotxtOffset = u32();
    expdata.annolen = u32();
    iinfoOffset = u32();
    expdata.i_ext_entries = u16();
    expdata.i_ext_entrsz = u16();

    // Sanity check.
    if (expdata.annolen > 0x10000) {
      throw new ParseError(`MED: invalid expdata (annolen=0x${expdata.annolen.toString(16)})`);
    }

    u32(); // jumpmask
    u32(); // rgbtable
    skip(4); // channelsplit
    u32(); // n_info
    songnameOffset = u32();
    expdata.songnamelen = u32();

    seek(start + songnameOffset);
    let s = '';
    for (let i = 0; i < expdata.songnamelen; i++) {
      if (i >= 64) break; // XMP_NAME_SIZE
      const c = u8();
      if (c === 0) break;
      s += String.fromCharCode(c);
    }
    title = s;

    // Read annotation.
    if (annotxtOffset !== 0 && expdata.annolen !== 0) {
      seek(start + annotxtOffset);
      const buf = raw(expdata.annolen);
      let c = '';
      for (let i = 0; i < buf.length; i++) {
        const ch = buf[i]!;
        if (ch === 0) break;
        c += String.fromCharCode(ch);
      }
      comment = c;
    }
  }

  // Read blockarr (mmd1_load.c:319-335).
  const blockarr: number[] = [];
  seek(start + blockarrOffset);
  for (let i = 0; i < pat; i++) {
    if (pos > bytes.length) throw new ParseError(`MED: read error at blockarr pos ${i}`);
    blockarr.push(u32());
  }

  // Scan patterns for channel count (mmd1_load.c:340-380).
  let chn = 0;
  for (let i = 0; i < pat; i++) {
    if (blockarr[i] === 0) continue;
    seek(start + blockarr[i]!);
    let numtracks: number;
    let lines: number;
    if (ver > 0) {
      numtracks = u16();
      lines = u16();
    } else {
      numtracks = u8();
      lines = u8();
    }
    // Amiga OctaMED files have an upper bound of 3200 lines per block.
    if (lines + 1 > 3200) {
      throw new ParseError(`MED: invalid line count ${lines + 1} in block ${i}`);
    }
    if (numtracks > chn) chn = numtracks;
  }

  // MMD0/MMD1 can't have more than 16 channels.
  if (chn > Math.min(16, 64)) {
    throw new ParseError(`MED: invalid channel count ${chn}`);
  }

  const { medver, type } = mmdTrackerVersion(ver, mmdc, med8ch, expdataOffset ? expdata : null);

  // Patterns (mmd1_load.c:396-508).
  const patterns: Pattern[] = [];
  for (let i = 0; i < pat; i++) {
    if (blockarr[i] === 0) {
      // Empty block pointer: libxmp leaves the pattern zero-filled.
      const tracks: Pattern['tracks'] = [];
      for (let k = 0; k < chn; k++) {
        const ev: Event[] = [];
        for (let j = 0; j < 64; j++) ev.push({ note: 0, ins: 0, vol: 0, fxt: 0, fxp: 0, f2t: 0, f2p: 0 });
        tracks.push({ rows: 64, event: ev });
      }
      patterns.push({ rows: 64, tracks });
      continue;
    }

    seek(start + blockarr[i]!);
    let numtracks: number;
    let lines: number;
    if (ver > 0) {
      numtracks = u16();
      lines = u16();
      u32(); // blockinfo pointer
    } else {
      numtracks = u8();
      lines = u8();
    }
    const rows = lines + 1;
    const size = numtracks * rows * (ver ? 4 : 3);

    // MMDC is just MMD0 with simple pattern packing (mmd1_load.c:427-452).
    const patbuf = new Uint8Array(size);
    if (mmdc) {
      let j = 0;
      while (j < size) {
        const pack = u8();
        if (pack & 0x80) {
          // Run of 0.
          j += 256 - pack;
          continue;
        }
        // Uncompressed block.
        let n = pack + 1;
        if (n > size - j) n = size - j;
        patbuf.set(bytes.subarray(pos, pos + n), j);
        pos += n;
        j += n;
      }
    } else {
      if (pos + size > bytes.length) {
        throw new ParseError(`MED: read error in block ${i}`);
      }
      patbuf.set(bytes.subarray(pos, pos + size));
      pos += size;
    }

    const perTrack: Event[][] = [];
    for (let k = 0; k < chn; k++) {
      const evs: Event[] = [];
      for (let j = 0; j < rows; j++) evs.push({ note: 0, ins: 0, vol: 0, fxt: 0, fxp: 0, f2t: 0, f2p: 0 });
      perTrack.push(evs);
    }

    let p = 0;
    if (ver > 0) { // MMD1
      for (let j = 0; j < rows; j++) {
        for (let k = 0; k < numtracks; k++) {
          const e: Event = { note: patbuf[p]! & 0x7f, ins: 0, vol: 0, fxt: 0, fxp: 0, f2t: 0, f2p: 0 };
          if (e.note) e.note += 12 + playtransp;
          if (e.note >= XMP_MAX_KEYS) e.note = 0;

          e.ins = patbuf[p + 1]! & 0x3f;
          e.fxt = patbuf[p + 2]!;
          e.fxp = patbuf[p + 3]!;
          mmdXlatFx(e, bpmOn, bpmlen, med8ch, hexvol);
          perTrack[k]![j] = e;
          p += 4;
        }
      }
    } else { // MMD0
      for (let j = 0; j < rows; j++) {
        for (let k = 0; k < numtracks; k++) {
          const e: Event = { note: patbuf[p]! & 0x3f, ins: 0, vol: 0, fxt: 0, fxp: 0, f2t: 0, f2p: 0 };
          if (e.note) e.note += 12 + playtransp;
          if (e.note >= XMP_MAX_KEYS) e.note = 0;

          e.ins =
            (patbuf[p + 1]! >> 4) | ((patbuf[p]! & 0x80) >> 3) |
            ((patbuf[p]! & 0x40) >> 1);

          e.fxt = patbuf[p + 1]! & 0x0f;
          e.fxp = patbuf[p + 2]!;
          mmdXlatFx(e, bpmOn, bpmlen, med8ch, hexvol);
          perTrack[k]![j] = e;
          p += 3;
        }
      }
    }

    const tracksArr: Pattern['tracks'] = [];
    for (let k = 0; k < chn; k++) tracksArr.push({ rows, event: perTrack[k]! });
    patterns.push({ rows, tracks: tracksArr });
  }

  // Instruments (mmd1_load.c:519-611).
  const instruments: Instrument[] = [];
  for (let i = 0; i < ins; i++) {
    instruments.push({
      name: '',
      volume: 0x40,
      nsm: 0,
      rls: 0,
      map: new Array<number>(121).fill(0),
      mapXpo: new Array<number>(121).fill(0),
      sub: [],
      aei: { flags: 0, npt: 0, scl: 0, sus: 0, sue: 0, lps: 0, lpe: 0, x: [], y: [] },
      fei: { flags: 0, npt: 0, scl: 0, sus: 0, sue: 0, lps: 0, lpe: 0, x: [], y: [] },
      pei: { flags: 0, npt: 0, scl: 0, sus: 0, sue: 0, lps: 0, lpe: 0, x: [], y: [] },
    });
  }

  // Instrument extras (InstrExt array).
  const expSmp: MedInstrExt[] = new Array(ins);
  for (let i = 0; i < ins; i++) expSmp[i] = zeroInstrExt();
  if (expsmpOffset) {
    seek(start + expsmpOffset);
    const list = readInstrExtArray(
      (n) => { if (n) skip(n); return u8(); },
      () => u16(),
      () => u32(),
      (d) => skip(d),
      ins,
      expdata,
      false,
    );
    for (let i = 0; i < list.length; i++) expSmp[i] = list[i]!;
  }

  // Instrument names.
  if (iinfoOffset) {
    seek(start + iinfoOffset);
    const names = readInstrInfoArray((n) => raw(n), (d) => skip(d), ins, expdata);
    for (let i = 0; i < names.length && i < ins; i++) {
      // libxmp_instrument_name (common.c:230-234) clamps to 31 chars.
      instruments[i]!.name = names[i]!.slice(0, 31);
    }
  }

  // Sample data — register through the load context (the store assigns
  // the sample ids that sub.sid values reference).
  const samples: RawSample[] = new Array(smp);
  const st: InstrumentLoadState = {
    bytes, start, pos, ver, samples, instruments, expdata, expSmp, song,
  };
  let smpIdx = 0;
  for (let i = 0; i < ins; i++) {
    if (smplarr[i] === 0) continue;
    st.pos = start + smplarr[i]!;
    smpIdx = mmdLoadInstrument(st, i, smpIdx);
  }
  void smpIdx;
  for (const raw of samples) {
    if (raw) ctx.addSample(raw);
  }

  // Channel volumes + LRLR pans (mmd1_load.c:613-616). DEFPAN(x) with the
  // context default defpan=100 is identity — but the pan VALUE here is the
  // LRLR pattern through DEFPAN: 0x80 + (pattern - 0x80) with pattern 0/255
  // (clamped by the shared load_helpers epilogue).
  const channels: Channel[] = [];
  for (let i = 0; i < chn; i++) {
    const pattern = Math.floor((i + 1) / 2) % 2 * 0xff;
    channels.push({
      vol: trkvol[i] ?? 0,
      pan: Math.min(255, Math.max(0, 0x80 + (pattern - 0x80))),
      flg: 0,
    });
  }

  const mod: ModuleData = {
    title,
    format: 'med',
    comment,
    chn,
    pat,
    ins,
    len,
    restart: 0,
    xxo,
    channels,
    patterns,
    instruments,
    samples: samples.map((s) => s ?? { name: '', data: new Uint8Array(0), length: 0, loopStart: 0, loopEnd: 0, sustainStart: 0, sustainEnd: 0, finetune: 0, volume: 0, flags: 0, c5spd: 8363 }),
    num_sequences: 0,
    sequences: [],
    speed: tempo2,
    bpm,
    volbase: 0x40,
    gvolbase: 0x40,
    gvol: 0x40,
    quirks,
    flowMode: 0,
    readEventType: ReadEventType.MED,
    periodType: 0,
    defpan: 0x80,
    time_factor: timeFactor,
    rrate: 250,
    c4rate: C4_NTSC_RATE,
    compare_vblank: false,
    tracker: type,
    extras: { kind: 'med', trackerVersion: medver },
  };

  void ctx.sampleRate;
  void ctx.outputRate;
  return mod;
}

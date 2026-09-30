// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Bitti09 — modplayjs contributors
// Ported from: libxmp src/loaders/mmd3_load.c (mmd3_test :48-72,
// mmd3_load :74-597). MMD2/MMD3 = OctaMED / OctaMED Soundstudio.

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
  MED_TIME_FACTOR,
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

const XMP_MAX_KEYS = 121;

/** mmd3_test (mmd3_load.c:48-72). */
export function mmd3Test(bytes: Uint8Array): boolean {
  if (bytes.length < 4) return false;
  const id = String.fromCharCode(bytes[0]!, bytes[1]!, bytes[2]!, bytes[3]!);
  return id === 'MMD2' || id === 'MMD3';
}

/** Title read shared with mmd1 (mmd3_test). */
export { mmdReadTitle } from './mmd1.js';

/**
 * mmd3_load (mmd3_load.c:74-597).
 */
export function mmd3Load(bytes: Uint8Array, ctx: LoadCtx): ModuleData {
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

  const id = String.fromCharCode(bytes[0]!, bytes[1]!, bytes[2]!, bytes[3]!);
  void id;
  const ver = bytes[3]! - '1'.charCodeAt(0) + 1;

  // Header (mmd3_load.c:117-123).
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

  // Song structure — MMD2song (mmd3_load.c:128-171).
  seek(start + songOffset);
  const song: MedSample[] = [];
  for (let i = 0; i < 63; i++) {
    song.push({
      rep: u16(), replen: u16(), midich: u8(), midipreset: u8(),
      svol: u8(), strans: s8(),
    });
  }
  const numblocks = u16();
  const songlen = u16(); // NOTE: number of sections in MMD2
  void songlen;
  const seqtableOffset = u32();
  u32(); // reserved
  const trackvolsOffset = u32();
  const numtracks = u16();
  const numpseqs = u16();
  const trackpansOffset = u32();
  u32(); // flags3
  u16(); // voladj
  u16(); // channels
  u8(); // mix_echotype
  u8(); // mix_echodepth
  u16(); // mix_echolen
  s8(); // mix_stereosep
  skip(223); // pad0
  const deftempo = u16();
  const playtransp = s8();
  const flags = u8();
  const flags2 = u8();
  const tempo2 = u8();
  skip(16); // pad1 (used to be trackvols)
  u8(); // mastervol
  const numsamples = u8();

  if (numsamples > 63) {
    throw new ParseError(`MED: invalid instrument count ${numsamples}`);
  }

  // Read sequence (mmd3_load.c:174-192).
  seek(start + seqtableOffset);
  const playseqOffset = u32();
  seek(start + playseqOffset);
  skip(32); // skip name
  u32();
  u32();
  const len = u16();

  if (len > 255) {
    throw new ParseError(`MED: unsupported song length ${len}`);
  }

  const xxo: number[] = [];
  for (let i = 0; i < len; i++) xxo.push(u16());

  // Convert header (mmd3_load.c:195-213).
  let quirks: number = Quirk.RTONCE;
  const stslide = (flags & FLAG_STSLIDE) !== 0;
  if (!stslide) quirks |= Quirk.VSALL | Quirk.PBALL;
  const hexvol = (flags & FLAG_VOLHEX) !== 0 ? 1 : 0;
  const med8ch = (flags & FLAG_8CHANNEL) !== 0 ? 1 : 0;
  const bpmOn = (flags2 & FLAG2_BPM) !== 0 ? 1 : 0;
  const bpmlen = 1 + (flags2 & FLAG2_BMASK);

  const { bpm, timeFactor } = mmdSetBpm(med8ch, deftempo, bpmOn, bpmlen);
  void timeFactor;

  const pat = numblocks;
  const ins = numsamples;

  // Read smplarr (mmd3_load.c:218-233).
  const smplarr: number[] = [];
  seek(start + smplarrOffset);
  for (let i = 0; i < ins; i++) {
    if (pos >= bytes.length) throw new ParseError(`MED: read error at smplarr pos ${i}`);
    smplarr.push(u32());
  }

  // Sample count scan (mmd3_load.c:238-258).
  let smp = 0;
  for (let i = 0; i < ins; i++) {
    if (smplarr[i] === 0) continue;
    seek(start + smplarr[i]!);
    u32(); // length
    const type = s16();
    if (type === -1 || type === -2) {
      skip(14);
      smp += u16(); // wforms
    } else if (type >= 1 && type <= 6) {
      smp += MMD_NUM_OCT[type - 1]!;
    } else {
      smp++;
    }
    if (pos > bytes.length) throw new ParseError(`MED: read error at sample ${i}`);
  }

  // Expdata (mmd3_load.c:263-322).
  const expdata = zeroExpData();
  let expsmpOffset = 0;
  let iinfoOffset = 0;
  let songnameOffset = 0;
  let mmdinfoOffset = 0;
  let title = '';
  let comment = '';
  if (expdataOffset) {
    seek(start + expdataOffset);
    u32(); // nextmod
    expsmpOffset = u32();
    expdata.s_ext_entries = u16();
    expdata.s_ext_entrsz = u16();
    u32(); // annotxt
    u32(); // annolen
    iinfoOffset = u32();
    expdata.i_ext_entries = u16();
    expdata.i_ext_entrsz = u16();

    if (expsmpOffset < 0 || iinfoOffset < 0) {
      throw new ParseError('MED: invalid expdata');
    }

    u32(); // jumpmask
    u32(); // rgbtable
    u32(); // channelsplit
    u32(); // n_info
    songnameOffset = u32();
    expdata.songnamelen = u32();
    u32(); // dumps
    mmdinfoOffset = u32();

    if (pos > bytes.length) throw new ParseError('MED: read error in expdata');

    seek(start + songnameOffset);
    let s = '';
    for (let i = 0; i < expdata.songnamelen; i++) {
      if (i >= 64) break; // XMP_NAME_SIZE
      const c = u8();
      if (c === 0) break;
      s += String.fromCharCode(c);
    }
    title = s;

    if (mmdinfoOffset !== 0) {
      // mmd_info_text (mmd_common.c:1056-1076): only ASCII type 1.
      seek(start + mmdinfoOffset);
      u32(); // skip next
      u16(); // skip reserved
      const type = u16();
      if (type === 1) {
        const infoLen = u32();
        if (infoLen > 0 && infoLen < bytes.length) {
          const buf = raw(infoLen);
          let c = '';
          for (let i = 0; i < buf.length; i++) {
            const ch = buf[i]!;
            if (ch === 0) break;
            c += String.fromCharCode(ch);
          }
          comment = c;
        }
      }
    }
  }

  // Read blockarr (mmd3_load.c:326-342).
  const blockarr: number[] = [];
  seek(start + blockarrOffset);
  for (let i = 0; i < pat; i++) {
    if (pos > bytes.length) throw new ParseError(`MED: read error at blockarr pos ${i}`);
    blockarr.push(u32());
  }

  // Scan patterns for channel count (mmd3_load.c:347-384).
  let chn = 0;
  let maxLines = 1;
  for (let i = 0; i < pat; i++) {
    if (blockarr[i] === 0) continue;
    seek(start + blockarr[i]!);
    const blockNumtracks = u16();
    const blockLines = u16();
    if (pos > bytes.length) throw new ParseError(`MED: read error at block ${i}`);

    // MED Soundstudio for Windows allows up to 9999 lines.
    if (blockLines + 1 > 9999) {
      throw new ParseError(`MED: invalid line count ${blockLines + 1} in block ${i}`);
    }
    if (blockNumtracks > chn) chn = blockNumtracks;
    if (blockLines + 1 > maxLines) maxLines = blockLines + 1;
  }

  if (chn <= 0 || chn > 64) {
    throw new ParseError(`MED: invalid channel count ${chn}`);
  }
  void numtracks;
  void numpseqs;

  const { medver, type } = mmdTrackerVersion(ver, 0, med8ch, expdataOffset ? expdata : null);

  void maxLines;

  // Patterns (mmd3_load.c:399-452).
  const patterns: Pattern[] = [];
  for (let i = 0; i < pat; i++) {
    if (blockarr[i] === 0) {
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
    const blockNumtracks = u16();
    const blockLines = u16();
    u32(); // FIXME: should try to load extra command pages when they exist.

    const rows = blockLines + 1;
    const size = blockNumtracks * rows * 4;
    if (pos + size > bytes.length) {
      throw new ParseError(`MED: read error in block ${i}`);
    }
    const patbuf = bytes.subarray(pos, pos + size);
    pos += size;

    const perTrack: Event[][] = [];
    for (let k = 0; k < chn; k++) {
      const evs: Event[] = [];
      for (let j = 0; j < rows; j++) evs.push({ note: 0, ins: 0, vol: 0, fxt: 0, fxp: 0, f2t: 0, f2p: 0 });
      perTrack.push(evs);
    }

    let p = 0;
    for (let j = 0; j < rows; j++) {
      for (let k = 0; k < blockNumtracks; k++) {
        const e: Event = { note: 0, ins: 0, vol: 0, fxt: 0, fxp: 0, f2t: 0, f2p: 0 };
        e.note = patbuf[p]! & 0x7f;
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

    const tracksArr: Pattern['tracks'] = [];
    for (let k = 0; k < chn; k++) tracksArr.push({ rows, event: perTrack[k]! });
    patterns.push({ rows, tracks: tracksArr });
  }

  // Instruments (mmd3_load.c:462-551).
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

  const expSmp: MedInstrExt[] = new Array(ins);  for (let i = 0; i < ins; i++) expSmp[i] = zeroInstrExt();
  if (expsmpOffset) {
    seek(start + expsmpOffset);
    const list = readInstrExtArray(
      (n) => { if (n) skip(n); return u8(); },
      () => u16(),
      () => u32(),
      (d) => skip(d),
      ins,
      expdata,
      true,
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

  // Sample data (mmd3_load.c:553-571).
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

  // Track volumes + pans (mmd3_load.c:573-590).
  const channels: Channel[] = [];
  seek(start + trackvolsOffset);
  for (let i = 0; i < chn; i++) {
    channels.push({ vol: u8(), pan: 0x80, flg: 0 });
  }
  if (trackpansOffset) {
    seek(start + trackpansOffset);
    for (let i = 0; i < chn; i++) {
      const p = 8 * s8();
      channels[i]!.pan = 0x80 + (p > 127 ? 127 : p);
    }
  } else {
    for (let i = 0; i < chn; i++) channels[i]!.pan = 0x80;
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
    time_factor: MED_TIME_FACTOR,
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

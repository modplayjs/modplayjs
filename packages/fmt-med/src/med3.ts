// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Bitti09 — modplayjs contributors
// Ported from: libxmp src/loaders/med3_load.c (med3_test :43-51,
// med3_load :247-458, unpack_block :95-244). MED 2.00 MED3 — nibble-packed
// bitmasked patterns, optional external instruments.

import type {
  Channel,
  Event,
  Instrument,
  LoadCtx,
  ModuleData,
  Pattern,
  RawSample,
  SubInstrument,
} from '@modplayjs/core';
import {
  ParseError,
  Quirk,
  ReadEventType,
  SampleFlags,
} from '@modplayjs/core';
import { FLAG_INSTRSATT, MED_TIME_FACTOR, mmdConvertTempo } from './mmdCommon.js';

const MASK = 0x80000000;

// M0F_* mask flags (med3_load.c:56-63).
const M0F_LINEMSK0F = 0x01;
const M0F_LINEMSK1F = 0x02;
const M0F_FXMSK0F = 0x04;
const M0F_FXMSK1F = 0x08;
const M0F_LINEMSK00 = 0x10;
const M0F_LINEMSK10 = 0x20;
const M0F_FXMSK00 = 0x40;
const M0F_FXMSK10 = 0x80;

const FX_VOLSLIDE = 0x0a;
const FX_BREAK = 0x0d;
const FX_EXTENDED = 0x0e;
const FX_S3M_BPM = 0xab;
const EX_RETRIG = 0x9;
const EX_DELAY = 0xd;
const FX_MED_RETRIG = 0x93;

/** MAGIC_MED3 = "MED\x03". */
export function med3Test(bytes: Uint8Array): boolean {
  if (bytes.length < 4) return false;
  return bytes[0] === 0x4d && bytes[1] === 0x45 && bytes[2] === 0x44 && bytes[3] === 0x03;
}

function makeSub(vol: number, sid: number): SubInstrument {
  return {
    vol, gvl: 0x40, pan: -1, xpo: 0, fin: 0, vwf: 0, vde: 0,
    vra: 0, vsw: 0, sid, rvv: 0, nna: 0, dct: 0, dca: 0, ifc: 0, ifr: 0,
  };
}

function makeInstrument(name: string, sid: number): Instrument {
  return {
    name,
    volume: 0x40,
    // med3_load never sets nsm for instruments the sample mask skips —
    // libxmp_init_instrument leaves them at 0.
    nsm: 0,
    rls: 0,
    map: new Array<number>(121).fill(0),
    mapXpo: new Array<number>(121).fill(0),
    sub: [makeSub(0, sid)],
    aei: { flags: 0, npt: 0, scl: 0, sus: 0, sue: 0, lps: 0, lpe: 0, x: [], y: [] },
    fei: { flags: 0, npt: 0, scl: 0, sus: 0, sue: 0, lps: 0, lpe: 0, x: [], y: [] },
    pei: { flags: 0, npt: 0, scl: 0, sus: 0, sue: 0, lps: 0, lpe: 0, x: [], y: [] },
  };
}

/** get_nibble/get_nibbles (med3_load.c:70-93). */
class NibbleReader {
  nbnum = 0;
  constructor(readonly mem: Uint8Array) {}
  getNibble(): number {
    const mloc = this.nbnum >> 1;
    const res = (this.nbnum & 0x1) ? (this.mem[mloc]! & 0x0f) : (this.mem[mloc]! >> 4);
    this.nbnum++;
    return res;
  }
  getNibbles(nbs: number): number {
    let res = 0;
    for (let i = 0; i < nbs; i++) {
      res = (res << 4) | this.getNibble();
    }
    return res;
  }
}

/** unpack_block (med3_load.c:95-244): expand the bitmasked nibble stream
 *  into a 3-byte-per-event pattern buffer (64 rows × 4 tracks) and convert
 *  to xmp events. Returns the 4×64 event grid ([track][row]). */
function unpackBlock(from: Uint8Array, convsz: number, trkn: number): Event[][] {
  const dv = new DataView(from.buffer, from.byteOffset, from.byteLength);
  let linemsk0 = dv.getUint32(0, false);
  let linemsk1 = dv.getUint32(4, false);
  let fxmsk0 = dv.getUint32(8, false);
  let fxmsk1 = dv.getUint32(12, false);
  const nr = new NibbleReader(from.subarray(16));
  let nibsLeft = convsz * 2;

  // patbuf: 64 rows × 4 tracks × 3 bytes (C allocates 3 * 4 * 64).
  const patbuf = new Uint8Array(3 * 4 * 64);

  for (let i = 0; i < 64; i++) {
    const lmActive = i < 32 ? (linemsk0 & MASK) !== 0 : (linemsk1 & MASK) !== 0;
    const fmActive = i < 32 ? (fxmsk0 & MASK) !== 0 : (fxmsk1 & MASK) !== 0;

    if (lmActive) {
      if (Math.trunc(trkn / 4) > nibsLeft) throw new ParseError('MED3: pattern overflow');
      nibsLeft -= Math.trunc(trkn / 4);

      let lmsk = nr.getNibbles(Math.trunc(trkn / 4));
      lmsk = (lmsk << (16 - trkn)) & 0xffff;
      let tmpto = i * trkn * 3;

      for (let bcnt = 0; bcnt < trkn; bcnt++) {
        if (lmsk & 0x8000) {
          if (nibsLeft < 3) throw new ParseError('MED3: pattern overflow');
          nibsLeft -= 3;
          patbuf[tmpto] = nr.getNibbles(2);
          patbuf[tmpto + 1] = nr.getNibble() << 4;
        }
        lmsk = (lmsk << 1) & 0xffff;
        tmpto += 3;
      }
    }

    if (fmActive) {
      if (Math.trunc(trkn / 4) > nibsLeft) throw new ParseError('MED3: pattern overflow');
      nibsLeft -= Math.trunc(trkn / 4);

      let lmsk = nr.getNibbles(Math.trunc(trkn / 4));
      lmsk = (lmsk << (16 - trkn)) & 0xffff;
      let tmpto = i * trkn * 3;

      for (let bcnt = 0; bcnt < trkn; bcnt++) {
        if (lmsk & 0x8000) {
          if (nibsLeft < 3) throw new ParseError('MED3: pattern overflow');
          nibsLeft -= 3;
          patbuf[tmpto + 1] = (patbuf[tmpto + 1]! | nr.getNibble()) & 0xff;
          patbuf[tmpto + 2] = nr.getNibbles(2);
        }
        lmsk = (lmsk << 1) & 0xffff;
        tmpto += 3;
      }
    }

    if (i < 32) {
      linemsk0 = (linemsk0 << 1) >>> 0;
      fxmsk0 = (fxmsk0 << 1) >>> 0;
    } else {
      linemsk1 = (linemsk1 << 1) >>> 0;
      fxmsk1 = (fxmsk1 << 1) >>> 0;
    }
  }

  // Convert (med3_load.c:176-234). trkn is mod->chn = 4 here.
  const grid: Event[][] = [];
  for (let j = 0; j < 4; j++) {
    const col: Event[] = [];
    for (let i = 0; i < 64; i++) {
      const e: Event = { note: 0, ins: 0, vol: 0, fxt: 0, fxp: 0, f2t: 0, f2p: 0 };
      e.note = patbuf[i * 12 + j * 3 + 0]!;
      if (e.note) e.note += 48;
      e.ins = patbuf[i * 12 + j * 3 + 1]! >> 4;
      if (e.ins) e.ins++;
      e.fxt = patbuf[i * 12 + j * 3 + 1]! & 0x0f;
      e.fxp = patbuf[i * 12 + j * 3 + 2]!;

      switch (e.fxt) {
        case 0x00: // arpeggio
        case 0x01: // slide up
        case 0x02: // slide down
        case 0x03: // portamento
        case 0x04: // vibrato?
          break;
        case 0x0c: // set volume (BCD)
          e.fxp = (((((e.fxp >> 4) & 0x0f) * 10) + (e.fxp & 0x0f)) & 0xff);
          break;
        case 0x0d: // volume slides
          e.fxt = FX_VOLSLIDE;
          break;
        case 0x0f: { // tempo/break
          if (e.fxp === 0) {
            e.fxt = FX_BREAK;
          } else if (e.fxp === 0xff) {
            e.fxp = 0;
            e.fxt = 0;
            e.vol = 1;
          } else if (e.fxp === 0xfe) {
            e.fxp = 0;
            e.fxt = 0;
          } else if (e.fxp === 0xf1) {
            // Retrigger once on tick 3.
            e.fxt = FX_EXTENDED;
            e.fxp = (EX_RETRIG << 4) | 3;
          } else if (e.fxp === 0xf2) {
            // Delay until tick 3.
            e.fxt = FX_EXTENDED;
            e.fxp = (EX_DELAY << 4) | 3;
          } else if (e.fxp === 0xf3) {
            // Retrigger every 2 ticks (TODO: buggy).
            e.fxt = FX_MED_RETRIG;
            e.fxp = 0x02;
          } else if (e.fxp <= 0xf0) {
            e.fxt = FX_S3M_BPM;
            e.fxp = mmdConvertTempo(e.fxp, 0, 0);
          } else {
            e.fxp = 0;
            e.fxt = 0;
          }
          break;
        }
        default:
          e.fxp = 0;
          e.fxt = 0;
      }
      col.push(e);
    }
    grid.push(col);
  }
  return grid;
}

/**
 * med3_load (med3_load.c:247-458).
 */
export function med3Load(bytes: Uint8Array, ctx: LoadCtx): ModuleData {
  let pos = 4; // skip magic
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
  const raw = (n: number) => { const s = bytes.subarray(pos, pos + n); pos += n; return s; };

  const instruments: Instrument[] = [];

  // Read instrument names (med3_load.c:267-279).
  for (let i = 0; i < 32; i++) {
    const buf: number[] = [];
    for (let j = 0; j < 40; j++) {
      const c = u8();
      buf.push(c);
      if (c === 0) break;
    }
    let s = '';
    for (let j = 0; j < buf.length && j < 32; j++) {
      const c = buf[j]!;
      if (c === 0) break;
      s += c > 127 || c < 0x20 || c === 0x7f ? '.' : String.fromCharCode(c);
    }
    instruments.push(makeInstrument(s, i));
  }

  // Read instrument volumes (med3_load.c:281-288).
  let mask = u32();
  for (let i = 0; i < 32; i++, mask = (mask << 1) >>> 0) {
    instruments[i]!.sub[0]!.vol = mask & MASK ? u8() : 0;
  }

  // Read instrument loops (med3_load.c:290-294).
  const lps: number[] = new Array(32).fill(0);
  mask = u32();
  for (let i = 0; i < 32; i++, mask = (mask << 1) >>> 0) {
    lps[i] = mask & MASK ? u16() : 0;
  }

  // Read instrument loop length (med3_load.c:296-303).
  const lpe: number[] = [];
  const len: number[] = [];
  const flg: number[] = [];
  mask = u32();
  for (let i = 0; i < 32; i++, mask = (mask << 1) >>> 0) {
    const lsiz = mask & MASK ? u16() : 0;
    len.push(lps[i]! + lsiz);
    lpe.push(lps[i]! + lsiz);
    flg.push(lsiz > 1 ? SampleFlags.LOOP : 0);
  }

  const chn = 4;
  const pat = u16();

  const modlen = u16();

  // Sanity check.
  if (modlen > 256 || pat > 256) {
    throw new ParseError('MED3: invalid pattern count or song length');
  }

  // Order list (med3_load.c:315): read modlen bytes.
  const xxo: number[] = [];
  for (let i = 0; i < modlen; i++) xxo.push(u8());

  const tempo = u16();
  const transp = s8();
  const flags = u8();
  const sliding = u16();
  pos += 4; // jumping mask
  pos += 16; // rgb

  const speed = 6;
  const bpm = mmdConvertTempo(tempo, 0, 0);
  const timeFactor = MED_TIME_FACTOR;

  // Read midi channels (med3_load.c:327-332).
  mask = u32();
  for (let i = 0; i < 32; i++, mask = (mask << 1) >>> 0) {
    if (mask & MASK) pos += 1;
  }

  // Read midi programs (med3_load.c:334-339).
  mask = u32();
  for (let i = 0; i < 32; i++, mask = (mask << 1) >>> 0) {
    if (mask & MASK) pos += 1;
  }

  let quirks: number = Quirk.RTONCE; /* FF1 */
  if (sliding === 6) quirks |= Quirk.VSALL | Quirk.PBALL;

  // Play transpose rides in every sub-instrument (med3_load.c:350-352).
  for (let i = 0; i < 32; i++) {
    instruments[i]!.sub[0]!.xpo = transp;
  }

  // Load and convert patterns (med3_load.c:356-417).
  const patterns: Pattern[] = [];
  for (let i = 0; i < pat; i++) {
    void u8(); // tracks (TODO: not clear if this should be respected)
    const b = u8();
    const convsz = u16();

    // conv buffer: 4 mask words + convsz bytes of nibble data.
    const conv = new Uint8Array(16 + convsz);
    const cv = new DataView(conv.buffer);
    let p16 = 0;

    if (b & M0F_LINEMSK00) cv.setUint32(p16, 0, false);
    else if (b & M0F_LINEMSK0F) cv.setUint32(p16, 0xffffffff, false);
    else cv.setUint32(p16, u32(), false);
    p16 += 4;

    if (b & M0F_LINEMSK10) cv.setUint32(p16, 0, false);
    else if (b & M0F_LINEMSK1F) cv.setUint32(p16, 0xffffffff, false);
    else cv.setUint32(p16, u32(), false);
    p16 += 4;

    if (b & M0F_FXMSK00) cv.setUint32(p16, 0, false);
    else if (b & M0F_FXMSK0F) cv.setUint32(p16, 0xffffffff, false);
    else cv.setUint32(p16, u32(), false);
    p16 += 4;

    if (b & M0F_FXMSK10) cv.setUint32(p16, 0, false);
    else if (b & M0F_FXMSK1F) cv.setUint32(p16, 0xffffffff, false);
    else cv.setUint32(p16, u32(), false);
    p16 += 4;

    const databytes = raw(convsz);
    if (databytes.length < convsz) throw new ParseError('MED3: truncated pattern');
    conv.set(databytes, 16);

    const grid = unpackBlock(conv, convsz, chn);

    const tracksArr: Pattern['tracks'] = [];
    for (let k = 0; k < chn; k++) tracksArr.push({ rows: 64, event: grid[k]! });
    patterns.push({ rows: 64, tracks: tracksArr });
  }

  // Load samples (med3_load.c:419-455).
  const samples: RawSample[] = [];
  for (let i = 0; i < 32; i++) {
    const sub = instruments[i]!.sub[0]!;
    sub.sid = i;
    samples.push({
      name: '',
      data: new Uint8Array(0),
      length: len[i]!,
      loopStart: lps[i]!,
      loopEnd: lpe[i]!,
      sustainStart: 0,
      sustainEnd: 0,
      finetune: 0,
      volume: sub.vol,
      flags: flg[i]!,
      c5spd: 8287,
    });
  }

  mask = u32();
  // hio_read32b at EOF returns -1 in libxmp (hio_read32b → read error →
  // the C int32 return is -1, i.e. all bits set → the loop then probes
  // every instrument as an external-file load).
  if (pos >= bytes.length) mask = 0xffffffff;
  for (let i = 0; i < 32; i++, mask = (mask << 1) >>> 0) {
    if ((~mask & MASK) !== 0) continue;

    if ((~flags & FLAG_INSTRSATT) !== 0) {
      // Song file (med3_load.c:428-434 → med_load_external_instrument,
      // mmd_common.c:995-1035): the sample data lives in a sibling file
      // named after the instrument, discovered via the harness's
      // externalDir hook (the C test suite sets an instrument path; the
      // browser preview has no filesystem so these stay empty).
      const inst = instruments[i]!;
      const s = samples[i]!;
      const external = ctx.externalInstrument;
      const data = external ? external(inst.name) : null;
      if (data && data.length > 0) {
        s.length = data.length;
        s.data = data;
        inst.nsm = 1;
      }
      continue;
    }

    // Module file.
    const inst = instruments[i]!;
    inst.nsm = 1;
    const s = samples[i]!;
    s.length = u32();
    if (s.length === 0) inst.nsm = 0;

    if (u16() !== 0) continue; // type — non-zero means external, keep empty

    // Read the sample data inline.
    const bytelen = s.length;
    const remaining = bytes.length - pos;
    const take = Math.min(bytelen, Math.max(0, remaining));
    s.data = bytes.subarray(pos, pos + take);
    pos += bytelen;
  }

  const channels: Channel[] = [];
  for (let i = 0; i < chn; i++) {
    // med3_load never touches channels — the prologue LRLR default
    // (load_helpers.c:334) applies.
    const pattern = Math.floor((i + 1) / 2) % 2 * 0xff;
    channels.push({ pan: Math.min(255, Math.max(0, 0x80 + (pattern - 0x80))), vol: 0x40, flg: 0 });
  }

  const mod: ModuleData = {
    title: '',
    format: 'med',
    comment: '',
    chn,
    pat,
    ins: 32,
    len: modlen,
    restart: 0,
    xxo,
    channels,
    patterns,
    instruments,
    samples,
    num_sequences: 0,
    sequences: [],
    speed,
    bpm,
    volbase: 0x40,
    gvolbase: 0x40,
    gvol: 0x40,
    quirks,
    flowMode: 0,
    // med3_load never sets read_event_type — prologue default (MOD) applies.
    readEventType: ReadEventType.MOD,
    periodType: 0,
    defpan: 0x80,
    time_factor: timeFactor,
    rrate: 250,
    c4rate: 8287,
    compare_vblank: false,
    tracker: 'MED 2.00 MED3',
    extras: { kind: 'med', trackerVersion: 0x0300 },
  };

  void ctx.sampleRate;
  void ctx.outputRate;
  void s8; void s16;
  return mod;
}

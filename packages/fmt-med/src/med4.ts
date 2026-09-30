// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Bitti09 — modplayjs contributors
// Ported from: libxmp src/loaders/med4_load.c (med4_test :46-54,
// fix_effect :56-108, nibble stream :110-169, med4_load :497-992).
// MED 2.10 MED4 — bitmasked nibble-stream patterns, synth/hybrid
// instruments (MSH0 chunks), and an IFF-style MEDV/ANNO tail.

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
import {
  FLAG_INSTRSATT,
  MED_TIME_FACTOR,
  MED_VER_210,
  mmdConvertTempo,
} from './mmdCommon.js';

const FX_VOLSLIDE = 0x0a;
const FX_BREAK = 0x0d;
const FX_EXTENDED = 0x0e;
const FX_S3M_BPM = 0xab;
const FX_SPEED = 0x0f;
const FX_MED_RETRIG = 0x93;
const EX_RETRIG = 0x9;
const EX_DELAY = 0xd;

/** MAGIC_MED4 = "MED\x04". */
export function med4Test(bytes: Uint8Array): boolean {
  if (bytes.length < 4) return false;
  return bytes[0] === 0x4d && bytes[1] === 0x45 && bytes[2] === 0x44 && bytes[3] === 0x04;
}

function makeSub(vol: number, sid: number): SubInstrument {
  return {
    vol, gvl: 0x40, pan: -1, xpo: 0, fin: 0, vwf: 0, vde: 0,
    vra: 0, vsw: 0, sid, rvv: 0, nna: 0, dct: 0, dca: 0, ifc: 0, ifr: 0,
  };
}

function makeInstrument(name: string): Instrument {
  return {
    name,
    volume: 0x40,
    nsm: 0,
    rls: 0,
    map: new Array<number>(121).fill(0),
    mapXpo: new Array<number>(121).fill(0),
    sub: [],
    aei: { flags: 0, npt: 0, scl: 0, sus: 0, sue: 0, lps: 0, lpe: 0, x: [], y: [] },
    fei: { flags: 0, npt: 0, scl: 0, sus: 0, sue: 0, lps: 0, lpe: 0, x: [], y: [] },
    pei: { flags: 0, npt: 0, scl: 0, sus: 0, sue: 0, lps: 0, lpe: 0, x: [], y: [] },
  };
}

/** fix_effect (med4_load.c:56-108). */
function fixEffect(e: { fxt: number; fxp: number; vol: number }, hexvol: number): void {
  switch (e.fxt) {
    case 0x00: // arpeggio
    case 0x01: // slide up
    case 0x02: // slide down
    case 0x03: // portamento
    case 0x04: // vibrato?
      break;
    case 0x09: // set speed (3.00+)
      if (e.fxp >= 0x01 && e.fxp <= 0x20) {
        e.fxt = FX_SPEED;
      } else {
        e.fxt = 0;
        e.fxp = 0;
      }
      break;
    case 0x0c: // set volume (BCD)
      if (!hexvol) {
        e.fxp = ((((e.fxp >> 4) & 0x0f) * 10) + (e.fxp & 0x0f)) & 0xff;
      }
      break;
    case 0x0d: // volume slides
      e.fxt = FX_VOLSLIDE;
      break;
    case 0x0f: // tempo/break
      if (e.fxp === 0) {
        e.fxt = FX_BREAK;
      } else if (e.fxp === 0xff) {
        e.fxp = 0;
        e.fxt = 0;
        e.vol = 1;
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
    default:
      e.fxp = 0;
      e.fxt = 0;
  }
}

/** Nibble stream (med4_load.c:110-169). */
class Stream {
  hasNibble = false;
  value = 0;
  pos: number;
  constructor(readonly bytes: Uint8Array, pos: number) { this.pos = pos; }
  read4(): number {
    this.hasNibble = !this.hasNibble;
    if (!this.hasNibble) {
      return this.value & 0x0f;
    } else {
      this.value = this.bytes[this.pos++] ?? 0;
      return this.value >> 4;
    }
  }
  read8(): number {
    const a = this.read4();
    const b = this.read4();
    return (a << 4) | b;
  }
  read12(): number {
    const a = this.read4();
    const b = this.read4();
    const c = this.read4();
    return (a << 8) | (b << 4) | c;
  }
  read16(): number {
    const a = this.read4();
    const b = this.read4();
    const c = this.read4();
    const d = this.read4();
    return ((a << 12) | (b << 8) | (c << 4) | d) & 0xffff;
  }
  readAligned16(bits: number): number {
    if (bits <= 4) return this.read4() << 12;
    if (bits <= 8) return this.read8() << 8;
    if (bits <= 12) return this.read12() << 4;
    return this.read16();
  }
}

/** struct temp_inst (med4_load.c:171-177). */
interface TempInst {
  name: string;
  loop_start: number;
  loop_end: number;
  volume: number;
  transpose: number;
}

export function med4Load(bytes: Uint8Array, ctx: LoadCtx): ModuleData {
  let pos = 4; // skip magic
  let commentText = '';
  // Instrument-loaders read through `curBytes`/`curDvL` so the external
  // instrument path can redirect them at a sibling file's bytes
  // (med4_load_external_instrument opens a separate hio handle).
  const dvL = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let curBytes = bytes;
  let curDvL = dvL;
  const u8 = () => bytes[pos++] ?? 0;
  const s8 = () => ((u8() << 24) >> 24);
  const u16 = () => { const v = (bytes[pos]! << 8) | bytes[pos + 1]!; pos += 2; return v; };
  const u32 = () => {
    const v = ((bytes[pos]! << 24) | (bytes[pos + 1]! << 16) |
      (bytes[pos + 2]! << 8) | bytes[pos + 3]!) >>> 0;
    pos += 4;
    return v;
  };
  const seek = (p: number) => { pos = p; };
  const skip = (n: number) => { pos += n; };

  let vermaj = 2;
  let vermin = 10;

  // Check if we have a MEDV chunk at the end of the file
  // (med4_load.c:521-540).
  {
    const save = pos;
    if (bytes.length > 2000) {
      const tailPos = bytes.length - 1024;
      const buf = bytes.subarray(tailPos);
      for (let i = 0; i < 1013; i++) {
        if (buf[i] === 0x4d && buf[i + 1] === 0x45 && buf[i + 2] === 0x44 &&
            buf[i + 3] === 0x56 && buf[i + 4] === 0 && buf[i + 5] === 0 &&
            buf[i + 6] === 0 && buf[i + 7] === 4) {
          vermaj = buf[i + 10]!;
          vermin = buf[i + 11]!;
          break;
        }
      }
    }
    pos = save;
  }

  const trackerType = `MED ${vermaj}.${String(vermin).padStart(2, '0')} MED4`;

  const m0 = u8();

  // Instrument mask (med4_load.c:546-562): variable-length big-endian mask
  // collected into a 64-bit value, left-aligned. Uses BigInt so >4-byte
  // masks keep C's semantics.
  let maskHi = 0;
  let mask = 0;
  {
    const bytesArr: number[] = [];
    let m = m0;
    for (let i = 0; m !== 0 && i < 8; i++, m = (m << 1) & 0xff) {
      if (m & 0x80) bytesArr.push(u8());
    }
    if (bytesArr.length > 0) {
      let big = 0n;
      for (const b of bytesArr) big = (big << 8n) | BigInt(b);
      big <<= BigInt(8 * (8 - bytesArr.length));
      maskHi = Number((big >> 32n) & 0xffffffffn);
      mask = Number(big & 0xffffffffn);
    }
  }

  // Read instrument names in temporary space (med4_load.c:564-607).
  const tempInst: TempInst[] = [];
  for (let i = 0; i < 64; i++) tempInst.push({ name: '', loop_start: 0, loop_end: 0, volume: 0, transpose: 0 });

  let numIns = 0;
  {
    // 64-bit mask test: C's `if ((int64)mask > 0) continue;` — a set bit in
    // the top byte of the sign position means the shifted value is negative
    // (keep iterating); a clear sign bit with nonzero value is positive
    // (skip). Emulate with BigInt.
    const m64base = (BigInt(maskHi) << 32n) | BigInt(mask >>> 0);
    for (let i = 0; i < 64; i++) {
      // C: (mask <<= 1) each iteration, 64-bit wraparound; test
      // (int64)mask > 0 → skip. BigInt shifts must wrap at 64 bits.
      const m64 = ((m64base << BigInt(i)) & 0xffffffffffffffffn);
      if (m64 === 0n) break;
      const asS64 = m64 >= (1n << 63n) ? m64 - (1n << 64n) : m64;
      if (asS64 > 0n) continue;

      numIns = i + 1;
      const t = tempInst[i]!;

      // Read flags.
      const c = u8();

      // Read instrument name.
      const size = u8();
      const nameBuf = bytes.subarray(pos, pos + size);
      pos += size;
      let s = '';
      for (let j = 0; j < nameBuf.length; j++) {
        const ch = nameBuf[j]!;
        if (ch === 0) break;
        s += ch > 127 || ch < 0x20 || ch === 0x7f ? '.' : String.fromCharCode(ch);
      }
      t.name = s;

      t.volume = 0x40;

      let loopLen = 0;
      if ((c & 0x01) === 0) t.loop_start = u16() << 1;
      if ((c & 0x02) === 0) loopLen = u16() << 1;
      if ((c & 0x04) === 0) u8(); // ? Tanko2 (MED 3.00 demo)
      if ((c & 0x08) === 0) u8(); // Tim Newsham's "span"
      if ((c & 0x30) === 0) t.volume = u8();
      if ((c & 0x40) === 0) t.transpose = s8();

      t.loop_end = t.loop_start + loopLen;

      // libxmp_copy_adjust(temp_inst[i].name, buf, 32) (med4_load.c:606 →
      // common.c:237-252) does memset(s, 0, n + 1) with n = 32 on a
      // char name[32] field — 1 byte spills into the int loop_start that
      // follows it in struct temp_inst, zeroing its low byte. This is a
      // real struct-overlap behavior in libxmp; replicate it so loop
      // starts match byte-for-byte (march of wonders: 2882 → 2816).
      // Note: C computes loop_end BEFORE this call, so loop_end keeps the
      // unmasked value (lpe=7574 while lps=2816 in march of wonders).
      t.loop_start &= ~0xff;
    }
  }

  const pat = u16();
  const len = u16();

  if (pos > bytes.length) throw new ParseError('MED4: truncated header');
  if (pat > 256 || len > 255) throw new ParseError('MED4: invalid pattern count or song length');

  // Order list.
  const xxo: number[] = [];
  for (let i = 0; i < len; i++) xxo.push(u8());

  // From MED V3.00 docs: primary tempo 1-240; 1-10 are Tracker-compatible.
  const tempo = u16();
  const transp = s8();
  const flags = s8();
  let speed = u16();

  const bpm = mmdConvertTempo(tempo, 0, 0);
  const timeFactor = MED_TIME_FACTOR;

  let quirks: number = Quirk.RTONCE; /* FF1 */
  let hexvol = 0;
  if ((~flags & 0x20) !== 0) quirks |= Quirk.VSALL | Quirk.PBALL; // sliding
  if ((flags & 0x10) !== 0) hexvol = 1; // dec/hex volumes

  // This is just a guess... (med4_load.c:645-648)
  if (vermaj === 2) speed = (flags & 0x20) !== 0 ? 5 : 6;

  pos += 20;
  const trkvol: number[] = [];
  for (let i = 0; i < 16; i++) trkvol.push(u8());
  u8(); // master vol

  // Play transpose rides in every instrument (med4_load.c:658-660).
  for (let i = 0; i < 64; i++) tempInst[i]!.transpose += transp;

  // Scan patterns to determine number of channels (med4_load.c:661-683).
  let chn = 0;
  const scanPos = pos;
  for (let i = 0; i < pat; i++) {
    const size = u8(); // pattern control block
    const c = u8();
    if (c > chn) chn = c;
    u8(); // skip number of rows
    const plen = u16();
    skip(size + plen - 4);
  }

  // Sanity check.
  if (chn > 16) throw new ParseError('MED4: invalid channel count');

  // Load and convert patterns (med4_load.c:692-825).
  const patterns: Pattern[] = [];
  pos = scanPos;
  for (let i = 0; i < pat; i++) {
    const size = u8(); // pattern control block
    // C captures `pos = hio_tell(f)` AFTER the size byte (med4_load.c:709):
    // the block-relative offsets (events at pos+size, next block at
    // pos+size+plen) are relative to this point.
    const blockPos = pos;
    const blockChn = u8();
    if (blockChn > chn) throw new ParseError(`MED4: channel count mismatch at pattern ${i}`);
    const rows = u8() + 1;
    const plen = u16();

    // Read control byte (med4_load.c:725-734).
    const ctl: number[] = [0, 0, 0, 0];
    for (let j = 0; j < 4; j++) {
      if (rows > j * 64) ctl[j] = u8();
      else break;
    }

    // Initialize masks (med4_load.c:739-763).
    const linemask: number[] = [];
    const fxmask: number[] = [];
    let numMasks = 0;
    for (let y = 0; y < 8; y++) {
      linemask.push(0);
      fxmask.push(0);
    }
    for (let y = 0; y < 8; y++) {
      if (rows > y * 32) {
        const c = ctl[Math.trunc(y / 2)]!;
        const s = 4 * (y % 2);
        linemask[y] = (c & (0x80 >> s)) !== 0 ? 0xffffffff
          : (c & (0x40 >> s)) !== 0 ? 0 : u32();
        fxmask[y] = (c & (0x20 >> s)) !== 0 ? 0xffffffff
          : (c & (0x10 >> s)) !== 0 ? 0 : u32();
        numMasks++;
      } else {
        break;
      }
    }

    const eventGrid: Event[][] = [];
    for (let k = 0; k < chn; k++) {
      const evs: Event[] = [];
      for (let j = 0; j < rows; j++) evs.push({ note: 0, ins: 0, vol: 0, fxt: 0, fxp: 0, f2t: 0, f2p: 0 });
      eventGrid.push(evs);
    }

    seek(blockPos + size);
    const stream = new Stream(bytes, pos);

    for (let y = 0; y < numMasks; y++) {
      for (let j = 0; j < 32; j++) {
        const line = y * 32 + j;
        if (line >= rows) break;

        if ((linemask[y]! & 0x80000000) !== 0) {
          let chmsk = stream.readAligned16(blockChn);
          for (let k = 0; k < blockChn; k++, chmsk = (chmsk << 1) & 0xffff) {
            if ((chmsk & 0x8000) !== 0) {
              const x = stream.read12();
              const e = eventGrid[k]![line]!;
              e.note = x >> 4;
              if (e.note) e.note += 48;
              e.ins = x & 0x0f;
            }
          }
        }

        if ((fxmask[y]! & 0x80000000) !== 0) {
          let chmsk = stream.readAligned16(blockChn);
          for (let k = 0; k < blockChn; k++, chmsk = (chmsk << 1) & 0xffff) {
            if ((chmsk & 0x8000) !== 0) {
              const x = stream.read12();
              const e = eventGrid[k]![line]!;
              e.fxt = x >> 8;
              e.fxp = x & 0xff;
              fixEffect(e, hexvol);
            }
          }
        }

        linemask[y] = (linemask[y]! << 1) >>> 0;
        fxmask[y] = (fxmask[y]! << 1) >>> 0;
      }
    }

    seek(blockPos + size + plen);

    const tracksArr: Pattern['tracks'] = [];
    for (let k = 0; k < chn; k++) tracksArr.push({ rows, event: eventGrid[k]! });
    patterns.push({ rows, tracks: tracksArr });
  }

  // Load samples (med4_load.c:827-948). Song files reference external
  // instrument files (not supported in the browser preview — samples stay
  // empty); module files carry internal sample/synth chunks inline.
  const instruments: Instrument[] = [];
  for (let i = 0; i < numIns; i++) instruments.push(makeInstrument(tempInst[i]!.name));

  const samples: RawSample[] = [];
  let smpIdx = 0;

  const sampleCheck = (): void => {
    // Nothing to do: the JS port grows the samples array on demand.
  };

  /** med4_load_sampled_instrument (med4_load.c:190-247). */
  const loadSampled = (
    i: number, length: number, at: Pos,
  ): void => {
    const xxi = instruments[i]!;
    xxi.nsm = 1;
    xxi.sub = [makeSub(tempInst[i]!.volume, smpIdx)];

    const sub = xxi.sub[0]!;
    sub.vol = tempInst[i]!.volume;
    sub.xpo = tempInst[i]!.transpose;
    sub.sid = smpIdx;

    sampleCheck();

    const s: RawSample = {
      name: '',
      data: new Uint8Array(0),
      length,
      loopStart: tempInst[i]!.loop_start,
      loopEnd: tempInst[i]!.loop_end,
      sustainStart: 0,
      sustainEnd: 0,
      finetune: 0,
      volume: sub.vol,
      flags: tempInst[i]!.loop_end > 2 ? SampleFlags.LOOP : 0,
      c5spd: 8287,
    };
    const is16 = false;
    const bytelen = s.length * (is16 ? 2 : 1);
    const take = Math.min(bytelen, Math.max(0, curBytes.length - at.pos));
    s.data = curBytes.subarray(at.pos, at.pos + take);
    at.pos += bytelen;
    samples[smpIdx] = s;

    // Limit range to 3 octaves (see MED.El toro) (med4_load.c:232-243).
    for (let j = 0; j < 9; j++) {
      for (let k = 0; k < 12; k++) {
        let xpo = 0;
        if (j < 4) xpo = 12 * (4 - j);
        else if (j > 6) xpo = -12 * (j - 6);
        xxi.mapXpo[12 * j + k] = xpo;
      }
    }

    smpIdx++;
  };

  /** med4_load_synth_instrument (med4_load.c:252-418). */
  const loadSynth = (
    i: number, type: number, at: Pos,
  ): void => {
    const startPos = at.pos;

    // MSH0 check.
    if (startPos + 22 > curBytes.length) throw new ParseError('MED4: truncated synth');
    const magic = curDvL.getUint32(startPos, false);
    if (magic !== 0x4d534800) { // 'MSH\0'
      throw new ParseError(`MED4: invalid MSH0 at instrument ${i}`);
    }

    let p = startPos + 6; // skip magic + type2 (checked below)
    const type2 = (curDvL.getInt16(startPos + 4, false));
    if (type2 !== -1 && type2 !== -2) {
      throw new ParseError(`MED4: invalid type ${type2} on synth/hybrid ${i}`);
    }
    void type;

    p = startPos + 6;
    p += 4; // ? - 0000 twice
    const synthRep = curDvL.getUint16(p, false); p += 2;
    const synthReplen = curDvL.getUint16(p, false); p += 2;
    const voltbllen = curDvL.getUint16(p, false); p += 2;
    const wftbllen = curDvL.getUint16(p, false); p += 2;
    const volspeed = bytes[p]!; p += 1;
    const wfspeed = bytes[p]!; p += 1;
    const wforms = curDvL.getUint16(p, false); p += 2;
    void synthRep; void synthReplen;

    if (wforms === 0xffff) return;

    // Sanity check.
    if (voltbllen > 128 || wftbllen > 128 || wforms > 64) {
      throw new ParseError(`MED4: invalid synth tables at instrument ${i}`);
    }

    const voltblPos = p;
    p += voltbllen;
    const wftblPos = p;
    p += wftbllen;

    const wf: number[] = [];
    for (let j = 0; j < wforms; j++) {
      wf.push(curDvL.getUint32(p, false));
      p += 4;
    }

    const xxi = instruments[i]!;
    xxi.nsm = wforms;
    xxi.sub = [];
    for (let j = 0; j < wforms; j++) xxi.sub.push(makeSub(0, 0));
    xxi.extras = {
      vts: volspeed, wts: wfspeed, vtlen: voltbllen, wtlen: wftbllen,
      hold: 0, decay: 0, default_pitch: 0, finetune: 0,
      suppress_midi_off: 0, long_repeat: 0, long_replen: 0,
      volTable: curBytes.slice(voltblPos, voltblPos + voltbllen),
      wavTable: curBytes.slice(wftblPos, wftblPos + wftbllen),
    };
    // MED_MODULE_EXTRAS(*m)->tracker_version = MED_VER_210;

    sampleCheck();

    let j = 0;
    if (type === -2 && wforms > 0) { // Hybrid (med4_load.c:340-378)
      const sPos = startPos + wf[0]!;

      const length = curDvL.getUint32(sPos, false);
      if (curDvL.getUint16(sPos + 4, false) !== 0) {
        throw new ParseError(`MED4: hybrid ${i} has non-sample at pos 0`);
      }

      const sub = xxi.sub[0]!;
      sub.vol = tempInst[i]!.volume;
      sub.xpo = tempInst[i]!.transpose;
      sub.sid = smpIdx;

      const s: RawSample = {
        name: '',
        data: new Uint8Array(0),
        length,
        loopStart: tempInst[i]!.loop_start,
        loopEnd: tempInst[i]!.loop_end,
        sustainStart: 0,
        sustainEnd: 0,
        finetune: 0,
        volume: sub.vol,
        flags: tempInst[i]!.loop_end > 2 ? SampleFlags.LOOP : 0,
        c5spd: 8287,
      };
      const is16 = false;
      const bytelen = s.length * (is16 ? 2 : 1);
      const take = Math.min(bytelen, Math.max(0, curBytes.length - (sPos + 6)));
      s.data = curBytes.subarray(sPos + 6, sPos + 6 + take);
      samples[smpIdx] = s;
      smpIdx++;
      j++;
    }

    for (; j < wforms; j++) {
      const sub = xxi.sub[j]!;

      sub.vol = 64;
      sub.xpo = -24;
      sub.sid = smpIdx;

      const wPos = startPos + wf[j]!;
      const wlen = curDvL.getUint16(wPos, false) * 2;

      const s: RawSample = {
        name: '',
        data: new Uint8Array(0),
        length: wlen,
        loopStart: 0,
        loopEnd: wlen,
        sustainStart: 0,
        sustainEnd: 0,
        finetune: 0,
        volume: sub.vol,
        flags: SampleFlags.LOOP,
        c5spd: 8287,
      };
      const take = Math.min(wlen, Math.max(0, curBytes.length - (wPos + 2)));
      s.data = curBytes.subarray(wPos + 2, wPos + 2 + take);
      samples[smpIdx] = s;
      smpIdx++;
    }
  };

  /** med4_load_instrument (med4_load.c:420-446). */
  const loadInstrument = (
    i: number, length: number, type: number, at: Pos,
  ): void => {
    if (type === 0) { // Sampled
      loadSampled(i, length, at);
      return;
    }

    if (type === -1 || type === -2) { // Synthetic or Hybrid
      const sPos = at.pos;
      loadSynth(i, type, at);
      at.pos = sPos + length;
      return;
    }

    // Skip unknown instrument type.
    at.pos += length;
  };

  if ((~flags & FLAG_INSTRSATT) !== 0) {
    // Song file (med4_load.c:835-864 → med4_load_external_instrument
    // :448-495): each instrument's data lives in a sibling file named
    // after the instrument, resolved via the harness's externalInstrument
    // hook. A file starting with 'MSH\0' + type -1/-2 is an external
    // synth/hybrid; anything else is a raw sample.
    for (let i = 0; i < numIns; i++) {
      instruments[i]!.name = tempInst[i]!.name;
      instruments[i]!.nsm = 0;
      samples.push({
        name: '',
        data: new Uint8Array(0),
        length: 0,
        loopStart: tempInst[i]!.loop_start,
        loopEnd: tempInst[i]!.loop_end,
        sustainStart: 0,
        sustainEnd: 0,
        finetune: 0,
        volume: tempInst[i]!.volume,
        flags: tempInst[i]!.loop_end > 2 ? SampleFlags.LOOP : 0,
        c5spd: 8287,
      });
    }

    // Load externals (med4_load.c:844-856 → med4_load_external_instrument
    // :448-495): the C code opens each sibling file as a separate hio
    // handle and runs the synth/sample loaders against it, growing the
    // sample array on demand. We swap curBytes/curDvL to the external
    // buffer for the duration of each load.
    for (let i = 0; i < numIns; i++) {
      const inst = instruments[i]!;
      const data = ctx.externalInstrument ? ctx.externalInstrument(inst.name) : null;
      if (!data || data.length === 0) continue;
      const extLen = data.length;
      const edv = new DataView(data.buffer, data.byteOffset, data.byteLength);

      const savedBytes = curBytes;
      const savedDvL = curDvL;
      curBytes = data;
      curDvL = edv;
      try {
        if (extLen >= 6) {
          const magic = edv.getUint32(0, false);
          const type = edv.getInt16(4, false);
          if (magic === 0x4d534800 && (type === -1 || type === -2)) { // 'MSH\0'
            // External synth/hybrid: whole file is the synth chunk.
            const at: Pos = { pos: 0 };
            loadSynth(i, type, at);
            curBytes = savedBytes;
            curDvL = savedDvL;
            continue;
          }
        }
        // Raw sampled external: whole file is the sample data
        // (med4_load_sampled_instrument with length = hio_size).
        loadSampled(i, extLen, { pos: 0 });
      } finally {
        curBytes = savedBytes;
        curDvL = savedDvL;
      }
    }
  } else {
    // Sanity check (med4_load.c:619): pat > 256 or len > XMP_MAX_MOD_LENGTH.
    if (pat > 256 || len > 255) throw new ParseError('MED4: invalid pattern count or song length');

    // Internal samples (med4_load.c:866-944).
    const maskLo = u32();
    if (maskLo === 0x4d454456) { // 'MEDV' — module with no samples
      throw new ParseError('MED4: invalid module MED4 with no samples');
    }
    const maskHiLo = u32();

    // 64-bit mask, shifted left by 1 (no instrument #0).
    const fullMask = ((((BigInt(maskLo >>> 0) << 32n) | BigInt(maskHiLo >>> 0)) << 1n) & 0xffffffffffffffffn);

    const posSave = pos;
    // Faithful C count loop (med4_load.c:885-909): per entry read
    // {u32 len, i16 type}; samples +1; synths seek +20, add u16 wforms and
    // shrink len by 22; then seek len from the current position.
    let numSmp = 0;
    {
      numSmp = 0;
      let m = fullMask;
      let p = posSave;
      for (let i = 0; m !== 0n && i < 64; i++, m = (m << 1n) & 0xffffffffffffffffn) {
        const asS64 = m >= (1n << 63n) ? m - (1n << 64n) : m;
        if (asS64 > 0n) continue;
        // hio reads at EOF return 0/short and set an error; the C loop then
        // walks zero-length entries. Our buffer has no such slack — stop
        // when the 6-byte header no longer fits (matches C's net behavior
        // of loading only the real entries).
        if (p + 6 > bytes.length) break;

        let _len = dvL.getInt32(p, false);
        const _type = dvL.getInt16(p + 4, false);
        p += 6;

        if (_type === 0) {
          numSmp++;
        } else if (_type === -1 || _type === -2) {
          if (_len < 22) {
            throw new ParseError(`MED4: invalid synth ${i} length`);
          }
          p += 20;
          numSmp += dvL.getUint16(p, false);
          p += 2;
          _len -= 22;
        }

        if (_len < 0 || _len > bytes.length) {
          throw new ParseError(`MED4: invalid sample ${i} length`);
        }
        p += _len;
      }
    }

    pos = posSave;
    let m = fullMask;
    const at: Pos = { pos };
    for (let i = 0; m !== 0n && i < numIns; i++, m = (m << 1n) & 0xffffffffffffffffn) {
      const asS64 = m >= (1n << 63n) ? m - (1n << 64n) : m;
      if (asS64 > 0n) continue;

      const length = dvL.getInt32(at.pos, false);
      const type = dvL.getInt16(at.pos + 4, false);
      at.pos += 6;

      loadInstrument(i, length, type, at);
    }
    pos = at.pos;
  }

  for (const raw of samples) {
    if (raw) ctx.addSample(raw);
  }

  // IFF-like section (med4_load.c:950-987).
  {
    let p = pos;
    for (;;) {
      if (p + 8 > bytes.length) break;
      const id = dvL.getInt32(p, false);
      const size = dvL.getInt32(p + 4, false);
      if (id <= 0 || size <= 0) break;
      p += 8;

      if (id === 0x4d454456) { // 'MEDV'
        const ver = dvL.getUint32(p, false);
        vermaj = (ver & 0xff00) >> 8;
        vermin = ver & 0xff;
      } else if (id === 0x414e4e4f) { // 'ANNO'
        // Annotation: raw bytes → 1:1 charcodes via latin-1 mapping. Using
        // Buffer-style latin-1 decode keeps each byte as one U+00xx char so
        // the dump round-trips byte-for-byte like C's raw buffer.
        const readLen = Math.min(size, 1023);
        let c = '';
        for (let i = 0; i < readLen && p + i < bytes.length; i++) {
          const ch = bytes[p + i]!;
          if (ch === 0) break;
          c += String.fromCharCode(ch); // latin-1: byte === code point
        }
        commentText = c;
      }
      // 'HLD C' hold & decay: skipped.

      p += size;
    }
  }

  const channels: Channel[] = [];
  for (let i = 0; i < chn; i++) {
    // med4_load never touches channel pan — the prologue LRLR default
    // (load_helpers.c:334) applies. C integer division: (i+1)/2 truncates.
    const pattern = Math.floor((i + 1) / 2) % 2 * 0xff;
    channels.push({ pan: Math.min(255, Math.max(0, 0x80 + (pattern - 0x80))), vol: trkvol[i] ?? 0x40, flg: 0 });
  }

  const mod: ModuleData = {
    title: '',
    format: 'med',
    comment: commentText,
    chn,
    pat,
    ins: numIns,
    len,
    restart: 0,
    xxo,
    channels,
    patterns,
    instruments,
    samples: samples.map((s) => s ?? { name: '', data: new Uint8Array(0), length: 0, loopStart: 0, loopEnd: 0, sustainStart: 0, sustainEnd: 0, finetune: 0, volume: 0, flags: 0, c5spd: 8363 }),
    num_sequences: 0,
    sequences: [],
    speed,
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
    c4rate: 8287,
    compare_vblank: false,
    tracker: trackerType,
    extras: { kind: 'med', trackerVersion: (vermaj << 8) | vermin },
  };

  void ctx.sampleRate;
  void ctx.outputRate;
  void MED_VER_210;
  return mod;
}

interface Pos {
  pos: number;
}


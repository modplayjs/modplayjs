// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Bitti09 — modplayjs contributors
// Ported from: S3M file layout (s3m_load.c, S3M format spec) — write side.
// S3M writer: serialize a ModuleData into Scream Tracker 3 .s3m bytes.
// 8-bit unsigned PCM samples, old-format (SCRS) instruments, packed
// patterns, ≤ 100k patterns / 99 instruments / 64 channels per spec.

import type { ExportPlugin } from '@modplayjs/core';
import type { ModuleData } from '@modplayjs/core';

class ByteWriter {
  private buf = new Uint8Array(1024);
  private len = 0;

  private ensure(extra: number): void {
    if (this.len + extra > this.buf.length) {
      let size = this.buf.length * 2;
      while (size < this.len + extra) size *= 2;
      const next = new Uint8Array(size);
      next.set(this.buf.subarray(0, this.len));
      this.buf = next;
    }
  }

  u8(v: number): void {
    this.ensure(1);
    this.buf[this.len++] = v & 0xff;
  }

  u16le(v: number): void {
    this.ensure(2);
    this.buf[this.len++] = v & 0xff;
    this.buf[this.len++] = (v >> 8) & 0xff;
  }

  u32le(v: number): void {
    this.ensure(4);
    this.buf[this.len++] = v & 0xff;
    this.buf[this.len++] = (v >> 8) & 0xff;
    this.buf[this.len++] = (v >> 16) & 0xff;
    this.buf[this.len++] = (v >>> 24) & 0xff;
  }

  bytes(src: Uint8Array): void {
    this.ensure(src.length);
    this.buf.set(src, this.len);
    this.len += src.length;
  }

  ascii(text: string, width: number): void {
    this.ensure(width);
    for (let i = 0; i < width; i++) {
      this.buf[this.len++] = i < text.length ? text.charCodeAt(i) & 0xff : 0;
    }
  }

  zeros(n: number): void {
    this.ensure(n);
    this.buf.fill(0, this.len, this.len + n);
    this.len += n;
  }

  patchU16le(off: number, v: number): void {
    this.buf[off] = v & 0xff;
    this.buf[off + 1] = (v >> 8) & 0xff;
  }

  patchU32le(off: number, v: number): void {
    this.buf[off] = v & 0xff;
    this.buf[off + 1] = (v >> 8) & 0xff;
    this.buf[off + 2] = (v >> 16) & 0xff;
    this.buf[off + 3] = (v >>> 24) & 0xff;
  }

  get bytes_(): Uint8Array {
    return this.buf.subarray(0, this.len);
  }
}

const ASCII = (name: string | undefined): string =>
  (name ?? '').replace(/[^\x20-\x7e]/g, ' ');

/** Pack one pattern into S3M row encoding. */
function packPattern(pat: ModuleData['patterns'][number], chn: number): Uint8Array {
  const w = new ByteWriter();
  for (let r = 0; r < pat.rows; r++) {
    for (let c = 0; c < chn; c++) {
      const e = pat.tracks[c]?.event[r] ?? { note: 0, ins: 0, vol: 0, fxt: 0, fxp: 0, f2t: 0, f2p: 0 };
      const hasNote = e.note > 0 && e.note < 129;
      const hasVol = e.vol > 0;
      const hasFx = e.fxt !== 0;
      if (!hasNote && !hasVol && !hasFx) continue;

      let info = 0;
      const payload: number[] = [];
      if (hasNote) {
        info |= 0x20 | c; // note + instrument (S3M info bit 0x20)
        // our internal note is 1-based; S3M stores C-0 = 1
        payload.push(e.note - 1);
        payload.push(e.ins & 0xff);
      }
      if (hasVol) {
        info |= 0x40 | c;
        payload.push(Math.min(63, e.vol - 1)); // 0 = keep, 1..63 = 4..252
      }
      if (hasFx) {
        info |= 0x80 | c;
        payload.push(e.fxt & 0xff);
        payload.push(e.fxp & 0xff);
      }
      w.u8(info);
      for (const b of payload) w.u8(b);
    }
    w.u8(0); // end of row
  }
  w.u8(0); // end of pattern
  return w.bytes_;
}

const writeS3m = (mod: ModuleData): Uint8Array => {
  const w = new ByteWriter();
  const ordnum = Math.max(1, mod.len);
  const insnum = Math.min(99, mod.ins);
  const smpnum = Math.min(99, mod.samples.length);
  const patnum = mod.pat;
  const chnCount = Math.min(32, mod.chn);

  // ---- header (96 bytes) ----
  w.ascii(ASCII(mod.title).slice(0, 28), 28);
  w.u8(0x1a);
  w.u8(16); // type = module
  w.zeros(2); // reserved
  w.u16le(ordnum);
  w.u16le(insnum);
  w.u16le(patnum); // no smpnum in the S3M header — instruments ARE samples
  w.u16le(0);           // 0x26: flags — no ST2 vibrato etc.
  w.u16le(0x1300 >> 4); // 0x28: version (cwt/2 convention: 0x1300>>4)
  w.u16le(1);           // 0x2A: ffi — signed 8-bit PCM
  w.ascii('SCRM', 4);   // 0x2C: tag (loader: readmem32b@44)
  w.u8(mod.gvol & 0x7f);
  w.u8(mod.speed);
  w.u8(mod.bpm);
  w.u8(0x20); // master volume (0x2x = stereo)
  w.zeros(1); // ultraclick
  w.u8(0xfc); // default pan present
  w.zeros(8); // reserved
  w.zeros(2); // special: no custom data

  // channel setup (32 bytes): type byte per channel (0x00 L / 0x01 R... bit 8 set = disabled)
  for (let i = 0; i < 32; i++) {
    if (i < chnCount) {
      const pan = mod.channels[i]?.pan ?? 0x80;
      w.u8(pan >= 0x80 ? 0x08 : 0x00); // 0..7 = L-adc, 8..15 = R
    } else {
      w.u8(0xff); // disabled
    }
  }

  // order table
  for (let i = 0; i < ordnum; i++) w.u8(mod.xxo[i] ?? 0);

  // instrument / sample / pattern pointers (para-aligned, patched later)
  const insPtrPos = w.bytes_.length;
  for (let i = 0; i < insnum; i++) w.u16le(0);
  const patPtrPos = w.bytes_.length;
  for (let i = 0; i < patnum; i++) w.u16le(0);

  // default pan table (32 bytes, 0xfc marker written above)
  for (let i = 0; i < 32; i++) {
    w.u8(i < chnCount ? ((mod.channels[i]?.pan ?? 0x80) >> 4) & 0x0f : 0x08);
  }

  const smpDataOffs: number[] = [];

  // ---- instruments (old format, 0x50 bytes) ----
  // C2spd = c4rate; sample pointers are para (16-byte) offsets from
  // the file start — patched after data placement.
  const paraOf = (off: number): number => off >> 4;
  const insPtrs: number[] = [];
  for (let i = 0; i < insnum; i++) {
    while (w.bytes_.length % 16 !== 0) w.zeros(1);
    insPtrs.push(w.bytes_.length);
    const ins = mod.instruments[i]!;
    const s0 = ins.sub[0];
    const smp = s0 ? mod.samples[s0.sid] : undefined;
    w.u8(1);                                 // 0: type = sample
    w.ascii(ASCII(ins.name).slice(0, 12), 12); // 1: dos name (12)
    w.u8(0);                                 // 13: memseg hi
    const memsegPos = w.bytes_.length;
    w.u16le(0);                              // 14: memseg lo (patched)
    w.u32le(smp?.length ?? 0);               // 16: length
    w.u32le(smp && smp.loopEnd > smp.loopStart ? smp.loopStart : 0); // 20
    w.u32le(smp && smp.loopEnd > smp.loopStart ? smp.loopEnd : 0);   // 24
    w.u8(Math.min(64, smp?.volume ?? 64));   // 28: volume
    w.u8(0);                                 // 29: reserved
    w.u8(0);                                 // 30: pack — unpacked
    w.u8(smp && smp.loopEnd > smp.loopStart ? 1 : 0); // 31: flags — loop
    w.u16le(smp?.c5spd ?? 8363);             // 32: c2spd
    w.zeros(14);                             // 34: reserved
    w.ascii(ASCII(ins.name), 28);            // 48: sample name
    w.ascii('SCRS', 4);                      // 76: magic
    const seg = smpDataOffs[i] ?? 0;         // sample data placed earlier
    w.patchU16le(memsegPos, seg >> 4);
    w.patchU16le(insPtrPos + i * 2, insPtrs[i]! >> 4);
  }

  // ---- patterns ----
  const patPtrs: number[] = [];
  for (let p = 0; p < patnum; p++) {
    while (w.bytes_.length % 16 !== 0) w.zeros(1);
    patPtrs.push(w.bytes_.length);
    const packed = packPattern(mod.patterns[p]!, chnCount);
    w.u16le(packed.length + 2);
    w.bytes(packed);
  }

  // patch instrument pointers + memseg + sample para pointers
  for (let i = 0; i < insnum; i++) {
    const bodyStart = insPtrs[i]!;
    const seg = paraOf(smpDataOffs[i] ?? 0);
    w.patchU32le(insPtrPos + i * 2, paraOf(bodyStart));
    // memseg at body+0x0C: 3 bytes little-endian segment
    w.patchU16le(bodyStart + 0x0c, seg);
    w.u8; // (seg>>16 is 0 for files < 1MB)
  }

  // patch pattern pointers
  for (let i = 0; i < patnum; i++) w.patchU16le(patPtrPos + i * 2, paraOf(patPtrs[i]!));

  // ---- sample data (para aligned) ----
  for (let i = 0; i < smpnum; i++) {
    const s = mod.samples[i];
    const len = s?.length ?? 0;
    while (w.bytes_.length % 16 !== 0) w.zeros(1);
    smpDataOffs.push(w.bytes_.length);
    if (s) w.bytes(s.data.subarray(0, len));
  }


  void w.patchU32le;
  return w.bytes_;
};

export const s3mExportPlugin = (): ExportPlugin => ({
  name: 's3m',
  label: 'Scream Tracker 3 (.s3m)',
  extension: 's3m',
  supports: (mod: ModuleData) => mod.format === 's3m',
  write: writeS3m,
});

// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Bitti09 — modplayjs contributors
// Ported from: Extended Module file layout (xm_load.c, XM format 0x0104)
// — write side. XM writer: serialize a ModuleData into FastTracker II
// .xm bytes. Old-format (1-sample) instruments, packed patterns, delta
// sample data.

import type { ExportPlugin } from '@modplayjs/core';
import type { ModuleData, Pattern } from '@modplayjs/core';

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

/** Pack one XM pattern (each row: per-channel variable-length records). */
function packPattern(pat: Pattern, chn: number): Uint8Array {
  const w = new ByteWriter();
  for (let r = 0; r < pat.rows; r++) {
    for (let c = 0; c < chn; c++) {
      const e = pat.tracks[c]?.event[r] ?? { note: 0, ins: 0, vol: 0, fxt: 0, fxp: 0, f2t: 0, f2p: 0 };
      let type = 0;
      const fields: number[] = [];

      if (e.note > 0 && e.note < 130) { type |= 0x01; fields.push(e.note > 96 ? 97 : e.note); }
      if (e.ins > 0) { type |= 0x02; fields.push(e.ins & 0xff); }
      if (e.vol > 0) {
        type |= 0x04;
        // XM volume column: 0x10..0x50 = volume 0..64
        fields.push(0x10 + Math.min(64, e.vol) - 1);
      }
      if (e.fxt || e.fxp) {
        type |= 0x08;
        fields.push(e.fxt & 0x0f);
        fields.push(e.fxp & 0xff);
      }

      if (type === 0) {
        w.u8(0x80); // a single 0x80 byte = empty note+ins+vol+fx
      } else {
        w.u8(0x80 | type);
        for (const f of fields) w.u8(f);
      }
    }
  }
  return w.bytes_;
}

const writeXm = (mod: ModuleData): Uint8Array => {
  const w = new ByteWriter();
  const chnCount = Math.min(32, mod.chn);
  const patCount = mod.pat;
  const insCount = mod.ins;

  // ---- header: ID block (58) + version u16 + headersz u32 + fields ----
  w.ascii('Extended Module: ', 17);
  w.ascii(mod.title || '', 20);
  w.u8(0x1a);
  w.ascii('modplayjs', 20);
  w.u16le(0x0104);   // version 1.04
  w.u32le(20 + 256); // header size: fields (20) + order table (256)
  w.u16le(Math.min(256, mod.len));
  w.u16le(mod.restart);
  w.u16le(chnCount);
  w.u16le(patCount);
  w.u16le(insCount);
  w.u16le(1);        // flags: linear periods
  w.u16le(mod.speed);
  w.u16le(mod.bpm);
  for (let i = 0; i < 256; i++) w.u8(mod.xxo[i] ?? 0);

  // ---- patterns ----
  const patOffsets: number[] = [];
  for (let p = 0; p < patCount; p++) {
    while (w.bytes_.length % 4 !== 0) w.zeros(1);
    patOffsets.push(w.bytes_.length);
    const pat = mod.patterns[p]!;
    const packed = packPattern(pat, chnCount);
    // xphLength = the pattern HEADER size (9 = length u32 + packing u8
    // + rows u16 + packed-size u16); the packed-size field carries the
    // data length and the loader skips (xphLength - headsize) = 0 to
    // reach the data.
    w.u32le(9);
    w.u8(0); // packing type
    w.u16le(pat.rows);
    w.u16le(packed.length);
    w.bytes(packed);
  }

  // ---- instruments (old format: 1 instrument header + sample headers) ----
  const insOffsets: number[] = [];
  for (let i = 0; i < insCount; i++) {
    while (w.bytes_.length % 4 !== 0) w.zeros(1);
    insOffsets.push(w.bytes_.length);
    const ins = mod.instruments[i]!;
    w.u32le(4 + 22 + 1 + 2); // instrument header size (u32, incl. the size field)
    w.ascii(ins.name || '', 22);
    w.u8(0); // type
    w.u16le(ins.nsm > 0 ? 1 : 0); // sample count (old format = 1 max)
    w.u32le(40); // sample header size (shSize) — loader validates nsm vs shSize
    // sample header offset (u32le) patched after writing the instrument body
    const smpHdrOffPos = w.bytes_.length;
    w.u32le(0);
    if (ins.nsm > 0) {
      const sub = ins.sub[0]!;
      const smp = mod.samples[sub.sid];
      const smpHdrStart = w.bytes_.length;
      w.patchU32le(smpHdrOffPos, smpHdrStart);
      w.u32le(smp?.length ?? 0);
      w.u32le(smp?.loopStart ?? 0);
      w.u32le(smp && smp.loopEnd > smp.loopStart ? smp.loopEnd - smp.loopStart : 0);
      w.u8(smp && smp.loopEnd > smp.loopStart ? (smp.loopEnd - smp.loopStart > 16 ? 1 : 2) : 0);
      w.u8(smp?.volume ?? 64);
      w.u8(smp?.finetune ?? 0);
      w.u8(0); // type: 8-bit
      w.u8(0); // pan
      w.u8(sub.xpo >= 0 ? Math.min(127, sub.xpo) : Math.max(0, 128 + sub.xpo));
      w.u8(0); // reserved
      w.u16le(smp?.c5spd ?? 8363);
      w.zeros(2); // reserved
      w.ascii((smp?.name ?? '').slice(0, 22), 22);
      w.ascii('modplayjs', 8);
      // delta-encoded 8-bit data (XM stores deltas; loader accumulates)
      if (smp && smp.length) {
        let acc = 0;
        const delta = new Uint8Array(smp.length);
        for (let j = 0; j < smp.length; j++) {
          acc = (acc + (smp.data[j]! - 128)) & 0xff; // signed delta accumulate
          delta[j] = acc;
        }
        w.bytes(delta);
      }
    }
  }

  return w.bytes_;
};

export const xmExportPlugin = (): ExportPlugin => ({
  name: 'xm',
  label: 'FastTracker II (.xm)',
  extension: 'xm',
  supports: (mod: ModuleData) => mod.format === 'xm',
  write: writeXm,
});

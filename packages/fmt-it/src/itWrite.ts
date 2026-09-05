// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Bitti09 — modplayjs contributors
// Ported from: libxmp IT file layout (it_load.c, format spec) — write side.
// IT writer: serialize a ModuleData into Impulse Tracker .it bytes.
// Envelopes and MIDI macros are not written (flags 0) — the writer covers
// the studio's data model: order table, packed patterns (note/ins/vol/fx),
// new-format instruments, and 8-bit sample data.

import type { ExportPlugin } from '@modplayjs/core';
import type { ModuleData, Pattern } from '@modplayjs/core';

const MAGIC = 'IMPM';

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

  /** Overwrite a u32le at an absolute offset (patching pointers). */
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

const ASCII = (name: string | undefined): string => {
  const out = (name ?? '').replace(/[^\x20-\x7e]/g, ' ');
  return out.slice(0, 26);
};

/** Pack one pattern into IT row-mask encoding. */
function packPattern(pat: Pattern, chn: number): Uint8Array {
  const w = new ByteWriter();
  const last = Array.from({ length: chn }, () => ({ note: 0, ins: 0, vol: 0, fxt: 0, fxp: 0 }));

  for (let r = 0; r < pat.rows; r++) {
    for (let c = 0; c < chn; c++) {
      const e = pat.tracks[c]?.event[r] ?? { note: 0, ins: 0, vol: 0, fxt: 0, fxp: 0, f2t: 0, f2p: 0 };
      let mask = 0;
      const fields: number[] = [];

      const noteChanged = e.note !== last[c]!.note;
      const insChanged = e.ins !== last[c]!.ins;
      if (noteChanged || insChanged) mask |= 1 | 2; // IT requires note+ins together when either present
      if (e.vol > 0) mask |= 4;
      if (e.fxt || e.fxp) mask |= 8;

      // IT mask bits (it.ts parse): 0x01 = note, 0x02 = instrument,
      // 0x04 = volume, 0x08 = effect. Note byte = internal note - 1
      // (the loader adds 1 back: 'b = b + 1').
      if (mask & 1) fields.push((e.note - 1) & 0x7f);
      if (mask & 2) fields.push(e.ins & 0xff);
      if (mask & 4) fields.push(Math.min(64, e.vol));
      if (mask & 8) {
        fields.push(e.fxt & 0xff);
        fields.push(e.fxp & 0xff);
      }

      if (mask === 0) continue; // channel silent this row
      // Loader mask-byte channel decode: c = (b - 1) & 63 (it.ts:1216)
      w.u8(0x80 | ((c + 1) & 63));
      w.u8(mask);
      for (const f of fields) w.u8(f);

      last[c]!.note = e.note;
      last[c]!.ins = e.ins;
      last[c]!.vol = e.vol;
      last[c]!.fxt = e.fxt;
      last[c]!.fxp = e.fxp;
    }
    w.u8(0); // end of row
  }
  w.u8(0); // end of pattern
  return w.bytes_;
}

const writeIt = (mod: ModuleData): Uint8Array => {
  const w = new ByteWriter();
  const ordnum = Math.max(1, mod.len);
  const insnum = mod.ins;
  const smpnum = mod.samples.length;
  const patnum = mod.pat;

  // ---- header (192 bytes) ----
  // ---- header (192 bytes; offsets match itReadHeader: chpan@64, chvol@128) ----
  w.ascii(MAGIC, 4);                    // 0x00
  w.ascii(ASCII(mod.title), 26);        // 0x04
  w.u8(0);                              // 0x1E: hilite min
  w.u8(0);                              // 0x1F: hilite maj
  w.u16le(ordnum);                      // 0x20
  w.u16le(insnum);                      // 0x22
  w.u16le(smpnum);                      // 0x24
  w.u16le(patnum);                      // 0x26
  w.u16le(0x0214);                      // 0x28: cwt
  w.u16le(0x0214);                      // 0x2A: cmwt
  w.u16le(1);                           // 0x2C: flags — linear periods
  w.u16le(0);                           // 0x2E: special — no message
  w.u8(mod.gvol & 0x7f);                // 0x30: global volume
  w.u8(128);                            // 0x31: master volume
  w.u8(0);                              // 0x32: 'is' (unused)
  w.u8(mod.bpm & 0xff);                 // 0x33: initial tempo
  w.u8(128);                            // 0x34: pan separation
  w.u8(0);                              // 0x35: pitch wheel depth
  w.u16le(0);                           // 0x36: message length
  w.u32le(0);                           // 0x38: message offset
  w.u32le(0);                           // 0x3C: reserved
  // 0x40: channel pan table (bit 7 = muted); 0x80: channel volume table
  for (let i = 0; i < 64; i++) {
    w.u8(i < mod.chn ? ((mod.channels[i]?.pan ?? 0x80) & 0x7f) | 0x80 : 0x80);
  }
  for (let i = 0; i < 64; i++) {
    w.u8(i < mod.chn ? Math.min(64, (mod.channels[i]?.vol ?? 0x40) * 2) : 0);
  }

  // ---- order table at 192 ----
  for (let i = 0; i < ordnum; i++) {
    w.u8(mod.xxo[i] ?? 0);
  }

  // instrument / sample / pattern offset arrays (u32le each), patched later
  const insOffPos = w.bytes_.length;
  for (let i = 0; i < insnum; i++) w.u32le(0);
  const smpOffPos = w.bytes_.length;
  for (let i = 0; i < smpnum; i++) w.u32le(0);
  const patOffPos = w.bytes_.length;
  for (let i = 0; i < patnum; i++) w.u32le(0);

  // ---- patterns ----
  const patOffsets: number[] = [];
  for (let p = 0; p < patnum; p++) {
    while (w.bytes_.length % 4 !== 0) w.zeros(1); // u32 alignment
    patOffsets.push(w.bytes_.length);
    const packed = packPattern(mod.patterns[p]!, mod.chn);
    w.u16le(packed.length + 8); // pat_len: includes the 8-byte prologue
    w.u16le(mod.patterns[p]!.rows);
    w.u16le(0); // reserved
    w.u16le(0); // reserved
    w.bytes(packed);
  }

  // ---- instruments (new format, no envelopes) ----
  const insOffsets: number[] = [];
  for (let i = 0; i < insnum; i++) {
    while (w.bytes_.length % 4 !== 0) w.zeros(1);
    insOffsets.push(w.bytes_.length);
    const ins = mod.instruments[i]!;
    w.ascii(ASCII(ins.name), 26);
    w.zeros(1); // nos := 0 → new format
    w.u8(0); // reserved
    const sub0 = ins.sub[0];
    w.u8(sub0?.nna ?? 0); // NNA
    w.u8(sub0?.dct ?? 0); // DCT
    w.u8(sub0?.dca ?? 0); // DCA
    w.u16le(Math.min(0x7fff, Math.max(0, Math.round((ins.rls ?? 0) * 0.666)))); // fadeout
    w.u8(0x40); // pitch pan separation
    w.u8(0); // pitch pan center
    w.u8(0); // global volume
    w.u8(0); // default pan
    w.u32le(0); // random variation
    w.zeros(2);
    // Map: 120 note→sample entries (1-based in the file); subs index+1
    for (let k = 0; k < 120; k++) {
      const sub = ins.sub[ins.map[k] ?? 0];
      w.u8(sub ? (sub.sid + 1) & 0xff : 0);
    }
    // Envelope chunk: 1 byte flag... new format writes a full env section
    // per envelope: (u8 flags, u8 npt, u8 sus loop points...) + point data
    // All off: flags 0, npt 0, then the reserved tail (12+6+6+6+... = 36)
    w.zeros(1); // vol env flags
    w.zeros(1); // vol npt
    w.zeros(2 + 2); // sus + loop
    w.zeros(4); // point data u32le
    w.zeros(1); // pan env flags
    w.zeros(1); // pan npt
    w.zeros(2 + 2);
    w.zeros(4);
    w.zeros(1); // pitch env flags
    w.zeros(1); // pitch npt
    w.zeros(2 + 2);
    w.zeros(4);
    w.zeros(4); // reserved
    w.zeros(2); // dummy
  }

  // ---- samples (IMPS 80-byte header + data) ----
  const smpOffsets: number[] = [];
  for (let i = 0; i < smpnum; i++) {
    while (w.bytes_.length % 4 !== 0) w.zeros(1);
    smpOffsets.push(w.bytes_.length);
    const s = mod.samples[i]!;
    const looped = s.loopEnd > s.loopStart;
    // IMPS layout per loadItSample: len@48, loopbeg@52, loopend@56,
    // c5spd@60, sloopbeg@64, sloopend@68, dataofs@72; vit@79 = 80 bytes.
    w.ascii('IMPS', 4);                      // 0x00: magic
    w.ascii(ASCII(s.name).slice(0, 12), 13); // 0x04: dos filename (12 + nul)
    w.u8(0x40);                              // 0x11: global volume
    w.u8((looped ? 0x10 : 0) | 0x01);        // 0x12: flags — LOOP + sample present
    w.u8(Math.min(64, s.volume));            // 0x13: volume
    w.ascii(ASCII(s.name), 26);              // 0x14: name
    w.u8(0);                                 // 0x2E: cvt — unsigned, no compression
    w.u8(128);                               // 0x2F: default pan
    w.u32le(s.length);                       // 0x30: length
    w.u32le(looped ? s.loopStart : 0);       // 0x34: loop begin
    w.u32le(looped ? s.loopEnd : 0);         // 0x38: loop end
    w.u32le(s.c5spd ?? 8363);                // 0x3C: C-5 speed
    w.u32le(0);                              // 0x40: sustain begin
    w.u32le(0);                              // 0x44: sustain end
    const dataOffPos = w.bytes_.length;
    w.u32le(0);                              // 0x48: data offset (patched)
    w.zeros(8);                              // 0x4C..0x54: reserved (vit@79)
    w.patchU32le(dataOffPos, w.bytes_.length);
    w.bytes(s.data); // 8-bit unsigned sample data
  }

  // ---- patch offsets ----
  for (let i = 0; i < insnum; i++) w.patchU32le(insOffPos + i * 4, insOffsets[i]!);
  for (let i = 0; i < smpnum; i++) w.patchU32le(smpOffPos + i * 4, smpOffsets[i]!);
  for (let i = 0; i < patnum; i++) w.patchU32le(patOffPos + i * 4, patOffsets[i]!);

  return w.bytes_;
};

export const itExportPlugin = (): ExportPlugin => ({
  name: 'it',
  label: 'Impulse Tracker (.it)',
  extension: 'it',
  supports: (mod: ModuleData) => mod.format === 'it',
  write: writeIt,
});

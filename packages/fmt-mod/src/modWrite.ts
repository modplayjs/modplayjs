// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Bitti09 — modplayjs contributors
// Ported from: 31-instrument MOD file layout (mod_load.c, ProTracker
// format) — write side. MOD writer: serialize a ModuleData into
// NoiseTracker/ProTracker .mod bytes (M.K. variant).
//
// Limitations of the format (enforced here): ≤ 31 samples, 4 channels
// (8 ignored beyond 4 in the classic layout), ≤ 128 orders, ≤ 64-row
// patterns, ProTracker effect set only (unknown effects are dropped),
// notes as Amiga periods (C-3 .. B-8 range clamped to the period table).

import type { ExportPlugin } from '@modplayjs/core';
import type { ModuleData, Event } from '@modplayjs/core';

// ProTracker period table, octave 1 (rows C-1..B-1); other octaves divide by 2^n.
const PT_PERIODS = [
  856, 808, 762, 720, 678, 640, 604, 570, 538, 508, 480, 453,
];

const noteToPeriod = (note1: number): number => {
  // PT_PERIODS is the C-4 row (internal note 49): octave = key/12 - 4.
  // The loader's periodToNote (12*log2(PERIOD_BASE/period)+1) inverts
  // this exactly, so the round trip preserves internal notes.
  const key = note1 - 1;
  const oct = Math.floor(key / 12) - 4;
  const semi = key % 12;
  const base = PT_PERIODS[semi] ?? 0;
  if (base === 0) return 0;
  const period = Math.round(base / Math.pow(2, Math.max(0, oct)));
  return period >= 108 ? period : 108; // clamp to the loader's range
};

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

  u16be(v: number): void {
    this.ensure(2);
    this.buf[this.len++] = (v >> 8) & 0xff;
    this.buf[this.len++] = v & 0xff;
  }

  bytes(src: Uint8Array): void {
    this.ensure(src.length);
    this.buf.set(src, this.len);
    this.len += src.length;
  }

  ascii(text: string, width: number): void {
    this.ensure(width);
    for (let i = 0; i < width; i++) {
      this.buf[this.len++] = i < text.length ? text.charCodeAt(i) & 0x7f : 0;
    }
  }

  get bytes_(): Uint8Array {
    return this.buf.subarray(0, this.len);
  }
}

/** ProTracker effects: keep 0-F compatible ones, drop the rest. */
const writeEvent = (w: ByteWriter, e: Event): void => {
  const hasNote = e.note > 0 && e.note < 129;
  const period = hasNote ? noteToPeriod(e.note) : 0;
  // MOD cell: [ins-hi | period-hi(4b), period-lo(8b), ins-lo | fx-hi, fx-param]
  const insHi = (e.ins >> 4) & 0x0f;
  const insLo = e.ins & 0x0f;
  // only well-known ProTracker effects survive; extended S-effects map to none
  let fxt = e.fxt;
  let fxp = e.fxp;
  if (fxt > 0x0f) { fxt = 0; fxp = 0; }
  if (fxt === 0x0e) { fxt = 0; fxp = 0; } // S-effects: format-specific, dropped
  w.u8((insHi << 4) | ((period >> 8) & 0x0f));
  w.u8(period & 0xff);
  w.u8((insLo << 4) | (fxt & 0x0f));
  w.u8(fxp & 0xff);
};

const writeMod = (mod: ModuleData): Uint8Array => {
  const w = new ByteWriter();
  const smpCount = Math.min(31, mod.samples.length);
  void mod.chn; // classic MOD layout is 4 channels (M.K.)
  const patCount = Math.min(mod.pat, 64);

  // ---- title (20) + 31 sample headers (30 bytes each) ----
  w.ascii(mod.title || '', 20);
  for (let i = 0; i < 31; i++) {
    const s = i < mod.samples.length ? mod.samples[i] : undefined;
    w.ascii((s?.name ?? '').slice(0, 22), 22);
    if (!s || i >= smpCount) {
      w.u16be(0); // words (2 bytes per sample word = 4 bytes/word pair)
      w.u8(0); // finetune
      w.u8(0); // volume
      w.u16be(0); // repeat
      w.u16be(0); // replen
    } else {
      const looped = s.loopEnd > s.loopStart;
      w.u16be(Math.ceil(s.length / 2)); // words: 2 bytes per sample point
      w.u8(s.finetune & 0x0f);
      w.u8(Math.min(64, s.volume));
      w.u16be(looped ? s.loopStart : 0);
      w.u16be(looped ? s.loopEnd - s.loopStart : 0);
    }
  }

  // ---- song length (1 byte) + tempo (1 byte, unused in 15-song format but M.K. reads it) ----
  w.u8(Math.min(128, mod.len));
  w.u8(127); // old NoiseTracker tempo marker (ignored by M.K. loaders)

  // ---- order table (128 bytes; 0xFF past the end) ----
  for (let i = 0; i < 128; i++) {
    w.u8(i < mod.len && (mod.xxo[i] ?? 255) < patCount ? (mod.xxo[i] ?? 0) : 0xff);
  }

  // ---- signature ----
  w.ascii('M.K.', 4);

  // ---- patterns (64 rows, 4 channels × 4 bytes per note) ----
  for (let p = 0; p < patCount; p++) {
    const pat = mod.patterns[mod.xxo[p] ?? p];
    for (let r = 0; r < 64; r++) {
      for (let c = 0; c < 4; c++) {
        const e = pat?.tracks[c]?.event[r];
        if (e) writeEvent(w, e);
        else writeEvent(w, { note: 0, ins: 0, vol: 0, fxt: 0, fxp: 0, f2t: 0, f2p: 0 });
      }
    }
  }

  // ---- sample data (signed 8-bit: flip the sign bit of our unsigned bytes) ----
  for (let i = 0; i < smpCount; i++) {
    const s = mod.samples[i];
    if (!s || s.length === 0) continue;
    const signed = new Uint8Array(s.length);
    for (let j = 0; j < s.length; j++) {
      signed[j] = (s.data[j]! - 128) & 0xff; // unsigned → signed (two's complement)
    }
    w.bytes(signed);
  }

  return w.bytes_;
};

export const modExportPlugin = (): ExportPlugin => ({
  name: 'mod',
  label: 'ProTracker (.mod, M.K.)',
  extension: 'mod',
  supports: (mod: ModuleData) => mod.format === 'mod',
  write: writeMod,
});

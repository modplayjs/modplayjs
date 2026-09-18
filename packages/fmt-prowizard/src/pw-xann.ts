// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Bitti09 — modplayjs contributors
// Ported from: libxmp src/loaders/prowizard/xann.c (XANN Packer) —
// depack_xann :34-240, test_xann :243-296.

import { ptkTable, ptkIsValidNote } from './ptktable.js';
import { readmem16b, readmem32b, moveData, writeZero, pwReadTitle, type PwFormat } from './prowiz.js';

/** SMP_DESC_ADDRESS (xann.c:24) / PAT_DATA_ADDRESS (xann.c:25). */
const SMP_DESC_ADDRESS = 0x206;
const PAT_DATA_ADDRESS = 0x43c;

function put8(out: number[], b: number): void { out.push(b & 0xff); }
function put16b(out: number[], v: number): void { out.push((v >> 8) & 0xff, v & 0xff); }
function put32b(out: number[], v: number): void {
  out.push((v >>> 24) & 0xff, (v >> 16) & 0xff, (v >> 8) & 0xff, v & 0xff);
}

/** depack_xann (xann.c:34-240). */
function depackXann(data: Uint8Array, start: number): Uint8Array {
  let pos = start;
  const out: number[] = [];
  const u8 = () => data[pos++] ?? 0;
  const u16 = () => { const v = readmem16b(data, pos); pos += 2; return v; };
  const u32 = () => { const v = readmem32b(data, pos); pos += 4; return v; };

  writeZero(out, 20); // title

  // 31 sample headers (xann.c:41-63) at SMP_DESC_ADDRESS
  pos = start + SMP_DESC_ADDRESS;
  let ssize = 0;
  for (let i = 0; i < 31; i++) {
    writeZero(out, 22); // sample name
    const fine = u8();
    const vol = u8();
    let j = u32(); // loop start address
    const lsize = u16();
    const k = u32(); // sample address
    const size = u16();
    ssize += size * 2;

    j = j - k; // loop start value (xann.c:56)
    put16b(out, size);
    put8(out, fine);
    put8(out, vol);
    put16b(out, Math.trunc(j / 2));
    put16b(out, lsize);

    u16(); // bypass two unknown bytes
  }

  // Pattern table (xann.c:66-81) from offset 0
  pos = start;
  const ptable = new Array<number>(128).fill(0);
  let pat = 0;
  let c5 = 0;
  for (; c5 < 128; c5++) {
    const k = u32();
    if (k === 0) break;
    ptable[c5] = Math.trunc((k - 0x3c) / 1024) - 1;
    if (ptable[c5]! > pat) pat = ptable[c5]!;
  }
  pat++; // starts at $00 (xann.c:80)

  put8(out, c5);   // number of patterns
  put8(out, 0x7f); // noisetracker byte
  for (let i = 0; i < 128; i++) put8(out, ptable[i]!);
  put32b(out, 0x4d2e4b2e); // M.K.

  // Pattern data (xann.c:86-236) with the XANN effect translation table
  pos = start + PAT_DATA_ADDRESS;
  for (let i = 0; i < pat; i++) {
    for (let j = 0; j < 256; j++) {
      const ins = Math.trunc((u8() >> 3) & 0x1f);
      const note = u8();
      let fxt = u8();
      let fxp = u8();

      if (!ptkIsValidNote(note >> 1)) throw new Error('xann: invalid note');

      switch (fxt) {
        case 0x00: fxt = 0x00; break;              // no fxt
        case 0x04: fxt = 0x00; break;              // arpeggio
        case 0x08: fxt = 0x01; break;              // portamento up
        case 0x0c: fxt = 0x02; break;              // portamento down
        case 0x10: fxt = 0x03; break;              // tone porta, no fxp
        case 0x14: fxt = 0x03; break;              // tone portamento
        case 0x18: fxt = 0x04; break;              // vibrato, no fxp
        case 0x1c: fxt = 0x04; break;              // vibrato
        case 0x24: fxt = 0x05; break;              // tone porta + vol down
        case 0x28:                                   // vibrato + vol UP
          fxt = 0x06;
          fxp = (((fxp << 4) & 0xf0) | ((fxp >> 4) & 0x0f)) & 0xff;
          break;
        case 0x2c: fxt = 0x06; break;              // vibrato + vol DOWN
        case 0x38: fxt = 0x09; break;              // sample offset
        case 0x3c:                                   // volume slide up
          fxt = 0x0a;
          fxp = (((fxp << 4) & 0xf0) | ((fxp >> 4) & 0x0f)) & 0xff;
          break;
        case 0x40: fxt = 0x0a; break;              // volume slide down
        case 0x44: fxt = 0x0b; break;              // position jump
        case 0x48: fxt = 0x0c; break;              // set volume
        case 0x4c: fxt = 0x0d; break;              // pattern break
        case 0x50: fxt = 0x0f; break;              // set speed
        case 0x58: fxt = 0x0e; fxp = 0x01; break;  // set filter
        case 0x5c: fxt = 0x0e; fxp |= 0x10; break; // fine slide up
        case 0x60: fxt = 0x0e; fxp |= 0x20; break; // fine slide down
        case 0x84: fxt = 0x0e; fxp |= 0x90; break; // retrigger
        case 0x88: fxt = 0x0e; fxp |= 0xa0; break; // fine vol slide up
        case 0x8c: fxt = 0x0e; fxp |= 0xb0; break; // fine vol slide down
        case 0x94: fxt = 0x0e; fxp |= 0xd0; break; // note delay
        case 0x98: fxt = 0x0e; fxp |= 0xe0; break; // pattern delay
        default:
          fxt = 0;
          fxp = 0;
          break;
      }

      out.push((ins & 0xf0) | ptkTable[note >> 1]![0]);
      out.push(ptkTable[note >> 1]![1]);
      out.push(((ins << 4) & 0xf0) | fxt);
      out.push(fxp);
    }
  }

  // Sample data (xann.c:239): sequential after the pattern data.
  moveData(data, pos, out, ssize);

  return Uint8Array.from(out);
}

/** test_xann (xann.c:243-296). */
function testXann(data: Uint8Array, start: number): number {
  const s = data.length - start;
  if (s < 2048) return 2048 - s;

  // test 1 (xann.c:250-253)
  if (data[start + 3] !== 0x3c) return -1;

  // test 2 (xann.c:255-262)
  for (let i = 0; i < 128; i++) {
    const j = readmem32b(data, start + i * 4);
    const k = j & ~3;
    if (k !== j || j > 132156) return -1;
  }

  // test 4 (xann.c:270-277)
  for (let i = 0; i < 64; i++) {
    if (data[start + 3 + i * 4] !== 0x3c && data[start + 3 + i * 4] !== 0) {
      return -1;
    }
  }

  // test 5 (xann.c:279-283)
  for (let i = 0; i < 31; i++) {
    if (data[start + 519 + 16 * i]! > 0x40) return -1;
  }

  // test 6 (xann.c:285-296): sample addresses ascending and >= 2108
  for (let i = 0; i < 30; i++) {
    const j = readmem32b(data, start + 526 + 16 * i);
    const k = readmem32b(data, start + 520 + 16 * (i + 1));
    if (j < 2108 || k < 2108) return -1;
    if (j > k) return -1;
  }

  pwReadTitle(null, 0);

  return 0;
}

/** pw_xann: "XANN Packer". */
export const pwXann: PwFormat = {
  name: 'XANN Packer',
  test: testXann,
  depack: depackXann,
};

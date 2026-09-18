// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Bitti09 — modplayjs contributors
// Ported from: libxmp src/loaders/prowizard/tp1.c (Tracker Packer v1) —
// depack_tp1 :38-136, test_tp1 :139-199.

import { ptkTable, ptkIsValidNote } from './ptktable.js';
import { readmem16b, readmem32b, moveData, writeZero, type PwFormat } from './prowiz.js';

const PW_MOD_MAGIC = 0x4d2e4b2e; // 'M.K.'

function put8(out: number[], b: number): void { out.push(b & 0xff); }
function put16b(out: number[], v: number): void { out.push((v >> 8) & 0xff, v & 0xff); }
function put32b(out: number[], v: number): void {
  out.push((v >>> 24) & 0xff, (v >> 16) & 0xff, (v >> 8) & 0xff, v & 0xff);
}

/** depack_tp1 (tp1.c:38-136). */
function depackTp1(data: Uint8Array, start: number): Uint8Array {
  let pos = start;
  const out: number[] = [];

  const u8 = () => data[pos++] ?? 0;
  const u16 = () => { const v = readmem16b(data, pos); pos += 2; return v; };
  const u32 = () => { const v = readmem32b(data, pos); pos += 4; return v; };

  u32(); // skip magic
  u32(); // skip size
  // title (tp1.c:46): move 20 bytes verbatim
  for (let i = 0; i < 20; i++) out.push(data[pos++] ?? 0);
  const smpOfs = u32(); // sample data address

  // Sample headers (tp1.c:49-65)
  let ssize = 0;
  for (let i = 0; i < 31; i++) {
    writeZero(out, 22); // sample name
    const c3 = u8(); // finetune
    const c4 = u8(); // volume
    const size = u16();
    ssize += size * 2;
    put16b(out, size);
    put8(out, c3);
    put8(out, c4);
    put16b(out, u16()); // loop start
    put16b(out, u16()); // loop size
  }

  // Pattern table size (tp1.c:68-70)
  const len = u16() + 1;
  put8(out, len);
  put8(out, 0x7f); // ntk byte

  // Pattern addresses (tp1.c:72-82)
  const paddr: number[] = [];
  let patOfs = 0xffffffff;
  for (let i = 0; i < len; i++) {
    paddr.push(u32());
    if (patOfs > paddr[i]!) patOfs = paddr[i]!;
  }

  // Address ordering / dedup (tp1.c:85-98)
  const pnum = new Array<number>(128).fill(0);
  const paddrOrd: number[] = [paddr[0]!];
  let npat = 1;
  for (let i = 1; i < len; i++) {
    let j = 0;
    for (; j < i; j++) {
      if (paddr[i] === paddr[j]) {
        pnum[i] = pnum[j]!;
        break;
      }
    }
    if (j === i) {
      paddrOrd[npat] = paddr[i]!;
      pnum[i] = npat++;
    }
  }

  // Pattern list + magic (tp1.c:101-103)
  for (let i = 0; i < 128; i++) put8(out, pnum[i]!);
  put32b(out, PW_MOD_MAGIC);

  // Pattern data (tp1.c:106-134): 256 packed 4-byte groups per pattern,
  // relative to 794 + addr - patOfs.
  const pdata = new Uint8Array(1024);
  for (let i = 0; i < npat; i++) {
    pos = start + 794 + paddrOrd[i]! - patOfs;
    pdata.fill(0);
    for (let j = 0; j < 256; j++) {
      const p = j * 4;
      const c1 = u8();
      if (c1 === 0xc0) continue;
      if ((c1 & 0xc0) === 0x80) {
        // Effect-only row (tp1.c:117-123)
        const fxt = (c1 >> 2) & 0x0f;
        const fxp = u8();
        pdata[p + 2] = fxt;
        pdata[p + 3] = fxp;
        continue;
      }
      const c2 = u8();
      const c3 = u8();

      const note = (c1 & 0xfe) >> 1;
      if (!ptkIsValidNote(note)) throw new Error('tp1: invalid note');

      const ins = ((c2 >> 4) & 0x0f) | ((c1 << 4) & 0x10);
      const fxt = c2 & 0x0f;
      const fxp = c3;

      pdata[p] = (ins & 0xf0) | ptkTable[note]![0];
      pdata[p + 1] = ptkTable[note]![1];
      pdata[p + 2] = ((ins << 4) & 0xf0) | fxt;
      pdata[p + 3] = fxp;
    }
    for (let k = 0; k < 1024; k++) out.push(pdata[k]!);
  }

  // Sample data (tp1.c:137-141)
  moveData(data, start + smpOfs, out, ssize);

  return Uint8Array.from(out);
}

/** test_tp1 (tp1.c:139-199). */
function testTp1(data: Uint8Array, start: number): number {
  const s = data.length - start;
  if (s < 1024) return 1024 - s;

  if (
    data[start] !== 0x4d || data[start + 1] !== 0x45 || // 'ME'
    data[start + 2] !== 0x58 || data[start + 3] !== 0x58 // 'XX'
  ) {
    return -1;
  }

  // Size of the module (tp1.c:151-154)
  const size = readmem32b(data, start + 4);
  if (size < 794 || size > 2129178) return -1;

  for (let i = 0; i < 31; i++) {
    const d = start + i * 8 + 32;
    if (data[d]! > 0x0f) return -1;  // finetunes
    if (data[d + 1]! > 0x40) return -1; // volumes
  }

  // Sample data address (tp1.c:162-166)
  const smpOfs = readmem32b(data, start + 28);
  if (smpOfs === 0 || smpOfs > size) return -1;

  // Sample sizes (tp1.c:168-181)
  for (let i = 0; i < 31; i++) {
    const d = start + i * 8 + 32;
    const sz = readmem16b(data, d + 2) << 1;
    const lstart = readmem16b(data, d + 4) << 1;
    const lsize = readmem16b(data, d + 6) << 1;

    if (sz > 0xffff || lstart > 0xffff || lsize > 0xffff) return -1;
    if (lstart + lsize > sz + 2) return -1;
    if (lstart !== 0 && lsize === 0) return -1;
  }

  // Pattern list size (tp1.c:184-188)
  const len = readmem16b(data, start + 280) + 1;
  if (len > 128) return -1;

  return 0;
}

/** pw_tp1 (tp1.c:202-206): "Tracker Packer v1". */
export const pwTp1: PwFormat = {
  name: 'Tracker Packer v1',
  test: testTp1,
  depack: depackTp1,
};

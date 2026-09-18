// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Bitti09 — modplayjs contributors
// Ported from: libxmp src/loaders/prowizard/zen.c (Zen Packer) —
// depack_zen :32-158, test_zen :160-226.

import { ptkTable, ptkIsValidNote } from './ptktable.js';
import { readmem16b, readmem32b, moveData, writeZero, pwReadTitle, type PwFormat } from './prowiz.js';

const PW_MOD_MAGIC = 0x4d2e4b2e; // 'M.K.'

function put8(out: number[], b: number): void { out.push(b & 0xff); }
function put16b(out: number[], v: number): void { out.push((v >> 8) & 0xff, v & 0xff); }
function put32b(out: number[], v: number): void {
  out.push((v >>> 24) & 0xff, (v >> 16) & 0xff, (v >> 8) & 0xff, v & 0xff);
}

/** depack_zen (zen.c:32-158). */
function depackZen(data: Uint8Array, start: number): Uint8Array {
  let pos = start;
  const out: number[] = [];
  const u8 = () => data[pos++] ?? 0;
  const u16 = () => { const v = readmem16b(data, pos); pos += 2; return v; };
  const u32 = () => { const v = readmem32b(data, pos); pos += 4; return v; };

  const ptableAddr = u32(); // pattern table address
  const patMax = u8();      // patmax
  const patPos = u8();      // size of pattern table

  if (patPos >= 128 || patMax >= 128) throw new Error('zen: counts too large');

  writeZero(out, 20); // title

  // Sample headers (zen.c:52-77)
  let ssize = 0;
  let sdataAddr = 999999;
  for (let i = 0; i < 31; i++) {
    writeZero(out, 22); // sample name

    const finetune = Math.trunc(u16() / 0x48); // finetune (zen.c:56)
    u8();
    const vol = u8();

    const size = u16(); // sample size
    ssize += size * 2;

    put16b(out, size);
    put8(out, finetune);
    put8(out, vol);

    const loopSize = u16(); // loop size

    const k = u32(); // sample start addr
    if (k < sdataAddr) sdataAddr = k;

    // loop start address → (loopAddr - startAddr) / 2 (zen.c:70-72)
    const j = Math.trunc((u32() - k) / 2);

    put16b(out, j);
    put16b(out, loopSize);
  }

  put8(out, patPos);
  put8(out, 0x7f); // ntk byte

  // Pattern table (zen.c:82-85)
  pos = start + ptableAddr;
  const paddr: number[] = [];
  for (let i = 0; i < patPos; i++) paddr.push(u32());

  // Dedup pattern list (zen.c:88-105)
  const ptable = new Array<number>(128).fill(0);
  const paddr2 = new Array<number>(128).fill(0); // C zero-fills paddr2[128]
  let c4 = 0;
  for (let i = 0; i < patPos; i++) {
    if (i === 0) {
      ptable[0] = 0;
      paddr2[0] = paddr[0]!;
      c4++;
      continue;
    }
    let j = 0;
    for (; j < i; j++) {
      if (paddr[i] === paddr[j]) {
        ptable[i] = ptable[j]!;
        break;
      }
    }
    if (j === i) {
      paddr2[c4] = paddr[i]!;
      ptable[i] = c4;
      c4++;
    }
  }

  for (let i = 0; i < 128; i++) put8(out, ptable[i]!);
  put32b(out, PW_MOD_MAGIC);

  // Pattern data (zen.c:110-145): each group is 4 bytes; c1 is the row
  // index the cell belongs to. C quirk (zen.c:143): 'j = c1' CLOBBERS the
  // loop counter, so the file pointer advances by (c1 + 1) cells per
  // iteration — skip semantics, not a plain sequential read.
  for (let i = 0; i <= patMax; i++) {
    const pat = new Uint8Array(1024);
    pos = start + paddr2[i]!;
    let j = 0;
    while (j < 256) {
      const c1 = u8();
      const c2 = u8();
      const c3 = u8();
      const c4v = u8();

      const note = Math.trunc((c2 & 0x7f) / 2);
      if (!ptkIsValidNote(note)) throw new Error('zen: invalid note');

      const fxp = c4v;
      const ins = ((c2 << 4) & 0x10) | ((c3 >> 4) & 0x0f);
      const fxt = c3 & 0x0f;

      const p = c1 * 4;
      pat[p] = (ins & 0xf0) | ptkTable[note]![0];
      pat[p + 1] = ptkTable[note]![1];
      pat[p + 2] = fxt | ((ins << 4) & 0xf0);
      pat[p + 3] = fxp;

      j = c1;      // zen.c:143 — loop counter clobbered by the row index
      j++;         // for-loop increment applies to the clobbered value
    }
    for (let k = 0; k < 1024; k++) out.push(pat[k]!);
  }

  // Sample data (zen.c:150-153)
  moveData(data, start + sdataAddr, out, ssize);

  return Uint8Array.from(out);
}

/** test_zen (zen.c:160-226). */
function testZen(data: Uint8Array, start: number): number {
  const s = data.length - start;
  if (s < 9 + 16 * 31) return 9 + 16 * 31 - s;

  // test #2 (zen.c:166-170)
  const patOfs = readmem32b(data, start);
  if (patOfs < 502 || patOfs > 2163190) return -1;

  for (let i = 0; i < 31; i++) {
    const d = start + 16 * i;
    if (data[d + 9]! > 0x40) return -1;
    // finetune: word at d+6 must be a multiple of 0x48 (zen.c:173-176)
    if (readmem16b(data, d + 6) % 72 !== 0) return -1;
  }

  // smp sizes (zen.c:180-196)
  for (let i = 0; i < 31; i++) {
    const size = readmem16b(data, start + 10 + i * 16) << 1;
    const lsize = readmem16b(data, start + 12 + i * 16) << 1;
    const sdata = readmem32b(data, start + 14 + i * 16);

    if (size > 0xffff || lsize > 0xffff) return -1;
    if (sdata < patOfs) return -1;
  }

  // Pattern list size (zen.c:199-202)
  const len = data[start + 5]!;
  if (len === 0 || len > 0x7f) return -1;

  // PW_REQUEST_DATA(s, pat_ofs + len * 4 + 4)
  if (s < patOfs + len * 4 + 4) return patOfs + len * 4 + 4 - s;

  // End of pattern list must be $FFFFFFFF (zen.c:205-208)
  if (readmem32b(data, start + patOfs + len * 4) !== 0xffffffff) return -1;

  pwReadTitle(null, 0);

  return 0;
}

/** pw_zen: "Zen Packer". */
export const pwZen: PwFormat = {
  name: 'Zen Packer',
  test: testZen,
  depack: depackZen,
};

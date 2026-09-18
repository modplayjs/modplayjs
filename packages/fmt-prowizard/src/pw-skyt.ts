// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Bitti09 — modplayjs contributors
// Ported from: libxmp src/loaders/prowizard/skyt.c (SKYT Packer) —
// depack_skyt :32-127, test_skyt :129-146.

import { ptkTable, ptkIsValidNote } from './ptktable.js';
import { writeZero, pwReadTitle, type PwFormat } from './prowiz.js';

const PW_MOD_MAGIC = 0x4d2e4b2e; // 'M.K.'

function put8(out: number[], b: number): void { out.push(b & 0xff); }
function put16b(out: number[], v: number): void { out.push((v >> 8) & 0xff, v & 0xff); }
function put32b(out: number[], v: number): void {
  out.push((v >>> 24) & 0xff, (v >> 16) & 0xff, (v >> 8) & 0xff, v & 0xff);
}

/** depack_skyt (skyt.c:32-127). */
function depackSkyt(data: Uint8Array, start: number): Uint8Array {
  let pos = start;
  const out: number[] = [];
  const u8 = () => data[pos++] ?? 0;
  const u16 = () => { const v = (data[pos]! << 8) | data[pos + 1]!; pos += 2; return v; };
  const u32 = () => { const v = ((data[pos]! << 24) | (data[pos + 1]! << 16) | (data[pos + 2]! << 8) | data[pos + 3]!) >>> 0; pos += 4; return v; };

  writeZero(out, 20); // title

  // Sample descriptions (skyt.c:38-45)
  let ssize = 0;
  for (let i = 0; i < 31; i++) {
    for (let k = 0; k < 22; k++) out.push(0); // sample name
    const size = u16();
    put16b(out, size);
    ssize += size * 2;
    put8(out, u8()); // finetune
    put8(out, u8()); // volume
    put16b(out, u16()); // loop start
    put16b(out, u16()); // loop size
  }

  u32(); u32(); u32(); // bypass 8 empty bytes + "SKYT" ID

  const patPos = u8() + 1; // pattern table length
  if (patPos >= 128) throw new Error('skyt: too many patterns');
  put8(out, patPos);
  put8(out, 0x7f); // NoiseTracker byte

  // Track numbers → pattern list (skyt.c:51-63)
  const trkval: number[][] = [];
  let maxTrk = 0;
  for (let i = 0; i < patPos; i++) {
    const row: number[] = [];
    for (let j = 0; j < 4; j++) {
      const v = u16();
      row.push(v);
      if (v > maxTrk) maxTrk = v;
    }
    trkval.push(row);
  }

  // Pseudo pattern list (skyt.c:66-69): identity for used entries
  for (let i = 0; i < 128; i++) put8(out, i < patPos ? i : 0);

  put32b(out, PW_MOD_MAGIC);

  u8(); // bypass $00 unknown byte

  // Track data (skyt.c:74-113): track 0 is blank and not in the file.
  const trkAddr = pos;
  for (let i = 0; i < patPos; i++) {
    const pat = new Uint8Array(1024);
    for (let j = 0; j < 4; j++) {
      if (trkval[i]![j] === undefined || trkval[i]![j] === 0) continue;
      pos = trkAddr + ((trkval[i]![j] - 1) << 8);
      for (let k = 0; k < 64; k++) {
        const x = k * 16 + j * 4;

        const c1 = u8();
        const c2 = u8();
        const c3 = u8();
        const c4 = u8();

        if (!ptkIsValidNote(c1)) throw new Error('skyt: invalid note');

        pat[x] = (c2 & 0xf0) | ptkTable[c1]![0];
        pat[x + 1] = ptkTable[c1]![1];
        pat[x + 2] = ((c2 << 4) & 0xf0) | c3;
        pat[x + 3] = c4;
      }
    }
    for (let k = 0; k < 1024; k++) out.push(pat[k]!);
  }

  // Skip to end of tracks / start of sample data (skyt.c:117-119)
  pos = trkAddr + (maxTrk << 8);

  // Sample data (skyt.c:122-123)
  for (let k = 0; k < ssize && pos < data.length; k++) out.push(data[pos++] ?? 0);

  return Uint8Array.from(out);
}

/** test_skyt (skyt.c:129-146). */
function testSkyt(data: Uint8Array, start: number): number {
  const s = data.length - start;
  if (s < 8 * 31 + 12) return 8 * 31 + 12 - s;

  // test 2 (skyt.c:133-137)
  for (let i = 0; i < 31; i++) {
    if (data[start + 8 * i + 4]! > 0x40) return -1;
  }

  // "SKYT" at 256 (skyt.c:139-141)
  if (((data[start + 256]! << 24) | (data[start + 257]! << 16) | (data[start + 258]! << 8) | data[start + 259]!) !== 0x534b5954) {
    return -1;
  }

  pwReadTitle(null, 0);

  return 0;
}

/** pw_skyt: "SKYT Packer". */
export const pwSkyt: PwFormat = {
  name: 'SKYT Packer',
  test: testSkyt,
  depack: depackSkyt,
};

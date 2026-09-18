// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Bitti09 — modplayjs contributors
// Ported from: libxmp src/loaders/prowizard/heatseek.c (Heatseeker 1.0,
// depack_crb) — depack_crb :37-127, test_crb :135-247.

import { readmem16b, readmem24b, writeZero, pwReadTitle, type PwFormat } from './prowiz.js';

const PW_MOD_MAGIC = 0x4d2e4b2e; // 'M.K.'

function put8(out: number[], b: number): void { out.push(b & 0xff); }
function put16b(out: number[], v: number): void { out.push((v >> 8) & 0xff, v & 0xff); }
function put32b(out: number[], v: number): void {
  out.push((v >>> 24) & 0xff, (v >> 16) & 0xff, (v >> 8) & 0xff, v & 0xff);
}

/** depack_crb (heatseek.c:37-127). */
function depackCrb(data: Uint8Array, start: number): Uint8Array {
  let pos = start;
  const out: number[] = [];
  const u8 = () => data[pos++] ?? 0;
  const u16 = () => { const v = readmem16b(data, pos); pos += 2; return v; };

  writeZero(out, 20); // title

  // Sample descriptions (heatseek.c:43-52)
  let ssize = 0;
  for (let i = 0; i < 31; i++) {
    for (let k = 0; k < 22; k++) out.push(0); // sample name
    const size = u16();
    put16b(out, size);
    ssize += size * 2;
    put8(out, u8()); // finetune
    put8(out, u8()); // volume
    put16b(out, u16()); // loop start
    const loopSize = u16();
    put16b(out, loopSize !== 0 ? loopSize : 1);
  }

  const patPos = u8();
  put8(out, patPos);
  put8(out, u8()); // NoiseTracker byte

  // Pattern list (heatseek.c:56-63)
  const ptable: number[] = [];
  let patMax = 0;
  let i = 0;
  for (; i < 128; i++) {
    const c1 = u8();
    ptable.push(c1);
    put8(out, c1);
    if (c1 > patMax) patMax = c1;
  }
  patMax++;

  put32b(out, PW_MOD_MAGIC);

  // Pattern data (heatseek.c:66-121): per-track saved positions (taddr)
  // enable the 0xc0 repeat-block reference; 0x80 = skip rows (24-bit).
  const taddr: number[] = new Array(512).fill(0);
  for (i = 0; i < patMax; i++) {
    const pat = new Uint8Array(1024);
    for (let j = 0; j < 4; j++) {
      const x = pos;
      taddr[i * 4 + j] = x;
      for (let k = 0; k < 64; k++) {
        const y = k * 16 + j * 4;

        let c1 = u8();
        if (c1 === 0x80) {
          k += readmem24b(data, pos); pos += 3;
          continue;
        }
        if (c1 === 0xc0) {
          const m = readmem24b(data, pos); pos += 3;
          const l = pos;

          if (m >= 2048) throw new Error('crb: bad pattern reference');

          const saved = pos;
          pos = taddr[m >> 2]!;
          for (let m2 = 0; m2 < 64; m2++) {
            const x2 = m2 * 16 + j * 4;

            const cc = u8();
            if (cc === 0x80) {
              m2 += readmem24b(data, pos); pos += 3;
              continue;
            }
            pat[x2] = cc;
            pat[x2 + 1] = u8();
            pat[x2 + 2] = u8();
            pat[x2 + 3] = u8();
          }
          pos = saved;
          void l;
          k += 100;
          continue;
        }
        pat[y] = c1;
        pat[y + 1] = u8();
        pat[y + 2] = u8();
        pat[y + 3] = u8();
      }
    }
    for (let k = 0; k < 1024; k++) out.push(pat[k]!);
  }

  // Sample data (heatseek.c:124-126)
  for (let k = 0; k < ssize && pos < data.length; k++) out.push(data[pos++] ?? 0);

  return Uint8Array.from(out);
}

/** test_crb (heatseek.c:135-247). */
function testCrb(data: Uint8Array, start: number): number {
  const s = data.length - start;
  if (s < 378) return 378 - s;

  // Pattern table size (heatseek.c:139-143)
  if (data[start + 248]! > 0x7f || data[start + 248] === 0x00) return -1;

  // NoiseTracker byte (heatseek.c:145-148)
  if (data[start + 249] !== 0x7f) return -1;

  // Samples (heatseek.c:150-180)
  let ssize = 0;
  for (let i = 0; i < 31; i++) {
    const d = start + i * 8;

    if (data[d + 2]! > 0x0f) return -1;
    if (data[d + 3]! > 0x40) return -1;

    const len = readmem16b(data, d) << 1;
    const lstart = readmem16b(data, d + 4) << 1;
    const lsize = readmem16b(data, d + 6) << 1;

    if (len > 0xffff || lstart > 0xffff || lsize > 0xffff) return -1;
    if (lsize !== 0 && lsize !== 2 && lstart + lsize > len) return -1;
    if (lstart !== 0 && lsize <= 2) return -1;

    ssize += len;
  }
  if (ssize <= 4) return -1;

  // Pattern table (heatseek.c:186-195)
  let max = 0;
  for (let i = 0; i < 128; i++) {
    if (data[start + 250 + i]! > 0x7f) return -1;
    if (data[start + 250 + i]! > max) max = data[start + 250 + i]!;
  }
  max++;

  // Upper bound of packed pattern data or the sample data size (heatseek.c:198-200)
  const initData = Math.min(4 * max * 4 * 64, ssize);
  if (s < 378 + initData) return 378 + initData - s;

  // Notes (heatseek.c:203-241)
  let idx = 0;
  for (let i = 0; i < max; i++) {
    for (let j = 0; j < 4; j++) {
      for (let k = 0; k < 64; k++) {
        const d = start + 378 + idx;
        if (idx >= initData) {
          const left = 4 * 4 * (max - i - 1);
          if (s < 378 + idx + left + 4) return 378 + idx + left + 4 - s;
        }
        switch (data[d]! & 0xc0) {
          case 0x00:
            if ((data[d]! & 0x0f) > 0x03) return -1;
            idx += 4;
            break;
          case 0x40:
            idx += 4;
            break;
          case 0x80:
            if (data[d + 1] !== 0) return -1;
            k += data[d + 3]!;
            idx += 4;
            break;
          case 0xc0:
            if (data[d + 1] !== 0) return -1;
            k = 100;
            idx += 4;
            break;
          default:
            break;
        }
      }
    }
  }

  pwReadTitle(null, 0);

  return 0;
}

/** pw_crb: "Heatseeker 1.0". */
export const pwCrb: PwFormat = {
  name: 'Heatseeker 1.0',
  test: testCrb,
  depack: depackCrb,
};

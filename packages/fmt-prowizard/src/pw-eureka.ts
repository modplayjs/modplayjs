// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Bitti09 — modplayjs contributors
// Ported from: libxmp src/loaders/prowizard/eureka.c (Eureka Packer) —
// depack_eu :35-122, test_eu :125-218.

import { readmem16b, readmem32b, moveData, type PwFormat } from './prowiz.js';

const PW_MOD_MAGIC = 0x4d2e4b2e; // 'M.K.'

function put32b(out: number[], v: number): void {
  out.push((v >>> 24) & 0xff, (v >> 16) & 0xff, (v >> 8) & 0xff, v & 0xff);
}

/** depack_eu (eureka.c:35-122). Header is PTK-compatible. */
function depackEu(data: Uint8Array, start: number): Uint8Array {
  let pos = start;
  const out: number[] = [];

  // header: 1080 bytes moved verbatim (eureka.c:38-40)
  for (let i = 0; i < 1080; i++) out.push(data[pos++] ?? 0);

  // whole sample size (eureka.c:43-45): sizes at 42 + i*30
  let ssize = 0;
  for (let i = 0; i < 31; i++) {
    ssize += 2 * ((data[start + i * 30 + 42]! << 8) | data[start + i * 30 + 43]!);
  }

  // pattern list max (eureka.c:47-53)
  let npat = 0;
  for (let i = 0; i < 128; i++) {
    if (data[start + 952 + i]! > npat) npat = data[start + 952 + i]!;
  }
  npat++;

  put32b(out, PW_MOD_MAGIC);
  const smpAddr = readmem32b(data, pos); pos += 4; // sample data address

  // Track addresses (eureka.c:56-61)
  const trkAddr: number[][] = [];
  for (let i = 0; i < npat; i++) {
    const row: number[] = [];
    for (let j = 0; j < 4; j++) {
      row.push((data[pos]! << 8) | data[pos + 1]!);
      pos += 2;
    }
    trkAddr.push(row);
  }

  // Track data (eureka.c:64-110): 4 cell forms per 2-bit prefix.
  for (let i = 0; i < npat; i++) {
    const tmp = new Uint8Array(1024);
    for (let j = 0; j < 4; j++) {
      pos = start + trkAddr[i]![j]!;
      for (let k = 0; k < 64; k++) {
        const x = k * 16 + j * 4;
        const c1 = data[pos++] ?? 0;

        if ((c1 & 0xc0) === 0x00) {
          // full 4-byte cell (eureka.c:67-72)
          tmp[x] = c1;
          tmp[x + 1] = data[pos++] ?? 0;
          tmp[x + 2] = data[pos++] ?? 0;
          tmp[x + 3] = data[pos++] ?? 0;
          continue;
        }
        if ((c1 & 0xc0) === 0xc0) {
          k += c1 & 0x3f; // blank rows (eureka.c:73-76)
          continue;
        }
        if ((c1 & 0xc0) === 0x40) {
          // effect-only (eureka.c:77-82)
          tmp[x + 2] = c1 & 0x0f;
          tmp[x + 3] = data[pos++] ?? 0;
          continue;
        }
        if ((c1 & 0xc0) === 0x80) {
          // note+ins without effect (eureka.c:83-88)
          tmp[x] = data[pos++] ?? 0;
          tmp[x + 1] = data[pos++] ?? 0;
          tmp[x + 2] = (c1 << 4) & 0xf0;
          continue;
        }
      }
    }
    for (let k = 0; k < 1024; k++) out.push(tmp[k]!);
  }

  // Sample data (eureka.c:113-116)
  moveData(data, start + smpAddr, out, ssize);

  return Uint8Array.from(out);
}

/** test_eu (eureka.c:125-218). */
function testEu(data: Uint8Array, start: number): number {
  const s = data.length - start;
  if (s < 1084) return 1084 - s;

  // test 2 (eureka.c:131-135)
  const len = data[start + 950]!;
  if (len === 0 || len > 127) return -1;

  // test #3 (eureka.c:137-156)
  for (let i = 0; i < 31; i++) {
    const d = start + i * 30;
    const size = readmem16b(data, d + 42) << 1;
    const lstart = readmem16b(data, d + 46) << 1;
    const lsize = readmem16b(data, d + 48) << 1;

    if (size > 0xffff || lstart > 0xffff || lsize > 0xffff) return -1;
    if (lstart + lsize > size + 2) return -1;
    if (data[d + 44]! > 0x0f || data[d + 45]! > 0x40) return -1;
  }

  // test 4 (eureka.c:159-167)
  const smpOfs = readmem32b(data, start + 1080);
  if (smpOfs < 1084) return -1;

  // Pattern list (eureka.c:169-183)
  let maxPat = 0;
  let i = 0;
  for (; i < len; i++) {
    const pat = data[start + 952 + i]!;
    if (pat > 127) return -1;
    if (pat > maxPat) maxPat = pat;
  }
  for (; i < 128; i++) {
    if (data[start + 952 + i] !== 0) return -1;
  }
  maxPat++;

  // Track address bounds (eureka.c:186-199)
  let maxTrk = 0;
  let minTrk = 999999;

  if (s < maxPat * 4 * 2 + 1085) return maxPat * 4 * 2 + 1085 - s;

  for (i = 0; i < maxPat * 4; i++) {
    const trk = readmem16b(data, start + i * 2 + 1084);
    if (trk > smpOfs || trk < 1084) return -1;
    if (trk > maxTrk) maxTrk = trk;
    if (trk < minTrk) minTrk = trk;
  }

  if (s < maxTrk) return maxTrk - s;

  // Track data sanity (eureka.c:203-215)
  for (i = minTrk; i < maxTrk; i++) {
    const c = data[start + i]!;
    if ((c & 0xc0) === 0xc0) continue;
    if ((c & 0xc0) === 0x80) { i += 2; continue; }
    if ((c & 0xc0) === 0x40) {
      if ((c & 0x3f) === 0 && data[start + i + 1] === 0) return -1;
      i++;
      continue;
    }
    if ((c & 0xc0) === 0) {
      if (c > 0x13) return -1;
      i += 3;
      continue;
    }
  }

  return 0;
}

/** pw_eu: "Eureka Packer". */
export const pwEu: PwFormat = {
  name: 'Eureka Packer',
  test: testEu,
  depack: depackEu,
};

// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Bitti09 — modplayjs contributors
// Ported from: libxmp src/loaders/prowizard/pp10.c (ProPacker 1.0) and
// pp21.c (ProPacker 2.1 + 3.0, shared depack_pp21_pp30).

import { ParseError } from '@modplayjs/core';
import { readmem16b, readmem32b, moveData, writeZero, pwReadTitle, type PwFormat } from './prowiz.js';

/** write8/write16b/write32b helpers — output accumulates as a byte array. */
function put8(out: number[], b: number): void {
  out.push(b & 0xff);
}

function put16b(out: number[], v: number): void {
  out.push((v >> 8) & 0xff, v & 0xff);
}

function put32b(out: number[], v: number): void {
  out.push((v >>> 24) & 0xff, (v >> 16) & 0xff, (v >> 8) & 0xff, v & 0xff);
}

// ---------------------------------------------------------------------------
// ProPacker 1.0 (pp10.c)
// ---------------------------------------------------------------------------

/**
 * depack_pp10 (pp10.c:41-120).
 * Input: 31×8-byte sample headers, len @248, noisetracker byte @249,
 * 4×128 track-number table @250, (ntrk+1)*256-byte track bank @762,
 * then sample data.
 */
function depackPp10(data: Uint8Array, start: number): Uint8Array {
  const out: number[] = [];
  const trkNum: number[][] = [[], [], [], []];

  writeZero(out, 20); // title

  // Sample descriptions (pp10.c:48-66): 8 bytes each → 22 zero + 8.
  let ssize = 0;
  for (let i = 0; i < 31; i++) {
    const pos = start + i * 8;
    if (pos + 8 > data.length) throw new ParseError('pp10: truncated sample headers');
    const tmp = data.slice(pos, pos + 8);
    writeZero(out, 22); // sample name
    const size = readmem16b(tmp, 0);
    ssize += size * 2;
    if (tmp[4] === 0 && tmp[5] === 0) {
      tmp[5] = 1; // loop size 0,0 → 0,1 (pp10.c:58-60)
    }
    for (let k = 0; k < 8; k++) out.push(tmp[k]!);
  }

  const len = data[start + 248]!; // pattern table length
  put8(out, len);
  const c1 = data[start + 249]!; // noisetracker byte
  put8(out, c1);

  // Track list, 4×128 (pp10.c:75-84); find highest track number.
  let ntrk = 0;
  for (let j = 0; j < 4; j++) {
    for (let i = 0; i < 128; i++) {
      const t = data[start + 250 + j * 128 + i]!;
      trkNum[j]!.push(t);
      if (t > ntrk) ntrk = t;
    }
  }

  // Pattern table "as is" (pp10.c:87-94): 0..len-1, zero-pad to 128, M.K.
  let i = 0;
  for (; i < len; i++) put8(out, i);
  writeZero(out, 128 - i);
  put32b(out, 0x4d2e4b2e); // write32b(out, PW_MOD_MAGIC) → "M.K." BE bytes

  // Track/pattern data (pp10.c:97-112): interleave 4 tracks per pattern.
  const pdata = new Uint8Array(1024);
  for (i = 0; i < len; i++) {
    pdata.fill(0);
    for (let j = 0; j < 4; j++) {
      const trackOff = start + 762 + (trkNum[j]![i]! << 8);
      for (let k = 0; k < 64; k++) {
        const src = trackOff + k * 4;
        const dst = k * 16 + j * 4;
        for (let b = 0; b < 4; b++) {
          pdata[dst + b] = src + b < data.length ? data[src + b]! : 0;
        }
      }
    }
    for (let b = 0; b < 1024; b++) out.push(pdata[b]!);
  }

  // Sample data (pp10.c:115-119): relocate to 762 + (ntrk+1)*256.
  const smpOff = start + 762 + ((ntrk + 1) << 8);
  moveData(data, smpOff, out, ssize);

  return Uint8Array.from(out);
}

/**
 * test_pp10 (pp10.c:123-175).
 * Returns 0 match / -1 no match / N request-more-bytes.
 */
function testPp10(data: Uint8Array, start: number): number {
  const s = data.length - start;

  // PW_REQUEST_DATA(s, 1024)
  if (s < 1024) return 1024 - s;

  // Noisetracker byte (pp10.c:131-134).
  if (data[start + 249]! > 0x7f) return -1;

  // Test #2 (pp10.c:136-172): 31 sample headers, 8 bytes each @0.
  let ssize = 0;
  for (let i = 0; i < 31; i++) {
    const d = start + i * 8;
    const size = readmem16b(data, d) << 1;
    const lstart = readmem16b(data, d + 4) << 1;
    const lsize = readmem16b(data, d + 6) << 1;

    ssize += size;

    if (lsize === 0) return -1;
    if (lstart !== 0 && lsize <= 2) return -1;
    if (lstart + lsize > size + 2) return -1;
    if (data[d + 2]! > 0x0f) return -1; // finetune > 0x0f
    if (data[d + 3]! > 0x40) return -1; // volume > 0x40
    if (lstart > size) return -1;       // loop start > size
    if (size > 0xffff) return -1;       // size > 0xffff
  }

  if (ssize <= 2) return -1;

  // Test #3 (pp10.c:174-178): pattern list size.
  if (data[start + 248] === 0 || data[start + 248]! > 127) return -1;

  // Highest track value (pp10.c:180-188).
  let ntrk = 0;
  for (let i = 0; i < 512; i++) {
    const t = data[start + 250 + i]!;
    if (t > ntrk) ntrk = t;
  }
  ntrk++;

  // PW_REQUEST_DATA(s, 762 + ntrk * 256)
  const need = 762 + ntrk * 256;
  if (s < need) return need - s;

  // Track data sanity (pp10.c:190-195): sample nibble <= 0x13.
  for (let i = 0; i < ntrk * 64; i++) {
    if (data[start + 762 + i * 4]! > 0x13) return -1;
  }

  return 0;
}

/** pw_pp10 (pp10.c:177-181): "ProPacker 1.0". */
export const pwPp10: PwFormat = {
  name: 'ProPacker 1.0',
  test: testPp10,
  depack: depackPp10,
};

// ---------------------------------------------------------------------------
// ProPacker 2.1 / 3.0 (pp21.c, shared depack_pp21_pp30)
// ---------------------------------------------------------------------------

/**
 * depack_pp21_pp30 (pp21.c:37-121): sample headers, numpat, restart,
 * 4×128 track table, M.K., per-track 64 u16 offsets into a reference
 * table, reference-table-reconstructed patterns, then sample data.
 */
function depackPp21Pp30(data: Uint8Array, start: number, is30: boolean): Uint8Array {
  const out: number[] = [];

  writeZero(out, 20); // title

  // Sample descriptions (pp21.c:48-59)
  let ssize = 0;
  for (let i = 0; i < 31; i++) {
    writeZero(out, 22); // sample name
    const size = readmem16b(data, start + i * 8);
    ssize += size * 2;
    put16b(out, size);
    put8(out, data[start + i * 8 + 2]!); // finetune
    put8(out, data[start + i * 8 + 3]!); // volume
    put16b(out, readmem16b(data, start + i * 8 + 4)); // loop start
    put16b(out, readmem16b(data, start + i * 8 + 6)); // loop size
  }

  const numpat = data[start + 248]!;
  if (numpat > 128) throw new ParseError('pp21: too many patterns');
  put8(out, numpat);
  put8(out, data[start + 249]!); // NoiseTracker restart byte

  const trk: number[][] = [[], [], [], []];
  let max = 0;
  for (let j = 0; j < 4; j++) {
    for (let i = 0; i < 128; i++) {
      const t = data[start + 250 + j * 128 + i]!;
      trk[j]!.push(t);
      if (t > max) max = t;
    }
  }

  // Pattern table without optimizing (pp21.c:78-81)
  let i = 0;
  for (; i < numpat; i++) put8(out, i);
  writeZero(out, 128 - i);
  put32b(out, 0x4d2e4b2e); // "M.K."

  // Per-track 64 u16 reference-table offsets (pp21.c:86-96)
  const tptr: number[][] = [];
  for (let j = 0; j <= max; j++) {
    const row: number[] = [];
    for (let k = 0; k < 64; k++) {
      let v = readmem16b(data, start + 762 + (j * 64 + k) * 2);
      if (is30) v >>= 2;
      row.push(v);
    }
    tptr.push(row);
  }

  // Reference table (pp21.c:99-108)
  const tabOff = start + 762 + (max + 1) * 128;
  const tabsize = readmem32b(data, tabOff);
  if (tabsize === 0) throw new ParseError('pp21: zero reference table size');
  const tab = data.subarray(tabOff + 4, tabOff + 4 + tabsize);
  if (tab.length < tabsize) throw new ParseError('pp21: reference table truncated');

  // Pattern reconstruction (pp21.c:110-121): each row is 4×4 bytes copied
  // from tab[tptr[trk[j][i]][row] * 4].
  for (i = 0; i < numpat; i++) {
    for (let j = 0; j < 64; j++) {
      for (let c = 0; c < 4; c++) {
        const off = tptr[trk[c]![i]!]![j]! * 4;
        for (let b = 0; b < 4; b++) {
          out.push(tab[off + b] ?? 0);
        }
      }
    }
  }

  // Sample data (pp21.c:126-128)
  moveData(data, tabOff + 4 + tabsize, out, ssize);

  return Uint8Array.from(out);
}

/** Shared pp21/pp30 test body (pp21.c:124-176 vs :178-247). */
function testPp21Pp30(data: Uint8Array, start: number, is30: boolean): number {
  const s = data.length - start;

  if (s < 762) return 762 - s;

  let ssize = 0;
  for (let i = 0; i < 31; i++) {
    const d = start + i * 8;
    const len = readmem16b(data, d) << 1;
    const lstart = readmem16b(data, d + 4) << 1;

    ssize += len;

    if (data[d + 2]! > 0x0f) return -1; // finetune
    if (data[d + 3]! > 0x40) return -1; // volume
    if (lstart > len) return -1;        // loop start > size
  }

  if (ssize <= 2) return -1;

  // Pattern list size
  const npat = data[start + 248]!;
  if (npat === 0 || npat > 127) return -1;

  // Highest track value
  let tsize = 0;
  for (let i = 0; i < 512; i++) {
    const trk = data[start + 250 + i]!;
    if (trk > tsize) tsize = trk;
  }
  tsize++;
  tsize <<= 6;

  // PW_REQUEST_DATA(s, tsize * 2 + 4 + 762)
  const need = tsize * 2 + 4 + 762;
  if (s < need) return need - s;

  let maxRef = 0;
  if (!is30) {
    // test #4 (pp21.c:194-203): track data value > $4000?
    for (let i = 0; i < tsize; i++) {
      const ref = readmem16b(data, start + i * 2 + 762);
      if (ref > 0x4000) return -1;
      if (ref > maxRef) maxRef = ref;
    }
    // test #5 (pp21.c:206-209): reference table size *4?
    if (readmem32b(data, start + tsize * 2 + 762) !== (maxRef + 1) * 4) return -1;
  } else {
    // test #4 (pp21.c:211-230): track data value *4?
    for (let i = 0; i < tsize; i++) {
      const ref = readmem16b(data, start + i * 2 + 762);
      if (ref > maxRef) maxRef = ref;
      if ((ref & 0x0003) !== 0) return -1;
    }
    maxRef >>= 2;

    // test #5 (pp21.c:233-243)
    let refSize = readmem32b(data, start + tsize * 2 + 762);
    if (refSize > 0xffff) return -1;
    if (refSize !== (maxRef + 1) << 2) return -1;
    refSize >>= 2;

    // PW_REQUEST_DATA(s, (ref_size * 4) + (tsize * 2) + 4 + 762)
    const need2 = refSize * 4 + tsize * 2 + 4 + 762;
    if (s < need2) return need2 - s;

    // test #6 (pp21.c:245-...): reference table sanity
    for (let i = 0; i < refSize; i++) {
      const d = start + tsize * 2 + 766 + i * 4;
      const fxt = data[d + 2]! & 0x0f;
      const fxp = data[d + 3]!;

      if (fxt === 0x0c && fxp > 0x41) return -1;         // volume > 41
      if (fxt === 0x0d && (fxp > 0x64 || (fxp & 0xf) > 9)) return -1; // break
      if (fxt === 0x0b && fxp > 0x7f) return -1;         // jump > 128
      if ((data[d]! & 0xf0) > 0x10) return -1;           // sample > 1f
    }
  }

  pwReadTitle(null, 0);

  return 0;
}

function testPp21(data: Uint8Array, start: number): number {
  return testPp21Pp30(data, start, false);
}

function testPp30(data: Uint8Array, start: number): number {
  return testPp21Pp30(data, start, true);
}

/** pw_pp21 (pp21.c:249-253): "ProPacker 2.1". */
export const pwPp21: PwFormat = {
  name: 'ProPacker 2.1',
  test: testPp21,
  depack: (data, start) => depackPp21Pp30(data, start, false),
};

/** pw_pp30 (pp21.c:255-259): "ProPacker 3.0". */
export const pwPp30: PwFormat = {
  name: 'ProPacker 3.0',
  test: testPp30,
  depack: (data, start) => depackPp21Pp30(data, start, true),
};

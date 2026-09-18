// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Bitti09 — modplayjs contributors
// Ported from: libxmp src/loaders/prowizard/np1.c (NoisePacker v1) and
// np2.c (NoisePacker v2) — np2 shares np1's layout with small deltas.

import { ptkTable, ptkIsValidNote } from './ptktable.js';
import { readmem16b, readmem32b, moveData, writeZero, pwReadTitle, type PwFormat } from './prowiz.js';

const PW_MOD_MAGIC = 0x4d2e4b2e; // 'M.K.'

function put8(out: number[], b: number): void { out.push(b & 0xff); }
function put16b(out: number[], v: number): void { out.push((v >> 8) & 0xff, v & 0xff); }
function put32b(out: number[], v: number): void {
  out.push((v >>> 24) & 0xff, (v >> 16) & 0xff, (v >> 8) & 0xff, v & 0xff);
}

/**
 * Shared depack (np1.c:40-156, np2.c:34-155). ver1: loop start halved and
 * effect table lacks the 0x0e case + npat sanity.
 */
function depackNp12(data: Uint8Array, start: number, ver1: boolean): Uint8Array {
  let pos = start;
  const out: number[] = [];
  const u8 = () => data[pos++] ?? 0;
  const u16 = () => { const v = readmem16b(data, pos); pos += 2; return v; };
  const u32 = () => { const v = readmem32b(data, pos); pos += 4; return v; };

  const c1 = u8();
  const c2 = u8();
  const nins = ((c1 << 4) & 0xf0) | ((c2 >> 4) & 0x0f);

  writeZero(out, 20); // title

  const len = u16() >> 1; // size of pattern list
  if (len > 128) throw new Error('np: pattern list too long');

  u16(); // 2 unknown bytes
  u16(); // track data size

  // Sample descriptions (np1.c:65-83 / np2.c:63-82)
  let ssize = 0;
  for (let i = 0; i < nins; i++) {
    u32(); // bypass 4 unknown bytes
    writeZero(out, 22); // sample name
    const size = u16();
    ssize += size * 2;
    put16b(out, size);
    put8(out, u8()); // finetune
    put8(out, u8()); // volume
    u32(); // bypass 4 unknown bytes
    const loopSize = u16();
    put16b(out, ver1 ? u16() / 2 : u16()); // loop start
    put16b(out, loopSize); // loop size
  }

  // Fill to 31 samples (np1.c:86-92): zeros with 0x01 loop flag.
  {
    const pad = new Array<number>(30).fill(0);
    pad[29] = 0x01;
    for (let i = nins; i < 31; i++) out.push(...pad);
  }

  put8(out, len);
  put8(out, 0x7f); // noisetracker byte

  pos += 2; // always $02? (np1.c:98)
  pos += 2; // unknown (np1.c:99)

  // Pattern table (np1.c:102-111)
  const ptable: number[] = [];
  let npat = 0;
  for (let i = 0; i < len; i++) {
    const p = u16() >> 3;
    ptable.push(p);
    if (p > npat) npat = p;
  }
  npat++;
  if (!ver1 && npat > 128) throw new Error('np2: too many patterns');

  for (let i = 0; i < 128; i++) put8(out, ptable[i]!);
  put32b(out, PW_MOD_MAGIC);

  // Track addresses per pattern (np1.c:114-129)
  const trkAddr: number[][] = [];
  let maxAddr = 0;
  for (let i = 0; i < npat; i++) {
    const row: number[] = [];
    for (let j = 0; j < 4; j++) {
      const a = u16();
      row.push(a);
      if (a > maxAddr) maxAddr = a;
    }
    trkAddr.push(row);
  }
  const trkStart = pos;

  // Track data (np1.c:132-152): channel j reads track [3-j] (reversed);
  // cells are placed ROW-MAJOR into the pattern body (tmp[x], x = k*16 + j*4).
  for (let i = 0; i < npat; i++) {
    const tmp = new Uint8Array(1024);
    for (let j = 0; j < 4; j++) {
      pos = trkStart + trkAddr[i]![3 - j]!;
      for (let k = 0; k < 64; k++) {
        const x = k * 16 + j * 4;
        const c1 = u8();
        const c2 = u8();
        const c3 = u8();
        const c4 = Math.trunc((c1 & 0xfe) / 2);
        if (!ptkIsValidNote(c4)) throw new Error('np: invalid note');

        let eff2 = c2;
        let eff3 = c3;
        switch (c2 & 0x0f) {
          case 0x08:
            eff2 &= 0xf0;
            break;
          case 0x07:
            eff2 = (eff2 & 0xf0) + 0x0a;
            // falls through to 06/05 handling
            eff3 = eff3 > 0x80 ? 0x100 - eff3 : (eff3 << 4) & 0xf0;
            break;
          case 0x06:
          case 0x05:
            eff3 = eff3 > 0x80 ? 0x100 - eff3 : (eff3 << 4) & 0xf0;
            break;
          case 0x0b:
            eff3 = Math.trunc((eff3 + 4) / 2);
            break;
          case 0x0e:
            if (!ver1) eff3--;
            break;
        }

        tmp[x] = ((c1 << 4) & 0x10) | ptkTable[c4]![0];
        tmp[x + 1] = ptkTable[c4]![1];
        tmp[x + 2] = eff2 & 0xff;
        tmp[x + 3] = eff3 & 0xff;
      }
    }
    for (let k = 0; k < 1024; k++) out.push(tmp[k]!);
  }

  // Sample data (np1.c:155-158)
  moveData(data, start + maxAddr + 192 + trkStart, out, ssize);

  return Uint8Array.from(out);
}

/** Shared test (np1.c:161-251, np2.c:158-269). */
function testNp12(data: Uint8Array, start: number, ver1: boolean): number {
  const s = data.length - start;

  if (s < 10) return 10 - s;

  // Pattern table size (np1.c:169-173)
  const ptabSize = readmem16b(data, start + 2);
  if (ptabSize === 0 || (ptabSize & 1) !== 0 || ptabSize > 0xff) return -1;

  // Sample count nibble check (np1.c:176-178)
  if ((data[start + 1]! & 0x0f) !== 0x0c) return -1;

  const numIns = ((data[start]! << 4) & 0xf0) | ((data[start + 1]! >> 4) & 0x0f);
  if (numIns === 0 || numIns > 0x1f) return -1;

  // PW_REQUEST_DATA(s, 15 + num_ins * 16)
  if (s < 15 + numIns * 16) return 15 + numIns * 16 - s;

  for (let i = 0; i < numIns; i++) {
    if (data[start + 15 + i * 16]! > 0x40) return -1; // volumes
  }

  // Sample sizes (np1.c:185-206)
  let ssize = 0;
  for (let i = 0; i < numIns; i++) {
    const d = start + i * 16;
    const len = readmem16b(data, d + 12) << 1;
    const lstart = readmem16b(data, d + 20) << 1;
    const lsize = ver1 ? readmem16b(data, d + 22) : readmem16b(data, d + 22) << 1;

    if (len > 0xffff || lstart > 0xffff || lsize > 0xffff) return -1;
    if (lstart + lsize > len + 2) return -1;
    if (lstart === 0 && lsize !== 0) return -1;
    ssize += len;
  }
  if (ssize <= 4) return -1;

  // Header size (np1.c:209-211)
  let hdrSize = numIns * 16 + 8 + 4;

  // PW_REQUEST_DATA(s, hdr_size + ptab_size + 2)
  if (s < hdrSize + ptabSize + 2) return hdrSize + ptabSize + 2 - s;

  // Pattern table (np1.c:213-224)
  let maxPptr = 0;
  for (let i = 0; i < ptabSize; i += 2) {
    const pptr = readmem16b(data, start + hdrSize + i);
    if (ver1) {
      if ((pptr & 0x07) !== 0 || pptr >= 0x400) return -1;
    } else {
      if ((pptr & 0x07) !== 0 || pptr > 0x400) return -1;
    }
    if (pptr > maxPptr) maxPptr = pptr;
  }

  // Header to end of track list (np1.c:227-231)
  hdrSize += ptabSize + maxPptr + 8;

  // Track data size (np1.c:234-237)
  const trkSize = readmem16b(data, start + 6);
  if (trkSize < 192 || (trkSize & 0x3f) !== 0) return -1;

  // PW_REQUEST_DATA(s, hdr_size + trk_size [+16 for np2])
  const need = hdrSize + trkSize + (ver1 ? 0 : 16);
  if (s < need) return need - s;

  // Notes (np1.c:239-247, np2.c:245-262)
  for (let i = 0; i < trkSize; i += 3) {
    const d = start + hdrSize + i;
    if (data[d]! > 0x49) return -1;
    if (!ver1) {
      const ins = ((data[d]! << 4) & 0x10) | ((data[d + 1]! >> 4) & 0x0f);
      if (ins > numIns) return -1;
      if ((data[d + 1]! & 0x0f) === 0 && data[d + 2] !== 0) return -1;
    }
  }

  pwReadTitle(null, 0);

  return 0;
}

/** pw_np1: "NoisePacker v1". */
export const pwNp1: PwFormat = {
  name: 'NoisePacker v1',
  test: (data, st) => testNp12(data, st, true),
  depack: (data, st) => depackNp12(data, st, true),
};

/** pw_np2: "NoisePacker v2". */
export const pwNp2: PwFormat = {
  name: 'NoisePacker v2',
  test: (data, st) => testNp12(data, st, false),
  depack: (data, st) => depackNp12(data, st, false),
};

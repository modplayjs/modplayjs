// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Bitti09 — modplayjs contributors
// Ported from: libxmp src/loaders/prowizard/np3.c (NoisePacker v3) —
// depack_np3 :34-217, test_np3 :220-304.

import { ptkTable, ptkIsValidNote } from './ptktable.js';
import { readmem16b, moveData, writeZero, pwReadTitle, type PwFormat } from './prowiz.js';

const PW_MOD_MAGIC = 0x4d2e4b2e; // 'M.K.'

function put8(out: number[], b: number): void { out.push(b & 0xff); }
function put16b(out: number[], v: number): void { out.push((v >> 8) & 0xff, v & 0xff); }
function put32b(out: number[], v: number): void {
  out.push((v >>> 24) & 0xff, (v >> 16) & 0xff, (v >> 8) & 0xff, v & 0xff);
}

/** depack_np3 (np3.c:34-217). */
function depackNp3(data: Uint8Array, start: number): Uint8Array {
  let pos = start;
  const out: number[] = [];
  const u8 = () => data[pos++] ?? 0;
  const u16 = () => { const v = readmem16b(data, pos); pos += 2; return v; };

  const c1 = u8();
  const c2 = u8();
  const nins = ((c1 << 4) & 0xf0) | ((c2 >> 4) & 0x0f);

  writeZero(out, 20); // title

  const len = u16() >> 1; // pattern list size
  if (len > 128) throw new Error('np3: pattern list too long');
  u16(); // 2 unknown bytes
  u16(); // track data size

  // Sample descriptions (np3.c:64-74): 16-byte records, reordered fields.
  let ssize = 0;
  for (let i = 0; i < nins; i++) {
    const rec = data.subarray(pos, pos + 16);
    pos += 16;
    writeZero(out, 22); // sample name
    const size = readmem16b(rec, 6);
    ssize += size * 2;
    put16b(out, size);
    put8(out, rec[0]!); // finetune
    put8(out, rec[1]!); // volume
    // write loop start (tmp+14) then loop size (tmp+12) — swapped in file
    out.push(rec[14]!, rec[15]!);
    out.push(rec[12]!, rec[13]!);
  }

  // Fill to 31 (np3.c:77-81)
  {
    const pad = new Array<number>(30).fill(0);
    pad[29] = 0x01;
    for (let i = nins; i < 31; i++) out.push(...pad);
  }

  put8(out, len);
  put8(out, 0x7f);
  pos += 2; // always $02?
  pos += 2; // unknown

  // Pattern table (np3.c:84-93): u16 / 8
  const ptable: number[] = [];
  let npat = 0;
  for (let i = 0; i < len; i++) {
    const p = Math.trunc(u16() / 8);
    ptable.push(p);
    if (p > npat) npat = p;
  }
  npat++;

  for (let i = 0; i < 128; i++) put8(out, ptable[i]!);
  put32b(out, PW_MOD_MAGIC);

  // Track addresses (np3.c:96-110)
  const trkAddr: number[][] = [];
  for (let i = 0; i < npat; i++) {
    const row: number[] = [];
    for (let j = 0; j < 4; j++) row.push(u16());
    trkAddr.push(row);
  }
  const trkStart = pos;

  // Track data (np3.c:113-196): 0x80-or-more = blank-run skip; smp_addr
  // tracks the furthest read position across all tracks.
  let smpAddr = 0;
  for (let i = 0; i < npat; i++) {
    const tmp = new Uint8Array(1024);
    for (let j = 0; j < 4; j++) {
      pos = trkStart + trkAddr[i]![3 - j]!;
      for (let k = 0; k < 64; k++) {
        const x = k * 16 + j * 4;

        const c1 = u8();
        if (c1 >= 0x80) {
          k += (0x100 - c1) - 1;
          continue;
        }
        const c2 = u8();
        const c3 = u8();
        const c4 = Math.trunc((c1 & 0xfe) / 2);
        if (!ptkIsValidNote(c4)) throw new Error('np3: invalid note');

        let eff2 = c2;
        let eff3 = c3;
        switch (c2 & 0x0f) {
          case 0x08:
            eff2 &= 0xf0;
            break;
          case 0x07:
            eff2 = (eff2 & 0xf0) + 0x0a;
            eff3 = eff3 > 0x80 ? 0x100 - eff3 : (eff3 << 4) & 0xf0;
            break;
          case 0x06:
          case 0x05:
            eff3 = eff3 > 0x80 ? 0x100 - eff3 : (eff3 << 4) & 0xf0;
            break;
          case 0x0e:
            eff3 = 1;
            break;
          case 0x0b:
            eff3 = Math.trunc((eff3 + 4) / 2);
            break;
        }

        tmp[x] = ((c1 << 4) & 0x10) | ptkTable[c4]![0];
        tmp[x + 1] = ptkTable[c4]![1];
        tmp[x + 2] = eff2;
        tmp[x + 3] = eff3;

        if ((c2 & 0x0f) === 0x0d) break; // pattern break ends the track
      }
      if (pos > smpAddr) smpAddr = pos;
    }
    for (let k = 0; k < 1024; k++) out.push(tmp[k]!);
  }

  // Sample data (np3.c:200-206): smp_addr aligned to even.
  if ((smpAddr & 1) !== 0) smpAddr++;
  moveData(data, smpAddr, out, ssize);

  return Uint8Array.from(out);
}

/** test_np3 (np3.c:220-304). */
function testNp3(data: Uint8Array, start: number): number {
  const s = data.length - start;

  if (s < 10) return 10 - s;

  const ptabSize = readmem16b(data, start + 2);
  if (ptabSize === 0 || (ptabSize & 0x01) !== 0 || ptabSize > 0xff) return -1;

  if ((data[start + 1]! & 0x0f) !== 0x0c) return -1;

  const numIns = ((data[start]! << 4) & 0xf0) | ((data[start + 1]! >> 4) & 0x0f);
  if (numIns === 0 || numIns > 0x1f) return -1;

  if (s < 15 + numIns * 16) return 15 + numIns * 16 - s;

  // Volumes (np3.c:241-245) — note offset 9, not 15.
  for (let i = 0; i < numIns; i++) {
    if (data[start + 9 + i * 16]! > 0x40) return -1;
  }

  // Sample sizes (np3.c:248-268): len at d+14 (not d+12).
  let ssize = 0;
  for (let i = 0; i < numIns; i++) {
    const d = start + i * 16;
    const len = readmem16b(data, d + 14) << 1;
    const lstart = readmem16b(data, d + 20) << 1;
    const lsize = readmem16b(data, d + 22) << 1;

    if (len > 0xffff || lstart > 0xffff || lsize > 0xffff) return -1;
    if (lstart + lsize > len + 2) return -1;
    if (lstart === 0 && lsize !== 0) return -1;
    ssize += len;
  }
  if (ssize <= 4) return -1;

  let hdrSize = numIns * 16 + 8 + 4;

  if (s < hdrSize + ptabSize + 2) return hdrSize + ptabSize + 2 - s;

  // Pattern table (np3.c:275-284)
  let maxPptr = 0;
  for (let i = 0; i < ptabSize; i += 2) {
    const pptr = readmem16b(data, start + hdrSize + i);
    if ((pptr & 0x07) !== 0 || pptr >= 0x400) return -1;
    if (pptr > maxPptr) maxPptr = pptr;
  }

  hdrSize += ptabSize + maxPptr + 8;

  // Track data size (np3.c:291-294): > 63, no alignment check.
  const trkSize = readmem16b(data, start + 6);
  if (trkSize <= 63) return -1;

  if (s < hdrSize + trkSize + 2) return hdrSize + trkSize + 2 - s;

  // Notes (np3.c:297-322): errcount tolerance of 1 (Shadow Fighter quirk).
  let errcount = 0;
  for (let i = 0; i < trkSize; i++) {
    const d = start + hdrSize + i;
    if ((data[d]! & 0x80) !== 0) continue;

    if (data[d]! > 0x49 || (data[d + 1]! & 0x0f) === 0x0a) errcount++;
    if ((data[d + 1]! & 0x0f) === 0x0d && data[d + 2]! > 0x40) errcount++;
    if ((((data[d]! << 4) & 0x10) | ((data[d + 1]! >> 4) & 0x0f)) > numIns) errcount++;
    if (data[d] === 0 && data[d + 1] === 0 && data[d + 2] === 0 && i < trkSize - 3) errcount++;

    if (errcount > 1) return -1;
    i += 2;
  }

  pwReadTitle(null, 0);

  return 0;
}

/** pw_np3: "NoisePacker v3". */
export const pwNp3: PwFormat = {
  name: 'NoisePacker v3',
  test: testNp3,
  depack: depackNp3,
};

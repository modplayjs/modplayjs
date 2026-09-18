// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Bitti09 — modplayjs contributors
// Ported from: libxmp src/loaders/prowizard/unic2.c (Unic Tracker 2) —
// depack_unic2 :40-131, test_unic2 :134-239.

import { ptkTable, ptkIsValidNote } from './ptktable.js';
import { readmem16b, readmem32b, moveData, writeZero, pwReadTitle, type PwFormat } from './prowiz.js';

function put8(out: number[], b: number): void { out.push(b & 0xff); }
function put16b(out: number[], v: number): void { out.push((v >> 8) & 0xff, v & 0xff); }
function put32b(out: number[], v: number): void {
  out.push((v >>> 24) & 0xff, (v >> 16) & 0xff, (v >> 8) & 0xff, v & 0xff);
}

/** depack_unic2 (unic2.c:40-131). */
function depackUnic2(data: Uint8Array, start: number): Uint8Array {
  let pos = start;
  const out: number[] = [];
  const u8 = () => data[pos++] ?? 0;
  const u16 = () => { const v = readmem16b(data, pos); pos += 2; return v; };

  writeZero(out, 20); // title (unic2.c:44)

  // Sample headers (unic2.c:47-86) — same finetune scheme as unic.c.
  let ssize = 0;
  for (let i = 0; i < 31; i++) {
    // sample name (unic2.c:48): move 20 bytes verbatim
    for (let k = 0; k < 20; k++) out.push(data[pos++] ?? 0);
    put8(out, 0);
    put8(out, 0);

    // fine on? (unic2.c:51-62)
    const c1 = u8();
    const c2 = u8();
    const j = (c1 << 8) + c2;
    let fine = 0;
    if (j !== 0) {
      fine = j < 256 ? 0x10 - c2 : 0x100 - c2;
    }

    const len = u16();
    put16b(out, len);
    ssize += len << 1;

    u8();
    put8(out, fine);
    put8(out, u8()); // vol

    let lstart = u16();
    const lsize = u16();
    if (lstart * 2 + lsize <= len && lstart !== 0) {
      lstart <<= 1;
    }
    put16b(out, lstart);
    put16b(out, lsize);
  }

  const npat = u8();
  put8(out, npat);
  put8(out, 0x7f);
  u8();

  // Pattern table (unic2.c:92-94)
  const tmp: number[] = [];
  for (let i = 0; i < 128; i++) tmp.push(u8());
  for (let i = 0; i < 128; i++) put8(out, tmp[i]!);

  // Highest pattern (unic2.c:96-100)
  let maxpat = 0;
  for (let i = 0; i < 128; i++) {
    if (tmp[i]! > maxpat) maxpat = tmp[i]!;
  }
  maxpat++;

  put32b(out, 0x4d2e4b2e); // M.K.

  // Pattern data (unic2.c:103-128): 3-byte cells.
  for (let i = 0; i < maxpat; i++) {
    for (let j = 0; j < 256; j++) {
      const c1 = u8();
      const c2 = u8();
      const c3 = u8();

      const ins = ((c1 >> 2) & 0x10) | ((c2 >> 4) & 0x0f);
      const note = c1 & 0x3f;
      if (!ptkIsValidNote(note)) throw new Error('unic2: invalid note');

      const fxt = c2 & 0x0f;
      let fxp = c3;
      if (fxt === 0x0d) {
        const ones = fxp % 10;
        const tens = Math.trunc(fxp / 10);
        fxp = 16 * tens + ones;
      }

      out.push((ins & 0xf0) | ptkTable[note]![0]);
      out.push(ptkTable[note]![1]);
      out.push(((ins << 4) & 0xf0) | fxt);
      out.push(fxp);
    }
  }

  // Sample data (unic2.c:131)
  moveData(data, pos, out, ssize);

  return Uint8Array.from(out);
}

/** test_unic2 (unic2.c:134-239). */
function testUnic2(data: Uint8Array, start: number): number {
  const s = data.length - start;
  if (s < 1084) return 1084 - s;

  if (readmem32b(data, start + 1080) === 0x00000000) return -1;

  // Samples (unic2.c:146-176) — note the d+22/26/28 field offsets.
  let ssize = 0;
  let maxIns = 0;
  for (let i = 0; i < 31; i++) {
    const d = start + i * 30;
    const size = readmem16b(data, d + 22) << 1;
    const lstart = readmem16b(data, d + 26) << 1;
    const lsize = readmem16b(data, d + 28) << 1;
    ssize += size;

    if (size + 2 < lstart + lsize) return -1;
    if (size > 0xffff || lstart > 0xffff || lsize > 0xffff) return -1;
    if (data[d + 25]! > 0x40) return -1;
    if ((readmem16b(data, d + 20) !== 0) && size === 0) return -1;
    if (data[d + 25]! !== 0 && size === 0) return -1;
    if (size !== 0) maxIns = i + 1;
  }
  if (ssize <= 2) return -1;

  // Pattern list size (unic2.c:179-198) at 930/932.
  const len = data[start + 930]!;
  if (len === 0 || len > 127) return -1;

  let psize = 0;
  let i = 0;
  for (; i < len; i++) {
    const x = data[start + 932 + i]!;
    if (x > 127) return -1;
    if (x > psize) psize = x;
  }
  for (i += 2; i !== 128; i++) {
    if (data[start + 932 + i] !== 0) return -1;
  }
  psize++;
  psize <<= 8;

  // PW_REQUEST_DATA(s, 1060 + psize * 3 + 2)
  if (s < 1060 + psize * 3 + 2) return 1060 + psize * 3 + 2 - s;

  // Pattern data sanity (unic2.c:204-231)
  for (i = 0; i < psize; i++) {
    const d = start + 1060 + i * 3;
    if (data[d]! > 0x74) return -1;
    if ((data[d]! & 0x3f) > 0x24) return -1;
    if ((data[d + 1]! & 0x0f) === 0x0c && data[d + 2]! > 0x40) return -1;
    if ((data[d + 1]! & 0x0f) === 0x0b && data[d + 2]! > 0x7f) return -1;
    if ((data[d + 1]! & 0x0f) === 0x0d && data[d + 2]! > 0x40) return -1;

    const ins = ((data[d]! >> 2) & 0x30) | ((data[d + 2]! >> 4) & 0x0f);
    if (ins > maxIns) return -1;
  }

  pwReadTitle(null, 0);

  return 0;
}

/** pw_unic2: "Unic Tracker 2". */
export const pwUnic2: PwFormat = {
  name: 'Unic Tracker 2',
  test: testUnic2,
  depack: depackUnic2,
};

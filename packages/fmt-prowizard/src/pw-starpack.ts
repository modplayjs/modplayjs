// SPDX-License-Identifier: BSD-3-Clause
// Ported from: libxmp src/loaders/prowizard/starpack.c ("Startrekker Packer").
// Pattern addresses + track-style event stream (0x80 = blank row) with the
// address-order/dedup bookkeeping the C depacker performs.

import { readmem16b, readmem32b, pwReadTitle, type PwFormat } from './prowiz.js';

function put8(out: number[], v: number): void { out.push(v & 0xff); }
function put16b(out: number[], v: number): void { out.push((v >> 8) & 0xff, v & 0xff); }
function put32b(out: number[], v: number): void {
  out.push((v >>> 24) & 0xff, (v >> 16) & 0xff, (v >> 8) & 0xff, v & 0xff);
}

function depackStarpack(data: Uint8Array, start: number): Uint8Array {
  let pos = start;
  const out: number[] = [];
  const u8 = (): number => data[pos++] ?? 0;
  const u16 = (): number => { const v = readmem16b(data, pos); pos += 2; return v; };
  const u32 = (): number => { const v = readmem32b(data, pos); pos += 4; return v; };

  const pnum = new Uint8Array(128);
  const pnumTmp = new Uint8Array(128);
  const paddr = new Int32Array(128);
  const paddrTmp = new Int32Array(128);
  const paddrTmp2 = new Int32Array(128);

  let ssize = 0;
  let numPat = 0;

  moveDataInto(out, data, pos, 20); /* title */
  pos += 20;

  for (let i = 0; i < 31; i++) {
    for (let k = 0; k < 22; k++) out.push(0); // sample name
    const size = u16();
    put16b(out, size);
    ssize += 2 * size;
    put8(out, u8()); // finetune
    put8(out, u8()); // volume
    put16b(out, u16()); // loop start
    put16b(out, u16()); // loop size
  }

  const patPos = (u16() >> 2) & 0xff; // num positions = pattern table size / 4
  if (patPos >= 128) throw new Error('starpack: too many positions');

  pos += 2; // bypass $0000 unknown bytes

  for (let i = 0; i < 128; i++) paddr[i] = u32();

  // Ordering of pattern addresses (starpack.c:75-90).
  let tmpPtr = 0;
  for (let i = 0; i < patPos; i++) {
    if (i === 0) {
      pnum[0] = 0;
      tmpPtr++;
      continue;
    }
    let j = 0;
    for (; j < i; j++) {
      if (paddr[i] === paddr[j]) {
        pnum[i] = pnum[j]!;
        break;
      }
    }
    if (j === i) pnum[i] = tmpPtr++;
  }

  for (let i = 0; i < 128; i++) paddrTmp[i] = paddr[i]!;

  // Bubble-sort the address list by address (starpack.c:94-106, the
  // goto-restart bubble becomes an insertion pass — same final order and
  // pnum permutation).
  // starpack.c:94-106 — the goto-restart bubble produces the same final
  // order and pnum permutation as an insertion/bubble pass to fixpoint.
  {
    let done = false;
    while (!done) {
      done = true;
      for (let i = 0; i < patPos; i++) {
        for (let j = 0; j < i; j++) {
          if (paddrTmp[i]! < paddrTmp[j]!) {
            const n = pnum[j]!; pnum[j] = pnum[i]!; pnum[i] = n;
            const v = paddrTmp[j]!; paddrTmp[j] = paddrTmp[i]!; paddrTmp[i] = v;
            done = false;
          }
        }
      }
    }
  }

  // Deduplicate the sorted addresses (starpack.c:108-118).
  let j2 = 0;
  for (let i = 0; i < 128; i++) {
    if (i === 0) {
      paddrTmp2[j2] = paddrTmp[i]!;
      continue;
    }
    if (paddrTmp[i]! === paddrTmp2[j2]!) continue;
    j2++;
    paddrTmp2[j2] = paddrTmp[i]!;
  }

  // Locate unused patterns (starpack.c:120-133): fill the address holes.
  const spacesLeft0 = 128 - patPos;
  let spacesLeft = spacesLeft0;
  let j3 = 0;
  for (let i = 0; i < patPos - 1; i++) {
    paddrTmp[j3] = paddrTmp2[i]!;
    j3++;
    if (paddrTmp2[i + 1]! - paddrTmp2[i]! > 1024 && spacesLeft > 0) {
      paddrTmp[j3] = paddrTmp2[i]! + 1024;
      spacesLeft--;
      j3++;
    }
  }
  void j3;

  // Assign pattern list (starpack.c:135-141).
  for (let i = 0; i < 128; i++) {
    for (let k = 0; k < 128; k++) {
      if (paddr[i]! === paddrTmp[k]!) {
        pnumTmp[i] = k;
        break;
      }
    }
  }
  pnum.fill(0);
  for (let i = 0; i < patPos; i++) pnum[i] = pnumTmp[i]!;

  put8(out, patPos);

  for (let i = 0; i < patPos; i++) {
    if (pnum[i]! > numPat) numPat = pnum[i]!;
  }

  put8(out, 0x7f); // noisetracker byte
  for (let i = 0; i < 128; i++) put8(out, pnum[i]!);
  put32b(out, 0x4d2e4b2e /* M.K. */);

  // Sample data address (starpack.c:152-155). The 4-byte offset field at
  // 0x310 precedes the pattern stream: cells begin at 0x314 = 788 (the C
  // test walks pdata_ofs from 788, starpack.c:278).
  pos = start + 0x310;
  const smpAddr = readmem32b(data, pos) + 0x314;
  pos = start + 0x314;

  // Pattern data (starpack.c:158-196): 4 bytes per cell, c1 == 0x80 marks
  // an empty cell; c5 packs the high nibbles back into the note bytes.
  numPat += 1;
  for (let i = 0; i < numPat; i++) {
    const buffer = new Uint8Array(1024);
    for (let j = 0; j < 64; j++) {
      for (let k = 0; k < 4; k++) {
        const ofs = j * 16 + k * 4;
        const c1 = u8();
        if (c1 === 0x80) continue;
        const c2 = u8();
        const c3 = u8();
        const c4 = u8();
        buffer[ofs] = c1 & 0x0f;
        buffer[ofs + 1] = c2;
        buffer[ofs + 2] = c3 & 0x0f;
        buffer[ofs + 3] = c4;
        const c5 = ((c1 & 0xf0) | ((c3 >> 4) & 0x0f)) >> 2;
        buffer[ofs] = (buffer[ofs]! | (c5 & 0xf0)) & 0xff;
        buffer[ofs + 2] = (buffer[ofs + 2]! | ((c5 << 4) & 0xf0)) & 0xff;
      }
    }
    for (let k = 0; k < 1024; k++) out.push(buffer[k]!);
  }

  // Sample data (starpack.c:201-203).
  pos = smpAddr;
  for (let k = 0; k < ssize && pos < data.length; k++) out.push(data[pos++] ?? 0);

  return Uint8Array.from(out);
}

function moveDataInto(out: number[], src: Uint8Array, from: number, len: number): void {
  for (let i = 0; i < len && from + i < src.length; i++) out.push(src[from + i]!);
}

/** test_starpack (starpack.c:211-309). */
function testStarpack(data: Uint8Array, start: number): number {
  const s = data.length - start;
  const rd16 = (o: number): number => readmem16b(data, start + o);
  const rd32 = (o: number): number => readmem32b(data, start + o);

  // PW_REQUEST_DATA(s, 788)
  if (s < 788) return 788 - s;

  // test 2 (starpack.c:216-229)
  const plistSize = rd16(268);
  if ((plistSize & 0x03) !== 0) return -1;
  const len = plistSize >> 2;
  if (len === 0 || len > 127) return -1;
  if (data[start + 784] !== 0) return -1;

  // test 3 (starpack.c:225-233): smp size < loop start + loop size ?
  for (let i = 0; i < 31; i++) {
    const d = start + i * 8;
    const size = readmem16b(data, d + 20) << 1;
    const lend = (readmem16b(data, d + 24) + readmem16b(data, d + 26)) << 1;
    if (lend > size + 2) return -1;
  }

  // test 4 (starpack.c:235-241): finetunes & volumes
  for (let i = 0; i < 31; i++) {
    const d = start + i * 8;
    if (data[d + 22]! > 0x0f || data[d + 23]! > 0x40) return -1;
  }

  // test 5 (starpack.c:244-254): pattern addresses > sample address ?
  const sdataOfs = rd32(784);
  if (sdataOfs < 788) return -1;
  for (let i = 0; i < len; i++) {
    if (rd32(i * 4 + 272) > sdataOfs) return -1;
  }
  for (let i = len; i < 128; i++) {
    if (rd32(i * 4 + 272) !== 0) return -1;
  }

  // PW_REQUEST_DATA(s, sdata_ofs + 8)
  if (s < sdataOfs + 8) return sdataOfs + 8 - s;

  // test pattern data (starpack.c:271-302)
  let pdataOfs = 788;
  while (pdataOfs < sdataOfs + 4) {
    const d = start + pdataOfs;
    const d0 = data[d]!;
    if (d0 === 0x80) {
      pdataOfs++;
      continue;
    }
    if (d0 > 0x80) return -1;
    // empty row? ... not possible!
    if (rd32(pdataOfs) === 0) return -1;
    // Replicate the C conditions verbatim (starpack.c:288-297): the * 0x0f
    // multiply is what upstream ships.
    if (data[d + 2]! * 0x0f === 0x0c && data[d + 3]! > 0x40) return -1;
    if (data[d + 2]! * 0x0f === 0x0d && data[d + 3]! > 0x40) return -1;
    pdataOfs += 4;
  }

  pwReadTitle(data.subarray(start, start + 20), 0);

  return 0;
}

/** pw_starpack: "Startrekker Packer". */
export const pwStarpack: PwFormat = {
  name: 'Startrekker Packer',
  test: testStarpack,
  depack: depackStarpack,
};


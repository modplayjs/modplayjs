// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Bitti09 — modplayjs contributors
// Ported from: libxmp src/loaders/prowizard/theplayer.c (The Player 5.0a /
// 6.0a common decoding) — set_event :33-53, track macro :56,
// decode_pattern :58-145, theplayer_depack :147-400, theplayer_test
// :402-500, pw_p50a/pw_p60a :505-548.

import { ptkTable, ptkIsValidNote } from './ptktable.js';
import { readmem16b, writeZero, pwReadTitle, type PwFormat } from './prowiz.js';

const PW_MOD_MAGIC = 0x4d2e4b2e; // 'M.K.'

function put8(out: number[], b: number): void { out.push(b & 0xff); }
function put16b(out: number[], v: number): void { out.push((v >> 8) & 0xff, v & 0xff); }
function put32b(out: number[], v: number): void {
  out.push((v >>> 24) & 0xff, (v >> 16) & 0xff, (v >> 8) & 0xff, v & 0xff);
}

/**
 * set_event (theplayer.c:33-53). Returns the effect nibble b (the caller
 * checks 0x0d/0x0b for break/jump). Writes 4 bytes into out.
 */
function setEvent(out: number[], c1v: number, c2v: number, c3v: number): number {
  if (ptkIsValidNote(Math.trunc(c1v / 2))) {
    out.push(((c1v << 4) & 0x10) | ptkTable[Math.trunc(c1v / 2)]![0]);
    out.push(ptkTable[Math.trunc(c1v / 2)]![1]);
  } else {
    out.push((c1v << 4) & 0x10);
    out.push(0);
  }

  const b = c2v & 0x0f;
  let c2 = c2v;
  if (b === 0x08) c2 -= 0x08;
  out.push(c2 & 0xff);

  let c3 = c3v;
  if (b === 0x05 || b === 0x06 || b === 0x0a) {
    c3 = c3 > 0x7f ? ((0x100 - c3) << 4) & 0xf0 : c3;
  }
  out.push(c3 & 0xff);

  return b;
}

/** track(p,c,r) = tdata[p * 1024 + r * 16 + c * 4] (theplayer.c:56). */
function trackOff(p: number, c: number, r: number): number {
  return p * 1024 + r * 16 + c * 4;
}

/** decode_pattern (theplayer.c:58-145). */
function decodePattern(
  data: Uint8Array,
  posIn: number,
  npat: number,
  tdata: Uint8Array,
  taddr: number[][],
): number {
  let pos = posIn;
  const tdataAddr = posIn;
  const u8 = () => data[pos++] ?? 0;

  for (let i = 0; i < npat; i++) {
    let maxRow = 63;

    for (let j = 0; j < 4; j++) {
      pos = taddr[i]![j]! + tdataAddr;

      for (let k = 0; k <= maxRow; k++) {
        let c1 = u8();
        const c2 = u8();
        const c3 = u8();

        // case 2 (theplayer.c:78-114): 0x80-flagged with relative note
        if ((c1 & 0x80) !== 0 && c1 !== 0x80) {
          const c4 = u8(); // number of empty rows
          c1 = 0xff - c1;  // relative note number

          const cell: number[] = [];
          const effect = setEvent(cell, c1, c2, c3);
          for (let t = 0; t < 4; t++) tdata[trackOff(i, j, k) + t] = cell[t] ?? 0;

          if (effect === 0x0d) { maxRow = k; break; } // pattern break
          if (effect === 0x0b) { maxRow = k; break; } // pattern jump
          if (c4 < 0x80) { k += c4; continue; }       // skip rows
          const c4b = 0x100 - c4;

          for (let l = 0; l < c4b; l++) {
            if (++k >= 64) break;
            const cell2: number[] = [];
            setEvent(cell2, c1, c2, c3);
            for (let t = 0; t < 4; t++) tdata[trackOff(i, j, k) + t] = cell2[t] ?? 0;
          }
          continue;
        }

        // case 3 (theplayer.c:117-168): 0x80 = repeat block
        if (c1 === 0x80) {
          const c4 = u8();
          const posSaved = pos;
          const lines = c2;
          pos -= ((c3 << 8) + c4);

          for (let l = 0; l <= lines && k < 64; l++, k++) {
            c1 = u8();
            const c2b = u8();
            const c3b = u8();

            if ((c1 & 0x80) !== 0 && c1 !== 0x80) {
              const c4b = u8();
              c1 = 0xff - c1;

              if (k >= 64) continue;

              const cell: number[] = [];
              const effect = setEvent(cell, c1, c2b, c3b);
              for (let t = 0; t < 4; t++) tdata[trackOff(i, j, k) + t] = cell[t] ?? 0;

              if (effect === 0x0d) { maxRow = k; k = l = 9999; continue; }
              if (effect === 0x0b) { maxRow = k; k = l = 9999; continue; }
              if (c4b < 0x80) { k += c4b; continue; }
              const fold = 0x100 - c4b;
              let foldCount = fold;
              while (foldCount-- > 0) {
                if (++k >= 64) break;
                const cell2: number[] = [];
                setEvent(cell2, c1, c2b, c3b);
                for (let t = 0; t < 4; t++) tdata[trackOff(i, j, k) + t] = cell2[t] ?? 0;
              }
            }

            if (k >= 64) break;

            const cell: number[] = [];
            setEvent(cell, c1, c2b, c3b);
            for (let t = 0; t < 4; t++) tdata[trackOff(i, j, k) + t] = cell[t] ?? 0;
          }

          pos = posSaved;
          k--;
          continue;
        }

        // case 1 (theplayer.c:171-186): plain event
        const cell: number[] = [];
        const effect = setEvent(cell, c1, c2, c3);
        for (let t = 0; t < 4; t++) tdata[trackOff(i, j, k) + t] = cell[t] ?? 0;

        if (effect === 0x0d) { maxRow = k; break; }
        if (effect === 0x0b) { maxRow = k; break; }
      }
    }
  }

  return 0;
}

/** theplayer_depack (theplayer.c:147-400). */
function theplayerDepack(data: Uint8Array, start: number, version: number): Uint8Array {
  let pos = start;
  const out: number[] = [];
  const u8 = () => data[pos++] ?? 0;
  const u16 = () => { const v = readmem16b(data, pos); pos += 2; return v; };

  const sdataAddr = u16(); // sample data address
  let npat = u8();         // real number of patterns
  if (npat > 128) throw new Error('theplayer: too many patterns');

  let nins = u8(); // number of samples
  let delta = 0;
  if ((nins & 0x80) !== 0) delta = 1; // delta-coded samples
  if (version >= 0x60 && (nins & 0x40) !== 0) {
    throw new Error('theplayer: packed samples not supported'); // theplayer.c:176-184
  }
  nins &= 0x3f;
  if (nins > 31) throw new Error('theplayer: too many samples');

  writeZero(out, 20); // title

  // Sample headers (theplayer.c:213-255)
  const isize: number[] = new Array(31).fill(0);
  const smpSize: number[] = new Array(31).fill(0);
  const saddr: number[] = new Array(31).fill(0);
  let i = 0;
  for (; i < nins; i++) {
    writeZero(out, 22); // name

    const j0 = isize[i] = u16(); // sample size

    if (j0 > 0xff00) {
      // Reference to a previous sample (theplayer.c:224-228)
      smpSize[i] = smpSize[0xffff - j0]!;
      isize[i] = isize[0xffff - j0]!;
      saddr[i] = saddr[0xffff - j0]!;
    } else {
      if (i > 0) saddr[i] = saddr[i - 1]! + smpSize[i - 1]!;
      smpSize[i] = j0 * 2;
    }
    const j = Math.trunc(smpSize[i]! / 2);

    put16b(out, isize[i]!);

    const c1 = u8(); // finetune
    put8(out, c1 & 0x3f);
    put8(out, u8()); // volume
    const val = u16(); // loop start

    if (val === 0xffff) {
      put16b(out, 0x0000); // loop start
      put16b(out, 0x0001); // loop size
    } else {
      put16b(out, val);
      put16b(out, j - val); // loop size
    }
  }

  // Pad to 31 (theplayer.c:258-262)
  {
    const pad = new Array<number>(30).fill(0);
    pad[29] = 0x01;
    for (; i < 31; i++) out.push(...pad);
  }

  // Track addresses per pattern (theplayer.c:265-269)
  const taddr: number[][] = [];
  for (let p = 0; p < npat; p++) {
    const row: number[] = [];
    for (let j = 0; j < 4; j++) row.push(u16());
    taddr.push(row);
  }

  // Pattern table (theplayer.c:272-281): 0xff-terminated; p5 halves values.
  const ptable = new Array<number>(128).fill(0);
  let patPos = 0;
  for (; patPos < 128; patPos++) {
    const c1 = u8();
    if (c1 === 0xff) break;
    ptable[patPos] = version >= 0x60 ? c1 : Math.trunc(c1 / 2);
  }
  put8(out, patPos);
  put8(out, 0x7f);
  for (let p = 0; p < 128; p++) put8(out, ptable[p]!);
  put32b(out, PW_MOD_MAGIC);

  // Decode patterns (theplayer.c:284-288) and write tdata (1024 × npat)
  const tdata = new Uint8Array(512 * 256);
  decodePattern(data, pos, npat, tdata, taddr);
  for (let p = 0; p < npat; p++) {
    for (let b = 0; b < 1024; b++) out.push(tdata[p * 1024 + b]!);
  }

  // Sample data (theplayer.c:296-312): delta decode when flagged.
  for (let s = 0; s < nins; s++) {
    const smpBuf = new Uint8Array(smpSize[s]!);
    const src = start + sdataAddr + saddr[s]!;
    for (let k = 0; k < smpSize[s]!; k++) smpBuf[k] = data[src + k] ?? 0;
    if (delta === 1) {
      for (let j = 1; j < smpSize[s]!; j++) {
        const c3 = 0x100 - smpBuf[j]! + smpBuf[j - 1]!;
        smpBuf[j] = c3 & 0xff;
      }
    }
    for (let k = 0; k < smpSize[s]!; k++) out.push(smpBuf[k]!);
  }

  return Uint8Array.from(out);
}

/** theplayer_test (theplayer.c:402-500). */
function theplayerTest(data: Uint8Array, start: number, version: number): number {
  const s = data.length - start;
  if (s < 4) return 4 - s;

  const numPat = data[start + 2]!;
  if (numPat === 0 || numPat > 0x7f) return -1;

  const numIns = data[start + 3]! & 0x3f;
  if (numIns === 0 || numIns > 0x1f) return -1;

  if (s < numIns * 6 + 4) return numIns * 6 + 4 - s;

  for (let i = 0; i < numIns; i++) {
    if (data[start + i * 6 + 7]! > 0x40) return -1; // volumes
    if (data[start + i * 6 + 6]! > 0x0f) return -1; // finetunes
  }

  for (let i = 0; i < numIns; i++) {
    const size = readmem16b(data, start + i * 6 + 4);
    if ((size <= 0xffdf && size > 0x8000) || size === 0) return -1;

    const lstart = readmem16b(data, start + i * 6 + 8);
    if (lstart !== 0xffff && lstart >= size) return -1;

    if (size > 0xffdf && 0xffff - size > numIns) return -1;
  }

  // Sample data address (theplayer.c:438-441)
  const sdata = readmem16b(data, start);
  if (sdata < numIns * 6 + 4 + numPat * 8) return -1;

  if (s < numPat * 8 + numIns * 6 + 4) return numPat * 8 + numIns * 6 + 4 - s;

  // Track table (theplayer.c:445-450)
  for (let i = 0; i < numPat * 4; i++) {
    const x = readmem16b(data, start + 4 + numIns * 6 + i * 2);
    if (x + numIns * 6 + 4 + numPat * 8 > sdata) return -1;
  }

  if (s < numPat * 8 + numIns * 6 + 4 + 128) return numPat * 8 + numIns * 6 + 4 + 128 - s;

  // Pattern table (theplayer.c:453-472)
  let len = 0;
  while (len < 128) {
    const pat = data[start + numIns * 6 + 4 + numPat * 8 + len]!;
    if (pat === 0xff) break;
    if (version >= 0x60) {
      if (pat > numPat - 1) return -1;
    } else {
      if ((pat & 0x01) !== 0) return -1;
      if (pat > numPat * 2) return -1;
    }
    len++;
  }

  if (numIns * 6 + 4 + numPat * 8 + len > sdata) return -1;
  if (len === 0 || len === 128) return -1;

  // Notes (theplayer.c:478-498)
  if (s < sdata + 1) return sdata + 1 - s;

  len++;
  for (let i = numIns * 6 + 4 + numPat * 8 + len; i < sdata; i++) {
    const d = start + i;
    if ((~data[d]! & 0x80) !== 0) {
      if (data[d]! > 0x49) return -1;
      const ins = ((data[d]! << 4) & 0x10) | ((data[d + 1]! >> 4) & 0x0f);
      if (ins > numIns) return -1;
      i += 2;
    } else {
      i += 3;
    }
  }

  pwReadTitle(null, 0);

  return 0;
}

/** pw_p50a: "The Player 5.0a". */
export const pwP50a: PwFormat = {
  name: 'The Player 5.0a',
  test: (data, start) => theplayerTest(data, start, 0x50),
  depack: (data, start) => theplayerDepack(data, start, 0x50),
};

/** pw_p60a: "The Player 6.0a". */
export const pwP60a: PwFormat = {
  name: 'The Player 6.0a',
  test: (data, start) => theplayerTest(data, start, 0x60),
  depack: (data, start) => theplayerDepack(data, start, 0x60),
};

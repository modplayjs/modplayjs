// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Bitti09 — modplayjs contributors
// Ported from: libxmp src/loaders/prowizard/p40.c (The Player 4.0a/4.0b/
// 4.1a depacker) — depack_p4x :69-262, set_event :34-54, test_p4x :264-285.

import { ptkTable, ptkIsValidNote } from './ptktable.js';
import { readmem16b, readmem32b, moveData, writeZero, pwReadTitle, type PwFormat } from './prowiz.js';

const MAGIC_P40A = 0x50343041; // 'P40A'
const MAGIC_P40B = 0x50343042; // 'P40B'
const MAGIC_P41A = 0x50343141; // 'P41A'
const PW_MOD_MAGIC = 0x4d2e4b2e; // 'M.K.'

function put8(out: number[], b: number): void { out.push(b & 0xff); }
function put16b(out: number[], v: number): void { out.push((v >> 8) & 0xff, v & 0xff); }
function put32b(out: number[], v: number): void {
  out.push((v >>> 24) & 0xff, (v >> 16) & 0xff, (v >> 8) & 0xff, v & 0xff);
}

/**
 * set_event (p40.c:34-54): translate a 3-byte Player-4.x cell into a
 * 4-byte Protracker cell. Junk after Dxx is dummied out. Returns void —
 * the caller reads effect nibbles from the raw bytes.
 */
function setEvent(out: number[], c1: number, c2: number, c3: number): void {
  let mynote = c1 & 0x7f;

  if (!ptkIsValidNote(Math.trunc(mynote / 2))) {
    mynote = c1 = c2 = c3 = 0;
  }

  out.push(((c1 << 4) & 0x10) | ptkTable[Math.trunc(mynote / 2)]![0]);
  out.push(ptkTable[Math.trunc(mynote / 2)]![1]);

  const b = c2 & 0x0f;
  if (b === 0x08) c2 -= 0x08;
  out.push(c2 & 0xff);

  if (b === 0x05 || b === 0x06 || b === 0x0a) {
    c3 = c3 > 0x7f ? (c3 << 4) & 0xf0 : c3;
  }
  out.push(c3 & 0xff);
}

/** track(p,c,r) = tdata[(p * 4 + c) * 256 + r * 4] (p40.c:56). */
function trackOff(p: number, c: number, r: number): number {
  return (p * 4 + c) * 256 + r * 4;
}

/**
 * depack_p4x (p40.c:69-262).
 */
function depackP4x(data: Uint8Array, start: number): Uint8Array {
  const inSize = data.length - start;
  let pos = start;

  const u8 = () => data[pos++] ?? 0;
  const u16 = () => { const v = readmem16b(data, pos); pos += 2; return v; };
  const u32 = () => { const v = readmem32b(data, pos); pos += 4; return v; };
  const seek = (n: number) => { pos = start + n; };

  const id = u32();
  u8(); // real number of patterns
  const len = u8(); // number of patterns in list
  if (len >= 128) throw new Error('p4x: pattern list too long');

  const nsmp = u8(); // number of samples
  if (nsmp > 31) throw new Error('p4x: too many samples');

  u8(); // bypass empty byte
  const trkdatOfs = u32() + 4; // track data address
  const trktabOfs = u32() + 4; // track table address
  const smpOfs = u32() + 4;    // sample data address

  // Addresses count from after the magic string (p40.c:105-115)
  if (trkdatOfs < 4 || trktabOfs < 4 || smpOfs < 4 ||
      trkdatOfs >= inSize || trktabOfs >= inSize || smpOfs >= inSize) {
    throw new Error('p4x: bad addresses');
  }

  const out: number[] = [];
  writeZero(out, 20); // title

  // Sample headers (p40.c:122-160)
  const sampleAddress: number[] = [];
  const sampleSize: number[] = [];
  for (let i = 0; i < nsmp; i++) {
    const addr = u32();
    sampleAddress.push(addr);
    const size = u16();
    sampleSize.push(size * 2);
    const loopAddr = u32();
    const loopSize = u16();
    let fine = 0;
    if (id === MAGIC_P40A || id === MAGIC_P40B) fine = u16();
    u8(); // bypass 00h
    const vol = u8();
    if (id === MAGIC_P41A) fine = u16();

    // Sanity (p40.c:144-149)
    if (addr < 0 || loopAddr < 0 || loopAddr < addr || addr > inSize - smpOfs) {
      throw new Error('p4x: bad sample addresses');
    }

    writeZero(out, 22); // sample name
    put16b(out, size);
    put8(out, Math.trunc(fine / 74));
    put8(out, vol);
    put16b(out, Math.trunc((loopAddr - addr) / 2));
    put16b(out, loopSize);
  }

  // Pad to 31 samples (p40.c:163-166): zeros with a 0x01 loop-size flag.
  {
    const pad = new Array<number>(30).fill(0);
    pad[29] = 0x01;
    for (let i = nsmp; i < 31; i++) out.push(...pad);
  }

  put8(out, len);    // size of pattern list
  put8(out, 0x7f);   // noisetracker byte

  seek(trktabOfs);

  // Pattern list (p40.c:171-176)
  for (let c1 = 0; c1 < len; c1++) put8(out, c1);
  for (let c1 = len; c1 < 128; c1++) put8(out, 0);

  put32b(out, PW_MOD_MAGIC);

  // Track addresses per pattern (p40.c:178-182)
  const trackAddr: number[][] = [];
  for (let i = 0; i < len; i++) {
    const row: number[] = [];
    for (let j = 0; j < 4; j++) row.push(u16() + trkdatOfs);
    trackAddr.push(row);
  }

  // Track data expansion (p40.c:184-262): tdata holds 512 tracks × 256.
  const tdata = new Uint8Array(512 * 256);

  const read4 = (): [number, number, number, number] => {
    const v = [data[pos] ?? 0, data[pos + 1] ?? 0, data[pos + 2] ?? 0, data[pos + 3] ?? 0];
    pos += 4;
    return v as [number, number, number, number];
  };

  const trySet = (p: number, j: number, k: number, c1: number, c2: number, c3: number): void => {
    const tmp: number[] = [];
    setEvent(tmp, c1, c2, c3);
    const base = trackOff(p, j, k);
    for (let b = 0; b < 4; b++) tdata[base + b] = tmp[b] ?? 0;
  };

  for (let i = 0; i < len; i++) {
    for (let j = 0; j < 4; j++) {
      pos = trackAddr[i]![j]!; // hio_seek once per (pattern, channel) — p40.c:189
      for (let k = 0; k < 64; k++) {
        let [c1, c2, c3, c4] = read4();

        if (c1 !== 0x80) {
          if (pos > data.length) throw new Error('p4x: track read error');
          trySet(i, j, k, c1, c2, c3);

          if (c4 > 0x00 && c4 < 0x80) k += c4;
          if (c4 > 0x7f) {
            k++;
            for (let l = 256; l > c4; l--) {
              if (k >= 64) break;
              trySet(i, j, k, c1, c2, c3);
              k++;
            }
            k--;
          }
          continue;
        }

        // Case 0x80: repeat block (p40.c:210-246)
        const a = pos; // position after the 0x80 marker
        const c5 = c2;
        const b = (c3 << 8) + c4 + trkdatOfs;

        pos = start + b;

        for (let c = 0; c <= c5; c++) {
          if (k >= 64) break;

          [c1, c2, c3, c4] = read4();
          trySet(i, j, k, c1, c2, c3);

          if (c4 > 0x00 && c4 < 0x80) k += c4;
          if (c4 > 0x7f) {
            k++;
            for (let l = 256; l > c4; l--) {
              if (k >= 64) break;
              trySet(i, j, k, c1, c2, c3);
              k++;
            }
            k--;
          }
          k++;
        }
        k--;
        pos = a;
      }
    }
  }

  // Write pattern data (p40.c:264-277)
  for (let i = 0; i < len; i++) {
    for (let j = 0; j < 64; j++) {
      for (let k = 0; k < 4; k++) {
        const base = trackOff(i, k, j);
        for (let b = 0; b < 4; b++) out.push(tdata[base + b]!);
      }
    }
  }

  // Sample data (p40.c:280-284); Lost Vikings p4x.ingame2 has a sample at EOF.
  for (let i = 0; i < nsmp; i++) {
    moveData(data, start + sampleAddress[i]! + smpOfs, out, sampleSize[i]!);
  }

  return Uint8Array.from(out);
}

/** test_p4x (p40.c:287-311) — magic-only probe. */
function testP4x(data: Uint8Array, start: number): number {
  const s = data.length - start;
  if (s < 8) return 8 - s;

  const id = readmem32b(data, start);
  if (id !== MAGIC_P40A && id !== MAGIC_P40B && id !== MAGIC_P41A) return -1;

  pwReadTitle(null, 0);
  return 0;
}

/** pw_p4x (p40.c:313-317): "The Player 4.x". */
export const pwP4x: PwFormat = {
  name: 'The Player 4.x',
  test: testP4x,
  depack: depackP4x,
};

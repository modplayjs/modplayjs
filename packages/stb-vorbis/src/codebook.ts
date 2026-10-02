// SPDX-License-Identifier: BSD-3-Clause
// Ported from stb_vorbis.c — codebooks: codeword computation, accelerated
// huffman, sorted tables, VQ lookup expansion, and scalar decode.

import {
  type Vorb, type Codebook,
  NO_CODE, FAST_HUFFMAN_TABLE_SIZE, FAST_HUFFMAN_TABLE_MASK, STB_VORBIS_FAST_HUFFMAN_LENGTH,
} from './types.js';
import { prepHuffman, getBits } from './stream.js';

export function bitReverse(n: number): number {
  n = ((n & 0xaaaaaaaa) >>> 1) | ((n & 0x55555555) << 1);
  n = ((n & 0xcccccccc) >>> 2) | ((n & 0x33333333) << 2);
  n = ((n & 0xf0f0f0f0) >>> 4) | ((n & 0x0f0f0f0f) << 4);
  n = ((n & 0xff00ff00) >>> 8) | ((n & 0x00ff00ff) << 8);
  return (n >>> 16 | n << 16) >>> 0;
}

export function ilog(n: number): number {
  const log2_4 = [0, 1, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 4, 4, 4, 4];
  if (n < 0) return 0;
  if (n < (1 << 14)) {
    if (n < (1 << 4)) return 0 + log2_4[n]!;
    else if (n < (1 << 9)) return 5 + log2_4[n >> 5]!;
    else return 10 + log2_4[n >> 10]!;
  } else if (n < (1 << 24)) {
    if (n < (1 << 19)) return 15 + log2_4[n >> 15]!;
    else return 20 + log2_4[n >> 20]!;
  } else if (n < (1 << 29)) return 25 + log2_4[n >> 25]!;
  else return 30 + log2_4[n >>> 30]!;
}

export function float32Unpack(x: number): number {
  const mantissa = x & 0x1fffff;
  const sign = x & 0x80000000;
  const exp = (x & 0x7fe00000) >> 21;
  const res = sign ? -mantissa : mantissa;
  return Math.fround(res * Math.pow(2, exp - 788));
}

export function lookup1Values(entries: number, dim: number): number {
  let r = Math.floor(Math.exp(Math.log(entries) / dim));
  if (Math.floor(Math.pow(r + 1, dim)) <= entries) ++r;
  if (Math.pow(r + 1, dim) <= entries) return -1;
  if (Math.floor(Math.pow(r, dim)) > entries) return -1;
  return r;
}

function addEntry(c: Codebook, huffCode: number, symbol: number, count: number, len: number, values: Uint32Array | null): void {
  if (!c.sparse) {
    c.codewords![symbol] = huffCode;
  } else {
    c.codewords![count] = huffCode;
    c.codewordLengths![count] = len;
    values![count] = symbol;
  }
}

export function computeCodewords(c: Codebook, len: Uint8Array, n: number, values: Uint32Array | null): boolean {
  let m = 0;
  const available = new Uint32Array(32);
  let k = 0;
  for (; k < n; ++k) if (len[k]! < NO_CODE) break;
  if (k === n) return true;
  addEntry(c, 0, k, m++, len[k]!, values);
  for (let i = 1; i <= len[k]!; ++i) available[i] = (1 << (32 - i)) >>> 0;
  for (let i = k + 1; i < n; ++i) {
    let z = len[i]!;
    if (z === NO_CODE) continue;
    while (z > 0 && available[z] === 0) --z;
    if (z === 0) return false;
    const res = available[z]!;
    available[z] = 0;
    addEntry(c, bitReverse(res), i, m++, len[i]!, values);
    if (z !== len[i]) {
      for (let y = len[i]!; y > z; --y) {
        available[y] = (res + (1 << (32 - y))) >>> 0;
      }
    }
  }
  return true;
}

export function computeAcceleratedHuffman(c: Codebook): void {
  for (let i = 0; i < FAST_HUFFMAN_TABLE_SIZE; ++i) c.fastHuffman[i] = -1;
  const len = c.sparse ? c.sortedEntries : c.entries;
  for (let i = 0; i < len; ++i) {
    if (c.codewordLengths![i]! <= STB_VORBIS_FAST_HUFFMAN_LENGTH) {
      let z = c.sparse ? bitReverse(c.sortedCodewords![i]!) : c.codewords![i]!;
      while (z < FAST_HUFFMAN_TABLE_SIZE) {
        c.fastHuffman[z] = i;
        z += 1 << c.codewordLengths![i]!;
      }
    }
  }
}

function includeInSort(c: Codebook, len: number): boolean {
  if (c.sparse) return true;
  if (len === NO_CODE) return false;
  return len > STB_VORBIS_FAST_HUFFMAN_LENGTH;
}

export function computeSortedHuffman(c: Codebook, lengths: Uint8Array, values: Uint32Array | null): void {
  if (!c.sparse) {
    let k = 0;
    for (let i = 0; i < c.entries; ++i) {
      if (includeInSort(c, lengths[i]!)) c.sortedCodewords![k++] = bitReverse(c.codewords![i]!);
    }
  } else {
    for (let i = 0; i < c.sortedEntries; ++i) {
      c.sortedCodewords![i] = bitReverse(c.codewords![i]!);
    }
  }
  const arr = c.sortedCodewords!;
  const sub = arr.subarray(0, c.sortedEntries);
  Array.prototype.sort.call(sub, (a: number, b: number) => a - b);
  arr.subarray(0, c.sortedEntries).set(sub);
  arr[c.sortedEntries] = 0xffffffff;
  const len = c.sparse ? c.sortedEntries : c.entries;
  for (let i = 0; i < len; ++i) {
    const huffLen = c.sparse ? lengths[values![i]!]! : lengths[i]!;
    if (includeInSort(c, huffLen)) {
      const code = bitReverse(c.codewords![i]!);
      let x = 0, n = c.sortedEntries;
      while (n > 1) {
        const m = x + (n >> 1);
        if (c.sortedCodewords![m]! <= code) { x = m; n -= n >> 1; }
        else n >>= 1;
      }
      if (c.sparse) {
        c.sortedValues![x] = values![i]!;
        c.codewordLengths![x] = huffLen;
      } else {
        c.sortedValues![x] = i;
      }
    }
  }
}

// huffman scalar decode (stb_vorbis.c:1665-1783)
function codebookDecodeScalarRaw(z: Vorb, c: Codebook): number {
  prepHuffman(z);
  if (c.codewords === null && c.sortedCodewords === null) return -1;
  if (c.entries > 8 ? c.sortedCodewords !== null : c.codewords === null) {
    const code = bitReverse(z.acc);
    let x = 0, n = c.sortedEntries;
    while (n > 1) {
      const m = x + (n >> 1);
      if (c.sortedCodewords![m]! <= code) { x = m; n -= n >> 1; }
      else n >>= 1;
    }
    if (!c.sparse) x = c.sortedValues![x]!;
    const len = c.codewordLengths![x]!;
    if (z.validBits >= len) {
      z.acc >>>= len;
      z.validBits -= len;
      return x;
    }
    z.validBits = 0;
    return -1;
  }
  for (let i = 0; i < c.entries; ++i) {
    if (c.codewordLengths![i] === NO_CODE) continue;
    if (c.codewords![i] === (z.acc & ((1 << c.codewordLengths![i]!) - 1))) {
      if (z.validBits >= c.codewordLengths![i]!) {
        z.acc >>>= c.codewordLengths![i]!;
        z.validBits -= c.codewordLengths![i]!;
        return i;
      }
      z.validBits = 0;
      return -1;
    }
  }
  z.error = 11;
  z.validBits = 0;
  return -1;
}

export function decodeRawShared(z: Vorb, c: Codebook): number {
  return decodeRaw(z, c);
}

function decodeRaw(z: Vorb, c: Codebook): number {
  if (z.validBits < STB_VORBIS_FAST_HUFFMAN_LENGTH) prepHuffman(z);
  const v0 = z.acc & FAST_HUFFMAN_TABLE_MASK;
  let v = c.fastHuffman[v0] ?? -1;
  if (v >= 0) {
    const n = c.codewordLengths![v]!;
    z.acc >>>= n;
    z.validBits -= n;
    if (z.validBits < 0) { z.validBits = 0; v = -1; }
  } else {
    v = codebookDecodeScalarRaw(z, c);
  }
  return v;
}

function codebookDecodeStart(z: Vorb, c: Codebook): number {
  if (c.lookupType === 0) {
    z.error = 11;
    return -1;
  }
  let zz = decodeRaw(z, c);
  if (c.sparse) zz = c.sortedValues![zz]!;
  if (zz < 0) {
    if (z.bytesInSeg === 0 && z.lastSeg) return zz;
    z.error = 11;
  }
  return zz;
}

export function codebookDecode(z: Vorb, c: Codebook, output: Float32Array, len0: number): boolean {
  let zz = codebookDecodeStart(z, c);
  if (zz < 0) return false;
  let len = len0 > c.dimensions ? c.dimensions : len0;
  zz *= c.dimensions;
  if (c.sequenceP) {
    let last = 0;
    for (let i = 0; i < len; ++i) {
      const val = c.multiplicands![zz + i]! + last;
      output[i] = (output[i] ?? 0) + val;
      last = val + c.minimumValue;
    }
  } else {
    for (let i = 0; i < len; ++i) {
      output[i] = (output[i] ?? 0) + c.multiplicands![zz + i]!;
    }
  }
  return true;
}

export function codebookDecodeStep(z: Vorb, c: Codebook, output: Float32Array, off: number, len0: number, step: number): boolean {
  let zz = codebookDecodeStart(z, c);
  let last = 0;
  if (zz < 0) return false;
  let len = len0 > c.dimensions ? c.dimensions : len0;
  zz *= c.dimensions;
  for (let i = 0; i < len; ++i) {
    const val = c.multiplicands![zz + i]! + last;
    output[off + i * step] = (output[off + i * step] ?? 0) + val;
    if (c.sequenceP) last = val;
  }
  return true;
}

export function codebookDecodeDeinterleaveRepeat(
  z: Vorb, c: Codebook, outputs: Array<Float32Array | null>, ch: number,
  cInterP: { v: number }, pInterP: { v: number }, len: number, totalDecode0: number,
): boolean {
  let cInter = cInterP.v;
  let pInter = pInterP.v;
  let totalDecode = totalDecode0;
  if (c.lookupType === 0) { z.error = 11; return false; }
  while (totalDecode > 0) {
    let last = 0;
    let zz = decodeRaw(z, c);
    if (zz < 0) {
      if (z.bytesInSeg === 0 && z.lastSeg) return false;
      z.error = 11;
      return false;
    }
    let effective = c.dimensions;
    if (cInter + pInter * ch + effective > len * ch) {
      effective = len * ch - pInter * ch - cInter;
    }
    zz *= c.dimensions;
    if (c.sequenceP) {
      for (let i = 0; i < effective; ++i) {
        const val = c.multiplicands![zz + i]! + last;
        const ob = outputs[cInter]; if (ob) ob[pInter] = (ob[pInter] ?? 0) + val;
        if (++cInter === ch) { cInter = 0; ++pInter; }
        last = val;
      }
    } else {
      for (let i = 0; i < effective; ++i) {
        const val = c.multiplicands![zz + i]! + last;
        const ob = outputs[cInter]; if (ob) ob[pInter] = (ob[pInter] ?? 0) + val;
        if (++cInter === ch) { cInter = 0; ++pInter; }
      }
    }
    totalDecode -= effective;
  }
  cInterP.v = cInter;
  pInterP.v = pInter;
  return true;
}

export { getBits };

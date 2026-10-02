// SPDX-License-Identifier: BSD-3-Clause
// Ported from stb_vorbis.c — residue decode (types 0/1/2).

import { type Vorb, type Residue, type Codebook } from './types.js';
import { EOP } from './stream.js';
import { codebookDecode, codebookDecodeStep, codebookDecodeDeinterleaveRepeat, decodeRawShared } from './codebook.js';

function decodeSparse(z: Vorb, c: Codebook): number {
  let v = decodeRawShared(z, c);
  if (c.sparse) v = c.sortedValues![v]!;
  return v;
}

function residueDecode(
  z: Vorb, book: Codebook, target: Float32Array, offset0: number, n: number, rtype: number,
): boolean {
  if (rtype === 0) {
    const step = Math.floor(n / book.dimensions);
    for (let k = 0; k < step; ++k) {
      if (!codebookDecodeStep(z, book, target, offset0 + k, n - offset0 - k, step)) return false;
    }
  } else {
    let offset = offset0;
    for (let k = 0; k < n; ) {
      if (!codebookDecode(z, book, target.subarray(offset), n - k)) return false;
      k += book.dimensions;
      offset += book.dimensions;
    }
  }
  return true;
}

export function decodeResidue(
  z: Vorb, residueBuffers: Array<Float32Array | null>, ch: number, n: number, rn: number, doNotDecode: number[],
): void {
  const r: Residue = z.residueConfig[rn]!;
  const rtype = z.residueTypes[rn]!;
  const c = r.classbook;
  const classwords = z.codebooks[c]!.dimensions;
  const actualSize = rtype === 2 ? n * 2 : n;
  const limitRBegin = r.begin < actualSize ? r.begin : actualSize;
  const limitREnd = r.end < actualSize ? r.end : actualSize;
  const nRead = limitREnd - limitRBegin;
  const partRead = Math.floor(nRead / r.partSize);
  const partClassdata: Array<Array<Uint8Array>> = [];
  for (let i = 0; i < ch; ++i) {
    partClassdata.push([]);
    if (!doNotDecode[i]) {
      const buf = residueBuffers[i]!;
      buf.fill(0, 0, n);
    }
  }

  let done = false;

  if (rtype === 2 && ch !== 1) {
    let j = 0;
    for (; j < ch; ++j) if (!doNotDecode[j]) break;
    if (j === ch) done = true;

    if (!done) {
      for (let pass = 0; pass < 8 && !done; ++pass) {
        let pcount = 0;
        let classSet = 0;
        if (ch === 2) {
          while (pcount < partRead && !done) {
            let zz = r.begin + pcount * r.partSize;
            let cInter = zz & 1;
            let pInter = zz >> 1;
            if (pass === 0) {
              const cb = z.codebooks[r.classbook]!;
              const q = decodeSparse(z, cb);
              if (q === EOP) break;
              partClassdata[0]![classSet] = r.classdata![q]!;
            }
            for (let i = 0; i < classwords && pcount < partRead; ++i, ++pcount) {
              const zz2 = r.begin + pcount * r.partSize;
              const cls = partClassdata[0]![classSet]![i]!;
              const b = r.residueBooks![cls]![pass]!;
              if (b >= 0) {
                const book = z.codebooks[b]!;
                const cInterP = { v: cInter };
                const pInterP = { v: pInter };
                if (!codebookDecodeDeinterleaveRepeat(z, book, residueBuffers, ch, cInterP, pInterP, n, r.partSize)) {
                  done = true;
                  break;
                }
                cInter = cInterP.v;
                pInter = pInterP.v;
              } else {
                zz2 + r.partSize;
                const z3 = r.begin + (pcount) * r.partSize + r.partSize;
                cInter = z3 & 1;
                pInter = z3 >> 1;
              }
            }
            ++classSet;
          }
        } else if (ch > 2) {
          while (pcount < partRead && !done) {
            let zz = r.begin + pcount * r.partSize;
            let cInter = zz % ch;
            let pInter = Math.floor(zz / ch);
            if (pass === 0) {
              const cb = z.codebooks[r.classbook]!;
              const q = decodeSparse(z, cb);
              if (q === EOP) break;
              partClassdata[0]![classSet] = r.classdata![q]!;
            }
            for (let i = 0; i < classwords && pcount < partRead; ++i, ++pcount) {
              const cls = partClassdata[0]![classSet]![i]!;
              const b = r.residueBooks![cls]![pass]!;
              if (b >= 0) {
                const book = z.codebooks[b]!;
                const cInterP = { v: cInter };
                const pInterP = { v: pInter };
                if (!codebookDecodeDeinterleaveRepeat(z, book, residueBuffers, ch, cInterP, pInterP, n, r.partSize)) {
                  done = true;
                  break;
                }
                cInter = cInterP.v;
                pInter = pInterP.v;
              } else {
                const z3 = r.begin + (pcount + 1) * r.partSize;
                cInter = z3 % ch;
                pInter = Math.floor(z3 / ch);
              }
            }
            ++classSet;
          }
        }
      }
    }
    return;
  }

  // per-channel residue (types 0/1) and type 2 mono
  for (let pass = 0; pass < 8 && !done; ++pass) {
    let pcount = 0;
    let classSet = 0;
    while (pcount < partRead && !done) {
      if (pass === 0) {
        for (let j = 0; j < ch; ++j) {
          if (!doNotDecode[j]) {
            const cb = z.codebooks[r.classbook]!;
            const temp = decodeSparse(z, cb);
            if (temp === EOP) { done = true; break; }
            partClassdata[j]![classSet] = r.classdata![temp]!;
          }
        }
        if (done) break;
      }
      for (let i = 0; i < classwords && pcount < partRead; ++i, ++pcount) {
        for (let j = 0; j < ch; ++j) {
          if (!doNotDecode[j]) {
            const cls = partClassdata[j]![classSet]![i]!;
            const b = r.residueBooks![cls]![pass]!;
            if (b >= 0) {
              const target = residueBuffers[j]!;
              const offset = r.begin + pcount * r.partSize;
              const n2 = r.partSize;
              const book = z.codebooks[b]!;
              if (!residueDecode(z, book, target, offset, n2, rtype)) {
                done = true;
                break;
              }
            }
          }
        }
        if (done) break;
      }
      ++classSet;
    }
  }
}

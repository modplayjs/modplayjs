// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Bitti09 — modplayjs contributors
// Ported from: libxmp src/loaders/prowizard/tp3.c (Tracker Packer v2 + v3,
// shared depack_tp23 :34-214, test_tp23 :216-277).

import { ptkTable, ptkIsValidNote } from './ptktable.js';
import { readmem16b, moveData, writeZero, pwReadTitle, type PwFormat } from './prowiz.js';

const PW_MOD_MAGIC = 0x4d2e4b2e; // 'M.K.'

function put8(out: number[], b: number): void { out.push(b & 0xff); }
function put16b(out: number[], v: number): void { out.push((v >> 8) & 0xff, v & 0xff); }
function put32b(out: number[], v: number): void {
  out.push((v >>> 24) & 0xff, (v >> 16) & 0xff, (v >> 8) & 0xff, v & 0xff);
}

/** depack_tp23 (tp3.c:34-214). ver = 2 or 3. */
function depackTp23(data: Uint8Array, start: number, ver: number): Uint8Array {
  let pos = start;
  const out: number[] = [];
  const u8 = () => data[pos++] ?? 0;
  const u16 = () => { const v = readmem16b(data, pos); pos += 2; return v; };

  pos += 8; // hio_seek(in, 8, SEEK_CUR) — skip magic

  // title (tp3.c:41): move 20 bytes verbatim
  for (let i = 0; i < 20; i++) out.push(data[pos++] ?? 0);

  const nins = u16() >> 3; // number of samples

  // Sample headers (tp3.c:45-58)
  let ssize = 0;
  for (let i = 0; i < nins; i++) {
    writeZero(out, 22); // sample name
    const c3 = u8(); // finetune
    const c4 = u8(); // volume
    const size = u16();
    ssize += size * 2;
    put16b(out, size);
    put8(out, c3);
    put8(out, c4);
    put16b(out, u16()); // loop start
    put16b(out, u16()); // loop size
  }

  // Pad to 31 (tp3.c:60-66): zeros with a 0x01 loop-size flag.
  {
    const pad = new Array<number>(30).fill(0);
    pad[29] = 0x01;
    for (let i = nins; i < 31; i++) out.push(...pad);
  }

  // Sequence length (tp3.c:69-78): one skipped byte, then the length.
  u8();
  const len = u8();
  if (len >= 128) throw new Error('tp23: sequence too long');
  put8(out, len);
  put8(out, 0x7f); // ntk byte

  // Pattern numbers (tp3.c:80-88): u16 track numbers / 8.
  const pnum: number[] = [];
  let npat = 0;
  for (let i = 0; i < len; i++) {
    const p = u16() >> 3;
    pnum.push(p);
    if (p > npat) npat = p;
  }
  if (npat >= 128) throw new Error('tp23: too many patterns');

  // Track addresses (tp3.c:91-101): (npat+1) patterns × 4.
  const trkOfs: number[][] = [];
  for (let i = 0; i <= npat; i++) {
    const row: number[] = [];
    for (let j = 0; j < 4; j++) row.push(u16());
    trkOfs.push(row);
  }

  // Pattern list + magic (tp3.c:104-106)
  for (let i = 0; i < 128; i++) put8(out, pnum[i]!);
  put32b(out, PW_MOD_MAGIC);

  // pat_ofs = hio_tell + 2 (tp3.c:108) — after the magic we just wrote;
  // the C file pointer sits after pnum+magic reads, +2 skips a size field.
  const patOfs = pos + 2;

  // Pattern data (tp3.c:111-205)
  const pdata = new Uint8Array(1024);
  let maxTrkOfs = 0;
  for (let i = 0; i <= npat; i++) {
    pdata.fill(0);
    for (let j = 0; j < 4; j++) {
      pos = patOfs + trkOfs[i]![j]!;
      for (let k = 0; k >= 0 && k < 64; k++) {
        const p = k * 16 + j * 4;
        const c1 = u8();
        if ((c1 & 0xc0) === 0xc0) {
          // Blank rows (tp3.c:126-129)
          k += 0x100 - c1 - 1;
          continue;
        }
        if ((c1 & 0xc0) === 0x80) {
          // Effect-only row (tp3.c:131-155)
          const c2 = u8();
          let fxt = ver === 2 ? (c1 >> 2) & 0x0f : (c1 >> 1) & 0x0f;
          let fxp = c2;
          if (fxt === 0x05 || fxt === 0x06 || fxt === 0x0a) {
            if (fxp > 0x80) fxp = 0x100 - fxp;
            else if (fxp <= 0x80) fxp = (fxp << 4) & 0xf0;
          }
          if (fxt === 0x08) fxt = 0x00;
          pdata[p + 2] = fxt;
          pdata[p + 3] = fxp;
          continue;
        }
        const c2 = u8();
        const ins = ((c2 >> 4) & 0x0f) | ((c1 >> 2) & 0x10);

        let note: number;
        if (ver === 2) {
          note = (c1 & 0xfe) >> 1;
        } else {
          if ((c1 & 0x40) === 0x40) note = 0x7f - c1;
          else note = c1 & 0x3f;
        }
        if (!ptkIsValidNote(note)) throw new Error('tp23: invalid note');

        const fxt = c2 & 0x0f;
        if (fxt === 0x00) {
          // No effect: 3-byte cell (tp3.c:150-158/166-174)
          pdata[p] = (ins & 0xf0) | ptkTable[note]![0];
          pdata[p + 1] = ptkTable[note]![1];
          pdata[p + 2] = ver === 2 ? ((ins << 4) & 0xf0) | 0 : (ins << 4) & 0xf0;
          continue;
        }

        const c3 = u8();
        let fxtV = fxt;
        if (fxtV === 0x08) fxtV = 0x00;
        let fxp = c3;
        if (fxtV === 0x05 || fxtV === 0x06 || fxtV === 0x0a) {
          if (fxp > 0x80) fxp = 0x100 - fxp;
          else if (fxp <= 0x80) fxp = (fxp << 4) & 0xf0;
        }
        pdata[p] = (ins & 0xf0) | ptkTable[note]![0];
        pdata[p + 1] = ptkTable[note]![1];
        pdata[p + 2] = ((ins << 4) & 0xf0) | fxtV;
        pdata[p + 3] = fxp;
      }
      if (pos > maxTrkOfs) maxTrkOfs = pos;
    }
    for (let k = 0; k < 1024; k++) out.push(pdata[k]!);
  }

  // Sample data (tp3.c:210-214): v3 pads max_trk_ofs to even.
  if (ver > 2 && (maxTrkOfs & 0x01) !== 0) maxTrkOfs += 1;
  moveData(data, maxTrkOfs, out, ssize);

  return Uint8Array.from(out);
}

/** test_tp23 (tp3.c:216-277). */
function testTp23(data: Uint8Array, start: number, magic: string): number {
  const s = data.length - start;
  if (s < 1024) return 1024 - s;

  for (let i = 0; i < 8; i++) {
    if (data[start + i] !== magic.charCodeAt(i)) return -1;
  }

  // Number of samples (tp3.c:226-230)
  let nins = readmem16b(data, start + 28);
  if (nins === 0 || (nins & 0x07) !== 0 || nins >> 3 > 31) return -1;
  nins >>= 3;

  for (let i = 0; i < nins; i++) {
    const d = start + i * 8;
    if (data[d + 30]! > 0x0f) return -1; // finetunes
    if (data[d + 31]! > 0x40) return -1; // volumes
  }

  // Sample sizes (tp3.c:236-255)
  let ssize = 0;
  for (let i = 0; i < nins; i++) {
    const d = start + i * 8;
    const l = readmem16b(data, d + 32) << 1;
    const lstart = readmem16b(data, d + 34) << 1;
    const lsize = readmem16b(data, d + 36) << 1;

    if (l > 0xffff || lstart > 0xffff || lsize > 0xffff) return -1;
    if (lstart + lsize > l + 2) return -1;
    if (lstart !== 0 && lsize === 0) return -1;
    ssize += l;
  }
  if (ssize <= 4) return -1;

  // Pattern list size (tp3.c:258-262)
  const npat = data[start + nins * 8 + 31]!;
  if (npat === 0 || npat > 128) return -1;

  pwReadTitle(data.subarray(start + 8), 20);

  return 0;
}

/** pw_tp3: "Tracker Packer v3" (magic CPLX_TP3). */
export const pwTp3: PwFormat = {
  name: 'Tracker Packer v3',
  test: (data, start) => testTp23(data, start, 'CPLX_TP3'),
  depack: (data, start) => depackTp23(data, start, 3),
};

/** pw_tp2: "Tracker Packer v2" (magic MEXX_TP2). */
export const pwTp2: PwFormat = {
  name: 'Tracker Packer v2',
  test: (data, start) => testTp23(data, start, 'MEXX_TP2'),
  depack: (data, start) => depackTp23(data, start, 2),
};

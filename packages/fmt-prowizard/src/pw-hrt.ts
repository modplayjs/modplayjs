// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Bitti09 — modplayjs contributors
// Ported from: libxmp src/loaders/prowizard/hrt.c (Hornet Packer) —
// depack_hrt :32-106, test_hrt :108-133.

import { ptkTable, ptkIsValidNote } from './ptktable.js';
import { moveData, pwReadTitle, type PwFormat } from './prowiz.js';

const PW_MOD_MAGIC = 0x4d2e4b2e; // 'M.K.'

function put8(out: number[], b: number): void { out.push(b & 0xff); }
function put32b(out: number[], v: number): void {
  out.push((v >>> 24) & 0xff, (v >> 16) & 0xff, (v >> 8) & 0xff, v & 0xff);
}

/** depack_hrt (hrt.c:32-106). */
function depackHrt(data: Uint8Array, start: number): Uint8Array {
  let pos = start;
  const out: number[] = [];

  // header: 950 bytes moved verbatim, but sample addresses erased (hrt.c:35-44)
  const buf = new Uint8Array(950);
  for (let i = 0; i < 950; i++) buf[i] = data[pos++] ?? 0;
  for (let i = 0; i < 31; i++) {
    const p = 38 + 30 * i;
    buf[p] = 0; buf[p + 1] = 0; buf[p + 2] = 0; buf[p + 3] = 0;
  }
  for (let i = 0; i < 950; i++) out.push(buf[i]!);

  // samples size (hrt.c:46-48)
  let ssize = 0;
  for (let i = 0; i < 31; i++) {
    ssize += ((buf[42 + 30 * i]! << 8) | buf[43 + 30 * i]!) * 2;
  }

  // song length + nst byte (hrt.c:49-51)
  const len = data[pos++] ?? 0;
  put8(out, len);
  put8(out, data[pos++] ?? 0); // nst byte

  // pattern list (hrt.c:52-55): 128 bytes
  const plist = new Uint8Array(128);
  for (let i = 0; i < 128; i++) plist[i] = data[pos++] ?? 0;
  for (let i = 0; i < 128; i++) out.push(plist[i]!);

  // number of patterns (hrt.c:57-62)
  let npat = 0;
  for (let i = 0; i < 128; i++) {
    if (plist[i]! > npat) npat = plist[i]!;
  }
  npat++;

  put32b(out, PW_MOD_MAGIC);

  // pattern data (hrt.c:66-96) at 1084: note halved, sample nibble packed
  pos = start + 1084;
  for (let i = 0; i < npat; i++) {
    for (let j = 0; j < 256; j++) {
      const b0 = data[pos++] ?? 0;
      const b1 = data[pos++] ?? 0;
      const b2 = data[pos++] ?? 0;
      const b3 = data[pos++] ?? 0;

      const b0h = Math.trunc(b0 / 2); // note halved; sample hi nibble kept
      let c1 = b0h & 0xf0;
      let c2 = 0;
      if (b1 !== 0 && ptkIsValidNote(Math.trunc(b1 / 2))) {
        c1 |= ptkTable[Math.trunc(b1 / 2)]![0];
        c2 = ptkTable[Math.trunc(b1 / 2)]![1];
      }
      const c3 = ((b0h << 4) & 0xf0) | b2;
      const c4 = b3;

      put8(out, c1);
      put8(out, c2);
      put8(out, c3);
      put8(out, c4);
    }
  }

  // sample data (hrt.c:99-102)
  moveData(data, pos, out, ssize);

  return Uint8Array.from(out);
}

/** test_hrt (hrt.c:108-133). */
function testHrt(data: Uint8Array, start: number): number {
  const s = data.length - start;
  if (s < 1084) return 1084 - s;

  // "HRT!" at 1080 (hrt.c:111-113)
  if (((data[start + 1080]! << 24) | (data[start + 1081]! << 16) | (data[start + 1082]! << 8) | data[start + 1083]!) !== 0x48525421) {
    return -1;
  }

  for (let i = 0; i < 31; i++) {
    const d = start + 20 + i * 30;
    if (data[d + 24]! > 0x0f) return -1; // finetune
    if (data[d + 25]! > 0x40) return -1; // volume
  }

  pwReadTitle(data.subarray(start), 20);

  return 0;
}

/** pw_hrt: "Hornet Packer". */
export const pwHrt: PwFormat = {
  name: 'Hornet Packer',
  test: testHrt,
  depack: depackHrt,
};

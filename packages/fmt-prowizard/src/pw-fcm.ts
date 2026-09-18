// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Bitti09 — modplayjs contributors
// Ported from: libxmp src/loaders/prowizard/fc-m.c (FC-M Packer 1.0) —
// depack_fcm :33-93, test_fcm :95-123.

import { pwReadTitle, type PwFormat } from './prowiz.js';

const PW_MOD_MAGIC = 0x4d2e4b2e; // 'M.K.'

function put8(out: number[], b: number): void { out.push(b & 0xff); }
function put16b(out: number[], v: number): void { out.push((v >> 8) & 0xff, v & 0xff); }
function put32b(out: number[], v: number): void {
  out.push((v >>> 24) & 0xff, (v >> 16) & 0xff, (v >> 8) & 0xff, v & 0xff);
}

/** depack_fcm (fc-m.c:33-93) — chunked container, mostly verbatim moves. */
function depackFcm(data: Uint8Array, start: number): Uint8Array {
  let pos = start;
  const out: number[] = [];
  const u8 = () => data[pos++] ?? 0;
  const u16 = () => { const v = (data[pos]! << 8) | data[pos + 1]!; pos += 2; return v; };
  const u32 = () => { const v = read32(data, pos); pos += 4; return v; };
  const read32 = (d: Uint8Array, o: number): number =>
    ((d[o]! << 24) | (d[o + 1]! << 16) | (d[o + 2]! << 8) | d[o + 3]!) >>> 0;

  u32(); // bypass "FC-M" ID
  u16(); // version number?
  u32(); // bypass "NAME" chunk
  // title: move 20 bytes (fc-m.c:42)
  for (let i = 0; i < 20; i++) out.push(data[pos++] ?? 0);
  u32(); // bypass "INST" chunk

  // Sample descriptions (fc-m.c:46-57)
  let ssize = 0;
  for (let i = 0; i < 31; i++) {
    for (let k = 0; k < 22; k++) out.push(0); // sample name
    const size = u16();
    put16b(out, size);
    ssize += size * 2;
    put8(out, u8()); // finetune
    put8(out, u8()); // volume
    put16b(out, u16()); // loop start
    let loopSize = u16();
    if (loopSize === 0) loopSize = 1;
    put16b(out, loopSize);
  }

  u32(); // bypass "LONG" chunk
  const patPos = u8();
  put8(out, patPos);
  put8(out, u8()); // NoiseTracker byte
  u32(); // bypass "PATT" chunk

  // Pattern list (fc-m.c:63-68)
  let patMax = 0;
  let i = 0;
  for (; i < patPos; i++) {
    const c1 = u8();
    put8(out, c1);
    if (c1 > patMax) patMax = c1;
  }
  for (; i < 128; i++) put8(out, 0);

  put32b(out, PW_MOD_MAGIC);
  u32(); // bypass "SONG" chunk

  // Pattern data (fc-m.c:72-74): verbatim 1024-byte blocks
  for (i = 0; i <= patMax; i++) {
    for (let k = 0; k < 1024; k++) out.push(data[pos++] ?? 0);
  }

  u32(); // bypass "SAMP" chunk
  // Sample data (fc-m.c:75-76)
  for (let k = 0; k < ssize && pos < data.length; k++) out.push(data[pos++] ?? 0);

  return Uint8Array.from(out);
}

/** test_fcm (fc-m.c:95-123). */
function testFcm(data: Uint8Array, start: number): number {
  const s = data.length - start;
  if (s < 37 + 8 * 31) return 37 + 8 * 31 - s;

  // "FC-M" (fc-m.c:100-104)
  if (data[start] !== 0x46 || data[start + 1] !== 0x43 ||
      data[start + 2] !== 0x2d || data[start + 3] !== 0x4d) {
    return -1;
  }

  // test 1 (fc-m.c:106-109)
  if (data[start + 4] !== 0x01) return -1;

  // test 2 (fc-m.c:111-114)
  if (data[start + 5] !== 0x00) return -1;

  // test 3 (fc-m.c:116-120)
  for (let j = 0; j < 31; j++) {
    if (data[start + 37 + 8 * j]! > 0x40) return -1;
  }

  pwReadTitle(data.subarray(start + 10), 20);

  return 0;
}

/** pw_fcm: "FC-M Packer". */
export const pwFcm: PwFormat = {
  name: 'FC-M Packer',
  test: testFcm,
  depack: depackFcm,
};

// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Bitti09 — modplayjs contributors
// Ported from: libxmp src/loaders/prowizard/mp.c (Module Protector, id +
// noID variants share depack_mp :36-80; test_mp_id :177-212, test_mp_noid
// :82-173).

import { readmem16b, readmem32b, moveData, writeZero, pwReadTitle, type PwFormat } from './prowiz.js';

const MAGIC_TRK1 = 0x54524b31; // 'TRK1'
const PW_MOD_MAGIC = 0x4d2e4b2e; // 'M.K.'

function put8(out: number[], b: number): void { out.push(b & 0xff); }
function put16b(out: number[], v: number): void { out.push((v >> 8) & 0xff, v & 0xff); }
function put32b(out: number[], v: number): void {
  out.push((v >>> 24) & 0xff, (v >> 16) & 0xff, (v >> 8) & 0xff, v & 0xff);
}

/** depack_mp (mp.c:36-80). */
function depackMp(data: Uint8Array, start: number): Uint8Array {
  let pos = start;
  const out: number[] = [];
  const u8 = () => data[pos++] ?? 0;
  const u16 = () => { const v = readmem16b(data, pos); pos += 2; return v; };
  const u32 = () => { const v = readmem32b(data, pos); pos += 4; return v; };

  writeZero(out, 20); // title

  // TRK1 magic present → skip it; otherwise rewind (mp.c:48-49)
  if (u32() !== MAGIC_TRK1) pos -= 4;

  // Sample headers (mp.c:51-59)
  let ssize = 0;
  for (let i = 0; i < 31; i++) {
    writeZero(out, 22); // name
    const size = u16();
    ssize += size * 2;
    put16b(out, size);
    put8(out, u8()); // finetune
    put8(out, u8()); // volume
    put16b(out, u16()); // loop start
    put16b(out, u16()); // loop size
  }

  put8(out, u8()); // pattern table length
  put8(out, u8()); // NoiseTracker restart byte

  // Pattern list (mp.c:64-69)
  let max = 0;
  for (let i = 0; i < 128; i++) {
    const c1 = u8();
    put8(out, c1);
    if (c1 > max) max = c1;
  }
  max++;

  put32b(out, PW_MOD_MAGIC);

  // Bypass unknown empty bytes (mp.c:73-74)
  if (u32() !== 0) pos -= 4;

  // Pattern + sample data (mp.c:76-77)
  moveData(data, pos, out, 1024 * max);
  pos += 1024 * max;
  moveData(data, pos, out, ssize);

  return Uint8Array.from(out);
}

/** test_mp_noid (mp.c:82-173). */
function testMpNoid(data: Uint8Array, start: number): number {
  const s = data.length - start;
  if (s < 378) return 378 - s;

  // test #2 (mp.c:86-120): 31 × 8-byte sample headers
  let hdrSsize = 0;
  for (let i = 0; i < 31; i++) {
    const d = start + i * 8;
    const size = readmem16b(data, d) << 1;
    const lstart = readmem16b(data, d + 4) << 1;
    const lsize = readmem16b(data, d + 6) << 1;

    hdrSsize += size;

    if (data[d + 2]! > 0x0f) return -1;
    if (lsize !== 2 && lstart + lsize > size) return -1;
    if (lsize > size + 2) return -1;
    if (lstart !== 0 && lsize <= 2) return -1;
    if (size !== 0 && lsize === 0) return -1;
  }

  if (hdrSsize <= 2) return -1;

  // test #3 (mp.c:122-127)
  const len = data[start + 248]!;
  if (len === 0 || len > 0x7f) return -1;

  // test #4 (mp.c:129-142)
  let psize = 0;
  for (let i = 0; i < 128; i++) {
    const pat = data[start + 250 + i]!;
    if (pat > 0x7f) return -1;
    if (pat > psize) psize = pat;
    if (i > len + 3 && pat !== 0) return -1;
  }
  psize++;
  psize <<= 8;

  if (s < 378 + psize * 4) return 378 + psize * 4 - s;

  // test #5 (mp.c:145-151): ptk note check on pattern data
  // test #5 (mp.c:144-152): sample-header words must be >= 0x71 (d = i*8)
  for (let i = 0; i < 31; i++) {
    const d = start + i * 8;
    const val = readmem16b(data, d) & 0x0fff;
    if (val > 0 && val < 0x71) return -1;
  }

  // test #6 (mp.c:156-164)
  for (let i = 0; i < 31; i++) {
    const d = start + i * 8;
    const size = readmem16b(data, d) << 1;
    const lend = (readmem16b(data, d + 4) + readmem16b(data, d + 6)) << 1;
    if (lend > size + 2) return -1;
  }

  pwReadTitle(null, 0);

  return 0;
}

/** test_mp_id (mp.c:177-212) — "TRK1" signature. */
function testMpId(data: Uint8Array, start: number): number {
  const s = data.length - start;
  if (s < 382) return 382 - s;

  if (readmem32b(data, start) !== MAGIC_TRK1) return -1;

  // test #1 (mp.c:184-188)
  for (let i = 0; i < 31; i++) {
    if (data[start + 6 + 8 * i]! > 0x0f) return -1;
  }

  // test #2 (mp.c:190-194)
  const len = data[start + 252]!;
  if (len === 0 || len > 0x7f) return -1;

  // test #4 (mp.c:196-207)
  let psize = 0;
  for (let i = 0; i < 128; i++) {
    const pat = data[start + 254 + i]!;
    if (pat > 0x7f) return -1;
    if (pat > psize) psize = pat;
  }
  psize++;
  psize <<= 8;

  if (s < 382 + psize * 4) return 382 + psize * 4 - s;

  // test #5 (mp.c:210-214)
  for (let i = 0; i < psize; i++) {
    if (data[start + 382 + i * 4]! > 19) return -1;
  }

  pwReadTitle(null, 0);

  return 0;
}

/** pw_mp_id: "Module Protector" (TRK1). */
export const pwMpId: PwFormat = {
  name: 'Module Protector',
  test: testMpId,
  depack: depackMp,
};

/** pw_mp_noid: "Module Protector noID". */
export const pwMpNoid: PwFormat = {
  name: 'Module Protector noID',
  test: testMpNoid,
  depack: depackMp,
};

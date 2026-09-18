// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Bitti09 — modplayjs contributors
// Ported from: libxmp src/loaders/prowizard/wn.c (Wanton Packer) —
// depack_wn :32-88, test_wn :90-113.

import { ptkTable, ptkIsValidNote } from './ptktable.js';
import { moveData, pwReadTitle, type PwFormat } from './prowiz.js';

const PW_MOD_MAGIC = 0x4d2e4b2e; // 'M.K.'

function put8(out: number[], b: number): void { out.push(b & 0xff); }
function put32b(out: number[], v: number): void {
  out.push((v >>> 24) & 0xff, (v >> 16) & 0xff, (v >> 8) & 0xff, v & 0xff);
}

/** depack_wn (wn.c:32-88) — nearly a straight MOD copy with cell rewrite. */
function depackWn(data: Uint8Array, start: number): Uint8Array {
  let pos = start;
  const out: number[] = [];

  // header: move 950 bytes verbatim (wn.c:36)
  for (let i = 0; i < 950; i++) out.push(data[pos++] ?? 0);

  // whole sample size (wn.c:38-42): sizes at 42 + i*30
  let ssize = 0;
  for (let i = 0; i < 31; i++) {
    ssize += ((data[start + 42 + i * 30]! << 8) | data[start + 43 + i * 30]!) * 2;
  }

  // pattern list size (wn.c:45-47)
  const npat = data[start + 950]!;
  put8(out, npat);

  // order table + ntk byte (wn.c:48-50): 129 bytes (128 orders + 0x7f)
  for (let i = 0; i < 129; i++) out.push(data[start + 951 + i] ?? 0);

  // ptk ID (wn.c:52)
  put32b(out, PW_MOD_MAGIC);

  // highest pattern number (wn.c:54-59): from tmp[i+1] = orders at 952+
  let max = 0;
  for (let i = 0; i < 128; i++) {
    if (data[start + 951 + i + 1]! > max) max = data[start + 951 + i + 1]!;
  }
  max++;

  // pattern data (wn.c:61-83): 4-byte cells with note nibble rewrite
  pos = start + 1084;
  for (let i = 0; i < max; i++) {
    for (let j = 0; j < 256; j++) {
      const c1 = data[pos++] ?? 0;
      const c2 = data[pos++] ?? 0;
      const c3 = data[pos++] ?? 0;
      const c4 = data[pos++] ?? 0;

      if (!ptkIsValidNote(Math.trunc(c1 / 2))) throw new Error('wn: invalid note');

      put8(out, (c2 & 0xf0) | ptkTable[Math.trunc(c1 / 2)]![0]);
      put8(out, ptkTable[Math.trunc(c1 / 2)]![1]);
      put8(out, ((c2 << 4) & 0xf0) | c3);
      put8(out, c4);
    }
  }

  // sample data (wn.c:86)
  moveData(data, pos, out, ssize);

  return Uint8Array.from(out);
}

/** test_wn (wn.c:90-113). */
function testWn(data: Uint8Array, start: number): number {
  const s = data.length - start;
  if (s < 1082) return 1082 - s;

  // test 1 (wn.c:94-97): 'WN' at 1080
  if (data[start + 1080] !== 0x57 || data[start + 1081] !== 0x4e) return -1;

  // test 2 (wn.c:99-102): ntk byte
  if (data[start + 951] !== 0x7f) return -1;

  // test 3 (wn.c:104-107)
  if (data[start + 950]! > 0x7f) return -1;

  pwReadTitle(data.subarray(start), 20);

  return 0;
}

/** pw_wn: "Wanton Packer". */
export const pwWn: PwFormat = {
  name: 'Wanton Packer',
  test: testWn,
  depack: depackWn,
};

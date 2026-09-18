// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Bitti09 — modplayjs contributors
// Ported from: libxmp src/loaders/prowizard/ksm.c (Kefrens Sound Machine) —
// depack_ksm :32-190, test_ksm :192-250.

import { ptkTable, ptkIsValidNote } from './ptktable.js';
import { moveData, writeZero, pwReadTitle, type PwFormat } from './prowiz.js';

const PW_MOD_MAGIC = 0x4d2e4b2e; // 'M.K.'

function put8(out: number[], b: number): void { out.push(b & 0xff); }
function put16b(out: number[], v: number): void { out.push((v >> 8) & 0xff, v & 0xff); }
function put32b(out: number[], v: number): void {
  out.push((v >>> 24) & 0xff, (v >> 16) & 0xff, (v >> 8) & 0xff, v & 0xff);
}

/** depack_ksm (ksm.c:32-190). */
function depackKsm(data: Uint8Array, start: number): Uint8Array {
  let pos = start + 2; // title at offset 2 (ksm.c:37-39)
  const out: number[] = [];

  // title: move 13 bytes, pad 7 (ksm.c:38-39)
  for (let i = 0; i < 13; i++) out.push(data[pos++] ?? 0);
  writeZero(out, 7);

  // Sample headers (ksm.c:43-62) at 32: 15 × 32-byte records
  pos = start + 32;
  let ssize = 0;
  for (let i = 0; i < 15; i++) {
    writeZero(out, 22); // name
    pos += 20; // 16 unknown + 4 addr bytes
    const k = ((data[pos]! << 8) | data[pos + 1]!); pos += 2; // size (raw)
    put16b(out, Math.trunc(k / 2));
    ssize += k;
    put8(out, 0); // finetune
    put8(out, data[pos++] ?? 0); // volume
    pos += 1; // bypass 1 unknown byte
    const j = ((data[pos]! << 8) | data[pos + 1]!); pos += 2; // loop start
    put16b(out, Math.trunc(j / 2));
    const loopRest = k - j;
    put16b(out, loopRest !== k ? Math.trunc(loopRest / 2) : 1);
    pos += 6; // bypass 6 unknown bytes
  }

  // Pad samples 15..30 (ksm.c:64-68)
  {
    const pad = new Array<number>(30).fill(0);
    pad[29] = 1;
    for (let i = 0; i < 16; i++) out.push(...pad);
  }

  // Pattern list (ksm.c:71-88) at 512: 4 bytes per entry, 0xff-terminated.
  pos = start + 512;
  const trknum: number[][] = [];
  let maxTrknum = 0;
  let len = 0;
  for (; len < 128; len++) {
    const row = [data[pos] ?? 0, data[pos + 1] ?? 0, data[pos + 2] ?? 0, data[pos + 3] ?? 0];
    pos += 4;
    trknum.push(row);
    if (row[0] === 0xff) break;
    for (const v of row) {
      if (v > maxTrknum) maxTrknum = v;
    }
  }

  put8(out, len);
  put8(out, 0x7f); // ntk byte

  // Sort track numbers (ksm.c:91-119): dedup 4-tuples → plist
  const plist = new Array<number>(128).fill(0);
  let c5 = 0;
  for (let i = 0; i < len; i++) {
    if (i === 0) {
      plist[0] = c5;
      c5++;
      continue;
    }
    let status = 1;
    for (let j = 0; j < i; j++) {
      status = 1;
      for (let k = 0; k < 4; k++) {
        if (trknum[j]![k] !== trknum[i]![k]) {
          status = 0;
          break;
        }
      }
      if (status === 1) {
        plist[i] = plist[j]!;
        break;
      }
    }
    if (status === 0) {
      plist[i] = c5;
      c5++;
    }
    status = 1;
  }

  // Real track numbers for existing patterns (ksm.c:122-142)
  const realTnum: number[][] = [];
  let c1count = 0;
  for (let i = 0; i < len; i++) {
    if (i === 0) {
      realTnum.push([trknum[0]![0]!, trknum[0]![1]!, trknum[0]![2]!, trknum[0]![3]!]);
      c1count++;
      continue;
    }
    let status = 1;
    for (let j = 0; j < i; j++) {
      status = 1;
      if (plist[i] === plist[j]) {
        status = 0;
        break;
      }
    }
    if (status === 0) continue;
    realTnum.push([trknum[i]![0]!, trknum[i]![1]!, trknum[i]![2]!, trknum[i]![3]!]);
    c1count++;
    status = 1;
  }
  void c5;
  void c1count;

  // Pattern list + ID (ksm.c:144-146)
  for (let i = 0; i < 128; i++) put8(out, plist[i]!);
  put32b(out, PW_MOD_MAGIC);

  // Pattern data (ksm.c:149-177): tracks at 1536 + 192 × trknum, 3-byte cells
  for (let i = 0; i < c1count; i++) {
    const tmp = new Uint8Array(1024);
    const tdata: Uint8Array[] = [];
    for (let k = 0; k < 4; k++) {
      pos = start + 1536 + 192 * (realTnum[i]![k] ?? 0);
      const td = new Uint8Array(192);
      for (let t = 0; t < 192; t++) td[t] = data[pos++] ?? 0;
      tdata.push(td);
    }

    for (let j = 0; j < 64; j++) {
      const x = j * 16;

      for (let k = 0; k < 4; k++) {
        const t = tdata[k]!;
        const tBase = j * 3;

        // Sanity (ksm.c:159-162)
        if (!ptkIsValidNote(t[tBase] ?? 0)) throw new Error('ksm: invalid note');

        // 2-byte period from ptk (ksm.c:164)
        tmp[x + k * 4] = ptkTable[t[tBase] ?? 0]![0];
        tmp[x + k * 4 + 1] = ptkTable[t[tBase] ?? 0]![1];
        // sample/fxt byte with 0x0d → 0x0a normalization (ksm.c:165-167)
        let t1 = t[tBase + 1]!;
        if ((t1 & 0x0f) === 0x0d) t1 -= 0x03;
        tmp[x + k * 4 + 2] = t1;
        tmp[x + k * 4 + 3] = t[tBase + 2]!;
      }
    }

    for (let k = 0; k < 1024; k++) out.push(tmp[k]!);
  }

  // Sample data (ksm.c:180-183)
  moveData(data, start + 1536 + 192 * (maxTrknum + 1), out, ssize);

  return Uint8Array.from(out);
}

/** test_ksm (ksm.c:192-250). */
function testKsm(data: Uint8Array, start: number): number {
  const s = data.length - start;
  if (s < 1536) return 1536 - s;

  // test 1 (ksm.c:197-200): 'M.' at 0
  if (data[start] !== 0x4d || data[start + 1] !== 0x2e) return -1;

  // test "a" (ksm.c:203-205)
  if (data[start + 15] !== 0x61) return -1;

  // volumes (ksm.c:207-211)
  for (let i = 0; i < 15; i++) {
    if (data[start + 54 + i * 32]! > 0x40) return -1;
  }

  // Highest track number (ksm.c:214-230)
  let maxTrk = 0;
  let i = 0;
  for (; i < 1024; i++) {
    const x = data[start + i + 512]!;
    if (x === 0xff) break;
    if (x > maxTrk) maxTrk = x;
  }
  if (i === 1024) return -1;
  if (maxTrk === 0) return -1;

  // PW_REQUEST_DATA(s, 1536 + max_trk * 192 + 64 * 3)
  const need = 1536 + maxTrk * 192 + 64 * 3;
  if (s < need) return need - s;

  // Track data sanity (ksm.c:236-244)
  for (i = 0; i <= maxTrk; i++) {
    const d = start + 1536 + i * 192;
    for (let j = 0; j < 64; j++) {
      if (data[d + j * 3]! > 0x24) return -1;
    }
  }

  pwReadTitle(data.subarray(start + 2), 13);

  return 0;
}

/** pw_ksm: "Kefrens Sound Machine". */
export const pwKsm: PwFormat = {
  name: 'Kefrens Sound Machine',
  test: testKsm,
  depack: depackKsm,
};

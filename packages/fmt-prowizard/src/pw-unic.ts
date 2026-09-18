// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Bitti09 — modplayjs contributors
// Ported from: libxmp src/loaders/prowizard/unic.c (Unic Tracker, id/noid/
// emptyid variants share depack_unic :40-152; tests :154-398) and unic2.c
// (Unic Tracker 2).

import { ptkTable, ptkIsValidNote } from './ptktable.js';
import { readmem16b, readmem32b, moveData, type PwFormat } from './prowiz.js';

const MAGIC_M_K_ = 0x4d2e4b2e; // 'M.K.'
const MAGIC_UNIC = 0x554e4943; // 'UNIC'
const MAGIC_0000 = 0x00000000;

function put8(out: number[], b: number): void { out.push(b & 0xff); }
function put16b(out: number[], v: number): void { out.push((v >> 8) & 0xff, v & 0xff); }
function put32b(out: number[], v: number): void {
  out.push((v >>> 24) & 0xff, (v >> 16) & 0xff, (v >> 8) & 0xff, v & 0xff);
}

/** depack_unic (unic.c:40-152) — shared by id / noid / emptyid variants. */
function depackUnic(data: Uint8Array, start: number): Uint8Array {
  let pos = start;
  const out: number[] = [];
  const u8 = () => data[pos++] ?? 0;
  const u16 = () => { const v = readmem16b(data, pos); pos += 2; return v; };

  // title (unic.c:44): move 20 bytes verbatim
  for (let i = 0; i < 20; i++) out.push(data[pos++] ?? 0);

  // Sample headers (unic.c:47-86): 22-byte name moved, 2 zeros, then
  // finetune-from-loop-word, size, skip, fine, vol, loop with doubling.
  let ssize = 0;
  for (let i = 0; i < 31; i++) {
    // sample name (unic.c:48)
    for (let k = 0; k < 20; k++) out.push(data[pos++] ?? 0);
    put8(out, 0);
    put8(out, 0);

    // fine on? (unic.c:51-62)
    const c1 = u8();
    const c2 = u8();
    const j = (c1 << 8) + c2;
    let fine = 0;
    if (j !== 0) {
      fine = j < 256 ? 0x10 - c2 : 0x100 - c2;
    }

    // smp size (unic.c:65-67)
    const len = u16();
    put16b(out, len);
    ssize += len * 2;

    u8(); // skip
    put8(out, fine); // fine
    put8(out, u8()); // vol
    let lstart = u16(); // loop start
    const lsize = u16(); // loop size

    // unic.c:77-81: loop start in bytes when it fits
    if (lstart * 2 + lsize <= len && lstart !== 0) {
      lstart <<= 1;
    }
    put16b(out, lstart);
    put16b(out, lsize);
  }

  const npat = u8();
  put8(out, npat); // number of patterns
  put8(out, 0x7f); // noisetracker byte
  u8(); // skip

  // Pattern table (unic.c:91-93)
  const tmp: number[] = [];
  for (let i = 0; i < 128; i++) tmp.push(u8());
  for (let i = 0; i < 128; i++) put8(out, tmp[i]!);

  // Highest pattern number (unic.c:95-99)
  let max = 0;
  for (let i = 0; i < 128; i++) {
    if (tmp[i]! > max) max = tmp[i]!;
  }
  max++;

  put32b(out, 0x4d2e4b2e);

  // UNIC ID handling (unic.c:102-108): seek 1080; read32b ADVANCES the C
  // file pointer to 1084. If the id is nonzero and not M.K./UNIC, rewind 4
  // (pattern data starts at the id itself).
  pos = start + 1084; // read32b advanced past the id
  const id = readmem32b(data, start + 1080);
  if (id !== 0 && id !== MAGIC_M_K_ && id !== MAGIC_UNIC) {
    pos = start + 1080;
  }

  // Pattern data (unic.c:111-146): 3-byte cells.
  for (let i = 0; i < max; i++) {
    for (let j = 0; j < 256; j++) {
      const c1 = u8();
      const c2 = u8();
      const c3 = u8();
      if (pos > data.length + 1) throw new Error('unic: read error');

      const ins = ((c1 >> 2) & 0x10) | ((c2 >> 4) & 0x0f);
      const note = c1 & 0x3f;
      if (!ptkIsValidNote(note)) throw new Error('unic: invalid note');

      const fxt = c2 & 0x0f;
      let fxp = c3;

      if (fxt === 0x0d) {
        // pattern break: BCD-ish decimal → hex nybbles (unic.c:133-137)
        const tens = Math.trunc(fxp / 10);
        const ones = fxp % 10;
        fxp = 16 * tens + ones;
      }

      out.push((ins & 0xf0) | ptkTable[note]![0]);
      out.push(ptkTable[note]![1]);
      out.push(((ins << 4) & 0xf0) | fxt);
      out.push(fxp);
    }
  }

  // Sample data (unic.c:149-152)
  moveData(data, pos, out, ssize);

  return Uint8Array.from(out);
}

/** check_instruments (unic.c:154-204). Returns max non-empty sample index+1. */
function checkInstruments(data: Uint8Array, start: number): number {
  let ssize = 0;
  let maxIns = 0;
  for (let i = 0; i < 31; i++) {
    const d = start + i * 30;
    const len = readmem16b(data, d + 42) << 1;
    const lstart = readmem16b(data, d + 46) << 1;
    const lsize = readmem16b(data, d + 48) << 1;
    const fine = readmem16b(data, d + 40);

    ssize += len;
    if (lsize !== 0 && len + 2 < lstart + lsize) return -1;
    if (len > 0xffff || lstart > 0xffff || lsize > 0xffff) return -1;
    if (data[d + 45]! > 0x40) return -1;
    if ((fine !== 0 && len === 0) || (fine > 8 && fine < 247)) return -1;
    if (lstart !== 0 && lsize <= 2) return -1;
    if (data[d + 45]! !== 0 && len === 0) return -1;
    if (len !== 0) maxIns = i + 1;
  }
  if (ssize <= 2) return -1;
  return maxIns;
}

/** check_pattern_list_size (unic.c:206-235). Returns psize (<<8) or -1. */
function checkPatternListSize(data: Uint8Array, start: number): number {
  const len = data[start + 950]!;
  if (len === 0 || len > 127) return -1;

  let psize = 0;
  let i = 0;
  for (; i < len; i++) {
    const x = data[start + 952 + i]!;
    if (x > 127) return -1;
    if (x > psize) psize = x;
  }
  for (; i !== 128; i++) {
    if (data[start + 952 + i] !== 0) return -1;
  }
  psize++;
  psize <<= 8;
  return psize;
}

/** check_pattern (unic.c:237-272). */
function checkPattern(data: Uint8Array, s: number, psize: number, maxIns: number, offset: number): number {
  if (s < offset + psize * 3 + 2) return offset + psize * 3 + 2 - s;

  for (let i = 0; i < psize; i++) {
    const d = offset + i * 3;
    if (data[d]! > 0x74) return -1;
    if ((data[d]! & 0x3f) > 0x24) return -1;
    if ((data[d + 1]! & 0x0f) === 0x0c && data[d + 2]! > 0x40) return -1;
    if ((data[d + 1]! & 0x0f) === 0x0b && data[d + 2]! > 0x7f) return -1;
    if ((data[d + 1]! & 0x0f) === 0x0d && data[d + 2]! > 0x40) return -1;

    const ins = ((data[d]! >> 2) & 0x30) | ((data[d + 1]! >> 4) & 0x0f);
    if (ins > maxIns) return -1;
  }
  return 0;
}

/** test_unic_id (unic.c:274-322). */
function testUnicId(data: Uint8Array, start: number): number {
  const s = data.length - start;
  if (s < 1084) return 1084 - s;

  if (readmem32b(data, start + 1080) !== MAGIC_M_K_) return -1;

  let ssize = 0;
  for (let i = 0; i < 31; i++) {
    const d = start + i * 30;
    const size = readmem16b(data, d + 42) << 1;
    ssize += size;
    const end = (readmem16b(data, d + 46) + readmem16b(data, d + 48)) << 1;
    if (size + 2 < end) return -1;
  }
  if (ssize <= 2) return -1;

  for (let i = 0; i < 31; i++) {
    const d = start + i * 30;
    const fine = (data[d + 40]! << 24) >> 24; // int8
    if (fine < -8 || fine > 7) return -1;
    if (data[d + 44] !== 0 || data[d + 45]! > 0x40) return -1;
  }

  const psize = checkPatternListSize(data, start);
  if (psize < 0) return -1;

  if (s < psize * 3 + 1084) return psize * 3 + 1084 - s;

  for (let i = 0; i < psize; i++) {
    if (data[start + 1084 + i * 3]! > 0x74) return -1;
  }

  return 0;
}

/** test_unic_emptyid (unic.c:324-351) — ID = $00000000. */
function testUnicEmptyId(data: Uint8Array, start: number): number {
  const s = data.length - start;
  if (s < 1084) return 1084 - s;

  if (readmem32b(data, start + 1080) !== MAGIC_0000) return -1;

  const maxIns = checkInstruments(data, start);
  if (maxIns < 0) return -1;

  const psize = checkPatternListSize(data, start);
  if (psize < 0) return -1;

  const r = checkPattern(data, s, psize, maxIns, start + 1084);
  if (r < 0) return r;

  return 0;
}

/** test_unic_noid (unic.c:353-394). */
function testUnicNoid(data: Uint8Array, start: number): number {
  const s = data.length - start;
  if (s < 1084) return 1084 - s;

  if (readmem32b(data, start + 1080) === MAGIC_0000) return -1;

  const maxIns = checkInstruments(data, start);
  if (maxIns < 0) return -1;

  const psize = checkPatternListSize(data, start);
  if (psize < 0) return -1;

  const r = checkPattern(data, s, psize, maxIns, start + 1080);
  if (r < 0) return r;

  // Title coherence (unic.c:384-390)
  for (let i = 0; i < 20; i++) {
    const c = data[start + i]!;
    if ((c !== 0 && c < 32) || c > 180) return -1;
  }

  return 0;
}

/** pw_unic_id: "UNIC Tracker". */
export const pwUnicId: PwFormat = {
  name: 'UNIC Tracker',
  test: testUnicId,
  depack: depackUnic,
};

/** pw_unic_noid: "UNIC Tracker noid". */
export const pwUnicNoid: PwFormat = {
  name: 'UNIC Tracker noid',
  test: testUnicNoid,
  depack: depackUnic,
};

/** pw_unic_emptyid: "UNIC Tracker id0". */
export const pwUnicEmptyId: PwFormat = {
  name: 'UNIC Tracker id0',
  test: testUnicEmptyId,
  depack: depackUnic,
};

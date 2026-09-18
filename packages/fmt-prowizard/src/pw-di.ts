// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Bitti09 — modplayjs contributors
// Ported from: libxmp src/loaders/prowizard/di.c (Digital Illusions) —
// write_event :34-59, depack_di :61-159, test_di :165-268.

import { ptkTable, ptkIsValidNote } from './ptktable.js';
import { readmem16b, readmem32b, moveData, writeZero, pwReadTitle, type PwFormat } from './prowiz.js';

const PW_MOD_MAGIC = 0x4d2e4b2e; // 'M.K.'

function put8(out: number[], b: number): void { out.push(b & 0xff); }
function put16b(out: number[], v: number): void { out.push((v >> 8) & 0xff, v & 0xff); }
function put32b(out: number[], v: number): void {
  out.push((v >>> 24) & 0xff, (v >> 16) & 0xff, (v >> 8) & 0xff, v & 0xff);
}

/** write_event (di.c:34-59): 3 input bytes → 4-byte PTK cell. */
function writeEvent(out: number[], c1: number, c2: number, fxp: number): void {
  const note = ((c1 << 4) & 0x30) | ((c2 >> 4) & 0x0f);
  if (!ptkIsValidNote(note)) {
    // di.nightmare has note 49! (di.c:39-44)
    out.push(0, 0, 0, 0);
    return;
  }
  const ins = (c1 >> 2) & 0x1f;
  const fxt = c2 & 0x0f;
  out.push((ptkTable[note]![0] | (ins & 0xf0)) & 0xff);
  out.push(ptkTable[note]![1]);
  out.push((((ins << 4) & 0xf0) | fxt) & 0xff);
  out.push(fxp & 0xff);
}

/** depack_di (di.c:61-159). */
function depackDi(data: Uint8Array, start: number): Uint8Array {
  let pos = start;
  const out: number[] = [];
  const u8 = () => data[pos++] ?? 0;
  const u16 = () => { const v = readmem16b(data, pos); pos += 2; return v; };
  const u32 = () => { const v = readmem32b(data, pos); pos += 4; return v; };

  writeZero(out, 20); // title

  const nins = u16();
  if (nins > 31) throw new Error('di: too many samples');

  const seqOfs = u32();
  u32(); // pat_offs
  const smpOfs = u32();

  // Sample headers (di.c:81-89)
  let ssize = 0;
  for (let i = 0; i < nins; i++) {
    writeZero(out, 22); // name
    const size = u16();
    ssize += size * 2;
    put16b(out, size);
    put8(out, u8()); // finetune
    put8(out, u8()); // volume
    put16b(out, u16()); // loop start
    put16b(out, u16()); // loop size
  }

  // Pad to 31 (di.c:92-96)
  {
    const pad = new Array<number>(30).fill(0);
    for (let i = nins; i < 31; i++) out.push(...pad);
  }

  const posAfterSamples = pos;

  // Sequence table (di.c:98-104): 0xff-terminated
  pos = start + seqOfs;
  const ptable = new Array<number>(128).fill(0);
  let i = 0;
  let c1 = 0;
  do {
    c1 = u8();
    ptable[i++] = c1;
  } while (c1 !== 0xff);
  ptable[i - 1] = 0;
  const npat = i - 1;
  put8(out, npat);
  put8(out, 0x7f);

  // Highest pattern (di.c:109-115)
  let max = 0;
  for (i = 0; i < 128; i++) {
    put8(out, ptable[i]!);
    if (ptable[i]! > max) max = ptable[i]!;
  }
  if (max >= 128) throw new Error('di: pattern number too high');

  put32b(out, PW_MOD_MAGIC);

  // Pattern data (di.c:118-153): paddr per pattern; cells have 3 forms
  // (bit7 clear = note+2bytes, 0xff = empty u32, else note+3bytes).
  pos = posAfterSamples;
  const paddr: number[] = [];
  for (i = 0; i <= max; i++) paddr.push(u16());

  for (i = 0; i <= max; i++) {
    pos = start + paddr[i]!;
    for (let k = 0; k < 256; k++) {
      const c1v = u8();
      if ((c1v & 0x80) === 0) {
        const c2v = u8();
        writeEvent(out, c1v, c2v, 0);
      } else if (c1v === 0xff) {
        out.push(0, 0, 0, 0);
      } else {
        const c2v = u8();
        const c3v = u8();
        writeEvent(out, c1v, c2v, c3v);
      }
    }
  }

  // Sample data (di.c:156-158)
  moveData(data, start + smpOfs, out, ssize);

  return Uint8Array.from(out);
}

/** test_di (di.c:165-268). */
function testDi(data: Uint8Array, start: number): number {
  const s = data.length - start;
  if (s < 14) return 14 - s;

  // Number of samples (di.c:174-177)
  const numsmp = readmem16b(data, start);
  if (numsmp > 31) return -1;

  if (s < 14 + numsmp * 8) return 14 + numsmp * 8 - s;

  // Finetunes and sample sizes (di.c:180-202)
  let ssize = 0;
  for (let i = 0; i < numsmp; i++) {
    const d = start + i * 8 + 14; // note: fields at +14/+18/+20 within the
    // 8-byte stride window per the C pointer arithmetic (d advances i*8 but
    // field offsets +14/+18/+20 exceed 8 — this matches C exactly).
    const len = readmem16b(data, d) << 1;
    const lstart = readmem16b(data, d + 4) << 1;
    const lsize = readmem16b(data, d + 6) << 1;

    if (len > 0xffff || lstart > 0xffff || lsize > 0xffff) return -1;
    if (lstart + lsize > len) return -1;
    if (data[d + 2]! > 0x0f) return -1;
    if (data[d + 3]! > 0x40) return -1;
    ssize += len;
  }
  if (ssize <= 2) return -1;

  // Addresses (di.c:206-216)
  const psize = numsmp * 8 + 2;
  const ptabOfs = readmem32b(data, start + 2);
  const patOfs = readmem32b(data, start + 6);
  const smpOfs = readmem32b(data, start + 10);

  if (ptabOfs < psize) return -1;
  if (patOfs <= ptabOfs || smpOfs <= ptabOfs || smpOfs <= patOfs) return -1;
  if (patOfs - ptabOfs > 128) return -1;

  // Pattern table reliability (di.c:250-254)
  if (s < patOfs) return patOfs - s;
  for (let i = ptabOfs; i < patOfs - 1; i++) {
    if (data[start + i]! > 0x80) return -1;
  }

  // 0xff at the end of the pattern list (di.c:257-260)
  if (data[start + patOfs - 1] !== 0xff) return -1;

  // Sample data address > $ffff (di.c:263-266)
  if (smpOfs > 65535) return -1;

  pwReadTitle(null, 0);

  return 0;
}

/** pw_di: "Digital Illusions". */
export const pwDi: PwFormat = {
  name: 'Digital Illusions',
  test: testDi,
  depack: depackDi,
};

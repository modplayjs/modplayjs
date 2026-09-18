// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Bitti09 — modplayjs contributors
// Ported from: libxmp src/loaders/prowizard/ac1d.c (AC1D Packer) —
// depack_ac1d :37-152, test_ac1d :155-185.

import { ptkTable, ptkIsValidNote } from './ptktable.js';
import { readmem32b, moveData, writeZero, pwReadTitle, type PwFormat } from './prowiz.js';

const NO_NOTE = 0xff;

function put8(out: number[], b: number): void { out.push(b & 0xff); }
function put16b(out: number[], v: number): void { out.push((v >> 8) & 0xff, v & 0xff); }
function put32b(out: number[], v: number): void {
  out.push((v >>> 24) & 0xff, (v >> 16) & 0xff, (v >> 8) & 0xff, v & 0xff);
}

/** depack_ac1d (ac1d.c:37-152). */
function depackAc1d(data: Uint8Array, start: number): Uint8Array {
  let pos = start;
  const out: number[] = [];
  const u8 = () => data[pos++] ?? 0;
  const u16 = () => { const v = (data[pos]! << 8) | data[pos + 1]!; pos += 2; return v; };
  const u32 = () => { const v = readmem32b(data, pos); pos += 4; return v; };

  const npos = u8();
  const ntkByte = u8();
  u16(); // bypass ID
  const saddr = u32(); // sample data address

  writeZero(out, 20); // title

  // Sample headers (ac1d.c:49-58)
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

  // Pattern addresses (ac1d.c:61-70): 0-terminated list
  const paddr: number[] = [];
  let npat = 0;
  for (; npat < 128; npat++) {
    paddr.push(u32());
    if (paddr[npat] === 0) break;
  }
  if (npat === 0) throw new Error('ac1d: no patterns');
  npat--;

  put8(out, npos);
  put8(out, ntkByte);

  // Pattern table (ac1d.c:77-79) at 0x300
  pos = start + 0x300;
  moveData(data, pos, out, 128);

  put32b(out, 0x4d2e4b2e); // M.K.

  // Pattern data (ac1d.c:82-140): per pattern skip 3 u32 headers, then
  // 4 channels × 64 rows of packed cells with 0x80-run skips.
  for (let i = 0; i < npat; i++) {
    pos = start + paddr[i]!;
    u32(); u32(); u32(); // tsize headers

    const tmp = new Uint8Array(1024);
    for (let k = 0; k < 4 && pos < data.length; k++) {
      for (let j = 0; j < 64; j++) {
        const x = j * 16 + k * 4;

        const c1 = u8();
        if ((c1 & 0x80) !== 0) {
          const c4 = c1 & 0x7f;
          j += c4 - 1;
          continue;
        }

        const c2 = u8();
        const ins = ((c1 & 0xc0) >> 2) | ((c2 >> 4) & 0x0f);
        let note = c1 & 0x3f;

        if (note === 0x3f) note = NO_NOTE;
        else if (note !== 0) note -= 0x0b;

        if (note === 0) note++;

        tmp[x] = ins & 0xf0;

        if (note !== NO_NOTE && ptkIsValidNote(note)) {
          tmp[x] = (tmp[x]! | ptkTable[note]![0]) & 0xff;
          tmp[x + 1] = ptkTable[note]![1];
        }

        if ((c2 & 0x0f) === 0x07) {
          tmp[x + 2] = ((ins << 4) & 0xf0) & 0xff;
          continue;
        }

        const c3 = u8();
        const fxt = c2 & 0x0f;
        const fxp = c3;
        tmp[x + 2] = (((ins << 4) & 0xf0) | fxt) & 0xff;
        tmp[x + 3] = fxp;
      }
    }
    for (let t = 0; t < 1024; t++) out.push(tmp[t]!);
  }

  // Sample data (ac1d.c:146-148)
  moveData(data, start + saddr, out, ssize);

  return Uint8Array.from(out);
}

/** test_ac1d (ac1d.c:155-185). */
function testAc1d(data: Uint8Array, start: number): number {
  const s = data.length - start;
  if (s < 896) return 896 - s;

  // test #1 (ac1d.c:162-165): 0xac 0x1d at offset 2
  if (data[start + 2] !== 0xac || data[start + 3] !== 0x1d) return -1;

  // test #2 (ac1d.c:167-170)
  if (data[start]! > 0x7f) return -1;

  // test #4 (ac1d.c:172-176)
  for (let i = 0; i < 31; i++) {
    if (data[start + 10 + 8 * i]! > 0x0f) return -1;
  }

  // test #5 (ac1d.c:178-182)
  for (let i = 0; i < 128; i++) {
    if (data[start + 768 + i]! > 0x7f) return -1;
  }

  pwReadTitle(null, 0);

  return 0;
}

/** pw_ac1d: "AC1D Packer". */
export const pwAc1d: PwFormat = {
  name: 'AC1D Packer',
  test: testAc1d,
  depack: depackAc1d,
};

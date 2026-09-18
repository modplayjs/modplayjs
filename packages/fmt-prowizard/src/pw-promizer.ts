// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Bitti09 — modplayjs contributors
// Ported from: libxmp src/loaders/prowizard/pm10c.c (Promizer 1.0c) and
// pm18a.c (Promizer 1.8a) — depack_p10c :36-273, test_p10c :275-308;
// depack_p18a :38-222, test_p18a :230-274.

import { ptkTable } from './ptktable.js';
import { readmem16b, readmem32b, tunTable, writeZero, pwReadTitle, type PwFormat } from './prowiz.js';

const PW_MOD_MAGIC = 0x4d2e4b2e; // 'M.K.'

function put8(out: number[], b: number): void { out.push(b & 0xff); }
function put16b(out: number[], v: number): void { out.push((v >> 8) & 0xff, v & 0xff); }
function put32b(out: number[], v: number): void {
  out.push((v >>> 24) & 0xff, (v >> 16) & 0xff, (v >> 8) & 0xff, v & 0xff);
}

/**
 * Shared ptk-cell finetune correction (pm10c.c:209-231 / pm18a.c:187-209):
 * if the reference-table cell has a nonzero period and the current
 * instrument has a finetune, remap the period via tun_table.
 */
function applyFinetune(
  p: Uint8Array,
  oldIns: number,
  fine: number,
): void {
  const per = ((p[0]! & 0x0f) << 8) | p[1]!;
  if (per !== 0 && oldIns > 0 && oldIns < 32 && fine !== 0) {
    for (let l = 0; l < 36; l++) {
      if (tunTable[fine]![l] === per) {
        p[0] = (p[0]! & 0xf0) | ptkTable[l + 1]![0];
        p[1] = ptkTable[l + 1]![1];
        break;
      }
    }
  }
}

/** depack_p10c (pm10c.c:36-273). */
function depackP10c(data: Uint8Array, start: number): Uint8Array {
  let pos = start;
  const out: number[] = [];
  const u8 = () => data[pos++] ?? 0;
  const u16 = () => { const v = readmem16b(data, pos); pos += 2; return v; };
  const u32 = () => { const v = readmem32b(data, pos); pos += 4; return v; };

  writeZero(out, 20); // title

  // bypass replaycode routine (pm10c.c:46)
  pos = start + 4460;

  let ssize = 0;
  const fin = new Array<number>(31).fill(0);
  for (let i = 0; i < 31; i++) {
    writeZero(out, 22);
    const size = u16();
    ssize += size * 2;
    put16b(out, size);
    fin[i] = u8();
    put8(out, u8()); // volume
    put16b(out, u16()); // loop start
    put16b(out, u16()); // loop size
  }

  const numPat = Math.trunc(u16() / 4); // pattern table length
  if (numPat > 128) throw new Error('pm10c: too many patterns');

  put8(out, numPat);
  put8(out, 0x7f);

  // Pattern addresses (pm10c.c:66-68)
  const paddr: number[] = [];
  for (let i = 0; i < 128; i++) paddr.push(u32());

  // Address ordering (pm10c.c:70-87): first occurrence gets a new index
  const pnum = new Array<number>(128).fill(0);
  let patMax = 0;
  for (let i = 0; i < numPat; i++) {
    if (i === 0) { pnum[0] = 0; continue; }
    let j = 0;
    for (; j < i; j++) {
      if (paddr[i] === paddr[j]) { pnum[i] = pnum[j]!; break; }
    }
    if (j === i) pnum[i] = ++patMax;
  }

  // Correct re-order (pm10c.c:90-105): bubble-sort by address
  const paddr1 = paddr.slice(0, numPat);
  const pnum1 = pnum.slice(0, numPat);
  let restart = true;
  while (restart) {
    restart = false;
    for (let i = 0; i < numPat; i++) {
      for (let j = 0; j < i; j++) {
        if (paddr1[i]! < paddr1[j]!) {
          const t2 = pnum1[j]!; pnum1[j] = pnum1[i]!; pnum1[i] = t2;
          const t1 = paddr1[j]!; paddr1[j] = paddr1[i]!; paddr1[i] = t1;
          restart = true;
          break;
        }
      }
      if (restart) break;
    }
  }

  // Unique addresses in sorted order (pm10c.c:107-116)
  const paddr2: number[] = [];
  for (let i = 0; i < numPat; i++) {
    if (i === 0) { paddr2.push(paddr1[i]!); continue; }
    if (paddr1[i] === paddr2[paddr2.length - 1]) continue;
    paddr2.push(paddr1[i]!);
  }

  // Map original order → sorted-unique index (pm10c.c:118-124)
  for (let a = 0; a < numPat; a++) {
    for (let b = 0; b < paddr2.length; b++) {
      if (paddr[a] === paddr2[b]) pnum[a] = b;
    }
  }

  // Write pattern table (pm10c.c:127-129)
  for (let i = 0; i < 128; i++) put8(out, pnum[i]!);
  put32b(out, PW_MOD_MAGIC);

  // Pattern size (pm10c.c:134-137)
  pos = start + 4456;
  const psize = u32();

  // Pattern data (pm10c.c:140-267)
  pos = start + 5222;

  // Pre-scan for reference max (pm10c.c:143-151)
  let refmax = 0;
  for (let j = 0; j < psize; j += 2) {
    const x = u16();
    if (x > refmax) refmax = x;
  }

  // Reference table (pm10c.c:154-164)
  const refmax1 = refmax + 1;
  const refsize = refmax1 * 4;
  const reftab = new Uint8Array(refsize);
  for (let i = 0; i < refsize; i++) reftab[i] = data[pos++] ?? 0;

  // Pattern decode (pm10c.c:166-260)
  pos = start + 5222;
  const oldIns = [0, 0, 0, 0];
  for (let c1 = 0; c1 <= patMax; c1++) {
    let flag = 0;
    for (let i = 0; i < 64; i++) {
      for (let k = 0; k < 4; k++) {
        const pBase = i * 16 + k * 4;
        const p = new Uint8Array(4);
        const x = u16() << 2;

        if (x >= refsize) throw new Error('pm10c: reference out of range');

        p.set(reftab.subarray(x, x + 4));

        const ins = ((p[2]! >> 4) & 0x0f) | (p[0]! & 0xf0);
        if (ins !== 0) oldIns[k] = ins;

        const fine = oldIns[k]! > 0 && oldIns[k]! < 32 ? fin[oldIns[k]! - 1]! : 0;
        if (fine >= 16) throw new Error('pm10c: bad finetune');

        applyFinetune(p, oldIns[k]!, fine);

        const fxt = p[2]! & 0x0f;
        if (fxt === 0x0d || fxt === 0x0b) flag = 1;

        for (let t = 0; t < 4; t++) out[pBase + t] = p[t]!;
      }
      if (flag === 1) break;
    }
  }

  // Sample data (pm10c.c:268-273)
  pos = start + 4452;
  const smpOfs = u32();
  pos = start + 4456 + smpOfs;
  for (let k = 0; k < ssize && pos < data.length; k++) out.push(data[pos++] ?? 0);

  return Uint8Array.from(out);
}

/** test_p10c (pm10c.c:275-308). */
function testP10c(data: Uint8Array, start: number): number {
  const s = data.length - start;
  if (s < 22) return 22 - s;

  // test 1 (pm10c.c:281-291): magic bytes
  const magic = [0x60, 0x38, 0x60, 0x00, 0x00, 0xa0, 0x60, 0x00, 0x01, 0x3e, 0x60, 0x00, 0x01, 0x0c, 0x48, 0xe7];
  for (let i = 0; i < 16; i++) {
    if (data[start + i] !== magic[i]) return -1;
  }

  // test 2 (pm10c.c:294-297)
  if (data[start + 21] !== 0xce) return -1;

  // test 4 (pm10c.c:302-305)
  if ((readmem16b(data, start + 4712) & 0x03) !== 0) return -1;

  // test 5 (pm10c.c:307-310)
  if (data[start + 36] !== 0x10) return -1;

  // test 6 (pm10c.c:312-315)
  if (data[start + 37] !== 0xfc) return -1;

  pwReadTitle(null, 0);

  return 0;
}

/** depack_p18a (pm18a.c:38-222). */
function depackP18a(data: Uint8Array, start: number): Uint8Array {
  let pos = start;
  const out: number[] = [];
  const u8 = () => data[pos++] ?? 0;
  const u16 = () => { const v = readmem16b(data, pos); pos += 2; return v; };
  const u32 = () => { const v = readmem32b(data, pos); pos += 4; return v; };

  writeZero(out, 20); // title

  // bypass replaycode (pm18a.c:47-48); read pattern data size
  pos = start + 4460;
  const psize = u32();
  if (psize < 0) throw new Error('pm18a: negative pattern size');

  let ssize = 0;
  const fin = new Array<number>(31).fill(0);
  for (let i = 0; i < 31; i++) {
    writeZero(out, 22);
    const size = u16();
    ssize += size * 2;
    put16b(out, size);
    fin[i] = u8();
    put8(out, u8()); // volume
    put16b(out, u16()); // loop start
    put16b(out, u16()); // loop size
  }

  const numPat = Math.trunc(u16() / 4);
  if (numPat > 128) throw new Error('pm18a: too many patterns');
  put8(out, numPat);
  put8(out, 0x7f);

  // Pattern addresses (pm18a.c:74-84): sanity paddr - 5226 <= psize
  const paddr: number[] = [];
  for (let i = 0; i < 128; i++) {
    const a = u32();
    if (a - 5226 > psize) throw new Error('pm18a: bad pattern address');
    paddr.push(a);
  }
  // At 5226 now: start of pattern data.

  // Address ordering (pm18a.c:87-101)
  const pnum = new Array<number>(128).fill(0);
  let patMax = 0;
  for (let i = 0; i < numPat; i++) {
    if (i === 0) { pnum[0] = 0; continue; }
    let j = 0;
    for (; j < i; j++) {
      if (paddr[i] === paddr[j]) { pnum[i] = pnum[j]!; break; }
    }
    if (j === i) pnum[i] = ++patMax;
  }

  // Pattern table (pm18a.c:103-105)
  for (let i = 0; i < 128; i++) put8(out, pnum[i]!);
  put32b(out, PW_MOD_MAGIC);

  // Pre-scan reference max (pm18a.c:114-125)
  let refmax = 0;
  for (let j = 0; j < psize; j += 2) {
    const x = u16();
    if (x > refmax) refmax = x;
  }

  // Reference table (pm18a.c:128-137)
  const refmax1 = refmax + 1;
  const refsize = refmax1 * 4;
  const reftab = new Uint8Array(refsize);
  for (let i = 0; i < refsize; i++) reftab[i] = data[pos++] ?? 0;

  // Pattern decode (pm18a.c:139-182)
  pos = start + 5226;
  const oldIns = [0, 0, 0, 0];
  for (let j = 0; j <= patMax; j++) {
    let flag = 0;
    pos = start + paddr[j]! + 5226;
    for (let i2 = 0; i2 < 64; i2++) {
      for (let k = 0; k < 4; k++) {
        const pBase = i2 * 16 + k * 4;
        const p = new Uint8Array(4);
        const x = u16() << 2;

        if (x >= refsize) throw new Error('pm18a: reference out of range');

        p.set(reftab.subarray(x, x + 4));

        const ins = ((p[2]! >> 4) & 0x0f) | (p[0]! & 0xf0);
        if (ins !== 0) oldIns[k] = ins;

        const fine = oldIns[k]! > 0 && oldIns[k]! < 32 ? fin[oldIns[k]! - 1]! : 0;
        if (fine >= 16) throw new Error('pm18a: bad finetune');

        applyFinetune(p, oldIns[k]!, fine);

        const fxt = p[2]! & 0x0f;
        if (fxt === 0x0d || fxt === 0x0b) flag = 1;

        for (let t = 0; t < 4; t++) out[pBase + t] = p[t]!;
      }
      if (flag === 1) break;
    }
  }

  // Sample data (pm18a.c:191-198)
  pos = start + 4456;
  const smpOfs = u32();
  pos = start + 4460 + smpOfs;
  for (let k = 0; k < ssize && pos < data.length; k++) out.push(data[pos++] ?? 0);

  return Uint8Array.from(out);
}

/** test_p18a (pm18a.c:230-274). */
function testP18a(data: Uint8Array, start: number): number {
  const s = data.length - start;
  if (s < 22) return 22 - s;

  const magic = [0x60, 0x38, 0x60, 0x00, 0x00, 0xa0, 0x60, 0x00, 0x01, 0x3e, 0x60, 0x00, 0x01, 0x0c, 0x48, 0xe7];
  for (let i = 0; i < 16; i++) {
    if (data[start + i] !== magic[i]) return -1;
  }

  // test 2 (pm18a.c:244-245)
  if (data[start + 21] !== 0xd2) return -1;

  // test 4 (pm18a.c:258-261)
  if ((readmem16b(data, start + 4712) & 0x03) !== 0) return -1;

  // test 5 (pm18a.c:263-265)
  if (data[start + 36] !== 0x11) return -1;

  // test 6 (pm18a.c:267-269)
  if (data[start + 37] !== 0x00) return -1;

  pwReadTitle(null, 0);

  return 0;
}

/** pw_p10c: "Promizer 1.0c". */
export const pwP10c: PwFormat = {
  name: 'Promizer 1.0c',
  test: testP10c,
  depack: depackP10c,
};

/** pw_p18a: "Promizer 1.8a". */
export const pwP18a: PwFormat = {
  name: 'Promizer 1.8a',
  test: testP18a,
  depack: depackP18a,
};

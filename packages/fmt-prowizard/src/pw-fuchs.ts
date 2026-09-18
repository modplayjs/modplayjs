// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Bitti09 — modplayjs contributors
// Ported from: libxmp src/loaders/prowizard/fuchs.c (Fuchs Tracker) —
// depack_fuchs :35-143, test_fuchs :145-200.

import { readmem16b, readmem32b, pwReadTitle, type PwFormat } from './prowiz.js';

const PW_MOD_MAGIC = 0x4d2e4b2e; // 'M.K.'

function put32b(out: number[], v: number): void {
  out.push((v >>> 24) & 0xff, (v >> 16) & 0xff, (v >> 8) & 0xff, v & 0xff);
}

/** depack_fuchs (fuchs.c:35-143). */
function depackFuchs(data: Uint8Array, start: number): Uint8Array {
  let pos = start;
  const out: number[] = [];
  const u16 = () => { const v = readmem16b(data, pos); pos += 2; return v; };
  const u32 = () => { const v = readmem32b(data, pos); pos += 4; return v; };

  // Fuchs builds a full 1080-byte PTK header in `data`.
  const hdr = new Uint8Array(1080);

  // title: 10 bytes moved (fuchs.c:40)
  for (let i = 0; i < 10; i++) hdr[i] = data[pos++] ?? 0;
  u32(); // all sample data size

  // sample sizes (fuchs.c:44-49): smp_len → data[42+i*30], [43+i*30]
  const smpLen: number[] = [];
  for (let i = 0; i < 16; i++) {
    const l = u16();
    smpLen.push(l);
    hdr[42 + i * 30] = (l >> 9) & 0xff;
    hdr[43 + i * 30] = (l >> 1) & 0xff;
  }

  // volumes (fuchs.c:52-55): data[45+i*30]
  for (let i = 0; i < 16; i++) {
    hdr[45 + i * 30] = u16() & 0xff;
  }

  // loop start (fuchs.c:58-63)
  const loopStart: number[] = [];
  for (let i = 0; i < 16; i++) {
    const l = u16();
    loopStart.push(l);
    hdr[46 + i * 30] = (l >> 1) & 0xff;
  }

  // replen (fuchs.c:66-79)
  for (let i = 0; i < 16; i++) {
    const loopSize = smpLen[i]! - loopStart[i]!;
    if (loopSize === 0 || loopStart[i] === 0) {
      hdr[49 + i * 30] = 1;
    } else {
      hdr[48 + i * 30] = (loopSize >> 9) & 0xff;
      hdr[49 + i * 30] = (loopSize >> 1) & 0xff;
    }
  }

  // fill replens for samples 16..30 with $0001 (fuchs.c:82-85)
  for (let i = 16; i < 31; i++) {
    hdr[49 + i * 30] = 1;
  }

  // pattern list (fuchs.c:89-99): count @950, ntk @951, 40 u16 entries
  hdr[950] = u16() & 0xff;
  hdr[951] = 0x7f;

  let maxPat = 0;
  for (let i = 0; i < 40; i++) {
    const pat = u16();
    hdr[952 + i] = pat & 0xff;
    if (pat > maxPat) maxPat = pat;
  }

  // write the 1080-byte header (fuchs.c:102-106)
  for (let i = 0; i < 1080; i++) out.push(hdr[i]!);
  put32b(out, PW_MOD_MAGIC);

  // pattern data (fuchs.c:109-127): bypass "SONG" ID, read size, convert
  u32(); // "SONG" ID
  const patSize = u32();
  if (patSize === 0 || patSize > 0x20000 || (patSize & 0x3) !== 0) {
    throw new Error('fuchs: bad pattern size');
  }

  const tmp = new Uint8Array(patSize);
  for (let i = 0; i < patSize; i++) tmp[i] = data[pos++] ?? 0;

  // convert fx C arg back to hex value (fuchs.c:130-134)
  for (let i = 0; i < patSize; i += 4) {
    if ((tmp[i + 2]! & 0x0f) === 0x0c) {
      const x = tmp[i + 3]!;
      tmp[i + 3] = 10 * (x >> 4) + (x & 0xf);
    }
  }

  // write pattern data (fuchs.c:137-139)
  for (let i = 0; i < patSize; i++) out.push(tmp[i]!);

  // sample data (fuchs.c:142-149): bypass "INST" ID, sequential non-empty
  pos += 4; // "INST" Id
  for (let i = 0; i < 16; i++) {
    if (smpLen[i] !== 0) {
      for (let k = 0; k < smpLen[i]! && pos < data.length; k++) out.push(data[pos++] ?? 0);
    }
  }

  return Uint8Array.from(out);
}

/** test_fuchs (fuchs.c:145-200). */
function testFuchs(data: Uint8Array, start: number): number {
  const s = data.length - start;
  if (s < 196) return 196 - s;

  // "SONG" at 192 (fuchs.c:149-150)
  if (readmem32b(data, start + 192) !== 0x534f4e47) return -1;

  // all sample size (fuchs.c:153-156)
  const hdrSsize = readmem32b(data, start + 10);
  if (hdrSsize <= 2 || hdrSsize >= 65535 * 16) return -1;

  // sample descriptions (fuchs.c:159-177): fields at i*2 strides per C
  let ssize = 0;
  for (let i = 0; i < 16; i++) {
    const d = start + i * 2;
    const len = readmem16b(data, d + 14);
    const lstart = readmem16b(data, d + 78);

    if (data[d + 46]! > 0x40) return -1; // volumes
    if (len < lstart) return -1;
    ssize += len;
  }
  if (ssize <= 2 || ssize > hdrSsize) return -1;

  // pattern list entries <= 40 (fuchs.c:182-190)
  for (let i = 0; i < 40; i++) {
    if (data[start + i * 2 + 113]! > 40) return -1;
  }

  pwReadTitle(null, 0);

  return 0;
}

/** pw_fchs: "Fuchs Tracker". */
export const pwFchs: PwFormat = {
  name: 'Fuchs Tracker',
  test: testFuchs,
  depack: depackFuchs,
};

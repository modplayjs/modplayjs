// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Bitti09 — modplayjs contributors
// Ported from: libxmp src/loaders/prowizard/prowiz.c (pw_format contract
// prowiz.h:28-32, pw_formats table :32-84, pw_move_data :87-100,
// pw_write_zero :102-112, pw_wizardry :113-139, pw_check :143-198,
// pw_read_title :209-223) — the ProWizard depacker framework.
//
// JS contract: depackers work over byte buffers. test(data, start) returns
// 0 (match) / -1 (no) / N>0 (request N more bytes, prowiz.c:173-186 grows
// the buffer and re-tests; our input is fully in memory so N>0 → try next
// format, matching the "can't read more" path). depack(data, start) writes
// a synthetic standard 31-sample M.K. MOD byte stream — pw_load.c feeds
// that to the shared MOD parse core (fmt-mod/modcore.ts).

import { ParseError } from '@modplayjs/core';
import { pwPp10, pwPp21, pwPp30 } from './pw-pp.js';
import { pwP4x } from './pw-p40.js';
import { pwP50a, pwP60a } from './pw-theplayer.js';
import { pwTp1 } from './pw-tp1.js';
import { pwTp2, pwTp3 } from './pw-tp3.js';
import { pwUnicId, pwUnicNoid, pwUnicEmptyId } from './pw-unic.js';
import { pwUnic2 } from './pw-unic2.js';
import { pwNp1, pwNp2 } from './pw-np12.js';
import { pwNp3 } from './pw-np3.js';
import { pwXann } from './pw-xann.js';
import { pwWn } from './pw-wn.js';
import { pwZen } from './pw-zen.js';
import { pwKsm } from './pw-ksm.js';
import { pwHrt } from './pw-hrt.js';
import { pwMpId, pwMpNoid } from './pw-mp.js';
import { pwDi } from './pw-di.js';
import { pwAc1d } from './pw-ac1d.js';
import { pwEu } from './pw-eureka.js';
import { pwFcm } from './pw-fcm.js';
import { pwFchs } from './pw-fuchs.js';
import { pwSkyt } from './pw-skyt.js';

/** pw_format (prowiz.h:28-32). */
export interface PwFormat {
  readonly name: string;
  test(data: Uint8Array, start: number): number;
  depack(data: Uint8Array, start: number): Uint8Array;
}

/** readmem16b (dataio.c:168-175). */
export function readmem16b(d: Uint8Array, off: number): number {
  return (d[off]! << 8) | d[off + 1]!;
}

/** readmem32b (dataio.c:190-198). */
export function readmem32b(d: Uint8Array, off: number): number {
  return ((d[off]! << 24) | (d[off + 1]! << 16) | (d[off + 2]! << 8) | d[off + 3]!) >>> 0;
}

/** readmem16l (dataio.c). */
export function readmem16l(d: Uint8Array, off: number): number {
  return d[off]! | (d[off + 1]! << 8);
}

/** readmem24b (dataio.c) — big-endian 24-bit. */
export function readmem24b(d: Uint8Array, off: number): number {
  return (d[off]! << 16) | (d[off + 1]! << 8) | d[off + 2]!;
}

/** readmem32l (dataio.c). */
export function readmem32l(d: Uint8Array, off: number): number {
  return (d[off]! | (d[off + 1]! << 8) | (d[off + 2]! << 16) | (d[off + 3]! << 24)) >>> 0;
}

/**
 * pw_formats (prowiz.c:32-84) — probe ORDER IS LOAD-BEARING:
 * signature-based entries first, then heuristics; pw_mp_noid must be
 * checked before Heatseeker and after ProPacker 1.0 (comment :66).
 * Populated incrementally as depackers land (Wave 2, FORMAT-PLUGINS.md).
 */
export const pwFormats: PwFormat[] = [
  // With signature (prowiz.c:33-50) — order verbatim
  pwAc1d,
  pwFchs,
  pwFcm,
  pwHrt,
  pwKsm,
  pwMpId,
  // pwP18a — pending
  // pwP10c — pending
  // pwPru1 — pending
  // pwPru2 — pending
  // pwPha — pending
  pwWn,
  pwUnicId,
  pwTp3,
  pwTp2,
  pwTp1,
  pwSkyt,

  // No signature (prowiz.c:52-84) — order verbatim
  pwXann,
  pwDi,
  pwEu,
  pwP4x,
  pwPp21,
  pwPp30,
  pwPp10,
  pwP50a,
  pwP60a,
  // pwP61a — pending
  pwMpNoid, // must be checked before Heatseeker, after ProPacker 1.0 (:66)
  // pwNru — pending
  pwNp2,
  pwNp1,
  pwNp3,
  pwZen,
  pwUnicEmptyId,
  pwUnicNoid,
  pwUnic2,
  // pwCrb — pending
  // pwTdd — pending
  // pwStarpack — pending
  // pwGmc — pending
  // pwTitanics — pending
];

/** pw_move_data (prowiz.c:87-100): copy `len` bytes input→output. */
export function moveData(src: Uint8Array, srcOff: number, out: number[], len: number): void {
  for (let i = 0; i < len && srcOff + i < src.length; i++) {
    out.push(src[srcOff + i]!);
  }
}

/** pw_write_zero (prowiz.c:102-112): append `len` zero bytes. */
export function writeZero(out: number[], len: number): void {
  for (let i = 0; i < len; i++) out.push(0);
}

/** pw_read_title (prowiz.c:209-223): up to 20 title bytes. */
export function pwReadTitle(b: Uint8Array | null, s: number): string {
  if (b === null) return '';
  if (s > 20) s = 20;
  let t = '';
  for (let i = 0; i < s; i++) t += String.fromCharCode(b[i]!);
  return t;
}

/**
 * pw_check (prowiz.c:143-198): probe all formats in table order. Buffer
 * growth requests (res > 0) can't be satisfied when the input is already
 * fully in memory — matches C's "fetch < res → try next format" path.
 */
export function pwCheck(data: Uint8Array, start: number): PwFormat | null {
  for (let i = 0; i < pwFormats.length; i++) {
    const res = pwFormats[i]!.test(data, start);
    if (res === 0) return pwFormats[i]!;
    // res < 0 → no match; res > 0 → more data requested (unavailable)
  }
  return null;
}

/**
 * pw_wizardry (prowiz.c:113-139): find format + depack to M.K. bytes.
 * Sets outName.name to the winning pw_format.name (pw_load.c:128 prints
 * it as mod->type).
 */
export function pwWizardry(data: Uint8Array, start: number, outName: { name?: string }): Uint8Array {
  const format = pwCheck(data, start);
  if (format === null) throw new ParseError('prowizard: no format matched');
  const out = format.depack(data, start);
  outName.name = format.name;
  return out;
}

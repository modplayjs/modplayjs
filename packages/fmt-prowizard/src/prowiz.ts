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
import { pwTp1 } from './pw-tp1.js';

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
  // With signature (prowiz.c:33-50) — order verbatim; heuristics follow
  pwTp1,
  pwPp10,
  pwP4x,
  pwPp21,
  pwPp30,
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

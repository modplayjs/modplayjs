// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Bitti09 — modplayjs contributors
// HVSC Songlengths.md5 support — per-subtune runtime for SID tunes.
//
// The new-format database (HVSC #68+) maps MD5(full file bytes) to a list
// of per-subtune lengths "M:SS[.mmm] M:SS ...". This mirrors the C host's
// cRSID_getPlaylengths (host/file.c) which fills cRSID.SubtuneDurations
// from cRSID.SongLengths — except our hash covers the full file (the
// modern database format), while the C reference hashes it for the old
// format; for the new Songlengths.md5 the hash is md5(file bytes).
//
// Sources: DOCUMENTS/Songlengths.faq (HVSC) — "The new format has MD5
// hashes based on the full content".

import { md5Hex } from '@modplayjs/core';
import { cRSID } from './instance.js';

/** seconds per subtune (index 1..N); 0 = unknown. */
let subtuneDurations: number[] = [];
/** true when a Songlengths.md5 database is loaded. */
let dbLoaded = false;

/** Parse "M:SS", "H:MM:SS" or "M:SS.mmm" → seconds (float). */
export function parseSongLength(tok: string): number {
  const parts = tok.split(':').map((p) => parseFloat(p));
  if (parts.some((n) => Number.isNaN(n))) return 0;
  let sec = 0;
  for (const p of parts) sec = sec * 60 + p;
  return sec > 0 ? sec : 0;
}

/**
 * Load a Songlengths.md5 database (the full text of the file). After this,
 * sidStartTune/loads look up the tune by MD5 of its bytes and fill
 * cRSID.SubtuneDurations — exactly like cRSID_getPlaylengths.
 */
export function loadSidSongLengths(dbText: string): void {
  const map = new Map<string, string>();
  for (const line of dbText.split('\n')) {
    const clean = line.replace(/\r$/, ''); // Songlengths.md5 has CRLF endings
    const m = clean.match(/^([0-9a-f]{32})=(.*)$/i);
    if (m) map.set(m[1]!.toLowerCase(), m[2]!);
  }
  songlengthLookup = map;
  dbLoaded = true;
}

let songlengthLookup: Map<string, string> | null = null;

/**
 * Look up the current tune (by MD5 of its bytes) and populate
 * cRSID.SubtuneDurations + the returned per-subtune seconds array.
 * Call from the loader (processSIDfileData path). Returns seconds per
 * subtune (index 1..N), entries 0 when unknown.
 */
export function applySongLengthsFor(filedata: Uint8Array, subtuneAmount: number): number[] {
  const out: number[] = [0];
  cRSID.SubtuneDurations.fill(0);
  const hash = md5Hex(filedata);
  const entry = songlengthLookup?.get(hash);
  if (entry) {
    const toks = entry.trim().split(/\s+/);
    for (let i = 0; i < subtuneAmount && i < toks.length; ++i) {
      const sec = parseSongLength(toks[i]!);
      out.push(sec);
      cRSID.SubtuneDurations[i + 1] = Math.round(sec);
    }
  } else {
    for (let i = 0; i < subtuneAmount; ++i) out.push(0);
  }
  subtuneDurations = out;
  return out;
}

/** Duration of a subtune in seconds (0 = unknown). */
export function getSidSubtuneDuration(subtune: number): number {
  return subtuneDurations[subtune] ?? 0;
}

/** Whether a song-length database is loaded. */
export function isSidSongLengthDbLoaded(): boolean {
  return dbLoaded;
}

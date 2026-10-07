// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Bitti09 — modplayjs contributors
// SID engine seek + engine-time reporting.
//
// cRSID has no native seek — the tune is a running machine emulation.
// Seeking = fast-forwarding the engine: render the skipped samples in
// large chunks into a discard buffer, at whatever speed the CPU manages
// (typically far faster than realtime). Backwards seeks restart the tune
// (cRSID_initSIDtune) and then fast-forward — the same approach every
// machine-based player takes.
//
// The engine's clock is cRSID.PlayTime (seconds, advanced by
// cRSID_emulateC64 per generated second of audio).

import { cRSID } from './instance.js';
import { cRSID_initSIDtune, cRSID_generateSample, cRSID_playSIDtune } from './loader.js';

/** Last-loaded tune bytes — needed to restart for backwards seeks. */
let sidTuneBytes: Uint8Array | null = null;
let sidTuneHeader: import('./instance.js').CRSIDheader | null = null;
let sidTuneSubtune = 1;
let sidTuneRate = 44100;

/** Remember the loaded tune for backwards-seek restarts (sidStartTune
 *  calls this through sidplugin). */
export function sidRememberTune(bytes: Uint8Array, header: import('./instance.js').CRSIDheader, subtune: number, rate: number): void {
  sidTuneBytes = bytes;
  sidTuneHeader = header;
  sidTuneSubtune = subtune;
  sidTuneRate = rate;
}

/** Engine playback time in seconds (cRSID.PlayTime). */
export function getSidPlayTimeSeconds(): number {
  return cRSID.PlayTime;
}

/** Seek the engine to the given runtime in seconds. */
export function sidSeek(seconds: number): void {
  if (!sidTuneBytes || !sidTuneHeader) return;
  const target = Math.max(0, seconds);
  const now = cRSID.PlayTime;
  if (target < now) {
    // backwards: restart the tune, then fast-forward from 0
    cRSID_initSIDtune(sidTuneHeader, sidTuneSubtune);
    cRSID_playSIDtune();
  }
  // fast-forward the engine to the target in 1-second chunks
  const remainSec = target - cRSID.PlayTime;
  const frames = Math.max(0, Math.round(remainSec * sidTuneRate));
  const CHUNK = 65536; // frames per chunk — discard buffer reused
  const sink = new Int16Array(CHUNK * 2);
  let left = frames;
  while (left > 0) {
    const take = Math.min(left, CHUNK);
    for (let i = 0; i < take; ++i) {
      const s = cRSID_generateSample();
      sink[i * 2] = s.L > 32767 ? 32767 : s.L < -32768 ? -32768 : s.L;
      sink[i * 2 + 1] = s.R > 32767 ? 32767 : s.R < -32768 ? -32768 : s.R;
    }
    left -= take;
  }
}

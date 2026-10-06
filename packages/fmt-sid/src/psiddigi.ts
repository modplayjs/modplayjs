// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Bitti09 — modplayjs contributors
// Ported from: cRSID 1.58 libcRSID/C64/C64_SIDrouting.c:377-427 — the PSID
// $D4xx digi player (PlaySID-sample extension).
// (c) Hermit (Mihaly Horvath), license: WTF ("do what the frick you want").

import { CRSpecC64, CRAudioLevels } from './c64types.js';
import { cRSID, cRSID_C64 } from './instance.js';

// PSIDdigiSpecs (C64_SIDrouting.c:379-389)
const D418_VOL_RANGE = 0x10;
const DIGI_MAX = D418_VOL_RANGE - 1;
const DIGI_MASK = DIGI_MAX;
const DIGI_MID = D418_VOL_RANGE / 2;
const OUTPUT_RESOLUTION = 16;
const SID_CHANNELS = 3 + 1;
const NOMINAL_DIGI_RANGE = (1 << OUTPUT_RESOLUTION) / SID_CHANNELS; // 16384
const DIGI_VOLUME = 128 /* 55 */;
const DIGI_VOLUME_DENOM = 16;
const NOMINAL_DIGI_MUL = NOMINAL_DIGI_RANGE / D418_VOL_RANGE; // 1024
const DIGI_MUL = ((NOMINAL_DIGI_MUL * DIGI_VOLUME) / DIGI_VOLUME_DENOM) * CRAudioLevels.CRSID_PRESAT_ATT_DENOM / CRAudioLevels.CRSID_PRESAT_ATT_NOM;
void CRSpecC64;

/** The C function's static state (PlaybackEnabled, NybbleCounter,
 *  RepeatCounter, SampleAddress, Output, PeriodCounter) — kept across calls.
 *  The TS port stores them in a module-scope object with C semantics
 *  (they are reset when $D41D is written). */
const psidDigiState = {
  PlaybackEnabled: 0,
  NybbleCounter: 0,
  RepeatCounter: 0,
  SampleAddress: 0,
  Output: 0,
  PeriodCounter: 0,
};

/** cRSID_playPSIDdigi (C64_SIDrouting.c:377-427) — returns short. */
export function cRSID_playPSIDdigi(): number {
  const C64 = cRSID_C64;
  const st = psidDigiState;

  let Shifts: number;

  if (C64.IObankWR[0xd41d]) {
    st.PlaybackEnabled = C64.IObankWR[0xd41d]! >= 0xfe ? 1 : 0;
    st.PeriodCounter = 0;
    st.NybbleCounter = 0;
    st.SampleAddress = C64.IObankWR[0xd41e]! + (C64.IObankWR[0xd41f]! << 8);
    st.RepeatCounter = C64.IObankWR[0xd43f]!;
  }
  C64.IObankWR[0xd41d] = 0;

  if (st.PlaybackEnabled) {
    const RatePeriod = C64.IObankWR[0xd45d]! + (C64.IObankWR[0xd45e]! << 8);
    if (RatePeriod) st.PeriodCounter += Math.trunc(C64.CPUfrequency / RatePeriod);
    if (st.PeriodCounter >= C64.SampleRate) {
      st.PeriodCounter -= C64.SampleRate;

      if (st.SampleAddress < C64.IObankWR[0xd43d]! + (C64.IObankWR[0xd43e]! << 8)) {
        if (st.NybbleCounter) {
          Shifts = C64.IObankWR[0xd47d]! ? 4 : 0;
          ++st.SampleAddress;
        } else Shifts = C64.IObankWR[0xd47d]! ? 0 : 4;
        st.Output =
          (((C64.RAMbank[st.SampleAddress]! >>> Shifts) & DIGI_MASK) - DIGI_MID) * DIGI_MUL; // * DIGI_VOLUME; // * (C64.IObankWR[0xD418]&0xF);
        st.NybbleCounter ^= 1;
      } else if (st.RepeatCounter) {
        st.SampleAddress = C64.IObankWR[0xd47f]! + (C64.IObankWR[0xd47e]! << 8);
        st.RepeatCounter--;
      }
    }
  }

  return Math.trunc(st.Output / C64.Attenuation);
}

// The cRSID import documents parity with C's file-global cRSID use.
void cRSID;

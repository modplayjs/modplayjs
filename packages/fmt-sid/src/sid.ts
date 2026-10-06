// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Bitti09 — modplayjs contributors
// Ported from: cRSID 1.58 libcRSID/C64/SID.c — SID emulation engine core.
// (c) Hermit (Mihaly Horvath), license: WTF ("do what the frick you want").
import { CRMemAddresses } from './c64types.js';
import type { CRC64instance, CRSIDinstance, CRSIDwavOutput } from './c64types.js';

import { cRSID_emulateHQwaves } from './sidoscwaves.js';
import { cRSID_emulateHQresampledSIDoutputStage } from './sidoutputs.js';

/** cRSID_getSIDbase (SID.c:6-8). */
export function cRSID_getSIDbase(sidNumber: number): number {
  return cRSID_C64ref().SID[sidNumber]!.BaseAddress;
}

/** cRSID_getSIDmodel (SID.c:10-12). */
export function cRSID_getSIDmodel(sidNumber: number): number {
  return cRSID_C64ref().SID[sidNumber]!.ChipModel;
}

/** cRSID_setSIDmodel (SID.c:13-15). */
export function cRSID_setSIDmodel(C64: CRC64instance, sidNumber: number, value: number): number {
  return (C64.SID[sidNumber]!.ChipModel = value);
}

/** cRSID_getSIDchannel (SID.c:17-19) — channel in stereo field
 *  (left/right/middle). */
export function cRSID_getSIDchannel(sidNumber: number): number {
  return cRSID_C64ref().SID[sidNumber]!.Channel;
}

/** cRSID_getSIDlevel (SID.c:21-23). */
export function cRSID_getSIDlevel(sidNumber: number): number {
  return cRSID_C64ref().SID[sidNumber]!.Level;
}

/** Private-global access helper for the read-only getters above
 *  (C reads the file-global cRSID_C64 directly). */
import { cRSID_C64 } from './instance.js';
function cRSID_C64ref(): CRC64instance {
  return cRSID_C64;
}

/** cRSID_createSIDchip (SID.c:25-39). */
export function cRSID_createSIDchip(
  C64: CRC64instance,
  SID: CRSIDinstance,
  model: number,
  channel: number,
  baseaddress: number,
): void {
  SID.ChipModel = model;
  SID.Channel = channel;
  if (baseaddress >= 0xd400 && (baseaddress < 0xd800 || (0xde00 <= baseaddress && baseaddress <= 0xdfe0))) {
    // check valid address, avoid Color-RAM
    SID.BaseAddress = baseaddress;
    SID.BasePtr = baseaddress;
    SID.BasePtrRD = baseaddress;
  } else {
    SID.BaseAddress = 0x0000;
    SID.BasePtr = CRMemAddresses.CRSID_SID_SAFE_ADDRESS;
    SID.BasePtrRD = CRMemAddresses.CRSID_SID_SAFE_ADDRESS;
  } // NULL-ing not preferred as it can cause Segfault in sample-thread
  cRSID_initSIDchip(C64, SID); // (and guarding against NULL BasePtr would take some precious cycles in SID-emulation functions)
}

/** cRSID_initSIDchip (SID.c:41-56). */
export function cRSID_initSIDchip(_C64: CRC64instance, SID: CRSIDinstance): void {
  for (let Channel = 0; Channel < 21; Channel += 7) {
    SID.ADSRstate[Channel] = 0;
    SID.RateCounter[Channel] = 0;
    SID.EnvelopeCounter[Channel] = 0;
    SID.ExponentCounter[Channel] = 0;
    SID.PhaseAccu[Channel] = 0;
    SID.PrevPhaseAccu[Channel] = 0;
    SID.NoiseLFSR[Channel] = 0x7fffff;
    SID.PrevWavGenOut[Channel] = 0;
    SID.PrevWavData[Channel] = 0;
    SID.PrevSounDemonDigiWF[Channel] = 0x00;
  }
  SID.SyncSourceMSBrise = 0;
  SID.RingSourceMSB = 0;
  SID.PrevLowPass = SID.PrevBandPass = SID.PrevVolume = 0;
}

/** cRSID_emulateHQresampledSID (SID.c:58-64).
 *  ('Paused' segfault-guard comment omitted: the TS port has no audio-thread
 *  race; see the C source for the original guard.) */
export function cRSID_emulateHQresampledSID(C64: CRC64instance, SID: CRSIDinstance, cycles: number): number {
  const waves: CRSIDwavOutput = cRSID_emulateHQwaves(C64, SID, cycles);
  SID.Output = cRSID_emulateHQresampledSIDoutputStage(C64, SID, waves); // * SID->Volume;
  return SID.Output;
}

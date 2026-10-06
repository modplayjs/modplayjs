// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Bitti09 — modplayjs contributors
// Ported from: cRSID 1.58 libcRSID/C64/SID_ADSR.c — ADSR envelope emulation.
// (c) Hermit (Mihaly Horvath), license: WTF ("do what the frick you want").

import type { CRC64instance, CRSIDinstance } from './c64types.js';
import { cRSID_C64 } from './instance.js';

/** cRSID_ADSR_DAC_6581 (SID_ADSR.c:3-19) — used at output of ADSR envelope
 *  generator (not used for wave-generator because of 8bit-only resolution). */
export const cRSID_ADSR_DAC_6581: Uint8Array = new Uint8Array([
  0x00, 0x02, 0x03, 0x04, 0x05, 0x06, 0x07, 0x09, 0x09, 0x0b, 0x0b, 0x0d, 0x0d, 0x0f, 0x10, 0x12,
  0x11, 0x13, 0x14, 0x15, 0x16, 0x17, 0x18, 0x1a, 0x1a, 0x1c, 0x1c, 0x1e, 0x1e, 0x20, 0x21, 0x23,
  0x21, 0x23, 0x24, 0x25, 0x26, 0x27, 0x28, 0x2a, 0x2a, 0x2c, 0x2c, 0x2e, 0x2e, 0x30, 0x31, 0x33,
  0x32, 0x34, 0x35, 0x36, 0x37, 0x38, 0x39, 0x3b, 0x3b, 0x3d, 0x3d, 0x3f, 0x3f, 0x41, 0x42, 0x44,
  0x40, 0x42, 0x42, 0x44, 0x44, 0x46, 0x47, 0x49, 0x49, 0x4a, 0x4b, 0x4d, 0x4d, 0x4f, 0x50, 0x52,
  0x51, 0x53, 0x53, 0x55, 0x55, 0x57, 0x58, 0x5a, 0x5a, 0x5b, 0x5c, 0x5e, 0x5e, 0x60, 0x61, 0x63,
  0x61, 0x62, 0x63, 0x65, 0x65, 0x67, 0x68, 0x6a, 0x69, 0x6b, 0x6c, 0x6e, 0x6e, 0x70, 0x71, 0x73,
  0x72, 0x73, 0x74, 0x76, 0x76, 0x78, 0x79, 0x7b, 0x7a, 0x7c, 0x7d, 0x7f, 0x7f, 0x81, 0x82, 0x84,
  0x7b, 0x7d, 0x7e, 0x80, 0x80, 0x82, 0x83, 0x85, 0x84, 0x86, 0x87, 0x89, 0x89, 0x8b, 0x8c, 0x8d,
  0x8c, 0x8e, 0x8f, 0x91, 0x91, 0x93, 0x94, 0x96, 0x95, 0x97, 0x98, 0x9a, 0x9a, 0x9c, 0x9d, 0x9e,
  0x9c, 0x9e, 0x9f, 0xa1, 0xa1, 0xa3, 0xa4, 0xa5, 0xa5, 0xa7, 0xa8, 0xaa, 0xaa, 0xac, 0xac, 0xae,
  0xad, 0xaf, 0xb0, 0xb2, 0xb2, 0xb4, 0xb5, 0xb6, 0xb6, 0xb8, 0xb9, 0xbb, 0xbb, 0xbd, 0xbd, 0xbf,
  0xbb, 0xbd, 0xbe, 0xc0, 0xc0, 0xc2, 0xc2, 0xc4, 0xc4, 0xc6, 0xc7, 0xc8, 0xc9, 0xca, 0xcb, 0xcd,
  0xcc, 0xce, 0xcf, 0xd1, 0xd1, 0xd3, 0xd3, 0xd5, 0xd5, 0xd7, 0xd8, 0xd9, 0xda, 0xdb, 0xdc, 0xde,
  0xdc, 0xde, 0xdf, 0xe1, 0xe1, 0xe3, 0xe3, 0xe5, 0xe5, 0xe7, 0xe8, 0xe9, 0xea, 0xeb, 0xec, 0xee,
  0xed, 0xef, 0xf0, 0xf2, 0xf2, 0xf4, 0xf4, 0xf6, 0xf6, 0xf8, 0xf9, 0xfa, 0xfb, 0xfc, 0xfd, 0xff,
]);

// Specs (SID_ADSR.c:22-27)
const SID_CHANNEL_SPACING = 7;
const SID_CHANNEL_COUNT = 3;
const CHANNEL2_INDEX = 2 * SID_CHANNEL_SPACING;
const SID_CHANNELS_RANGE = SID_CHANNEL_SPACING * SID_CHANNEL_COUNT;
void SID_CHANNEL_COUNT; void CHANNEL2_INDEX;

// ADSRstateBits (SID_ADSR.c:28)
const GATE_BITVAL = 0x01, ATTACK_BITVAL = 0x80, DECAYSUSTAIN_BITVAL = 0x40, HOLDZEROn_BITVAL = 0x10;

/** ADSRprescalePeriods (SID_ADSR.c:30-33). */
const ADSRprescalePeriods: Int16Array = new Int16Array([
  9, 32, 63, 95, 149, 220, 267, 313, 392, 977, 1954, 3126, 3907, 11720, 19532, 31251,
]);

/** ADSRexponentPeriods (SID_ADSR.c:34-49) — pos0:1 pos6:30 pos14:16 pos26:8
 *  pos54:4 pos93:2. Regenerated mechanically from the C source (256 entries). */
const ADSRexponentPeriods: Uint8Array = new Uint8Array([
  1, 30, 30, 30, 30, 30, 30, 16, 16, 16, 16, 16, 16, 16, 16, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 8, 4, 4, 4, 4, 4,
  4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 4, 2, 2, 2, 2, 2, 2, 2, 2, 2,
  2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 1, 1,
  1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1,
  1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1,
  1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1,
  1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1,
  1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1,
]);

/** cRSID_emulateADSRs (SID_ADSR.c:51-89).
 *  C uses function-static PrevGate/AD/SR variables; they are write-before-read
 *  in every call so they are locals here (same semantics, no cross-call state). */
export function cRSID_emulateADSRs(_C64: CRC64instance, SID: CRSIDinstance, cycles: number): void {
  const W = cRSID_C64.IObankWR;

  for (let Channel = 0; Channel < SID_CHANNELS_RANGE; Channel += SID_CHANNEL_SPACING) {
    const ChannelPtr = SID.BasePtr + Channel;
    const AD = W[ChannelPtr + 5]!;
    const SR = W[ChannelPtr + 6]!;
    const ADSRstatePtr = Channel;
    const RateCounterPtr = Channel;
    const EnvelopeCounterPtr = Channel;
    const ExponentCounterPtr = Channel;

    const PrevGate = SID.ADSRstate[ADSRstatePtr]! & GATE_BITVAL;
    if (PrevGate !== (W[ChannelPtr + 4]! & GATE_BITVAL)) {
      // gatebit-change?
      if (PrevGate) SID.ADSRstate[ADSRstatePtr]! &= ~(GATE_BITVAL | ATTACK_BITVAL | DECAYSUSTAIN_BITVAL); // falling edge
      else SID.ADSRstate[ADSRstatePtr] = GATE_BITVAL | ATTACK_BITVAL | DECAYSUSTAIN_BITVAL | HOLDZEROn_BITVAL; // rising edge
    }

    let PrescalePeriod: number;
    if (SID.ADSRstate[ADSRstatePtr]! & ATTACK_BITVAL) PrescalePeriod = ADSRprescalePeriods[AD >> 4]!;
    else if (SID.ADSRstate[ADSRstatePtr]! & DECAYSUSTAIN_BITVAL) PrescalePeriod = ADSRprescalePeriods[AD & 0x0f]!;
    else PrescalePeriod = ADSRprescalePeriods[SR & 0x0f]!;

    SID.RateCounter[RateCounterPtr]! += cycles;
    if (SID.RateCounter[RateCounterPtr]! >= 0x8000) SID.RateCounter[RateCounterPtr]! -= 0x8000; // can wrap around (ADSR delay-bug: short 1st frame)

    if (PrescalePeriod <= SID.RateCounter[RateCounterPtr]! && SID.RateCounter[RateCounterPtr]! < PrescalePeriod + cycles) {
      // ratecounter shot (matches rateperiod) (in genuine SID ratecounter is LFSR)
      SID.RateCounter[RateCounterPtr]! -= PrescalePeriod; // reset rate-counter on period-match
      if (
        (SID.ADSRstate[ADSRstatePtr]! & ATTACK_BITVAL) ||
        ++SID.ExponentCounter[ExponentCounterPtr]! === ADSRexponentPeriods[SID.EnvelopeCounter[EnvelopeCounterPtr]!]!
      ) {
        SID.ExponentCounter[ExponentCounterPtr] = 0;
        if (SID.ADSRstate[ADSRstatePtr]! & HOLDZEROn_BITVAL) {
          if (SID.ADSRstate[ADSRstatePtr]! & ATTACK_BITVAL) {
            ++SID.EnvelopeCounter[EnvelopeCounterPtr]!;
            if (SID.EnvelopeCounter[EnvelopeCounterPtr]! === 0xff) SID.ADSRstate[ADSRstatePtr]! &= ~ATTACK_BITVAL;
          } else if (
            !(SID.ADSRstate[ADSRstatePtr]! & DECAYSUSTAIN_BITVAL) ||
            SID.EnvelopeCounter[EnvelopeCounterPtr] !== (SR & 0xf0) + (SR >> 4)
          ) {
            --SID.EnvelopeCounter[EnvelopeCounterPtr]!; // resid adds 1 cycle delay, we omit that mechanism here
            if (SID.EnvelopeCounter[EnvelopeCounterPtr]! === 0) SID.ADSRstate[ADSRstatePtr]! &= ~HOLDZEROn_BITVAL;
          }
        }
      }
    }
  }
}

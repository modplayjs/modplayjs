// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Bitti09 — modplayjs contributors
// Ported from: cRSID 1.58 libcRSID/C64/SID_Outputs.c — SID filter, $D418
// volume-register digi, and output/mixing stages.
// (c) Hermit (Mihaly Horvath), license: WTF ("do what the frick you want").

import {
  CRSID_FILTERTABLE_RESOLUTION,
  CRSID_OVERSAMPLING_FILTERTABLE_RESOLUTION,
} from './config.js';
import { CRAudioLevels } from './c64types.js';
import type { CRC64instance, CRSIDinstance, CRSIDwavOutput } from './c64types.js';
import { cRSID_C64 } from './instance.js';
import {
  CRSID_CutoffMul8580_44100Hz,
  CRSID_CutoffMul6581_44100Hz,
  CRSID_CutoffMul8580_OverSampleRate,
  CRSID_CutoffMul6581_OverSampleRate,
  CRSID_Resonances8580,
  CRSID_Resonances6581,
} from './filtercurves.js';

// Specs (SID_Outputs.c:5-21)
const FRACTIONAL_BITS = 12;
const FRACTIONAL_SHIFTS = FRACTIONAL_BITS;
const CRSID_FILTERTABLE_SHIFTS = CRSID_FILTERTABLE_RESOLUTION;
const CRSID_FILTERTABLE_MAGNITUDE = 1 << CRSID_FILTERTABLE_RESOLUTION;
const CHANNELS = 3 + 1, VOLUME_MAX = 0xf;
const D418_DIGI_VOL = 1 * 16;
const D418_DIGI_MUL = D418_DIGI_VOL / CRAudioLevels.CRSID_WAVGEN_PREDIV; // digi-channel is counted too as full-volume 4th channel in attenuation/volume vs SIDcount
const SID_CUTOFF_BITS = 11;
const SID_CUTOFF_RANGE = 1 << SID_CUTOFF_BITS;
const SID_CUTOFF_MAX = SID_CUTOFF_RANGE - 1;
const OFF3_BITVAL = 0x80, HIGHPASS_BITVAL = 0x40, BANDPASS_BITVAL = 0x20, LOWPASS_BITVAL = 0x10;
void CHANNELS; void VOLUME_MAX; void OFF3_BITVAL; void CRSID_FILTERTABLE_SHIFTS;


/** C integer division (truncates toward zero; JS `/` is not integer and
 *  `Math.floor` rounds down — not the same for negative operands). */
function divTrunc(a: number, b: number): number {
  return Math.trunc(a / b);
}

/** cRSID_emulateSIDoutputStage (SID_Outputs.c:23-101) — filter + output-
 *  mixing (main-volume / attenuator) stage. */
export function cRSID_emulateSIDoutputStage(C64: CRC64instance, SID: CRSIDinstance): number {
  const W = C64.IObankWR;

  let Tmp: number;
  let FilterOutput: number;
  let Cutoff: number;
  let Resonance: number;

  const FilterSwitchReso = W[SID.BasePtr + 0x17]!;
  const VolumeBand = W[SID.BasePtr + 0x18]!;
  Cutoff = (W[SID.BasePtr + 0x16]! << 3) + (W[SID.BasePtr + 0x15]! & 7);
  Resonance = FilterSwitchReso >> 4;

  const NonFilted = SID.NonFiltedSample;
  const FilterInput = SID.FilterInputSample;

  // Filter
  FilterOutput = 0;
  // if ( CALMLY (!nofilter) ) {
  if (SID.ChipModel === 8580) {
    Cutoff = CRSID_CutoffMul8580_44100Hz[Cutoff]!;
    Resonance = CRSID_Resonances8580[Resonance]!;
  } else {
    // 6581
    Cutoff += Math.imul(FilterInput, 105) >> 16; // MOSFET-VCR control-voltage calculation (resistance-modulation aka 6581 filter distortion) emulation
    if (Cutoff > SID_CUTOFF_MAX) Cutoff = SID_CUTOFF_MAX;
    else if (Cutoff < 0) Cutoff = 0; // can really go below 0 when FilterInput is negative
    Cutoff = CRSID_CutoffMul6581_44100Hz[Cutoff]!;
    Resonance = CRSID_Resonances6581[Resonance]!;
  }
  // shifting negative integers in C is implementation-dependent, so using
  // normal division by power of 2, that might luckily be optimized as
  // arithmetic-shift by the compiler
  Tmp = FilterInput + divTrunc(SID.PrevBandPass * Resonance, CRSID_FILTERTABLE_MAGNITUDE) + SID.PrevLowPass;
  if (VolumeBand & HIGHPASS_BITVAL) FilterOutput -= Tmp;
  Tmp = SID.PrevBandPass - divTrunc(Tmp * Cutoff, CRSID_FILTERTABLE_MAGNITUDE); // >> CRSID_FILTERTABLE_SHIFTS ); //12 );
  SID.PrevBandPass = Tmp;
  if (VolumeBand & BANDPASS_BITVAL) FilterOutput -= Tmp;
  Tmp = SID.PrevLowPass + divTrunc(Tmp * Cutoff, CRSID_FILTERTABLE_MAGNITUDE); // >> CRSID_FILTERTABLE_SHIFTS ); // 12 );
  SID.PrevLowPass = Tmp;
  if (VolumeBand & LOWPASS_BITVAL) FilterOutput += Tmp;
  // }

  // Output-mixing (main-volume / attenuator) stage
  //
  // For $D418 volume-register digi playback: an AC / DC separation for $D418
  // value at low (20Hz or so) cutoff-frequency, sending AC (highpass) value
  // to a 4th 'digi' channel mixed to the master output, and set ONLY the DC
  // (lowpass) value to the volume-control. This solved 2 issues: Thanks to
  // the lowpass filtering of the volume-control, SID tunes where digi is
  // played together with normal SID channels, won't sound distorted anymore,
  // and the volume-clicks disappear when setting SID-volume. (This is useful
  // for fade-in/out tunes like Hades Nebula, where clicking ruins the intro.)
  let MainVolume: number;
  if (C64.RealSIDmode) {
    Tmp = (VolumeBand & 0xf) << FRACTIONAL_SHIFTS; // 12 );
    SID.Digi = (Tmp - SID.PrevVolume) * D418_DIGI_MUL; // highpass is digi, adding it to output must be before digifilter-code
    SID.PrevVolume += divTrunc(Tmp - SID.PrevVolume, 1024); // >> (FRACTIONAL_SHIFTS-2); //10; //arithmetic shift amount determines digi lowpass-frequency
    MainVolume = SID.PrevVolume >> FRACTIONAL_SHIFTS; // 12; //lowpass is main volume
  } else MainVolume = VolumeBand & 0xf;

  SID.Output = (NonFilted + FilterOutput) * MainVolume + SID.Digi;

  // Output = SID.Output / cRSID_C64.Attenuation — (faster being done once
  // outside, not in all individual SIDs)

  return SID.Output; // master output of a SID
}

/** cRSID_precalculateHQoutputParameters (SID_Outputs.c:103-157) — called by
 *  resampler at samplerate-pace. */
export function cRSID_precalculateHQoutputParameters(C64: CRC64instance, SID: CRSIDinstance): void {
  // enum { FRACTIONAL_BITS = 12, FRACTIONAL_SHIFTS = (FRACTIONAL_BITS) } —
  // same values as in emulateSIDoutputStage
  const VOLUME_DIGI_SEPARATION_CUTOFF_DIV = 1 << 10;

  const VolumeBand = C64.IObankWR[SID.BasePtr + 0x18]!; // FilterSwitchReso = SID->BasePtr[0x17];
  // Resonance = SID->BasePtr[0x17] >> 4; //FilterSwitchReso >> 4;
  const Cutoff = (C64.IObankWR[SID.BasePtr + 0x16]! << 3) + (C64.IObankWR[SID.BasePtr + 0x15]! & 7);

  if (SID.ChipModel === 8580) {
    SID.Cutoff = CRSID_CutoffMul8580_OverSampleRate[Cutoff]!;
    SID.Resonance = CRSID_Resonances8580[C64.IObankWR[SID.BasePtr + 0x17]! >> 4]!;
  } else {
    // 6581
    SID.Cutoff = CRSID_CutoffMul6581_OverSampleRate[Cutoff]!;
    SID.Resonance = CRSID_Resonances6581[C64.IObankWR[SID.BasePtr + 0x17]! >> 4]!;
  }

  SID.HighPassBit = VolumeBand & HIGHPASS_BITVAL;
  SID.BandPassBit = VolumeBand & BANDPASS_BITVAL;
  SID.LowPassBit = VolumeBand & LOWPASS_BITVAL;

  // For $D418 volume-register digi playback: (see long comment at
  // cRSID_emulateSIDoutputStage above — same AC/DC separation applies here)
  if (C64.RealSIDmode) {
    const Tmp = (VolumeBand & 0xf) << FRACTIONAL_SHIFTS; // 12 );
    SID.Digi = (Tmp - SID.PrevVolume) * D418_DIGI_MUL; // highpass is digi, adding it to output must be before digifilter-code
    SID.PrevVolume += divTrunc(Tmp - SID.PrevVolume, VOLUME_DIGI_SEPARATION_CUTOFF_DIV); // / 1024; — arithmetic shift amount determines digi lowpass-frequency
    SID.Volume = SID.PrevVolume >> FRACTIONAL_SHIFTS; // 12; //lowpass is main volume
  } else SID.Volume = VolumeBand & 0xf;
}

/** cRSID_emulateHQresampledSIDoutputStage (SID_Outputs.c:159-206) — called by
 *  resampler at oversample-rate. */
export function cRSID_emulateHQresampledSIDoutputStage(
  C64: CRC64instance,
  SID: CRSIDinstance,
  waves: CRSIDwavOutput,
): number {
  void C64;
  const CRSID_OVERSAMPLING_FILTERTABLE_MAGNITUDE = 1 << CRSID_OVERSAMPLING_FILTERTABLE_RESOLUTION;
  // HQ_6581_CUTOFF_MAX = 0xA82 //0x1505 //0x541 — cutoff-max from HQ-filter oversampled cutoff-table (unused: bound-check commented out in C)

  let Tmp: number; // , FilterInput;
  let FilterOutput: number;
  let Cutoff: number;

  // FilterInput = waves.FilterInput;

  if (SID.ChipModel === 8580) Cutoff = SID.Cutoff;
  else {
    Cutoff = SID.Cutoff + divTrunc(waves.FilterInput, 1024); // MOSFET-VCR control-voltage calculation (resistance-modulation aka 6581 filter distortion) emulation
    /* if ( Cutoff > HQ_6581_CUTOFF_MAX ) Cutoff = HQ_6581_CUTOFF_MAX; else */
    if (Cutoff < 0) Cutoff = 0; // can really go below 0 when FilterInput is negative
  }

  FilterOutput = 0; // shifting negative integers in C is implementation-dependent, so using normal division by power of 2, that might luckily be optimized as arithmetic-shift by the compiler
  Tmp =
    waves.FilterInput + divTrunc(SID.PrevBandPass * SID.Resonance, CRSID_FILTERTABLE_MAGNITUDE) + SID.PrevLowPass;
  if (SID.HighPassBit) FilterOutput -= Tmp;
  Tmp = SID.PrevBandPass - divTrunc(Tmp * Cutoff, CRSID_OVERSAMPLING_FILTERTABLE_MAGNITUDE);
  SID.PrevBandPass = Tmp;
  if (SID.BandPassBit) FilterOutput -= Tmp;
  Tmp = SID.PrevLowPass + divTrunc(Tmp * Cutoff, CRSID_OVERSAMPLING_FILTERTABLE_MAGNITUDE);
  SID.PrevLowPass = Tmp;
  if (SID.LowPassBit) FilterOutput += Tmp;

  return (waves.NonFilted + FilterOutput) * SID.Volume;
}

/** cRSID_emulateHQresampledSIDdigi (SID_Outputs.c:208-260) — called by
 *  resampler at samplerate-pace, only digis. */
export function cRSID_emulateHQresampledSIDdigi(C64: CRC64instance, SID: CRSIDinstance, signal: { L: number; R: number }): void {
  // VolumeBand=SID->BasePtr[0x18]; (unused in C — commented out)
  if (C64.RealSIDmode) {
    // only processing digi here
    if (SID.Channel === 1 /* CRSID_CHANNEL_LEFT */) signal.L += SID.Digi * 2;
    else if (SID.Channel === 2 /* CRSID_CHANNEL_RIGHT */) signal.R += SID.Digi * 2;
    else {
      signal.L += SID.Digi;
      signal.R += SID.Digi;
    }
  }
}

// The C file reads the file-global cRSID_C64 inside the RealSIDmode branches;
// the TS port threads `C64` through — the import documents that parity.
void cRSID_C64;

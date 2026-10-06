// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Bitti09 — modplayjs contributors
// Ported from: cRSID 1.58 libcRSID/C64/C64_SIDrouting.c — mono/stereo/narrow
// routing of the SID chips' outputs at the three emulation quality levels,
// plus the PSID $D4xx digi player.
// (c) Hermit (Mihaly Horvath), license: WTF ("do what the frick you want").


/** C integer division (truncates toward zero; JS `/` is not integer and
 *  `Math.floor` rounds down — not the same for negative operands). */
function divTrunc(a: number, b: number): number {
  return Math.trunc(a / b);
}

import {
  CRSpecC64,
  CRChannel,
  CRAudioLevels,
  CRSID_BYTE_LOG2,
  type CRC64instance,
  type CRSIDOutput,
  type CRSIDwavOutput,
} from './c64types.js';
import {
  CRSID_RESAMPLER_SINCWINDOW_PERIODS,
  CRSID_RESAMPLER_SINCPERIOD_SAMPLES,
  CRSID_RESAMPLER_SINCWINDOW_MAGNITUDE,
} from './config.js';
import { SincWindow } from './sincwindow.js';
import { cRSID_emulateSID_light, cRSID_emulateHQwaves } from './sidoscwaves.js';
import {
  cRSID_emulateSIDoutputStage,
  cRSID_precalculateHQoutputParameters,
  cRSID_emulateHQresampledSIDdigi,
} from './sidoutputs.js';
import { cRSID_emulateHQresampledSID } from './sid.js';

// ---------------------------------------------------------------------------
// cRSID_emulateLightSIDs (C64_SIDrouting.c:4-82) — lightweight (all at
// samplerate-pace) SID-emulations: oscillators, waveforms, filter and
// complete output stages
// ---------------------------------------------------------------------------

export function cRSID_emulateLightSIDs(C64: CRC64instance): CRSIDOutput {
  let Tmp: number, Tmp2: number;
  const Output: CRSIDOutput = { L: 0, R: 0 };

  switch (C64.Stereo) {
    case 0 /* CRSID_CHANNELMODE_MONO */: {
      Output.L = cRSID_emulateSID_light(C64, C64.SID[1]!);
      if (C64.SID[2]!.BaseAddress !== 0) Output.L += cRSID_emulateSID_light(C64, C64.SID[2]!);
      if (C64.SID[3]!.BaseAddress !== 0) Output.L += cRSID_emulateSID_light(C64, C64.SID[3]!);
      if (C64.SID[4]!.BaseAddress !== 0) Output.L += cRSID_emulateSID_light(C64, C64.SID[4]!);
      Output.R = Output.L = divTrunc(Output.L, C64.Attenuation);
      break;
    }
    case 1 /* CRSID_CHANNELMODE_STEREO */: {
      Tmp = cRSID_emulateSID_light(C64, C64.SID[1]!);
      if (C64.SID[1]!.Channel === CRChannel.CRSID_CHANNEL_LEFT) {
        Output.L = Tmp * 2;
        Output.R = 0;
      } else if (C64.SID[1]!.Channel === CRChannel.CRSID_CHANNEL_RIGHT) {
        Output.R = Tmp * 2;
        Output.L = 0;
      } else Output.L = Output.R = Tmp;
      if (C64.SID[2]!.BaseAddress !== 0) {
        Tmp = cRSID_emulateSID_light(C64, C64.SID[2]!);
        if (C64.SID[2]!.Channel === CRChannel.CRSID_CHANNEL_LEFT) Output.L += Tmp * 2;
        else if (C64.SID[2]!.Channel === CRChannel.CRSID_CHANNEL_RIGHT) Output.R += Tmp * 2;
        else {
          Output.L += Tmp;
          Output.R += Tmp;
        }
      }
      if (C64.SID[3]!.BaseAddress !== 0) {
        Tmp = cRSID_emulateSID_light(C64, C64.SID[3]!);
        if (C64.SID[3]!.Channel === CRChannel.CRSID_CHANNEL_LEFT) Output.L += Tmp * 2;
        else if (C64.SID[3]!.Channel === CRChannel.CRSID_CHANNEL_RIGHT) Output.R += Tmp * 2;
        else {
          Output.L += Tmp;
          Output.R += Tmp;
        }
      }
      if (C64.SID[4]!.BaseAddress !== 0) {
        Tmp = cRSID_emulateSID_light(C64, C64.SID[4]!);
        if (C64.SID[4]!.Channel === CRChannel.CRSID_CHANNEL_LEFT) Output.L += Tmp * 2;
        else if (C64.SID[4]!.Channel === CRChannel.CRSID_CHANNEL_RIGHT) Output.R += Tmp * 2;
        else {
          Output.L += Tmp;
          Output.R += Tmp;
        }
      }
      Output.L = divTrunc(Output.L, C64.Attenuation);
      Output.R = divTrunc(Output.R, C64.Attenuation);
      break;
    }
    default /* CRSID_CHANNELMODE_NARROW (3) */: {
      Tmp = cRSID_emulateSID_light(C64, C64.SID[1]!);
      if (C64.SID[1]!.Channel === CRChannel.CRSID_CHANNEL_LEFT) {
        Tmp2 = Tmp >> CRChannel.CRSID_CHANNELPANNING_DIVSHIFTS;
        Output.L = Tmp + Tmp2;
        Output.R = Tmp - Tmp2;
      } else if (C64.SID[1]!.Channel === CRChannel.CRSID_CHANNEL_RIGHT) {
        Tmp2 = Tmp >> CRChannel.CRSID_CHANNELPANNING_DIVSHIFTS;
        Output.R = Tmp + Tmp2;
        Output.L = Tmp - Tmp2;
      } else Output.L = Output.R = Tmp;
      if (C64.SID[2]!.BaseAddress !== 0) {
        Tmp = cRSID_emulateSID_light(C64, C64.SID[2]!);
        if (C64.SID[2]!.Channel === CRChannel.CRSID_CHANNEL_LEFT) {
          Tmp2 = Tmp >> CRChannel.CRSID_CHANNELPANNING_DIVSHIFTS;
          Output.L += Tmp + Tmp2;
          Output.R += Tmp - Tmp2;
        } else if (C64.SID[2]!.Channel === CRChannel.CRSID_CHANNEL_RIGHT) {
          Tmp2 = Tmp >> CRChannel.CRSID_CHANNELPANNING_DIVSHIFTS;
          Output.R += Tmp + Tmp2;
          Output.L += Tmp - Tmp2;
        } else {
          Output.L += Tmp;
          Output.R += Tmp;
        }
      }
      if (C64.SID[3]!.BaseAddress !== 0) {
        Tmp = cRSID_emulateSID_light(C64, C64.SID[3]!);
        if (C64.SID[3]!.Channel === CRChannel.CRSID_CHANNEL_LEFT) {
          Tmp2 = Tmp >> CRChannel.CRSID_CHANNELPANNING_DIVSHIFTS;
          Output.L += Tmp + Tmp2;
          Output.R += Tmp - Tmp2;
        } else if (C64.SID[3]!.Channel === CRChannel.CRSID_CHANNEL_RIGHT) {
          Tmp2 = Tmp >> CRChannel.CRSID_CHANNELPANNING_DIVSHIFTS;
          Output.R += Tmp + Tmp2;
          Output.L += Tmp - Tmp2;
        } else {
          Output.L += Tmp;
          Output.R += Tmp;
        }
      }
      if (C64.SID[4]!.BaseAddress !== 0) {
        Tmp = cRSID_emulateSID_light(C64, C64.SID[4]!);
        if (C64.SID[4]!.Channel === CRChannel.CRSID_CHANNEL_LEFT) {
          Tmp2 = Tmp >> CRChannel.CRSID_CHANNELPANNING_DIVSHIFTS;
          Output.L += Tmp + Tmp2;
          Output.R += Tmp - Tmp2;
        } else if (C64.SID[4]!.Channel === CRChannel.CRSID_CHANNEL_RIGHT) {
          Tmp2 = Tmp >> CRChannel.CRSID_CHANNELPANNING_DIVSHIFTS;
          Output.R += Tmp + Tmp2;
          Output.L += Tmp - Tmp2;
        } else {
          Output.L += Tmp;
          Output.R += Tmp;
        }
      }
      Output.L = divTrunc(Output.L, C64.Attenuation);
      Output.R = divTrunc(Output.R, C64.Attenuation);
      break;
    }
  }
  return Output;
}

// ---------------------------------------------------------------------------
// cRSID_emulateOversampledSIDwaves (C64_SIDrouting.c:84-171) — averaging
// oversampler, only oscillators & waveforms (called at samplerate-pace)
// ---------------------------------------------------------------------------

export function cRSID_emulateOversampledSIDwaves(C64: CRC64instance): void {
  let HQsampleCount = 0;
  let Temp: number;
  let SIDwavOutput: CRSIDwavOutput;

  // 2-pole Chebyshev filter derivation: (C64_SIDrouting.c:86-110, comments)
  // *** Resulting even more simplified formula: output += ( input + output * 3 - (prevoutput << 2) ) >> 3;

  // C: static ints persist across calls; the four SID channels each keep a
  // 2nd-order filter state that MUST persist. The TS port stores them on the
  // instance via a scratch object (same lifetime as C's statics).
  const st = getOversampleState(C64);

  HQsampleCount = 0;
  C64.SID[1]!.NonFiltedSample = C64.SID[1]!.FilterInputSample = 0;
  C64.SID[2]!.NonFiltedSample = C64.SID[2]!.FilterInputSample = 0;
  C64.SID[3]!.NonFiltedSample = C64.SID[3]!.FilterInputSample = 0;
  C64.SID[4]!.NonFiltedSample = C64.SID[4]!.FilterInputSample = 0;

  while (C64.OverSampleCycleCnt <= C64.SampleClockRatio) {
    SIDwavOutput = cRSID_emulateHQwaves(C64, C64.SID[1]!, CRSpecC64.CRSID_OVERSAMPLING_CYCLES);
    Temp = st.PrevNonFiltSample1;
    st.PrevNonFiltSample1 = st.NonFiltSample1;
    st.NonFiltSample1 += (SIDwavOutput.NonFilted + st.NonFiltSample1 * 3 - (Temp << 2)) >> 3;
    Temp = st.PrevFiltSample1;
    st.PrevFiltSample1 = st.FiltSample1;
    st.FiltSample1 += (SIDwavOutput.FilterInput + st.FiltSample1 * 3 - (Temp << 2)) >> 3;
    C64.SID[1]!.NonFiltedSample += st.NonFiltSample1;
    C64.SID[1]!.FilterInputSample += st.FiltSample1;

    // 2-pole Chebyshev-based fast integer-only fixed-point ~18kHz
    // Nyquist/antialiasing-filters for all SIDs
    if (C64.SID[2]!.BaseAddress !== 0) {
      SIDwavOutput = cRSID_emulateHQwaves(C64, C64.SID[2]!, CRSpecC64.CRSID_OVERSAMPLING_CYCLES);
      Temp = st.PrevNonFiltSample2;
      st.PrevNonFiltSample2 = st.NonFiltSample2;
      st.NonFiltSample2 += (SIDwavOutput.NonFilted + st.NonFiltSample2 * 3 - (Temp << 2)) >> 3;
      Temp = st.PrevFiltSample2;
      st.PrevFiltSample2 = st.FiltSample2;
      st.FiltSample2 += (SIDwavOutput.FilterInput + st.FiltSample2 * 3 - (Temp << 2)) >> 3;
      C64.SID[2]!.NonFiltedSample += st.NonFiltSample2;
      C64.SID[2]!.FilterInputSample += st.FiltSample2; // SIDwavOutput.FilterInput;
    }
    if (C64.SID[3]!.BaseAddress !== 0) {
      SIDwavOutput = cRSID_emulateHQwaves(C64, C64.SID[3]!, CRSpecC64.CRSID_OVERSAMPLING_CYCLES);
      Temp = st.PrevNonFiltSample3;
      st.PrevNonFiltSample3 = st.NonFiltSample3;
      st.NonFiltSample3 += (SIDwavOutput.NonFilted + st.NonFiltSample3 * 3 - (Temp << 2)) >> 3;
      Temp = st.PrevFiltSample3;
      st.PrevFiltSample3 = st.FiltSample3;
      st.FiltSample3 += (SIDwavOutput.FilterInput + st.FiltSample3 * 3 - (Temp << 2)) >> 3;
      C64.SID[3]!.NonFiltedSample += st.NonFiltSample3;
      C64.SID[3]!.FilterInputSample += st.FiltSample3; // SIDwavOutput.FilterInput;
    }
    if (C64.SID[4]!.BaseAddress !== 0) {
      SIDwavOutput = cRSID_emulateHQwaves(C64, C64.SID[4]!, CRSpecC64.CRSID_OVERSAMPLING_CYCLES);
      Temp = st.PrevNonFiltSample4;
      st.PrevNonFiltSample4 = st.NonFiltSample4;
      st.NonFiltSample4 += (SIDwavOutput.NonFilted + st.NonFiltSample4 * 3 - (Temp << 2)) >> 3;
      Temp = st.PrevFiltSample4;
      st.PrevFiltSample4 = st.FiltSample4;
      st.FiltSample4 += (SIDwavOutput.FilterInput + st.FiltSample4 * 3 - (Temp << 2)) >> 3;
      C64.SID[4]!.NonFiltedSample += st.NonFiltSample4;
      C64.SID[4]!.FilterInputSample += st.FiltSample3; // SIDwavOutput.FilterInput;  (sic — C uses FiltSample3 here, kept 1:1)
    }
    ++HQsampleCount;
    C64.OverSampleCycleCnt += CRSpecC64.CRSID_OVERSAMPLING_CYCLES << CRSpecC64.CRSID_CLOCK_FRACTIONAL_BITS;
  }
  C64.OverSampleCycleCnt -= C64.SampleClockRatio;

  // fast resampler - averaging of accumulated samples, decreases
  // sound-aliasing further:
  C64.SID[1]!.NonFiltedSample = divTrunc(C64.SID[1]!.NonFiltedSample, HQsampleCount);
  C64.SID[1]!.FilterInputSample = divTrunc(C64.SID[1]!.FilterInputSample, HQsampleCount);
  if (C64.SID[2]!.BaseAddress !== 0) {
    C64.SID[2]!.NonFiltedSample = divTrunc(C64.SID[2]!.NonFiltedSample, HQsampleCount);
    C64.SID[2]!.FilterInputSample = divTrunc(C64.SID[2]!.FilterInputSample, HQsampleCount);
  }
  if (C64.SID[3]!.BaseAddress !== 0) {
    C64.SID[3]!.NonFiltedSample = divTrunc(C64.SID[3]!.NonFiltedSample, HQsampleCount);
    C64.SID[3]!.FilterInputSample = divTrunc(C64.SID[3]!.FilterInputSample, HQsampleCount);
  }
  if (C64.SID[4]!.BaseAddress !== 0) {
    C64.SID[4]!.NonFiltedSample = divTrunc(C64.SID[4]!.NonFiltedSample, HQsampleCount);
    C64.SID[4]!.FilterInputSample = divTrunc(C64.SID[4]!.FilterInputSample, HQsampleCount);
  }
}

/** The C function's `static int` filter-state, attached to the C64 instance
 *  (C statics live for the program lifetime; the TS equivalent is a per-C64
 *  scratch object created lazily). */
interface OversampleState {
  NonFiltSample1: number; FiltSample1: number; PrevNonFiltSample1: number; PrevFiltSample1: number;
  NonFiltSample2: number; FiltSample2: number; PrevNonFiltSample2: number; PrevFiltSample2: number;
  NonFiltSample3: number; FiltSample3: number; PrevNonFiltSample3: number; PrevFiltSample3: number;
  NonFiltSample4: number; FiltSample4: number; PrevNonFiltSample4: number; PrevFiltSample4: number;
}
const oversampleStates = new WeakMap<object, OversampleState>();
function getOversampleState(C64: CRC64instance): OversampleState {
  let st = oversampleStates.get(C64);
  if (!st) {
    st = {
      NonFiltSample1: 0, FiltSample1: 0, PrevNonFiltSample1: 0, PrevFiltSample1: 0,
      NonFiltSample2: 0, FiltSample2: 0, PrevNonFiltSample2: 0, PrevFiltSample2: 0,
      NonFiltSample3: 0, FiltSample3: 0, PrevNonFiltSample3: 0, PrevFiltSample3: 0,
      NonFiltSample4: 0, FiltSample4: 0, PrevNonFiltSample4: 0, PrevFiltSample4: 0,
    };
    oversampleStates.set(C64, st);
  }
  return st;
}

// ---------------------------------------------------------------------------
// cRSID_emulateOversampledSIDoutputs (C64_SIDrouting.c:173-259)
// ---------------------------------------------------------------------------

export function cRSID_emulateOversampledSIDoutputs(C64: CRC64instance): CRSIDOutput {
  let Tmp: number, Tmp2: number;
  const Output: CRSIDOutput = { L: 0, R: 0 };

  switch (C64.Stereo) {
    // if ( MOSTLY (cRSID_C64.Stereo==CRSID_CHANNELMODE_MONO ...) ) { //mono
    case 0: {
      Output.L = cRSID_emulateSIDoutputStage(C64, C64.SID[1]!); // , cRSID_C64.HighQualityResampler );
      if (C64.SID[2]!.BaseAddress !== 0) Output.L += cRSID_emulateSIDoutputStage(C64, C64.SID[2]!);
      if (C64.SID[3]!.BaseAddress !== 0) Output.L += cRSID_emulateSIDoutputStage(C64, C64.SID[3]!);
      if (C64.SID[4]!.BaseAddress !== 0) Output.L += cRSID_emulateSIDoutputStage(C64, C64.SID[4]!);
      Output.R = Output.L = divTrunc(Output.L, C64.Attenuation);
      break;
    }
    case 1: {
      Tmp = cRSID_emulateSIDoutputStage(C64, C64.SID[1]!);
      if (C64.SID[1]!.Channel === CRChannel.CRSID_CHANNEL_LEFT) {
        Output.L = Tmp * 2;
        Output.R = 0;
      } else if (C64.SID[1]!.Channel === CRChannel.CRSID_CHANNEL_RIGHT) {
        Output.R = Tmp * 2;
        Output.L = 0;
      } else Output.L = Output.R = Tmp;
      if (C64.SID[2]!.BaseAddress !== 0) {
        Tmp = cRSID_emulateSIDoutputStage(C64, C64.SID[2]!);
        if (C64.SID[2]!.Channel === CRChannel.CRSID_CHANNEL_LEFT) Output.L += Tmp * 2;
        else if (C64.SID[2]!.Channel === CRChannel.CRSID_CHANNEL_RIGHT) Output.R += Tmp * 2;
        else {
          Output.L += Tmp;
          Output.R += Tmp;
        }
      }
      if (C64.SID[3]!.BaseAddress !== 0) {
        Tmp = cRSID_emulateSIDoutputStage(C64, C64.SID[3]!);
        if (C64.SID[3]!.Channel === CRChannel.CRSID_CHANNEL_LEFT) Output.L += Tmp * 2;
        else if (C64.SID[3]!.Channel === CRChannel.CRSID_CHANNEL_RIGHT) Output.R += Tmp * 2;
        else {
          Output.L += Tmp;
          Output.R += Tmp;
        }
      }
      if (C64.SID[4]!.BaseAddress !== 0) {
        Tmp = cRSID_emulateSIDoutputStage(C64, C64.SID[4]!);
        if (C64.SID[4]!.Channel === CRChannel.CRSID_CHANNEL_LEFT) Output.L += Tmp * 2;
        else if (C64.SID[4]!.Channel === CRChannel.CRSID_CHANNEL_RIGHT) Output.R += Tmp * 2;
        else {
          Output.L += Tmp;
          Output.R += Tmp;
        }
      }
      Output.L = divTrunc(Output.L, C64.Attenuation);
      Output.R = divTrunc(Output.R, C64.Attenuation);
      break;
    }
    default: {
      // narrowed stereo (channels are closer to each other and the center)
      Tmp = cRSID_emulateSIDoutputStage(C64, C64.SID[1]!);
      if (C64.SID[1]!.Channel === CRChannel.CRSID_CHANNEL_LEFT) {
        Tmp2 = Tmp >> CRChannel.CRSID_CHANNELPANNING_DIVSHIFTS;
        Output.L = Tmp + Tmp2;
        Output.R = Tmp - Tmp2;
      } else if (C64.SID[1]!.Channel === CRChannel.CRSID_CHANNEL_RIGHT) {
        Tmp2 = Tmp >> CRChannel.CRSID_CHANNELPANNING_DIVSHIFTS;
        Output.R = Tmp + Tmp2;
        Output.L = Tmp - Tmp2;
      } else Output.L = Output.R = Tmp;
      if (C64.SID[2]!.BaseAddress !== 0) {
        Tmp = cRSID_emulateSIDoutputStage(C64, C64.SID[2]!);
        if (C64.SID[2]!.Channel === CRChannel.CRSID_CHANNEL_LEFT) {
          Tmp2 = Tmp >> CRChannel.CRSID_CHANNELPANNING_DIVSHIFTS;
          Output.L += Tmp + Tmp2;
          Output.R += Tmp - Tmp2;
        } else if (C64.SID[2]!.Channel === CRChannel.CRSID_CHANNEL_RIGHT) {
          Tmp2 = Tmp >> CRChannel.CRSID_CHANNELPANNING_DIVSHIFTS;
          Output.R += Tmp + Tmp2;
          Output.L += Tmp - Tmp2;
        } else {
          Output.L += Tmp;
          Output.R += Tmp;
        }
      }
      if (C64.SID[3]!.BaseAddress !== 0) {
        Tmp = cRSID_emulateSIDoutputStage(C64, C64.SID[3]!);
        if (C64.SID[3]!.Channel === CRChannel.CRSID_CHANNEL_LEFT) {
          Tmp2 = Tmp >> CRChannel.CRSID_CHANNELPANNING_DIVSHIFTS;
          Output.L += Tmp + Tmp2;
          Output.R += Tmp - Tmp2;
        } else if (C64.SID[3]!.Channel === CRChannel.CRSID_CHANNEL_RIGHT) {
          Tmp2 = Tmp >> CRChannel.CRSID_CHANNELPANNING_DIVSHIFTS;
          Output.R += Tmp + Tmp2;
          Output.L += Tmp - Tmp2;
        } else {
          Output.L += Tmp;
          Output.R += Tmp;
        }
      }
      if (C64.SID[4]!.BaseAddress !== 0) {
        Tmp = cRSID_emulateSIDoutputStage(C64, C64.SID[4]!);
        if (C64.SID[4]!.Channel === CRChannel.CRSID_CHANNEL_LEFT) {
          Tmp2 = Tmp >> CRChannel.CRSID_CHANNELPANNING_DIVSHIFTS;
          Output.L += Tmp + Tmp2;
          Output.R += Tmp - Tmp2;
        } else if (C64.SID[4]!.Channel === CRChannel.CRSID_CHANNEL_RIGHT) {
          Tmp2 = Tmp >> CRChannel.CRSID_CHANNELPANNING_DIVSHIFTS;
          Output.R += Tmp + Tmp2;
          Output.L += Tmp - Tmp2;
        } else {
          Output.L += Tmp;
          Output.R += Tmp;
        }
      }
      Output.L = divTrunc(Output.L, C64.Attenuation);
      Output.R = divTrunc(Output.R, C64.Attenuation);
      break;
    }
  }
  return Output;
}

// ---------------------------------------------------------------------------
// cRSID_emulateHQresampledSIDs (C64_SIDrouting.c:261-354) — oscillators,
// waveforms, filter and attenuation (main-volume) (called at samplerate-pace,
// but core at oversampled rate)
// ---------------------------------------------------------------------------

export function cRSID_emulateHQresampledSIDs(C64: CRC64instance): void {
  // AudioResamplerParameters (C64_SIDrouting.c:263-283)
  const FRACTIONAL_MUL = 1 << CRSpecC64.CRSID_RESAMPLER_FRACTIONAL_BITS; // 4096 $1000
  const FRACTIONAL_AND = FRACTIONAL_MUL - 1; // 4095 $0FFF
  const INTEGER_AND = -FRACTIONAL_MUL; // $F000
  const RESAMPLEBUFFER_SIZE = 16; // entries
  const RESAMPLEBUFFER_SIZE_MUL = RESAMPLEBUFFER_SIZE << CRSpecC64.CRSID_RESAMPLER_FRACTIONAL_BITS;
  const SINCWINDOW_PERIODS = CRSID_RESAMPLER_SINCWINDOW_PERIODS; // 12, //half-sines
  const SINCWINDOW_HALF1_LAST_PERIOD = SINCWINDOW_PERIODS / 2 - 1;
  const SINCPERIOD_SAMPLES = CRSID_RESAMPLER_SINCPERIOD_SAMPLES; // 128, //entries
  const SINCWINDOW_SIZE = SINCWINDOW_PERIODS * SINCPERIOD_SAMPLES; // 1536
  const SINCPERIOD_BITS = CRSID_BYTE_LOG2(SINCPERIOD_SAMPLES); // 7, //log2(SINCPERIOD_SAMPLES)
  const SINCPERIOD_BITS_REVERSE = CRSpecC64.CRSID_RESAMPLER_FRACTIONAL_BITS - SINCPERIOD_BITS;
  const SINCWINDOW_MAGNITUDE = CRSID_RESAMPLER_SINCWINDOW_MAGNITUDE; // (1 << SINCWINDOW_RESOLUTION) //SINCWINDOW_VALUE_MAX = 2048
  void CRAudioLevels;

  let Tmp: number, Left: number, Right: number;
  const Mono = C64.Stereo === 0 /* CRSID_CHANNELMODE_MONO */ ? 1 : 0;
  let ResampleBufWritePos = 0;

  const st = getResampleState(C64);
  const { ResampleBufferL, ResampleBufferR } = st;

  cRSID_precalculateHQoutputParameters(C64, C64.SID[1]!);
  if (C64.SID[2]!.BaseAddress !== 0) cRSID_precalculateHQoutputParameters(C64, C64.SID[2]!);
  if (C64.SID[3]!.BaseAddress !== 0) cRSID_precalculateHQoutputParameters(C64, C64.SID[3]!);
  if (C64.SID[4]!.BaseAddress !== 0) cRSID_precalculateHQoutputParameters(C64, C64.SID[4]!);

  while (st.ResampleBufPos < st.NextResampleBufPos) {
    ResampleBufWritePos = (st.ResampleBufPos >>> CRSpecC64.CRSID_RESAMPLER_FRACTIONAL_BITS) - SINCWINDOW_HALF1_LAST_PERIOD;
    if (ResampleBufWritePos < 0) ResampleBufWritePos += RESAMPLEBUFFER_SIZE;
    const SincWindowPos0 = SINCPERIOD_SAMPLES - ((st.ResampleBufPos & FRACTIONAL_AND) >>> SINCPERIOD_BITS_REVERSE);

    if (Mono) {
      // mono
      Left = cRSID_emulateHQresampledSID(C64, C64.SID[1]!, CRSpecC64.CRSID_OVERSAMPLING_CYCLES); // .Mix;
      if (C64.SID[2]!.BaseAddress !== 0) Left += cRSID_emulateHQresampledSID(C64, C64.SID[2]!, CRSpecC64.CRSID_OVERSAMPLING_CYCLES);
      if (C64.SID[3]!.BaseAddress !== 0) Left += cRSID_emulateHQresampledSID(C64, C64.SID[3]!, CRSpecC64.CRSID_OVERSAMPLING_CYCLES);
      if (C64.SID[4]!.BaseAddress !== 0) Left += cRSID_emulateHQresampledSID(C64, C64.SID[4]!, CRSpecC64.CRSID_OVERSAMPLING_CYCLES);
      // Right = Left;
      let SincWindowPos = SincWindowPos0;
      while (SincWindowPos < SINCWINDOW_SIZE) {
        // Resampling subsequent stereo samples to output-sample-buffer
        ResampleBufferL[ResampleBufWritePos]! += divTrunc(Left * SincWindow[SincWindowPos]!, SINCWINDOW_MAGNITUDE);
        ++ResampleBufWritePos;
        if (ResampleBufWritePos >= RESAMPLEBUFFER_SIZE) ResampleBufWritePos = 0;
        SincWindowPos += SINCPERIOD_SAMPLES;
      }
    } else {
      // stereo
      Tmp = cRSID_emulateHQresampledSID(C64, C64.SID[1]!, CRSpecC64.CRSID_OVERSAMPLING_CYCLES);
      if (C64.SID[1]!.Channel === CRChannel.CRSID_CHANNEL_LEFT) {
        Left = Tmp * 2;
        Right = 0;
      } else if (C64.SID[1]!.Channel === CRChannel.CRSID_CHANNEL_RIGHT) {
        Right = Tmp * 2;
        Left = 0;
      } else Left = Right = Tmp;
      if (C64.SID[2]!.BaseAddress !== 0) {
        Tmp = cRSID_emulateHQresampledSID(C64, C64.SID[2]!, CRSpecC64.CRSID_OVERSAMPLING_CYCLES);
        if (C64.SID[2]!.Channel === CRChannel.CRSID_CHANNEL_LEFT) Left += Tmp * 2;
        else if (C64.SID[2]!.Channel === CRChannel.CRSID_CHANNEL_RIGHT) Right += Tmp * 2;
        else {
          Left += Tmp;
          Right += Tmp;
        }
      }
      if (C64.SID[3]!.BaseAddress !== 0) {
        Tmp = cRSID_emulateHQresampledSID(C64, C64.SID[3]!, CRSpecC64.CRSID_OVERSAMPLING_CYCLES);
        if (C64.SID[3]!.Channel === CRChannel.CRSID_CHANNEL_LEFT) Left += Tmp * 2;
        else if (C64.SID[3]!.Channel === CRChannel.CRSID_CHANNEL_RIGHT) Right += Tmp * 2;
        else {
          Left += Tmp;
          Right += Tmp;
        }
      }
      if (C64.SID[4]!.BaseAddress !== 0) {
        Tmp = cRSID_emulateHQresampledSID(C64, C64.SID[4]!, CRSpecC64.CRSID_OVERSAMPLING_CYCLES);
        if (C64.SID[4]!.Channel === CRChannel.CRSID_CHANNEL_LEFT) Left += Tmp * 2;
        else if (C64.SID[4]!.Channel === CRChannel.CRSID_CHANNEL_RIGHT) Right += Tmp * 2;
        else {
          Left += Tmp;
          Right += Tmp;
        }
      }
      let SincWindowPos = SincWindowPos0;
      while (SincWindowPos < SINCWINDOW_SIZE) {
        // Resampling subsequent stereo samples to output-sample-buffer
        ResampleBufferL[ResampleBufWritePos]! += divTrunc(Left * SincWindow[SincWindowPos]!, SINCWINDOW_MAGNITUDE);
        ResampleBufferR[ResampleBufWritePos]! += divTrunc(Right * SincWindow[SincWindowPos]!, SINCWINDOW_MAGNITUDE);
        ++ResampleBufWritePos;
        if (ResampleBufWritePos >= RESAMPLEBUFFER_SIZE) ResampleBufWritePos = 0;
        SincWindowPos += SINCPERIOD_SAMPLES;
      }
    }

    st.ResampleBufPos += C64.OversampleClockRatio;
  }

  if (st.ResampleBufPos >= RESAMPLEBUFFER_SIZE_MUL) st.ResampleBufPos -= RESAMPLEBUFFER_SIZE_MUL;
  st.NextResampleBufPos = (st.ResampleBufPos & INTEGER_AND) + FRACTIONAL_MUL;
  C64.ResampledOutput.L = divTrunc(ResampleBufferL[ResampleBufWritePos]!, C64.OversampleClockRatioReciproc);
  ResampleBufferL[ResampleBufWritePos] = 0;
  if (!Mono) {
    // stereo
    C64.ResampledOutput.R = divTrunc(ResampleBufferR[ResampleBufWritePos]!, C64.OversampleClockRatioReciproc);
    ResampleBufferR[ResampleBufWritePos] = 0;
  }
}

interface ResampleState {
  ResampleBufPos: number;
  NextResampleBufPos: number;
  ResampleBufferL: Int32Array; // [16]
  ResampleBufferR: Int32Array; // [16]
}
const resampleStates = new WeakMap<object, ResampleState>();
function getResampleState(C64: CRC64instance): ResampleState {
  let st = resampleStates.get(C64);
  if (!st) {
    st = {
      ResampleBufPos: 0,
      NextResampleBufPos: 1 << CRSpecC64.CRSID_RESAMPLER_FRACTIONAL_BITS,
      ResampleBufferL: new Int32Array(16),
      ResampleBufferR: new Int32Array(16),
    };
    resampleStates.set(C64, st);
  }
  return st;
}

// ---------------------------------------------------------------------------
// cRSID_emulateHQresampledSIDoutputs (C64_SIDrouting.c:356-375)
// ---------------------------------------------------------------------------

export function cRSID_emulateHQresampledSIDoutputs(C64: CRC64instance): CRSIDOutput {
  const Output: CRSIDOutput = { L: 0, R: 0 };

  cRSID_emulateHQresampledSIDdigi(C64, C64.SID[1]!, C64.ResampledOutput);
  if (C64.SID[2]!.BaseAddress !== 0) cRSID_emulateHQresampledSIDdigi(C64, C64.SID[2]!, C64.ResampledOutput);
  if (C64.SID[3]!.BaseAddress !== 0) cRSID_emulateHQresampledSIDdigi(C64, C64.SID[3]!, C64.ResampledOutput);
  if (C64.SID[4]!.BaseAddress !== 0) cRSID_emulateHQresampledSIDdigi(C64, C64.SID[4]!, C64.ResampledOutput);

  Output.L = divTrunc(C64.ResampledOutput.L, C64.Attenuation);
  Output.R =
    C64.Stereo >= 1 /* CRSID_CHANNELMODE_STEREO */
      ? divTrunc(C64.ResampledOutput.R, C64.Attenuation)
      : Output.L;

  return Output;
}

export { cRSID_playPSIDdigi } from './psiddigi.js';

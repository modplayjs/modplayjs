// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Bitti09 — modplayjs contributors
// Ported from: cRSID 1.58 libcRSID/C64/C64.c — C64 instance creation,
// hardware setup, reset and the cycle-based emulation frame.
// (c) Hermit (Mihaly Horvath), license: WTF ("do what the frick you want").

import {
  CRSpecC64,
  CRChannel,
  CRAudioLevels,
  CRMemAddresses,
  type CRC64instance,
  type CRSIDOutput,
} from './c64types.js';
import { CRSID_FILEVERSION_WEBSID } from './host.js';
import { cRSID, cRSID_C64 } from './instance.js';
import { cRSID_initMem, cRSID_setROMcontent, cRSID_readMem } from './mem.js';
import { cRSID_initCPU, cRSID_emulateCPU, cRSID_handleCPUinterrupts } from './cpu.js';
import { cRSID_initCIAchip, cRSID_emulateCIA } from './cia.js';
import { cRSID_initSIDchip } from './sid.js';
import { cRSID_emulateVIC } from './vic.js';

// ---------------------------------------------------------------------------
// cRSID_createC64 (C64.c:17-43) — init a basic PAL C64 instance
// ---------------------------------------------------------------------------

/** enum SIDspecs (C64.c:22). */
const VOLUME_MAX = 0xf;
const CHANNELS = 3 + 1;
const SID_FULLVOLUME = CHANNELS * VOLUME_MAX; /* 64 */ // digi-channel is counted too in attenuation
void VOLUME_MAX;

/** cRSID_createC64 (C64.c:17-43). */
export function cRSID_createC64(C64: CRC64instance, samplerate: number): CRC64instance {
  let sr = samplerate;
  if (sr) C64.SampleRate = sr;
  else C64.SampleRate = sr = CRSpecC64.CRSID_DEFAULT_SAMPLERATE;
  C64.SampleClockRatio = ((CRSpecC64.CRSID_PAL_CPUCLK << CRSpecC64.CRSID_CLOCK_FRACTIONAL_BITS) / sr) | 0; // shifting (multiplication) enhances SampleClockRatio precision
  C64.OversampleClockRatio = ((sr << CRSpecC64.CRSID_RESAMPLER_FRACTIONAL_BITS) / CRSpecC64.CRSID_PAL_AUDIO_CLOCK) | 0; // round( SID_AUDIO_CLOCK / C64->SampleRate );
  C64.OversampleClockRatioReciproc = (CRSpecC64.CRSID_PAL_AUDIO_CLOCK / sr) | 0; // round?

  C64.SIDchipCount = C64.AudioThread_SIDchipCount = 1; // init audio-thread's version as well
  C64.Attenuation = Math.trunc(((SID_FULLVOLUME + 26) * CRAudioLevels.CRSID_PRESAT_ATT_NOM) /
    (CRAudioLevels.CRSID_PRESAT_ATT_DENOM * CRAudioLevels.CRSID_WAVGEN_PREDIV)); // C integer division
  cRSID_createSIDchip(C64, C64.SID[1]!, 8580, CRChannel.CRSID_CHANNEL_BOTH, 0xd400); // default C64 setup with only 1 SID and 2 CIAs and 1 VIC
  cRSID_createCIAchip(C64, C64.CIA[1]!, 0xdc00);
  cRSID_createCIAchip(C64, C64.CIA[2]!, 0xdd00);
  cRSID_createVICchip(C64, 0xd000);
  cRSID_generateMemoryBankPointers(C64);
  // if(cRSID.RealSIDmode) {
  cRSID_setROMcontent(C64); //no KERNAL/BASIC ROM is set, but fake content must be used for extra compatibility

  cRSID_initC64(C64);
  return C64;
}

// imported late to avoid a cycle at module-eval time (C has the same
// file-include ordering: MEM.c functions are used above)
import { cRSID_createSIDchip } from './sid.js';
import { cRSID_createCIAchip } from './cia.js';
import { cRSID_createVICchip } from './vic.js';
import { cRSID_generateMemoryBankPointers } from './mem.js';

// ---------------------------------------------------------------------------
// cRSID_setSIDmodels (C64.c:46-80) — based on SIDheader-data
// ---------------------------------------------------------------------------

export function cRSID_setSIDmodels(): void {
  const h = cRSID.SIDheader!;
  let SIDmodel: number;

  SIDmodel = (h.ModelFormatStandard & 0x30) >= 0x20 ? 8580 : 6581;
  cRSID_C64.SID[1]!.ChipModel = cRSID.SelectedSIDmodel ? cRSID.SelectedSIDmodel : SIDmodel;

  if (h.Version !== CRSID_FILEVERSION_WEBSID) {
    SIDmodel = h.ModelFormatStandard & 0xc0;
    if (SIDmodel) SIDmodel = SIDmodel >= 0x80 ? 8580 : 6581;
    else SIDmodel = cRSID_C64.SID[1]!.ChipModel;
    if (cRSID.SelectedSIDmodel) SIDmodel = cRSID.SelectedSIDmodel;
    cRSID_C64.SID[2]!.ChipModel = SIDmodel;

    SIDmodel = h.ModelFormatStandardH & 0x03;
    if (SIDmodel) SIDmodel = SIDmodel >= 0x02 ? 8580 : 6581;
    else SIDmodel = cRSID_C64.SID[1]!.ChipModel;
    if (cRSID.SelectedSIDmodel) SIDmodel = cRSID.SelectedSIDmodel;
    cRSID_C64.SID[3]!.ChipModel = SIDmodel;
  } else {
    SIDmodel = h.SID2flagsL & 0x30;
    if (SIDmodel) SIDmodel = SIDmodel >= 0x20 ? 8580 : 6581;
    else SIDmodel = cRSID_C64.SID[1]!.ChipModel;
    if (cRSID.SelectedSIDmodel) SIDmodel = cRSID.SelectedSIDmodel;
    cRSID_C64.SID[2]!.ChipModel = SIDmodel;

    SIDmodel = h.SID3flagsL & 0x30;
    if (SIDmodel) SIDmodel = SIDmodel >= 0x20 ? 8580 : 6581;
    else SIDmodel = cRSID_C64.SID[1]!.ChipModel;
    if (cRSID.SelectedSIDmodel) SIDmodel = cRSID.SelectedSIDmodel;
    cRSID_C64.SID[3]!.ChipModel = SIDmodel;

    SIDmodel = h.SID4flagsL & 0x30;
    if (SIDmodel) SIDmodel = SIDmodel >= 0x20 ? 8580 : 6581;
    else SIDmodel = cRSID_C64.SID[1]!.ChipModel;
    if (cRSID.SelectedSIDmodel) SIDmodel = cRSID.SelectedSIDmodel;
    cRSID_C64.SID[4]!.ChipModel = SIDmodel;
  }
}

// ---------------------------------------------------------------------------
// cRSID_setC64 (C64.c:82-153) — set hardware-parameters (Models, SIDs) for
// playback of loaded SID-tune
// ---------------------------------------------------------------------------

export function cRSID_setC64(): void {
  // enum C64clocks { C64_PAL_CPUCLK=985248, C64_NTSC_CPUCLK=1022727 }; (C64.c:85-88)
  const C64_PAL_SCANLINES = 312, C64_NTSC_SCANLINES = 263;
  const C64_PAL_SCANLINE_CYCLES = 63, C64_NTSC_SCANLINE_CYCLES = 65;
  // enum C64framerates { PAL_FRAMERATE = 50, NTSC_FRAMERATE = 60 }; //Hz

  const CPUspeeds = [CRSpecC64.CRSID_NTSC_CPUCLK, CRSpecC64.CRSID_PAL_CPUCLK];
  const ScanLines = [C64_NTSC_SCANLINES, C64_PAL_SCANLINES];
  const ScanLineCycles = [C64_NTSC_SCANLINE_CYCLES, C64_PAL_SCANLINE_CYCLES];
  const Attenuations = [
    // manually tweaked attenuation, increase for 2SID (to 43) and 3SID (to 137) and 4SID (200)
    Math.trunc(((SID_FULLVOLUME + 0) * CRAudioLevels.CRSID_PRESAT_ATT_NOM) /
      (CRAudioLevels.CRSID_PRESAT_ATT_DENOM * CRAudioLevels.CRSID_WAVGEN_PREDIV)), // CRSID_WAVGEN_PREDIV compensates for dividing by it in envelope-multiplier
    Math.trunc(((SID_FULLVOLUME + 26) * CRAudioLevels.CRSID_PRESAT_ATT_NOM) /
      (CRAudioLevels.CRSID_PRESAT_ATT_DENOM * CRAudioLevels.CRSID_WAVGEN_PREDIV)), // (64+26) = 90 *28/(16*1..16)=157..9
    Math.trunc(((SID_FULLVOLUME + 43) * CRAudioLevels.CRSID_PRESAT_ATT_NOM) /
      (CRAudioLevels.CRSID_PRESAT_ATT_DENOM * CRAudioLevels.CRSID_WAVGEN_PREDIV)), // (64+43) = 107 *28/(16*1..16)=187..11
    Math.trunc(((SID_FULLVOLUME + 137) * CRAudioLevels.CRSID_PRESAT_ATT_NOM) /
      (CRAudioLevels.CRSID_PRESAT_ATT_DENOM * CRAudioLevels.CRSID_WAVGEN_PREDIV)), // (64+137) = 201 *28/(16*1..16)=351..21
    Math.trunc(((SID_FULLVOLUME + 200) * CRAudioLevels.CRSID_PRESAT_ATT_NOM) /
      (CRAudioLevels.CRSID_PRESAT_ATT_DENOM * CRAudioLevels.CRSID_WAVGEN_PREDIV)), // (64+200) = 264 *28/(16*1..16)=462..28
  ];

  const h = cRSID.SIDheader!;
  let SIDchannel: number;

  cRSID.VideoStandard = ((h.ModelFormatStandard & 0x0c) >> 2) !== 2 ? 1 : 0;
  if (cRSID_C64.SampleRate === 0) cRSID_C64.SampleRate = 44100;
  cRSID_C64.CPUfrequency = CPUspeeds[cRSID.VideoStandard]!;
  cRSID_C64.SampleClockRatio = ((cRSID_C64.CPUfrequency << CRSpecC64.CRSID_CLOCK_FRACTIONAL_BITS) / cRSID_C64.SampleRate) | 0; // shifting (multiplication) enhances SampleClockRatio precision
  cRSID_C64.OversampleClockRatio = ((cRSID_C64.SampleRate << CRSpecC64.CRSID_RESAMPLER_FRACTIONAL_BITS) / CRSpecC64.CRSID_PAL_AUDIO_CLOCK) | 0; // round( SID_AUDIO_CLOCK / C64->SampleRate );
  cRSID_C64.OversampleClockRatioReciproc = (CRSpecC64.CRSID_PAL_AUDIO_CLOCK / cRSID_C64.SampleRate) | 0; // round?

  cRSID_C64.VIC.RasterLines = ScanLines[cRSID.VideoStandard]!;
  cRSID_C64.VIC.RasterRowCycles = ScanLineCycles[cRSID.VideoStandard]!;
  cRSID.FrameCycles = cRSID_C64.VIC.RasterLines * cRSID_C64.VIC.RasterRowCycles; // 1x speed tune with VIC Vertical-blank timing

  cRSID_C64.PrevRasterLine = -1; // so if $d012 is set once only don't disturb FrameCycleCnt

  cRSID_setSIDmodels();

  if (h.Version !== CRSID_FILEVERSION_WEBSID) {
    cRSID_C64.SID[1]!.Channel = CRChannel.CRSID_CHANNEL_LEFT;

    cRSID_createSIDchip(cRSID_C64, cRSID_C64.SID[2]!, cRSID_C64.SID[2]!.ChipModel, CRChannel.CRSID_CHANNEL_RIGHT, 0xd000 + h.SID2baseAddress * 16);

    cRSID_createSIDchip(cRSID_C64, cRSID_C64.SID[3]!, cRSID_C64.SID[3]!.ChipModel, CRChannel.CRSID_CHANNEL_BOTH, 0xd000 + h.SID3baseAddress * 16);

    // ensure disabling SID4 in non-WebSID format: (NULL-ing not preferred as it can overwrite stuff and cause Segfault in sample-thread)
    cRSID_C64.SID[4]!.BaseAddress = 0x0000;
    cRSID_C64.SID[4]!.BasePtr = cRSID_C64.SID[4]!.BasePtrRD = CRMemAddresses.CRSID_SID_SAFE_ADDRESS;
  } else {
    cRSID_C64.SID[1]!.Channel = h.ModelFormatStandardH & 0x40 ? CRChannel.CRSID_CHANNEL_RIGHT : CRChannel.CRSID_CHANNEL_LEFT;
    if (h.ModelFormatStandardH & 0x80) cRSID_C64.SID[1]!.Channel = CRChannel.CRSID_CHANNEL_BOTH; // my own proposal for 'middle' channel

    SIDchannel = h.SID2flagsL & 0x40 ? CRChannel.CRSID_CHANNEL_RIGHT : CRChannel.CRSID_CHANNEL_LEFT;
    if (h.SID2flagsL & 0x80) SIDchannel = CRChannel.CRSID_CHANNEL_BOTH;
    cRSID_createSIDchip(cRSID_C64, cRSID_C64.SID[2]!, cRSID_C64.SID[2]!.ChipModel, SIDchannel, 0xd000 + h.SID2baseAddress * 16);

    SIDchannel = h.SID3flagsL & 0x40 ? CRChannel.CRSID_CHANNEL_RIGHT : CRChannel.CRSID_CHANNEL_LEFT;
    if (h.SID3flagsL & 0x80) SIDchannel = CRChannel.CRSID_CHANNEL_BOTH;
    cRSID_createSIDchip(cRSID_C64, cRSID_C64.SID[3]!, cRSID_C64.SID[3]!.ChipModel, SIDchannel, 0xd000 + h.SID3baseAddress * 16);

    SIDchannel = h.SID4flagsL & 0x40 ? CRChannel.CRSID_CHANNEL_RIGHT : CRChannel.CRSID_CHANNEL_LEFT;
    if (h.SID4flagsL & 0x80) SIDchannel = CRChannel.CRSID_CHANNEL_BOTH;
    cRSID_createSIDchip(cRSID_C64, cRSID_C64.SID[4]!, cRSID_C64.SID[4]!.ChipModel, SIDchannel, 0xd000 + h.SID4baseAddress * 16);
  }

  cRSID_C64.SIDchipCount =
    1 + (cRSID_C64.SID[2]!.BaseAddress > 0 ? 1 : 0) + (cRSID_C64.SID[3]!.BaseAddress > 0 ? 1 : 0) + (cRSID_C64.SID[4]!.BaseAddress > 0 ? 1 : 0);
  if (cRSID_C64.SIDchipCount === 1) cRSID_C64.SID[1]!.Channel = CRChannel.CRSID_CHANNEL_BOTH;
  cRSID_C64.Attenuation = Attenuations[cRSID_C64.SIDchipCount]!;
}

// ---------------------------------------------------------------------------
// cRSID_initC64 (C64.c:155-178) — C64 Reset
// ---------------------------------------------------------------------------

const C64_RESET_VECTOR = 0xfffc;

export function cRSID_initC64(C64: CRC64instance): void {
  cRSID_initSIDchip(C64, C64.SID[1]!);
  cRSID_initCIAchip(C64, C64.CIA[1]!);
  cRSID_initCIAchip(C64, C64.CIA[2]!);
  /* cRSID_setROMcontent(); */ cRSID_initMem(C64);
  cRSID_initCPU(C64, (cRSID_readMem(C64, C64_RESET_VECTOR + 1) << 8) + cRSID_readMem(C64, C64_RESET_VECTOR));
  C64.IRQ = C64.NMI = 0;
  if (cRSID.HighQualitySID) {
    C64.SID[1]!.NonFiltedSample = C64.SID[1]!.FilterInputSample = 0;
    C64.SID[2]!.NonFiltedSample = C64.SID[2]!.FilterInputSample = 0;
    C64.SID[3]!.NonFiltedSample = C64.SID[3]!.FilterInputSample = 0;
    C64.SID[4]!.NonFiltedSample = C64.SID[4]!.FilterInputSample = 0;
    C64.SID[1]!.PrevNonFiltedSample = C64.SID[1]!.PrevFilterInputSample = 0;
    C64.SID[2]!.PrevNonFiltedSample = C64.SID[2]!.PrevFilterInputSample = 0;
    C64.SID[3]!.PrevNonFiltedSample = C64.SID[3]!.PrevFilterInputSample = 0;
    C64.SID[4]!.PrevNonFiltedSample = C64.SID[4]!.PrevFilterInputSample = 0;
  }
  C64.SampleCycleCnt = C64.OverSampleCycleCnt = 0;
}

// ---------------------------------------------------------------------------
// cRSID_emulateC64 (C64.c:179-286) — the per-sample emulation entry.
// ---------------------------------------------------------------------------

/** enum VUmeterParameters (C64.c:186). */

/** C integer division (truncates toward zero; JS `/` is not integer and
 *  `Math.floor` rounds down — not the same for negative operands). */
function divTrunc(a: number, b: number): number {
  return Math.trunc(a / b);
}

const VUMETER_LOWPASS_DIV = 16;
const VUMETER_DIVSHIFTS = 4 - CRAudioLevels.CRSID_WAVGEN_PRESHIFT;

export function cRSID_emulateC64(C64: CRC64instance): CRSIDOutput {
  let InstructionCycles: number;
  let VUmeterUpdateCounter = C64.VIC.RowCycleCnt & 0; // (C: static unsigned char, only used in the !CLImode VU-meter path; 1-in-256 update)

  // Cycle-based/-paced part of emulations:

  while (C64.SampleCycleCnt <= C64.SampleClockRatio) {
    if (!C64.RealSIDmode) {
      if (C64.FrameCycleCnt >= cRSID.FrameCycles) {
        C64.FrameCycleCnt -= cRSID.FrameCycles;
        if (C64.Finished) {
          // some tunes (e.g. Barbarian, A-Maze-Ing) don't always finish in 1 frame
          cRSID_initCPU(C64, cRSID.PlayAddress); // (PSID docs say bank-register should always be set for each call's region)
          C64.Finished = 0; // C64.SampleCycleCnt=0; //PSID workaround for some tunes (e.g. Galdrumway):
          if (cRSID.TimerSource === 0) C64.IObankRD[0xd019] = 0x81; // always simulate to player-calls that VIC-IRQ happened
          else C64.IObankRD[0xdc0d] = 0x83; // always simulate to player-calls that CIA TIMERA/TIMERB-IRQ happened
        }
      }
      if (C64.Finished === 0) {
        InstructionCycles = cRSID_emulateCPU(C64);
        if (InstructionCycles >= 0xfe) {
          InstructionCycles = 6;
          C64.Finished = 1;
        }
      } else InstructionCycles = 7; // idle between player-calls
      C64.FrameCycleCnt += InstructionCycles;
      C64.IObankRD[0xdc04] = (C64.IObankRD[0xdc04]! + InstructionCycles) & 0xff; // very simple CIA1 TimerA simulation for PSID (e.g. Delta-Mix_E-Load_loader)
    } else {
      // RealSID emulations:
      if (cRSID_handleCPUinterrupts(C64)) {
        C64.Finished = 0;
        InstructionCycles = 7;
      } else if (C64.Finished === 0) {
        InstructionCycles = cRSID_emulateCPU(C64);
        if (InstructionCycles >= 0xfe) {
          /* if (InstructionCycles!=0xFE && !(C64.CPU.ST&I)) */
          C64.Finished = 1;
          InstructionCycles = 6;
        }
      } else InstructionCycles = 7; // idle between IRQ-calls
      C64.IRQ = C64.NMI = 0; // prepare for collecting IRQ sources
      C64.IRQ |= cRSID_emulateCIA(C64, C64.CIA[1]!, InstructionCycles);
      C64.NMI |= cRSID_emulateCIA(C64, C64.CIA[2]!, InstructionCycles);
      C64.IRQ |= cRSID_emulateVIC(C64, InstructionCycles);
    }

    C64.SampleCycleCnt += InstructionCycles << CRSpecC64.CRSID_CLOCK_FRACTIONAL_BITS;

    cRSID_emulateADSRs(C64, C64.SID[1]!, InstructionCycles);
    if (C64.SID[2]!.BaseAddress !== 0) cRSID_emulateADSRs(C64, C64.SID[2]!, InstructionCycles);
    if (C64.SID[3]!.BaseAddress !== 0) cRSID_emulateADSRs(C64, C64.SID[3]!, InstructionCycles);
    if (C64.SID[4]!.BaseAddress !== 0) cRSID_emulateADSRs(C64, C64.SID[4]!, InstructionCycles);
  } // end of 1MHz cycle-based emulations (CPU, VIC, CIA, ADSR)
  C64.SampleCycleCnt -= C64.SampleClockRatio;

  if (C64.HighQualitySID) {
    // oversampled waveform-generation (although delayed ~22 cycles (~5 instructions) compared to CPU, shouldn't cause many issues (apart from cycle-exact SID-routines reading OSC3))
    if (C64.HighQualityResampler) cRSID_emulateHQresampledSIDs(C64); // high-quality but more CPU-hungry Sinc-based resampler (decimator)
    else cRSID_emulateOversampledSIDwaves(C64); // fast simple (but lower-quality) averager (box-filter) resampler
  }

  // Samplerate-based/-paced part of emulations:

  if (!C64.RealSIDmode) {
    // some PSID tunes use CIA TOD-clock (e.g. Kawasaki Synthesizer Demo)
    --C64.TenthSecondCnt;
    if (C64.TenthSecondCnt <= 0) {
      C64.TenthSecondCnt = C64.SampleRate / 10;
      ++C64.IObankRD[0xdc08]!;
      if (C64.IObankRD[0xdc08]! >= 10) {
        C64.IObankRD[0xdc08] = 0;
        ++C64.IObankRD[0xdc09]!;
        // if (C64.IObankRD[0xDC09]%… (C source comment block truncated here too)
      }
    }
  }
  if (C64.SecondCnt < C64.SampleRate) ++C64.SecondCnt;
  else {
    C64.SecondCnt = 0;
    if (cRSID.PlayTime < 3600) ++cRSID.PlayTime;
  }

  let Output: CRSIDOutput;
  if (C64.HighQualitySID) {
    // SID output-stages and mono/stereo handling for High-Quality SID-emulation
    Output = C64.HighQualityResampler ? cRSID_emulateHQresampledSIDoutputs(C64) : cRSID_emulateOversampledSIDoutputs(C64);
  } else Output = cRSID_emulateLightSIDs(C64); // with special lightweight waveform-antialiasing code

  // Output.L /= cRSID_C64.Attenuation (moved to the routing functions, as in C)

  if (!cRSID.CLImode && !++VUmeterUpdateCounter) {
    // average level (for VU-meter)
    C64.SID[1]!.Level += divTrunc((Math.abs(C64.SID[1]!.Output) >> VUMETER_DIVSHIFTS) - C64.SID[1]!.Level, VUMETER_LOWPASS_DIV); // 16; //4; //1024;
    if (C64.SID[2]!.BaseAddress !== 0)
      C64.SID[2]!.Level += divTrunc((Math.abs(C64.SID[2]!.Output) >> VUMETER_DIVSHIFTS) - C64.SID[2]!.Level, VUMETER_LOWPASS_DIV); // 16; //1024;
    if (C64.SID[3]!.BaseAddress !== 0)
      C64.SID[3]!.Level += divTrunc((Math.abs(C64.SID[3]!.Output) >> VUMETER_DIVSHIFTS) - C64.SID[3]!.Level, VUMETER_LOWPASS_DIV); // 16; //1024;
    if (C64.SID[4]!.BaseAddress !== 0)
      C64.SID[4]!.Level += divTrunc((Math.abs(C64.SID[4]!.Output) >> VUMETER_DIVSHIFTS) - C64.SID[4]!.Level, VUMETER_LOWPASS_DIV); // 16; //1024;
  }

  return Output;
}

// ---------------------------------------------------------------------------
// The SID-routing functions (C64_SIDrouting.c) live in sidoscwaves-routing;
// imported here (C includes C64_SIDrouting.c after C64.c's own functions).
// ---------------------------------------------------------------------------
import { cRSID_emulateLightSIDs, cRSID_emulateOversampledSIDwaves, cRSID_emulateOversampledSIDoutputs, cRSID_emulateHQresampledSIDs, cRSID_emulateHQresampledSIDoutputs } from './sidrouting.js';
import { cRSID_emulateADSRs } from './sidadsr.js';

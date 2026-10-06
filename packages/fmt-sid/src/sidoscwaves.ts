// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Bitti09 — modplayjs contributors
// Ported from: cRSID 1.58 libcRSID/C64/SID_OscWaves.c — SID oscillators and
// waveform generation (lightweight + high-quality/oversampled variants).
// (c) Hermit (Mihaly Horvath), license: WTF ("do what the frick you want").

import { CRSpecC64 } from './c64types.js';
import { CRAudioLevels } from './c64types.js';
import type { CRC64instance, CRSIDinstance, CRSIDwavOutput } from './c64types.js';
import { cRSID_C64 } from './instance.js';

import { CRSID_SawTriangle, CRSID_PulseTriangle, CRSID_PulseSawtooth, CRSID_PulseSawTriangle } from './combiwaves.js';

// ---------------------------------------------------------------------------
// getPW / getCombinedPW / combinedWF (SID_OscWaves.c:5-35)
// ---------------------------------------------------------------------------

/** getPW (SID_OscWaves.c:5-8) — PW=0000..FFF0 from SID-register (000..FFF). */
function getPW(C64: CRC64instance, channelptr: number): number {
  const W = C64.IObankWR;
  return ((((W[channelptr + 3]! & 0xf) << 8) | W[channelptr + 2]!) << 4) >>> 0;
}

/** getCombinedPW (SID_OscWaves.c:10-13) — PW=000..FFF (range for
 *  combined-waveform lookup) from SID-register (000..FFF). */
function getCombinedPW(C64: CRC64instance, channelptr: number): number {
  const W = C64.IObankWR;
  return (((W[channelptr + 3]! & 0xf) << 8) | W[channelptr + 2]!) & 0xffff;
}

// Specs of combinedWF (SID_OscWaves.c:14-28)
const COMBINEDWF_SAMPLE_RESOLUTION = 12;
const COMBINEDWF_FILT_RESOLUTION = 16; // bits
const COMBINEDWF_WAVE_RESOLUTION_8 = 8; /* COMBINEDWF_WAVE_RESOLUTION */
const CRSID_WAVE_RESOLUTION = 16; // bits
const COMBINEDWF_OSC_MSB_OFF_MASK = (1 << (COMBINEDWF_SAMPLE_RESOLUTION - 1)) - 1; // 0x7FFF
const COMBINEDWF_FILTMUL_MAX = (1 << COMBINEDWF_FILT_RESOLUTION) - 1; // 0xFFFF
const COMBINEDWF_FILT_FRACTION_SHIFTS = 16;
const COMBINEDWF_WAVE_SHIFTS8 = CRSID_WAVE_RESOLUTION - COMBINEDWF_WAVE_RESOLUTION_8; // 8

/** combinedWF (SID_OscWaves.c:14-35). */
function combinedWF(
  C64: CRC64instance,
  SID: CRSIDinstance,
  WFarray: Uint8Array,
  oscval: number,
  channel: number,
  channelptr: number,
): number {
  let Pitch: number;
  let Filt: number;
  if (SID.ChipModel === 6581 && WFarray !== CRSID_PulseTriangle) oscval &= COMBINEDWF_OSC_MSB_OFF_MASK; // 0x7FF; //0x7FFF;
  Pitch = C64.IObankWR[channelptr + 1] || 1; // avoid division by zero
  Filt = 0x7777 + divTrunc(0x8888, Pitch);
  SID.PrevWavData[channel] =
    (WFarray[oscval]! * Filt + SID.PrevWavData[channel]! * (COMBINEDWF_FILTMUL_MAX - Filt)) >>
    COMBINEDWF_FILT_FRACTION_SHIFTS; // 16;
  return (SID.PrevWavData[channel]! << COMBINEDWF_WAVE_SHIFTS8) >>> 0; // 8;
}

// ---------------------------------------------------------------------------
// cRSID_emulateSID_light (SID_OscWaves.c:37-260)
// ---------------------------------------------------------------------------

// WaveFormBits / ControlBits / FilterBits enums (SID_OscWaves.c:38-44)
const NOISE_BITVAL = 0x80, PULSE_BITVAL = 0x40, SAW_BITVAL = 0x20, TRI_BITVAL = 0x10;
const PULSAWTRI_VAL = 0x70, PULSAW_VAL = 0x60, PULTRI_VAL = 0x50, SAWTRI_VAL = 0x30;
const TEST_BITVAL = 0x08, RING_BITVAL = 0x04, SYNC_BITVAL = 0x02 /*, GATE_BITVAL = 0x01*/;
const OFF3_BITVAL = 0x80;

// Specs (SID_OscWaves.c:45-73)
const SID_CHANNEL_SPACING = 7;
const SID_CHANNEL_COUNT = 3;
const CHANNEL2_INDEX = 2 * SID_CHANNEL_SPACING;
const SID_CHANNELS_RANGE = SID_CHANNEL_SPACING * SID_CHANNEL_COUNT;
const SID_PHASEACCU_RESOLUTION = 24;
const OSC3_WAVE_RESOLUTION = 8; // bits
const PHASEACCU_SID__RANGE = 1 << SID_PHASEACCU_RESOLUTION; // 0x1000000, covers 24 bit value-range
const LRW_CR_CLOCK_FRAC = CRSpecC64.CRSID_CLOCK_FRACTIONAL_BITS;
const PHASEACCU_RANGE_L = Math.imul(PHASEACCU_SID__RANGE, 1 << LRW_CR_CLOCK_FRAC); // 0x10000000
const PHASEACCU_MAX_L = PHASEACCU_RANGE_L - 1;
const PHASEACCU_ANDMASK_L = PHASEACCU_MAX_L;
const PHASEACCU_MSB_BITVAL_L = Math.imul(PHASEACCU_SID__RANGE >> 1, 1 << LRW_CR_CLOCK_FRAC); // 0x8000000
const CRSID_WAVE_SHIFTS_L = SID_PHASEACCU_RESOLUTION - CRSID_WAVE_RESOLUTION + LRW_CR_CLOCK_FRAC; // 12
const CRSID_WAVE_RANGE = 1 << CRSID_WAVE_RESOLUTION;
const CRSID_WAVE_MAX = CRSID_WAVE_RANGE - 1; // 0xFFFF
const CRSID_WAVE_MASK = CRSID_WAVE_MAX;
const CRSID_WAVE_MID = CRSID_WAVE_RANGE / 2;
const CRSID_WAVE_MIN = 0x0000;
const SOUNDEMON_DIGI_SEEK_WAVEFORM = 0x01;
const SOUNDEMON_DIGI_RESOLUTION = 8;
const SOUNDEMON_DIGI_SHIFTS = CRSID_WAVE_RESOLUTION - SOUNDEMON_DIGI_RESOLUTION;
const SOUNDEMON_CARRIER_ELIMINATION_SAMPLECOUNT = 2; // 4,
const SID_NOISE_CLOCK_BITVAL = 0x100000;
const NOISE_CLOCK_L = Math.imul(SID_NOISE_CLOCK_BITVAL, 1 << LRW_CR_CLOCK_FRAC); // 0x1000000 — value of phaseaccu-bit clocking the Noise-LFSR
const COMBINEDWF_SAMPLE_SHIFTS_L = SID_PHASEACCU_RESOLUTION - COMBINEDWF_SAMPLE_RESOLUTION + LRW_CR_CLOCK_FRAC; // 16
const WAVE_OSC3_SHIFTS = CRSID_WAVE_RESOLUTION - OSC3_WAVE_RESOLUTION; // 8
const STEEPNESS_FRACTION_SHIFTS = 16;
const STEEPNESS_STEPLIMIT_L = Math.imul(256, 1 << LRW_CR_CLOCK_FRAC); // 4096 — high-pitch waveform anti-aliasing by frequency-dependent wave-edge steepness control
const SID_ENVELOPE_RESOLUTION = 8 /* bits */;
const SID_ENVELOPE_MAGNITUDE = 1 << SID_ENVELOPE_RESOLUTION; // 256
const ENVELOPE_MAGNITUDE_DIV = Math.imul(SID_ENVELOPE_MAGNITUDE, CRAudioLevels.CRSID_WAVGEN_PREDIV); // 256 * 1..16 = 256..4096
void CRSpecC64;

/** FilterSwitchVal (SID_OscWaves.c:75). */
const FilterSwitchVal: Uint8Array = new Uint8Array([1, 1, 1, 1, 1, 1, 1, 2, 2, 2, 2, 2, 2, 2, 4]);

/**
 * cRSID_emulateSID_light (SID_OscWaves.c:37-260) — lightweight (samplerate-
 * paced) oscillator + waveform generation; calls the output stage at the end
 * and returns the SID's master output.
 *
 * C static locals TestBit/Envelope/Steepness/PulsePeak are
 * write-before-read per use — locals here (same semantics).
 */
export function cRSID_emulateSID_light(C64: CRC64instance, SID: CRSIDinstance): number {
  const W = C64.IObankWR;
  const R = C64.IObankRD;

  let TestBit = 0;
  let Envelope = 0;
  let Tmp: number;
  let Feedback: number;
  let Utmp = 0;
  let WavGenOut = 0;
  let PW = 0;
  let PhaseAccuStep = 0;
  let MSB = 0;
  let Steepness = 0;
  let PulsePeak = 0;

  SID.NonFiltedSample = 0;
  SID.FilterInputSample = 0;
  const FilterSwitchReso = W[SID.BasePtr + 0x17]!;
  const VolumeBand = W[SID.BasePtr + 0x18]!;

  // Waveform generator (phase accumulator and waveform-selector)

  for (let Channel = 0; Channel < SID_CHANNELS_RANGE; Channel += SID_CHANNEL_SPACING) {
    const ChannelPtr = SID.BasePtr + Channel;

    const WF = W[ChannelPtr + 4]!;
    TestBit = (WF & TEST_BITVAL) !== 0 ? 1 : 0;
    const PhaseAccuIdx = Channel;

    PhaseAccuStep = Math.imul(((W[ChannelPtr + 1]! << 8) | W[ChannelPtr + 0]!) >>> 0, C64.SampleClockRatio) >>> 0; // SID->cRSID_C64.SampleClockRatio;
    if (TestBit || ((WF & SYNC_BITVAL) !== 0 && SID.SyncSourceMSBrise)) SID.PhaseAccu[PhaseAccuIdx] = 0;
    else {
      // stepping phase-accumulator (oscillator)
      SID.PhaseAccu[PhaseAccuIdx]! += PhaseAccuStep;
      if (SID.PhaseAccu[PhaseAccuIdx]! >= PHASEACCU_RANGE_L) SID.PhaseAccu[PhaseAccuIdx]! -= PHASEACCU_RANGE_L; // 0x10000000
    }
    SID.PhaseAccu[PhaseAccuIdx]! &= PHASEACCU_ANDMASK_L; // 0xFFFFFFF;
    MSB = SID.PhaseAccu[PhaseAccuIdx]! & PHASEACCU_MSB_BITVAL_L; // 0x8000000;
    SID.SyncSourceMSBrise = MSB > (SID.PrevPhaseAccu[PhaseAccuIdx]! & PHASEACCU_MSB_BITVAL_L) ? 1 : 0;

    switch (WF & 0xf0) {
      // switch-case encourages computed-goto compiler-optimization
      case NOISE_BITVAL: {
        // noise waveform
        Tmp = SID.NoiseLFSR[Channel]!; // clock LFSR all time if clockrate exceeds observable at given samplerate (last term):
        if (
          (SID.PhaseAccu[PhaseAccuIdx]! & NOISE_CLOCK_L) !== (SID.PrevPhaseAccu[PhaseAccuIdx]! & NOISE_CLOCK_L) ||
          PhaseAccuStep >= NOISE_CLOCK_L
        ) {
          Feedback = ((Tmp & 0x400000) ^ ((Tmp & 0x20000) << 5)) !== 0 ? 1 : 0;
          Tmp = Math.imul(Tmp, 2) | (Feedback | TestBit);
          Tmp &= 0x7fffff; // TEST-bit turns all bits in noise LFSR to 1 (on real SID slowly, in approx. 8000 microseconds ~ 300 samples)
          SID.NoiseLFSR[Channel] = Tmp;
        } // we simply zero output when other waveform is mixed with noise. On real SID LFSR continuously gets filled by zero and locks up. ($C1 waveform with pw<8 can keep it for a while.)
        WavGenOut =
          /* (WF & 0x70) ? 0 : */ ((Tmp & 0x100000) >>> 5) |
          (Tmp & 0x40000) >>> 4 |
          (Tmp & 0x4000) >>> 1 |
          ((Tmp & 0x800) << 1) |
          ((Tmp & 0x200) << 2) |
          ((Tmp & 0x20) << 5) |
          ((Tmp & 0x04) << 7) |
          ((Tmp & 0x01) << 8);
        break;
      }

      case PULSE_BITVAL: {
        // simple pulse
        PW = getPW(C64, ChannelPtr); // PW=0000..FFF0 from SID-register
        Utmp = PhaseAccuStep >>> (CRSID_WAVE_SHIFTS_L + 1);
        if (0 < PW && PW < Utmp) PW = Utmp; // Too thin pulsewidth? Correct...
        Utmp = Utmp ^ CRSID_WAVE_MAX;
        if (PW > Utmp) PW = Utmp; // Too thin pulsewidth? Correct it to a value representable at the current samplerate
        Utmp = SID.PhaseAccu[PhaseAccuIdx]! >>> CRSID_WAVE_SHIFTS_L; // 12;
        // simple pulse, most often used waveform, make it sound as clean as possible (by making it trapezoid)
        Steepness = PhaseAccuStep >= STEEPNESS_STEPLIMIT_L ? divTrunc(PHASEACCU_MAX_L, PhaseAccuStep) : CRSID_WAVE_MAX; // rising/falling-edge steepness (add/sub at samples)
        if (TestBit) WavGenOut = CRSID_WAVE_MAX; // 0xFFFF;
        else if (Utmp < PW) {
          // rising edge (interpolation)
          PulsePeak = Math.imul(CRSID_WAVE_MAX - PW, Steepness); // very thin pulses don't make a full swing between 0 and max but make a little spike
          if (PulsePeak > CRSID_WAVE_MAX) PulsePeak = CRSID_WAVE_MAX; // but adequately thick trapezoid pulses reach the maximum level
          Tmp = PulsePeak - (PW - Utmp) * Steepness; // draw the slope from the peak
          WavGenOut = Tmp < CRSID_WAVE_MIN ? CRSID_WAVE_MIN : Tmp; // but stop at 0-level
        } else {
          // falling edge (interpolation)
          PulsePeak = Math.imul(PW, Steepness); // very thin pulses don't make a full swing between 0 and max but make a little spike
          if (PulsePeak > CRSID_WAVE_MAX) PulsePeak = CRSID_WAVE_MAX; // adequately thick trapezoid pulses reach the maximum level
          Tmp = (CRSID_WAVE_MAX - Utmp) * Steepness - PulsePeak; // draw the slope from the peak
          WavGenOut = Tmp >= 0 ? CRSID_WAVE_MAX : Tmp; // but stop at max-level
        }
        break;
      }

      case PULSAWTRI_VAL: {
        // combined pulse (pulse+saw+triangle, waveform nearly identical to tri+saw)
        Utmp = SID.PhaseAccu[PhaseAccuIdx]! >>> COMBINEDWF_SAMPLE_SHIFTS_L; // 16;
        WavGenOut =
          Utmp >= getCombinedPW(C64, ChannelPtr) || TestBit
            ? combinedWF(C64, SID, CRSID_PulseSawTriangle, Utmp, Channel, ChannelPtr)
            : CRSID_WAVE_MIN; // 0;
        break;
      }
      case PULSAW_VAL: {
        // pulse+saw
        Utmp = SID.PhaseAccu[PhaseAccuIdx]! >>> COMBINEDWF_SAMPLE_SHIFTS_L; // 16;
        WavGenOut =
          Utmp >= getCombinedPW(C64, ChannelPtr)
            // || RARELY(TestBit)
            ? combinedWF(C64, SID, CRSID_PulseSawtooth, Utmp, Channel, ChannelPtr)
            : CRSID_WAVE_MIN; // 0;
        break;
      }
      case PULTRI_VAL: {
        // pulse+triangle
        Tmp = SID.PhaseAccu[PhaseAccuIdx]! ^ ((WF & RING_BITVAL) !== 0 ? SID.RingSourceMSB : 0);
        WavGenOut =
          (SID.PhaseAccu[PhaseAccuIdx]! >>> COMBINEDWF_SAMPLE_SHIFTS_L) >= getCombinedPW(C64, ChannelPtr) || TestBit
            ? combinedWF(C64, SID, CRSID_PulseTriangle, Tmp >>> COMBINEDWF_SAMPLE_SHIFTS_L, Channel, ChannelPtr)
            : CRSID_WAVE_MIN; // 0;
        break;
      }

      case SAWTRI_VAL: {
        // saw+triangle
        WavGenOut = combinedWF(C64, SID, CRSID_SawTriangle, SID.PhaseAccu[PhaseAccuIdx]! >>> COMBINEDWF_SAMPLE_SHIFTS_L, Channel, ChannelPtr);
        break;
      }
      case SAW_BITVAL: {
        // sawtooth
        WavGenOut = SID.PhaseAccu[PhaseAccuIdx]! >>> CRSID_WAVE_SHIFTS_L; // 12; (this row would be enough for simple but aliased-at-high-pitch saw)
        Steepness = (PhaseAccuStep >>> LRW_CR_CLOCK_FRAC) / 288;
        if (Steepness === 0) Steepness = 1; // avoid division by zero in next steps
        WavGenOut += Math.imul(WavGenOut, Steepness) >>> STEEPNESS_FRACTION_SHIFTS; // 1st half (rising edge) of asymmetric triangle-like saw waveform
        if (WavGenOut > CRSID_WAVE_MAX) WavGenOut = CRSID_WAVE_MAX - divTrunc((WavGenOut - CRSID_WAVE_RANGE) << STEEPNESS_FRACTION_SHIFTS, Steepness); // 2nd half (falling edge, reciprocal steepness
        break;
      }
      case TRI_BITVAL: {
        // triangle (this waveform has no harsh edges, so it doesn't suffer from strong aliasing at high pitches)
        if (!C64.RealSIDmode || SID.PrevSounDemonDigiWF[Channel]! <= 0) {
          // != SOUNDEMON_DIGI_SEEK_WAVEFORM
          Tmp = SID.PhaseAccu[PhaseAccuIdx]! ^ ((WF & RING_BITVAL) !== 0 ? SID.RingSourceMSB : 0);
          WavGenOut = (Tmp ^ (Tmp & PHASEACCU_MSB_BITVAL_L ? PHASEACCU_MAX_L : 0)) >>> (CRSID_WAVE_SHIFTS_L - 1); // 11;
        } // SounDemon digi hack: if previous waveform was 01, don't modify output in this round:
        else {
          WavGenOut = SID.PrevWavGenOut[Channel]!;
          --SID.PrevSounDemonDigiWF[Channel]!;
        } // (so carrier noise won't be heard due to non 1MHz emulation)
        break;
      }

      case 0x00: {
        // emulate waveform 00 floating wave-DAC (utilized by SounDemon digis)
        // (on real SID waveform00 decays after about 5 seconds, here we just simply keep the value to avoid clicks)
        // (Our jittery 'seeking' waveform=$01 part of SounDemon-digi is substituted directly by frequency-high register's value (as in SwinSID))
        if (C64.RealSIDmode && WF === SOUNDEMON_DIGI_SEEK_WAVEFORM) {
          WavGenOut = Math.imul(W[ChannelPtr + 1]!, 1 << SOUNDEMON_DIGI_SHIFTS) >>> 0;
          SID.PrevSounDemonDigiWF[Channel] = SOUNDEMON_CARRIER_ELIMINATION_SAMPLECOUNT;
        } else WavGenOut = SID.PrevWavGenOut[Channel]!;
        break;
      }
      default:
        WavGenOut = CRSID_WAVE_MIN;
        break; // noise plus pulse/saw/triangle mostly yields silence
    }
    // SID.PrevSounDemonDigiWF[Channel] = WF;

    WavGenOut &= CRSID_WAVE_MASK; // 0xFFFF;
    /* if (WF&0xF0) */ SID.PrevWavGenOut[Channel] = WavGenOut >>> 0; // emulate waveform 00 floating wave-DAC (utilized by SounDemon digis)
    // else WavGenOut = SID.PrevWavGenOut[Channel]; (on real SID waveform00 decays, we just simply keep the value to avoid clicks)
    SID.PrevPhaseAccu[PhaseAccuIdx] = SID.PhaseAccu[PhaseAccuIdx]!;
    SID.RingSourceMSB = MSB;

    // routing the channel signal to either the filter or the unfiltered
    // master output depending on filter-switch SID-registers
    Envelope = SID.ChipModel === 8580 ? SID.EnvelopeCounter[Channel]! : cRSID_ADSR_DAC_6581[SID.EnvelopeCounter[Channel]!]!;
    if (FilterSwitchReso & FilterSwitchVal[Channel]!) {
      SID.FilterInputSample += divTrunc((WavGenOut - CRSID_WAVE_MID) * Envelope, ENVELOPE_MAGNITUDE_DIV); // >> 8;
    } else if (Channel !== 14 || !(VolumeBand & OFF3_BITVAL)) {
      SID.NonFiltedSample += divTrunc((WavGenOut - CRSID_WAVE_MID) * Envelope, ENVELOPE_MAGNITUDE_DIV); // >> 8;
    }
  }
  // update readable SID1-registers (some SID tunes might use 3rd channel ENV3/OSC3 value as control)
  R[SID.BasePtrRD + 0x1b] = WavGenOut >>> WAVE_OSC3_SHIFTS; // OSC3, ENV3 (some players rely on it, unfortunately even for timing)
  R[SID.BasePtrRD + 0x1c] = SID.EnvelopeCounter[CHANNEL2_INDEX]!; // Envelope
  // cRSID_C64.IObankRD[SID->BaseAddress+0x1F] = (cRSID.SelectedSIDmodel==8580); — this doesn't exist in real SID but SID-Wizard code removes comment-marks and uses it as identification workaround

  return cRSID_emulateSIDoutputStage(C64, SID);
}


/** C integer division (truncates toward zero; JS `/` is not integer and
 *  `Math.floor` rounds down — not the same for negative operands). */
function divTrunc(a: number, b: number): number {
  return Math.trunc(a / b);
}

// re-export for the output stage (SID_Outputs.c include chain) to keep the
// same call-graph as C (SID.c includes SID_ADSR.c + SID_OscWaves.c +
// SID_Outputs.c)
import { cRSID_emulateSIDoutputStage } from './sidoutputs.js';
import { cRSID_ADSR_DAC_6581 } from './sidadsr.js';

// ---------------------------------------------------------------------------
// HQcombinedWF (SID_OscWaves.c:262-279) + cRSID_emulateHQwaves (…:281-445ish)
// ---------------------------------------------------------------------------

/** HQcombinedWF (SID_OscWaves.c:262-279). */
function HQcombinedWF(C64: CRC64instance, SID: CRSIDinstance, WFarray: Uint8Array, oscval: number): number {
  void C64;
  // Specs (SID_OscWaves.c:263-271) — same values as the light-variant ones 1:1
  if (SID.ChipModel === 6581 && WFarray !== CRSID_PulseTriangle) oscval &= COMBINEDWF_OSC_MSB_OFF_MASK; // 0x7FF;
  return (WFarray[oscval]! << COMBINEDWF_WAVE_SHIFTS8) >>> 0; // 8
}

// Specs T of cRSID_emulateHQwaves (SID_OscWaves.c:283-310)
const PHASEACCU_RANGE_H = PHASEACCU_SID__RANGE; // 0x1000000
const PHASEACCU_MAX_H = PHASEACCU_RANGE_H - 1;
const PHASEACCU_ANDMASK_H = PHASEACCU_MAX_H;
const PHASEACCU_MSB_BITVAL_H = PHASEACCU_RANGE_H >>> 1; // 0x800000
const CRSID_WAVE_SHIFTS_H = SID_PHASEACCU_RESOLUTION - CRSID_WAVE_RESOLUTION;
const SOUNDEMON_DIGI_SHIFTS_H = SOUNDEMON_DIGI_SHIFTS;
const SOUNDEMON_CARRIER_ELIMINATION_CYCLECOUNT = 24;
const COMBINEDWF_SAMPLE_SHIFTS_H = SID_PHASEACCU_RESOLUTION - COMBINEDWF_SAMPLE_RESOLUTION;
const NOISE_CLOCK_H = 0x100000;
void NOISE_CLOCK_H;
const _unused_h = [CRSID_WAVE_SHIFTS_H, SOUNDEMON_DIGI_SHIFTS_H, COMBINEDWF_SAMPLE_SHIFTS_H];
void _unused_h;

/** cRSID_emulateHQwaves (SID_OscWaves.c:281-445).
 *  C static locals TestBit/Envelope/SIDwavOutput are write-before-read per
 *  call — SIDwavOutput is returned, TestBit/Envelope are locals here. */
export function cRSID_emulateHQwaves(C64: CRC64instance, SID: CRSIDinstance, cycles: number): CRSIDwavOutput {
  const W = C64.IObankWR;
  const R = C64.IObankRD;

  let TestBit = 0;
  let Envelope = 0;
  let Tmp: number;
  let Feedback: number;
  let Utmp = 0;
  let PW = 0;
  void PW;
  let WavGenOut = 0;
  let PhaseAccuStep = 0;
  let MSB = 0;

  const SIDwavOutput: CRSIDwavOutput = { FilterInput: 0, NonFilted: 0 };
  void WAVE_OSC3_SHIFTS;

  const FilterSwitchReso = W[SID.BasePtr + 0x17]!;
  const VolumeBand = W[SID.BasePtr + 0x18]!;

  for (let Channel = 0; Channel < SID_CHANNELS_RANGE; Channel += SID_CHANNEL_SPACING) {
    const ChannelPtr = SID.BasePtr + Channel;

    const WF = W[ChannelPtr + 4]!;
    TestBit = (WF & TEST_BITVAL) !== 0 ? 1 : 0;
    const PhaseAccuIdx = Channel;

    PhaseAccuStep = Math.imul(((W[ChannelPtr + 1]! << 8) | W[ChannelPtr + 0]!) >>> 0, cycles) >>> 0; // oscillator pitch
    if (TestBit || ((WF & SYNC_BITVAL) !== 0 && SID.SyncSourceMSBrise)) SID.PhaseAccu[PhaseAccuIdx] = 0; // oscillator-sync
    else {
      // stepping phase-accumulator (oscillator)
      SID.PhaseAccu[PhaseAccuIdx]! += PhaseAccuStep;
      if (SID.PhaseAccu[PhaseAccuIdx]! >= PHASEACCU_RANGE_H) SID.PhaseAccu[PhaseAccuIdx]! -= PHASEACCU_RANGE_H; // 0x1000000;
    }
    SID.PhaseAccu[PhaseAccuIdx]! &= PHASEACCU_ANDMASK_H;
    MSB = SID.PhaseAccu[PhaseAccuIdx]! & PHASEACCU_MSB_BITVAL_H;
    SID.SyncSourceMSBrise = MSB > (SID.PrevPhaseAccu[PhaseAccuIdx]! & PHASEACCU_MSB_BITVAL_H) ? 1 : 0;

    switch (WF & 0xf0) {
      case NOISE_BITVAL: {
        // noise waveform
        Tmp = SID.NoiseLFSR[Channel]!; // clock LFSR all time if clockrate exceeds observable at given samplerate (last term):
        if ((SID.PhaseAccu[PhaseAccuIdx]! & NOISE_CLOCK_H) !== (SID.PrevPhaseAccu[PhaseAccuIdx]! & NOISE_CLOCK_H)) {
          Feedback = ((Tmp & 0x400000) ^ ((Tmp & 0x20000) << 5)) !== 0 ? 1 : 0;
          Tmp = Math.imul(Tmp, 2) | (Feedback | TestBit);
          Tmp &= 0x7fffff; // TEST-bit turns all bits in noise LFSR to 1 (on real SID slowly, in approx. 8000 microseconds ~ 300 samples)
          SID.NoiseLFSR[Channel] = Tmp;
        } // we simply zero output below when other waveform is mixed with noise. On real SID LFSR continuously gets filled by zero and locks up. ($C1 waveform with pw<8 can keep it for a while.)
        SID.PrevWavGenOut[Channel] =
          /* (WF & 0x70) ? 0 : */ ((Tmp & 0x100000) >>> 5) |
          (Tmp & 0x40000) >>> 4 |
          (Tmp & 0x4000) >>> 1 |
          ((Tmp & 0x800) << 1) |
          ((Tmp & 0x200) << 2) |
          ((Tmp & 0x20) << 5) |
          ((Tmp & 0x04) << 7) |
          ((Tmp & 0x01) << 8);
        break;
      }

      case PULSAWTRI_VAL: {
        // pulse+saw+triangle (waveform nearly identical to tri+saw)
        Utmp = SID.PhaseAccu[PhaseAccuIdx]! >>> COMBINEDWF_SAMPLE_SHIFTS_H; // 12;
        SID.PrevWavGenOut[Channel] =
          Utmp >= getCombinedPW(C64, ChannelPtr) || TestBit
            ? HQcombinedWF(C64, SID, CRSID_PulseSawTriangle, Utmp)
            : CRSID_WAVE_MIN; // 0;
        break;
      }
      case PULSAW_VAL: {
        // pulse+saw
        Utmp = SID.PhaseAccu[PhaseAccuIdx]! >>> COMBINEDWF_SAMPLE_SHIFTS_H; // 12;
        SID.PrevWavGenOut[Channel] =
          Utmp >= getCombinedPW(C64, ChannelPtr) || TestBit
            ? HQcombinedWF(C64, SID, CRSID_PulseSawtooth, Utmp)
            : CRSID_WAVE_MIN; // 0;
        break;
      }
      case PULTRI_VAL: {
        // pulse+triangle
        Tmp = SID.PhaseAccu[PhaseAccuIdx]! ^ ((WF & RING_BITVAL) !== 0 ? SID.RingSourceMSB : 0);
        SID.PrevWavGenOut[Channel] =
          (SID.PhaseAccu[PhaseAccuIdx]! >>> COMBINEDWF_SAMPLE_SHIFTS_H) >= getCombinedPW(C64, ChannelPtr) || TestBit
            ? HQcombinedWF(C64, SID, CRSID_PulseTriangle, Tmp >>> COMBINEDWF_SAMPLE_SHIFTS_H)
            : CRSID_WAVE_MIN; // 0;
        break;
      }

      case PULSE_BITVAL: {
        // simple pulse or pulse+combined
        SID.PrevWavGenOut[Channel] =
          (SID.PhaseAccu[PhaseAccuIdx]! >>> CRSID_WAVE_SHIFTS_H) >= getPW(C64, ChannelPtr) || TestBit
            ? CRSID_WAVE_MAX
            : CRSID_WAVE_MIN; // 0xFFFF : 0;
        break;
      }
      case SAWTRI_VAL: {
        // saw+triangle
        SID.PrevWavGenOut[Channel] = HQcombinedWF(C64, SID, CRSID_SawTriangle, SID.PhaseAccu[PhaseAccuIdx]! >>> COMBINEDWF_SAMPLE_SHIFTS_H);
        break;
      }
      case SAW_BITVAL: {
        // sawtooth
        SID.PrevWavGenOut[Channel] = SID.PhaseAccu[PhaseAccuIdx]! >>> CRSID_WAVE_SHIFTS_H; // 8;
        // if (WF & TRI_BITVAL) WavGenOut = HQcombinedWF( SID, cRSID_SawTriangle, WavGenOut ); //saw+triangle
        break;
      }
      case TRI_BITVAL: {
        // triangle (this waveform has no harsh edges, so it doesn't suffer from strong aliasing at high pitches)
        if (!C64.RealSIDmode || SID.PrevSounDemonDigiWF[Channel]! <= 0) {
          // != SOUNDEMON_DIGI_SEEK_WAVEFORM
          Tmp = SID.PhaseAccu[PhaseAccuIdx]! ^ ((WF & RING_BITVAL) !== 0 ? SID.RingSourceMSB : 0);
          SID.PrevWavGenOut[Channel] =
            (((Tmp ^ (Tmp & PHASEACCU_MSB_BITVAL_H ? PHASEACCU_MAX_H : 0)) >>> (CRSID_WAVE_SHIFTS_H - 1)) & CRSID_WAVE_MASK) >>> 0; // 0xFFFF;
        } // SounDemon digi hack: if previous waveform was 01, don't modify output in these rounds:
        else {
          SID.PrevSounDemonDigiWF[Channel]! -= cycles; // (so carrier noise won't be heard in Fanta_in_Space.sid/etc due to non-1MHz emulation)
        }
        break;
      }

      case 0x00: {
        // emulate waveform 00 floating wave-DAC (utilized by SounDemon digis)
        // (on real SID waveform00 decays, we just simply keep the value to avoid clicks)
        // (Our jittery 'seeking' waveform=$01 part of SounDemon-digi is substituted directly by frequency-high register's value (as in SwinSID))
        if (C64.RealSIDmode && WF === SOUNDEMON_DIGI_SEEK_WAVEFORM) {
          SID.PrevWavGenOut[Channel] = Math.imul(W[ChannelPtr + 1]!, 1 << SOUNDEMON_DIGI_SHIFTS_H) >>> 0;
          SID.PrevSounDemonDigiWF[Channel] = SOUNDEMON_CARRIER_ELIMINATION_CYCLECOUNT;
        }
        break;
      }
      default:
        SID.PrevWavGenOut[Channel] = CRSID_WAVE_MIN; // noise with pulse/saw/triangle mostly yields silence
        break;
    }
    WavGenOut = SID.PrevWavGenOut[Channel]!;

    SID.PrevPhaseAccu[PhaseAccuIdx] = SID.PhaseAccu[PhaseAccuIdx]!;
    SID.RingSourceMSB = MSB;

    // routing the channel signal to either the filter or the unfiltered
    // master output depending on filter-switch SID-registers
    Envelope = SID.ChipModel === 8580 ? SID.EnvelopeCounter[Channel]! : cRSID_ADSR_DAC_6581[SID.EnvelopeCounter[Channel]!]!;
    if (FilterSwitchReso & FilterSwitchVal[Channel]!) {
      SIDwavOutput.FilterInput += divTrunc((WavGenOut - CRSID_WAVE_MID) * Envelope, ENVELOPE_MAGNITUDE_DIV); // >> 8;
    } else if (Channel !== 14 || !(VolumeBand & OFF3_BITVAL)) {
      SIDwavOutput.NonFilted += divTrunc((WavGenOut - CRSID_WAVE_MID) * Envelope, ENVELOPE_MAGNITUDE_DIV); // >> 8;
    }
  }
  // update readable SID1-registers (some SID tunes might use 3rd channel ENV3/OSC3 value as control)
  R[SID.BasePtrRD + 0x1b] = WavGenOut >>> WAVE_OSC3_SHIFTS; // OSC3, ENV3 (some players rely on it, unfortunately even for timing)
  R[SID.BasePtrRD + 0x1c] = SID.EnvelopeCounter[CHANNEL2_INDEX]!; // Envelope
  // cRSID_C64.IObankRD[SID->BaseAddress+0x1F] = (cRSID.SelectedSIDmodel==8580); — this doesn't exist in real SID but SID-Wizard code removes comment-marks and uses it as identification workaround

  // if (filter) {
  // cRSID_emulateHQresampledSIDfilter( SID );
  // SIDwavOutput.Mix = (SIDwavOutput.NonFilted + FilterOutput) * (VolumeBand & 0xF);
  // }

  return SIDwavOutput; // NonFilted; //+FilterInput; //WavGenOut; //(*PhaseAccuPtr)>>8;
}

// The `cRSID_C64` import is used by C's static function-scope emulations via
// the file-global object; the TS port passes C64 explicitly everywhere — the
// import is kept for the (rare) places that read the global in parity notes.
void cRSID_C64;

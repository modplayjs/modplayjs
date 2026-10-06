// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Bitti09 — modplayjs contributors
// Ported from: cRSID 1.58 libcRSID/C64/C64.h (structs and constants)
// (c) Hermit (Mihaly Horvath), license: WTF ("do what the frick you want").
import {
  CRSID_OVERSAMPLING_RATIO,
} from './config.js';

// ---------------------------------------------------------------------------
// cRSID_BYTE_LOG2 (C64.h:10) — C macro, used by the HQ-resampler parameter
// block. JS-only helper; same value table.
// ---------------------------------------------------------------------------

export function CRSID_BYTE_LOG2(x: number): number {
  return x < 2 ? 0 : x < 4 ? 1 : x < 8 ? 2 : x < 16 ? 3 : x < 32 ? 4 : x < 64 ? 5 : x < 128 ? 6 : x < 256 ? 7 : 8;
}

// ---------------------------------------------------------------------------
// cRSID_Specifications__C64 (C64.h:12-23)
// ---------------------------------------------------------------------------

export enum CRSpecC64 {
  CRSID_PAL_CPUCLK = 985248,
  CRSID_NTSC_CPUCLK = 1022727,
  CRSID_DEFAULT_SAMPLERATE = 44100,
  CRSID_CLOCK_FRACTIONAL_BITS = 4,
  CRSID_RESAMPLER_FRACTIONAL_BITS = 12,
  // CRSID_OVERSAMPLING_RATIO comes from Config.h (runtime const import).
  CRSID_OVERSAMPLING_CYCLES = ((CRSID_PAL_CPUCLK / CRSID_DEFAULT_SAMPLERATE) / CRSID_OVERSAMPLING_RATIO) | 0,
  CRSID_PAL_AUDIO_CLOCK = ((CRSID_PAL_CPUCLK / CRSID_OVERSAMPLING_CYCLES) | 0),
  CRSID_NTSC_AUDIO_CLOCK = ((CRSID_NTSC_CPUCLK / CRSID_OVERSAMPLING_CYCLES) | 0),
  CRSID_SIDCOUNT_MAX = 4,
  CRSID_CIACOUNT = 2,
}

// ---------------------------------------------------------------------------
// cRSID_Channels (C64.h:24)
// ---------------------------------------------------------------------------

export enum CRChannel {
  CRSID_CHANNEL_LEFT = 1,
  CRSID_CHANNEL_RIGHT = 2,
  CRSID_CHANNEL_BOTH = 3,
  CRSID_CHANNELPANNING_DIVSHIFTS = 2,
}

// ---------------------------------------------------------------------------
// cRSID_AudioLevels (C64.h:25-33)
// ---------------------------------------------------------------------------

export enum CRAudioLevels {
  /** attenuates wave-generator output not to overdrive resampler-input. */
  CRSID_WAVGEN_PRESHIFT = 3,
  /** shift-value can be 1..4 (1..16x division). */
  CRSID_WAVGEN_PREDIV = (1 << CRSID_WAVGEN_PRESHIFT),
  /** increase cRSID.Attenuation by nom/denom ratio (adjusting of signal-strength
   *  before saturating sound to 16bit signed short to avoid strong
   *  multi-channel filter distortions). */
  CRSID_PRESAT_ATT_NOM = 20,
  CRSID_PRESAT_ATT_DENOM = 16,
}

// ---------------------------------------------------------------------------
// cRSID_MemAddresses (C64.h:34-40)
// ---------------------------------------------------------------------------

export enum CRMemAddresses {
  CRSID_C64_MEMBANK_SIZE = 0x10000,
  CRSID_MEMBANK_SAFETY_ZONE_SIZE = 0x100,
  CRSID_SID_SAFETY_ZONE_SIZE = 0x100,
  CRSID_MEMBANK_SIZE = (CRSID_C64_MEMBANK_SIZE + CRSID_MEMBANK_SAFETY_ZONE_SIZE + CRSID_SID_SAFETY_ZONE_SIZE),
  CRSID_SID_SAFE_ADDRESS = (CRSID_C64_MEMBANK_SIZE + CRSID_MEMBANK_SAFETY_ZONE_SIZE),
}

// ---------------------------------------------------------------------------
// cRSID_CPUinstance (C64.h:42-53)
// ---------------------------------------------------------------------------

export interface CRCPUinstance {
  PC: number;
  /** short int in C (signed). */
  A: number;
  SP: number;
  X: number;
  Y: number;
  /** STATUS-flags: N V - B D I Z C. */
  ST: number;
  // extra temporary variables:
  Addr: number;
  Cycles: number;
  SamePage: number;
  /** used for NMI leading edge detection. */
  PrevNMI: number;
}

export function createCPUinstance(): CRCPUinstance {
  return { PC: 0, A: 0, SP: 0, X: 0, Y: 0, ST: 0, Addr: 0, Cycles: 0, SamePage: 0, PrevNMI: 0 };
}

// ---------------------------------------------------------------------------
// cRSID_CIAinstance (C64.h:55-62)
// ---------------------------------------------------------------------------

export interface CRCIAinstance {
  /** old or new CIA? (have 1 cycle difference in cases) */
  ChipModel: number;
  /** CIA-baseaddress location in C64-memory (IO). */
  BaseAddress: number;
  /** CIA-baseaddress location in host's memory for writing — in the TS port
   *  these become numeric offsets into the shared IO bank arrays. */
  BasePtrWR: number;
  BasePtrRD: number;
}

export function createCIAinstance(): CRCIAinstance {
  return { ChipModel: 0, BaseAddress: 0, BasePtrWR: 0, BasePtrRD: 0 };
}

// ---------------------------------------------------------------------------
// cRSID_VICinstance (C64.h:64-74)
// ---------------------------------------------------------------------------

export interface CRVICinstance {
  /** (timing differences between models?) */
  ChipModel: number;
  /** VIC-baseaddress location in C64-memory (IO). */
  BaseAddress: number;
  BasePtrWR: number;
  BasePtrRD: number;
  RasterLines: number;
  RasterRowCycles: number;
  RowCycleCnt: number;
}

export function createVICinstance(): CRVICinstance {
  return { ChipModel: 0, BaseAddress: 0, BasePtrWR: 0, BasePtrRD: 0, RasterLines: 0, RasterRowCycles: 0, RowCycleCnt: 0 };
}

// ---------------------------------------------------------------------------
// cRSID_SIDinstance (C64.h:76-133)
// ---------------------------------------------------------------------------

export interface CRSIDinstance {
  // SID-chip data:
  /** values: 8580 / 6581. */
  ChipModel: number;
  /** 1:left, 2:right, 3:both(middle). */
  Channel: number;
  /** SID-baseaddress location in C64-memory (IO). */
  BaseAddress: number;
  /** In the TS port the C BasePtr/BasePtrRD raw pointers become numeric
   *  offsets into cRSID_C64.IObankWR / IObankRD (they always alias those
   *  arrays in C too). */
  BasePtr: number;
  BasePtrRD: number;
  // ADSR-related:
  ADSRstate: Uint8Array; // [15]
  RateCounter: Uint16Array; // [15]
  EnvelopeCounter: Uint8Array; // [15]
  ExponentCounter: Uint8Array; // [15]
  // Wave-related:
  /** 28bit precision instead of 24bit. */
  PhaseAccu: Int32Array; // [15]
  /** (integerized ClockRatio fractionals, WebSID has similar solution) */
  PrevPhaseAccu: Int32Array; // [15]
  SyncSourceMSBrise: number;
  RingSourceMSB: number;
  NoiseLFSR: Uint32Array; // [15]
  PrevSounDemonDigiWF: Int8Array; // [15] signed char
  PrevWavGenOut: Uint32Array; // [15]
  PrevWavData: Uint8Array; // [15]
  // Filter-related:
  PrevLowPass: number;
  PrevBandPass: number;
  /** pre-calculated once, used by oversampled/HQ output-emulation many times. */
  Volume: number;
  /** pre-calculated once, used by oversampled/HQ output-emulation many times. */
  Digi: number;
  Resonance: number;
  Cutoff: number;
  HighPassBit: number;
  BandPassBit: number;
  LowPassBit: number;
  // Output-stage:
  NonFiltedSample: number;
  FilterInputSample: number;
  PrevNonFiltedSample: number;
  PrevFilterInputSample: number;
  /** lowpass-filtered version of Volume-band register (signed int in C). */
  PrevVolume: number;
  /** not attenuated (range:0..0xFFFFF depending on SID's main-volume). */
  Output: number;
  /** filtered version, good for VU-meter display. */
  Level: number;
}

export function createSIDinstance(): CRSIDinstance {
  return {
    ChipModel: 0,
    Channel: 0,
    BaseAddress: 0,
    BasePtr: 0,
    BasePtrRD: 0,
    ADSRstate: new Uint8Array(15),
    RateCounter: new Uint16Array(15),
    EnvelopeCounter: new Uint8Array(15),
    ExponentCounter: new Uint8Array(15),
    PhaseAccu: new Int32Array(15),
    PrevPhaseAccu: new Int32Array(15),
    SyncSourceMSBrise: 0,
    RingSourceMSB: 0,
    NoiseLFSR: new Uint32Array(15),
    PrevSounDemonDigiWF: new Int8Array(15),
    PrevWavGenOut: new Uint32Array(15),
    PrevWavData: new Uint8Array(15),
    PrevLowPass: 0,
    PrevBandPass: 0,
    Volume: 0,
    Digi: 0,
    Resonance: 0,
    Cutoff: 0,
    HighPassBit: 0,
    BandPassBit: 0,
    LowPassBit: 0,
    NonFiltedSample: 0,
    FilterInputSample: 0,
    PrevNonFiltedSample: 0,
    PrevFilterInputSample: 0,
    PrevVolume: 0,
    Output: 0,
    Level: 0,
  };
}

// ---------------------------------------------------------------------------
// cRSID_SIDwavOutput (C64.h:135-140)
// ---------------------------------------------------------------------------

export interface CRSIDwavOutput {
  NonFilted: number;
  FilterInput: number;
}

// ---------------------------------------------------------------------------
// cRSID_C64instance (C64.h:142-222)
// ---------------------------------------------------------------------------

export interface CRC64instance {
  // platform-related:
  SampleRate: number;
  /** calculated (by audio-init) amount of bytes in the buffer. */
  SampleBufferSize: number;
  /** malloc-ed/freed by audio init/close routines (unused in the TS port —
   *  host audio is out of scope; kept for struct parity). */
  SampleBuffer: Int8Array | null;
  /** handle to the audio-device (unused in the TS port). */
  SoundDevice: unknown;
  SoundStarted: number;
  /** audio-thread's read-only shadow/cache-register for cRSID.RealSIDmode. */
  RealSIDmode: number;
  /** shadow/cache-register for cRSID.Stereo (boolean to set 2SID/3SID/4SID
   *  tunes as stereo). */
  Stereo: number;
  /** shadow/cache-register for cRSID.HighQualitySID (cycle-based waveform
   *  emulation with oversampling, more CPU usage). */
  HighQualitySID: number;
  /** shadow/cache-register for cRSID.HighQualityResampler (Sinc-based FIR
   *  resampler instead of fast averaging resampler). */
  HighQualityResampler: number;
  // C64-machine related:
  /** not likely to change during playback, but just in case the audio-thread
   *  version is used. */
  SIDchipCount: number;
  /** audio-thread's read-only shadow/cache-register for SIDchipCount. */
  AudioThread_SIDchipCount: number;
  CPUfrequency: number;
  /** ratio of CPU-clock and samplerate (for CPU/CIA/VIC/ADSR timing). */
  SampleClockRatio: number;
  /** ratio of oversampling SID-clock and samplerate (for SID-waveform
   *  resampling). */
  OversampleClockRatio: number;
  OversampleClockRatioReciproc: number;
  Finished: number;
  Returned: number;
  /** collected IRQ line from devices. */
  IRQ: number;
  /** collected NMI line from devices. */
  NMI: number;
  ResampledOutput: CRSIDOutput;
  // SID-file related:
  FileNameOnly: string;
  Attenuation: number;
  // PSID-playback related:
  /** this is a substitution in PSID-mode for CIA/VIC counters. */
  FrameCycleCnt: number;
  PrevRasterLine: number;
  SampleCycleCnt: number;
  OverSampleCycleCnt: number;
  // playlist-related
  TenthSecondCnt: number;
  SecondCnt: number;
  callBack__autoAdvance: ((subtunestepping: number, data: unknown) => void) | null;
  callBackData__autoAdvance: unknown;
  FadeLevel: number;
  // Hardware-elements:
  CPU: CRCPUinstance;
  SID: CRSIDinstance[]; // [CRSID_SIDCOUNT_MAX + 1]
  CIA: CRCIAinstance[]; // [CRSID_CIACOUNT + 1]
  VIC: CRVICinstance;
  /** fast lookup for memory-bank address-multiplexing done by the PLA.
   *  In C these are raw pointers into RAMbank/IObankRD/IObankWR/ROMbanks;
   *  the TS port stores a bank-selector code (0=RAM,1=IO_RD,2=ROM,3=IO_WR)
   *  plus a byte offset, resolved at access time. */
  MemoryBankPointersRD: Int32Array; // [4][256] packed: bankCode<<16 | 0
  MemoryBankPointersWR: Int32Array; // [4][256]
  // Overlapping system memories (which one is read/written in an address
  // region depends on CPU-port bankselect-bits):
  RAMbank: Uint8Array; // $0000..$FFFF RAM (and RAM under IO/ROM/CPUport)
  IObankWR: Uint8Array; // $D000..$DFFF IO-RAM (registers) to write
  IObankRD: Uint8Array; // $D000..$DFFF IO-RAM (registers) to read
  ROMbanks: Uint8Array; // CHARGEN / BASIC / KERNAL
}

/** cRSID_Output (libcRSID.h:128-131) — signed int L/R in C. */
export interface CRSIDOutput {
  L: number;
  R: number;
}

export function createC64instance(): CRC64instance {
  const SID: CRSIDinstance[] = [];
  for (let i = 0; i < CRSpecC64.CRSID_SIDCOUNT_MAX + 1; ++i) SID.push(createSIDinstance());
  const CIA: CRCIAinstance[] = [];
  for (let i = 0; i < CRSpecC64.CRSID_CIACOUNT + 1; ++i) CIA.push(createCIAinstance());
  return {
    SampleRate: 0,
    SampleBufferSize: 0,
    SampleBuffer: null,
    SoundDevice: null,
    SoundStarted: 0,
    RealSIDmode: 0,
    Stereo: 0,
    HighQualitySID: 0,
    HighQualityResampler: 0,
    SIDchipCount: 0,
    AudioThread_SIDchipCount: 0,
    CPUfrequency: 0,
    SampleClockRatio: 0,
    OversampleClockRatio: 0,
    OversampleClockRatioReciproc: 0,
    Finished: 0,
    Returned: 0,
    IRQ: 0,
    NMI: 0,
    ResampledOutput: { L: 0, R: 0 },
    FileNameOnly: '',
    Attenuation: 0,
    FrameCycleCnt: 0,
    PrevRasterLine: 0,
    SampleCycleCnt: 0,
    OverSampleCycleCnt: 0,
    TenthSecondCnt: 0,
    SecondCnt: 0,
    callBack__autoAdvance: null,
    callBackData__autoAdvance: null,
    FadeLevel: 0,
    CPU: createCPUinstance(),
    SID,
    CIA,
    VIC: createVICinstance(),
    MemoryBankPointersRD: new Int32Array(4 * 256),
    MemoryBankPointersWR: new Int32Array(4 * 256),
    RAMbank: new Uint8Array(CRMemAddresses.CRSID_MEMBANK_SIZE),
    IObankWR: new Uint8Array(CRMemAddresses.CRSID_MEMBANK_SIZE),
    IObankRD: new Uint8Array(CRMemAddresses.CRSID_MEMBANK_SIZE),
    ROMbanks: new Uint8Array(CRMemAddresses.CRSID_MEMBANK_SIZE),
  };
}

// ---------------------------------------------------------------------------
// Memory-bank pointer encoding (TS-port adaptation of the C pointer tables).
//
// C: `unsigned char* MemoryBankPointersRD[4][256]` holds one of four base
// pointers per (bank, page). The C code then compares the fetched pointer
// against the four bases (`BankPointer != cRSID_C64.IObankRD` etc.). We
// encode each entry as bankCode<<16 | 0 with bankCode:
//   0 = RAMbank, 1 = IObankRD, 2 = ROMbanks, 3 = IObankWR
// (IObankWR appears only in the WR table; the RD table never stores it.)
// ---------------------------------------------------------------------------

export const BANK_RAM = 0;
export const BANK_IO_RD = 1;
export const BANK_ROM = 2;
export const BANK_IO_WR = 3;

/** Resolve a C memory-bank pointer to (bankCode). */
export function bankCode(entry: number): number {
  return entry >>> 16;
}

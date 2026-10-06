// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Bitti09 — modplayjs contributors
// Ported from: cRSID 1.58 libcRSID/libcRSID.c — the two global objects
// (cRSID_Interface and the private cRSID_C64instance) plus the interface
// defaults set by cRSID_init().
// (c) Hermit (Mihaly Horvath), license: WTF ("do what the frick you want").
import type { CRC64instance, CRSIDOutput } from './c64types.js';
import { createC64instance } from './c64types.js';

// ---------------------------------------------------------------------------
// cRSID_Interface (libcRSID.h:59-125) — public API variables aimed for being
// used from outside by a SID-player app. Fields not needed by the TS port
// (playlist/file-dialog UI state) are kept as their C defaults for parity of
// behaviour that reads them.
// ---------------------------------------------------------------------------

export interface cRSIDInterface {
  // platform-related:
  /** boolean, if set, it disables GUI and select interactive command-line
   *  interface. */
  CLImode: number;
  /** amount of buffered samples (frames) for sound-playback. */
  SampleBufferLength: number;
  /** cycle-based waveform-emulation with oversampling (more CPU usage). */
  HighQualitySID: number;
  /** high-quality Sinc-based FIR resampler instead of fast averaging. */
  HighQualityResampler: number;
  /** boolean to set 2SID/3SID/4SID tunes as stereo. */
  Stereo: number;
  /** 1x is the default playback. */
  PlaybackSpeed: number;
  Paused: number;
  // C64-machine related:
  /** 0:NTSC, 1:PAL (based on the SID-header field). */
  VideoStandard: number;
  /** can be set to 6581 or 8580; if set, used for every SID. */
  SelectedSIDmodel: number;
  // SID-tune related:
  RealSIDmode: number;
  PSIDdigiMode: number;
  SIDchipCount: number;
  /** enum: SubtuneTimeSources (0:Vsync 1:CIA1). */
  TimerSource: number;
  /** the replay-frequency (in CPU-cycles) of the tune (calculated). */
  FrameCycles: number;
  /** 1..256. */
  SubTune: number;
  /** 16-bit value. */
  LoadAddress: number;
  InitAddress: number;
  PlayAddress: number;
  EndAddress: number;
  SIDheader: CRSIDheader | null;
  SIDfileData: Uint8Array | null;
  SIDfileSize: number;
  /** 0..255. */
  MainVolume: number;
  /** 0..59minutes + 0..59seconds in integer array (256). */
  SubtuneDurations: Int32Array;
  /** Read-Only (playtime of current tune, displayed). */
  PlayTime: number;
  /** Read-Only (to detect if playtime of tune expired). */
  PlaytimeExpired: number;
  AutoAdvance: number;
  AutoExit: number;
  FadeOut: number;
  BuiltInMusic: number;
  BuiltInMusicSize: number;
  BuiltInMusicData: Uint8Array | null;
  OpenedMusic: number;
  PlayListSize: number;
  PlayListPlayPosition: number;
  PlayListAdvance: number;
  /** if no timing info is found, this can be used as a fallback playtime. */
  FallbackPlayTime: number;
  PlayListNumber: number;
  /** if a SongLengths database file is loaded, its memory-location
   *  (otherwise an empty string). Not supported by the TS port (no database
   *  file is loaded — see host/file.c note in loader.ts). */
  SongLengths: string | null;
  KERNALfileData: Uint8Array | null;
  BASICfileData: Uint8Array | null;
  /** init-time override (settings UI): force 0=NTSC/1=PAL after the header
   *  decode in cRSID_setC64 (undefined = follow the header). */
  ForcedVideoStandard?: 0 | 1;
}

// ---------------------------------------------------------------------------
// cRSID_SIDheader (libcRSID.h:10-56) — the PSID/RSID header, decoded from the
// file's big-endian byte layout by the loader.
// ---------------------------------------------------------------------------

export interface CRSIDheader {
  /** "PSID" or "RSID" (RSID must provide Reset-circumstances & CIA/VIC
   *  interrupts). */
  MagicString: string;
  /** 1 for PSID v1, 2..4 for PSID/RSID v2..4, 0x4E for 4SID (WebSID). */
  Version: number;
  /** $76 for v1, $7C for v2..4 (WebSID: $7E/$80/$82). */
  HeaderSize: number;
  /** if 0 it's a PRG and its loadaddress is used (RSID: 0). */
  LoadAddress: number;
  /** if 0 it's taken from load-address (RSID: don't point to ROM). */
  InitAddress: number;
  /** if 0 play-routine-call is set by the initializer (always true RSID). */
  PlayAddress: number;
  /** 1..256. */
  SubtuneAmount: number;
  /** 1..256 (optional, defaults to 1). */
  DefaultSubtune: number;
  /** 0:Vsync / 1:CIA1 (LSB is subtune1, MSB above 32); always 0 for RSID. */
  SubtuneTimeSources: number; // 32-bit BE
  /** strings use 1252 codepage. */
  Title: string;
  Author: string;
  ReleaseInfo: string;
  // SID v2 additions:
  /** bit9&8/7&6/5&4: SID3/2/1 model (00:?,01:6581,10:8580,11:both)
   *  (4SID:bit6=SID1-channel), bit3&2:VideoStandard. */
  ModelFormatStandardH: number;
  /** ..(01:PAL,10:NTSC,11:both), bit1:(0:C64,1:PlaySID-samples/RSID_BASICflag),
   *  bit0:(0:builtin-player,1:MUS). */
  ModelFormatStandard: number;
  /** v2NG: 0 = no writes outside data-range, $FF = no place for driver. */
  RelocStartPage: number;
  /** size of area from RelocStartPage for driver-relocation. */
  RelocFreePages: number;
  /** (SID2BASE-$d000)/16 — v3-relevant, $42..$FE valid, else no SID2. */
  SID2baseAddress: number;
  /** (SID3BASE-$d000)/16 — v4-relevant. */
  SID3baseAddress: number;
  // WebSID-format extra per-SID flag pairs (SID3/SID4), same layout as SID2:
  SID2flagsH: number;
  SID2flagsL: number;
  SID3flagsH: number;
  SID3flagsL: number;
  SID4baseAddress: number;
  SID4flagsL: number;
}

// ---------------------------------------------------------------------------
// The two global objects (libcRSID.c:27-28)
// ---------------------------------------------------------------------------

/** cRSID_Interface — "the only public global object". */
export const cRSID: cRSIDInterface = {
  CLImode: 0,
  SampleBufferLength: 0,
  HighQualitySID: 0,
  HighQualityResampler: 0,
  Stereo: 0,
  PlaybackSpeed: 1,
  Paused: 0,
  VideoStandard: 0,
  SelectedSIDmodel: 0,
  RealSIDmode: 0,
  PSIDdigiMode: 0,
  SIDchipCount: 0,
  TimerSource: 0,
  FrameCycles: 0,
  SubTune: 0,
  LoadAddress: 0,
  InitAddress: 0,
  PlayAddress: 0,
  EndAddress: 0,
  SIDheader: null,
  SIDfileData: null,
  SIDfileSize: 0,
  MainVolume: 0,
  SubtuneDurations: new Int32Array(257), // CRSID_SUBTUNE_AMOUNT_MAX + 1
  PlayTime: 0,
  PlaytimeExpired: 0,
  AutoAdvance: 0,
  AutoExit: 0,
  FadeOut: 0,
  BuiltInMusic: 0,
  BuiltInMusicSize: 0,
  BuiltInMusicData: null,
  OpenedMusic: 0,
  PlayListSize: 0,
  PlayListPlayPosition: 0,
  PlayListAdvance: 0,
  FallbackPlayTime: 0,
  PlayListNumber: 1,
  SongLengths: null,
  KERNALfileData: null,
  BASICfileData: null,
};

/** cRSID_C64instance — "the only private global object". */
export const cRSID_C64: CRC64instance = createC64instance();

export type { CRC64instance, CRSIDOutput };

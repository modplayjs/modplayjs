// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Bitti09 — modplayjs contributors
// Ported from: cRSID 1.58 libcRSID/host/file.c (cRSID_processSIDfileData)
// and libcRSID/libcRSID.c (cRSID_init / cRSID_initSIDtune / sample
// generation entry).
// (c) Hermit (Mihaly Horvath), license: WTF ("do what the frick you want").
//
// cRSID_processSIDfileData in C reads the header through a struct overlaid
// on the raw file bytes (big-endian multi-byte fields on a little-endian
// host are read byte-wise via LoadAddressH/L etc.). The TS port decodes the
// big-endian byte layout explicitly into a CRSIDheader, then runs the same
// processing steps.

import type { CRSIDheader } from './instance.js';
import { cRSID, cRSID_C64 } from './instance.js';
import { CRSID_FILEVERSION_WEBSID, CRSID_SECONDS_PER_MINUTE } from './host.js';
import { cRSID_setC64, cRSID_initC64, cRSID_emulateC64 } from './c64.js';
import { cRSID_playPSIDdigi } from './psiddigi.js';
import { cRSID_initCPU, cRSID_emulateCPU } from './cpu.js';
import { cRSID_readMem } from './mem.js';
import type { CRSIDOutput } from './c64types.js';

// ---------------------------------------------------------------------------
// Header decode (host/file.c struct-overlay → explicit BE decoding)
// ---------------------------------------------------------------------------

/** Decode the PSID/RSID header from raw file bytes (libcRSID.h:10-56 layout).
 *  Strings are using 1252 codepage per the spec — decoded latin1 here. */
export function cRSID_decodeSIDheader(filedata: Uint8Array): CRSIDheader {
  const be16 = (o: number) => (filedata[o]! << 8) | filedata[o + 1]!;
  const magic =
    String.fromCharCode(filedata[0]!, filedata[1]!, filedata[2]!, filedata[3]!);
  const version = filedata[5]!;
  const headerSize = filedata[7]!;
  return {
    MagicString: magic,
    Version: version,
    HeaderSize: headerSize,
    LoadAddress: be16(8), // if 0 it's a PRG and its loadaddress is used
    InitAddress: be16(10), // if 0 it's taken from load-address (but should be set)
    PlayAddress: be16(12), // if 0 play-routine-call is set by the initializer
    SubtuneAmount: be16(14), // 1..256
    DefaultSubtune: filedata[17]!, // 1..256 (optional, defaults to 1)
    SubtuneTimeSources:
      ((filedata[0x12]! << 24) | (filedata[0x13]! << 16) | (filedata[0x14]! << 8) | filedata[0x15]!) >>> 0,
    Title: latin1(filedata, 0x16, 32),
    Author: latin1(filedata, 0x36, 32),
    ReleaseInfo: latin1(filedata, 0x56, 32),
    ModelFormatStandardH: filedata[0x76]!,
    ModelFormatStandard: filedata[0x77]!,
    RelocStartPage: filedata[0x78]!,
    RelocFreePages: filedata[0x79]!,
    SID2baseAddress: filedata[0x7a]!,
    SID3baseAddress: filedata[0x7b]!,
    SID2flagsH: filedata[0x7a]!,
    SID2flagsL: filedata[0x7b]!,
    SID3flagsH: filedata[0x7c]!,
    SID3flagsL: filedata[0x7d]!,
    SID4baseAddress: filedata[0x7e]!,
    SID4flagsL: filedata[0x7f]!,
  };
}

function latin1(b: Uint8Array, o: number, n: number): string {
  let s = '';
  for (let i = 0; i < n; ++i) {
    const c = b[o + i]!;
    if (c === 0) break; // C char[] printed via %s stops at NUL
    s += String.fromCharCode(c);
  }
  return s;
}

// ---------------------------------------------------------------------------
// cRSID_processSIDfileData (host/file.c:141-185)
// ---------------------------------------------------------------------------

export function cRSID_processSIDfileData(filedata: Uint8Array, filesize: number): CRSIDheader | null {
  let i: number;
  let SIDdataOffset: number;

  const MagicStringPSID = 'PSID';

  const header = cRSID_decodeSIDheader(filedata);
  cRSID.SIDheader = header;

  // copy KERNAL & BASIC ROM contents into the RAM under them? (So PSIDs that
  // don't select bank correctly will work better.)
  for (i = 0xa000; i < 0x10000; ++i) cRSID_C64.RAMbank[i] = cRSID_C64.ROMbanks[i]!;
  for (i = 0x0000; i < 0xa000; ++i) cRSID_C64.RAMbank[i] = 0; // fresh start (maybe some bugged SIDs want 0 at certain RAM-locations)
  for (i = 0xc000; i < 0xd000; ++i) cRSID_C64.RAMbank[i] = 0;

  const m = header.MagicString;
  if (m[0] !== 'P' && m[0] !== 'R') return null;
  for (i = 1; i < MagicStringPSID.length; ++i) {
    if (m[i] !== MagicStringPSID[i]) return null;
  }
  cRSID.RealSIDmode = m[0] === 'R' ? 1 : 0;
  cRSID_C64.RealSIDmode = cRSID.RealSIDmode; // update shadowed copy used by the audio thread (sound-thread shouldn't run at this moment)

  if (header.LoadAddress === 0) {
    // load-address taken from first 2 bytes of the C64 PRG
    cRSID.LoadAddress = ((filedata[header.HeaderSize + 1]! << 8) + filedata[header.HeaderSize + 0]!) >>> 0;
    SIDdataOffset = header.HeaderSize + 2;
  } else {
    // load-adress taken from SID-header
    cRSID.LoadAddress = header.LoadAddress;
    SIDdataOffset = header.HeaderSize;
  }

  // Used by subtune-playback too after first init, so tunes that modify
  // memory can start with a freshly loaded data:
  for (i = SIDdataOffset; i < filesize; ++i) {
    cRSID_C64.RAMbank[(cRSID.LoadAddress + (i - SIDdataOffset)) & 0xffff] = filedata[i]!;
  }

  i = (cRSID.LoadAddress + (filesize - SIDdataOffset)) & 0x1ffff; // (C: plain int math, clamped below)
  cRSID.EndAddress = i < 0x10000 ? i : 0xffff;

  cRSID.PSIDdigiMode = (!cRSID.RealSIDmode && (header.ModelFormatStandard & 2)) === 1 ? 1 : 0;

  // cRSID_getPlaylengths (host/file.c:37-79): only active when
  // cRSID.SongLengths != NULL, which the TS port never sets (no MD5
  // song-length database support) — the loop below is the direct equivalent
  // of the C fallback-fill that runs after it.
  if (cRSID.FallbackPlayTime > 0) {
    for (i = 0; i <= 256; ++i) {
      if (cRSID.SubtuneDurations[i]! <= 0) cRSID.SubtuneDurations[i] = cRSID.FallbackPlayTime;
    }
  }

  return cRSID.SIDheader;
}

// ---------------------------------------------------------------------------
// cRSID_init (libcRSID.c:35-67) — init emulation objects; the host-sound
// call (cRSID_initSound, CRSID_PLATFORM_PC only) is out of scope, matching
// the embedded build path where `buflen` only silences an unused-param
// warning. PlaySID-compat defaults from cRSID_init.
// ---------------------------------------------------------------------------

export function cRSID_init(samplerate: number, buflen: number): CRC64instance {
  cRSID.RealSIDmode = 1;
  cRSID.Stereo = 0 /* CRSID_CHANNELMODE_MONO */;
  cRSID.HighQualitySID = 1;
  cRSID.HighQualityResampler = 0; // was problematic (noisy) with lowpass-filtered triangles on all SID-channels
  cRSID_C64.RealSIDmode = cRSID.RealSIDmode;
  cRSID_C64.Stereo = cRSID.Stereo; // init shadow-variables to defaults for audio-thread as well
  cRSID_C64.HighQualitySID = cRSID.HighQualitySID;
  cRSID_C64.HighQualityResampler = cRSID.HighQualityResampler;
  cRSID.SelectedSIDmodel = 0; // default model and mode selections
  cRSID.PlaybackSpeed = 1;
  cRSID.MainVolume = 255; // 230;
  cRSID.CLImode = 0;
  cRSID.AutoExit = cRSID.BuiltInMusic = cRSID.BuiltInMusicSize = 0;
  cRSID.BuiltInMusicData = null;
  cRSID.OpenedMusic = 0;
  cRSID.AutoAdvance = cRSID.FadeOut = 1;
  cRSID_C64.FadeLevel = 0xf;
  cRSID.PlayListSize = 0;
  cRSID.PlayListNumber = 1;
  cRSID.PlayListPlayPosition = cRSID.PlayListAdvance = 0;
  cRSID.SongLengths = null;
  cRSID.KERNALfileData = null;
  cRSID.BASICfileData = null;
  cRSID_setCallBack__autoAdvance(dummyCallBack, null); // to prevent segfault if not assigned by user

  cRSID_createC64(cRSID_C64, samplerate);
  if (buflen) return cRSID_C64; // this is here just to eliminate unused 'buflen' variable warning

  return cRSID_C64;
}

function dummyCallBack(_subtunestepping: number, _data: unknown): void {
  return;
}

export function cRSID_setCallBack__autoAdvance(
  callback: (subtunestepping: number, data: unknown) => void,
  data: unknown,
): void {
  cRSID_C64.callBack__autoAdvance = callback;
  cRSID_C64.callBackData__autoAdvance = data;
}

import { cRSID_createC64 } from './c64.js';
import type { CRC64instance } from './c64types.js';

// ---------------------------------------------------------------------------
// cRSID_initSIDtune (libcRSID.c:69-140) — subtune: 1..255
// ---------------------------------------------------------------------------

/** PowersOf2 (libcRSID.c:70). */
const PowersOf2: Uint8Array = new Uint8Array([0x01, 0x02, 0x04, 0x08, 0x10, 0x20, 0x40, 0x80]);

export function cRSID_initSIDtune(SIDheader: CRSIDheader, subtune: number): void {
  const C64 = cRSID_C64;
  let InitTimeout = 10000000; // allowed instructions, value should be selected to allow for long-running memory-copiers in init-routines (e.g. Synth Sample)

  cRSID.PlaytimeExpired = 0;
  C64.FadeLevel = 0xf;
  cRSID.Paused = 1;

  if (subtune === 0) subtune = 1;
  else if (subtune > SIDheader.SubtuneAmount) subtune = SIDheader.SubtuneAmount; // printf( "Subtune: %d\n", subtune );
  cRSID.SubTune = subtune;
  C64.SecondCnt = cRSID.PlayTime = 0;
  cRSID.PlaybackSpeed = 1; // cRSID.Paused = 0; //don't unpause this early, before init!

  cRSID_setC64();
  cRSID_initC64(C64); // cRSID_writeMemC64(C64,0xD418,0xF); //set C64 hardware and init (reset) it
  // cRSID.Paused = 0;

  // determine init-address:
  cRSID.InitAddress = SIDheader.InitAddress; // get info from BASIC-startupcode for some tunes
  if (C64.RAMbank[1] === 0x37) {
    // are there SIDs with routine under IO area? some PSIDs don't set bank-registers themselves
    if (
      (0xa000 <= cRSID.InitAddress && cRSID.InitAddress < 0xc000) ||
      (cRSID.LoadAddress < 0xc000 && cRSID.EndAddress >= 0xa000)
    )
      C64.RAMbank[1] = 0x36;
    else if (cRSID.InitAddress >= 0xe000 || cRSID.EndAddress >= 0xe000) C64.RAMbank[1] = 0x35;
  }
  cRSID_initCPU(C64, cRSID.InitAddress); // prepare init-routine call
  C64.CPU.A = subtune - 1;

  if (!cRSID.RealSIDmode) {
    // call init-routine:
    for (InitTimeout = 10000000; InitTimeout > 0; InitTimeout--) {
      if (cRSID_emulateCPU(C64) >= 0xfe) break;
    } // give error when timed out?
  }

  // determine timing-source, if CIA, replace FrameCycles previouisly set to
  // VIC-timing
  // C: SubtuneTimeSources[0] — byte $12 of the file (the byte overlaid at
  // array index 0), which is the MSB of the BE u32.
  if (subtune > 32) cRSID.TimerSource = (SIDheader.SubtuneTimeSources >>> 24) & 0x80; // subtunes above 32 should use subtune32's timing
  else {
    const byteIdx = (32 - subtune) >> 3; // C: SubtuneTimeSources[(32-subtune)>>3]
    const bitIdx = (subtune - 1) & 7; // C: PowersOf2[(subtune-1)&7]
    // The C byte-array overlay reads file bytes $12..$15 in file order:
    // byte0 = filedata[0x12] … byte3 = filedata[0x15]; reconstruct per-byte:
    const bytes = [
      (SIDheader.SubtuneTimeSources >>> 24) & 0xff,
      (SIDheader.SubtuneTimeSources >>> 16) & 0xff,
      (SIDheader.SubtuneTimeSources >>> 8) & 0xff,
      SIDheader.SubtuneTimeSources & 0xff,
  ];
    cRSID.TimerSource = bytes[byteIdx]! & PowersOf2[bitIdx]!;
  }
  if (cRSID.TimerSource || C64.IObankWR[0xdc05] !== 0x40 || C64.IObankWR[0xdc04] !== 0x24) {
    // CIA1-timing (probably multispeed tune)
    cRSID.FrameCycles = C64.IObankWR[0xdc04]! + (C64.IObankWR[0xdc05]! << 8);
    cRSID.TimerSource = 1; // if init-routine changed DC04 or DC05, assume CIA-timing
  }

  // determine playaddress:
  cRSID.PlayAddress = SIDheader.PlayAddress;
  if (cRSID.PlayAddress) {
    // normal play-address called with JSR
    if (C64.RAMbank[1] === 0x37) {
      // are there SIDs with routine under IO area?
      if (0xa000 <= cRSID.PlayAddress && cRSID.PlayAddress < 0xc000) C64.RAMbank[1] = 0x36;
    } else if (cRSID.PlayAddress >= 0xe000) C64.RAMbank[1] = 0x35; // player under KERNAL (e.g. Crystal Kingdom Dizzy)
  } else {
    // IRQ-playaddress for multispeed-tunes set by init-routine (some tunes
    // turn off KERNAL ROM but doesn't set IRQ-vector!)
    cRSID.PlayAddress =
      (C64.RAMbank[1]! & 3) < 2
        ? cRSID_readMem(C64, 0xfffe) + (cRSID_readMem(C64, 0xffff) << 8) // for PSID
        : cRSID_readMem(C64, 0x314) + (cRSID_readMem(C64, 0x315) << 8);
    if (cRSID.PlayAddress === 0) {
      // if 0, still try with RSID-mode fallback
      cRSID_initCPU(C64, cRSID.PlayAddress); // point CPU to play-routine
      C64.Finished = 1;
      C64.Returned = 1;
      cRSID.Paused = 0;
      return;
    }
  }

  if (!cRSID.RealSIDmode) {
    // prepare (PSID) play-routine playback:
    cRSID_initCPU(C64, cRSID.PlayAddress); // point CPU to play-routine
    C64.FrameCycleCnt = 0;
    C64.Finished = 1;
    C64.SampleCycleCnt = 0; // C64.CIAisSet=0;
  } else {
    C64.Finished = 0;
    C64.Returned = 0;
  }

  cRSID.Paused = 0;
}

// ---------------------------------------------------------------------------
// cRSID_generateSample (host/audio.c:306-335) — the sample-generation entry
// that the modplayjs host buffer loop calls. Everything between `Paused`
// short-circuit and the saturation is host-audio-private (commented-out
// shadow-variable sync + dither noise) — ported verbatim.
// ---------------------------------------------------------------------------


/** C integer division (truncates toward zero; JS `/` is not integer and
 *  `Math.floor` rounds down — not the same for negative operands). */
function divTrunc(a: number, b: number): number {
  return Math.trunc(a / b);
}

const MIX_SCALING = 256 * 16 /* FADE_SCALING */;
const SCRAMBLER_BITS = 8;
const DITHERNOISE_DIVSHIFTS = 6 /* 5 */;
const DITHERNOISE_MID = (1 << (SCRAMBLER_BITS - DITHERNOISE_DIVSHIFTS)) / 2;

export let ditherLFSR = 0x0055a5aa;

export function cRSID_generateSample(): CRSIDOutput {
  const C64 = cRSID_C64;
  let VolumeMul: number;
  let Insert: number;
  const Output: CRSIDOutput = { L: 0, R: 0 };

  if (cRSID.Paused) {
    Output.L = Output.R = 0;
    return Output;
  }

  // If calling cRSID_generateSample() directly, don't forget to keep the
  // audio-thread shadow-variables updated, as seen above in
  // cRSID_generateSound() (host/audio.c:283-296):
  C64.RealSIDmode = cRSID.RealSIDmode;
  C64.AudioThread_SIDchipCount = C64.SIDchipCount;
  C64.Stereo = C64.AudioThread_SIDchipCount > 1 ? cRSID.Stereo : 0 /* CRSID_CHANNELMODE_MONO */; // this might be changed regularly during playback by the user
  C64.HighQualitySID = cRSID.HighQualitySID;
  C64.HighQualityResampler = cRSID.HighQualityResampler;

  const emulatedOutput = cRSID_emulateC64(C64);
  Output.L = emulatedOutput.L;
  Output.R = emulatedOutput.R;

  if (cRSID.PSIDdigiMode) {
    Insert = cRSID_playPSIDdigi();
    Output.L += Insert;
    Output.R += Insert;
  }

  VolumeMul = cRSID.MainVolume * C64.FadeLevel;
  Output.L = divTrunc(Output.L * VolumeMul, MIX_SCALING); // Having the attenuator before saturation allows avoiding filter/many-SIDs overdrive-distortion
  Output.R = divTrunc(Output.R * VolumeMul, MIX_SCALING); // (By simply adjusting the main volume knob to a lower level. Real SID distorts as well in those cases btw.)

  // Add dithering noise for more natural sound and to override any small
  // quantization/correlated/mixdown noises (might add C64 bus-noise in the
  // future)
  // This is my fast LFSR+scrambler-routine generating perfect even
  // white-noise spectrum (measured with 'ENT' tool)
  // 23bit LFSR (pow(2,23)-1=8388607 states) with XOR-ed taps of bit22 and
  // bit13 (realized by 24 bits = 3 bytes and bit23^bit14 (LFSR_HH[7],
  // LFSR_H[6]) feedback to bit1)
  const fb = (ditherLFSR & 0x800000) ^ ((ditherLFSR & 0x004000) << 9);
  // C: `LFSR <<= 1` on a signed int — 32-bit wraparound, then `>> 16` reads
  // are ARITHMETIC (sign-extending). Keep the variable as a signed int32.
  ditherLFSR = (Math.imul(ditherLFSR, 2) | (fb ? 2 : 0)) | 0;
  if (fb) ditherLFSR |= 2; // (redundant with the |2 above; kept for C parity)
  // scramble 24bit value into a 8bit output (e.g. make LFSR 8bit output
  // non-linear and therefore more random)
  // We use AND-masks to combine into output (instead of free bit-to-bit
  // mapping)
  // (this method has ENT-correlation=0.000002, PI-error=0.02%, a nice evenly
  // distributed spectrum that fits between -45.4..-45.8dB)
  Insert =
    ((((ditherLFSR >> 16) & 0x99) + ((ditherLFSR >> 8) & 0x72) + (ditherLFSR & 0xb4) + 0x7c) & 0xff) >>>
    DITHERNOISE_DIVSHIFTS;
  // (signed char) cast — reinterpret the byte as signed:
  const sc = Insert > 127 ? Insert - 256 : Insert;
  Insert = sc - DITHERNOISE_MID;

  Output.L += Insert;
  Output.R += Insert;

  if (Output.L >= 32767) Output.L = 32767;
  else if (Output.L <= -32768) Output.L = -32768; // saturation arithmetic on overflow
  if (Output.R >= 32767) Output.R = 32767;
  else if (Output.R <= -32768) Output.R = -32768; // saturation arithmetic on overflow
  return Output;
}

/** cRSID_generateSound (host/audio.c:299-304) — fill a buffer with samples
 *  (S16LE interleaved stereo), matching the C helper's shadow-update
 *  references above. */
export function cRSID_generateSound(buf: Int8Array | Uint8Array, len: number): void {
  // C: cRSID_soundCallback sets SoundStarted then calls generateSound +
  // autoAdvance; the host loop equivalent only generates.
  for (let i = 0; i < len; i += 4) {
    const out = cRSID_generateSample();
    const L = out.L > 32767 ? 32767 : out.L < -32768 ? -32768 : out.L;
    const R = out.R > 32767 ? 32767 : out.R < -32768 ? -32768 : out.R;
    buf[i + 0] = L & 0xff;
    buf[i + 1] = (L >>> 8) & 0xff;
    buf[i + 2] = R & 0xff;
    buf[i + 3] = (R >>> 8) & 0xff;
  }
}

/** cRSID_playSIDtune / cRSID_pauseSIDtune (libcRSID.c:158-176) — the
 *  host-sound #ifdef blocks are PC-only; the TS port keeps the Paused flag.
 */
export function cRSID_playSIDtune(): void {
  cRSID.Paused = 0;
}

export function cRSID_pauseSIDtune(): void {
  cRSID.Paused = 1;
}

/** cRSID_close (libcRSID.c:152-156) — host-sound close is PC-only. */
export function cRSID_close(): void {
  cRSID.Paused = 1;
}

export { CRSID_SECONDS_PER_MINUTE, CRSID_FILEVERSION_WEBSID };

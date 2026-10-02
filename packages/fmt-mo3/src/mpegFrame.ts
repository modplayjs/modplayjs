// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Bitti09 — modplayjs contributors
// Ported from: OpenMPT soundlib/MPEGFrame.cpp (BSD-3-Clause).
//
// Basic MPEG frame header parsing — used by the MO3 loader to find LAME
// info frames and frame boundaries before decoding MP3 sample data.

/** Samples per frame — for each MPEG version and all three layers. */
const SAMPLES_PER_FRAME: readonly number[][] = [
  [384, 1152, 1152], // MPEG 1
  [384, 1152, 576], // MPEG 2 / 2.5
];

const BIT_RATES: readonly number[][][] = [
  // MPEG 1
  [
    [0, 32, 64, 96, 128, 160, 192, 224, 256, 288, 320, 352, 384, 416, 448], // Layer 1
    [0, 32, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 384], // Layer 2
    [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320], // Layer 3
  ],
  // MPEG 2 / 2.5
  [
    [0, 32, 48, 56, 64, 80, 96, 112, 128, 144, 160, 176, 192, 224, 256], // Layer 1
    [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160], // Layer 2
    [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160], // Layer 3
  ],
];

const SAMPLING_RATES: readonly number[][] = [
  [11025, 12000, 8000], // MPEG 2.5
  [0, 0, 0], // Invalid
  [22050, 24000, 16000], // MPEG 2
  [44100, 48000, 32000], // MPEG 1
];

/** Samples per frame / 8. */
/** Side info size = offset in frame where Xing/Info magic starts. */
const SIDE_INFO_SIZE: readonly number[][] = [
  [17, 32], // MPEG 1
  [9, 17], // MPEG 2 / 2.5
];

export function isMPEGHeader(header: Uint8Array, off = 0): boolean {
  return (
    header[off] === 0xff &&
    (header[off + 1]! & 0xe0) === 0xe0 && // Sync
    (header[off + 1]! & 0x18) !== 0x08 && // Invalid MPEG version
    (header[off + 1]! & 0x06) !== 0x00 && // Invalid MPEG layer
    (header[off + 2]! & 0x0c) !== 0x0c && // Invalid frequency
    (header[off + 2]! & 0xf0) !== 0xf0 // Invalid bitrate
  );
}

export interface MpegFrameInfo {
  frameSize: number;
  numSamples: number;
  sampleRate: number;
  isLAME: boolean;
}

/** Parse the frame header at `off`; null if not an MPEG header. */
export function parseMPEGFrame(data: Uint8Array, off = 0): MpegFrameInfo | null {
  if (off + 4 > data.length || !isMPEGHeader(data, off)) return null;
  const b1 = data[off + 1]!;
  const b2 = data[off + 2]!;
  const mpegVersion = (b1 & 0x18) >> 3; // 0=2.5, 2=2, 3=1
  const layer = 3 - ((b1 & 0x06) >> 1); // 0..2 (index into tables)
  const bitrateIndex = (b2 & 0xf0) >> 4;
  const samplerateIndex = (b2 & 0x0c) >> 2;
  const padding = (b2 & 0x02) >> 1;
  const mpegId = mpegVersion === 3 ? 0 : 1; // 0 = MPEG 1 table row, 1 = MPEG 2/2.5
  const sampleRate = SAMPLING_RATES[mpegVersion]![samplerateIndex]!;
  if (sampleRate === 0) return null;
  const bitRate = (BIT_RATES[mpegId]![layer]![bitrateIndex]! * 1000) / 8;
  const frameSize = Math.floor((bitRate * SAMPLES_PER_FRAME[mpegId]![layer]!) / sampleRate) + padding;
  const numSamples = SAMPLES_PER_FRAME[mpegId]![layer]!;

  // LAME/Xing info frame detection (MPEGFrame.cpp:120-140)
  let isLAME = false;
  if (layer === 2 /* Layer 3 */) {
    const sideInfo = SIDE_INFO_SIZE[mpegId]![mpegId === 0 ? 1 : 0]!;
    const magicOff = off + 4 + sideInfo;
    if (magicOff + 4 <= data.length) {
      const magic = String.fromCharCode(data[magicOff]!, data[magicOff + 1]!, data[magicOff + 2]!, data[magicOff + 3]!);
      if (magic === 'Xing' || magic === 'Info') isLAME = true;
      // LAME frames also carry the "LAME3." string further in; OpenMPT
      // checks the Xing/Info magic only for the flag we need.
    }
  }
  return { frameSize, numSamples, sampleRate, isLAME };
}

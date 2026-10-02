// SPDX-License-Identifier: BSD-3-Clause
// IMA ADPCM WAV decode (WAVE_FORMAT_IMA_ADPCM / DVI, format tag 0x0011).
// Standard IMA algorithm: step table + 4-bit nibble → predictor.

const IMA_STEP_TABLE: readonly number[] = [
  7, 8, 9, 10, 11, 12, 13, 14, 16, 17,
  19, 21, 23, 25, 28, 31, 34, 37, 41, 45,
  50, 55, 60, 66, 73, 80, 88, 97, 107, 118,
  130, 143, 157, 173, 190, 209, 230, 253, 279, 307,
  337, 371, 408, 449, 494, 544, 598, 658, 724, 796,
  876, 963, 1060, 1166, 1282, 1411, 1552, 1707, 1878, 2066,
  2272, 2499, 2749, 3024, 3327, 3660, 4026, 4428, 4871, 5358,
  5894, 6484, 7132, 7845, 8630, 9493, 10442, 11487, 12635, 13899,
  15289, 16818, 18500, 20350, 22385, 24623, 27086, 29794, 32767,
];

const IMA_INDEX_TABLE: readonly number[] = [
  -1, -1, -1, -1, 2, 4, 6, 8, -1, -1, -1, -1, 2, 4, 6, 8,
];

/** Decode one mono block of IMA ADPCM nibbles into `out` (interleaved at
 *  channel `chn` of `channels`). Returns frames written. */
function decodeImaBlock(
  b: Uint8Array,
  blockOff: number,
  blockSize: number,
  channels: number,
  chn: number,
  out: Float32Array,
  outOff: number,
): number {
  // Per-channel block header: int16 predictor, u8 step index, u8 reserved.
  const hdr = blockOff + chn * 4;
  let predictor = b[hdr]! | (b[hdr + 1]! << 8);
  predictor = (predictor << 16) >> 16; // int16
  let stepIndex = b[hdr + 2]!;
  if (stepIndex > 88) stepIndex = 88;

  const dataOff = blockOff + channels * 4;
  const dataEnd = blockOff + blockSize;
  const framesPerBlock = (blockSize - channels * 4) * 2 / channels;
  let frames = 0;

  for (let i = 0; i < framesPerBlock && dataOff + (i >> 1) < dataEnd; i++) {
    const byteIdx = dataOff + Math.floor((i / channels)) * channels + chn;
    const byte = b[byteIdx] ?? 0;
    const nibble = i % 2 === 0 ? byte & 0x0f : (byte >> 4) & 0x0f;

    let step = IMA_STEP_TABLE[stepIndex]!;
    let diff = step >> 3;
    if (nibble & 4) diff += step;
    if (nibble & 2) diff += step >> 1;
    if (nibble & 1) diff += step >> 2;
    if (nibble & 8) diff = -diff;

    predictor += diff;
    predictor = Math.max(-32768, Math.min(32767, predictor));
    out[outOff + i * channels] = predictor / 32768;

    stepIndex += IMA_INDEX_TABLE[nibble]!;
    stepIndex = Math.max(0, Math.min(88, stepIndex));
    frames++;
  }
  return frames;
}

/** Decode an IMA ADPCM WAV (parseWavHeader result) to interleaved float. */
export function decodeImaAdpcmWav(
  b: Uint8Array,
  channels: number,
  dataOffset: number,
  dataSize: number,
  blockAlign: number,
): Float32Array | null {
  if (blockAlign < channels * 4) return null;
  const avail = Math.min(dataSize, b.length - dataOffset);
  const numBlocks = Math.floor(avail / blockAlign);
  if (numBlocks < 1) return null;

  // Frames per block from the spec: (blockAlign - channels*4) * 2 / channels
  // + 1 (the predictor sample in the header is NOT counted by most writers;
  // Windows writes framesPerBlock = (blockSize/channels - 4) * 2 + 1 per
  // channel — we produce the same count from the nibble data).
  const framesPerBlock = Math.floor(((blockAlign - channels * 4) * 2) / channels) + 1;
  const out = new Float32Array(numBlocks * framesPerBlock * channels);
  let written = 0;

  for (let blk = 0; blk < numBlocks; blk++) {
    const blockOff = dataOffset + blk * blockAlign;
    const blockFrames = decodeImaBlock(
      b, blockOff, blockAlign, channels, 0,
      out, written * channels,
    );
    if (channels === 2) {
      decodeImaBlock(b, blockOff, blockAlign, channels, 1, out, written * channels);
    }
    written += blockFrames;
  }
  return out.subarray(0, written * channels);
}

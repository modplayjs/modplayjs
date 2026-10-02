// SPDX-License-Identifier: BSD-3-Clause
// Minimal RIFF/WAVE PCM decoder for streamed playback.

export interface WavInfo {
  channels: number;
  sampleRate: number;
  frames: number;
  dataOffset: number;
  bitsPerSample: number;
}

export function parseWavHeader(b: Uint8Array): WavInfo | null {
  if (b.length < 44) return null;
  if (b[0] !== 0x52 || b[1] !== 0x49 || b[2] !== 0x46 || b[3] !== 0x46) return null; // RIFF
  if (b[8] !== 0x57 || b[9] !== 0x41 || b[10] !== 0x56 || b[11] !== 0x45) return null; // WAVE
  let pos = 12;
  let channels = 0, sampleRate = 0, bitsPerSample = 0, dataOffset = -1, dataSize = 0;
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  while (pos + 8 <= b.length) {
    const id = String.fromCharCode(b[pos]!, b[pos + 1]!, b[pos + 2]!, b[pos + 3]!);
    const size = dv.getUint32(pos + 4, true);
    if (id === 'fmt ') {
      channels = dv.getUint16(pos + 10, true);
      sampleRate = dv.getUint32(pos + 12, true);
      bitsPerSample = dv.getUint16(pos + 22, true);
    } else if (id === 'data') {
      dataOffset = pos + 8;
      dataSize = size;
    }
    pos += 8 + size + (size & 1);
  }
  if (dataOffset < 0 || channels === 0 || sampleRate === 0) return null;
  const bytesPerFrame = channels * (bitsPerSample / 8);
  const frames = Math.floor(dataSize / bytesPerFrame);
  return { channels, sampleRate, frames, dataOffset, bitsPerSample };
}

/** Decode the whole WAV to interleaved float [-1,1]. */
export function decodeWav(b: Uint8Array): { pcm: Float32Array; channels: number; sampleRate: number } | null {
  const info = parseWavHeader(b);
  if (!info) return null;
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  const bytesPerSample = info.bitsPerSample / 8;
  const frames = info.frames;
  const pcm = new Float32Array(frames * info.channels);
  let o = 0;
  for (let i = 0; i < frames; i++) {
    for (let c = 0; c < info.channels; c++) {
      const off = info.dataOffset + (i * info.channels + c) * bytesPerSample;
      let v = 0;
      if (info.bitsPerSample === 16) v = dv.getInt16(off, true) / 32768;
      else if (info.bitsPerSample === 8) v = (b[off]! - 128) / 128;
      else if (info.bitsPerSample === 24) {
        const x = b[off]! | (b[off + 1]! << 8) | (b[off + 2]! << 16);
        v = ((x << 8) >> 8) / 8388608;
      } else if (info.bitsPerSample === 32) {
        v = dv.getInt32(off, true) / 2147483648;
      }
      pcm[o++] = v;
    }
  }
  return { pcm, channels: info.channels, sampleRate: info.sampleRate };
}

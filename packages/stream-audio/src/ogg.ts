// SPDX-License-Identifier: BSD-3-Clause
// Whole-file Ogg Vorbis decode via the stb-vorbis port.
import { stbVorbisOpenMemory, stbVorbisGetFrameFloat } from '@modplayjs/stb-vorbis/vorbis.js';

export function decodeOggFile(b: Uint8Array): { pcm: Float32Array; channels: number; sampleRate: number } | null {
  const err = { v: 0 };
  const f = stbVorbisOpenMemory(b, err);
  if (!f) return null;
  const chunks: Float32Array[] = [];
  let total = 0;
  const len = { v: 0 };
  for (;;) {
    const outputs = stbVorbisGetFrameFloat(f, len);
    if (!outputs || len.v === 0) break;
    for (let i = 0; i < len.v * f.channels; ++i) {
      // accumulate per-frame
    }
    const frame = new Float32Array(len.v * f.channels);
    for (let ch = 0; ch < f.channels; ++ch) {
      const src = outputs[ch]!;
      for (let j = 0; j < len.v; ++j) frame[j * f.channels + ch] = src[j]!;
    }
    chunks.push(frame);
    total += frame.length;
  }
  if (total === 0) return null;
  const all = new Float32Array(total);
  let o = 0;
  for (const c of chunks) { all.set(c, o); o += c.length; }
  return { pcm: all, channels: f.channels, sampleRate: f.sampleRate };
}

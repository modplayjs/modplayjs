// SPDX-License-Identifier: BSD-3-Clause
// Whole-file MP3 decode via the minimp3 L3 port (from fmt-mo3).
import { mp3decInit, mp3decDecodeFrame } from '@modplayjs/fmt-mo3';

export function decodeMp3File(b: Uint8Array): { pcm: Int16Array; channels: number; sampleRate: number } | null {
  const dec = {
    mdctOverlap: [new Float32Array(288), new Float32Array(288)],
    qmfState: new Float32Array(960),
    reserv: 0, freeFormatBytes: 0,
    header: new Uint8Array(4), reservBuf: new Uint8Array(511),
  };
  mp3decInit(dec);
  const pcm = new Int16Array(1152 * 2);
  const info = { frameBytes: 0, channels: 0, hz: 0, layer: 0, bitrateKbps: 0 };
  const chunks: Int16Array[] = [];
  let pos = 0, total = 0, channels = 0, hz = 0;
  let bytesLeft = b.length;
  do {
    const n = mp3decDecodeFrame(dec, b.subarray(pos), bytesLeft, pcm, info);
    if (n < 0 || info.frameBytes < 0) break;
    if (n > 0 && info.frameBytes === 0) break;
    if (n === 0 && info.frameBytes === 0) break;
    if (info.frameBytes > 0) {
      if (hz !== 0 && hz !== info.hz) break;
      if (channels !== 0 && channels !== info.channels) break;
      hz = info.hz;
      channels = info.channels;
      const advance = Math.min(Math.max(info.frameBytes, 0), bytesLeft);
      pos += advance;
      bytesLeft -= advance;
      if (n > 0) { chunks.push(pcm.slice(0, n * channels)); total += n * channels; }
    }
  } while (bytesLeft > 0);
  if (total === 0) return null;
  const all = new Int16Array(total);
  let o = 0;
  for (const c of chunks) { all.set(c, o); o += c.length; }
  return { pcm: all, channels: channels || 1, sampleRate: hz };
}

// SPDX-License-Identifier: BSD-3-Clause
// Streamed-audio playback shim: decodes a whole MP3/WAV/OGG file and
// exposes a Core-like playBuffer(out, size, loop) so out-webaudio can pull
// it exactly like a tracker module (interleaved stereo floats).

import { decodeWav } from './wav.js';
import { decodeMp3File } from './mp3.js';
import { decodeOggFile } from './ogg.js';

export interface StreamedSource {
  /** Interleaved stereo float pull, mirroring Core.playBuffer semantics:
   *  fills `out` (≤ size floats), returns the number of floats written
   *  (0 = end of stream). */
  playBuffer(out: Float32Array, size: number, loop?: number): number;
  readonly channels: number;
  readonly sampleRate: number;
  readonly duration: number;
}

export type StreamedFormat = 'wav' | 'mp3' | 'ogg';

export function detectStreamedFormat(bytes: Uint8Array, name?: string): StreamedFormat | null {
  // Tracker modules misnamed .wav/.mp3 in keygen packs: sniff the module
  // magics first (XM 'Extended Module: ', 31-sample MOD 'M.K.' at 1080,
  // IT 'IMPM', S3M 'SCRM' at 0x1c44-ish, MO3).
  if (bytes.length > 38 && bytes[0] === 0x45 && bytes[1] === 0x78 && bytes[2] === 0x74 && bytes[3] === 0x65) return null; // 'Exte' = XM
  if (bytes.length > 1084) {
    const mk = String.fromCharCode(bytes[1080]!, bytes[1081]!, bytes[1082]!, bytes[1083]!);
    if (mk === 'M.K.' || mk === 'M!K!' || mk === '4CHN' || mk === '6CHN' || mk === '8CHN' || mk === 'FLT4' || mk === 'FLT8') return null; // MOD family
  }
  if (bytes.length > 4 && bytes[0] === 0x49 && bytes[1] === 0x4d && bytes[2] === 0x50 && bytes[3] === 0x4d) return null; // IMPM = IT
  if (bytes.length > 8 && bytes[0] === 0x4d && bytes[1] === 0x4f && bytes[2] === 0x33) return null; // MO3
  if (bytes.length > 12 && bytes[0] === 0x52 && bytes[1] === 0x49 && bytes[2] === 0x46 && bytes[3] === 0x46) return 'wav';
  if (bytes.length > 4 && bytes[0] === 0x4f && bytes[1] === 0x67 && bytes[2] === 0x67 && bytes[3] === 0x53) return 'ogg';
  if (bytes.length > 2 && bytes[0] === 0xff && (bytes[1]! & 0xe0) === 0xe0) return 'mp3';
  if (bytes.length > 3 && bytes[0] === 0x49 && bytes[1] === 0x44 && bytes[2] === 0x33) return 'mp3'; // ID3
  if (name) {
    const ext = name.slice(name.lastIndexOf('.') + 1).toLowerCase();
    if (ext === 'wav' || ext === 'mp3' || ext === 'ogg') return ext;
  }
  return null;
}

/** Decode a streamed-audio file (WAV/MP3/OGG) into interleaved stereo. */
export function decodeStreamed(bytes: Uint8Array, format: StreamedFormat): { pcm: Float32Array; channels: number; sampleRate: number } | null {
  if (format === 'wav') {
    const r = decodeWav(bytes);
    if (!r) return null;
    return { pcm: r.pcm, channels: r.channels, sampleRate: r.sampleRate };
  }
  if (format === 'mp3') {
    const r = decodeMp3File(bytes);
    if (!r) return null;
    // mono → stereo interleave (output path is stereo)
    if (r.channels === 1) {
      const frames = r.pcm.length;
      const st = new Float32Array(frames * 2);
      for (let i = 0; i < frames; i++) {
        const v = r.pcm[i]! / 32768;
        st[i * 2] = v;
        st[i * 2 + 1] = v;
      }
      return { pcm: st, channels: 2, sampleRate: r.sampleRate };
    }
    const st = new Float32Array(r.pcm.length);
    for (let i = 0; i < r.pcm.length; i++) st[i] = r.pcm[i]! / 32768;
    return { pcm: st, channels: r.channels, sampleRate: r.sampleRate };
  }
  // ogg
  const r = decodeOggFile(bytes);
  if (!r) return null;
  if (r.channels === 2) return r;
  const frames = r.pcm.length / r.channels;
  const st = new Float32Array(frames * 2);
  for (let i = 0; i < frames; i++) {
    const v = r.pcm[i * r.channels]!;
    st[i * 2] = v;
    st[i * 2 + 1] = r.channels > 1 ? r.pcm[i * r.channels + 1]! : v;
  }
  return { pcm: st, channels: 2, sampleRate: r.sampleRate };
}

export function createStreamedSource(bytes: Uint8Array, format: StreamedFormat, outputRate: number): StreamedSource | null {
  const decoded = decodeStreamed(bytes, format);
  if (!decoded) return null;
  // Resample to the output rate if needed (linear).
  let pcm = decoded.pcm;
  const inRate = decoded.sampleRate;
  if (inRate !== outputRate) {
    const ratio = outputRate / inRate;
    const frames = decoded.pcm.length / decoded.channels;
    const outFrames = Math.floor(frames * ratio);
    const resampled = new Float32Array(outFrames * decoded.channels);
    for (let i = 0; i < outFrames; i++) {
      const src = i / ratio;
      const i0 = Math.floor(src);
      const frac = src - i0;
      const i1 = Math.min(i0 + 1, frames - 1);
      for (let c = 0; c < decoded.channels; c++) {
        resampled[i * decoded.channels + c] =
          decoded.pcm[i0 * decoded.channels + c]! * (1 - frac) +
          decoded.pcm[i1 * decoded.channels + c]! * frac;
      }
    }
    pcm = resampled;
  }
  const total = pcm.length;
  let playPos = 0;
  const playBuffer = (out: Float32Array, size: number, loop?: number): number => {
      const framesWanted = Math.floor(size / 2);
      const remaining = Math.floor((total - playPos) / 2);
      const frames = Math.min(framesWanted, remaining);
      if (frames <= 0) {
        if (loop) {
          playPos = 0;
          return playBuffer(out, size, loop);
        }
        return 0;
      }
      for (let i = 0; i < frames * 2; i++) out[i] = pcm[playPos + i]!;
      playPos += frames * 2;
      for (let i = frames * 2; i < size; i++) out[i] = 0;
      return frames * 2;
  };
  return {
    channels: decoded.channels,
    sampleRate: outputRate,
    duration: total / (decoded.channels * outputRate),
    playBuffer,
  };
}

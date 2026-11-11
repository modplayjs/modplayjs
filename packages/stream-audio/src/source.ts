// SPDX-License-Identifier: BSD-3-Clause
// Streamed-audio playback shim: decodes a whole MP3/WAV/OGG file and
// exposes a Core-like playBuffer(out, size, loop) so out-webaudio can pull
// it exactly like a tracker module (interleaved stereo floats).

import { decodeWav } from './wav.js';
import { decodeMp3File } from './mp3.js';
import { decodeOggFile } from './ogg.js';

/** Longest file the whole-buffer decoder accepts; see createStreamedSource. */
const MAX_DECODED_MS = 20 * 60 * 1000;

export interface StreamedSource {
  /** Interleaved stereo float pull, mirroring Core.playBuffer semantics:
   *  fills `out` (≤ size floats), returns the number of floats written
   *  (0 = end of stream). */
  playBuffer(out: Float32Array, size: number, loop?: number): number;
  /** Seek to a millisecond offset into the resampled stream. */
  seek(ms: number): void;
  readonly channels: number;
  readonly sampleRate: number;
  /**
   * Length in milliseconds, or 0 when the file gave no usable header.
   *
   * Milliseconds, not seconds: every consumer is a UI that formats mm:ss, and
   * the previous `duration` was seconds while callers treated it as ms - a
   * three-minute file advertised itself as 180 ms.
   */
  readonly durationMs: number;
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

  // The player pulls interleaved stereo (two floats per frame); a mono or
  // multichannel file would be consumed at the wrong rate and land the seek
  // on the wrong frame. Normalise here, once, so every reading path below can
  // assume two channels.
  let pcm = decoded.pcm;
  if (decoded.channels !== 2) {
    const srcChannels = decoded.channels;
    const frames = pcm.length / srcChannels;
    const stereo = new Float32Array(frames * 2);
    for (let i = 0; i < frames; i++) {
      const left = pcm[i * srcChannels]!;
      const right = srcChannels > 1 ? pcm[i * srcChannels + 1]! : left;
      stereo[i * 2] = left;
      stereo[i * 2 + 1] = right;
    }
    pcm = stereo;
  }

  const inRate = decoded.sampleRate;
  const totalFrames = pcm.length / 2;
  const durationMs = Math.round((totalFrames / inRate) * 1000);

  // A whole file is decoded into one buffer, so length is memory. Beyond this
  // the V8 heap runs out mid-load and takes the app down instead of reporting
  // a load error; twenty minutes of stereo at 44-48 kHz is ~400 MB.
  if (durationMs > MAX_DECODED_MS) return null;

  // Resample while pulling instead of building a second, rate-matched copy of
  // the whole file. The old copy doubled the peak memory, which is what made
  // longer WAVs fail on the headset.
  const ratio = inRate / outputRate; // source frames per output frame
  let pos = 0; // fractional source frame
  const playBuffer = (out: Float32Array, size: number, loop?: number): number => {
    const wanted = Math.floor(size / 2);
    if (wanted <= 0) return 0;
    let written = 0;
    if (ratio === 1) {
      const start = Math.floor(pos);
      const take = Math.min(wanted, Math.max(0, totalFrames - start));
      for (let i = 0; i < take * 2; i++) out[i] = pcm[start * 2 + i]!;
      pos = start + take;
      written = take;
    } else {
      while (written < wanted) {
        if (pos >= totalFrames - 1) {
          if (loop && totalFrames > 1) {
            pos = 0;
            continue;
          }
          break;
        }
        const i0 = Math.floor(pos);
        const i1 = Math.min(i0 + 1, totalFrames - 1);
        const frac = pos - i0;
        out[written * 2] = pcm[i0 * 2]! * (1 - frac) + pcm[i1 * 2]! * frac;
        out[written * 2 + 1] = pcm[i0 * 2 + 1]! * (1 - frac) + pcm[i1 * 2 + 1]! * frac;
        pos += ratio;
        written++;
      }
    }
    for (let i = written * 2; i < size; i++) out[i] = 0;
    return written * 2;
  };
  const seek = (ms: number): void => {
    // pos is a source frame, not an interleaved float index. Multiplying by
    // the channel count and then by two again put a 50 % seek at the end.
    const frame = (Math.max(0, ms) / 1000) * inRate;
    pos = Math.max(0, Math.min(totalFrames, frame));
  };
  return {
    channels: 2,
    sampleRate: inRate,
    durationMs,
    playBuffer,
    seek,
  };
}

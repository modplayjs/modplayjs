// out-pcm: offline PCM capture + 16-bit WAV encoder.
//
// start(core) drives the core through playBuffer (xmp_play_buffer pull
// loop, player.c:2178-2233) accumulating interleaved stereo frames.
// getWav() encodes per reference/Paula-Tracker/paulalib/sampleutils.js
// :102-144 (encodeWAV, 16-bit PCM) extended to stereo (2 channels).

import type { Core, OutputPlugin } from '@modplayjs/core';

/** Encode interleaved stereo float [-1,1] to a 16-bit PCM WAV file
 * (sampleutils.js:102-144 layout: 44-byte RIFF/WAVE header, fmt chunk
 * PCM/16-bit/stereo, data chunk). sampleRate = the core's output rate. */
export function encodeWavStereo(
  pcm: Float32Array,
  sampleRate: number,
): Uint8Array {
  const numChannels = 2;
  const bytesPerSample = 2; // 16-bit
  const numSamples = pcm.length; // interleaved total samples (frames × 2)
  const byteRate = sampleRate * numChannels * bytesPerSample;
  const blockAlign = numChannels * bytesPerSample;
  const dataSize = numSamples * bytesPerSample;
  const fileSize = 44 + dataSize;

  const data = new Uint8Array(fileSize);
  const view = new DataView(data.buffer);

  const writeString = (offset: number, s: string): void => {
    for (let i = 0; i < s.length; i++) data[offset + i] = s.charCodeAt(i);
  };

  // RIFF chunk
  writeString(0, 'RIFF');
  view.setUint32(4, fileSize - 8, true);
  writeString(8, 'WAVE');

  // fmt chunk
  writeString(12, 'fmt ');
  view.setUint32(16, 16, true); // Chunk size
  view.setUint16(20, 1, true); // Audio format (PCM)
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true); // Bits per sample

  // data chunk
  writeString(36, 'data');
  view.setUint32(40, dataSize, true);

  // Samples: clamp to [-1,1], scale to int16 (floor like the reference)
  let offset = 44;
  for (let i = 0; i < numSamples; i++) {
    const sample = Math.max(-1, Math.min(1, pcm[i]!));
    const int16 = Math.floor(sample * 32767);
    view.setInt16(offset, int16, true);
    offset += 2;
  }

  return data;
}

export class PcmOutput implements OutputPlugin {
  readonly name = 'pcm';

  private core: Core | null = null;
  private pcm: Float32Array = new Float32Array(0);
  private sampleRate = 44100;
  private running = false;

  /** Begin output: capture the core and its output rate. */
  start(core: Core): void {
    this.core = core;
    this.sampleRate = core.sampleRate;
    this.pcm = new Float32Array(0);
    this.running = true;
    // One shot: render the whole module now (offline capture path).
    this.renderAll();
  }

  /** Stop output (no-op for the offline path — rendering is synchronous). */
  stop(): void {
    this.running = false;
  }

  /** Render until the module ends (playBuffer returns 0 samples). */
  private renderAll(): void {
    const core = this.core;
    if (!core) return;
    const chunks: Float32Array[] = [];
    const chunkFrames = Math.max(1, Math.ceil(this.sampleRate / 10)); // ~100ms
    const chunkSize = chunkFrames * 2; // interleaved stereo
    const out = new Float32Array(chunkSize);
    let total = 0;
    while (this.running) {
      // xmp_play_buffer contract: -1 when the module ends
      // (player.c:2178-2233); playBuffer returns samples written.
      const n = core.playBuffer(out, chunkSize);
      if (n <= 0) break;
      chunks.push(out.slice(0, n));
      total += n;
      // Safety: hard cap ~10 minutes at the output rate (frames×2).
    }
    const merged = new Float32Array(total);
    let off = 0;
    for (const c of chunks) {
      merged.set(c, off);
      off += c.length;
    }
    this.pcm = merged;
  }

  /** Interleaved stereo PCM captured so far (or after start). */
  getPcm(): Float32Array {
    return this.pcm;
  }

  /** 16-bit PCM WAV encoding of the captured PCM. */
  getWav(): Uint8Array {
    return encodeWavStereo(this.pcm, this.sampleRate);
  }
}

export function createPcmOutput(): PcmOutput {
  return new PcmOutput();
}

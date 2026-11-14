// packages/out-pcm/src/pcm.ts
function encodeWavStereo(pcm, sampleRate) {
  const numChannels = 2;
  const bytesPerSample = 2;
  const numSamples = pcm.length;
  const byteRate = sampleRate * numChannels * bytesPerSample;
  const blockAlign = numChannels * bytesPerSample;
  const dataSize = numSamples * bytesPerSample;
  const fileSize = 44 + dataSize;
  const data = new Uint8Array(fileSize);
  const view = new DataView(data.buffer);
  const writeString = (offset2, s) => {
    for (let i = 0; i < s.length; i++) data[offset2 + i] = s.charCodeAt(i);
  };
  writeString(0, "RIFF");
  view.setUint32(4, fileSize - 8, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, byteRate, true);
  view.setUint16(32, blockAlign, true);
  view.setUint16(34, 16, true);
  writeString(36, "data");
  view.setUint32(40, dataSize, true);
  let offset = 44;
  for (let i = 0; i < numSamples; i++) {
    const sample = Math.max(-1, Math.min(1, pcm[i]));
    let int16 = Math.round(sample * 32768);
    if (int16 > 32767) int16 = 32767;
    else if (int16 < -32768) int16 = -32768;
    view.setInt16(offset, int16, true);
    offset += 2;
  }
  return data;
}
var PcmOutput = class {
  name = "pcm";
  core = null;
  pcm = new Float32Array(0);
  sampleRate = 44100;
  running = false;
  /** Begin output: capture the core and its output rate. */
  start(core) {
    this.core = core;
    this.sampleRate = core.sampleRate;
    this.pcm = new Float32Array(0);
    this.running = true;
    this.renderAll();
  }
  /** Stop output (no-op for the offline path — rendering is synchronous). */
  stop() {
    this.running = false;
  }
  /** Render until the module ends (playBuffer returns 0 samples). */
  renderAll() {
    const core = this.core;
    if (!core) return;
    const chunks = [];
    const chunkFrames = Math.max(1, Math.ceil(this.sampleRate / 10));
    const chunkSize = chunkFrames * 2;
    const out = new Float32Array(chunkSize);
    let total = 0;
    while (this.running) {
      const n = core.playBuffer(out, chunkSize);
      if (n <= 0) break;
      chunks.push(out.slice(0, n));
      total += n;
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
  getPcm() {
    return this.pcm;
  }
  /** 16-bit PCM WAV encoding of the captured PCM. */
  getWav() {
    return encodeWavStereo(this.pcm, this.sampleRate);
  }
};
function createPcmOutput() {
  return new PcmOutput();
}
export {
  PcmOutput,
  createPcmOutput,
  encodeWavStereo
};

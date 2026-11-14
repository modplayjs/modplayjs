// ../../packages/stream-audio/src/adpcm.ts
var IMA_STEP_TABLE = [
  7,
  8,
  9,
  10,
  11,
  12,
  13,
  14,
  16,
  17,
  19,
  21,
  23,
  25,
  28,
  31,
  34,
  37,
  41,
  45,
  50,
  55,
  60,
  66,
  73,
  80,
  88,
  97,
  107,
  118,
  130,
  143,
  157,
  173,
  190,
  209,
  230,
  253,
  279,
  307,
  337,
  371,
  408,
  449,
  494,
  544,
  598,
  658,
  724,
  796,
  876,
  963,
  1060,
  1166,
  1282,
  1411,
  1552,
  1707,
  1878,
  2066,
  2272,
  2499,
  2749,
  3024,
  3327,
  3660,
  4026,
  4428,
  4871,
  5358,
  5894,
  6484,
  7132,
  7845,
  8630,
  9493,
  10442,
  11487,
  12635,
  13899,
  15289,
  16818,
  18500,
  20350,
  22385,
  24623,
  27086,
  29794,
  32767
];
var IMA_INDEX_TABLE = [
  -1,
  -1,
  -1,
  -1,
  2,
  4,
  6,
  8,
  -1,
  -1,
  -1,
  -1,
  2,
  4,
  6,
  8
];
function decodeImaBlock(b, blockOff, blockSize, channels, chn, out, outOff) {
  const hdr = blockOff + chn * 4;
  let predictor = b[hdr] | b[hdr + 1] << 8;
  predictor = predictor << 16 >> 16;
  let stepIndex = b[hdr + 2];
  if (stepIndex > 88) stepIndex = 88;
  const dataOff = blockOff + channels * 4;
  const dataEnd = blockOff + blockSize;
  const framesPerBlock = (blockSize - channels * 4) * 2 / channels;
  let frames = 0;
  for (let i = 0; i < framesPerBlock && dataOff + (i >> 1) < dataEnd; i++) {
    const byteIdx = dataOff + Math.floor(i / channels) * channels + chn;
    const byte = b[byteIdx] ?? 0;
    const nibble = i % 2 === 0 ? byte & 15 : byte >> 4 & 15;
    let step = IMA_STEP_TABLE[stepIndex];
    let diff = step >> 3;
    if (nibble & 4) diff += step;
    if (nibble & 2) diff += step >> 1;
    if (nibble & 1) diff += step >> 2;
    if (nibble & 8) diff = -diff;
    predictor += diff;
    predictor = Math.max(-32768, Math.min(32767, predictor));
    out[outOff + i * channels] = predictor / 32768;
    stepIndex += IMA_INDEX_TABLE[nibble];
    stepIndex = Math.max(0, Math.min(88, stepIndex));
    frames++;
  }
  return frames;
}
function decodeImaAdpcmWav(b, channels, dataOffset, dataSize, blockAlign) {
  if (blockAlign < channels * 4) return null;
  const avail = Math.min(dataSize, b.length - dataOffset);
  const numBlocks = Math.floor(avail / blockAlign);
  if (numBlocks < 1) return null;
  const framesPerBlock = Math.floor((blockAlign - channels * 4) * 2 / channels) + 1;
  const out = new Float32Array(numBlocks * framesPerBlock * channels);
  let written = 0;
  for (let blk = 0; blk < numBlocks; blk++) {
    const blockOff = dataOffset + blk * blockAlign;
    const blockFrames = decodeImaBlock(
      b,
      blockOff,
      blockAlign,
      channels,
      0,
      out,
      written * channels
    );
    if (channels === 2) {
      decodeImaBlock(b, blockOff, blockAlign, channels, 1, out, written * channels);
    }
    written += blockFrames;
  }
  return out.subarray(0, written * channels);
}

// ../../packages/stream-audio/src/wav.ts
function parseWavHeader(b) {
  if (b.length < 44) return null;
  if (b[0] !== 82 || b[1] !== 73 || b[2] !== 70 || b[3] !== 70) return null;
  if (b[8] !== 87 || b[9] !== 65 || b[10] !== 86 || b[11] !== 69) return null;
  let pos = 12;
  let channels = 0, sampleRate = 0, bitsPerSample = 0, dataOffset = -1, dataSize = 0;
  let formatTag = 1;
  const dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  while (pos + 8 <= b.length) {
    const id = String.fromCharCode(b[pos], b[pos + 1], b[pos + 2], b[pos + 3]);
    const size = dv.getUint32(pos + 4, true);
    if (id === "fmt " && pos + 16 + 8 <= b.length) {
      formatTag = dv.getUint16(pos + 8, true);
      channels = dv.getUint16(pos + 10, true);
      sampleRate = dv.getUint32(pos + 12, true);
      bitsPerSample = dv.getUint16(pos + 22, true);
    } else if (id === "data") {
      dataOffset = pos + 8;
      dataSize = size;
    }
    pos += 8 + size + (size & 1);
  }
  if (dataOffset < 0 || channels === 0 || sampleRate === 0) return null;
  const isImaAdpcm = formatTag === 17 || formatTag === 65534 && bitsPerSample === 4;
  if (!isImaAdpcm && bitsPerSample !== 8 && bitsPerSample !== 16 && bitsPerSample !== 24 && bitsPerSample !== 32) return null;
  const bytesPerFrame = channels * (bitsPerSample / 8);
  if (bytesPerFrame === 0) return null;
  const avail = Math.max(0, Math.min(dataSize, b.length - dataOffset));
  const frames = Math.floor(avail / bytesPerFrame);
  if (!isImaAdpcm && frames <= 0) return null;
  return { channels, sampleRate, frames, dataOffset, bitsPerSample, formatTag };
}
function decodeWav(b) {
  const info = parseWavHeader(b);
  if (!info) return null;
  if (info.formatTag === 17 || info.formatTag === 65534 && info.bitsPerSample === 4) {
    const dv0 = new DataView(b.buffer, b.byteOffset, b.byteLength);
    let p0 = 12;
    let blockAlign = 0;
    while (p0 + 8 <= b.length) {
      const id = String.fromCharCode(b[p0], b[p0 + 1], b[p0 + 2], b[p0 + 3]);
      const size = dv0.getUint32(p0 + 4, true);
      if (id === "fmt ") blockAlign = dv0.getUint16(p0 + 20, true);
      if (id === "data") break;
      p0 += 8 + size + (size & 1);
    }
    const pcm2 = decodeImaAdpcmWav(b, info.channels, info.dataOffset, info.frames * info.channels, blockAlign);
    if (!pcm2) return null;
    return { pcm: pcm2, channels: info.channels, sampleRate: info.sampleRate };
  }
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
      else if (info.bitsPerSample === 8) v = (b[off] - 128) / 128;
      else if (info.bitsPerSample === 24) {
        const x = b[off] | b[off + 1] << 8 | b[off + 2] << 16;
        v = (x << 8 >> 8) / 8388608;
      } else if (info.bitsPerSample === 32) {
        v = info.formatTag === 3 ? dv.getFloat32(off, true) : dv.getInt32(off, true) / 2147483648;
      }
      pcm[o++] = v;
    }
  }
  return { pcm, channels: info.channels, sampleRate: info.sampleRate };
}

// ../../packages/stream-audio/src/mp3.ts
import { mp3decInit, mp3decDecodeFrame } from "@modplayjs/fmt-mo3";
function decodeMp3File(b) {
  const dec = {
    mdctOverlap: [new Float32Array(288), new Float32Array(288)],
    qmfState: new Float32Array(960),
    reserv: 0,
    freeFormatBytes: 0,
    header: new Uint8Array(4),
    reservBuf: new Uint8Array(511)
  };
  mp3decInit(dec);
  const pcm = new Int16Array(1152 * 2);
  const info = { frameBytes: 0, channels: 0, hz: 0, layer: 0, bitrateKbps: 0 };
  const chunks = [];
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
      if (n > 0) {
        chunks.push(pcm.slice(0, n * channels));
        total += n * channels;
      }
    }
  } while (bytesLeft > 0);
  if (total === 0) return null;
  const all = new Int16Array(total);
  let o = 0;
  for (const c of chunks) {
    all.set(c, o);
    o += c.length;
  }
  return { pcm: all, channels: channels || 1, sampleRate: hz };
}

// ../../packages/stream-audio/src/ogg.ts
import { stbVorbisOpenMemory, stbVorbisGetFrameFloat } from "@modplayjs/stb-vorbis";
function decodeOggFile(b) {
  const err = { v: 0 };
  const f = stbVorbisOpenMemory(b, err);
  if (!f) return null;
  const chunks = [];
  let total = 0;
  const len = { v: 0 };
  for (; ; ) {
    const outputs = stbVorbisGetFrameFloat(f, len);
    if (!outputs || len.v === 0) break;
    for (let i = 0; i < len.v * f.channels; ++i) {
    }
    const frame = new Float32Array(len.v * f.channels);
    for (let ch = 0; ch < f.channels; ++ch) {
      const src = outputs[ch];
      for (let j = 0; j < len.v; ++j) frame[j * f.channels + ch] = src[j];
    }
    chunks.push(frame);
    total += frame.length;
  }
  if (total === 0) return null;
  const all = new Float32Array(total);
  let o = 0;
  for (const c of chunks) {
    all.set(c, o);
    o += c.length;
  }
  return { pcm: all, channels: f.channels, sampleRate: f.sampleRate };
}

// ../../packages/stream-audio/src/source.ts
var MAX_DECODED_MS = 20 * 60 * 1e3;
function detectStreamedFormat(bytes, name) {
  if (bytes.length > 38 && bytes[0] === 69 && bytes[1] === 120 && bytes[2] === 116 && bytes[3] === 101) return null;
  if (bytes.length > 1084) {
    const mk = String.fromCharCode(bytes[1080], bytes[1081], bytes[1082], bytes[1083]);
    if (mk === "M.K." || mk === "M!K!" || mk === "4CHN" || mk === "6CHN" || mk === "8CHN" || mk === "FLT4" || mk === "FLT8") return null;
  }
  if (bytes.length > 4 && bytes[0] === 73 && bytes[1] === 77 && bytes[2] === 80 && bytes[3] === 77) return null;
  if (bytes.length > 8 && bytes[0] === 77 && bytes[1] === 79 && bytes[2] === 51) return null;
  if (bytes.length > 12 && bytes[0] === 82 && bytes[1] === 73 && bytes[2] === 70 && bytes[3] === 70) return "wav";
  if (bytes.length > 4 && bytes[0] === 79 && bytes[1] === 103 && bytes[2] === 103 && bytes[3] === 83) return "ogg";
  if (bytes.length > 2 && bytes[0] === 255 && (bytes[1] & 224) === 224) return "mp3";
  if (bytes.length > 3 && bytes[0] === 73 && bytes[1] === 68 && bytes[2] === 51) return "mp3";
  if (name) {
    const ext = name.slice(name.lastIndexOf(".") + 1).toLowerCase();
    if (ext === "wav" || ext === "mp3" || ext === "ogg") return ext;
  }
  return null;
}
function decodeStreamed(bytes, format) {
  if (format === "wav") {
    const r2 = decodeWav(bytes);
    if (!r2) return null;
    return { pcm: r2.pcm, channels: r2.channels, sampleRate: r2.sampleRate };
  }
  if (format === "mp3") {
    const r2 = decodeMp3File(bytes);
    if (!r2) return null;
    if (r2.channels === 1) {
      const frames2 = r2.pcm.length;
      const st3 = new Float32Array(frames2 * 2);
      for (let i = 0; i < frames2; i++) {
        const v = r2.pcm[i] / 32768;
        st3[i * 2] = v;
        st3[i * 2 + 1] = v;
      }
      return { pcm: st3, channels: 2, sampleRate: r2.sampleRate };
    }
    const st2 = new Float32Array(r2.pcm.length);
    for (let i = 0; i < r2.pcm.length; i++) st2[i] = r2.pcm[i] / 32768;
    return { pcm: st2, channels: r2.channels, sampleRate: r2.sampleRate };
  }
  const r = decodeOggFile(bytes);
  if (!r) return null;
  if (r.channels === 2) return r;
  const frames = r.pcm.length / r.channels;
  const st = new Float32Array(frames * 2);
  for (let i = 0; i < frames; i++) {
    const v = r.pcm[i * r.channels];
    st[i * 2] = v;
    st[i * 2 + 1] = r.channels > 1 ? r.pcm[i * r.channels + 1] : v;
  }
  return { pcm: st, channels: 2, sampleRate: r.sampleRate };
}
function createStreamedSource(bytes, format, outputRate) {
  const decoded = decodeStreamed(bytes, format);
  if (!decoded) return null;
  let pcm = decoded.pcm;
  if (decoded.channels !== 2) {
    const srcChannels = decoded.channels;
    const frames = pcm.length / srcChannels;
    const stereo = new Float32Array(frames * 2);
    for (let i = 0; i < frames; i++) {
      const left = pcm[i * srcChannels];
      const right = srcChannels > 1 ? pcm[i * srcChannels + 1] : left;
      stereo[i * 2] = left;
      stereo[i * 2 + 1] = right;
    }
    pcm = stereo;
  }
  const inRate = decoded.sampleRate;
  const totalFrames = pcm.length / 2;
  const durationMs = Math.round(totalFrames / inRate * 1e3);
  if (durationMs > MAX_DECODED_MS) return null;
  const ratio = inRate / outputRate;
  let pos = 0;
  const playBuffer = (out, size, loop) => {
    const wanted = Math.floor(size / 2);
    if (wanted <= 0) return 0;
    let written = 0;
    if (ratio === 1) {
      const start = Math.floor(pos);
      const take = Math.min(wanted, Math.max(0, totalFrames - start));
      for (let i = 0; i < take * 2; i++) out[i] = pcm[start * 2 + i];
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
        out[written * 2] = pcm[i0 * 2] * (1 - frac) + pcm[i1 * 2] * frac;
        out[written * 2 + 1] = pcm[i0 * 2 + 1] * (1 - frac) + pcm[i1 * 2 + 1] * frac;
        pos += ratio;
        written++;
      }
    }
    for (let i = written * 2; i < size; i++) out[i] = 0;
    return written * 2;
  };
  const seek = (ms) => {
    const frame = Math.max(0, ms) / 1e3 * inRate;
    pos = Math.max(0, Math.min(totalFrames, frame));
  };
  return {
    channels: 2,
    sampleRate: inRate,
    durationMs,
    playBuffer,
    seek
  };
}
export {
  createStreamedSource,
  decodeImaAdpcmWav,
  decodeMp3File,
  decodeOggFile,
  decodeWav,
  detectStreamedFormat,
  parseWavHeader
};

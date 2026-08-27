// Swappable sample store. Mirrors the conversion pipeline of
// reference/libxmp/src/loaders/sample.c libxmp_load_sample (:181-427) and
// provides runtime hot-swap (mixer.c:395-404 queued-swap semantics).
//
// Samples are stored as normalized Float32Array [-1,1). Voices reference a
// sample by ID and re-resolve the array on EVERY read, so swapSample can
// replace data underneath playing voices without restarts.

import { SampleFlags, XMP_KEY_FADE, type RawSample, type SampleData, type SampleMeta } from './model/model';
import { SampleError } from './errors';

/** Same sanity limit as libxmp MAX_SAMPLE_SIZE (common.h). */
const MAX_SAMPLE_SIZE = 0x10000000;

interface StoreEntry {
  sample: SampleData;
}

/** Decode flags carried on RawSample.flags in addition to SampleFlags bits. */
export const DecodeFlag = {
  /** SAMPLE_FLAG_DIFF: delta-encoded samples. */
  DIFF: 1 << 8,
  /** SAMPLE_FLAG_8BDIFF: byte-level delta. */
  DIFF8: 1 << 9,
  /** SAMPLE_FLAG_UNS: unsigned PCM. */
  UNSIGNED: 1 << 10,
  /** SAMPLE_FLAG_BIGEND: big-endian 16-bit. */
  BIGEND: 1 << 11,
  /** SAMPLE_FLAG_7BIT: 7-bit VIDC-style data. */
  SEVENBIT: 1 << 12,
  /** SAMPLE_FLAG_ADPCM: XM ADPCM 4-bit encoding. */
  ADPCM: 1 << 13,
  /** Data already interleaved stereo (else planar L|R). */
  INTERLEAVED: 1 << 14,
} as const;

function signedByte(b: number): number {
  return (b << 24) >> 24;
}

function clamp16(v: number): number {
  return v < -32768 ? -32768 : v > 32767 ? 32767 : v;
}

/** Delta-to-absolute over the raw view (convert_delta, sample.c:99-123). */
function convertDelta(bytes: Uint8Array, frames: number, is16bit: boolean, channels: number): void {
  if (is16bit) {
    const w = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    for (let chn = 0; chn < channels; chn++) {
      let absval = 0;
      for (let i = chn; i < frames * channels; i += channels) {
        absval = (w.getUint16(i * 2, true) + absval) & 0xffff;
        w.setUint16(i * 2, absval, true);
      }
    }
    void clamp16;
  } else {
    for (let chn = 0; chn < channels; chn++) {
      let absval = 0;
      for (let i = chn; i < frames * channels; i += channels) {
        absval = (bytes[i]! + absval) & 0xff;
        bytes[i] = absval;
      }
    }
  }
}

/** Unsigned→signed shift (convert_signal, :125-136). */
function convertSignal(bytes: Uint8Array, len: number, is16bit: boolean): void {
  if (is16bit) {
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    for (let i = 0; i < len; i++) dv.setUint16(i * 2, dv.getUint16(i * 2, true) + 0x8000 & 0xffff, true);
  } else {
    for (let i = 0; i < len; i++) bytes[i] = (bytes[i]! + 0x80) & 0xff;
  }
}

/** Endian flip for 16-bit (convert_endian, :139-150). */
function convertEndian(bytes: Uint8Array, len: number): void {
  for (let i = 0; i < len; i++) {
    const b0 = bytes[i * 2]!;
    bytes[i * 2] = bytes[i * 2 + 1]!;
    bytes[i * 2 + 1] = b0;
  }
}

/**
 * XM ADPCM decode (adpcm4_decoder, sample.c:79-97): input block holds the
 * 16-byte table followed by packed nibbles.
 */
export function adpcm4Decode(inp: Uint8Array, tab: Int8Array | null, outp: Uint8Array): void {
  const t = tab ?? (() => {
    const at = new Int8Array(16);
    for (let i = 0; i < 16; i++) at[i] = signedByte(inp[i]!) >> 2;
    return at;
  })();
  const offset = tab ? 0 : 16;
  const outLen = outp.length;
  const nibbles = (outLen + 1) >> 1;
  let delta = 0;
  for (let i = 0; i < nibbles; i++) {
    const b = inp[offset + i]!;
    delta += t[b & 0x0f]!;
    if (i * 2 < outLen) outp[i * 2] = delta & 0xff;
    delta += t[(b >> 4) & 0x0f]!;
    if (i * 2 + 1 < outLen) outp[i * 2 + 1] = delta & 0xff;
  }
}

/** IT/Schism sample parameter tables are handled by fmt-it; not here. */

/**
 * Convert a raw (byte-oriented) sample into interleaved 8-bit signed view,
 * applying the DecodeFlag conversions exactly as libxmp_load_sample does —
 * then normalize to Float32.
 */
function normalize(raw: RawSample, id: number): SampleData {
  const is16bit = (raw.flags & SampleFlags.BITS16) !== 0;
  const stereo = (raw.flags & SampleFlags.STEREO) !== 0;
  const df = raw.flags;

  // Working byte buffer (copy so delta/ADPCM never mutate caller's memory).
  let bytes = raw.data.slice(0);

  let len = raw.length;
  if (stereo && (df & DecodeFlag.INTERLEAVED) === 0) {
    // Planar → interleave AFTER per-sample conversions (sample.c comment).
  }

  // EOF-truncation semantics (sample.c:236-282): bytes shorter than declared
  // length truncate the sample to what's available (frame-aligned).
  const framelen = (is16bit ? 2 : 1) * (stereo ? 2 : 1);
  const needed = len * framelen;
  if (bytes.length < needed) {
    const avail = bytes.length - (bytes.length % framelen);
    len = avail / framelen;
  }

  // ADPCM expands nibbles before other conversions.
  if (df & DecodeFlag.ADPCM) {
    const x2 = (needed + 1) >> 1;
    const expanded = new Uint8Array(x2);
    adpcm4Decode(bytes.subarray(0), null, expanded);
    const out8 = new Uint8Array(needed);
    out8.set(expanded.subarray(0, Math.min(expanded.length, needed)));
    bytes = out8;
  }

  if (df & DecodeFlag.SEVENBIT) {
    for (let i = 0; i < bytes.length; i++) bytes[i] = (bytes[i]! << 1) & 0xff;
  }

  if (is16bit && (df & DecodeFlag.BIGEND)) convertEndian(bytes, len * (stereo ? 2 : 1));

  if (df & DecodeFlag.DIFF) {
    convertDelta(bytes, len, is16bit, stereo ? 2 : 1);
  } else if (df & DecodeFlag.DIFF8) {
    convertDelta(bytes, is16bit ? len * 2 : len, false, stereo ? 2 : 1);
  }

  if (df & DecodeFlag.UNSIGNED) convertSignal(bytes, len * (stereo ? 2 : 1) * (is16bit ? 2 : 1), is16bit);

  // Interleave planar stereo (non-interleaved layout: all L then all R).
  if (stereo && (df & DecodeFlag.INTERLEAVED) === 0) {
    const half = len * (is16bit ? 2 : 1);
    const L = bytes.subarray(0, half);
    const R = bytes.subarray(half, half * 2);
    const out = new Uint8Array(half * 2);
    const fw = is16bit ? 2 : 1;
    for (let i = 0; i < len; i++) {
      for (let b = 0; b < fw; b++) {
        out[i * fw * 2 + b] = L[i * fw + b]!;
        out[i * fw * 2 + fw + b] = R[i * fw + b]!;
      }
    }
    bytes = out;
  }

  // Normalize to Float32 mono-or-stereo interleaved [-1,1).
  const chnCount = stereo ? 2 : 1;
  const floats = new Float32Array(len * chnCount);
  if (is16bit) {
    const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
    for (let i = 0; i < len * chnCount; i++) floats[i] = clamp16(dv.getInt16(i * 2, true)) / 32768;
  } else {
    for (let i = 0; i < len * chnCount; i++) floats[i] = signedByte(bytes[i]!) / 128;
  }

  // Loop sanity (sample.c:286-300).
  let loopStart = raw.loopStart;
  let loopEnd = raw.loopEnd;
  let flags = raw.flags;
  if (loopEnd > len) loopEnd = len;
  if (loopStart >= len || loopStart >= loopEnd) {
    loopStart = loopEnd = 0;
    flags &= ~(SampleFlags.LOOP | SampleFlags.BIDIR);
  }
  if ((flags & SampleFlags.BIDIR) !== 0 && (flags & SampleFlags.LOOP) === 0) {
    flags &= ~SampleFlags.BIDIR;
  }
  let susS = raw.sustainStart;
  let susE = raw.sustainEnd;
  if ((flags & SampleFlags.SUSTAIN_BIDIR) !== 0 && (flags & SampleFlags.SUSTAIN) === 0) {
    flags &= ~SampleFlags.SUSTAIN_BIDIR;
  }
  if (susE > len) susE = len;
  if (susS >= len || susS >= susE) {
    susS = susE = 0;
    flags &= ~(SampleFlags.SUSTAIN | SampleFlags.SUSTAIN_BIDIR);
  }

  return {
    id,
    data: floats,
    length: len,
    loopStart,
    loopEnd,
    sustainStart: susS,
    sustainEnd: susE,
    finetune: raw.finetune,
    volume: raw.volume,
    flags: flags & 0xff, // keep only SampleFlags bits on stored samples
  };
}

export class SampleStore {
  private entries = new Map<number, StoreEntry>();
  private nextId = 0;

  clear(): void {
    this.entries.clear();
    this.nextId = 0;
  }

  get size(): number {
    return this.entries.size;
  }

  /** Add a raw sample from a loader; returns its stable ID. Throws on invalid input. */
  add(raw: RawSample): number {
    if (raw.length > MAX_SAMPLE_SIZE) {
      throw new SampleError(`sample too large (${raw.length} > ${MAX_SAMPLE_SIZE})`);
    }
    const id = this.nextId++;
    this.entries.set(id, { sample: normalize(raw, id) });
    return id;
  }

  /** Lookup by ID; throws typed error when unknown. */
  get(id: number): SampleData {
    const e = this.entries.get(id);
    if (!e) throw new SampleError(`unknown sample id ${id}`);
    return e.sample;
  }

  /**
   * Hot-swap: replace stored data+meta atomically. Active voices pick up the
   * new array on their next read because they resolve by ID every read
   * (mixer.c:395-404 queued-swap parity).
   */
  swap(id: number, data: Float32Array, meta?: SampleMeta): void {
    const cur = this.entries.get(id);
    if (!cur) throw new SampleError(`unknown sample id ${id}`);
    if (!data || data.length === 0) {
      throw new SampleError('swapSample requires non-empty data');
    }
    const s = cur.sample;
    s.data = data;
    s.length = meta?.length ?? data.length;
    if (meta?.length !== undefined && data.length < meta.length) {
      // Declared length may exceed buffer only via explicit meta — clamp for safety.
      s.length = data.length;
    }
    if (meta?.loopStart !== undefined) s.loopStart = meta.loopStart;
    if (meta?.loopEnd !== undefined) s.loopEnd = meta.loopEnd;
    if (meta?.sustainStart !== undefined) s.sustainStart = meta.sustainStart;
    if (meta?.sustainEnd !== undefined) s.sustainEnd = meta.sustainEnd;
    if (meta?.finetune !== undefined) s.finetune = meta.finetune;
    if (meta?.volume !== undefined) s.volume = meta.volume;
    if (meta?.flags !== undefined) s.flags = meta.flags;
    if (s.loopEnd > s.length) s.loopEnd = s.length;
    if (s.loopStart >= s.length || s.loopStart >= s.loopEnd) {
      s.loopStart = s.loopEnd = 0;
      s.flags &= ~(SampleFlags.LOOP | SampleFlags.BIDIR);
    }
    if (s.sustainEnd > s.length) s.sustainEnd = s.length;
    if (s.sustainStart >= s.length || s.sustainStart >= s.sustainEnd) {
      s.sustainStart = s.sustainEnd = 0;
      s.flags &= ~(SampleFlags.SUSTAIN | SampleFlags.SUSTAIN_BIDIR);
    }
  }

  /** Iterate stored samples (loader post-passes: MODRNG→Float32 already done here). */
  forEach(fn: (s: SampleData) => void): void {
    for (const e of this.entries.values()) fn(e.sample);
  }
}
void XMP_KEY_FADE;

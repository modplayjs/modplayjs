// Copyright (c) 2026 modplayjs contributors
//
// TypeScript port of libxmp's Pack-Ice depacker:
//   reference/libxmp/src/depackers/ice_unpack.c    (bitstream + API)
//   reference/libxmp/src/depackers/ice_unpack_fn.c (LZ decoder, x2 widths)
//   reference/libxmp/src/depackers/ice.c           (file-level glue)
//
// Pack-Ice writes the output stream BACKWARDS: decompression fills the
// destination from the end down while consuming the compressed input from
// its tail toward its head. ICE1 files carry an 8-byte tail signature
// (u32 uncompressed size, "Ice!"); ICE2 files carry a 12-byte header
// (magic, u32 compressed size == file size, u32 uncompressed size) and may
// interleave literal bytes into a 32-bit-wide bitstream.

import { PackedModuleError } from '../errors.js';

/** libxmp DEPACK_LIMIT (loader.h). */
const DEPACK_LIMIT = 0x10000000;

const ICE_BUFFER_SIZE = 4096;

/** ice_unpack.h version codes. */
const VERSION_113 = 113;
const VERSION_21X = 210;
const VERSION_21X_OR_220 = 215;
const VERSION_220 = 220;
const VERSION_23X = 230;

const ICE_OLD_MAGIC = 0x49636521; // "Ice!"
const ICE_NEW_MAGIC = 0x49434521; // "ICE!"
const CJ_MAGIC = 0x2d434a2d; // "-CJ-"
const MICK_MAGIC = 0x4d49434b; // "MICK"
const SHE_MAGIC = 0x53484521; // "SHE!"
const TMM_MAGIC = 0x544d4d21; // "TMM!"
const TSM_MAGIC = 0x54534d21; // "TSM!"

const memU32be = (b: Uint8Array, o: number): number =>
  (((b[o]! << 24) | (b[o + 1]! << 16) | (b[o + 2]! << 8) | b[o + 3]!) >>> 0);

const memU16be = (b: Uint8Array, o: number): number =>
  (b[o]! << 8) | b[o + 1]!;

const fail = (kind: string, why: string): never => {
  throw new PackedModuleError(`Pack-Ice ${kind}: ${why}`);
};

/**
 * struct ice_state. The input is consumed back-to-front: `remaining` is the
 * unread prefix length of `stream` (C's next_seek mirrored). The window
 * reproduces C's layout: after a fill, buffer[0..take) holds the newest
 * (oldest-in-stream) block followed by up to 4 preserved junction bytes;
 * reads always consume downward from bufferPos.
 */
interface IceState {
  stream: Uint8Array;
  /** Immutable compressed-stream length (C's compressed_size). */
  streamLen: number;
  /** Unread prefix length — mutated by fills, reset by initBuffer. */
  remaining: number;
  buffer: Uint8Array; // ICE_BUFFER_SIZE + 4
  bufferPos: number;
  /** Size of the next fill (final partial block first, then full). */
  nextLength: number;
  eof: boolean;
  version: number;
  uncompressedSize: number;
}

/** ice_fill_buffer (ice_unpack.c:167): pull the next (older) block. */
function fillBuffer(ice: IceState, required: number): boolean {
  if (ice.bufferPos > 4) return false;
  if (ice.bufferPos > 0) {
    // memcpy(buffer + next_length, buffer, 4): junction bytes for reads
    // straddling the refill. C copies 4 unconditionally; bytes above the
    // new bufferPos are never consumed (surplus is stale).
    ice.buffer.copyWithin(ice.nextLength, 0, 4);
  }
  if (ice.remaining < ice.nextLength) {
    // C requires full reads: a short read flags eof and fails.
    ice.eof = true;
    return false;
  }
  ice.buffer.set(
    ice.stream.subarray(ice.remaining - ice.nextLength, ice.remaining),
    0,
  );
  ice.remaining -= ice.nextLength;
  ice.bufferPos += ice.nextLength;
  ice.nextLength = ICE_BUFFER_SIZE;
  return ice.bufferPos >= required;
}

/** ice_read_byte: consume one byte walking backwards through the stream. */
function readByte(ice: IceState): number {
  if (ice.bufferPos < 1) {
    if (!fillBuffer(ice, 1)) return -1;
  }
  return ice.buffer[--ice.bufferPos]!;
}

/** ice_read_u16le: 8-bit streams load two interleaved bytes little-endian. */
function readU16le(ice: IceState): number {
  if (ice.bufferPos < 2) {
    if (!fillBuffer(ice, 2)) return -1;
  }
  ice.bufferPos -= 2;
  return ice.buffer[ice.bufferPos]! | (ice.buffer[ice.bufferPos + 1]! << 8);
}

/** ice_peek_u32: inspect the next 4 bytes without consuming (0 on eof). */
function peekU32(ice: IceState): number {
  if (ice.bufferPos < 4) {
    if (!fillBuffer(ice, 4)) return 0;
  }
  return memU32be(ice.buffer, ice.bufferPos - 4);
}

interface Boxed {
  v: number;
}

/** ice_preload_adjust (ice_unpack.c:306): recompute the initial bit window.
 * Returns false when the first bit is not set (invalid stream prefix). */
function preloadAdjust(bits: Boxed, bitsLeft: Boxed): boolean {
  let tmp = bits.v >>> (32 - bitsLeft.v);
  if ((~bits.v & 0x80000000) !== 0) return false;
  while ((~tmp & 1) !== 0) {
    tmp >>>= 1;
    bitsLeft.v--;
  }
  // The last valid bit is discarded too.
  tmp >>>= 1;
  bitsLeft.v--;
  if (bitsLeft.v > 0) tmp = tmp << (32 - bitsLeft.v);
  bits.v = tmp >>> 0;
  return true;
}

/** ice_bitplane_filter (ice_unpack.c:351), reference (bit-exact) loop:
 * reorder the last storedSize*8 bytes from packed to planar form. */
function bitplaneFilter(
  dest: Uint8Array,
  destLen: number,
  storedSize: number,
): boolean {
  if (storedSize < 0 || storedSize * 8 > destLen) return false;
  let pos = destLen;
  const end = pos - storedSize * 8;
  let plane0 = 0;
  let plane1 = 0;
  let plane2 = 0;
  let plane3 = 0;
  while (pos > end) {
    for (let i = 0; i < 4; i++) {
      pos -= 2;
      let x = (memU16be(dest, pos) << 16) >>> 0;
      for (let j = 0; j < 4; j++) {
        plane0 = ((plane0 << 1) | (x >>> 31)) >>> 0;
        x = (x << 1) >>> 0;
        plane1 = ((plane1 << 1) | (x >>> 31)) >>> 0;
        x = (x << 1) >>> 0;
        plane2 = ((plane2 << 1) | (x >>> 31)) >>> 0;
        x = (x << 1) >>> 0;
        plane3 = ((plane3 << 1) | (x >>> 31)) >>> 0;
        x = (x << 1) >>> 0;
      }
    }
    dest[pos] = (plane0 >> 8) & 0xff;
    dest[pos + 1] = plane0 & 0xff;
    dest[pos + 2] = (plane1 >> 8) & 0xff;
    dest[pos + 3] = plane1 & 0xff;
    dest[pos + 4] = (plane2 >> 8) & 0xff;
    dest[pos + 5] = plane2 & 0xff;
    dest[pos + 6] = (plane3 >> 8) & 0xff;
    dest[pos + 7] = plane3 & 0xff;
  }
  return true;
}

/** ice_read_bits: `wide` selects the 32-bit (ice_load32) or 8-bit
 * (ice_load8) stream format (ice_unpack_fn.c, both template widths). */
function readBits(
  ice: IceState,
  bits: Boxed,
  bitsLeft: Boxed,
  num: number,
  wide: boolean,
): number {
  let ret: number;
  if (wide) {
    const left = num - bitsLeft.v;
    ret = bits.v >>> (32 - num);
    bitsLeft.v -= num;
    if (left <= 0) {
      bits.v = (bits.v << num) >>> 0;
    } else {
      // ice_load32: peek then consume.
      bits.v = peekU32(ice);
      bitsLeft.v += 32;
      ice.bufferPos -= 4;
      ret = (ret | (bits.v >>> (32 - left))) >>> 0;
      bits.v = (bits.v << left) >>> 0;
    }
  } else {
    if (num > bitsLeft.v) {
      if (num > 8 && num - 8 > bitsLeft.v) {
        // Two bytes fit — read little-endian (backwards stream order).
        const v = readU16le(ice);
        bits.v = (bits.v | ((v << (16 - bitsLeft.v)) >>> 0)) >>> 0;
        bitsLeft.v += 16;
      } else {
        const b = readByte(ice);
        if (b < 0) return -1;
        bits.v = (bits.v | ((b << (24 - bitsLeft.v)) >>> 0)) >>> 0;
        bitsLeft.v += 8;
      }
    }
    ret = bits.v >>> (32 - num);
    bits.v = (bits.v << num) >>> 0;
    bitsLeft.v -= num;
  }
  return ret >>> 0;
}

/** ice_read_literal_length_ext. */
function readLiteralLengthExt(
  ice: IceState,
  bits: Boxed,
  bitsLeft: Boxed,
  wide: boolean,
): number {
  if (wide && ice.version === VERSION_113) {
    return readBits(ice, bits, bitsLeft, 10, wide) + 15;
  }
  let length = readBits(ice, bits, bitsLeft, 8, wide) + 15;
  if (length === 270) {
    length = readBits(ice, bits, bitsLeft, 15, wide) + 270;
  }
  return length;
}

/** ice_read_literal_length: Elias-Gamma-ish literal run length. */
function readLiteralLength(
  ice: IceState,
  bits: Boxed,
  bitsLeft: Boxed,
  wide: boolean,
): number {
  let length = readBits(ice, bits, bitsLeft, 1, wide);
  if (length === 1) length = readBits(ice, bits, bitsLeft, 1, wide) + 1;
  if (length === 2) length = readBits(ice, bits, bitsLeft, 2, wide) + 2;
  if (length === 5) length = readBits(ice, bits, bitsLeft, 2, wide) + 5;
  if (length === 8) length = readBits(ice, bits, bitsLeft, 3, wide) + 8;
  if (length === 15) {
    length = readLiteralLengthExt(ice, bits, bitsLeft, wide);
  }
  if (ice.eof) return -1;
  return length;
}

/** ice_read_window_length. */
function readWindowLength(
  ice: IceState,
  bits: Boxed,
  bitsLeft: Boxed,
  wide: boolean,
): number {
  let length: number;
  if (readBits(ice, bits, bitsLeft, 1, wide) === 0) {
    length = 2;
  } else if (readBits(ice, bits, bitsLeft, 1, wide) === 0) {
    length = 3;
  } else if (readBits(ice, bits, bitsLeft, 1, wide) === 0) {
    length = 4 + readBits(ice, bits, bitsLeft, 1, wide);
  } else if (readBits(ice, bits, bitsLeft, 1, wide) === 0) {
    length = 6 + readBits(ice, bits, bitsLeft, 2, wide);
  } else {
    length = 10 + readBits(ice, bits, bitsLeft, 10, wide);
  }
  if (ice.eof) return -1;
  return length;
}

/** ice_read_window_distance. */
function readWindowDistance(
  ice: IceState,
  bits: Boxed,
  bitsLeft: Boxed,
  length: number,
  wide: boolean,
): number {
  let dist: number;
  if (length === 2) {
    dist = 1 + readBits(ice, bits, bitsLeft, 7, wide);
    if (dist >= 65) {
      dist = ((dist - 65) << 3) + 65 + readBits(ice, bits, bitsLeft, 3, wide);
    }
  } else {
    if (readBits(ice, bits, bitsLeft, 1, wide) === 0) {
      dist = 33 + readBits(ice, bits, bitsLeft, 8, wide);
    } else if (readBits(ice, bits, bitsLeft, 1, wide) === 0) {
      dist = 1 + readBits(ice, bits, bitsLeft, 5, wide);
    } else {
      dist = 289 + readBits(ice, bits, bitsLeft, 12, wide);
    }
  }
  if (ice.eof) return -1;
  return dist;
}

/** ice_at_stream_start: everything consumed, bit register empty. */
function atStreamStart(ice: IceState, bitsLeft: Boxed): boolean {
  return ice.remaining <= 0 && ice.bufferPos === 0 && bitsLeft.v <= 0;
}

/** ice_unpack_fn (ice_unpack_fn.c): the backwards LZ decoder. */
function unpackFn(
  ice: IceState,
  bits: Boxed,
  bitsLeft: Boxed,
  dest: Uint8Array,
  destLen: number,
  wide: boolean,
): boolean {
  let pos = destLen;
  for (;;) {
    let length = readLiteralLength(ice, bits, bitsLeft, wide);
    if (length < 0) return false;
    if (length > pos) return false;
    for (; length > 0; length--) {
      const b = readByte(ice);
      if (b < 0) return false;
      dest[--pos] = b;
    }
    if (pos === 0) break;

    length = readWindowLength(ice, bits, bitsLeft, wide);
    if (length <= 0) return false;
    let dist = readWindowDistance(ice, bits, bitsLeft, length, wide);
    if (dist <= 0) return false;

    // Distance is relative to the last byte written.
    if (wide) {
      dist = dist + length - 1;
    } else if (dist > 1) {
      dist = dist + length - 2;
    }

    if (length > pos) return false;
    let windowPos = dist + pos;
    // C's OOB guard: reading past the buffer end fails the stream (hit by
    // ambiguous-version "Ice!" decoded in the wrong mode).
    if (windowPos > destLen || windowPos <= 0) return false;
    for (; length > 0; length--) {
      dest[--pos] = dest[--windowPos]!;
    }
  }

  // Bitplane filter (optional, 2.1+).
  if (
    ice.version >= VERSION_21X &&
    readBits(ice, bits, bitsLeft, 1, wide) === 1
  ) {
    let bplLen = (320 * 200) / 16;
    if (
      !atStreamStart(ice, bitsLeft) &&
      readBits(ice, bits, bitsLeft, 1, wide) === 1
    ) {
      bplLen = readBits(ice, bits, bitsLeft, 16, wide) + 1;
      if (ice.eof) return false;
    }
    if (!bitplaneFilter(dest, destLen, bplLen)) return false;
  }

  return atStreamStart(ice, bitsLeft);
}

function unpack8(ice: IceState, dest: Uint8Array, destLen: number): boolean {
  const bits: Boxed = { v: 0 };
  const bitsLeft: Boxed = { v: 0 };
  const b = readByte(ice);
  if (b < 0) return false;
  bits.v = (b << 24) >>> 0;
  bitsLeft.v += 8;
  if (ice.eof || !preloadAdjust(bits, bitsLeft)) return false;
  return unpackFn(ice, bits, bitsLeft, dest, destLen, false);
}

function unpack32(ice: IceState, dest: Uint8Array, destLen: number): boolean {
  const bits: Boxed = { v: 0 };
  const bitsLeft: Boxed = { v: 0 };
  bits.v = peekU32(ice);
  bitsLeft.v += 32;
  ice.bufferPos -= 4;
  if (ice.eof || !preloadAdjust(bits, bitsLeft)) return false;
  return unpackFn(ice, bits, bitsLeft, dest, destLen, true);
}

/** ice_init_buffer (ice_unpack.c:233) + ambiguous-version filtering. */
function initBuffer(ice: IceState): boolean {
  ice.eof = false;
  ice.remaining = ice.streamLen; // C recomputes next_seek from compressed_size
  ice.nextLength = ice.streamLen % ICE_BUFFER_SIZE || ICE_BUFFER_SIZE;
  ice.bufferPos = 0;
  if (!fillBuffer(ice, 1)) return false;

  if (ice.version === VERSION_21X_OR_220) {
    const peek = peekU32(ice);
    if ((~peek & 0x80) !== 0 && (peek & 0x80000000) !== 0) {
      ice.version = VERSION_21X; // 8-bit first bit unset → 32-bit stream
    } else if ((peek & 0x80) !== 0 && (~peek & 0x80000000) !== 0) {
      ice.version = VERSION_220; // 32-bit first bit unset → 8-bit stream
    }
  }
  return true;
}

/** ice_unpack (ice_unpack.c:595): 8-bit first for ambiguous versions. */
function iceUnpack(
  ice: IceState,
  dest: Uint8Array,
  destLen: number,
  kind: string,
): void {
  if (!initBuffer(ice)) fail(kind, 'truncated stream');
  if (ice.version >= VERSION_21X_OR_220) {
    if (unpack8(ice, dest, destLen)) return;
  }
  if (ice.version === VERSION_21X_OR_220) {
    if (!initBuffer(ice)) fail(kind, 'truncated stream');
  }
  if (ice.version <= VERSION_21X_OR_220) {
    if (unpack32(ice, dest, destLen)) return;
  }
  fail(kind, 'depack failed');
}

/** ice_uncompressed_bound (ice_unpack.c:628): expansion sanity cap. */
function uncompressedBound(inLen: number): number {
  const bestFactor = Math.trunc((1033 * 8 + 20) / (14 + 7));
  return inLen * bestFactor;
}

export interface IceDepackResult {
  data: Uint8Array;
  kind: 'ice1' | 'ice2';
}

/**
 * ice1_unpack (ice_unpack.c:659): the ICE1 variant stores its signature in
 * the LAST 8 bytes: u32 uncompressed size, u32 "Ice!".
 */
export function ice1Unpack(src: Uint8Array): IceDepackResult {
  const n = src.length;
  if (n < 8 || memU32be(src, n - 4) !== ICE_OLD_MAGIC) {
    fail('ice1', 'bad tail magic');
  }
  const uncompressedSize = memU32be(src, n - 8);
  if (uncompressedSize <= 0 || uncompressedSize > DEPACK_LIMIT) {
    fail('ice1', 'bad uncompressed size');
  }
  if (uncompressedSize > uncompressedBound(n)) {
    fail('ice1', 'expansion bound exceeded');
  }
  const out = new Uint8Array(uncompressedSize);
  const ice: IceState = {
    stream: src,
    streamLen: n - 8,
    remaining: n - 8,
    buffer: new Uint8Array(ICE_BUFFER_SIZE + 4),
    bufferPos: 0,
    nextLength: (n - 8) % ICE_BUFFER_SIZE || ICE_BUFFER_SIZE,
    eof: false,
    version: VERSION_113,
    uncompressedSize,
  };
  iceUnpack(ice, out, uncompressedSize, 'ice1');
  return { data: out, kind: 'ice1' };
}

/**
 * ice2_unpack (ice_unpack.c:725): the ICE2 variant stores a 12-byte header:
 * u32 magic, u32 compressed size (== file size), u32 uncompressed size.
 */
export function ice2Unpack(src: Uint8Array): IceDepackResult {
  const n = src.length;
  if (n < 12) fail('ice2', 'file too small');
  const magic = memU32be(src, 0);
  switch (magic) {
    case ICE_OLD_MAGIC:
    case ICE_NEW_MAGIC:
    case CJ_MAGIC:
    case MICK_MAGIC:
    case SHE_MAGIC:
    case TMM_MAGIC:
    case TSM_MAGIC:
      break;
    default:
      fail('ice2', 'bad header magic');
  }
  const uncompressedSize = memU32be(src, 8);
  if (uncompressedSize <= 0 || uncompressedSize > DEPACK_LIMIT) {
    fail('ice2', 'bad uncompressed size');
  }
  if (uncompressedSize > uncompressedBound(n)) {
    fail('ice2', 'expansion bound exceeded');
  }
  const compressedSize = memU32be(src, 4);
  if (compressedSize !== n) fail('ice2', 'compressed size mismatch');
  const out = new Uint8Array(uncompressedSize);
  const ice: IceState = {
    // The stream is the file minus the 12-byte header; all `remaining`
    // arithmetic is stream-relative (C's next_seek += 12 adjustment).
    stream: src.subarray(12),
    streamLen: n - 12,
    remaining: n - 12,
    buffer: new Uint8Array(ICE_BUFFER_SIZE + 4),
    bufferPos: 0,
    nextLength: (n - 12) % ICE_BUFFER_SIZE || ICE_BUFFER_SIZE,
    eof: false,
    version:
      magic === ICE_OLD_MAGIC
        ? VERSION_21X_OR_220
        : magic === ICE_NEW_MAGIC
          ? VERSION_23X
          : VERSION_21X,
    uncompressedSize,
  };
  iceUnpack(ice, out, uncompressedSize, 'ice2');
  return { data: out, kind: 'ice2' };
}

/** decrunch-side tests (depacker.c requires a ≥64-byte probe). */
export function ice1Test(src: Uint8Array): boolean {
  const n = src.length;
  return n >= 64 && memU32be(src, n - 4) === ICE_OLD_MAGIC;
}

export function ice2Test(src: Uint8Array): boolean {
  const n = src.length;
  if (n < 64) return false;
  switch (memU32be(src, 0)) {
    case ICE_OLD_MAGIC:
    case ICE_NEW_MAGIC:
    case CJ_MAGIC:
    case MICK_MAGIC:
    case SHE_MAGIC:
    case TMM_MAGIC:
    case TSM_MAGIC:
      return true;
    default:
      return false;
  }
}

/** True when the buffer is ICE1/ICE2-packed (depacker.c list order). */
export function isIcePacked(src: Uint8Array): boolean {
  return ice1Test(src) || ice2Test(src);
}

/** Depack an ICE1/ICE2 buffer (libxmp_decrunch's ice1 → ice2 order). */
export function depackIce(src: Uint8Array): Uint8Array {
  if (ice1Test(src)) return ice1Unpack(src).data;
  if (ice2Test(src)) return ice2Unpack(src).data;
  throw new PackedModuleError('not an ICE file');
}

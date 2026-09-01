// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Bitti09 — modplayjs contributors
// Ported from: libxmp src/loaders/itsex.c.
// IT sample decompressor. Verbatim port of reference/libxmp/src/loaders/
// itsex.c (itsex_decompress8 :100-192, itsex_decompress16 :194-288) with
// the buffered bit stream (it_stream/read_bits :23-96, init_block :98-119).
// Public domain IT sample decompressor by Olivier Lapicque, modified by
// Alice Rowan (2023-2024) — buffered input stream rewrite.

/** READ_BITS_MASK(n) (itsex.c:20). */
const READ_BITS_MASK = (n: number): number => (1 << n) - 1;

/** TEMP_BUFFER_LEN (it_load.c:35) — pattern/sample scratch buffer size. */
export const TEMP_BUFFER_LEN = 65536;

/** struct it_stream (itsex.c:23-29). */
interface ItStream {
  pos: number; // index into buf
  left: number; // bytes remaining in buf
  bits: number; // uint32 accumulator
  numBits: number;
  err: number;
}

/**
 * read_bits (itsex.c:31-61): LSB-first bit reader over a 4-byte-aligned
 * zero-padded block buffer.
 */
function readBits(s: ItStream, buf: Uint8Array, n: number): number {
  let retval = 0;

  if (n <= 0 || n >= 32) {
    /* Invalid shift value. */
    s.err = -2;
    return 0;
  }

  retval = s.bits & READ_BITS_MASK(n);

  if (s.numBits < n) {
    const offset = s.numBits;

    if (s.left === 0) {
      s.err = -1; /* EOF */
      return 0;
    }
    /* Buffer should be zero-padded to 4-byte alignment. */
    s.bits =
      buf[s.pos]! |
      (buf[s.pos + 1]! << 8) |
      (buf[s.pos + 2]! << 16) |
      (buf[s.pos + 3]! << 24);

    const used = Math.min(s.left, 4);

    s.numBits = used * 8;
    s.pos += 4;
    s.left -= used;

    n -= offset;
    retval |= (s.bits & READ_BITS_MASK(n)) << offset;
  }

  s.bits = s.bits >>> n; /* uint32 logical shift right */
  s.numBits -= n;

  return retval >>> 0;
}

/**
 * init_block (itsex.c:64-84): read a u16le block size, then that many
 * bytes, zero-padded to a 4-byte multiple. Returns false on error.
 */
function initBlock(
  s: ItStream,
  tmp: Uint8Array,
  tmplen: number,
  src: Uint8Array,
  srcPos: { pos: number },
): boolean {
  if (srcPos.pos + 2 > src.length) return false;
  s.left = src[srcPos.pos]! | (src[srcPos.pos + 1]! << 8);
  s.pos = 0;
  s.bits = 0;
  s.numBits = 0;
  s.err = 0;
  srcPos.pos += 2;

  /* tmp should be INT16_MAX rounded up to a multiple of 4 bytes long. */
  if (tmplen < ((s.left + 4) & ~3)) return false;
  if (srcPos.pos + s.left > src.length) return false;
  tmp.set(src.subarray(srcPos.pos, srcPos.pos + s.left), 0);
  srcPos.pos += s.left;

  /* Zero pad to a multiple of 4 bytes for read_bits. */
  for (let i = s.left; i & 3; i++) tmp[i] = 0;

  return true;
}

/**
 * itsex_decompress8 (itsex.c:86-192). `src` is the compressed byte stream
 * (already seeked to the sample data); `srcPos` tracks the read position.
 * `it215` = convert & IT_CVT_DIFF. Returns false on decompression error.
 */
export function itsexDecompress8(
  src: Uint8Array,
  srcPos: { pos: number },
  dst: Uint8Array,
  len: number,
  tmp: Uint8Array,
  tmplen: number,
  it215: boolean,
): boolean {
  const s: ItStream = { pos: 0, left: 0, bits: 0, numBits: 0, err: 0 };
  let blockCount = 0;
  let left = 0;
  let temp = 0;
  let temp2 = 0;
  let dstOff = 0;

  while (len > 0) {
    if (blockCount === 0) {
      blockCount = 0x8000;
      left = 9;
      temp = temp2 = 0;

      if (!initBlock(s, tmp, tmplen, src, srcPos)) return false;
    }

    let d = blockCount;
    if (d > len) d = len;

    /* Unpacking */
    let pos = 0;
    do {
      let bits = readBits(s, tmp, left) & 0xffff;
      if (s.err) return false;

      if (left < 7) {
        const i = 1 << (left - 1);
        const j = bits & 0xffff;
        if (i !== j) {
          // goto unpack_byte
          if (left < 8) {
            const shift = 8 - left;
            const c = (((bits << shift) & 0xff) << 24) >> 24;
            bits = c & 0xffff;
          }
          bits = (bits + temp) & 0xffff;
          temp = bits & 0xff;
          temp2 = (temp2 + temp) & 0xff;
          dst[dstOff + pos] = it215 ? temp2 : temp;
        } else {
          bits = (readBits(s, tmp, 3) + 1) & 0xff;
          if (s.err) return false;
          left = (bits & 0xff) < left ? bits & 0xff : (bits + 1) & 0xff;
        }
      } else if (left < 9) {
        const i = (0xff >> (9 - left)) + 4;
        const j = i - 8;

        if (bits <= j || bits > i) {
          // goto unpack_byte
          if (left < 8) {
            const shift = 8 - left;
            const c = (((bits << shift) & 0xff) << 24) >> 24;
            bits = c & 0xffff;
          }
          bits = (bits + temp) & 0xffff;
          temp = bits & 0xff;
          temp2 = (temp2 + temp) & 0xff;
          dst[dstOff + pos] = it215 ? temp2 : temp;
        } else {
          bits -= j;
          left = (bits & 0xff) < left ? bits & 0xff : (bits + 1) & 0xff;
        }
      } else if (left >= 10) {
        // goto skip_byte
      } else if (bits >= 256) {
        left = (bits + 1) & 0xff;
      } else {
        // unpack_byte (left == 9)
        bits = (bits + temp) & 0xffff;
        temp = bits & 0xff;
        temp2 = (temp2 + temp) & 0xff;
        dst[dstOff + pos] = it215 ? temp2 : temp;
      }
      pos++;
    } while (pos < d);

    /* Move On */
    blockCount -= d;
    len -= d;
    dstOff += d;
  }

  return true;
}

/**
 * itsex_decompress16 (itsex.c:194-288). dst receives little-endian int16
 * pairs (uint8 view of the int16 array).
 */
export function itsexDecompress16(
  src: Uint8Array,
  srcPos: { pos: number },
  dst: Uint8Array, // little-endian int16 stream, 2 bytes per sample
  len: number, // samples
  tmp: Uint8Array,
  tmplen: number,
  it215: boolean,
): boolean {
  const s: ItStream = { pos: 0, left: 0, bits: 0, numBits: 0, err: 0 };
  let blockCount = 0;
  let left = 0;
  let temp = 0;
  let temp2 = 0;
  let dstOff = 0; // in samples

  while (len > 0) {
    if (blockCount === 0) {
      blockCount = 0x4000;
      left = 17;
      temp = temp2 = 0;

      if (!initBlock(s, tmp, tmplen, src, srcPos)) return false;
    }

    let d = blockCount;
    if (d > len) d = len;

    /* Unpacking */
    let pos = 0;
    do {
      let bits = readBits(s, tmp, left) >>> 0;
      if (s.err) return false;

      if (left < 7) {
        const i = 1 << (left - 1);
        const j = bits;

        if (i !== j) {
          // goto unpack_byte
          if (left < 16) {
            const shift = 16 - left;
            const c = (((bits << shift) & 0xffff) << 16) >> 16;
            bits = c >>> 0;
          }
          bits = (bits + temp) >>> 0;
          temp = (bits << 16) >> 16;
          temp2 = (temp2 + temp) | 0;
          write16(dst, dstOff + pos, it215 ? temp2 : temp);
        } else {
          bits = readBits(s, tmp, 4) + 1;
          if (s.err) return false;
          left = (bits & 0xff) < left ? bits & 0xff : (bits + 1) & 0xff;
        }
      } else if (left < 17) {
        const i = (0xffff >> (17 - left)) + 8;
        const j = (i - 16) & 0xffff;

        if (bits <= j || bits > (i & 0xffff)) {
          // goto unpack_byte
          if (left < 16) {
            const shift = 16 - left;
            const c = (((bits << shift) & 0xffff) << 16) >> 16;
            bits = c >>> 0;
          }
          bits = (bits + temp) >>> 0;
          temp = (bits << 16) >> 16;
          temp2 = (temp2 + temp) | 0;
          write16(dst, dstOff + pos, it215 ? temp2 : temp);
        } else {
          bits -= j;
          left = (bits & 0xff) < left ? bits & 0xff : (bits + 1) & 0xff;
        }
      } else if (left >= 18) {
        // goto skip_byte
      } else if (bits >= 0x10000) {
        left = (bits + 1) & 0xff;
      } else {
        // unpack_byte (left == 17, so no sign-extend branch)
        bits = (bits + temp) >>> 0;
        temp = (bits << 16) >> 16;
        temp2 = (temp2 + temp) | 0;
        write16(dst, dstOff + pos, it215 ? temp2 : temp);
      }
      pos++;
    } while (pos < d);

    /* Move On */
    blockCount -= d;
    len -= d;
    dstOff += d;
    if (len <= 0) break;
  }

  return true;
}

/** Write a little-endian int16 into the byte stream. */
function write16(buf: Uint8Array, sampleIdx: number, v: number): void {
  const o = sampleIdx * 2;
  buf[o] = v & 0xff;
  buf[o + 1] = (v >> 8) & 0xff;
}

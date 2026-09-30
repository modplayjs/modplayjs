// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Bitti09 — modplayjs contributors
// PowerPacker (PP20) depacker — port of libxmp src/depackers/ppdepack.c
// (Public-Domain code by Stuart Caie / amigadepack, xmp-adapted).

/** readmem24b (common.h). */
function readmem24b(m: Uint8Array, off: number): number {
  return (m[off]! << 16) | (m[off + 1]! << 8) | m[off + 2]!;
}

/** ppDecrunch (ppdepack.c:47-95). Bit-oriented backwards LZ. */
function ppDecrunch(
  src: Uint8Array,
  srcOff: number,
  srcLen: number,
  dest: Uint8Array,
  offsetLens: Uint8Array,
  offsetLensOff: number,
  destLen: number,
  skipBits: number,
): boolean {
  if (skipBits > 32) return false;
  let bufSrc = srcOff + srcLen; // consumed downwards
  let out = destLen; // written downwards into dest
  let bitBuffer = 0;
  let bitsLeft = 0;
  let written = 0;

  // The macro-based C control flow reads bits in multiple contexts; expand
  // it inline with closures that flag exhaustion instead of returning 0
  // mid-stream (C checks only at refill time).
  let exhausted = false;
  const ppReadBits = (nbits: number): number => {
    let bitCnt = nbits;
    while (bitsLeft < bitCnt) {
      if (bufSrc <= srcOff) {
        exhausted = true;
        return 0;
      }
      bitBuffer |= (src[--bufSrc]! << bitsLeft);
      bitsLeft += 8;
    }
    let v = 0;
    bitsLeft -= bitCnt;
    while (bitCnt-- > 0) {
      v = (v << 1) | (bitBuffer & 1);
      bitBuffer >>>= 1;
    }
    return v;
  };

  const byteOut = (b: number): void => {
    if (out <= 0) {
      exhausted = true;
      return;
    }
    dest[--out] = b & 0xff;
    written++;
  };

  // skip the first few bits (ppdepack.c:61)
  ppReadBits(skipBits);
  if (exhausted) return false;

  // while there are input bits left (:64-73)
  while (written < destLen) {
    let x = ppReadBits(1);
    if (exhausted) return false;
    if (x === 0) {
      // 1bit==0: literal, then match. 1bit==1: just match
      let todo = 1;
      do {
        x = ppReadBits(2);
        if (exhausted) return false;
        todo += x;
      } while (x === 3);
      while (todo-- > 0) {
        x = ppReadBits(8);
        if (exhausted) return false;
        byteOut(x);
        if (exhausted) return false;
      }
      // should we end decoding on a literal, break out of the main loop
      if (written === destLen) break;
    }

    // match: read 2 bits for initial offset bitlength / match length (:76-89)
    x = ppReadBits(2);
    if (exhausted) return false;
    const offbits = offsetLens[offsetLensOff + x]!;
    let todo = x + 2;
    let offset: number;
    if (x === 3) {
      x = ppReadBits(1);
      if (exhausted) return false;
      // offbits = 7 override when x == 0
      offset = ppReadBits(x === 0 ? 7 : offbits);
      if (exhausted) return false;
      do {
        x = ppReadBits(3);
        if (exhausted) return false;
        todo += x;
      } while (x === 7);
    } else {
      offset = ppReadBits(offbits);
      if (exhausted) return false;
    }
    if (out + offset >= destLen) return false; // match overflow
    while (todo-- > 0) {
      const v = dest[out + offset]!;
      byteOut(v);
      if (exhausted) return false;
    }
  }

  // all output bytes written without error
  return written === destLen;
}

export function isPpPacked(src: Uint8Array): boolean {
  return src.length >= 16 && src[0] === 0x50 /* P */ && src[1] === 0x50 &&
    src[2] === 0x32 && src[3] === 0x30;
}

/**
 * ppdepack (ppdepack.c:97-156). Returns the depacked bytes or null.
 * PP format: 'PP20' | efficiency (4 bytes) | packed data | decrlen<<8|info.
 */
export function depackPp(src: Uint8Array): Uint8Array | null {
  const len = src.length;
  if (len < 16) return null;
  if (!(src[0] === 0x50 && src[1] === 0x50 && src[2] === 0x32 && src[3] === 0x30)) {
    return null;
  }
  if (len & 0x03) return null;

  const outlen = readmem24b(src, len - 4);
  const dest = new Uint8Array(outlen);

  // ppDecrunch(&data[8], dest, &data[4], len-12, outlen, data[len-1])
  const skipBits = src[len - 1]!;
  const ok = ppDecrunch(src, 8, len - 12, dest, src, 4, outlen, skipBits);
  return ok ? dest : null;
}

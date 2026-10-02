// SPDX-License-Identifier: BSD-3-Clause
// Ported from stb_vorbis.c (public domain, Sean Barrett) — stream, Ogg page
// and packet layers (memory-source, pull API).

import { type Vorb } from './types.js';
// get8 / get32 / getn / skip (stb_vorbis.c:1346-1404)
export function get8(z: Vorb): number {
  if (z.streamPos >= z.streamEnd) { z.eof = true; return 0; }
  return z.stream[z.streamPos++]!;
}

export function get32(z: Vorb): number {
  let x = get8(z);
  x += get8(z) << 8;
  x += get8(z) << 16;
  x += get8(z) << 24;
  return x >>> 0;
}

export function getn(z: Vorb, data: Uint8Array, n: number): boolean {
  if (z.streamPos + n > z.streamEnd) { z.eof = true; return false; }
  data.set(z.stream.subarray(z.streamPos, z.streamPos + n), 0);
  z.streamPos += n;
  return true;
}

export function skip(z: Vorb, n: number): void {
  z.streamPos += n;
  if (z.streamPos >= z.streamEnd) z.eof = true;
}

export function getFileOffset(z: Vorb): number {
  return z.streamPos;
}

export function setFileOffset(z: Vorb, loc: number): boolean {
  z.eof = false;
  if (loc >= z.streamLen) {
    z.streamPos = z.streamEnd;
    z.eof = true;
    return false;
  }
  z.streamPos = z.streamStart + loc;
  return true;
}

// Ogg page layer (stb_vorbis.c:1438-1566)

function capturePattern(z: Vorb): boolean {
  if (0x4f !== get8(z)) return false;
  if (0x67 !== get8(z)) return false;
  if (0x67 !== get8(z)) return false;
  if (0x53 !== get8(z)) return false;
  return true;
}

const PAGEFLAG_continued_packet = 1;
const PAGEFLAG_first_page = 2;
const PAGEFLAG_last_page = 4;

export function startPageNoCapturePattern(z: Vorb): boolean {
  if (z.firstDecode) {
    z.firstAudioPageOffset = getFileOffset(z) - 4;
  }
  if (0 !== get8(z)) { return error(z, 2); }
  z.pageFlag = get8(z);
  const loc0 = get32(z);
  const loc1 = get32(z);
  get32(z); // stream serial — discard
  const n = get32(z);
  z.lastPage = n;
  get32(z); // crc32
  z.segmentCount = get8(z);
  if (!getn(z, z.segments as Uint8Array, z.segmentCount)) return error(z, 10);
  z.endSegWithKnownLoc = -2;
  if (loc0 !== 0xffffffff || loc1 !== 0xffffffff) {
    let i = z.segmentCount - 1;
    for (; i >= 0; --i) if (z.segments[i]! < 255) break;
    if (i >= 0) {
      z.endSegWithKnownLoc = i;
      z.knownLocForPacket = loc0;
    }
  }
  z.nextSeg = 0;
  return true;
}

export function error(z: Vorb, e: number): boolean {
  z.error = e;
  return false;
}

export function startPage(z: Vorb): boolean {
  if (!capturePattern(z)) return error(z, 30);
  return startPageNoCapturePattern(z);
}

export function startPacket(z: Vorb): boolean {
  while (z.nextSeg === -1) {
    if (!startPage(z)) return false;
    if (z.pageFlag & PAGEFLAG_continued_packet) return error(z, 9);
  }
  z.lastSeg = false;
  z.validBits = 0;
  z.packetBytes = 0;
  z.bytesInSeg = 0;
  return true;
}

export function maybeStartPacket(z: Vorb): boolean {
  if (z.nextSeg === -1) {
    const x = get8(z);
    if (z.eof) return false;
    if (0x4f !== x) return error(z, 30);
    if (0x67 !== get8(z)) return error(z, 30);
    if (0x67 !== get8(z)) return error(z, 30);
    if (0x53 !== get8(z)) return error(z, 30);
    if (!startPageNoCapturePattern(z)) return false;
    if (z.pageFlag & PAGEFLAG_continued_packet) {
      z.lastSeg = false;
      z.bytesInSeg = 0;
      return error(z, 9);
    }
  }
  return startPacket(z);
}

export function nextSegment(z: Vorb): number {
  if (z.lastSeg) return 0;
  if (z.nextSeg === -1) {
    z.lastSegWhich = z.segmentCount - 1;
    if (!startPage(z)) { z.lastSeg = true; return 0; }
    if (!(z.pageFlag & PAGEFLAG_continued_packet)) { error(z, 9); return 0; }
  }
  const len = z.segments[z.nextSeg++]!;
  if (len < 255) {
    z.lastSeg = true;
    z.lastSegWhich = z.nextSeg - 1;
  }
  if (z.nextSeg >= z.segmentCount) z.nextSeg = -1;
  z.bytesInSeg = len;
  return len;
}

export const EOP = -1;
export const INVALID_BITS = -1;

export function get8PacketRaw(z: Vorb): number {
  if (z.bytesInSeg === 0) {
    if (z.lastSeg) return EOP;
    else if (!nextSegment(z)) return EOP;
  }
  if (z.bytesInSeg > 0) --z.bytesInSeg;
  ++z.packetBytes;
  return get8(z);
}

export function get8Packet(z: Vorb): number {
  const x = get8PacketRaw(z);
  z.validBits = 0;
  return x;
}

export function get32Packet(z: Vorb): number {
  let x = get8Packet(z);
  x += get8Packet(z) << 8;
  x += get8Packet(z) << 16;
  x += get8Packet(z) << 24;
  return x >>> 0;
}

export function flushPacket(z: Vorb): void {
  while (get8PacketRaw(z) !== EOP) { /* drain */ }
}

// get_bits (stb_vorbis.c:1608-1662)
export function getBits(z: Vorb, n: number): number {
  if (z.validBits < 0) return 0;
  if (z.validBits < n) {
    if (n > 24) {
      const zz = getBits(z, 24);
      return (zz + (getBits(z, n - 24) << 24)) >>> 0;
    }
    if (z.validBits === 0) z.acc = 0;
    while (z.validBits < n) {
      const b = get8PacketRaw(z);
      if (b === EOP) {
        z.validBits = INVALID_BITS;
        return 0;
      }
      z.acc = (z.acc + (b << z.validBits)) >>> 0;
      z.validBits += 8;
    }
  }
  const mask = (1 << n) - 1;
  const zz = (z.acc & mask) >>> 0;
  z.acc = (z.acc >>> n) >>> 0;
  z.validBits -= n;
  return zz;
}

export function prepHuffman(z: Vorb): void {
  if (z.validBits <= 24) {
    if (z.validBits === 0) z.acc = 0;
    do {
      if (z.lastSeg && z.bytesInSeg === 0) return;
      const b = get8PacketRaw(z);
      if (b === EOP) return;
      z.acc = (z.acc + (b << z.validBits)) >>> 0;
      z.validBits += 8;
    } while (z.validBits <= 24);
  }
}

export { PAGEFLAG_first_page, PAGEFLAG_last_page, PAGEFLAG_continued_packet };

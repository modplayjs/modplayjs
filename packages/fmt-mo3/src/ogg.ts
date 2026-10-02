// SPDX-License-Identifier: BSD-3-Clause
// MO3 Ogg-Vorbis sample decode (Load_mo3.cpp:1688-1970, stb_vorbis path).
//
// C reference behaviour mirrored here:
//  - Non-shared samples: the chunk is a complete Ogg Vorbis stream.
//  - Shared-header samples (MO3 v5): the sample's header (identification
//    + comment + setup packets) lives in another sample's chunk, in
//    `encoderDelay` bytes at that sample's start, and the audio packets
//    live here. OpenMPT remuxes the header chunk's pages with the DATA
//    chunk's bitstream serial numbers and stitches both into one buffer
//    before feeding a single vorbis decoder (Load_mo3.cpp:1767-1875,
//    "optimized" variant). We port that optimized path 1:1.
import { stbVorbisOpenMemory, stbVorbisGetFrameFloat, type Vorb } from '@modplayjs/stb-vorbis';

/** mpt::crc32_ogg = CRC-32 with polynomial 0x04C11DB7, init 0, MSB-first,
 *  no final XOR — the Ogg page CRC (crc.hpp:194). */
const CRC_TABLE = /* computed lazily */ buildCrcTable();
function buildCrcTable(): Uint32Array {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let value = (i << 24) >>> 0;
    for (let bit = 0; bit < 8; bit++) {
      value = value & 0x80000000 ? ((value << 1) >>> 0) ^ 0x04c11db7 : (value << 1) >>> 0;
    }
    table[i] = value >>> 0;
  }
  return table;
}

function crcOgg(data: Uint8Array, from = 0, to = data.length): number {
  let value = 0;
  for (let i = from; i < to; i++) {
    value = (((value << 8) >>> 0) ^ (CRC_TABLE[((value >>> 24) & 0xff) ^ data[i]!] ?? 0)) >>> 0;
  }
  return value >>> 0;
}

interface OggPage {
  serial: number;
  sequence: number;
  /** header_type bits. */
  flag: number;
  granule0: number;
  granule1: number;
  segmentTable: Uint8Array;
  data: Uint8Array;
}

function u32le(b: Uint8Array, off: number): number {
  return (b[off]! | (b[off + 1]! << 8) | (b[off + 2]! << 16) | (b[off + 3]! << 24)) >>> 0;
}

/** Ogg::ReadPage — parse one "OggS" page. Returns null on any structural
 *  or CRC error (corrupted pages are dropped per the Ogg spec). */
function readPage(b: Uint8Array, pos: number): { page: OggPage; end: number } | null {
  if (pos + 27 > b.length) return null;
  const flag = b[pos + 5]!;
  const granule0 = u32le(b, pos + 6);
  const granule1 = u32le(b, pos + 10);
  const serial = u32le(b, pos + 14);
  const sequence = u32le(b, pos + 18);
  const storedCrc = u32le(b, pos + 22);
  const segmentCount = b[pos + 26]!;
  if (pos + 27 + segmentCount > b.length) return null;
  const segmentTable = b.subarray(pos + 27, pos + 27 + segmentCount);
  let dataSize = 0;
  for (let i = 0; i < segmentCount; i++) dataSize += segmentTable[i]!;
  const end = pos + 27 + segmentCount + dataSize;
  if (end > b.length) return null;
  // CRC over the header with the checksum field zeroed, the segment table
  // and the payload (OggStream.cpp:116-137). A stored checksum of 0 is
  // treated as valid only for zero-length verification; C always compares.
  const raw = b.subarray(pos, end);
  const scratch = new Uint8Array(raw.length);
  scratch.set(raw);
  scratch[22] = 0; scratch[23] = 0; scratch[24] = 0; scratch[25] = 0;
  if (storedCrc !== crcOgg(scratch)) return null;
  return {
    page: {
      serial, sequence, flag,
      granule0, granule1,
      segmentTable,
      data: b.subarray(pos + 27 + segmentCount, end),
    },
    end,
  };
}

/** Ogg::ReadPageAndSkipJunk — find the next valid page from pos. */
function readPageAndSkipJunk(b: Uint8Array, pos: number): { page: OggPage; end: number } | null {
  let p = pos;
  while (p + 4 <= b.length) {
    if (b[p] === 0x4f && b[p + 1] === 0x67 && b[p + 2] === 0x67 && b[p + 3] === 0x53) {
      const r = readPage(b, p);
      if (r) return r;
      p += 4;
    } else {
      p++;
    }
  }
  return null;
}

/** Serialize a page (header + segments + data) with CRC applied. */
function serializePage(page: OggPage, newSerial: number): Uint8Array {
  const headerSize = 27 + page.segmentTable.length;
  const total = headerSize + page.data.length;
  const raw = new Uint8Array(total);
  raw[0] = 0x4f; raw[1] = 0x67; raw[2] = 0x67; raw[3] = 0x53;
  raw[4] = 0; // stream structure version
  raw[5] = page.flag;
  // granule 64-bit LE
  let g0 = page.granule0 >>> 0, g1 = page.granule1 >>> 0;
  for (let i = 0; i < 8; i++) raw[6 + i] = i < 4 ? (g0 >>> (i * 8)) & 0xff : (g1 >>> ((i - 4) * 8)) & 0xff;
  raw.set([newSerial & 0xff, (newSerial >>> 8) & 0xff, (newSerial >>> 16) & 0xff, (newSerial >>> 24) & 0xff], 14);
  raw.set([page.sequence & 0xff, (page.sequence >>> 8) & 0xff, (page.sequence >>> 16) & 0xff, (page.sequence >>> 24) & 0xff], 18);
  // page_segments count lives at offset 26.
  raw[26] = page.segmentTable.length;
  raw.set(page.segmentTable, 27);
  raw.set(page.data, headerSize);
  raw[22] = raw[23] = raw[24] = raw[25] = 0;
  const c = crcOgg(raw);
  raw.set([c & 0xff, (c >>> 8) & 0xff, (c >>> 16) & 0xff, (c >>> 24) & 0xff], 22);
  return raw;
}

/**
 * Merge a shared vorbis header chunk with the sample data chunk:
 * the header pages are rewritten with the DATA chunk's bitstream serial
 * numbers (Load_mo3.cpp:1788-1848 optimized path), then the data bytes
 * follow verbatim. Returns null when the header cannot be validated.
 */
export function mergeSharedOggHeader(
  headerBytes: Uint8Array, headerSize: number,
  dataBytes: Uint8Array, dataOff: number, dataSize: number,
): Uint8Array | null {
  // 1. Gather data stream serials (C dataStreamSerials).
  const dataSerials: number[] = [];
  for (let p = readPageAndSkipJunk(dataBytes, dataOff); p; p = readPageAndSkipJunk(dataBytes, p.end)) {
    if (!dataSerials.includes(p.page.serial)) dataSerials.push(p.page.serial);
  }
  if (dataSerials.length > 1) {
    // C logs a warning; multiple logical bitstreams may be mishandled.
  }

  // 2. Read the header chunk pages up to headerSize, renumbering serials.
  const view = headerBytes.subarray(0, headerSize);
  const out: number[] = [];
  let headIndex = 0;
  for (let p = readPageAndSkipJunk(view, 0); p; p = readPageAndSkipJunk(view, p.end)) {
    const it = headIndex;
    headIndex++;
    const idx = it;
    let newSerial = 0;
    if (idx < dataSerials.length) {
      // Found corresponding stream in the data chunk.
      newSerial = dataSerials[idx]!;
    } else {
      // No corresponding stream in the data chunk: find a free serial
      // (Load_mo3.cpp:1822-1836).
      let extraIndex = idx - dataSerials.length;
      for (newSerial = 1; newSerial < 0xffffffff; ++newSerial) {
        if (!dataSerials.includes(newSerial)) {
          extraIndex -= 1;
        }
        if (extraIndex === 0) {
          break;
        }
      }
    }
    out.push(...serializePage(p.page, newSerial));
    void it;
  }
  if (out.length === 0) return null;

  const merged = new Uint8Array(out.length + dataSize);
  let o = 0;
  for (const v of out) merged[o++] = v;
  merged.set(dataBytes.subarray(dataOff, dataOff + dataSize), o);
  return merged;
}

/** Decode a complete Ogg Vorbis stream (header + data in one buffer) to
 *  interleaved float samples, mirroring the C stb_vorbis decode loop
 *  (Load_mo3.cpp:1943-1988). */
export function decodeOggStream(merged: Uint8Array, wantFrames: number, channels: number): Float32Array | null {
  const err = { v: 0 };
  const vor: Vorb | null = stbVorbisOpenMemory(merged, err);
  if (!vor) return null;
  if (vor.channels !== channels) {
    // C: channels must match the sample's channel count.
    return null;
  }
  const out = new Float32Array(wantFrames * channels);
  let offset = 0;
  const len = { v: 0 };
  while (offset < wantFrames) {
    const outputs = stbVorbisGetFrameFloat(vor, len);
    if (!outputs || len.v === 0) break;
    const n = Math.min(len.v, wantFrames - offset);
    for (let ch = 0; ch < channels; ch++) {
      const src = outputs[ch]!;
      for (let j = 0; j < n; j++) out[(offset + j) * channels + ch] = src[j]!;
    }
    offset += n;
  }
  return offset > 0 ? out.subarray(0, offset * channels) : null;
}

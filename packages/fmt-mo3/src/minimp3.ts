// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Bitti09 — modplayjs contributors
// Ported from: OpenMPT's bundled minimp3 (reference/openmpt/include/
// minimp3/minimp3.h, public domain / CC0 by Lionel Fabbro et al.) — the
// Layer-3 decode path only (MO3 samples are always Layer 3), scalar
// (non-SIMD) variants.

import {
  TABS, TAB32, TAB33, TABINDEX, G_LINBITS,
  G_SCF_LONG, G_SCF_SHORT, G_SCF_MIXED, G_SCF_PARTITIONS,
  G_SCFC_DECODE, G_MOD, G_PREAMP, G_POW43, G_AA, G_MDCT_WINDOW,
  G_WIN, G_SEC, G_TWID9, G_TWID3, G_PAN, G_EXPFRAC,
} from './mp3tables.js';

// HDR_* macros (minimp3.h:44-62)
const HDR_SIZE = 4;
const hdrIsMono = (h: Uint8Array): boolean => (h[3]! & 0xc0) === 0xc0;
const hdrIsMsStereo = (h: Uint8Array): boolean => (h[3]! & 0xe0) === 0x60;
const hdrIsFreeFormat = (h: Uint8Array): boolean => (h[2]! & 0xf0) === 0;
const hdrIsCrc = (h: Uint8Array): boolean => (h[1]! & 1) === 0;
const hdrTestPadding = (h: Uint8Array): boolean => (h[2]! & 0x2) !== 0;
const hdrTestMpeg1 = (h: Uint8Array): boolean => (h[1]! & 0x8) !== 0;
const hdrTestNotMpeg25 = (h: Uint8Array): boolean => (h[1]! & 0x10) !== 0;
const hdrTestIStereo = (h: Uint8Array): boolean => (h[3]! & 0x10) !== 0;
const hdrGetLayer = (h: Uint8Array): number => (h[1]! >> 1) & 3;
const hdrGetBitrate = (h: Uint8Array): number => (h[2]! >> 4) & 15;
const hdrGetSampleRate = (h: Uint8Array): number => (h[2]! >> 2) & 3;
const hdrGetMySampleRate = (h: Uint8Array): number =>
  hdrGetSampleRate(h) + (((h[1]! >> 3) & 1) + ((h[1]! >> 4) & 1)) * 3;
const hdrIsFrame576 = (h: Uint8Array): boolean => (h[1]! & 14) === 2;
const hdrIsLayer1 = (h: Uint8Array): boolean => (h[1]! & 6) === 6;

const BITS_DEQUANTIZER_OUT = -1;
const MAX_SCF = 255 + BITS_DEQUANTIZER_OUT * 4 - 210; // 37
const MAX_SCFI = (MAX_SCF + 3) & ~3; // 40
const MAX_FREE_FORMAT_FRAME_SIZE = 2304;
const MAX_FRAME_SYNC_MATCHES = 10;
const MAX_L3_FRAME_PAYLOAD_BYTES = MAX_FREE_FORMAT_FRAME_SIZE;
const MAX_BITRESERVOIR_BYTES = 511;
const SHORT_BLOCK_TYPE = 2;
const STOP_BLOCK_TYPE = 3;

const HALFRATE = [
  [[0,4,8,12,16,20,24,28,32,40,48,56,64,72,80],[0,4,8,12,16,20,24,28,32,40,48,56,64,72,80],[0,16,24,28,32,40,48,56,64,72,80,88,96,112,128]],
  [[0,16,20,24,28,32,40,48,56,64,80,96,112,128,160],[0,16,24,28,32,40,48,56,64,80,96,112,128,160,192],[0,16,32,48,64,80,96,112,128,144,160,176,192,208,224]],
];
const G_HZ = [44100, 48000, 32000];

function hdrValid(h: Uint8Array): boolean {
  return (
    h[0] === 0xff &&
    ((h[1]! & 0xf0) === 0xf0 || (h[1]! & 0xfe) === 0xe2) &&
    hdrGetLayer(h) !== 0 &&
    hdrGetBitrate(h) !== 15 &&
    hdrGetSampleRate(h) !== 3
  );
}

function hdrCompare(h1: Uint8Array, h2: Uint8Array, off2 = 0): boolean {
  return (
    hdrValid(h2.subarray(off2)) &&
    ((h1[1]! ^ h2[off2 + 1]!) & 0xfe) === 0 &&
    ((h1[2]! ^ h2[off2 + 2]!) & 0x0c) === 0 &&
    +hdrIsFreeFormat(h1) === +hdrIsFreeFormat(h2.subarray(off2))
  );
}

function hdrBitrateKbps(h: Uint8Array): number {
  return 2 * HALFRATE[hdrTestMpeg1(h) ? 1 : 0]![hdrGetLayer(h) - 1]![hdrGetBitrate(h)]!;
}

function hdrSampleRateHz(h: Uint8Array): number {
  return G_HZ[hdrGetSampleRate(h)]! >> (hdrTestMpeg1(h) ? 0 : 1) >> (hdrTestNotMpeg25(h) ? 0 : 1);
}

function hdrFrameSamples(h: Uint8Array): number {
  return hdrIsLayer1(h) ? 384 : 1152 >> (hdrIsFrame576(h) ? 1 : 0);
}

function hdrFrameBytes(h: Uint8Array, freeFormatSize: number): number {
  let frameBytes = Math.trunc((hdrFrameSamples(h) * hdrBitrateKbps(h) * 125) / hdrSampleRateHz(h));
  if (hdrIsLayer1(h)) frameBytes &= ~3;
  return frameBytes !== 0 ? frameBytes : freeFormatSize;
}

function hdrPadding(h: Uint8Array): number {
  return hdrTestPadding(h) ? (hdrIsLayer1(h) ? 4 : 1) : 0;
}

// bs_t (bit stream reader)
interface Bs {
  buf: Uint8Array;
  pos: number;
  limit: number;
}

function bsInit(bs: Bs, data: Uint8Array, byteCount: number): void {
  bs.buf = data;
  bs.pos = 0;
  bs.limit = byteCount * 8;
}

function getBits(bs: Bs, n: number): number {
  const s = bs.pos & 7;
  const shl = n + s;
  const p = bs.pos >> 3;
  bs.pos += n;
  if (bs.pos > bs.limit) return 0;
  let next = bs.buf[p]! & (255 >> s);
  let cache = 0;
  let cur = shl;
  let idx = p + 1;
  while ((cur -= 8) > 0) {
    cache |= next << cur;
    next = bs.buf[idx++]!;
  }
  return (cache | (next >> -cur)) >>> 0;
}

// L3_gr_info_t
interface GrInfo {
  sfbtab: number[];
  part23Length: number;
  bigValues: number;
  scalefacCompress: number;
  globalGain: number;
  blockType: number;
  mixedBlockFlag: number;
  nLongSfb: number;
  nShortSfb: number;
  tableSelect: number[];
  regionCount: number[];
  subblockGain: number[];
  preflag: number;
  scalefacScale: number;
  count1Table: number;
  scfsi: number;
}

function newGrInfo(): GrInfo {
  return {
    sfbtab: G_SCF_LONG[0]!, part23Length: 0, bigValues: 0, scalefacCompress: 0,
    globalGain: 0, blockType: 0, mixedBlockFlag: 0, nLongSfb: 22, nShortSfb: 0,
    tableSelect: [0, 0, 0], regionCount: [0, 0, 0], subblockGain: [0, 0, 0],
    preflag: 0, scalefacScale: 0, count1Table: 0, scfsi: 0,
  };
}

export interface Mp3Dec {
  mdctOverlap: Float32Array[]; // [2][9*32]
  qmfState: Float32Array; // 15*2*32
  reserv: number;
  freeFormatBytes: number;
  header: Uint8Array;
  reservBuf: Uint8Array;
}

export function mp3decInit(dec: Mp3Dec): void {
  dec.mdctOverlap = [new Float32Array(9 * 32), new Float32Array(9 * 32)];
  dec.qmfState = new Float32Array(15 * 2 * 32);
  dec.reserv = 0;
  dec.freeFormatBytes = 0;
  dec.header = new Uint8Array(4);
  dec.reservBuf = new Uint8Array(511);
}

// L3_read_side_info (minimp3.h:484-607)
function l3ReadSideInfo(bs: Bs, gr: GrInfo[], hdr: Uint8Array): number {
  const srIdx = hdrGetMySampleRate(hdr) - (hdrGetMySampleRate(hdr) !== 0 ? 1 : 0);
  let grCount = hdrIsMono(hdr) ? 1 : 2;
  let mainDataBegin: number;
  let scfsi = 0;
  let part23Sum = 0;

  if (hdrTestMpeg1(hdr)) {
    grCount *= 2;
    mainDataBegin = getBits(bs, 9);
    scfsi = getBits(bs, 7 + grCount);
  } else {
    mainDataBegin = getBits(bs, 8 + grCount) >> grCount;
  }

  let g = 0;
  do {
    const gi = gr[g]!;
    if (hdrIsMono(hdr)) scfsi = (scfsi << 4) >>> 0;
    gi.part23Length = getBits(bs, 12);
    part23Sum += gi.part23Length;
    gi.bigValues = getBits(bs, 9);
    if (gi.bigValues > 288) return -1;
    gi.globalGain = getBits(bs, 8);
    gi.scalefacCompress = getBits(bs, hdrTestMpeg1(hdr) ? 4 : 9);
    gi.sfbtab = G_SCF_LONG[srIdx]!;
    gi.nLongSfb = 22;
    gi.nShortSfb = 0;
    if (getBits(bs, 1) !== 0) {
      gi.blockType = getBits(bs, 2);
      if (gi.blockType === 0) return -1;
      gi.mixedBlockFlag = getBits(bs, 1);
      gi.regionCount[0] = 7;
      gi.regionCount[1] = 255;
      if (gi.blockType === SHORT_BLOCK_TYPE) {
        scfsi &= 0x0f0f;
        if (!gi.mixedBlockFlag) {
          gi.regionCount[0] = 8;
          gi.sfbtab = G_SCF_SHORT[srIdx]!;
          gi.nLongSfb = 0;
          gi.nShortSfb = 39;
        } else {
          gi.sfbtab = G_SCF_MIXED[srIdx]!;
          gi.nLongSfb = hdrTestMpeg1(hdr) ? 8 : 6;
          gi.nShortSfb = 30;
        }
      }
      let tables = getBits(bs, 10);
      tables <<= 5;
      gi.subblockGain[0] = getBits(bs, 3);
      gi.subblockGain[1] = getBits(bs, 3);
      gi.subblockGain[2] = getBits(bs, 3);
      gi.tableSelect[0] = (tables >> 10) & 31;
      gi.tableSelect[1] = (tables >> 5) & 31;
      gi.tableSelect[2] = tables & 31;
      gi.preflag = hdrTestMpeg1(hdr) ? getBits(bs, 1) : (gi.scalefacCompress >= 500 ? 1 : 0);
    } else {
      gi.blockType = 0;
      gi.mixedBlockFlag = 0;
      const tables = getBits(bs, 15);
      gi.regionCount[0] = getBits(bs, 4);
      gi.regionCount[1] = getBits(bs, 3);
      gi.regionCount[2] = 255;
      gi.tableSelect[0] = (tables >> 10) & 31;
      gi.tableSelect[1] = (tables >> 5) & 31;
      gi.tableSelect[2] = tables & 31;
      gi.preflag = hdrTestMpeg1(hdr) ? getBits(bs, 1) : (gi.scalefacCompress >= 500 ? 1 : 0);
    }
    gi.scalefacScale = getBits(bs, 1);
    gi.count1Table = getBits(bs, 1);
    gi.scfsi = (scfsi >>> 12) & 15;
    scfsi = (scfsi << 4) >>> 0;
  } while (--grCount);

  if (part23Sum + bs.pos > bs.limit + mainDataBegin * 8) return -1;
  return mainDataBegin;
}

// L3_read_scalefactors (minimp3.h:609-641)
function l3ReadScalefactors(
  scf: Uint8Array, scfOff: number,
  istPos: Uint8Array, istOff: number,
  scfSize: number[], scfCount: number[] | number[],
  bitbuf: Bs, scfsi: number,
): void {
  let sOff = scfOff, iOff = istOff;
  for (let i = 0; i < 4 && scfCount[i] !== 0; i++, scfsi *= 2) {
    const cnt = (scfCount as number[])[i]!;
    if (scfsi & 8) {
      for (let k = 0; k < cnt; k++) scf[sOff + k] = istPos[iOff + k]!;
    } else {
      const bits = scfSize[i]!;
      if (bits === 0) {
        for (let k = 0; k < cnt; k++) { scf[sOff + k] = 0; istPos[iOff + k] = 0; }
      } else {
        const maxScf = scfsi < 0 ? (1 << bits) - 1 : -1;
        for (let k = 0; k < cnt; k++) {
          const s = getBits(bitbuf, bits);
          istPos[iOff + k] = s === maxScf ? 255 : s; // -1 → 0xff (uint8)
          scf[sOff + k] = s;
        }
      }
    }
    sOff += cnt;
    iOff += cnt;
  }
  scf[sOff] = scf[sOff + 1] = scf[sOff + 2] = 0;
}

// L3_ldexp_q2 (minimp3.h:642-653)
function l3LdexpQ2(y: number, expQ2: number): number {
  let e: number;
  do {
    e = Math.min(30 * 4, expQ2);
    y *= G_EXPFRAC[e & 3]! * (1 << 30 >> (e >> 2));
  } while ((expQ2 -= e) > 0);
  return y;
}

// L3_decode_scalefactors (minimp3.h:654-715)
function l3DecodeScalefactors(
  hdr: Uint8Array, istPos: Uint8Array, bs: Bs, gr: GrInfo, scf: Float32Array, ch: number,
): void {
  const scfPartitionRow = G_SCF_PARTITIONS[(gr.nShortSfb !== 0 ? 1 : 0) + (gr.nLongSfb === 0 ? 1 : 0)]! as unknown as number[];
  void scfPartitionRow;
  const scfSize = [0, 0, 0, 0];
  const iscf = new Uint8Array(40);
  const scfShift = gr.scalefacScale + 1;
  let scfsi = gr.scfsi;

  if (hdrTestMpeg1(hdr)) {
    const part = G_SCFC_DECODE[gr.scalefacCompress]!;
    scfSize[1] = scfSize[0] = part >> 2;
    scfSize[3] = scfSize[2] = part & 3;
    l3ReadScalefactors(iscf, 0, istPos, 0, scfSize, scfPartitionRow, bs, scfsi);
  } else {
    const ist = hdrTestIStereo(hdr) && ch !== 0 ? 1 : 0;
    const sfc0 = gr.scalefacCompress >> ist;
    let sfc = sfc0;
    let k = ist * 3 * 4;
    for (; sfc >= 0; sfc -= 0, k += 4) {
      // C loop: for (k = ist*3*4; sfc >= 0; sfc -= modprod, k += 4)
      let modprod = 1;
      for (let i = 3; i >= 0; i--) {
        scfSize[i] = Math.trunc(sfc / modprod) % G_MOD[k + i]!;
        modprod *= G_MOD[k + i]!;
      }
      sfc -= modprod;
      if (sfc < 0) break;
    }
    const part = scfPartitionRow.slice(k);
    scfsi = -16;
    l3ReadScalefactors(iscf, 0, istPos, 0, scfSize, part, bs, scfsi);
  }

  if (gr.nShortSfb !== 0) {
    const sh = 3 - scfShift;
    for (let i = 0; i < gr.nShortSfb; i += 3) {
      iscf[gr.nLongSfb + i + 0] = (iscf[gr.nLongSfb + i + 0] ?? 0) + ((gr.subblockGain[0] ?? 0) << sh);
      iscf[gr.nLongSfb + i + 1] = (iscf[gr.nLongSfb + i + 1] ?? 0) + ((gr.subblockGain[1] ?? 0) << sh);
      iscf[gr.nLongSfb + i + 2] = (iscf[gr.nLongSfb + i + 2] ?? 0) + ((gr.subblockGain[2] ?? 0) << sh);
    }
  } else if (gr.preflag !== 0) {
    for (let i = 0; i < 10; i++) iscf[11 + i] = (iscf[11 + i] ?? 0) + (G_PREAMP[i] ?? 0);
  }

  const gainExp = gr.globalGain + BITS_DEQUANTIZER_OUT * 4 - 210 - (hdrIsMsStereo(hdr) ? 2 : 0);
  const gain = l3LdexpQ2(1 << (MAX_SCFI / 4), MAX_SCFI - gainExp);
  const n = gr.nLongSfb + gr.nShortSfb;
  for (let i = 0; i < n; i++) {
    scf[i] = l3LdexpQ2(gain, ((iscf[i] ?? 0) | 0) << scfShift);
  }
}

// L3_pow_43 (minimp3.h:721-741)
function l3Pow43(x: number): number {
  let mult = 256;
  if (x < 129) return G_POW43[16 + x]!;
  if (x < 1024) {
    mult = 16;
    x <<= 3;
  }
  const sign = (2 * x) & 64;
  const frac = ((x & 63) - sign) / ((x & ~63) + sign);
  return G_POW43[16 + ((x + sign) >> 6)]! * (1 + frac * (4 / 3 + frac * (2 / 9))) * mult;
}

// L3_huffman (minimp3.h:742-876) — scalar path with 32-bit cache emulated
// via a bit reader that mirrors the C cache semantics exactly.
function l3Huffman(
  dst: Float32Array, dstOff: number,
  bs: Bs, gr: GrInfo, scf: Float32Array, layer3grLimit: number,
): void {
  const tab32 = TAB32;
  const tab33 = TAB33;
  let one = 0;
  let ireg = 0;
  let bigValCnt = gr.bigValues;
  const sfb = gr.sfbtab;
  let sfbIdx = 0;

  // 32-bit big-endian cache like the C implementation.
  let bsCache = 0;
  let bsSh = (bs.pos & 7) - 8;
  let bytePos = bs.pos >> 3;
  const load4 = (): number => {
    const b0 = bytePos < bs.buf.length ? bs.buf[bytePos]! : 0;
    const b1 = bytePos + 1 < bs.buf.length ? bs.buf[bytePos + 1]! : 0;
    const b2 = bytePos + 2 < bs.buf.length ? bs.buf[bytePos + 2]! : 0;
    const b3 = bytePos + 3 < bs.buf.length ? bs.buf[bytePos + 3]! : 0;
    return (((b0 * 256 + b1) * 256 + b2) * 256 + b3) >>> 0;
  };
  bsCache = (load4() << (bs.pos & 7)) >>> 0;
  bytePos += 4;

  const peekBits = (n: number): number => (n === 0 ? 0 : bsCache >>> (32 - n));
  const flushBits = (n: number): void => {
    bsCache = (bsCache << n) >>> 0;
    bsSh += n;
  };
  const checkBits = (): void => {
    while (bsSh >= 0) {
      bsCache = (bsCache | ((bytePos < bs.buf.length ? bs.buf[bytePos++]! : 0) << bsSh)) >>> 0;
      bsSh -= 8;
    }
  };

  while (bigValCnt > 0) {
    const tabNum = gr.tableSelect[ireg]!;
    let sfbCnt = gr.regionCount[ireg++]!;
    const codebook = TABS;
    const codebookBase = TABINDEX[tabNum]!;
    const linbits = G_LINBITS[tabNum]!;
    do {
      let np = sfb[sfbIdx++]! / 2;
      let pairsToDecode = Math.min(bigValCnt, np);
      one = scf[0]!; scf = scf.subarray(1);
      do {
        let w = 5;
        let leaf = codebook[codebookBase + peekBits(w)]!;
        while (leaf < 0) {
          flushBits(w);
          w = leaf & 7;
          leaf = codebook[codebookBase + peekBits(w) - (leaf >> 3)]!;
        }
        flushBits(leaf >> 8);

        for (let j = 0; j < 2; j++, dstOff++, leaf >>= 4) {
          let lsb = leaf & 0x0f;
          if (lsb === 15) {
            lsb += peekBits(linbits);
            flushBits(linbits);
            checkBits();
            dst[dstOff] = one * l3Pow43(lsb) * (bsCache >= 0x80000000 ? -1 : 1);
          } else {
            dst[dstOff] = G_POW43[16 + lsb - 16 * (bsCache >>> 31)]! * one;
          }
          flushBits(lsb !== 0 ? 1 : 0);
        }
        checkBits();
      } while (--pairsToDecode);
      bigValCnt -= np;
    } while (bigValCnt > 0 && --sfbCnt >= 0);
  }

  // count1 loop
  let np = 1 - bigValCnt;
  for (;; dstOff += 4) {
    const codebookCount1 = gr.count1Table !== 0 ? tab33 : tab32;
    let leaf = codebookCount1[peekBits(4)]!;
    if (!(leaf & 8)) {
      leaf = codebookCount1[(leaf >> 3) + (((bsCache << 4) >>> 0) >>> (32 - (leaf & 3)))]!;
    }
    flushBits(leaf & 7);
    if (bytePos * 8 - 24 + bsSh > layer3grLimit) break;
    // RELOAD_SCALEFACTOR
    if (--np === 0) {
      np = sfb[sfbIdx++]! / 2;
      if (np === 0) break;
      one = scf[0]!; scf = scf.subarray(1);
    }
    const deqCount1 = (s: number): void => {
      if (leaf & (128 >> s)) {
        dst[dstOff + s] = bsCache >= 0x80000000 ? -one : one;
        flushBits(1);
      }
    };
    deqCount1(0);
    deqCount1(1);
    if (--np === 0) {
      np = sfb[sfbIdx++]! / 2;
      if (np === 0) break;
      one = scf[0]!; scf = scf.subarray(1);
    }
    deqCount1(2);
    deqCount1(3);
    checkBits();
  }

  bs.pos = layer3grLimit;
}

// L3_midside_stereo (minimp3.h:879-910)
function l3MidsideStereo(left: Float32Array, n: number): void {
  for (let i = 0; i < n; i++) {
    const a = left[i]!;
    const b = left[i + 576]!;
    left[i] = a + b;
    left[i + 576] = a - b;
  }
}

// L3_intensity_stereo (minimp3.h:911-995)
function l3IntensityStereo(left: Float32Array, istPos: Uint8Array, gr: GrInfo[], hdr: Uint8Array): void {
  const maxBand = [0, 0, 0];
  const nSfb = gr[0]!.nLongSfb + gr[0]!.nShortSfb;
  const maxBlocks = gr[0]!.nShortSfb !== 0 ? 3 : 1;
  {
    // L3_stereo_top_band
    const right = left.subarray(576);
    const sfb = gr[0]!.sfbtab;
    let rOff = 0;
    maxBand[0] = maxBand[1] = maxBand[2] = -1;
    for (let i = 0; i < nSfb; i++) {
      for (let k = 0; k < sfb[i]!; k += 2) {
        if (right[rOff + k] !== 0 || right[rOff + k + 1] !== 0) {
          maxBand[i % 3] = i;
          break;
        }
      }
      rOff += sfb[i]!;
    }
  }
  if (gr[0]!.nLongSfb !== 0) {
    const m = Math.max(maxBand[0]!, maxBand[1]!, maxBand[2]!);
    maxBand[0] = maxBand[1] = maxBand[2] = m;
  }
  const mpeg1 = hdrTestMpeg1(hdr);
  for (let i = 0; i < maxBlocks; i++) {
    const defaultPos = mpeg1 ? 3 : 0;
    const itop = nSfb - maxBlocks + i;
    const prev = itop - maxBlocks;
    istPos[itop] = maxBand[i]! >= prev ? defaultPos : istPos[prev]!;
  }
  // L3_stereo_process
  const mpeg2Sh = gr[1]!.scalefacCompress & 1;
  let lOff = 0;
  const sfb = gr[0]!.sfbtab;
  const maxPos = mpeg1 ? 7 : 64;
  for (let i = 0; sfb[i] !== 0; i++) {
    const ipos = istPos[i]!;
    if (i > maxBand[i % 3]! && ipos < maxPos) {
      const s = hdrIsMsStereo(hdr) ? 1.41421356 : 1;
      let kl: number, kr: number;
      if (mpeg1) {
        kl = G_PAN[2 * ipos]!;
        kr = G_PAN[2 * ipos + 1]!;
      } else {
        kl = 1;
        kr = l3LdexpQ2(1, ((ipos + 1) >> 1) << mpeg2Sh);
        if (ipos & 1) {
          kl = kr;
          kr = 1;
        }
      }
      const n = sfb[i]!;
      for (let k = 0; k < n; k++) {
        left[lOff + k + 576] = left[lOff + k]! * kr * s;
        left[lOff + k] = left[lOff + k]! * kl * s;
      }
    } else if (hdrIsMsStereo(hdr)) {
      for (let k = 0; k < sfb[i]!; k++) {
        const a = left[lOff + k]!;
        const b = left[lOff + k + 576]!;
        left[lOff + k] = a + b;
        left[lOff + k + 576] = a - b;
      }
    }
    lOff += sfb[i]!;
  }
}

// L3_reorder (minimp3.h:996-1012)
function l3Reorder(grbuf: Float32Array, gOff: number, scratch: Float32Array, sfb: number[]): void {
  let src = gOff;
  let dst = 0;
  for (let i = 0; sfb[i] !== 0; i += 3) {
    const len = sfb[i]!;
    for (let j = 0; j < len; j++, src++) {
      scratch[dst++] = grbuf[src + 0 * len]!;
      scratch[dst++] = grbuf[src + 1 * len]!;
      scratch[dst++] = grbuf[src + 2 * len]!;
    }
    src += 2 * len;
  }
  grbuf.set(scratch.subarray(0, dst), gOff);
}

// L3_antialias (minimp3.h:1013-1047)
function l3Antialias(grbuf: Float32Array, gOff: number, nbands: number): void {
  for (; nbands > 0; nbands--, gOff += 18) {
    for (let i = 0; i < 8; i++) {
      const u = grbuf[gOff + 18 + i]!;
      const d = grbuf[gOff + 17 - i]!;
      grbuf[gOff + 18 + i] = u * (G_AA[0] as unknown as number[])[i]! - d * (G_AA[1] as unknown as number[])[i]!;
      grbuf[gOff + 17 - i] = u * (G_AA[1] as unknown as number[])[i]! + d * (G_AA[0] as unknown as number[])[i]!;
    }
  }
}

// L3_dct3_9 (minimp3.h:1048-1087)
function l3Dct3_9(y: Float32Array, yOff = 0): void {
  let s0 = y[yOff]!, s2 = y[yOff + 2]!, s4 = y[yOff + 4]!, s6 = y[yOff + 6]!, s8 = y[yOff + 8]!;
  const t0 = s0 + s6 * 0.5;
  s0 -= s6;
  const t4 = (s4 + s2) * 0.93969262;
  const t2 = (s8 + s2) * 0.76604444;
  s6 = (s4 - s8) * 0.17364818;
  s4 += s8 - s2;

  const s2n = s0 - s4 * 0.5;
  y[yOff + 4] = s4 + s0;
  const s8n = t0 - t2 + s6;
  const s0n = t0 - t4 + t2;
  const s4n = t0 + t4 - s6;

  let s1 = y[yOff + 1]!, s3 = y[yOff + 3]!, s5 = y[yOff + 5]!, s7 = y[yOff + 7]!;

  s3 *= 0.8660254;
  const tt0 = (s5 + s1) * 0.98480775;
  const tt4 = (s5 - s7) * 0.34202014;
  const tt2 = (s1 + s7) * 0.64278761;
  s1 = (s1 - s5 - s7) * 0.8660254;

  const s5n = tt0 - s3 - tt2;
  const s7n = tt4 - s3 - tt0;
  const s3n = tt4 + s3 - tt2;

  y[yOff + 0] = s4n - s7n;
  y[yOff + 1] = s2n + s1;
  y[yOff + 2] = s0n - s3n;
  y[yOff + 3] = s8n + s5n;
  y[yOff + 5] = s8n - s5n;
  y[yOff + 6] = s0n + s3n;
  y[yOff + 7] = s2n - s1;
  y[yOff + 8] = s4n + s7n;
}

// L3_imdct36 (minimp3.h:1088-1144)
function l3Imdct36(grbuf: Float32Array, gOff: number, overlap: Float32Array, oOff: number, window: number[], nbands: number): void {
  for (let j = 0; j < nbands; j++, gOff += 18, oOff += 9) {
    const co = new Array<number>(9);
    const si = new Array<number>(9);
    co[0] = -grbuf[gOff]!;
    si[0] = grbuf[gOff + 17]!;
    for (let i = 0; i < 4; i++) {
      si[8 - 2 * i] = grbuf[gOff + 4 * i + 1]! - grbuf[gOff + 4 * i + 2]!;
      co[1 + 2 * i] = grbuf[gOff + 4 * i + 1]! + grbuf[gOff + 4 * i + 2]!;
      si[7 - 2 * i] = grbuf[gOff + 4 * i + 4]! - grbuf[gOff + 4 * i + 3]!;
      co[2 + 2 * i] = -(grbuf[gOff + 4 * i + 3]! + grbuf[gOff + 4 * i + 4]!);
    }
    l3Dct3_9(co as unknown as Float32Array);
    l3Dct3_9(si as unknown as Float32Array);

    si[1] = -si[1]!;
    si[3] = -si[3]!;
    si[5] = -si[5]!;
    si[7] = -si[7]!;

    for (let i = 0; i < 9; i++) {
      const ovl = overlap[oOff + i]!;
      const sum = co[i]! * G_TWID9[9 + i]! + si[i]! * G_TWID9[0 + i]!;
      overlap[oOff + i] = co[i]! * G_TWID9[0 + i]! - si[i]! * G_TWID9[9 + i]!;
      grbuf[gOff + i] = ovl * window[0 + i]! - sum * window[9 + i]!;
      grbuf[gOff + 17 - i] = ovl * window[9 + i]! + sum * window[0 + i]!;
    }
  }
}

// L3_idct3 + L3_imdct12 (minimp3.h:1145-1173)
function l3Idct3(x0: number, x1: number, x2: number, dst: number[]): void {
  const m1 = x1 * 0.8660254;
  const a1 = x0 - x2 * 0.5;
  dst[1] = x0 + x2;
  dst[0] = a1 + m1;
  dst[2] = a1 - m1;
}

function l3Imdct12(x: Float32Array, xOff: number, dst: Float32Array, dOff: number, overlap: Float32Array, oOff: number): void {
  const co = [0, 0, 0];
  const si = [0, 0, 0];
  l3Idct3(-x[xOff]!, x[xOff + 6]! + x[xOff + 3]!, x[xOff + 12]! + x[xOff + 9]!, co);
  l3Idct3(x[xOff + 15]!, x[xOff + 12]! - x[xOff + 9]!, x[xOff + 6]! - x[xOff + 3]!, si);
  si[1] = -si[1]!;

  for (let i = 0; i < 3; i++) {
    const ovl = overlap[oOff + i]!;
    const sum = co[i]! * G_TWID3[3 + i]! + si[i]! * G_TWID3[0 + i]!;
    overlap[oOff + i] = co[i]! * G_TWID3[0 + i]! - si[i]! * G_TWID3[3 + i]!;
    dst[dOff + i] = ovl * G_TWID3[2 - i]! - sum * G_TWID3[5 - i]!;
    dst[dOff + 5 - i] = ovl * G_TWID3[5 - i]! + sum * G_TWID3[2 - i]!;
  }
}

// L3_imdct_short (minimp3.h:1174-1186)
function l3ImdctShort(grbuf: Float32Array, gOff: number, overlap: Float32Array, oOff: number, nbands: number): void {
  for (; nbands > 0; nbands--, oOff += 9, gOff += 18) {
    const tmp = new Float32Array(18);
    tmp.set(grbuf.subarray(gOff, gOff + 18));
    grbuf.set(overlap.subarray(oOff, oOff + 6), gOff);
    l3Imdct12(tmp, 0, grbuf, gOff + 6, overlap, oOff + 6);
    l3Imdct12(tmp, 1, grbuf, gOff + 12, overlap, oOff + 6);
    l3Imdct12(tmp, 2, overlap, oOff, overlap, oOff + 6);
  }
}

// L3_change_sign (minimp3.h:1187-1194)
function l3ChangeSign(grbuf: Float32Array, gOff: number): void {
  let b = gOff + 18;
  for (; b < gOff + 18 + 32 * 18; b += 36) {
    for (let i = 1; i < 18; i += 2) grbuf[b + i] = -grbuf[b + i]!;
  }
}

// L3_imdct_gr (minimp3.h:1195-1212)
function l3ImdctGr(grbuf: Float32Array, gOff: number, overlap: Float32Array, oOff: number, blockType: number, nLongBands: number): void {
  if (nLongBands !== 0) {
    l3Imdct36(grbuf, gOff, overlap, oOff, G_MDCT_WINDOW[0] as unknown as number[], nLongBands);
    gOff += 18 * nLongBands;
    oOff += 9 * nLongBands;
  }
  if (blockType === SHORT_BLOCK_TYPE) l3ImdctShort(grbuf, gOff, overlap, oOff, 32 - nLongBands);
  else l3Imdct36(grbuf, gOff, overlap, oOff, G_MDCT_WINDOW[blockType === STOP_BLOCK_TYPE ? 1 : 0] as unknown as number[], 32 - nLongBands);
}

// L3_save_reservoir / L3_restore_reservoir (minimp3.h:1213-1238)
function l3SaveReservoir(dec: Mp3Dec, maindata: Uint8Array, bs: Bs): void {
  const pos = Math.ceil(bs.pos / 8);
  let remains = Math.floor(bs.limit / 8) - pos;
  if (remains > MAX_BITRESERVOIR_BYTES) {
    remains = MAX_BITRESERVOIR_BYTES;
  }
  if (remains > 0) {
    dec.reservBuf.set(maindata.subarray(pos, pos + remains), 0);
  }
  dec.reserv = remains;
}

function l3RestoreReservoir(dec: Mp3Dec, bs: Bs, maindata: Uint8Array, mainDataBegin: number): boolean {
  const frameBytes = Math.floor((bs.limit - bs.pos) / 8);
  const bytesHave = Math.min(dec.reserv, mainDataBegin);
  const src = Math.max(0, dec.reserv - mainDataBegin);
  maindata.set(dec.reservBuf.subarray(src, src + Math.min(dec.reserv, mainDataBegin)), 0);
  maindata.set(bs.buf.subarray(bs.pos >> 3, (bs.pos >> 3) + frameBytes), bytesHave);
  bsInit(bs, maindata, bytesHave + frameBytes);
  return dec.reserv >= mainDataBegin;
}

// L3_decode (minimp3.h:1239-1274)
function l3Decode(dec: Mp3Dec, bs: Bs, grInfo: GrInfo[], nch: number, grbuf: Float32Array[], scratch: Float32Array, istPos: Uint8Array[]): void {
  for (let ch = 0; ch < nch; ch++) {
    const layer3grLimit = bs.pos + grInfo[ch]!.part23Length;
    l3DecodeScalefactors(dec.header, istPos[ch]!, bs, grInfo[ch]!, scratch, ch);
    l3Huffman(grbuf[ch]!, 0, bs, grInfo[ch]!, scratch, layer3grLimit);
  }

  if (hdrTestIStereo(dec.header)) {
    l3IntensityStereo(grbuf[0]!, istPos[1]!, grInfo, dec.header);
  } else if (hdrIsMsStereo(dec.header)) {
    l3MidsideStereo(grbuf[0]!, 576);
  }

  for (let ch = 0; ch < nch; ch++) {
    const gi = grInfo[ch]!;
    let aaBands = 31;
    const nLongBands = (gi.mixedBlockFlag !== 0 ? 2 : 0) << (hdrGetMySampleRate(dec.header) === 2 ? 1 : 0);

    if (gi.nShortSfb !== 0) {
      aaBands = nLongBands - 1;
      l3Reorder(grbuf[ch]!, nLongBands * 18, scratch, gi.sfbtab.slice(gi.nLongSfb));
    }

    l3Antialias(grbuf[ch]!, 0, aaBands);
    l3ImdctGr(grbuf[ch]!, 0, dec.mdctOverlap[ch]!, 0, gi.blockType, nLongBands);
    l3ChangeSign(grbuf[ch]!, 0);
  }
}

// mp3d_DCT_II (minimp3.h:1275-1430) — scalar path
function mp3dDctII(grbuf: Float32Array, gOff: number, n: number): void {
  for (let k = 0; k < n; k++) {
    const t: number[][] = [[], [], [], []].map(() => new Array<number>(8).fill(0));
    let y = gOff + k;

    for (let i = 0; i < 8; i++) {
      const x0 = grbuf[y + i * 18]!;
      const x1 = grbuf[y + (15 - i) * 18]!;
      const x2 = grbuf[y + (16 + i) * 18]!;
      const x3 = grbuf[y + (31 - i) * 18]!;
      const t0 = x0 + x3;
      const t1 = x1 + x2;
      const t2 = (x1 - x2) * G_SEC[3 * i + 0]!;
      const t3 = (x0 - x3) * G_SEC[3 * i + 1]!;
      t[0]![i] = t0 + t1;
      t[0]![i + 8] = (t0 - t1) * G_SEC[3 * i + 2]!;
      t[1]![i] = t3 + t2;
      t[1]![i + 8] = (t3 - t2) * G_SEC[3 * i + 2]!;
    }
    for (let i = 0; i < 4; i++) {
      const x = t[i]!;
      let x0 = x[0]!, x1 = x[1]!, x2 = x[2]!, x3 = x[3]!, x4 = x[4]!, x5 = x[5]!, x6 = x[6]!, x7 = x[7]!;
      let xt = x0 - x7; x0 += x7;
      x7 = x1 - x6; x1 += x6;
      x6 = x2 - x5; x2 += x5;
      x5 = x3 - x4; x3 += x4;
      x4 = x0 - x3; x0 += x3;
      x3 = x1 - x2; x1 += x2;
      x[0] = x0 + x1;
      x[4] = (x0 - x1) * 0.70710677;
      x5 = x5 + x6;
      x6 = (x6 + x7) * 0.70710677;
      x7 = x7 + xt;
      x3 = (x3 + x4) * 0.70710677;
      x5 -= x7 * 0.198912367; // rotate by PI/8
      x7 += x5 * 0.382683432;
      x5 -= x7 * 0.198912367;
      x0 = xt - x6; xt += x6;
      x[1] = (xt + x7) * 0.50979561;
      x[2] = (x4 + x3) * 0.54119611;
      x[3] = (x0 - x5) * 0.60134488;
      x[5] = (x0 + x5) * 0.89997619;
      x[6] = (x4 - x3) * 1.30656302;
      x[7] = (xt - x7) * 2.56291556;
    }
    for (let i = 0; i < 7; i++, y += 4 * 18) {
      grbuf[y + 0 * 18] = t[0]![i]!;
      grbuf[y + 1 * 18] = t[2]![i]! + t[3]![i]! + t[3]![i + 1]!;
      grbuf[y + 2 * 18] = t[1]![i]! + t[1]![i + 1]!;
      grbuf[y + 3 * 18] = t[2]![i + 1]! + t[3]![i]! + t[3]![i + 1]!;
    }
    grbuf[y + 0 * 18] = t[0]![7]!;
    grbuf[y + 1 * 18] = t[2]![7]! + t[3]![7]!;
    grbuf[y + 2 * 18] = t[1]![7]!;
    grbuf[y + 3 * 18] = t[3]![7]!;
  }
}

// mp3d_scale_pcm (int16 path, minimp3.h:1431-1445)
function mp3dScalePcm(sample: number): number {
  if (sample >= 32766.5) return 32767;
  if (sample <= -32767.5) return -32768;
  let s = Math.trunc(sample + 0.5);
  s -= s < 0 ? 1 : 0; // away from zero, to be compliant
  return s;
}

// mp3d_synth_pair (minimp3.h:1452-1476)
function mp3dSynthPair(pcm: Int16Array, pOff: number, z: Float32Array, zOff: number): void {
  let a = 0;
  a = (z[zOff + 14 * 64]! - z[zOff + 0]!) * 29;
  a += (z[zOff + 1 * 64]! + z[zOff + 13 * 64]!) * 213;
  a += (z[zOff + 12 * 64]! - z[zOff + 2 * 64]!) * 459;
  a += (z[zOff + 3 * 64]! + z[zOff + 11 * 64]!) * 2037;
  a += (z[zOff + 10 * 64]! - z[zOff + 4 * 64]!) * 5153;
  a += (z[zOff + 5 * 64]! + z[zOff + 9 * 64]!) * 6574;
  a += (z[zOff + 8 * 64]! - z[zOff + 6 * 64]!) * 37489;
  a += z[zOff + 7 * 64]! * 75038;
  pcm[pOff] = mp3dScalePcm(a);

  const z2 = zOff + 2;
  a = z[z2 + 14 * 64]! * 104;
  a += z[z2 + 12 * 64]! * 1567;
  a += z[z2 + 10 * 64]! * 9727;
  a += z[z2 + 8 * 64]! * 64019;
  a += z[z2 + 6 * 64]! * -9975;
  a += z[z2 + 4 * 64]! * -45;
  a += z[z2 + 2 * 64]! * 146;
  a += z[z2 + 0 * 64]! * -5;
  pcm[pOff + 16] = mp3dScalePcm(a);
}

// mp3d_synth_granule (minimp3.h:1630-1657)
function mp3dSynthGranule(dec: Mp3Dec, grbuf: Float32Array, nbands: number, nch: number, pcm: Int16Array, pOff: number, lins: Float32Array): void {
  for (let i = 0; i < nch; i++) {
    mp3dDctII(grbuf, 576 * i, nbands);
  }

  lins.set(dec.qmfState.subarray(0, 15 * 64), 0);

  for (let i = 0; i < nbands; i += 2) {
    mp3dSynthFull(grbuf.subarray(i), pcm, pOff + 32 * nch * i, nch, lins, i * 64);
  }
  if (nch === 1) {
    for (let i = 0; i < 15 * 64; i += 2) {
      dec.qmfState[i] = lins[nbands * 64 + i]!;
    }
  } else {
    dec.qmfState.set(lins.subarray(nbands * 64, nbands * 64 + 15 * 64));
  }
}

// Full stereo/mono synth for one granule band pair.
function mp3dSynthFull(xl: Float32Array, pcm: Int16Array, pOff: number, nch: number, lins: Float32Array, lOff: number): void {
  const zlinBase = 15 * 64; // zlin = lins + 15*64 (C pointer) — negative
  // indices reach into the qmf_state part of lins, so index via lins.
  // zlin = lins + 15*64 + lOff (C: lins + i*64 passed as synth window base)
  const Z = (idx: number): number => lins[zlinBase + lOff + idx]!;
  const ZW = (idx: number, v: number): void => { lins[zlinBase + lOff + idx] = v; };
  let wi = 0;
  const a = [0, 0, 0, 0];
  const b = [0, 0, 0, 0];

  ZW(4 * 15, xl[18 * 16] as number);
  ZW(4 * 15 + 1, nch === 2 ? xl[576 + 18 * 16]! : xl[18 * 16] as number);
  ZW(4 * 15 + 2, xl[0] as number);
  ZW(4 * 15 + 3, nch === 2 ? xl[576]! : xl[0] as number);

  ZW(4 * 31, xl[1 + 18 * 16] as number);
  ZW(4 * 31 + 1, nch === 2 ? xl[576 + 1 + 18 * 16]! : xl[1 + 18 * 16] as number);
  ZW(4 * 31 + 2, xl[1] as number);
  ZW(4 * 31 + 3, nch === 2 ? xl[576 + 1]! : xl[1] as number);

  mp3dSynthPair(pcm, pOff, lins, lOff + 4 * 15 + 1);
  mp3dSynthPair(pcm, pOff + 32 * nch, lins, lOff + 4 * 15 + 64 + 1);
  mp3dSynthPair(pcm, pOff, lins, lOff + 4 * 15);
  mp3dSynthPair(pcm, pOff + 32 * nch, lins, lOff + 4 * 15 + 64);

  for (let i = 14; i >= 0; i--) {
    ZW(4 * i, xl[18 * (31 - i)] as number);
    ZW(4 * i + 1, nch === 2 ? xl[576 + 18 * (31 - i)]! : xl[18 * (31 - i)] as number);
    ZW(4 * i + 2, xl[1 + 18 * (31 - i)] as number);
    ZW(4 * i + 3, nch === 2 ? xl[576 + 1 + 18 * (31 - i)]! : xl[1 + 18 * (31 - i)] as number);
    ZW(4 * (i + 16), xl[1 + 18 * (1 + i)] as number);
    ZW(4 * (i + 16) + 1, nch === 2 ? xl[576 + 1 + 18 * (1 + i)]! : xl[1 + 18 * (1 + i)] as number);
    ZW(4 * (i - 16) + 2, xl[18 * (1 + i)] as number);
    ZW(4 * (i - 16) + 3, nch === 2 ? xl[576 + 18 * (1 + i)]! : xl[18 * (1 + i)] as number);

    for (let kk = 0; kk < 8; kk++) {
      const w0 = G_WIN[wi++]!, w1 = G_WIN[wi++]!;
      const k = kk;
      const vz = 4 * i - k * 64;
      const vy = 4 * i - (15 - k) * 64;
      for (let j = 0; j < 4; j++) {
        if (k === 0) {
          b[j] = Z(vz + j) * w1 + Z(vy + j) * w0;
          a[j] = Z(vz + j) * w0 - Z(vy + j) * w1;
        } else if (k % 2 === 1) {
          // S2: odd positions (1,3,5,7)
          b[j] = (b[j] ?? 0) + Z(vz + j) * w1 + Z(vy + j) * w0;
          a[j] = (a[j] ?? 0) + Z(vy + j) * w1 - Z(vz + j) * w0;
        } else {
          // S1: even positions (2,4,6)
          b[j] = (b[j] ?? 0) + Z(vz + j) * w1 + Z(vy + j) * w0;
          a[j] = (a[j] ?? 0) + Z(vz + j) * w0 - Z(vy + j) * w1;
        }
      }
    }

    const dstr = pOff + nch - 1;
    const dstl = pOff;
    pcm[dstr + (15 - i) * nch] = mp3dScalePcm(a[1]!);
    pcm[dstr + (17 + i) * nch] = mp3dScalePcm(b[1]!);
    pcm[dstl + (15 - i) * nch] = mp3dScalePcm(a[0]!);
    pcm[dstl + (17 + i) * nch] = mp3dScalePcm(b[0]!);
    pcm[dstr + (47 - i) * nch] = mp3dScalePcm(a[3]!);
    pcm[dstr + (49 + i) * nch] = mp3dScalePcm(b[3]!);
    pcm[dstl + (47 - i) * nch] = mp3dScalePcm(a[2]!);
    pcm[dstl + (49 + i) * nch] = mp3dScalePcm(b[2]!);
  }
}

// mp3d_match_frame / mp3d_find_frame (minimp3.h:1673-1725)
function hdrIsTag(h: Uint8Array): boolean {
  return h[0] === 0x54 && h[1] === 0x41 && h[2] === 0x47 && h[3] === 0;
}
function hdrIsNull(h: Uint8Array): boolean {
  return h[0] === 0 && h[1] === 0 && h[2] === 0 && h[3] === 0;
}
function hdrIsNullOrTag(h: Uint8Array): boolean {
  return hdrIsTag(h) || hdrIsNull(h);
}

function mp3dMatchFrame(hdr: Uint8Array, mp3Bytes: number, frameBytes: number): boolean {
  let i = 0;
  for (let nmatch = 0; nmatch < MAX_FRAME_SYNC_MATCHES; nmatch++) {
    i += hdrFrameBytes(hdr.subarray(i), frameBytes) + hdrPadding(hdr.subarray(i));
    if (i + HDR_SIZE > mp3Bytes) return nmatch > 0;
    if (hdrIsNullOrTag(hdr.subarray(i))) return nmatch > 0;
    if (!hdrCompare(hdr, hdr, i)) return false;
  }
  return true;
}

function mp3dFindFrame(mp3: Uint8Array, mp3Bytes: number, freeFormatBytes: { v: number }, ptrFrameBytes: { v: number }): number {
  for (let i = 0; i < mp3Bytes - HDR_SIZE; i++) {
    const h = mp3.subarray(i);
    if (hdrValid(h)) {
      let frameBytes = hdrFrameBytes(h, freeFormatBytes.v);
      let frameAndPadding = frameBytes + hdrPadding(h);
      for (let k = HDR_SIZE; frameBytes === 0 && k < MAX_FREE_FORMAT_FRAME_SIZE && i + 2 * k < mp3Bytes - HDR_SIZE; k++) {
        if (hdrCompare(h, mp3, i + k)) {
          const fb = k - hdrPadding(h);
          const nextfb = fb + hdrPadding(mp3.subarray(i + k));
          if (i + k + nextfb + HDR_SIZE > mp3Bytes || !hdrCompare(h, mp3, i + k + nextfb)) continue;
          frameAndPadding = k;
          frameBytes = fb;
          freeFormatBytes.v = fb;
        }
      }
      if (
        (frameBytes !== 0 && i + frameAndPadding <= mp3Bytes && mp3dMatchFrame(h, mp3Bytes - i, frameBytes)) ||
        (i === 0 && frameAndPadding === mp3Bytes)
      ) {
        ptrFrameBytes.v = frameAndPadding;
        return i;
      }
      freeFormatBytes.v = 0;
    }
  }
  ptrFrameBytes.v = 0;
  return mp3Bytes;
}

export interface Mp3FrameInfo {
  frameBytes: number;
  channels: number;
  hz: number;
  layer: number;
  bitrateKbps: number;
}

/**
 * mp3dec_decode_frame (minimp3.h:1731-1826). Decodes ONE frame into `pcm`
 * (interleaved), returns the number of samples per frame (0 on failure).
 */
export function mp3decDecodeFrame(dec: Mp3Dec, mp3: Uint8Array, mp3Bytes: number, pcm: Int16Array, info: Mp3FrameInfo): number {
  let i = 0;
  let frameSize = 0;
  let success = true;
  const bsFrame: Bs = { buf: mp3, pos: 0, limit: 0 };
  const maindata = new Uint8Array(MAX_BITRESERVOIR_BYTES + MAX_L3_FRAME_PAYLOAD_BYTES);
  const grbuf = [new Float32Array(2 * 576), new Float32Array(2 * 576)];
  const scf = new Float32Array(40);
  const syn = new Float32Array((18 + 15) * 2 * 32); // syn[18+15][64] — synth reads past the reorder half
  const istPos = [new Uint8Array(39), new Uint8Array(39)];
  const grInfo = [newGrInfo(), newGrInfo(), newGrInfo(), newGrInfo()];

  if (mp3Bytes > 4 && dec.header[0] === 0xff && hdrCompare(dec.header, mp3)) {
    frameSize = hdrFrameBytes(mp3, dec.freeFormatBytes) + hdrPadding(mp3);
    if (frameSize !== mp3Bytes && (frameSize + HDR_SIZE > mp3Bytes || !hdrCompare(mp3, mp3, frameSize))) {
      frameSize = 0;
    }
  }
  if (frameSize === 0) {
    mp3decInit(dec);
    const fb = { v: dec.freeFormatBytes };
    const pf = { v: 0 };
    i = mp3dFindFrame(mp3, mp3Bytes, fb, pf);
    dec.freeFormatBytes = fb.v;
    frameSize = pf.v;
    if (frameSize === 0 || i + frameSize > mp3Bytes) {
      info.frameBytes = i;
      return 0;
    }
  }

  const hdr = mp3.subarray(i);
  dec.header.set(hdr.subarray(0, HDR_SIZE));
  info.frameBytes = i + frameSize;
  info.channels = hdrIsMono(hdr) ? 1 : 2;
  info.hz = hdrSampleRateHz(hdr);
  info.layer = 4 - hdrGetLayer(hdr);
  info.bitrateKbps = hdrBitrateKbps(hdr);

  bsInit(bsFrame, hdr.subarray(HDR_SIZE), frameSize - HDR_SIZE);
  if (hdrIsCrc(hdr)) getBits(bsFrame, 16);

  if (info.layer === 3) {
    const mainDataBegin = l3ReadSideInfo(bsFrame, grInfo, hdr);
    if (mainDataBegin < 0 || bsFrame.pos > bsFrame.limit) {
      mp3decInit(dec);
      return 0;
    }
    success = l3RestoreReservoir(dec, bsFrame, maindata, mainDataBegin);
    if (success) {
      const granules = hdrTestMpeg1(hdr) ? 2 : 1;
      for (let igr = 0; igr < granules; igr++) {
        grbuf[0]!.fill(0);
        grbuf[1]!.fill(0);
        l3Decode(dec, bsFrame, grInfo.slice(igr * info.channels), info.channels, grbuf, scf, istPos);
        mp3dSynthGranule(dec, grbuf[0]!, 18, info.channels, pcm, (igr * 576 * info.channels), syn);
      }
    }
    l3SaveReservoir(dec, maindata, bsFrame);
  } else {
    return 0; // Layer 1/2: not needed for MO3 samples (always Layer 3)
  }
  return success ? hdrFrameSamples(dec.header) : 0;
}

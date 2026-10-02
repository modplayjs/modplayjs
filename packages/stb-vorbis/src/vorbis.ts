// SPDX-License-Identifier: BSD-3-Clause
// Ported from stb_vorbis.c — decoder core: setup header parsing, packet
// decode (floors/residue/mapping/coupling/MDCT), frame finishing.
// Memory-source pull API (stb_vorbis_open_memory + get_frame_float).

import {
  type Vorb, type Codebook, type Floor1, type Residue, type Mapping,
  type Mode, NO_CODE, FAST_HUFFMAN_TABLE_SIZE, STB_VORBIS_FAST_HUFFMAN_LENGTH,
} from './types.js';
import {
  get8, get32, getn, skip, startPage, startPacket, maybeStartPacket,
  nextSegment, get8Packet, get32Packet, flushPacket, prepHuffman,
  getBits, error, setFileOffset, getFileOffset, EOP, INVALID_BITS,
} from './stream.js';
import {
  ilog, float32Unpack, lookup1Values, computeCodewords, computeAcceleratedHuffman,
  computeSortedHuffman, bitReverse, decodeRawShared,
} from './codebook.js';
import { decodeResidue } from './residue.js';
import { inverseMdct } from './mdct.js';
import {
  computeTwiddleFactors, computeWindow, computeBitReverse,
} from './imdct.js';
import { crc32Init } from './crc32.js';
import { INVERSE_DB_TABLE } from './tables.js';

const PAGEFLAG_first_page = 2;
const PAGEFLAG_last_page = 4;
const PAGEFLAG_continued_packet = 1;

export function vorbisValidate(data: Uint8Array): boolean {
  return (
    data[0] === 0x76 && data[1] === 0x6f && data[2] === 0x72 &&
    data[3] === 0x62 && data[4] === 0x69 && data[5] === 0x73
  );
}

/** draw_line (stb_vorbis.c:2043-2091) — LINE_OP(a,b) = a = b (NO_DEFER_FLOOR off). */
function drawLine(output: Float32Array, x0: number, y0: number, x10: number, y1: number, n: number): void {
  const dy = y1 - y0;
  const adx = x10 - x0;
  const ady = Math.abs(dy);
  let x = x0, y = y0;
  let err = 0;
  const base = Math.trunc(dy / adx);
  const sy = dy < 0 ? base - 1 : base + 1;
  const ady2 = ady - Math.abs(base) * adx;
  let x1 = x10;
  if (x1 > n) x1 = n;
  if (x < x1) {
    // LINE_OP(a,b) = a *= b (stb_vorbis.c:2032, deferred-floor flow):
    // the floor multiplies the decoded residue.
    output[x] = (output[x] ?? 0) * INVERSE_DB_TABLE[y & 255]!;
    for (++x; x < x1; ++x) {
      err += ady2;
      if (err >= adx) {
        err -= adx;
        y += sy;
      } else {
        y += base;
      }
      output[x] = (output[x] ?? 0) * INVERSE_DB_TABLE[y & 255]!;
    }
  }
}

function predictPoint(x: number, x0: number, x1: number, y0: number, y1: number): number {
  const dy = y1 - y0;
  const adx = x1 - x0;
  const err = Math.abs(dy) * (x - x0);
  let off = 0;
  if (err >= 0) off = Math.floor(err / adx);
  else off = -Math.floor(-err / adx);
  return dy >= 0 ? y0 + off : y0 - off;
}

function neighborsOf(x: number[], n: number): [number, number] {
  // C neighbors() (stb_vorbis.c:1958-1969): the low/high LOCALS hold X
  // coordinates; the returned *plow/*phigh are the INDICES of those
  // neighbors.
  let low = -1, lowI = -1;
  let high = 65536, highI = -1;
  for (let i = 0; i < n; ++i) {
    const xi = x[i] ?? 0;
    if (xi > low && xi < (x[n] ?? 0)) { low = xi; lowI = i; }
    if (xi < high && xi > (x[n] ?? 0)) { high = xi; highI = i; }
  }
  return [lowI, highI];
}

function computeBlocksize(f: Vorb, b: number, n: number): boolean {
  const n2 = n >> 1, n4 = n >> 2, n8 = n >> 3;
  f.A[b] = new Float32Array(n2);
  f.B[b] = new Float32Array(n2);
  f.C[b] = new Float32Array(n4);
  computeTwiddleFactorsInto(n, f.A[b]!, f.B[b]!, f.C[b]!);
  f.window[b] = new Float32Array(n2);
  computeWindow(n, f.window[b]!);
  f.bitReverse[b] = new Uint16Array(n8);
  computeBitReverse(n, f.bitReverse[b]!);
  return true;
}

function computeTwiddleFactorsInto(n: number, A: Float32Array, B: Float32Array, C: Float32Array): void {
  computeTwiddleFactors(n, A, B, C);
}

// ---------------------------------------------------------------------------
// Setup header (start_decoder, stb_vorbis.c:3589-4213)
// ---------------------------------------------------------------------------

function startDecoder(f: Vorb): boolean {
  let maxSubmaps = 0;
  let longestFloorlist = 0;

  f.firstDecode = true;
  f.nextSeg = -1; // no mid-packet start yet

  if (!startPage(f)) return false;
  if (!(f.pageFlag & PAGEFLAG_first_page)) return error(f, 4);
  if (f.pageFlag & PAGEFLAG_last_page) return error(f, 4);
  if (f.pageFlag & PAGEFLAG_continued_packet) return error(f, 4);
  if (f.segmentCount !== 1) return error(f, 4);
  if (f.segments[0] !== 30) return error(f, 4);

  // id packet
  if (get8(f) !== 1) return error(f, 4);
  const header = new Uint8Array(6);
  if (!getn(f, header, 6)) return error(f, 10);
  if (!vorbisValidate(header)) return error(f, 4);
  if (get32(f) !== 0) return error(f, 4);
  f.channels = get8(f);
  if (!f.channels) return error(f, 4);
  if (f.channels > 256) return error(f, 31);
  f.sampleRate = get32(f);
  if (!f.sampleRate) return error(f, 4);
  get32(f); get32(f); get32(f); // bitrates
  let x = get8(f);
  {
    const log0 = x & 15;
    const log1 = (x >> 4) & 15;
    f.blocksize0 = 1 << log0;
    f.blocksize1 = 1 << log1;
    if (log0 < 6 || log0 > 13) return error(f, 20);
    if (log1 < 6 || log1 > 13) return error(f, 20);
    if (log0 > log1) return error(f, 20);
  }
  x = get8(f);
  if (!(x & 1)) return error(f, 4);

  // comment packet
  if (!startPage(f)) return false;
  if (!startPacket(f)) return false;
  if (!nextSegment(f)) return false;
  if (get8Packet(f) !== 3) return error(f, 20);
  for (let i = 0; i < 6; ++i) header[i] = get8Packet(f);
  if (!vorbisValidate(header)) return error(f, 20);
  {
    const len = get32Packet(f);
    for (let i = 0; i < len; ++i) get8Packet(f); // vendor
    const nComments = get32Packet(f);
    for (let i = 0; i < nComments; ++i) {
      const l = get32Packet(f);
      for (let j = 0; j < l; ++j) get8Packet(f);
    }
    x = get8Packet(f);
    if (!(x & 1)) return error(f, 20);
  }
  skip(f, f.bytesInSeg);
  f.bytesInSeg = 0;
  {
    let len = nextSegment(f);
    while (len !== 0) {
      skip(f, len);
      f.bytesInSeg = 0;
      len = nextSegment(f);
    }
  }

  // setup packet
  if (!startPacket(f)) return false;
  crc32Init();
  if (get8Packet(f) !== 5) return error(f, 20);
  for (let i = 0; i < 6; ++i) header[i] = get8Packet(f);
  if (!vorbisValidate(header)) return error(f, 20);

  // codebooks
  f.codebookCount = getBits(f, 8) + 1;
  f.codebooks = [];
  for (let i = 0; i < f.codebookCount; ++i) {
    let values: Uint32Array | null = null;
    let total = 0;
    const c: Codebook = {
      dimensions: 0, entries: 0, codewordLengths: null,
      minimumValue: 0, deltaValue: 0, valueBits: 0, lookupType: 0,
      sequenceP: 0, sparse: 0, lookupValues: 0, multiplicands: null,
      codewords: null, fastHuffman: new Int32Array(FAST_HUFFMAN_TABLE_SIZE),
      sortedCodewords: null, sortedValues: null, sortedEntries: 0,
    };
    f.codebooks.push(c);
    let xx = getBits(f, 8);
    if (xx !== 0x42) return error(f, 20);
    xx = getBits(f, 8);
    if (xx !== 0x43) return error(f, 20);
    xx = getBits(f, 8);
    if (xx !== 0x56) return error(f, 20);
    xx = getBits(f, 8);
    c.dimensions = (getBits(f, 8) << 8) + xx;
    xx = getBits(f, 8);
    const y = getBits(f, 8);
    c.entries = (getBits(f, 8) << 16) + (y << 8) + xx;
    const ordered = getBits(f, 1);
    c.sparse = ordered ? 0 : getBits(f, 1);
    if (c.dimensions === 0 && c.entries !== 0) return error(f, 20);

    const lengths = new Uint8Array(c.entries);
    if (ordered) {
      let currentEntry = 0;
      let currentLength = getBits(f, 5) + 1;
      while (currentEntry < c.entries) {
        const limit = c.entries - currentEntry;
        const nn = getBits(f, ilog(limit));
        if (currentLength >= 32) return error(f, 20);
        if (currentEntry + nn > c.entries) return error(f, 20);
        lengths.fill(currentLength, currentEntry, currentEntry + nn);
        currentEntry += nn;
        ++currentLength;
      }
    } else {
      for (let j = 0; j < c.entries; ++j) {
        const present = c.sparse ? getBits(f, 1) : 1;
        if (present) {
          lengths[j] = getBits(f, 5) + 1;
          ++total;
          if (lengths[j] === 32) return error(f, 20);
        } else {
          lengths[j] = NO_CODE;
        }
      }
    }

    if (c.sparse && total >= c.entries >> 2) {
      c.sparse = 0;
    }

    let sortedCount = 0;
    if (c.sparse) {
      sortedCount = total;
    } else {
      for (let j = 0; j < c.entries; ++j) {
        if (lengths[j]! > STB_VORBIS_FAST_HUFFMAN_LENGTH && lengths[j]! !== NO_CODE) ++sortedCount;
      }
    }
    c.sortedEntries = sortedCount;
    values = null;
    if (!c.sparse) {
      c.codewordLengths = lengths;
      c.codewords = new Uint32Array(c.entries);
    } else {
      if (c.sortedEntries) {
        c.codewordLengths = new Uint8Array(c.sortedEntries);
        c.codewords = new Uint32Array(c.sortedEntries);
        values = new Uint32Array(c.sortedEntries);
      }
    }

    if (!computeCodewords(c, lengths, c.entries, values)) return error(f, 20);

    if (c.sortedEntries) {
      c.sortedCodewords = new Uint32Array(c.sortedEntries + 1);
      c.sortedValues = new Int32Array(c.sortedEntries + 1);
      computeSortedHuffmanShared(c, lengths, values);
    }

    if (c.sparse) {
      c.codewords = null;
    }

    computeAcceleratedHuffman(c);

    c.lookupType = getBits(f, 4);
    if (c.lookupType > 2) return error(f, 20);
    if (c.lookupType > 0) {
      c.minimumValue = float32Unpack(getBits(f, 32));
      c.deltaValue = float32Unpack(getBits(f, 32));
      c.valueBits = getBits(f, 4) + 1;
      c.sequenceP = getBits(f, 1);
      if (c.lookupType === 1) {
        const v = lookup1Values(c.entries, c.dimensions);
        if (v < 0) return error(f, 20);
        c.lookupValues = v;
      } else {
        c.lookupValues = c.entries * c.dimensions;
      }
      if (c.lookupValues === 0) return error(f, 20);
      const mults = new Int32Array(c.lookupValues);
      for (let j = 0; j < c.lookupValues; ++j) {
        const q = getBits(f, c.valueBits);
        if (q === EOP) return error(f, 20);
        mults[j] = q;
      }

      if (c.lookupType === 1) {
        // pre-expand lookup1 multiplicands
        const len = c.sparse ? c.sortedEntries : c.entries;
        c.multiplicands = new Float32Array(len * c.dimensions);
        let last = 0;
        for (let j = 0; j < len; ++j) {
          const zz = c.sparse ? c.sortedValues![j]! : j;
          let div = 1;
          for (let k = 0; k < c.dimensions; ++k) {
            const off = Math.floor(zz / div) % c.lookupValues;
            const val = mults[off]! * c.deltaValue + c.minimumValue + last;
            c.multiplicands[j * c.dimensions + k] = val;
            if (c.sequenceP) last = val;
            if (k + 1 < c.dimensions) div *= c.lookupValues;
          }
        }
        c.lookupType = 2;
      } else {
        let last = 0;
        c.multiplicands = new Float32Array(c.lookupValues);
        for (let j = 0; j < c.lookupValues; ++j) {
          const val = mults[j]! * c.deltaValue + c.minimumValue + last;
          c.multiplicands[j] = val;
          if (c.sequenceP) last = val;
        }
      }
    }
  }

  // time domain transfers (unused)
  {
    const tCount = getBits(f, 6) + 1;
    for (let i = 0; i < tCount; ++i) {
      if (getBits(f, 16) !== 0) return error(f, 20);
    }
  }

  // floors
  f.floorCount = getBits(f, 6) + 1;
  f.floorTypes = new Array(f.floorCount).fill(0);
  f.floor0Config = [];
  f.floor1Config = [];
  for (let i = 0; i < f.floorCount; ++i) {
    const ftype = getBits(f, 16);
    if (ftype > 1) return error(f, 20);
    f.floorTypes[i] = ftype;
    if (ftype === 0) {
      return error(f, 26); // floor0 not supported (as stb_vorbis)
    } else {
      const g: Floor1 = {
        partitions: 0, partitionClassList: [], classDimensions: [], classSubclasses: [],
        classMasterbooks: [], subclassBooks: [], Xlist: [], sortedOrder: [],
        neighbors: [], floor1Multiplier: 0, rangebits: 0, values: 0,
      };
      f.floor1Config.push(g);
      let maxClass = -1;
      g.partitions = getBits(f, 5);
      for (let j = 0; j < g.partitions; ++j) {
        g.partitionClassList.push(getBits(f, 4));
        if (g.partitionClassList[j]! > maxClass) maxClass = g.partitionClassList[j]!;
      }
      for (let j = 0; j <= maxClass; ++j) {
        g.classDimensions[j] = getBits(f, 3) + 1;
        g.classSubclasses[j] = getBits(f, 2);
        if (g.classSubclasses[j]) {
          g.classMasterbooks[j] = getBits(f, 8);
          if ((g.classMasterbooks[j] ?? 0) >= f.codebookCount) return error(f, 20);
        }
        for (let k = 0; k < (1 << g.classSubclasses[j]!); ++k) {
          g.subclassBooks[j] = g.subclassBooks[j] ?? [];
          g.subclassBooks[j]![k] = getBits(f, 8) - 1;
          if ((g.subclassBooks[j]![k] ?? 0) >= f.codebookCount) return error(f, 20);
        }
      }
      g.floor1Multiplier = getBits(f, 2) + 1;
      g.rangebits = getBits(f, 4);
      g.Xlist[0] = 0;
      g.Xlist[1] = 1 << g.rangebits;
      g.values = 2;
      for (let j = 0; j < g.partitions; ++j) {
        const cl = g.partitionClassList[j]!;
        for (let k = 0; k < g.classDimensions[cl]!; ++k) {
          g.Xlist[g.values] = getBits(f, g.rangebits);
          ++g.values;
        }
      }
      // sort order
      const p: Array<{ x: number; id: number }> = [];
      for (let j = 0; j < g.values; ++j) p.push({ x: g.Xlist[j]!, id: j });
      p.sort((a, b) => a.x - b.x);
      for (let j = 0; j < g.values - 1; ++j) {
        if (p[j]!.x === p[j + 1]!.x) return error(f, 20);
      }
      for (let j = 0; j < g.values; ++j) g.sortedOrder[j] = p[j]!.id;
      // neighbors
      for (let j = 2; j < g.values; ++j) {
        const [low, high] = neighborsOf(g.Xlist as unknown as number[], j);
        g.neighbors[j] = [low, high];
      }
      if (g.values > longestFloorlist) longestFloorlist = g.values;
    }
  }

  // residue
  f.residueCount = getBits(f, 6) + 1;
  f.residueTypes = new Array(f.residueCount).fill(0);
  f.residueConfig = [];
  for (let i = 0; i < f.residueCount; ++i) {
    const r: Residue = { begin: 0, end: 0, partSize: 0, classifications: 0, classbook: 0, classdata: null, residueBooks: null };
    f.residueConfig.push(r);
    const rtype = getBits(f, 16);
    if (rtype > 2) return error(f, 20);
    f.residueTypes[i] = rtype;
    r.begin = getBits(f, 24);
    r.end = getBits(f, 24);
    if (r.end < r.begin) return error(f, 20);
    r.partSize = getBits(f, 24) + 1;
    r.classifications = getBits(f, 6) + 1;
    r.classbook = getBits(f, 8);
    if (r.classbook >= f.codebookCount) return error(f, 20);
    const residueCascade = new Uint8Array(64);
    for (let j = 0; j < r.classifications; ++j) {
      let highBits = 0;
      const lowBits = getBits(f, 3);
      if (getBits(f, 1)) highBits = getBits(f, 5);
      residueCascade[j] = highBits * 8 + lowBits;
    }
    r.residueBooks = [];
    for (let j = 0; j < r.classifications; ++j) {
      const books = new Int16Array(8);
      for (let k = 0; k < 8; ++k) {
        if (residueCascade[j]! & (1 << k)) {
          books[k] = getBits(f, 8);
          if ((books[k] ?? 0) >= f.codebookCount) return error(f, 20);
        } else {
          books[k] = -1;
        }
      }
      r.residueBooks.push(books);
    }
    r.classdata = [];
    const cbEntries = f.codebooks[r.classbook]!.entries;
    const classwords = f.codebooks[r.classbook]!.dimensions;
    for (let j = 0; j < cbEntries; ++j) {
      const cd = new Uint8Array(classwords);
      let temp = j;
      for (let k = classwords - 1; k >= 0; --k) {
        cd[k] = temp % r.classifications;
        temp = Math.floor(temp / r.classifications);
      }
      r.classdata.push(cd);
    }
  }

  // mapping
  f.mappingCount = getBits(f, 6) + 1;
  f.mapping = [];
  for (let i = 0; i < f.mappingCount; ++i) {
    const m: Mapping = { couplingSteps: 0, chan: [], submaps: 0, submapFloor: [], submapResidue: [] };
    f.mapping.push(m);
    const mappingType = getBits(f, 16);
    if (mappingType !== 0) return error(f, 20);
    if (getBits(f, 1)) m.submaps = getBits(f, 4) + 1;
    else m.submaps = 1;
    if (m.submaps > maxSubmaps) maxSubmaps = m.submaps;
    if (getBits(f, 1)) {
      m.couplingSteps = getBits(f, 8) + 1;
      if (m.couplingSteps > f.channels) return error(f, 20);
      for (let k = 0; k < m.couplingSteps; ++k) {
        const magnitude = getBits(f, ilog(f.channels - 1));
        const angle = getBits(f, ilog(f.channels - 1));
        if (magnitude >= f.channels || angle >= f.channels) return error(f, 20);
        if (magnitude === angle) return error(f, 20);
        m.chan.push({ magnitude, angle, mux: 0 });
      }
    } else {
      m.couplingSteps = 0;
    }
    // Allocate one channel entry PER CHANNEL (C: setup_malloc of
    // f->channels entries, stb_vorbis.c:4081); the coupling loop above
    // already wrote magnitude/angle into the first coupling_steps slots.
    while (m.chan.length < f.channels) m.chan.push({ magnitude: 0, angle: 0, mux: 0 });
    if (getBits(f, 2)) return error(f, 20);
    for (let j = 0; j < f.channels; ++j) {
      if (m.submaps > 1) {
        const mux = getBits(f, 4);
        if (mux >= m.submaps) return error(f, 20);
        m.chan[j]!.mux = mux;
      } else {
        // @SPECIFICATION: this case is missing from the spec
        m.chan[j]!.mux = 0;
      }
    }
    for (let j = 0; j < m.submaps; ++j) {
      getBits(f, 8);
      const fl = getBits(f, 8);
      const rs = getBits(f, 8);
      if (fl >= f.floorCount || rs >= f.residueCount) return error(f, 20);
      m.submapFloor.push(fl);
      m.submapResidue.push(rs);
    }
  }

  // modes
  f.modeCount = getBits(f, 6) + 1;
  f.modeConfig = [];
  for (let i = 0; i < f.modeCount; ++i) {
    const m: Mode = { blockflag: 0, mapping: 0, windowtype: 0, transformtype: 0 };
    f.modeConfig.push(m);
    m.blockflag = getBits(f, 1);
    m.windowtype = getBits(f, 16);
    m.transformtype = getBits(f, 16);
    m.mapping = getBits(f, 8);
    if (m.windowtype !== 0 || m.transformtype !== 0) return error(f, 20);
    if (m.mapping >= f.mappingCount) return error(f, 20);
  }

  flushPacket(f);

  f.previousLength = 0;

  for (let i = 0; i < f.channels; ++i) {
    f.channelBuffers[i] = new Float32Array(f.blocksize1);
    f.previousWindow[i] = new Float32Array(f.blocksize1 / 2);
    f.finalY[i] = new Int16Array(longestFloorlist);
  }

  computeBlocksize(f, 0, f.blocksize0);
  computeBlocksize(f, 1, f.blocksize1);
  f.blocksize[0] = f.blocksize0;
  f.blocksize[1] = f.blocksize1;

  if (f.nextSeg === -1) {
    f.firstAudioPageOffset = getFileOffset(f);
  } else {
    f.firstAudioPageOffset = 0;
  }

  return true;
}

function computeSortedHuffmanShared(c: Codebook, lengths: Uint8Array, values: Uint32Array | null): void {
  computeSortedHuffman(c, lengths, values);
}

// ---------------------------------------------------------------------------
// Floor decode + draw (deferred-floor variant)
// ---------------------------------------------------------------------------

function doFloor(f: Vorb, map: Mapping, i: number, n: number, target: Float32Array, finalY: Int16Array): boolean {
  const n2 = n >> 1;
  const s = map.chan[i]!.mux;
  const floor = map.submapFloor[s]!;
  if (f.floorTypes[floor] === 0) {
    f.error = 11;
    return false;
  }
  const g = f.floor1Config[floor]!;
  let lx = 0;
  let ly = finalY[0]! * g.floor1Multiplier;
  for (let q = 1; q < g.values; ++q) {
    const j = g.sortedOrder[q]!;
    if (finalY[j]! >= 0) {
      const hy = finalY[j]! * g.floor1Multiplier;
      const hx = g.Xlist[j]!;
      if (lx !== hx) {
        drawLine(target, lx, ly, hx, hy, n2);
      }
      lx = hx;
      ly = hy;
    }
  }
  if (lx < n2) {
    for (let j = lx; j < n2; ++j) {
      target[j] = (target[j] ?? 0) * INVERSE_DB_TABLE[ly & 255]!;
    }
  }
  return true;
}

// ---------------------------------------------------------------------------
// Packet decode (vorbis_decode_initial/rest, stb_vorbis.c:3133-3523)
// ---------------------------------------------------------------------------

function vorbisDecodeInitial(
  f: Vorb, res: { leftStart: number; leftEnd: number; rightStart: number; rightEnd: number; mode: number },
): boolean {
  f.channelBufferStart = 0;
  f.channelBufferEnd = 0;

  for (;;) {
    if (f.eof) return false;
    if (!maybeStartPacket(f)) return false;
    if (getBits(f, 1) !== 0) {
      while (get8Packet(f) !== EOP) { /* flush */ }
      continue;
    }
    const i = getBits(f, ilog(f.modeCount - 1));
    if (i === EOP) return false;
    if (i >= f.modeCount) return false;
    res.mode = i;
    const m = f.modeConfig[i]!;
    let n: number, prev: number, next: number;
    if (m.blockflag) {
      n = f.blocksize1;
      prev = getBits(f, 1);
      next = getBits(f, 1);
    } else {
      prev = next = 0;
      n = f.blocksize0;
    }

    const windowCenter = n >> 1;
    if (m.blockflag && !prev) {
      res.leftStart = (n - f.blocksize0) >> 2;
      res.leftEnd = (n + f.blocksize0) >> 2;
    } else {
      res.leftStart = 0;
      res.leftEnd = windowCenter;
    }
    if (m.blockflag && !next) {
      res.rightStart = (n * 3 - f.blocksize0) >> 2;
      res.rightEnd = (n * 3 + f.blocksize0) >> 2;
    } else {
      res.rightStart = windowCenter;
      res.rightEnd = n;
    }
    return true;
  }
}

function vorbisDecodePacketRest(
  f: Vorb, len: { v: number }, m: Mode, leftStart0: number, leftEnd0: number,
  rightStart0: number, rightEnd0: number, pLeft: { v: number },
): boolean {
  void leftEnd0;
  let leftStart = leftStart0;
  const n = f.blocksize[m.blockflag]!;
  const map = f.mapping[m.mapping]!;
  const n2 = n >> 1;
  const zeroChannel = new Array<number>(256).fill(0);
  const reallyZeroChannel = new Array<number>(256).fill(0);

  // FLOORS
  for (let i = 0; i < f.channels; ++i) {
    const s = map.chan[i]!.mux;
    const floor = map.submapFloor[s]!;
    zeroChannel[i] = 0;
    if (f.floorTypes[floor] === 0) {
      f.error = 11;
      return false;
    }
    const g = f.floor1Config[floor]!;
    if (getBits(f, 1)) {
      const finalY = f.finalY[i]!;
      const rangeList = [256, 128, 86, 64];
      const range = rangeList[g.floor1Multiplier - 1]!;
      let offset = 2;
      finalY[0] = getBits(f, ilog(range) - 1);
      finalY[1] = getBits(f, ilog(range) - 1);
      const step2Flag = new Array<number>(256).fill(0);
      for (let j = 0; j < g.partitions; ++j) {
        const pclass = g.partitionClassList[j]!;
        const cdim = g.classDimensions[pclass]!;
        const cbits = g.classSubclasses[pclass]!;
        const csub = (1 << cbits) - 1;
        let cval = 0;
        if (cbits) {
          const c = f.codebooks[g.classMasterbooks[pclass]!]!;
          cval = decodeShared(f, c);
        }
        for (let k = 0; k < cdim; ++k) {
          const book = g.subclassBooks[pclass]![cval & csub]!;
          cval = cval >> cbits;
          if (book >= 0) {
            const c = f.codebooks[book]!;
            finalY[offset++] = decodeShared(f, c);
          } else {
            finalY[offset++] = 0;
          }
        }
      }
      if (f.validBits === INVALID_BITS) { f.error = 11; return false; }
      step2Flag[0] = step2Flag[1] = 1;
      for (let j = 2; j < g.values; ++j) {
        const low = g.neighbors[j]![0]!;
        const high = g.neighbors[j]![1]!;
        const pred = predictPoint(g.Xlist[j]!, g.Xlist[low]!, g.Xlist[high]!, finalY[low]!, finalY[high]!);
        const val = finalY[j]!;
        const highroom = range - pred;
        const lowroom = pred;
        let room;
        if (highroom < lowroom) room = highroom * 2;
        else room = lowroom * 2;
        if (val) {
          step2Flag[low] = step2Flag[high] = 1;
          step2Flag[j] = 1;
          if (val >= room) {
            if (highroom > lowroom) finalY[j] = val - lowroom + pred;
            else finalY[j] = pred - val + highroom - 1;
          } else {
            if (val & 1) finalY[j] = pred - ((val + 1) >> 1);
            else finalY[j] = pred + (val >> 1);
          }
        } else {
          step2Flag[j] = 0;
          finalY[j] = pred;
        }
      }
      // defer floor: mark unused
      for (let j = 0; j < g.values; ++j) {
        if (!step2Flag[j]) finalY[j] = -1;
      }
    } else {
      zeroChannel[i] = 1;
    }
  }

  // re-enable coupled channels
  for (let i = 0; i < f.channels; ++i) reallyZeroChannel[i] = zeroChannel[i] ?? 0;
  for (let i = 0; i < map.couplingSteps; ++i) {
    const mag = map.chan[i]?.magnitude ?? 0;
    const ang = map.chan[i]?.angle ?? 0;
    if (!zeroChannel[mag] || !zeroChannel[ang]) {
      zeroChannel[mag] = 0;
      zeroChannel[ang] = 0;
    }
  }

  // RESIDUE
  for (let i = 0; i < map.submaps; ++i) {
    const residueBuffers: Array<Float32Array | null> = [];
    const doNotDecode: number[] = [];
    let ch = 0;
    for (let j = 0; j < f.channels; ++j) {
      if (map.chan[j]!.mux === i) {
        if (zeroChannel[j]) {
          doNotDecode[ch] = 1;
          residueBuffers.push(null);
        } else {
          doNotDecode[ch] = 0;
          residueBuffers.push(f.channelBuffers[j]!);
        }
        ++ch;
      }
    }
    const r = map.submapResidue[i]!;
    decodeResidue(f, residueBuffers, ch, n2, r, doNotDecode);
  }

  // INVERSE COUPLING
  for (let i = map.couplingSteps - 1; i >= 0; --i) {
    const mag = f.channelBuffers[map.chan[i]?.magnitude ?? 0]!;
    const ang = f.channelBuffers[map.chan[i]?.angle ?? 0]!;
    for (let j = 0; j < n2; ++j) {
      let a2: number, m2: number;
      if (mag[j]! > 0) {
        if (ang[j]! > 0) { m2 = mag[j]!; a2 = mag[j]! - ang[j]!; }
        else { a2 = mag[j]!; m2 = mag[j]! + ang[j]!; }
      } else {
        if (ang[j]! > 0) { m2 = mag[j]!; a2 = mag[j]! + ang[j]!; }
        else { a2 = mag[j]!; m2 = mag[j]! - ang[j]!; }
      }
      mag[j] = m2;
      ang[j] = a2;
    }
  }

  // floors
  for (let i = 0; i < f.channels; ++i) {
    if (reallyZeroChannel[i]) {
      f.channelBuffers[i]!.fill(0, 0, n2);
    } else {
      doFloor(f, map, i, n, f.channelBuffers[i]!, f.finalY[i]!);
    }
  }

  // inverse MDCT
  for (let i = 0; i < f.channels; ++i) {
    inverseMdct(f.channelBuffers[i]!, n, f, m.blockflag);
  }

  flushPacket(f);

  if (f.firstDecode) {
    f.currentLoc = (0 - n2) >>> 0;
    f.discardSamplesDeferred = n - rightEnd0;
    f.currentLocValid = true;
    f.firstDecode = false;
  } else if (f.discardSamplesDeferred) {
    if (f.discardSamplesDeferred >= rightStart0 - leftStart) {
      f.discardSamplesDeferred -= rightStart0 - leftStart;
      leftStart = rightStart0;
      pLeft.v = leftStart;
    } else {
      leftStart += f.discardSamplesDeferred;
      pLeft.v = leftStart;
      f.discardSamplesDeferred = 0;
    }
  }

  if (f.lastSegWhich === f.endSegWithKnownLoc) {
    if (f.currentLocValid && (f.pageFlag & PAGEFLAG_last_page)) {
      const currentEnd = f.knownLocForPacket;
      if (currentEnd < f.currentLoc + (rightEnd0 - leftStart)) {
        if (currentEnd < f.currentLoc) {
          len.v = 0;
        } else {
          len.v = currentEnd - f.currentLoc;
        }
        len.v += leftStart;
        if (len.v > rightEnd0) len.v = rightEnd0;
        f.currentLoc += len.v;
        return true;
      }
    }
    f.currentLoc = (f.knownLocForPacket - (n2 - leftStart)) >>> 0;
    f.currentLocValid = true;
  }
  if (f.currentLocValid) f.currentLoc = (f.currentLoc + (rightStart0 - leftStart)) >>> 0;

  len.v = rightEnd0;
  return true;
}

function decodeShared(f: Vorb, c: Codebook): number {
  let v = codebookDecodeStartShared(f, c);
  if (c.sparse) v = c.sortedValues![v]!;
  return v;
}

function codebookDecodeStartShared(z: Vorb, c: Codebook): number {
  // C DECODE/DECODE_RAW (stb_vorbis.c:1763-1773): the scalar huffman
  // path has NO lookupType restriction — classmaster codebooks in floor1
  // are lookupType 0 (pure huffman). Only codebook_decode_start (VQ)
  // rejects type 0.
  prepHuffman(z);
  let zz = decodeRawShared(z, c);
  if (zz < 0) {
    if (z.bytesInSeg === 0 && z.lastSeg) return zz;
    z.error = 11;
  }
  return zz;
}

function vorbisDecodePacket(f: Vorb, len: { v: number }, pLeft: { v: number }, pRight: { v: number }): boolean {
  const res = { leftStart: 0, leftEnd: 0, rightStart: 0, rightEnd: 0, mode: 0 };
  if (!vorbisDecodeInitial(f, res)) return false;
  pLeft.v = res.leftStart;
  pRight.v = res.rightStart;
  return vorbisDecodePacketRest(f, len, f.modeConfig[res.mode]!, res.leftStart, res.leftEnd, res.rightStart, res.rightEnd, pLeft);
}

function vorbisFinishFrame(f: Vorb, len: number, left: number, right: number): number {
  const prev0 = f.previousLength;
  if (f.previousLength) {
    const n = f.previousLength;
    const w = getWindow(f, n);
    if (w === null) return 0;
    for (let i = 0; i < f.channels; ++i) {
      const cb = f.channelBuffers[i]!;
      const pw = f.previousWindow[i]!;
      for (let j = 0; j < n; ++j) {
        cb[left + j] = cb[left + j]! * w[j]! + pw[j]! * w[n - 1 - j]!;
      }
    }
  }
  const prev = f.previousLength;
  void prev0;

  f.previousLength = len - right;

  for (let i = 0; i < f.channels; ++i) {
    const cb = f.channelBuffers[i]!;
    const pw = f.previousWindow[i]!;
    for (let j = 0; right + j < len; ++j) {
      pw[j] = cb[right + j]!;
    }
  }

  if (!prev) return 0;
  if (len < right) right = len;
  f.samplesOutput += right - left;
  return right - left;
}

function getWindow(f: Vorb, len0: number): Float32Array | null {
  const len = len0 << 1;
  if (len === f.blocksize0) return f.window[0]!;
  if (len === f.blocksize1) return f.window[1]!;
  return null;
}

function vorbisPumpFirstFrame(f: Vorb): boolean {
  const len = { v: 0 };
  const left = { v: 0 };
  const right = { v: 0 };
  const res = vorbisDecodePacket(f, len, left, right);
  if (res) vorbisFinishFrame(f, len.v, left.v, right.v);
  return res;
}

// ---------------------------------------------------------------------------
// Public API (memory source)
// ---------------------------------------------------------------------------

export function stbVorbisOpenMemory(data: Uint8Array, errorOut: { v: number }): Vorb | null {
  const f: Vorb = {
    stream: data,
    streamStart: 0,
    streamEnd: data.length,
    streamPos: 0,
    streamLen: data.length,
    eof: false,
    error: 0,
    sampleRate: 0,
    channels: 0,
    blocksize: [0, 0],
    blocksize0: 0,
    blocksize1: 0,
    codebookCount: 0,
    codebooks: [],
    floorCount: 0,
    floorTypes: [],
    floor0Config: [],
    floor1Config: [],
    residueCount: 0,
    residueTypes: [],
    residueConfig: [],
    mappingCount: 0,
    mapping: [],
    modeCount: 0,
    modeConfig: [],
    channelBuffers: [],
    outputs: [],
    previousWindow: [],
    previousLength: 0,
    finalY: [],
    currentLoc: 0,
    currentLocValid: false,
    A: [], B: [], C: [], window: [], bitReverse: [],
    firstDecode: false,
    nextSeg: -1,
    lastSeg: false,
    lastSegWhich: 0,
    acc: 0,
    validBits: 0,
    packetBytes: 0,
    endSegWithKnownLoc: -2,
    knownLocForPacket: 0,
    discardSamplesDeferred: 0,
    samplesOutput: 0,
    lastPage: 0,
    segmentCount: 0,
    segments: new Uint8Array(255),
    pageFlag: 0,
    bytesInSeg: 0,
    channelBufferStart: 0,
    channelBufferEnd: 0,
    firstAudioPageOffset: 0,
  };
  if (!startDecoder(f)) {
    errorOut.v = f.error;
    return null;
  }
  vorbisPumpFirstFrame(f);
  return f;
}

export function stbVorbisGetFrameFloat(f: Vorb, len: { v: number }): Float32Array[] | null {
  const left = { v: 0 };
  const right = { v: 0 };
  if (!vorbisDecodePacket(f, len, left, right)) {
    f.channelBufferStart = 0;
    f.channelBufferEnd = 0;
    return null;
  }
  len.v = vorbisFinishFrame(f, len.v, left.v, right.v);
  for (let i = 0; i < f.channels; ++i) {
    f.outputs[i] = f.channelBuffers[i]!.subarray(left.v) as unknown as Float32Array;
  }
  f.channelBufferStart = left.v;
  f.channelBufferEnd = left.v + len.v;
  if (len.v === 0) return null;
  return f.outputs;
}

export { bitReverse, ilog, setFileOffset, getFileOffset, EOP, INVALID_BITS };

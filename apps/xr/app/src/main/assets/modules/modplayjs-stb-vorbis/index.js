// ../../packages/stb-vorbis/src/types.ts
var MAX_BLOCKSIZE_LOG = 13;
var MAX_BLOCKSIZE = 1 << MAX_BLOCKSIZE_LOG;
var FAST_HUFFMAN_TABLE_SIZE = 1 << 10;
var FAST_HUFFMAN_TABLE_MASK = FAST_HUFFMAN_TABLE_SIZE - 1;
var STB_VORBIS_FAST_HUFFMAN_LENGTH = 10;
var NO_CODE = 255;

// ../../packages/stb-vorbis/src/stream.ts
function get8(z) {
  if (z.streamPos >= z.streamEnd) {
    z.eof = true;
    return 0;
  }
  return z.stream[z.streamPos++];
}
function get32(z) {
  let x = get8(z);
  x += get8(z) << 8;
  x += get8(z) << 16;
  x += get8(z) << 24;
  return x >>> 0;
}
function getn(z, data, n) {
  if (z.streamPos + n > z.streamEnd) {
    z.eof = true;
    return false;
  }
  data.set(z.stream.subarray(z.streamPos, z.streamPos + n), 0);
  z.streamPos += n;
  return true;
}
function skip(z, n) {
  z.streamPos += n;
  if (z.streamPos >= z.streamEnd) z.eof = true;
}
function getFileOffset(z) {
  return z.streamPos;
}
function capturePattern(z) {
  if (79 !== get8(z)) return false;
  if (103 !== get8(z)) return false;
  if (103 !== get8(z)) return false;
  if (83 !== get8(z)) return false;
  return true;
}
var PAGEFLAG_continued_packet = 1;
function startPageNoCapturePattern(z) {
  if (z.firstDecode) {
    z.firstAudioPageOffset = getFileOffset(z) - 4;
  }
  if (0 !== get8(z)) {
    return error(z, 2);
  }
  z.pageFlag = get8(z);
  const loc0 = get32(z);
  const loc1 = get32(z);
  get32(z);
  const n = get32(z);
  z.lastPage = n;
  get32(z);
  z.segmentCount = get8(z);
  if (!getn(z, z.segments, z.segmentCount)) return error(z, 10);
  z.endSegWithKnownLoc = -2;
  if (loc0 !== 4294967295 || loc1 !== 4294967295) {
    let i = z.segmentCount - 1;
    for (; i >= 0; --i) if (z.segments[i] < 255) break;
    if (i >= 0) {
      z.endSegWithKnownLoc = i;
      z.knownLocForPacket = loc0;
    }
  }
  z.nextSeg = 0;
  return true;
}
function error(z, e) {
  z.error = e;
  return false;
}
function startPage(z) {
  if (!capturePattern(z)) return error(z, 30);
  return startPageNoCapturePattern(z);
}
function startPacket(z) {
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
function maybeStartPacket(z) {
  if (z.nextSeg === -1) {
    const x = get8(z);
    if (z.eof) return false;
    if (79 !== x) return error(z, 30);
    if (103 !== get8(z)) return error(z, 30);
    if (103 !== get8(z)) return error(z, 30);
    if (83 !== get8(z)) return error(z, 30);
    if (!startPageNoCapturePattern(z)) return false;
    if (z.pageFlag & PAGEFLAG_continued_packet) {
      z.lastSeg = false;
      z.bytesInSeg = 0;
      return error(z, 9);
    }
  }
  return startPacket(z);
}
function nextSegment(z) {
  if (z.lastSeg) return 0;
  if (z.nextSeg === -1) {
    z.lastSegWhich = z.segmentCount - 1;
    if (!startPage(z)) {
      z.lastSeg = true;
      return 0;
    }
    if (!(z.pageFlag & PAGEFLAG_continued_packet)) {
      error(z, 9);
      return 0;
    }
  }
  const len = z.segments[z.nextSeg++];
  if (len < 255) {
    z.lastSeg = true;
    z.lastSegWhich = z.nextSeg - 1;
  }
  if (z.nextSeg >= z.segmentCount) z.nextSeg = -1;
  z.bytesInSeg = len;
  return len;
}
var EOP = -1;
var INVALID_BITS = -1;
function get8PacketRaw(z) {
  if (z.bytesInSeg === 0) {
    if (z.lastSeg) return EOP;
    else if (!nextSegment(z)) return EOP;
  }
  if (z.bytesInSeg > 0) --z.bytesInSeg;
  ++z.packetBytes;
  return get8(z);
}
function get8Packet(z) {
  const x = get8PacketRaw(z);
  z.validBits = 0;
  return x;
}
function get32Packet(z) {
  let x = get8Packet(z);
  x += get8Packet(z) << 8;
  x += get8Packet(z) << 16;
  x += get8Packet(z) << 24;
  return x >>> 0;
}
function flushPacket(z) {
  while (get8PacketRaw(z) !== EOP) {
  }
}
function getBits(z, n) {
  if (z.validBits < 0) return 0;
  if (z.validBits < n) {
    if (n > 24) {
      const zz2 = getBits(z, 24);
      return zz2 + (getBits(z, n - 24) << 24) >>> 0;
    }
    if (z.validBits === 0) z.acc = 0;
    while (z.validBits < n) {
      const b = get8PacketRaw(z);
      if (b === EOP) {
        z.validBits = INVALID_BITS;
        return 0;
      }
      z.acc = z.acc + (b << z.validBits) >>> 0;
      z.validBits += 8;
    }
  }
  const mask = (1 << n) - 1;
  const zz = (z.acc & mask) >>> 0;
  z.acc = z.acc >>> n >>> 0;
  z.validBits -= n;
  return zz;
}
function prepHuffman(z) {
  if (z.validBits <= 24) {
    if (z.validBits === 0) z.acc = 0;
    do {
      if (z.lastSeg && z.bytesInSeg === 0) return;
      const b = get8PacketRaw(z);
      if (b === EOP) return;
      z.acc = z.acc + (b << z.validBits) >>> 0;
      z.validBits += 8;
    } while (z.validBits <= 24);
  }
}

// ../../packages/stb-vorbis/src/codebook.ts
function bitReverse(n) {
  n = (n & 2863311530) >>> 1 | (n & 1431655765) << 1;
  n = (n & 3435973836) >>> 2 | (n & 858993459) << 2;
  n = (n & 4042322160) >>> 4 | (n & 252645135) << 4;
  n = (n & 4278255360) >>> 8 | (n & 16711935) << 8;
  return (n >>> 16 | n << 16) >>> 0;
}
function ilog(n) {
  const log2_4 = [0, 1, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 4, 4, 4, 4];
  if (n < 0) return 0;
  if (n < 1 << 14) {
    if (n < 1 << 4) return 0 + log2_4[n];
    else if (n < 1 << 9) return 5 + log2_4[n >> 5];
    else return 10 + log2_4[n >> 10];
  } else if (n < 1 << 24) {
    if (n < 1 << 19) return 15 + log2_4[n >> 15];
    else return 20 + log2_4[n >> 20];
  } else if (n < 1 << 29) return 25 + log2_4[n >> 25];
  else return 30 + log2_4[n >>> 30];
}
function float32Unpack(x) {
  const mantissa = x & 2097151;
  const sign = x & 2147483648;
  const exp = (x & 2145386496) >> 21;
  const res = sign ? -mantissa : mantissa;
  return Math.fround(res * Math.pow(2, exp - 788));
}
function lookup1Values(entries, dim) {
  let r = Math.floor(Math.exp(Math.log(entries) / dim));
  if (Math.floor(Math.pow(r + 1, dim)) <= entries) ++r;
  if (Math.pow(r + 1, dim) <= entries) return -1;
  if (Math.floor(Math.pow(r, dim)) > entries) return -1;
  return r;
}
function addEntry(c, huffCode, symbol, count, len, values) {
  if (!c.sparse) {
    c.codewords[symbol] = huffCode;
  } else {
    c.codewords[count] = huffCode;
    c.codewordLengths[count] = len;
    values[count] = symbol;
  }
}
function computeCodewords(c, len, n, values) {
  let m = 0;
  const available = new Uint32Array(32);
  let k = 0;
  for (; k < n; ++k) if (len[k] < NO_CODE) break;
  if (k === n) return true;
  addEntry(c, 0, k, m++, len[k], values);
  for (let i = 1; i <= len[k]; ++i) available[i] = 1 << 32 - i >>> 0;
  for (let i = k + 1; i < n; ++i) {
    let z = len[i];
    if (z === NO_CODE) continue;
    while (z > 0 && available[z] === 0) --z;
    if (z === 0) return false;
    const res = available[z];
    available[z] = 0;
    addEntry(c, bitReverse(res), i, m++, len[i], values);
    if (z !== len[i]) {
      for (let y = len[i]; y > z; --y) {
        available[y] = res + (1 << 32 - y) >>> 0;
      }
    }
  }
  return true;
}
function computeAcceleratedHuffman(c) {
  for (let i = 0; i < FAST_HUFFMAN_TABLE_SIZE; ++i) c.fastHuffman[i] = -1;
  const len = c.sparse ? c.sortedEntries : c.entries;
  for (let i = 0; i < len; ++i) {
    if (c.codewordLengths[i] <= STB_VORBIS_FAST_HUFFMAN_LENGTH) {
      let z = c.sparse ? bitReverse(c.sortedCodewords[i]) : c.codewords[i];
      while (z < FAST_HUFFMAN_TABLE_SIZE) {
        c.fastHuffman[z] = i;
        z += 1 << c.codewordLengths[i];
      }
    }
  }
}
function includeInSort(c, len) {
  if (c.sparse) return true;
  if (len === NO_CODE) return false;
  return len > STB_VORBIS_FAST_HUFFMAN_LENGTH;
}
function computeSortedHuffman(c, lengths, values) {
  if (!c.sparse) {
    let k = 0;
    for (let i = 0; i < c.entries; ++i) {
      if (includeInSort(c, lengths[i])) c.sortedCodewords[k++] = bitReverse(c.codewords[i]);
    }
  } else {
    for (let i = 0; i < c.sortedEntries; ++i) {
      c.sortedCodewords[i] = bitReverse(c.codewords[i]);
    }
  }
  const arr = c.sortedCodewords;
  const sub = arr.subarray(0, c.sortedEntries);
  Array.prototype.sort.call(sub, (a, b) => a - b);
  arr.subarray(0, c.sortedEntries).set(sub);
  arr[c.sortedEntries] = 4294967295;
  const len = c.sparse ? c.sortedEntries : c.entries;
  for (let i = 0; i < len; ++i) {
    const huffLen = c.sparse ? lengths[values[i]] : lengths[i];
    if (includeInSort(c, huffLen)) {
      const code = bitReverse(c.codewords[i]);
      let x = 0, n = c.sortedEntries;
      while (n > 1) {
        const m = x + (n >> 1);
        if (c.sortedCodewords[m] <= code) {
          x = m;
          n -= n >> 1;
        } else n >>= 1;
      }
      if (c.sparse) {
        c.sortedValues[x] = values[i];
        c.codewordLengths[x] = huffLen;
      } else {
        c.sortedValues[x] = i;
      }
    }
  }
}
function codebookDecodeScalarRaw(z, c) {
  prepHuffman(z);
  if (c.codewords === null && c.sortedCodewords === null) return -1;
  if (c.entries > 8 ? c.sortedCodewords !== null : c.codewords === null) {
    const code = bitReverse(z.acc);
    let x = 0, n = c.sortedEntries;
    while (n > 1) {
      const m = x + (n >> 1);
      if (c.sortedCodewords[m] <= code) {
        x = m;
        n -= n >> 1;
      } else n >>= 1;
    }
    if (!c.sparse) x = c.sortedValues[x];
    const len = c.codewordLengths[x];
    if (z.validBits >= len) {
      z.acc >>>= len;
      z.validBits -= len;
      return x;
    }
    z.validBits = 0;
    return -1;
  }
  for (let i = 0; i < c.entries; ++i) {
    if (c.codewordLengths[i] === NO_CODE) continue;
    if (c.codewords[i] === (z.acc & (1 << c.codewordLengths[i]) - 1)) {
      if (z.validBits >= c.codewordLengths[i]) {
        z.acc >>>= c.codewordLengths[i];
        z.validBits -= c.codewordLengths[i];
        return i;
      }
      z.validBits = 0;
      return -1;
    }
  }
  z.error = 11;
  z.validBits = 0;
  return -1;
}
function decodeRawShared(z, c) {
  return decodeRaw(z, c);
}
function decodeRaw(z, c) {
  if (z.validBits < STB_VORBIS_FAST_HUFFMAN_LENGTH) prepHuffman(z);
  const v0 = z.acc & FAST_HUFFMAN_TABLE_MASK;
  let v = c.fastHuffman[v0] ?? -1;
  if (v >= 0) {
    const n = c.codewordLengths[v];
    z.acc >>>= n;
    z.validBits -= n;
    if (z.validBits < 0) {
      z.validBits = 0;
      v = -1;
    }
  } else {
    v = codebookDecodeScalarRaw(z, c);
  }
  return v;
}
function codebookDecodeStart(z, c) {
  if (c.lookupType === 0) {
    z.error = 11;
    return -1;
  }
  let zz = decodeRaw(z, c);
  if (c.sparse) zz = c.sortedValues[zz];
  if (zz < 0) {
    if (z.bytesInSeg === 0 && z.lastSeg) return zz;
    z.error = 11;
  }
  return zz;
}
function codebookDecode(z, c, output, len0) {
  let zz = codebookDecodeStart(z, c);
  if (zz < 0) return false;
  let len = len0 > c.dimensions ? c.dimensions : len0;
  zz *= c.dimensions;
  if (c.sequenceP) {
    let last = 0;
    for (let i = 0; i < len; ++i) {
      const val = c.multiplicands[zz + i] + last;
      output[i] = (output[i] ?? 0) + val;
      last = val + c.minimumValue;
    }
  } else {
    for (let i = 0; i < len; ++i) {
      output[i] = (output[i] ?? 0) + c.multiplicands[zz + i];
    }
  }
  return true;
}
function codebookDecodeStep(z, c, output, off, len0, step) {
  let zz = codebookDecodeStart(z, c);
  let last = 0;
  if (zz < 0) return false;
  let len = len0 > c.dimensions ? c.dimensions : len0;
  zz *= c.dimensions;
  for (let i = 0; i < len; ++i) {
    const val = c.multiplicands[zz + i] + last;
    output[off + i * step] = (output[off + i * step] ?? 0) + val;
    if (c.sequenceP) last = val;
  }
  return true;
}
function codebookDecodeDeinterleaveRepeat(z, c, outputs, ch, cInterP, pInterP, len, totalDecode0) {
  let cInter = cInterP.v;
  let pInter = pInterP.v;
  let totalDecode = totalDecode0;
  if (c.lookupType === 0) {
    z.error = 11;
    return false;
  }
  while (totalDecode > 0) {
    let last = 0;
    let zz = decodeRaw(z, c);
    if (zz < 0) {
      if (z.bytesInSeg === 0 && z.lastSeg) return false;
      z.error = 11;
      return false;
    }
    let effective = c.dimensions;
    if (cInter + pInter * ch + effective > len * ch) {
      effective = len * ch - (pInter * ch - cInter);
    }
    zz *= c.dimensions;
    if (c.sequenceP) {
      for (let i = 0; i < effective; ++i) {
        const val = c.multiplicands[zz + i] + last;
        const ob = outputs[cInter];
        if (ob) ob[pInter] = (ob[pInter] ?? 0) + val;
        if (++cInter === ch) {
          cInter = 0;
          ++pInter;
        }
        last = val;
      }
    } else {
      for (let i = 0; i < effective; ++i) {
        const val = c.multiplicands[zz + i] + last;
        const ob = outputs[cInter];
        if (ob) ob[pInter] = (ob[pInter] ?? 0) + val;
        if (++cInter === ch) {
          cInter = 0;
          ++pInter;
        }
      }
    }
    totalDecode -= effective;
  }
  cInterP.v = cInter;
  pInterP.v = pInter;
  return true;
}

// ../../packages/stb-vorbis/src/residue.ts
function decodeSparse(z, c) {
  let v = decodeRawShared(z, c);
  if (c.sparse) v = c.sortedValues[v];
  return v;
}
function residueDecode(z, book, target, offset0, n, rtype) {
  if (rtype === 0) {
    const step = Math.floor(n / book.dimensions);
    for (let k = 0; k < step; ++k) {
      if (!codebookDecodeStep(z, book, target, offset0 + k, n - offset0 - k, step)) return false;
    }
  } else {
    let offset = offset0;
    for (let k = 0; k < n; ) {
      if (!codebookDecode(z, book, target.subarray(offset), n - k)) return false;
      k += book.dimensions;
      offset += book.dimensions;
    }
  }
  return true;
}
function decodeResidue(z, residueBuffers, ch, n, rn, doNotDecode) {
  const r = z.residueConfig[rn];
  const rtype = z.residueTypes[rn];
  const c = r.classbook;
  const classwords = z.codebooks[c].dimensions;
  const actualSize = rtype === 2 ? n * 2 : n;
  const limitRBegin = r.begin < actualSize ? r.begin : actualSize;
  const limitREnd = r.end < actualSize ? r.end : actualSize;
  const nRead = limitREnd - limitRBegin;
  const partRead = Math.floor(nRead / r.partSize);
  const partClassdata = [];
  for (let i = 0; i < ch; ++i) {
    partClassdata.push([]);
    if (!doNotDecode[i]) {
      const buf = residueBuffers[i];
      buf.fill(0, 0, n);
    }
  }
  let done = false;
  if (rtype === 2 && ch !== 1) {
    let j = 0;
    for (; j < ch; ++j) if (!doNotDecode[j]) break;
    if (j === ch) done = true;
    if (!done) {
      for (let pass = 0; pass < 8 && !done; ++pass) {
        let pcount = 0;
        let classSet = 0;
        if (ch === 2) {
          while (pcount < partRead && !done) {
            let zz = r.begin + pcount * r.partSize;
            let cInter = zz & 1;
            let pInter = zz >> 1;
            if (pass === 0) {
              const cb = z.codebooks[r.classbook];
              const q = decodeSparse(z, cb);
              if (q === EOP) break;
              partClassdata[0][classSet] = r.classdata[q];
            }
            for (let i = 0; i < classwords && pcount < partRead; ++i, ++pcount) {
              const zz2 = r.begin + pcount * r.partSize;
              const cls = partClassdata[0][classSet][i];
              const b = r.residueBooks[cls][pass];
              if (b >= 0) {
                const book = z.codebooks[b];
                const cInterP = { v: cInter };
                const pInterP = { v: pInter };
                if (!codebookDecodeDeinterleaveRepeat(z, book, residueBuffers, ch, cInterP, pInterP, n, r.partSize)) {
                  done = true;
                  break;
                }
                cInter = cInterP.v;
                pInter = pInterP.v;
              } else {
                zz2 + r.partSize;
                const z3 = r.begin + pcount * r.partSize + r.partSize;
                cInter = z3 & 1;
                pInter = z3 >> 1;
              }
            }
            ++classSet;
          }
        } else if (ch > 2) {
          while (pcount < partRead && !done) {
            let zz = r.begin + pcount * r.partSize;
            let cInter = zz % ch;
            let pInter = Math.floor(zz / ch);
            if (pass === 0) {
              const cb = z.codebooks[r.classbook];
              const q = decodeSparse(z, cb);
              if (q === EOP) break;
              partClassdata[0][classSet] = r.classdata[q];
            }
            for (let i = 0; i < classwords && pcount < partRead; ++i, ++pcount) {
              const cls = partClassdata[0][classSet][i];
              const b = r.residueBooks[cls][pass];
              if (b >= 0) {
                const book = z.codebooks[b];
                const cInterP = { v: cInter };
                const pInterP = { v: pInter };
                if (!codebookDecodeDeinterleaveRepeat(z, book, residueBuffers, ch, cInterP, pInterP, n, r.partSize)) {
                  done = true;
                  break;
                }
                cInter = cInterP.v;
                pInter = pInterP.v;
              } else {
                const z3 = r.begin + (pcount + 1) * r.partSize;
                cInter = z3 % ch;
                pInter = Math.floor(z3 / ch);
              }
            }
            ++classSet;
          }
        }
      }
    }
    return;
  }
  for (let pass = 0; pass < 8 && !done; ++pass) {
    let pcount = 0;
    let classSet = 0;
    while (pcount < partRead && !done) {
      if (pass === 0) {
        for (let j = 0; j < ch; ++j) {
          if (!doNotDecode[j]) {
            const cb = z.codebooks[r.classbook];
            const temp = decodeSparse(z, cb);
            if (temp === EOP) {
              done = true;
              break;
            }
            partClassdata[j][classSet] = r.classdata[temp];
          }
        }
        if (done) break;
      }
      for (let i = 0; i < classwords && pcount < partRead; ++i, ++pcount) {
        for (let j = 0; j < ch; ++j) {
          if (!doNotDecode[j]) {
            const cls = partClassdata[j][classSet][i];
            const b = r.residueBooks[cls][pass];
            if (b >= 0) {
              const target = residueBuffers[j];
              const offset = r.begin + pcount * r.partSize;
              const n2 = r.partSize;
              const book = z.codebooks[b];
              if (!residueDecode(z, book, target, offset, n2, rtype)) {
                done = true;
                break;
              }
            }
          }
        }
        if (done) break;
      }
      ++classSet;
    }
  }
}

// ../../packages/stb-vorbis/src/imdct.ts
function computeTwiddleFactors(n, A, B, C) {
  const n4 = n >> 2, n8 = n >> 3;
  for (let k = 0, k2 = 0; k < n4; ++k, k2 += 2) {
    A[k2] = Math.cos(4 * k * Math.PI / n);
    A[k2 + 1] = -Math.sin(4 * k * Math.PI / n);
    B[k2] = Math.cos((k2 + 1) * Math.PI / n / 2) * 0.5;
    B[k2 + 1] = Math.sin((k2 + 1) * Math.PI / n / 2) * 0.5;
  }
  for (let k = 0, k2 = 0; k < n8; ++k, k2 += 2) {
    C[k2] = Math.cos(2 * (k2 + 1) * Math.PI / n);
    C[k2 + 1] = -Math.sin(2 * (k2 + 1) * Math.PI / n);
  }
}
function computeWindow(n, window) {
  const n2 = n >> 1;
  for (let i = 0; i < n2; ++i) {
    const s = Math.fround(Math.sin((i + 0.5) / n2 * 0.5 * Math.PI));
    const sq = Math.fround(s * s);
    window[i] = Math.fround(Math.sin(0.5 * Math.PI * sq));
  }
}
function computeBitReverse(n, rev) {
  const ld = ilog2(n) - 1;
  const n8 = n >> 3;
  for (let i = 0; i < n8; ++i) {
    rev[i] = bitReverseLocal(i) >>> 32 - ld + 3 << 2 & 65535;
  }
}
function bitReverseLocal(n) {
  n = (n & 2863311530) >>> 1 | (n & 1431655765) << 1;
  n = (n & 3435973836) >>> 2 | (n & 858993459) << 2;
  n = (n & 4042322160) >>> 4 | (n & 252645135) << 4;
  n = (n & 4278255360) >>> 8 | (n & 16711935) << 8;
  return (n >>> 16 | n << 16) >>> 0;
}
function ilog2(n) {
  const log2_4 = [0, 1, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4, 4, 4, 4, 4];
  if (n < 0) return 0;
  if (n < 1 << 14) {
    if (n < 1 << 4) return log2_4[n];
    else if (n < 1 << 9) return 5 + log2_4[n >> 5];
    else return 10 + log2_4[n >> 10];
  } else if (n < 1 << 24) {
    if (n < 1 << 19) return 15 + log2_4[n >> 15];
    else return 20 + log2_4[n >> 20];
  } else if (n < 1 << 29) return 25 + log2_4[n >> 25];
  else return 30 + log2_4[n >>> 30];
}
function imdctStep3Iter0Loop(n, e, base, iOff, kOff, A) {
  let aOff = 0;
  let eOff = base + iOff;
  let e2Off = eOff + kOff;
  for (let i = n >> 2; i > 0; --i) {
    for (let q = 0; q < 4; ++q) {
      const d0 = eOff - 2 * q;
      const d2 = e2Off - 2 * q;
      const k00e = e[d0] - e[d2];
      const k01e = e[d0 - 1] - e[d2 - 1];
      e[d0] = e[d0] + e[d2];
      e[d0 - 1] = e[d0 - 1] + e[d2 - 1];
      e[d2] = k00e * A[aOff] - k01e * A[aOff + 1];
      e[d2 - 1] = k01e * A[aOff] + k00e * A[aOff + 1];
      aOff += 8;
    }
    eOff -= 8;
    e2Off -= 8;
  }
}
function imdctStep3InnerRLoop(lim, e, base, d0Off, kOff, A, k1) {
  let aOff = 0;
  let e0Off = base + d0Off;
  let e2Off = e0Off + kOff;
  for (let i = lim >> 2; i > 0; --i) {
    for (let q = 0; q < 4; ++q) {
      const d0 = e0Off - 2 * q;
      const d2 = e2Off - 2 * q;
      const k00e = e[d0] - e[d2];
      const k01e = e[d0 - 1] - e[d2 - 1];
      e[d0] = e[d0] + e[d2];
      e[d0 - 1] = e[d0 - 1] + e[d2 - 1];
      e[d2] = k00e * A[aOff] - k01e * A[aOff + 1];
      e[d2 - 1] = k01e * A[aOff] + k00e * A[aOff + 1];
      aOff += k1;
    }
    e0Off -= 8;
    e2Off -= 8;
  }
}
function imdctStep3InnerSLoop(n, e, base, iOff, kOff, A, aOff0, aOff, k0) {
  const b = aOff0;
  const A0 = A[b], A1 = A[b + 1];
  const A2 = A[b + aOff], A3 = A[b + aOff + 1];
  const A4 = A[b + aOff * 2], A5 = A[b + aOff * 2 + 1];
  const A6 = A[b + aOff * 3], A7 = A[b + aOff * 3 + 1];
  let e0Off = base + iOff;
  let e2Off = e0Off + kOff;
  for (let i = n; i > 0; --i) {
    for (let q = 0; q < 4; ++q) {
      const d0 = e0Off - 2 * q;
      const d2 = e2Off - 2 * q;
      const k00 = e[d0] - e[d2];
      const k11 = e[d0 - 1] - e[d2 - 1];
      e[d0] = e[d0] + e[d2];
      e[d0 - 1] = e[d0 - 1] + e[d2 - 1];
      e[d2] = k00 * [A0, A2, A4, A6][q] - k11 * [A1, A3, A5, A7][q];
      e[d2 - 1] = k11 * [A0, A2, A4, A6][q] + k00 * [A1, A3, A5, A7][q];
    }
    e0Off -= k0;
    e2Off -= k0;
  }
}
function imdctStep3InnerSLoopLd654(n, e, base, iOff, A, baseN) {
  const aOff = baseN >> 3;
  const A2 = A[aOff];
  let z = base + iOff;
  const baseZ = z - 16 * n;
  const iter54 = (z2) => {
    const k00 = e[z2 - 0] - e[z2 - 4];
    const y0 = e[z2 - 0] + e[z2 - 4];
    const y2 = e[z2 - 2] + e[z2 - 6];
    const k22 = e[z2 - 2] - e[z2 - 6];
    e[z2 - 0] = y0 + y2;
    e[z2 - 2] = y0 - y2;
    const k33 = e[z2 - 3] - e[z2 - 7];
    e[z2 - 4] = k00 + k33;
    e[z2 - 6] = k00 - k33;
    const k11 = e[z2 - 1] - e[z2 - 5];
    const y1 = e[z2 - 1] + e[z2 - 5];
    const y3 = e[z2 - 3] + e[z2 - 7];
    e[z2 - 1] = y1 + y3;
    e[z2 - 3] = y1 - y3;
    e[z2 - 5] = k11 - k22;
    e[z2 - 7] = k11 + k22;
  };
  while (z > baseZ) {
    const zo = z - base;
    let k00 = e[zo - 0] - e[zo - 8];
    let k11 = e[zo - 1] - e[zo - 9];
    let l00 = e[zo - 2] - e[zo - 10];
    let l11 = e[zo - 3] - e[zo - 11];
    e[zo - 0] = e[zo - 0] + e[zo - 8];
    e[zo - 1] = e[zo - 1] + e[zo - 9];
    e[zo - 2] = e[zo - 2] + e[zo - 10];
    e[zo - 3] = e[zo - 3] + e[zo - 11];
    e[zo - 8] = k00;
    e[zo - 9] = k11;
    e[zo - 10] = (l00 + l11) * A2;
    e[zo - 11] = (l11 - l00) * A2;
    k00 = e[zo - 4] - e[zo - 12];
    k11 = e[zo - 5] - e[zo - 13];
    l00 = e[zo - 6] - e[zo - 14];
    l11 = e[zo - 7] - e[zo - 15];
    e[zo - 4] = e[zo - 4] + e[zo - 12];
    e[zo - 5] = e[zo - 5] + e[zo - 13];
    e[zo - 6] = e[zo - 6] + e[zo - 14];
    e[zo - 7] = e[zo - 7] + e[zo - 15];
    e[zo - 12] = k11;
    e[zo - 13] = -k00;
    e[zo - 14] = (l11 - l00) * A2;
    e[zo - 15] = (l00 + l11) * -A2;
    iter54(zo);
    iter54(zo - 8);
    z -= 16;
  }
}

// ../../packages/stb-vorbis/src/mdct.ts
function inverseMdct(buffer, n, f, blocktype) {
  const n2 = n >> 1, n4 = n >> 2, n8 = n >> 3;
  const buf2 = new Float32Array(n2);
  const A = f.A[blocktype];
  {
    let dOff = n2 - 2;
    let aaOff = 0;
    let eOff = 0;
    while (eOff < n2) {
      buf2[dOff + 1] = buffer[eOff] * A[aaOff] - buffer[eOff + 2] * A[aaOff + 1];
      buf2[dOff] = buffer[eOff] * A[aaOff + 1] + buffer[eOff + 2] * A[aaOff];
      dOff -= 2;
      aaOff += 2;
      eOff += 4;
    }
    eOff = n2 - 3;
    while (dOff >= 0) {
      buf2[dOff + 1] = -buffer[eOff + 2] * A[aaOff] - -buffer[eOff] * A[aaOff + 1];
      buf2[dOff] = -buffer[eOff + 2] * A[aaOff + 1] + -buffer[eOff] * A[aaOff];
      dOff -= 2;
      aaOff += 2;
      eOff -= 4;
    }
  }
  {
    let aaOff = n2 - 8;
    let e0Off = n4;
    let e1Off = 0;
    let d0Off = n4;
    let d1Off = 0;
    while (aaOff >= 0) {
      const v41_21 = buf2[e0Off + 1] - buf2[e1Off + 1];
      const v40_20 = buf2[e0Off] - buf2[e1Off];
      buffer[d0Off + 1] = buf2[e0Off + 1] + buf2[e1Off + 1];
      buffer[d0Off] = buf2[e0Off] + buf2[e1Off];
      buffer[d1Off + 1] = v41_21 * A[aaOff + 4] - v40_20 * A[aaOff + 5];
      buffer[d1Off] = v40_20 * A[aaOff + 4] + v41_21 * A[aaOff + 5];
      const v41_21b = buf2[e0Off + 3] - buf2[e1Off + 3];
      const v40_20b = buf2[e0Off + 2] - buf2[e1Off + 2];
      buffer[d0Off + 3] = buf2[e0Off + 3] + buf2[e1Off + 3];
      buffer[d0Off + 2] = buf2[e0Off + 2] + buf2[e1Off + 2];
      buffer[d1Off + 3] = v41_21b * A[aaOff] - v40_20b * A[aaOff + 1];
      buffer[d1Off + 2] = v40_20b * A[aaOff] + v41_21b * A[aaOff + 1];
      aaOff -= 8;
      d0Off += 4;
      d1Off += 4;
      e0Off += 4;
      e1Off += 4;
    }
  }
  const ld = ilog(n) - 1;
  imdctStep3Iter0Loop(n >> 4, buffer, 0, n2 - 1 - n4 * 0, -(n >> 3), A);
  imdctStep3Iter0Loop(n >> 4, buffer, 0, n2 - 1 - n4 * 1, -(n >> 3), A);
  imdctStep3InnerRLoop(n >> 5, buffer, 0, n2 - 1 - n8 * 0, -(n >> 4), A, 16);
  imdctStep3InnerRLoop(n >> 5, buffer, 0, n2 - 1 - n8 * 1, -(n >> 4), A, 16);
  imdctStep3InnerRLoop(n >> 5, buffer, 0, n2 - 1 - n8 * 2, -(n >> 4), A, 16);
  imdctStep3InnerRLoop(n >> 5, buffer, 0, n2 - 1 - n8 * 3, -(n >> 4), A, 16);
  let l = 2;
  for (; l < ld - 3 >> 1; ++l) {
    const k0 = n >> l + 2, k0_2 = k0 >> 1;
    const lim = 1 << l + 1;
    for (let i = 0; i < lim; ++i) {
      imdctStep3InnerRLoop(n >> l + 4, buffer, 0, n2 - 1 - k0 * i, -k0_2, A, 1 << l + 3);
    }
  }
  for (; l < ld - 6; ++l) {
    const k0 = n >> l + 2, k1 = 1 << l + 3, k0_2 = k0 >> 1;
    const rlim = n >> l + 6;
    const lim = 1 << l + 1;
    let aOff = 0;
    let iOff = n2 - 1;
    for (let r = rlim; r > 0; --r) {
      imdctStep3InnerSLoop(lim, buffer, 0, iOff, -k0_2, A, aOff, k1, k0);
      aOff += k1 * 4;
      iOff -= 8;
    }
  }
  imdctStep3InnerSLoopLd654(n >> 5, buffer, 0, n2 - 1, A, n);
  {
    const bitrev = f.bitReverse[blocktype];
    let d0Off = n4 - 4;
    let d1Off = n2 - 4;
    let bitrevOff = 0;
    while (d0Off >= 0) {
      let k4 = bitrev[bitrevOff];
      buf2[d1Off + 3] = buffer[k4];
      buf2[d1Off + 2] = buffer[k4 + 1];
      buf2[d0Off + 3] = buffer[k4 + 2];
      buf2[d0Off + 2] = buffer[k4 + 3];
      k4 = bitrev[bitrevOff + 1];
      buf2[d1Off + 1] = buffer[k4];
      buf2[d1Off] = buffer[k4 + 1];
      buf2[d0Off + 1] = buffer[k4 + 2];
      buf2[d0Off] = buffer[k4 + 3];
      d0Off -= 4;
      d1Off -= 4;
      bitrevOff += 2;
    }
  }
  {
    let C2 = function(i) {
      return f.C[blocktype][i];
    };
    var C = C2;
    let cOff = 0;
    let dOff = 0;
    let eOff = n2 - 4;
    while (dOff < eOff) {
      let a02 = buf2[dOff] - buf2[eOff + 2];
      let a11 = buf2[dOff + 1] + buf2[eOff + 3];
      let b0 = C2(cOff + 1) * a02 + C2(cOff) * a11;
      let b1 = C2(cOff + 1) * a11 - C2(cOff) * a02;
      const b2 = buf2[dOff] + buf2[eOff + 2];
      const b3 = buf2[dOff + 1] - buf2[eOff + 3];
      buf2[dOff] = b2 + b0;
      buf2[dOff + 1] = b3 + b1;
      buf2[eOff + 2] = b2 - b0;
      buf2[eOff + 3] = b1 - b3;
      a02 = buf2[dOff + 2] - buf2[eOff];
      a11 = buf2[dOff + 3] + buf2[eOff + 1];
      b0 = C2(cOff + 3) * a02 + C2(cOff + 2) * a11;
      b1 = C2(cOff + 3) * a11 - C2(cOff + 2) * a02;
      const b2b = buf2[dOff + 2] + buf2[eOff];
      const b3b = buf2[dOff + 3] - buf2[eOff + 1];
      buf2[dOff + 2] = b2b + b0;
      buf2[dOff + 3] = b3b + b1;
      buf2[eOff] = b2b - b0;
      buf2[eOff + 1] = b1 - b3b;
      cOff += 4;
      dOff += 4;
      eOff -= 4;
    }
  }
  {
    let B2 = function(i) {
      return f.B[blocktype][i];
    };
    var B = B2;
    let bOff = n2 - 8;
    let eOff = n2 - 8;
    let d0Off = 0;
    let d1Off = n2 - 4;
    let d2Off = n2;
    let d3Off = n - 4;
    while (eOff >= 0) {
      let p3 = buf2[eOff + 6] * B2(bOff + 7) - buf2[eOff + 7] * B2(bOff + 6);
      let p2 = -buf2[eOff + 6] * B2(bOff + 6) - buf2[eOff + 7] * B2(bOff + 7);
      buffer[d0Off] = p3;
      buffer[d1Off + 3] = -p3;
      buffer[d2Off] = p2;
      buffer[d3Off + 3] = p2;
      let p1 = buf2[eOff + 4] * B2(bOff + 5) - buf2[eOff + 5] * B2(bOff + 4);
      let p0 = -buf2[eOff + 4] * B2(bOff + 4) - buf2[eOff + 5] * B2(bOff + 5);
      buffer[d0Off + 1] = p1;
      buffer[d1Off + 2] = -p1;
      buffer[d2Off + 1] = p0;
      buffer[d3Off + 2] = p0;
      p3 = buf2[eOff + 2] * B2(bOff + 3) - buf2[eOff + 3] * B2(bOff + 2);
      p2 = -buf2[eOff + 2] * B2(bOff + 2) - buf2[eOff + 3] * B2(bOff + 3);
      buffer[d0Off + 2] = p3;
      buffer[d1Off + 1] = -p3;
      buffer[d2Off + 2] = p2;
      buffer[d3Off + 1] = p2;
      p1 = buf2[eOff] * B2(bOff + 1) - buf2[eOff + 1] * B2(bOff);
      p0 = -buf2[eOff] * B2(bOff) - buf2[eOff + 1] * B2(bOff + 1);
      buffer[d0Off + 3] = p1;
      buffer[d1Off] = -p1;
      buffer[d2Off + 3] = p0;
      buffer[d3Off] = p0;
      bOff -= 8;
      eOff -= 8;
      d0Off += 4;
      d2Off += 4;
      d1Off -= 4;
      d3Off -= 4;
    }
  }
}

// ../../packages/stb-vorbis/src/crc32.ts
var CRC32_POLY = 79764919;
var crcTable = new Uint32Array(256);
var crcInitialized = false;
function crc32Init() {
  if (crcInitialized) return;
  for (let i = 0; i < 256; ++i) {
    let s = i << 24;
    for (let j = 0; j < 8; ++j) {
      s = s << 1 ^ (s >= 2147483648 ? CRC32_POLY : 0);
    }
    crcTable[i] = s >>> 0;
  }
  crcInitialized = true;
}

// ../../packages/stb-vorbis/src/tables.ts
var INVERSE_DB_TABLE = [10649863e-14, 11341951e-14, 12079015e-14, 12863978e-14, 13699951e-14, 14590251e-14, 15538408e-14, 16548181e-14, 17623575e-14, 18768855e-14, 19988561e-14, 2128753e-13, 22670913e-14, 24144197e-14, 25713223e-14, 27384213e-14, 29163793e-14, 31059021e-14, 33077411e-14, 35226968e-14, 37516214e-14, 39954229e-14, 4255068e-13, 45315863e-14, 48260743e-14, 51396998e-14, 54737065e-14, 58294187e-14, 62082472e-14, 66116941e-14, 70413592e-14, 74989464e-14, 79862701e-14, 8505263e-13, 90579828e-14, 96466216e-14, 10273513e-13, 10941144e-13, 11652161e-13, 12409384e-13, 13215816e-13, 14074654e-13, 14989305e-13, 15963394e-13, 17000785e-13, 18105592e-13, 19282195e-13, 20535261e-13, 21869758e-13, 23290978e-13, 24804557e-13, 26416497e-13, 2813319e-12, 29961443e-13, 31908506e-13, 33982101e-13, 36190449e-13, 38542308e-13, 41047004e-13, 4371447e-12, 46555282e-13, 49580707e-13, 5280274e-12, 5623416e-12, 59888572e-13, 63780469e-13, 67925283e-13, 72339451e-13, 77040476e-13, 82047e-10, 87378876e-13, 93057248e-13, 99104632e-13, 10554501e-12, 11240392e-12, 11970856e-12, 12748789e-12, 13577278e-12, 14459606e-12, 15399272e-12, 16400004e-12, 17465768e-12, 18600792e-12, 19809576e-12, 21096914e-12, 22467911e-12, 23928002e-12, 25482978e-12, 27139006e-12, 28902651e-12, 30780908e-12, 32781225e-12, 34911534e-12, 37180282e-12, 39596466e-12, 42169667e-12, 4491009e-11, 47828601e-12, 50936773e-12, 54246931e-12, 57772202e-12, 61526565e-12, 65524908e-12, 69783085e-12, 74317983e-12, 79147585e-12, 8429104e-11, 89768747e-12, 95602426e-12, 10181521e-11, 10843174e-11, 11547824e-11, 12298267e-11, 13097477e-11, 13948625e-11, 14855085e-11, 15820453e-11, 16848555e-11, 17943469e-11, 19109536e-11, 20351382e-11, 21673929e-11, 23082423e-11, 24582449e-11, 26179955e-11, 27881276e-11, 29693158e-11, 31622787e-11, 33677814e-11, 35866388e-11, 38197188e-11, 40679456e-11, 43323036e-11, 46138411e-11, 49136745e-11, 52329927e-11, 55730621e-11, 59352311e-11, 63209358e-11, 67317058e-11, 716917e-9, 7635063e-10, 81312324e-11, 86596457e-11, 92223983e-11, 98217216e-11, 0.0010459992, 0.0011139742, 0.0011863665, 0.0012634633, 0.0013455702, 0.0014330129, 0.0015261382, 0.0016253153, 0.0017309374, 0.0018434235, 0.0019632195, 0.0020908006, 0.0022266726, 0.0023713743, 0.0025254795, 0.0026895994, 0.0028643847, 0.0030505286, 0.0032487691, 0.0034598925, 0.0036847358, 0.0039241906, 0.0041792066, 4450795e-9, 0.0047400328, 0.0050480668, 0.0053761186, 0.0057254891, 0.0060975636, 0.0064938176, 0.0069158225, 0.0073652516, 0.0078438871, 0.0083536271, 0.0088964928, 9474637e-9, 0.010090352, 0.01074608, 0.011444421, 0.012188144, 0.012980198, 0.013823725, 0.014722068, 0.015678791, 0.016697687, 0.017782797, 0.018938423, 0.020169149, 0.021479854, 0.022875735, 0.02436233, 0.025945531, 0.027631618, 0.029427276, 0.031339626, 0.033376252, 0.035545228, 0.037855157, 0.040315199, 0.042935108, 0.045725273, 0.048696758, 0.051861348, 0.055231591, 0.05882085, 0.062643361, 0.066714279, 0.071049749, 0.075666962, 0.080584227, 0.085821044, 0.091398179, 0.097337747, 0.1036633, 0.11039993, 0.11757434, 0.12521498, 0.13335215, 0.14201813, 0.15124727, 0.16107617, 0.1715438, 0.18269168, 0.19456402, 0.20720788, 0.22067342, 0.23501402, 0.25028656, 0.26655159, 0.28387361, 0.30232132, 0.32196786, 0.34289114, 0.36517414, 0.38890521, 0.41417847, 0.44109412, 0.4697589, 0.50028648, 0.53279791, 0.56742212, 0.6042964, 0.64356699, 0.68538959, 0.72993007, 0.77736504, 0.8278826, 0.88168307, 0.9389798, 1];

// ../../packages/stb-vorbis/src/vorbis.ts
var PAGEFLAG_first_page = 2;
var PAGEFLAG_last_page = 4;
var PAGEFLAG_continued_packet2 = 1;
function vorbisValidate(data) {
  return data[0] === 118 && data[1] === 111 && data[2] === 114 && data[3] === 98 && data[4] === 105 && data[5] === 115;
}
function drawLine(output, x0, y0, x10, y1, n) {
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
    output[x] = (output[x] ?? 0) * INVERSE_DB_TABLE[y & 255];
    for (++x; x < x1; ++x) {
      err += ady2;
      if (err >= adx) {
        err -= adx;
        y += sy;
      } else {
        y += base;
      }
      output[x] = (output[x] ?? 0) * INVERSE_DB_TABLE[y & 255];
    }
  }
}
function predictPoint(x, x0, x1, y0, y1) {
  const dy = y1 - y0;
  const adx = x1 - x0;
  const err = Math.abs(dy) * (x - x0);
  let off = 0;
  if (err >= 0) off = Math.floor(err / adx);
  else off = -Math.floor(-err / adx);
  return dy >= 0 ? y0 + off : y0 - off;
}
function neighborsOf(x, n) {
  let low = -1, lowI = -1;
  let high = 65536, highI = -1;
  for (let i = 0; i < n; ++i) {
    const xi = x[i] ?? 0;
    if (xi > low && xi < (x[n] ?? 0)) {
      low = xi;
      lowI = i;
    }
    if (xi < high && xi > (x[n] ?? 0)) {
      high = xi;
      highI = i;
    }
  }
  return [lowI, highI];
}
function computeBlocksize(f, b, n) {
  const n2 = n >> 1, n4 = n >> 2, n8 = n >> 3;
  f.A[b] = new Float32Array(n2);
  f.B[b] = new Float32Array(n2);
  f.C[b] = new Float32Array(n4);
  computeTwiddleFactorsInto(n, f.A[b], f.B[b], f.C[b]);
  f.window[b] = new Float32Array(n2);
  computeWindow(n, f.window[b]);
  f.bitReverse[b] = new Uint16Array(n8);
  computeBitReverse(n, f.bitReverse[b]);
  return true;
}
function computeTwiddleFactorsInto(n, A, B, C) {
  computeTwiddleFactors(n, A, B, C);
}
function startDecoder(f) {
  let maxSubmaps = 0;
  let longestFloorlist = 0;
  f.firstDecode = true;
  f.nextSeg = -1;
  if (!startPage(f)) return false;
  if (!(f.pageFlag & PAGEFLAG_first_page)) return error(f, 4);
  if (f.pageFlag & PAGEFLAG_last_page) return error(f, 4);
  if (f.pageFlag & PAGEFLAG_continued_packet2) return error(f, 4);
  if (f.segmentCount !== 1) return error(f, 4);
  if (f.segments[0] !== 30) return error(f, 4);
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
  get32(f);
  get32(f);
  get32(f);
  let x = get8(f);
  {
    const log0 = x & 15;
    const log1 = x >> 4 & 15;
    f.blocksize0 = 1 << log0;
    f.blocksize1 = 1 << log1;
    if (log0 < 6 || log0 > 13) return error(f, 20);
    if (log1 < 6 || log1 > 13) return error(f, 20);
    if (log0 > log1) return error(f, 20);
  }
  x = get8(f);
  if (!(x & 1)) return error(f, 4);
  if (!startPage(f)) return false;
  if (!startPacket(f)) return false;
  if (!nextSegment(f)) return false;
  if (get8Packet(f) !== 3) return error(f, 20);
  for (let i = 0; i < 6; ++i) header[i] = get8Packet(f);
  if (!vorbisValidate(header)) return error(f, 20);
  {
    const len = get32Packet(f);
    for (let i = 0; i < len; ++i) get8Packet(f);
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
  if (!startPacket(f)) return false;
  crc32Init();
  if (get8Packet(f) !== 5) return error(f, 20);
  for (let i = 0; i < 6; ++i) header[i] = get8Packet(f);
  if (!vorbisValidate(header)) return error(f, 20);
  f.codebookCount = getBits(f, 8) + 1;
  f.codebooks = [];
  for (let i = 0; i < f.codebookCount; ++i) {
    let values = null;
    let total = 0;
    const c = {
      dimensions: 0,
      entries: 0,
      codewordLengths: null,
      minimumValue: 0,
      deltaValue: 0,
      valueBits: 0,
      lookupType: 0,
      sequenceP: 0,
      sparse: 0,
      lookupValues: 0,
      multiplicands: null,
      codewords: null,
      fastHuffman: new Int32Array(FAST_HUFFMAN_TABLE_SIZE),
      sortedCodewords: null,
      sortedValues: null,
      sortedEntries: 0
    };
    f.codebooks.push(c);
    let xx = getBits(f, 8);
    if (xx !== 66) return error(f, 20);
    xx = getBits(f, 8);
    if (xx !== 67) return error(f, 20);
    xx = getBits(f, 8);
    if (xx !== 86) return error(f, 20);
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
        if (lengths[j] > STB_VORBIS_FAST_HUFFMAN_LENGTH && lengths[j] !== NO_CODE) ++sortedCount;
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
        const len = c.sparse ? c.sortedEntries : c.entries;
        c.multiplicands = new Float32Array(len * c.dimensions);
        let last = 0;
        for (let j = 0; j < len; ++j) {
          const zz = c.sparse ? c.sortedValues[j] : j;
          let div = 1;
          for (let k = 0; k < c.dimensions; ++k) {
            const off = Math.floor(zz / div) % c.lookupValues;
            const val = mults[off] * c.deltaValue + c.minimumValue + last;
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
          const val = mults[j] * c.deltaValue + c.minimumValue + last;
          c.multiplicands[j] = val;
          if (c.sequenceP) last = val;
        }
      }
    }
  }
  {
    const tCount = getBits(f, 6) + 1;
    for (let i = 0; i < tCount; ++i) {
      if (getBits(f, 16) !== 0) return error(f, 20);
    }
  }
  f.floorCount = getBits(f, 6) + 1;
  f.floorTypes = new Array(f.floorCount).fill(0);
  f.floor0Config = [];
  f.floor1Config = [];
  for (let i = 0; i < f.floorCount; ++i) {
    const ftype = getBits(f, 16);
    if (ftype > 1) return error(f, 20);
    f.floorTypes[i] = ftype;
    if (ftype === 0) {
      return error(f, 26);
    } else {
      const g = {
        partitions: 0,
        partitionClassList: [],
        classDimensions: [],
        classSubclasses: [],
        classMasterbooks: [],
        subclassBooks: [],
        Xlist: [],
        sortedOrder: [],
        neighbors: [],
        floor1Multiplier: 0,
        rangebits: 0,
        values: 0
      };
      f.floor1Config.push(g);
      let maxClass = -1;
      g.partitions = getBits(f, 5);
      for (let j = 0; j < g.partitions; ++j) {
        g.partitionClassList.push(getBits(f, 4));
        if (g.partitionClassList[j] > maxClass) maxClass = g.partitionClassList[j];
      }
      for (let j = 0; j <= maxClass; ++j) {
        g.classDimensions[j] = getBits(f, 3) + 1;
        g.classSubclasses[j] = getBits(f, 2);
        if (g.classSubclasses[j]) {
          g.classMasterbooks[j] = getBits(f, 8);
          if ((g.classMasterbooks[j] ?? 0) >= f.codebookCount) return error(f, 20);
        }
        for (let k = 0; k < 1 << g.classSubclasses[j]; ++k) {
          g.subclassBooks[j] = g.subclassBooks[j] ?? [];
          g.subclassBooks[j][k] = getBits(f, 8) - 1;
          if ((g.subclassBooks[j][k] ?? 0) >= f.codebookCount) return error(f, 20);
        }
      }
      g.floor1Multiplier = getBits(f, 2) + 1;
      g.rangebits = getBits(f, 4);
      g.Xlist[0] = 0;
      g.Xlist[1] = 1 << g.rangebits;
      g.values = 2;
      for (let j = 0; j < g.partitions; ++j) {
        const cl = g.partitionClassList[j];
        for (let k = 0; k < g.classDimensions[cl]; ++k) {
          g.Xlist[g.values] = getBits(f, g.rangebits);
          ++g.values;
        }
      }
      const p = [];
      for (let j = 0; j < g.values; ++j) p.push({ x: g.Xlist[j], id: j });
      p.sort((a, b) => a.x - b.x);
      for (let j = 0; j < g.values - 1; ++j) {
        if (p[j].x === p[j + 1].x) return error(f, 20);
      }
      for (let j = 0; j < g.values; ++j) g.sortedOrder[j] = p[j].id;
      for (let j = 2; j < g.values; ++j) {
        const [low, high] = neighborsOf(g.Xlist, j);
        g.neighbors[j] = [low, high];
      }
      if (g.values > longestFloorlist) longestFloorlist = g.values;
    }
  }
  f.residueCount = getBits(f, 6) + 1;
  f.residueTypes = new Array(f.residueCount).fill(0);
  f.residueConfig = [];
  for (let i = 0; i < f.residueCount; ++i) {
    const r = { begin: 0, end: 0, partSize: 0, classifications: 0, classbook: 0, classdata: null, residueBooks: null };
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
        if (residueCascade[j] & 1 << k) {
          books[k] = getBits(f, 8);
          if ((books[k] ?? 0) >= f.codebookCount) return error(f, 20);
        } else {
          books[k] = -1;
        }
      }
      r.residueBooks.push(books);
    }
    r.classdata = [];
    const cbEntries = f.codebooks[r.classbook].entries;
    const classwords = f.codebooks[r.classbook].dimensions;
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
  f.mappingCount = getBits(f, 6) + 1;
  f.mapping = [];
  for (let i = 0; i < f.mappingCount; ++i) {
    const m = { couplingSteps: 0, chan: [], submaps: 0, submapFloor: [], submapResidue: [] };
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
    while (m.chan.length < f.channels) m.chan.push({ magnitude: 0, angle: 0, mux: 0 });
    if (getBits(f, 2)) return error(f, 20);
    for (let j = 0; j < f.channels; ++j) {
      if (m.submaps > 1) {
        const mux = getBits(f, 4);
        if (mux >= m.submaps) return error(f, 20);
        m.chan[j].mux = mux;
      } else {
        m.chan[j].mux = 0;
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
  f.modeCount = getBits(f, 6) + 1;
  f.modeConfig = [];
  for (let i = 0; i < f.modeCount; ++i) {
    const m = { blockflag: 0, mapping: 0, windowtype: 0, transformtype: 0 };
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
function computeSortedHuffmanShared(c, lengths, values) {
  computeSortedHuffman(c, lengths, values);
}
function doFloor(f, map, i, n, target, finalY) {
  const n2 = n >> 1;
  const s = map.chan[i].mux;
  const floor = map.submapFloor[s];
  if (f.floorTypes[floor] === 0) {
    f.error = 11;
    return false;
  }
  const g = f.floor1Config[floor];
  let lx = 0;
  let ly = finalY[0] * g.floor1Multiplier;
  for (let q = 1; q < g.values; ++q) {
    const j = g.sortedOrder[q];
    if (finalY[j] >= 0) {
      const hy = finalY[j] * g.floor1Multiplier;
      const hx = g.Xlist[j];
      if (lx !== hx) {
        drawLine(target, lx, ly, hx, hy, n2);
      }
      lx = hx;
      ly = hy;
    }
  }
  if (lx < n2) {
    for (let j = lx; j < n2; ++j) {
      target[j] = (target[j] ?? 0) * INVERSE_DB_TABLE[ly & 255];
    }
  }
  return true;
}
function vorbisDecodeInitial(f, res) {
  f.channelBufferStart = 0;
  f.channelBufferEnd = 0;
  for (; ; ) {
    if (f.eof) return false;
    if (!maybeStartPacket(f)) return false;
    if (getBits(f, 1) !== 0) {
      while (get8Packet(f) !== EOP) {
      }
      continue;
    }
    const i = getBits(f, ilog(f.modeCount - 1));
    if (i === EOP) return false;
    if (i >= f.modeCount) return false;
    res.mode = i;
    const m = f.modeConfig[i];
    let n, prev, next;
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
      res.leftStart = n - f.blocksize0 >> 2;
      res.leftEnd = n + f.blocksize0 >> 2;
    } else {
      res.leftStart = 0;
      res.leftEnd = windowCenter;
    }
    if (m.blockflag && !next) {
      res.rightStart = n * 3 - f.blocksize0 >> 2;
      res.rightEnd = n * 3 + f.blocksize0 >> 2;
    } else {
      res.rightStart = windowCenter;
      res.rightEnd = n;
    }
    return true;
  }
}
function vorbisDecodePacketRest(f, len, m, leftStart0, leftEnd0, rightStart0, rightEnd0, pLeft) {
  void leftEnd0;
  let leftStart = leftStart0;
  const n = f.blocksize[m.blockflag];
  const map = f.mapping[m.mapping];
  const n2 = n >> 1;
  const zeroChannel = new Array(256).fill(0);
  const reallyZeroChannel = new Array(256).fill(0);
  for (let i = 0; i < f.channels; ++i) {
    const s = map.chan[i].mux;
    const floor = map.submapFloor[s];
    zeroChannel[i] = 0;
    if (f.floorTypes[floor] === 0) {
      f.error = 11;
      return false;
    }
    const g = f.floor1Config[floor];
    if (getBits(f, 1)) {
      const finalY = f.finalY[i];
      const rangeList = [256, 128, 86, 64];
      const range = rangeList[g.floor1Multiplier - 1];
      let offset = 2;
      finalY[0] = getBits(f, ilog(range) - 1);
      finalY[1] = getBits(f, ilog(range) - 1);
      const step2Flag = new Array(256).fill(0);
      for (let j = 0; j < g.partitions; ++j) {
        const pclass = g.partitionClassList[j];
        const cdim = g.classDimensions[pclass];
        const cbits = g.classSubclasses[pclass];
        const csub = (1 << cbits) - 1;
        let cval = 0;
        if (cbits) {
          const c = f.codebooks[g.classMasterbooks[pclass]];
          cval = decodeShared(f, c);
        }
        for (let k = 0; k < cdim; ++k) {
          const book = g.subclassBooks[pclass][cval & csub];
          cval = cval >> cbits;
          if (book >= 0) {
            const c = f.codebooks[book];
            finalY[offset++] = decodeShared(f, c);
          } else {
            finalY[offset++] = 0;
          }
        }
      }
      if (f.validBits === INVALID_BITS) {
        f.error = 11;
        return false;
      }
      step2Flag[0] = step2Flag[1] = 1;
      for (let j = 2; j < g.values; ++j) {
        const low = g.neighbors[j][0];
        const high = g.neighbors[j][1];
        const pred = predictPoint(g.Xlist[j], g.Xlist[low], g.Xlist[high], finalY[low], finalY[high]);
        const val = finalY[j];
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
            if (val & 1) finalY[j] = pred - (val + 1 >> 1);
            else finalY[j] = pred + (val >> 1);
          }
        } else {
          step2Flag[j] = 0;
          finalY[j] = pred;
        }
      }
      for (let j = 0; j < g.values; ++j) {
        if (!step2Flag[j]) finalY[j] = -1;
      }
    } else {
      zeroChannel[i] = 1;
    }
  }
  for (let i = 0; i < f.channels; ++i) reallyZeroChannel[i] = zeroChannel[i] ?? 0;
  for (let i = 0; i < map.couplingSteps; ++i) {
    const mag = map.chan[i]?.magnitude ?? 0;
    const ang = map.chan[i]?.angle ?? 0;
    if (!zeroChannel[mag] || !zeroChannel[ang]) {
      zeroChannel[mag] = 0;
      zeroChannel[ang] = 0;
    }
  }
  for (let i = 0; i < map.submaps; ++i) {
    const residueBuffers = [];
    const doNotDecode = [];
    let ch = 0;
    for (let j = 0; j < f.channels; ++j) {
      if (map.chan[j].mux === i) {
        if (zeroChannel[j]) {
          doNotDecode[ch] = 1;
          residueBuffers.push(null);
        } else {
          doNotDecode[ch] = 0;
          residueBuffers.push(f.channelBuffers[j]);
        }
        ++ch;
      }
    }
    const r = map.submapResidue[i];
    decodeResidue(f, residueBuffers, ch, n2, r, doNotDecode);
  }
  for (let i = map.couplingSteps - 1; i >= 0; --i) {
    const mag = f.channelBuffers[map.chan[i]?.magnitude ?? 0];
    const ang = f.channelBuffers[map.chan[i]?.angle ?? 0];
    for (let j = 0; j < n2; ++j) {
      let a2, m2;
      if (mag[j] > 0) {
        if (ang[j] > 0) {
          m2 = mag[j];
          a2 = mag[j] - ang[j];
        } else {
          a2 = mag[j];
          m2 = mag[j] + ang[j];
        }
      } else {
        if (ang[j] > 0) {
          m2 = mag[j];
          a2 = mag[j] + ang[j];
        } else {
          a2 = mag[j];
          m2 = mag[j] - ang[j];
        }
      }
      mag[j] = m2;
      ang[j] = a2;
    }
  }
  for (let i = 0; i < f.channels; ++i) {
    if (reallyZeroChannel[i]) {
      f.channelBuffers[i].fill(0, 0, n2);
    } else {
      doFloor(f, map, i, n, f.channelBuffers[i], f.finalY[i]);
    }
  }
  for (let i = 0; i < f.channels; ++i) {
    inverseMdct(f.channelBuffers[i], n, f, m.blockflag);
  }
  flushPacket(f);
  if (f.firstDecode) {
    f.currentLoc = 0 - n2 >>> 0;
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
    if (f.currentLocValid && f.pageFlag & PAGEFLAG_last_page) {
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
    f.currentLoc = f.knownLocForPacket - (n2 - leftStart) >>> 0;
    f.currentLocValid = true;
  }
  if (f.currentLocValid) f.currentLoc = f.currentLoc + (rightStart0 - leftStart) >>> 0;
  len.v = rightEnd0;
  return true;
}
function decodeShared(f, c) {
  let v = codebookDecodeStartShared(f, c);
  if (c.sparse) v = c.sortedValues[v];
  return v;
}
function codebookDecodeStartShared(z, c) {
  prepHuffman(z);
  let zz = decodeRawShared(z, c);
  if (zz < 0) {
    if (z.bytesInSeg === 0 && z.lastSeg) return zz;
    z.error = 11;
  }
  return zz;
}
function vorbisDecodePacket(f, len, pLeft, pRight) {
  const res = { leftStart: 0, leftEnd: 0, rightStart: 0, rightEnd: 0, mode: 0 };
  if (!vorbisDecodeInitial(f, res)) return false;
  pLeft.v = res.leftStart;
  pRight.v = res.rightStart;
  return vorbisDecodePacketRest(f, len, f.modeConfig[res.mode], res.leftStart, res.leftEnd, res.rightStart, res.rightEnd, pLeft);
}
function vorbisFinishFrame(f, len, left, right) {
  const prev0 = f.previousLength;
  if (f.previousLength) {
    const n = f.previousLength;
    const w = getWindow(f, n);
    if (w === null) return 0;
    for (let i = 0; i < f.channels; ++i) {
      const cb = f.channelBuffers[i];
      const pw = f.previousWindow[i];
      for (let j = 0; j < n; ++j) {
        cb[left + j] = cb[left + j] * w[j] + pw[j] * w[n - 1 - j];
      }
    }
  }
  const prev = f.previousLength;
  void prev0;
  f.previousLength = len - right;
  for (let i = 0; i < f.channels; ++i) {
    const cb = f.channelBuffers[i];
    const pw = f.previousWindow[i];
    for (let j = 0; right + j < len; ++j) {
      pw[j] = cb[right + j];
    }
  }
  if (!prev) return 0;
  if (len < right) right = len;
  f.samplesOutput += right - left;
  return right - left;
}
function getWindow(f, len0) {
  const len = len0 << 1;
  if (len === f.blocksize0) return f.window[0];
  if (len === f.blocksize1) return f.window[1];
  return null;
}
function vorbisPumpFirstFrame(f) {
  const len = { v: 0 };
  const left = { v: 0 };
  const right = { v: 0 };
  const res = vorbisDecodePacket(f, len, left, right);
  if (res) vorbisFinishFrame(f, len.v, left.v, right.v);
  return res;
}
function stbVorbisOpenMemory(data, errorOut) {
  const f = {
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
    A: [],
    B: [],
    C: [],
    window: [],
    bitReverse: [],
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
    firstAudioPageOffset: 0
  };
  if (!startDecoder(f)) {
    errorOut.v = f.error;
    return null;
  }
  vorbisPumpFirstFrame(f);
  return f;
}
function stbVorbisGetFrameFloat(f, len) {
  const left = { v: 0 };
  const right = { v: 0 };
  if (!vorbisDecodePacket(f, len, left, right)) {
    f.channelBufferStart = 0;
    f.channelBufferEnd = 0;
    return null;
  }
  len.v = vorbisFinishFrame(f, len.v, left.v, right.v);
  for (let i = 0; i < f.channels; ++i) {
    f.outputs[i] = f.channelBuffers[i].subarray(left.v);
  }
  f.channelBufferStart = left.v;
  f.channelBufferEnd = left.v + len.v;
  if (len.v === 0) return null;
  return f.outputs;
}
export {
  stbVorbisGetFrameFloat,
  stbVorbisOpenMemory
};

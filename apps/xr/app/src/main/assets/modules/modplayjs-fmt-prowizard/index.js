// ../../packages/fmt-prowizard/src/prowiz.ts
import { ParseError as ParseError2 } from "@modplayjs/core";

// ../../packages/fmt-prowizard/src/pw-pp.ts
import { ParseError } from "@modplayjs/core";
function put8(out, b) {
  out.push(b & 255);
}
function put16b(out, v) {
  out.push(v >> 8 & 255, v & 255);
}
function put32b(out, v) {
  out.push(v >>> 24 & 255, v >> 16 & 255, v >> 8 & 255, v & 255);
}
function depackPp10(data, start) {
  const out = [];
  const trkNum = [[], [], [], []];
  writeZero(out, 20);
  let ssize = 0;
  for (let i2 = 0; i2 < 31; i2++) {
    const pos = start + i2 * 8;
    if (pos + 8 > data.length) throw new ParseError("pp10: truncated sample headers");
    const tmp = data.slice(pos, pos + 8);
    writeZero(out, 22);
    const size = readmem16b(tmp, 0);
    ssize += size * 2;
    if (tmp[4] === 0 && tmp[5] === 0) {
      tmp[5] = 1;
    }
    for (let k = 0; k < 8; k++) out.push(tmp[k]);
  }
  const len = data[start + 248];
  put8(out, len);
  const c1 = data[start + 249];
  put8(out, c1);
  let ntrk = 0;
  for (let j = 0; j < 4; j++) {
    for (let i2 = 0; i2 < 128; i2++) {
      const t = data[start + 250 + j * 128 + i2];
      trkNum[j].push(t);
      if (t > ntrk) ntrk = t;
    }
  }
  let i = 0;
  for (; i < len; i++) put8(out, i);
  writeZero(out, 128 - i);
  put32b(out, 1294879534);
  const pdata = new Uint8Array(1024);
  for (i = 0; i < len; i++) {
    pdata.fill(0);
    for (let j = 0; j < 4; j++) {
      const trackOff3 = start + 762 + (trkNum[j][i] << 8);
      for (let k = 0; k < 64; k++) {
        const src = trackOff3 + k * 4;
        const dst = k * 16 + j * 4;
        for (let b = 0; b < 4; b++) {
          pdata[dst + b] = src + b < data.length ? data[src + b] : 0;
        }
      }
    }
    for (let b = 0; b < 1024; b++) out.push(pdata[b]);
  }
  const smpOff = start + 762 + (ntrk + 1 << 8);
  moveData(data, smpOff, out, ssize);
  return Uint8Array.from(out);
}
function testPp10(data, start) {
  const s = data.length - start;
  if (s < 1024) return 1024 - s;
  if (data[start + 249] > 127) return -1;
  let ssize = 0;
  for (let i = 0; i < 31; i++) {
    const d = start + i * 8;
    const size = readmem16b(data, d) << 1;
    const lstart = readmem16b(data, d + 4) << 1;
    const lsize = readmem16b(data, d + 6) << 1;
    ssize += size;
    if (lsize === 0) return -1;
    if (lstart !== 0 && lsize <= 2) return -1;
    if (lstart + lsize > size + 2) return -1;
    if (data[d + 2] > 15) return -1;
    if (data[d + 3] > 64) return -1;
    if (lstart > size) return -1;
    if (size > 65535) return -1;
  }
  if (ssize <= 2) return -1;
  if (data[start + 248] === 0 || data[start + 248] > 127) return -1;
  let ntrk = 0;
  for (let i = 0; i < 512; i++) {
    const t = data[start + 250 + i];
    if (t > ntrk) ntrk = t;
  }
  ntrk++;
  const need = 762 + ntrk * 256;
  if (s < need) return need - s;
  for (let i = 0; i < ntrk * 64; i++) {
    if (data[start + 762 + i * 4] > 19) return -1;
  }
  return 0;
}
var pwPp10 = {
  name: "ProPacker 1.0",
  test: testPp10,
  depack: depackPp10
};
function depackPp21Pp30(data, start, is30) {
  const out = [];
  writeZero(out, 20);
  let ssize = 0;
  for (let i2 = 0; i2 < 31; i2++) {
    writeZero(out, 22);
    const size = readmem16b(data, start + i2 * 8);
    ssize += size * 2;
    put16b(out, size);
    put8(out, data[start + i2 * 8 + 2]);
    put8(out, data[start + i2 * 8 + 3]);
    put16b(out, readmem16b(data, start + i2 * 8 + 4));
    put16b(out, readmem16b(data, start + i2 * 8 + 6));
  }
  const numpat = data[start + 248];
  if (numpat > 128) throw new ParseError("pp21: too many patterns");
  put8(out, numpat);
  put8(out, data[start + 249]);
  const trk = [[], [], [], []];
  let max = 0;
  for (let j = 0; j < 4; j++) {
    for (let i2 = 0; i2 < 128; i2++) {
      const t = data[start + 250 + j * 128 + i2];
      trk[j].push(t);
      if (t > max) max = t;
    }
  }
  let i = 0;
  for (; i < numpat; i++) put8(out, i);
  writeZero(out, 128 - i);
  put32b(out, 1294879534);
  const tptr = [];
  for (let j = 0; j <= max; j++) {
    const row = [];
    for (let k = 0; k < 64; k++) {
      let v = readmem16b(data, start + 762 + (j * 64 + k) * 2);
      if (is30) v >>= 2;
      row.push(v);
    }
    tptr.push(row);
  }
  const tabOff = start + 762 + (max + 1) * 128;
  const tabsize = readmem32b(data, tabOff);
  if (tabsize === 0) throw new ParseError("pp21: zero reference table size");
  const tab = data.subarray(tabOff + 4, tabOff + 4 + tabsize);
  if (tab.length < tabsize) throw new ParseError("pp21: reference table truncated");
  for (i = 0; i < numpat; i++) {
    for (let j = 0; j < 64; j++) {
      for (let c = 0; c < 4; c++) {
        const off = tptr[trk[c][i]][j] * 4;
        for (let b = 0; b < 4; b++) {
          out.push(tab[off + b] ?? 0);
        }
      }
    }
  }
  moveData(data, tabOff + 4 + tabsize, out, ssize);
  return Uint8Array.from(out);
}
function testPp21Pp30(data, start, is30) {
  const s = data.length - start;
  if (s < 762) return 762 - s;
  let ssize = 0;
  for (let i = 0; i < 31; i++) {
    const d = start + i * 8;
    const len = readmem16b(data, d) << 1;
    const lstart = readmem16b(data, d + 4) << 1;
    ssize += len;
    if (data[d + 2] > 15) return -1;
    if (data[d + 3] > 64) return -1;
    if (lstart > len) return -1;
  }
  if (ssize <= 2) return -1;
  const npat = data[start + 248];
  if (npat === 0 || npat > 127) return -1;
  let tsize = 0;
  for (let i = 0; i < 512; i++) {
    const trk = data[start + 250 + i];
    if (trk > tsize) tsize = trk;
  }
  tsize++;
  tsize <<= 6;
  const need = tsize * 2 + 4 + 762;
  if (s < need) return need - s;
  let maxRef = 0;
  if (!is30) {
    for (let i = 0; i < tsize; i++) {
      const ref = readmem16b(data, start + i * 2 + 762);
      if (ref > 16384) return -1;
      if (ref > maxRef) maxRef = ref;
    }
    if (readmem32b(data, start + tsize * 2 + 762) !== (maxRef + 1) * 4) return -1;
  } else {
    for (let i = 0; i < tsize; i++) {
      const ref = readmem16b(data, start + i * 2 + 762);
      if (ref > maxRef) maxRef = ref;
      if ((ref & 3) !== 0) return -1;
    }
    maxRef >>= 2;
    let refSize = readmem32b(data, start + tsize * 2 + 762);
    if (refSize > 65535) return -1;
    if (refSize !== maxRef + 1 << 2) return -1;
    refSize >>= 2;
    const need2 = refSize * 4 + tsize * 2 + 4 + 762;
    if (s < need2) return need2 - s;
    for (let i = 0; i < refSize; i++) {
      const d = start + tsize * 2 + 766 + i * 4;
      const fxt = data[d + 2] & 15;
      const fxp = data[d + 3];
      if (fxt === 12 && fxp > 65) return -1;
      if (fxt === 13 && (fxp > 100 || (fxp & 15) > 9)) return -1;
      if (fxt === 11 && fxp > 127) return -1;
      if ((data[d] & 240) > 16) return -1;
    }
  }
  pwReadTitle(null, 0);
  return 0;
}
function testPp21(data, start) {
  return testPp21Pp30(data, start, false);
}
function testPp30(data, start) {
  return testPp21Pp30(data, start, true);
}
var pwPp21 = {
  name: "ProPacker 2.1",
  test: testPp21,
  depack: (data, start) => depackPp21Pp30(data, start, false)
};
var pwPp30 = {
  name: "ProPacker 3.0",
  test: testPp30,
  depack: (data, start) => depackPp21Pp30(data, start, true)
};

// ../../packages/fmt-prowizard/src/ptktable.ts
var ptkTable = [
  [0, 0],
  [3, 88],
  [3, 40],
  [2, 250],
  [2, 208],
  [2, 166],
  [2, 128],
  /*  1  */
  [2, 92],
  [2, 58],
  [2, 26],
  [1, 252],
  [1, 224],
  [1, 197],
  [1, 172],
  [1, 148],
  [1, 125],
  [1, 104],
  [1, 83],
  [1, 64],
  /*  2  */
  [1, 46],
  [1, 29],
  [1, 13],
  [0, 254],
  [0, 240],
  [0, 226],
  [0, 214],
  [0, 202],
  [0, 190],
  [0, 180],
  [0, 170],
  [0, 160],
  /*  3  */
  [0, 151],
  [0, 143],
  [0, 135],
  [0, 127],
  [0, 120],
  [0, 113]
];
function ptkIsValidNote(n) {
  return n >= 0 && n < ptkTable.length;
}

// ../../packages/fmt-prowizard/src/pw-p40.ts
var MAGIC_P40A = 1345597505;
var MAGIC_P40B = 1345597506;
var MAGIC_P41A = 1345597761;
var PW_MOD_MAGIC = 1294879534;
function put82(out, b) {
  out.push(b & 255);
}
function put16b2(out, v) {
  out.push(v >> 8 & 255, v & 255);
}
function put32b2(out, v) {
  out.push(v >>> 24 & 255, v >> 16 & 255, v >> 8 & 255, v & 255);
}
function setEvent(out, c1, c2, c3) {
  let mynote = c1 & 127;
  if (!ptkIsValidNote(Math.trunc(mynote / 2))) {
    mynote = c1 = c2 = c3 = 0;
  }
  out.push(c1 << 4 & 16 | ptkTable[Math.trunc(mynote / 2)][0]);
  out.push(ptkTable[Math.trunc(mynote / 2)][1]);
  const b = c2 & 15;
  if (b === 8) c2 -= 8;
  out.push(c2 & 255);
  if (b === 5 || b === 6 || b === 10) {
    c3 = c3 > 127 ? c3 << 4 & 240 : c3;
  }
  out.push(c3 & 255);
}
function trackOff(p, c, r) {
  return (p * 4 + c) * 256 + r * 4;
}
function depackP4x(data, start) {
  const inSize = data.length - start;
  let pos = start;
  const u8 = () => data[pos++] ?? 0;
  const u16 = () => {
    const v = readmem16b(data, pos);
    pos += 2;
    return v;
  };
  const u32 = () => {
    const v = readmem32b(data, pos);
    pos += 4;
    return v;
  };
  const seek = (n) => {
    pos = start + n;
  };
  const id = u32();
  u8();
  const len = u8();
  if (len >= 128) throw new Error("p4x: pattern list too long");
  const nsmp = u8();
  if (nsmp > 31) throw new Error("p4x: too many samples");
  u8();
  const trkdatOfs = u32() + 4;
  const trktabOfs = u32() + 4;
  const smpOfs = u32() + 4;
  if (trkdatOfs < 4 || trktabOfs < 4 || smpOfs < 4 || trkdatOfs >= inSize || trktabOfs >= inSize || smpOfs >= inSize) {
    throw new Error("p4x: bad addresses");
  }
  const out = [];
  writeZero(out, 20);
  const sampleAddress = [];
  const sampleSize = [];
  for (let i = 0; i < nsmp; i++) {
    const addr = u32();
    sampleAddress.push(addr);
    const size = u16();
    sampleSize.push(size * 2);
    const loopAddr = u32();
    const loopSize = u16();
    let fine = 0;
    if (id === MAGIC_P40A || id === MAGIC_P40B) fine = u16();
    u8();
    const vol = u8();
    if (id === MAGIC_P41A) fine = u16();
    if (addr < 0 || loopAddr < 0 || loopAddr < addr || addr > inSize - smpOfs) {
      throw new Error("p4x: bad sample addresses");
    }
    writeZero(out, 22);
    put16b2(out, size);
    put82(out, Math.trunc(fine / 74));
    put82(out, vol);
    put16b2(out, Math.trunc((loopAddr - addr) / 2));
    put16b2(out, loopSize);
  }
  {
    const pad = new Array(30).fill(0);
    pad[29] = 1;
    for (let i = nsmp; i < 31; i++) out.push(...pad);
  }
  put82(out, len);
  put82(out, 127);
  seek(trktabOfs);
  for (let c1 = 0; c1 < len; c1++) put82(out, c1);
  for (let c1 = len; c1 < 128; c1++) put82(out, 0);
  put32b2(out, PW_MOD_MAGIC);
  const trackAddr = [];
  for (let i = 0; i < len; i++) {
    const row = [];
    for (let j = 0; j < 4; j++) row.push(u16() + trkdatOfs);
    trackAddr.push(row);
  }
  const tdata = new Uint8Array(512 * 256);
  const read4 = () => {
    const v = [data[pos] ?? 0, data[pos + 1] ?? 0, data[pos + 2] ?? 0, data[pos + 3] ?? 0];
    pos += 4;
    return v;
  };
  const trySet = (p, j, k, c1, c2, c3) => {
    const tmp = [];
    setEvent(tmp, c1, c2, c3);
    const base = trackOff(p, j, k);
    for (let b = 0; b < 4; b++) tdata[base + b] = tmp[b] ?? 0;
  };
  for (let i = 0; i < len; i++) {
    for (let j = 0; j < 4; j++) {
      pos = trackAddr[i][j];
      for (let k = 0; k < 64; k++) {
        let [c1, c2, c3, c4] = read4();
        if (c1 !== 128) {
          if (pos > data.length) throw new Error("p4x: track read error");
          trySet(i, j, k, c1, c2, c3);
          if (c4 > 0 && c4 < 128) k += c4;
          if (c4 > 127) {
            k++;
            for (let l = 256; l > c4; l--) {
              if (k >= 64) break;
              trySet(i, j, k, c1, c2, c3);
              k++;
            }
            k--;
          }
          continue;
        }
        const a = pos;
        const c5 = c2;
        const b = (c3 << 8) + c4 + trkdatOfs;
        pos = start + b;
        for (let c = 0; c <= c5; c++) {
          if (k >= 64) break;
          [c1, c2, c3, c4] = read4();
          trySet(i, j, k, c1, c2, c3);
          if (c4 > 0 && c4 < 128) k += c4;
          if (c4 > 127) {
            k++;
            for (let l = 256; l > c4; l--) {
              if (k >= 64) break;
              trySet(i, j, k, c1, c2, c3);
              k++;
            }
            k--;
          }
          k++;
        }
        k--;
        pos = a;
      }
    }
  }
  for (let i = 0; i < len; i++) {
    for (let j = 0; j < 64; j++) {
      for (let k = 0; k < 4; k++) {
        const base = trackOff(i, k, j);
        for (let b = 0; b < 4; b++) out.push(tdata[base + b]);
      }
    }
  }
  for (let i = 0; i < nsmp; i++) {
    moveData(data, start + sampleAddress[i] + smpOfs, out, sampleSize[i]);
  }
  return Uint8Array.from(out);
}
function testP4x(data, start) {
  const s = data.length - start;
  if (s < 8) return 8 - s;
  const id = readmem32b(data, start);
  if (id !== MAGIC_P40A && id !== MAGIC_P40B && id !== MAGIC_P41A) return -1;
  pwReadTitle(null, 0);
  return 0;
}
var pwP4x = {
  name: "The Player 4.x",
  test: testP4x,
  depack: depackP4x
};

// ../../packages/fmt-prowizard/src/pw-theplayer.ts
var PW_MOD_MAGIC2 = 1294879534;
function put83(out, b) {
  out.push(b & 255);
}
function put16b3(out, v) {
  out.push(v >> 8 & 255, v & 255);
}
function put32b3(out, v) {
  out.push(v >>> 24 & 255, v >> 16 & 255, v >> 8 & 255, v & 255);
}
function setEvent2(out, c1v, c2v, c3v) {
  if (ptkIsValidNote(Math.trunc(c1v / 2))) {
    out.push(c1v << 4 & 16 | ptkTable[Math.trunc(c1v / 2)][0]);
    out.push(ptkTable[Math.trunc(c1v / 2)][1]);
  } else {
    out.push(c1v << 4 & 16);
    out.push(0);
  }
  const b = c2v & 15;
  let c2 = c2v;
  if (b === 8) c2 -= 8;
  out.push(c2 & 255);
  let c3 = c3v;
  if (b === 5 || b === 6 || b === 10) {
    c3 = c3 > 127 ? 256 - c3 << 4 & 240 : c3;
  }
  out.push(c3 & 255);
  return b;
}
function trackOff2(p, c, r) {
  return p * 1024 + r * 16 + c * 4;
}
function decodePattern(data, posIn, npat, tdata, taddr) {
  let pos = posIn;
  const tdataAddr = posIn;
  const u8 = () => data[pos++] ?? 0;
  for (let i = 0; i < npat; i++) {
    let maxRow = 63;
    for (let j = 0; j < 4; j++) {
      pos = taddr[i][j] + tdataAddr;
      for (let k = 0; k <= maxRow; k++) {
        let c1 = u8();
        const c2 = u8();
        const c3 = u8();
        if ((c1 & 128) !== 0 && c1 !== 128) {
          const c4 = u8();
          c1 = 255 - c1;
          const cell2 = [];
          const effect2 = setEvent2(cell2, c1, c2, c3);
          for (let t = 0; t < 4; t++) tdata[trackOff2(i, j, k) + t] = cell2[t] ?? 0;
          if (effect2 === 13) {
            maxRow = k;
            break;
          }
          if (effect2 === 11) {
            maxRow = k;
            break;
          }
          if (c4 < 128) {
            k += c4;
            continue;
          }
          const c4b = 256 - c4;
          for (let l = 0; l < c4b; l++) {
            if (++k >= 64) break;
            const cell22 = [];
            setEvent2(cell22, c1, c2, c3);
            for (let t = 0; t < 4; t++) tdata[trackOff2(i, j, k) + t] = cell22[t] ?? 0;
          }
          continue;
        }
        if (c1 === 128) {
          const c4 = u8();
          const posSaved = pos;
          const lines = c2;
          pos -= (c3 << 8) + c4;
          for (let l = 0; l <= lines && k < 64; l++, k++) {
            c1 = u8();
            const c2b = u8();
            const c3b = u8();
            if ((c1 & 128) !== 0 && c1 !== 128) {
              const c4b = u8();
              c1 = 255 - c1;
              if (k >= 64) continue;
              const cell3 = [];
              const effect2 = setEvent2(cell3, c1, c2b, c3b);
              for (let t = 0; t < 4; t++) tdata[trackOff2(i, j, k) + t] = cell3[t] ?? 0;
              if (effect2 === 13) {
                maxRow = k;
                k = l = 9999;
                continue;
              }
              if (effect2 === 11) {
                maxRow = k;
                k = l = 9999;
                continue;
              }
              if (c4b < 128) {
                k += c4b;
                continue;
              }
              const fold = 256 - c4b;
              let foldCount = fold;
              while (foldCount-- > 0) {
                if (++k >= 64) break;
                const cell22 = [];
                setEvent2(cell22, c1, c2b, c3b);
                for (let t = 0; t < 4; t++) tdata[trackOff2(i, j, k) + t] = cell22[t] ?? 0;
              }
            }
            if (k >= 64) break;
            const cell2 = [];
            setEvent2(cell2, c1, c2b, c3b);
            for (let t = 0; t < 4; t++) tdata[trackOff2(i, j, k) + t] = cell2[t] ?? 0;
          }
          pos = posSaved;
          k--;
          continue;
        }
        const cell = [];
        const effect = setEvent2(cell, c1, c2, c3);
        for (let t = 0; t < 4; t++) tdata[trackOff2(i, j, k) + t] = cell[t] ?? 0;
        if (effect === 13) {
          maxRow = k;
          break;
        }
        if (effect === 11) {
          maxRow = k;
          break;
        }
      }
    }
  }
  return 0;
}
function theplayerDepack(data, start, version) {
  let pos = start;
  const out = [];
  const u8 = () => data[pos++] ?? 0;
  const u16 = () => {
    const v = readmem16b(data, pos);
    pos += 2;
    return v;
  };
  const sdataAddr = u16();
  let npat = u8();
  if (npat > 128) throw new Error("theplayer: too many patterns");
  let nins = u8();
  let delta = 0;
  if ((nins & 128) !== 0) delta = 1;
  if (version >= 96 && (nins & 64) !== 0) {
    throw new Error("theplayer: packed samples not supported");
  }
  nins &= 63;
  if (nins > 31) throw new Error("theplayer: too many samples");
  writeZero(out, 20);
  const isize = new Array(31).fill(0);
  const smpSize = new Array(31).fill(0);
  const saddr = new Array(31).fill(0);
  let i = 0;
  for (; i < nins; i++) {
    writeZero(out, 22);
    const j0 = isize[i] = u16();
    if (j0 > 65280) {
      smpSize[i] = smpSize[65535 - j0];
      isize[i] = isize[65535 - j0];
      saddr[i] = saddr[65535 - j0];
    } else {
      if (i > 0) saddr[i] = saddr[i - 1] + smpSize[i - 1];
      smpSize[i] = j0 * 2;
    }
    const j = Math.trunc(smpSize[i] / 2);
    put16b3(out, isize[i]);
    const c1 = u8();
    put83(out, c1 & 63);
    put83(out, u8());
    const val = u16();
    if (val === 65535) {
      put16b3(out, 0);
      put16b3(out, 1);
    } else {
      put16b3(out, val);
      put16b3(out, j - val);
    }
  }
  {
    const pad = new Array(30).fill(0);
    pad[29] = 1;
    for (; i < 31; i++) out.push(...pad);
  }
  const taddr = [];
  for (let p = 0; p < npat; p++) {
    const row = [];
    for (let j = 0; j < 4; j++) row.push(u16());
    taddr.push(row);
  }
  const ptable = new Array(128).fill(0);
  let patPos = 0;
  for (; patPos < 128; patPos++) {
    const c1 = u8();
    if (c1 === 255) break;
    ptable[patPos] = version >= 96 ? c1 : Math.trunc(c1 / 2);
  }
  put83(out, patPos);
  put83(out, 127);
  for (let p = 0; p < 128; p++) put83(out, ptable[p]);
  put32b3(out, PW_MOD_MAGIC2);
  const tdata = new Uint8Array(512 * 256);
  decodePattern(data, pos, npat, tdata, taddr);
  for (let p = 0; p < npat; p++) {
    for (let b = 0; b < 1024; b++) out.push(tdata[p * 1024 + b]);
  }
  for (let s = 0; s < nins; s++) {
    const smpBuf = new Uint8Array(smpSize[s]);
    const src = start + sdataAddr + saddr[s];
    for (let k = 0; k < smpSize[s]; k++) smpBuf[k] = data[src + k] ?? 0;
    if (delta === 1) {
      for (let j = 1; j < smpSize[s]; j++) {
        const c3 = 256 - smpBuf[j] + smpBuf[j - 1];
        smpBuf[j] = c3 & 255;
      }
    }
    for (let k = 0; k < smpSize[s]; k++) out.push(smpBuf[k]);
  }
  return Uint8Array.from(out);
}
function theplayerTest(data, start, version) {
  const s = data.length - start;
  if (s < 4) return 4 - s;
  const numPat = data[start + 2];
  if (numPat === 0 || numPat > 127) return -1;
  const numIns = data[start + 3] & 63;
  if (numIns === 0 || numIns > 31) return -1;
  if (s < numIns * 6 + 4) return numIns * 6 + 4 - s;
  for (let i = 0; i < numIns; i++) {
    if (data[start + i * 6 + 7] > 64) return -1;
    if (data[start + i * 6 + 6] > 15) return -1;
  }
  for (let i = 0; i < numIns; i++) {
    const size = readmem16b(data, start + i * 6 + 4);
    if (size <= 65503 && size > 32768 || size === 0) return -1;
    const lstart = readmem16b(data, start + i * 6 + 8);
    if (lstart !== 65535 && lstart >= size) return -1;
    if (size > 65503 && 65535 - size > numIns) return -1;
  }
  const sdata = readmem16b(data, start);
  if (sdata < numIns * 6 + 4 + numPat * 8) return -1;
  if (s < numPat * 8 + numIns * 6 + 4) return numPat * 8 + numIns * 6 + 4 - s;
  for (let i = 0; i < numPat * 4; i++) {
    const x = readmem16b(data, start + 4 + numIns * 6 + i * 2);
    if (x + numIns * 6 + 4 + numPat * 8 > sdata) return -1;
  }
  if (s < numPat * 8 + numIns * 6 + 4 + 128) return numPat * 8 + numIns * 6 + 4 + 128 - s;
  let len = 0;
  while (len < 128) {
    const pat = data[start + numIns * 6 + 4 + numPat * 8 + len];
    if (pat === 255) break;
    if (version >= 96) {
      if (pat > numPat - 1) return -1;
    } else {
      if ((pat & 1) !== 0) return -1;
      if (pat > numPat * 2) return -1;
    }
    len++;
  }
  if (numIns * 6 + 4 + numPat * 8 + len > sdata) return -1;
  if (len === 0 || len === 128) return -1;
  if (s < sdata + 1) return sdata + 1 - s;
  len++;
  for (let i = numIns * 6 + 4 + numPat * 8 + len; i < sdata; i++) {
    const d = start + i;
    if ((~data[d] & 128) !== 0) {
      if (data[d] > 73) return -1;
      const ins = data[d] << 4 & 16 | data[d + 1] >> 4 & 15;
      if (ins > numIns) return -1;
      i += 2;
    } else {
      i += 3;
    }
  }
  pwReadTitle(null, 0);
  return 0;
}
var pwP50a = {
  name: "The Player 5.0a",
  test: (data, start) => theplayerTest(data, start, 80),
  depack: (data, start) => theplayerDepack(data, start, 80)
};
var pwP60a = {
  name: "The Player 6.0a",
  test: (data, start) => theplayerTest(data, start, 96),
  depack: (data, start) => theplayerDepack(data, start, 96)
};

// ../../packages/fmt-prowizard/src/pw-tp1.ts
var PW_MOD_MAGIC3 = 1294879534;
function put84(out, b) {
  out.push(b & 255);
}
function put16b4(out, v) {
  out.push(v >> 8 & 255, v & 255);
}
function put32b4(out, v) {
  out.push(v >>> 24 & 255, v >> 16 & 255, v >> 8 & 255, v & 255);
}
function depackTp1(data, start) {
  let pos = start;
  const out = [];
  const u8 = () => data[pos++] ?? 0;
  const u16 = () => {
    const v = readmem16b(data, pos);
    pos += 2;
    return v;
  };
  const u32 = () => {
    const v = readmem32b(data, pos);
    pos += 4;
    return v;
  };
  u32();
  u32();
  for (let i = 0; i < 20; i++) out.push(data[pos++] ?? 0);
  const smpOfs = u32();
  let ssize = 0;
  for (let i = 0; i < 31; i++) {
    writeZero(out, 22);
    const c3 = u8();
    const c4 = u8();
    const size = u16();
    ssize += size * 2;
    put16b4(out, size);
    put84(out, c3);
    put84(out, c4);
    put16b4(out, u16());
    put16b4(out, u16());
  }
  const len = u16() + 1;
  put84(out, len);
  put84(out, 127);
  const paddr = [];
  let patOfs = 4294967295;
  for (let i = 0; i < len; i++) {
    paddr.push(u32());
    if (patOfs > paddr[i]) patOfs = paddr[i];
  }
  const pnum = new Array(128).fill(0);
  const paddrOrd = [paddr[0]];
  let npat = 1;
  for (let i = 1; i < len; i++) {
    let j = 0;
    for (; j < i; j++) {
      if (paddr[i] === paddr[j]) {
        pnum[i] = pnum[j];
        break;
      }
    }
    if (j === i) {
      paddrOrd[npat] = paddr[i];
      pnum[i] = npat++;
    }
  }
  for (let i = 0; i < 128; i++) put84(out, pnum[i]);
  put32b4(out, PW_MOD_MAGIC3);
  const pdata = new Uint8Array(1024);
  for (let i = 0; i < npat; i++) {
    pos = start + 794 + paddrOrd[i] - patOfs;
    pdata.fill(0);
    for (let j = 0; j < 256; j++) {
      const p = j * 4;
      const c1 = u8();
      if (c1 === 192) continue;
      if ((c1 & 192) === 128) {
        const fxt2 = c1 >> 2 & 15;
        const fxp2 = u8();
        pdata[p + 2] = fxt2;
        pdata[p + 3] = fxp2;
        continue;
      }
      const c2 = u8();
      const c3 = u8();
      const note = (c1 & 254) >> 1;
      if (!ptkIsValidNote(note)) throw new Error("tp1: invalid note");
      const ins = c2 >> 4 & 15 | c1 << 4 & 16;
      const fxt = c2 & 15;
      const fxp = c3;
      pdata[p] = ins & 240 | ptkTable[note][0];
      pdata[p + 1] = ptkTable[note][1];
      pdata[p + 2] = ins << 4 & 240 | fxt;
      pdata[p + 3] = fxp;
    }
    for (let k = 0; k < 1024; k++) out.push(pdata[k]);
  }
  moveData(data, start + smpOfs, out, ssize);
  return Uint8Array.from(out);
}
function testTp1(data, start) {
  const s = data.length - start;
  if (s < 1024) return 1024 - s;
  if (data[start] !== 77 || data[start + 1] !== 69 || // 'ME'
  data[start + 2] !== 88 || data[start + 3] !== 88) {
    return -1;
  }
  const size = readmem32b(data, start + 4);
  if (size < 794 || size > 2129178) return -1;
  for (let i = 0; i < 31; i++) {
    const d = start + i * 8 + 32;
    if (data[d] > 15) return -1;
    if (data[d + 1] > 64) return -1;
  }
  const smpOfs = readmem32b(data, start + 28);
  if (smpOfs === 0 || smpOfs > size) return -1;
  for (let i = 0; i < 31; i++) {
    const d = start + i * 8 + 32;
    const sz = readmem16b(data, d + 2) << 1;
    const lstart = readmem16b(data, d + 4) << 1;
    const lsize = readmem16b(data, d + 6) << 1;
    if (sz > 65535 || lstart > 65535 || lsize > 65535) return -1;
    if (lstart + lsize > sz + 2) return -1;
    if (lstart !== 0 && lsize === 0) return -1;
  }
  const len = readmem16b(data, start + 280) + 1;
  if (len > 128) return -1;
  return 0;
}
var pwTp1 = {
  name: "Tracker Packer v1",
  test: testTp1,
  depack: depackTp1
};

// ../../packages/fmt-prowizard/src/pw-tp3.ts
var PW_MOD_MAGIC4 = 1294879534;
function put85(out, b) {
  out.push(b & 255);
}
function put16b5(out, v) {
  out.push(v >> 8 & 255, v & 255);
}
function put32b5(out, v) {
  out.push(v >>> 24 & 255, v >> 16 & 255, v >> 8 & 255, v & 255);
}
function depackTp23(data, start, ver) {
  let pos = start;
  const out = [];
  const u8 = () => data[pos++] ?? 0;
  const u16 = () => {
    const v = readmem16b(data, pos);
    pos += 2;
    return v;
  };
  pos += 8;
  for (let i = 0; i < 20; i++) out.push(data[pos++] ?? 0);
  const nins = u16() >> 3;
  let ssize = 0;
  for (let i = 0; i < nins; i++) {
    writeZero(out, 22);
    const c3 = u8();
    const c4 = u8();
    const size = u16();
    ssize += size * 2;
    put16b5(out, size);
    put85(out, c3);
    put85(out, c4);
    put16b5(out, u16());
    put16b5(out, u16());
  }
  {
    const pad = new Array(30).fill(0);
    pad[29] = 1;
    for (let i = nins; i < 31; i++) out.push(...pad);
  }
  u8();
  const len = u8();
  if (len >= 128) throw new Error("tp23: sequence too long");
  put85(out, len);
  put85(out, 127);
  const pnum = [];
  let npat = 0;
  for (let i = 0; i < len; i++) {
    const p = u16() >> 3;
    pnum.push(p);
    if (p > npat) npat = p;
  }
  if (npat >= 128) throw new Error("tp23: too many patterns");
  const trkOfs = [];
  for (let i = 0; i <= npat; i++) {
    const row = [];
    for (let j = 0; j < 4; j++) row.push(u16());
    trkOfs.push(row);
  }
  for (let i = 0; i < 128; i++) put85(out, pnum[i]);
  put32b5(out, PW_MOD_MAGIC4);
  const patOfs = pos + 2;
  const pdata = new Uint8Array(1024);
  let maxTrkOfs = 0;
  for (let i = 0; i <= npat; i++) {
    pdata.fill(0);
    for (let j = 0; j < 4; j++) {
      pos = patOfs + trkOfs[i][j];
      for (let k = 0; k >= 0 && k < 64; k++) {
        const p = k * 16 + j * 4;
        const c1 = u8();
        if ((c1 & 192) === 192) {
          k += 256 - c1 - 1;
          continue;
        }
        if ((c1 & 192) === 128) {
          const c22 = u8();
          let fxt2 = ver === 2 ? c1 >> 2 & 15 : c1 >> 1 & 15;
          let fxp2 = c22;
          if (fxt2 === 5 || fxt2 === 6 || fxt2 === 10) {
            if (fxp2 > 128) fxp2 = 256 - fxp2;
            else if (fxp2 <= 128) fxp2 = fxp2 << 4 & 240;
          }
          if (fxt2 === 8) fxt2 = 0;
          pdata[p + 2] = fxt2;
          pdata[p + 3] = fxp2;
          continue;
        }
        const c2 = u8();
        const ins = c2 >> 4 & 15 | c1 >> 2 & 16;
        let note;
        if (ver === 2) {
          note = (c1 & 254) >> 1;
        } else {
          if ((c1 & 64) === 64) note = 127 - c1;
          else note = c1 & 63;
        }
        if (!ptkIsValidNote(note)) throw new Error("tp23: invalid note");
        const fxt = c2 & 15;
        if (fxt === 0) {
          pdata[p] = ins & 240 | ptkTable[note][0];
          pdata[p + 1] = ptkTable[note][1];
          pdata[p + 2] = ver === 2 ? ins << 4 & 240 | 0 : ins << 4 & 240;
          continue;
        }
        const c3 = u8();
        let fxtV = fxt;
        if (fxtV === 8) fxtV = 0;
        let fxp = c3;
        if (fxtV === 5 || fxtV === 6 || fxtV === 10) {
          if (fxp > 128) fxp = 256 - fxp;
          else if (fxp <= 128) fxp = fxp << 4 & 240;
        }
        pdata[p] = ins & 240 | ptkTable[note][0];
        pdata[p + 1] = ptkTable[note][1];
        pdata[p + 2] = ins << 4 & 240 | fxtV;
        pdata[p + 3] = fxp;
      }
      if (pos > maxTrkOfs) maxTrkOfs = pos;
    }
    for (let k = 0; k < 1024; k++) out.push(pdata[k]);
  }
  if (ver > 2 && (maxTrkOfs & 1) !== 0) maxTrkOfs += 1;
  moveData(data, maxTrkOfs, out, ssize);
  return Uint8Array.from(out);
}
function testTp23(data, start, magic) {
  const s = data.length - start;
  if (s < 1024) return 1024 - s;
  for (let i = 0; i < 8; i++) {
    if (data[start + i] !== magic.charCodeAt(i)) return -1;
  }
  let nins = readmem16b(data, start + 28);
  if (nins === 0 || (nins & 7) !== 0 || nins >> 3 > 31) return -1;
  nins >>= 3;
  for (let i = 0; i < nins; i++) {
    const d = start + i * 8;
    if (data[d + 30] > 15) return -1;
    if (data[d + 31] > 64) return -1;
  }
  let ssize = 0;
  for (let i = 0; i < nins; i++) {
    const d = start + i * 8;
    const l = readmem16b(data, d + 32) << 1;
    const lstart = readmem16b(data, d + 34) << 1;
    const lsize = readmem16b(data, d + 36) << 1;
    if (l > 65535 || lstart > 65535 || lsize > 65535) return -1;
    if (lstart + lsize > l + 2) return -1;
    if (lstart !== 0 && lsize === 0) return -1;
    ssize += l;
  }
  if (ssize <= 4) return -1;
  const npat = data[start + nins * 8 + 31];
  if (npat === 0 || npat > 128) return -1;
  pwReadTitle(data.subarray(start + 8), 20);
  return 0;
}
var pwTp3 = {
  name: "Tracker Packer v3",
  test: (data, start) => testTp23(data, start, "CPLX_TP3"),
  depack: (data, start) => depackTp23(data, start, 3)
};
var pwTp2 = {
  name: "Tracker Packer v2",
  test: (data, start) => testTp23(data, start, "MEXX_TP2"),
  depack: (data, start) => depackTp23(data, start, 2)
};

// ../../packages/fmt-prowizard/src/pw-unic.ts
var MAGIC_M_K_ = 1294879534;
var MAGIC_UNIC = 1431193923;
var MAGIC_0000 = 0;
function put86(out, b) {
  out.push(b & 255);
}
function put16b6(out, v) {
  out.push(v >> 8 & 255, v & 255);
}
function put32b6(out, v) {
  out.push(v >>> 24 & 255, v >> 16 & 255, v >> 8 & 255, v & 255);
}
function depackUnic(data, start) {
  let pos = start;
  const out = [];
  const u8 = () => data[pos++] ?? 0;
  const u16 = () => {
    const v = readmem16b(data, pos);
    pos += 2;
    return v;
  };
  for (let i = 0; i < 20; i++) out.push(data[pos++] ?? 0);
  let ssize = 0;
  for (let i = 0; i < 31; i++) {
    for (let k = 0; k < 20; k++) out.push(data[pos++] ?? 0);
    put86(out, 0);
    put86(out, 0);
    const c1 = u8();
    const c2 = u8();
    const j = (c1 << 8) + c2;
    let fine = 0;
    if (j !== 0) {
      fine = j < 256 ? 16 - c2 : 256 - c2;
    }
    const len = u16();
    put16b6(out, len);
    ssize += len * 2;
    u8();
    put86(out, fine);
    put86(out, u8());
    let lstart = u16();
    const lsize = u16();
    if (lstart * 2 + lsize <= len && lstart !== 0) {
      lstart <<= 1;
    }
    put16b6(out, lstart);
    put16b6(out, lsize);
  }
  const npat = u8();
  put86(out, npat);
  put86(out, 127);
  u8();
  const tmp = [];
  for (let i = 0; i < 128; i++) tmp.push(u8());
  for (let i = 0; i < 128; i++) put86(out, tmp[i]);
  let max = 0;
  for (let i = 0; i < 128; i++) {
    if (tmp[i] > max) max = tmp[i];
  }
  max++;
  put32b6(out, 1294879534);
  pos = start + 1084;
  const id = readmem32b(data, start + 1080);
  if (id !== 0 && id !== MAGIC_M_K_ && id !== MAGIC_UNIC) {
    pos = start + 1080;
  }
  for (let i = 0; i < max; i++) {
    for (let j = 0; j < 256; j++) {
      const c1 = u8();
      const c2 = u8();
      const c3 = u8();
      if (pos > data.length + 1) throw new Error("unic: read error");
      const ins = c1 >> 2 & 16 | c2 >> 4 & 15;
      const note = c1 & 63;
      if (!ptkIsValidNote(note)) throw new Error("unic: invalid note");
      const fxt = c2 & 15;
      let fxp = c3;
      if (fxt === 13) {
        const tens = Math.trunc(fxp / 10);
        const ones = fxp % 10;
        fxp = 16 * tens + ones;
      }
      out.push(ins & 240 | ptkTable[note][0]);
      out.push(ptkTable[note][1]);
      out.push(ins << 4 & 240 | fxt);
      out.push(fxp);
    }
  }
  moveData(data, pos, out, ssize);
  return Uint8Array.from(out);
}
function checkInstruments(data, start) {
  let ssize = 0;
  let maxIns = 0;
  for (let i = 0; i < 31; i++) {
    const d = start + i * 30;
    const len = readmem16b(data, d + 42) << 1;
    const lstart = readmem16b(data, d + 46) << 1;
    const lsize = readmem16b(data, d + 48) << 1;
    const fine = readmem16b(data, d + 40);
    ssize += len;
    if (lsize !== 0 && len + 2 < lstart + lsize) return -1;
    if (len > 65535 || lstart > 65535 || lsize > 65535) return -1;
    if (data[d + 45] > 64) return -1;
    if (fine !== 0 && len === 0 || fine > 8 && fine < 247) return -1;
    if (lstart !== 0 && lsize <= 2) return -1;
    if (data[d + 45] !== 0 && len === 0) return -1;
    if (len !== 0) maxIns = i + 1;
  }
  if (ssize <= 2) return -1;
  return maxIns;
}
function checkPatternListSize(data, start) {
  const len = data[start + 950];
  if (len === 0 || len > 127) return -1;
  let psize = 0;
  let i = 0;
  for (; i < len; i++) {
    const x = data[start + 952 + i];
    if (x > 127) return -1;
    if (x > psize) psize = x;
  }
  for (; i !== 128; i++) {
    if (data[start + 952 + i] !== 0) return -1;
  }
  psize++;
  psize <<= 8;
  return psize;
}
function checkPattern(data, s, psize, maxIns, offset) {
  if (s < offset + psize * 3 + 2) return offset + psize * 3 + 2 - s;
  for (let i = 0; i < psize; i++) {
    const d = offset + i * 3;
    if (data[d] > 116) return -1;
    if ((data[d] & 63) > 36) return -1;
    if ((data[d + 1] & 15) === 12 && data[d + 2] > 64) return -1;
    if ((data[d + 1] & 15) === 11 && data[d + 2] > 127) return -1;
    if ((data[d + 1] & 15) === 13 && data[d + 2] > 64) return -1;
    const ins = data[d] >> 2 & 48 | data[d + 1] >> 4 & 15;
    if (ins > maxIns) return -1;
  }
  return 0;
}
function testUnicId(data, start) {
  const s = data.length - start;
  if (s < 1084) return 1084 - s;
  if (readmem32b(data, start + 1080) !== MAGIC_M_K_) return -1;
  let ssize = 0;
  for (let i = 0; i < 31; i++) {
    const d = start + i * 30;
    const size = readmem16b(data, d + 42) << 1;
    ssize += size;
    const end = readmem16b(data, d + 46) + readmem16b(data, d + 48) << 1;
    if (size + 2 < end) return -1;
  }
  if (ssize <= 2) return -1;
  for (let i = 0; i < 31; i++) {
    const d = start + i * 30;
    const fine = data[d + 40] << 24 >> 24;
    if (fine < -8 || fine > 7) return -1;
    if (data[d + 44] !== 0 || data[d + 45] > 64) return -1;
  }
  const psize = checkPatternListSize(data, start);
  if (psize < 0) return -1;
  if (s < psize * 3 + 1084) return psize * 3 + 1084 - s;
  for (let i = 0; i < psize; i++) {
    if (data[start + 1084 + i * 3] > 116) return -1;
  }
  return 0;
}
function testUnicEmptyId(data, start) {
  const s = data.length - start;
  if (s < 1084) return 1084 - s;
  if (readmem32b(data, start + 1080) !== MAGIC_0000) return -1;
  const maxIns = checkInstruments(data, start);
  if (maxIns < 0) return -1;
  const psize = checkPatternListSize(data, start);
  if (psize < 0) return -1;
  const r = checkPattern(data, s, psize, maxIns, start + 1084);
  if (r < 0) return r;
  return 0;
}
function testUnicNoid(data, start) {
  const s = data.length - start;
  if (s < 1084) return 1084 - s;
  if (readmem32b(data, start + 1080) === MAGIC_0000) return -1;
  const maxIns = checkInstruments(data, start);
  if (maxIns < 0) return -1;
  const psize = checkPatternListSize(data, start);
  if (psize < 0) return -1;
  const r = checkPattern(data, s, psize, maxIns, start + 1080);
  if (r < 0) return r;
  for (let i = 0; i < 20; i++) {
    const c = data[start + i];
    if (c !== 0 && c < 32 || c > 180) return -1;
  }
  return 0;
}
var pwUnicId = {
  name: "UNIC Tracker",
  test: testUnicId,
  depack: depackUnic
};
var pwUnicNoid = {
  name: "UNIC Tracker noid",
  test: testUnicNoid,
  depack: depackUnic
};
var pwUnicEmptyId = {
  name: "UNIC Tracker id0",
  test: testUnicEmptyId,
  depack: depackUnic
};

// ../../packages/fmt-prowizard/src/pw-unic2.ts
function put87(out, b) {
  out.push(b & 255);
}
function put16b7(out, v) {
  out.push(v >> 8 & 255, v & 255);
}
function put32b7(out, v) {
  out.push(v >>> 24 & 255, v >> 16 & 255, v >> 8 & 255, v & 255);
}
function depackUnic2(data, start) {
  let pos = start;
  const out = [];
  const u8 = () => data[pos++] ?? 0;
  const u16 = () => {
    const v = readmem16b(data, pos);
    pos += 2;
    return v;
  };
  writeZero(out, 20);
  let ssize = 0;
  for (let i = 0; i < 31; i++) {
    for (let k = 0; k < 20; k++) out.push(data[pos++] ?? 0);
    put87(out, 0);
    put87(out, 0);
    const c1 = u8();
    const c2 = u8();
    const j = (c1 << 8) + c2;
    let fine = 0;
    if (j !== 0) {
      fine = j < 256 ? 16 - c2 : 256 - c2;
    }
    const len = u16();
    put16b7(out, len);
    ssize += len << 1;
    u8();
    put87(out, fine);
    put87(out, u8());
    let lstart = u16();
    const lsize = u16();
    if (lstart * 2 + lsize <= len && lstart !== 0) {
      lstart <<= 1;
    }
    put16b7(out, lstart);
    put16b7(out, lsize);
  }
  const npat = u8();
  put87(out, npat);
  put87(out, 127);
  u8();
  const tmp = [];
  for (let i = 0; i < 128; i++) tmp.push(u8());
  for (let i = 0; i < 128; i++) put87(out, tmp[i]);
  let maxpat = 0;
  for (let i = 0; i < 128; i++) {
    if (tmp[i] > maxpat) maxpat = tmp[i];
  }
  maxpat++;
  put32b7(out, 1294879534);
  for (let i = 0; i < maxpat; i++) {
    for (let j = 0; j < 256; j++) {
      const c1 = u8();
      const c2 = u8();
      const c3 = u8();
      const ins = c1 >> 2 & 16 | c2 >> 4 & 15;
      const note = c1 & 63;
      if (!ptkIsValidNote(note)) throw new Error("unic2: invalid note");
      const fxt = c2 & 15;
      let fxp = c3;
      if (fxt === 13) {
        const ones = fxp % 10;
        const tens = Math.trunc(fxp / 10);
        fxp = 16 * tens + ones;
      }
      out.push(ins & 240 | ptkTable[note][0]);
      out.push(ptkTable[note][1]);
      out.push(ins << 4 & 240 | fxt);
      out.push(fxp);
    }
  }
  moveData(data, pos, out, ssize);
  return Uint8Array.from(out);
}
function testUnic2(data, start) {
  const s = data.length - start;
  if (s < 1084) return 1084 - s;
  if (readmem32b(data, start + 1080) === 0) return -1;
  let ssize = 0;
  let maxIns = 0;
  for (let i2 = 0; i2 < 31; i2++) {
    const d = start + i2 * 30;
    const size = readmem16b(data, d + 22) << 1;
    const lstart = readmem16b(data, d + 26) << 1;
    const lsize = readmem16b(data, d + 28) << 1;
    ssize += size;
    if (size + 2 < lstart + lsize) return -1;
    if (size > 65535 || lstart > 65535 || lsize > 65535) return -1;
    if (data[d + 25] > 64) return -1;
    if (readmem16b(data, d + 20) !== 0 && size === 0) return -1;
    if (data[d + 25] !== 0 && size === 0) return -1;
    if (size !== 0) maxIns = i2 + 1;
  }
  if (ssize <= 2) return -1;
  const len = data[start + 930];
  if (len === 0 || len > 127) return -1;
  let psize = 0;
  let i = 0;
  for (; i < len; i++) {
    const x = data[start + 932 + i];
    if (x > 127) return -1;
    if (x > psize) psize = x;
  }
  for (i += 2; i !== 128; i++) {
    if (data[start + 932 + i] !== 0) return -1;
  }
  psize++;
  psize <<= 8;
  if (s < 1060 + psize * 3 + 2) return 1060 + psize * 3 + 2 - s;
  for (i = 0; i < psize; i++) {
    const d = start + 1060 + i * 3;
    if (data[d] > 116) return -1;
    if ((data[d] & 63) > 36) return -1;
    if ((data[d + 1] & 15) === 12 && data[d + 2] > 64) return -1;
    if ((data[d + 1] & 15) === 11 && data[d + 2] > 127) return -1;
    if ((data[d + 1] & 15) === 13 && data[d + 2] > 64) return -1;
    const ins = data[d] >> 2 & 48 | data[d + 2] >> 4 & 15;
    if (ins > maxIns) return -1;
  }
  pwReadTitle(null, 0);
  return 0;
}
var pwUnic2 = {
  name: "Unic Tracker 2",
  test: testUnic2,
  depack: depackUnic2
};

// ../../packages/fmt-prowizard/src/pw-np12.ts
var PW_MOD_MAGIC5 = 1294879534;
function put88(out, b) {
  out.push(b & 255);
}
function put16b8(out, v) {
  out.push(v >> 8 & 255, v & 255);
}
function put32b8(out, v) {
  out.push(v >>> 24 & 255, v >> 16 & 255, v >> 8 & 255, v & 255);
}
function depackNp12(data, start, ver1) {
  let pos = start;
  const out = [];
  const u8 = () => data[pos++] ?? 0;
  const u16 = () => {
    const v = readmem16b(data, pos);
    pos += 2;
    return v;
  };
  const u32 = () => {
    const v = readmem32b(data, pos);
    pos += 4;
    return v;
  };
  const c1 = u8();
  const c2 = u8();
  const nins = c1 << 4 & 240 | c2 >> 4 & 15;
  writeZero(out, 20);
  const len = u16() >> 1;
  if (len > 128) throw new Error("np: pattern list too long");
  u16();
  u16();
  let ssize = 0;
  for (let i = 0; i < nins; i++) {
    u32();
    writeZero(out, 22);
    const size = u16();
    ssize += size * 2;
    put16b8(out, size);
    put88(out, u8());
    put88(out, u8());
    u32();
    const loopSize = u16();
    put16b8(out, ver1 ? u16() / 2 : u16());
    put16b8(out, loopSize);
  }
  {
    const pad = new Array(30).fill(0);
    pad[29] = 1;
    for (let i = nins; i < 31; i++) out.push(...pad);
  }
  put88(out, len);
  put88(out, 127);
  pos += 2;
  pos += 2;
  const ptable = [];
  let npat = 0;
  for (let i = 0; i < len; i++) {
    const p = u16() >> 3;
    ptable.push(p);
    if (p > npat) npat = p;
  }
  npat++;
  if (!ver1 && npat > 128) throw new Error("np2: too many patterns");
  for (let i = 0; i < 128; i++) put88(out, ptable[i]);
  put32b8(out, PW_MOD_MAGIC5);
  const trkAddr = [];
  let maxAddr = 0;
  for (let i = 0; i < npat; i++) {
    const row = [];
    for (let j = 0; j < 4; j++) {
      const a = u16();
      row.push(a);
      if (a > maxAddr) maxAddr = a;
    }
    trkAddr.push(row);
  }
  const trkStart = pos;
  for (let i = 0; i < npat; i++) {
    const tmp = new Uint8Array(1024);
    for (let j = 0; j < 4; j++) {
      pos = trkStart + trkAddr[i][3 - j];
      for (let k = 0; k < 64; k++) {
        const x = k * 16 + j * 4;
        const c12 = u8();
        const c22 = u8();
        const c3 = u8();
        const c4 = Math.trunc((c12 & 254) / 2);
        if (!ptkIsValidNote(c4)) throw new Error("np: invalid note");
        let eff2 = c22;
        let eff3 = c3;
        switch (c22 & 15) {
          case 8:
            eff2 &= 240;
            break;
          case 7:
            eff2 = (eff2 & 240) + 10;
            eff3 = eff3 > 128 ? 256 - eff3 : eff3 << 4 & 240;
            break;
          case 6:
          case 5:
            eff3 = eff3 > 128 ? 256 - eff3 : eff3 << 4 & 240;
            break;
          case 11:
            eff3 = Math.trunc((eff3 + 4) / 2);
            break;
          case 14:
            if (!ver1) eff3--;
            break;
        }
        tmp[x] = c12 << 4 & 16 | ptkTable[c4][0];
        tmp[x + 1] = ptkTable[c4][1];
        tmp[x + 2] = eff2 & 255;
        tmp[x + 3] = eff3 & 255;
      }
    }
    for (let k = 0; k < 1024; k++) out.push(tmp[k]);
  }
  moveData(data, start + maxAddr + 192 + trkStart, out, ssize);
  return Uint8Array.from(out);
}
function testNp12(data, start, ver1) {
  const s = data.length - start;
  if (s < 10) return 10 - s;
  const ptabSize = readmem16b(data, start + 2);
  if (ptabSize === 0 || (ptabSize & 1) !== 0 || ptabSize > 255) return -1;
  if ((data[start + 1] & 15) !== 12) return -1;
  const numIns = data[start] << 4 & 240 | data[start + 1] >> 4 & 15;
  if (numIns === 0 || numIns > 31) return -1;
  if (s < 15 + numIns * 16) return 15 + numIns * 16 - s;
  for (let i = 0; i < numIns; i++) {
    if (data[start + 15 + i * 16] > 64) return -1;
  }
  let ssize = 0;
  for (let i = 0; i < numIns; i++) {
    const d = start + i * 16;
    const len = readmem16b(data, d + 12) << 1;
    const lstart = readmem16b(data, d + 20) << 1;
    const lsize = ver1 ? readmem16b(data, d + 22) : readmem16b(data, d + 22) << 1;
    if (len > 65535 || lstart > 65535 || lsize > 65535) return -1;
    if (lstart + lsize > len + 2) return -1;
    if (lstart === 0 && lsize !== 0) return -1;
    ssize += len;
  }
  if (ssize <= 4) return -1;
  let hdrSize = numIns * 16 + 8 + 4;
  if (s < hdrSize + ptabSize + 2) return hdrSize + ptabSize + 2 - s;
  let maxPptr = 0;
  for (let i = 0; i < ptabSize; i += 2) {
    const pptr = readmem16b(data, start + hdrSize + i);
    if (ver1) {
      if ((pptr & 7) !== 0 || pptr >= 1024) return -1;
    } else {
      if ((pptr & 7) !== 0 || pptr > 1024) return -1;
    }
    if (pptr > maxPptr) maxPptr = pptr;
  }
  hdrSize += ptabSize + maxPptr + 8;
  const trkSize = readmem16b(data, start + 6);
  if (trkSize < 192 || (trkSize & 63) !== 0) return -1;
  const need = hdrSize + trkSize + (ver1 ? 0 : 16);
  if (s < need) return need - s;
  for (let i = 0; i < trkSize; i += 3) {
    const d = start + hdrSize + i;
    if (data[d] > 73) return -1;
    if (!ver1) {
      const ins = data[d] << 4 & 16 | data[d + 1] >> 4 & 15;
      if (ins > numIns) return -1;
      if ((data[d + 1] & 15) === 0 && data[d + 2] !== 0) return -1;
    }
  }
  pwReadTitle(null, 0);
  return 0;
}
var pwNp1 = {
  name: "NoisePacker v1",
  test: (data, st) => testNp12(data, st, true),
  depack: (data, st) => depackNp12(data, st, true)
};
var pwNp2 = {
  name: "NoisePacker v2",
  test: (data, st) => testNp12(data, st, false),
  depack: (data, st) => depackNp12(data, st, false)
};

// ../../packages/fmt-prowizard/src/pw-np3.ts
var PW_MOD_MAGIC6 = 1294879534;
function put89(out, b) {
  out.push(b & 255);
}
function put16b9(out, v) {
  out.push(v >> 8 & 255, v & 255);
}
function put32b9(out, v) {
  out.push(v >>> 24 & 255, v >> 16 & 255, v >> 8 & 255, v & 255);
}
function depackNp3(data, start) {
  let pos = start;
  const out = [];
  const u8 = () => data[pos++] ?? 0;
  const u16 = () => {
    const v = readmem16b(data, pos);
    pos += 2;
    return v;
  };
  const c1 = u8();
  const c2 = u8();
  const nins = c1 << 4 & 240 | c2 >> 4 & 15;
  writeZero(out, 20);
  const len = u16() >> 1;
  if (len > 128) throw new Error("np3: pattern list too long");
  u16();
  u16();
  let ssize = 0;
  for (let i = 0; i < nins; i++) {
    const rec = data.subarray(pos, pos + 16);
    pos += 16;
    writeZero(out, 22);
    const size = readmem16b(rec, 6);
    ssize += size * 2;
    put16b9(out, size);
    put89(out, rec[0]);
    put89(out, rec[1]);
    out.push(rec[14], rec[15]);
    out.push(rec[12], rec[13]);
  }
  {
    const pad = new Array(30).fill(0);
    pad[29] = 1;
    for (let i = nins; i < 31; i++) out.push(...pad);
  }
  put89(out, len);
  put89(out, 127);
  pos += 2;
  pos += 2;
  const ptable = [];
  let npat = 0;
  for (let i = 0; i < len; i++) {
    const p = Math.trunc(u16() / 8);
    ptable.push(p);
    if (p > npat) npat = p;
  }
  npat++;
  for (let i = 0; i < 128; i++) put89(out, ptable[i]);
  put32b9(out, PW_MOD_MAGIC6);
  const trkAddr = [];
  for (let i = 0; i < npat; i++) {
    const row = [];
    for (let j = 0; j < 4; j++) row.push(u16());
    trkAddr.push(row);
  }
  const trkStart = pos;
  let smpAddr = 0;
  for (let i = 0; i < npat; i++) {
    const tmp = new Uint8Array(1024);
    for (let j = 0; j < 4; j++) {
      pos = trkStart + trkAddr[i][3 - j];
      for (let k = 0; k < 64; k++) {
        const x = k * 16 + j * 4;
        const c12 = u8();
        if (c12 >= 128) {
          k += 256 - c12 - 1;
          continue;
        }
        const c22 = u8();
        const c3 = u8();
        const c4 = Math.trunc((c12 & 254) / 2);
        if (!ptkIsValidNote(c4)) throw new Error("np3: invalid note");
        let eff2 = c22;
        let eff3 = c3;
        switch (c22 & 15) {
          case 8:
            eff2 &= 240;
            break;
          case 7:
            eff2 = (eff2 & 240) + 10;
            eff3 = eff3 > 128 ? 256 - eff3 : eff3 << 4 & 240;
            break;
          case 6:
          case 5:
            eff3 = eff3 > 128 ? 256 - eff3 : eff3 << 4 & 240;
            break;
          case 14:
            eff3 = 1;
            break;
          case 11:
            eff3 = Math.trunc((eff3 + 4) / 2);
            break;
        }
        tmp[x] = c12 << 4 & 16 | ptkTable[c4][0];
        tmp[x + 1] = ptkTable[c4][1];
        tmp[x + 2] = eff2;
        tmp[x + 3] = eff3;
        if ((c22 & 15) === 13) break;
      }
      if (pos > smpAddr) smpAddr = pos;
    }
    for (let k = 0; k < 1024; k++) out.push(tmp[k]);
  }
  if ((smpAddr & 1) !== 0) smpAddr++;
  moveData(data, smpAddr, out, ssize);
  return Uint8Array.from(out);
}
function testNp3(data, start) {
  const s = data.length - start;
  if (s < 10) return 10 - s;
  const ptabSize = readmem16b(data, start + 2);
  if (ptabSize === 0 || (ptabSize & 1) !== 0 || ptabSize > 255) return -1;
  if ((data[start + 1] & 15) !== 12) return -1;
  const numIns = data[start] << 4 & 240 | data[start + 1] >> 4 & 15;
  if (numIns === 0 || numIns > 31) return -1;
  if (s < 15 + numIns * 16) return 15 + numIns * 16 - s;
  for (let i = 0; i < numIns; i++) {
    if (data[start + 9 + i * 16] > 64) return -1;
  }
  let ssize = 0;
  for (let i = 0; i < numIns; i++) {
    const d = start + i * 16;
    const len = readmem16b(data, d + 14) << 1;
    const lstart = readmem16b(data, d + 20) << 1;
    const lsize = readmem16b(data, d + 22) << 1;
    if (len > 65535 || lstart > 65535 || lsize > 65535) return -1;
    if (lstart + lsize > len + 2) return -1;
    if (lstart === 0 && lsize !== 0) return -1;
    ssize += len;
  }
  if (ssize <= 4) return -1;
  let hdrSize = numIns * 16 + 8 + 4;
  if (s < hdrSize + ptabSize + 2) return hdrSize + ptabSize + 2 - s;
  let maxPptr = 0;
  for (let i = 0; i < ptabSize; i += 2) {
    const pptr = readmem16b(data, start + hdrSize + i);
    if ((pptr & 7) !== 0 || pptr >= 1024) return -1;
    if (pptr > maxPptr) maxPptr = pptr;
  }
  hdrSize += ptabSize + maxPptr + 8;
  const trkSize = readmem16b(data, start + 6);
  if (trkSize <= 63) return -1;
  if (s < hdrSize + trkSize + 2) return hdrSize + trkSize + 2 - s;
  let errcount = 0;
  for (let i = 0; i < trkSize; i++) {
    const d = start + hdrSize + i;
    if ((data[d] & 128) !== 0) continue;
    if (data[d] > 73 || (data[d + 1] & 15) === 10) errcount++;
    if ((data[d + 1] & 15) === 13 && data[d + 2] > 64) errcount++;
    if ((data[d] << 4 & 16 | data[d + 1] >> 4 & 15) > numIns) errcount++;
    if (data[d] === 0 && data[d + 1] === 0 && data[d + 2] === 0 && i < trkSize - 3) errcount++;
    if (errcount > 1) return -1;
    i += 2;
  }
  pwReadTitle(null, 0);
  return 0;
}
var pwNp3 = {
  name: "NoisePacker v3",
  test: testNp3,
  depack: depackNp3
};

// ../../packages/fmt-prowizard/src/pw-xann.ts
var SMP_DESC_ADDRESS = 518;
var PAT_DATA_ADDRESS = 1084;
function put810(out, b) {
  out.push(b & 255);
}
function put16b10(out, v) {
  out.push(v >> 8 & 255, v & 255);
}
function put32b10(out, v) {
  out.push(v >>> 24 & 255, v >> 16 & 255, v >> 8 & 255, v & 255);
}
function depackXann(data, start) {
  let pos = start;
  const out = [];
  const u8 = () => data[pos++] ?? 0;
  const u16 = () => {
    const v = readmem16b(data, pos);
    pos += 2;
    return v;
  };
  const u32 = () => {
    const v = readmem32b(data, pos);
    pos += 4;
    return v;
  };
  writeZero(out, 20);
  pos = start + SMP_DESC_ADDRESS;
  let ssize = 0;
  for (let i = 0; i < 31; i++) {
    writeZero(out, 22);
    const fine = u8();
    const vol = u8();
    let j = u32();
    const lsize = u16();
    const k = u32();
    const size = u16();
    ssize += size * 2;
    j = j - k;
    put16b10(out, size);
    put810(out, fine);
    put810(out, vol);
    put16b10(out, Math.trunc(j / 2));
    put16b10(out, lsize);
    u16();
  }
  pos = start;
  const ptable = new Array(128).fill(0);
  let pat = 0;
  let c5 = 0;
  for (; c5 < 128; c5++) {
    const k = u32();
    if (k === 0) break;
    ptable[c5] = Math.trunc((k - 60) / 1024) - 1;
    if (ptable[c5] > pat) pat = ptable[c5];
  }
  pat++;
  put810(out, c5);
  put810(out, 127);
  for (let i = 0; i < 128; i++) put810(out, ptable[i]);
  put32b10(out, 1294879534);
  pos = start + PAT_DATA_ADDRESS;
  for (let i = 0; i < pat; i++) {
    for (let j = 0; j < 256; j++) {
      const ins = Math.trunc(u8() >> 3 & 31);
      const note = u8();
      let fxt = u8();
      let fxp = u8();
      if (!ptkIsValidNote(note >> 1)) throw new Error("xann: invalid note");
      switch (fxt) {
        case 0:
          fxt = 0;
          break;
        // no fxt
        case 4:
          fxt = 0;
          break;
        // arpeggio
        case 8:
          fxt = 1;
          break;
        // portamento up
        case 12:
          fxt = 2;
          break;
        // portamento down
        case 16:
          fxt = 3;
          break;
        // tone porta, no fxp
        case 20:
          fxt = 3;
          break;
        // tone portamento
        case 24:
          fxt = 4;
          break;
        // vibrato, no fxp
        case 28:
          fxt = 4;
          break;
        // vibrato
        case 36:
          fxt = 5;
          break;
        // tone porta + vol down
        case 40:
          fxt = 6;
          fxp = (fxp << 4 & 240 | fxp >> 4 & 15) & 255;
          break;
        case 44:
          fxt = 6;
          break;
        // vibrato + vol DOWN
        case 56:
          fxt = 9;
          break;
        // sample offset
        case 60:
          fxt = 10;
          fxp = (fxp << 4 & 240 | fxp >> 4 & 15) & 255;
          break;
        case 64:
          fxt = 10;
          break;
        // volume slide down
        case 68:
          fxt = 11;
          break;
        // position jump
        case 72:
          fxt = 12;
          break;
        // set volume
        case 76:
          fxt = 13;
          break;
        // pattern break
        case 80:
          fxt = 15;
          break;
        // set speed
        case 88:
          fxt = 14;
          fxp = 1;
          break;
        // set filter
        case 92:
          fxt = 14;
          fxp |= 16;
          break;
        // fine slide up
        case 96:
          fxt = 14;
          fxp |= 32;
          break;
        // fine slide down
        case 132:
          fxt = 14;
          fxp |= 144;
          break;
        // retrigger
        case 136:
          fxt = 14;
          fxp |= 160;
          break;
        // fine vol slide up
        case 140:
          fxt = 14;
          fxp |= 176;
          break;
        // fine vol slide down
        case 148:
          fxt = 14;
          fxp |= 208;
          break;
        // note delay
        case 152:
          fxt = 14;
          fxp |= 224;
          break;
        // pattern delay
        default:
          fxt = 0;
          fxp = 0;
          break;
      }
      out.push(ins & 240 | ptkTable[note >> 1][0]);
      out.push(ptkTable[note >> 1][1]);
      out.push(ins << 4 & 240 | fxt);
      out.push(fxp);
    }
  }
  moveData(data, pos, out, ssize);
  return Uint8Array.from(out);
}
function testXann(data, start) {
  const s = data.length - start;
  if (s < 2048) return 2048 - s;
  if (data[start + 3] !== 60) return -1;
  for (let i = 0; i < 128; i++) {
    const j = readmem32b(data, start + i * 4);
    const k = j & ~3;
    if (k !== j || j > 132156) return -1;
  }
  for (let i = 0; i < 64; i++) {
    if (data[start + 3 + i * 4] !== 60 && data[start + 3 + i * 4] !== 0) {
      return -1;
    }
  }
  for (let i = 0; i < 31; i++) {
    if (data[start + 519 + 16 * i] > 64) return -1;
  }
  for (let i = 0; i < 30; i++) {
    const j = readmem32b(data, start + 526 + 16 * i);
    const k = readmem32b(data, start + 520 + 16 * (i + 1));
    if (j < 2108 || k < 2108) return -1;
    if (j > k) return -1;
  }
  pwReadTitle(null, 0);
  return 0;
}
var pwXann = {
  name: "XANN Packer",
  test: testXann,
  depack: depackXann
};

// ../../packages/fmt-prowizard/src/pw-wn.ts
var PW_MOD_MAGIC7 = 1294879534;
function put811(out, b) {
  out.push(b & 255);
}
function put32b11(out, v) {
  out.push(v >>> 24 & 255, v >> 16 & 255, v >> 8 & 255, v & 255);
}
function depackWn(data, start) {
  let pos = start;
  const out = [];
  for (let i = 0; i < 950; i++) out.push(data[pos++] ?? 0);
  let ssize = 0;
  for (let i = 0; i < 31; i++) {
    ssize += (data[start + 42 + i * 30] << 8 | data[start + 43 + i * 30]) * 2;
  }
  const npat = data[start + 950];
  put811(out, npat);
  for (let i = 0; i < 129; i++) out.push(data[start + 951 + i] ?? 0);
  put32b11(out, PW_MOD_MAGIC7);
  let max = 0;
  for (let i = 0; i < 128; i++) {
    if (data[start + 951 + i + 1] > max) max = data[start + 951 + i + 1];
  }
  max++;
  pos = start + 1084;
  for (let i = 0; i < max; i++) {
    for (let j = 0; j < 256; j++) {
      const c1 = data[pos++] ?? 0;
      const c2 = data[pos++] ?? 0;
      const c3 = data[pos++] ?? 0;
      const c4 = data[pos++] ?? 0;
      if (!ptkIsValidNote(Math.trunc(c1 / 2))) throw new Error("wn: invalid note");
      put811(out, c2 & 240 | ptkTable[Math.trunc(c1 / 2)][0]);
      put811(out, ptkTable[Math.trunc(c1 / 2)][1]);
      put811(out, c2 << 4 & 240 | c3);
      put811(out, c4);
    }
  }
  moveData(data, pos, out, ssize);
  return Uint8Array.from(out);
}
function testWn(data, start) {
  const s = data.length - start;
  if (s < 1082) return 1082 - s;
  if (data[start + 1080] !== 87 || data[start + 1081] !== 78) return -1;
  if (data[start + 951] !== 127) return -1;
  if (data[start + 950] > 127) return -1;
  pwReadTitle(data.subarray(start), 20);
  return 0;
}
var pwWn = {
  name: "Wanton Packer",
  test: testWn,
  depack: depackWn
};

// ../../packages/fmt-prowizard/src/pw-zen.ts
var PW_MOD_MAGIC8 = 1294879534;
function put812(out, b) {
  out.push(b & 255);
}
function put16b11(out, v) {
  out.push(v >> 8 & 255, v & 255);
}
function put32b12(out, v) {
  out.push(v >>> 24 & 255, v >> 16 & 255, v >> 8 & 255, v & 255);
}
function depackZen(data, start) {
  let pos = start;
  const out = [];
  const u8 = () => data[pos++] ?? 0;
  const u16 = () => {
    const v = readmem16b(data, pos);
    pos += 2;
    return v;
  };
  const u32 = () => {
    const v = readmem32b(data, pos);
    pos += 4;
    return v;
  };
  const ptableAddr = u32();
  const patMax = u8();
  const patPos = u8();
  if (patPos >= 128 || patMax >= 128) throw new Error("zen: counts too large");
  writeZero(out, 20);
  let ssize = 0;
  let sdataAddr = 999999;
  for (let i = 0; i < 31; i++) {
    writeZero(out, 22);
    const finetune = Math.trunc(u16() / 72);
    u8();
    const vol = u8();
    const size = u16();
    ssize += size * 2;
    put16b11(out, size);
    put812(out, finetune);
    put812(out, vol);
    const loopSize = u16();
    const k = u32();
    if (k < sdataAddr) sdataAddr = k;
    const j = Math.trunc((u32() - k) / 2);
    put16b11(out, j);
    put16b11(out, loopSize);
  }
  put812(out, patPos);
  put812(out, 127);
  pos = start + ptableAddr;
  const paddr = [];
  for (let i = 0; i < patPos; i++) paddr.push(u32());
  const ptable = new Array(128).fill(0);
  const paddr2 = new Array(128).fill(0);
  let c4 = 0;
  for (let i = 0; i < patPos; i++) {
    if (i === 0) {
      ptable[0] = 0;
      paddr2[0] = paddr[0];
      c4++;
      continue;
    }
    let j = 0;
    for (; j < i; j++) {
      if (paddr[i] === paddr[j]) {
        ptable[i] = ptable[j];
        break;
      }
    }
    if (j === i) {
      paddr2[c4] = paddr[i];
      ptable[i] = c4;
      c4++;
    }
  }
  for (let i = 0; i < 128; i++) put812(out, ptable[i]);
  put32b12(out, PW_MOD_MAGIC8);
  for (let i = 0; i <= patMax; i++) {
    const pat = new Uint8Array(1024);
    pos = start + paddr2[i];
    let j = 0;
    while (j < 256) {
      const c1 = u8();
      const c2 = u8();
      const c3 = u8();
      const c4v = u8();
      const note = Math.trunc((c2 & 127) / 2);
      if (!ptkIsValidNote(note)) throw new Error("zen: invalid note");
      const fxp = c4v;
      const ins = c2 << 4 & 16 | c3 >> 4 & 15;
      const fxt = c3 & 15;
      const p = c1 * 4;
      pat[p] = ins & 240 | ptkTable[note][0];
      pat[p + 1] = ptkTable[note][1];
      pat[p + 2] = fxt | ins << 4 & 240;
      pat[p + 3] = fxp;
      j = c1;
      j++;
    }
    for (let k = 0; k < 1024; k++) out.push(pat[k]);
  }
  moveData(data, start + sdataAddr, out, ssize);
  return Uint8Array.from(out);
}
function testZen(data, start) {
  const s = data.length - start;
  if (s < 9 + 16 * 31) return 9 + 16 * 31 - s;
  const patOfs = readmem32b(data, start);
  if (patOfs < 502 || patOfs > 2163190) return -1;
  for (let i = 0; i < 31; i++) {
    const d = start + 16 * i;
    if (data[d + 9] > 64) return -1;
    if (readmem16b(data, d + 6) % 72 !== 0) return -1;
  }
  for (let i = 0; i < 31; i++) {
    const size = readmem16b(data, start + 10 + i * 16) << 1;
    const lsize = readmem16b(data, start + 12 + i * 16) << 1;
    const sdata = readmem32b(data, start + 14 + i * 16);
    if (size > 65535 || lsize > 65535) return -1;
    if (sdata < patOfs) return -1;
  }
  const len = data[start + 5];
  if (len === 0 || len > 127) return -1;
  if (s < patOfs + len * 4 + 4) return patOfs + len * 4 + 4 - s;
  if (readmem32b(data, start + patOfs + len * 4) !== 4294967295) return -1;
  pwReadTitle(null, 0);
  return 0;
}
var pwZen = {
  name: "Zen Packer",
  test: testZen,
  depack: depackZen
};

// ../../packages/fmt-prowizard/src/pw-ksm.ts
var PW_MOD_MAGIC9 = 1294879534;
function put813(out, b) {
  out.push(b & 255);
}
function put16b12(out, v) {
  out.push(v >> 8 & 255, v & 255);
}
function put32b13(out, v) {
  out.push(v >>> 24 & 255, v >> 16 & 255, v >> 8 & 255, v & 255);
}
function depackKsm(data, start) {
  let pos = start + 2;
  const out = [];
  for (let i = 0; i < 13; i++) out.push(data[pos++] ?? 0);
  writeZero(out, 7);
  pos = start + 32;
  let ssize = 0;
  for (let i = 0; i < 15; i++) {
    writeZero(out, 22);
    pos += 20;
    const k = data[pos] << 8 | data[pos + 1];
    pos += 2;
    put16b12(out, Math.trunc(k / 2));
    ssize += k;
    put813(out, 0);
    put813(out, data[pos++] ?? 0);
    pos += 1;
    const j = data[pos] << 8 | data[pos + 1];
    pos += 2;
    put16b12(out, Math.trunc(j / 2));
    const loopRest = k - j;
    put16b12(out, loopRest !== k ? Math.trunc(loopRest / 2) : 1);
    pos += 6;
  }
  {
    const pad = new Array(30).fill(0);
    pad[29] = 1;
    for (let i = 0; i < 16; i++) out.push(...pad);
  }
  pos = start + 512;
  const trknum = [];
  let maxTrknum = 0;
  let len = 0;
  for (; len < 128; len++) {
    const row = [data[pos] ?? 0, data[pos + 1] ?? 0, data[pos + 2] ?? 0, data[pos + 3] ?? 0];
    pos += 4;
    trknum.push(row);
    if (row[0] === 255) break;
    for (const v of row) {
      if (v > maxTrknum) maxTrknum = v;
    }
  }
  put813(out, len);
  put813(out, 127);
  const plist = new Array(128).fill(0);
  let c5 = 0;
  for (let i = 0; i < len; i++) {
    if (i === 0) {
      plist[0] = c5;
      c5++;
      continue;
    }
    let status = 1;
    for (let j = 0; j < i; j++) {
      status = 1;
      for (let k = 0; k < 4; k++) {
        if (trknum[j][k] !== trknum[i][k]) {
          status = 0;
          break;
        }
      }
      if (status === 1) {
        plist[i] = plist[j];
        break;
      }
    }
    if (status === 0) {
      plist[i] = c5;
      c5++;
    }
    status = 1;
  }
  const realTnum = [];
  let c1count = 0;
  for (let i = 0; i < len; i++) {
    if (i === 0) {
      realTnum.push([trknum[0][0], trknum[0][1], trknum[0][2], trknum[0][3]]);
      c1count++;
      continue;
    }
    let status = 1;
    for (let j = 0; j < i; j++) {
      status = 1;
      if (plist[i] === plist[j]) {
        status = 0;
        break;
      }
    }
    if (status === 0) continue;
    realTnum.push([trknum[i][0], trknum[i][1], trknum[i][2], trknum[i][3]]);
    c1count++;
    status = 1;
  }
  void c5;
  void c1count;
  for (let i = 0; i < 128; i++) put813(out, plist[i]);
  put32b13(out, PW_MOD_MAGIC9);
  for (let i = 0; i < c1count; i++) {
    const tmp = new Uint8Array(1024);
    const tdata = [];
    for (let k = 0; k < 4; k++) {
      pos = start + 1536 + 192 * (realTnum[i][k] ?? 0);
      const td = new Uint8Array(192);
      for (let t = 0; t < 192; t++) td[t] = data[pos++] ?? 0;
      tdata.push(td);
    }
    for (let j = 0; j < 64; j++) {
      const x = j * 16;
      for (let k = 0; k < 4; k++) {
        const t = tdata[k];
        const tBase = j * 3;
        if (!ptkIsValidNote(t[tBase] ?? 0)) throw new Error("ksm: invalid note");
        tmp[x + k * 4] = ptkTable[t[tBase] ?? 0][0];
        tmp[x + k * 4 + 1] = ptkTable[t[tBase] ?? 0][1];
        let t1 = t[tBase + 1];
        if ((t1 & 15) === 13) t1 -= 3;
        tmp[x + k * 4 + 2] = t1;
        tmp[x + k * 4 + 3] = t[tBase + 2];
      }
    }
    for (let k = 0; k < 1024; k++) out.push(tmp[k]);
  }
  moveData(data, start + 1536 + 192 * (maxTrknum + 1), out, ssize);
  return Uint8Array.from(out);
}
function testKsm(data, start) {
  const s = data.length - start;
  if (s < 1536) return 1536 - s;
  if (data[start] !== 77 || data[start + 1] !== 46) return -1;
  if (data[start + 15] !== 97) return -1;
  for (let i2 = 0; i2 < 15; i2++) {
    if (data[start + 54 + i2 * 32] > 64) return -1;
  }
  let maxTrk = 0;
  let i = 0;
  for (; i < 1024; i++) {
    const x = data[start + i + 512];
    if (x === 255) break;
    if (x > maxTrk) maxTrk = x;
  }
  if (i === 1024) return -1;
  if (maxTrk === 0) return -1;
  const need = 1536 + maxTrk * 192 + 64 * 3;
  if (s < need) return need - s;
  for (i = 0; i <= maxTrk; i++) {
    const d = start + 1536 + i * 192;
    for (let j = 0; j < 64; j++) {
      if (data[d + j * 3] > 36) return -1;
    }
  }
  pwReadTitle(data.subarray(start + 2), 13);
  return 0;
}
var pwKsm = {
  name: "Kefrens Sound Machine",
  test: testKsm,
  depack: depackKsm
};

// ../../packages/fmt-prowizard/src/pw-hrt.ts
var PW_MOD_MAGIC10 = 1294879534;
function put814(out, b) {
  out.push(b & 255);
}
function put32b14(out, v) {
  out.push(v >>> 24 & 255, v >> 16 & 255, v >> 8 & 255, v & 255);
}
function depackHrt(data, start) {
  let pos = start;
  const out = [];
  const buf = new Uint8Array(950);
  for (let i = 0; i < 950; i++) buf[i] = data[pos++] ?? 0;
  for (let i = 0; i < 31; i++) {
    const p = 38 + 30 * i;
    buf[p] = 0;
    buf[p + 1] = 0;
    buf[p + 2] = 0;
    buf[p + 3] = 0;
  }
  for (let i = 0; i < 950; i++) out.push(buf[i]);
  let ssize = 0;
  for (let i = 0; i < 31; i++) {
    ssize += (buf[42 + 30 * i] << 8 | buf[43 + 30 * i]) * 2;
  }
  const len = data[pos++] ?? 0;
  put814(out, len);
  put814(out, data[pos++] ?? 0);
  const plist = new Uint8Array(128);
  for (let i = 0; i < 128; i++) plist[i] = data[pos++] ?? 0;
  for (let i = 0; i < 128; i++) out.push(plist[i]);
  let npat = 0;
  for (let i = 0; i < 128; i++) {
    if (plist[i] > npat) npat = plist[i];
  }
  npat++;
  put32b14(out, PW_MOD_MAGIC10);
  pos = start + 1084;
  for (let i = 0; i < npat; i++) {
    for (let j = 0; j < 256; j++) {
      const b0 = data[pos++] ?? 0;
      const b1 = data[pos++] ?? 0;
      const b2 = data[pos++] ?? 0;
      const b3 = data[pos++] ?? 0;
      const b0h = Math.trunc(b0 / 2);
      let c1 = b0h & 240;
      let c2 = 0;
      if (b1 !== 0 && ptkIsValidNote(Math.trunc(b1 / 2))) {
        c1 |= ptkTable[Math.trunc(b1 / 2)][0];
        c2 = ptkTable[Math.trunc(b1 / 2)][1];
      }
      const c3 = b0h << 4 & 240 | b2;
      const c4 = b3;
      put814(out, c1);
      put814(out, c2);
      put814(out, c3);
      put814(out, c4);
    }
  }
  moveData(data, pos, out, ssize);
  return Uint8Array.from(out);
}
function testHrt(data, start) {
  const s = data.length - start;
  if (s < 1084) return 1084 - s;
  if ((data[start + 1080] << 24 | data[start + 1081] << 16 | data[start + 1082] << 8 | data[start + 1083]) !== 1213355041) {
    return -1;
  }
  for (let i = 0; i < 31; i++) {
    const d = start + 20 + i * 30;
    if (data[d + 24] > 15) return -1;
    if (data[d + 25] > 64) return -1;
  }
  pwReadTitle(data.subarray(start), 20);
  return 0;
}
var pwHrt = {
  name: "Hornet Packer",
  test: testHrt,
  depack: depackHrt
};

// ../../packages/fmt-prowizard/src/pw-mp.ts
var MAGIC_TRK1 = 1414679345;
var PW_MOD_MAGIC11 = 1294879534;
function put815(out, b) {
  out.push(b & 255);
}
function put16b13(out, v) {
  out.push(v >> 8 & 255, v & 255);
}
function put32b15(out, v) {
  out.push(v >>> 24 & 255, v >> 16 & 255, v >> 8 & 255, v & 255);
}
function depackMp(data, start) {
  let pos = start;
  const out = [];
  const u8 = () => data[pos++] ?? 0;
  const u16 = () => {
    const v = readmem16b(data, pos);
    pos += 2;
    return v;
  };
  const u32 = () => {
    const v = readmem32b(data, pos);
    pos += 4;
    return v;
  };
  writeZero(out, 20);
  if (u32() !== MAGIC_TRK1) pos -= 4;
  let ssize = 0;
  for (let i = 0; i < 31; i++) {
    writeZero(out, 22);
    const size = u16();
    ssize += size * 2;
    put16b13(out, size);
    put815(out, u8());
    put815(out, u8());
    put16b13(out, u16());
    put16b13(out, u16());
  }
  put815(out, u8());
  put815(out, u8());
  let max = 0;
  for (let i = 0; i < 128; i++) {
    const c1 = u8();
    put815(out, c1);
    if (c1 > max) max = c1;
  }
  max++;
  put32b15(out, PW_MOD_MAGIC11);
  if (u32() !== 0) pos -= 4;
  moveData(data, pos, out, 1024 * max);
  pos += 1024 * max;
  moveData(data, pos, out, ssize);
  return Uint8Array.from(out);
}
function testMpNoid(data, start) {
  const s = data.length - start;
  if (s < 378) return 378 - s;
  let hdrSsize = 0;
  for (let i = 0; i < 31; i++) {
    const d = start + i * 8;
    const size = readmem16b(data, d) << 1;
    const lstart = readmem16b(data, d + 4) << 1;
    const lsize = readmem16b(data, d + 6) << 1;
    hdrSsize += size;
    if (data[d + 2] > 15) return -1;
    if (lsize !== 2 && lstart + lsize > size) return -1;
    if (lsize > size + 2) return -1;
    if (lstart !== 0 && lsize <= 2) return -1;
    if (size !== 0 && lsize === 0) return -1;
  }
  if (hdrSsize <= 2) return -1;
  const len = data[start + 248];
  if (len === 0 || len > 127) return -1;
  let psize = 0;
  for (let i = 0; i < 128; i++) {
    const pat = data[start + 250 + i];
    if (pat > 127) return -1;
    if (pat > psize) psize = pat;
    if (i > len + 3 && pat !== 0) return -1;
  }
  psize++;
  psize <<= 8;
  if (s < 378 + psize * 4) return 378 + psize * 4 - s;
  for (let i = 0; i < 31; i++) {
    const d = start + i * 8;
    const val = readmem16b(data, d) & 4095;
    if (val > 0 && val < 113) return -1;
  }
  for (let i = 0; i < 31; i++) {
    const d = start + i * 8;
    const size = readmem16b(data, d) << 1;
    const lend = readmem16b(data, d + 4) + readmem16b(data, d + 6) << 1;
    if (lend > size + 2) return -1;
  }
  pwReadTitle(null, 0);
  return 0;
}
function testMpId(data, start) {
  const s = data.length - start;
  if (s < 382) return 382 - s;
  if (readmem32b(data, start) !== MAGIC_TRK1) return -1;
  for (let i = 0; i < 31; i++) {
    if (data[start + 6 + 8 * i] > 15) return -1;
  }
  const len = data[start + 252];
  if (len === 0 || len > 127) return -1;
  let psize = 0;
  for (let i = 0; i < 128; i++) {
    const pat = data[start + 254 + i];
    if (pat > 127) return -1;
    if (pat > psize) psize = pat;
  }
  psize++;
  psize <<= 8;
  if (s < 382 + psize * 4) return 382 + psize * 4 - s;
  for (let i = 0; i < psize; i++) {
    if (data[start + 382 + i * 4] > 19) return -1;
  }
  pwReadTitle(null, 0);
  return 0;
}
var pwMpId = {
  name: "Module Protector",
  test: testMpId,
  depack: depackMp
};
var pwMpNoid = {
  name: "Module Protector noID",
  test: testMpNoid,
  depack: depackMp
};

// ../../packages/fmt-prowizard/src/pw-di.ts
var PW_MOD_MAGIC12 = 1294879534;
function put816(out, b) {
  out.push(b & 255);
}
function put16b14(out, v) {
  out.push(v >> 8 & 255, v & 255);
}
function put32b16(out, v) {
  out.push(v >>> 24 & 255, v >> 16 & 255, v >> 8 & 255, v & 255);
}
function writeEvent(out, c1, c2, fxp) {
  const note = c1 << 4 & 48 | c2 >> 4 & 15;
  if (!ptkIsValidNote(note)) {
    out.push(0, 0, 0, 0);
    return;
  }
  const ins = c1 >> 2 & 31;
  const fxt = c2 & 15;
  out.push((ptkTable[note][0] | ins & 240) & 255);
  out.push(ptkTable[note][1]);
  out.push((ins << 4 & 240 | fxt) & 255);
  out.push(fxp & 255);
}
function depackDi(data, start) {
  let pos = start;
  const out = [];
  const u8 = () => data[pos++] ?? 0;
  const u16 = () => {
    const v = readmem16b(data, pos);
    pos += 2;
    return v;
  };
  const u32 = () => {
    const v = readmem32b(data, pos);
    pos += 4;
    return v;
  };
  writeZero(out, 20);
  const nins = u16();
  if (nins > 31) throw new Error("di: too many samples");
  const seqOfs = u32();
  u32();
  const smpOfs = u32();
  let ssize = 0;
  for (let i2 = 0; i2 < nins; i2++) {
    writeZero(out, 22);
    const size = u16();
    ssize += size * 2;
    put16b14(out, size);
    put816(out, u8());
    put816(out, u8());
    put16b14(out, u16());
    put16b14(out, u16());
  }
  {
    const pad = new Array(30).fill(0);
    for (let i2 = nins; i2 < 31; i2++) out.push(...pad);
  }
  const posAfterSamples = pos;
  pos = start + seqOfs;
  const ptable = new Array(128).fill(0);
  let i = 0;
  let c1 = 0;
  do {
    c1 = u8();
    ptable[i++] = c1;
  } while (c1 !== 255);
  ptable[i - 1] = 0;
  const npat = i - 1;
  put816(out, npat);
  put816(out, 127);
  let max = 0;
  for (i = 0; i < 128; i++) {
    put816(out, ptable[i]);
    if (ptable[i] > max) max = ptable[i];
  }
  if (max >= 128) throw new Error("di: pattern number too high");
  put32b16(out, PW_MOD_MAGIC12);
  pos = posAfterSamples;
  const paddr = [];
  for (i = 0; i <= max; i++) paddr.push(u16());
  for (i = 0; i <= max; i++) {
    pos = start + paddr[i];
    for (let k = 0; k < 256; k++) {
      const c1v = u8();
      if ((c1v & 128) === 0) {
        const c2v = u8();
        writeEvent(out, c1v, c2v, 0);
      } else if (c1v === 255) {
        out.push(0, 0, 0, 0);
      } else {
        const c2v = u8();
        const c3v = u8();
        writeEvent(out, c1v, c2v, c3v);
      }
    }
  }
  moveData(data, start + smpOfs, out, ssize);
  return Uint8Array.from(out);
}
function testDi(data, start) {
  const s = data.length - start;
  if (s < 14) return 14 - s;
  const numsmp = readmem16b(data, start);
  if (numsmp > 31) return -1;
  if (s < 14 + numsmp * 8) return 14 + numsmp * 8 - s;
  let ssize = 0;
  for (let i = 0; i < numsmp; i++) {
    const d = start + i * 8 + 14;
    const len = readmem16b(data, d) << 1;
    const lstart = readmem16b(data, d + 4) << 1;
    const lsize = readmem16b(data, d + 6) << 1;
    if (len > 65535 || lstart > 65535 || lsize > 65535) return -1;
    if (lstart + lsize > len) return -1;
    if (data[d + 2] > 15) return -1;
    if (data[d + 3] > 64) return -1;
    ssize += len;
  }
  if (ssize <= 2) return -1;
  const psize = numsmp * 8 + 2;
  const ptabOfs = readmem32b(data, start + 2);
  const patOfs = readmem32b(data, start + 6);
  const smpOfs = readmem32b(data, start + 10);
  if (ptabOfs < psize) return -1;
  if (patOfs <= ptabOfs || smpOfs <= ptabOfs || smpOfs <= patOfs) return -1;
  if (patOfs - ptabOfs > 128) return -1;
  if (s < patOfs) return patOfs - s;
  for (let i = ptabOfs; i < patOfs - 1; i++) {
    if (data[start + i] > 128) return -1;
  }
  if (data[start + patOfs - 1] !== 255) return -1;
  if (smpOfs > 65535) return -1;
  pwReadTitle(null, 0);
  return 0;
}
var pwDi = {
  name: "Digital Illusions",
  test: testDi,
  depack: depackDi
};

// ../../packages/fmt-prowizard/src/pw-ac1d.ts
var NO_NOTE = 255;
function put817(out, b) {
  out.push(b & 255);
}
function put16b15(out, v) {
  out.push(v >> 8 & 255, v & 255);
}
function put32b17(out, v) {
  out.push(v >>> 24 & 255, v >> 16 & 255, v >> 8 & 255, v & 255);
}
function depackAc1d(data, start) {
  let pos = start;
  const out = [];
  const u8 = () => data[pos++] ?? 0;
  const u16 = () => {
    const v = data[pos] << 8 | data[pos + 1];
    pos += 2;
    return v;
  };
  const u32 = () => {
    const v = readmem32b(data, pos);
    pos += 4;
    return v;
  };
  const npos = u8();
  const ntkByte = u8();
  u16();
  const saddr = u32();
  writeZero(out, 20);
  let ssize = 0;
  for (let i = 0; i < 31; i++) {
    writeZero(out, 22);
    const size = u16();
    ssize += size * 2;
    put16b15(out, size);
    put817(out, u8());
    put817(out, u8());
    put16b15(out, u16());
    put16b15(out, u16());
  }
  const paddr = [];
  let npat = 0;
  for (; npat < 128; npat++) {
    paddr.push(u32());
    if (paddr[npat] === 0) break;
  }
  if (npat === 0) throw new Error("ac1d: no patterns");
  npat--;
  put817(out, npos);
  put817(out, ntkByte);
  pos = start + 768;
  moveData(data, pos, out, 128);
  put32b17(out, 1294879534);
  for (let i = 0; i < npat; i++) {
    pos = start + paddr[i];
    u32();
    u32();
    u32();
    const tmp = new Uint8Array(1024);
    for (let k = 0; k < 4 && pos < data.length; k++) {
      for (let j = 0; j < 64; j++) {
        const x = j * 16 + k * 4;
        const c1 = u8();
        if ((c1 & 128) !== 0) {
          const c4 = c1 & 127;
          j += c4 - 1;
          continue;
        }
        const c2 = u8();
        const ins = (c1 & 192) >> 2 | c2 >> 4 & 15;
        let note = c1 & 63;
        if (note === 63) note = NO_NOTE;
        else if (note !== 0) note -= 11;
        if (note === 0) note++;
        tmp[x] = ins & 240;
        if (note !== NO_NOTE && ptkIsValidNote(note)) {
          tmp[x] = (tmp[x] | ptkTable[note][0]) & 255;
          tmp[x + 1] = ptkTable[note][1];
        }
        if ((c2 & 15) === 7) {
          tmp[x + 2] = ins << 4 & 240 & 255;
          continue;
        }
        const c3 = u8();
        const fxt = c2 & 15;
        const fxp = c3;
        tmp[x + 2] = (ins << 4 & 240 | fxt) & 255;
        tmp[x + 3] = fxp;
      }
    }
    for (let t = 0; t < 1024; t++) out.push(tmp[t]);
  }
  moveData(data, start + saddr, out, ssize);
  return Uint8Array.from(out);
}
function testAc1d(data, start) {
  const s = data.length - start;
  if (s < 896) return 896 - s;
  if (data[start + 2] !== 172 || data[start + 3] !== 29) return -1;
  if (data[start] > 127) return -1;
  for (let i = 0; i < 31; i++) {
    if (data[start + 10 + 8 * i] > 15) return -1;
  }
  for (let i = 0; i < 128; i++) {
    if (data[start + 768 + i] > 127) return -1;
  }
  pwReadTitle(null, 0);
  return 0;
}
var pwAc1d = {
  name: "AC1D Packer",
  test: testAc1d,
  depack: depackAc1d
};

// ../../packages/fmt-prowizard/src/pw-eureka.ts
var PW_MOD_MAGIC13 = 1294879534;
function put32b18(out, v) {
  out.push(v >>> 24 & 255, v >> 16 & 255, v >> 8 & 255, v & 255);
}
function depackEu(data, start) {
  let pos = start;
  const out = [];
  for (let i = 0; i < 1080; i++) out.push(data[pos++] ?? 0);
  let ssize = 0;
  for (let i = 0; i < 31; i++) {
    ssize += 2 * (data[start + i * 30 + 42] << 8 | data[start + i * 30 + 43]);
  }
  let npat = 0;
  for (let i = 0; i < 128; i++) {
    if (data[start + 952 + i] > npat) npat = data[start + 952 + i];
  }
  npat++;
  put32b18(out, PW_MOD_MAGIC13);
  const smpAddr = readmem32b(data, pos);
  pos += 4;
  const trkAddr = [];
  for (let i = 0; i < npat; i++) {
    const row = [];
    for (let j = 0; j < 4; j++) {
      row.push(data[pos] << 8 | data[pos + 1]);
      pos += 2;
    }
    trkAddr.push(row);
  }
  for (let i = 0; i < npat; i++) {
    const tmp = new Uint8Array(1024);
    for (let j = 0; j < 4; j++) {
      pos = start + trkAddr[i][j];
      for (let k = 0; k < 64; k++) {
        const x = k * 16 + j * 4;
        const c1 = data[pos++] ?? 0;
        if ((c1 & 192) === 0) {
          tmp[x] = c1;
          tmp[x + 1] = data[pos++] ?? 0;
          tmp[x + 2] = data[pos++] ?? 0;
          tmp[x + 3] = data[pos++] ?? 0;
          continue;
        }
        if ((c1 & 192) === 192) {
          k += c1 & 63;
          continue;
        }
        if ((c1 & 192) === 64) {
          tmp[x + 2] = c1 & 15;
          tmp[x + 3] = data[pos++] ?? 0;
          continue;
        }
        if ((c1 & 192) === 128) {
          tmp[x] = data[pos++] ?? 0;
          tmp[x + 1] = data[pos++] ?? 0;
          tmp[x + 2] = c1 << 4 & 240;
          continue;
        }
      }
    }
    for (let k = 0; k < 1024; k++) out.push(tmp[k]);
  }
  moveData(data, start + smpAddr, out, ssize);
  return Uint8Array.from(out);
}
function testEu(data, start) {
  const s = data.length - start;
  if (s < 1084) return 1084 - s;
  const len = data[start + 950];
  if (len === 0 || len > 127) return -1;
  for (let i2 = 0; i2 < 31; i2++) {
    const d = start + i2 * 30;
    const size = readmem16b(data, d + 42) << 1;
    const lstart = readmem16b(data, d + 46) << 1;
    const lsize = readmem16b(data, d + 48) << 1;
    if (size > 65535 || lstart > 65535 || lsize > 65535) return -1;
    if (lstart + lsize > size + 2) return -1;
    if (data[d + 44] > 15 || data[d + 45] > 64) return -1;
  }
  const smpOfs = readmem32b(data, start + 1080);
  if (smpOfs < 1084) return -1;
  let maxPat = 0;
  let i = 0;
  for (; i < len; i++) {
    const pat = data[start + 952 + i];
    if (pat > 127) return -1;
    if (pat > maxPat) maxPat = pat;
  }
  for (; i < 128; i++) {
    if (data[start + 952 + i] !== 0) return -1;
  }
  maxPat++;
  let maxTrk = 0;
  let minTrk = 999999;
  if (s < maxPat * 4 * 2 + 1085) return maxPat * 4 * 2 + 1085 - s;
  for (i = 0; i < maxPat * 4; i++) {
    const trk = readmem16b(data, start + i * 2 + 1084);
    if (trk > smpOfs || trk < 1084) return -1;
    if (trk > maxTrk) maxTrk = trk;
    if (trk < minTrk) minTrk = trk;
  }
  if (s < maxTrk) return maxTrk - s;
  for (i = minTrk; i < maxTrk; i++) {
    const c = data[start + i];
    if ((c & 192) === 192) continue;
    if ((c & 192) === 128) {
      i += 2;
      continue;
    }
    if ((c & 192) === 64) {
      if ((c & 63) === 0 && data[start + i + 1] === 0) return -1;
      i++;
      continue;
    }
    if ((c & 192) === 0) {
      if (c > 19) return -1;
      i += 3;
      continue;
    }
  }
  return 0;
}
var pwEu = {
  name: "Eureka Packer",
  test: testEu,
  depack: depackEu
};

// ../../packages/fmt-prowizard/src/pw-fcm.ts
var PW_MOD_MAGIC14 = 1294879534;
function put818(out, b) {
  out.push(b & 255);
}
function put16b16(out, v) {
  out.push(v >> 8 & 255, v & 255);
}
function put32b19(out, v) {
  out.push(v >>> 24 & 255, v >> 16 & 255, v >> 8 & 255, v & 255);
}
function depackFcm(data, start) {
  let pos = start;
  const out = [];
  const u8 = () => data[pos++] ?? 0;
  const u16 = () => {
    const v = data[pos] << 8 | data[pos + 1];
    pos += 2;
    return v;
  };
  const u32 = () => {
    const v = read32(data, pos);
    pos += 4;
    return v;
  };
  const read32 = (d, o) => (d[o] << 24 | d[o + 1] << 16 | d[o + 2] << 8 | d[o + 3]) >>> 0;
  u32();
  u16();
  u32();
  for (let i2 = 0; i2 < 20; i2++) out.push(data[pos++] ?? 0);
  u32();
  let ssize = 0;
  for (let i2 = 0; i2 < 31; i2++) {
    for (let k = 0; k < 22; k++) out.push(0);
    const size = u16();
    put16b16(out, size);
    ssize += size * 2;
    put818(out, u8());
    put818(out, u8());
    put16b16(out, u16());
    let loopSize = u16();
    if (loopSize === 0) loopSize = 1;
    put16b16(out, loopSize);
  }
  u32();
  const patPos = u8();
  put818(out, patPos);
  put818(out, u8());
  u32();
  let patMax = 0;
  let i = 0;
  for (; i < patPos; i++) {
    const c1 = u8();
    put818(out, c1);
    if (c1 > patMax) patMax = c1;
  }
  for (; i < 128; i++) put818(out, 0);
  put32b19(out, PW_MOD_MAGIC14);
  u32();
  for (i = 0; i <= patMax; i++) {
    for (let k = 0; k < 1024; k++) out.push(data[pos++] ?? 0);
  }
  u32();
  for (let k = 0; k < ssize && pos < data.length; k++) out.push(data[pos++] ?? 0);
  return Uint8Array.from(out);
}
function testFcm(data, start) {
  const s = data.length - start;
  if (s < 37 + 8 * 31) return 37 + 8 * 31 - s;
  if (data[start] !== 70 || data[start + 1] !== 67 || data[start + 2] !== 45 || data[start + 3] !== 77) {
    return -1;
  }
  if (data[start + 4] !== 1) return -1;
  if (data[start + 5] !== 0) return -1;
  for (let j = 0; j < 31; j++) {
    if (data[start + 37 + 8 * j] > 64) return -1;
  }
  pwReadTitle(data.subarray(start + 10), 20);
  return 0;
}
var pwFcm = {
  name: "FC-M Packer",
  test: testFcm,
  depack: depackFcm
};

// ../../packages/fmt-prowizard/src/pw-fuchs.ts
var PW_MOD_MAGIC15 = 1294879534;
function put32b20(out, v) {
  out.push(v >>> 24 & 255, v >> 16 & 255, v >> 8 & 255, v & 255);
}
function depackFuchs(data, start) {
  let pos = start;
  const out = [];
  const u16 = () => {
    const v = readmem16b(data, pos);
    pos += 2;
    return v;
  };
  const u32 = () => {
    const v = readmem32b(data, pos);
    pos += 4;
    return v;
  };
  const hdr = new Uint8Array(1080);
  for (let i = 0; i < 10; i++) hdr[i] = data[pos++] ?? 0;
  u32();
  const smpLen = [];
  for (let i = 0; i < 16; i++) {
    const l = u16();
    smpLen.push(l);
    hdr[42 + i * 30] = l >> 9 & 255;
    hdr[43 + i * 30] = l >> 1 & 255;
  }
  for (let i = 0; i < 16; i++) {
    hdr[45 + i * 30] = u16() & 255;
  }
  const loopStart = [];
  for (let i = 0; i < 16; i++) {
    const l = u16();
    loopStart.push(l);
    hdr[46 + i * 30] = l >> 1 & 255;
  }
  for (let i = 0; i < 16; i++) {
    const loopSize = smpLen[i] - loopStart[i];
    if (loopSize === 0 || loopStart[i] === 0) {
      hdr[49 + i * 30] = 1;
    } else {
      hdr[48 + i * 30] = loopSize >> 9 & 255;
      hdr[49 + i * 30] = loopSize >> 1 & 255;
    }
  }
  for (let i = 16; i < 31; i++) {
    hdr[49 + i * 30] = 1;
  }
  hdr[950] = u16() & 255;
  hdr[951] = 127;
  let maxPat = 0;
  for (let i = 0; i < 40; i++) {
    const pat = u16();
    hdr[952 + i] = pat & 255;
    if (pat > maxPat) maxPat = pat;
  }
  for (let i = 0; i < 1080; i++) out.push(hdr[i]);
  put32b20(out, PW_MOD_MAGIC15);
  u32();
  const patSize = u32();
  if (patSize === 0 || patSize > 131072 || (patSize & 3) !== 0) {
    throw new Error("fuchs: bad pattern size");
  }
  const tmp = new Uint8Array(patSize);
  for (let i = 0; i < patSize; i++) tmp[i] = data[pos++] ?? 0;
  for (let i = 0; i < patSize; i += 4) {
    if ((tmp[i + 2] & 15) === 12) {
      const x = tmp[i + 3];
      tmp[i + 3] = 10 * (x >> 4) + (x & 15);
    }
  }
  for (let i = 0; i < patSize; i++) out.push(tmp[i]);
  pos += 4;
  for (let i = 0; i < 16; i++) {
    if (smpLen[i] !== 0) {
      for (let k = 0; k < smpLen[i] && pos < data.length; k++) out.push(data[pos++] ?? 0);
    }
  }
  return Uint8Array.from(out);
}
function testFuchs(data, start) {
  const s = data.length - start;
  if (s < 196) return 196 - s;
  if (readmem32b(data, start + 192) !== 1397706311) return -1;
  const hdrSsize = readmem32b(data, start + 10);
  if (hdrSsize <= 2 || hdrSsize >= 65535 * 16) return -1;
  let ssize = 0;
  for (let i = 0; i < 16; i++) {
    const d = start + i * 2;
    const len = readmem16b(data, d + 14);
    const lstart = readmem16b(data, d + 78);
    if (data[d + 46] > 64) return -1;
    if (len < lstart) return -1;
    ssize += len;
  }
  if (ssize <= 2 || ssize > hdrSsize) return -1;
  for (let i = 0; i < 40; i++) {
    if (data[start + i * 2 + 113] > 40) return -1;
  }
  pwReadTitle(null, 0);
  return 0;
}
var pwFchs = {
  name: "Fuchs Tracker",
  test: testFuchs,
  depack: depackFuchs
};

// ../../packages/fmt-prowizard/src/pw-skyt.ts
var PW_MOD_MAGIC16 = 1294879534;
function put819(out, b) {
  out.push(b & 255);
}
function put16b17(out, v) {
  out.push(v >> 8 & 255, v & 255);
}
function put32b21(out, v) {
  out.push(v >>> 24 & 255, v >> 16 & 255, v >> 8 & 255, v & 255);
}
function depackSkyt(data, start) {
  let pos = start;
  const out = [];
  const u8 = () => data[pos++] ?? 0;
  const u16 = () => {
    const v = data[pos] << 8 | data[pos + 1];
    pos += 2;
    return v;
  };
  const u32 = () => {
    const v = (data[pos] << 24 | data[pos + 1] << 16 | data[pos + 2] << 8 | data[pos + 3]) >>> 0;
    pos += 4;
    return v;
  };
  writeZero(out, 20);
  let ssize = 0;
  for (let i = 0; i < 31; i++) {
    for (let k = 0; k < 22; k++) out.push(0);
    const size = u16();
    put16b17(out, size);
    ssize += size * 2;
    put819(out, u8());
    put819(out, u8());
    put16b17(out, u16());
    put16b17(out, u16());
  }
  u32();
  u32();
  u32();
  const patPos = u8() + 1;
  if (patPos >= 128) throw new Error("skyt: too many patterns");
  put819(out, patPos);
  put819(out, 127);
  const trkval = [];
  let maxTrk = 0;
  for (let i = 0; i < patPos; i++) {
    const row = [];
    for (let j = 0; j < 4; j++) {
      const v = u16();
      row.push(v);
      if (v > maxTrk) maxTrk = v;
    }
    trkval.push(row);
  }
  for (let i = 0; i < 128; i++) put819(out, i < patPos ? i : 0);
  put32b21(out, PW_MOD_MAGIC16);
  u8();
  const trkAddr = pos;
  for (let i = 0; i < patPos; i++) {
    const pat = new Uint8Array(1024);
    for (let j = 0; j < 4; j++) {
      const tv = trkval[i][j];
      if (tv === void 0 || tv === 0) continue;
      pos = trkAddr + (tv - 1 << 8);
      for (let k = 0; k < 64; k++) {
        const x = k * 16 + j * 4;
        const c1 = u8();
        const c2 = u8();
        const c3 = u8();
        const c4 = u8();
        if (!ptkIsValidNote(c1)) throw new Error("skyt: invalid note");
        pat[x] = c2 & 240 | ptkTable[c1][0];
        pat[x + 1] = ptkTable[c1][1];
        pat[x + 2] = c2 << 4 & 240 | c3;
        pat[x + 3] = c4;
      }
    }
    for (let k = 0; k < 1024; k++) out.push(pat[k]);
  }
  pos = trkAddr + (maxTrk << 8);
  for (let k = 0; k < ssize && pos < data.length; k++) out.push(data[pos++] ?? 0);
  return Uint8Array.from(out);
}
function testSkyt(data, start) {
  const s = data.length - start;
  if (s < 8 * 31 + 12) return 8 * 31 + 12 - s;
  for (let i = 0; i < 31; i++) {
    if (data[start + 8 * i + 4] > 64) return -1;
  }
  if ((data[start + 256] << 24 | data[start + 257] << 16 | data[start + 258] << 8 | data[start + 259]) !== 1397446996) {
    return -1;
  }
  pwReadTitle(null, 0);
  return 0;
}
var pwSkyt = {
  name: "SKYT Packer",
  test: testSkyt,
  depack: depackSkyt
};

// ../../packages/fmt-prowizard/src/pw-starpack.ts
function put820(out, v) {
  out.push(v & 255);
}
function put16b18(out, v) {
  out.push(v >> 8 & 255, v & 255);
}
function put32b22(out, v) {
  out.push(v >>> 24 & 255, v >> 16 & 255, v >> 8 & 255, v & 255);
}
function depackStarpack(data, start) {
  let pos = start;
  const out = [];
  const u8 = () => data[pos++] ?? 0;
  const u16 = () => {
    const v = readmem16b(data, pos);
    pos += 2;
    return v;
  };
  const u32 = () => {
    const v = readmem32b(data, pos);
    pos += 4;
    return v;
  };
  const pnum = new Uint8Array(128);
  const pnumTmp = new Uint8Array(128);
  const paddr = new Int32Array(128);
  const paddrTmp = new Int32Array(128);
  const paddrTmp2 = new Int32Array(128);
  let ssize = 0;
  let numPat = 0;
  moveDataInto(out, data, pos, 20);
  pos += 20;
  for (let i = 0; i < 31; i++) {
    for (let k = 0; k < 22; k++) out.push(0);
    const size = u16();
    put16b18(out, size);
    ssize += 2 * size;
    put820(out, u8());
    put820(out, u8());
    put16b18(out, u16());
    put16b18(out, u16());
  }
  const patPos = u16() >> 2 & 255;
  if (patPos >= 128) throw new Error("starpack: too many positions");
  pos += 2;
  for (let i = 0; i < 128; i++) paddr[i] = u32();
  let tmpPtr = 0;
  for (let i = 0; i < patPos; i++) {
    if (i === 0) {
      pnum[0] = 0;
      tmpPtr++;
      continue;
    }
    let j = 0;
    for (; j < i; j++) {
      if (paddr[i] === paddr[j]) {
        pnum[i] = pnum[j];
        break;
      }
    }
    if (j === i) pnum[i] = tmpPtr++;
  }
  for (let i = 0; i < 128; i++) paddrTmp[i] = paddr[i];
  {
    let done = false;
    while (!done) {
      done = true;
      for (let i = 0; i < patPos; i++) {
        for (let j = 0; j < i; j++) {
          if (paddrTmp[i] < paddrTmp[j]) {
            const n = pnum[j];
            pnum[j] = pnum[i];
            pnum[i] = n;
            const v = paddrTmp[j];
            paddrTmp[j] = paddrTmp[i];
            paddrTmp[i] = v;
            done = false;
          }
        }
      }
    }
  }
  let j2 = 0;
  for (let i = 0; i < 128; i++) {
    if (i === 0) {
      paddrTmp2[j2] = paddrTmp[i];
      continue;
    }
    if (paddrTmp[i] === paddrTmp2[j2]) continue;
    j2++;
    paddrTmp2[j2] = paddrTmp[i];
  }
  const spacesLeft0 = 128 - patPos;
  let spacesLeft = spacesLeft0;
  let j3 = 0;
  for (let i = 0; i < patPos - 1; i++) {
    paddrTmp[j3] = paddrTmp2[i];
    j3++;
    if (paddrTmp2[i + 1] - paddrTmp2[i] > 1024 && spacesLeft > 0) {
      paddrTmp[j3] = paddrTmp2[i] + 1024;
      spacesLeft--;
      j3++;
    }
  }
  void j3;
  for (let i = 0; i < 128; i++) {
    for (let k = 0; k < 128; k++) {
      if (paddr[i] === paddrTmp[k]) {
        pnumTmp[i] = k;
        break;
      }
    }
  }
  pnum.fill(0);
  for (let i = 0; i < patPos; i++) pnum[i] = pnumTmp[i];
  put820(out, patPos);
  for (let i = 0; i < patPos; i++) {
    if (pnum[i] > numPat) numPat = pnum[i];
  }
  put820(out, 127);
  for (let i = 0; i < 128; i++) put820(out, pnum[i]);
  put32b22(
    out,
    1294879534
    /* M.K. */
  );
  pos = start + 784;
  const smpAddr = readmem32b(data, pos) + 788;
  pos = start + 788;
  numPat += 1;
  for (let i = 0; i < numPat; i++) {
    const buffer = new Uint8Array(1024);
    for (let j = 0; j < 64; j++) {
      for (let k = 0; k < 4; k++) {
        const ofs = j * 16 + k * 4;
        const c1 = u8();
        if (c1 === 128) continue;
        const c2 = u8();
        const c3 = u8();
        const c4 = u8();
        buffer[ofs] = c1 & 15;
        buffer[ofs + 1] = c2;
        buffer[ofs + 2] = c3 & 15;
        buffer[ofs + 3] = c4;
        const c5 = (c1 & 240 | c3 >> 4 & 15) >> 2;
        buffer[ofs] = (buffer[ofs] | c5 & 240) & 255;
        buffer[ofs + 2] = (buffer[ofs + 2] | c5 << 4 & 240) & 255;
      }
    }
    for (let k = 0; k < 1024; k++) out.push(buffer[k]);
  }
  pos = smpAddr;
  for (let k = 0; k < ssize && pos < data.length; k++) out.push(data[pos++] ?? 0);
  return Uint8Array.from(out);
}
function moveDataInto(out, src, from, len) {
  for (let i = 0; i < len && from + i < src.length; i++) out.push(src[from + i]);
}
function testStarpack(data, start) {
  const s = data.length - start;
  const rd16 = (o) => readmem16b(data, start + o);
  const rd32 = (o) => readmem32b(data, start + o);
  if (s < 788) return 788 - s;
  const plistSize = rd16(268);
  if ((plistSize & 3) !== 0) return -1;
  const len = plistSize >> 2;
  if (len === 0 || len > 127) return -1;
  if (data[start + 784] !== 0) return -1;
  for (let i = 0; i < 31; i++) {
    const d = start + i * 8;
    const size = readmem16b(data, d + 20) << 1;
    const lend = readmem16b(data, d + 24) + readmem16b(data, d + 26) << 1;
    if (lend > size + 2) return -1;
  }
  for (let i = 0; i < 31; i++) {
    const d = start + i * 8;
    if (data[d + 22] > 15 || data[d + 23] > 64) return -1;
  }
  const sdataOfs = rd32(784);
  if (sdataOfs < 788) return -1;
  for (let i = 0; i < len; i++) {
    if (rd32(i * 4 + 272) > sdataOfs) return -1;
  }
  for (let i = len; i < 128; i++) {
    if (rd32(i * 4 + 272) !== 0) return -1;
  }
  if (s < sdataOfs + 8) return sdataOfs + 8 - s;
  let pdataOfs = 788;
  while (pdataOfs < sdataOfs + 4) {
    const d = start + pdataOfs;
    const d0 = data[d];
    if (d0 === 128) {
      pdataOfs++;
      continue;
    }
    if (d0 > 128) return -1;
    if (rd32(pdataOfs) === 0) return -1;
    if (data[d + 2] * 15 === 12 && data[d + 3] > 64) return -1;
    if (data[d + 2] * 15 === 13 && data[d + 3] > 64) return -1;
    pdataOfs += 4;
  }
  pwReadTitle(data.subarray(start, start + 20), 0);
  return 0;
}
var pwStarpack = {
  name: "Startrekker Packer",
  test: testStarpack,
  depack: depackStarpack
};

// ../../packages/fmt-prowizard/src/prowiz.ts
function readmem16b(d, off) {
  return d[off] << 8 | d[off + 1];
}
function readmem32b(d, off) {
  return (d[off] << 24 | d[off + 1] << 16 | d[off + 2] << 8 | d[off + 3]) >>> 0;
}
var pwFormats = [
  // With signature (prowiz.c:33-50) — order verbatim
  pwAc1d,
  pwFchs,
  pwFcm,
  pwHrt,
  pwKsm,
  pwMpId,
  // pwP18a — pending
  // pwP10c — pending
  // pwPru1 — pending
  // pwPru2 — pending
  // pwPha — pending
  pwWn,
  pwUnicId,
  pwTp3,
  pwTp2,
  pwTp1,
  pwSkyt,
  // No signature (prowiz.c:52-84) — order verbatim
  pwXann,
  pwDi,
  pwEu,
  pwP4x,
  pwPp21,
  pwPp30,
  pwPp10,
  pwP50a,
  pwP60a,
  // pwP61a — pending
  pwMpNoid,
  // must be checked before Heatseeker, after ProPacker 1.0 (:66)
  // pwNru — pending
  pwNp2,
  pwNp1,
  pwNp3,
  pwZen,
  pwUnicEmptyId,
  pwUnicNoid,
  pwUnic2,
  // pwCrb — pending
  // pwTdd — pending
  pwStarpack
  // pwGmc — pending
  // pwTitanics — pending
];
function moveData(src, srcOff, out, len) {
  for (let i = 0; i < len && srcOff + i < src.length; i++) {
    out.push(src[srcOff + i]);
  }
}
function writeZero(out, len) {
  for (let i = 0; i < len; i++) out.push(0);
}
function pwReadTitle(b, s) {
  if (b === null) return "";
  if (s > 20) s = 20;
  let t = "";
  for (let i = 0; i < s; i++) t += String.fromCharCode(b[i]);
  return t;
}
function pwCheck(data, start) {
  for (let i = 0; i < pwFormats.length; i++) {
    const res = pwFormats[i].test(data, start);
    if (res === 0) return pwFormats[i];
  }
  return null;
}
function pwWizardry(data, start, outName) {
  const format = pwCheck(data, start);
  if (format === null) throw new ParseError2("prowizard: no format matched");
  const out = format.depack(data, start);
  outName.name = format.name;
  return out;
}

// ../../packages/fmt-prowizard/src/pw-plugin.ts
import { loadDepackedMod, readEvent } from "@modplayjs/fmt-mod";
function pwTest(bytes) {
  return pwCheck(bytes, 0) !== null;
}
function pwLoad(bytes, ctx) {
  const nameBox = {};
  const depacked = pwWizardry(bytes, 0, nameBox);
  const name = nameBox.name ?? "prowizard";
  return loadDepackedMod(depacked, ctx, name);
}
var pwPlugin = {
  name: "prowizard",
  test: pwTest,
  load: pwLoad,
  readEvent(core, chn, row) {
    readEvent(core, chn, row);
  }
};
export {
  pwCheck,
  pwFormats,
  pwLoad,
  pwPlugin,
  pwReadTitle,
  pwTest,
  pwWizardry
};

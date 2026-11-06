// ../../packages/fmt-mod/src/mod.ts
import {
  C4_NTSC_RATE,
  C4_PAL_RATE,
  FLOW_MODE_DTM_2015,
  FLOW_MODE_OCTALYSER,
  PeriodType,
  Quirk,
  QUIRKS_ST3,
  ReadEventType
} from "@modplayjs/core";
import {
  EMPTY_EVENT
} from "@modplayjs/core";
import { SampleFlags, adpcm4Decode } from "@modplayjs/core";
import { LSN, MSN, PERIOD_BASE } from "@modplayjs/core";
import { ParseError } from "@modplayjs/core";

// ../../packages/fmt-mod/src/tracker.ts
var TrackerId = {
  PROTRACKER: 0,
  NOISETRACKER: 1,
  SOUNDTRACKER: 2,
  FASTTRACKER: 3,
  FASTTRACKER2: 4,
  OCTALYSER: 5,
  TAKETRACKER: 6,
  DIGITALTRACKER: 7,
  FLEXTRAX: 8,
  MODSGRAVE: 9,
  SCREAMTRACKER3: 10,
  OPENMPT: 11,
  SOFTWAREVISIONS: 12,
  UNKNOWN_CONV: 95,
  CONVERTEDST: 96,
  CONVERTED: 97,
  CLONE: 98,
  UNKNOWN: 99,
  PROBABLY_NOISETRACKER: 20
};
var MOD_MAGIC = [
  { magic: "M.K.", flag: 0, id: TrackerId.PROTRACKER, ch: 4 },
  { magic: "M!K!", flag: 1, id: TrackerId.PROTRACKER, ch: 4 },
  { magic: "M&K!", flag: 1, id: TrackerId.NOISETRACKER, ch: 4 },
  { magic: "N.T.", flag: 1, id: TrackerId.NOISETRACKER, ch: 4 },
  { magic: "6CHN", flag: 0, id: TrackerId.FASTTRACKER, ch: 6 },
  { magic: "8CHN", flag: 0, id: TrackerId.FASTTRACKER, ch: 8 },
  { magic: "CD61", flag: 1, id: TrackerId.OCTALYSER, ch: 6 },
  /* Atari STe/Falcon */
  { magic: "CD81", flag: 1, id: TrackerId.OCTALYSER, ch: 8 },
  /* Atari STe/Falcon */
  { magic: "TDZ1", flag: 1, id: TrackerId.TAKETRACKER, ch: 1 },
  /* TakeTracker 1ch */
  { magic: "TDZ2", flag: 1, id: TrackerId.TAKETRACKER, ch: 2 },
  /* TakeTracker 2ch */
  { magic: "TDZ3", flag: 1, id: TrackerId.TAKETRACKER, ch: 3 },
  /* TakeTracker 3ch */
  { magic: "TDZ4", flag: 1, id: TrackerId.TAKETRACKER, ch: 4 },
  /* see XModule SaveTracker.c */
  { magic: "FA04", flag: 1, id: TrackerId.DIGITALTRACKER, ch: 4 },
  /* Atari Falcon */
  { magic: "FA06", flag: 1, id: TrackerId.DIGITALTRACKER, ch: 6 },
  /* Atari Falcon */
  { magic: "FA08", flag: 1, id: TrackerId.DIGITALTRACKER, ch: 8 },
  /* Atari Falcon */
  { magic: ".M.K", flag: 1, id: TrackerId.SOFTWAREVISIONS, ch: 4 },
  /* Software Visions DMF */
  { magic: "LARD", flag: 1, id: TrackerId.UNKNOWN, ch: 4 },
  /* in judgement_day_gvine.mod */
  { magic: "NSMS", flag: 1, id: TrackerId.UNKNOWN, ch: 4 }
  /* in Kingdom.mod */
];
function trackerIsVblank(id) {
  switch (id) {
    case TrackerId.NOISETRACKER:
    case TrackerId.SOUNDTRACKER:
      return 1;
    default:
      return 0;
  }
}
function flipWordBytes(buf, bytes) {
  for (let i = 0; i + 1 < bytes; i += 2) {
    const t = buf[i];
    buf[i] = buf[i + 1];
    buf[i + 1] = t;
  }
}
function validatePattern(buf) {
  for (let i = 0; i < 64; i++) {
    for (let j = 0; j < 4; j++) {
      const d = (i * 4 + j) * 4;
      if (buf[d] >> 4 > 1) {
        return -1;
      }
    }
  }
  return 0;
}
function isStIns(s) {
  if (s.length < 6) return false;
  const c0 = s.charCodeAt(0), c1 = s.charCodeAt(1), c2 = s.charCodeAt(2), c3 = s.charCodeAt(3), c4 = s.charCodeAt(4), c5 = s.charCodeAt(5);
  if (c0 !== 115 && c0 !== 83) return false;
  if (c1 !== 116 && c1 !== 84) return false;
  if (c2 !== 45 || c5 !== 58) return false;
  if (c3 < 48 || c3 > 57 || c4 < 48 || c4 > 57) return false;
  return true;
}
function getTrackerId(m, mh, modPat, modChn, idIn) {
  let id = idIn;
  let has_loop_0 = 0;
  let has_vol_in_empty_ins = 0;
  for (let i = 0; i < 31; i++) {
    if (mh.ins[i].loop_size === 0) {
      has_loop_0 = 1;
      break;
    }
  }
  for (let i = 0; i < 31; i++) {
    if (mh.ins[i].size === 0 && mh.ins[i].volume > 0) {
      has_vol_in_empty_ins = 1;
      break;
    }
  }
  if (mh.restart === modPat) {
    if (modChn === 4) {
      id = TrackerId.SOUNDTRACKER;
    } else {
      id = TrackerId.UNKNOWN;
    }
  } else if (mh.restart === 120) {
    if (modChn === 4) {
      id = TrackerId.PROBABLY_NOISETRACKER;
    } else {
      id = TrackerId.UNKNOWN;
    }
    return id;
  } else if (mh.restart < 127) {
    if (modChn === 4 && !has_vol_in_empty_ins) {
      id = TrackerId.NOISETRACKER;
    } else {
      id = TrackerId.UNKNOWN;
    }
    m.rst = mh.restart;
  } else if (mh.restart === 127) {
    if (modChn === 4) {
      if (has_loop_0) {
        id = TrackerId.CLONE;
      }
    } else {
      id = TrackerId.SCREAMTRACKER3;
    }
    return id;
  } else if (mh.restart > 127) {
    id = TrackerId.UNKNOWN;
    return id;
  }
  if (!has_loop_0) {
    for (let i2 = 0; i2 < 31; i2++) {
      if (mh.ins[i2].size === 1 && mh.ins[i2].volume === 0) {
        return TrackerId.CONVERTED;
      }
    }
    let i = 0;
    for (; i < 31; i++) {
      if (isStIns(mh.ins[i].name)) break;
    }
    if (i === 31) {
      for (i = 0; i < 31; i++) {
        if (mh.ins[i].size !== 0 || mh.ins[i].loop_size !== 1) {
          continue;
        }
        switch (modChn) {
          case 4:
            if (has_vol_in_empty_ins) {
              id = TrackerId.OPENMPT;
            } else {
              id = TrackerId.NOISETRACKER;
            }
            break;
          case 6:
          case 8:
            id = TrackerId.OCTALYSER;
            break;
          default:
            id = TrackerId.UNKNOWN;
        }
        return id;
      }
      if (modChn === 4) {
        id = TrackerId.PROTRACKER;
      } else if (modChn === 6 || modChn === 8) {
        id = TrackerId.FASTTRACKER;
      } else {
        id = TrackerId.UNKNOWN;
      }
    }
  } else {
    let i = 15;
    for (; i < 31; i++) {
      if (mh.ins[i].name.charCodeAt(0) !== 0 || mh.ins[i].size > 0) break;
    }
    if (i === 31 && isStIns(mh.ins[14].name)) {
      return TrackerId.CONVERTEDST;
    }
    for (i = 0; i < 31; i++) {
      if (isStIns(mh.ins[i].name)) break;
    }
    if (i < 31) {
      return TrackerId.UNKNOWN_CONV;
    }
    if (modChn === 4 || modChn === 6 || modChn === 8) {
      return TrackerId.FASTTRACKER;
    }
    id = TrackerId.UNKNOWN;
  }
  return id;
}

// ../../packages/fmt-mod/src/mod.ts
var SF_FULLREP = 512;
var SF_ADPCM = 16384;
var XMP_MAX_CHANNELS = 64;
function periodToNote(p) {
  if (p <= 0) return 0;
  return Math.round(12 * Math.log(PERIOD_BASE / p) / Math.LN2) + 1;
}
function readmem16b(m, off) {
  return m[off] << 8 | m[off + 1];
}
function isDigit(c) {
  return c >= 48 && c <= 57;
}
function copyTitle(r, n) {
  let s = "";
  for (let i = 0; i < n && i < r.length; i++) {
    const c = r[i];
    if (c === 0) break;
    s += String.fromCharCode(c);
  }
  return s.replace(/ +$/, "");
}
function copyAdjust(r, n) {
  let s = "";
  for (let i = 0; i < n && i < r.length; i++) {
    const c = r[i];
    if (c === 0) break;
    s += c > 127 || c < 32 || c === 127 ? "." : String.fromCharCode(c);
  }
  return s.replace(/ +$/, "");
}
function zeroEnvelope() {
  return { flags: 0, npt: 0, scl: 0, sus: 0, sue: 0, lps: 0, lpe: 0, x: [], y: [] };
}
function zeroInstrument(name, sub) {
  return {
    name,
    volume: 64,
    nsm: 0,
    rls: 0,
    // MOD/S3M maps are calloc'd zeros: key→sub[0] (getSubinstrument).
    map: new Array(121).fill(0),
    mapXpo: new Array(121).fill(0),
    sub,
    aei: zeroEnvelope(),
    fei: zeroEnvelope(),
    pei: zeroEnvelope()
  };
}
function readHeader(patbuf) {
  const ins = [];
  for (let i = 0; i < 31; i++) {
    const pos = 20 + i * 30;
    ins.push({
      name: String.fromCharCode(...patbuf.subarray(pos, pos + 22)),
      size: readmem16b(patbuf, pos + 22),
      finetune: patbuf[pos + 24],
      volume: patbuf[pos + 25],
      loop_start: readmem16b(patbuf, pos + 26),
      loop_size: readmem16b(patbuf, pos + 28)
    });
  }
  return {
    name: String.fromCharCode(...patbuf.subarray(0, 20)),
    ins,
    len: patbuf[950],
    restart: patbuf[951],
    order: patbuf.slice(952, 1080)
  };
}
function modTest(bytes) {
  if (bytes.length < 1084) return false;
  const buf = bytes.subarray(1080, 1084);
  if (buf[2] === 67 && buf[3] === 72 && isDigit(buf[0]) && isDigit(buf[1])) {
    const i = (buf[0] - 48) * 10 + (buf[1] - 48);
    if (i > 0 && i <= 32) return true;
  }
  if (buf[1] === 67 && buf[2] === 72 && buf[3] === 78 && isDigit(buf[0])) {
    if (buf[0] - 48 !== 0) return true;
  }
  let detected = 0;
  let id = 0;
  let found = false;
  for (const m of MOD_MAGIC) {
    if (buf[0] === m.magic.charCodeAt(0) && buf[1] === m.magic.charCodeAt(1) && buf[2] === m.magic.charCodeAt(2) && buf[3] === m.magic.charCodeAt(3)) {
      detected = m.flag;
      id = m.id;
      found = true;
      break;
    }
  }
  if (!found) return false;
  let smpSize = 0;
  for (let i = 0; i < 31; i++) {
    const pos = 20 + i * 30;
    const patBuf = bytes.subarray(pos, pos + 30);
    if (id === TrackerId.SOFTWAREVISIONS) {
      const f = patBuf.slice(0);
      flipWordBytes(f, 30);
      patBuf.set(f.subarray(22, 30), 22);
    }
    smpSize += readmem16b(patBuf, 22) << 1;
    const x = patBuf[24];
    if ((x & 240) !== 0 && x !== 32) return false;
    if (patBuf[25] > 64) return false;
  }
  if (detected) return true;
  const size = bytes.length;
  let numPat = 0;
  for (let i = 0; i < 128; i++) {
    const x = bytes[952 + i];
    if (x > 127) break;
    if (x > numPat) numPat = x;
  }
  numPat++;
  if (1084 + numPat * 768 + smpSize === size) return false;
  let count = 0;
  for (let i = 0; i < numPat; i++) {
    const pbuf = bytes.subarray(1084 + 1024 * i, 1084 + 1024 * i + 1024);
    if (pbuf.length < 1024) return false;
    if (validatePattern(pbuf) < 0) {
      count++;
    }
  }
  if (count > 2) return false;
  return true;
}
function decodeEvent(dst, modEvent, off, trackerId) {
  dst.note = periodToNote(LSN(modEvent[off]) << 8 | modEvent[off + 1]);
  dst.ins = MSN(modEvent[off]) << 4 | MSN(modEvent[off + 2]);
  const fxt = LSN(modEvent[off + 2]);
  if (trackerId === TrackerId.PROBABLY_NOISETRACKER || trackerId === TrackerId.NOISETRACKER) {
    if (fxt <= 6 || fxt >= 10 && fxt !== 14) {
      dst.fxt = fxt;
      dst.fxp = modEvent[off + 3];
    }
  } else {
    if (fxt !== 8) {
      dst.fxt = fxt;
      dst.fxp = modEvent[off + 3];
    }
  }
  disableContinueFx(dst);
}
function disableContinueFx(ev) {
  if (ev.fxp === 0) {
    switch (ev.fxt) {
      case 5:
        ev.fxt = 3;
        break;
      case 6:
        ev.fxt = 4;
        break;
      case 1:
      case 2:
      case 10:
        ev.fxt = 0;
        break;
    }
  } else if (ev.fxt === 14) {
    if (ev.fxp === 160 || ev.fxp === 176) {
      ev.fxt = 0;
      ev.fxp = 0;
    }
  }
}
function modLoad(bytes, ctx) {
  const size = bytes.length;
  const patbuf0 = bytes.subarray(0, 1084);
  if (patbuf0.length < 1084) throw new ParseError("read error in MOD header");
  let magic = "";
  for (let i = 0; i < 4; i++) magic += String.fromCharCode(patbuf0[1080 + i]);
  let chn = 0;
  let trackerId = TrackerId.PROTRACKER;
  let detected = 0;
  for (const m of MOD_MAGIC) {
    if (magic === m.magic) {
      chn = m.ch;
      trackerId = m.id;
      detected = m.flag;
      break;
    }
  }
  let needsTimingDetection = 0;
  if (trackerId === TrackerId.PROTRACKER) needsTimingDetection = 1;
  if (trackerId === TrackerId.DIGITALTRACKER) {
  }
  if (chn === 0) {
    if (magic.charCodeAt(2) === 67 && magic.charCodeAt(3) === 72 && isDigit(magic.charCodeAt(0)) && isDigit(magic.charCodeAt(1))) {
      chn = (magic.charCodeAt(0) - 48) * 10 + (magic.charCodeAt(1) - 48);
    } else if (magic.charCodeAt(1) === 67 && magic.charCodeAt(2) === 72 && magic.charCodeAt(3) === 78 && isDigit(magic.charCodeAt(0))) {
      chn = magic.charCodeAt(0) - 48;
    } else {
      throw new ParseError("MOD: unknown magic");
    }
    trackerId = (chn & 1) !== 0 ? TrackerId.TAKETRACKER : TrackerId.FASTTRACKER2;
    detected = 1;
  }
  const header = readHeader(patbuf0);
  const mh = header;
  if (trackerId === TrackerId.SOFTWAREVISIONS) {
    const flipped = patbuf0.slice(0);
    flipWordBytes(flipped, 1084);
    const mh2 = readHeader(flipped);
    mh.name = mh2.name;
    mh.ins = mh2.ins;
    mh.len = mh2.len;
    mh.restart = mh2.restart;
    mh.order = mh2.order;
  }
  let maybeWow = 1;
  let smpSize = 0;
  for (let i = 0; i < 31; i++) {
    const ins = mh.ins[i];
    if (ins.size !== 0 && (ins.finetune !== 0 || ins.volume !== 64)) maybeWow = 0;
    smpSize += 2 * ins.size;
  }
  if (mh.restart !== 0) maybeWow = 0;
  let rst = 0;
  if (mh.restart < 127 && mh.restart !== 120 && mh.restart < mh.len) {
    rst = mh.restart;
  }
  let pat = 0;
  const xxo = Array.from(mh.order);
  for (let i = 0; i < 128; i++) {
    const x = mh.order[i];
    if (x > 127) break;
    if (x > pat) pat = x;
  }
  pat++;
  const len = mh.len;
  const instruments = [];
  const rawSamples = [];
  const subDefaults = [];
  for (let i = 0; i < 31; i++) {
    const hins = mh.ins[i];
    if (hins.size >= 32768) {
      trackerId = TrackerId.OPENMPT;
      needsTimingDetection = 0;
      detected = 1;
    }
    const xlen = 2 * hins.size;
    const lps = 2 * hins.loop_start;
    let lpe = lps + 2 * hins.loop_size;
    if (lpe > xlen) lpe = xlen;
    const xflg = hins.loop_size > 1 && lpe >= 4 ? SampleFlags.LOOP : 0;
    const sub = {
      vol: hins.volume,
      gvl: 64,
      // no QUIRK_INSVOL: load_epilogue sets gvl = volbase (load_helpers.c:377-383)
      pan: -1,
      // XMP_INST_NO_DEFAULT_PAN
      xpo: 0,
      fin: (hins.finetune << 4 & 255) << 24 >> 24,
      // (int8)((uint8)finetune << 4)
      vwf: 0,
      vde: 0,
      vra: 0,
      vsw: 0,
      sid: i,
      rvv: 0,
      nna: 0,
      dct: 0,
      dca: 0,
      ifc: 0,
      ifr: 0
    };
    const name = copyAdjust(patbuf0.subarray(20 + i * 30, 20 + i * 30 + 22), 22);
    const ins = zeroInstrument(name, [sub]);
    if (xlen > 0) ins.nsm = 1;
    instruments.push(ins);
    rawSamples.push({
      // mod_load.c never writes xxs->name (only the INSTRUMENT name at
      // mod_load.c:283) — sample names stay empty in C.
      name: "",
      data: new Uint8Array(0),
      // filled below; meta fields kept on raw
      length: xlen,
      loopStart: lps,
      loopEnd: lpe,
      sustainStart: 0,
      sustainEnd: 0,
      finetune: sub.fin,
      volume: sub.vol,
      flags: xflg,
      c5spd: C4_PAL_RATE
      // libxmp_init_instrument before tracker switch (mod_load.c:626)
    });
    subDefaults.push({ vol: sub.vol, fin: sub.fin, sid: i });
  }
  let ptsong = 0;
  if (!detected) {
    if (1084 + pat * 4 * chn * 64 + smpSize < size) {
      const pos = 1084 + pat * 4 * chn * 64 + smpSize;
      if (bytes[pos] === 70 && bytes[pos + 1] === 76 && bytes[pos + 2] === 69 && bytes[pos + 3] === 88) {
        trackerId = TrackerId.FLEXTRAX;
        needsTimingDetection = 0;
        detected = 1;
      }
    }
    if (!detected) {
      if (magic === "M.K." && maybeWow === 1 && 1084 + pat * 32 * 64 + smpSize === (size & ~1)) {
        chn = 8;
        trackerId = TrackerId.MODSGRAVE;
        needsTimingDetection = 0;
        detected = 1;
      } else {
        ptsong = magic === "M.K." && 1084 + pat * 1024 === size ? 1 : 0;
        if (ptsong) {
          trackerId = TrackerId.PROTRACKER;
          detected = 1;
        } else {
          const view = {
            name: mh.name,
            ins: mh.ins,
            len: mh.len,
            restart: mh.restart,
            order: mh.order
          };
          const rstBox = { rst };
          trackerId = getTrackerId(rstBox, view, pat, chn, trackerId);
          rst = rstBox.rst;
        }
      }
    }
  }
  if (chn >= XMP_MAX_CHANNELS) throw new ParseError("MOD: too many channels");
  const patterns = [];
  const patHighFxx = new Uint8Array(256);
  let outOfRange = 0;
  let samerowFxx = 0;
  let highFxx = 0;
  let invertLoop = 0;
  let compareVblank = 0;
  let quirkFlags = 0;
  const patlen = 64 * 4 * chn;
  const patbuf = new Uint8Array(patlen);
  for (let i = 0; i < pat; i++) {
    const base = (trackerId === TrackerId.DIGITALTRACKER ? 1088 : 1084) + i * patlen;
    const src = bytes.subarray(base, base + patlen);
    if (src.length < patlen) throw new ParseError(`MOD: pattern ${i} truncated`);
    patbuf.set(src);
    if (trackerId === TrackerId.SOFTWAREVISIONS && i === 0) {
      flipWordBytes(patbuf, patlen);
    }
    {
      let off = 0;
      for (let j = 0; j < 64; j++) {
        let speedRow = 0;
        let bpmRow = 0;
        for (let k = 0; k < chn; k++) {
          const period = LSN(patbuf[off]) << 8 | patbuf[off + 1];
          if (period !== 0 && (period < 108 || period > 907)) outOfRange = 1;
          if (trackerId === TrackerId.PROBABLY_NOISETRACKER) {
            const fxt = LSN(patbuf[off + 2]);
            const fxp = LSN(patbuf[off + 3]);
            if (fxt > 6 && fxt < 10 || fxt === 14 && fxp > 1) {
              trackerId = TrackerId.UNKNOWN;
            }
          }
          if (LSN(patbuf[off + 2]) === 15) {
            const fxp = patbuf[off + 3];
            if (fxp >= 32) {
              patHighFxx[i] = fxp;
              compareVblank = 1;
              highFxx = 1;
              bpmRow = 1;
            } else {
              speedRow = 1;
            }
          }
          if (LSN(patbuf[off + 2]) === 14 && MSN(patbuf[off + 3]) === 15) {
            invertLoop = 1;
          }
          off += 4;
        }
        if (bpmRow !== 0 && speedRow !== 0) samerowFxx = 1;
      }
    }
    if (outOfRange !== 0) {
      if (trackerId === TrackerId.UNKNOWN && mh.restart === 127) {
        trackerId = TrackerId.SCREAMTRACKER3;
      }
      if (trackerId === TrackerId.PROTRACKER || trackerId === TrackerId.NOISETRACKER || trackerId === TrackerId.PROBABLY_NOISETRACKER || trackerId === TrackerId.SOUNDTRACKER) {
        trackerId = TrackerId.UNKNOWN;
      }
    } else if (invertLoop !== 0 && detected === 0 && (trackerId === TrackerId.NOISETRACKER || trackerId === TrackerId.PROBABLY_NOISETRACKER)) {
      trackerId = TrackerId.PROTRACKER;
    }
    const tracks = [];
    for (let k = 0; k < chn; k++) {
      const events = [];
      for (let j = 0; j < 64; j++) {
        const ev = { ...EMPTY_EVENT };
        const off = (j * chn + k) * 4;
        decodeEvent(ev, patbuf, off, trackerId);
        events.push(ev);
      }
      tracks.push({ rows: 64, event: events });
    }
    patterns.push({ rows: 64, tracks });
  }
  if (needsTimingDetection === 0) {
    if (trackerIsVblank(trackerId) !== 0) quirkFlags |= Quirk.NOBPM;
    compareVblank = 0;
  } else if (samerowFxx !== 0) {
    if (trackerId === TrackerId.NOISETRACKER || trackerId === TrackerId.PROBABLY_NOISETRACKER || trackerId === TrackerId.SOUNDTRACKER) {
      trackerId = TrackerId.UNKNOWN;
    }
    compareVblank = 0;
  } else if (highFxx !== 0 && len >= 8) {
    const threshold = len - 2;
    let i = 0;
    for (; i < threshold; i++) {
      if (patHighFxx[xxo[i]] !== 0) break;
    }
    if (i === threshold) {
      for (i = len - 1; i >= threshold; i--) {
        const fxx = patHighFxx[xxo[i]];
        if (fxx === 0) continue;
        if (fxx === 125) break;
        compareVblank = 0;
        quirkFlags |= Quirk.NOBPM;
        break;
      }
    }
  }
  if (invertLoop !== 0 && detected === 0 && outOfRange === 0) {
    if (trackerId !== TrackerId.OPENMPT) trackerId = TrackerId.PROTRACKER;
    detected = 1;
  }
  const st = { tracker: "", trackerId, ptkloop: 0 };
  switch (st.trackerId) {
    case TrackerId.PROTRACKER:
      st.tracker = "Protracker";
      st.ptkloop = 1;
      break;
    case TrackerId.PROBABLY_NOISETRACKER:
    case TrackerId.NOISETRACKER:
      st.tracker = "Noisetracker";
      break;
    case TrackerId.SOUNDTRACKER:
      st.tracker = "Soundtracker";
      break;
    case TrackerId.FASTTRACKER:
    case TrackerId.FASTTRACKER2:
      st.tracker = "Fast Tracker";
      break;
    case TrackerId.TAKETRACKER:
      st.tracker = "Take Tracker";
      break;
    case TrackerId.OCTALYSER:
      st.tracker = "Octalyser";
      if (detected !== 0) {
      }
      break;
    case TrackerId.DIGITALTRACKER:
      st.tracker = "Digital Tracker";
      break;
    case TrackerId.FLEXTRAX:
      st.tracker = "Flextrax";
      break;
    case TrackerId.MODSGRAVE:
      st.tracker = "Mod's Grave";
      break;
    case TrackerId.SCREAMTRACKER3:
      st.tracker = "Scream Tracker";
      break;
    case TrackerId.SOFTWAREVISIONS:
      st.tracker = "Software Visions DMF";
      break;
    case TrackerId.CONVERTEDST:
    case TrackerId.CONVERTED:
      st.tracker = "Converted";
      break;
    case TrackerId.CLONE:
      st.tracker = "Protracker clone";
      break;
    case TrackerId.OPENMPT:
      st.tracker = "OpenMPT";
      st.ptkloop = 1;
      break;
    default:
    case TrackerId.UNKNOWN_CONV:
    case TrackerId.UNKNOWN:
      st.tracker = "Unknown tracker";
      break;
  }
  if (outOfRange !== 0) {
  }
  let type;
  if (st.trackerId === TrackerId.MODSGRAVE || st.trackerId === TrackerId.SOFTWAREVISIONS) {
    type = st.tracker;
  } else {
    type = `${st.tracker} ${magic}`;
  }
  let filePos = 1084 + pat * patlen + (trackerId === TrackerId.DIGITALTRACKER ? 4 : 0);
  for (let i = 0; i < 31; i++) {
    const raw = rawSamples[i];
    if (raw.length === 0) {
    }
    let flags = st.ptkloop !== 0 && raw.loopStart === 0 ? SF_FULLREP : 0;
    if (ptsong !== 0) {
    } else {
      if (raw.length !== 0) {
        const pos = filePos;
        let num = Math.min(5, size - pos);
        let isAdpcm = false;
        if (num === 5) {
          const b = bytes.subarray(pos, pos + 5);
          if (b[0] === 65 && b[1] === 68 && b[2] === 80 && b[3] === 67 && b[4] === 77) {
            isAdpcm = true;
          }
        }
        if (isAdpcm) {
          flags |= SF_ADPCM;
          filePos += 5;
        }
      }
      if (raw.length !== 0) {
        const isAdpcm = (flags & SF_ADPCM) !== 0;
        let bytelen = raw.length;
        if (isAdpcm) {
          const x2 = bytelen + 1 >> 1;
          const avail = size - filePos;
          if (avail < 16) {
            raw.length = 0;
            raw.data = new Uint8Array(0);
            raw.loopStart = 0;
            raw.loopEnd = 0;
            raw.flags = 0;
            continue;
          }
          const remaining = avail;
          const bound = 16 + x2;
          if (bound > remaining) {
            bytelen = remaining - 16 << 1;
          }
          const x2r = bytelen + 1 >> 1;
          const table = Int8Array.from(bytes.subarray(filePos, filePos + 16));
          const packed = bytes.subarray(filePos + 16, filePos + 16 + x2r);
          const expanded = new Uint8Array(bytelen);
          adpcm4Decode(packed, table, expanded);
          raw.data = expanded;
          raw.length = bytelen;
          filePos += 16 + x2r;
        } else {
          const remaining = size - filePos;
          const take = Math.min(bytelen, Math.max(0, remaining));
          raw.data = bytes.subarray(filePos, filePos + take);
          filePos += bytelen;
        }
        if ((flags & SF_FULLREP) !== 0) raw.flags |= SF_FULLREP;
      }
    }
    ctx.addSample(raw);
  }
  let readEventType = ReadEventType.MOD;
  let c4rate = C4_PAL_RATE;
  let periodType = PeriodType.MODRNG;
  let flowMode = 0;
  if (st.trackerId === TrackerId.PROTRACKER || st.trackerId === TrackerId.OPENMPT) {
    quirkFlags |= Quirk.PROTRACK;
  } else if (st.trackerId === TrackerId.SCREAMTRACKER3) {
    c4rate = C4_NTSC_RATE;
    quirkFlags |= QUIRKS_ST3;
    readEventType = ReadEventType.ST3;
  } else if (st.trackerId === TrackerId.FASTTRACKER || st.trackerId === TrackerId.FASTTRACKER2 || st.trackerId === TrackerId.TAKETRACKER || st.trackerId === TrackerId.MODSGRAVE || chn > 4) {
    c4rate = C4_NTSC_RATE;
    quirkFlags |= 0;
    readEventType = ReadEventType.FT2;
    periodType = PeriodType.AMIGA;
  }
  if (st.trackerId === TrackerId.FASTTRACKER || st.trackerId === TrackerId.FASTTRACKER2 || st.trackerId === TrackerId.TAKETRACKER || st.trackerId === TrackerId.SCREAMTRACKER3 || st.trackerId === TrackerId.CLONE || st.trackerId === TrackerId.UNKNOWN || st.trackerId === TrackerId.UNKNOWN_CONV || outOfRange !== 0) {
    periodType = PeriodType.AMIGA;
  }
  if (st.trackerId === TrackerId.OCTALYSER && detected !== 0) {
    flowMode = FLOW_MODE_OCTALYSER;
  }
  if (st.trackerId === TrackerId.DIGITALTRACKER) {
    flowMode = FLOW_MODE_DTM_2015;
  }
  const epilogueRst = rst >= len ? 0 : rst;
  const channels = [];
  for (let i = 0; i < chn; i++) {
    const pan = Math.floor((i + 1) / 2) % 2 * 255;
    channels.push({ pan: Math.min(255, Math.max(0, 128 + (pan - 128))), vol: 64, flg: 0 });
  }
  const mod = {
    title: copyTitle(patbuf0.subarray(0, 20), 20),
    format: "mod",
    comment: "",
    chn,
    pat,
    ins: 31,
    len,
    restart: epilogueRst,
    xxo,
    channels,
    patterns,
    instruments,
    // ModuleData.samples is a load-time scratch list; ids were assigned by
    // addSample in order (0..30) so samples[i] corresponds to sid i.
    samples: rawSamples,
    num_sequences: 0,
    sequences: [],
    speed: 6,
    bpm: 125,
    volbase: 64,
    gvolbase: 64,
    gvol: 64,
    quirks: quirkFlags,
    flowMode,
    readEventType,
    periodType,
    defpan: 128,
    time_factor: 10,
    rrate: 250,
    c4rate,
    compare_vblank: compareVblank !== 0,
    tracker: type
  };
  void ctx.sampleRate;
  void ctx.outputRate;
  return mod;
}

// ../../packages/fmt-mod/src/modcore.ts
import {
  C4_PAL_RATE as C4_PAL_RATE2,
  PeriodType as PeriodType2,
  ReadEventType as ReadEventType2
} from "@modplayjs/core";
import { SampleFlags as SampleFlags2 } from "@modplayjs/core";
import { LSN as LSN2, MSN as MSN2, EMPTY_EVENT as EMPTY_EVENT2 } from "@modplayjs/core";
import { ParseError as ParseError2 } from "@modplayjs/core";
function copyTitle2(r, n) {
  let s = "";
  for (let i = 0; i < n && i < r.length; i++) {
    const c = r[i];
    if (c === 0) break;
    s += String.fromCharCode(c);
  }
  return s.replace(/ +$/, "");
}
function copyAdjust2(r, n) {
  let s = "";
  for (let i = 0; i < n && i < r.length; i++) {
    const c = r[i];
    if (c === 0) break;
    s += c > 127 || c < 32 || c === 127 ? "." : String.fromCharCode(c);
  }
  return s.replace(/ +$/, "");
}
function zeroEnvelope2() {
  return { flags: 0, npt: 0, scl: 0, sus: 0, sue: 0, lps: 0, lpe: 0, x: [], y: [] };
}
function zeroInstrument2(name, sub) {
  return {
    name,
    volume: 64,
    nsm: 0,
    rls: 4095,
    // pw_load.c:140 — xxi[i].rls = 0xfff
    map: new Array(121).fill(0),
    mapXpo: new Array(121).fill(0),
    sub,
    aei: zeroEnvelope2(),
    fei: zeroEnvelope2(),
    pei: zeroEnvelope2()
  };
}
function disableContinueFx2(ev) {
  if (ev.fxp === 0) {
    switch (ev.fxt) {
      case 5:
        ev.fxt = 3;
        break;
      case 6:
        ev.fxt = 4;
        break;
      case 1:
      case 2:
      case 10:
        ev.fxt = 0;
        break;
    }
  } else if (ev.fxt === 14) {
    if (ev.fxp === 160 || ev.fxp === 176) {
      ev.fxt = 0;
      ev.fxp = 0;
    }
  }
}
function decodeProtrackerEvent(dst, modEvent, off) {
  dst.note = periodToNote(LSN2(modEvent[off]) << 8 | modEvent[off + 1]);
  dst.ins = MSN2(modEvent[off]) << 4 | MSN2(modEvent[off + 2]);
  const fxt = LSN2(modEvent[off + 2]);
  if (fxt !== 8) {
    dst.fxt = fxt;
    dst.fxp = modEvent[off + 3];
  }
  disableContinueFx2(dst);
}
function readPwHeader(b) {
  const ins = [];
  for (let i = 0; i < 31; i++) {
    const pos = 20 + i * 30;
    ins.push({
      name: String.fromCharCode(...b.subarray(pos, pos + 22)),
      // readmem16b (dataio.c:168-175)
      size: b[pos + 22] << 8 | b[pos + 23],
      finetune: b[pos + 24],
      volume: b[pos + 25],
      loop_start: b[pos + 26] << 8 | b[pos + 27],
      loop_size: b[pos + 28] << 8 | b[pos + 29]
    });
  }
  return {
    name: String.fromCharCode(...b.subarray(0, 20)),
    ins,
    len: b[950],
    restart: b[951],
    order: b.slice(952, 1080)
  };
}
function loadDepackedMod(bytes, ctx, name) {
  if (bytes.length < 1084 + 1024) throw new ParseError2("depacked MOD too small");
  const mh = readPwHeader(bytes);
  if (bytes[1080] !== 77 || bytes[1081] !== 46 || bytes[1082] !== 75 || bytes[1083] !== 46) {
    throw new ParseError2("depacked MOD: bad magic");
  }
  const chn = 4;
  const len = mh.len;
  let pat = 0;
  for (let i = 0; i < 128; i++) {
    if (mh.order[i] > pat) pat = mh.order[i];
  }
  pat++;
  const instruments = [];
  const rawSamples = [];
  for (let i = 0; i < 31; i++) {
    const hins = mh.ins[i];
    const xlen = 2 * hins.size;
    const lps = 2 * hins.loop_start;
    const lpe = lps + 2 * hins.loop_size;
    const xflg = hins.loop_size > 1 ? SampleFlags2.LOOP : 0;
    const fin = (hins.finetune << 4 & 255) << 24 >> 24;
    const sub = {
      vol: hins.volume,
      gvl: 64,
      // no QUIRK_INSVOL: load_epilogue (load_helpers.c:377-383)
      pan: -1,
      // XMP_INST_NO_DEFAULT_PAN
      xpo: 0,
      fin,
      vwf: 0,
      vde: 0,
      vra: 0,
      vsw: 0,
      sid: i,
      rvv: 0,
      nna: 0,
      dct: 0,
      dca: 0,
      ifc: 0,
      ifr: 0
    };
    const iname = copyAdjust2(bytes.subarray(20 + i * 30, 20 + i * 30 + 22), 22);
    const ins = zeroInstrument2(iname, [sub]);
    if (xlen > 0) ins.nsm = 1;
    instruments.push(ins);
    rawSamples.push({
      name: iname,
      data: new Uint8Array(0),
      length: xlen,
      loopStart: lps,
      loopEnd: lpe,
      sustainStart: 0,
      sustainEnd: 0,
      finetune: fin,
      volume: hins.volume,
      flags: xflg,
      c5spd: C4_PAL_RATE2
    });
  }
  const patlen = 64 * 4 * chn;
  const patterns = [];
  for (let i = 0; i < pat; i++) {
    const base = 1084 + i * patlen;
    const src = bytes.subarray(base, base + patlen);
    if (src.length < patlen) throw new ParseError2(`depacked MOD: pattern ${i} truncated`);
    const tracks = [];
    for (let k = 0; k < chn; k++) {
      const events = [];
      for (let j = 0; j < 64; j++) {
        const ev = { ...EMPTY_EVENT2 };
        decodeProtrackerEvent(ev, src, (j * chn + k) * 4);
        events.push(ev);
      }
      tracks.push({ rows: 64, event: events });
    }
    patterns.push({ rows: 64, tracks });
  }
  let filePos = 1084 + pat * patlen;
  for (let i = 0; i < 31; i++) {
    const raw = rawSamples[i];
    if (raw.length !== 0) {
      const remaining = Math.max(0, bytes.length - filePos);
      const take = Math.min(raw.length, remaining);
      raw.data = bytes.subarray(filePos, filePos + take);
      filePos += raw.length;
    }
    ctx.addSample(raw);
  }
  const periodType = PeriodType2.MODRNG;
  const readEventType = ReadEventType2.MOD;
  const quirkFlags = 0;
  const channels = [];
  for (let i = 0; i < chn; i++) {
    const pan = Math.floor((i + 1) / 2) % 2 * 255;
    channels.push({ pan: Math.min(255, Math.max(0, 128 + (pan - 128))), vol: 64, flg: 0 });
  }
  const rst = mh.restart;
  const mod = {
    title: copyTitle2(bytes.subarray(0, 20), 20),
    format: "mod",
    comment: "",
    chn,
    pat,
    ins: 31,
    len,
    restart: rst >= len ? 0 : rst,
    // load_helpers.c:366-369 epilogue clamp
    xxo: Array.from(mh.order),
    channels,
    patterns,
    instruments,
    samples: rawSamples,
    num_sequences: 0,
    sequences: [],
    speed: 6,
    bpm: 125,
    volbase: 64,
    gvolbase: 64,
    gvol: 64,
    quirks: quirkFlags,
    flowMode: 0,
    readEventType,
    periodType,
    defpan: 128,
    time_factor: 10,
    rrate: 250,
    c4rate: C4_PAL_RATE2,
    compare_vblank: false,
    tracker: name
    // pw_load.c:128 — mod->type = pw_format name
  };
  void ctx.sampleRate;
  void ctx.outputRate;
  return mod;
}

// ../../packages/fmt-mod/src/readevent.ts
import { Quirk as Quirk2, ReadEventType as ReadEventType3, XMP_KEY_OFF } from "@modplayjs/core";
import {
  isToneportaFx,
  isSfxPitch,
  isModRetrig,
  setPatch,
  NoteFlag,
  RESET,
  RESET_NOTE,
  RESET_PER,
  SET,
  SET_NOTE,
  TEST,
  TEST_NOTE,
  VolSlideFlag,
  VOL_SLIDE,
  getSubinstrument,
  getInstrument,
  isValidInstrument,
  isValidNote,
  isValidSample,
  noteToPeriod,
  processFx,
  resetEnvelopes,
  setChannelPan,
  setChannelVolume,
  setEffectDefaults,
  setPeriod
} from "@modplayjs/core";
import {
  isToneportaFx as isToneportaFx2,
  isSfxPitch as isSfxPitch2,
  isModRetrig as isModRetrig2,
  setPatch as setPatch2
} from "@modplayjs/core";
import { readEventFt2 } from "@modplayjs/core";
import { readEventFt2 as readEventFt22 } from "@modplayjs/core";
import { readEventSt3 } from "@modplayjs/core";
function readEventDispatch(core, chn, row) {
  const mod = core.module;
  const xc = core.ctx.channelStates[chn];
  const e = core.readEventScratch(chn) ?? core.readEventAt(mod.xxo[core.ctx.p.ord] ?? 0, chn, row);
  if (e.ins !== 0) xc.old_ins = e.ins;
  if (TEST_NOTE(xc, NoteFlag.SAMPLE_END) !== 0) {
    SET_NOTE(xc, NoteFlag.END);
  }
  switch (mod.readEventType) {
    case ReadEventType3.FT2:
      readEventFt22(core, e, chn);
      return;
    case ReadEventType3.ST3:
      readEventSt3(core, e, chn);
      return;
    case ReadEventType3.MOD:
    default:
      readEventMod(core, e, chn);
      return;
  }
}
function readEventMod(core, e, chn) {
  const mod = core.module;
  const xc = core.ctx.channelStates[chn];
  let note = -1;
  let sub = null;
  let newInvalidIns = 0;
  let newSwapIns = 0;
  let isToneporta = 0;
  let isRetrig = 0;
  xc.flags = 0;
  if (isToneportaFx(e.fxt) || isToneportaFx(e.f2t)) {
    isToneporta = 1;
  }
  if (isModRetrig(e.fxt, e.fxp) || isModRetrig(e.f2t, e.f2p)) {
    isRetrig = 1;
  }
  if (isValidNote(e.note - 1) && !isToneporta) {
    xc.key = e.note - 1;
  }
  if (e.ins) {
    const ins = e.ins - 1;
    SET(xc, VolSlideFlag.NEW_INS);
    xc.fadeout = 65536;
    xc.per_flags = 0;
    xc.offset.val = 0;
    RESET_NOTE(xc, NoteFlag.RELEASE | NoteFlag.FADEOUT);
    if (isValidInstrument(core, ins)) {
      sub = getSubinstrument(core, ins, xc.key);
      if (sub !== null) {
        newSwapIns = 1;
        if ((core.quirks & Quirk2.PROTRACK) !== 0) {
          xc.finetune = sub.fin;
          xc.ins = ins;
        }
        if (xc.split === 0 && e.note !== XMP_KEY_OFF) {
          setChannelVolume(xc, sub.vol);
          setChannelPan(xc, sub.pan);
        }
      }
      if (!isToneporta) {
        xc.ins = ins;
        xc.ins_fade = getInstrument(core, ins)?.rls ?? 0;
      }
    } else {
      newInvalidIns = 1;
      if ((core.quirks & Quirk2.PROTRACK) === 0 || isRetrig) {
        core.virt.resetChannel(chn);
      } else {
        core.virt.queuePatch(chn, -1, -1, 0);
      }
    }
  }
  if (e.note !== 0) {
    SET(xc, VolSlideFlag.NEW_NOTE);
    RESET_PER(xc, VOL_SLIDE);
    if (e.note === XMP_KEY_OFF) {
      SET_NOTE(xc, NoteFlag.RELEASE);
    } else if (!isToneporta && isValidNote(e.note - 1)) {
      RESET_NOTE(xc, NoteFlag.END);
      sub = getSubinstrument(core, xc.ins, xc.key);
      if (sub !== null) {
        const transp = getInstrument(core, xc.ins)?.mapXpo[xc.key] ?? 0;
        let smp;
        note = xc.key + sub.xpo + transp;
        smp = sub.sid;
        if (newInvalidIns || !isValidSample(core, smp)) {
          smp = -1;
        }
        if (smp >= 0 && smp < mod.samples.length) {
          setPatch(core, chn, xc.ins, smp, note);
          newSwapIns = 0;
          xc.smp = smp;
        }
      } else {
        xc.flags = 0;
        note = xc.key;
      }
    }
    if (note >= 0) {
      xc.note = note;
      SET_NOTE(xc, NoteFlag.SET);
    }
  }
  if (newSwapIns !== 0 && sub !== null && (core.quirks & Quirk2.PROTRACK) !== 0 && TEST_NOTE(xc, NoteFlag.SET) !== 0) {
    const smp = isValidSample(core, sub.sid) ? sub.sid : -1;
    core.virt.queuePatch(chn, e.ins - 1, smp, xc.note);
    xc.smp = sub.sid;
  }
  sub = getSubinstrument(core, xc.ins, xc.key);
  setEffectDefaults(core, note, sub, xc, isToneporta !== 0);
  if (e.ins && sub !== null) {
    resetEnvelopes(core, xc);
  }
  setChannelVolume(xc, e.vol - 1);
  if (e.vol) {
    RESET_PER(xc, VOL_SLIDE);
  }
  processFx(core, xc, chn, e, 1);
  processFx(core, xc, chn, e, 0);
  if (isSfxPitch(e.fxt)) {
    xc.period = noteToPeriod(mod.periodType, note, xc.finetune, xc.per_adj);
  } else {
    setPeriod(core, note, sub, xc, isToneporta !== 0);
  }
  if (sub === null) {
    return;
  }
  if (note >= 0 && !newInvalidIns) {
    core.virt.voicePos(chn, xc.offset.val);
  } else if (newSwapIns && isRetrig && (core.quirks & Quirk2.PROTRACK) !== 0) {
    core.virt.voicePos(chn, 0);
  }
  if (TEST(xc, VolSlideFlag.OFFSET) !== 0) {
    if ((core.quirks & Quirk2.PROTRACK) !== 0) {
      xc.offset.val += xc.offset.val2;
    }
    RESET(xc, VolSlideFlag.OFFSET);
  }
}

// ../../packages/fmt-mod/src/index.ts
import { readEventFt2 as readEventFt23 } from "@modplayjs/core";
import { readEventSt3 as readEventSt32 } from "@modplayjs/core";

// ../../packages/fmt-mod/src/hmn.ts
import {
  C4_PAL_RATE as C4_PAL_RATE3,
  EMPTY_EVENT as EMPTY_EVENT3,
  FX_MEGAARP,
  PeriodType as PeriodType3,
  Quirk as Quirk3,
  ReadEventType as ReadEventType4,
  SampleFlags as SampleFlags3
} from "@modplayjs/core";
import { ParseError as ParseError3 } from "@modplayjs/core";
import { LSN as LSN3, MSN as MSN3 } from "@modplayjs/core";
var SF_FULLREP2 = 512;
function readmem16b2(m, o) {
  return m[o] << 8 | m[o + 1];
}
function copyTitle3(r, n) {
  let s = "";
  for (let i = 0; i < n && i < r.length; i++) {
    const c = r[i];
    if (c === 0) break;
    s += String.fromCharCode(c);
  }
  return s.replace(/ +$/, "");
}
function copyAdjust3(r, n) {
  let s = "";
  for (let i = 0; i < n && i < r.length; i++) {
    const c = r[i];
    if (c === 0) break;
    s += c > 127 || c < 32 || c === 127 ? "." : String.fromCharCode(c);
  }
  return s.replace(/ +$/, "");
}
function disableContinueFx3(ev) {
  if (ev.fxp === 0) {
    switch (ev.fxt) {
      case 5:
        ev.fxt = 3;
        break;
      case 6:
        ev.fxt = 4;
        break;
      case 1:
      case 2:
      case 10:
        ev.fxt = 0;
        break;
    }
  } else if (ev.fxt === 14) {
    if (ev.fxp === 160 || ev.fxp === 176) {
      ev.fxt = 0;
      ev.fxp = 0;
    }
  }
}
function decodeHmnEvent(dst, m, off) {
  dst.note = periodToNote(LSN3(m[off]) << 8 | m[off + 1]);
  dst.ins = MSN3(m[off]) << 4 | MSN3(m[off + 2]);
  const fxt = LSN3(m[off + 2]);
  if (fxt !== 8) {
    dst.fxt = fxt;
    dst.fxp = m[off + 3];
  }
  disableContinueFx3(dst);
  switch (dst.fxt) {
    case 7:
      dst.fxt = FX_MEGAARP;
      break;
    case 8:
    case 9:
    case 14:
      dst.fxt = 0;
      dst.fxp = 0;
      break;
  }
}
var MAGIC_FEST = "FEST";
var MAGIC_MK = "M&K!";
function hmnTest(bytes) {
  if (bytes.length < 1084) return false;
  const magic = String.fromCharCode(...bytes.subarray(1080, 1084));
  return magic === MAGIC_FEST || magic === MAGIC_MK;
}
function zeroEnvelope3() {
  return { flags: 0, npt: 0, scl: 0, sus: 0, sue: 0, lps: 0, lpe: 0, x: [], y: [] };
}
function pad2(v) {
  return (v & 255).toString(16).padStart(2, "0");
}
function hmnLoad(bytes, ctx) {
  const patbuf = bytes.subarray(0, 1084);
  if (patbuf.length < 1084) throw new ParseError3("HMN: short header");
  const mupp = [];
  let numMupp = 0;
  for (let i = 0; i < 31; i++) {
    const nm = patbuf.subarray(20 + i * 30, 20 + i * 30 + 22);
    if (nm[0] === 77 && nm[1] === 117 && nm[2] === 112 && nm[3] === 112) {
      mupp.push({
        prgon: 1,
        pattno: nm[4],
        dataloopstart: nm[5],
        dataloopend: nm[6]
      });
      numMupp++;
    } else {
      mupp.push({ prgon: 0, pattno: 0, dataloopstart: 0, dataloopend: 0 });
    }
  }
  const insHeaders = [];
  for (let i = 0; i < 31; i++) {
    const pos = 20 + i * 30;
    insHeaders.push({
      name: patbuf.subarray(pos, pos + 22),
      size: readmem16b2(patbuf, pos + 22),
      finetune: patbuf[pos + 24],
      volume: patbuf[pos + 25],
      loop_start: readmem16b2(patbuf, pos + 26),
      loop_size: readmem16b2(patbuf, pos + 28)
    });
  }
  const len = patbuf[950];
  const restart = patbuf[951];
  const xxo = Array.from(patbuf.slice(952, 1080));
  const magic = String.fromCharCode(...patbuf.subarray(1080, 1084));
  const chn = 4;
  const ins = 31;
  const smp = ins + 28 * numMupp;
  let pat = 0;
  for (let i = 0; i < 128; i++) {
    if (xxo[i] > pat) pat = xxo[i];
  }
  pat++;
  const instruments = [];
  const rawSamples = [];
  const muppIdx = [];
  let muppCursor = 0;
  for (let i = 0; i < ins; i++) {
    const il = insHeaders[i];
    const m = mupp[i];
    const subs = [];
    if (m.prgon) {
      for (let j = 0; j < 28; j++) {
        subs.push({
          vol: il.volume,
          gvl: 64,
          // no QUIRK_INSVOL: load_epilogue (load_helpers.c:377-383)
          pan: -1,
          // XMP_INST_NO_DEFAULT_PAN
          xpo: 0,
          fin: -((il.finetune << 3 & 255) << 24 >> 24),
          // -(int8)((uint8)ft << 3)
          vwf: 0,
          vde: 0,
          vra: 0,
          vsw: 0,
          sid: i,
          // reassigned to the mupp sample id below (hmn_load.c:305)
          rvv: 0,
          nna: 0,
          dct: 0,
          dca: 0,
          ifc: 0,
          ifr: 0
        });
      }
      rawSamples.push({
        name: "",
        data: new Uint8Array(0),
        length: 0,
        loopStart: 0,
        loopEnd: 0,
        sustainStart: 0,
        sustainEnd: 0,
        finetune: 0,
        volume: il.volume,
        flags: 0,
        c5spd: C4_PAL_RATE3
      });
      muppIdx.push(muppCursor);
      muppCursor++;
    } else {
      const xlen = 2 * il.size;
      const lps = 2 * il.loop_start;
      const lpe = lps + 2 * il.loop_size;
      const xflg = il.loop_size > 1 ? SampleFlags3.LOOP : 0;
      subs.push({
        vol: il.volume,
        gvl: 64,
        pan: -1,
        xpo: 0,
        fin: -(il.finetune << 24 >> 24) * 8,
        vwf: 0,
        vde: 0,
        vra: 0,
        vsw: 0,
        sid: i,
        rvv: 0,
        nna: 0,
        dct: 0,
        dca: 0,
        ifc: 0,
        ifr: 0
      });
      rawSamples.push({
        name: "",
        data: new Uint8Array(0),
        length: xlen,
        loopStart: lps,
        loopEnd: lpe,
        sustainStart: 0,
        sustainEnd: 0,
        finetune: 0,
        volume: il.volume,
        flags: xflg,
        c5spd: C4_PAL_RATE3
      });
      muppIdx.push(-1);
    }
    const xi = {
      name: m.prgon ? `Mupp ${pad2(m.pattno)} ${pad2(m.dataloopstart)} ${pad2(m.dataloopend)}` : copyAdjust3(il.name, 22),
      volume: 64,
      nsm: m.prgon ? 28 : 1,
      // hmn_load.c:227 — nsm=1 unconditionally
      rls: 0,
      map: Array.from({ length: 121 }, () => 0),
      mapXpo: Array.from({ length: 121 }, () => 0),
      sub: subs,
      aei: zeroEnvelope3(),
      fei: zeroEnvelope3(),
      pei: zeroEnvelope3(),
      extras: m.prgon ? {
        dataloopstart: m.dataloopstart,
        dataloopend: m.dataloopend,
        data: new Array(64).fill(0),
        progvolume: new Array(64).fill(0)
      } : void 0
    };
    instruments.push(xi);
  }
  for (let mi = 0; mi < numMupp; mi++) {
    for (let j = 0; j < 28; j++) {
      rawSamples.push({
        name: "",
        data: new Uint8Array(0),
        // filled in the mupp pass below
        length: 32,
        // hmn_load.c:306
        loopStart: 0,
        loopEnd: 32,
        sustainStart: 0,
        sustainEnd: 0,
        finetune: 0,
        volume: 64,
        flags: SampleFlags3.LOOP,
        // hmn_load.c:309
        c5spd: C4_PAL_RATE3
      });
    }
  }
  const patlen = 64 * 4 * chn;
  const patterns = [];
  for (let i = 0; i < pat; i++) {
    const base = 1084 + i * patlen;
    const src = bytes.subarray(base, base + patlen);
    if (src.length < patlen) throw new ParseError3(`HMN: pattern ${i} truncated`);
    const tracks = [];
    for (let k = 0; k < chn; k++) {
      const events = [];
      for (let j = 0; j < 64; j++) {
        const ev = { ...EMPTY_EVENT3 };
        decodeHmnEvent(ev, src, (j * chn + k) * 4);
        events.push(ev);
      }
      tracks.push({ rows: 64, event: events });
    }
    patterns.push({ rows: 64, tracks });
  }
  let filePos = 1084 + pat * patlen;
  for (let i = 0; i < ins; i++) {
    const raw = rawSamples[i];
    if (raw.loopStart === 0) raw.flags |= SF_FULLREP2;
    if (raw.length !== 0) {
      const remaining = Math.max(0, bytes.length - filePos);
      const take = Math.min(raw.length, remaining);
      raw.data = bytes.subarray(filePos, filePos + take);
      filePos += raw.length;
    }
  }
  muppCursor = 0;
  for (let i = 0; i < ins; i++) {
    const m = mupp[i];
    if (!m.prgon) continue;
    const waveBase = 1084 + 1024 * m.pattno;
    const xi = instruments[i];
    const extras = xi.extras;
    for (let j = 0; j < 28; j++) {
      const k = ins + 28 * muppCursor + j;
      xi.sub[j].sid = k;
      const raw = rawSamples[k];
      raw.data = bytes.slice(waveBase + j * 32, waveBase + (j + 1) * 32);
    }
    extras.dataloopstart = m.dataloopstart;
    extras.dataloopend = m.dataloopend;
    for (let j = 0; j < 64; j++) {
      extras.data[j] = bytes[waveBase + 28 * 32 + j] ?? 0;
      extras.progvolume[j] = bytes[waveBase + 28 * 32 + 64 + j] ?? 0;
    }
    muppCursor++;
  }
  for (const raw of rawSamples) ctx.addSample(raw);
  void smp;
  const quirkFlags = Quirk3.NOBPM;
  const periodType = PeriodType3.MODRNG;
  const channels = [];
  for (let i = 0; i < chn; i++) {
    const pan = Math.floor((i + 1) / 2) % 2 * 255;
    channels.push({ pan: Math.min(255, Math.max(0, 128 + (pan - 128))), vol: 64, flg: 0 });
  }
  const mod = {
    title: copyTitle3(patbuf.subarray(0, 20), 20),
    format: "mod",
    comment: "",
    chn,
    pat,
    ins,
    // hmn instrument count is 31; the 28*n mupp waveforms are SAMPLES
    len,
    restart: restart >= len ? 0 : restart,
    xxo,
    channels,
    patterns,
    instruments,
    samples: rawSamples,
    num_sequences: 0,
    sequences: [],
    speed: 6,
    bpm: 125,
    volbase: 64,
    gvolbase: 64,
    gvol: 64,
    quirks: quirkFlags,
    flowMode: 0,
    readEventType: ReadEventType4.MOD,
    periodType,
    defpan: 128,
    time_factor: 10,
    rrate: 250,
    c4rate: 8287,
    compare_vblank: false,
    tracker: `His Master's Noise (${magic})`,
    // hmn_load.c:208 set_type
    extras: { kind: "hmn" }
  };
  void ctx.sampleRate;
  void ctx.outputRate;
  return mod;
}

// ../../packages/fmt-mod/src/flt.ts
import {
  C4_PAL_RATE as C4_PAL_RATE4,
  EMPTY_EVENT as EMPTY_EVENT4,
  PeriodType as PeriodType4,
  ReadEventType as ReadEventType5,
  SampleFlags as SampleFlags4
} from "@modplayjs/core";
import { ParseError as ParseError4 } from "@modplayjs/core";
import { LSN as LSN4, MSN as MSN4 } from "@modplayjs/core";
var SF_FULLREP3 = 512;
function readmem16b3(m, o) {
  return m[o] << 8 | m[o + 1];
}
function copyTitle4(r, n) {
  let s = "";
  for (let i = 0; i < n && i < r.length; i++) {
    const c = r[i];
    if (c === 0) break;
    s += String.fromCharCode(c);
  }
  return s.replace(/ +$/, "");
}
function copyAdjust4(r, n) {
  let s = "";
  for (let i = 0; i < n && i < r.length; i++) {
    const c = r[i];
    if (c === 0) break;
    s += c > 127 || c < 32 || c === 127 ? "." : String.fromCharCode(c);
  }
  return s.replace(/ +$/, "");
}
function disableContinueFx4(ev) {
  if (ev.fxp === 0) {
    switch (ev.fxt) {
      case 5:
        ev.fxt = 3;
        break;
      case 6:
        ev.fxt = 4;
        break;
      case 1:
      case 2:
      case 10:
        ev.fxt = 0;
        break;
    }
  } else if (ev.fxt === 14) {
    if (ev.fxp === 160 || ev.fxp === 176) {
      ev.fxt = 0;
      ev.fxp = 0;
    }
  }
}
function decodeNoisetrackerEvent(dst, m, off) {
  dst.note = periodToNote(LSN4(m[off]) << 8 | m[off + 1]);
  dst.ins = MSN4(m[off]) << 4 | MSN4(m[off + 2]);
  const fxt = LSN4(m[off + 2]);
  if (fxt <= 6 || fxt >= 10 && fxt !== 14) {
    dst.fxt = fxt;
    dst.fxp = m[off + 3];
  }
  disableContinueFx4(dst);
}
function fltTest(bytes) {
  if (bytes.length < 1084) return false;
  const buf = bytes.subarray(1080, 1084);
  const isFlt = buf[0] === 70 && buf[1] === 76 && buf[2] === 84;
  const isExo = buf[0] === 69 && buf[1] === 88 && buf[2] === 79;
  if (!isFlt && !isExo) return false;
  return buf[3] === 52 || buf[3] === 56 || buf[3] === 77;
}
var AM_WAVEFORM = [
  new Int8Array([
    0,
    25,
    49,
    71,
    90,
    106,
    117,
    125,
    127,
    125,
    117,
    106,
    90,
    71,
    49,
    25,
    0,
    -25,
    -49,
    -71,
    -90,
    -106,
    -117,
    -125,
    -127,
    -125,
    -117,
    -106,
    -90,
    -71,
    -49,
    -25
  ]),
  new Int8Array([
    -128,
    -120,
    -112,
    -104,
    -96,
    -88,
    -80,
    -72,
    -64,
    -56,
    -48,
    -40,
    -32,
    -24,
    -16,
    -8,
    0,
    8,
    16,
    24,
    32,
    40,
    48,
    56,
    64,
    72,
    80,
    88,
    96,
    104,
    112,
    120
  ]),
  new Int8Array([
    -128,
    -128,
    -128,
    -128,
    -128,
    -128,
    -128,
    -128,
    -128,
    -128,
    -128,
    -128,
    -128,
    -128,
    -128,
    -128,
    127,
    127,
    127,
    127,
    127,
    127,
    127,
    127,
    127,
    127,
    127,
    127,
    127,
    127,
    127,
    127
  ])
];
function isAmInstrument(nt, i) {
  const off = 144 + i * 120;
  if (off + 28 > nt.length) return false;
  if (nt[off] !== 65 || nt[off + 1] !== 77) return false;
  if (readmem16b3(nt, off + 26) > 3) return false;
  return true;
}
function readAmInstrument(nt, i) {
  const off = 144 + i * 120 + 2 + 4;
  if (off >= nt.length) return null;
  const buf = new Uint8Array(30);
  buf.set(nt.subarray(off, Math.min(off + 30, nt.length)).subarray(0, 30));
  const am = {
    l0: readmem16b3(buf, 0),
    a1l: readmem16b3(buf, 2),
    a1s: readmem16b3(buf, 4),
    a2l: readmem16b3(buf, 6),
    a2s: readmem16b3(buf, 8),
    sl: readmem16b3(buf, 10),
    ds: readmem16b3(buf, 12),
    st: readmem16b3(buf, 14),
    rs: readmem16b3(buf, 18),
    wf: readmem16b3(buf, 20),
    p_fall: readmem16b3(buf, 22) << 16 >> 16,
    v_amp: readmem16b3(buf, 24),
    v_spd: readmem16b3(buf, 26),
    fq: readmem16b3(buf, 28)
  };
  let len;
  let data;
  if (am.wf < 3) {
    len = 32;
    data = new Uint8Array(32);
    const wave = AM_WAVEFORM[am.wf];
    for (let k = 0; k < 32; k++) data[k] = wave[k] & 255;
  } else {
    len = 1024;
    data = new Uint8Array(1024);
    let state = (Date.now() & 2147483647) >>> 0;
    const step = () => {
      if (state === 0) state = 1;
      state = (state ^ state << 13) >>> 0;
      state = (state ^ state >>> 17) >>> 0;
      state = state << 5 >>> 0;
      return state;
    };
    step();
    step();
    step();
    for (let j = 0; j < 1024; j++) {
      data[j] = Math.trunc(256 * state / 4294967296) & 255;
      state = step();
    }
  }
  const extras = {
    l0: am.l0,
    a1l: am.a1l,
    a1s: am.a1s,
    a2l: am.a2l,
    a2s: am.a2s,
    sl: am.sl,
    ds: am.ds,
    st: am.st,
    rs: am.rs,
    p_fall: am.p_fall,
    fq: am.fq
    // required to fix toneporta (flt_load.c:296)
  };
  return { extras, data, len, xpo: -12 * am.fq, vde: am.v_amp * 4, vra: am.v_spd };
}
function zeroEnvelope4() {
  return { flags: 0, npt: 0, scl: 0, sus: 0, sue: 0, lps: 0, lpe: 0, x: [], y: [] };
}
function fltLoad(bytes, ctx) {
  if (bytes.length < 1084) throw new ParseError4("FLT: short header");
  const patbuf = bytes.subarray(0, 1084);
  const magic = String.fromCharCode(...patbuf.subarray(1080, 1084));
  const sidecar = ctx.sidecarNt ?? null;
  let amSynth = false;
  let trackerName = "Startrekker";
  if (sidecar && sidecar.length >= 16) {
    const sig = String.fromCharCode(...sidecar.subarray(0, 16));
    if (sig === "ST1.2 ModuleINFO") {
      amSynth = true;
      trackerName = "Startrekker 1.2";
    } else if (sig === "ST1.3 ModuleINFO") {
      amSynth = true;
      trackerName = "Startrekker 1.3";
    } else if (sig === "AudioSculpture10") {
      amSynth = true;
      trackerName = "AudioSculpture 1.0";
    }
  }
  const chn = magic[3] === "4" ? 4 : 8;
  const ins = 31;
  const smp = ins;
  const len = patbuf[950];
  const restartRaw = patbuf[951];
  const xxoRaw = Array.from(patbuf.slice(952, 1080));
  const insHeaders = [];
  for (let i = 0; i < 31; i++) {
    const pos = 20 + i * 30;
    insHeaders.push({
      name: patbuf.subarray(pos, pos + 22),
      size: readmem16b3(patbuf, pos + 22),
      finetune: patbuf[pos + 24],
      volume: patbuf[pos + 25],
      loop_start: readmem16b3(patbuf, pos + 26),
      loop_size: readmem16b3(patbuf, pos + 28)
    });
  }
  const xxo = xxoRaw.map((v) => chn > 4 ? v >> 1 : v);
  let pat = 0;
  for (let i = 0; i < 128; i++) {
    if (xxo[i] > pat) pat = xxo[i];
  }
  pat++;
  const instruments = [];
  const rawSamples = [];
  const amIdx = [];
  for (let i = 0; i < ins; i++) {
    const il = insHeaders[i];
    const xlen = 2 * il.size;
    const lps = 2 * il.loop_start;
    const lpe = lps + 2 * il.loop_size;
    const xflg = il.loop_size > 1 ? SampleFlags4.LOOP : 0;
    const fin = (il.finetune << 4 & 255) << 24 >> 24;
    let xi_nsm_override;
    const sub = {
      vol: il.volume,
      gvl: 64,
      // no QUIRK_INSVOL: load_epilogue (load_helpers.c:377-383)
      pan: -1,
      // XMP_INST_NO_DEFAULT_PAN
      xpo: 0,
      fin,
      vwf: 0,
      vde: 0,
      vra: 0,
      vsw: 0,
      sid: i,
      rvv: 0,
      nna: 0,
      dct: 0,
      dca: 0,
      ifc: 0,
      ifr: 0
    };
    rawSamples.push({
      name: "",
      data: new Uint8Array(0),
      length: xlen,
      loopStart: lps,
      loopEnd: lpe,
      sustainStart: 0,
      sustainEnd: 0,
      finetune: fin,
      volume: il.volume,
      flags: xflg,
      c5spd: C4_PAL_RATE4
    });
    let extras;
    if (amSynth && sidecar && isAmInstrument(sidecar, i)) {
      const am = readAmInstrument(sidecar, i);
      if (am) {
        extras = am.extras;
        sub.xpo = am.xpo;
        sub.vde = am.vde;
        sub.vra = am.vra;
        rawSamples[i] = {
          name: "",
          data: am.data,
          length: am.len,
          loopStart: 0,
          loopEnd: am.len,
          sustainStart: 0,
          sustainEnd: 0,
          finetune: 0,
          volume: il.volume,
          flags: SampleFlags4.LOOP,
          // flt_load.c:273
          c5spd: C4_PAL_RATE4
        };
        amIdx.push(i);
      } else {
        amIdx.push(-1);
      }
    } else {
      amIdx.push(-1);
    }
    if (extras && amIdx[amIdx.length - 1] === i) {
      xi_nsm_override = 1;
    }
    const xi = {
      name: copyAdjust4(il.name, 22),
      volume: 64,
      nsm: xi_nsm_override ?? (xlen > 0 ? 1 : 0),
      // flt_load.c:447
      rls: 4095,
      // flt_load.c:439
      map: Array.from({ length: 121 }, () => 0),
      mapXpo: Array.from({ length: 121 }, () => 0),
      sub: [sub],
      aei: zeroEnvelope4(),
      fei: zeroEnvelope4(),
      pei: zeroEnvelope4(),
      extras
    };
    instruments.push(xi);
  }
  const patlen = 64 * 4 * chn;
  const patterns = [];
  for (let i = 0; i < pat; i++) {
    const tracks = [];
    for (let k = 0; k < chn; k++) {
      const events = [];
      for (let j = 0; j < 64; j++) {
        events.push({ ...EMPTY_EVENT4 });
      }
      tracks.push({ rows: 64, event: events });
    }
    patterns.push({ rows: 64, tracks });
  }
  for (let i = 0; i < pat; i++) {
    const baseFirst = 1084 + i * (chn > 4 ? 2 : 1) * 1024;
    for (let half = 0; half < (chn > 4 ? 2 : 1); half++) {
      const base = baseFirst + half * 1024;
      const src = bytes.subarray(base, base + 1024);
      if (src.length < 1024) throw new ParseError4(`FLT: pattern ${i} truncated`);
      for (let j = 0; j < 64 * 4; j++) {
        const ev = patterns[i].tracks[j % 4 + (chn > 4 ? half * 4 : 0)].event[j >> 2];
        decodeNoisetrackerEvent(ev, src, j * 4);
        if (chn > 4 && half === 1 && ev.fxt === 14) {
          ev.fxt = 0;
          ev.fxp = 0;
        }
      }
    }
  }
  void patlen;
  let filePos = 1084 + pat * (chn > 4 ? 2 : 1) * 1024;
  void amIdx;
  for (let i = 0; i < smp; i++) {
    const raw = rawSamples[i];
    const streamLen = 2 * insHeaders[i].size;
    if (amSynth && sidecar && isAmInstrument(sidecar, i)) {
      filePos += streamLen;
      continue;
    }
    if (raw.loopStart === 0) raw.flags |= SF_FULLREP3;
    if (streamLen !== 0) {
      const remaining = Math.max(0, bytes.length - filePos);
      const take = Math.min(streamLen, remaining);
      raw.data = bytes.subarray(filePos, filePos + take);
      filePos += streamLen;
    }
  }
  for (const raw of rawSamples) ctx.addSample(raw);
  const channels = [];
  for (let i = 0; i < chn; i++) {
    const pan = Math.floor((i + 1) / 2) % 2 * 255;
    channels.push({ pan: Math.min(255, Math.max(0, 128 + (pan - 128))), vol: 64, flg: 0 });
  }
  const mod = {
    title: copyTitle4(patbuf.subarray(0, 20), 20),
    format: "mod",
    comment: "",
    chn,
    pat,
    ins,
    len,
    restart: restartRaw >= len ? 0 : restartRaw,
    xxo,
    channels,
    patterns,
    instruments,
    samples: rawSamples,
    num_sequences: 0,
    sequences: [],
    speed: 6,
    bpm: 125,
    volbase: 64,
    gvolbase: 64,
    gvol: 64,
    // flt_load.c:485-486 comment + QUIRKS_FT2 default (ft2 quirks = 0).
    quirks: 0,
    flowMode: 0,
    readEventType: ReadEventType5.MOD,
    periodType: PeriodType4.AMIGA,
    // prologue default; MODRNG commented out (flt_load.c:499)
    defpan: 128,
    time_factor: 10,
    rrate: 250,
    c4rate: 8287,
    compare_vblank: false,
    tracker: `${trackerName} ${magic}`,
    // flt_load.c:421 snprintf "%s %4.4s"; name already carries 1.2/1.3/AS
    extras: amSynth ? { kind: "flt" } : { kind: "none" }
  };
  void smp;
  void len;
  void restartRaw;
  void xxoRaw;
  return mod;
}
var fltPlugin = {
  name: "flt",
  test: fltTest,
  load: fltLoad,
  readEvent(core, chn, row) {
    readEventDispatch(core, chn, row);
  }
};

// ../../packages/fmt-mod/src/modWrite.ts
var PT_PERIODS = [
  856,
  808,
  762,
  720,
  678,
  640,
  604,
  570,
  538,
  508,
  480,
  453
];
var noteToPeriod2 = (note1) => {
  const key = note1 - 1;
  const oct = Math.floor(key / 12) - 4;
  const semi = key % 12;
  const base = PT_PERIODS[semi] ?? 0;
  if (base === 0) return 0;
  const period = Math.round(base / Math.pow(2, Math.max(0, oct)));
  return period >= 108 ? period : 108;
};
var ByteWriter = class {
  buf = new Uint8Array(1024);
  len = 0;
  ensure(extra) {
    if (this.len + extra > this.buf.length) {
      let size = this.buf.length * 2;
      while (size < this.len + extra) size *= 2;
      const next = new Uint8Array(size);
      next.set(this.buf.subarray(0, this.len));
      this.buf = next;
    }
  }
  u8(v) {
    this.ensure(1);
    this.buf[this.len++] = v & 255;
  }
  u16be(v) {
    this.ensure(2);
    this.buf[this.len++] = v >> 8 & 255;
    this.buf[this.len++] = v & 255;
  }
  bytes(src) {
    this.ensure(src.length);
    this.buf.set(src, this.len);
    this.len += src.length;
  }
  ascii(text, width) {
    this.ensure(width);
    for (let i = 0; i < width; i++) {
      this.buf[this.len++] = i < text.length ? text.charCodeAt(i) & 127 : 0;
    }
  }
  get bytes_() {
    return this.buf.subarray(0, this.len);
  }
};
var writeEvent = (w, e) => {
  const hasNote = e.note > 0 && e.note < 129;
  const period = hasNote ? noteToPeriod2(e.note) : 0;
  const insHi = e.ins >> 4 & 15;
  const insLo = e.ins & 15;
  let fxt = e.fxt;
  let fxp = e.fxp;
  if (fxt > 15) {
    fxt = 0;
    fxp = 0;
  }
  if (fxt === 14) {
    fxt = 0;
    fxp = 0;
  }
  w.u8(insHi << 4 | period >> 8 & 15);
  w.u8(period & 255);
  w.u8(insLo << 4 | fxt & 15);
  w.u8(fxp & 255);
};
var writeMod = (mod) => {
  const w = new ByteWriter();
  const smpCount = Math.min(31, mod.samples.length);
  void mod.chn;
  const patCount = Math.min(mod.pat, 64);
  w.ascii(mod.title || "", 20);
  for (let i = 0; i < 31; i++) {
    const s = i < mod.samples.length ? mod.samples[i] : void 0;
    w.ascii((s?.name ?? "").slice(0, 22), 22);
    if (!s || i >= smpCount) {
      w.u16be(0);
      w.u8(0);
      w.u8(0);
      w.u16be(0);
      w.u16be(0);
    } else {
      const looped = s.loopEnd > s.loopStart;
      w.u16be(Math.ceil(s.length / 2));
      w.u8(s.finetune & 15);
      w.u8(Math.min(64, s.volume));
      w.u16be(looped ? s.loopStart : 0);
      w.u16be(looped ? s.loopEnd - s.loopStart : 0);
    }
  }
  w.u8(Math.min(128, mod.len));
  w.u8(127);
  for (let i = 0; i < 128; i++) {
    w.u8(i < mod.len && (mod.xxo[i] ?? 255) < patCount ? mod.xxo[i] ?? 0 : 255);
  }
  w.ascii("M.K.", 4);
  for (let p = 0; p < patCount; p++) {
    const pat = mod.patterns[mod.xxo[p] ?? p];
    for (let r = 0; r < 64; r++) {
      for (let c = 0; c < 4; c++) {
        const e = pat?.tracks[c]?.event[r];
        if (e) writeEvent(w, e);
        else writeEvent(w, { note: 0, ins: 0, vol: 0, fxt: 0, fxp: 0, f2t: 0, f2p: 0 });
      }
    }
  }
  for (let i = 0; i < smpCount; i++) {
    const s = mod.samples[i];
    if (!s || s.length === 0) continue;
    const signed = new Uint8Array(s.length);
    for (let j = 0; j < s.length; j++) {
      signed[j] = s.data[j] - 128 & 255;
    }
    w.bytes(signed);
  }
  return w.bytes_;
};
var modExportPlugin = () => ({
  name: "mod",
  label: "ProTracker (.mod, M.K.)",
  extension: "mod",
  supports: (mod) => mod.format === "mod",
  write: writeMod
});

// ../../packages/fmt-mod/src/index.ts
var plugin = {
  name: "mod",
  test: modTest,
  load: modLoad,
  readEvent(core, chn, row) {
    readEventDispatch(core, chn, row);
  }
};
var hmnPlugin = {
  name: "hmn",
  test: hmnTest,
  load: hmnLoad,
  readEvent(core, chn, row) {
    readEventDispatch(core, chn, row);
  }
};
export {
  TrackerId,
  decodeEvent,
  fltLoad,
  fltPlugin,
  fltTest,
  hmnLoad,
  hmnPlugin,
  hmnTest,
  isModRetrig2 as isModRetrig,
  isSfxPitch2 as isSfxPitch,
  isToneportaFx2 as isToneportaFx,
  loadDepackedMod,
  modExportPlugin,
  modLoad,
  modTest,
  periodToNote,
  plugin,
  readEventDispatch as readEvent,
  readEventFt23 as readEventFt2,
  readEventMod,
  readEventSt32 as readEventSt3,
  setPatch2 as setPatch
};

// packages/fmt-st/src/st.ts
import { C4_PAL_RATE, PeriodType, Quirk, ReadEventType, SampleFlags } from "@modplayjs/core";
import { LSN, MSN, ParseError } from "@modplayjs/core";
import { readEvent as readEventDispatch, decodeEvent, TrackerId } from "@modplayjs/fmt-mod";
var ST_MAX_PATTERN_ERRORS = 22;
var ST_TRUNCATION_LIMIT = 93;
var PERIOD = [
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
  453,
  428,
  404,
  381,
  360,
  339,
  320,
  302,
  285,
  269,
  254,
  240,
  226,
  214,
  202,
  190,
  180,
  170,
  160,
  151,
  143,
  135,
  127,
  120,
  113,
  // Off-by-one period values found in blueberry.mod, snd.mod,
  // quite a lot.mod, sweet dreams.mod, and bar----fringdus.mod
  763,
  679,
  641,
  571,
  539,
  509,
  429,
  340,
  321,
  300,
  286,
  270,
  227,
  191,
  162,
  -1
];
function stExpectedSize(smpSize, pat) {
  return 600 + smpSize + 1024 * pat;
}
function testName(s, n, flags) {
  const IGNORE_AFTER_0 = 1;
  const IGNORE_AFTER_CR = 2;
  for (let i = 0; i < n && i < s.length; i++) {
    const c = s[i];
    if (c === 0 && (flags & IGNORE_AFTER_0) !== 0) break;
    if (c === 13 && (flags & IGNORE_AFTER_CR) !== 0) break;
    if (c > 127) return false;
    if (c > 0 && c < 32 && c !== 8 && c !== 14) return false;
  }
  return true;
}
function readHeader(bytes) {
  const name = bytes.slice(0, 20);
  if (name[5] === 136) {
    name[5] = 88;
    if (name[4] === 19) name[4] = 88;
  }
  const ins = [];
  for (let i = 0; i < 15; i++) {
    const pos = 20 + i * 30;
    ins.push({
      name: bytes.slice(pos, pos + 22),
      size: bytes[pos + 22] << 8 | bytes[pos + 23],
      finetune: bytes[pos + 24],
      volume: bytes[pos + 25],
      loop_start: bytes[pos + 26] << 8 | bytes[pos + 27],
      loop_size: bytes[pos + 28] << 8 | bytes[pos + 29]
    });
  }
  return {
    name,
    ins,
    len: bytes[470],
    restart: bytes[471],
    order: bytes.slice(472, 600)
  };
}
function stTest(bytes) {
  const size = bytes.length;
  if (size < 600) return false;
  let smpSize = 0;
  const mh = readHeader(bytes);
  const TEST_NAME_IGNORE_AFTER_CR = 2;
  let testFlags = TEST_NAME_IGNORE_AFTER_CR;
  if (!testName(mh.name, 20, testFlags)) return false;
  for (let i = 0; i < 15; i++) {
    const ins = mh.ins[i];
    smpSize += 2 * ins.size;
    if (i === 0) {
      const n = ins.name;
      const eq = (arr) => {
        if (n.length < arr.length) return false;
        for (let k = 0; k < arr.length; k++) {
          if (n[k] !== arr[k]) return false;
        }
        return true;
      };
      if (eq([102, 117, 110, 98, 97, 115, 115, 0, 13]) || // "funbass\0\r"
      eq([115, 116, 45, 54, 57, 58, 98, 97, 115, 101, 108, 105, 110, 101, 0, 82, 0, 0, 165])) {
        testFlags |= 1;
      }
    }
    ins.name[0] = 88;
    if (!testName(ins.name, 22, testFlags)) return false;
    if (ins.volume > 64) return false;
    if ((ins.finetune & 240) !== 0) return false;
    if (ins.size > 32768) return false;
    if (ins.loop_size > 32768) return false;
    if (ins.size === 0 && ins.loop_start === 4462 && ins.loop_size === 2078) {
      continue;
    }
    if (ins.loop_start >> 1 > ins.size) return false;
    if (ins.size !== 0 && ins.loop_start >> 1 === ins.size) return false;
    if (ins.size === 0 && ins.loop_start > 0) return false;
  }
  if (smpSize < 8) return false;
  let pat = 0;
  let patShort = 0;
  for (let i = 0; i < 128; i++) {
    const x = mh.order[i];
    if (x > 127) return false;
    if (x > pat) {
      pat = x;
      if (i < mh.len) patShort = x;
    }
  }
  pat++;
  patShort++;
  if (pat > 127 || mh.len === 0 || mh.len > 128) return false;
  if (size < stExpectedSize(smpSize, pat) && size === stExpectedSize(smpSize, patShort)) {
    pat = patShort;
  }
  let patternErrors = 0;
  let ins0 = 0;
  for (let i = 0; i < pat; i++) {
    const base = 600 + i * 1024;
    if (base + 1024 > size) return false;
    for (let j = 0; j < 64 * 4; j++) {
      const off = base + j * 4;
      const s = bytes[off] & 240 | MSN(bytes[off + 2]);
      if (s > 15) {
        if (++patternErrors > ST_MAX_PATTERN_ERRORS) return false;
      }
      if (s > ins0) ins0 = s;
      const p = 256 * LSN(bytes[off]) + bytes[off + 1];
      if (p === 0) continue;
      let k = 0;
      for (; PERIOD[k] >= 0; k++) {
        if (p === PERIOD[k]) break;
      }
      if (PERIOD[k] < 0) {
        if (++patternErrors > ST_MAX_PATTERN_ERRORS) return false;
      }
    }
  }
  if (size < stExpectedSize(smpSize, pat)) {
    let ss = 0;
    for (let i = 0; i < 15 && i < ins0; i++) {
      ss += 2 * mh.ins[i].size;
    }
    const limit = Math.trunc(stExpectedSize(ss, pat) * ST_TRUNCATION_LIMIT / 100);
    if (size < limit) return false;
  }
  return true;
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
    map: new Array(121).fill(0),
    mapXpo: new Array(121).fill(0),
    sub,
    aei: zeroEnvelope(),
    fei: zeroEnvelope(),
    pei: zeroEnvelope()
  };
}
function copyTitleName(r, n) {
  let s = "";
  for (let i = 0; i < n && i < r.length; i++) {
    const c = r[i];
    if (c === 0) break;
    s += String.fromCharCode(c);
  }
  return s.replace(/ +$/, "");
}
function copyAdjustName(r, n) {
  let s = "";
  for (let i = 0; i < n && i < r.length; i++) {
    const c = r[i];
    if (c === 0) break;
    s += c > 127 || c < 32 || c === 127 ? "." : String.fromCharCode(c);
  }
  return s;
}
function stLoad(bytes, ctx) {
  const size = bytes.length;
  const fail = (msg) => {
    throw new ParseError(msg);
  };
  const mh = readHeader(bytes);
  let ust = 1;
  let smpSize = 0;
  for (let i = 0; i < 15; i++) {
    smpSize += 2 * mh.ins[i].size;
  }
  const len = mh.len;
  let rst = mh.restart;
  if (rst < 64) ust = 0;
  const xxo = Array.from(mh.order);
  let pat = 0;
  let patShort = 0;
  for (let i = 0; i < 128; i++) {
    if (xxo[i] > pat) {
      pat = xxo[i];
      if (i < len) patShort = pat;
    }
  }
  pat++;
  patShort++;
  if (size < stExpectedSize(smpSize, pat) && size === stExpectedSize(smpSize, patShort)) {
    pat = patShort;
  }
  for (let i = 0; i < 15; i++) {
    const ins = mh.ins[i];
    if (ins.finetune !== 0) ust = 0;
    if (ins.size > 4999 || ins.loop_start > 9999 || ins.loop_size > 4999) ust = 0;
  }
  const instruments = [];
  const rawSamples = [];
  for (let i = 0; i < 15; i++) {
    const ins = mh.ins[i];
    const xlen = 2 * ins.size - ins.loop_start;
    const lps = 0;
    const lpe = lps + 2 * ins.loop_size;
    const xflg = ins.loop_size > 1 ? SampleFlags.LOOP : 0;
    const fin = (ins.finetune << 4 & 255) << 24 >> 24;
    const sub = {
      vol: ins.volume,
      gvl: 64,
      // no QUIRK_INSVOL: load_epilogue sets gvl = volbase
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
    const iname = copyAdjustName(ins.name, 22);
    const xxi = zeroInstrument(iname, [sub]);
    if (xlen > 0) xxi.nsm = 1;
    instruments.push(xxi);
    rawSamples.push({
      name: "",
      // st_load never writes xxs->name
      data: new Uint8Array(0),
      length: xlen,
      loopStart: lps,
      loopEnd: lpe,
      sustainStart: 0,
      sustainEnd: 0,
      finetune: fin,
      volume: ins.volume,
      flags: xflg,
      c5spd: C4_PAL_RATE
    });
  }
  const chn = 4;
  const patlen = 64 * 4 * chn;
  const patterns = [];
  let fxused = 0;
  const events = [];
  for (let i = 0; i < pat; i++) {
    const base = 600 + i * 1024;
    if (base + 1024 > size) fail("ST: read error at pattern");
    const patEvents = [];
    const tracks = [];
    for (let k = 0; k < chn; k++) tracks.push({ rows: 64, event: [] });
    for (let j = 0; j < 64 * 4; j++) {
      const row = Math.floor(j / 4);
      const c = j % 4;
      const ev = {
        note: 0,
        ins: 0,
        vol: 0,
        fxt: 0,
        fxp: 0,
        f2t: 0,
        f2p: 0
      };
      decodeEvent(ev, bytes, base + j * 4, TrackerId.PROTRACKER);
      if (ev.fxt) fxused |= 1 << ev.fxt;
      else if (ev.fxp) fxused |= 1;
      if (ev.fxt && ev.fxt !== 1 && ev.fxt !== 2) ust = 0;
      if (ev.fxt === 1) {
        if (ev.fxp === 0) ust = 0;
      }
      if (ev.fxt === 2) {
        if ((ev.fxp & 15) !== 0 && (ev.fxp & 240) !== 0) ust = 0;
      }
      while (patEvents.length <= row) patEvents.push([]);
      patEvents[row][c] = ev;
      tracks[c].event[row] = ev;
    }
    patterns.push({ rows: 64, tracks });
    events.push(patEvents);
  }
  let modtype;
  if ((fxused & ~6) !== 0) ust = 0;
  if (ust !== 0) {
    modtype = "Ultimate Soundtracker";
  } else if ((fxused & ~53255) === 0) {
    modtype = "Soundtracker IX";
  } else if ((fxused & ~63495) === 0) {
    modtype = "D.O.C Soundtracker 2.0";
  } else {
    modtype = "unknown tracker 15 instrument";
  }
  let bpm = 125;
  if (ust !== 0) {
    bpm = rst;
    rst = 0;
    for (let i = 0; i < pat; i++) {
      for (let j = 0; j < 64 * 4; j++) {
        const row = Math.floor(j / 4);
        const c = j % 4;
        const ev = events[i][row][c];
        if (ev.fxt === 1) ev.fxt = 0;
        else if (ev.fxt === 2 && (ev.fxp & 240) === 0) ev.fxt = 1;
        else if (ev.fxt === 2 && (ev.fxp & 15) === 0) ev.fxp >>= 4;
      }
    }
  } else {
    if (rst >= len) rst = 0;
  }
  let filePos = 600 + pat * patlen;
  for (let i = 0; i < 15; i++) {
    const raw = rawSamples[i];
    if (raw.length === 0) {
      ctx.addSample(raw);
      continue;
    }
    filePos += mh.ins[i].loop_start;
    const remaining = Math.max(0, size - filePos);
    const take = Math.min(raw.length, remaining);
    raw.data = bytes.subarray(filePos, filePos + take);
    filePos += raw.length;
    ctx.addSample(raw);
  }
  const channels = [];
  for (let i = 0; i < chn; i++) {
    const pan = Math.floor((i + 1) / 2) % 2 * 255;
    channels.push({ pan: Math.min(255, Math.max(0, 128 + (pan - 128))), vol: 64, flg: 0 });
  }
  const mod = {
    title: copyTitleName(mh.name, 20),
    format: "mod",
    comment: "",
    chn,
    pat,
    ins: 15,
    len,
    restart: rst,
    xxo,
    channels,
    patterns,
    instruments,
    samples: rawSamples,
    num_sequences: 0,
    sequences: [],
    speed: 6,
    bpm,
    volbase: 64,
    gvolbase: 64,
    gvol: 64,
    quirks: Quirk.NOBPM,
    flowMode: 0,
    readEventType: ReadEventType.MOD,
    periodType: PeriodType.MODRNG,
    defpan: 128,
    time_factor: 10,
    rrate: 250,
    c4rate: C4_PAL_RATE,
    compare_vblank: false,
    tracker: modtype
  };
  void ctx.sampleRate;
  void ctx.outputRate;
  return mod;
}
var plugin = {
  name: "st",
  test: stTest,
  load: stLoad,
  readEvent(core, chn, row) {
    readEventDispatch(core, chn, row);
  }
};
export {
  plugin,
  stLoad,
  stTest
};

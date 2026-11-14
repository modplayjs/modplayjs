// ../../packages/fmt-ice/src/ice.ts
import { SampleFlags } from "@modplayjs/core";
import { ParseError } from "@modplayjs/core";
import { FX_ICE_SPEED, FX_SPEED } from "@modplayjs/core";
import { readEventMod, decodeEvent } from "@modplayjs/fmt-mod";
var MAGIC_MTN_ = 1297370624;
var MAGIC_IT10 = 1230254384;
function readmem32b(m, off) {
  return (m[off] << 24 | m[off + 1] << 16 | m[off + 2] << 8 | m[off + 3]) >>> 0;
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
function iceTest(bytes) {
  if (bytes.length < 1468) return false;
  const magic = readmem32b(bytes, 1464);
  return magic === MAGIC_MTN_ || magic === MAGIC_IT10;
}
var TRACKER_PROTRACKER = 0;
function iceLoad(bytes, ctx) {
  let pos = 0;
  const u8 = () => bytes[pos++];
  const u16 = () => {
    const v = bytes[pos] << 8 | bytes[pos + 1];
    pos += 2;
    return v;
  };
  const raw = (n) => {
    const s = bytes.subarray(pos, pos + n);
    pos += n;
    return s;
  };
  const title = raw(20);
  const insHeaders = [];
  for (let i = 0; i < 31; i++) {
    insHeaders.push({
      name: raw(22),
      len: u16(),
      finetune: u8(),
      volume: u8(),
      loopStart: u16(),
      loopSize: u16()
    });
  }
  const len = u8();
  const trk = u8();
  const ord = [];
  for (let i = 0; i < 128; i++) {
    ord.push(Array.from(raw(4)));
  }
  const magic = readmem32b(bytes, pos);
  pos += 4;
  if (len > 128) throw new ParseError("ICE: pattern list too long");
  for (let i = 0; i < len; i++) {
    for (let j = 0; j < 4; j++) {
      if (ord[i][j] >= trk) throw new ParseError("ICE: track number out of range");
    }
  }
  let typeStr;
  if (magic === MAGIC_IT10) {
    typeStr = "Ice Tracker";
  } else if (magic === MAGIC_MTN_) {
    typeStr = "Soundtracker 2.6";
  } else {
    throw new ParseError("ICE: bad magic");
  }
  const chn = 4;
  const instruments = [];
  const rawSamples = [];
  for (let i = 0; i < 31; i++) {
    const h = insHeaders[i];
    const xlen = 2 * h.len;
    const lps = 2 * h.loopStart;
    const lpe = lps + 2 * h.loopSize;
    const xflg = h.loopSize > 1 ? SampleFlags.LOOP : 0;
    const sub = {
      vol: h.volume,
      gvl: 0,
      pan: -1,
      // XMP_INST_NO_DEFAULT_PAN
      xpo: 0,
      fin: 0,
      // finetune assignment commented out upstream
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
    const nameStr = "";
    const xi = zeroInstrument(nameStr, [sub]);
    if (xlen > 0) xi.nsm = 1;
    instruments.push(xi);
    rawSamples.push({
      name: nameStr,
      data: new Uint8Array(0),
      length: xlen,
      loopStart: lps,
      loopEnd: lpe,
      sustainStart: 0,
      sustainEnd: 0,
      finetune: 0,
      volume: h.volume,
      flags: xflg,
      c5spd: 8287
      // prologue PAL default
    });
  }
  const trackBank = [];
  for (let t = 0; t < trk; t++) {
    const events = [];
    for (let j = 0; j < 64; j++) {
      const ev = raw(4);
      if (ev.length < 4) throw new ParseError(`ICE: read error at track ${t}`);
      const e = { note: 0, ins: 0, vol: 0, fxt: 0, fxp: 0, f2t: 0, f2p: 0 };
      decodeEvent(e, ev, 0, TRACKER_PROTRACKER);
      if (e.fxt === FX_SPEED) {
        if ((e.fxp & 240) >> 4 !== 0 && (e.fxp & 15) !== 0) {
          e.fxt = FX_ICE_SPEED;
        }
      }
      events.push(e);
    }
    trackBank.push(events);
  }
  const patterns = [];
  const xxo = [];
  for (let i = 0; i < len; i++) {
    const tracksArr = [];
    for (let j = 0; j < chn; j++) {
      tracksArr.push({ rows: 64, event: trackBank[ord[i][j]] });
    }
    patterns.push({ rows: 64, tracks: tracksArr });
    xxo.push(i);
  }
  const periodType = 1;
  let samplePos = pos;
  for (let i = 0; i < 31; i++) {
    const rawS = rawSamples[i];
    if (rawS.length <= 4) {
      ctx.addSample(rawS);
      continue;
    }
    const take = Math.min(rawS.length, Math.max(0, bytes.length - samplePos));
    rawS.data = bytes.subarray(samplePos, samplePos + take);
    samplePos += rawS.length;
    ctx.addSample(rawS);
  }
  const chan = [];
  for (let k = 0; k < chn; k++) {
    const pan = Math.floor((k + 1) / 2) % 2 * 255;
    chan.push({ pan: Math.min(255, Math.max(0, 128 + (pan - 128))), vol: 64, flg: 0 });
  }
  const mod = {
    // strncpy(mod->name, ih.title, 20): NUL-terminated C string semantics.
    title: String.fromCharCode(...title).replace(/\0.*$/, ""),
    format: "ice",
    comment: "",
    chn,
    pat: len,
    ins: 31,
    len,
    restart: 0,
    xxo,
    channels: chan,
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
    quirks: 0,
    flowMode: 0,
    readEventType: 0,
    // READ_EVENT_MOD
    periodType,
    defpan: 128,
    time_factor: 10,
    rrate: 250,
    c4rate: 8287,
    // PAL prologue default
    compare_vblank: false,
    tracker: typeStr
  };
  void ctx.sampleRate;
  void ctx.outputRate;
  return mod;
}
var plugin = {
  name: "ice",
  test: iceTest,
  load: iceLoad,
  readEvent(core, chn, row) {
    const mod = core.module;
    const e = core.readEventScratch(chn) ?? core.readEventAt(mod.xxo[core.ctx.p.ord] ?? 0, chn, row);
    readEventMod(core, e, chn);
  }
};
export {
  iceLoad,
  iceTest,
  plugin
};

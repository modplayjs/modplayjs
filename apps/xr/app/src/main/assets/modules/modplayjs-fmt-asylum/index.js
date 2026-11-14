// ../../packages/fmt-asylum/src/asylum.ts
import { SampleFlags } from "@modplayjs/core";
import { ParseError } from "@modplayjs/core";
import { FX_MULTI_RETRIG } from "@modplayjs/core";
import { readEventMod } from "@modplayjs/fmt-mod";
function readmem32l(m, off) {
  return (m[off] | m[off + 1] << 8 | m[off + 2] << 16 | m[off + 3] << 24) >>> 0;
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
var MAGIC = "ASYLUM Music Format V1.0";
function asylumTest(bytes) {
  if (bytes.length < 32) return false;
  for (let i = 0; i < 24; i++) {
    if (bytes[i] !== MAGIC.charCodeAt(i)) return false;
  }
  for (let i = 24; i < 32; i++) {
    if (bytes[i] !== 0) return false;
  }
  return true;
}
function asylumLoad(bytes, ctx) {
  let pos = 32;
  const u8 = () => bytes[pos++];
  const raw = (n) => {
    const s = bytes.subarray(pos, pos + n);
    pos += n;
    return s;
  };
  const spd = u8();
  const bpm = u8();
  const ins = u8();
  const pat = u8();
  const len = u8();
  const rst = u8();
  if (ins > 64) throw new ParseError(`ASYLUM: invalid sample count ${ins}`);
  const xxoRaw = raw(len);
  pos = 294;
  const chn = 8;
  const instruments = [];
  const rawSamples = [];
  for (let i = 0; i < ins; i++) {
    const insbuf = raw(37);
    if (insbuf.length < 37) throw new ParseError(`ASYLUM: instrument ${i} truncated`);
    const nameStr = copyAdjust(insbuf.subarray(0, 22), 22);
    const fin = (insbuf[22] << 4 & 255) << 24 >> 24;
    const vol = insbuf[23];
    const xpo = insbuf[24] << 24 >> 24;
    const xlen = readmem32l(insbuf, 25);
    const lps = readmem32l(insbuf, 29);
    const lpe = lps + readmem32l(insbuf, 33);
    if (xlen >= 131072) throw new ParseError(`ASYLUM: invalid sample ${i} length ${xlen}`);
    const xflg = lpe > 2 ? SampleFlags.LOOP : 0;
    const sub = {
      vol,
      gvl: 64,
      // no QUIRK_INSVOL: load_epilogue sets gvl = volbase (load_helpers.c:377-383)
      pan: -1,
      // XMP_INST_NO_DEFAULT_PAN
      xpo,
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
    const xi = {
      name: nameStr,
      volume: 64,
      nsm: 0,
      // set to 1 only after sample load succeeds (:176-180)
      rls: 0,
      map: new Array(121).fill(0),
      mapXpo: new Array(121).fill(0),
      sub: [sub],
      aei: { flags: 0, npt: 0, scl: 0, sus: 0, sue: 0, lps: 0, lpe: 0, x: [], y: [] },
      fei: { flags: 0, npt: 0, scl: 0, sus: 0, sue: 0, lps: 0, lpe: 0, x: [], y: [] },
      pei: { flags: 0, npt: 0, scl: 0, sus: 0, sue: 0, lps: 0, lpe: 0, x: [], y: [] }
    };
    instruments.push(xi);
    rawSamples.push({
      // The C loader names only the INSTRUMENT — xxs->name stays empty.
      name: "",
      data: new Uint8Array(0),
      length: xlen,
      loopStart: lps,
      loopEnd: lpe,
      sustainStart: 0,
      sustainEnd: 0,
      finetune: fin,
      volume: vol,
      flags: xflg,
      c5spd: 8287
      // prologue PAL default
    });
  }
  pos += 37 * (64 - ins);
  const patterns = [];
  for (let i = 0; i < pat; i++) {
    const buf = raw(2048);
    if (buf.length < 2048) throw new ParseError(`ASYLUM: pattern ${i} truncated`);
    const tracksArr = [];
    for (let k = 0; k < chn; k++) {
      const events = [];
      for (let j = 0; j < 64; j++) {
        events.push({ note: 0, ins: 0, vol: 0, fxt: 0, fxp: 0, f2t: 0, f2p: 0 });
      }
      tracksArr.push({ rows: 64, event: events });
    }
    const pattern = { rows: 64, tracks: tracksArr };
    let p = 0;
    for (let j = 0; j < 64 * 8; j++) {
      const e = pattern.tracks[j % 8].event[Math.trunc(j / 8)];
      const note = buf[p++];
      if (note !== 0) {
        e.note = note + 13;
      }
      e.ins = buf[p++];
      e.fxt = buf[p++];
      e.fxp = buf[p++];
      if (e.fxt >= 16 && e.fxt !== FX_MULTI_RETRIG) {
        e.fxt = 0;
        e.fxp = 0;
      }
    }
    patterns.push(pattern);
  }
  let samplePos = pos;
  for (let i = 0; i < ins; i++) {
    const rawS = rawSamples[i];
    if (rawS.length > 1) {
      const take = Math.min(rawS.length, Math.max(0, bytes.length - samplePos));
      rawS.data = bytes.subarray(samplePos, samplePos + take);
      samplePos += rawS.length;
      instruments[i].nsm = 1;
    }
    ctx.addSample(rawS);
  }
  const chan = [];
  for (let k = 0; k < chn; k++) {
    const pan = Math.floor((k + 1) / 2) % 2 * 255;
    chan.push({ pan: Math.min(255, Math.max(0, 128 + (pan - 128))), vol: 64, flg: 0 });
  }
  const xxo = [];
  for (let i = 0; i < len; i++) xxo.push(xxoRaw[i]);
  const mod = {
    title: "",
    format: "amf",
    comment: "",
    chn,
    pat,
    ins,
    len,
    restart: rst,
    xxo,
    channels: chan,
    patterns,
    instruments,
    samples: rawSamples,
    num_sequences: 0,
    sequences: [],
    speed: spd,
    bpm,
    volbase: 64,
    gvolbase: 64,
    gvol: 64,
    quirks: 0,
    flowMode: 0,
    readEventType: 0,
    // READ_EVENT_MOD
    periodType: 0,
    // PERIOD_AMIGA (prologue default)
    defpan: 128,
    time_factor: 10,
    rrate: 250,
    c4rate: 8287,
    // PAL prologue default — asylum never sets c4rate
    compare_vblank: false,
    tracker: "Asylum Music Format v1.0"
  };
  void ctx.sampleRate;
  void ctx.outputRate;
  return mod;
}
var plugin = {
  name: "asylum",
  test: asylumTest,
  load: asylumLoad,
  readEvent(core, chn, row) {
    const mod = core.module;
    const e = core.readEventScratch(chn) ?? core.readEventAt(mod.xxo[core.ctx.p.ord] ?? 0, chn, row);
    readEventMod(core, e, chn);
  }
};
export {
  asylumLoad,
  asylumTest,
  plugin
};

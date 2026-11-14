// ../../packages/fmt-669/src/sixtysixtynine.ts
import { SampleFlags } from "@modplayjs/core";
import { LSN, MSN } from "@modplayjs/core";
import { ParseError } from "@modplayjs/core";
import {
  FX_BREAK,
  FX_PER_CANCEL,
  FX_SPEED_CP,
  FX_669_FINETUNE,
  FX_669_PORTA_DN,
  FX_669_PORTA_UP,
  FX_669_TPORTA,
  FX_669_VIBRATO
} from "@modplayjs/core";
import { PeriodType, Quirk } from "@modplayjs/core";
import { readEventMod } from "@modplayjs/fmt-mod";
var MAX_SAMPLE_SIZE = 268435456;
var SAMPLE_FLAG_UNS = 1 << 10;
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
function c669Test(bytes) {
  if (bytes.length < 241) return false;
  const id = bytes[0] << 8 | bytes[1];
  if (id !== 26982 && id !== 19022) return false;
  if (bytes[110] > 64) return false;
  if (bytes[111] > 128) return false;
  if (bytes[240] !== 255) return false;
  return true;
}
var fxTable = [
  FX_669_PORTA_UP,
  FX_669_PORTA_DN,
  FX_669_TPORTA,
  FX_669_FINETUNE,
  FX_669_VIBRATO,
  FX_SPEED_CP
];
function c669Load(bytes, ctx) {
  let pos = 0;
  const u8 = () => bytes[pos++];
  const u32 = () => {
    const v = readmem32l(bytes, pos);
    pos += 4;
    return v;
  };
  const raw = (n) => {
    const s = bytes.subarray(pos, pos + n);
    pos += n;
    return s;
  };
  const marker = raw(2);
  const message = raw(108);
  const nos = u8();
  const nop = u8();
  if (nos > 64 || nop > 128) throw new ParseError("669: bad sample/pattern count");
  const loop = u8();
  void loop;
  const order = raw(128);
  const speed = raw(128);
  const pbrkTable = raw(128);
  const chn = 8;
  const ins = nos;
  const pat = nop;
  let len = 0;
  for (let i = 0; i < 128; i++) {
    if (order[i] > nop) break;
    len = i + 1;
  }
  const xxo = [];
  for (let i = 0; i < len; i++) xxo.push(order[i]);
  const periodType = PeriodType.CSPD;
  const c4rate = 8363;
  const markerStr = String.fromCharCode(marker[0], marker[1]);
  const typeStr = markerStr === "if" ? "Composer 669" : "UNIS 669";
  let comment = "";
  for (let i = 0; i < 108; i++) comment += String.fromCharCode(message[i]);
  comment = comment.replace(/\0.*$/, "");
  const instruments = [];
  const rawSamples = [];
  for (let i = 0; i < ins; i++) {
    const iname = raw(13);
    const ilength = u32();
    if (ilength > MAX_SAMPLE_SIZE) throw new ParseError("669: sample too large");
    const iloopStart = u32();
    const iloopend = u32();
    const lpe = iloopend >= 1048575 ? 0 : iloopend;
    const xflg = lpe !== 0 ? SampleFlags.LOOP : 0;
    const sub = {
      vol: 64,
      gvl: 64,
      // no QUIRK_INSVOL: load_epilogue sets gvl = volbase (load_helpers.c:377-383)
      pan: -1,
      // XMP_INST_NO_DEFAULT_PAN
      xpo: 0,
      fin: 0,
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
    const nameStr = copyAdjust(iname, 13);
    const xi = zeroInstrument(nameStr, [sub]);
    if (ilength > 0) xi.nsm = 1;
    instruments.push(xi);
    rawSamples.push({
      // The C loader names only the INSTRUMENT — xxs->name stays empty.
      name: "",
      data: new Uint8Array(0),
      length: ilength,
      loopStart: iloopStart,
      loopEnd: lpe,
      sustainStart: 0,
      sustainEnd: 0,
      finetune: 0,
      volume: 64,
      flags: xflg,
      c5spd: c4rate
    });
  }
  const patterns = [];
  for (let i = 0; i < pat; i++) {
    const tracksArr = [];
    for (let k = 0; k < chn; k++) {
      const events = [];
      for (let j = 0; j < 64; j++) {
        events.push({ note: 0, ins: 0, vol: 0, fxt: 0, fxp: 0, f2t: 0, f2p: 0 });
      }
      tracksArr.push({ rows: 64, event: events });
    }
    const pattern = { rows: 64, tracks: tracksArr };
    const ev00 = pattern.tracks[0].event[0];
    ev00.f2t = FX_SPEED_CP;
    ev00.f2p = speed[i];
    const pbrk = pbrkTable[i];
    if (pbrk >= 64) throw new ParseError("669: bad break row");
    const evBrk = pattern.tracks[1].event[pbrk];
    evBrk.f2t = FX_BREAK;
    evBrk.f2p = 0;
    for (let j = 0; j < 64 * 8; j++) {
      const e = pattern.tracks[j % 8].event[Math.trunc(j / 8)];
      const ev = raw(3);
      if (ev.length < 3) throw new ParseError(`669: read error at pattern ${i}`);
      if ((ev[0] & 254) !== 254) {
        e.note = 1 + 36 + (ev[0] >> 2);
        e.ins = 1 + MSN(ev[1]) + ((ev[0] & 3) << 4);
      }
      if (ev[0] !== 255) {
        e.vol = (LSN(ev[1]) << 2) + 1;
      }
      if (ev[2] !== 255) {
        if (MSN(ev[2]) >= fxTable.length) continue;
        e.fxt = fxTable[MSN(ev[2])];
        e.fxp = LSN(ev[2]);
        if (e.fxt === FX_SPEED_CP) {
          e.f2t = FX_PER_CANCEL;
        }
      }
    }
    patterns.push(pattern);
  }
  let samplePos = pos;
  for (let i = 0; i < ins; i++) {
    const rawS = rawSamples[i];
    if (rawS.length <= 2) {
      rawS.data = new Uint8Array(0);
      ctx.addSample(rawS);
      continue;
    }
    const take = Math.min(rawS.length, Math.max(0, bytes.length - samplePos));
    rawS.data = bytes.subarray(samplePos, samplePos + take);
    rawS.flags |= SAMPLE_FLAG_UNS;
    samplePos += rawS.length;
    ctx.addSample(rawS);
  }
  const chan = [];
  for (let k = 0; k < chn; k++) {
    const pan = k % 2 * 255;
    chan.push({ pan: Math.min(255, Math.max(0, 128 + (pan - 128))), vol: 64, flg: 0 });
  }
  const quirkFlags = Quirk.PBALL | Quirk.PERPAT;
  const mod = {
    title: copyAdjust(message, 36),
    format: "669",
    comment,
    chn,
    pat,
    ins,
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
    bpm: 78,
    volbase: 64,
    gvolbase: 64,
    gvol: 64,
    quirks: quirkFlags,
    flowMode: 0,
    readEventType: 0,
    // READ_EVENT_MOD
    periodType,
    defpan: 128,
    time_factor: 10,
    rrate: 250,
    c4rate,
    compare_vblank: false,
    tracker: typeStr
  };
  void ctx.sampleRate;
  void ctx.outputRate;
  return mod;
}
var plugin = {
  name: "669",
  test: c669Test,
  load: c669Load,
  readEvent(core, chn, row) {
    const mod = core.module;
    const e = core.readEventScratch(chn) ?? core.readEventAt(mod.xxo[core.ctx.p.ord] ?? 0, chn, row);
    readEventMod(core, e, chn);
  }
};
export {
  c669Load,
  c669Test,
  plugin
};

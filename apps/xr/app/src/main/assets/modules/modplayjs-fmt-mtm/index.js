// packages/fmt-mtm/src/mtm.ts
import { SampleFlags } from "@modplayjs/core";
import { LSN, MSN } from "@modplayjs/core";
import { ParseError } from "@modplayjs/core";
import {
  FX_BREAK,
  FX_EXTENDED,
  FX_IT_BREAK,
  FX_SETPAN,
  FX_SPEED
} from "@modplayjs/core";
import { readEventMod } from "@modplayjs/fmt-mod";
var MAX_SAMPLE_SIZE = 268435456;
var XMP_MAX_CHANNELS = 64;
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
function readmem16l(m, off) {
  return m[off] | m[off + 1] << 8;
}
function readmem32l(m, off) {
  return (m[off] | m[off + 1] << 8 | m[off + 2] << 16 | m[off + 3] << 24) >>> 0;
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
function mtmTest(bytes) {
  if (bytes.length < 4) return false;
  if (bytes[0] !== 77 || bytes[1] !== 84 || bytes[2] !== 77) return false;
  if (bytes[3] !== 16) return false;
  return true;
}
function mtmLoad(bytes, ctx) {
  let pos = 0;
  const u8 = () => bytes[pos++];
  const u16 = () => {
    const v = readmem16l(bytes, pos);
    pos += 2;
    return v;
  };
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
  const magic = raw(3);
  if (magic[0] !== 77 || magic[1] !== 84 || magic[2] !== 77) {
    throw new ParseError("MTM: bad magic");
  }
  const version = u8();
  const name = raw(20);
  const tracks = u16();
  const patternCount = u8();
  const modlen = u8();
  const extralen = u16();
  const samples = u8();
  if (samples > 63) throw new ParseError("MTM: too many samples");
  const attr = u8();
  void attr;
  const rows = u8();
  if (rows !== 64) throw new ParseError("MTM: rows != 64");
  const channels = u8();
  if (channels > Math.min(32, XMP_MAX_CHANNELS)) throw new ParseError("MTM: too many channels");
  const pan = raw(32);
  const trk = tracks + 1;
  const patCount = patternCount + 1;
  const len = modlen + 1;
  const ins = samples;
  const instruments = [];
  const rawSamples = [];
  for (let i = 0; i < ins; i++) {
    const iname = raw(22);
    const ilength = u32();
    if (ilength > MAX_SAMPLE_SIZE) throw new ParseError("MTM: sample too large");
    const loopStart = u32();
    const loopend = u32();
    const finetune = u8();
    const volume = u8();
    const iattr = u8();
    let xlen = ilength;
    let lps = loopStart;
    let lpe = loopend;
    let xflg = lpe > 2 ? SampleFlags.LOOP : 0;
    if ((iattr & 1) !== 0) {
      xflg |= SampleFlags.BITS16;
      xlen >>= 1;
      lps >>= 1;
      lpe >>= 1;
    }
    const sub = {
      vol: volume,
      gvl: 64,
      // no QUIRK_INSVOL: load_epilogue sets gvl = volbase (load_helpers.c:377-383)
      pan: -1,
      // XMP_INST_NO_DEFAULT_PAN
      xpo: 0,
      fin: (finetune << 4 & 255) << 24 >> 24,
      // (int8)(finetune << 4)
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
    const nameStr = copyAdjust(iname, 22);
    const xi = zeroInstrument(nameStr, [sub]);
    if (xlen > 0) xi.nsm = 1;
    instruments.push(xi);
    rawSamples.push({
      // mtm_load.c names only the INSTRUMENT (libxmp_instrument_name,
      // mtm_load.c:178) — xxs->name stays empty in C.
      name: "",
      data: new Uint8Array(0),
      // filled below
      length: xlen,
      loopStart: lps,
      loopEnd: lpe,
      sustainStart: 0,
      sustainEnd: 0,
      finetune: sub.fin,
      volume,
      flags: xflg,
      // libxmp_init_instrument (loaders/common.c:63): xtra[i].c5spd = m->c4rate.
      // MTM never overrides c4rate → PAL prologue default (8287).
      c5spd: 8287
    });
  }
  const xxoRaw = raw(128);
  const xxo = [];
  for (let i = 0; i < len && i < 128; i++) xxo.push(xxoRaw[i]);
  const trackBank = [];
  {
    const ev = [];
    for (let j = 0; j < rows; j++) ev.push({ note: 0, ins: 0, vol: 0, fxt: 0, fxp: 0, f2t: 0, f2p: 0 });
    trackBank.push(ev);
  }
  let fxxLow = 0;
  let fxxHigh = 0;
  for (let i = 1; i < trk; i++) {
    const mt = raw(3 * 64);
    if (mt.length < 3 * 64) throw new ParseError("MTM: track data truncated");
    const ev = [];
    for (let j = 0; j < 64; j++) {
      const d = j * 3;
      const e = { note: 0, ins: 0, vol: 0, fxt: 0, fxp: 0, f2t: 0, f2p: 0 };
      e.note = mt[d] >> 2;
      if (e.note !== 0) e.note += 37;
      e.ins = (mt[d] & 3) << 4 | MSN(mt[d + 1]);
      e.fxt = LSN(mt[d + 1]);
      e.fxp = mt[d + 2];
      if (e.fxt > FX_SPEED) {
        e.fxt = 0;
        e.fxp = 0;
      }
      if (e.fxt === FX_BREAK) e.fxt = FX_IT_BREAK;
      if (e.fxt === FX_SPEED) {
        if (e.fxp >= 32) fxxHigh = 1;
        else fxxLow = 1;
      }
      if (e.fxt === FX_EXTENDED && MSN(e.fxp) === 8) {
        e.fxt = FX_SETPAN;
        e.fxp <<= 4;
      }
      ev.push(e);
    }
    trackBank.push(ev);
  }
  const patterns = [];
  for (let i = 0; i < patCount; i++) {
    const index = [];
    for (let j = 0; j < 32; j++) {
      let track = u16();
      if (track >= trk) track = 0;
      if (j < channels) index.push(track);
    }
    const tracksArr = [];
    for (let j = 0; j < channels; j++) {
      tracksArr.push({ rows, event: trackBank[index[j]] });
    }
    patterns.push({ rows, tracks: tracksArr });
  }
  if (fxxLow !== 0 && fxxHigh !== 0) {
    let dmp = false;
    outer: for (let i = 0; i < patCount; i++) {
      for (let j = 0; j < rows; j++) {
        let lo = 0;
        let hi = 0;
        for (let k = 0; k < channels; k++) {
          const e2 = patterns[i].tracks[k].event[j];
          if (e2.fxt === FX_SPEED) {
            if (e2.fxp >= 32) hi = 1;
            else lo = 1;
          }
        }
        if (lo !== 0 && hi !== 0) {
          dmp = true;
          break outer;
        }
      }
    }
    if (!dmp) {
      for (let i = 0; i < patCount; i++) {
        for (let j = 0; j < channels; j++) {
          for (const e of patterns[i].tracks[j].event) {
            if (e.fxt === FX_SPEED) {
              e.f2t = FX_SPEED;
              e.f2p = e.fxp < 32 ? 125 : 6;
            }
          }
        }
      }
    }
  }
  let comment = "";
  if (extralen !== 0) {
    const cbuf = raw(extralen);
    let lastLine = 0;
    for (let i = 0; i + 40 <= cbuf.length; i += 40) {
      if (cbuf[i] !== 0) lastLine = i + 40;
    }
    for (let line = 0; line < lastLine; line += 40) {
      for (let i = 0; i < 39; i++) {
        const c = cbuf[line + i];
        if (c === 0) break;
        comment += String.fromCharCode(c);
      }
      comment += "\n";
    }
  }
  let sampleDataPos = pos;
  for (let i = 0; i < ins; i++) {
    const rawS = rawSamples[i];
    const is16bit = (rawS.flags & SampleFlags.BITS16) !== 0;
    const bytelen = rawS.length * (is16bit ? 2 : 1);
    const remaining = bytes.length - sampleDataPos;
    const take = Math.min(bytelen, Math.max(0, remaining));
    rawS.data = bytes.subarray(sampleDataPos, sampleDataPos + take);
    rawS.flags |= SAMPLE_FLAG_UNS;
    sampleDataPos += bytelen;
    ctx.addSample(rawS);
  }
  const chan = [];
  for (let i = 0; i < channels; i++) {
    chan.push({ pan: pan[i] << 4, vol: 64, flg: 0 });
  }
  const mod = {
    title: copyTitle(name, 20),
    format: "mtm",
    comment,
    chn: channels,
    pat: patCount,
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
    bpm: 125,
    volbase: 64,
    gvolbase: 64,
    gvol: 64,
    quirks: 0,
    flowMode: 0,
    readEventType: 0,
    // READ_EVENT_MOD
    periodType: 0,
    defpan: 128,
    time_factor: 10,
    rrate: 250,
    // mtm_load.c never sets c4rate — libxmp_load_prologue default applies
    // (load_helpers.c:302): m->c4rate = C4_PAL_RATE (8287).
    c4rate: 8287,
    compare_vblank: false,
    tracker: `MultiTracker ${version >> 4}.${String(version & 15).padStart(2, "0")} MTM`
  };
  void ctx.sampleRate;
  void ctx.outputRate;
  return mod;
}
var plugin = {
  name: "mtm",
  test: mtmTest,
  load: mtmLoad,
  readEvent(core, chn, row) {
    const mod = core.module;
    const e = core.readEventScratch(chn) ?? core.readEventAt(mod.xxo[core.ctx.p.ord] ?? 0, chn, row);
    readEventMod(core, e, chn);
  }
};
export {
  mtmLoad,
  mtmTest,
  plugin
};

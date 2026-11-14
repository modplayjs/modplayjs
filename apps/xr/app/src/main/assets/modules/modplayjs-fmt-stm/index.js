// ../../packages/fmt-stm/src/stm.ts
import { SampleFlags } from "@modplayjs/core";
import { LSN, MSN } from "@modplayjs/core";
import { ParseError } from "@modplayjs/core";
import {
  FX_ARPEGGIO,
  FX_BREAK,
  FX_JUMP,
  FX_PORTA_DN,
  FX_PORTA_UP,
  FX_S3M_BPM,
  FX_S3M_SPEED,
  FX_SPEED,
  FX_TONEPORTA,
  FX_TREMOR,
  FX_VIBRATO,
  FX_VOLSLIDE
} from "@modplayjs/core";
import { FLOW_MODE_ST2, Quirk, QUIRKS_ST3, XMP_KEY_OFF } from "@modplayjs/core";
import { readEventSt3 } from "@modplayjs/core";
var STM_MIX_RATE = 23863;
var STM_TYPE_SONG = 1;
var STM_TYPE_MODULE = 2;
var XMP_MIN_BPM = 20;
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
function copyAdjust(r, n) {
  let s = "";
  for (let i = 0; i < n && i < r.length; i++) {
    const c = r[i];
    if (c === 0) break;
    s += c > 127 || c < 32 || c === 127 ? "." : String.fromCharCode(c);
  }
  return s.replace(/ +$/, "");
}
function testName(s, n) {
  for (let i = 0; i < n && i < s.length; i++) {
    if (s[i] > 127) return false;
    if (s[i] > 0 && s[i] < 32 && s[i] !== 8 && s[i] !== 14) return false;
  }
  return true;
}
function c2spdToNote(c2spd) {
  if (c2spd <= 0) return { n: 0, f: 0 };
  const c = Math.trunc(1536 * Math.log(c2spd / 8363) / Math.LN2);
  return { n: Math.trunc(c / 128), f: c % 128 };
}
function stmTest(bytes) {
  if (bytes.length < 64) return false;
  const buf = bytes.subarray(20, 28);
  if (!testName(buf, 8)) return false;
  if (bytes[28] !== 26 && bytes[28] !== 2) return false;
  if (bytes[29] > STM_TYPE_MODULE) return false;
  const version = 100 * bytes[30] + bytes[31];
  if (version !== 110 && version !== 200 && version !== 210 && version !== 220 && version !== 221) {
    return false;
  }
  if (bytes[60] === 83 && bytes[61] === 67 && bytes[62] === 82 && bytes[63] === 77) {
    return false;
  }
  return true;
}
var FX_NONE_VAL = 255;
var fxTable = [
  FX_NONE_VAL,
  FX_SPEED,
  // A - set tempo
  FX_JUMP,
  // B - break pattern + jump to order
  FX_BREAK,
  // C - break pattern
  FX_VOLSLIDE,
  // D - volume slide
  FX_PORTA_DN,
  // E - slide down
  FX_PORTA_UP,
  // F - slide up
  FX_TONEPORTA,
  // G - tone portamento
  FX_VIBRATO,
  // H - vibrato
  FX_TREMOR,
  // I - tremor
  FX_ARPEGGIO,
  // J - arpeggio
  FX_NONE_VAL,
  FX_NONE_VAL,
  FX_NONE_VAL,
  FX_NONE_VAL,
  FX_NONE_VAL
];
function stmCalculateBpm(spd, tempoFactor) {
  const speedFactor = [140, 50, 25, 15, 10, 7, 6, 4, 3, 3, 2, 2, 2, 2, 1, 1];
  const divisor = 50 - (speedFactor[spd] * tempoFactor >> 4);
  let tickFrames = divisor !== 0 ? Math.trunc(STM_MIX_RATE / divisor) : -1;
  tickFrames = tickFrames >>> 0 & 65535;
  if (tickFrames === 0) return XMP_MIN_BPM;
  return Math.trunc((STM_MIX_RATE * 5 + tickFrames) / (tickFrames * 2));
}
function stmConvertTempo(tempo, version) {
  let spd;
  let bpm;
  if (version >= 221) {
    spd = MSN(tempo);
    bpm = stmCalculateBpm(spd, LSN(tempo));
  } else if (version >= 110) {
    spd = Math.trunc(tempo / 10);
    bpm = stmCalculateBpm(Math.min(spd, 15), tempo % 10);
  } else {
    spd = tempo;
    bpm = 125;
  }
  spd = Math.max(spd, 1);
  bpm = Math.max(bpm, XMP_MIN_BPM);
  return { spd, bpm };
}
function stmLoad(bytes, ctx) {
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
  const name = raw(20);
  const magic = raw(8);
  const rsvd1 = u8();
  void rsvd1;
  const type = u8();
  const vermaj = u8();
  const vermin = u8();
  const version = 100 * vermaj + vermin;
  if (version !== 110 && version !== 200 && version !== 210 && version !== 220 && version !== 221) {
    throw new ParseError(`STM: unknown version ${version}`);
  }
  let chn;
  let pat;
  let ins;
  let len;
  let spd;
  let bpm;
  let gvol = 64;
  if (version >= 200) {
    const tempo = u8();
    const patterns2 = u8();
    gvol = u8();
    raw(13);
    chn = 4;
    pat = patterns2;
    const t = stmConvertTempo(tempo, version);
    spd = t.spd;
    bpm = t.bpm;
    ins = 31;
    len = version === 200 ? 64 : 128;
  } else {
    const insnum = u16();
    if (insnum > 32) throw new ParseError(`STM: too many instruments ${insnum}`);
    const ordnum = u16();
    if (ordnum > 256) throw new ParseError(`STM: too many orders ${ordnum}`);
    const patnum = u16();
    if (patnum > 256) throw new ParseError(`STM: too many patterns ${patnum}`);
    u16();
    const tempo = u8();
    const channels = u8();
    if (channels !== 4) throw new ParseError(`STM: wrong channel count ${channels}`);
    const psize = u16();
    if (psize !== 64) throw new ParseError(`STM: wrong rows per pattern ${psize}`);
    u16();
    const skip = u16();
    pos += skip;
    chn = channels;
    pat = patnum;
    const t = stmConvertTempo(tempo, version);
    spd = t.spd;
    bpm = t.bpm;
    ins = insnum;
    len = ordnum;
  }
  const insHeaders = [];
  const insCount = version >= 200 ? 31 : ins;
  for (let i2 = 0; i2 < insCount; i2++) {
    const iname = raw(13);
    u8();
    const irsvd1 = u16();
    const ilength = u16();
    const iloopbeg = u16();
    const iloopend = u16();
    const ivolume = u8();
    u8();
    const ic2spd = u16();
    u32();
    const iparalen = u16();
    insHeaders.push({
      name: iname,
      rsvd1: irsvd1,
      length: ilength,
      loopbeg: iloopbeg,
      loopend: iloopend,
      volume: ivolume,
      c2spd: ic2spd,
      paralen: iparalen
    });
  }
  const c4rate = 8363;
  const magicStr = String.fromCharCode(...magic);
  let typeStr;
  if (!magic[0] || magicStr.startsWith("PCSTV") || magicStr === "!Scream!") {
    typeStr = `Scream Tracker ${vermaj}.${String(vermin).padStart(2, "0")}`;
  } else if (magicStr.startsWith("SWavePro")) {
    typeStr = `SoundWave Pro ${vermaj}.${String(vermin).padStart(2, "0")}`;
  } else {
    typeStr = copyAdjust(magic, 8);
  }
  const instruments = [];
  const rawSamples = [];
  for (let i2 = 0; i2 < ins; i2++) {
    const h = insHeaders[i2];
    const ilpe = h.loopend === 65535 ? 0 : h.loopend;
    const xflg = ilpe > 0 ? SampleFlags.LOOP : 0;
    const sub = {
      vol: h.volume,
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
      sid: i2,
      rvv: 0,
      nna: 0,
      dct: 0,
      dca: 0,
      ifc: 0,
      ifr: 0
    };
    const cn = c2spdToNote(h.c2spd);
    sub.xpo = cn.n;
    sub.fin = cn.f;
    const nameStr = copyAdjust(h.name.subarray(0, 12), 12);
    const xi = zeroInstrument(nameStr, [sub]);
    if (h.length > 0) xi.nsm = 1;
    instruments.push(xi);
    rawSamples.push({
      // stm_load.c names only the INSTRUMENT — xxs->name stays empty in C.
      name: "",
      data: new Uint8Array(0),
      length: h.length,
      loopStart: h.loopbeg,
      loopEnd: ilpe,
      sustainStart: 0,
      sustainEnd: 0,
      finetune: 0,
      volume: h.volume,
      flags: xflg,
      c5spd: c4rate
    });
  }
  const xxoRaw = raw(len);
  const xxo = [];
  let blankPattern = 0;
  let i = 0;
  for (; i < len; i++) {
    const x = xxoRaw[i];
    if (x >= 99) break;
    if (x >= pat) {
      xxo.push(pat);
      blankPattern = 1;
    } else {
      xxo.push(x);
    }
  }
  const storedPatterns = pat;
  if (blankPattern !== 0) pat++;
  len = i;
  const patterns = [];
  const mkTrack = () => Array.from({ length: 64 }, () => ({ note: 0, ins: 0, vol: 0, fxt: 0, fxp: 0, f2t: 0, f2p: 0 }));
  for (i = 0; i < storedPatterns; i++) {
    const tracksArr = [];
    for (let k = 0; k < chn; k++) tracksArr.push({ rows: 64, event: mkTrack() });
    const pattern = { rows: 64, tracks: tracksArr };
    for (let j = 0; j < 64; j++) {
      for (let k = 0; k < chn; k++) {
        const e = pattern.tracks[k].event[j];
        let b = u8();
        if (b === 251 || b === 252) continue;
        if (b === 253) {
          e.note = XMP_KEY_OFF;
          continue;
        }
        if (b === 254) {
          e.note = XMP_KEY_OFF;
        } else if (b === 255) {
          e.note = 0;
        } else {
          e.note = 1 + LSN(b) + 12 * (3 + MSN(b));
        }
        b = u8();
        let vol = b & 7;
        e.ins = (b & 248) >> 3;
        b = u8();
        vol += (b & 240) >> 1;
        if (version >= 200) {
          e.vol = vol > 64 ? 0 : vol + 1;
        } else {
          if (vol > 0) {
            e.vol = vol > 64 ? 1 : vol + 1;
          }
        }
        e.fxt = fxTable[LSN(b)];
        e.fxp = u8();
        switch (e.fxt) {
          case FX_BREAK:
            e.fxp = 0;
            break;
          case FX_SPEED:
            if (e.fxp !== 0) {
              const t = stmConvertTempo(e.fxp, version);
              e.fxt = FX_S3M_SPEED;
              e.fxp = t.spd;
              if (version >= 110) {
                e.f2t = FX_S3M_BPM;
                e.f2p = t.bpm;
              }
            } else {
              e.fxt = 0;
              e.fxp = 0;
            }
            break;
          case FX_NONE_VAL:
            e.fxp = 0;
            e.fxt = 0;
            break;
        }
      }
    }
    patterns.push(pattern);
  }
  if (blankPattern !== 0) {
    const tracksArr = [];
    for (let k = 0; k < chn; k++) tracksArr.push({ rows: 64, event: mkTrack() });
    patterns.push({ rows: 64, tracks: tracksArr });
  }
  for (i = 0; i < ins; i++) {
    const h = insHeaders[i];
    const rawS = rawSamples[i];
    if (h.volume === 0 || h.length === 0) {
      instruments[i].nsm = 0;
      ctx.addSample(rawS);
      continue;
    }
    if (type === STM_TYPE_SONG) {
      ctx.addSample(rawS);
      continue;
    }
    const dataPos = h.rsvd1 << 4;
    if (dataPos > bytes.length) {
      throw new ParseError(`STM: seek error in sample data (${i})`);
    }
    const remaining = bytes.length - dataPos;
    const take = Math.min(h.length, Math.max(0, remaining));
    rawS.data = bytes.subarray(dataPos, dataPos + take);
    ctx.addSample(rawS);
  }
  const quirkFlags = Quirk.VSALL | QUIRKS_ST3;
  const chan = [];
  for (let k = 0; k < chn; k++) {
    const pan = Math.floor((k + 1) / 2) % 2 * 255;
    chan.push({ pan: Math.min(255, Math.max(0, 128 + (pan - 128))), vol: 64, flg: 0 });
  }
  const mod = {
    title: copyAdjust(name, 20),
    format: "stm",
    comment: "",
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
    speed: spd,
    bpm,
    volbase: 64,
    gvolbase: 64,
    gvol,
    quirks: quirkFlags,
    flowMode: FLOW_MODE_ST2,
    readEventType: 2,
    // READ_EVENT_ST3
    periodType: 0,
    // PERIOD_AMIGA
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
  name: "stm",
  test: stmTest,
  load: stmLoad,
  readEvent(core, chn, row) {
    const mod = core.module;
    const e = core.readEventScratch(chn) ?? core.readEventAt(mod.xxo[core.ctx.p.ord] ?? 0, chn, row);
    readEventSt3(core, e, chn);
  }
};
export {
  plugin,
  stmLoad,
  stmTest
};

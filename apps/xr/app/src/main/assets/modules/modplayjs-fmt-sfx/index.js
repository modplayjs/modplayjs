// packages/fmt-sfx/src/sfx.ts
import { SampleFlags } from "@modplayjs/core";
import { LSN, MSN, PERIOD_BASE, EMPTY_EVENT } from "@modplayjs/core";
import { ParseError } from "@modplayjs/core";
import {
  FX_ARPEGGIO,
  FX_PORTA_DN,
  FX_PORTA_UP,
  FX_PITCH_ADD,
  FX_PITCH_SUB,
  FX_VOL_ADD,
  FX_VOL_SUB
} from "@modplayjs/core";
import { Quirk } from "@modplayjs/core";
import { readEventMod } from "@modplayjs/fmt-mod";
var MAGIC_SONG = 1397706311;
function periodToNote(p) {
  if (p <= 0) return 0;
  return Math.round(12 * Math.log(PERIOD_BASE / p) / Math.LN2) + 1;
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
function copyAdjust(r, n) {
  let s = "";
  for (let i = 0; i < n && i < r.length; i++) {
    const c = r[i];
    if (c === 0) break;
    s += c > 127 || c < 32 || c === 127 ? "." : String.fromCharCode(c);
  }
  return s.replace(/ +$/, "");
}
function readmem32b(m, off) {
  return (m[off] << 24 | m[off + 1] << 16 | m[off + 2] << 8 | m[off + 3]) >>> 0;
}
function readmem16b(m, off) {
  return m[off] << 8 | m[off + 1];
}
function sfxTest(bytes) {
  if (bytes.length < 136) return false;
  const a = readmem32b(bytes, 4 * 15);
  const b = readmem32b(bytes, 4 * 31);
  return a === MAGIC_SONG || b === MAGIC_SONG;
}
function sfxTranslateEffect(e, fxt, fxp) {
  e.fxp = fxp;
  switch (fxt) {
    case 1:
      e.fxt = FX_ARPEGGIO;
      break;
    case 2:
      if (e.fxp >> 4) {
        e.fxt = FX_PORTA_DN;
        e.fxp >>= 4;
      } else if (e.fxp & 15) {
        e.fxt = FX_PORTA_UP;
        e.fxp &= 15;
      }
      break;
    case 5:
      e.fxt = FX_VOL_ADD;
      break;
    case 6:
      e.fxt = FX_VOL_SUB;
      break;
    case 7:
      e.fxt = FX_PITCH_ADD;
      break;
    case 8:
      e.fxt = FX_PITCH_SUB;
      break;
    default:
      e.fxt = 0;
      e.fxp = 0;
      break;
  }
}
function sfx1320Load(bytes, ctx, nins) {
  let pos = 0;
  const u8 = () => bytes[pos++];
  const u16 = () => {
    const v = readmem16b(bytes, pos);
    pos += 2;
    return v;
  };
  const u32 = () => {
    const v = readmem32b(bytes, pos);
    pos += 4;
    return v;
  };
  const raw = (n) => {
    const s = bytes.subarray(pos, pos + n);
    pos += n;
    return s;
  };
  const insSize = [];
  for (let i = 0; i < nins; i++) insSize.push(u32());
  const magic = u32();
  const delay = u16();
  if (delay < 178) throw new ParseError("SFX: delay < 178");
  raw(14);
  if (magic !== MAGIC_SONG) throw new ParseError("SFX: bad magic");
  const chn = 4;
  const ins = nins;
  const bpm = Math.trunc(14565 * 122 / delay);
  const insHeaders = [];
  for (let i = 0; i < ins; i++) {
    insHeaders.push({
      name: raw(22),
      len: u16(),
      finetune: u8(),
      volume: u8(),
      loopStart: u16(),
      loopLength: u16()
    });
  }
  const songLen = u8();
  const restart = u8();
  const order = raw(128);
  if (order.length < 128) throw new ParseError("SFX: order truncated");
  if (songLen > 127) throw new ParseError("SFX: song length > 0x7f");
  const len = songLen;
  const xxo = [];
  for (let i = 0; i < len; i++) xxo.push(order[i]);
  let pat = 0;
  for (let i = 0; i < len; i++) {
    if (xxo[i] > pat) pat = xxo[i];
  }
  pat++;
  const typeStr = ins === 15 ? "SoundFX 1.3" : "SoundFX 2.0";
  const instruments = [];
  const rawSamples = [];
  for (let i = 0; i < ins; i++) {
    const h = insHeaders[i];
    const xlen = insSize[i];
    const lps = h.loopStart;
    const lpe = lps + 2 * h.loopLength;
    const xflg = h.loopLength > 1 ? SampleFlags.LOOP : 0;
    const sub = {
      vol: h.volume,
      gvl: 64,
      // no QUIRK_INSVOL: load_epilogue sets gvl = volbase (load_helpers.c:377-383)
      pan: -1,
      // XMP_INST_NO_DEFAULT_PAN
      xpo: 0,
      fin: (h.finetune << 4 & 255) << 24 >> 24,
      // (int8)(finetune << 4) — "unsure"
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
    const nameStr = copyAdjust(h.name, 22);
    const xi = zeroInstrument(nameStr, [sub]);
    xi.nsm = 1;
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
      finetune: sub.fin,
      volume: h.volume,
      flags: xflg,
      c5spd: 8363
    });
  }
  const patterns = [];
  for (let i = 0; i < pat; i++) {
    const tracksArr = [];
    for (let k = 0; k < chn; k++) {
      const events = [];
      for (let j = 0; j < 64; j++) events.push({ ...EMPTY_EVENT });
      tracksArr.push({ rows: 64, event: events });
    }
    const pattern = { rows: 64, tracks: tracksArr };
    for (let j = 0; j < 64; j++) {
      for (let k = 0; k < chn; k++) {
        const e = pattern.tracks[k].event[j];
        const ev = raw(4);
        if (ev.length < 4) throw new ParseError(`SFX: read error at pattern ${i}`);
        e.note = periodToNote(LSN(ev[0]) << 8 | ev[1]);
        e.ins = MSN(ev[0]) << 4 | MSN(ev[2]);
        sfxTranslateEffect(e, LSN(ev[2]), ev[3]);
      }
    }
    patterns.push(pattern);
  }
  let samplePos = pos;
  for (let i = 0; i < ins; i++) {
    const rawS = rawSamples[i];
    if (rawS.length <= 2) {
      ctx.addSample(rawS);
      continue;
    }
    const take = Math.min(rawS.length, Math.max(0, bytes.length - samplePos));
    rawS.data = bytes.subarray(samplePos, samplePos + take);
    samplePos += rawS.length;
    ctx.addSample(rawS);
  }
  const quirkFlags = Quirk.PBALL;
  const chan = [];
  for (let k = 0; k < chn; k++) {
    const pan = Math.floor((k + 1) / 2) % 2 * 255;
    chan.push({ pan: Math.min(255, Math.max(0, 128 + (pan - 128))), vol: 64, flg: 0 });
  }
  const mod = {
    title: "",
    format: "sfx",
    comment: "",
    chn,
    pat,
    ins,
    len,
    restart,
    xxo,
    channels: chan,
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
    quirks: quirkFlags,
    flowMode: 0,
    readEventType: 0,
    // READ_EVENT_MOD
    periodType: 1,
    // PERIOD_MODRNG
    defpan: 128,
    time_factor: 10,
    rrate: 250,
    c4rate: 8363,
    // prologue PAL default (sfx_load.c never sets c4rate)
    compare_vblank: false,
    tracker: typeStr
  };
  void ctx.sampleRate;
  void ctx.outputRate;
  return mod;
}
function sfxLoad(bytes, ctx) {
  try {
    return sfx1320Load(bytes, ctx, 15);
  } catch {
    return sfx1320Load(bytes, ctx, 31);
  }
}
var plugin = {
  name: "sfx",
  test: sfxTest,
  load: sfxLoad,
  readEvent(core, chn, row) {
    const mod = core.module;
    const e = core.readEventScratch(chn) ?? core.readEventAt(mod.xxo[core.ctx.p.ord] ?? 0, chn, row);
    readEventMod(core, e, chn);
  }
};
export {
  plugin,
  sfxLoad,
  sfxTest
};

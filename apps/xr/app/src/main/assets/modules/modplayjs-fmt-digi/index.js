// packages/fmt-digi/src/digi.ts
import { SampleFlags } from "@modplayjs/core";
import { LSN, MSN, EMPTY_EVENT } from "@modplayjs/core";
import { ParseError } from "@modplayjs/core";
import { FX_VOLSET } from "@modplayjs/core";
import { readEventMod, decodeEvent, periodToNote } from "@modplayjs/fmt-mod";
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
function readmem32b(m, off) {
  return (m[off] << 24 | m[off + 1] << 16 | m[off + 2] << 8 | m[off + 3]) >>> 0;
}
function readmem16b(m, off) {
  return m[off] << 8 | m[off + 1];
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
function digiTest(bytes) {
  if (bytes.length < 20) return false;
  const id = "DIGI Booster module";
  for (let i = 0; i < 19; i++) {
    if (bytes[i] !== id.charCodeAt(i)) return false;
  }
  return bytes.length >= 624 + 32;
}
function digiLoad(bytes, ctx) {
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
  const s8 = () => {
    const v = bytes[pos++] << 24 >> 24;
    return v;
  };
  raw(20);
  const vstr = raw(4);
  const ver = u8();
  void ver;
  const chn = u8();
  const pack = u8();
  raw(19);
  const patStored = u8();
  const lenStored = u8();
  if (lenStored > 127) throw new ParseError("DIGI: song length > 127");
  const ord = raw(128);
  const slen = [];
  const sloop = [];
  const sllen = [];
  const vol = [];
  const fin = [];
  for (let i = 0; i < 31; i++) slen.push(u32());
  for (let i = 0; i < 31; i++) sloop.push(u32());
  for (let i = 0; i < 31; i++) sllen.push(u32());
  for (let i = 0; i < 31; i++) vol.push(u8());
  for (let i = 0; i < 31; i++) fin.push(s8());
  const title = raw(32);
  const insNames = [];
  for (let i = 0; i < 31; i++) insNames.push(raw(30));
  const ins = 31;
  const pat = patStored + 1;
  const len = lenStored + 1;
  const periodType = 1;
  const typeStr = `DIGI Booster ${String.fromCharCode(...vstr).slice(0, 4)}`;
  const xxo = [];
  for (let i = 0; i < len; i++) xxo.push(ord[i]);
  const instruments = [];
  const rawSamples = [];
  for (let i = 0; i < ins; i++) {
    const xlen = slen[i];
    const lps = sloop[i];
    const lpe = sloop[i] + sllen[i];
    const xflg = lpe > 0 ? SampleFlags.LOOP : 0;
    const sub = {
      vol: vol[i],
      gvl: 64,
      // no QUIRK_INSVOL: load_epilogue sets gvl = volbase (load_helpers.c:377-383)
      pan: -1,
      // XMP_INST_NO_DEFAULT_PAN
      xpo: 0,
      fin: fin[i],
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
    const nameStr = copyAdjust(insNames[i], 30);
    const xi = zeroInstrument(nameStr, [sub]);
    if (xlen > 0) xi.nsm = 1;
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
      finetune: fin[i],
      volume: vol[i],
      flags: xflg,
      c5spd: 8287
      // prologue PAL default — DIGI never sets c4rate
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
    let w;
    const chnTable = new Uint8Array(64);
    if (pack !== 0) {
      w = u16() - 64 >> 2;
      const tbl = raw(64);
      if (tbl.length < 64) throw new ParseError(`DIGI: channel table ${i} truncated`);
      chnTable.set(tbl);
    } else {
      w = 64 * chn;
      chnTable.fill(255);
    }
    for (let j = 0; j < 64; j++) {
      for (let c = 0, k = 128; c < chn; c++, k >>= 1) {
        if ((chnTable[j] & k) !== 0) {
          const ev4 = raw(4);
          if (ev4.length < 4) throw new ParseError(`DIGI: read error at pattern ${i}`);
          const e = pattern.tracks[c].event[j];
          decodeEvent(
            e,
            ev4,
            0,
            0
            /* TrackerId.PROTRACKER */
          );
          e.note = periodToNote(LSN(ev4[0]) << 8 | ev4[1]);
          switch (e.fxt) {
            case 8:
              e.fxt = 0;
              e.fxp = 0;
              break;
            case 14:
              switch (MSN(e.fxp)) {
                case 0:
                case 3:
                case 8:
                case 9:
                  e.fxt = 0;
                  e.fxp = 0;
                  break;
                case 4:
                  e.fxt = FX_VOLSET;
                  e.fxp = 0;
                  break;
              }
              break;
          }
          w--;
        }
      }
    }
    if (w !== 0) {
    }
    patterns.push(pattern);
  }
  let samplePos = pos;
  for (let i = 0; i < ins; i++) {
    const rawS = rawSamples[i];
    if (rawS.length > 0) {
      const take = Math.min(rawS.length, Math.max(0, bytes.length - samplePos));
      rawS.data = bytes.subarray(samplePos, samplePos + take);
      samplePos += rawS.length;
    }
    ctx.addSample(rawS);
  }
  const chan = [];
  for (let k = 0; k < chn; k++) {
    const pan = Math.floor((k + 1) / 2) % 2 * 255;
    chan.push({ pan: Math.min(255, Math.max(0, 128 + (pan - 128))), vol: 64, flg: 0 });
  }
  const mod = {
    title: copyAdjust(title, 32),
    format: "digi",
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
  name: "digi",
  test: digiTest,
  load: digiLoad,
  readEvent(core, chn, row) {
    const mod = core.module;
    const e = core.readEventScratch(chn) ?? core.readEventAt(mod.xxo[core.ctx.p.ord] ?? 0, chn, row);
    readEventMod(core, e, chn);
  }
};
export {
  digiLoad,
  digiTest,
  plugin
};

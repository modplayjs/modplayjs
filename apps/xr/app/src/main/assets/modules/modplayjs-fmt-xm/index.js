// packages/fmt-xm/src/xm.ts
import {
  C4_NTSC_RATE,
  FLOW_MODE_MPT_116,
  FLOW_MODE_GENERIC,
  ParseError,
  PeriodType,
  Quirk,
  QUIRKS_FT2,
  ReadEventType,
  SampleFlags,
  XMP_KEY_OFF
} from "@modplayjs/core";
import {
  EMPTY_EVENT
} from "@modplayjs/core";
import {
  DecodeFlag
} from "@modplayjs/core";
import {
  EX_FINETUNE,
  FX,
  FX_PANSL_NOMEM,
  FX_REVERSE,
  FX_SURROUND,
  FX_VOLSLIDE_2,
  FX_XF_PORTA
} from "@modplayjs/core";
import { EX_F_VSLIDE_DN, EX_F_VSLIDE_UP } from "@modplayjs/core";
import { LSN, MSN, readEventFt2, TEST_NOTE, NoteFlag, SET_NOTE } from "@modplayjs/core";
import { applyMptPreamp } from "@modplayjs/fmt-it";
import { stbVorbisOpenMemory, stbVorbisGetFrameFloat } from "@modplayjs/stb-vorbis";
var XM_EVENT_PACKING = 128;
var XM_EVENT_NOTE_FOLLOWS = 1;
var XM_EVENT_INSTRUMENT_FOLLOWS = 2;
var XM_EVENT_VOLUME_FOLLOWS = 4;
var XM_EVENT_FXTYPE_FOLLOWS = 8;
var XM_EVENT_FXPARM_FOLLOWS = 16;
var XM_LINEAR_PERIOD_MODE = 1;
var XM_LOOP_FORWARD = 1;
var XM_LOOP_PINGPONG = 2;
var XM_SAMPLE_16BIT = 16;
var XM_SAMPLE_STEREO = 32;
var XM_INST_HEADER_SIZE = 29;
var XM_INST_SIZE = 212;
var XM_MAX_SAMPLES_PER_INST = 32;
var XMP_MAX_CHANNELS = 64;
var MAX_SAMPLE_SIZE = 268435456;
var MAGIC_OGGS = 1332176723;
function copyAdjust(r, n) {
  let s = "";
  for (let i = 0; i < n && i < r.length; i++) {
    const c = r[i];
    if (c === 0) break;
    s += c > 127 || c < 32 || c === 127 ? "." : String.fromCharCode(c);
  }
  return s.replace(/ +$/, "");
}
function readmem16l(m, off) {
  return (m[off] | m[off + 1] << 8) >>> 0;
}
function readmem32l(m, off) {
  return (m[off] | m[off + 1] << 8 | m[off + 2] << 16 | m[off + 3] << 24) >>> 0;
}
function readmem32b(m, off) {
  return (m[off] << 24 | m[off + 1] << 16 | m[off + 2] << 8 | m[off + 3]) >>> 0;
}
function xmTest(bytes) {
  if (bytes.length < 17) return false;
  for (let i = 0; i < 17; i++) {
    if (bytes[i] !== "Extended Module: ".charCodeAt(i)) return false;
  }
  return true;
}
var XM_FT2_EVENT_FXT_BLACKLIST = /* @__PURE__ */ new Set([18, 19, 22, 23, 24, 26, 28, 30, 31, 32]);
function loadXmPattern(mod, version, patbuf, patStart, pattern, bytes, fileSize) {
  const headsize = version > 258 ? 9 : 8;
  let pos = patStart;
  const xphLength = readmem32l(bytes, pos);
  pos += 4;
  pos += 1;
  const xphRows = version > 258 ? readmem16l(bytes, pos) : bytes[pos] + 1;
  pos += version > 258 ? 2 : 1;
  if (xphRows > 256) {
    throw new ParseError("XM: bad pattern rows");
  }
  const xphDatasize = readmem16l(bytes, pos);
  pos += 2;
  pos += xphLength - headsize;
  if (pos > fileSize) {
    throw new ParseError("XM: pattern seek past EOF");
  }
  let r = xphRows;
  if (r === 0) {
    r = 256;
  }
  pattern.rows = r;
  const tracks = pattern.tracks;
  for (const tr of tracks) {
    const events = [];
    for (let i = 0; i < r; i++) events.push({ ...EMPTY_EVENT });
    tr.rows = r;
    tr.event = events;
  }
  if (xphDatasize === 0) {
    return;
  }
  const size0 = xphDatasize;
  const avail = Math.min(size0, fileSize - pos);
  const patbufView = bytes.subarray(pos, pos + avail);
  let size = size0;
  let p = 0;
  const rd = () => {
    const v = p < patbufView.length ? patbufView[p] : 0;
    p++;
    return v;
  };
  const dummy = { ...EMPTY_EVENT };
  for (let j = 0; j < r; j++) {
    for (let k = 0; k < mod.chn; k++) {
      if (p === size0) {
        return;
      }
      const event = k >= tracks.length ? dummy : tracks[k].event[j];
      if (--size < 0) {
        throw new ParseError("XM: pattern data overrun");
      }
      const b = rd();
      if (b & XM_EVENT_PACKING) {
        if (b & XM_EVENT_NOTE_FOLLOWS) {
          if (--size < 0) throw new ParseError("XM: pattern data overrun");
          event.note = rd();
        }
        if (b & XM_EVENT_INSTRUMENT_FOLLOWS) {
          if (--size < 0) throw new ParseError("XM: pattern data overrun");
          event.ins = rd();
        }
        if (b & XM_EVENT_VOLUME_FOLLOWS) {
          if (--size < 0) throw new ParseError("XM: pattern data overrun");
          event.vol = rd();
        }
        if (b & XM_EVENT_FXTYPE_FOLLOWS) {
          if (--size < 0) throw new ParseError("XM: pattern data overrun");
          event.fxt = rd();
        }
        if (b & XM_EVENT_FXPARM_FOLLOWS) {
          if (--size < 0) throw new ParseError("XM: pattern data overrun");
          event.fxp = rd();
        }
      } else {
        size -= 4;
        if (size < 0) throw new ParseError("XM: pattern data overrun");
        event.note = b;
        event.ins = rd();
        event.vol = rd();
        event.fxt = rd();
        event.fxp = rd();
      }
      if (XM_FT2_EVENT_FXT_BLACKLIST.has(event.fxt)) {
        event.fxt = 0;
      }
      if (event.fxt > 34) {
        event.fxt = 0;
      }
      if (event.note === 97) {
        event.note = XMP_KEY_OFF;
      } else if (event.note > 0) {
        event.note = event.note + 12 & 255;
      }
      if (event.fxt === 14) {
        if (MSN(event.fxp) === EX_FINETUNE) {
          const val = LSN(event.fxp) - 8 & 15;
          event.fxp = EX_FINETUNE << 4 | val;
        }
        switch (event.fxp) {
          case 67:
          case 115:
            event.fxp--;
            break;
        }
      }
      if (event.fxt === FX_XF_PORTA && MSN(event.fxp) === 9) {
        switch (LSN(event.fxp)) {
          case 0:
          // Surround off
          case 1:
            event.fxt = FX_SURROUND;
            event.fxp = LSN(event.fxp);
            break;
          case 14:
          // Play forward
          case 15:
            event.fxt = FX_REVERSE;
            event.fxp = LSN(event.fxp) - 14;
            break;
        }
      }
      if (event.vol === 0) {
        continue;
      }
      if (event.vol >= 16 && event.vol <= 80) {
        event.vol -= 15;
        continue;
      }
      switch (event.vol >> 4) {
        case 6:
          event.f2t = FX_VOLSLIDE_2;
          event.f2p = event.vol - 96;
          break;
        case 7:
          event.f2t = FX_VOLSLIDE_2;
          event.f2p = event.vol - 112 << 4;
          break;
        case 8:
          event.f2t = FX.FX_EXTENDED;
          event.f2p = EX_F_VSLIDE_DN << 4 | event.vol - 128;
          break;
        case 9:
          event.f2t = FX.FX_EXTENDED;
          event.f2p = EX_F_VSLIDE_UP << 4 | event.vol - 144;
          break;
        case 10:
          event.f2t = FX.FX_VIBRATO;
          event.f2p = event.vol - 160 << 4;
          break;
        case 11:
          event.f2t = FX.FX_VIBRATO;
          event.f2p = event.vol - 176;
          break;
        case 12:
          event.f2t = FX.FX_SETPAN;
          event.f2p = event.vol - 192 << 4;
          break;
        case 13:
          event.f2t = FX_PANSL_NOMEM;
          event.f2p = event.vol - 208 << 4;
          break;
        case 14:
          event.f2t = FX_PANSL_NOMEM;
          event.f2p = event.vol - 224;
          break;
        case 15:
          event.f2t = FX.FX_TONEPORTA;
          event.f2p = event.vol - 240 << 4;
          break;
      }
      event.vol = 0;
    }
  }
  void patbuf;
}
function loadPatterns(mod, version, bytes, pos) {
  const patCount = mod.pat;
  mod.pat = patCount + 1;
  const patterns = [];
  for (let i = 0; i < patCount + 1; i++) {
    const tracks = [];
    for (let c = 0; c < mod.chn; c++) {
      const events = [];
      for (let rr = 0; rr < 64; rr++) events.push({ ...EMPTY_EVENT });
      tracks.push({ rows: 64, event: events });
    }
    patterns.push({ rows: 64, tracks });
  }
  const patbuf = new Uint8Array(65536);
  void patbuf;
  let p = pos;
  for (let i = 0; i < patCount; i++) {
    loadXmPattern(mod, version, patbuf, p, patterns[i], bytes, bytes.length);
    const phLength = readmem32l(bytes, p);
    const dsOff = version > 258 ? 7 : 6;
    const ds = readmem16l(bytes, p + dsOff);
    p += phLength + ds;
  }
  {
    const t = patCount * mod.chn;
    const extra = { rows: 64, event: [] };
    for (let rr = 0; rr < 64; rr++) extra.event.push({ ...EMPTY_EVENT });
    patterns[patCount].rows = 64;
    patterns[patCount].tracks = [];
    for (let j = 0; j < mod.chn; j++) {
      patterns[patCount].tracks.push(extra);
    }
    void t;
  }
  mod.patterns = patterns;
  return p;
}
function isOggSample(bytes, pos, len) {
  if (len < 4) return false;
  if (pos + 8 > bytes.length) return false;
  const id = readmem32b(bytes, pos + 4);
  return id === MAGIC_OGGS;
}
var S16_TEMP = new DataView(new ArrayBuffer(4));
var S16_MAGIC = Math.fround(1.5 * (1 << 23 - 15) + 0.5 / (1 << 15));
var S16_ADDEND = (150 - 15 << 23) + (1 << 22);
function fastFloatToS16(x) {
  S16_TEMP.setFloat32(0, Math.fround(x + S16_MAGIC), true);
  let v = S16_TEMP.getInt32(0, true) - S16_ADDEND;
  if (v + 32768 >>> 0 > 65535) v = v < 0 ? -32768 : 32767;
  return v;
}
function oggDecode(bytes, pos, len, flg) {
  const data = bytes.subarray(pos + 4, pos + len);
  const err = { v: 0 };
  const vor = stbVorbisOpenMemory(data, err);
  if (!vor) throw new ParseError("XM: Ogg sample failed to decode");
  if (vor.channels !== 1) {
    throw new ParseError("XM: Ogg sample is not mono");
  }
  const pcm16 = [];
  {
    const fl = { v: 0 };
    for (; ; ) {
      const out = stbVorbisGetFrameFloat(vor, fl);
      if (!out || fl.v === 0) break;
      const ch0 = out[0];
      for (let j = 0; j < fl.v; j++) pcm16.push(fastFloatToS16(ch0[j]));
    }
  }
  let n = pcm16.length;
  const is16bit = (flg & SampleFlags.BITS16) !== 0;
  if (!is16bit && n > 0) {
    const pcm2 = new Uint8Array(n);
    for (let i = 0; i < n; i++) {
      pcm2[i] = pcm16[i] >> 8 & 255;
    }
    if ((flg & SampleFlags.STEREO) !== 0) {
      n >>= 1;
    }
    return { pcm: pcm2, frames: n };
  }
  const pcm = new Uint8Array(n * 2);
  const dv = new DataView(pcm.buffer);
  for (let i = 0; i < n; i++) {
    dv.setInt16(i * 2, pcm16[i], true);
  }
  if ((flg & SampleFlags.STEREO) !== 0) {
    n >>= 1;
  }
  return { pcm, frames: n };
}
function zeroEnvelope() {
  return { flags: 0, npt: 0, scl: 0, sus: 0, sue: 0, lps: 0, lpe: 0, x: [], y: [] };
}
function loadInstruments(mod, version, bytes, startPos, ctx) {
  void ctx;
  let mptInsHeaders = 0;
  const instruments = [];
  for (let i = 0; i < mod.ins; i++) {
    instruments.push({
      name: "",
      volume: 64,
      nsm: 0,
      rls: 0,
      map: new Array(121).fill(0),
      mapXpo: new Array(121).fill(0),
      sub: [],
      aei: zeroEnvelope(),
      fei: zeroEnvelope(),
      pei: zeroEnvelope()
    });
  }
  const rawSamples = [];
  let sampleNum = 0;
  let pos = startPos;
  for (let i = 0; i < mod.ins; i++) {
    const instrPos = pos;
    if (pos + XM_INST_HEADER_SIZE + 4 > bytes.length) {
      break;
    }
    const buf = bytes.subarray(pos, pos + XM_INST_HEADER_SIZE + 4);
    let yWave = 0;
    let ySweep = 0;
    let yDepth = 0;
    let yRate = 0;
    const xihSize = readmem32l(buf, 0);
    const xihName = buf.subarray(4, 26);
    const xihSamples = readmem16l(buf, 27);
    const xihShSize = readmem32l(buf, 29);
    if (xihSize < XM_INST_HEADER_SIZE) {
      const avail = bytes.length - instrPos;
      const copyBytes = Math.min(xihSize, avail);
      const pos2 = instrPos + Math.min(xihSize, avail);
      void pos2;
      const zeroIns = {
        name: copyAdjust(bytes.subarray(instrPos + 4, instrPos + 4 + Math.min(22, Math.max(0, copyBytes - 4))), 22),
        volume: 64,
        nsm: 0,
        rls: 0,
        map: new Array(121).fill(0),
        mapXpo: new Array(121).fill(0),
        sub: [],
        aei: zeroEnvelope(),
        fei: zeroEnvelope(),
        pei: zeroEnvelope()
      };
      instruments[i] = zeroIns;
      pos = instrPos + Math.min(xihSize, avail);
      continue;
    }
    if (xihSamples > XM_MAX_SAMPLES_PER_INST || xihSamples > 0 && xihShSize > 256) {
      const avail = bytes.length - instrPos;
      const copyBytes = Math.min(xihSize, avail);
      const declared = xihSamples;
      const stored = Math.min(declared, XM_MAX_SAMPLES_PER_INST);
      const zeroIns = {
        name: copyAdjust(bytes.subarray(instrPos + 4, instrPos + 4 + Math.min(22, Math.max(0, copyBytes - 4))), 22),
        volume: 64,
        nsm: 0,
        rls: 0,
        map: new Array(121).fill(0),
        mapXpo: new Array(121).fill(0),
        sub: [],
        aei: zeroEnvelope(),
        fei: zeroEnvelope(),
        pei: zeroEnvelope()
      };
      instruments[i] = zeroIns;
      const hdrsPos = instrPos + Math.min(xihSize, avail);
      const hdrsAvail = bytes.length - hdrsPos;
      const hdrsSkip = Math.min(40 * declared, hdrsAvail);
      let dataTotal = 0;
      if (hdrsSkip === 40 * declared) {
        for (let j = 0; j < declared; j++) {
          dataTotal += readmem32l(bytes, hdrsPos + j * 40);
          if (dataTotal > bytes.length) {
            dataTotal = bytes.length;
            break;
          }
        }
      }
      pos = Math.min(bytes.length, hdrsPos + hdrsSkip + dataTotal);
      void stored;
      continue;
    }
    if (xihSize === 263 && xihSamples === 0 && xihShSize === 0) {
      mptInsHeaders = 1;
    }
    const name = copyAdjust(xihName, 22);
    const xxi = {
      name,
      volume: 64,
      nsm: xihSamples,
      rls: 0,
      // C: xxi comes from calloc (libxmp_init_instrument) — maps start at 0,
      // NOT 0xff. Keys 12..108 are overwritten from the file; keys 0-11 and
      // 108-120 stay 0 (xm_load.c:602-607).
      map: new Array(121).fill(0),
      mapXpo: new Array(121).fill(0),
      sub: [],
      aei: zeroEnvelope(),
      fei: zeroEnvelope(),
      pei: zeroEnvelope()
    };
    if (xihSamples === 0) {
      pos = instrPos + xihSize;
      instruments[i] = xxi;
      continue;
    }
    const subs = [];
    for (let j = 0; j < xihSamples; j++) {
      subs.push({
        vol: 0,
        // QUIRK_INSVOL is never set for XM: libxmp_load_epilogue
        // (load_helpers.c:370-383) rewrites sub.gvl = m->volbase = 0x40.
        gvl: 64,
        // XMP_INST_NO_DEFAULT_PAN (xm_load.c:632): sub->pan = -1.
        pan: -1,
        xpo: 0,
        fin: 0,
        vwf: 0,
        vde: 0,
        vra: 0,
        vsw: 0,
        sid: 0,
        rvv: 0,
        nna: 0,
        dct: 0,
        dca: 0,
        ifc: 0,
        ifr: 0
      });
    }
    xxi.sub = subs;
    if (xihSize < XM_INST_HEADER_SIZE + XM_INST_SIZE) {
      pos += xihSize - (XM_INST_HEADER_SIZE + 4);
      pos += XM_INST_HEADER_SIZE + 4;
      for (let j = 12; j < 108; j++) {
        const v = 0;
        xxi.map[j] = v >= xxi.nsm ? 255 : v;
      }
    } else {
      if (pos + XM_INST_HEADER_SIZE + 4 + 208 > bytes.length) {
        const avail = Math.max(0, bytes.length - (pos + XM_INST_HEADER_SIZE + 4));
        const b2 = new Uint8Array(208);
        b2.set(bytes.subarray(pos + XM_INST_HEADER_SIZE + 4, pos + XM_INST_HEADER_SIZE + 4 + avail), 0);
        const xxi2 = {
          name: "",
          volume: 64,
          nsm: 0,
          rls: 0,
          map: new Array(121).fill(0),
          mapXpo: new Array(121).fill(0),
          sub: [],
          aei: zeroEnvelope(),
          fei: zeroEnvelope(),
          pei: zeroEnvelope()
        };
        instruments[i] = xxi2;
        pos = bytes.length;
        continue;
      }
      const b = bytes.subarray(pos + XM_INST_HEADER_SIZE + 4, pos + XM_INST_HEADER_SIZE + 4 + 208);
      const sample = [];
      for (let j = 0; j < 96; j++) sample.push(b[j]);
      let o = 96;
      const vEnv = [];
      for (let j = 0; j < 24; j++) {
        vEnv.push(readmem16l(b, o));
        o += 2;
      }
      const pEnv = [];
      for (let j = 0; j < 24; j++) {
        pEnv.push(readmem16l(b, o));
        o += 2;
      }
      const vPts = b[o];
      o += 1;
      const pPts = b[o];
      o += 1;
      const vSus = b[o];
      o += 1;
      const vStart = b[o];
      o += 1;
      const vEnd = b[o];
      o += 1;
      const pSus = b[o];
      o += 1;
      const pStart = b[o];
      o += 1;
      const pEnd = b[o];
      o += 1;
      const vType = b[o];
      o += 1;
      const pType = b[o];
      o += 1;
      yWave = b[o];
      o += 1;
      ySweep = b[o];
      o += 1;
      yDepth = b[o];
      o += 1;
      yRate = b[o];
      o += 1;
      const vFade = readmem16l(b, o);
      o += 2;
      void o;
      pos += XM_INST_HEADER_SIZE + 4 + 208;
      pos += Math.max(0, xihSize - (XM_INST_HEADER_SIZE + XM_INST_SIZE));
      xxi.rls = vFade << 1;
      xxi.aei.npt = vPts;
      xxi.aei.sus = vSus;
      xxi.aei.lps = vStart;
      xxi.aei.lpe = vEnd;
      xxi.aei.flags = vType;
      xxi.pei.npt = pPts;
      xxi.pei.sus = pSus;
      xxi.pei.lps = pStart;
      xxi.pei.lpe = pEnd;
      xxi.pei.flags = pType;
      if (xxi.aei.npt <= 0 || xxi.aei.npt > 12) {
        xxi.aei.flags &= ~1;
      } else {
        for (let j = 0; j < xxi.aei.npt; j++) {
          xxi.aei.x.push(vEnv[j * 2]);
          xxi.aei.y.push(vEnv[j * 2 + 1]);
        }
      }
      if (xxi.pei.npt <= 0 || xxi.pei.npt > 12) {
        xxi.pei.flags &= ~1;
      } else {
        for (let j = 0; j < xxi.pei.npt; j++) {
          xxi.pei.x.push(pEnv[j * 2]);
          xxi.pei.y.push(pEnv[j * 2 + 1]);
        }
      }
      for (let j = 12; j < 108; j++) {
        let v = sample[j - 12];
        if (v >= xxi.nsm) v = 255;
        xxi.map[j] = v;
      }
    }
    const xsh = [];
    for (let j = 0; j < xxi.nsm; j++, sampleNum++) {
      const sub = xxi.sub[j];
      if (pos + 40 > bytes.length) {
        throw new ParseError("XM: short read in sample data");
      }
      const sb = bytes.subarray(pos, pos + 40);
      pos += 40;
      const length = readmem32l(sb, 0);
      if (length > MAX_SAMPLE_SIZE) {
        throw new ParseError(`XM: sample ${j}: bad sample size`);
      }
      const wrapI32 = (v) => v & 4294967295 | 0;
      const loopStart = wrapI32(readmem32l(sb, 4));
      const loopLength = readmem32l(sb, 8);
      const volume = sb[12];
      const finetune = sb[13] << 24 >> 24;
      const type = sb[14];
      const pan = sb[15];
      const relnote = sb[16] << 24 >> 24;
      const reserved = sb[17];
      const sname = sb.subarray(18, 40);
      xsh.push({ length, loopStart, loopLength, volume, finetune, type, pan, relnote, reserved, name: sname });
      sub.vol = volume;
      sub.pan = pan;
      sub.xpo = relnote;
      sub.fin = finetune;
      sub.vwf = yWave;
      sub.vde = yDepth << 2;
      sub.vra = yRate;
      sub.vsw = ySweep;
      sub.sid = sampleNum;
      const raw = {
        // libxmp_copy_adjust(xxs->name, xsh[j].name, 22) — the SAMPLE header
        // name, not the instrument name (xm_load.c:660).
        name: copyAdjust(sname, 22),
        data: new Uint8Array(0),
        length,
        loopStart,
        loopEnd: wrapI32(loopStart + loopLength),
        sustainStart: 0,
        sustainEnd: 0,
        finetune,
        volume,
        flags: 0,
        c5spd: C4_NTSC_RATE
      };
      let flg = 0;
      let len = wrapI32(length);
      let lps = loopStart;
      let lpe = wrapI32(loopStart + loopLength);
      if (type & XM_SAMPLE_16BIT) {
        flg |= SampleFlags.BITS16;
        len >>= 1;
        lps >>= 1;
        lpe >>= 1;
      }
      if (type & XM_SAMPLE_STEREO) {
        flg |= SampleFlags.STEREO;
        len >>= 1;
        lps >>= 1;
        lpe >>= 1;
      }
      flg |= type & XM_LOOP_FORWARD ? SampleFlags.LOOP : 0;
      flg |= type & XM_LOOP_PINGPONG ? SampleFlags.LOOP | SampleFlags.BIDIR : 0;
      raw.flags = flg;
      raw.length = len;
      raw.loopStart = lps;
      raw.loopEnd = lpe;
      rawSamples.push(raw);
    }
    let totalSampleSize = 0;
    for (let j = 0; j < xxi.nsm; j++) {
      const sub = xxi.sub[j];
      const raw = rawSamples[sub.sid];
      const sh = xsh[j];
      let flags = DecodeFlag.DIFF;
      if (sh.reserved === 173) {
        flags = DecodeFlag.ADPCM;
      }
      if (version > 259) {
        let dataPos = pos;
        const probe = raw.length >= 4;
        if (probe && isOggSample(bytes, dataPos, raw.length)) {
          const { pcm, frames } = oggDecode(bytes, dataPos, sh.length, raw.flags);
          raw.data = pcm;
          raw.length = frames;
          raw.flags = raw.flags & ~DecodeFlag.DIFF;
          totalSampleSize += sh.length;
          pos += sh.length;
          continue;
        }
        if (probe && dataPos + 8 > bytes.length) {
          dataPos = bytes.length;
        }
        const framelen = (raw.flags & SampleFlags.BITS16 ? 2 : 1) * (raw.flags & SampleFlags.STEREO ? 2 : 1);
        const bytelen = raw.length * framelen;
        const avail = Math.max(0, Math.min(bytelen, bytes.length - dataPos));
        if (globalThis.process?.stderr && globalThis.process?.env?.XMDBG)
          globalThis.process.stderr.write("DBG sid" + sub.sid + ": dataPos=" + dataPos + " len=" + raw.length + " bytelen=" + bytelen + " avail=" + avail + " fileLen=" + bytes.length + " is16=" + ((raw.flags & SampleFlags.BITS16) !== 0) + "\n");
        if (avail <= 0) {
          raw.data = new Uint8Array(0);
        } else if (avail < bytelen) {
          const aligned = avail - avail % framelen;
          raw.data = bytes.subarray(dataPos, dataPos + aligned);
          raw.length = aligned / framelen;
        } else {
          raw.data = bytes.subarray(dataPos, dataPos + bytelen);
        }
        raw.flags = raw.flags | flags;
        if (flags & DecodeFlag.ADPCM) {
          totalSampleSize += 16 + (sh.length + 1 >> 1);
        } else {
          totalSampleSize += sh.length;
        }
        pos += bytelen;
      }
    }
    pos = instrPos + xihSize + 40 * xihSamples + totalSampleSize;
    instruments[i] = xxi;
  }
  mod.instruments = instruments;
  mod.samples = rawSamples;
  return { endPos: pos, mptInsHeaders };
}
function xmLoad(bytes, ctx) {
  const size = bytes.length;
  const fail = (msg) => {
    throw new ParseError(msg);
  };
  if (size < 80) fail("XM: short header");
  const version = readmem16l(bytes, 58);
  const headersz = readmem32l(bytes, 60);
  const songlen = readmem16l(bytes, 64);
  const restart = readmem16l(bytes, 66);
  const channels = readmem16l(bytes, 68);
  const patterns = readmem16l(bytes, 70);
  const instruments = readmem16l(bytes, 72);
  const flags = readmem16l(bytes, 74);
  const tempo = readmem16l(bytes, 76);
  const bpm = readmem16l(bytes, 78);
  let modBpm = bpm;
  if (songlen > 256) fail(`XM: bad song length ${songlen}`);
  if (patterns > 256) fail(`XM: bad pattern count ${patterns}`);
  if (instruments > 255) fail(`XM: bad instrument count ${instruments}`);
  if (channels > XMP_MAX_CHANNELS) fail(`XM: bad channel count ${channels}`);
  const numInstruments = Math.min(instruments, 255);
  const tracker = bytes.subarray(38, 58);
  const isMed2xm = (() => {
    for (let i = 0; i < 6; i++) {
      if (tracker[i] !== "MED2XM".charCodeAt(i)) return false;
    }
    return true;
  })();
  if (tempo >= 32 || bpm < 32 || bpm > 1e3) {
    if (!isMed2xm) {
      modBpm = Math.min(Math.max(bpm, 32), 1e3);
    }
  }
  const len = headersz - 20;
  if (len < 0 || len > 256) {
    fail(`XM: bad XM header length ${len}`);
  }
  if (80 + len > size) fail("XM: error reading orders");
  const order = new Uint8Array(256);
  order.set(bytes.subarray(80, 80 + len), 0);
  const titleBytes = bytes.subarray(17, 37);
  let title = "";
  {
    for (let i = 0; i < 20 && i < titleBytes.length; i++) {
      const c = titleBytes[i];
      if (c === 0) break;
      title += String.fromCharCode(c);
    }
  }
  const mod = {
    title,
    format: "xm",
    comment: "",
    chn: channels,
    pat: patterns,
    ins: numInstruments,
    len: songlen,
    restart: restart >= songlen ? 0 : restart,
    xxo: Array.from(order.subarray(0, songlen)),
    channels: [],
    patterns: [],
    instruments: [],
    samples: [],
    num_sequences: 0,
    sequences: [],
    speed: tempo,
    bpm: modBpm,
    volbase: 64,
    gvolbase: 64,
    gvol: 64,
    quirks: 0,
    flowMode: FLOW_MODE_GENERIC,
    readEventType: ReadEventType.FT2,
    periodType: flags & XM_LINEAR_PERIOD_MODE ? PeriodType.LINEAR : PeriodType.AMIGA,
    defpan: 128,
    time_factor: 10,
    rrate: 250,
    c4rate: C4_NTSC_RATE,
    tracker: ""
  };
  let trackerName = "";
  for (let i = 0; i < 20; i++) {
    trackerName += String.fromCharCode(tracker[i] ?? 32);
  }
  trackerName = trackerName.slice(0, 20);
  let end = 20;
  while (end > 0 && (trackerName[end - 1] === " " || trackerName.charCodeAt(end - 1) === 0)) end--;
  trackerName = trackerName.slice(0, end);
  const claimsFt2 = (() => {
    let m = true;
    for (let i = 0; i < 17; i++) {
      if (trackerName[i] !== "FastTracker v2.00"[i]) {
        m = false;
        break;
      }
    }
    return m;
  })();
  let quirk = 0;
  let isMptOld = false;
  let isMpt116 = false;
  let mptInsHeaders = 0;
  if (claimsFt2) {
    quirk |= Quirk.FT2BUGS;
  } else if (trackerName.startsWith("Fasttracker II clone")) {
    quirk |= Quirk.FT2BUGS;
  } else if (trackerName.startsWith("OpenMPT ")) {
    quirk |= Quirk.FT2BUGS;
  }
  if (headersz === 275) {
    trackerName = "unknown tracker";
    quirk &= ~Quirk.FT2BUGS;
  } else if (trackerName.length === 0) {
    trackerName = "Digitrakker";
    quirk &= ~Quirk.FT2BUGS;
  }
  if (trackerName.startsWith("MED2XM by J.Pynnone")) {
    if (mod.bpm <= 10) {
      mod.bpm = Math.trunc(125 * (53 - mod.bpm * 2) / 33);
    }
    quirk &= ~Quirk.FT2BUGS;
  }
  if (trackerName.startsWith("FastTracker v 2.00")) {
    trackerName = "old ModPlug Tracker";
    quirk &= ~Quirk.FT2BUGS;
    isMptOld = true;
  }
  let flowMode = FLOW_MODE_GENERIC;
  if (trackerName === "Skale Tracker" || trackerName === "Sk@le Tracker") {
    flowMode |= 1 << 30;
  }
  const type = `${trackerName} XM ${version >> 8}.${String(version & 255).padStart(2, "0")}`;
  let pos = 80 + len;
  if (version <= 259) {
    const r = loadInstruments(mod, version, bytes, pos, ctx);
    mptInsHeaders = r.mptInsHeaders;
    pos = loadPatterns(mod, version, bytes, r.endPos);
  } else {
    pos = loadPatterns(mod, version, bytes, pos);
    const r = loadInstruments(mod, version, bytes, pos, ctx);
    mptInsHeaders = r.mptInsHeaders;
    pos = r.endPos;
  }
  if (version <= 259) {
    let p2 = pos;
    for (let i = 0; i < mod.ins; i++) {
      const xxi = mod.instruments[i];
      if (!xxi) continue;
      for (let j = 0; j < xxi.nsm; j++) {
        const sid = xxi.sub[j].sid;
        const raw = mod.samples[sid];
        const framelen = (raw.flags & SampleFlags.BITS16 ? 2 : 1) * (raw.flags & SampleFlags.STEREO ? 2 : 1);
        const bytelen = raw.length * framelen;
        const take = Math.max(0, Math.min(bytelen, bytes.length - p2));
        raw.data = bytes.subarray(p2, p2 + take);
        raw.flags |= DecodeFlag.DIFF;
        p2 += bytelen;
      }
    }
  }
  for (const raw of mod.samples) {
    ctx.addSample(raw);
  }
  {
    let p = pos;
    let claims = claimsFt2;
    while (true) {
      if (p + 8 > size) break;
      const ext = readmem32b(bytes, p);
      const sz = readmem32l(bytes, p + 4);
      if (sz > 2147483647) break;
      let known = false;
      if (ext === 1952807028) {
        known = true;
        if (sz > size) break;
        if (mod.comment === "") {
          if (p + 8 + sz <= size) {
            const cb = bytes.subarray(p + 8, p + 8 + sz);
            let s = "";
            for (let i = 0; i < cb.length; i++) {
              const b = cb[i];
              if (b === 13) s += "\n";
              else if ((b < 32 || b > 127) && b !== 10 && b !== 9) s += ".";
              else s += String.fromCharCode(b);
            }
            mod.comment = s;
          }
        }
        p += 8 + sz;
      } else if (ext === 1296647241 || ext === 1347305805 || ext === 1129201997 || ext === 1128810072 || ext === 1481920589) {
        known = true;
      } else if ((ext & 4294901760) === 1180172288) {
        known = true;
      }
      if (known && claims) isMpt116 = true;
      if (sz && p + 8 + sz > size) break;
      p += 8 + sz;
      if (ext === 1481920589) break;
    }
    void claims;
  }
  if (claimsFt2 && mptInsHeaders) {
    isMpt116 = true;
  }
  if (isMpt116) {
    mod.tracker = `ModPlug Tracker 1.16 XM ${version >> 8}.${String(version & 255).padStart(2, "0")}`;
  } else {
    mod.tracker = type;
  }
  if (isMpt116 || isMptOld) {
    quirk &= ~Quirk.FT2BUGS;
    flowMode = FLOW_MODE_MPT_116;
    mod.mvolbase = 48;
    mod.mvol = 48;
    applyMptPreamp(mod);
  }
  const chs = [];
  for (let i = 0; i < mod.chn; i++) {
    chs.push({ pan: 128, vol: 64, flg: 0 });
  }
  mod.channels = chs;
  quirk |= QUIRKS_FT2 | Quirk.FT2ENV;
  mod.quirks = quirk;
  mod.flowMode = flowMode;
  mod.readEventType = ReadEventType.FT2;
  return mod;
}
var plugin = {
  name: "xm",
  test: xmTest,
  load: xmLoad,
  readEvent(core, chn, row) {
    const mod = core.module;
    const xc = core.ctx.channelStates[chn];
    const e = core.readEventScratch(chn) ?? core.readEventAt(mod.xxo[core.ctx.p.ord] ?? 0, chn, row);
    if (e.ins !== 0) xc.old_ins = e.ins;
    if (TEST_NOTE(xc, NoteFlag.SAMPLE_END) !== 0) {
      SET_NOTE(xc, NoteFlag.END);
    }
    readEventFt2(core, e, chn);
  }
};

// packages/fmt-xm/src/xmWrite.ts
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
  u16le(v) {
    this.ensure(2);
    this.buf[this.len++] = v & 255;
    this.buf[this.len++] = v >> 8 & 255;
  }
  u32le(v) {
    this.ensure(4);
    this.buf[this.len++] = v & 255;
    this.buf[this.len++] = v >> 8 & 255;
    this.buf[this.len++] = v >> 16 & 255;
    this.buf[this.len++] = v >>> 24 & 255;
  }
  bytes(src) {
    this.ensure(src.length);
    this.buf.set(src, this.len);
    this.len += src.length;
  }
  ascii(text, width) {
    this.ensure(width);
    for (let i = 0; i < width; i++) {
      this.buf[this.len++] = i < text.length ? text.charCodeAt(i) & 255 : 0;
    }
  }
  zeros(n) {
    this.ensure(n);
    this.buf.fill(0, this.len, this.len + n);
    this.len += n;
  }
  patchU16le(off, v) {
    this.buf[off] = v & 255;
    this.buf[off + 1] = v >> 8 & 255;
  }
  patchU32le(off, v) {
    this.buf[off] = v & 255;
    this.buf[off + 1] = v >> 8 & 255;
    this.buf[off + 2] = v >> 16 & 255;
    this.buf[off + 3] = v >>> 24 & 255;
  }
  get bytes_() {
    return this.buf.subarray(0, this.len);
  }
};
function packPattern(pat, chn) {
  const w = new ByteWriter();
  for (let r = 0; r < pat.rows; r++) {
    for (let c = 0; c < chn; c++) {
      const e = pat.tracks[c]?.event[r] ?? { note: 0, ins: 0, vol: 0, fxt: 0, fxp: 0, f2t: 0, f2p: 0 };
      let type = 0;
      const fields = [];
      if (e.note > 0 && e.note < 130) {
        type |= 1;
        fields.push(e.note > 12 && e.note < 109 ? e.note - 12 : 97);
      }
      if (e.ins > 0) {
        type |= 2;
        fields.push(e.ins & 255);
      }
      if (e.vol > 0) {
        type |= 4;
        fields.push(16 + Math.min(64, e.vol) - 1);
      }
      if (e.fxt || e.fxp) {
        type |= 8;
        fields.push(e.fxt & 15);
        fields.push(e.fxp & 255);
      }
      if (type === 0) {
        w.u8(128);
      } else {
        w.u8(128 | type);
        for (const f of fields) w.u8(f);
      }
    }
  }
  return w.bytes_;
}
var writeXm = (mod) => {
  const w = new ByteWriter();
  const chnCount = Math.min(32, mod.chn);
  const patCount = mod.pat;
  const insCount = mod.ins;
  w.ascii("Extended Module: ", 17);
  w.ascii(mod.title || "", 20);
  w.u8(26);
  w.ascii("modplayjs", 20);
  w.u16le(260);
  w.u32le(20 + 256);
  w.u16le(Math.min(256, mod.len));
  w.u16le(mod.restart);
  w.u16le(chnCount);
  w.u16le(patCount);
  w.u16le(insCount);
  w.u16le(1);
  w.u16le(mod.speed);
  w.u16le(mod.bpm);
  for (let i = 0; i < 256; i++) w.u8(mod.xxo[i] ?? 0);
  const patOffsets = [];
  for (let p = 0; p < patCount; p++) {
    while (w.bytes_.length % 4 !== 0) w.zeros(1);
    patOffsets.push(w.bytes_.length);
    const pat = mod.patterns[p];
    const packed = packPattern(pat, chnCount);
    w.u32le(9);
    w.u8(0);
    w.u16le(pat.rows);
    w.u16le(packed.length);
    w.bytes(packed);
  }
  const insOffsets = [];
  for (let i = 0; i < insCount; i++) {
    while (w.bytes_.length % 4 !== 0) w.zeros(1);
    insOffsets.push(w.bytes_.length);
    const ins = mod.instruments[i];
    w.u32le(4 + 22 + 1 + 2);
    w.ascii(ins.name || "", 22);
    w.u8(0);
    w.u16le(ins.nsm > 0 ? 1 : 0);
    w.u32le(40);
    const smpHdrOffPos = w.bytes_.length;
    w.u32le(0);
    if (ins.nsm > 0) {
      const sub = ins.sub[0];
      const smp = mod.samples[sub.sid];
      const smpHdrStart = w.bytes_.length;
      w.patchU32le(smpHdrOffPos, smpHdrStart);
      w.u32le(smp?.length ?? 0);
      w.u32le(smp?.loopStart ?? 0);
      w.u32le(smp && smp.loopEnd > smp.loopStart ? smp.loopEnd - smp.loopStart : 0);
      w.u8(smp && smp.loopEnd > smp.loopStart ? smp.loopEnd - smp.loopStart > 16 ? 1 : 2 : 0);
      w.u8(smp?.volume ?? 64);
      w.u8(smp?.finetune ?? 0);
      w.u8(0);
      w.u8(0);
      w.u8(sub.xpo >= 0 ? Math.min(127, sub.xpo) : Math.max(0, 128 + sub.xpo));
      w.u8(0);
      w.u16le(smp?.c5spd ?? 8363);
      w.zeros(2);
      w.ascii((smp?.name ?? "").slice(0, 22), 22);
      w.ascii("modplayjs", 8);
      if (smp && smp.length) {
        let acc = 0;
        const delta = new Uint8Array(smp.length);
        for (let j = 0; j < smp.length; j++) {
          acc = acc + (smp.data[j] - 128) & 255;
          delta[j] = acc;
        }
        w.bytes(delta);
      }
    }
  }
  return w.bytes_;
};
var xmExportPlugin = () => ({
  name: "xm",
  label: "FastTracker II (.xm)",
  extension: "xm",
  supports: (mod) => mod.format === "xm",
  write: writeXm
});
export {
  plugin,
  xmExportPlugin,
  xmLoad,
  xmTest
};

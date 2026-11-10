// ../../packages/fmt-med/src/mmd1.ts
import {
  C4_NTSC_RATE as C4_NTSC_RATE2,
  ParseError as ParseError3,
  Quirk,
  ReadEventType
} from "@modplayjs/core";

// ../../packages/fmt-med/src/mmdCommon.ts
import {
  FX,
  ParseError,
  XMP_KEY_CUT,
  MED_VER_210 as IMPORTED_MED_VER_210,
  MED_VER_300 as IMPORTED_MED_VER_300,
  MED_VER_320 as IMPORTED_MED_VER_320,
  MED_VER_OCTAMED_100 as IMPORTED_MED_VER_OCTAMED_100,
  MED_VER_OCTAMED_200 as IMPORTED_MED_VER_OCTAMED_200,
  MED_VER_OCTAMED_300 as IMPORTED_MED_VER_OCTAMED_300,
  MED_VER_OCTAMED_500 as IMPORTED_MED_VER_OCTAMED_500,
  MED_VER_OCTAMED_502 as IMPORTED_MED_VER_OCTAMED_502,
  MED_VER_OCTAMED_SS_1 as IMPORTED_MED_VER_OCTAMED_SS_1,
  MED_VER_OCTAMED_SS_2 as IMPORTED_MED_VER_OCTAMED_SS_2
} from "@modplayjs/core";
var MED_VER_210 = IMPORTED_MED_VER_210;
var MED_VER_300 = IMPORTED_MED_VER_300;
var MED_VER_320 = IMPORTED_MED_VER_320;
var MED_VER_OCTAMED_100 = IMPORTED_MED_VER_OCTAMED_100;
var MED_VER_OCTAMED_200 = IMPORTED_MED_VER_OCTAMED_200;
var MED_VER_OCTAMED_300 = IMPORTED_MED_VER_OCTAMED_300;
var MED_VER_OCTAMED_500 = IMPORTED_MED_VER_OCTAMED_500;
var MED_VER_OCTAMED_502 = IMPORTED_MED_VER_OCTAMED_502;
var MED_VER_OCTAMED_SS_1 = IMPORTED_MED_VER_OCTAMED_SS_1;
var MED_VER_OCTAMED_SS_2 = IMPORTED_MED_VER_OCTAMED_SS_2;
var DEFAULT_TIME_FACTOR = 10;
var MED_TIME_FACTOR = 2.64;
var FLAG_INSTRSATT = 8;
var FLAG_VOLHEX = 16;
var FLAG_STSLIDE = 32;
var FLAG_8CHANNEL = 64;
var FLAG2_BMASK = 31;
var FLAG2_BPM = 32;
var MMD3_DEFAULT_NOTE = 53;
var S_16 = 16;
var STEREO = 32;
var MMD_NUM_OCT = [5, 3, 2, 4, 6, 7];
function zeroInstrExt() {
  return {
    hold: 0,
    decay: 0,
    suppress_midi_off: 0,
    finetune: 0,
    default_pitch: 0,
    instr_flags: 0,
    long_repeat: 0,
    long_replen: 0
  };
}
function zeroExpData() {
  return { s_ext_entries: 0, s_ext_entrsz: 0, i_ext_entries: 0, i_ext_entrsz: 0, annolen: 0, songnamelen: 0 };
}
function mmdConvertTempo(tempo, bpmOn, med8ch) {
  const temposCompat = [195, 97, 65, 49, 39, 32, 28, 24, 22, 20];
  const tempos8ch = [179, 164, 152, 141, 131, 123, 116, 110, 104, 99];
  if (tempo > 0) {
    if (med8ch) {
      const t = tempo > 10 ? 10 : tempo;
      return tempos8ch[t - 1];
    }
    if (tempo <= 10 && !bpmOn) {
      return temposCompat[tempo - 1];
    }
  }
  return tempo;
}
function mmdXlatFx(event, bpmOn, bpmlen, med8ch, hexvol) {
  switch (event.fxt) {
    case 0:
      break;
    case 1:
      if (!event.fxp) event.fxt = 0;
      break;
    case 2:
      if (!event.fxp) event.fxt = 0;
      break;
    case 3:
      break;
    case 4:
      event.fxt = FX.FX_VIBRATO2;
      break;
    case 5:
    // slide + fade
    case 6:
    // vibrato + fade
    case 7:
      break;
    case 8:
      event.fxt = FX.FX_MED_HOLD;
      break;
    case 9:
      if (event.fxp >= 1 && event.fxp <= 32) {
        event.fxt = FX.FX_SPEED;
      } else {
        event.fxt = 0;
        event.fxp = 0;
      }
      break;
    case 10:
    // protracker-compatible
    case 11:
    // position jump
    case 12:
      if (!hexvol) {
        const p = event.fxp;
        event.fxp = (p >> 8 & 255) * 10 + (p & 255);
      }
      break;
    case 13:
      event.fxt = FX.FX_VOLSLIDE;
      break;
    case 14:
      event.fxt = 0;
      event.fxp = 0;
      break;
    case 15:
      if (event.fxp === 0) {
        event.fxt = FX.FX_BREAK;
        break;
      } else if (event.fxp <= 240) {
        event.fxt = FX.FX_S3M_BPM;
        event.fxp = mmdConvertTempo(event.fxp, bpmOn, med8ch);
        break;
      } else {
        switch (event.fxp) {
          case 241:
            event.fxt = FX.FX_EXTENDED;
            event.fxp = 9 << 4 | 3;
            break;
          case 242:
            event.fxt = FX.FX_EXTENDED;
            event.fxp = 13 << 4 | 3;
            break;
          case 243:
            event.fxt = FX.FX_MED_RETRIG;
            event.fxp = 2;
            break;
          case 248:
          // turn filter off
          case 249:
          // turn filter on
          case 250:
          // MIDI pedal on
          case 251:
          // MIDI pedal off
          case 253:
          // set pitch
          case 254:
            event.fxt = 0;
            event.fxp = 0;
            break;
          case 255:
            event.fxt = 0;
            event.fxp = 0;
            event.note = XMP_KEY_CUT;
            break;
          default:
            event.fxt = 0;
            event.fxp = 0;
        }
      }
      break;
    case 17:
      event.fxt = FX.FX_F_PORTA_UP;
      break;
    case 18:
      event.fxt = FX.FX_F_PORTA_DN;
      break;
    case 20:
      event.fxt = FX.FX_VIBRATO;
      break;
    case 21:
      event.fxt = FX.FX_FINETUNE;
      event.fxp = event.fxp + 8 << 4;
      break;
    case 22:
      event.fxt = FX.FX_EXTENDED;
      if (event.fxp > 15) event.fxp = 15;
      event.fxp |= 96;
      break;
    case 24:
      event.fxt = FX.FX_EXTENDED;
      if (event.fxp > 15) event.fxp = 15;
      event.fxp |= 192;
      break;
    case 25:
      event.fxt = FX.FX_OFFSET;
      break;
    case 26:
      event.fxt = event.fxp ? FX.FX_F_VSLIDE_UP : 0;
      break;
    case 27:
      event.fxt = event.fxp ? FX.FX_F_VSLIDE_DN : 0;
      break;
    case 29:
      event.fxt = FX.FX_BREAK;
      break;
    case 30:
      event.fxt = FX.FX_PATT_DELAY;
      break;
    case 31:
      if (event.fxp !== 0 && event.note !== 0) {
        event.fxt = FX.FX_MED_RETRIG;
      } else {
        event.fxt = 0;
        event.fxp = 0;
      }
      break;
    case 32:
      if (event.fxp === 0 && event.note !== 0) {
        event.fxt = FX.FX_REVERSE;
        event.fxp = 1;
      } else {
        event.fxt = 0;
        event.fxp = 0;
      }
      break;
    case 46: {
      if (event.fxp >= 240 || event.fxp <= 16) {
        let fxp = (event.fxp << 24 >> 24) + 16;
        fxp <<= 3;
        if (fxp === 256) fxp--;
        event.fxt = FX.FX_SETPAN;
        event.fxp = fxp;
      }
      break;
    }
    default:
      event.fxt = 0;
      event.fxp = 0;
      break;
  }
  void bpmlen;
  void hexvol;
}
function mmdSetBpm(med8ch, deftempo, bpmOn, bpmlen) {
  const bpm = mmdConvertTempo(deftempo, bpmOn, med8ch);
  let timeFactor = MED_TIME_FACTOR;
  if (med8ch) {
    timeFactor = DEFAULT_TIME_FACTOR;
  } else if (bpmOn) {
    timeFactor = DEFAULT_TIME_FACTOR * 4 / bpmlen;
  }
  return { bpm, timeFactor };
}
function mmdTrackerVersion(mmdver, mmdc, med8ch, expdata) {
  let soundstudio = 0;
  let medver = 0;
  const sExtEntrsz = expdata ? expdata.s_ext_entrsz : 0;
  const songnamelen = expdata ? expdata.songnamelen : 0;
  let mmdch = "0".charCodeAt(0) + mmdver;
  if (sExtEntrsz > 18) {
    medver = MED_VER_OCTAMED_SS_2;
    soundstudio = 2;
  } else if (mmdver >= 3) {
    medver = MED_VER_OCTAMED_SS_1;
    soundstudio = 1;
  } else if (sExtEntrsz > 10) {
    medver = MED_VER_OCTAMED_SS_1;
    soundstudio = 1;
  } else if (sExtEntrsz > 8) {
    medver = MED_VER_OCTAMED_502;
  } else if (sExtEntrsz > 4) {
    medver = MED_VER_OCTAMED_500;
  } else if (mmdver >= 2) {
    medver = MED_VER_OCTAMED_500;
  } else if (songnamelen > 0) {
    medver = MED_VER_OCTAMED_300;
  } else if (mmdver >= 1) {
    medver = MED_VER_OCTAMED_300;
  } else if (sExtEntrsz > 2) {
    if (med8ch) {
      medver = MED_VER_OCTAMED_200;
    } else {
      medver = MED_VER_320;
    }
  } else if (expdata !== null) {
    if (med8ch) {
      medver = MED_VER_OCTAMED_100;
    } else {
      medver = MED_VER_300;
    }
  } else {
    medver = MED_VER_210;
  }
  if (mmdc) {
    mmdch = "C".charCodeAt(0);
  }
  const ch = String.fromCharCode(mmdch);
  let type;
  if (soundstudio === 2) {
    type = `MED Soundstudio 2.00 MMD${ch}`;
  } else if (soundstudio === 1) {
    type = `OctaMED Soundstudio MMD${ch}`;
  } else if (medver > MED_VER_320) {
    type = `OctaMED ${medver >> 12}.${(medver & 255).toString(16).padStart(2, "0")} MMD${ch}`;
  } else {
    type = `MED ${medver >> 8}.${(medver & 255).toString(16).padStart(2, "0")} MMD${ch}`;
  }
  return { medver, type };
}
function readInstrExtArray(u8, u16, u32, seek, count, expdata, ver2plus) {
  const out = [];
  for (let i = 0; i < count && i < expdata.s_ext_entries; i++) {
    const e = zeroInstrExt();
    let skip = expdata.s_ext_entrsz;
    if (expdata.s_ext_entrsz >= 2) {
      e.hold = u8();
      e.decay = u8();
      skip -= 2;
    }
    if (expdata.s_ext_entrsz >= 4) {
      e.suppress_midi_off = u8();
      e.finetune = u8();
      skip -= 2;
    }
    if (ver2plus && expdata.s_ext_entrsz >= 8) {
      e.default_pitch = u8();
      e.instr_flags = u8();
      void u16();
      skip -= 4;
    }
    if (ver2plus && expdata.s_ext_entrsz >= 10) {
      void u16();
      skip -= 2;
    }
    if (ver2plus && expdata.s_ext_entrsz >= 18) {
      e.long_repeat = u32();
      e.long_replen = u32();
      skip -= 8;
    }
    out.push(e);
    if (skip) seek(skip);
  }
  return out;
}
function readInstrInfoArray(raw, seek, count, expdata) {
  const out = [];
  for (let i = 0; i < count && i < expdata.i_ext_entries; i++) {
    const skip = expdata.i_ext_entrsz - 40;
    const name = raw(40);
    if (name.length < 40) throw new ParseError("MED: iinfo truncated");
    out.push(copyAdjustName(name, 40));
    if (skip) seek(skip);
  }
  return out;
}
function copyAdjustName(r, n) {
  let s = "";
  for (let i = 0; i < n && i < r.length; i++) {
    const c = r[i];
    if (c === 0) break;
    s += c > 127 || c < 32 || c === 127 ? "." : String.fromCharCode(c);
  }
  return s.replace(/ +$/, "");
}

// ../../packages/fmt-med/src/instr.ts
import {
  C4_NTSC_RATE,
  ParseError as ParseError2,
  SampleFlags
} from "@modplayjs/core";
function emptySynth() {
  return {
    defaultdecay: 0,
    rep: 0,
    replen: 0,
    voltbllen: 0,
    wftbllen: 0,
    volspeed: 0,
    wfspeed: 0,
    wforms: 0,
    wf: []
  };
}
var Reader = class {
  constructor(bytes, start) {
    this.bytes = bytes;
    this.pos = start;
  }
  pos;
  get length() {
    return this.bytes.length;
  }
  u8() {
    return this.bytes[this.pos++] ?? 0;
  }
  s8() {
    return this.u8() << 24 >> 24;
  }
  u16() {
    const v = this.bytes[this.pos] << 8 | this.bytes[this.pos + 1];
    this.pos += 2;
    return v;
  }
  s16() {
    return this.u16() << 16 >> 16;
  }
  u32() {
    const v = (this.bytes[this.pos] << 24 | this.bytes[this.pos + 1] << 16 | this.bytes[this.pos + 2] << 8 | this.bytes[this.pos + 3]) >>> 0;
    this.pos += 4;
    return v;
  }
  raw(n) {
    const s = this.bytes.subarray(this.pos, this.pos + n);
    this.pos += n;
    return s;
  }
  seek(p) {
    this.pos = p;
  }
  skip(n) {
    this.pos += n;
  }
  eof() {
    return this.pos >= this.bytes.length;
  }
};
function makeSub() {
  return {
    vol: 0,
    gvl: 64,
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
  };
}
function instrumentInfo(st, instr, e, sample) {
  const ver = st.ver;
  let flg = 0;
  let enable = 1;
  if (ver >= 2 && st.expdata.s_ext_entrsz >= 8) {
    if (e.instr_flags & 1) flg |= SampleFlags.LOOP;
    if (e.instr_flags & 8) flg |= SampleFlags.BIDIR;
    if (e.instr_flags & 4) enable = 0;
  } else {
    if (sample.replen > 1) flg |= SampleFlags.LOOP;
  }
  let sampletrans = 36 + sample.strans;
  const synthtrans = 12 + sample.strans;
  let length = 0;
  let rep = 0;
  let replen = 0;
  if (instr) {
    const sampleType = instr.type & ~(S_16 | 24 | STEREO);
    if (ver >= 3 && sampleType === 0 || sampleType === 7) {
      sampletrans -= 24;
    }
    length = instr.length;
    if (ver >= 3 && st.expdata.s_ext_entrsz >= 18) {
      rep = e.long_repeat;
      replen = e.long_replen;
    } else {
      rep = sample.rep << 1;
      replen = sample.replen << 1;
    }
    if (instr.type & S_16) {
      flg |= SampleFlags.BITS16;
      length >>= 1;
    }
    if (instr.type & STEREO) {
      flg |= SampleFlags.STEREO;
    }
  }
  return { length, rep, replen, sampletrans, synthtrans, flg, enable };
}
function mmdSetDefaultPitchNote(st, i, e, ver) {
  if (ver >= 3) {
    let note = 53;
    if (e.default_pitch) note = e.default_pitch - 1;
    if (note >= 0 && note < 121) {
      st.instruments[i].mapXpo[12] = note;
    }
  }
}
function mmdAllocTables(st, i, synth) {
  const ie = st.instruments[i].extras;
  if (!ie) return;
  ie.volTable = st.bytes.slice(
    st.start + (synth.voltblPos ?? 0),
    st.start + (synth.voltblPos ?? 0) + synth.voltbllen
  );
  ie.wavTable = st.bytes.slice(
    st.start + (synth.wftblPos ?? 0),
    st.start + (synth.wftblPos ?? 0) + synth.wftbllen
  );
}
function loadSampleInto(st, smpIdx, bigend) {
  const s = st.samples[smpIdx];
  const is16 = (s.flags & SampleFlags.BITS16) !== 0;
  const stereo = (s.flags & SampleFlags.STEREO) !== 0;
  const bytelen = s.length * (is16 ? 2 : 1) * (stereo ? 2 : 1);
  const cur = "r" in st && st.r ? st.r : st;
  const take = Math.min(bytelen, Math.max(0, st.bytes.length - cur.pos));
  s.data = st.bytes.subarray(cur.pos, cur.pos + take);
  if (bigend) s.flags |= 1 << 11;
  cur.pos += bytelen;
  if (cur !== st) st.pos = cur.pos;
}
function readSynthInstr(r, pos) {
  r.seek(pos);
  const synth = emptySynth();
  synth.defaultdecay = r.u8();
  r.skip(3);
  synth.rep = r.u16();
  synth.replen = r.u16();
  synth.voltbllen = r.u16();
  synth.wftbllen = r.u16();
  synth.volspeed = r.u8();
  synth.wfspeed = r.u8();
  synth.wforms = r.u16();
  synth.voltblPos = r.pos;
  r.skip(synth.voltbllen);
  synth.wftblPos = r.pos;
  r.skip(synth.wftbllen);
  for (let j = 0; j < synth.wforms; j++) synth.wf.push(r.u32());
  return synth;
}
function synthExtras(synth) {
  return {
    vts: synth.volspeed,
    wts: synth.wfspeed,
    vtlen: synth.voltbllen,
    wtlen: synth.wftbllen,
    hold: 0,
    decay: 0,
    default_pitch: 0,
    finetune: 0,
    suppress_midi_off: 0,
    long_repeat: 0,
    long_replen: 0,
    volTable: null,
    wavTable: null
  };
}
function holdDecayExtras(e) {
  return {
    vts: 0,
    wts: 0,
    vtlen: 0,
    wtlen: 0,
    hold: e.hold,
    decay: e.decay,
    default_pitch: e.default_pitch,
    finetune: e.finetune,
    suppress_midi_off: e.suppress_midi_off,
    long_repeat: 0,
    long_replen: 0,
    volTable: null,
    wavTable: null
  };
}
function loadHybridInstrument(st, i, smpIdx0, e, sample) {
  const r = st.r;
  let smpIdx = smpIdx0;
  const pos = r.pos;
  const synth = readSynthInstr(r, pos);
  if (synth.voltbllen > 128 || synth.wftbllen > 128 || synth.wforms < 1 || synth.wforms > 64) {
    throw new ParseError2(`MED: invalid synth tables at instrument ${i}`);
  }
  r.seek(pos - 6 + synth.wf[0]);
  const length = r.u32();
  const type = r.s16();
  if (type !== 0) {
    throw new ParseError2(`MED: unsupported sample type ${type} for hybrid`);
  }
  const xxi = st.instruments[i];
  xxi.nsm = synth.wforms;
  xxi.sub = [];
  for (let j = 0; j < synth.wforms; j++) xxi.sub.push(makeSub());
  const ie = synthExtras(synth);
  xxi.extras = ie;
  const info = instrumentInfo(st, { length, type }, e, sample);
  mmdSetDefaultPitchNote(st, i, e, st.ver);
  const fin = (e.finetune << 4 & 255) << 24 >> 24;
  {
    const sub = xxi.sub[0];
    sub.vol = info.enable ? sample.svol : 0;
    sub.xpo = info.sampletrans;
    sub.sid = smpIdx;
    sub.fin = fin;
    st.samples[smpIdx] = {
      name: "",
      data: new Uint8Array(0),
      length: info.length,
      loopStart: info.rep,
      loopEnd: info.rep + info.replen,
      sustainStart: 0,
      sustainEnd: 0,
      finetune: fin,
      volume: sub.vol,
      flags: info.flg,
      c5spd: C4_NTSC_RATE
    };
    loadSampleInto(st, smpIdx, 0);
    smpIdx++;
  }
  for (let j = 1; j < synth.wforms; j++) {
    const sub = xxi.sub[j];
    sub.vol = info.enable ? 64 : 0;
    sub.xpo = info.synthtrans;
    sub.sid = smpIdx;
    sub.fin = fin;
    r.seek(pos - 6 + synth.wf[j]);
    const len = r.u16() * 2;
    st.samples[smpIdx] = {
      name: "",
      data: new Uint8Array(0),
      length: len,
      loopStart: 0,
      loopEnd: len,
      sustainStart: 0,
      sustainEnd: 0,
      finetune: fin,
      volume: sub.vol,
      flags: SampleFlags.LOOP,
      c5spd: C4_NTSC_RATE
    };
    loadSampleInto(st, smpIdx, 0);
    smpIdx++;
  }
  mmdAllocTables(st, i, synth);
  return smpIdx;
}
function loadSynthInstrument(st, i, smpIdx, e, sample) {
  const r = st.r;
  const pos = r.pos;
  const info = instrumentInfo(st, null, e, sample);
  mmdSetDefaultPitchNote(st, i, e, st.ver);
  const synth = readSynthInstr(r, pos);
  if (synth.wforms === 65535) {
    st.instruments[i].nsm = 0;
    return { smpIdx, wforms: 0 };
  }
  if (synth.voltbllen > 128 || synth.wftbllen > 128 || synth.wforms > 64) {
    throw new ParseError2(`MED: invalid synth tables at instrument ${i}`);
  }
  const xxi = st.instruments[i];
  xxi.nsm = synth.wforms;
  xxi.sub = [];
  for (let j = 0; j < synth.wforms; j++) xxi.sub.push(makeSub());
  const ie = synthExtras(synth);
  xxi.extras = ie;
  const fin = (e.finetune << 4 & 255) << 24 >> 24;
  for (let j = 0; j < synth.wforms; j++) {
    const sub = xxi.sub[j];
    sub.vol = info.enable ? 64 : 0;
    sub.xpo = info.synthtrans;
    sub.sid = smpIdx;
    sub.fin = fin;
    r.seek(pos - 6 + synth.wf[j]);
    const len = r.u16() * 2;
    st.samples[smpIdx] = {
      name: "",
      data: new Uint8Array(0),
      length: len,
      loopStart: 0,
      loopEnd: len,
      sustainStart: 0,
      sustainEnd: 0,
      finetune: fin,
      volume: sub.vol,
      flags: SampleFlags.LOOP,
      c5spd: C4_NTSC_RATE
    };
    loadSampleInto(st, smpIdx, 0);
    smpIdx++;
  }
  mmdAllocTables(st, i, synth);
  return { smpIdx, wforms: synth.wforms };
}
var IFFOCT_INSMAP = [
  [1, 1, 1, 0, 0, 0, 0, 0, 0],
  [2, 2, 2, 2, 2, 2, 1, 1, 0],
  [3, 3, 3, 2, 2, 2, 1, 1, 0],
  [4, 4, 4, 3, 2, 2, 1, 1, 0],
  [5, 5, 5, 5, 4, 3, 2, 1, 0],
  [6, 6, 6, 6, 5, 4, 3, 2, 1]
];
var IFFOCT_XPOMAP = [
  [12, 12, 12, 0, 0, 0, 0, 0, 0],
  [12, 12, 12, 12, 12, 12, 0, 0, -12],
  [12, 12, 12, 0, 0, 0, -12, -12, -24],
  [24, 24, 24, 12, 0, 0, -12, -24, -36],
  [12, 12, 12, 12, 0, -12, -24, -36, -48],
  [12, 12, 12, 12, 0, -12, -24, -36, -48]
];
function loadIffoctInstrument(st, i, smpIdx0, instr, numOct, e, sample) {
  let smpIdx = smpIdx0;
  if (numOct < 2 || numOct > 7) {
    throw new ParseError2(`MED: invalid octave count at instrument ${i}`);
  }
  if ((instr.length | 0) < 0) {
    throw new ParseError2(`MED: absurd IFFOCT instrument ${i}`);
  }
  const xxi = st.instruments[i];
  xxi.nsm = numOct;
  xxi.sub = [];
  for (let j = 0; j < numOct; j++) xxi.sub.push(makeSub());
  xxi.extras = holdDecayExtras(e);
  let size = Math.trunc(instr.length / ((1 << numOct) - 1));
  const info = instrumentInfo(st, instr, e, sample);
  const fin = (e.finetune << 4 & 255) << 24 >> 24;
  for (let j = 0; j < numOct; j++) {
    const sub = xxi.sub[j];
    sub.vol = info.enable ? sample.svol : 0;
    sub.xpo = info.sampletrans - 12;
    sub.sid = smpIdx;
    sub.fin = fin;
    st.samples[smpIdx] = {
      name: "",
      data: new Uint8Array(0),
      length: size,
      loopStart: info.rep,
      loopEnd: info.rep + info.replen,
      sustainStart: 0,
      sustainEnd: 0,
      finetune: fin,
      volume: sub.vol,
      flags: info.flg,
      c5spd: C4_NTSC_RATE
    };
    loadSampleInto(st, smpIdx, 1);
    smpIdx++;
    size <<= 1;
    info.rep <<= 1;
    info.replen <<= 1;
  }
  for (let j = 0; j < 9; j++) {
    for (let k = 0; k < 12; k++) {
      xxi.map[12 * j + k] = IFFOCT_INSMAP[numOct - 2][j];
      xxi.mapXpo[12 * j + k] = IFFOCT_XPOMAP[numOct - 2][j];
    }
  }
  return smpIdx;
}
function loadSampledInstrument(st, i, smpIdx, instr, e, sample) {
  const xxi = st.instruments[i];
  xxi.nsm = 1;
  xxi.sub = [makeSub()];
  xxi.extras = holdDecayExtras(e);
  const info = instrumentInfo(st, instr, e, sample);
  mmdSetDefaultPitchNote(st, i, e, st.ver);
  const sub = xxi.sub[0];
  sub.vol = info.enable ? sample.svol : 0;
  sub.xpo = info.sampletrans;
  sub.sid = smpIdx;
  sub.fin = (e.finetune << 4 & 255) << 24 >> 24;
  st.samples[smpIdx] = {
    name: "",
    data: new Uint8Array(0),
    length: info.length,
    loopStart: info.rep,
    loopEnd: info.rep + info.replen,
    sustainStart: 0,
    sustainEnd: 0,
    finetune: sub.fin,
    volume: sub.vol,
    flags: info.flg,
    c5spd: C4_NTSC_RATE
  };
  if (st.ver < 3) {
    const octaves = (instr.type & 7) === 7 ? 5 : 3;
    for (let j = 0; j < 9; j++) {
      for (let k = 0; k < 12; k++) {
        let xpo = 0;
        if (j < 1) xpo = 12 * (1 - j);
        else if (j > octaves) xpo = -12 * (j - octaves);
        xxi.mapXpo[12 * j + k] = xpo;
      }
    }
  }
  loadSampleInto(st, smpIdx, 1);
  return smpIdx + 1;
}
function mmdLoadInstrument(st, i, smpIdx) {
  const r = new Reader(st.bytes, st.pos);
  const cst = { ...st, r };
  const length = r.u32();
  const type = r.s16();
  const sampleType = type & ~(S_16 | 24 | STEREO);
  const e = st.expSmp[i] ?? {
    hold: 0,
    decay: 0,
    suppress_midi_off: 0,
    finetune: 0,
    default_pitch: 0,
    instr_flags: 0,
    long_repeat: 0,
    long_replen: 0
  };
  const sample = st.song[i] ?? {
    rep: 0,
    replen: 0,
    midich: 0,
    midipreset: 0,
    svol: 0,
    strans: 0
  };
  let out;
  if (type === -2) {
    out = loadHybridInstrument(cst, i, smpIdx, e, sample);
  } else if (type === -1) {
    const res = loadSynthInstrument(cst, i, smpIdx, e, sample);
    out = res.smpIdx;
  } else if (type >= 1 && type <= 6) {
    const oct = MMD_NUM_OCT[type - 1];
    out = loadIffoctInstrument(cst, i, smpIdx, { length, type }, oct, e, sample);
  } else if (sampleType === 0 || sampleType === 7) {
    out = loadSampledInstrument(cst, i, smpIdx, { length, type }, e, sample);
  } else {
    throw new ParseError2(`MED: invalid instrument type ${type}`);
  }
  st.pos = r.pos;
  return out;
}

// ../../packages/fmt-med/src/mmd1.ts
var XMP_MAX_KEYS = 121;
function mmd1Test(bytes) {
  if (bytes.length < 4) return false;
  const id = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]);
  return id === "MMD0" || id === "MMD1" || id === "MMDC";
}
function mmdReadTitle(bytes, start = 0) {
  if (bytes.length < 36) return "";
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const offset = dv.getUint32(32, false);
  if (offset) {
    const p = start + offset + 44;
    if (p + 8 > bytes.length) return "";
    const off2 = dv.getUint32(p, false);
    const len = dv.getUint32(p + 4, false);
    const q = start + off2;
    if (q >= bytes.length) return "";
    let s = "";
    for (let i = 0; i < len && q + i < bytes.length; i++) {
      const c = bytes[q + i];
      if (c === 0) break;
      s += String.fromCharCode(c);
    }
    return s;
  }
  return "";
}
function mmd1Load(bytes, ctx) {
  const start = 0;
  let pos = start;
  const u8 = () => {
    const v = pos < bytes.length ? bytes[pos] : 255;
    pos++;
    return v;
  };
  const s8 = () => u8() << 24 >> 24;
  const u16 = () => {
    if (pos + 2 > bytes.length) {
      pos += 2;
      return 65535;
    }
    const v = bytes[pos] << 8 | bytes[pos + 1];
    pos += 2;
    return v;
  };
  const s16 = () => u16() << 16 >> 16;
  const u32 = () => {
    if (pos + 4 > bytes.length) {
      pos += 4;
      return 4294967295;
    }
    const v = (bytes[pos] << 24 | bytes[pos + 1] << 16 | bytes[pos + 2] << 8 | bytes[pos + 3]) >>> 0;
    pos += 4;
    return v;
  };
  const s32 = () => u32() | 0;
  const seek = (p) => {
    if (p < 0) throw new ParseError3("MED: seek error");
    pos = p;
  };
  const skip = (n) => {
    pos += n;
  };
  const raw = (n) => {
    const s = bytes.subarray(pos, pos + n);
    pos += n;
    return s;
  };
  let ver = bytes[3] - "1".charCodeAt(0) + 1;
  let mmdc = 0;
  if (ver > 1) {
    ver = 0;
    mmdc = 1;
  }
  seek(start + 4);
  u32();
  const songOffset = s32();
  skip(4);
  const blockarrOffset = s32();
  u32();
  const smplarrOffset = s32();
  u32();
  const expdataOffset = s32();
  u32();
  skip(10);
  u8();
  u8();
  seek(start + songOffset);
  const song = [];
  for (let i = 0; i < 63; i++) {
    song.push({
      rep: u16(),
      replen: u16(),
      midich: u8(),
      midipreset: u8(),
      svol: u8(),
      strans: s8()
    });
  }
  const numblocks = u16();
  const songlen = u16();
  if (numblocks > 255 || songlen > 256) {
    throw new ParseError3(`MED: unsupported block count (${numblocks}) or song length (${songlen})`);
  }
  const playseq = [];
  for (let i = 0; i < 256; i++) playseq.push(u8());
  const deftempo = u16();
  const playtransp = s8();
  const flags = u8();
  const flags2 = u8();
  const tempo2 = u8();
  const trkvol = [];
  for (let i = 0; i < 16; i++) trkvol.push(u8());
  u8();
  const numsamples = u8();
  if (numsamples > 63) {
    throw new ParseError3(`MED: invalid instrument count ${numsamples}`);
  }
  let quirks = Quirk.RTONCE;
  const stslide = (flags & FLAG_STSLIDE) !== 0;
  if (!stslide) quirks |= Quirk.VSALL | Quirk.PBALL;
  const hexvol = (flags & FLAG_VOLHEX) !== 0 ? 1 : 0;
  const med8ch = (flags & FLAG_8CHANNEL) !== 0 ? 1 : 0;
  const bpmOn = (flags2 & FLAG2_BPM) !== 0 ? 1 : 0;
  const bpmlen = 1 + (flags2 & FLAG2_BMASK);
  const { bpm, timeFactor } = mmdSetBpm(med8ch, deftempo, bpmOn, bpmlen);
  const pat = numblocks;
  const ins = numsamples;
  const len = songlen;
  const xxo = playseq.slice(0, len);
  const smplarr = [];
  seek(start + smplarrOffset);
  for (let i = 0; i < ins; i++) {
    if (pos >= bytes.length) throw new ParseError3(`MED: read error at smplarr pos ${i}`);
    smplarr.push(s32());
  }
  let smp = 0;
  for (let i = 0; i < ins; i++) {
    if (smplarr[i] === 0) continue;
    seek(start + smplarr[i]);
    u32();
    const type2 = s16();
    if (type2 === -1 || type2 === -2) {
      skip(14);
      const wforms = u16();
      if (wforms > 256) {
        throw new ParseError3(`MED: invalid wform count at instrument ${i}`);
      }
      smp += wforms;
    } else if (type2 >= 1 && type2 <= 6) {
      smp += MMD_NUM_OCT[type2 - 1];
    } else {
      smp++;
    }
  }
  if (smp > 1024) {
    throw new ParseError3(`MED: too many samples (${smp})`);
  }
  const expdata = zeroExpData();
  let expsmpOffset = 0;
  let iinfoOffset = 0;
  let annotxtOffset = 0;
  let songnameOffset = 0;
  let title = "";
  let comment = "";
  if (expdataOffset) {
    seek(start + expdataOffset);
    u32();
    expsmpOffset = s32();
    expdata.s_ext_entries = u16();
    expdata.s_ext_entrsz = u16();
    annotxtOffset = s32();
    expdata.annolen = u32();
    iinfoOffset = s32();
    expdata.i_ext_entries = u16();
    expdata.i_ext_entrsz = u16();
    if (expsmpOffset < 0 || annotxtOffset < 0 || expdata.annolen > 65536 || iinfoOffset < 0) {
      throw new ParseError3(`MED: invalid expdata (annotxt=0x${(annotxtOffset >>> 0).toString(16)} annolen=0x${expdata.annolen.toString(16)})`);
    }
    u32();
    u32();
    skip(4);
    u32();
    songnameOffset = s32();
    expdata.songnamelen = u32();
    seek(start + songnameOffset);
    let s = "";
    for (let i = 0; i < expdata.songnamelen; i++) {
      if (i >= 64) break;
      const c = u8();
      if (c === 0) break;
      s += String.fromCharCode(c);
    }
    title = s;
    if (annotxtOffset !== 0 && expdata.annolen !== 0) {
      seek(start + annotxtOffset);
      const buf = raw(expdata.annolen);
      let c = "";
      for (let i = 0; i < buf.length; i++) {
        const ch = buf[i];
        if (ch === 0) break;
        c += String.fromCharCode(ch);
      }
      comment = c;
    }
  }
  const blockarr = [];
  seek(start + blockarrOffset);
  for (let i = 0; i < pat; i++) {
    if (pos > bytes.length) throw new ParseError3(`MED: read error at blockarr pos ${i}`);
    blockarr.push(u32());
  }
  let chn = 0;
  for (let i = 0; i < pat; i++) {
    if (blockarr[i] === 0) continue;
    seek(start + blockarr[i]);
    let numtracks;
    let lines;
    if (ver > 0) {
      numtracks = u16();
      lines = u16();
    } else {
      numtracks = u8();
      lines = u8();
    }
    if (lines + 1 > 3200) {
      throw new ParseError3(`MED: invalid line count ${lines + 1} in block ${i}`);
    }
    if (numtracks > chn) chn = numtracks;
  }
  if (chn > Math.min(16, 64)) {
    throw new ParseError3(`MED: invalid channel count ${chn}`);
  }
  const { medver, type } = mmdTrackerVersion(ver, mmdc, med8ch, expdataOffset ? expdata : null);
  const patterns = [];
  for (let i = 0; i < pat; i++) {
    if (blockarr[i] === 0) {
      const tracks = [];
      for (let k = 0; k < chn; k++) {
        const ev = [];
        for (let j = 0; j < 64; j++) ev.push({ note: 0, ins: 0, vol: 0, fxt: 0, fxp: 0, f2t: 0, f2p: 0 });
        tracks.push({ rows: 64, event: ev });
      }
      patterns.push({ rows: 64, tracks });
      continue;
    }
    seek(start + blockarr[i]);
    let numtracks;
    let lines;
    if (ver > 0) {
      numtracks = u16();
      lines = u16();
      u32();
    } else {
      numtracks = u8();
      lines = u8();
    }
    const rows = lines + 1;
    const size = numtracks * rows * (ver ? 4 : 3);
    const patbuf = new Uint8Array(size);
    if (mmdc) {
      let j = 0;
      while (j < size) {
        const pack = u8();
        if (pack & 128) {
          j += 256 - pack;
          continue;
        }
        let n = pack + 1;
        if (n > size - j) n = size - j;
        patbuf.set(bytes.subarray(pos, pos + n), j);
        pos += n;
        j += n;
      }
    } else {
      if (pos + size > bytes.length) {
        throw new ParseError3(`MED: read error in block ${i}`);
      }
      patbuf.set(bytes.subarray(pos, pos + size));
      pos += size;
    }
    const perTrack = [];
    for (let k = 0; k < chn; k++) {
      const evs = [];
      for (let j = 0; j < rows; j++) evs.push({ note: 0, ins: 0, vol: 0, fxt: 0, fxp: 0, f2t: 0, f2p: 0 });
      perTrack.push(evs);
    }
    let p = 0;
    if (ver > 0) {
      for (let j = 0; j < rows; j++) {
        for (let k = 0; k < numtracks; k++) {
          const e = { note: patbuf[p] & 127, ins: 0, vol: 0, fxt: 0, fxp: 0, f2t: 0, f2p: 0 };
          if (e.note) e.note += 12 + playtransp;
          if (e.note >= XMP_MAX_KEYS) e.note = 0;
          e.ins = patbuf[p + 1] & 63;
          e.fxt = patbuf[p + 2];
          e.fxp = patbuf[p + 3];
          mmdXlatFx(e, bpmOn, bpmlen, med8ch, hexvol);
          perTrack[k][j] = e;
          p += 4;
        }
      }
    } else {
      for (let j = 0; j < rows; j++) {
        for (let k = 0; k < numtracks; k++) {
          const e = { note: patbuf[p] & 63, ins: 0, vol: 0, fxt: 0, fxp: 0, f2t: 0, f2p: 0 };
          if (e.note) e.note += 12 + playtransp;
          if (e.note >= XMP_MAX_KEYS) e.note = 0;
          e.ins = patbuf[p + 1] >> 4 | (patbuf[p] & 128) >> 3 | (patbuf[p] & 64) >> 1;
          e.fxt = patbuf[p + 1] & 15;
          e.fxp = patbuf[p + 2];
          mmdXlatFx(e, bpmOn, bpmlen, med8ch, hexvol);
          perTrack[k][j] = e;
          p += 3;
        }
      }
    }
    const tracksArr = [];
    for (let k = 0; k < chn; k++) tracksArr.push({ rows, event: perTrack[k] });
    patterns.push({ rows, tracks: tracksArr });
  }
  const instruments = [];
  for (let i = 0; i < ins; i++) {
    instruments.push({
      name: "",
      volume: 64,
      nsm: 0,
      rls: 0,
      map: new Array(121).fill(0),
      mapXpo: new Array(121).fill(0),
      sub: [],
      aei: { flags: 0, npt: 0, scl: 0, sus: 0, sue: 0, lps: 0, lpe: 0, x: [], y: [] },
      fei: { flags: 0, npt: 0, scl: 0, sus: 0, sue: 0, lps: 0, lpe: 0, x: [], y: [] },
      pei: { flags: 0, npt: 0, scl: 0, sus: 0, sue: 0, lps: 0, lpe: 0, x: [], y: [] }
    });
  }
  const expSmp = new Array(ins);
  for (let i = 0; i < ins; i++) expSmp[i] = zeroInstrExt();
  if (expsmpOffset) {
    seek(start + expsmpOffset);
    const list = readInstrExtArray(
      (n) => {
        if (n) skip(n);
        return u8();
      },
      () => u16(),
      () => u32(),
      (d) => skip(d),
      ins,
      expdata,
      false
    );
    if (pos > bytes.length) throw new ParseError3("MED: read error at expsmp");
    for (let i = 0; i < list.length; i++) expSmp[i] = list[i];
  }
  if (iinfoOffset) {
    seek(start + iinfoOffset);
    const names = readInstrInfoArray((n) => raw(n), (d) => skip(d), ins, expdata);
    for (let i = 0; i < names.length && i < ins; i++) {
      instruments[i].name = names[i].slice(0, 31);
    }
  }
  const samples = new Array(smp);
  const st = {
    bytes,
    start,
    pos,
    ver,
    samples,
    instruments,
    expdata,
    expSmp,
    song
  };
  let smpIdx = 0;
  for (let i = 0; i < ins; i++) {
    if (smplarr[i] === 0) continue;
    st.pos = start + smplarr[i];
    smpIdx = mmdLoadInstrument(st, i, smpIdx);
  }
  void smpIdx;
  for (const raw2 of samples) {
    if (raw2) ctx.addSample(raw2);
  }
  const channels = [];
  for (let i = 0; i < chn; i++) {
    const pattern = Math.floor((i + 1) / 2) % 2 * 255;
    channels.push({
      vol: trkvol[i] ?? 0,
      pan: Math.min(255, Math.max(0, 128 + (pattern - 128))),
      flg: 0
    });
  }
  const mod = {
    title,
    format: "med",
    comment,
    chn,
    pat,
    ins,
    len,
    restart: 0,
    xxo,
    channels,
    patterns,
    instruments,
    samples: samples.map((s) => s ?? { name: "", data: new Uint8Array(0), length: 0, loopStart: 0, loopEnd: 0, sustainStart: 0, sustainEnd: 0, finetune: 0, volume: 0, flags: 0, c5spd: 8363 }),
    num_sequences: 0,
    sequences: [],
    speed: tempo2,
    bpm,
    volbase: 64,
    gvolbase: 64,
    gvol: 64,
    quirks,
    flowMode: 0,
    readEventType: ReadEventType.MED,
    periodType: 0,
    defpan: 128,
    time_factor: timeFactor,
    rrate: 250,
    c4rate: C4_NTSC_RATE2,
    compare_vblank: false,
    tracker: type,
    extras: { kind: "med", trackerVersion: medver }
  };
  void ctx.sampleRate;
  void ctx.outputRate;
  return mod;
}

// ../../packages/fmt-med/src/mmd3.ts
import {
  C4_NTSC_RATE as C4_NTSC_RATE3,
  ParseError as ParseError4,
  Quirk as Quirk2,
  ReadEventType as ReadEventType2
} from "@modplayjs/core";
var XMP_MAX_KEYS2 = 121;
function mmd3Test(bytes) {
  if (bytes.length < 4) return false;
  const id = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]);
  return id === "MMD2" || id === "MMD3";
}
function mmd3Load(bytes, ctx) {
  const start = 0;
  let pos = start;
  const u8 = () => {
    const v = pos < bytes.length ? bytes[pos] : 255;
    pos++;
    return v;
  };
  const s8 = () => u8() << 24 >> 24;
  const u16 = () => {
    if (pos + 2 > bytes.length) {
      pos += 2;
      return 65535;
    }
    const v = bytes[pos] << 8 | bytes[pos + 1];
    pos += 2;
    return v;
  };
  const s16 = () => u16() << 16 >> 16;
  const u32 = () => {
    if (pos + 4 > bytes.length) {
      pos += 4;
      return 4294967295;
    }
    const v = (bytes[pos] << 24 | bytes[pos + 1] << 16 | bytes[pos + 2] << 8 | bytes[pos + 3]) >>> 0;
    pos += 4;
    return v;
  };
  const s32 = () => u32() | 0;
  const seek = (p) => {
    if (p < 0) throw new ParseError4("MED: seek error");
    pos = p;
  };
  const skip = (n) => {
    pos += n;
  };
  const raw = (n) => {
    const s = bytes.subarray(pos, pos + n);
    pos += n;
    return s;
  };
  const id = String.fromCharCode(bytes[0], bytes[1], bytes[2], bytes[3]);
  void id;
  const ver = bytes[3] - "1".charCodeAt(0) + 1;
  seek(start + 4);
  u32();
  const songOffset = s32();
  skip(4);
  const blockarrOffset = s32();
  u32();
  const smplarrOffset = s32();
  u32();
  const expdataOffset = s32();
  u32();
  skip(10);
  u8();
  u8();
  seek(start + songOffset);
  const song = [];
  for (let i = 0; i < 63; i++) {
    song.push({
      rep: u16(),
      replen: u16(),
      midich: u8(),
      midipreset: u8(),
      svol: u8(),
      strans: s8()
    });
  }
  const numblocks = u16();
  const songlen = u16();
  void songlen;
  const seqtableOffset = u32();
  u32();
  const trackvolsOffset = u32();
  const numtracks = u16();
  const numpseqs = u16();
  const trackpansOffset = u32();
  u32();
  u16();
  u16();
  u8();
  u8();
  u16();
  s8();
  skip(223);
  const deftempo = u16();
  const playtransp = s8();
  const flags = u8();
  const flags2 = u8();
  const tempo2 = u8();
  skip(16);
  u8();
  const numsamples = u8();
  if (numsamples > 63) {
    throw new ParseError4(`MED: invalid instrument count ${numsamples}`);
  }
  seek(start + seqtableOffset);
  const playseqOffset = u32();
  seek(start + playseqOffset);
  skip(32);
  u32();
  u32();
  const len = u16();
  if (len > 255) {
    throw new ParseError4(`MED: unsupported song length ${len}`);
  }
  const xxo = [];
  for (let i = 0; i < len; i++) xxo.push(u16());
  let quirks = Quirk2.RTONCE;
  const stslide = (flags & FLAG_STSLIDE) !== 0;
  if (!stslide) quirks |= Quirk2.VSALL | Quirk2.PBALL;
  const hexvol = (flags & FLAG_VOLHEX) !== 0 ? 1 : 0;
  const med8ch = (flags & FLAG_8CHANNEL) !== 0 ? 1 : 0;
  const bpmOn = (flags2 & FLAG2_BPM) !== 0 ? 1 : 0;
  const bpmlen = 1 + (flags2 & FLAG2_BMASK);
  const { bpm, timeFactor } = mmdSetBpm(med8ch, deftempo, bpmOn, bpmlen);
  void timeFactor;
  const pat = numblocks;
  const ins = numsamples;
  const smplarr = [];
  seek(start + smplarrOffset);
  for (let i = 0; i < ins; i++) {
    if (pos >= bytes.length) throw new ParseError4(`MED: read error at smplarr pos ${i}`);
    smplarr.push(s32());
  }
  let smp = 0;
  for (let i = 0; i < ins; i++) {
    if (smplarr[i] === 0) continue;
    seek(start + smplarr[i]);
    u32();
    const type2 = s16();
    if (type2 === -1 || type2 === -2) {
      skip(14);
      smp += u16();
    } else if (type2 >= 1 && type2 <= 6) {
      smp += MMD_NUM_OCT[type2 - 1];
    } else {
      smp++;
    }
    if (pos > bytes.length) throw new ParseError4(`MED: read error at sample ${i}`);
  }
  if (smp > 1024) {
    throw new ParseError4(`MED: too many samples (${smp})`);
  }
  const expdata = zeroExpData();
  let expsmpOffset = 0;
  let iinfoOffset = 0;
  let songnameOffset = 0;
  let mmdinfoOffset = 0;
  let title = "";
  let comment = "";
  if (expdataOffset) {
    seek(start + expdataOffset);
    u32();
    expsmpOffset = s32();
    expdata.s_ext_entries = u16();
    expdata.s_ext_entrsz = u16();
    u32();
    u32();
    iinfoOffset = s32();
    expdata.i_ext_entries = u16();
    expdata.i_ext_entrsz = u16();
    if (expsmpOffset < 0 || iinfoOffset < 0) {
      throw new ParseError4("MED: invalid expdata");
    }
    u32();
    u32();
    u32();
    u32();
    songnameOffset = s32();
    expdata.songnamelen = u32();
    u32();
    mmdinfoOffset = u32();
    if (pos > bytes.length) throw new ParseError4("MED: read error in expdata");
    seek(start + songnameOffset);
    let s = "";
    for (let i = 0; i < expdata.songnamelen; i++) {
      if (i >= 64) break;
      const c = u8();
      if (c === 0) break;
      s += String.fromCharCode(c);
    }
    title = s;
    if (mmdinfoOffset !== 0) {
      seek(start + mmdinfoOffset);
      u32();
      u16();
      const type2 = u16();
      if (type2 === 1) {
        const infoLen = u32();
        if (infoLen > 0 && infoLen < bytes.length) {
          const buf = raw(infoLen);
          let c = "";
          for (let i = 0; i < buf.length; i++) {
            const ch = buf[i];
            if (ch === 0) break;
            c += String.fromCharCode(ch);
          }
          comment = c;
        }
      }
    }
  }
  const blockarr = [];
  seek(start + blockarrOffset);
  for (let i = 0; i < pat; i++) {
    if (pos > bytes.length) throw new ParseError4(`MED: read error at blockarr pos ${i}`);
    blockarr.push(u32());
  }
  let chn = 0;
  let maxLines = 1;
  for (let i = 0; i < pat; i++) {
    if (blockarr[i] === 0) continue;
    seek(start + blockarr[i]);
    const blockNumtracks = u16();
    const blockLines = u16();
    if (pos > bytes.length) throw new ParseError4(`MED: read error at block ${i}`);
    if (blockLines + 1 > 9999) {
      throw new ParseError4(`MED: invalid line count ${blockLines + 1} in block ${i}`);
    }
    if (blockNumtracks > chn) chn = blockNumtracks;
    if (blockLines + 1 > maxLines) maxLines = blockLines + 1;
  }
  if (chn <= 0 || chn > 64) {
    throw new ParseError4(`MED: invalid channel count ${chn}`);
  }
  void numtracks;
  void numpseqs;
  const { medver, type } = mmdTrackerVersion(ver, 0, med8ch, expdataOffset ? expdata : null);
  void maxLines;
  const patterns = [];
  for (let i = 0; i < pat; i++) {
    if (blockarr[i] === 0) {
      const tracks = [];
      for (let k = 0; k < chn; k++) {
        const ev = [];
        for (let j = 0; j < 64; j++) ev.push({ note: 0, ins: 0, vol: 0, fxt: 0, fxp: 0, f2t: 0, f2p: 0 });
        tracks.push({ rows: 64, event: ev });
      }
      patterns.push({ rows: 64, tracks });
      continue;
    }
    seek(start + blockarr[i]);
    const blockNumtracks = u16();
    const blockLines = u16();
    u32();
    const rows = blockLines + 1;
    const size = blockNumtracks * rows * 4;
    if (pos + size > bytes.length) {
      throw new ParseError4(`MED: read error in block ${i}`);
    }
    const patbuf = bytes.subarray(pos, pos + size);
    pos += size;
    const perTrack = [];
    for (let k = 0; k < chn; k++) {
      const evs = [];
      for (let j = 0; j < rows; j++) evs.push({ note: 0, ins: 0, vol: 0, fxt: 0, fxp: 0, f2t: 0, f2p: 0 });
      perTrack.push(evs);
    }
    let p = 0;
    for (let j = 0; j < rows; j++) {
      for (let k = 0; k < blockNumtracks; k++) {
        const e = { note: 0, ins: 0, vol: 0, fxt: 0, fxp: 0, f2t: 0, f2p: 0 };
        e.note = patbuf[p] & 127;
        if (e.note) e.note += 12 + playtransp;
        if (e.note >= XMP_MAX_KEYS2) e.note = 0;
        e.ins = patbuf[p + 1] & 63;
        e.fxt = patbuf[p + 2];
        e.fxp = patbuf[p + 3];
        mmdXlatFx(e, bpmOn, bpmlen, med8ch, hexvol);
        perTrack[k][j] = e;
        p += 4;
      }
    }
    const tracksArr = [];
    for (let k = 0; k < chn; k++) tracksArr.push({ rows, event: perTrack[k] });
    patterns.push({ rows, tracks: tracksArr });
  }
  const instruments = [];
  for (let i = 0; i < ins; i++) {
    instruments.push({
      name: "",
      volume: 64,
      nsm: 0,
      rls: 0,
      map: new Array(121).fill(0),
      mapXpo: new Array(121).fill(0),
      sub: [],
      aei: { flags: 0, npt: 0, scl: 0, sus: 0, sue: 0, lps: 0, lpe: 0, x: [], y: [] },
      fei: { flags: 0, npt: 0, scl: 0, sus: 0, sue: 0, lps: 0, lpe: 0, x: [], y: [] },
      pei: { flags: 0, npt: 0, scl: 0, sus: 0, sue: 0, lps: 0, lpe: 0, x: [], y: [] }
    });
  }
  const expSmp = new Array(ins);
  for (let i = 0; i < ins; i++) expSmp[i] = zeroInstrExt();
  if (expsmpOffset) {
    seek(start + expsmpOffset);
    const list = readInstrExtArray(
      (n) => {
        if (n) skip(n);
        return u8();
      },
      () => u16(),
      () => u32(),
      (d) => skip(d),
      ins,
      expdata,
      true
    );
    if (pos > bytes.length) throw new ParseError4("MED: read error at expsmp");
    for (let i = 0; i < list.length; i++) expSmp[i] = list[i];
  }
  if (iinfoOffset) {
    seek(start + iinfoOffset);
    const names = readInstrInfoArray((n) => raw(n), (d) => skip(d), ins, expdata);
    for (let i = 0; i < names.length && i < ins; i++) {
      instruments[i].name = names[i].slice(0, 31);
    }
  }
  const samples = new Array(smp);
  const st = {
    bytes,
    start,
    pos,
    ver,
    samples,
    instruments,
    expdata,
    expSmp,
    song
  };
  let smpIdx = 0;
  for (let i = 0; i < ins; i++) {
    if (smplarr[i] === 0) continue;
    st.pos = start + smplarr[i];
    smpIdx = mmdLoadInstrument(st, i, smpIdx);
  }
  void smpIdx;
  for (const raw2 of samples) {
    if (raw2) ctx.addSample(raw2);
  }
  const channels = [];
  seek(start + trackvolsOffset);
  for (let i = 0; i < chn; i++) {
    channels.push({ vol: u8(), pan: 128, flg: 0 });
  }
  if (trackpansOffset) {
    seek(start + trackpansOffset);
    for (let i = 0; i < chn; i++) {
      const p = 8 * s8();
      channels[i].pan = 128 + (p > 127 ? 127 : p);
    }
  } else {
    for (let i = 0; i < chn; i++) channels[i].pan = 128;
  }
  const mod = {
    title,
    format: "med",
    comment,
    chn,
    pat,
    ins,
    len,
    restart: 0,
    xxo,
    channels,
    patterns,
    instruments,
    samples: samples.map((s) => s ?? { name: "", data: new Uint8Array(0), length: 0, loopStart: 0, loopEnd: 0, sustainStart: 0, sustainEnd: 0, finetune: 0, volume: 0, flags: 0, c5spd: 8363 }),
    num_sequences: 0,
    sequences: [],
    speed: tempo2,
    bpm,
    volbase: 64,
    gvolbase: 64,
    gvol: 64,
    quirks,
    flowMode: 0,
    readEventType: ReadEventType2.MED,
    periodType: 0,
    defpan: 128,
    time_factor: MED_TIME_FACTOR,
    rrate: 250,
    c4rate: C4_NTSC_RATE3,
    compare_vblank: false,
    tracker: type,
    extras: { kind: "med", trackerVersion: medver }
  };
  void ctx.sampleRate;
  void ctx.outputRate;
  return mod;
}

// ../../packages/fmt-med/src/med2.ts
import {
  ParseError as ParseError5,
  Quirk as Quirk3,
  ReadEventType as ReadEventType3,
  SampleFlags as SampleFlags2
} from "@modplayjs/core";
function med2Test(bytes) {
  if (bytes.length < 4) return false;
  return bytes[0] === 77 && bytes[1] === 69 && bytes[2] === 68 && bytes[3] === 2;
}
function makeSub2(vol, sid) {
  return {
    vol,
    gvl: 64,
    pan: -1,
    xpo: 0,
    fin: 0,
    vwf: 0,
    vde: 0,
    vra: 0,
    vsw: 0,
    sid,
    rvv: 0,
    nna: 0,
    dct: 0,
    dca: 0,
    ifc: 0,
    ifr: 0
  };
}
function med2Load(bytes, ctx) {
  let pos = 4;
  const u16 = () => {
    const v = bytes[pos] << 8 | bytes[pos + 1];
    pos += 2;
    return v;
  };
  const u8 = () => bytes[pos++] ?? 0;
  const instruments = [];
  for (let i = 0; i < 32; i++) {
    instruments.push({
      name: "",
      volume: 64,
      // med2_load never loads sample data (no med_load_external_instrument
      // call); nsm stays 0 from libxmp_init_instrument.
      nsm: 0,
      rls: 0,
      map: new Array(121).fill(0),
      mapXpo: new Array(121).fill(0),
      sub: [makeSub2(0, i)],
      aei: { flags: 0, npt: 0, scl: 0, sus: 0, sue: 0, lps: 0, lpe: 0, x: [], y: [] },
      fei: { flags: 0, npt: 0, scl: 0, sus: 0, sue: 0, lps: 0, lpe: 0, x: [], y: [] },
      pei: { flags: 0, npt: 0, scl: 0, sus: 0, sue: 0, lps: 0, lpe: 0, x: [], y: [] }
    });
  }
  pos += 40;
  for (let i = 0; i < 31; i++) {
    if (pos + 40 > bytes.length) throw new ParseError5("MED2: truncated names");
    const buf = bytes.subarray(pos, pos + 40);
    pos += 40;
    let s = "";
    for (let j = 0; j < 40; j++) {
      const c = buf[j];
      if (c === 0) break;
      s += c > 127 || c < 32 || c === 127 ? "." : String.fromCharCode(c);
    }
    instruments[i].name = s.replace(/ +$/, "");
  }
  pos += 1;
  for (let i = 0; i < 31; i++) {
    const vol = u8();
    instruments[i].sub[0].vol = vol;
  }
  pos += 2;
  const lps = new Array(32).fill(0);
  for (let i = 0; i < 31; i++) {
    lps[i] = u16();
  }
  pos += 2;
  const lpe = new Array(32).fill(0);
  const flg = new Array(32).fill(0);
  for (let i = 0; i < 31; i++) {
    const lsiz = u16();
    lpe[i] = lps[i] + lsiz;
    flg[i] = lsiz > 1 ? SampleFlags2.LOOP : 0;
  }
  const chn = 4;
  const pat = u16();
  const xxoRaw = [];
  for (let i = 0; i < 100; i++) xxoRaw.push(u8());
  const len = u16();
  if (pat > 256 || len > 100) {
    throw new ParseError5("MED2: invalid pattern count or song length");
  }
  const xxo = xxoRaw.slice(0, len);
  const k = u16();
  if (k < 1) throw new ParseError5("MED2: invalid tempo");
  const speed = 6;
  const bpm = k;
  const timeFactor = MED_TIME_FACTOR;
  pos += 2;
  const sliding = u16();
  pos += 4;
  pos += 16;
  let quirks = 0;
  if (sliding === 6) quirks |= Quirk3.VSALL | Quirk3.PBALL;
  const patterns = [];
  for (let i = 0; i < pat; i++) {
    pos += 4;
    const perTrack = [];
    for (let kk = 0; kk < 4; kk++) {
      const evs = [];
      for (let j = 0; j < 64; j++) {
        evs.push({ note: 0, ins: 0, vol: 0, fxt: 0, fxp: 0, f2t: 0, f2p: 0 });
      }
      perTrack.push(evs);
    }
    for (let j = 0; j < 64; j++) {
      for (let kk = 0; kk < 4; kk++) {
        const period = u16();
        const x = u8();
        const fxp = u8();
        const e = perTrack[kk][j];
        e.note = periodToNote(period);
        e.ins = x >> 4;
        e.fxt = x & 15;
        switch (e.fxt) {
          case 0:
          // arpeggio
          case 1:
          // slide up
          case 2:
          // slide down
          case 3:
          // portamento
          case 4:
          // vibrato?
          case 12:
            break;
          // ...like protracker
          case 13:
          // volslide
          case 14:
            e.fxt = 10;
            break;
          case 15:
            e.fxt = 171;
            break;
        }
        e.fxp = fxp;
      }
    }
    const tracksArr = [];
    for (let kk = 0; kk < chn; kk++) tracksArr.push({ rows: 64, event: perTrack[kk] });
    patterns.push({ rows: 64, tracks: tracksArr });
  }
  const samples = [];
  for (let i = 0; i < 32; i++) {
    const inst = instruments[i];
    const sub = inst.sub[0];
    sub.sid = i;
    const s = {
      name: "",
      data: new Uint8Array(0),
      length: 0,
      loopStart: lps[i] ?? 0,
      loopEnd: lpe[i] ?? 0,
      sustainStart: 0,
      sustainEnd: 0,
      finetune: 0,
      volume: sub.vol,
      flags: flg[i] ?? 0,
      c5spd: 8287
    };
    const data = ctx.externalInstrument ? ctx.externalInstrument(inst.name) : null;
    if (data && data.length > 0) {
      s.length = data.length;
      s.data = data;
      inst.nsm = 1;
    }
    samples.push(s);
  }
  const channels = [];
  for (let i = 0; i < chn; i++) {
    const pattern = Math.floor((i + 1) / 2) % 2 * 255;
    channels.push({ pan: Math.min(255, Math.max(0, 128 + (pattern - 128))), vol: 64, flg: 0 });
  }
  const mod = {
    title: "",
    format: "med",
    comment: "",
    chn,
    pat,
    ins: 32,
    len,
    restart: 0,
    xxo,
    channels,
    patterns,
    instruments,
    samples,
    num_sequences: 0,
    sequences: [],
    speed,
    bpm,
    volbase: 64,
    gvolbase: 64,
    gvol: 64,
    quirks,
    flowMode: 0,
    // med2_load never sets read_event_type — prologue default (MOD) applies.
    readEventType: ReadEventType3.MOD,
    periodType: 0,
    defpan: 128,
    time_factor: timeFactor,
    rrate: 250,
    c4rate: 8287,
    compare_vblank: false,
    tracker: "MED 1.12 MED2",
    extras: { kind: "med", trackerVersion: 528 }
  };
  void ctx.sampleRate;
  void ctx.outputRate;
  return mod;
}
function periodToNote(period) {
  if (period <= 0) return 0;
  return Math.round(12 * Math.log(13696 / period) / Math.LN2) + 1;
}

// ../../packages/fmt-med/src/med3.ts
import {
  ParseError as ParseError6,
  Quirk as Quirk4,
  ReadEventType as ReadEventType4,
  SampleFlags as SampleFlags3
} from "@modplayjs/core";
var MASK = 2147483648;
var M0F_LINEMSK0F = 1;
var M0F_LINEMSK1F = 2;
var M0F_FXMSK0F = 4;
var M0F_FXMSK1F = 8;
var M0F_LINEMSK00 = 16;
var M0F_LINEMSK10 = 32;
var M0F_FXMSK00 = 64;
var M0F_FXMSK10 = 128;
var FX_VOLSLIDE = 10;
var FX_BREAK = 13;
var FX_EXTENDED = 14;
var FX_S3M_BPM = 171;
var EX_RETRIG = 9;
var EX_DELAY = 13;
var FX_MED_RETRIG = 147;
function med3Test(bytes) {
  if (bytes.length < 4) return false;
  return bytes[0] === 77 && bytes[1] === 69 && bytes[2] === 68 && bytes[3] === 3;
}
function makeSub3(vol, sid) {
  return {
    vol,
    gvl: 64,
    pan: -1,
    xpo: 0,
    fin: 0,
    vwf: 0,
    vde: 0,
    vra: 0,
    vsw: 0,
    sid,
    rvv: 0,
    nna: 0,
    dct: 0,
    dca: 0,
    ifc: 0,
    ifr: 0
  };
}
function makeInstrument(name, sid) {
  return {
    name,
    volume: 64,
    // med3_load never sets nsm for instruments the sample mask skips —
    // libxmp_init_instrument leaves them at 0.
    nsm: 0,
    rls: 0,
    map: new Array(121).fill(0),
    mapXpo: new Array(121).fill(0),
    sub: [makeSub3(0, sid)],
    aei: { flags: 0, npt: 0, scl: 0, sus: 0, sue: 0, lps: 0, lpe: 0, x: [], y: [] },
    fei: { flags: 0, npt: 0, scl: 0, sus: 0, sue: 0, lps: 0, lpe: 0, x: [], y: [] },
    pei: { flags: 0, npt: 0, scl: 0, sus: 0, sue: 0, lps: 0, lpe: 0, x: [], y: [] }
  };
}
var NibbleReader = class {
  constructor(mem) {
    this.mem = mem;
  }
  nbnum = 0;
  getNibble() {
    const mloc = this.nbnum >> 1;
    const res = this.nbnum & 1 ? this.mem[mloc] & 15 : this.mem[mloc] >> 4;
    this.nbnum++;
    return res;
  }
  getNibbles(nbs) {
    let res = 0;
    for (let i = 0; i < nbs; i++) {
      res = res << 4 | this.getNibble();
    }
    return res;
  }
};
function unpackBlock(from, convsz, trkn) {
  const dv = new DataView(from.buffer, from.byteOffset, from.byteLength);
  let linemsk0 = dv.getUint32(0, false);
  let linemsk1 = dv.getUint32(4, false);
  let fxmsk0 = dv.getUint32(8, false);
  let fxmsk1 = dv.getUint32(12, false);
  const nr = new NibbleReader(from.subarray(16));
  let nibsLeft = convsz * 2;
  const patbuf = new Uint8Array(3 * 4 * 64);
  for (let i = 0; i < 64; i++) {
    const lmActive = i < 32 ? (linemsk0 & MASK) !== 0 : (linemsk1 & MASK) !== 0;
    const fmActive = i < 32 ? (fxmsk0 & MASK) !== 0 : (fxmsk1 & MASK) !== 0;
    if (lmActive) {
      if (Math.trunc(trkn / 4) > nibsLeft) throw new ParseError6("MED3: pattern overflow");
      nibsLeft -= Math.trunc(trkn / 4);
      let lmsk = nr.getNibbles(Math.trunc(trkn / 4));
      lmsk = lmsk << 16 - trkn & 65535;
      let tmpto = i * trkn * 3;
      for (let bcnt = 0; bcnt < trkn; bcnt++) {
        if (lmsk & 32768) {
          if (nibsLeft < 3) throw new ParseError6("MED3: pattern overflow");
          nibsLeft -= 3;
          patbuf[tmpto] = nr.getNibbles(2);
          patbuf[tmpto + 1] = nr.getNibble() << 4;
        }
        lmsk = lmsk << 1 & 65535;
        tmpto += 3;
      }
    }
    if (fmActive) {
      if (Math.trunc(trkn / 4) > nibsLeft) throw new ParseError6("MED3: pattern overflow");
      nibsLeft -= Math.trunc(trkn / 4);
      let lmsk = nr.getNibbles(Math.trunc(trkn / 4));
      lmsk = lmsk << 16 - trkn & 65535;
      let tmpto = i * trkn * 3;
      for (let bcnt = 0; bcnt < trkn; bcnt++) {
        if (lmsk & 32768) {
          if (nibsLeft < 3) throw new ParseError6("MED3: pattern overflow");
          nibsLeft -= 3;
          patbuf[tmpto + 1] = (patbuf[tmpto + 1] | nr.getNibble()) & 255;
          patbuf[tmpto + 2] = nr.getNibbles(2);
        }
        lmsk = lmsk << 1 & 65535;
        tmpto += 3;
      }
    }
    if (i < 32) {
      linemsk0 = linemsk0 << 1 >>> 0;
      fxmsk0 = fxmsk0 << 1 >>> 0;
    } else {
      linemsk1 = linemsk1 << 1 >>> 0;
      fxmsk1 = fxmsk1 << 1 >>> 0;
    }
  }
  const grid = [];
  for (let j = 0; j < 4; j++) {
    const col = [];
    for (let i = 0; i < 64; i++) {
      const e = { note: 0, ins: 0, vol: 0, fxt: 0, fxp: 0, f2t: 0, f2p: 0 };
      e.note = patbuf[i * 12 + j * 3 + 0];
      if (e.note) e.note += 48;
      e.ins = patbuf[i * 12 + j * 3 + 1] >> 4;
      if (e.ins) e.ins++;
      e.fxt = patbuf[i * 12 + j * 3 + 1] & 15;
      e.fxp = patbuf[i * 12 + j * 3 + 2];
      switch (e.fxt) {
        case 0:
        // arpeggio
        case 1:
        // slide up
        case 2:
        // slide down
        case 3:
        // portamento
        case 4:
          break;
        case 12:
          e.fxp = (e.fxp >> 4 & 15) * 10 + (e.fxp & 15) & 255;
          break;
        case 13:
          e.fxt = FX_VOLSLIDE;
          break;
        case 15: {
          if (e.fxp === 0) {
            e.fxt = FX_BREAK;
          } else if (e.fxp === 255) {
            e.fxp = 0;
            e.fxt = 0;
            e.vol = 1;
          } else if (e.fxp === 254) {
            e.fxp = 0;
            e.fxt = 0;
          } else if (e.fxp === 241) {
            e.fxt = FX_EXTENDED;
            e.fxp = EX_RETRIG << 4 | 3;
          } else if (e.fxp === 242) {
            e.fxt = FX_EXTENDED;
            e.fxp = EX_DELAY << 4 | 3;
          } else if (e.fxp === 243) {
            e.fxt = FX_MED_RETRIG;
            e.fxp = 2;
          } else if (e.fxp <= 240) {
            e.fxt = FX_S3M_BPM;
            e.fxp = mmdConvertTempo(e.fxp, 0, 0);
          } else {
            e.fxp = 0;
            e.fxt = 0;
          }
          break;
        }
        default:
          e.fxp = 0;
          e.fxt = 0;
      }
      col.push(e);
    }
    grid.push(col);
  }
  return grid;
}
function med3Load(bytes, ctx) {
  let pos = 4;
  const u8 = () => bytes[pos++] ?? 0;
  const s8 = () => u8() << 24 >> 24;
  const u16 = () => {
    const v = bytes[pos] << 8 | bytes[pos + 1];
    pos += 2;
    return v;
  };
  const s16 = () => u16() << 16 >> 16;
  const u32 = () => {
    const v = (bytes[pos] << 24 | bytes[pos + 1] << 16 | bytes[pos + 2] << 8 | bytes[pos + 3]) >>> 0;
    pos += 4;
    return v;
  };
  const raw = (n) => {
    const s = bytes.subarray(pos, pos + n);
    pos += n;
    return s;
  };
  const instruments = [];
  for (let i = 0; i < 32; i++) {
    const buf = [];
    for (let j = 0; j < 40; j++) {
      const c = u8();
      buf.push(c);
      if (c === 0) break;
    }
    let s = "";
    for (let j = 0; j < buf.length && j < 32; j++) {
      const c = buf[j];
      if (c === 0) break;
      s += c > 127 || c < 32 || c === 127 ? "." : String.fromCharCode(c);
    }
    instruments.push(makeInstrument(s, i));
  }
  let mask = u32();
  for (let i = 0; i < 32; i++, mask = mask << 1 >>> 0) {
    instruments[i].sub[0].vol = mask & MASK ? u8() : 0;
  }
  const lps = new Array(32).fill(0);
  mask = u32();
  for (let i = 0; i < 32; i++, mask = mask << 1 >>> 0) {
    lps[i] = mask & MASK ? u16() : 0;
  }
  const lpe = [];
  const len = [];
  const flg = [];
  mask = u32();
  for (let i = 0; i < 32; i++, mask = mask << 1 >>> 0) {
    const lsiz = mask & MASK ? u16() : 0;
    len.push(lps[i] + lsiz);
    lpe.push(lps[i] + lsiz);
    flg.push(lsiz > 1 ? SampleFlags3.LOOP : 0);
  }
  const chn = 4;
  const pat = u16();
  const modlen = u16();
  if (modlen > 256 || pat > 256) {
    throw new ParseError6("MED3: invalid pattern count or song length");
  }
  const xxo = [];
  for (let i = 0; i < modlen; i++) xxo.push(u8());
  const tempo = u16();
  const transp = s8();
  const flags = u8();
  const sliding = u16();
  pos += 4;
  pos += 16;
  const speed = 6;
  const bpm = mmdConvertTempo(tempo, 0, 0);
  const timeFactor = MED_TIME_FACTOR;
  mask = u32();
  for (let i = 0; i < 32; i++, mask = mask << 1 >>> 0) {
    if (mask & MASK) pos += 1;
  }
  mask = u32();
  for (let i = 0; i < 32; i++, mask = mask << 1 >>> 0) {
    if (mask & MASK) pos += 1;
  }
  let quirks = Quirk4.RTONCE;
  if (sliding === 6) quirks |= Quirk4.VSALL | Quirk4.PBALL;
  for (let i = 0; i < 32; i++) {
    instruments[i].sub[0].xpo = transp;
  }
  const patterns = [];
  for (let i = 0; i < pat; i++) {
    void u8();
    const b = u8();
    const convsz = u16();
    const conv = new Uint8Array(16 + convsz);
    const cv = new DataView(conv.buffer);
    let p16 = 0;
    if (b & M0F_LINEMSK00) cv.setUint32(p16, 0, false);
    else if (b & M0F_LINEMSK0F) cv.setUint32(p16, 4294967295, false);
    else cv.setUint32(p16, u32(), false);
    p16 += 4;
    if (b & M0F_LINEMSK10) cv.setUint32(p16, 0, false);
    else if (b & M0F_LINEMSK1F) cv.setUint32(p16, 4294967295, false);
    else cv.setUint32(p16, u32(), false);
    p16 += 4;
    if (b & M0F_FXMSK00) cv.setUint32(p16, 0, false);
    else if (b & M0F_FXMSK0F) cv.setUint32(p16, 4294967295, false);
    else cv.setUint32(p16, u32(), false);
    p16 += 4;
    if (b & M0F_FXMSK10) cv.setUint32(p16, 0, false);
    else if (b & M0F_FXMSK1F) cv.setUint32(p16, 4294967295, false);
    else cv.setUint32(p16, u32(), false);
    p16 += 4;
    const databytes = raw(convsz);
    if (databytes.length < convsz) throw new ParseError6("MED3: truncated pattern");
    conv.set(databytes, 16);
    const grid = unpackBlock(conv, convsz, chn);
    const tracksArr = [];
    for (let k = 0; k < chn; k++) tracksArr.push({ rows: 64, event: grid[k] });
    patterns.push({ rows: 64, tracks: tracksArr });
  }
  const samples = [];
  for (let i = 0; i < 32; i++) {
    const sub = instruments[i].sub[0];
    sub.sid = i;
    samples.push({
      name: "",
      data: new Uint8Array(0),
      length: len[i],
      loopStart: lps[i],
      loopEnd: lpe[i],
      sustainStart: 0,
      sustainEnd: 0,
      finetune: 0,
      volume: sub.vol,
      flags: flg[i],
      c5spd: 8287
    });
  }
  mask = u32();
  if (pos >= bytes.length) mask = 4294967295;
  for (let i = 0; i < 32; i++, mask = mask << 1 >>> 0) {
    if ((~mask & MASK) !== 0) continue;
    if ((~flags & FLAG_INSTRSATT) !== 0) {
      const inst2 = instruments[i];
      const s2 = samples[i];
      const external = ctx.externalInstrument;
      const data = external ? external(inst2.name) : null;
      if (data && data.length > 0) {
        s2.length = data.length;
        s2.data = data;
        inst2.nsm = 1;
      }
      continue;
    }
    const inst = instruments[i];
    inst.nsm = 1;
    const s = samples[i];
    s.length = u32();
    if (s.length === 0) inst.nsm = 0;
    if (u16() !== 0) continue;
    const bytelen = s.length;
    const remaining = bytes.length - pos;
    const take = Math.min(bytelen, Math.max(0, remaining));
    s.data = bytes.subarray(pos, pos + take);
    pos += bytelen;
  }
  const channels = [];
  for (let i = 0; i < chn; i++) {
    const pattern = Math.floor((i + 1) / 2) % 2 * 255;
    channels.push({ pan: Math.min(255, Math.max(0, 128 + (pattern - 128))), vol: 64, flg: 0 });
  }
  const mod = {
    title: "",
    format: "med",
    comment: "",
    chn,
    pat,
    ins: 32,
    len: modlen,
    restart: 0,
    xxo,
    channels,
    patterns,
    instruments,
    samples,
    num_sequences: 0,
    sequences: [],
    speed,
    bpm,
    volbase: 64,
    gvolbase: 64,
    gvol: 64,
    quirks,
    flowMode: 0,
    // med3_load never sets read_event_type — prologue default (MOD) applies.
    readEventType: ReadEventType4.MOD,
    periodType: 0,
    defpan: 128,
    time_factor: timeFactor,
    rrate: 250,
    c4rate: 8287,
    compare_vblank: false,
    tracker: "MED 2.00 MED3",
    extras: { kind: "med", trackerVersion: 768 }
  };
  void ctx.sampleRate;
  void ctx.outputRate;
  void s8;
  void s16;
  return mod;
}

// ../../packages/fmt-med/src/med4.ts
import {
  ParseError as ParseError7,
  Quirk as Quirk5,
  ReadEventType as ReadEventType5,
  SampleFlags as SampleFlags4
} from "@modplayjs/core";
var FX_VOLSLIDE2 = 10;
var FX_BREAK2 = 13;
var FX_EXTENDED2 = 14;
var FX_S3M_BPM2 = 171;
var FX_SPEED = 15;
var FX_MED_RETRIG2 = 147;
var EX_RETRIG2 = 9;
var EX_DELAY2 = 13;
function med4Test(bytes) {
  if (bytes.length < 4) return false;
  return bytes[0] === 77 && bytes[1] === 69 && bytes[2] === 68 && bytes[3] === 4;
}
function makeSub4(vol, sid) {
  return {
    vol,
    gvl: 64,
    pan: -1,
    xpo: 0,
    fin: 0,
    vwf: 0,
    vde: 0,
    vra: 0,
    vsw: 0,
    sid,
    rvv: 0,
    nna: 0,
    dct: 0,
    dca: 0,
    ifc: 0,
    ifr: 0
  };
}
function makeInstrument2(name) {
  return {
    name,
    volume: 64,
    nsm: 0,
    rls: 0,
    map: new Array(121).fill(0),
    mapXpo: new Array(121).fill(0),
    sub: [],
    aei: { flags: 0, npt: 0, scl: 0, sus: 0, sue: 0, lps: 0, lpe: 0, x: [], y: [] },
    fei: { flags: 0, npt: 0, scl: 0, sus: 0, sue: 0, lps: 0, lpe: 0, x: [], y: [] },
    pei: { flags: 0, npt: 0, scl: 0, sus: 0, sue: 0, lps: 0, lpe: 0, x: [], y: [] }
  };
}
function fixEffect(e, hexvol) {
  switch (e.fxt) {
    case 0:
    // arpeggio
    case 1:
    // slide up
    case 2:
    // slide down
    case 3:
    // portamento
    case 4:
      break;
    case 9:
      if (e.fxp >= 1 && e.fxp <= 32) {
        e.fxt = FX_SPEED;
      } else {
        e.fxt = 0;
        e.fxp = 0;
      }
      break;
    case 12:
      if (!hexvol) {
        e.fxp = (e.fxp >> 4 & 15) * 10 + (e.fxp & 15) & 255;
      }
      break;
    case 13:
      e.fxt = FX_VOLSLIDE2;
      break;
    case 15:
      if (e.fxp === 0) {
        e.fxt = FX_BREAK2;
      } else if (e.fxp === 255) {
        e.fxp = 0;
        e.fxt = 0;
        e.vol = 1;
      } else if (e.fxp === 241) {
        e.fxt = FX_EXTENDED2;
        e.fxp = EX_RETRIG2 << 4 | 3;
      } else if (e.fxp === 242) {
        e.fxt = FX_EXTENDED2;
        e.fxp = EX_DELAY2 << 4 | 3;
      } else if (e.fxp === 243) {
        e.fxt = FX_MED_RETRIG2;
        e.fxp = 2;
      } else if (e.fxp <= 240) {
        e.fxt = FX_S3M_BPM2;
        e.fxp = mmdConvertTempo(e.fxp, 0, 0);
      } else {
        e.fxp = 0;
        e.fxt = 0;
      }
      break;
    default:
      e.fxp = 0;
      e.fxt = 0;
  }
}
var Stream = class {
  constructor(bytes, pos) {
    this.bytes = bytes;
    this.pos = pos;
  }
  hasNibble = false;
  value = 0;
  pos;
  read4() {
    this.hasNibble = !this.hasNibble;
    if (!this.hasNibble) {
      return this.value & 15;
    } else {
      this.value = this.bytes[this.pos++] ?? 0;
      return this.value >> 4;
    }
  }
  read8() {
    const a = this.read4();
    const b = this.read4();
    return a << 4 | b;
  }
  read12() {
    const a = this.read4();
    const b = this.read4();
    const c = this.read4();
    return a << 8 | b << 4 | c;
  }
  read16() {
    const a = this.read4();
    const b = this.read4();
    const c = this.read4();
    const d = this.read4();
    return (a << 12 | b << 8 | c << 4 | d) & 65535;
  }
  readAligned16(bits) {
    if (bits <= 4) return this.read4() << 12;
    if (bits <= 8) return this.read8() << 8;
    if (bits <= 12) return this.read12() << 4;
    return this.read16();
  }
};
function med4Load(bytes, ctx) {
  let pos = 4;
  let commentText = "";
  const dvL = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let curBytes = bytes;
  let curDvL = dvL;
  const u8 = () => bytes[pos++] ?? 0;
  const s8 = () => u8() << 24 >> 24;
  const u16 = () => {
    const v = bytes[pos] << 8 | bytes[pos + 1];
    pos += 2;
    return v;
  };
  const u32 = () => {
    const v = (bytes[pos] << 24 | bytes[pos + 1] << 16 | bytes[pos + 2] << 8 | bytes[pos + 3]) >>> 0;
    pos += 4;
    return v;
  };
  const seek = (p) => {
    pos = p;
  };
  const skip = (n) => {
    pos += n;
  };
  let vermaj = 2;
  let vermin = 10;
  {
    const save = pos;
    if (bytes.length > 2e3) {
      const tailPos = bytes.length - 1024;
      const buf = bytes.subarray(tailPos);
      for (let i = 0; i < 1013; i++) {
        if (buf[i] === 77 && buf[i + 1] === 69 && buf[i + 2] === 68 && buf[i + 3] === 86 && buf[i + 4] === 0 && buf[i + 5] === 0 && buf[i + 6] === 0 && buf[i + 7] === 4) {
          vermaj = buf[i + 10];
          vermin = buf[i + 11];
          break;
        }
      }
    }
    pos = save;
  }
  const trackerType = `MED ${vermaj}.${String(vermin).padStart(2, "0")} MED4`;
  const m0 = u8();
  let maskHi = 0;
  let mask = 0;
  {
    const bytesArr = [];
    let m = m0;
    for (let i = 0; m !== 0 && i < 8; i++, m = m << 1 & 255) {
      if (m & 128) bytesArr.push(u8());
    }
    if (bytesArr.length > 0) {
      let big = 0n;
      for (const b of bytesArr) big = big << 8n | BigInt(b);
      big <<= BigInt(8 * (8 - bytesArr.length));
      maskHi = Number(big >> 32n & 0xffffffffn);
      mask = Number(big & 0xffffffffn);
    }
  }
  const tempInst = [];
  for (let i = 0; i < 64; i++) tempInst.push({ name: "", loop_start: 0, loop_end: 0, volume: 0, transpose: 0 });
  let numIns = 0;
  {
    const m64base = BigInt(maskHi) << 32n | BigInt(mask >>> 0);
    for (let i = 0; i < 64; i++) {
      const m64 = m64base << BigInt(i) & 0xffffffffffffffffn;
      if (m64 === 0n) break;
      const asS64 = m64 >= 1n << 63n ? m64 - (1n << 64n) : m64;
      if (asS64 > 0n) continue;
      numIns = i + 1;
      const t = tempInst[i];
      const c = u8();
      const size = u8();
      const nameBuf = bytes.subarray(pos, pos + size);
      pos += size;
      let s = "";
      for (let j = 0; j < nameBuf.length; j++) {
        const ch = nameBuf[j];
        if (ch === 0) break;
        s += ch > 127 || ch < 32 || ch === 127 ? "." : String.fromCharCode(ch);
      }
      t.name = s;
      t.volume = 64;
      let loopLen = 0;
      if ((c & 1) === 0) t.loop_start = u16() << 1;
      if ((c & 2) === 0) loopLen = u16() << 1;
      if ((c & 4) === 0) u8();
      if ((c & 8) === 0) u8();
      if ((c & 48) === 0) t.volume = u8();
      if ((c & 64) === 0) t.transpose = s8();
      t.loop_end = t.loop_start + loopLen;
      t.loop_start &= ~255;
    }
  }
  const pat = u16();
  const len = u16();
  if (pos > bytes.length) throw new ParseError7("MED4: truncated header");
  if (pat > 256 || len > 255) throw new ParseError7("MED4: invalid pattern count or song length");
  const xxo = [];
  for (let i = 0; i < len; i++) xxo.push(u8());
  const tempo = u16();
  const transp = s8();
  const flags = s8();
  let speed = u16();
  const bpm = mmdConvertTempo(tempo, 0, 0);
  const timeFactor = MED_TIME_FACTOR;
  let quirks = Quirk5.RTONCE;
  let hexvol = 0;
  if ((~flags & 32) !== 0) quirks |= Quirk5.VSALL | Quirk5.PBALL;
  if ((flags & 16) !== 0) hexvol = 1;
  if (vermaj === 2) speed = (flags & 32) !== 0 ? 5 : 6;
  pos += 20;
  const trkvol = [];
  for (let i = 0; i < 16; i++) trkvol.push(u8());
  u8();
  for (let i = 0; i < 64; i++) tempInst[i].transpose += transp;
  let chn = 0;
  const scanPos = pos;
  for (let i = 0; i < pat; i++) {
    const size = u8();
    const c = u8();
    if (c > chn) chn = c;
    u8();
    const plen = u16();
    skip(size + plen - 4);
  }
  if (chn > 16) throw new ParseError7("MED4: invalid channel count");
  const patterns = [];
  pos = scanPos;
  for (let i = 0; i < pat; i++) {
    const size = u8();
    const blockPos = pos;
    const blockChn = u8();
    if (blockChn > chn) throw new ParseError7(`MED4: channel count mismatch at pattern ${i}`);
    const rows = u8() + 1;
    const plen = u16();
    const ctl = [0, 0, 0, 0];
    for (let j = 0; j < 4; j++) {
      if (rows > j * 64) ctl[j] = u8();
      else break;
    }
    const linemask = [];
    const fxmask = [];
    let numMasks = 0;
    for (let y = 0; y < 8; y++) {
      linemask.push(0);
      fxmask.push(0);
    }
    for (let y = 0; y < 8; y++) {
      if (rows > y * 32) {
        const c = ctl[Math.trunc(y / 2)];
        const s = 4 * (y % 2);
        linemask[y] = (c & 128 >> s) !== 0 ? 4294967295 : (c & 64 >> s) !== 0 ? 0 : u32();
        fxmask[y] = (c & 32 >> s) !== 0 ? 4294967295 : (c & 16 >> s) !== 0 ? 0 : u32();
        numMasks++;
      } else {
        break;
      }
    }
    const eventGrid = [];
    for (let k = 0; k < chn; k++) {
      const evs = [];
      for (let j = 0; j < rows; j++) evs.push({ note: 0, ins: 0, vol: 0, fxt: 0, fxp: 0, f2t: 0, f2p: 0 });
      eventGrid.push(evs);
    }
    seek(blockPos + size);
    const stream = new Stream(bytes, pos);
    for (let y = 0; y < numMasks; y++) {
      for (let j = 0; j < 32; j++) {
        const line = y * 32 + j;
        if (line >= rows) break;
        if ((linemask[y] & 2147483648) !== 0) {
          let chmsk = stream.readAligned16(blockChn);
          for (let k = 0; k < blockChn; k++, chmsk = chmsk << 1 & 65535) {
            if ((chmsk & 32768) !== 0) {
              const x = stream.read12();
              const e = eventGrid[k][line];
              e.note = x >> 4;
              if (e.note) e.note += 48;
              e.ins = x & 15;
            }
          }
        }
        if ((fxmask[y] & 2147483648) !== 0) {
          let chmsk = stream.readAligned16(blockChn);
          for (let k = 0; k < blockChn; k++, chmsk = chmsk << 1 & 65535) {
            if ((chmsk & 32768) !== 0) {
              const x = stream.read12();
              const e = eventGrid[k][line];
              e.fxt = x >> 8;
              e.fxp = x & 255;
              fixEffect(e, hexvol);
            }
          }
        }
        linemask[y] = linemask[y] << 1 >>> 0;
        fxmask[y] = fxmask[y] << 1 >>> 0;
      }
    }
    seek(blockPos + size + plen);
    const tracksArr = [];
    for (let k = 0; k < chn; k++) tracksArr.push({ rows, event: eventGrid[k] });
    patterns.push({ rows, tracks: tracksArr });
  }
  const instruments = [];
  for (let i = 0; i < numIns; i++) instruments.push(makeInstrument2(tempInst[i].name));
  const samples = [];
  let smpIdx = 0;
  const sampleCheck = () => {
  };
  const loadSampled = (i, length, at) => {
    const xxi = instruments[i];
    xxi.nsm = 1;
    xxi.sub = [makeSub4(tempInst[i].volume, smpIdx)];
    const sub = xxi.sub[0];
    sub.vol = tempInst[i].volume;
    sub.xpo = tempInst[i].transpose;
    sub.sid = smpIdx;
    sampleCheck();
    const s = {
      name: "",
      data: new Uint8Array(0),
      length,
      loopStart: tempInst[i].loop_start,
      loopEnd: tempInst[i].loop_end,
      sustainStart: 0,
      sustainEnd: 0,
      finetune: 0,
      volume: sub.vol,
      flags: tempInst[i].loop_end > 2 ? SampleFlags4.LOOP : 0,
      c5spd: 8287
    };
    const is16 = false;
    const bytelen = s.length * (is16 ? 2 : 1);
    const take = Math.min(bytelen, Math.max(0, curBytes.length - at.pos));
    s.data = curBytes.subarray(at.pos, at.pos + take);
    at.pos += bytelen;
    samples[smpIdx] = s;
    for (let j = 0; j < 9; j++) {
      for (let k = 0; k < 12; k++) {
        let xpo = 0;
        if (j < 4) xpo = 12 * (4 - j);
        else if (j > 6) xpo = -12 * (j - 6);
        xxi.mapXpo[12 * j + k] = xpo;
      }
    }
    smpIdx++;
  };
  const loadSynth = (i, type, at) => {
    const startPos = at.pos;
    if (startPos + 22 > curBytes.length) throw new ParseError7("MED4: truncated synth");
    const magic = curDvL.getUint32(startPos, false);
    if (magic !== 1297303552) {
      throw new ParseError7(`MED4: invalid MSH0 at instrument ${i}`);
    }
    let p = startPos + 6;
    const type2 = curDvL.getInt16(startPos + 4, false);
    if (type2 !== -1 && type2 !== -2) {
      throw new ParseError7(`MED4: invalid type ${type2} on synth/hybrid ${i}`);
    }
    void type;
    p = startPos + 6;
    p += 4;
    const synthRep = curDvL.getUint16(p, false);
    p += 2;
    const synthReplen = curDvL.getUint16(p, false);
    p += 2;
    const voltbllen = curDvL.getUint16(p, false);
    p += 2;
    const wftbllen = curDvL.getUint16(p, false);
    p += 2;
    const volspeed = bytes[p];
    p += 1;
    const wfspeed = bytes[p];
    p += 1;
    const wforms = curDvL.getUint16(p, false);
    p += 2;
    void synthRep;
    void synthReplen;
    if (wforms === 65535) return;
    if (voltbllen > 128 || wftbllen > 128 || wforms > 64) {
      throw new ParseError7(`MED4: invalid synth tables at instrument ${i}`);
    }
    const voltblPos = p;
    p += voltbllen;
    const wftblPos = p;
    p += wftbllen;
    const wf = [];
    for (let j2 = 0; j2 < wforms; j2++) {
      wf.push(curDvL.getUint32(p, false));
      p += 4;
    }
    const xxi = instruments[i];
    xxi.nsm = wforms;
    xxi.sub = [];
    for (let j2 = 0; j2 < wforms; j2++) xxi.sub.push(makeSub4(0, 0));
    xxi.extras = {
      vts: volspeed,
      wts: wfspeed,
      vtlen: voltbllen,
      wtlen: wftbllen,
      hold: 0,
      decay: 0,
      default_pitch: 0,
      finetune: 0,
      suppress_midi_off: 0,
      long_repeat: 0,
      long_replen: 0,
      volTable: curBytes.slice(voltblPos, voltblPos + voltbllen),
      wavTable: curBytes.slice(wftblPos, wftblPos + wftbllen)
    };
    sampleCheck();
    let j = 0;
    if (type === -2 && wforms > 0) {
      const sPos = startPos + wf[0];
      const length = curDvL.getUint32(sPos, false);
      if (curDvL.getUint16(sPos + 4, false) !== 0) {
        throw new ParseError7(`MED4: hybrid ${i} has non-sample at pos 0`);
      }
      const sub = xxi.sub[0];
      sub.vol = tempInst[i].volume;
      sub.xpo = tempInst[i].transpose;
      sub.sid = smpIdx;
      const s = {
        name: "",
        data: new Uint8Array(0),
        length,
        loopStart: tempInst[i].loop_start,
        loopEnd: tempInst[i].loop_end,
        sustainStart: 0,
        sustainEnd: 0,
        finetune: 0,
        volume: sub.vol,
        flags: tempInst[i].loop_end > 2 ? SampleFlags4.LOOP : 0,
        c5spd: 8287
      };
      const is16 = false;
      const bytelen = s.length * (is16 ? 2 : 1);
      const take = Math.min(bytelen, Math.max(0, curBytes.length - (sPos + 6)));
      s.data = curBytes.subarray(sPos + 6, sPos + 6 + take);
      samples[smpIdx] = s;
      smpIdx++;
      j++;
    }
    for (; j < wforms; j++) {
      const sub = xxi.sub[j];
      sub.vol = 64;
      sub.xpo = -24;
      sub.sid = smpIdx;
      const wPos = startPos + wf[j];
      const wlen = curDvL.getUint16(wPos, false) * 2;
      const s = {
        name: "",
        data: new Uint8Array(0),
        length: wlen,
        loopStart: 0,
        loopEnd: wlen,
        sustainStart: 0,
        sustainEnd: 0,
        finetune: 0,
        volume: sub.vol,
        flags: SampleFlags4.LOOP,
        c5spd: 8287
      };
      const take = Math.min(wlen, Math.max(0, curBytes.length - (wPos + 2)));
      s.data = curBytes.subarray(wPos + 2, wPos + 2 + take);
      samples[smpIdx] = s;
      smpIdx++;
    }
  };
  const loadInstrument = (i, length, type, at) => {
    if (type === 0) {
      loadSampled(i, length, at);
      return;
    }
    if (type === -1 || type === -2) {
      const sPos = at.pos;
      loadSynth(i, type, at);
      at.pos = sPos + length;
      return;
    }
    at.pos += length;
  };
  if ((~flags & FLAG_INSTRSATT) !== 0) {
    for (let i = 0; i < numIns; i++) {
      instruments[i].name = tempInst[i].name;
      instruments[i].nsm = 0;
    }
    for (let i = 0; i < numIns; i++) {
      const inst = instruments[i];
      const data = ctx.externalInstrument ? ctx.externalInstrument(inst.name) : null;
      if (!data || data.length === 0) continue;
      const extLen = data.length;
      const edv = new DataView(data.buffer, data.byteOffset, data.byteLength);
      const savedBytes = curBytes;
      const savedDvL = curDvL;
      curBytes = data;
      curDvL = edv;
      try {
        if (extLen >= 6) {
          const magic = edv.getUint32(0, false);
          const type = edv.getInt16(4, false);
          if (magic === 1297303552 && (type === -1 || type === -2)) {
            const at = { pos: 0 };
            loadSynth(i, type, at);
            curBytes = savedBytes;
            curDvL = savedDvL;
            continue;
          }
        }
        loadSampled(i, extLen, { pos: 0 });
      } finally {
        curBytes = savedBytes;
        curDvL = savedDvL;
      }
    }
  } else {
    if (pat > 256 || len > 255) throw new ParseError7("MED4: invalid pattern count or song length");
    const maskLo = u32();
    if (maskLo === 1296385110) {
      throw new ParseError7("MED4: invalid module MED4 with no samples");
    }
    const maskHiLo = u32();
    const fullMask = (BigInt(maskLo >>> 0) << 32n | BigInt(maskHiLo >>> 0)) << 1n & 0xffffffffffffffffn;
    const posSave = pos;
    let numSmp = 0;
    {
      numSmp = 0;
      let m2 = fullMask;
      let p = posSave;
      for (let i = 0; m2 !== 0n && i < 64; i++, m2 = m2 << 1n & 0xffffffffffffffffn) {
        const asS64 = m2 >= 1n << 63n ? m2 - (1n << 64n) : m2;
        if (asS64 > 0n) continue;
        if (p + 6 > bytes.length) break;
        let _len = dvL.getInt32(p, false);
        const _type = dvL.getInt16(p + 4, false);
        p += 6;
        if (_type === 0) {
          numSmp++;
        } else if (_type === -1 || _type === -2) {
          if (_len < 22) {
            throw new ParseError7(`MED4: invalid synth ${i} length`);
          }
          p += 20;
          numSmp += dvL.getUint16(p, false);
          p += 2;
          _len -= 22;
        }
        if (_len < 0 || _len > bytes.length) {
          throw new ParseError7(`MED4: invalid sample ${i} length`);
        }
        p += _len;
      }
    }
    pos = posSave;
    let m = fullMask;
    const at = { pos };
    for (let i = 0; m !== 0n && i < numIns; i++, m = m << 1n & 0xffffffffffffffffn) {
      const asS64 = m >= 1n << 63n ? m - (1n << 64n) : m;
      if (asS64 > 0n) continue;
      const length = dvL.getInt32(at.pos, false);
      const type = dvL.getInt16(at.pos + 4, false);
      at.pos += 6;
      loadInstrument(i, length, type, at);
    }
    pos = at.pos;
  }
  for (const raw of samples) {
    if (raw) ctx.addSample(raw);
  }
  {
    let p = pos;
    for (; ; ) {
      if (p + 8 > bytes.length) break;
      const id = dvL.getInt32(p, false);
      const size = dvL.getInt32(p + 4, false);
      if (id <= 0 || size <= 0) break;
      p += 8;
      if (id === 1296385110) {
        const ver = dvL.getUint32(p, false);
        vermaj = (ver & 65280) >> 8;
        vermin = ver & 255;
      } else if (id === 1095650895) {
        const readLen = Math.min(size, 1023);
        let c = "";
        for (let i = 0; i < readLen && p + i < bytes.length; i++) {
          const ch = bytes[p + i];
          if (ch === 0) break;
          c += String.fromCharCode(ch);
        }
        commentText = c;
      }
      p += size;
    }
  }
  const channels = [];
  for (let i = 0; i < chn; i++) {
    const pattern = Math.floor((i + 1) / 2) % 2 * 255;
    channels.push({ pan: Math.min(255, Math.max(0, 128 + (pattern - 128))), vol: trkvol[i] ?? 64, flg: 0 });
  }
  const mod = {
    title: "",
    format: "med",
    comment: commentText,
    chn,
    pat,
    ins: numIns,
    len,
    restart: 0,
    xxo,
    channels,
    patterns,
    instruments,
    samples: samples.map((s) => s ?? { name: "", data: new Uint8Array(0), length: 0, loopStart: 0, loopEnd: 0, sustainStart: 0, sustainEnd: 0, finetune: 0, volume: 0, flags: 0, c5spd: 8363 }),
    num_sequences: 0,
    sequences: [],
    speed,
    bpm,
    volbase: 64,
    gvolbase: 64,
    gvol: 64,
    quirks,
    flowMode: 0,
    readEventType: ReadEventType5.MED,
    periodType: 0,
    defpan: 128,
    time_factor: timeFactor,
    rrate: 250,
    c4rate: 8287,
    compare_vblank: false,
    tracker: trackerType,
    extras: { kind: "med", trackerVersion: vermaj << 8 | vermin }
  };
  void ctx.sampleRate;
  void ctx.outputRate;
  void MED_VER_210;
  return mod;
}

// ../../packages/fmt-med/src/readevent.ts
import {
  NoteFlag,
  VolSlideFlag,
  XMP_KEY_CUT as XMP_KEY_CUT2,
  XMP_KEY_OFF
} from "@modplayjs/core";
import {
  RESET_NOTE,
  SET,
  SET_NOTE,
  getSubinstrument,
  isValidInstrument,
  isValidNote,
  isValidSample,
  setChannelVolume,
  setEffectDefaults,
  setPeriod,
  resetEnvelopes,
  processFx,
  medCheckHoldSymbol
} from "@modplayjs/core";
function trackerVersion(core) {
  const extras = core.module.extras;
  return extras?.kind === "med" ? extras.trackerVersion : 0;
}
function setDefaultPitchNote(core, ins, defaultPitch, ver) {
  if (ver >= 3) {
    let note = MMD3_DEFAULT_NOTE;
    if (defaultPitch) note = defaultPitch - 1;
    const inst = core.module.instruments[ins];
    if (note >= 0 && note < 121) inst.mapXpo[12] = note;
  }
}
function readEventMed(core, e, chn) {
  const mod = core.module;
  const xc = core.ctx.channelStates[chn];
  let note = -1;
  let sub = null;
  let newInvalidIns = 0;
  let isToneporta = 0;
  const ce = xc.extras;
  const trkVer = trackerVersion(core);
  xc.flags = 0;
  if (e.fxt === 3 || e.fxt === 5) {
    isToneporta = 1;
  }
  if (e.ins && e.note) {
    const ins = e.ins - 1;
    SET(xc, VolSlideFlag.NEW_INS);
    xc.fadeout = 65536;
    xc.offset.val = 0;
    RESET_NOTE(xc, NoteFlag.RELEASE | NoteFlag.FADEOUT);
    if (isValidInstrument(core, ins)) {
      if (!isToneporta) {
        const xxi = mod.instruments[ins];
        xc.ins = ins;
        xc.ins_fade = xxi.rls;
        const ie = xxi.extras;
        if (ie && "hold" in ie) {
          if (ce) {
            let hold = ie.hold;
            let decay = ie.decay;
            if (hold <= 0) {
              hold = -1;
              decay = -1;
            }
            ce.hold_active = hold > 0 ? 1 : 0;
            ce.hold_count = hold;
            ce.decay_value = decay;
          }
        }
      }
    } else {
      newInvalidIns = 1;
      core.virt.resetChannel(chn);
    }
    if (ce) {
      ce.arp = 0;
      ce.aidx = 0;
    }
  }
  if (e.ins) {
    if (isValidNote(e.note - 1) || trkVer >= MED_VER_OCTAMED_300) {
      sub = getSubinstrument(core, e.ins - 1, e.note - 1);
      if (sub !== null) {
        setChannelVolume(xc, sub.vol);
      }
    }
  }
  if (e.note) {
    SET(xc, VolSlideFlag.NEW_NOTE);
    if (e.note === XMP_KEY_OFF) {
      SET_NOTE(xc, NoteFlag.RELEASE);
    } else if (e.note === XMP_KEY_CUT2) {
      SET_NOTE(xc, NoteFlag.END);
      xc.period = 0;
      core.virt.resetChannel(chn);
    } else if (!isToneporta && isValidInstrument(core, xc.ins) && isValidNote(e.note - 1)) {
      const xxi = mod.instruments[xc.ins];
      xc.key = e.note - 1;
      RESET_NOTE(xc, NoteFlag.END);
      xc.per_adj = 0;
      const ie = xxi.extras;
      if (xxi.nsm > 1 && ie && "vts" in ie) {
        if (ie.vts === 0 && ie.wts === 0) {
          xc.per_adj = 2;
        }
      }
      sub = getSubinstrument(core, xc.ins, xc.key);
      if (!newInvalidIns && sub !== null) {
        const transp = xxi.mapXpo[xc.key] ?? 0;
        let smp;
        note = xc.key + sub.xpo + transp;
        smp = sub.sid;
        if (!isValidSample(core, smp)) {
          smp = -1;
        }
        if (smp >= 0 && smp < mod.samples.length) {
          core.virt.setPatchSmp(chn, xc.ins, smp, note);
          xc.smp = smp;
        }
      } else {
        xc.flags = 0;
      }
    }
  }
  sub = getSubinstrument(core, xc.ins, xc.key);
  const finetune = xc.finetune;
  setEffectDefaults(core, note, sub, xc, isToneporta !== 0);
  if (!e.ins) {
    xc.finetune = finetune;
  }
  if (e.ins && sub !== null) {
    resetEnvelopes(core, xc);
    const ie = mod.instruments[e.ins - 1]?.extras;
    if (ie && "default_pitch" in ie) {
      setDefaultPitchNote(core, e.ins - 1, ie.default_pitch, 3);
    }
  }
  setChannelVolume(xc, e.vol - 1);
  processFx(core, xc, chn, e, 1);
  processFx(core, xc, chn, e, 0);
  setPeriod(core, note, sub, xc, isToneporta !== 0);
  medCheckHoldSymbol(core, xc, chn);
  if (sub === null) {
    return;
  }
  if (note >= 0) {
    xc.note = note;
    core.virt.voicePos(chn, xc.offset.val);
  }
}

// ../../packages/fmt-med/src/index.ts
function makePlugin(name, test, load) {
  return {
    name,
    test,
    load,
    readEvent(core, chn, row) {
      const mod = core.module;
      const e = core.readEventScratch(chn) ?? core.readEventAt(mod.xxo[core.ctx.p.ord] ?? 0, chn, row);
      readEventMed(core, e, chn);
    }
  };
}
var plugin = makePlugin("med", mmd1Test, mmd1Load);
var mmd3Plugin = makePlugin("mmd3", mmd3Test, mmd3Load);
var med2Plugin = makePlugin("med2", med2Test, med2Load);
var med3Plugin = makePlugin("med3", med3Test, med3Load);
var med4Plugin = makePlugin("med4", med4Test, med4Load);
export {
  FLAG_INSTRSATT,
  MED_TIME_FACTOR,
  med2Load,
  med2Plugin,
  med2Test,
  med3Load,
  med3Plugin,
  med3Test,
  med4Load,
  med4Plugin,
  med4Test,
  mmd1Load,
  mmd1Test,
  mmd3Load,
  mmd3Plugin,
  mmd3Test,
  mmdConvertTempo,
  mmdReadTitle,
  mmdSetBpm,
  mmdTrackerVersion,
  mmdXlatFx,
  plugin,
  readEventMed
};

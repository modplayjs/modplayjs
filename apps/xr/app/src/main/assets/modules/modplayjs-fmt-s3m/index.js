// ../../packages/fmt-s3m/src/s3m.ts
import {
  C4_NTSC_RATE,
  FLOW_MODE_IT_210,
  FLOW_MODE_MPT_116,
  FLOW_MODE_ORPHEUS,
  FLOW_MODE_ST3_301,
  FLOW_MODE_ST3_321,
  ParseError,
  PeriodType,
  Quirk,
  QUIRKS_ST3,
  ReadEventType,
  SampleFlags,
  XMP_KEY_OFF
} from "@modplayjs/core";
import {
  EMPTY_EVENT
} from "@modplayjs/core";
import {
  LSN,
  MSN,
  SET_NOTE,
  TEST_NOTE,
  NoteFlag,
  readEventSt3
} from "@modplayjs/core";
import { FX, EX_GLISS, EX_VIBRATO_WF, EX_FINETUNE, EX_PATTERN_LOOP, EX_TREMOLO_WF } from "@modplayjs/core";
var MAGIC_SCRM = 1396920909;
var MAGIC_SCRS = 1396920915;
var S3M_EOR = 0;
var S3M_CH_MASK = 31;
var S3M_NI_FOLLOW = 32;
var S3M_VOL_FOLLOWS = 64;
var S3M_FX_FOLLOWS = 128;
var S3M_CH_OFF = 255;
var S3M_CH_NUMBER = 31;
var S3M_CH_RIGHT = 8;
var S3M_CH_ADLIB = 16;
var S3M_PAN_SET = 32;
var S3M_AMIGA_RANGE = 16;
var S3M_ST300_VOLS = 64;
var S3M_SAMP_LOOP = 1;
var S3M_SAMP_STEREO = 2;
var S3M_SAMP_16BIT = 4;
var XMP_MAX_MOD_LENGTH = 256;
var MAX_SAMPLE_SIZE = 268435456;
function clamp(v, lo, hi) {
  return v < lo ? lo : v > hi ? hi : v;
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
function copyAdjust(r, n) {
  let s = "";
  for (let i = 0; i < n && i < r.length; i++) {
    const c = r[i];
    if (c === 0) break;
    s += c > 127 || c < 32 || c === 127 ? "." : String.fromCharCode(c);
  }
  return s.replace(/ +$/, "");
}
function s3mTest(bytes) {
  if (bytes.length < 48) return false;
  if (readmem32b(bytes, 44) !== MAGIC_SCRM) return false;
  if (bytes[29] !== 16) return false;
  return true;
}
var FX_NONE = 255;
var FX_S3M_EXTENDED = 254;
var FX_TABLE = [
  FX_NONE,
  FX.FX_S3M_SPEED,
  // Axx  Set speed to xx (the default is 06)
  FX.FX_JUMP,
  // Bxx  Jump to order xx (hexadecimal)
  FX.FX_BREAK,
  // Cxx  Break pattern to row xx (decimal)
  FX.FX_VOLSLIDE,
  // Dxy  Volume slide down by y/up by x
  FX.FX_PORTA_DN,
  // Exx  Slide down by xx
  FX.FX_PORTA_UP,
  // Fxx  Slide up by xx
  FX.FX_TONEPORTA,
  // Gxx  Tone portamento with speed xx
  FX.FX_VIBRATO,
  // Hxy  Vibrato with speed x and depth y
  FX.FX_TREMOR,
  // Ixy  Tremor with ontime x and offtime y
  FX.FX_S3M_ARPEGGIO,
  // Jxy  Arpeggio with halfnote additions
  FX.FX_VIBRA_VSLIDE,
  // Kxy  Dual command: H00 and Dxy
  FX.FX_TONE_VSLIDE,
  // Lxy  Dual command: G00 and Dxy
  FX_NONE,
  FX_NONE,
  FX.FX_OFFSET,
  // Oxy  Set sample offset
  FX_NONE,
  FX.FX_MULTI_RETRIG,
  // Qxy  Retrig (+volumeslide) note
  FX.FX_TREMOLO,
  // Rxy  Tremolo with speed x and depth y
  FX_S3M_EXTENDED,
  // Sxx  (misc effects)
  FX.FX_S3M_BPM,
  // Txx  Tempo = xx (hex)
  FX.FX_FINE_VIBRATO,
  // Uxx  Fine vibrato
  FX.FX_GLOBALVOL,
  // Vxx  Set global volume
  FX_NONE,
  FX.FX_SETPAN,
  // Xxx  Set pan
  FX_NONE,
  FX_NONE
];
var FX_SETPAN = FX.FX_SETPAN;
var FX_SURROUND = FX.FX_SURROUND;
function xlatFx(_c, e) {
  const h = MSN(e.fxp);
  const l = LSN(e.fxp);
  if (e.fxt >= FX_TABLE.length) {
    e.fxt = 0;
    e.fxp = 0;
    return;
  }
  e.fxt = FX_TABLE[e.fxt];
  switch (e.fxt) {
    case FX.FX_S3M_BPM:
      if (e.fxp < 32) {
        e.fxp = 0;
        e.fxt = 0;
      }
      break;
    case FX_S3M_EXTENDED: {
      e.fxt = FX.FX_EXTENDED;
      switch (h) {
        case 1:
          e.fxp = LSN(e.fxp) | EX_GLISS << 4;
          break;
        case 2:
          e.fxp = LSN(e.fxp) - 8 & 15 | EX_FINETUNE << 4;
          break;
        case 3:
          e.fxp = LSN(e.fxp) | EX_VIBRATO_WF << 4;
          break;
        case 4:
          e.fxp = LSN(e.fxp) | EX_TREMOLO_WF << 4;
          break;
        case 5:
        case 6:
        case 7:
        case 9:
        case 10:
          e.fxt = 0;
          e.fxp = 0;
          break;
        case 8:
          e.fxt = FX_SETPAN;
          e.fxp = l << 4;
          break;
        case 11:
          e.fxp = LSN(e.fxp) | EX_PATTERN_LOOP << 4;
          break;
        case 12:
          if (l === 0) {
            e.fxt = 0;
            e.fxp = 0;
          }
          break;
      }
      break;
    }
    case FX_SETPAN:
      if (e.fxp === 164) {
        e.fxt = FX_SURROUND;
        e.fxp = 1;
      } else {
        const pan = e.fxp << 1;
        if (pan > 255) {
          e.fxp = 255;
        } else {
          e.fxp = pan;
        }
      }
      break;
    case FX_NONE:
      e.fxt = 0;
      e.fxp = 0;
      break;
  }
}
function schismTrackerDate(year, month, day) {
  let mm = (month + 9) % 12;
  let yy = year - Math.floor(mm / 10);
  yy = yy * 365 + Math.floor(yy / 4) - Math.floor(yy / 100) + Math.floor(yy / 400);
  mm = Math.floor((mm * 306 + 5) / 10);
  return yy + mm + (day - 1);
}
function schismTrackerString(sVer, lVer) {
  if (sVer >= 80) {
    let t = schismTrackerDate(2009, 10, 31);
    if (sVer === 4095) {
      t += lVer;
    } else {
      t += sVer - 80;
    }
    let year = Math.trunc((t * 1e4 + 14780) / 3652425);
    let dayofyear = t - (365 * year + Math.floor(year / 4) - Math.floor(year / 100) + Math.floor(year / 400));
    if (dayofyear < 0) {
      year--;
      dayofyear = t - (365 * year + Math.floor(year / 4) - Math.floor(year / 100) + Math.floor(year / 400));
    }
    let month = Math.trunc((100 * dayofyear + 52) / 3060);
    const day = dayofyear - Math.floor((month * 306 + 5) / 10) + 1;
    year += Math.floor((month + 2) / 12);
    month = (month + 2) % 12 + 1;
    const pad = (v, w) => String(v).padStart(w, "0");
    return `Schism Tracker ${pad(year, 4)}-${pad(month, 2)}-${pad(day, 2)}`;
  }
  return `Schism Tracker 0.${sVer.toString(16)}`;
}
function c2spdToNote(c2spd) {
  if (c2spd <= 0) {
    return { n: 0, f: 0 };
  }
  const c = Math.trunc(1536 * Math.log(c2spd / 8363) / Math.LN2);
  return { n: Math.trunc(c / 128), f: c % 128 };
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
    // S3M maps are calloc'd zeros: key → sub[0] (getSubinstrument).
    map: new Array(121).fill(0),
    mapXpo: new Array(121).fill(0),
    sub,
    aei: zeroEnvelope(),
    fei: zeroEnvelope(),
    pei: zeroEnvelope()
  };
}
var SAMPLE_FLAG_UNS = 1 << 10;
var SAMPLE_FLAG_ADPCM = 1 << 13;
function s3mLoad(bytes, ctx) {
  const size = bytes.length;
  const fail = (msg) => {
    throw new ParseError(msg);
  };
  if (size < 96) fail("S3M: short header");
  const sfh = {
    name: bytes.subarray(0, 28),
    type: bytes[30],
    ordnum: readmem16l(bytes, 32),
    insnum: readmem16l(bytes, 34),
    patnum: readmem16l(bytes, 36),
    flags: readmem16l(bytes, 38),
    version: readmem16l(bytes, 40),
    ffi: readmem16l(bytes, 42),
    magic: readmem32b(bytes, 44),
    gv: bytes[48],
    is: bytes[49],
    it: bytes[50],
    mv: bytes[51],
    uc: bytes[52],
    dp: bytes[53],
    rsvd2: bytes.subarray(54, 62),
    special: readmem16l(bytes, 62),
    chset: bytes.subarray(64, 96)
  };
  if (sfh.ffi !== 1 && sfh.ffi !== 2) fail("S3M: bad ffi");
  if (sfh.ordnum > 255 || sfh.insnum > 255 || sfh.patnum > 255) {
    fail("S3M: count > 255");
  }
  if (sfh.magic !== MAGIC_SCRM) fail("S3M: bad magic");
  const title = copyAdjust(sfh.name, 28);
  const ppIns = new Array(sfh.insnum).fill(0);
  const ppPat = new Array(sfh.patnum).fill(0);
  if (sfh.flags & S3M_AMIGA_RANGE) {
  }
  const periodType = sfh.flags & S3M_AMIGA_RANGE ? PeriodType.MODRNG : PeriodType.AMIGA;
  let quirk = 0;
  if (sfh.flags & S3M_ST300_VOLS) {
    quirk |= Quirk.VSALL;
  }
  let spd = sfh.is;
  let bpm = sfh.it;
  let chn = 0;
  let mvol;
  let stereo;
  if (sfh.ffi === 1) {
    mvol = ((sfh.mv & 15) + 1) * 16;
    stereo = sfh.mv & 16;
    mvol = clamp(mvol, 16, 127);
  } else if (sfh.mv === 2 || sfh.mv === 18) {
    mvol = 32;
    stereo = sfh.mv & 16;
  } else {
    mvol = sfh.mv & 127;
    stereo = sfh.mv & 128;
    if (mvol === 0) {
      mvol = 48;
    } else if (mvol < 16) {
      mvol = 16;
    }
  }
  if (!stereo) {
    mvol = Math.trunc(mvol * 8 / 11);
  }
  const channels = [];
  for (let i = 0; i < 32; i++) {
    const dpan = Math.floor((i + 1) / 2) % 2 * 255;
    channels.push({
      pan: Math.min(255, Math.max(0, 128 + (dpan - 128))),
      vol: 64,
      flg: 0
    });
  }
  for (let i = 0; i < 32; i++) {
    if (sfh.chset[i] === S3M_CH_OFF) {
      continue;
    }
    chn = i + 1;
    const x = sfh.chset[i] & S3M_CH_NUMBER;
    if (stereo && x < S3M_CH_ADLIB) {
      channels[i].pan = x < S3M_CH_RIGHT ? 48 : 192;
    } else {
      channels[i].pan = 128;
    }
  }
  let len;
  let xxo;
  if (sfh.ordnum <= XMP_MAX_MOD_LENGTH) {
    len = sfh.ordnum;
    if (96 + len > size) fail("S3M: read error in orders");
    xxo = Array.from(bytes.subarray(96, 96 + len));
  } else {
    len = XMP_MAX_MOD_LENGTH;
    if (96 + len > size) fail("S3M: read error in orders");
    xxo = Array.from(bytes.subarray(96, 96 + len));
  }
  let pat = -1;
  for (let i = 0; i < len; i++) {
    const o = xxo[i];
    if (o < 254 && o > pat) {
      pat = o;
    }
  }
  pat++;
  if (pat > sfh.patnum) {
    pat = sfh.patnum;
  }
  if (pat === 0) {
    fail("S3M: no patterns");
  }
  const ins = sfh.insnum;
  let pos = 96 + len;
  if (pos + sfh.insnum * 2 + sfh.patnum * 2 > size) {
    fail("S3M: read error in parapointers");
  }
  for (let i = 0; i < sfh.insnum; i++) {
    ppIns[i] = readmem16l(bytes, pos);
    pos += 2;
  }
  for (let i = 0; i < sfh.patnum; i++) {
    ppPat[i] = readmem16l(bytes, pos);
    pos += 2;
  }
  if (sfh.dp === 252) {
    if (pos + 32 > size) fail("S3M: read error in default pan");
    for (let i = 0; i < 32; i++) {
      const x = bytes[pos + i];
      if (x & S3M_PAN_SET) {
        channels[i].pan = x << 4 & 255;
      }
    }
    pos += 32;
  }
  const c4rate = C4_NTSC_RATE;
  let flowMode = FLOW_MODE_ST3_321;
  if (sfh.version === 4864) {
    quirk |= Quirk.VSALL;
  }
  let trackerName;
  switch (Math.floor(sfh.version / 4096)) {
    case 1:
      if (sfh.version === 4896 && sfh.special === 0 && (sfh.ordnum & 15) === 0 && sfh.uc === 0 && (sfh.flags & ~80) === 0 && sfh.dp === 252) {
        if ((sfh.mv & 128) !== 0) {
          trackerName = "ModPlug Tracker / OpenMPT 1.17";
        } else {
          trackerName = "ModPlug Tracker 1.0 alpha";
        }
        flowMode = FLOW_MODE_MPT_116;
      } else if (sfh.version === 4896 && sfh.special === 0 && sfh.uc === 0 && sfh.flags === 0 && sfh.dp === 0) {
        if (sfh.gv === 64 && sfh.mv === 48) {
          trackerName = "PlayerPRO";
        } else {
          trackerName = "Velvet Studio";
        }
      } else {
        trackerName = `Scream Tracker ${((sfh.version & 3840) >> 8).toString()}.${(sfh.version & 255).toString(16).padStart(2, "0")}`;
        quirk |= Quirk.ST3BUGS;
        if (sfh.version < 4867) {
          flowMode = FLOW_MODE_ST3_301;
        }
      }
      break;
    case 2:
      if (sfh.version === 8211) {
        trackerName = "PlayerPRO";
      } else {
        trackerName = `Imago Orpheus ${((sfh.version & 3840) >> 8).toString()}.${(sfh.version & 255).toString(16).padStart(2, "0")}`;
        flowMode = FLOW_MODE_ORPHEUS;
      }
      break;
    case 3:
      flowMode = FLOW_MODE_IT_210;
      if (sfh.version === 12822) {
        trackerName = "Impulse Tracker 2.14v3";
      } else if (sfh.version === 12823) {
        trackerName = "Impulse Tracker 2.14v5";
      } else {
        trackerName = `Impulse Tracker ${((sfh.version & 3840) >> 8).toString()}.${(sfh.version & 255).toString(16).padStart(2, "0")}`;
      }
      break;
    case 5:
      if (sfh.version === 21575) {
        trackerName = "Graoumf Tracker";
      } else if (sfh.rsvd2[0] || sfh.rsvd2[1]) {
        trackerName = `OpenMPT ${((sfh.version & 3840) >> 8).toString()}.${(sfh.version & 255).toString(16).padStart(2, "0")}.${sfh.rsvd2[1].toString(16).padStart(2, "0")}.${sfh.rsvd2[0].toString(16).padStart(2, "0")}`;
      } else {
        trackerName = `OpenMPT ${((sfh.version & 3840) >> 8).toString()}.${(sfh.version & 255).toString(16).padStart(2, "0")}`;
      }
      quirk |= Quirk.ST3BUGS;
      break;
    case 4:
    case 6:
      if (sfh.version === 16640 || Math.floor(sfh.version / 4096) === 6) {
        trackerName = `BeRoTracker ${((sfh.version & 3840) >> 8).toString()}.${(sfh.version & 255).toString(16).padStart(2, "0")}`;
      } else {
        trackerName = schismTrackerString(sfh.version & 4095, sfh.rsvd2[0] | sfh.rsvd2[1] << 8);
      }
      break;
    default:
      trackerName = `unknown (${sfh.version.toString(16).padStart(4, "0")})`;
  }
  const type = `${trackerName} S3M`;
  const patterns = [];
  const tracksByEvent = [];
  for (let i = 0; i < pat; i++) {
    const tracks = [];
    for (let c = 0; c < chn; c++) {
      const events = [];
      for (let r = 0; r < 64; r++) {
        events.push({ ...EMPTY_EVENT });
      }
      tracks.push({ rows: 64, event: events });
    }
    tracksByEvent.push(tracks);
  }
  for (let i = 0; i < pat; i++) {
    const tracks = tracksByEvent[i];
    if (ppPat[i] === 0) {
      patterns.push({ rows: 64, tracks });
      continue;
    }
    const base = ppPat[i] * 16;
    if (base + 2 > size) fail("S3M: read error in pattern header");
    let patPos = base;
    const patLen = readmem16l(bytes, patPos) - 2;
    patPos += 2;
    let r = 0;
    let remaining = patLen;
    while (remaining >= 0 && r < 64) {
      if (patPos >= size) fail("S3M: read error in pattern data");
      const b = bytes[patPos];
      patPos++;
      if (b === S3M_EOR) {
        r++;
        continue;
      }
      const c = b & S3M_CH_MASK;
      const dummy = { ...EMPTY_EVENT };
      const event = c >= chn ? dummy : tracks[c].event[r];
      if (b & S3M_NI_FOLLOW) {
        if (patPos + 2 > size) fail("S3M: read error in pattern data");
        let n = bytes[patPos];
        switch (n) {
          case 255:
            n = 0;
            break;
          case 254:
            n = XMP_KEY_OFF;
            break;
          default:
            n = 13 + 12 * MSN(n) + LSN(n);
        }
        event.note = n;
        event.ins = bytes[patPos + 1];
        remaining -= 2;
        patPos += 2;
      }
      if (b & S3M_VOL_FOLLOWS) {
        if (patPos + 1 > size) fail("S3M: read error in pattern data");
        event.vol = bytes[patPos] + 1;
        remaining -= 1;
        patPos += 1;
      }
      if (b & S3M_FX_FOLLOWS) {
        if (patPos + 2 > size) fail("S3M: read error in pattern data");
        event.fxt = bytes[patPos];
        event.fxp = bytes[patPos + 1];
        xlatFx(c, event);
        remaining -= 2;
        patPos += 2;
      }
    }
    patterns.push({ rows: 64, tracks });
  }
  const instruments = [];
  const rawSamples = [];
  for (let i = 0; i < ins; i++) {
    const sub = {
      vol: 0,
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
    const hdrBase = ppIns[i] * 16;
    if (hdrBase + 80 > size) fail("S3M: read error in instrument header");
    const buf = bytes.subarray(hdrBase, hdrBase + 80);
    if (buf[0] >= 2) {
      fail(`S3M: FM instrument not supported (${i})`);
    }
    const sih = {
      dosname: buf.subarray(1, 13),
      memsegHi: buf[13],
      memseg: readmem16l(buf, 14),
      length: readmem32l(buf, 16),
      loopbeg: readmem32l(buf, 20),
      loopend: readmem32l(buf, 24),
      vol: buf[28],
      pack: buf[30],
      flags: buf[31],
      c2spd: readmem16l(buf, 32),
      name: buf.subarray(48, 76),
      magic: readmem32b(buf, 76)
    };
    if (sih.length > MAX_SAMPLE_SIZE) {
      fail("S3M: sample too large");
    }
    if (buf[0] === 1 && sih.magic !== MAGIC_SCRS) {
      fail("S3M: instrument magic");
    }
    const name = copyAdjust(sih.name, 28);
    const xxi = zeroInstrument(name, [sub]);
    xxi.nsm = sih.length > 0 ? 1 : 0;
    const raw = {
      // s3m_load.c names only the INSTRUMENT (libxmp_instrument_name at
      // s3m_load.c:592/661) — xxs->name stays empty in C.
      name: "",
      data: new Uint8Array(0),
      length: sih.length,
      loopStart: sih.loopbeg,
      loopEnd: sih.loopend,
      sustainStart: 0,
      sustainEnd: 0,
      finetune: 0,
      volume: sih.vol,
      flags: 0,
      // libxmp_init_instrument: m->xtra[i].c5spd = m->c4rate; S3M overwrites
      // pitch via c2spd → xpo/fin below (sub->xpo/sub->fin), not c5spd.
      c5spd: C4_NTSC_RATE
    };
    let xflg = sih.flags & S3M_SAMP_LOOP ? SampleFlags.LOOP : 0;
    if (sih.flags & S3M_SAMP_STEREO) {
      xflg |= SampleFlags.STEREO;
    }
    if (sih.flags & S3M_SAMP_16BIT) {
      xflg |= SampleFlags.BITS16;
    }
    raw.flags = xflg;
    let loadSampleFlags = sfh.ffi === 1 ? 0 : SAMPLE_FLAG_UNS;
    if (sih.pack === 4) {
      loadSampleFlags = SAMPLE_FLAG_ADPCM;
    }
    raw.flags |= loadSampleFlags;
    sub.vol = sih.vol;
    const { n, f } = c2spdToNote(sih.c2spd);
    sub.xpo = n;
    sub.fin = f;
    const sampleSegment = sih.memseg + sih.memsegHi * 65536 >>> 0;
    let dataPos = sampleSegment * 16;
    if (dataPos > size) dataPos = size;
    if (sih.length > 0) {
      const framelen = (sih.flags & S3M_SAMP_16BIT ? 2 : 1) * (sih.flags & S3M_SAMP_STEREO ? 2 : 1);
      const bytelen = sih.pack === 4 ? (sih.length + 1 >> 1) + 16 : sih.length * framelen;
      const remaining = size - dataPos;
      const take = Math.min(bytelen, Math.max(0, remaining));
      raw.data = bytes.subarray(dataPos, dataPos + take);
    }
    ctx.addSample(raw);
    instruments.push(xxi);
    rawSamples.push(raw);
  }
  quirk |= QUIRKS_ST3 | Quirk.ARPMEM;
  const readEventType = ReadEventType.ST3;
  channels.length = chn;
  const mod = {
    title,
    format: "s3m",
    comment: "",
    chn,
    pat,
    ins,
    len,
    restart: 0,
    xxo,
    channels,
    patterns,
    instruments,
    samples: rawSamples,
    num_sequences: 0,
    sequences: [],
    speed: spd,
    bpm,
    volbase: 64,
    gvolbase: 64,
    // C ignores the S3M global-volume byte (s3m_load.c reads sfh.gv but
    // never assigns it — "Claudio's fix: global volume ignored"); the
    // module global volume stays at the libxmp_init default 0x40
    // (load_helpers.c:304).
    gvol: 64,
    quirks: quirk,
    flowMode,
    readEventType,
    periodType,
    defpan: 128,
    time_factor: 10,
    rrate: 250,
    c4rate,
    // Mix volume (s3m_load.c:714-715: m->mvolbase = 48; m->mvol = mvol).
    mvolbase: 48,
    mvol,
    tracker: type
  };
  void ctx.sampleRate;
  void ctx.outputRate;
  return mod;
}
var plugin = {
  name: "s3m",
  test: s3mTest,
  load: s3mLoad,
  readEvent(core, chn, row) {
    const mod = core.module;
    const xc = core.ctx.channelStates[chn];
    const e = core.readEventScratch(chn) ?? core.readEventAt(mod.xxo[core.ctx.p.ord] ?? 0, chn, row);
    if (e.ins !== 0) xc.old_ins = e.ins;
    if (TEST_NOTE(xc, NoteFlag.SAMPLE_END) !== 0) {
      SET_NOTE(xc, NoteFlag.END);
    }
    readEventSt3(core, e, chn);
  }
};

// ../../packages/fmt-s3m/src/s3mWrite.ts
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
var ASCII = (name) => (name ?? "").replace(/[^\x20-\x7e]/g, " ");
function packPattern(pat, chn) {
  const w = new ByteWriter();
  for (let r = 0; r < pat.rows; r++) {
    for (let c = 0; c < chn; c++) {
      const e = pat.tracks[c]?.event[r] ?? { note: 0, ins: 0, vol: 0, fxt: 0, fxp: 0, f2t: 0, f2p: 0 };
      const hasNote = e.note > 0 && e.note < 129;
      const hasVol = e.vol > 0;
      const hasFx = e.fxt !== 0;
      if (!hasNote && !hasVol && !hasFx) continue;
      let info = 0;
      const payload = [];
      if (hasNote) {
        info |= 32 | c;
        payload.push(e.note - 1);
        payload.push(e.ins & 255);
      }
      if (hasVol) {
        info |= 64 | c;
        payload.push(Math.min(63, e.vol - 1));
      }
      if (hasFx) {
        info |= 128 | c;
        payload.push(e.fxt & 255);
        payload.push(e.fxp & 255);
      }
      w.u8(info);
      for (const b of payload) w.u8(b);
    }
    w.u8(0);
  }
  w.u8(0);
  return w.bytes_;
}
var writeS3m = (mod) => {
  const w = new ByteWriter();
  const ordnum = Math.max(1, mod.len);
  const insnum = Math.min(99, mod.ins);
  const smpnum = Math.min(99, mod.samples.length);
  const patnum = mod.pat;
  const chnCount = Math.min(32, mod.chn);
  w.ascii(ASCII(mod.title).slice(0, 28), 28);
  w.u8(26);
  w.u8(16);
  w.zeros(2);
  w.u16le(ordnum);
  w.u16le(insnum);
  w.u16le(patnum);
  w.u16le(0);
  w.u16le(4864 >> 4);
  w.u16le(1);
  w.ascii("SCRM", 4);
  w.u8(mod.gvol & 127);
  w.u8(mod.speed);
  w.u8(mod.bpm);
  w.u8(32);
  w.zeros(1);
  w.u8(252);
  w.zeros(8);
  w.zeros(2);
  for (let i = 0; i < 32; i++) {
    if (i < chnCount) {
      const pan = mod.channels[i]?.pan ?? 128;
      w.u8(pan >= 128 ? 8 : 0);
    } else {
      w.u8(255);
    }
  }
  for (let i = 0; i < ordnum; i++) w.u8(mod.xxo[i] ?? 0);
  const insPtrPos = w.bytes_.length;
  for (let i = 0; i < insnum; i++) w.u16le(0);
  const patPtrPos = w.bytes_.length;
  for (let i = 0; i < patnum; i++) w.u16le(0);
  for (let i = 0; i < 32; i++) {
    w.u8(i < chnCount ? (mod.channels[i]?.pan ?? 128) >> 4 & 15 : 8);
  }
  const smpDataOffs = [];
  const paraOf = (off) => off >> 4;
  const insPtrs = [];
  for (let i = 0; i < insnum; i++) {
    while (w.bytes_.length % 16 !== 0) w.zeros(1);
    insPtrs.push(w.bytes_.length);
    const ins = mod.instruments[i];
    const s0 = ins.sub[0];
    const smp = s0 ? mod.samples[s0.sid] : void 0;
    w.u8(1);
    w.ascii(ASCII(ins.name).slice(0, 12), 12);
    w.u8(0);
    const memsegPos = w.bytes_.length;
    w.u16le(0);
    w.u32le(smp?.length ?? 0);
    w.u32le(smp && smp.loopEnd > smp.loopStart ? smp.loopStart : 0);
    w.u32le(smp && smp.loopEnd > smp.loopStart ? smp.loopEnd : 0);
    w.u8(Math.min(64, smp?.volume ?? 64));
    w.u8(0);
    w.u8(0);
    w.u8(smp && smp.loopEnd > smp.loopStart ? 1 : 0);
    w.u16le(smp?.c5spd ?? 8363);
    w.zeros(14);
    w.ascii(ASCII(ins.name), 28);
    w.ascii("SCRS", 4);
    const seg = smpDataOffs[i] ?? 0;
    w.patchU16le(memsegPos, seg >> 4);
    w.patchU16le(insPtrPos + i * 2, insPtrs[i] >> 4);
  }
  const patPtrs = [];
  for (let p = 0; p < patnum; p++) {
    while (w.bytes_.length % 16 !== 0) w.zeros(1);
    patPtrs.push(w.bytes_.length);
    const packed = packPattern(mod.patterns[p], chnCount);
    w.u16le(packed.length + 2);
    w.bytes(packed);
  }
  for (let i = 0; i < insnum; i++) {
    const bodyStart = insPtrs[i];
    const seg = paraOf(smpDataOffs[i] ?? 0);
    w.patchU32le(insPtrPos + i * 2, paraOf(bodyStart));
    w.patchU16le(bodyStart + 12, seg);
    w.u8;
  }
  for (let i = 0; i < patnum; i++) w.patchU16le(patPtrPos + i * 2, paraOf(patPtrs[i]));
  for (let i = 0; i < smpnum; i++) {
    const s = mod.samples[i];
    const len = s?.length ?? 0;
    while (w.bytes_.length % 16 !== 0) w.zeros(1);
    smpDataOffs.push(w.bytes_.length);
    if (s) w.bytes(s.data.subarray(0, len));
  }
  void w.patchU32le;
  return w.bytes_;
};
var s3mExportPlugin = () => ({
  name: "s3m",
  label: "Scream Tracker 3 (.s3m)",
  extension: "s3m",
  supports: (mod) => mod.format === "s3m",
  write: writeS3m
});
export {
  plugin,
  s3mExportPlugin,
  s3mLoad,
  s3mTest
};

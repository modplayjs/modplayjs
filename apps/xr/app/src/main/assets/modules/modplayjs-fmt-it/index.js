// ../../packages/fmt-it/src/it.ts
import {
  C4_NTSC_RATE,
  ChannelFlags,
  DecodeFlag,
  Dct,
  EMPTY_EVENT,
  EnvelopeFlags,
  FLOW_MODE_IT_100,
  FLOW_MODE_IT_104,
  FLOW_MODE_IT_200,
  FLOW_MODE_IT_210,
  FLOW_MODE_MPT_116,
  FX,
  Nna,
  ParseError,
  PeriodType,
  Quirk,
  QUIRKS_IT,
  ReadEventType,
  SampleFlags,
  XMP_KEY_CUT,
  XMP_KEY_FADE,
  XMP_KEY_OFF
} from "@modplayjs/core";
import { SET_NOTE, TEST_NOTE, NoteFlag, readEventIt } from "@modplayjs/core";

// ../../packages/fmt-it/src/itsex.ts
var READ_BITS_MASK = (n) => (1 << n) - 1;
var TEMP_BUFFER_LEN = 65536;
function readBits(s, buf, n) {
  let retval = 0;
  if (n <= 0 || n >= 32) {
    s.err = -2;
    return 0;
  }
  retval = s.bits & READ_BITS_MASK(n);
  if (s.numBits < n) {
    const offset = s.numBits;
    if (s.left === 0) {
      s.err = -1;
      return 0;
    }
    s.bits = buf[s.pos] | buf[s.pos + 1] << 8 | buf[s.pos + 2] << 16 | buf[s.pos + 3] << 24;
    const used = Math.min(s.left, 4);
    s.numBits = used * 8;
    s.pos += 4;
    s.left -= used;
    n -= offset;
    retval |= (s.bits & READ_BITS_MASK(n)) << offset;
  }
  s.bits = s.bits >>> n;
  s.numBits -= n;
  return retval >>> 0;
}
function initBlock(s, tmp, tmplen, src, srcPos) {
  if (srcPos.pos + 2 > src.length) return false;
  s.left = src[srcPos.pos] | src[srcPos.pos + 1] << 8;
  s.pos = 0;
  s.bits = 0;
  s.numBits = 0;
  s.err = 0;
  srcPos.pos += 2;
  if (tmplen < (s.left + 4 & ~3)) return false;
  if (srcPos.pos + s.left > src.length) return false;
  tmp.set(src.subarray(srcPos.pos, srcPos.pos + s.left), 0);
  srcPos.pos += s.left;
  for (let i = s.left; i & 3; i++) tmp[i] = 0;
  return true;
}
function itsexDecompress8(src, srcPos, dst, len, tmp, tmplen, it215) {
  const s = { pos: 0, left: 0, bits: 0, numBits: 0, err: 0 };
  let blockCount = 0;
  let left = 0;
  let temp = 0;
  let temp2 = 0;
  let dstOff = 0;
  while (len > 0) {
    if (blockCount === 0) {
      blockCount = 32768;
      left = 9;
      temp = temp2 = 0;
      if (!initBlock(s, tmp, tmplen, src, srcPos)) return false;
    }
    let d = blockCount;
    if (d > len) d = len;
    let pos = 0;
    do {
      let bits = readBits(s, tmp, left) & 65535;
      if (s.err) return false;
      if (left < 7) {
        const i = 1 << left - 1;
        const j = bits & 65535;
        if (i !== j) {
          if (left < 8) {
            const shift = 8 - left;
            const c = (bits << shift & 255) << 24 >> 24;
            bits = c >> shift & 65535;
          }
          bits = bits + temp & 65535;
          temp = bits & 255;
          temp2 = temp2 + temp & 255;
          dst[dstOff + pos] = it215 ? temp2 : temp;
          pos++;
        } else {
          bits = readBits(s, tmp, 3) + 1 & 255;
          if (s.err) return false;
          left = (bits & 255) < left ? bits & 255 : bits + 1 & 255;
        }
      } else if (left < 9) {
        const i = (255 >> 9 - left) + 4;
        const j = i - 8;
        if (bits <= j || bits > i) {
          if (left < 8) {
            const shift = 8 - left;
            const c = (bits << shift & 255) << 24 >> 24;
            bits = c >> shift & 65535;
          }
          bits = bits + temp & 65535;
          temp = bits & 255;
          temp2 = temp2 + temp & 255;
          dst[dstOff + pos] = it215 ? temp2 : temp;
          pos++;
        } else {
          bits -= j;
          left = (bits & 255) < left ? bits & 255 : bits + 1 & 255;
        }
      } else if (left >= 10) {
        pos++;
      } else if (bits >= 256) {
        left = bits + 1 & 255;
      } else {
        bits = bits + temp & 65535;
        temp = bits & 255;
        temp2 = temp2 + temp & 255;
        dst[dstOff + pos] = it215 ? temp2 : temp;
        pos++;
      }
    } while (pos < d);
    blockCount -= d;
    len -= d;
    dstOff += d;
  }
  return true;
}
function itsexDecompress16(src, srcPos, dst, len, tmp, tmplen, it215) {
  const s = { pos: 0, left: 0, bits: 0, numBits: 0, err: 0 };
  let blockCount = 0;
  let left = 0;
  let temp = 0;
  let temp2 = 0;
  let dstOff = 0;
  while (len > 0) {
    if (blockCount === 0) {
      blockCount = 16384;
      left = 17;
      temp = temp2 = 0;
      if (!initBlock(s, tmp, tmplen, src, srcPos)) return false;
    }
    let d = blockCount;
    if (d > len) d = len;
    let pos = 0;
    do {
      let bits = readBits(s, tmp, left) >>> 0;
      if (s.err) return false;
      if (left < 7) {
        const i = 1 << left - 1;
        const j = bits;
        if (i !== j) {
          if (left < 16) {
            const shift = 16 - left;
            const c = (bits << shift & 65535) << 16 >> 16;
            bits = c >> shift >>> 0;
          }
          bits = bits + temp >>> 0;
          temp = bits << 16 >> 16;
          temp2 = temp2 + temp | 0;
          write16(dst, dstOff + pos, it215 ? temp2 : temp);
          pos++;
        } else {
          bits = readBits(s, tmp, 4) + 1;
          if (s.err) return false;
          left = (bits & 255) < left ? bits & 255 : bits + 1 & 255;
        }
      } else if (left < 17) {
        const i = (65535 >> 17 - left) + 8;
        const j = i - 16 & 65535;
        if (bits <= j || bits > (i & 65535)) {
          if (left < 16) {
            const shift = 16 - left;
            const c = (bits << shift & 65535) << 16 >> 16;
            bits = c >> shift >>> 0;
          }
          bits = bits + temp >>> 0;
          temp = bits << 16 >> 16;
          temp2 = temp2 + temp | 0;
          write16(dst, dstOff + pos, it215 ? temp2 : temp);
          pos++;
        } else {
          bits -= j;
          left = (bits & 255) < left ? bits & 255 : bits + 1 & 255;
        }
      } else if (left >= 18) {
        pos++;
      } else if (bits >= 65536) {
        left = bits + 1 & 255;
      } else {
        bits = bits + temp >>> 0;
        temp = bits << 16 >> 16;
        temp2 = temp2 + temp | 0;
        write16(dst, dstOff + pos, it215 ? temp2 : temp);
        pos++;
      }
    } while (pos < d);
    blockCount -= d;
    len -= d;
    dstOff += d;
    if (len <= 0) break;
  }
  return true;
}
function write16(buf, sampleIdx, v) {
  const o = sampleIdx * 2;
  buf[o] = v & 255;
  buf[o + 1] = v >> 8 & 255;
}

// ../../packages/fmt-it/src/it.ts
var MAGIC_IMPM = 1229803597;
var MAGIC_IMPI = 1229803593;
var MAGIC_IMPS = 1229803603;
var L_CHANNELS = 64;
var XMP_MAX_KEYS = 121;
var XMP_MAX_MOD_LENGTH = 256;
var MAX_SAMPLE_SIZE = 268435456;
var FX_NONE = 255;
var FX_XTND = 254;
var IT_STEREO = 1;
var IT_USE_INST = 4;
var IT_LINEAR_FREQ = 8;
var IT_OLD_FX = 16;
var IT_LINK_GXX = 32;
var IT_MIDI_CONFIG = 128;
var IT_HAS_MSG = 1;
var IT_EDIT_HISTORY = 2;
var IT_SPEC_MIDICFG = 8;
var IT_ENV_ON = 1;
var IT_ENV_LOOP = 2;
var IT_ENV_SLOOP = 4;
var IT_ENV_CARRY = 8;
var IT_ENV_FILTER = 128;
var IT_SMP_SAMPLE = 1;
var IT_SMP_16BIT = 2;
var IT_SMP_STEREO = 4;
var IT_SMP_COMP = 8;
var IT_SMP_LOOP = 16;
var IT_SMP_SLOOP = 32;
var IT_SMP_BLOOP = 64;
var IT_SMP_BSLOOP = 128;
var IT_CVT_SIGNED = 1;
var IT_CVT_DIFF = 4;
var IT_CVT_ADPCM = 255;
var SAMPLE_FLAG_UNS = 1 << 10;
var SAMPLE_FLAG_ADPCM = 1 << 13;
var MAGIC_CHBI = 1229080643;
var MAGIC_OMPT = 1414548815;
var fx = [
  /*   */
  FX_NONE,
  /* A */
  FX.FX_S3M_SPEED,
  /* B */
  FX.FX_JUMP,
  /* C */
  FX.FX_IT_BREAK,
  /* D */
  FX.FX_VOLSLIDE,
  /* E */
  FX.FX_PORTA_DN,
  /* F */
  FX.FX_PORTA_UP,
  /* G */
  FX.FX_TONEPORTA,
  /* H */
  FX.FX_VIBRATO,
  /* I */
  FX.FX_TREMOR,
  /* J */
  FX.FX_S3M_ARPEGGIO,
  /* K */
  FX.FX_VIBRA_VSLIDE,
  /* L */
  FX.FX_TONE_VSLIDE,
  /* M */
  FX.FX_TRK_VOL,
  /* N */
  FX.FX_TRK_VSLIDE,
  /* O */
  FX.FX_OFFSET,
  /* P */
  FX.FX_IT_PANSLIDE,
  /* Q */
  FX.FX_MULTI_RETRIG,
  /* R */
  FX.FX_TREMOLO,
  /* S */
  FX_XTND,
  /* T */
  FX.FX_IT_BPM,
  /* U */
  FX.FX_FINE_VIBRATO,
  /* V */
  FX.FX_GLOBALVOL,
  /* W */
  FX.FX_GVOL_SLIDE,
  /* X */
  FX.FX_SETPAN,
  /* Y */
  FX.FX_PANBRELLO,
  /* Z */
  FX.FX_MACRO,
  /* ? */
  FX_NONE,
  /* / */
  FX.FX_MACROSMOOTH,
  /* ? */
  FX_NONE,
  /* ? */
  FX_NONE,
  /* ? */
  FX_NONE
];
var bytesInPackedEvent = [0, 1, 1, 2, 1, 2, 2, 3, 2, 3, 3, 4, 3, 4, 4, 5];
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
function fixName(s, l) {
  let i;
  for (l--, i = 0; i < l; i++) {
    if (s[i] === 0) s[i] = 32;
  }
  for (i--; i >= 0 && s[i] === 32; i--) {
    s[i] = 0;
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
function fail(msg) {
  throw new ParseError(`IT: ${msg}`);
}
function applyMptPreamp(mod) {
  const preampTable = [
    96,
    96,
    96,
    112,
    // 0-7
    128,
    136,
    144,
    152,
    // 8-15
    160,
    164,
    168,
    176,
    // 16-23
    180,
    184,
    188,
    192
    // 24-31
  ];
  let chn = mod.chn;
  if (chn < 1) chn = 1;
  if (chn > 31) chn = 31;
  mod.mvol = Math.trunc((mod.mvol ?? 0) * 96 / preampTable[chn >> 1]);
}
function zeroEnvelope() {
  return { flags: 0, npt: 0, scl: 0, sus: 0, sue: 0, lps: 0, lpe: 0, x: [], y: [] };
}
function zeroSub() {
  return {
    vol: 0,
    gvl: 0,
    pan: 0,
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
function zeroInstrument() {
  return {
    name: "",
    volume: 0,
    nsm: 0,
    rls: 0,
    map: new Array(XMP_MAX_KEYS).fill(0),
    mapXpo: new Array(XMP_MAX_KEYS).fill(0),
    sub: [],
    aei: zeroEnvelope(),
    fei: zeroEnvelope(),
    pei: zeroEnvelope()
  };
}
function itTest(bytes) {
  if (bytes.length < 4) return false;
  if (readmem32b(bytes, 0) !== MAGIC_IMPM) return false;
  return true;
}
function loadItMidiConfig(bytes, pos) {
  let p = pos;
  p += 9 * 32;
  if (p > bytes.length) return null;
  const param = [];
  for (let i = 0; i < 16; i++) {
    if (p + 32 > bytes.length) return null;
    const d = bytes.slice(p, p + 32);
    d[31] = 0;
    param.push(d);
    p += 32;
  }
  const fixed = [];
  for (let i = 0; i < 128; i++) {
    if (p + 32 > bytes.length) return null;
    const d = bytes.slice(p, p + 32);
    d[31] = 0;
    fixed.push(d);
    p += 32;
  }
  return { midi: { param, fixed }, end: p };
}
function readEnvelope(bytes, pos) {
  if (pos + 82 > bytes.length) return null;
  const buf = bytes.subarray(pos, pos + 82);
  const flg = buf[0];
  const num = Math.min(buf[1], 25);
  const lpb = buf[2];
  const lpe = buf[3];
  const slb = buf[4];
  const sle = buf[5];
  const ei = zeroEnvelope();
  if (flg & IT_ENV_ON) ei.flags |= EnvelopeFlags.ON;
  if (flg & IT_ENV_LOOP) ei.flags |= EnvelopeFlags.LOOP;
  if (flg & IT_ENV_SLOOP) ei.flags |= EnvelopeFlags.SUS | EnvelopeFlags.SLOOP;
  if (flg & IT_ENV_CARRY) ei.flags |= EnvelopeFlags.CARRY;
  ei.npt = num;
  ei.sus = slb;
  ei.sue = sle;
  ei.lps = lpb;
  ei.lpe = lpe;
  if (num > 0 && num <= 25) {
    for (let i = 0; i < num; i++) {
      ei.x[i] = readmem16l(buf, 7 + i * 3);
      ei.y[i] = buf[6 + i * 3] << 24 >> 24;
    }
  } else {
    ei.flags &= ~EnvelopeFlags.ON;
  }
  return { env: ei, envRawFlg: flg, envRawNum: num, end: pos + 82 };
}
function identifyTracker(ifh, patBeforeSmp, sampleMode) {
  let trackerName;
  let flowMode = FLOW_MODE_IT_210;
  let cmwt = ifh.cmwt;
  let isMpt116 = false;
  switch (ifh.cwt >> 8) {
    case 0:
      trackerName = "unmo3";
      break;
    case 1:
    case 2: {
      if (cmwt === 512 && ifh.cwt === 532 && ifh.flags === 9 && ifh.special === 0 && ifh.hiliteMaj === 0 && ifh.hiliteMin === 0 && ifh.insnum === 0 && ifh.patnum + 1 === ifh.ordnum && ifh.gv === 128 && ifh.mv === 100 && ifh.is === 1 && ifh.sep === 128 && ifh.pwd === 0 && ifh.msglen === 0 && ifh.msgofs === 0 && ifh.rsvd === 0) {
        trackerName = "OpenSPC conversion";
      } else if (cmwt === 512 && ifh.cwt === 535) {
        trackerName = "ModPlug Tracker 1.16";
        cmwt = sampleMode ? 256 : 532;
        flowMode = FLOW_MODE_MPT_116;
        isMpt116 = true;
      } else if (cmwt === 512 && ifh.cwt === 514 && patBeforeSmp) {
        trackerName = "ModPlug Tracker 1.0 pre-alpha";
        cmwt = sampleMode ? 256 : 512;
        flowMode = FLOW_MODE_MPT_116;
        isMpt116 = true;
      } else if (ifh.cwt === 534) {
        trackerName = "Impulse Tracker 2.14v3";
      } else if (ifh.cwt === 535) {
        trackerName = "Impulse Tracker 2.14v5";
      } else if (ifh.cwt === 532 && ifh.rsvd === MAGIC_CHBI) {
        trackerName = "Chibi Tracker";
      } else {
        trackerName = `Impulse Tracker ${(ifh.cwt & 3840) >> 8}.${(ifh.cwt & 255).toString(16).padStart(2, "0")}`;
        if (ifh.cwt < 260) {
          flowMode = FLOW_MODE_IT_100;
        } else if (ifh.cwt < 512) {
          flowMode = FLOW_MODE_IT_104;
        } else if (ifh.cwt < 528) {
          flowMode = FLOW_MODE_IT_200;
        }
      }
      break;
    }
    case 8:
    case 127:
      if (ifh.cwt === 2184) {
        trackerName = "OpenMPT 1.17";
        flowMode = FLOW_MODE_MPT_116;
        isMpt116 = true;
      } else if (ifh.cwt === 32767) {
        trackerName = "munch.py";
      } else {
        trackerName = `unknown (${ifh.cwt.toString(16).padStart(4, "0")})`;
      }
      break;
    default:
      switch (ifh.cwt >> 12) {
        case 1:
          trackerName = schismTrackerString(ifh.cwt & 4095, ifh.rsvd);
          break;
        case 5:
          trackerName = `OpenMPT ${(ifh.cwt & 3840) >> 8}.${(ifh.cwt & 255).toString(16).padStart(2, "0")}`;
          if (ifh.rsvd !== MAGIC_OMPT) trackerName += " (compat.)";
          break;
        case 6:
          trackerName = `BeRoTracker ${(ifh.cwt & 3840) >> 8}.${(ifh.cwt & 255).toString(16).padStart(2, "0")}`;
          break;
        default:
          trackerName = `unknown (${ifh.cwt.toString(16).padStart(4, "0")})`;
      }
  }
  return {
    tracker: `${trackerName} IT ${(cmwt >> 8).toString()}.${(cmwt & 255).toString(16).padStart(2, "0")}`,
    flowMode,
    cmwt,
    isMpt116
  };
}
function loadOldItInstrument(bytes, pos) {
  let p = pos;
  if (p + 64 > bytes.length) return null;
  const buf = bytes.slice(p, p + 64);
  p += 64;
  if (readmem32b(buf, 0) !== MAGIC_IMPI) {
    return null;
  }
  const flags = buf[17];
  const vls = buf[18];
  const vle = buf[19];
  const sls = buf[20];
  const sle = buf[21];
  const fadeout = readmem16l(buf, 24);
  const nna = buf[26];
  const dnc = buf[27];
  const nameBuf = buf.slice(32, 58);
  fixName(nameBuf, 26);
  const name = copyAdjust(nameBuf, 25);
  if (p + 240 > bytes.length) return null;
  const keys = bytes.subarray(p, p + 240);
  p += 240;
  if (p + 200 > bytes.length) return null;
  p += 200;
  if (p + 50 > bytes.length) return null;
  const enode = bytes.subarray(p, p + 50);
  p += 50;
  const xxi = zeroInstrument();
  xxi.name = name;
  xxi.rls = fadeout << 7;
  if (flags & IT_ENV_ON) xxi.aei.flags |= EnvelopeFlags.ON;
  if (flags & IT_ENV_LOOP) xxi.aei.flags |= EnvelopeFlags.LOOP;
  if (flags & IT_ENV_SLOOP) xxi.aei.flags |= EnvelopeFlags.SUS | EnvelopeFlags.SLOOP;
  if (flags & IT_ENV_CARRY) xxi.aei.flags |= EnvelopeFlags.SUS | EnvelopeFlags.CARRY;
  xxi.aei.lps = vls;
  xxi.aei.lpe = vle;
  xxi.aei.sus = sls;
  xxi.aei.sue = sle;
  let k = 0;
  for (; k < 25 && enode[k * 2] !== 255; k++) ;
  if (k >= 25 || enode[k * 2] !== 255) {
    return null;
  }
  xxi.aei.npt = k;
  for (k--; k >= 0; k--) {
    xxi.aei.x[k] = enode[k * 2];
    xxi.aei.y[k] = enode[k * 2 + 1];
  }
  const instMap = new Array(255).fill(255);
  const instRmap = new Array(XMP_MAX_KEYS).fill(0);
  let n = 0;
  for (let j = 0; j < XMP_MAX_KEYS; j++) {
    const c = j < 120 ? keys[j * 2 + 1] - 1 : -1;
    if (c < 0) {
      xxi.map[j] = 0;
      xxi.mapXpo[j] = 0;
      continue;
    }
    if (instMap[c] === 255) {
      instMap[c] = n;
      instRmap[n] = c;
      n++;
    }
    xxi.map[j] = instMap[c];
    xxi.mapXpo[j] = keys[j * 2] - j << 24 >> 24;
  }
  xxi.nsm = n;
  xxi.volume = 64;
  if (n) {
    for (let j = 0; j < n; j++) {
      const sub = zeroSub();
      sub.sid = instRmap[j];
      sub.nna = nna;
      sub.dct = dnc ? Dct.NOTE : Dct.OFF;
      sub.dca = Nna.CUT;
      sub.pan = -1;
      xxi.sub.push(sub);
    }
  }
  return { ins: xxi, end: p };
}
function loadNewItInstrument(bytes, pos) {
  let p = pos;
  if (p + 64 > bytes.length) return null;
  const buf = bytes.slice(p, p + 64);
  p += 64;
  if (readmem32b(buf, 0) !== MAGIC_IMPI) {
    return null;
  }
  const nna = buf[17];
  const dct = buf[18];
  let dca = buf[19];
  if (dca > 3) {
    dca = 0;
  }
  const fadeout = readmem16l(buf, 20);
  const gbv = buf[24];
  const dfp = buf[25];
  const rv = buf[26];
  const rp = buf[27];
  const nameBuf = buf.slice(32, 58);
  fixName(nameBuf, 26);
  const name = copyAdjust(nameBuf, 25);
  const ifc = buf[58];
  const ifr = buf[59];
  if (p + 240 > bytes.length) return null;
  const keys = bytes.subarray(p, p + 240);
  p += 240;
  const xxi = zeroInstrument();
  xxi.name = name;
  xxi.rls = fadeout << 6;
  const aeiRes = readEnvelope(bytes, p);
  if (!aeiRes) return null;
  xxi.aei = aeiRes.env;
  p = aeiRes.end;
  const peiRes = readEnvelope(bytes, p);
  if (!peiRes) return null;
  xxi.pei = peiRes.env;
  p = peiRes.end;
  const feiRes = readEnvelope(bytes, p);
  if (!feiRes) return null;
  xxi.fei = feiRes.env;
  p = feiRes.end;
  const envFlg = feiRes.envRawFlg;
  const envNum = feiRes.envRawNum;
  if (xxi.pei.flags & EnvelopeFlags.ON) {
    for (let j = 0; j < xxi.pei.npt; j++) xxi.pei.y[j] += 32;
  }
  if (xxi.aei.flags & EnvelopeFlags.ON && xxi.aei.npt === 0) {
    xxi.aei.npt = 1;
  }
  if (xxi.pei.flags & EnvelopeFlags.ON && xxi.pei.npt === 0) {
    xxi.pei.npt = 1;
  }
  if (xxi.fei.flags & EnvelopeFlags.ON && xxi.fei.npt === 0) {
    xxi.fei.npt = 1;
  }
  if (envFlg & IT_ENV_FILTER) {
    xxi.fei.flags |= EnvelopeFlags.FLT;
    for (let j = 0; j < envNum; j++) {
      xxi.fei.y[j] += 32;
      xxi.fei.y[j] *= 4;
    }
  } else {
    for (let j = 0; j < envNum; j++) xxi.fei.y[j] *= 50;
  }
  const instMap = new Array(255).fill(255);
  const instRmap = new Array(XMP_MAX_KEYS).fill(0);
  let n = 0;
  for (let j = 0; j < 120; j++) {
    const c = keys[j * 2 + 1] - 1;
    if (c < 0) {
      xxi.map[j] = 255;
      xxi.mapXpo[j] = 0;
      continue;
    }
    if (instMap[c] === 255) {
      instMap[c] = n;
      instRmap[n] = c;
      n++;
    }
    xxi.map[j] = instMap[c];
    xxi.mapXpo[j] = keys[j * 2] - j << 24 >> 24;
  }
  xxi.nsm = n;
  xxi.volume = Math.min(gbv, 128) >> 1;
  if (n) {
    const dca2nna = [0, 2, 3, 3];
    for (let j = 0; j < n; j++) {
      const sub = zeroSub();
      sub.sid = instRmap[j];
      sub.nna = nna;
      sub.dct = dct;
      sub.dca = dca2nna[dca] ?? 0;
      sub.pan = dfp & 128 ? -1 : dfp * 4;
      sub.ifc = ifc;
      sub.ifr = ifr;
      sub.rvv = rp << 8 | rv | 0;
      xxi.sub.push(sub);
    }
  }
  return { ins: xxi, end: p };
}
function forceSampleLength(raw, len) {
  raw.length = len;
  if (raw.loopEnd > raw.length) raw.loopEnd = raw.length;
  if (raw.loopStart >= raw.length) {
    raw.flags &= ~SampleFlags.LOOP;
  }
  if (raw.sustainEnd > raw.length) raw.sustainEnd = raw.length;
  if (raw.sustainStart >= raw.length) {
    raw.flags &= ~(SampleFlags.SUSTAIN | SampleFlags.SUSTAIN_BIDIR);
  }
}
function unpackItSample(bytes, srcPos, raw, flags, convertDiff, tmp) {
  let size = raw.length;
  let channels = 1;
  if (flags & IT_SMP_16BIT) size <<= 1;
  if (flags & IT_SMP_STEREO) {
    size <<= 1;
    channels = 2;
  }
  const decbuf = new Uint8Array(size);
  if (flags & IT_SMP_16BIT) {
    for (let i = 0; i < channels; i++) {
      itsexDecompress16(
        bytes,
        srcPos,
        decbuf.subarray(i * raw.length * 2),
        raw.length,
        tmp,
        TEMP_BUFFER_LEN,
        convertDiff !== 0
      );
    }
  } else {
    for (let i = 0; i < channels; i++) {
      itsexDecompress8(
        bytes,
        srcPos,
        decbuf.subarray(i * raw.length),
        raw.length,
        tmp,
        TEMP_BUFFER_LEN,
        convertDiff !== 0
      );
    }
  }
  return decbuf;
}
function loadItSample(bytes, pos, dest, i, start, sampleMode, xxi, instruments, tmp) {
  let p = pos;
  if (sampleMode) {
    xxi.sub = [zeroSub()];
  }
  if (p + 80 > bytes.length) {
    return -1;
  }
  const buf = bytes.slice(p, p + 80);
  p += 80;
  if (readmem32b(buf, 0) !== MAGIC_IMPS) {
    return 0;
  }
  const gvl = buf[17];
  const flags = buf[18];
  const vol = buf[19];
  const nameBuf = buf.slice(20, 46);
  fixName(nameBuf, 26);
  const name = copyAdjust(nameBuf, 25);
  const convert = buf[46];
  const dfp = buf[47];
  const length = readmem32l(buf, 48);
  const loopbeg = readmem32l(buf, 52);
  const loopend = readmem32l(buf, 56);
  const c5spd = readmem32l(buf, 60);
  const sloopbeg = readmem32l(buf, 64);
  const sloopend = readmem32l(buf, 68);
  const samplePtr = readmem32l(buf, 72);
  const vis = buf[76];
  const vid = buf[77];
  const vir = buf[78];
  const vit = buf[79];
  const raw = dest;
  raw.length = length;
  raw.loopStart = loopbeg;
  raw.loopEnd = loopend;
  raw.sustainStart = 0;
  raw.sustainEnd = 0;
  raw.finetune = 0;
  raw.volume = 0;
  raw.flags = 0;
  raw.c5spd = C4_NTSC_RATE;
  if (flags & IT_SMP_16BIT) {
    raw.flags = SampleFlags.BITS16;
  }
  if (flags & IT_SMP_STEREO) {
    raw.flags |= SampleFlags.STEREO;
  }
  raw.flags |= flags & IT_SMP_LOOP ? SampleFlags.LOOP : 0;
  raw.flags |= flags & IT_SMP_BLOOP ? SampleFlags.BIDIR : 0;
  raw.flags |= flags & IT_SMP_SLOOP ? SampleFlags.SUSTAIN : 0;
  raw.flags |= flags & IT_SMP_BSLOOP ? SampleFlags.SUSTAIN_BIDIR : 0;
  if (flags & IT_SMP_SLOOP) {
    raw.sustainStart = sloopbeg;
    raw.sustainEnd = sloopend;
  }
  if (sampleMode) {
    xxi.volume = 64;
    xxi.sub[0].vol = vol;
    xxi.sub[0].pan = -1;
    xxi.sub[0].sid = i;
    xxi.nsm = length !== 0 ? 1 : 0;
    xxi.name = name;
  } else {
    raw.name = name;
  }
  raw.volume = vol;
  for (const xj of instruments) {
    for (const sub of xj.sub) {
      if (sub.sid === i) {
        sub.vol = vol;
        sub.gvl = Math.min(gvl, 64);
        sub.vra = vis;
        sub.vde = vid << 1;
        sub.vwf = vit;
        sub.vsw = 255 - vir >> 1;
        const { n, f } = c2spdToNote(c5spd);
        sub.xpo = n;
        sub.fin = f;
        if (dfp & 128) {
          sub.pan = (dfp & 127) * 4;
        } else if (sampleMode) {
          sub.pan = -1;
        }
      }
    }
  }
  if (flags & IT_SMP_SAMPLE && raw.length > 1) {
    let cvt = 0;
    if (raw.length > MAX_SAMPLE_SIZE) {
      return -1;
    }
    const dataPos = start + samplePtr;
    if (dataPos >= bytes.length) {
      return 0;
    }
    if (raw.loopEnd > raw.length || raw.loopStart >= raw.loopEnd) {
      raw.flags &= ~SampleFlags.LOOP;
    }
    if (convert === IT_CVT_ADPCM) {
      cvt |= SAMPLE_FLAG_ADPCM;
    }
    if (~(convert & 255) & IT_CVT_SIGNED) {
      cvt |= SAMPLE_FLAG_UNS;
    }
    if (flags & IT_SMP_COMP) {
      const samples = (flags & IT_SMP_STEREO ? raw.length << 1 : raw.length) | 0;
      const fileLen = bytes.length;
      const minSize = samples >> 3;
      const left = fileLen - samplePtr;
      if (left <= 0) {
        return 0;
      }
      if (fileLen > 0 && left < minSize) {
        forceSampleLength(raw, left << 3);
      }
      const srcPos = { pos: dataPos };
      const decbuf = unpackItSample(bytes, srcPos, raw, flags, convert & IT_CVT_DIFF, tmp);
      raw.data = decbuf;
      if (cvt & SAMPLE_FLAG_UNS) raw.flags |= DecodeFlag.UNSIGNED;
      if (cvt & SAMPLE_FLAG_ADPCM) raw.flags |= DecodeFlag.ADPCM;
    } else {
      const is16 = (flags & IT_SMP_16BIT) !== 0;
      const stereo = (flags & IT_SMP_STEREO) !== 0;
      const framelen = (is16 ? 2 : 1) * (stereo ? 2 : 1);
      const bytelen = raw.length * framelen;
      const take = Math.min(bytelen, bytes.length - dataPos);
      raw.data = bytes.subarray(dataPos, dataPos + Math.max(0, take));
      if (cvt & SAMPLE_FLAG_UNS) raw.flags |= DecodeFlag.UNSIGNED;
      if (cvt & SAMPLE_FLAG_ADPCM) raw.flags |= DecodeFlag.ADPCM;
    }
  }
  return p;
}
function xlatFx(c, e, lastFxp, newFx) {
  let h = (e.fxp & 240) >> 4;
  let l = e.fxp & 15;
  e.fxt = fx[e.fxt];
  if (e.fxt === FX_XTND) {
    e.fxt = FX.FX_EXTENDED;
    if (h === 0 && e.fxp === 0) {
      e.fxp = lastFxp[c];
      h = (e.fxp & 240) >> 4;
      l = e.fxp & 15;
    } else {
      lastFxp[c] = e.fxp;
    }
    switch (h) {
      case 1:
        e.fxp = 48 | l;
        break;
      case 2:
        e.fxt = 0;
        e.fxp = 0;
        break;
      case 3:
        e.fxp = 64 | l;
        break;
      case 4:
        e.fxp = 112 | l;
        break;
      case 5:
        if (l <= 3) {
          e.fxt = FX.FX_PANBRELLO_WF;
          e.fxp = l;
        } else {
          e.fxt = 0;
          e.fxp = 0;
        }
        break;
      case 6:
        e.fxp = 224 | l;
        break;
      case 7:
        e.fxt = FX.FX_IT_INSTFUNC;
        e.fxp &= 15;
        break;
      case 8:
        e.fxt = FX.FX_SETPAN;
        e.fxp = l << 4;
        break;
      case 9:
        if (l === 0 || l === 1) {
          e.fxt = FX.FX_SURROUND;
          e.fxp = l;
        } else if (l === 14 || l === 15) {
          e.fxt = FX.FX_REVERSE;
          e.fxp = l - 14;
        }
        break;
      case 10:
        e.fxt = FX.FX_HIOFFSET;
        e.fxp = l;
        break;
      case 11:
        e.fxp = 96 | l;
        break;
      case 12:
      // Note cut
      case 13:
        e.fxp = l;
        if (e.fxp === 0) e.fxp++;
        e.fxp |= h << 4;
        break;
      case 14:
        e.fxt = FX.FX_IT_ROWDELAY;
        e.fxp = l;
        break;
      case 15:
        e.fxt = FX.FX_MACRO_SET;
        e.fxp = l;
        break;
      default:
        e.fxt = 0;
        e.fxp = 0;
    }
    return;
  }
  if (e.fxt === FX.FX_TREMOR) {
    if (!newFx && e.fxp !== 0) {
      e.fxp = (((e.fxp & 240) >> 4) + 1) * 16 | (e.fxp & 15) + 1;
    }
    return;
  }
  if (e.fxt === FX.FX_GLOBALVOL) {
    if (e.fxp > 128) {
      e.fxt = 0;
      e.fxp = 0;
    }
    return;
  }
  if (e.fxt === FX_NONE) {
    e.fxt = 0;
    e.fxp = 0;
  }
}
function xlatVolfx(e) {
  const b = e.vol;
  e.vol = 0;
  if (b <= 64) {
    e.vol = b + 1;
  } else if (b >= 65 && b <= 74) {
    e.f2t = FX.FX_F_VSLIDE_UP_2;
    e.f2p = b - 65;
  } else if (b >= 75 && b <= 84) {
    e.f2t = FX.FX_F_VSLIDE_DN_2;
    e.f2p = b - 75;
  } else if (b >= 85 && b <= 94) {
    e.f2t = FX.FX_VSLIDE_UP_2;
    e.f2p = b - 85;
  } else if (b >= 95 && b <= 104) {
    e.f2t = FX.FX_VSLIDE_DN_2;
    e.f2p = b - 95;
  } else if (b >= 105 && b <= 114) {
    e.f2t = FX.FX_PORTA_DN;
    e.f2p = b - 105 << 2;
  } else if (b >= 115 && b <= 124) {
    e.f2t = FX.FX_PORTA_UP;
    e.f2p = b - 115 << 2;
  } else if (b >= 128 && b <= 192) {
    if (b === 192) {
      e.f2p = 255;
    } else {
      e.f2p = b - 128 << 2;
    }
    e.f2t = FX.FX_SETPAN;
  } else if (b >= 193 && b <= 202) {
    const val = [0, 1, 4, 8, 16, 32, 64, 96, 128, 255];
    e.f2t = FX.FX_TONEPORTA;
    e.f2p = val[b - 193];
  } else if (b >= 203 && b <= 212) {
    e.f2t = FX.FX_VIBRATO;
    e.f2p = b - 203;
  }
}
function loadItPattern(bytes, pos, chn, numRows, tracks, newFx) {
  let patPos = pos;
  const patLen = readmem16l(bytes, patPos);
  patPos += 2;
  patPos += 2 + 4;
  if (patPos + patLen > bytes.length) {
    return;
  }
  const patbuf = bytes.subarray(patPos, patPos + patLen);
  patPos += patLen;
  let ipos = 0;
  const iend = patLen;
  const lastFxp = new Uint8Array(64);
  const lastevent = [];
  for (let c = 0; c < L_CHANNELS; c++) lastevent.push({ ...EMPTY_EVENT });
  const mask = new Uint8Array(L_CHANNELS);
  const dummy = { ...EMPTY_EVENT };
  let r = 0;
  while (r < numRows && ipos < iend) {
    let b = patbuf[ipos++];
    if (b === 0) {
      r++;
      continue;
    }
    const c = b - 1 & 63;
    if (b & 128) {
      if (ipos >= iend) break;
      mask[c] = patbuf[ipos++];
    }
    const event = c >= chn ? dummy : tracks[c].event[r];
    if ((mask[c] & 15) === 0) {
    } else {
      if (mask[c] & 1) {
        if (ipos >= iend) break;
        b = patbuf[ipos++];
        if (b === 255) {
          b = XMP_KEY_OFF;
        } else if (b === 254) {
          b = XMP_KEY_CUT;
        } else if (b > 119) {
          b = XMP_KEY_FADE;
        } else {
          b = b + 1;
        }
        lastevent[c].note = event.note = b;
      }
      if (mask[c] & 2) {
        if (ipos >= iend) break;
        b = patbuf[ipos++];
        lastevent[c].ins = event.ins = b;
      }
      if (mask[c] & 4) {
        if (ipos >= iend) break;
        b = patbuf[ipos++];
        lastevent[c].vol = event.vol = b;
        xlatVolfx(event);
      }
      if (mask[c] & 8) {
        if (ipos >= iend - 1) break;
        b = patbuf[ipos++];
        if (b >= fx.length) {
          ipos++;
        } else {
          event.fxt = b;
          event.fxp = patbuf[ipos++];
          xlatFx(c, event, lastFxp, newFx);
          lastevent[c].fxt = event.fxt;
          lastevent[c].fxp = event.fxp;
        }
      }
    }
    if ((mask[c] & 240) !== 0) {
      if (mask[c] & 16) {
        event.note = lastevent[c].note;
      }
      if (mask[c] & 32) {
        event.ins = lastevent[c].ins;
      }
      if (mask[c] & 64) {
        event.vol = lastevent[c].vol;
        xlatVolfx(event);
      }
      if (mask[c] & 128) {
        event.fxt = lastevent[c].fxt;
        event.fxp = lastevent[c].fxp;
      }
    }
  }
}
function itLoad(bytes, ctx) {
  const start = 0;
  if (bytes.length < 192) fail("file too short");
  if (readmem32b(bytes, 0) !== MAGIC_IMPM) fail("bad magic");
  const nameBuf = bytes.slice(4, 30);
  fixName(nameBuf, 26);
  let name = "";
  for (let i = 0; i < 26 && i < nameBuf.length; i++) {
    const c = nameBuf[i];
    if (c === 0) break;
    name += String.fromCharCode(c);
  }
  name = name.replace(/ +$/, "");
  const ifh = {
    name: nameBuf,
    hiliteMin: bytes[30],
    hiliteMaj: bytes[31],
    ordnum: readmem16l(bytes, 32),
    insnum: readmem16l(bytes, 34),
    smpnum: readmem16l(bytes, 36),
    patnum: readmem16l(bytes, 38),
    cwt: readmem16l(bytes, 40),
    cmwt: readmem16l(bytes, 42),
    flags: readmem16l(bytes, 44),
    special: readmem16l(bytes, 46),
    gv: bytes[48],
    mv: bytes[49],
    is: bytes[50],
    it: bytes[51],
    sep: bytes[52],
    pwd: bytes[53],
    msglen: readmem16l(bytes, 54),
    msgofs: readmem32l(bytes, 56),
    rsvd: readmem32l(bytes, 60),
    chpan: bytes.slice(64, 128),
    chvol: bytes.slice(128, 192)
  };
  if (ifh.gv > 128) fail("invalid global volume");
  if (ifh.insnum > 255 || ifh.smpnum > 255 || ifh.patnum > 255) {
    fail("too many instruments or patterns");
  }
  const sampleMode = (~ifh.flags & IT_USE_INST) !== 0;
  let cmwt = ifh.cmwt;
  const mod = {
    title: name,
    format: "it",
    comment: "",
    chn: L_CHANNELS,
    pat: ifh.patnum,
    ins: ifh.insnum,
    // C: mod->ins = ifh.insnum first (it_load.c:1213);
    // sample mode rewrites mod->ins = mod->smp AFTER identify_tracker.
    len: ifh.ordnum > XMP_MAX_MOD_LENGTH ? XMP_MAX_MOD_LENGTH : ifh.ordnum,
    restart: 0,
    xxo: [],
    channels: [],
    patterns: [],
    instruments: [],
    samples: [],
    num_sequences: 0,
    sequences: [],
    speed: ifh.is,
    bpm: ifh.it,
    volbase: 64,
    // load_helpers.c:303 default; IT never overrides
    gvolbase: 128,
    gvol: ifh.gv,
    quirks: QUIRKS_IT,
    flowMode: FLOW_MODE_IT_210,
    // set by identify_tracker below (C :351)
    readEventType: ReadEventType.IT,
    periodType: PeriodType.AMIGA,
    defpan: 128,
    time_factor: 10,
    rrate: 250,
    c4rate: C4_NTSC_RATE,
    tracker: ""
    // set by identify_tracker below
  };
  if (ifh.flags & IT_LINEAR_FREQ) {
    mod.periodType = PeriodType.LINEAR;
  }
  {
    let op = start + 192;
    if (op + mod.len > bytes.length) fail("read error on orders");
    for (let i = 0; i < mod.len; i++) {
      mod.xxo.push(bytes[op + i]);
    }
  }
  const opos = start + 192 + (ifh.ordnum > XMP_MAX_MOD_LENGTH ? ifh.ordnum : mod.len);
  for (let i = 0; i < L_CHANNELS; i++) {
    const pan = ifh.chpan[i] & 127;
    let flg = 0;
    if (pan === 100) {
      flg |= ChannelFlags.SURROUND;
    }
    if (ifh.chpan[i] & 128) {
      flg |= ChannelFlags.MUTE;
    }
    let p = pan;
    if (ifh.flags & IT_STEREO) {
      p = pan * 128 >> 5;
      if (p > 255) p = 255;
    } else {
      p = 128;
    }
    mod.channels.push({ pan: p, vol: ifh.chvol[i], flg });
  }
  const ppIns = [];
  const ppSmp = [];
  const ppPat = [];
  let ptr = opos;
  for (let i = 0; i < ifh.insnum; i++) {
    if (ptr + 4 > bytes.length) fail("read instrument offsets");
    ppIns.push(readmem32l(bytes, ptr));
    ptr += 4;
  }
  for (let i = 0; i < ifh.smpnum; i++) {
    if (ptr + 4 > bytes.length) fail("read sample offsets");
    ppSmp.push(readmem32l(bytes, ptr));
    ptr += 4;
  }
  for (let i = 0; i < ifh.patnum; i++) {
    if (ptr + 4 > bytes.length) fail("read pattern offsets");
    ppPat.push(readmem32l(bytes, ptr));
    ptr += 4;
  }
  if (ifh.special & IT_EDIT_HISTORY) {
    if (ptr + 2 > bytes.length) fail("read edit history");
    const skip = readmem16l(bytes, ptr) * 8;
    ptr += 2 + skip;
  }
  let midiCfg = null;
  if (ifh.flags & IT_MIDI_CONFIG || ifh.special & IT_SPEC_MIDICFG) {
    const res = loadItMidiConfig(bytes, ptr);
    if (!res) fail("read MIDI config");
    midiCfg = res.midi;
    ptr = res.end;
  }
  const numRows = [];
  for (let i = 0; i < ifh.patnum; i++) {
    if (ppPat[i] + 4 > bytes.length) {
      numRows.push(64);
      continue;
    }
    const patLen = readmem16l(bytes, ppPat[i]);
    const num = readmem16l(bytes, ppPat[i] + 2);
    if (num > 1024) {
      numRows.push(0);
      continue;
    }
    numRows.push(num);
    void patLen;
  }
  const patBeforeSmp = ifh.smpnum !== 0 && ifh.patnum !== 0 && ppPat[0] !== 0 && ppPat[0] < ppSmp[0];
  const id = identifyTracker(ifh, patBeforeSmp, sampleMode);
  mod.tracker = id.tracker;
  mod.flowMode = id.flowMode;
  cmwt = id.cmwt;
  if (sampleMode) mod.ins = ifh.smpnum;
  return finalizeIt(
    mod,
    ifh,
    bytes,
    ctx,
    sampleMode,
    cmwt,
    id.isMpt116,
    ppIns,
    ppSmp,
    ppPat,
    numRows,
    midiCfg,
    start
  );
}
function finalizeIt(mod, ifh, bytes, ctx, sampleMode, cmwt, isMpt116, ppIns, ppSmp, ppPat, numRows, midiCfg, start) {
  const newFx = (ifh.flags & IT_OLD_FX) === 0;
  const tracks = [];
  const tmp = new Uint8Array(TEMP_BUFFER_LEN);
  let maxCh = 0;
  for (let i = 0; i < ifh.patnum; i++) {
    if (ppPat[i] === 0) continue;
    if (numRows[i] === void 0) continue;
    const pos0 = start + ppPat[i];
    const patLen = readmem16l(bytes, pos0);
    const scan = bytes.subarray(pos0 + 8, pos0 + 8 + patLen);
    if (scan.length < patLen) fail("error scanning pattern");
    const mask = new Uint8Array(L_CHANNELS);
    let ipos = 0;
    const iend = patLen;
    let row = 0;
    while (row < numRows[i] && ipos < iend) {
      const b = scan[ipos++];
      if (b === 0) {
        row++;
        continue;
      }
      const c = b - 1 & 63;
      if (c > maxCh) maxCh = c;
      if (b & 128) {
        if (ipos >= iend) break;
        mask[c] = scan[ipos++] & 15;
      }
      ipos += bytesInPackedEvent[mask[c]];
    }
  }
  const chn = maxCh + 1;
  mod.chn = chn;
  for (let i = 0; i < ifh.patnum; i++) {
    const rows = numRows[i] === void 0 ? 64 : numRows[i];
    if (ppPat[i] === 0 || numRows[i] === void 0) {
      const t2 = [];
      for (let j = 0; j < chn; j++) {
        const ev = [];
        for (let r = 0; r < 64; r++) ev.push({ ...EMPTY_EVENT });
        t2.push({ rows: 64, event: ev });
      }
      tracks.push(t2);
      continue;
    }
    const t = [];
    for (let j = 0; j < chn; j++) {
      const ev = [];
      for (let r = 0; r < rows; r++) ev.push({ ...EMPTY_EVENT });
      t.push({ rows, event: ev });
    }
    tracks.push(t);
  }
  for (let i = 0; i < ifh.patnum; i++) {
    if (ppPat[i] === 0 || numRows[i] === void 0) continue;
    const rows = numRows[i];
    loadItPattern(bytes, start + ppPat[i], chn, rows, tracks[i], newFx);
  }
  const instruments = [];
  for (let i = 0; i < mod.ins; i++) {
    const ins = zeroInstrument();
    instruments.push(ins);
  }
  const raws = [];
  if (!sampleMode && cmwt >= 512) {
    for (let i = 0; i < ifh.insnum; i++) {
      if (ppIns[i] === 0) continue;
      const res = loadNewItInstrument(bytes, start + ppIns[i]);
      if (!res) continue;
      instruments[i] = res.ins;
    }
  } else if (!sampleMode) {
    for (let i = 0; i < ifh.insnum; i++) {
      if (ppIns[i] === 0) continue;
      const res = loadOldItInstrument(bytes, start + ppIns[i]);
      if (!res) continue;
      instruments[i] = res.ins;
    }
  }
  for (let i = 0; i < ifh.smpnum; i++) {
    const raw = {
      data: new Uint8Array(0),
      length: 0,
      loopStart: 0,
      loopEnd: 0,
      sustainStart: 0,
      sustainEnd: 0,
      finetune: 0,
      volume: 0,
      flags: 0
    };
    raws.push(raw);
    if (loadItSample(
      bytes,
      start + ppSmp[i],
      raws[i],
      i,
      start,
      sampleMode,
      instruments[i],
      instruments,
      tmp
    ) < 0) {
      fail(`error loading sample ${i}`);
    }
    ctx.addSample(raws[i]);
  }
  let comment;
  if (ifh.special & IT_HAS_MSG && ifh.msglen > 0) {
    const mp = start + ifh.msgofs;
    const avail = Math.max(0, bytes.length - mp);
    const take = Math.min(ifh.msglen, avail);
    if (take > 0) {
      let s = "";
      for (let j = 0; j + 1 < take; j++) {
        let b = bytes[mp + j];
        if (b === 13) {
          b = 10;
        } else if ((b < 32 || b > 127) && b !== 10 && b !== 9) {
          b = 46;
        }
        s += String.fromCharCode(b);
      }
      comment = s;
    }
  }
  mod.comment = comment ?? "";
  mod.quirks |= Quirk.ARPMEM | Quirk.INSVOL;
  if (ifh.flags & IT_LINK_GXX) {
    mod.quirks |= Quirk.PRENV;
  } else {
    mod.quirks |= Quirk.UNISLD;
  }
  mod.instruments = instruments;
  mod.samples = raws;
  if (newFx) {
    mod.quirks |= Quirk.VIBHALF | Quirk.VIBINV;
  } else {
    mod.quirks &= ~Quirk.VIBALL;
    mod.quirks |= Quirk.ITOLDFX;
  }
  if (sampleMode) {
    mod.quirks &= ~(Quirk.VIRTUAL | Quirk.RSTCHN);
  }
  mod.gvolbase = 128;
  mod.gvol = ifh.gv;
  mod.mvolbase = 48;
  mod.mvol = ifh.mv;
  mod.readEventType = ReadEventType.IT;
  mod.midi = midiCfg ?? void 0;
  if (isMpt116) {
    applyMptPreamp(mod);
  }
  mod.patterns = [];
  for (let i = 0; i < ifh.patnum; i++) {
    const rows = numRows[i] === void 0 || numRows[i] === 0 ? 64 : numRows[i];
    mod.patterns.push({ rows, tracks: tracks[i] });
  }
  return mod;
}
var plugin = {
  name: "it",
  test: itTest,
  load: itLoad,
  readEvent(core, chn, row) {
    const mod = core.module;
    const xc = core.ctx.channelStates[chn];
    const e = core.readEventScratch(chn) ?? core.readEventAt(mod.xxo[core.ctx.p.ord] ?? 0, chn, row);
    if (e.ins !== 0) xc.old_ins = e.ins;
    if (TEST_NOTE(xc, NoteFlag.SAMPLE_END) !== 0) {
      SET_NOTE(xc, NoteFlag.END);
    }
    readEventIt(core, e, chn);
  }
};

// ../../packages/fmt-it/src/itWrite.ts
var MAGIC = "IMPM";
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
  /** Overwrite a u32le at an absolute offset (patching pointers). */
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
var ASCII = (name) => {
  const out = (name ?? "").replace(/[^\x20-\x7e]/g, " ");
  return out.slice(0, 26);
};
function packPattern(pat, chn) {
  const w = new ByteWriter();
  const last = Array.from({ length: chn }, () => ({ note: 0, ins: 0, vol: 0, fxt: 0, fxp: 0 }));
  for (let r = 0; r < pat.rows; r++) {
    for (let c = 0; c < chn; c++) {
      const e = pat.tracks[c]?.event[r] ?? { note: 0, ins: 0, vol: 0, fxt: 0, fxp: 0, f2t: 0, f2p: 0 };
      let mask = 0;
      const fields = [];
      const noteChanged = e.note !== last[c].note;
      const insChanged = e.ins !== last[c].ins;
      if (noteChanged || insChanged) mask |= 1 | 2;
      if (e.vol > 0) mask |= 4;
      if (e.fxt || e.fxp) mask |= 8;
      if (mask & 1) fields.push(e.note - 1 & 127);
      if (mask & 2) fields.push(e.ins & 255);
      if (mask & 4) fields.push(Math.min(64, e.vol));
      if (mask & 8) {
        fields.push(e.fxt & 255);
        fields.push(e.fxp & 255);
      }
      if (mask === 0) continue;
      w.u8(128 | c + 1 & 63);
      w.u8(mask);
      for (const f of fields) w.u8(f);
      last[c].note = e.note;
      last[c].ins = e.ins;
      last[c].vol = e.vol;
      last[c].fxt = e.fxt;
      last[c].fxp = e.fxp;
    }
    w.u8(0);
  }
  w.u8(0);
  return w.bytes_;
}
var writeIt = (mod) => {
  const w = new ByteWriter();
  const ordnum = Math.max(1, mod.len);
  const insnum = mod.ins;
  const smpnum = mod.samples.length;
  const patnum = mod.pat;
  w.ascii(MAGIC, 4);
  w.ascii(ASCII(mod.title), 26);
  w.u8(0);
  w.u8(0);
  w.u16le(ordnum);
  w.u16le(insnum);
  w.u16le(smpnum);
  w.u16le(patnum);
  w.u16le(532);
  w.u16le(532);
  w.u16le(1);
  w.u16le(0);
  w.u8(mod.gvol & 127);
  w.u8(128);
  w.u8(0);
  w.u8(mod.bpm & 255);
  w.u8(128);
  w.u8(0);
  w.u16le(0);
  w.u32le(0);
  w.u32le(0);
  for (let i = 0; i < 64; i++) {
    w.u8(i < mod.chn ? (mod.channels[i]?.pan ?? 128) & 127 | 128 : 128);
  }
  for (let i = 0; i < 64; i++) {
    w.u8(i < mod.chn ? Math.min(64, (mod.channels[i]?.vol ?? 64) * 2) : 0);
  }
  for (let i = 0; i < ordnum; i++) {
    w.u8(mod.xxo[i] ?? 0);
  }
  const insOffPos = w.bytes_.length;
  for (let i = 0; i < insnum; i++) w.u32le(0);
  const smpOffPos = w.bytes_.length;
  for (let i = 0; i < smpnum; i++) w.u32le(0);
  const patOffPos = w.bytes_.length;
  for (let i = 0; i < patnum; i++) w.u32le(0);
  const patOffsets = [];
  for (let p = 0; p < patnum; p++) {
    while (w.bytes_.length % 4 !== 0) w.zeros(1);
    patOffsets.push(w.bytes_.length);
    const packed = packPattern(mod.patterns[p], mod.chn);
    w.u16le(packed.length + 8);
    w.u16le(mod.patterns[p].rows);
    w.u16le(0);
    w.u16le(0);
    w.bytes(packed);
  }
  const insOffsets = [];
  for (let i = 0; i < insnum; i++) {
    while (w.bytes_.length % 4 !== 0) w.zeros(1);
    insOffsets.push(w.bytes_.length);
    const ins = mod.instruments[i];
    w.ascii(ASCII(ins.name), 26);
    w.zeros(1);
    w.u8(0);
    const sub0 = ins.sub[0];
    w.u8(sub0?.nna ?? 0);
    w.u8(sub0?.dct ?? 0);
    w.u8(sub0?.dca ?? 0);
    w.u16le(Math.min(32767, Math.max(0, Math.round((ins.rls ?? 0) * 0.666))));
    w.u8(64);
    w.u8(0);
    w.u8(0);
    w.u8(0);
    w.u32le(0);
    w.zeros(2);
    for (let k = 0; k < 120; k++) {
      const sub = ins.sub[ins.map[k] ?? 0];
      w.u8(sub ? sub.sid + 1 & 255 : 0);
    }
    w.zeros(1);
    w.zeros(1);
    w.zeros(2 + 2);
    w.zeros(4);
    w.zeros(1);
    w.zeros(1);
    w.zeros(2 + 2);
    w.zeros(4);
    w.zeros(1);
    w.zeros(1);
    w.zeros(2 + 2);
    w.zeros(4);
    w.zeros(4);
    w.zeros(2);
  }
  const smpOffsets = [];
  for (let i = 0; i < smpnum; i++) {
    while (w.bytes_.length % 4 !== 0) w.zeros(1);
    smpOffsets.push(w.bytes_.length);
    const s = mod.samples[i];
    const looped = s.loopEnd > s.loopStart;
    w.ascii("IMPS", 4);
    w.ascii(ASCII(s.name).slice(0, 12), 13);
    w.u8(64);
    w.u8((looped ? 16 : 0) | 1);
    w.u8(Math.min(64, s.volume));
    w.ascii(ASCII(s.name), 26);
    w.u8(0);
    w.u8(128);
    w.u32le(s.length);
    w.u32le(looped ? s.loopStart : 0);
    w.u32le(looped ? s.loopEnd : 0);
    w.u32le(s.c5spd ?? 8363);
    w.u32le(0);
    w.u32le(0);
    const dataOffPos = w.bytes_.length;
    w.u32le(0);
    w.zeros(8);
    w.patchU32le(dataOffPos, w.bytes_.length);
    w.bytes(s.data);
  }
  for (let i = 0; i < insnum; i++) w.patchU32le(insOffPos + i * 4, insOffsets[i]);
  for (let i = 0; i < smpnum; i++) w.patchU32le(smpOffPos + i * 4, smpOffsets[i]);
  for (let i = 0; i < patnum; i++) w.patchU32le(patOffPos + i * 4, patOffsets[i]);
  return w.bytes_;
};
var itExportPlugin = () => ({
  name: "it",
  label: "Impulse Tracker (.it)",
  extension: "it",
  supports: (mod) => mod.format === "it",
  write: writeIt
});
export {
  applyMptPreamp,
  itExportPlugin,
  itLoad,
  itTest,
  plugin
};

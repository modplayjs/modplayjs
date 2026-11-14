// packages/fmt-mid/src/tml.ts
var TML_NOTE_OFF = 128;
var TML_NOTE_ON = 144;
var TML_KEY_PRESSURE = 160;
var TML_CONTROL_CHANGE = 176;
var TML_PROGRAM_CHANGE = 192;
var TML_CHANNEL_PRESSURE = 208;
var TML_PITCH_BEND = 224;
var TML_SET_TEMPO = 81;
var TML_EOT = 47;
var TML_SYSEX = 240;
var TML_EOX = 247;
var TmlMessage = class {
  /** Time of the message in milliseconds. */
  time = 0;
  /** Type (see TMLMessageType) and channel number. */
  type = 0;
  channel = 0;
  /** key / control / program / channel_pressure (C union first byte). */
  key = 0;
  /** velocity / key_pressure / control_value (C union second byte). */
  velocity = 0;
  /** TML_PITCH_BEND value 0..16383 (C unsigned-short union member). */
  pitch_bend = 0;
  /** TML_SET_TEMPO only: raw 3-byte tempo (tml_tempomsg overlay). */
  tempo = [0, 0, 0];
  /** The pointer to the next message in time following this event. */
  next = null;
};
var TmlParser = class {
  buf = 0;
  buf_end = 0;
  last_status = 0;
  message_array_size = 0;
  message_count = 0;
};
function tml_readbyte(p, mem) {
  return p.buf === p.buf_end ? -1 : mem[p.buf++];
}
function tml_readvariablelength(p, mem) {
  let res = 0, i = 0;
  for (; i !== 4; i++) {
    if (p.buf === p.buf_end) return -1;
    const c = mem[p.buf++];
    if (c & 128) res = (res | c & 127) << 7;
    else return res | c;
  }
  return -1;
}
function tml_parsemessage(messages, p, mem) {
  let deltatime = tml_readvariablelength(p, mem);
  let status = tml_readbyte(p, mem);
  let evt;
  if (deltatime & 4293918720) deltatime = 0;
  if (status < 0) return -1;
  if ((status & 128) === 0) {
    if ((p.last_status & 128) === 0) return -1;
    p.buf--;
    status = p.last_status;
  } else p.last_status = status;
  if (p.message_array_size === p.message_count) {
    p.message_array_size += p.message_array_size === 0 ? 64 : p.message_array_size > 4096 ? 1024 : p.message_array_size;
    if (p.message_array_size < p.message_count + 1) return -1;
  }
  evt = new TmlMessage();
  if (status === TML_SYSEX || status === TML_EOX) {
    const sysexlen = tml_readvariablelength(p, mem);
    p.buf += sysexlen;
    if (p.buf > p.buf_end) {
      p.buf = p.buf_end;
      return -1;
    }
    evt.type = 0;
  } else if (status === 255) {
    const meta_type = tml_readbyte(p, mem);
    const buflen = tml_readvariablelength(p, mem);
    const metadata = p.buf;
    if (meta_type < 0) return -1;
    if (buflen > 0 && (p.buf += buflen) > p.buf_end) {
      p.buf = p.buf_end;
      return -1;
    }
    switch (meta_type) {
      case TML_EOT:
        if (buflen !== 0) return -1;
        if (!deltatime) return TML_EOT;
        evt.type = TML_EOT;
        break;
      case TML_SET_TEMPO:
        if (buflen !== 3) return -1;
        evt.type = TML_SET_TEMPO;
        evt.tempo[0] = mem[metadata];
        evt.tempo[1] = mem[metadata + 1];
        evt.tempo[2] = mem[metadata + 2];
        break;
      default:
        evt.type = 0;
    }
  } else {
    const param = tml_readbyte(p, mem);
    if (param < 0) return -1;
    evt.key = param & 127;
    evt.channel = status & 15;
    switch (evt.type = status & 240) {
      case TML_NOTE_OFF:
      case TML_NOTE_ON:
      case TML_KEY_PRESSURE:
      case TML_CONTROL_CHANGE: {
        const param2 = tml_readbyte(p, mem);
        if (param2 < 0) return -1;
        evt.velocity = param2 & 127;
        break;
      }
      case TML_PITCH_BEND: {
        const param2 = tml_readbyte(p, mem);
        if (param2 < 0) return -1;
        evt.pitch_bend = (param2 & 127) << 7 | evt.key;
        break;
      }
      case TML_PROGRAM_CHANGE:
      case TML_CHANNEL_PRESSURE:
        evt.velocity = 0;
        break;
      default:
        evt.type = 0;
        break;
    }
  }
  if (deltatime || evt.type) {
    evt.time = deltatime;
    messages[p.message_count] = evt;
    p.message_count++;
  }
  return evt.type;
}
function tml_load_stream(read) {
  let num_tracks, division, trackbufsize = 0;
  let trackbuf = null;
  const messages = [];
  const p = new TmlParser();
  const midi_header = new Uint8Array(14);
  if (read(midi_header, 14) !== 14) return messages.length ? messages[0] : null;
  if (midi_header[0] !== 77 || midi_header[1] !== 84 || midi_header[2] !== 104 || midi_header[3] !== 100 || midi_header[7] !== 6 || midi_header[9] > 2) {
    return messages.length ? messages[0] : null;
  }
  if (midi_header[12] & 128) return messages.length ? messages[0] : null;
  num_tracks = midi_header[10] << 8 | midi_header[11];
  division = midi_header[12] << 8 | midi_header[13];
  if (num_tracks <= 0 && division <= 0) return messages.length ? messages[0] : null;
  const tracks = [];
  for (let i = 0; i !== num_tracks; i++) tracks.push({ Idx: 0, End: 0, Ticks: 0 });
  const tracksEnd = num_tracks;
  for (let ti = 0; ti !== tracksEnd; ti++) {
    const t = tracks[ti];
    const track_header = new Uint8Array(8);
    if (read(track_header, 8) !== 8) break;
    if (track_header[0] !== 77 || track_header[1] !== 84 || track_header[2] !== 114 || track_header[3] !== 107)
      break;
    const track_length = track_header[7] | track_header[6] << 8 | track_header[5] << 16 | track_header[4] << 24;
    if (track_length < 0) break;
    if (trackbufsize < track_length) {
      trackbuf = new Uint8Array(trackbufsize = track_length);
    }
    if (read(trackbuf, track_length) !== track_length) break;
    t.Idx = p.message_count;
    p.buf = 0;
    p.buf_end = track_length;
    for (; p.buf !== p.buf_end; ) {
      const type = tml_parsemessage(messages, p, trackbuf);
      if (type === TML_EOT || type < 0) break;
    }
    t.End = p.message_count;
  }
  if (p.message_count) {
    let PrevMessage = null;
    let ticks = 0, tempo_ticks = 0;
    let msec = 0, tempo_msec = 0;
    let ticks2time = 5e5 / (1e3 * division);
    for (let step_smallest = 0; step_smallest !== 2147483647; ticks += step_smallest) {
      step_smallest = 2147483647;
      msec = tempo_msec + Math.trunc((ticks - tempo_ticks) * ticks2time);
      for (let ti = 0; ti !== tracksEnd; ti++) {
        const t = tracks[ti];
        if (t.Idx === t.End) continue;
        let j = t.Idx;
        const jEnd = t.End;
        for (; j !== jEnd && t.Ticks + messages[j].time === ticks; j++, t.Idx++) {
          const Msg = messages[j];
          t.Ticks += Msg.time;
          if (Msg.type === TML_SET_TEMPO) {
            const Tempo = Msg.tempo;
            ticks2time = (Tempo[0] << 16 | Tempo[1] << 8 | Tempo[2]) / (1e3 * division);
            tempo_msec = msec;
            tempo_ticks = ticks;
          }
          if (Msg.type) {
            Msg.time = msec;
            if (PrevMessage) {
              PrevMessage.next = Msg;
              PrevMessage = Msg;
            } else {
              const Swap = messages[j];
              messages[j] = messages[0];
              messages[0] = Swap;
              PrevMessage = messages[0];
            }
          }
        }
        if (j !== jEnd && t.Ticks + messages[j].time > ticks) {
          const step = Math.trunc(t.Ticks + messages[j].time - ticks);
          if (step < step_smallest) step_smallest = step;
        }
      }
    }
    if (PrevMessage) PrevMessage.next = null;
    else p.message_count = 0;
  }
  if (p.message_count === 0) return null;
  return messages[0];
}
function tml_load_memory(buffer) {
  const total = buffer.length;
  let pos = 0;
  return tml_load_stream((ptr, size) => {
    if (size > total - pos) size = total - pos;
    ptr.set(buffer.subarray(pos, pos + size));
    pos += size;
    return size;
  });
}
function tml_get_info(Msg, out) {
  let used_programs = 0, used_channels = 0, total_notes = 0;
  let time_first_note = 4294967295, time_length = 0;
  const channels = new Uint8Array(16);
  const programs = new Uint8Array(128);
  for (; Msg; Msg = Msg.next) {
    time_length = Msg.time;
    if (Msg.type === TML_PROGRAM_CHANGE && !programs[Msg.key]) {
      programs[Msg.key] = 1;
      used_programs++;
    }
    if (Msg.type !== TML_NOTE_ON) continue;
    if (time_first_note === 4294967295) time_first_note = time_length;
    if (!channels[Msg.channel]) {
      channels[Msg.channel] = 1;
      used_channels++;
    }
    total_notes++;
  }
  if (time_first_note === 4294967295) time_first_note = 0;
  if (out) {
    out.used_channels = used_channels;
    out.used_programs = used_programs;
    out.total_notes = total_notes;
    out.time_first_note = time_first_note;
    out.time_length = time_length;
  }
  return total_notes;
}
function tml_get_tempo_value(msg) {
  if (!msg || msg.type !== TML_SET_TEMPO) return 0;
  const Tempo = msg.tempo;
  return Tempo[0] << 16 | Tempo[1] << 8 | Tempo[2];
}

// packages/fmt-mid/src/refmath.ts
function rm_dd_make(hi, lo) {
  return { hi, lo };
}
function rm_dd_neg(a) {
  return rm_dd_make(-a.hi, -a.lo);
}
function rm_two_sum(a, b) {
  const s = a + b;
  const bb = s - a;
  const e = a - (s - bb) + (b - bb);
  return rm_dd_make(s, e);
}
function rm_two_prod(a, b) {
  const SPLIT = 134217729;
  const ta = SPLIT * a, tb = SPLIT * b;
  const ahi = ta - (ta - a), alo = a - ahi;
  const bhi = tb - (tb - b), blo = b - bhi;
  const p = a * b;
  const e = ahi * bhi - p + ahi * blo + alo * bhi + alo * blo;
  return rm_dd_make(p, e);
}
function rm_dd_add(a, b) {
  const t = rm_two_sum(a.hi, b.hi);
  const e = t.lo + (a.lo + b.lo);
  return rm_two_sum(t.hi, e);
}
function rm_dd_mul(a, b) {
  const t = rm_two_prod(a.hi, b.hi);
  const e = t.lo + (a.hi * b.lo + a.lo * b.hi);
  return rm_two_sum(t.hi, e);
}
function rm_dd_div(a, b) {
  const q1 = a.hi / b.hi;
  let r = rm_dd_add(a, rm_dd_neg(rm_dd_mul(rm_dd_make(q1, 0), b)));
  const q2 = r.hi / b.hi;
  let q = rm_dd_add(rm_dd_make(q1, 0), rm_dd_make(q2, 0));
  r = rm_dd_add(a, rm_dd_neg(rm_dd_mul(q, b)));
  const q3 = r.hi / b.hi;
  return rm_dd_add(q, rm_dd_make(q3, 0));
}
var RM_POW2 = [];
{
  let v = 1;
  for (let k = 0; k <= 1023; k++) {
    RM_POW2[k] = v;
    v *= 2;
  }
}
function rm_dd_scalbn(a, k) {
  return rm_dd_make(rm_scalbn(a.hi, k), rm_scalbn(a.lo, k));
}
function rm_scalbn(x, k) {
  if (x === 0 || !Number.isFinite(x)) return x;
  if (k > 0) {
    while (k > 1023) {
      x *= RM_POW2[1023];
      k -= 1023;
    }
    return x * RM_POW2[k];
  }
  while (k < -1023) {
    x /= RM_POW2[1023];
    k += 1023;
  }
  return x / RM_POW2[-k];
}
function rm_rint(x) {
  const f = Math.floor(x), d = x - f;
  if (d > 0.5) return f + 1;
  if (d < 0.5) return f;
  return f - 2 * Math.floor(f / 2) === 0 ? f : f + 1;
}
var RM_LN2 = rm_dd_make(0.6931471805599453, 23190468138462996e-33);
var RM_PI_2 = rm_dd_make(1.5707963267948966, 6123233995736766e-32);
function rm_exp_dd(x) {
  const k = rm_rint(x.hi / RM_LN2.hi);
  const r = rm_dd_add(x, rm_dd_mul(rm_dd_make(-k, 0), RM_LN2));
  let sum = rm_dd_make(1, 0), term = rm_dd_make(1, 0);
  for (let n = 1; n <= 25; n++) {
    term = rm_dd_div(rm_dd_mul(term, r), rm_dd_make(n, 0));
    sum = rm_dd_add(sum, term);
    if (n > 8 && term.hi < 2465190328815662e-47 && term.hi > -2465190328815662e-47) break;
  }
  return rm_dd_scalbn(sum, k);
}
function rm_log_dd(x) {
  let m = x.hi;
  let e = 0;
  while (m >= 1) {
    m *= 0.5;
    e++;
  }
  while (m < 0.5) {
    m *= 2;
    e--;
  }
  const mx = rm_dd_scalbn(x, -e);
  const z = rm_dd_div(rm_dd_add(mx, rm_dd_make(-1, 0)), rm_dd_add(mx, rm_dd_make(1, 0)));
  const z2 = rm_dd_mul(z, z);
  let term = z, sum = z;
  for (let n = 1; n <= 40; n++) {
    term = rm_dd_mul(term, z2);
    sum = rm_dd_add(sum, rm_dd_div(term, rm_dd_make(2 * n + 1, 0)));
    if (term.hi < 2465190328815662e-47 && term.hi > -2465190328815662e-47) break;
  }
  return rm_dd_add(rm_dd_mul(rm_dd_make(e, 0), RM_LN2), rm_dd_scalbn(sum, 1));
}
function rm_sin_dd(x) {
  const x2 = rm_dd_mul(x, x);
  let term = x, sum = x;
  for (let n = 1; n <= 30; n++) {
    term = rm_dd_div(rm_dd_mul(term, x2), rm_dd_make(2 * n * (2 * n + 1), 0));
    sum = n & 1 ? rm_dd_add(sum, rm_dd_neg(term)) : rm_dd_add(sum, term);
    if (n > 8 && term.hi < 2465190328815662e-47 && term.hi > -2465190328815662e-47) break;
  }
  return sum;
}
function rm_cos_dd(x) {
  const x2 = rm_dd_mul(x, x);
  let term = rm_dd_make(1, 0), sum = rm_dd_make(1, 0);
  for (let n = 1; n <= 30; n++) {
    term = rm_dd_div(rm_dd_mul(term, x2), rm_dd_make((2 * n - 1) * (2 * n), 0));
    sum = n & 1 ? rm_dd_add(sum, rm_dd_neg(term)) : rm_dd_add(sum, term);
    if (n > 8 && term.hi < 2465190328815662e-47 && term.hi > -2465190328815662e-47) break;
  }
  return sum;
}
function rm_tan_dd(x) {
  const n = rm_rint(x.hi / RM_PI_2.hi);
  const r = rm_dd_add(x, rm_dd_mul(rm_dd_make(-n, 0), RM_PI_2));
  const t = rm_dd_div(rm_sin_dd(r), rm_cos_dd(r));
  const q = n - 2 * Math.floor(n / 2);
  if (q === 0) return t;
  return rm_dd_div(rm_dd_make(1, 0), rm_dd_neg(t));
}
function rm_exp(x) {
  return rm_exp_dd(rm_dd_make(x, 0)).hi;
}
function rm_log(x) {
  return rm_log_dd(rm_dd_make(x, 0)).hi;
}
function rm_tan(x) {
  return rm_tan_dd(rm_dd_make(x, 0)).hi;
}
function rm_log10(x) {
  const l10 = rm_log_dd(rm_dd_make(10, 0));
  return rm_dd_div(rm_log_dd(rm_dd_make(x, 0)), l10).hi;
}
function rm_pow(x, y) {
  if (y === 0) return 1;
  if (x === 1) return 1;
  if (x === 0) return y > 0 ? 0 : Infinity;
  if (x < 0) {
    const yi = rm_rint(y);
    if (yi !== y) return NaN;
    const p = rm_exp_dd(rm_dd_mul(rm_dd_make(y, 0), rm_log_dd(rm_dd_make(-x, 0)))).hi;
    const parity = yi - 2 * Math.floor(yi / 2);
    return parity === 0 ? p : -p;
  }
  return rm_exp_dd(rm_dd_mul(rm_dd_make(y, 0), rm_log_dd(rm_dd_make(x, 0)))).hi;
}
function rm_powf(x, y) {
  return f32(rm_pow(x, y));
}
function rm_expf(x) {
  return f32(rm_exp(x));
}
var f32 = Math.fround;

// packages/fmt-mid/src/tsf.ts
var f322 = Math.fround;
var TSF_RENDER_EFFECTSAMPLEBLOCK = 64;
var TSF_RENDER_SHORTBUFFERBLOCK = 512;
var TSF_FASTRELEASETIME = f322(0.01);
var TSF_TRUE = true;
var TSF_FALSE = false;
var TSF_PI = 3.141592653589793;
var TSF_STEREO_INTERLEAVED = 0;
var TSF_STEREO_UNWEAVED = 1;
var TSF_MONO = 2;
var TSF_LOOPMODE_NONE = 0;
var TSF_LOOPMODE_CONTINUOUS = 1;
var TSF_LOOPMODE_SUSTAIN = 2;
var TSF_SEGMENT_NONE = 0;
var TSF_SEGMENT_DELAY = 1;
var TSF_SEGMENT_ATTACK = 2;
var TSF_SEGMENT_HOLD = 3;
var TSF_SEGMENT_DECAY = 4;
var TSF_SEGMENT_SUSTAIN = 5;
var TSF_SEGMENT_RELEASE = 6;
var TSF_SEGMENT_DONE = 7;
var F32767_5 = f322(32767.5);
var F_THRES_LO = f322(-1.00004566);
var F_THRES_HI = f322(1.00001514);
var F_8176 = f322(8.176);
var F_N9226 = f322(-9.226);
var F_005 = f322(0.05);
var F_16383 = f322(16383);
var F_1200 = f322(1200);
var F_1000 = f322(1e3);
function newEnvelope() {
  return {
    delay: 0,
    attack: 0,
    hold: 0,
    decay: 0,
    sustain: 0,
    release: 0,
    keynumToHold: 0,
    keynumToDecay: 0
  };
}
function newVoiceEnvelope() {
  return {
    segment: 0,
    segmentIsExponential: false,
    isAmpEnv: false,
    midiVelocity: 0,
    level: 0,
    slope: 0,
    samplesUntilNextSegment: 0,
    parameters: newEnvelope()
  };
}
function newVoiceLowpass() {
  return { QInv: 0, a0: 0, a1: 0, b1: 0, b2: 0, z1: 0, z2: 0, active: false };
}
function newVoiceLfo() {
  return { samplesUntil: 0, level: 0, delta: 0 };
}
function newRegion() {
  return {
    loop_mode: 0,
    sample_rate: 0,
    lokey: 0,
    hikey: 0,
    lovel: 0,
    hivel: 0,
    group: 0,
    offset: 0,
    end: 0,
    loop_start: 0,
    loop_end: 0,
    transpose: 0,
    tune: 0,
    pitch_keycenter: 0,
    pitch_keytrack: 0,
    attenuation: 0,
    pan: 0,
    ampenv: newEnvelope(),
    modenv: newEnvelope(),
    initialFilterQ: 0,
    initialFilterFc: 0,
    modEnvToPitch: 0,
    modEnvToFilterFc: 0,
    modLfoToFilterFc: 0,
    modLfoToVolume: 0,
    delayModLFO: 0,
    freqModLFO: 0,
    modLfoToPitch: 0,
    delayVibLFO: 0,
    freqVibLFO: 0,
    vibLfoToPitch: 0
  };
}
function newVoice() {
  return {
    playingPreset: -1,
    playingKey: 0,
    playingChannel: 0,
    heldSustain: 0,
    region: null,
    pitchInputTimecents: 0,
    pitchOutputFactor: 0,
    sourceSamplePosition: 0,
    noteGainDB: 0,
    panFactorLeft: 0,
    panFactorRight: 0,
    playIndex: 0,
    loopStart: 0,
    loopEnd: 0,
    ampenv: newVoiceEnvelope(),
    modenv: newVoiceEnvelope(),
    lowpass: newVoiceLowpass(),
    modlfo: newVoiceLfo(),
    viblfo: newVoiceLfo()
  };
}
function newChannel() {
  return {
    presetIndex: 0,
    bank: 0,
    pitchWheel: 8192,
    midiPan: 8192,
    midiVolume: 16383,
    midiExpression: 16383,
    midiRPN: 65535,
    midiData: 0,
    sustain: 0,
    panOffset: 0,
    gainDB: 0,
    pitchRange: 2,
    tuning: 0
  };
}
var Tsf = class {
  presets = [];
  fontSamples = new Float32Array(0);
  voices = [];
  channels = null;
  presetNum = 0;
  voiceNum = 0;
  maxVoiceNum = 0;
  voicePlayIndex = 0;
  outputmode = TSF_STEREO_INTERLEAVED;
  outSampleRate = 0;
  globalGainDB = 0;
  refCount = null;
};
function tsf_load_memory(buffer) {
  let pos = 0;
  return tsf_load_stream({
    read(ptr, size) {
      if (size > buffer.length - pos) size = buffer.length - pos;
      ptr.set(buffer.subarray(pos, pos + size));
      pos += size;
      return size;
    },
    skip(count) {
      if (pos + count > buffer.length) return false;
      pos += count;
      return true;
    }
  });
}
function makeReader(stream) {
  const one = new Uint8Array(1);
  const two = new Uint8Array(2);
  const four = new Uint8Array(4);
  return {
    u8() {
      if (stream.read(one, 1) !== 1) return 0;
      return one[0];
    },
    s8() {
      if (stream.read(one, 1) !== 1) return 0;
      return one[0] << 24 >> 24;
    },
    u16() {
      if (stream.read(two, 2) !== 2) return 0;
      return two[0] | two[1] << 8;
    },
    s16() {
      if (stream.read(two, 2) !== 2) return 0;
      return (two[0] | two[1] << 8) << 16 >> 16;
    },
    u32() {
      if (stream.read(four, 4) !== 4) return 0;
      return (four[0] | four[1] << 8 | four[2] << 16 | four[3] << 24) >>> 0;
    },
    /** tsf_char20: 20 raw bytes as a C string (last byte forced NUL on copy). */
    char20() {
      const b = new Uint8Array(20);
      if (stream.read(b, 20) !== 20) return "";
      let s = "";
      for (let i = 0; i < 20; i++) {
        const c = b[i];
        if (c === 0) break;
        s += String.fromCharCode(c);
      }
      return s;
    },
    readRaw(ptr, size) {
      return stream.read(ptr, size);
    },
    skip(count) {
      return stream.skip(count);
    }
  };
}
function tsf_hydra_read_phdr(i, r) {
  i.presetName = r.char20();
  i.preset = r.u16();
  i.bank = r.u16();
  i.presetBagNdx = r.u16();
  i.library = r.u32();
  i.genre = r.u32();
  i.morphology = r.u32();
}
function tsf_hydra_read_pbag(i, r) {
  i.genNdx = r.u16();
  i.modNdx = r.u16();
}
function tsf_hydra_read_pmod(i, r) {
  i.modSrcOper = r.u16();
  i.modDestOper = r.u16();
  i.modAmount = r.s16();
  i.modAmtSrcOper = r.u16();
  i.modTransOper = r.u16();
}
function readGenamount(r) {
  const lo = r.u8();
  const hi = r.u8();
  const wordAmount = (lo | hi << 8) >>> 0;
  return {
    lo,
    hi,
    wordAmount,
    shortAmount: wordAmount << 16 >> 16
  };
}
function tsf_hydra_read_pgen(i, r) {
  i.genOper = r.u16();
  i.genAmount = readGenamount(r);
}
function tsf_hydra_read_inst(i, r) {
  i.instName = r.char20();
  i.instBagNdx = r.u16();
}
function tsf_hydra_read_ibag(i, r) {
  i.instGenNdx = r.u16();
  i.instModNdx = r.u16();
}
function tsf_hydra_read_imod(i, r) {
  i.modSrcOper = r.u16();
  i.modDestOper = r.u16();
  i.modAmount = r.s16();
  i.modAmtSrcOper = r.u16();
  i.modTransOper = r.u16();
}
function tsf_hydra_read_igen(i, r) {
  i.genOper = r.u16();
  i.genAmount = readGenamount(r);
}
function tsf_hydra_read_shdr(i, r) {
  i.sampleName = r.char20();
  i.start = r.u32();
  i.end = r.u32();
  i.startLoop = r.u32();
  i.endLoop = r.u32();
  i.sampleRate = r.u32();
  i.originalPitch = r.u8();
  i.pitchCorrection = r.s8();
  i.sampleLink = r.u16();
  i.sampleType = r.u16();
}
function TSF_FourCCEquals(value, fourcc) {
  return value === fourcc;
}
function tsf_timecents2Secsd(timecents) {
  return rm_pow(2, timecents / 1200);
}
function tsf_timecents2Secsf(timecents) {
  return f322(rm_pow(2, f322(timecents / 1200)));
}
function tsf_cents2Hertz(cents) {
  return f322(F_8176 * f322(rm_pow(2, f322(cents / F_1200))));
}
function tsf_decibelsToGain(db) {
  return db > -100 ? f322(rm_pow(10, f322(db * F_005))) : 0;
}
function tsf_gainToDecibels(gain) {
  return gain <= 1e-5 ? -100 : f322(20 * rm_log10(gain));
}
function tsf_riffchunk_read(parent, chunk, r) {
  let IsRiff, IsList;
  const four = new Uint8Array(4);
  const sizebuf = new Uint8Array(4);
  if (parent && 8 > parent.size) return false;
  if (!r.readRaw(four, 4)) return false;
  chunk.id = String.fromCharCode(four[0], four[1], four[2], four[3]);
  if (four[0] <= 32 || four[0] >= 122) return false;
  if (!r.readRaw(sizebuf, 4)) return false;
  chunk.size = (sizebuf[0] | sizebuf[1] << 8 | sizebuf[2] << 16 | sizebuf[3] << 24) >>> 0;
  if (parent && 8 + chunk.size > parent.size) return false;
  if (parent) parent.size = parent.size - (8 + chunk.size) >>> 0;
  IsRiff = TSF_FourCCEquals(chunk.id, "RIFF");
  IsList = TSF_FourCCEquals(chunk.id, "LIST");
  if (IsRiff && parent) return false;
  if (!IsRiff && !IsList) return true;
  if (!r.readRaw(four, 4)) return false;
  chunk.id = String.fromCharCode(four[0], four[1], four[2], four[3]);
  if (four[0] <= 32 || four[0] >= 122) return false;
  chunk.size = chunk.size - 4 >>> 0;
  return true;
}
function regFieldGet(r, f) {
  switch (f) {
    case "offset":
      return r.offset;
    case "end":
      return r.end;
    case "loop_start":
      return r.loop_start;
    case "loop_end":
      return r.loop_end;
    case "modLfoToPitch":
      return r.modLfoToPitch;
    case "vibLfoToPitch":
      return r.vibLfoToPitch;
    case "modEnvToPitch":
      return r.modEnvToPitch;
    case "initialFilterFc":
      return r.initialFilterFc;
    case "initialFilterQ":
      return r.initialFilterQ;
    case "modLfoToFilterFc":
      return r.modLfoToFilterFc;
    case "modEnvToFilterFc":
      return r.modEnvToFilterFc;
    case "modLfoToVolume":
      return r.modLfoToVolume;
    case "pan":
      return r.pan;
    case "attenuation":
      return r.attenuation;
    case "delayModLFO":
      return r.delayModLFO;
    case "freqModLFO":
      return r.freqModLFO;
    case "delayVibLFO":
      return r.delayVibLFO;
    case "freqVibLFO":
      return r.freqVibLFO;
    case "modenv.delay":
      return r.modenv.delay;
    case "modenv.attack":
      return r.modenv.attack;
    case "modenv.hold":
      return r.modenv.hold;
    case "modenv.decay":
      return r.modenv.decay;
    case "modenv.sustain":
      return r.modenv.sustain;
    case "modenv.release":
      return r.modenv.release;
    case "modenv.keynumToHold":
      return r.modenv.keynumToHold;
    case "modenv.keynumToDecay":
      return r.modenv.keynumToDecay;
    case "ampenv.delay":
      return r.ampenv.delay;
    case "ampenv.attack":
      return r.ampenv.attack;
    case "ampenv.hold":
      return r.ampenv.hold;
    case "ampenv.decay":
      return r.ampenv.decay;
    case "ampenv.sustain":
      return r.ampenv.sustain;
    case "ampenv.release":
      return r.ampenv.release;
    case "ampenv.keynumToHold":
      return r.ampenv.keynumToHold;
    case "ampenv.keynumToDecay":
      return r.ampenv.keynumToDecay;
    case "transpose":
      return r.transpose;
    case "tune":
      return r.tune;
    case "loop_mode":
      return r.loop_mode;
    case "pitch_keytrack":
      return r.pitch_keytrack;
    case "group":
      return r.group;
    case "pitch_keycenter":
      return r.pitch_keycenter;
  }
}
function regFieldSet(r, f, v) {
  switch (f) {
    case "offset":
      r.offset = v >>> 0;
      return;
    case "end":
      r.end = v >>> 0;
      return;
    case "loop_start":
      r.loop_start = v >>> 0;
      return;
    case "loop_end":
      r.loop_end = v >>> 0;
      return;
    case "group":
      r.group = v >>> 0;
      return;
    case "modLfoToPitch":
      r.modLfoToPitch = v | 0;
      return;
    case "vibLfoToPitch":
      r.vibLfoToPitch = v | 0;
      return;
    case "modEnvToPitch":
      r.modEnvToPitch = v | 0;
      return;
    case "initialFilterFc":
      r.initialFilterFc = v | 0;
      return;
    case "initialFilterQ":
      r.initialFilterQ = v | 0;
      return;
    case "modLfoToFilterFc":
      r.modLfoToFilterFc = v | 0;
      return;
    case "modEnvToFilterFc":
      r.modEnvToFilterFc = v | 0;
      return;
    case "modLfoToVolume":
      r.modLfoToVolume = v | 0;
      return;
    case "freqModLFO":
      r.freqModLFO = v | 0;
      return;
    case "freqVibLFO":
      r.freqVibLFO = v | 0;
      return;
    case "transpose":
      r.transpose = v | 0;
      return;
    case "tune":
      r.tune = v | 0;
      return;
    case "loop_mode":
      r.loop_mode = v | 0;
      return;
    case "pitch_keytrack":
      r.pitch_keytrack = v | 0;
      return;
    case "pitch_keycenter":
      r.pitch_keycenter = v | 0;
      return;
    case "pan":
      r.pan = f322(v);
      return;
    case "attenuation":
      r.attenuation = f322(v);
      return;
    case "delayModLFO":
      r.delayModLFO = f322(v);
      return;
    case "delayVibLFO":
      r.delayVibLFO = f322(v);
      return;
    case "modenv.delay":
      r.modenv.delay = f322(v);
      return;
    case "modenv.attack":
      r.modenv.attack = f322(v);
      return;
    case "modenv.hold":
      r.modenv.hold = f322(v);
      return;
    case "modenv.decay":
      r.modenv.decay = f322(v);
      return;
    case "modenv.sustain":
      r.modenv.sustain = f322(v);
      return;
    case "modenv.release":
      r.modenv.release = f322(v);
      return;
    case "modenv.keynumToHold":
      r.modenv.keynumToHold = f322(v);
      return;
    case "modenv.keynumToDecay":
      r.modenv.keynumToDecay = f322(v);
      return;
    case "ampenv.delay":
      r.ampenv.delay = f322(v);
      return;
    case "ampenv.attack":
      r.ampenv.attack = f322(v);
      return;
    case "ampenv.hold":
      r.ampenv.hold = f322(v);
      return;
    case "ampenv.decay":
      r.ampenv.decay = f322(v);
      return;
    case "ampenv.sustain":
      r.ampenv.sustain = f322(v);
      return;
    case "ampenv.release":
      r.ampenv.release = f322(v);
      return;
    case "ampenv.keynumToHold":
      r.ampenv.keynumToHold = f322(v);
      return;
    case "ampenv.keynumToDecay":
      r.ampenv.keynumToDecay = f322(v);
      return;
  }
}
function copyEnvelopeInto(dst, src) {
  dst.delay = src.delay;
  dst.attack = src.attack;
  dst.hold = src.hold;
  dst.decay = src.decay;
  dst.sustain = src.sustain;
  dst.release = src.release;
  dst.keynumToHold = src.keynumToHold;
  dst.keynumToDecay = src.keynumToDecay;
}
function copyRegionInto(dst, src) {
  const ae = dst.ampenv, me = dst.modenv;
  Object.assign(dst, src);
  dst.ampenv = ae;
  dst.modenv = me;
  copyEnvelopeInto(ae, src.ampenv);
  copyEnvelopeInto(me, src.modenv);
}
function cloneRegion(src) {
  const r = newRegion();
  copyRegionInto(r, src);
  return r;
}
var _GEN_TYPE_MASK = 15;
var GEN_FLOAT = 1;
var GEN_INT = 2;
var GEN_UINT_ADD = 3;
var GEN_UINT_ADD15 = 4;
var GEN_KEYRANGE = 5;
var GEN_VELRANGE = 6;
var GEN_LOOPMODE = 7;
var GEN_GROUP = 8;
var GEN_KEYCENTER = 9;
var _GEN_LIMIT_MASK = 240;
var GEN_INT_LIMIT12K = 16;
var GEN_INT_LIMITFC = 32;
var GEN_INT_LIMITQ = 48;
var GEN_INT_LIMIT960 = 64;
var GEN_INT_LIMIT16K4500 = 80;
var GEN_FLOAT_LIMIT12K5K = 96;
var GEN_FLOAT_LIMIT12K8K = 112;
var GEN_FLOAT_LIMIT1200 = 128;
var GEN_FLOAT_LIMITPAN = 144;
var GEN_FLOAT_LIMITATTN = 160;
var GEN_FLOAT_MAX1000 = 176;
var GEN_FLOAT_MAX1440 = 192;
var _GEN_MAX = 59;
var genMetas = [
  { mode: GEN_UINT_ADD, field: "offset" },
  // 0 StartAddrsOffset
  { mode: GEN_UINT_ADD, field: "end" },
  // 1 EndAddrsOffset
  { mode: GEN_UINT_ADD, field: "loop_start" },
  // 2 StartloopAddrsOffset
  { mode: GEN_UINT_ADD, field: "loop_end" },
  // 3 EndloopAddrsOffset
  { mode: GEN_UINT_ADD15, field: "offset" },
  // 4 StartAddrsCoarseOffset
  { mode: GEN_INT | GEN_INT_LIMIT12K, field: "modLfoToPitch" },
  // 5 ModLfoToPitch
  { mode: GEN_INT | GEN_INT_LIMIT12K, field: "vibLfoToPitch" },
  // 6 VibLfoToPitch
  { mode: GEN_INT | GEN_INT_LIMIT12K, field: "modEnvToPitch" },
  // 7 ModEnvToPitch
  { mode: GEN_INT | GEN_INT_LIMITFC, field: "initialFilterFc" },
  // 8 InitialFilterFc
  { mode: GEN_INT | GEN_INT_LIMITQ, field: "initialFilterQ" },
  // 9 InitialFilterQ
  { mode: GEN_INT | GEN_INT_LIMIT12K, field: "modLfoToFilterFc" },
  //10 ModLfoToFilterFc
  { mode: GEN_INT | GEN_INT_LIMIT12K, field: "modEnvToFilterFc" },
  //11 ModEnvToFilterFc
  { mode: GEN_UINT_ADD15, field: "end" },
  //12 EndAddrsCoarseOffset
  { mode: GEN_INT | GEN_INT_LIMIT960, field: "modLfoToVolume" },
  //13 ModLfoToVolume
  { mode: 0, field: null },
  //   Unused
  { mode: 0, field: null },
  //15 ChorusEffectsSend (unsupported)
  { mode: 0, field: null },
  //16 ReverbEffectsSend (unsupported)
  { mode: GEN_FLOAT | GEN_FLOAT_LIMITPAN, field: "pan" },
  //17 Pan
  { mode: 0, field: null },
  //   Unused
  { mode: 0, field: null },
  //   Unused
  { mode: 0, field: null },
  //   Unused
  { mode: GEN_FLOAT | GEN_FLOAT_LIMIT12K5K, field: "delayModLFO" },
  //21 DelayModLFO
  { mode: GEN_INT | GEN_INT_LIMIT16K4500, field: "freqModLFO" },
  //22 FreqModLFO
  { mode: GEN_FLOAT | GEN_FLOAT_LIMIT12K5K, field: "delayVibLFO" },
  //23 DelayVibLFO
  { mode: GEN_INT | GEN_INT_LIMIT16K4500, field: "freqVibLFO" },
  //24 FreqVibLFO
  { mode: GEN_FLOAT | GEN_FLOAT_LIMIT12K5K, field: "modenv.delay" },
  //25 DelayModEnv
  { mode: GEN_FLOAT | GEN_FLOAT_LIMIT12K8K, field: "modenv.attack" },
  //26 AttackModEnv
  { mode: GEN_FLOAT | GEN_FLOAT_LIMIT12K5K, field: "modenv.hold" },
  //27 HoldModEnv
  { mode: GEN_FLOAT | GEN_FLOAT_LIMIT12K8K, field: "modenv.decay" },
  //28 DecayModEnv
  { mode: GEN_FLOAT | GEN_FLOAT_MAX1000, field: "modenv.sustain" },
  //29 SustainModEnv
  { mode: GEN_FLOAT | GEN_FLOAT_LIMIT12K8K, field: "modenv.release" },
  //30 ReleaseModEnv
  { mode: GEN_FLOAT | GEN_FLOAT_LIMIT1200, field: "modenv.keynumToHold" },
  //31 KeynumToModEnvHold
  { mode: GEN_FLOAT | GEN_FLOAT_LIMIT1200, field: "modenv.keynumToDecay" },
  //32 KeynumToModEnvDecay
  { mode: GEN_FLOAT | GEN_FLOAT_LIMIT12K5K, field: "ampenv.delay" },
  //33 DelayVolEnv
  { mode: GEN_FLOAT | GEN_FLOAT_LIMIT12K8K, field: "ampenv.attack" },
  //34 AttackVolEnv
  { mode: GEN_FLOAT | GEN_FLOAT_LIMIT12K5K, field: "ampenv.hold" },
  //35 HoldVolEnv
  { mode: GEN_FLOAT | GEN_FLOAT_LIMIT12K8K, field: "ampenv.decay" },
  //36 DecayVolEnv
  { mode: GEN_FLOAT | GEN_FLOAT_MAX1440, field: "ampenv.sustain" },
  //37 SustainVolEnv
  { mode: GEN_FLOAT | GEN_FLOAT_LIMIT12K8K, field: "ampenv.release" },
  //38 ReleaseVolEnv
  { mode: GEN_FLOAT | GEN_FLOAT_LIMIT1200, field: "ampenv.keynumToHold" },
  //39 KeynumToVolEnvHold
  { mode: GEN_FLOAT | GEN_FLOAT_LIMIT1200, field: "ampenv.keynumToDecay" },
  //40 KeynumToVolEnvDecay
  { mode: 0, field: null },
  //   Instrument (special)
  { mode: 0, field: null },
  //   Reserved
  { mode: GEN_KEYRANGE, field: null },
  //43 KeyRange
  { mode: GEN_VELRANGE, field: null },
  //44 VelRange
  { mode: GEN_UINT_ADD15, field: "loop_start" },
  //45 StartloopAddrsCoarseOffset
  { mode: 0, field: null },
  //46 Keynum (special)
  { mode: 0, field: null },
  //47 Velocity (special)
  { mode: GEN_FLOAT | GEN_FLOAT_LIMITATTN, field: "attenuation" },
  //48 InitialAttenuation
  { mode: 0, field: null },
  //   Reserved
  { mode: GEN_UINT_ADD15, field: "loop_end" },
  //50 EndloopAddrsCoarseOffset
  { mode: GEN_INT, field: "transpose" },
  //51 CoarseTune
  { mode: GEN_INT, field: "tune" },
  //52 FineTune
  { mode: 0, field: null },
  //   SampleID (special)
  { mode: GEN_LOOPMODE, field: "loop_mode" },
  //54 SampleModes
  { mode: 0, field: null },
  //   Reserved
  { mode: GEN_INT, field: "pitch_keytrack" },
  //56 ScaleTuning
  { mode: GEN_GROUP, field: "group" },
  //57 ExclusiveClass
  { mode: GEN_KEYCENTER, field: "pitch_keycenter" }
  //58 OverridingRootKey
];
function tsf_region_clear(i, for_relative) {
  const zero = newRegion();
  zero.hikey = 127;
  zero.hivel = 127;
  zero.pitch_keycenter = 60;
  Object.assign(i, zero);
  if (for_relative) return;
  i.pitch_keytrack = 100;
  i.pitch_keycenter = -1;
  i.ampenv.delay = i.ampenv.attack = i.ampenv.hold = i.ampenv.decay = i.ampenv.release = -12e3;
  i.modenv.delay = i.modenv.attack = i.modenv.hold = i.modenv.decay = i.modenv.release = -12e3;
  i.initialFilterFc = 13500;
  i.delayModLFO = -12e3;
  i.delayVibLFO = -12e3;
}
function tsf_region_apply(region, genOper, amount) {
  if (genOper >= _GEN_MAX) return;
  const meta = genMetas[genOper];
  switch (meta.mode & _GEN_TYPE_MASK) {
    case GEN_FLOAT:
      regFieldSet(region, meta.field, amount.shortAmount);
      return;
    case GEN_INT:
      regFieldSet(region, meta.field, amount.shortAmount);
      return;
    case GEN_UINT_ADD:
      regFieldSet(region, meta.field, regFieldGet(region, meta.field) + amount.shortAmount >>> 0);
      return;
    case GEN_UINT_ADD15:
      regFieldSet(
        region,
        meta.field,
        regFieldGet(region, meta.field) + (amount.shortAmount << 15) >>> 0
      );
      return;
    case GEN_KEYRANGE:
      region.lokey = amount.lo;
      region.hikey = amount.hi;
      return;
    case GEN_VELRANGE:
      region.lovel = amount.lo;
      region.hivel = amount.hi;
      return;
    case GEN_LOOPMODE:
      region.loop_mode = (amount.wordAmount & 3) === 3 ? TSF_LOOPMODE_SUSTAIN : (amount.wordAmount & 3) === 1 ? TSF_LOOPMODE_CONTINUOUS : TSF_LOOPMODE_NONE;
      return;
    case GEN_GROUP:
      region.group = amount.wordAmount;
      return;
    case GEN_KEYCENTER:
      region.pitch_keycenter = amount.shortAmount;
      return;
  }
}
function tsf_region_merge(region, merge_region) {
  for (let genOper = 0; genOper !== _GEN_MAX; genOper++) {
    const meta = genMetas[genOper];
    if (!meta.field) continue;
    switch (meta.mode & _GEN_TYPE_MASK) {
      case GEN_FLOAT: {
        let v = regFieldGet(region, meta.field);
        const mv = regFieldGet(merge_region, meta.field);
        v = f322(v + mv);
        regFieldSet(region, meta.field, v);
        let vfactor, vmin, vmax;
        switch (meta.mode & _GEN_LIMIT_MASK) {
          case GEN_FLOAT_LIMIT12K5K:
            vfactor = 1;
            vmin = -12e3;
            vmax = 5e3;
            break;
          case GEN_FLOAT_LIMIT12K8K:
            vfactor = 1;
            vmin = -12e3;
            vmax = 8e3;
            break;
          case GEN_FLOAT_LIMIT1200:
            vfactor = 1;
            vmin = -1200;
            vmax = 1200;
            break;
          case GEN_FLOAT_LIMITPAN:
            vfactor = f322(1e-3);
            vmin = -0.5;
            vmax = 0.5;
            break;
          case GEN_FLOAT_LIMITATTN:
            vfactor = f322(0.01);
            vmin = 0;
            vmax = 14.4;
            break;
          case GEN_FLOAT_MAX1000:
            vfactor = 1;
            vmin = 0;
            vmax = 1e3;
            break;
          case GEN_FLOAT_MAX1440:
            vfactor = 1;
            vmin = 0;
            vmax = 1440;
            break;
          default:
            continue;
        }
        v = f322(v * vfactor);
        if (v < vmin) v = vmin;
        else if (v > vmax) v = vmax;
        regFieldSet(region, meta.field, v);
        continue;
      }
      case GEN_INT: {
        let v = regFieldGet(region, meta.field) | 0;
        const mv = regFieldGet(merge_region, meta.field) | 0;
        v = v + mv | 0;
        regFieldSet(region, meta.field, v);
        let vmin, vmax;
        switch (meta.mode & _GEN_LIMIT_MASK) {
          case GEN_INT_LIMIT12K:
            vmin = -12e3;
            vmax = 12e3;
            break;
          case GEN_INT_LIMITFC:
            vmin = 1500;
            vmax = 13500;
            break;
          case GEN_INT_LIMITQ:
            vmin = 0;
            vmax = 960;
            break;
          case GEN_INT_LIMIT960:
            vmin = -960;
            vmax = 960;
            break;
          case GEN_INT_LIMIT16K4500:
            vmin = -16e3;
            vmax = 4500;
            break;
          default:
            continue;
        }
        if (v < vmin) v = vmin;
        else if (v > vmax) v = vmax;
        regFieldSet(region, meta.field, v);
        continue;
      }
      case GEN_UINT_ADD: {
        regFieldSet(
          region,
          meta.field,
          regFieldGet(region, meta.field) + regFieldGet(merge_region, meta.field) >>> 0
        );
        continue;
      }
    }
  }
}
function tsf_region_envtosecs(p, sustainIsGain) {
  p.delay = p.delay < -11950 ? 0 : tsf_timecents2Secsf(p.delay);
  p.attack = p.attack < -11950 ? 0 : tsf_timecents2Secsf(p.attack);
  p.release = p.release < -11950 ? 0 : tsf_timecents2Secsf(p.release);
  if (!p.keynumToHold) p.hold = p.hold < -11950 ? 0 : tsf_timecents2Secsf(p.hold);
  if (!p.keynumToDecay) p.decay = p.decay < -11950 ? 0 : tsf_timecents2Secsf(p.decay);
  if (p.sustain < 0) p.sustain = 0;
  else if (sustainIsGain) p.sustain = tsf_decibelsToGain(f322(-p.sustain / 10));
  else p.sustain = f322(1 - f322(p.sustain / F_1000));
}
function tsf_load_presets(res, hydra, fontSampleCount) {
  const GenInstrument = 41, GenKeyRange = 43, GenVelRange = 44, GenSampleID = 53;
  res.presetNum = hydra.phdrNum - 1;
  if (res.presetNum < 0) return false;
  res.presets = [];
  for (let i = 0; i !== res.presetNum; i++)
    res.presets.push({ presetName: "", preset: 0, bank: 0, regions: [], regionNum: 0 });
  for (let pi = 0; pi !== hydra.phdrNum - 1; pi++) {
    const pphdr = hydra.phdrs[pi];
    const pphdrMax = hydra.phdrNum - 1;
    let sortedIndex = 0, region_index = 0;
    for (let oi = 0; oi !== pphdrMax; oi++) {
      const otherphdr = hydra.phdrs[oi];
      if (oi === pi || otherphdr.bank > pphdr.bank) continue;
      else if (otherphdr.bank < pphdr.bank) sortedIndex++;
      else if (otherphdr.preset > pphdr.preset) continue;
      else if (otherphdr.preset < pphdr.preset) sortedIndex++;
      else if (oi < pi) sortedIndex++;
    }
    const preset = res.presets[sortedIndex];
    preset.presetName = pphdr.presetName;
    preset.bank = pphdr.bank;
    preset.preset = pphdr.preset;
    preset.regionNum = 0;
    for (let bi = pphdr.presetBagNdx, bEnd = hydra.phdrs[pi + 1].presetBagNdx; bi !== bEnd; bi++) {
      const ppbag = hydra.pbags[bi];
      let plokey = 0, phikey = 127, plovel = 0, phivel = 127;
      for (let gi = ppbag.genNdx, gEnd = hydra.pbags[bi + 1].genNdx; gi !== gEnd; gi++) {
        const ppgen = hydra.pgens[gi];
        if (ppgen.genOper === GenKeyRange) {
          plokey = ppgen.genAmount.lo;
          phikey = ppgen.genAmount.hi;
          continue;
        }
        if (ppgen.genOper === GenVelRange) {
          plovel = ppgen.genAmount.lo;
          phivel = ppgen.genAmount.hi;
          continue;
        }
        if (ppgen.genOper !== GenInstrument) continue;
        if (ppgen.genAmount.wordAmount >= hydra.instNum) continue;
        const pinst = hydra.insts[ppgen.genAmount.wordAmount];
        for (let ii = pinst.instBagNdx, iEnd = hydra.insts[ppgen.genAmount.wordAmount + 1].instBagNdx; ii !== iEnd; ii++) {
          const pibag = hydra.ibags[ii];
          let ilokey = 0, ihikey = 127, ilovel = 0, ihivel = 127;
          for (let jj = pibag.instGenNdx, jEnd = hydra.ibags[ii + 1].instGenNdx; jj !== jEnd; jj++) {
            const pigen = hydra.igens[jj];
            if (pigen.genOper === GenKeyRange) {
              ilokey = pigen.genAmount.lo;
              ihikey = pigen.genAmount.hi;
              continue;
            }
            if (pigen.genOper === GenVelRange) {
              ilovel = pigen.genAmount.lo;
              ihivel = pigen.genAmount.hi;
              continue;
            }
            if (pigen.genOper === GenSampleID && ihikey >= plokey && ilokey <= phikey && ihivel >= plovel && ilovel <= phivel)
              preset.regionNum++;
          }
        }
      }
    }
    preset.regions = [];
    const globalRegion = newRegion();
    tsf_region_clear(globalRegion, TSF_TRUE);
    for (let bi = pphdr.presetBagNdx, bEnd = hydra.phdrs[pi + 1].presetBagNdx; bi !== bEnd; bi++) {
      const ppbag = hydra.pbags[bi];
      const presetRegion = newRegion();
      copyRegionInto(presetRegion, globalRegion);
      let hadGenInstrument = 0;
      for (let gi = ppbag.genNdx, gEnd = hydra.pbags[bi + 1].genNdx; gi !== gEnd; gi++) {
        const ppgen = hydra.pgens[gi];
        if (ppgen.genOper === GenInstrument) {
          const whichInst = ppgen.genAmount.wordAmount;
          if (whichInst >= hydra.instNum) continue;
          const instRegion = newRegion();
          tsf_region_clear(instRegion, TSF_FALSE);
          const pinst = hydra.insts[whichInst];
          for (let ii = pinst.instBagNdx, iEnd = hydra.insts[whichInst + 1].instBagNdx; ii !== iEnd; ii++) {
            const zoneRegion = newRegion();
            copyRegionInto(zoneRegion, instRegion);
            let hadSampleID = 0;
            for (let jj = hydra.ibags[ii].instGenNdx, jEnd = hydra.ibags[ii + 1].instGenNdx; jj !== jEnd; jj++) {
              const pigen = hydra.igens[jj];
              if (pigen.genOper === GenSampleID) {
                if (zoneRegion.hikey < presetRegion.lokey || zoneRegion.lokey > presetRegion.hikey)
                  continue;
                if (zoneRegion.hivel < presetRegion.lovel || zoneRegion.lovel > presetRegion.hivel)
                  continue;
                if (presetRegion.lokey > zoneRegion.lokey) zoneRegion.lokey = presetRegion.lokey;
                if (presetRegion.hikey < zoneRegion.hikey) zoneRegion.hikey = presetRegion.hikey;
                if (presetRegion.lovel > zoneRegion.lovel) zoneRegion.lovel = presetRegion.lovel;
                if (presetRegion.hivel < zoneRegion.hivel) zoneRegion.hivel = presetRegion.hivel;
                tsf_region_merge(zoneRegion, presetRegion);
                tsf_region_envtosecs(zoneRegion.ampenv, TSF_TRUE);
                tsf_region_envtosecs(zoneRegion.modenv, TSF_FALSE);
                zoneRegion.delayModLFO = zoneRegion.delayModLFO < -11950 ? 0 : tsf_timecents2Secsf(zoneRegion.delayModLFO);
                zoneRegion.delayVibLFO = zoneRegion.delayVibLFO < -11950 ? 0 : tsf_timecents2Secsf(zoneRegion.delayVibLFO);
                const pshdr = hydra.shdrs[pigen.genAmount.wordAmount];
                zoneRegion.offset = zoneRegion.offset + pshdr.start >>> 0;
                zoneRegion.end = zoneRegion.end + pshdr.end >>> 0;
                zoneRegion.loop_start = zoneRegion.loop_start + pshdr.startLoop >>> 0;
                zoneRegion.loop_end = zoneRegion.loop_end + pshdr.endLoop >>> 0;
                if (pshdr.endLoop > 0) zoneRegion.loop_end = zoneRegion.loop_end - 1 >>> 0;
                if (zoneRegion.loop_end > fontSampleCount) zoneRegion.loop_end = fontSampleCount;
                if (zoneRegion.pitch_keycenter === -1) zoneRegion.pitch_keycenter = pshdr.originalPitch;
                zoneRegion.tune = zoneRegion.tune + pshdr.pitchCorrection | 0;
                zoneRegion.sample_rate = pshdr.sampleRate;
                if (zoneRegion.end && zoneRegion.end < fontSampleCount) zoneRegion.end++;
                else zoneRegion.end = fontSampleCount;
                preset.regions[region_index] = cloneRegion(zoneRegion);
                region_index++;
                hadSampleID = 1;
              } else tsf_region_apply(zoneRegion, pigen.genOper, pigen.genAmount);
            }
            if (ii === pinst.instBagNdx && !hadSampleID) copyRegionInto(instRegion, zoneRegion);
          }
          hadGenInstrument = 1;
        } else tsf_region_apply(presetRegion, ppgen.genOper, ppgen.genAmount);
      }
      if (bi === pphdr.presetBagNdx && !hadGenInstrument) copyRegionInto(globalRegion, presetRegion);
    }
  }
  return true;
}
function tsf_load_samples(pFloatBuffer, pSmplCount, chunkSmpl, r) {
  pSmplCount.v = Math.floor(chunkSmpl.size / 2);
  const raw = new Uint8Array(chunkSmpl.size);
  if (!r.readRaw(raw, chunkSmpl.size)) return false;
  const res = new Float32Array(pSmplCount.v);
  const inView = new DataView(raw.buffer, raw.byteOffset, raw.byteLength);
  for (let i = 0; i < pSmplCount.v; i++)
    res[i] = f322(inView.getInt16(i * 2, true) / 32767);
  pFloatBuffer.v = res;
  return true;
}
function tsf_voice_envelope_release_samples(e, outSampleRate) {
  return Math.trunc(
    f322((e.parameters.release <= 0 ? TSF_FASTRELEASETIME : e.parameters.release) * outSampleRate)
  );
}
function tsf_voice_envelope_nextsegment(e, active_segment, outSampleRate) {
  let seg = active_segment;
  if (seg === TSF_SEGMENT_NONE) {
    e.samplesUntilNextSegment = Math.trunc(f322(e.parameters.delay * outSampleRate));
    if (e.samplesUntilNextSegment > 0) {
      e.segment = TSF_SEGMENT_DELAY;
      e.segmentIsExponential = TSF_FALSE;
      e.level = 0;
      e.slope = 0;
      return;
    }
    seg = TSF_SEGMENT_DELAY;
  }
  if (seg === TSF_SEGMENT_DELAY) {
    e.samplesUntilNextSegment = Math.trunc(f322(e.parameters.attack * outSampleRate));
    if (e.samplesUntilNextSegment > 0) {
      if (!e.isAmpEnv) {
        e.samplesUntilNextSegment = Math.trunc(
          f322(f322(e.parameters.attack * f322((145 - e.midiVelocity) / 144)) * outSampleRate)
        );
      }
      e.segment = TSF_SEGMENT_ATTACK;
      e.segmentIsExponential = TSF_FALSE;
      e.level = 0;
      e.slope = f322(1 / e.samplesUntilNextSegment);
      return;
    }
    seg = TSF_SEGMENT_ATTACK;
  }
  if (seg === TSF_SEGMENT_ATTACK) {
    e.samplesUntilNextSegment = Math.trunc(f322(e.parameters.hold * outSampleRate));
    if (e.samplesUntilNextSegment > 0) {
      e.segment = TSF_SEGMENT_HOLD;
      e.segmentIsExponential = TSF_FALSE;
      e.level = 1;
      e.slope = 0;
      return;
    }
    seg = TSF_SEGMENT_HOLD;
  }
  if (seg === TSF_SEGMENT_HOLD) {
    e.samplesUntilNextSegment = Math.trunc(f322(e.parameters.decay * outSampleRate));
    if (e.samplesUntilNextSegment > 0) {
      e.segment = TSF_SEGMENT_DECAY;
      e.level = 1;
      if (e.isAmpEnv) {
        const mysterySlope = f322(F_N9226 / e.samplesUntilNextSegment);
        e.slope = rm_expf(mysterySlope);
        e.segmentIsExponential = TSF_TRUE;
        if (e.parameters.sustain > 0) {
          e.samplesUntilNextSegment = Math.trunc(rm_log(e.parameters.sustain) / mysterySlope);
        }
      } else {
        e.slope = f322(-1 / e.samplesUntilNextSegment);
        e.samplesUntilNextSegment = Math.trunc(
          f322(f322(e.parameters.decay * f322(1 - e.parameters.sustain)) * outSampleRate)
        );
        e.segmentIsExponential = TSF_FALSE;
      }
      return;
    }
    seg = TSF_SEGMENT_DECAY;
  }
  if (seg === TSF_SEGMENT_DECAY) {
    e.segment = TSF_SEGMENT_SUSTAIN;
    e.level = e.parameters.sustain;
    e.slope = 0;
    e.samplesUntilNextSegment = 2147483647;
    e.segmentIsExponential = TSF_FALSE;
    return;
  }
  if (seg === TSF_SEGMENT_SUSTAIN) {
    e.segment = TSF_SEGMENT_RELEASE;
    e.samplesUntilNextSegment = tsf_voice_envelope_release_samples(e, outSampleRate);
    if (e.isAmpEnv) {
      const mysterySlope = f322(F_N9226 / e.samplesUntilNextSegment);
      e.slope = rm_expf(mysterySlope);
      e.segmentIsExponential = TSF_TRUE;
    } else {
      e.slope = f322(-e.level / e.samplesUntilNextSegment);
      e.segmentIsExponential = TSF_FALSE;
    }
    return;
  }
  e.segment = TSF_SEGMENT_DONE;
  e.segmentIsExponential = TSF_FALSE;
  e.level = e.slope = 0;
  e.samplesUntilNextSegment = 134217727;
}
function tsf_voice_envelope_setup(e, new_parameters, midiNoteNumber, midiVelocity, isAmpEnv, outSampleRate) {
  e.parameters = { ...new_parameters };
  if (e.parameters.keynumToHold) {
    e.parameters.hold = f322(
      e.parameters.hold + f322(e.parameters.keynumToHold * f322(60 - midiNoteNumber))
    );
    e.parameters.hold = e.parameters.hold < -1e4 ? 0 : tsf_timecents2Secsf(e.parameters.hold);
  }
  if (e.parameters.keynumToDecay) {
    e.parameters.decay = f322(
      e.parameters.decay + f322(e.parameters.keynumToDecay * f322(60 - midiNoteNumber))
    );
    e.parameters.decay = e.parameters.decay < -1e4 ? 0 : tsf_timecents2Secsf(e.parameters.decay);
  }
  e.midiVelocity = midiVelocity;
  e.isAmpEnv = isAmpEnv;
  tsf_voice_envelope_nextsegment(e, TSF_SEGMENT_NONE, outSampleRate);
}
function tsf_voice_envelope_process(e, numSamples, outSampleRate) {
  if (e.slope) {
    if (e.segmentIsExponential) e.level = f322(e.level * rm_powf(e.slope, numSamples));
    else e.level = f322(e.level + f322(e.slope * numSamples));
  }
  if ((e.samplesUntilNextSegment -= numSamples) <= 0)
    tsf_voice_envelope_nextsegment(e, e.segment, outSampleRate);
}
function tsf_voice_lowpass_setup(e, Fc) {
  const K = rm_tan(TSF_PI * Fc), KK = K * K;
  const norm = 1 / (1 + K * e.QInv + KK);
  e.a0 = KK * norm;
  e.a1 = 2 * e.a0;
  e.b1 = 2 * (KK - 1) * norm;
  e.b2 = (1 - K * e.QInv + KK) * norm;
}
function tsf_voice_lowpass_process(e, In) {
  const Out = In * e.a0 + e.z1;
  e.z1 = In * e.a1 + e.z2 - e.b1 * Out;
  e.z2 = In * e.a0 - e.b2 * Out;
  return f322(Out);
}
function tsf_voice_lfo_setup(e, delay, freqCents, outSampleRate) {
  e.samplesUntil = Math.trunc(f322(delay * outSampleRate));
  e.delta = f322(f322(4 * tsf_cents2Hertz(freqCents)) / outSampleRate);
  e.level = 0;
}
function tsf_voice_lfo_process(e, blockSamples) {
  if (e.samplesUntil > blockSamples) {
    e.samplesUntil -= blockSamples;
    return;
  }
  e.level = f322(e.level + f322(e.delta * blockSamples));
  if (e.level > 1) {
    e.delta = -e.delta;
    e.level = f322(2 - e.level);
  } else if (e.level < -1) {
    e.delta = -e.delta;
    e.level = f322(-2 - e.level);
  }
}
function tsf_voice_kill(v) {
  v.playingPreset = -1;
}
function tsf_voice_end(f, v) {
  let repeats = f.maxVoiceNum ? 2 : 1;
  while (repeats--) {
    tsf_voice_envelope_nextsegment(v.ampenv, TSF_SEGMENT_SUSTAIN, f.outSampleRate);
    tsf_voice_envelope_nextsegment(v.modenv, TSF_SEGMENT_SUSTAIN, f.outSampleRate);
    if (v.region.loop_mode === TSF_LOOPMODE_SUSTAIN) {
      v.loopEnd = v.loopStart;
    }
  }
}
function tsf_voice_endquick(f, v) {
  let repeats = f.maxVoiceNum ? 2 : 1;
  while (repeats--) {
    v.ampenv.parameters.release = 0;
    tsf_voice_envelope_nextsegment(v.ampenv, TSF_SEGMENT_SUSTAIN, f.outSampleRate);
    v.modenv.parameters.release = 0;
    tsf_voice_envelope_nextsegment(v.modenv, TSF_SEGMENT_SUSTAIN, f.outSampleRate);
  }
}
function tsf_voice_calcpitchratio(v, pitchShift, outSampleRate) {
  const region = v.region;
  const note = v.playingKey + region.transpose + region.tune / 100;
  let adjustedPitch = region.pitch_keycenter + (note - region.pitch_keycenter) * (region.pitch_keytrack / 100);
  if (pitchShift) adjustedPitch += pitchShift;
  v.pitchInputTimecents = adjustedPitch * 100;
  v.pitchOutputFactor = region.sample_rate / (tsf_timecents2Secsd(region.pitch_keycenter * 100) * outSampleRate);
}
function tsf_voice_render(f, v, outputBuffer, outOffset, numSamples) {
  const region = v.region;
  const input = f.fontSamples;
  const smp = (i) => i < input.length ? input[i] : 0;
  let outL = outOffset;
  let outR = f.outputmode === TSF_STEREO_UNWEAVED ? outL + numSamples : -1;
  const updateModEnv = !!(region.modEnvToPitch || region.modEnvToFilterFc);
  const updateModLFO = !!(v.modlfo.delta && (region.modLfoToPitch || region.modLfoToFilterFc || region.modLfoToVolume));
  const updateVibLFO = !!(v.viblfo.delta && region.vibLfoToPitch);
  const isLooping = v.loopStart < v.loopEnd;
  const tmpLoopStart = v.loopStart, tmpLoopEnd = v.loopEnd;
  const tmpSampleEndDbl = region.end, tmpLoopEndDbl = tmpLoopEnd + 1;
  let tmpSourceSamplePosition = v.sourceSamplePosition;
  const tmpLowpass = { ...v.lowpass };
  const dynamicLowpass = !!(region.modLfoToFilterFc || region.modEnvToFilterFc);
  const tmpSampleRate = f.outSampleRate;
  let tmpInitialFilterFc, tmpModLfoToFilterFc, tmpModEnvToFilterFc;
  const dynamicPitchRatio = !!(region.modLfoToPitch || region.modEnvToPitch || region.vibLfoToPitch);
  let pitchRatio;
  let tmpModLfoToPitch, tmpVibLfoToPitch, tmpModEnvToPitch;
  const dynamicGain = region.modLfoToVolume !== 0;
  let noteGain = 0;
  let tmpModLfoToVolume;
  if (dynamicLowpass)
    tmpInitialFilterFc = region.initialFilterFc, tmpModLfoToFilterFc = region.modLfoToFilterFc, tmpModEnvToFilterFc = region.modEnvToFilterFc;
  else tmpInitialFilterFc = 0, tmpModLfoToFilterFc = 0, tmpModEnvToFilterFc = 0;
  if (dynamicPitchRatio)
    pitchRatio = 0, tmpModLfoToPitch = region.modLfoToPitch, tmpVibLfoToPitch = region.vibLfoToPitch, tmpModEnvToPitch = region.modEnvToPitch;
  else
    pitchRatio = tsf_timecents2Secsd(v.pitchInputTimecents) * v.pitchOutputFactor, tmpModLfoToPitch = 0, tmpVibLfoToPitch = 0, tmpModEnvToPitch = 0;
  if (dynamicGain) tmpModLfoToVolume = f322(region.modLfoToVolume * f322(0.1));
  else noteGain = tsf_decibelsToGain(v.noteGainDB), tmpModLfoToVolume = 0;
  while (numSamples) {
    let gainMono, gainLeft, gainRight;
    let blockSamples = numSamples > TSF_RENDER_EFFECTSAMPLEBLOCK ? TSF_RENDER_EFFECTSAMPLEBLOCK : numSamples;
    numSamples -= blockSamples;
    if (dynamicLowpass) {
      const fres = f322(
        f322(tmpInitialFilterFc + f322(v.modlfo.level * tmpModLfoToFilterFc)) + f322(v.modenv.level * tmpModEnvToFilterFc)
      );
      const lowpassFc = fres <= 13500 ? f322(tsf_cents2Hertz(fres) / tmpSampleRate) : 1;
      tmpLowpass.active = lowpassFc < 0.499;
      if (tmpLowpass.active) tsf_voice_lowpass_setup(tmpLowpass, lowpassFc);
    }
    if (dynamicPitchRatio)
      pitchRatio = tsf_timecents2Secsd(
        v.pitchInputTimecents + f322(
          f322(f322(v.modlfo.level * tmpModLfoToPitch) + f322(v.viblfo.level * tmpVibLfoToPitch)) + f322(v.modenv.level * tmpModEnvToPitch)
        )
      ) * v.pitchOutputFactor;
    if (dynamicGain)
      noteGain = tsf_decibelsToGain(f322(v.noteGainDB + f322(v.modlfo.level * tmpModLfoToVolume)));
    gainMono = f322(noteGain * v.ampenv.level);
    tsf_voice_envelope_process(v.ampenv, blockSamples, tmpSampleRate);
    if (updateModEnv) tsf_voice_envelope_process(v.modenv, blockSamples, tmpSampleRate);
    if (updateModLFO) tsf_voice_lfo_process(v.modlfo, blockSamples);
    if (updateVibLFO) tsf_voice_lfo_process(v.viblfo, blockSamples);
    switch (f.outputmode) {
      case TSF_STEREO_INTERLEAVED:
        gainLeft = f322(gainMono * v.panFactorLeft);
        gainRight = f322(gainMono * v.panFactorRight);
        while (blockSamples-- && tmpSourceSamplePosition < tmpSampleEndDbl) {
          const pos = Math.floor(tmpSourceSamplePosition) >>> 0, nextPos = pos >= tmpLoopEnd && isLooping ? tmpLoopStart : pos + 1;
          const alpha = f322(tmpSourceSamplePosition - pos);
          let val = f322(f322(smp(pos) * f322(1 - alpha)) + f322(smp(nextPos) * alpha));
          if (tmpLowpass.active) val = tsf_voice_lowpass_process(tmpLowpass, val);
          outputBuffer[outL] = outputBuffer[outL] + f322(val * gainLeft);
          outputBuffer[outL + 1] = outputBuffer[outL + 1] + f322(val * gainRight);
          outL += 2;
          tmpSourceSamplePosition += pitchRatio;
          if (tmpSourceSamplePosition >= tmpLoopEndDbl && isLooping)
            tmpSourceSamplePosition -= tmpLoopEnd - tmpLoopStart + 1;
        }
        break;
      case TSF_STEREO_UNWEAVED:
        gainLeft = f322(gainMono * v.panFactorLeft);
        gainRight = f322(gainMono * v.panFactorRight);
        while (blockSamples-- && tmpSourceSamplePosition < tmpSampleEndDbl) {
          const pos = Math.floor(tmpSourceSamplePosition) >>> 0, nextPos = pos >= tmpLoopEnd && isLooping ? tmpLoopStart : pos + 1;
          const alpha = f322(tmpSourceSamplePosition - pos);
          let val = f322(f322(smp(pos) * f322(1 - alpha)) + f322(smp(nextPos) * alpha));
          if (tmpLowpass.active) val = tsf_voice_lowpass_process(tmpLowpass, val);
          outputBuffer[outL] = outputBuffer[outL] + f322(val * gainLeft);
          outputBuffer[outR] = outputBuffer[outR] + f322(val * gainRight);
          outL += 1;
          outR += 1;
          tmpSourceSamplePosition += pitchRatio;
          if (tmpSourceSamplePosition >= tmpLoopEndDbl && isLooping)
            tmpSourceSamplePosition -= tmpLoopEnd - tmpLoopStart + 1;
        }
        break;
      case TSF_MONO:
        while (blockSamples-- && tmpSourceSamplePosition < tmpSampleEndDbl) {
          const pos = Math.floor(tmpSourceSamplePosition) >>> 0, nextPos = pos >= tmpLoopEnd && isLooping ? tmpLoopStart : pos + 1;
          const alpha = f322(tmpSourceSamplePosition - pos);
          let val = f322(f322(smp(pos) * f322(1 - alpha)) + f322(smp(nextPos) * alpha));
          if (tmpLowpass.active) val = tsf_voice_lowpass_process(tmpLowpass, val);
          outputBuffer[outL] = outputBuffer[outL] + f322(val * gainMono);
          outL += 1;
          tmpSourceSamplePosition += pitchRatio;
          if (tmpSourceSamplePosition >= tmpLoopEndDbl && isLooping)
            tmpSourceSamplePosition -= tmpLoopEnd - tmpLoopStart + 1;
        }
        break;
    }
    if (tmpSourceSamplePosition >= tmpSampleEndDbl || v.ampenv.segment === TSF_SEGMENT_DONE) {
      tsf_voice_kill(v);
      return;
    }
  }
  v.sourceSamplePosition = tmpSourceSamplePosition;
  if (tmpLowpass.active || dynamicLowpass) v.lowpass = tmpLowpass;
}
function tsf_load_stream(stream) {
  const r = makeReader(stream);
  let res = null;
  const chunkHead = { id: "", size: 0 };
  const chunkList = { id: "", size: 0 };
  const hydra = {
    phdrs: [],
    pbags: [],
    pmods: [],
    pgens: [],
    insts: [],
    ibags: [],
    imods: [],
    igens: [],
    shdrs: [],
    phdrNum: 0,
    pbagNum: 0,
    pmodNum: 0,
    pgenNum: 0,
    instNum: 0,
    ibagNum: 0,
    imodNum: 0,
    igenNum: 0,
    shdrNum: 0
  };
  let floatBuffer = null;
  let smplCount = 0;
  if (!tsf_riffchunk_read(null, chunkHead, r) || !TSF_FourCCEquals(chunkHead.id, "sfbk")) {
    return res;
  }
  const chunkSizes = {
    phdr: 38,
    pbag: 4,
    pmod: 10,
    pgen: 4,
    inst: 22,
    ibag: 4,
    imod: 10,
    igen: 4,
    shdr: 46
  };
  let out_of_memory = false;
  while (tsf_riffchunk_read(chunkHead, chunkList, r)) {
    const chunk = { id: "", size: 0 };
    if (TSF_FourCCEquals(chunkList.id, "pdta")) {
      while (tsf_riffchunk_read(chunkList, chunk, r)) {
        const name = chunk.id;
        const sizeInFile = chunkSizes[name];
        if (sizeInFile !== void 0 && chunk.size % sizeInFile === 0) {
          const num = chunk.size / sizeInFile;
          switch (name) {
            case "phdr":
              hydra.phdrNum = num;
              hydra.phdrs = [];
              for (let i = 0; i < num; ++i) {
                const e = {
                  presetName: "",
                  preset: 0,
                  bank: 0,
                  presetBagNdx: 0,
                  library: 0,
                  genre: 0,
                  morphology: 0
                };
                tsf_hydra_read_phdr(e, r);
                hydra.phdrs.push(e);
              }
              break;
            case "pbag":
              hydra.pbagNum = num;
              hydra.pbags = [];
              for (let i = 0; i < num; ++i) {
                const e = { genNdx: 0, modNdx: 0 };
                tsf_hydra_read_pbag(e, r);
                hydra.pbags.push(e);
              }
              break;
            case "pmod":
              hydra.pmodNum = num;
              hydra.pmods = [];
              for (let i = 0; i < num; ++i) {
                const e = {
                  modSrcOper: 0,
                  modDestOper: 0,
                  modAmount: 0,
                  modAmtSrcOper: 0,
                  modTransOper: 0
                };
                tsf_hydra_read_pmod(e, r);
                hydra.pmods.push(e);
              }
              break;
            case "pgen":
              hydra.pgenNum = num;
              hydra.pgens = [];
              for (let i = 0; i < num; ++i) {
                const e = {
                  genOper: 0,
                  genAmount: { lo: 0, hi: 0, shortAmount: 0, wordAmount: 0 }
                };
                tsf_hydra_read_pgen(e, r);
                hydra.pgens.push(e);
              }
              break;
            case "inst":
              hydra.instNum = num;
              hydra.insts = [];
              for (let i = 0; i < num; ++i) {
                const e = { instName: "", instBagNdx: 0 };
                tsf_hydra_read_inst(e, r);
                hydra.insts.push(e);
              }
              break;
            case "ibag":
              hydra.ibagNum = num;
              hydra.ibags = [];
              for (let i = 0; i < num; ++i) {
                const e = { instGenNdx: 0, instModNdx: 0 };
                tsf_hydra_read_ibag(e, r);
                hydra.ibags.push(e);
              }
              break;
            case "imod":
              hydra.imodNum = num;
              hydra.imods = [];
              for (let i = 0; i < num; ++i) {
                const e = {
                  modSrcOper: 0,
                  modDestOper: 0,
                  modAmount: 0,
                  modAmtSrcOper: 0,
                  modTransOper: 0
                };
                tsf_hydra_read_imod(e, r);
                hydra.imods.push(e);
              }
              break;
            case "igen":
              hydra.igenNum = num;
              hydra.igens = [];
              for (let i = 0; i < num; ++i) {
                const e = {
                  genOper: 0,
                  genAmount: { lo: 0, hi: 0, shortAmount: 0, wordAmount: 0 }
                };
                tsf_hydra_read_igen(e, r);
                hydra.igens.push(e);
              }
              break;
            case "shdr":
              hydra.shdrNum = num;
              hydra.shdrs = [];
              for (let i = 0; i < num; ++i) {
                const e = {
                  sampleName: "",
                  start: 0,
                  end: 0,
                  startLoop: 0,
                  endLoop: 0,
                  sampleRate: 0,
                  originalPitch: 0,
                  pitchCorrection: 0,
                  sampleLink: 0,
                  sampleType: 0
                };
                tsf_hydra_read_shdr(e, r);
                hydra.shdrs.push(e);
              }
              break;
          }
        } else r.skip(chunk.size);
      }
    } else if (TSF_FourCCEquals(chunkList.id, "sdta")) {
      while (tsf_riffchunk_read(chunkList, chunk, r)) {
        if (TSF_FourCCEquals(chunk.id, "smpl") && !floatBuffer && chunk.size >= 2) {
          const fb = { v: floatBuffer };
          const sc = { v: smplCount };
          if (!tsf_load_samples(fb, sc, chunk, r)) {
            out_of_memory = true;
            break;
          }
          floatBuffer = fb.v;
          smplCount = sc.v;
        } else r.skip(chunk.size);
      }
    } else r.skip(chunkList.size);
    if (out_of_memory) break;
  }
  if (!hydra.phdrs.length || !hydra.pbags.length || !hydra.pmods.length || !hydra.pgens.length || !hydra.insts.length || !hydra.ibags.length || !hydra.imods.length || !hydra.igens.length || !hydra.shdrs.length) {
  } else if (!floatBuffer) {
  } else if (!out_of_memory) {
    res = new Tsf();
    if (!tsf_load_presets(res, hydra, smplCount)) {
      res = null;
      out_of_memory = true;
    } else {
      res.outSampleRate = 44100;
      res.fontSamples = floatBuffer;
      floatBuffer = null;
    }
  }
  return res;
}
function tsf_reset(f) {
  for (const v of f.voices)
    if (v.playingPreset !== -1 && (v.ampenv.segment < TSF_SEGMENT_RELEASE || v.ampenv.parameters.release))
      tsf_voice_endquick(f, v);
  f.channels = null;
}
function tsf_get_presetindex(f, bank, preset_number) {
  for (let i = 0, iMax = f.presetNum; i < iMax; i++)
    if (f.presets[i].preset === preset_number && f.presets[i].bank === bank) return i;
  return -1;
}
function tsf_set_output(f, outputmode, samplerate, global_gain_db = 0) {
  f.outputmode = outputmode;
  f.outSampleRate = f322(samplerate >= 1 ? samplerate : 44100);
  f.globalGainDB = f322(global_gain_db);
}
function tsf_note_on(f, preset_index, key, vel) {
  const midiVelocity = Math.trunc(f322(vel * 127));
  let voicePlayIndex;
  if (preset_index < 0 || preset_index >= f.presetNum) return 1;
  if (vel <= 0) {
    tsf_note_off(f, preset_index, key);
    return 1;
  }
  voicePlayIndex = f.voicePlayIndex;
  f.voicePlayIndex = f.voicePlayIndex + 1 >>> 0;
  const preset = f.presets[preset_index];
  for (let ri = 0; ri < preset.regionNum; ri++) {
    const region = preset.regions[ri];
    if (!region) continue;
    let voice = null;
    if (key < region.lokey || key > region.hikey || midiVelocity < region.lovel || midiVelocity > region.hivel)
      continue;
    voice = null;
    if (region.group) {
      for (const v of f.voices) {
        if (v.playingPreset === preset_index && v.region.group === region.group) tsf_voice_endquick(f, v);
        else if (v.playingPreset === -1 && !voice) voice = v;
      }
    } else
      for (const v of f.voices)
        if (v.playingPreset === -1) {
          voice = v;
          break;
        }
    if (!voice) {
      if (f.maxVoiceNum) {
        let bestKillReleaseSamplePos = -999999999;
        for (const v of f.voices) {
          if (v.ampenv.segment === TSF_SEGMENT_RELEASE) {
            const releaseSamplesDone = tsf_voice_envelope_release_samples(v.ampenv, f.outSampleRate) - v.ampenv.samplesUntilNextSegment;
            if (releaseSamplesDone > bestKillReleaseSamplePos) {
              bestKillReleaseSamplePos = releaseSamplesDone;
              voice = v;
            }
          }
        }
        if (!voice) continue;
        tsf_voice_kill(voice);
      } else {
        f.voiceNum += 4;
        while (f.voices.length < f.voiceNum) f.voices.push(newVoice());
        voice = f.voices[f.voiceNum - 4];
        f.voices[f.voiceNum - 3].playingPreset = -1;
        f.voices[f.voiceNum - 2].playingPreset = -1;
        f.voices[f.voiceNum - 1].playingPreset = -1;
      }
    }
    voice.region = region;
    voice.playingPreset = preset_index;
    voice.playingKey = key;
    voice.playIndex = voicePlayIndex;
    voice.heldSustain = 0;
    voice.noteGainDB = f322(
      f322(f.globalGainDB - region.attenuation) - tsf_gainToDecibels(f322(1 / vel))
    );
    if (f.channels) {
      tsf_channel_setup_voice(f, voice);
    } else {
      tsf_voice_calcpitchratio(voice, 0, f.outSampleRate);
      voice.panFactorLeft = f322(Math.sqrt(f322(0.5 - region.pan)));
      voice.panFactorRight = f322(Math.sqrt(f322(0.5 + region.pan)));
    }
    voice.sourceSamplePosition = region.offset;
    const doLoop = region.loop_mode !== TSF_LOOPMODE_NONE && region.loop_start < region.loop_end;
    voice.loopStart = doLoop ? region.loop_start : 0;
    voice.loopEnd = doLoop ? region.loop_end : 0;
    tsf_voice_envelope_setup(voice.ampenv, region.ampenv, key, midiVelocity, TSF_TRUE, f.outSampleRate);
    tsf_voice_envelope_setup(voice.modenv, region.modenv, key, midiVelocity, TSF_FALSE, f.outSampleRate);
    const lowpassFc = region.initialFilterFc <= 13500 ? f322(tsf_cents2Hertz(region.initialFilterFc) / f.outSampleRate) : 1;
    const lowpassFilterQDB = f322(region.initialFilterQ / 10);
    voice.lowpass.QInv = 1 / rm_pow(10, lowpassFilterQDB / 20);
    voice.lowpass.z1 = voice.lowpass.z2 = 0;
    voice.lowpass.active = lowpassFc < 0.499;
    if (voice.lowpass.active) tsf_voice_lowpass_setup(voice.lowpass, lowpassFc);
    tsf_voice_lfo_setup(voice.modlfo, region.delayModLFO, region.freqModLFO, f.outSampleRate);
    tsf_voice_lfo_setup(voice.viblfo, region.delayVibLFO, region.freqVibLFO, f.outSampleRate);
  }
  return 1;
}
function tsf_note_off(f, preset_index, key) {
  let vMatchFirst = null, vMatchLast = null;
  for (const v of f.voices) {
    if (v.playingPreset !== preset_index || v.playingKey !== key || v.ampenv.segment >= TSF_SEGMENT_RELEASE)
      continue;
    else if (!vMatchFirst || v.playIndex < vMatchFirst.playIndex) vMatchFirst = vMatchLast = v;
    else if (v.playIndex === vMatchFirst.playIndex) vMatchLast = v;
  }
  if (!vMatchFirst) return;
  const first = vMatchFirst;
  const iFirst = f.voices.indexOf(first), iLast = f.voices.indexOf(vMatchLast);
  for (let i = iFirst; i <= iLast; i++) {
    const v = f.voices[i];
    if (v !== first && v !== vMatchLast && (v.playIndex !== first.playIndex || v.playingPreset !== preset_index || v.playingKey !== key || v.ampenv.segment >= TSF_SEGMENT_RELEASE))
      continue;
    tsf_voice_end(f, v);
  }
}
function tsf_render_float(f, buffer, offset, samples, flag_mixing) {
  const channels = f.outputmode === TSF_MONO ? 1 : 2;
  if (!flag_mixing) buffer.fill(0, offset, offset + channels * samples);
  for (const v of f.voices) if (v.playingPreset !== -1) tsf_voice_render(f, v, buffer, offset, samples);
}
function tsf_render_short(f, buffer, offset, samples, flag_mixing) {
  const outputSamples = new Float32Array(TSF_RENDER_SHORTBUFFERBLOCK);
  const channels = f.outputmode === TSF_MONO ? 1 : 2, maxChannelSamples = TSF_RENDER_SHORTBUFFERBLOCK / channels;
  let bi = offset;
  while (samples > 0) {
    const channelSamples = samples > maxChannelSamples ? maxChannelSamples : samples;
    tsf_render_float(f, outputSamples, 0, channelSamples, TSF_FALSE);
    samples -= channelSamples;
    if (flag_mixing)
      for (let i = 0; i < channelSamples * channels; i++) {
        const v = outputSamples[i];
        const vi = buffer[bi] + (v < F_THRES_LO ? -32768 : v > F_THRES_HI ? 32767 : Math.trunc(f322(v * F32767_5)));
        buffer[bi++] = vi < -32768 ? -32768 : vi > 32767 ? 32767 : vi;
      }
    else
      for (let i = 0; i < channelSamples * channels; i++) {
        const v = outputSamples[i];
        buffer[bi++] = v < F_THRES_LO ? -32768 : v > F_THRES_HI ? 32767 : Math.trunc(f322(v * F32767_5));
      }
  }
}
function tsf_channel_setup_voice(f, v) {
  const c = f.channels.channels[f.channels.activeChannel];
  const newpan = f322(v.region.pan + c.panOffset);
  v.playingChannel = f.channels.activeChannel;
  v.noteGainDB = f322(v.noteGainDB + c.gainDB);
  tsf_voice_calcpitchratio(
    v,
    c.pitchWheel === 8192 ? c.tuning : f322(f322(f322(f322(f322(c.pitchWheel / F_16383) * c.pitchRange) * 2) - c.pitchRange) + c.tuning),
    f.outSampleRate
  );
  if (newpan <= -0.5) {
    v.panFactorLeft = 1;
    v.panFactorRight = 0;
  } else if (newpan >= 0.5) {
    v.panFactorLeft = 0;
    v.panFactorRight = 1;
  } else {
    v.panFactorLeft = f322(Math.sqrt(f322(0.5 - newpan)));
    v.panFactorRight = f322(Math.sqrt(f322(0.5 + newpan)));
  }
}
function tsf_channel_init(f, channel) {
  if (f.channels && channel < f.channels.channelNum) return f.channels.channels[channel];
  if (!f.channels) {
    f.channels = { channelNum: 0, activeChannel: 0, channels: [] };
  }
  let i = f.channels.channelNum;
  f.channels.channelNum = channel + 1;
  for (; i <= channel; i++) {
    const c = newChannel();
    f.channels.channels[i] = c;
  }
  return f.channels.channels[channel];
}
function tsf_channel_applypitch(f, channel, c) {
  const pitchShift = c.pitchWheel === 8192 ? c.tuning : f322(f322(f322(f322(f322(c.pitchWheel / F_16383) * c.pitchRange) * 2) - c.pitchRange) + c.tuning);
  for (const v of f.voices)
    if (v.playingPreset !== -1 && v.playingChannel === channel)
      tsf_voice_calcpitchratio(v, pitchShift, f.outSampleRate);
}
function tsf_channel_set_presetnumber(f, channel, preset_number, flag_mididrums = false) {
  let preset_index;
  const c = tsf_channel_init(f, channel);
  if (!c) return 0;
  if (flag_mididrums) {
    preset_index = tsf_get_presetindex(f, 128 | c.bank & 32767, preset_number);
    if (preset_index === -1) preset_index = tsf_get_presetindex(f, 128, preset_number);
    if (preset_index === -1) preset_index = tsf_get_presetindex(f, 128, 0);
    if (preset_index === -1) preset_index = tsf_get_presetindex(f, c.bank & 32767, preset_number);
  } else preset_index = tsf_get_presetindex(f, c.bank & 32767, preset_number);
  if (preset_index === -1) preset_index = tsf_get_presetindex(f, 0, preset_number);
  if (preset_index !== -1) {
    c.presetIndex = preset_index & 65535;
    return 1;
  }
  return 0;
}
function tsf_channel_set_bank_preset(f, channel, bank, preset_number) {
  const c = tsf_channel_init(f, channel);
  if (!c) return 0;
  const preset_index = tsf_get_presetindex(f, bank, preset_number);
  if (preset_index === -1) return 0;
  c.presetIndex = preset_index & 65535;
  c.bank = bank & 65535;
  return 1;
}
function tsf_channel_set_pan(f, channel, pan) {
  const c = tsf_channel_init(f, channel);
  if (!c) return 0;
  for (const v of f.voices)
    if (v.playingPreset !== -1 && v.playingChannel === channel) {
      const newpan = f322(f322(v.region.pan + pan) - 0.5);
      if (newpan <= -0.5) {
        v.panFactorLeft = 1;
        v.panFactorRight = 0;
      } else if (newpan >= 0.5) {
        v.panFactorLeft = 0;
        v.panFactorRight = 1;
      } else {
        v.panFactorLeft = f322(Math.sqrt(f322(0.5 - newpan)));
        v.panFactorRight = f322(Math.sqrt(f322(0.5 + newpan)));
      }
    }
  c.panOffset = f322(pan - 0.5);
  return 1;
}
function tsf_channel_set_volume(f, channel, volume) {
  const gainDB = tsf_gainToDecibels(volume);
  const c = tsf_channel_init(f, channel);
  if (!c) return 0;
  if (gainDB === c.gainDB) return 1;
  const gainDBChange = f322(gainDB - c.gainDB);
  for (const v of f.voices)
    if (v.playingPreset !== -1 && v.playingChannel === channel) v.noteGainDB = f322(v.noteGainDB + gainDBChange);
  c.gainDB = gainDB;
  return 1;
}
function tsf_channel_set_pitchwheel(f, channel, pitch_wheel) {
  const c = tsf_channel_init(f, channel);
  if (!c) return 0;
  if (c.pitchWheel === pitch_wheel) return 1;
  c.pitchWheel = pitch_wheel & 65535;
  tsf_channel_applypitch(f, channel, c);
  return 1;
}
function tsf_channel_set_pitchrange(f, channel, pitch_range) {
  const c = tsf_channel_init(f, channel);
  if (!c) return 0;
  if (c.pitchRange === pitch_range) return 1;
  c.pitchRange = pitch_range;
  if (c.pitchWheel !== 8192) tsf_channel_applypitch(f, channel, c);
  return 1;
}
function tsf_channel_set_tuning(f, channel, tuning) {
  const c = tsf_channel_init(f, channel);
  if (!c) return 0;
  if (c.tuning === tuning) return 1;
  c.tuning = tuning;
  tsf_channel_applypitch(f, channel, c);
  return 1;
}
function tsf_channel_set_sustain(f, channel, flag_sustain) {
  const c = tsf_channel_init(f, channel);
  if (!c) return 0;
  if (!c.sustain === !flag_sustain) return 1;
  c.sustain = flag_sustain ? 1 : 0;
  if (flag_sustain) return 1;
  for (const v of f.voices)
    if (v.playingPreset !== -1 && v.playingChannel === channel && v.ampenv.segment < TSF_SEGMENT_RELEASE && v.heldSustain)
      tsf_voice_end(f, v);
  return 1;
}
function tsf_channel_note_on(f, channel, key, vel) {
  if (!f.channels || channel >= f.channels.channelNum) return 1;
  f.channels.activeChannel = channel;
  if (!vel) {
    tsf_channel_note_off(f, channel, key);
    return 1;
  }
  return tsf_note_on(f, f.channels.channels[channel].presetIndex, key, vel);
}
function tsf_channel_note_off(f, channel, key) {
  let vMatchFirst = null, vMatchLast = null;
  for (const v of f.voices) {
    if (v.playingPreset === -1 || v.playingChannel !== channel || v.playingKey !== key || v.ampenv.segment >= TSF_SEGMENT_RELEASE || v.heldSustain)
      continue;
    else if (!vMatchFirst || v.playIndex < vMatchFirst.playIndex) vMatchFirst = vMatchLast = v;
    else if (v.playIndex === vMatchFirst.playIndex) vMatchLast = v;
  }
  if (!vMatchFirst) return;
  const first = vMatchFirst;
  const sustain = f.channels.channels[channel].sustain;
  const iFirst = f.voices.indexOf(first), iLast = f.voices.indexOf(vMatchLast);
  for (let i = iFirst; i <= iLast; i++) {
    const v = f.voices[i];
    if (v !== first && v !== vMatchLast && (v.playIndex !== first.playIndex || v.playingPreset === -1 || v.playingChannel !== channel || v.playingKey !== key || v.ampenv.segment >= TSF_SEGMENT_RELEASE))
      continue;
    if (sustain) v.heldSustain = 1;
    else tsf_voice_end(f, v);
  }
}
function tsf_channel_note_off_all(f, channel) {
  for (const v of f.voices)
    if (v.playingPreset !== -1 && v.playingChannel === channel && v.ampenv.segment < TSF_SEGMENT_RELEASE)
      tsf_voice_end(f, v);
}
function tsf_channel_sounds_off_all(f, channel) {
  for (const v of f.voices)
    if (v.playingPreset !== -1 && v.playingChannel === channel && (v.ampenv.segment < TSF_SEGMENT_RELEASE || v.ampenv.parameters.release))
      tsf_voice_endquick(f, v);
}
function tsf_channel_midi_control(f, channel, controller, control_value) {
  const c = tsf_channel_init(f, channel);
  if (!c) return 0;
  switch (controller) {
    case 7:
      c.midiVolume = (c.midiVolume & 127 | control_value << 7) & 65535;
      break;
    case 39:
      c.midiVolume = (c.midiVolume & 16256 | control_value) & 65535;
      break;
    case 11:
      c.midiExpression = (c.midiExpression & 127 | control_value << 7) & 65535;
      break;
    case 43:
      c.midiExpression = (c.midiExpression & 16256 | control_value) & 65535;
      break;
    case 10:
      c.midiPan = (c.midiPan & 127 | control_value << 7) & 65535;
      break;
    case 42:
      c.midiPan = (c.midiPan & 16256 | control_value) & 65535;
      break;
    case 6:
      c.midiData = (c.midiData & 127 | control_value << 7) & 16383;
      break;
    case 38:
      c.midiData = (c.midiData & 16256 | control_value) & 16383;
      break;
    case 0:
      c.bank = (32768 | control_value) & 65535;
      return 1;
    //bank select MSB alone acts like LSB
    case 32:
      c.bank = ((c.bank & 32768 ? (c.bank & 127) << 7 : 0) | control_value) & 65535;
      return 1;
    case 101:
      c.midiRPN = ((c.midiRPN === 65535 ? 0 : c.midiRPN) & 127 | control_value << 7) & 65535;
      return 1;
    case 100:
      c.midiRPN = ((c.midiRPN === 65535 ? 0 : c.midiRPN) & 16256 | control_value) & 65535;
      return 1;
    case 98:
      c.midiRPN = 65535;
      return 1;
    case 99:
      c.midiRPN = 65535;
      return 1;
    case 64:
      tsf_channel_set_sustain(f, channel, control_value >= 64 ? 1 : 0);
      return 1;
    case 120:
      tsf_channel_sounds_off_all(f, channel);
      return 1;
    case 123:
      tsf_channel_note_off_all(f, channel);
      return 1;
    case 121:
      c.midiVolume = c.midiExpression = 16383;
      c.midiPan = 8192;
      c.bank = 0;
      c.midiRPN = 65535;
      c.midiData = 0;
      tsf_channel_set_volume(f, channel, 1);
      tsf_channel_set_pan(f, channel, 0.5);
      tsf_channel_set_pitchrange(f, channel, 2);
      tsf_channel_set_tuning(f, channel, 0);
      return 1;
    default:
      return 1;
  }
  switch (controller) {
    case 7:
    case 39:
    case 11:
    case 43:
      tsf_channel_set_volume(
        f,
        channel,
        f322(rm_pow(f322(f322(c.midiVolume / F_16383) * f322(c.midiExpression / F_16383)), 3))
      );
      return 1;
    case 10:
    case 42:
      tsf_channel_set_pan(f, channel, f322(c.midiPan / F_16383));
      return 1;
    case 6:
    case 38:
      if (c.midiRPN === 0)
        tsf_channel_set_pitchrange(
          f,
          channel,
          f322((c.midiData >> 7) + f322(f322(0.01) * (c.midiData & 127)))
        );
      else if (c.midiRPN === 1)
        tsf_channel_set_tuning(
          f,
          channel,
          f322(Math.trunc(c.tuning) + f322(f322(c.midiData - 8192) / 8192))
        );
      else if (c.midiRPN === 2 && controller === 6)
        tsf_channel_set_tuning(
          f,
          channel,
          f322(f322(control_value - 64) + f322(c.tuning - Math.trunc(c.tuning)))
        );
      return 1;
    default:
      return 1;
  }
}

// packages/fmt-mid/src/midplugin.ts
var MID_STUB_CHANNELS = 1;
var MID_STUB_ROWS = 64;
var MID_DEFAULT_GAIN_DB = -10;
var MID_DRUM_CHANNEL = 9;
var f323 = Math.fround;
function midTest(bytes) {
  if (bytes.length < 14) return false;
  if (bytes[0] !== 77 || bytes[1] !== 84) return false;
  if (bytes[2] !== 104 || bytes[3] !== 100) return false;
  return bytes[7] === 6 && bytes[9] <= 2 && !(bytes[12] & 128);
}
function midLoad(bytes, ctx) {
  void ctx;
  const first = tml_load_memory(bytes);
  if (!first) {
    throw new Error("fmt-mid: not a valid MIDI file");
  }
  const info = {};
  tml_get_info(first, info);
  const tuneMs = info.time_length ?? 0;
  const tracks = [];
  for (let c = 0; c < MID_STUB_CHANNELS; ++c) {
    const event = [];
    for (let r = 0; r < MID_STUB_ROWS; ++r) event.push({ note: 0, ins: 0, vol: -1, fxt: 0, fxp: 0, f2t: 0, f2p: 0 });
    tracks.push({ rows: MID_STUB_ROWS, event });
  }
  const patterns = [{ rows: MID_STUB_ROWS, tracks }];
  const channels = [];
  for (let c = 0; c < MID_STUB_CHANNELS; ++c) channels.push({ pan: 128, vol: 64, flg: 0 });
  const mod = {
    title: "",
    format: "mid",
    comment: `SMF: ${info.used_channels ?? 0} channels, ${info.used_programs ?? 0} programs, ${info.total_notes ?? 0} notes`,
    chn: MID_STUB_CHANNELS,
    pat: 1,
    ins: 0,
    len: 1,
    restart: 0,
    xxo: [0],
    channels,
    patterns,
    instruments: [],
    samples: [],
    num_sequences: 1,
    sequences: [
      {
        ord: 0,
        entry_point: 0,
        duration: Math.round(tuneMs),
        time: 0,
        speed: 6,
        bpm: 125,
        gvl: -1,
        start_row: 0
      }
    ],
    speed: 6,
    bpm: 125,
    volbase: 64,
    gvolbase: 128,
    gvol: 128,
    quirks: 0,
    flowMode: 0,
    readEventType: 0,
    periodType: 0,
    defpan: 128,
    time_factor: 10,
    rrate: 250,
    c4rate: 8363,
    compare_vblank: false,
    tracker: "TinySoundFont (SMF)",
    endless: true
    // MIDI tunes end via sequence duration — playBuffer treats loop as infinite
  };
  return mod;
}
var g_TinySoundFont = null;
var g_MidiMessage = null;
var g_Msec = 0;
var g_Rate = 44100;
var g_MidiFirst = null;
function midSetSoundfont(sf2) {
  const f = tsf_load_memory(sf2);
  if (!f) throw new Error("fmt-mid: not a valid SoundFont (.sf2)");
  g_TinySoundFont = f;
  return f.presetNum;
}
function midHasSoundfont() {
  return g_TinySoundFont !== null;
}
function midStartTune(bytes, sampleRate, gainDb = MID_DEFAULT_GAIN_DB) {
  const f = g_TinySoundFont;
  if (!f) throw new Error("fmt-mid: no soundfont loaded (call midSetSoundfont first)");
  const first = tml_load_memory(bytes);
  if (!first) throw new Error("fmt-mid: not a valid MIDI file");
  g_MidiFirst = first;
  g_MidiMessage = first;
  g_Msec = 0;
  g_Rate = sampleRate;
  tsf_reset(f);
  tsf_channel_set_bank_preset(f, MID_DRUM_CHANNEL, 128, 0);
  tsf_set_output(f, TSF_STEREO_INTERLEAVED, sampleRate, f323(gainDb));
}
function getMidPlayTimeMs() {
  return g_Msec;
}
function midDispatch() {
  const f = g_TinySoundFont;
  for (; g_MidiMessage && g_Msec >= g_MidiMessage.time; g_MidiMessage = g_MidiMessage.next) {
    const m = g_MidiMessage;
    switch (m.type) {
      case TML_PROGRAM_CHANGE:
        tsf_channel_set_presetnumber(f, m.channel, m.key, m.channel === MID_DRUM_CHANNEL);
        break;
      case TML_NOTE_ON:
        tsf_channel_note_on(f, m.channel, m.key, f323(m.velocity / 127));
        break;
      case TML_NOTE_OFF:
        tsf_channel_note_off(f, m.channel, m.key);
        break;
      case TML_PITCH_BEND:
        tsf_channel_set_pitchwheel(f, m.channel, m.pitch_bend);
        break;
      case TML_CONTROL_CHANGE:
        tsf_channel_midi_control(f, m.channel, m.key, m.velocity);
        break;
    }
  }
}
function midRenderBlock(out, off, blockSamples) {
  g_Msec += blockSamples * (1e3 / g_Rate);
  midDispatch();
  tsf_render_float(g_TinySoundFont, out, off, blockSamples, false);
}
function midSeek(targetMs) {
  if (!g_TinySoundFont || !g_MidiFirst) return;
  const target = Math.max(0, targetMs);
  midFifoReset();
  if (target < g_Msec) {
    g_MidiMessage = g_MidiFirst;
    g_Msec = 0;
    tsf_reset(g_TinySoundFont);
    tsf_channel_set_bank_preset(g_TinySoundFont, MID_DRUM_CHANNEL, 128, 0);
    tsf_set_output(g_TinySoundFont, TSF_STEREO_INTERLEAVED, g_Rate, f323(MID_DEFAULT_GAIN_DB));
  }
  const sink = new Float32Array(TSF_RENDER_EFFECTSAMPLEBLOCK * 2);
  while (g_MidiMessage && g_Msec < target) {
    midRenderBlock(sink, 0, TSF_RENDER_EFFECTSAMPLEBLOCK);
  }
}
var g_Fifo = new Float32Array(TSF_RENDER_EFFECTSAMPLEBLOCK * 2);
var g_FifoPos = TSF_RENDER_EFFECTSAMPLEBLOCK;
var g_FifoLen = TSF_RENDER_EFFECTSAMPLEBLOCK;
function midFifoReset() {
  g_FifoPos = TSF_RENDER_EFFECTSAMPLEBLOCK;
  g_FifoLen = TSF_RENDER_EFFECTSAMPLEBLOCK;
}
var midDsp = {
  name: "mid",
  channels: 1,
  renderFrame(core, out, ticks) {
    const frames = ticks * core.ticksize;
    let written = 0;
    while (written < frames) {
      if (g_FifoPos >= g_FifoLen) {
        midRenderBlock(g_Fifo, 0, TSF_RENDER_EFFECTSAMPLEBLOCK);
        g_FifoPos = 0;
        g_FifoLen = TSF_RENDER_EFFECTSAMPLEBLOCK;
      }
      const take = Math.min(frames - written, g_FifoLen - g_FifoPos);
      out.set(g_Fifo.subarray(g_FifoPos * 2, (g_FifoPos + take) * 2), written * 2);
      g_FifoPos += take;
      written += take;
    }
  },
  reset() {
    midFifoReset();
    if (g_TinySoundFont && g_MidiFirst) {
      g_MidiMessage = g_MidiFirst;
      g_Msec = 0;
      tsf_reset(g_TinySoundFont);
      tsf_channel_set_bank_preset(g_TinySoundFont, MID_DRUM_CHANNEL, 128, 0);
      tsf_set_output(g_TinySoundFont, TSF_STEREO_INTERLEAVED, g_Rate, f323(MID_DEFAULT_GAIN_DB));
    }
  },
  onRow(_core, _chn, _ev) {
  }
};
var plugin = {
  name: "mid",
  test: midTest,
  load: midLoad,
  readEvent() {
  }
};
export {
  TSF_MONO,
  TSF_RENDER_EFFECTSAMPLEBLOCK,
  TSF_STEREO_INTERLEAVED,
  TSF_STEREO_UNWEAVED,
  TmlMessage,
  Tsf,
  getMidPlayTimeMs,
  midDsp,
  midHasSoundfont,
  midLoad,
  midSeek,
  midSetSoundfont,
  midStartTune,
  midTest,
  plugin,
  tml_get_info,
  tml_get_tempo_value,
  tml_load_memory,
  tsf_load_memory,
  tsf_render_float,
  tsf_render_short
};

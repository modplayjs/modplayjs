// Ported from: libxmp src/hmn_extras.c + src/flt_extras.c + src/med_extras.c
// + src/extras.c (play_extras / get_volume / process_fx dispatch).
// The HMN "Mupp" wavetable synth, the StarTrekker AM synth, and the MED
// synth/hold-decay engine run per frame inside play_channel, before volume
// processing.

import type { Core, ChannelState, Event, HmnInstrumentExtras, FltInstrumentExtras, MedInstrumentExtras, MedChannelExtras } from '../index.js';
import { FltEnvStage, FX, MED_SYNTH_ENV_LOOP, VolSlideFlag } from '../index.js';
import { TEST } from './helpers.js';

/** MED_VER constants (loaders/med.h:9-19). */
export const MED_VER_210 = 0x0210;
export const MED_VER_300 = 0x0300;
export const MED_VER_320 = 0x0320;
export const MED_VER_OCTAMED_100 = 0x1000;
export const MED_VER_OCTAMED_200 = 0x2000;
export const MED_VER_OCTAMED_300 = 0x3000;
export const MED_VER_OCTAMED_400 = 0x4000;
export const MED_VER_OCTAMED_500 = 0x5000;
export const MED_VER_OCTAMED_502 = 0x5002;
export const MED_VER_OCTAMED_SS_1 = 0x6000;
export const MED_VER_OCTAMED_SS_2 = 0x7000;

/** hmn_extras.c:36-67 megaarp table. */
const MEGAARP: number[][] = [
  [0, 3, 7, 12, 15, 12, 7, 3, 0, 3, 7, 12, 15, 12, 7, 3],
  [0, 4, 7, 12, 16, 12, 7, 4, 0, 4, 7, 12, 16, 12, 7, 4],
  [0, 3, 8, 12, 15, 12, 8, 3, 0, 3, 8, 12, 15, 12, 8, 3],
  [0, 4, 8, 12, 16, 12, 8, 4, 0, 4, 8, 12, 16, 12, 8, 4],
  [0, 5, 8, 12, 17, 12, 8, 5, 0, 5, 8, 12, 17, 12, 8, 5],
  [0, 5, 9, 12, 17, 12, 9, 5, 0, 5, 9, 12, 17, 12, 9, 5],
  [12, 0, 7, 0, 3, 0, 7, 0, 12, 0, 7, 0, 3, 0, 7, 0],
  [12, 0, 7, 0, 4, 0, 7, 0, 12, 0, 7, 0, 4, 0, 7, 0],
  [0, 3, 7, 3, 7, 12, 7, 12, 15, 12, 7, 12, 7, 3, 7, 3],
  [0, 4, 7, 4, 7, 12, 7, 12, 16, 12, 7, 12, 7, 4, 7, 4],
  [31, 27, 24, 19, 15, 12, 7, 3, 0, 3, 7, 12, 15, 19, 24, 27],
  [31, 28, 24, 19, 16, 12, 7, 4, 0, 4, 7, 12, 16, 19, 24, 28],
  [0, 12, 0, 12, 0, 12, 0, 12, 0, 12, 0, 12, 0, 12, 0, 12],
  [0, 12, 24, 12, 0, 12, 24, 12, 0, 12, 24, 12, 0, 12, 24, 12],
  [0, 3, 0, 3, 0, 3, 0, 3, 0, 3, 0, 3, 0, 3, 0, 3],
  [0, 4, 0, 4, 0, 4, 0, 4, 0, 4, 0, 4, 0, 4, 0, 4],
];


function hmnPlayExtras(core: Core, chn: number, xc: ChannelState): void {
  const ins = core.module!.instruments[xc.ins]!;
  const ie = ins.extras as HmnInstrumentExtras | undefined;
  const ce = xc.extras;
  if (!ie || !ce || !('datapos' in ce)) return;

  if (core.ctx.p.frame === 0 && (TEST(xc, VolSlideFlag.NEW_NOTE) !== 0 || TEST(xc, VolSlideFlag.NEW_INS) !== 0)) {
    ce.datapos = 0;
  }

  const pos = ce.datapos & 63; /* TODO: how are out of bounds values handled? */
  const waveform = ie.data[pos] ?? 0;
  const volume = (ie.progvolume[pos] ?? 0) & 0x7f;

  if (waveform < ins.nsm && ins.sub[waveform]!.sid !== xc.smp) {
    xc.smp = ins.sub[waveform]!.sid;
    core.virt.setSmp(chn, xc.smp);
  }

  let next = pos + 1;
  if (next > ie.dataloopend) next = ie.dataloopstart;

  ce.datapos = next;
  ce.volume = volume;
}

/** flt_extras.c:27-47 tick_envelope. */
function fltTickEnvelope(
  ce: { volume: number; env_stage: number },
  target: number,
  rate: number,
  nextStage: number,
): void {
  let x: number;
  if (target > ce.volume) {
    x = ce.volume + rate;
    if (x > target) x = target;
  } else {
    x = ce.volume - rate;
    if (x < target) x = target;
  }
  ce.volume = x;
  if (x === target) {
    ce.env_stage = nextStage;
  }
}

function fltPlayExtras(core: Core, chn: number, xc: ChannelState): void {
  const mod = core.module!;
  const ins = mod.instruments[xc.ins]!;
  const ie = ins.extras as FltInstrumentExtras | undefined;
  const ce = xc.extras;
  if (!ie || !ce || !('env_stage' in ce)) return;

  if (core.ctx.p.frame === 0) {
    if (TEST(xc, VolSlideFlag.NEW_NOTE) !== 0 && TEST(xc, VolSlideFlag.TONEPORTA) === 0) {
      /* Note with or without ins #, no toneporta -> reset. */
      ce.volume = ie.l0;
      ce.sustain = ie.st;
      ce.env_stage = FltEnvStage.ATTACK_1;
    } else if (TEST(xc, VolSlideFlag.NEW_INS) !== 0) {
      /* Ins # without note cuts (regardless of # or toneporta).
       * Ins # with note and toneporta also cuts(?!). */
      ce.volume = 0;
      ce.env_stage = FltEnvStage.RELEASE;
    } else if (TEST(xc, VolSlideFlag.NEW_NOTE) !== 0 && TEST(xc, VolSlideFlag.TONEPORTA) !== 0) {
      /* StarTrekker forgot to adjust the toneporta target by FQ, so
       * reverse transpose (flt_am_period_fall.mod). */
      xc.porta.target /= 1 << ie.fq;
      xc.porta.dir = xc.period < xc.porta.target ? 1 : -1;
    }
  }

  switch (ce.env_stage) {
    case FltEnvStage.ATTACK_1:
      fltTickEnvelope(ce, ie.a1l, ie.a1s, FltEnvStage.ATTACK_2);
      break;
    case FltEnvStage.ATTACK_2:
      fltTickEnvelope(ce, ie.a2l, ie.a2s, FltEnvStage.DECAY);
      break;
    case FltEnvStage.DECAY:
      fltTickEnvelope(ce, ie.sl, ie.ds, FltEnvStage.SUSTAIN);
      break;
    case FltEnvStage.SUSTAIN:
      /* Total duration is ST + 1 ticks. */
      if (ce.sustain > 0) {
        ce.sustain--;
      } else {
        ce.env_stage = FltEnvStage.RELEASE;
      }
      break;
    case FltEnvStage.RELEASE:
      fltTickEnvelope(ce, 0, ie.rs, FltEnvStage.RELEASE);
      break;
  }

  /* Add directly to the period--this influences things like toneporta. */
  xc.period += ie.p_fall;
  void chn;
}

/** libxmp_play_extras (extras.c:106-122). */
export function playExtras(core: Core, chn: number, xc: ChannelState): void {
  const mod = core.module!;
  if (mod.extras?.kind === 'flt' && xc.extras && 'env_stage' in xc.extras) {
    fltPlayExtras(core, chn, xc);
    return;
  }
  if (xc.ins >= mod.ins) return; // SFX instruments have no extras
  const ie = mod.instruments[xc.ins]?.extras;
  if (ie && 'volTable' in ie) {
    medPlayExtras(core, chn, xc);
  } else if (ie && 'progvolume' in ie) {
    hmnPlayExtras(core, chn, xc);
  }
}

/** libxmp_extras_get_volume (extras.c:124-140): extras override the channel
 *  volume before the mixer. Returns xc.volume when no extras apply. */
export function extrasGetVolume(core: Core, xc: ChannelState): number {
  const mod = core.module!;
  if (xc.ins < 0 || xc.ins >= mod.ins) return xc.volume;
  const ie = mod.instruments[xc.ins]?.extras;
  const ce = xc.extras;
  if (!ie || !ce) return xc.volume;
  if ('progvolume' in ie && 'datapos' in ce) {
    // HMN: ce->volume * xc->volume / 64
    return Math.trunc((ce.volume * xc.volume) / 64);
  }
  if ('volTable' in ie && 'hold_count' in ce) {
    // MED: ce->volume * xc->volume / 64
    return Math.trunc((ce.volume * xc.volume) / 64);
  }
  if ('env_stage' in ce) {
    // FLT: amplitude overrides channel volume (divided by 4 for the
    // 0-1024 envelope range vs 0-256 volume base).
    return Math.trunc(ce.volume / 4);
  }
  return xc.volume;
}

/** libxmp_extras_get_period (extras.c:143-151): MED synth vibrato period. */
export function extrasGetPeriod(xc: ChannelState): number {
  const ce = xc.extras;
  if (ce && 'hold_count' in ce) return medChangePeriod(xc);
  return 0;
}

/** libxmp_extras_get_linear_bend (extras.c:154-165): MED synth arpeggio. */
export function extrasGetLinearBend(core: Core, xc: ChannelState): number {
  const ce = xc.extras;
  if (ce && 'hold_count' in ce) return medLinearBend(core, xc);
  return 0;
}

/** libxmp_extras_process_fx (extras.c:168-177): MED FX_MED_HOLD arm. */
export function extrasProcessFx(xc: ChannelState, fxt: number, fxp: number, note: number, ins: number): void {
  const ce = xc.extras;
  if (ce && 'hold_count' in ce) {
    switch (fxt) {
      case FX.FX_MED_HOLD:
        // Command 08 is only valid beside a note+ins.
        if (note - 1 >= 0 && note - 1 < 121 && ins - 1 >= 0) {
          medSetHoldDecay(xc, fxp & 0x0f, (fxp >> 4) & 0x0f);
        }
        break;
    }
  }
}

/** libxmp_hmn_extras_process_fx (hmn_extras.c:121-141): FX_MEGAARP arm. */
export function hmnProcessFx(xc: ChannelState, fxt: number, fxp: number): void {
  if (fxt === FX.FX_MEGAARP) {
    /* Not sure if this is correct... */
    const idx = fxp & 0x0f;
    const table = MEGAARP[idx]!;
    for (let i = 0; i < 16; i++) xc.arpeggio.val[i] = table[i]!;
    xc.arpeggio.size = 16;
  }
}

// ---------------------------------------------------------------------------
// MED synth + hold/decay (med_extras.c)
// ---------------------------------------------------------------------------

/** Sine table (med_extras.c:65-70). */
const MED_SINE: readonly number[] = [
  0, 49, 97, 141, 180, 212, 235, 250,
  255, 250, 235, 212, 180, 141, 97, 49,
  0, -49, -97, -141, -180, -212, -235, -250,
  -255, -250, -235, -212, -180, -141, -97, -49,
];

/** VT macro (med_extras.c:57). */
function vt(ce: MedChannelExtras, ie: MedInstrumentExtras): number {
  if (ce.vp >= 0 && ie.volTable && ce.vp < ie.vtlen) {
    return ie.volTable[ce.vp++]!;
  }
  ce.vp++;
  return 0xff;
}
/** WT macro (med_extras.c:58). */
function wt(ce: MedChannelExtras, ie: MedInstrumentExtras): number {
  if (ce.wp >= 0 && ie.wavTable && ce.wp < ie.wtlen) {
    return ie.wavTable[ce.wp++]!;
  }
  ce.wp++;
  return 0xff;
}
/** ARP macro (med_extras.c:62). */
function medArp(ie: MedInstrumentExtras, idx: number): number {
  return ie.wavTable && idx < ie.wtlen ? ie.wavTable[idx]! : 0xfd;
}

/** libxmp_med_change_period (med_extras.c:72-94): MED synth vibrato. */
export function medChangePeriod(xc: ChannelState): number {
  const ce = xc.extras as MedChannelExtras | undefined;
  if (!ce) return 0;
  const vib = Math.trunc((MED_SINE[(ce.vib_idx >> 5) & 31]! * ce.vib_depth) / (1 << 10));
  ce.vib_idx = (ce.vib_idx + ce.vib_speed) % (32 << 5);
  return vib;
}

/** libxmp_med_linear_bend (med_extras.c:97-122): MED synth arpeggio. */
export function medLinearBend(core: Core, xc: ChannelState): number {
  const mod = core.module!;
  const ce = xc.extras as MedChannelExtras | undefined;
  const ie = mod.instruments[xc.ins]?.extras as MedInstrumentExtras | undefined;
  if (!ce || ce.arp === 0 || !ie) return 0;
  if (medArp(ie, ce.arp) === 0xfd) return 0; // empty arpeggio
  let arp = medArp(ie, ce.aidx);
  if (arp === 0xfd) {
    ce.aidx = ce.arp;
    arp = medArp(ie, ce.aidx);
  }
  ce.aidx++;
  return (100 << 7) * arp;
}

/** libxmp_med_set_hold_decay (med_extras.c:140-152). */
export function medSetHoldDecay(
  xc: ChannelState, hold: number, decay: number,
): void {
  const ce = xc.extras as MedChannelExtras | undefined;
  if (!ce) return;
  if (hold <= 0) {
    hold = -1;
    decay = -1;
  }
  ce.hold_active = hold > 0 ? 1 : 0;
  ce.hold_count = hold;
  ce.decay_value = decay;
}

/** libxmp_med_hold_retrigger (med_extras.c:162-173). */
export function medHoldRetrigger(core: Core, xc: ChannelState): void {
  const mod = core.module!;
  const ce = xc.extras as MedChannelExtras | undefined;
  if (!ce) return;
  const trackerVersion =
    mod.extras?.kind === 'med' ? mod.extras.trackerVersion : 0;
  if (trackerVersion >= MED_VER_OCTAMED_300 && ce.hold_active) {
    ce.hold_count += core.ctx.p.frame;
  }
}

/** get_next_event (med_extras.c:179-191): peek the next row's event. */
function medGetNextEvent(core: Core, chn: number): Event | null {
  const p = core.ctx.p;
  const mod = core.module!;
  const pat = mod.xxo[p.ord] ?? 0;
  const track = mod.patterns[pat]?.tracks[chn];
  if (!track) return null;
  if (p.row + 1 >= track.rows) return null;
  return track.event[p.row + 1] ?? null;
}

/** libxmp_med_check_hold_symbol (med_extras.c:194-220). Should be called
 *  from read_event_med only, after effects processing. */
export function medCheckHoldSymbol(core: Core, xc: ChannelState, chn: number): void {
  const mod = core.module!;
  const ce = xc.extras as MedChannelExtras | undefined;
  if (!ce) return;
  ce.hold_sustained = 0;

  // Hold/decay added in MED 3.00 / OctaMED 1.00.
  const trackerVersion =
    mod.extras?.kind === 'med' ? mod.extras.trackerVersion : 0;
  if (trackerVersion < MED_VER_300) return;
  if (ce.hold_count <= 0) return;
  const e = medGetNextEvent(core, chn);
  if (e === null) return;

  // No note + ins -> sustain hold.
  if (!isValidNoteNext(e.note) && e.ins !== 0) {
    ce.hold_sustained = 1;
    return;
  }

  // Note + toneporta (3xx only, NOT 5xy) -> sustain hold.
  if (isValidNoteNext(e.note) &&
      (e.fxt === FX.FX_TONEPORTA || e.f2t === FX.FX_TONEPORTA)) {
    ce.hold_sustained = 1;
  }
}

/** IS_VALID_NOTE ((uint32)(x - 1) < 121). */
function isValidNoteNext(note: number): boolean {
  return note - 1 >= 0 && note - 1 < 121;
}

/** med_tick_hold_decay (med_extras.c:222-259). */
function medTickHoldDecay(core: Core, xc: ChannelState, ce: MedChannelExtras, trackerVersion: number): void {
  const p = core.ctx.p;

  if (ce.hold_count === 0) {
    // Decay 0 = instant decay.
    const dec = ce.decay_value ? ce.decay_value : xc.volume;

    xc.volume -= dec;
    if (xc.volume < 0) xc.volume = 0;
    if (xc.volume > core.module!.volbase) xc.volume = core.module!.volbase;

    if (xc.volume === 0) {
      // End hold/decay once volume 0 is reached.
      ce.hold_count = -1;
      ce.decay_value = -1;
    }
    // Hold can't be sustained/increased after decay starts(?).
    ce.hold_active = 0;
  }

  // From OctaMED 3.00 through Soundstudio v1, pattern delay (1Exx) on
  // a line with hold sustained will only sustain the hold for the first
  // execution of the row. In Soundstudio v2, the whole row sustains.
  if (ce.hold_sustained && trackerVersion < MED_VER_OCTAMED_SS_2 &&
      p.frame >= p.speed) {
    ce.hold_sustained = 0;
  }

  // Hold is sustained if the NEXT row contains a sustain event.
  if (ce.hold_count > 0 && !ce.hold_sustained) {
    ce.hold_count--;
  }
}

/** libxmp_med_play_extras (med_extras.c:262-464). */
function medPlayExtras(core: Core, chn: number, xc: ChannelState): void {
  const mod = core.module!;
  const p = core.ctx.p;
  const ce = xc.extras as MedChannelExtras | undefined;
  if (!ce) return;
  const ie = mod.instruments[xc.ins]?.extras as MedInstrumentExtras | undefined;
  const trackerVersion =
    mod.extras?.kind === 'med' ? mod.extras.trackerVersion : 0;

  // Handle hold/decay.
  medTickHoldDecay(core, xc, ce, trackerVersion);

  // Handle synth.
  if (!ie || !ie.volTable || !ie.wavTable) {
    ce.volume = 64; // we need this in extras_get_volume()
    return;
  }

  if (p.frame === 0 && TEST(xc, VolSlideFlag.NEW_NOTE) !== 0) {
    ce.period = xc.period;
    if (TEST(xc, VolSlideFlag.NEW_INS) !== 0) {
      ce.arp = 0;
      ce.aidx = 0;
      ce.vp = 0; ce.vc = 0; ce.vw = 0;
      ce.wp = 0; ce.wc = 0; ce.ww = 0;
      ce.env_wav = -1;
      ce.env_idx = 0;
      ce.flags &= ~MED_SYNTH_ENV_LOOP;
      ce.vv = 0;
      ce.wv = 0;
      ce.vs = ie.vts;
      ce.ws = ie.wts;
    }
  }

  let jws = 0;
  let jvs = 0;

  if (ce.vs > 0 && ce.vc-- === 0) {
    ce.vc = ce.vs - 1;

    if (ce.vw > 0) {
      ce.vw--;
    } else {
      let loop = 0;

      // Volume commands.
      nextVt: for (;;) {
        const b = vt(ce, ie);
        switch (b) {
          case 0xff: // END
          case 0xfb: // HLT
            ce.vp--;
            break nextVt;
          case 0xfe: { // JMP
            if (loop) break nextVt; // avoid infinite loop
            const temp = vt(ce, ie);
            ce.vp = temp;
            loop = 1;
            continue nextVt;
          }
          case 0xfa: // JWS
            jws = vt(ce, ie);
            break nextVt;
          case 0xf5: // EN2
            ce.env_wav = vt(ce, ie);
            ce.flags |= MED_SYNTH_ENV_LOOP;
            break nextVt;
          case 0xf4: // EN1
            ce.env_wav = vt(ce, ie);
            break nextVt;
          case 0xf3: // CHU
            ce.vv = vt(ce, ie);
            break nextVt;
          case 0xf2: // CHD
            ce.vv = -vt(ce, ie);
            break nextVt;
          case 0xf1: // WAI
            ce.vw = vt(ce, ie);
            break nextVt;
          case 0xf0: // SPD
            ce.vs = vt(ce, ie);
            break nextVt;
          default:
            if (b >= 0x00 && b <= 0x40) ce.volume = b;
            break nextVt;
        }
      }

      // Volume envelope.
      if (ce.env_wav >= 0 && ce.env_wav < mod.instruments[xc.ins]!.nsm) {
        const sid = mod.instruments[xc.ins]!.sub[ce.env_wav]!.sid;
        const smp = core.getSample(sid);
        if (smp.length === 0x80) { // sanity check
          // C reads the raw signed byte: ((int8)data + 0x80) >> 2.
          const b = smp.data[ce.env_idx]!;
          const signed = b >= 0.5 ? b * 128 - 128 : b < -0.5 ? b * 128 : b * 128; // float→int8
          const v = ((Math.round(b * 128) | ((Math.round(b * 128) & 0x80) ? -256 : 0)) + 0x80) >> 2;
          void signed;
          ce.volume = v;
          ce.env_idx++;

          if (ce.env_idx >= 0x80) {
            if ((ce.flags & MED_SYNTH_ENV_LOOP) === 0) {
              ce.env_wav = -1;
            }
            ce.env_idx = 0;
          }
        }
      }

      ce.volume += ce.vv;
      if (ce.volume < 0) ce.volume = 0;
      if (ce.volume > 64) ce.volume = 64;
    }
  }

  if (ce.ws > 0 && ce.wc-- === 0) {
    ce.wc = ce.ws - 1;

    if (ce.ww > 0) {
      ce.ww--;
    } else {
      let loop = 0;

      // Waveform commands.
      nextWt: for (;;) {
        const b = wt(ce, ie);
        switch (b) {
          case 0xff: // END
          case 0xfb: // HLT
            ce.wp--;
            break nextWt;
          case 0xfe: { // JMP
            if (loop) break nextWt; // avoid infinite loop
            const temp = wt(ce, ie);
            if (temp === 0xff) { // handle JMP END case
              ce.wp--; // see lepeltheme ins 0x02
              break nextWt;
            }
            ce.wp = temp;
            loop = 1;
            continue nextWt;
          }
          case 0xfd: // ARE
            break nextWt;
          case 0xfc: { // ARP
            ce.arp = ce.aidx = ce.wp++;
            let bb: number = b;
            while (bb !== 0xfd && bb !== 0xff) bb = wt(ce, ie);
            break nextWt;
          }
          case 0xfa: // JVS
            jvs = wt(ce, ie);
            break nextWt;
          case 0xf7: // VWF
            ce.vwf = wt(ce, ie);
            break nextWt;
          case 0xf6: // RES
            xc.period = ce.period;
            break nextWt;
          case 0xf5: // VBS
            ce.vib_speed = wt(ce, ie);
            break nextWt;
          case 0xf4: // VBD
            ce.vib_depth = wt(ce, ie);
            break nextWt;
          case 0xf3: // CHU
            ce.wv = -wt(ce, ie);
            break nextWt;
          case 0xf2: // CHD
            ce.wv = wt(ce, ie);
            break nextWt;
          case 0xf1: // WAI
            ce.ww = wt(ce, ie);
            break nextWt;
          case 0xf0: // SPD
            ce.ws = wt(ce, ie);
            break nextWt;
          default: {
            const ins = mod.instruments[xc.ins]!;
            if (b < ins.nsm && ins.sub[b]!.sid !== xc.smp) {
              xc.smp = ins.sub[b]!.sid;
              core.virt.setSmp(chn, xc.smp);
            }
            break nextWt;
          }
        }
      }

      xc.period += ce.wv;
    }
  }

  if (jws) {
    ce.wp = jws;
  }

  if (jvs) {
    ce.vp = jvs;
  }
}

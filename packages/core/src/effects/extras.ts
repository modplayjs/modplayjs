// Ported from: libxmp src/hmn_extras.c + src/flt_extras.c + src/extras.c
// (play_extras / get_volume / process_fx dispatch).
// The HMN "Mupp" wavetable synth and the StarTrekker AM synth run per frame
// inside play_channel, before volume processing.

import type { Core, ChannelState, HmnInstrumentExtras, FltInstrumentExtras } from '../index.js';
import { FltEnvStage, FX, VolSlideFlag } from '../index.js';
import { TEST } from './helpers.js';

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
  if (ie && 'progvolume' in ie) {
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
  if ('env_stage' in ce) {
    // FLT: amplitude overrides channel volume (divided by 4 for the
    // 0-1024 envelope range vs 0-256 volume base).
    return Math.trunc(ce.volume / 4);
  }
  return xc.volume;
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

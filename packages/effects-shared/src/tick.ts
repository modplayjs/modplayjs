// Per-tick channel process stage: play_channel (player.c:1599-1697) and its
// helpers — envelopes (player.c:70-330), tremor (:880-927), arpeggio
// (:625-664), is_first_frame (:666-681), update_volume (:1414-1499),
// update_frequency (:1501-1577), update_pan (:1579-1597), process_volume
// (:971-1129), process_frequency (:1131-1346), process_pan (:1348-1412),
// filter_setup (filter.c:90-116), invloop (:558-601), delayed_keyoff
// (:932-957). The core calls processTick once per channel per frame, from
// play_frame (player.c:2166 play_channel(ctx, i)).

import type { Core, ChannelState, Envelope, Instrument, SampleData } from '@modplayjs/core';
import { Act, PastNote } from '@modplayjs/core';
import {
  Quirk,
  ReadEventType,
  PeriodType,
  EnvelopeFlags,
  SampleFlags,
  RowDelay,
} from '@modplayjs/core';
import {
  RESET,
  TEST,
  SET_NOTE,
  TEST_NOTE,
  RESET_PER,
  TEST_PER,
  hasQuirk,
  noteToPeriod,
  periodToBend,
  PERIOD_BASE,
  MIN_PERIOD_L,
  MAX_PERIOD_L,
  MIN_NOTE_MOD,
  MAX_NOTE_MOD,
  lfoGet,
  lfoUpdate,
  VOL_SLIDE,
  PAN_SLIDE,
  PITCHBEND,
  TONEPORTA,
  VIBRATO,
  TREMOLO,
  FINE_VOLS,
  FINE_BEND,
  TRK_VSLIDE,
  TRK_FVSLIDE,
  NEW_INS,
  VOL_SLIDE_2,
  NOTE_SLIDE,
  FINE_NSLIDE,
  RETRIG,
  PANBRELLO,
  GVOL_SLIDE,
  TEMPO_SLIDE,
  VENV_PAUSE,
  PENV_PAUSE,
  FENV_PAUSE,
  FINE_VOLS_2,
  KEY_OFF_FLAG,
  TREMOR_FLAG,
  NOTE_FADEOUT,
  NOTE_ENV_RELEASE,
  NOTE_RELEASE,
  NOTE_END,
  NOTE_ENV_END,
  NOTE_SAMPLE_END,
  NOTE_SUSEXIT,
  NOTE_GLISSANDO,
  NOTE_SAMPLE_RELEASE,
} from './helpers.js';

// player.h:164-165
export const TREMOR_ON = 0x80;
export const TREMOR_SUPPRESS = 0x40;

// mixer.h:23
export const PAN_SURROUND = 0x8000;

// xmp.h:68 XMP_FORMAT_MONO
const XMP_FORMAT_MONO = 1 << 2;

// virtual.h:6-12 — NNA action codes (XMP_INST_NNA_*) + status.
export const VIRT_ACTION_CUT = 0x00;
export const VIRT_ACTION_CONT = 0x01;
export const VIRT_ACTION_OFF = 0x02;
export const VIRT_ACTION_FADE = 0x03;
export const VIRT_ACTIVE = 0x100;
export const VIRT_INVALID = -1;

// common.h:447-451 — DSP effect codes (mixer_seteffect mixer.c:1000-1024).
export const DSP_EFFECT_CUTOFF = 0x02;
export const DSP_EFFECT_RESONANCE = 0x03;
export const DSP_EFFECT_FILTER_A0 = 0xb0;
export const DSP_EFFECT_FILTER_B0 = 0xb1;
export const DSP_EFFECT_FILTER_B1 = 0xb2;

// filter.c:12
const FILTER_SHIFT = 22;

// Retrigger control table (player.c:52-58): s = volume add, m = multiply,
// d = divide; index 0x10 is note cut.
const rval: { s: number; m: number; d: number }[] = [
  { s: 0, m: 1, d: 1 }, { s: -1, m: 1, d: 1 }, { s: -2, m: 1, d: 1 },
  { s: -4, m: 1, d: 1 }, { s: -8, m: 1, d: 1 }, { s: -16, m: 1, d: 1 },
  { s: 0, m: 2, d: 3 }, { s: 0, m: 1, d: 2 },
  { s: 0, m: 1, d: 1 }, { s: 1, m: 1, d: 1 }, { s: 2, m: 1, d: 1 },
  { s: 4, m: 1, d: 1 }, { s: 8, m: 1, d: 1 }, { s: 16, m: 1, d: 1 },
  { s: 0, m: 3, d: 2 }, { s: 0, m: 2, d: 1 },
  { s: 0, m: 0, d: 1 }, /* Note cut */
];

// Invert loop speed table (player.c:558-560).
const invloop_table = [
  0, 5, 6, 7, 8, 10, 11, 13, 16, 19, 22, 26, 32, 43, 64, 128,
];

// filter.c:39-41 — resonance_table[i] = pow(10, -3*i/320).
const resonance_table: number[] = (() => {
  const t: number[] = [];
  for (let i = 0; i < 128; i++) {
    t.push(Math.pow(10.0, (-3.0 * i) / 320.0));
  }
  return t;
})();

const CLAMP = (v: number, lo: number, hi: number): number =>
  v < lo ? lo : v > hi ? hi : v;

const IS_PLAYER_MODE_IT = (core: Core): boolean =>
  core.ctx.m.readEventType === ReadEventType.IT;
const IS_PLAYER_MODE_FT2 = (core: Core): boolean =>
  core.ctx.m.readEventType === ReadEventType.FT2;

/** libxmp_get_instrument (smix.c:157-175). smix path absent (smix->ins == 0);
 * out-of-range yields instrument 0 as a neutral stand-in for the C NULL —
 * unreachable: play_channel gates calls on IS_VALID_INSTRUMENT_OR_SFX. */
function getInstrument(core: Core, ins: number): Instrument {
  const m = core.ctx.m;
  const i = ins >= 0 && ins < m.instruments.length ? ins : 0;
  return m.instruments[i]!;
}

// ---------------------------------------------------------------------------
// Envelopes (player.c:70-330). The reference stores node pairs in a flat
// int16 array data[2n]=x, data[2n+1]=y; our Envelope keeps parallel x[]/y[]
// arrays, so data[idx] maps to env.x[idx>>1], data[idx+1] to env.y[idx>>1].
// ---------------------------------------------------------------------------

/** check_envelope_end (player.c:70-88). */
export function checkEnvelopeEnd(env: Envelope, x: number): number {
  if ((~env.flags & EnvelopeFlags.ON) !== 0 || env.npt <= 0) {
    return 0;
  }

  const idx = env.npt - 1;

  /* last node */
  if (x >= env.x[idx]! || idx === 0) {
    if ((~env.flags & EnvelopeFlags.LOOP) !== 0) {
      return 1;
    }
  }

  return 0;
}

/** get_envelope (player.c:90-120). */
export function getEnvelope(env: Envelope, x: number, def: number): number {
  if (x < 0 || (~env.flags & EnvelopeFlags.ON) !== 0 || env.npt <= 0) {
    return def;
  }

  let idx = env.npt - 1; /* node index */

  let x1 = env.x[idx]!; /* last node */
  if (x >= x1 || idx === 0) {
    return env.y[idx]!;
  }

  do {
    idx -= 1;
    x1 = env.x[idx]!;
  } while (idx > 0 && x1 > x);

  /* interpolate */
  const y1 = env.y[idx]!;
  const x2 = env.x[idx + 1]!;
  const y2 = env.y[idx + 1]!;

  /* Interpolation requires x1 <= x <= x2 */
  if (x < x1 || x2 < x1) return y1;

  /* C int math: (y2-y1)*(x-x1)/(x2-x1) truncates, then + y1 (player.c:119) */
  return x2 === x1 ? y2 : Math.trunc(((y2 - y1) * (x - x1)) / (x2 - x1)) + y1;
}

/** update_envelope_generic (player.c:124-189). */
function updateEnvelopeGeneric(env: Envelope, x: number, release: boolean): number {
  const hasLoop = (env.flags & EnvelopeFlags.LOOP) !== 0;
  let hasSus = (env.flags & EnvelopeFlags.SUS) !== 0;
  const lps = env.lps;
  const lpe = env.lpe;
  const sus = env.sus;

  /* FT2 and IT envelopes behave in a different way regarding loops,
   * sustain and release. When the sustain point is at the end of the
   * envelope loop end and the key is released, FT2 escapes the loop
   * while IT runs another iteration. (See EnvLoops.xm in the OpenMPT
   * test cases.)
   */
  if (hasLoop && hasSus && sus === lpe) {
    if (!release) {
      hasSus = false;
    }
  }

  /* If the envelope point is set to somewhere after the sustain point
   * or sustain loop, enable release to prevent the envelope point from
   * returning to the sustain point or loop start.
   */
  if (hasLoop && x > env.x[lpe]! + 1) {
    release = true;
  } else if (hasSus && x > env.x[sus]! + 1) {
    release = true;
  }

  /* If enabled, stay at the sustain point */
  if (hasSus && !release) {
    if (x >= env.x[sus]!) {
      x = env.x[sus]!;
    }
  }

  /* XM-like formats and players assume that an envelope position past the
   * end of the loop or sustain point should return to the loop/sustain
   * point.
   */
  if (hasLoop && x >= env.x[lpe]!) {
    /* FT2 and IT envelopes behave in a different way regarding
     * loops, sustain and release. When the sustain point is at the
     * end of the envelope loop end and the key is released, FT2
     * escapes the loop while IT runs another iteration.
     * (See OpenMPT EnvLoops.xm)
     */
    if (!(release && hasSus && sus === lpe)) {
      x = env.x[lps]!;
    }
  }

  return x;
}

/** update_envelope_xm (player.c:191-228). */
function updateEnvelopeXm(env: Envelope, x: number, release: boolean): number {
  const hasLoop = (env.flags & EnvelopeFlags.LOOP) !== 0;
  const hasSus = (env.flags & EnvelopeFlags.SUS) !== 0;
  const lps = env.lps;
  const lpe = env.lpe;
  const sus = env.sus;

  /* If the envelope point is set to somewhere after the sustain point
   * or sustain loop, enable release to prevent the envelope point from
   * returning to the sustain point or loop start.
   */
  if (hasSus && x > env.x[sus]! + 1) {
    release = true;
  }

  /* If enabled, stay at the sustain point */
  if (hasSus && !release) {
    if (x >= env.x[sus]!) {
      x = env.x[sus]!;
    }
  }

  /* Envelope loops
   *
   * If the envelope point is set to somewhere after the sustain point
   * or sustain loop, the loop point is ignored to prevent the envelope
   * point from returning to the sustain point or loop start.
   */
  if (hasLoop && x === env.x[lpe]!) {
    if (!(release && hasSus && sus === lpe)) {
      x = env.x[lps]!;
    }
  }

  return x;
}

/** update_envelope_it (player.c:231-260). */
function updateEnvelopeIt(
  env: Envelope,
  x: number,
  release: boolean,
  keyOff: boolean,
): number {
  const hasLoop = (env.flags & EnvelopeFlags.LOOP) !== 0;
  const hasSus = (env.flags & EnvelopeFlags.SUS) !== 0;
  const lps = env.lps;
  const lpe = env.lpe;
  const sus = env.sus;
  const sue = env.sue;

  /* Release at the end of a sustain loop, run another loop */
  if (hasSus && keyOff && x === env.x[sue]! + 1) {
    x = env.x[sus]!;
  } else if (hasSus && !release) {
    /* If enabled, stay in the sustain loop */
    if (x === env.x[sue]! + 1) {
      x = env.x[sus]!;
    }
  } else if (hasLoop) {
    /* Finally, execute the envelope loop */
    if (x > env.x[lpe]!) {
      x = env.x[lps]!;
    }
  }

  return x;
}

/** update_envelope (player.c:262-292). */
export function updateEnvelope(
  core: Core,
  env: Envelope,
  x: number,
  release: boolean,
  keyOff: boolean,
): number {
  if (x < 0xffff) {
    /* increment tick */
    x++;
  }

  if (x < 0) {
    return -1;
  }

  if ((~env.flags & EnvelopeFlags.ON) !== 0 || env.npt <= 0) {
    return x;
  }

  if (IS_PLAYER_MODE_IT(core)) {
    return updateEnvelopeIt(env, x, release, keyOff);
  }
  if (!hasQuirk(core, Quirk.FT2ENV)) {
    return updateEnvelopeGeneric(env, x, release);
  }
  return updateEnvelopeXm(env, x, release);
}

/** check_envelope_fade (player.c:294-313). Returns 0 / -1 (end→0) / 1. */
export function checkEnvelopeFade(env: Envelope, x: number): number {
  if ((~env.flags & EnvelopeFlags.ON) !== 0) {
    return 0;
  }

  const idx = env.npt - 1; /* last node */
  if (x > env.x[idx]!) {
    if (env.y[idx] === 0) {
      return -1;
    } else {
      return 1;
    }
  }

  return 0;
}

// ---------------------------------------------------------------------------
// Arpeggio (player.c:625-664)
// ---------------------------------------------------------------------------

/** ft2_arpeggio (player.c:625-647). */
function ft2Arpeggio(core: Core, xc: ChannelState): number {
  const p = core.ctx.p;

  if (xc.arpeggio.val[1] === 0 && xc.arpeggio.val[2] === 0) {
    return 0;
  }

  if (p.frame === 0) {
    return 0;
  }

  const i = p.speed - (p.frame % p.speed);

  if (i === 16) {
    return 0;
  } else if (i > 16) {
    return xc.arpeggio.val[2]!;
  }

  return xc.arpeggio.val[i % 3]!;
}

/** arpeggio (player.c:649-664). */
export function arpeggio(core: Core, xc: ChannelState): number {
  let arp: number;

  if (hasQuirk(core, Quirk.FT2BUGS)) {
    arp = ft2Arpeggio(core, xc);
  } else {
    arp = xc.arpeggio.val[xc.arpeggio.count] ?? 0;
  }

  xc.arpeggio.count++;
  xc.arpeggio.count %= xc.arpeggio.size;

  return arp;
}

// ---------------------------------------------------------------------------
// is_first_frame (player.c:666-681)
// ---------------------------------------------------------------------------

export function isFirstFrame(core: Core): boolean {
  const p = core.ctx.p;

  switch (core.ctx.m.readEventType) {
    case ReadEventType.IT:
    case ReadEventType.ST3:
      return p.frame % p.speed === 0;
    default:
      return p.frame === 0;
  }
}

// ---------------------------------------------------------------------------
// Tremor (player.c:880-927)
// ---------------------------------------------------------------------------

/** tremor_ft2 (player.c:880-903). */
function tremorFt2(core: Core, xc: ChannelState, finalvol: number): number {
  const p = core.ctx.p;

  if (TEST(xc, TREMOR_FLAG) !== 0 && p.frame !== 0) {
    xc.tremor.count &= ~TREMOR_SUPPRESS;
    if (xc.tremor.count === 0) {
      /* end of down cycle, set up counter for up  */
      xc.tremor.count = xc.tremor.up | TREMOR_ON;
    } else if (xc.tremor.count === TREMOR_ON) {
      /* end of up cycle, set up counter for down */
      xc.tremor.count = xc.tremor.down;
    } else {
      xc.tremor.count--;
    }
  }

  if ((xc.tremor.count & (TREMOR_ON | TREMOR_SUPPRESS)) === 0) {
    finalvol = 0;
  }

  return finalvol;
}

/** tremor_s3m (player.c:905-927). */
function tremorS3m(xc: ChannelState, finalvol: number): number {
  if (TEST(xc, TREMOR_FLAG) !== 0) {
    if (xc.tremor.count === 0) {
      /* end of down cycle, set up counter for up  */
      xc.tremor.count = xc.tremor.up | TREMOR_ON;
    } else if (xc.tremor.count === TREMOR_ON) {
      /* end of up cycle, set up counter for down */
      xc.tremor.count = xc.tremor.down;
    }

    xc.tremor.count--;

    if ((~xc.tremor.count & TREMOR_ON) !== 0) {
      finalvol = 0;
    }
  }

  return finalvol;
}

// ---------------------------------------------------------------------------
// Delayed keyoff (player.c:932-962)
// ---------------------------------------------------------------------------

/** delayed_keyoff (player.c:932-962). */
function delayedKeyoff(core: Core, chn: number): void {
  const p = core.ctx.p;
  const xc = core.ctx.channelStates[chn]!;
  const instrument = getInstrument(core, xc.ins);

  switch (core.ctx.m.readEventType) {
    case ReadEventType.FT2:
      /* Ignore if frame>=speed (ft2_kxx.xm). */
      if (p.frame >= p.speed) {
        break;
      }
      /* See read_event_ft2 for more notes on keyoff. */
      if ((instrument.aei.flags & EnvelopeFlags.ON) !== 0) {
        SET_NOTE(xc, NOTE_RELEASE);
      } else {
        xc.volume = 0;
      }
      SET_NOTE(xc, NOTE_FADEOUT);
      break;

    default:
      SET_NOTE(xc, NOTE_RELEASE);
  }
}

// ---------------------------------------------------------------------------
// Invert loop (player.c:558-601)
// ---------------------------------------------------------------------------

/** update_invloop (player.c:562-601). */
function updateInvloop(core: Core, xc: ChannelState): void {
  const p = core.ctx.p;
  const xxs: SampleData | null = core.getSample(xc.smp);
  let lps = 0;
  let len = -1;

  /* If an instrument number is present, reset the position. */
  if (p.frame === 0 && TEST(xc, NEW_INS) !== 0) {
    xc.invloop.pos = 0;
  }

  xc.invloop.count += invloop_table[xc.invloop.speed] ?? 0;

  if (xxs != null) {
    if ((xxs.flags & SampleFlags.LOOP) !== 0) {
      lps = xxs.loopStart;
      len = xxs.loopEnd - lps;
    } else if ((xxs.flags & SampleFlags.SUSTAIN) !== 0) {
      /* Some formats that support invert loop use sustain loops instead
       * (Digital Symphony). libxmp reads m->xtra[smp].sus/.sue here; our
       * SampleData carries the sustain points on the sample itself. */
      lps = xxs.sustainStart;
      len = xxs.sustainEnd - lps;
    }
  }

  if (len >= 0 && xc.invloop.count >= 128) {
    xc.invloop.count = 0;

    if (++xc.invloop.pos > len) {
      xc.invloop.pos = 0;
    }

    if (xxs.data.length === 0) {
      return;
    }

    /* 8-bit inversion: in our float-domain store ([-1,1) samples) the
     * byte XOR 0xff maps to value inversion: v → -v - 1/128. */
    if ((xxs.flags & SampleFlags.BITS16) === 0) {
      const pos = lps + xc.invloop.pos;
      xxs.data[pos] = -xxs.data[pos]! - 1 / 128;
    }
  }
}

// ---------------------------------------------------------------------------
// Update stage (player.c:1414-1597)
// ---------------------------------------------------------------------------

/** update_volume (player.c:1414-1499). */
export function updateVolume(core: Core, chn: number): void {
  const p = core.ctx.p;
  const m = core.ctx.m;
  const f = p.flow;
  const xc = core.ctx.channelStates[chn]!;

  /* Volume slides happen in all frames but the first, except when the
   * "volume slide on all frames" flag is set.
   */
  if (p.frame % p.speed !== 0 || hasQuirk(core, Quirk.VSALL)) {
    if (TEST(xc, GVOL_SLIDE) !== 0) {
      p.gvol += xc.gvol.slide;
    }

    if (TEST(xc, VOL_SLIDE) !== 0 || TEST_PER(xc, VOL_SLIDE) !== 0) {
      xc.volume += xc.vol.slide;
    }

    if (TEST(xc, VOL_SLIDE_2) !== 0) {
      xc.volume += xc.vol.slide2;
    }
    if (TEST(xc, TRK_VSLIDE) !== 0) {
      xc.mastervol += xc.trackvol.slide;
    }
  }

  if (p.frame % p.speed === 0) {
    /* Process "fine" effects */
    if (TEST(xc, FINE_VOLS) !== 0) {
      xc.volume += xc.vol.fslide;
    }

    if (TEST(xc, FINE_VOLS_2) !== 0) {
      /* OpenMPT FineVolColSlide.it:
       * Unlike fine volume slides in the effect column,
       * fine volume slides in the volume column are only
       * ever executed on the first tick -- not on multiples
       * of the first tick if there is a pattern delay.
       */
      if (f.rowdelay_set === 0 || (f.rowdelay_set & RowDelay.FIRST_FRAME) !== 0) {
        xc.volume += xc.vol.fslide2;
      }
    }

    if (TEST(xc, TRK_FVSLIDE) !== 0) {
      xc.mastervol += xc.trackvol.fslide;
    }

    if (TEST(xc, GVOL_SLIDE) !== 0) {
      p.gvol += xc.gvol.fslide;
    }
  }

  /* Clamp volumes */
  xc.volume = CLAMP(xc.volume, 0, m.volbase);
  p.gvol = CLAMP(p.gvol, 0, m.gvolbase);
  xc.mastervol = CLAMP(xc.mastervol, 0, m.volbase);

  if (xc.split) {
    core.ctx.channelStates[xc.pair]!.volume = xc.volume;
  }
}

/** update_frequency (player.c:1501-1577). */
export function updateFrequency(core: Core, chn: number): void {
  const m = core.ctx.m;
  const xc = core.ctx.channelStates[chn]!;

  if (!isFirstFrame(core) || hasQuirk(core, Quirk.PBALL)) {
    if (TEST(xc, PITCHBEND) !== 0 || TEST_PER(xc, PITCHBEND) !== 0) {
      xc.period += xc.freq.slide;
      if (hasQuirk(core, Quirk.PROTRACK)) {
        xc.porta.target = xc.period;
      }
    }

    /* Do tone portamento */
    if (TEST(xc, TONEPORTA) !== 0 || TEST_PER(xc, TONEPORTA) !== 0) {
      if (xc.porta.target > 0) {
        let end = false;
        if (xc.porta.dir > 0) {
          xc.period += xc.porta.slide;
          if (xc.period >= xc.porta.target) {
            end = true;
          }
        } else {
          xc.period -= xc.porta.slide;
          if (xc.period <= xc.porta.target) {
            end = true;
          }
        }

        if (end) {
          /* reached end */
          xc.period = xc.porta.target;
          xc.porta.dir = 0;
          RESET(xc, TONEPORTA);
          RESET_PER(xc, TONEPORTA);

          if (hasQuirk(core, Quirk.PROTRACK)) {
            xc.porta.target = -1;
          }
        }
      }
    }
  }

  if (isFirstFrame(core)) {
    if (TEST(xc, FINE_BEND) !== 0) {
      xc.period += xc.freq.fslide;
    }

    if (TEST(xc, FINE_NSLIDE) !== 0) {
      xc.note += xc.noteslide.fslide;
      xc.period = noteToPeriod(m.periodType, xc.note, xc.finetune, xc.per_adj);
    }
  }

  switch (m.periodType) {
    case PeriodType.LINEAR:
      xc.period = CLAMP(xc.period, MIN_PERIOD_L, MAX_PERIOD_L);
      break;
    case PeriodType.MODRNG: {
      const minPeriod = noteToPeriod(m.periodType, MAX_NOTE_MOD, xc.finetune, 0);
      const maxPeriod = noteToPeriod(m.periodType, MIN_NOTE_MOD, xc.finetune, 0);
      xc.period = CLAMP(xc.period, minPeriod, maxPeriod);
      break;
    }
  }

  /* Check for invalid periods (from Toru Egashira's NSPmod)
   * panic.s3m has negative periods
   * ambio.it uses low (~8) period values
   */
  if (xc.period < 0.25) {
    core.virt.setVol(chn, 0);
  }
}

/** update_pan (player.c:1579-1597). */
export function updatePan(core: Core, chn: number): void {
  const xc = core.ctx.channelStates[chn]!;

  if (TEST(xc, PAN_SLIDE) !== 0) {
    if (isFirstFrame(core)) {
      xc.pan.val += xc.pan.fslide;
    } else {
      xc.pan.val += xc.pan.slide;
    }

    if (xc.pan.val < 0) {
      xc.pan.val = 0;
    } else if (xc.pan.val > 0xff) {
      xc.pan.val = 0xff;
    }
  }
}

// ---------------------------------------------------------------------------
// Process stage (player.c:971-1412)
// ---------------------------------------------------------------------------

/** DOENV_RELEASE macro (player.c:969). */
const DOENV_RELEASE = (
  xc: ChannelState,
  act: number,
): boolean =>
  TEST_NOTE(xc, NOTE_ENV_RELEASE) !== 0 || act === VIRT_ACTION_OFF;

/** get_channel_vol (player.c:859-878). */
function getChannelVol(core: Core, chn: number): number {
  const p = core.ctx.p;
  const virt = core.virt;

  /* channel is a root channel */
  if (chn < virt.numTracks) {
    return p.channel_vol[chn]!;
  }

  /* channel is invalid */
  if (chn >= virt.virtChannels) {
    return 0;
  }

  /* channel is a mapped channel: root comes from the voice's root
   * channel (virt_getroot virtual.c:36-49); no voice -> no vol. */
  const voc = virt.mapChannel(chn);
  if (voc < 0) {
    return 0;
  }
  const root = virt.voiceAt(voc)!.root;
  if (root < 0) {
    return 0;
  }

  return p.channel_vol[root]!;
}

/** process_volume (player.c:971-1129). */
export function processVolume(core: Core, chn: number, act: number): void {
  const p = core.ctx.p;
  const m = core.ctx.m;
  const xc = core.ctx.channelStates[chn]!;
  let fade = false;

  const instrument = getInstrument(core, xc.ins);

  /* Keyoff and fadeout */

  /* Keyoff event in IT doesn't reset fadeout (see jeff93.it)
   * In XM it depends on envelope (see graff-strange_land.xm vs
   * Decibelter - Cosmic 'Wegian Mamas.xm)
   */
  if (hasQuirk(core, Quirk.KEYOFF)) {
    /* If IT, only apply fadeout on note release if we don't
     * have envelope, or if we have envelope loop
     */
    if (TEST_NOTE(xc, NOTE_ENV_RELEASE) !== 0 || act === VIRT_ACTION_OFF) {
      if (
        (~instrument.aei.flags & EnvelopeFlags.ON) !== 0 ||
        (instrument.aei.flags & EnvelopeFlags.LOOP) !== 0
      ) {
        fade = true;
      }
    }
  } else if (!IS_PLAYER_MODE_FT2(core)) {
    /* TODO: FT2 doesn't do this. check other formats. */
    if ((~instrument.aei.flags & EnvelopeFlags.ON) !== 0) {
      if (TEST_NOTE(xc, NOTE_ENV_RELEASE) !== 0) {
        xc.fadeout = 0;
      }
    }

    if (TEST_NOTE(xc, NOTE_ENV_RELEASE) !== 0 || act === VIRT_ACTION_OFF) {
      fade = true;
    }
  }

  if (TEST_PER(xc, VENV_PAUSE) === 0) {
    xc.v_idx = updateEnvelope(
      core,
      instrument.aei,
      xc.v_idx,
      DOENV_RELEASE(xc, act),
      TEST(xc, KEY_OFF_FLAG) !== 0,
    );
  }

  const volEnvelope = getEnvelope(instrument.aei, xc.v_idx, 64);
  if (checkEnvelopeEnd(instrument.aei, xc.v_idx) !== 0) {
    if (volEnvelope === 0) {
      SET_NOTE(xc, NOTE_END);
    }
    SET_NOTE(xc, NOTE_ENV_END);
  }

  /* IT starts fadeout automatically at the end of the volume envelope. */
  switch (checkEnvelopeFade(instrument.aei, xc.v_idx)) {
    case -1:
      SET_NOTE(xc, NOTE_END);
      /* Don't reset channel, we may have a tone portamento later
       * virt_resetchannel(ctx, chn);
       */
      break;
    case 0:
      break;
    default:
      if (hasQuirk(core, Quirk.ENVFADE)) {
        SET_NOTE(xc, NOTE_FADEOUT);
      }
  }

  /* IT envelope fadeout starts immediately after the envelope tick,
   * so process fadeout after the volume envelope. */
  if (TEST_NOTE(xc, NOTE_FADEOUT) !== 0 || act === VIRT_ACTION_FADE) {
    fade = true;
  }

  if (fade) {
    if (xc.fadeout > xc.ins_fade) {
      xc.fadeout -= xc.ins_fade;
    } else {
      xc.fadeout = 0;
      SET_NOTE(xc, NOTE_END);
    }
  }

  /* If note ended in background channel, we can safely reset it */
  if (TEST_NOTE(xc, NOTE_END) !== 0 && chn >= core.virt.numTracks) {
    core.virt.releaseChannel(chn, PastNote.CUT);
    return;
  }

  let finalvol = xc.volume;

  if (IS_PLAYER_MODE_IT(core)) {
    finalvol = Math.trunc((xc.volume * (100 - xc.rvv)) / 100);
  }

  if (TEST(xc, TREMOLO) !== 0) {
    /* OpenMPT VibratoReset.mod */
    if (!isFirstFrame(core) || !hasQuirk(core, Quirk.PROTRACK)) {
      finalvol += Math.trunc(lfoGet(m.readEventType, xc.tremolo.lfo, false) / (1 << 6));
    }

    if (!isFirstFrame(core) || hasQuirk(core, Quirk.VIBALL)) {
      lfoUpdate(xc.tremolo.lfo);
    }
  }

  finalvol = CLAMP(finalvol, 0, m.volbase);

  finalvol = (finalvol * xc.fadeout) >> 6; /* 16 bit output */

  /* player.c:1088-1090 C int math — truncation at EVERY division:
   * (uint32)(venv*gvol*mastervol/gvolbase * ((int)fv*0x40/volbase)) >> 18 */
  {
    const t2 = Math.trunc(
      (volEnvelope * p.gvol * xc.mastervol) / m.gvolbase,
    );
    const t3 = Math.trunc((finalvol * 0x40) / m.volbase);
    finalvol = (Math.imul(t2, t3) >>> 0) >> 18;
  }

  /* Apply channel volume (C int division truncates) */
  finalvol = Math.trunc((finalvol * getChannelVol(core, chn)) / 100);

  if (hasQuirk(core, Quirk.INSVOL)) {
    finalvol = (finalvol * instrument.volume * xc.gvl) >> 12;
  }

  if (IS_PLAYER_MODE_FT2(core)) {
    finalvol = tremorFt2(core, xc, finalvol);
  } else {
    finalvol = tremorS3m(xc, finalvol);
  }
  xc.macro.finalvol = finalvol;

  if (chn < m.chn) {
    finalvol = Math.trunc((finalvol * p.master_vol) / 100);
  } else {
    finalvol = Math.trunc((finalvol * p.smix_vol) / 100);
  }

  xc.info_finalvol = TEST_NOTE(xc, NOTE_SAMPLE_END) !== 0 ? 0 : finalvol;

  core.virt.setVol(chn, finalvol);

  /* Check Amiga split channel */
  if (xc.split) {
    core.virt.setVol(xc.pair, finalvol);
  }
}

/** filter_setup (filter.c:90-116). */
export function filterSetup(
  srate: number,
  cutoff: number,
  res: number,
): { a0: number; b0: number; b1: number } {
  /* [0-255] => [100Hz-8000Hz] */
  cutoff = CLAMP(cutoff, 0, 255);
  res = CLAMP(res, 0, 255);

  const freqParamMult = 128.0 / (24.0 * 256.0);
  const fs = srate;
  let fc = 110.0 * Math.pow(2.0, cutoff * freqParamMult + 0.25);
  if (fc > fs / 2.0) {
    fc = fs / 2.0;
  }

  const r = fs / (2.0 * 3.14159265358979 * fc);
  const d = resonance_table[res >> 1]! * (r + 1.0) - 1.0;
  const e = r * r;

  const fg = 1.0 / (1.0 + d + e);
  const fb0 = (d + e + e) / (1.0 + d + e);
  const fb1 = -e / (1.0 + d + e);

  return {
    a0: Math.trunc(fg * (1 << FILTER_SHIFT)),
    b0: Math.trunc(fb0 * (1 << FILTER_SHIFT)),
    b1: Math.trunc(fb1 * (1 << FILTER_SHIFT)),
  };
}

/** IS_PERIOD_MODRNG (common.h). */
const IS_PERIOD_MODRNG = (core: Core): boolean =>
  core.ctx.m.periodType === PeriodType.MODRNG;

const INT_MAX = 0x7fffffff;

/** process_frequency (player.c:1131-1346). */
export function processFrequency(core: Core, chn: number, act: number): void {
  const p = core.ctx.p;
  const m = core.ctx.m;
  const s = core.ctx.s;
  const xc = core.ctx.channelStates[chn]!;

  const instrument = getInstrument(core, xc.ins);

  if (TEST_PER(xc, FENV_PAUSE) === 0) {
    xc.f_idx = updateEnvelope(
      core,
      instrument.fei,
      xc.f_idx,
      DOENV_RELEASE(xc, act),
      TEST(xc, KEY_OFF_FLAG) !== 0,
    );
  }
  const frqEnvelope = getEnvelope(instrument.fei, xc.f_idx, 0);

  /* Do note slide */

  if (TEST(xc, NOTE_SLIDE) !== 0) {
    if (xc.noteslide.count === 0) {
      xc.note += xc.noteslide.slide;
      xc.period = noteToPeriod(m.periodType, xc.note, xc.finetune, xc.per_adj);
      xc.noteslide.count = xc.noteslide.speed;
    }
    xc.noteslide.count--;

    core.virt.setNote(chn, xc.note);
  }

  /* Instrument vibrato */
  let vibrato =
    (1.0 * lfoGet(m.readEventType, xc.insvib.lfo, true)) /
    (4096 * (1 + xc.insvib.sweep));
  lfoUpdate(xc.insvib.lfo);
  if (xc.insvib.sweep > 1) {
    xc.insvib.sweep -= 2;
  } else {
    xc.insvib.sweep = 0;
  }

  /* Vibrato */
  if (TEST(xc, VIBRATO) !== 0 || TEST_PER(xc, VIBRATO) !== 0) {
    /* OpenMPT VibratoReset.mod */
    if (!isFirstFrame(core) || !hasQuirk(core, Quirk.PROTRACK)) {
      const shift = hasQuirk(core, Quirk.VIBHALF) ? 10 : 9;
      const vib = lfoGet(m.readEventType, xc.vibrato.lfo, true) / (1 << shift);

      if (hasQuirk(core, Quirk.VIBINV)) {
        vibrato -= vib;
      } else {
        vibrato += vib;
      }
    }

    if (!isFirstFrame(core) || hasQuirk(core, Quirk.VIBALL)) {
      lfoUpdate(xc.vibrato.lfo);
    }
  }

  let period = xc.period;

  if (hasQuirk(core, Quirk.ST3BUGS)) {
    if (period < 0.25) {
      core.virt.releaseChannel(chn, PastNote.CUT);
    }
  }
  /* Sanity check */
  if (period < 0.1) {
    period = 0.1;
  }

  /* Arpeggio */
  let arp = arpeggio(core, xc);

  /* Pitch bend */

  let linearBend = periodToBend(m.periodType, period + vibrato, xc.note, xc.per_adj);

  if (TEST_NOTE(xc, NOTE_GLISSANDO) !== 0 && TEST(xc, TONEPORTA) !== 0) {
    if (linearBend > 0) {
      linearBend = Math.trunc((linearBend + 6400) / 12800) * 12800;
    } else if (linearBend < 0) {
      linearBend = Math.trunc((linearBend - 6400) / 12800) * 12800;
    }
  }

  if (hasQuirk(core, Quirk.FT2BUGS)) {
    if (arp !== 0) {
      /* OpenMPT ArpSlide.xm */
      linearBend = Math.trunc(linearBend / 12800) * 12800 + xc.finetune * 100;

      /* OpenMPT ArpeggioClamp.xm */
      if (xc.note + arp > 107) {
        if (p.speed - (p.frame % p.speed) > 0) {
          arp = 108 - xc.note;
        }
      }
    }
  }

  /* Envelope */

  if (xc.f_idx >= 0 && (~instrument.fei.flags & EnvelopeFlags.FLT) !== 0) {
    /* IT pitch envelopes are always linear, even in Amiga period
     * mode. Each unit in the envelope scale is 1/25 semitone.
     */
    linearBend += frqEnvelope * 128;
  }

  /* Arpeggio */

  if (arp !== 0) {
    linearBend += (100 << 7) * arp;

    /* OpenMPT ArpWrapAround.mod */
    if (hasQuirk(core, Quirk.PROTRACK)) {
      if (xc.note + arp > MAX_NOTE_MOD + 1) {
        linearBend -= 12800 * (3 * 12);
      } else if (xc.note + arp > MAX_NOTE_MOD) {
        core.virt.setVol(chn, 0);
      }
    }
  }

  let finalPeriod = noteToPeriodMix(xc.note, linearBend);

  /* From OpenMPT PeriodLimit.s3m:
   * "ScreamTracker 3 limits the final output period to be at least 64,
   *  i.e. when playing a note that is too high or when sliding the
   *  period lower than 64, the output period will simply be clamped to
   *  64. However, when reaching a period of 0 through slides, the
   *  output on the channel should be stopped."
   */
  /* ST3 uses periods*4, so the limit is 16. Adjusted to the exact
   * A6 value because we compute periods in floating point.
   */
  if (hasQuirk(core, Quirk.ST3BUGS)) {
    if (finalPeriod < 16.239270) {
      /* A6 */
      finalPeriod = 16.239270;
    }
  }

  core.virt.setPeriod(chn, finalPeriod);

  /* For xmp_get_frame_info() */
  xc.info_pitchbend = linearBend >> 7;
  xc.info_period = Math.min(finalPeriod * 4096, INT_MAX);

  if (IS_PERIOD_MODRNG(core)) {
    const minPeriod = noteToPeriod(m.periodType, MAX_NOTE_MOD, xc.finetune, 0) * 4096;
    const maxPeriod = noteToPeriod(m.periodType, MIN_NOTE_MOD, xc.finetune, 0) * 4096;
    xc.info_period = CLAMP(xc.info_period, minPeriod, maxPeriod);
  } else if (xc.info_period < 1 << 12) {
    xc.info_period = 1 << 12;
  }

  /* Process filter */

  if (!hasQuirk(core, Quirk.FILTER)) {
    return;
  }

  let cutoff: number;
  if (xc.f_idx >= 0 && (instrument.fei.flags & EnvelopeFlags.FLT) !== 0) {
    if (frqEnvelope < 0xfe) {
      xc.filter.envelope = frqEnvelope;
    }
    cutoff = (xc.filter.cutoff * xc.filter.envelope) >> 8;
  } else {
    cutoff = xc.filter.cutoff;
  }
  const resonance = xc.filter.resonance;

  if (cutoff > 0xff) {
    cutoff = 0xff;
  }
  /* IT: cutoff 127 + resonance 0 turns off the filter, but this
   * is only applied when playing a new note without toneporta.
   * All other combinations take effect immediately.
   * See OpenMPT filter-reset.it, filter-reset-carry.it */
  if (cutoff < 0xfe || resonance > 0 || xc.filter.can_disable) {
    const fx = filterSetup(s.freq, cutoff, resonance);
    core.virt.setEffect(chn, DSP_EFFECT_FILTER_A0, fx.a0);
    core.virt.setEffect(chn, DSP_EFFECT_FILTER_B0, fx.b0);
    core.virt.setEffect(chn, DSP_EFFECT_FILTER_B1, fx.b1);
    core.virt.setEffect(chn, DSP_EFFECT_RESONANCE, resonance);
    core.virt.setEffect(chn, DSP_EFFECT_CUTOFF, cutoff);
    xc.filter.can_disable = 0;
  }
}

/** libxmp_note_to_period_mix (period.c:205-209). */
function noteToPeriodMix(n: number, b: number): number {
  const d = n + b / 12800;
  return PERIOD_BASE / Math.pow(2, d / 12);
}

/** process_pan (player.c:1348-1412). */
export function processPan(core: Core, chn: number, act: number): void {
  const m = core.ctx.m;
  const s = core.ctx.s;
  const xc = core.ctx.channelStates[chn]!;
  let panbrello = 0;

  const instrument = getInstrument(core, xc.ins);

  if (TEST_PER(xc, PENV_PAUSE) === 0) {
    xc.p_idx = updateEnvelope(
      core,
      instrument.pei,
      xc.p_idx,
      DOENV_RELEASE(xc, act),
      TEST(xc, KEY_OFF_FLAG) !== 0,
    );
  }
  const panEnvelope = getEnvelope(instrument.pei, xc.p_idx, 32);

  if (TEST(xc, PANBRELLO) !== 0) {
    panbrello = lfoGet(m.readEventType, xc.panbrello.lfo, false) / 512;
    if (isFirstFrame(core)) {
      lfoUpdate(xc.panbrello.lfo);
    }
  }
  xc.macro.notepan = xc.pan.val + panbrello + 0x80;

  const channelPan = xc.pan.val;

  /* C int math: (pan_envelope - 32) * (128 - abs(...)) / 32 truncates */
  let finalpan =
    channelPan +
    panbrello +
    Math.trunc(((panEnvelope - 32) * (128 - Math.abs(xc.pan.val - 128))) / 32);

  if (IS_PLAYER_MODE_IT(core)) {
    finalpan = finalpan + xc.rpv * 4;
  }

  finalpan = CLAMP(finalpan, 0, 255);

  if ((s.format & XMP_FORMAT_MONO) !== 0 || xc.pan.surround !== 0) {
    finalpan = 0;
  } else {
    finalpan = Math.trunc(((finalpan - 0x80) * s.mix) / 100);
  }

  xc.info_finalpan = finalpan + 0x80;

  if (xc.pan.surround !== 0) {
    core.virt.setPan(chn, PAN_SURROUND);
  } else {
    core.virt.setPan(chn, finalpan);
  }
}

// ---------------------------------------------------------------------------
// play_channel (player.c:1599-1697)
// ---------------------------------------------------------------------------

/**
 * play_channel (player.c:1599-1697). Called once per channel per frame from
 * play_frame (player.c:2166).
 */
export function processTick(core: Core, chn: number): void {
  const p = core.ctx.p;
  const mod = core.ctx.m;
  const xc = core.ctx.channelStates[chn]!;
  let act: number;

  xc.info_finalvol = 0;

  /* IT tempo slide */
  if (!isFirstFrame(core) && TEST(xc, TEMPO_SLIDE) !== 0) {
    p.bpm += xc.tempo_slide;
    p.bpm = CLAMP(p.bpm, 0x20, 0xff);
  }

  /* Do delay */
  if (xc.delay > 0) {
    if (--xc.delay === 0) {
      core.readEvent(chn);
    }
  }

  /* Map our VoiceState.act (Act.* codes) onto libxmp's VIRT_ACTION_* codes
   * (virtual.h:6-12) that play_channel compares against. cstat already
   * returns VIRT_ACTIVE for root tracks and VIRT_INVALID when unmapped. */
  const cst = core.virt.cstat(chn);
  if (cst === VIRT_INVALID) {
    act = VIRT_INVALID;
  } else if (cst === VIRT_ACTIVE) {
    act = VIRT_ACTIVE;
  } else {
    switch (cst) {
      case Act.NONE:
        act = VIRT_ACTION_CUT;
        break;
      case Act.KEY:
        act = VIRT_ACTION_OFF;
        break;
      case Act.VOL:
        act = VIRT_ACTION_FADE;
        break;
      default:
        act = VIRT_ACTIVE;
    }
  }
  if (act === VIRT_INVALID) {
    /* We need this to keep processing global volume slides */
    updateVolume(core, chn);
    return;
  }

  if (p.frame === 0 && act !== VIRT_ACTIVE) {
    if (!isValidInstrumentOrSfx(core, xc.ins) || act === VIRT_ACTION_CUT) {
      core.virt.releaseChannel(chn, PastNote.CUT);
      return;
    }
  }

  if (!isValidInstrumentOrSfx(core, xc.ins)) {
    return;
  }

  /* Do cut/retrig */
  if (TEST(xc, RETRIG) !== 0) {
    const cond =
      hasQuirk(core, Quirk.S3MRTG)
        ? --xc.retrig.count <= 0
        : --xc.retrig.count === 0;

    if (cond) {
      if (xc.retrig.type < 0x10) {
        /* don't retrig on cut */
        core.virt.voicePos(chn, 0);
      } else {
        SET_NOTE(xc, NOTE_END);
      }
      xc.volume += rval[xc.retrig.type]!.s;
      xc.volume *= rval[xc.retrig.type]!.m;
      xc.volume /= rval[xc.retrig.type]!.d;
      xc.retrig.count = xc.retrig.val;

      if (xc.retrig.limit > 0) {
        /* Limit the number of retriggers. */
        --xc.retrig.limit;
        if (xc.retrig.limit === 0) {
          RESET(xc, RETRIG);
        }
      }
    }
  }

  /* Do keyoff */
  if (xc.keyoff) {
    if (--xc.keyoff === 0) {
      delayedKeyoff(core, chn);
    }
  }

  core.virt.releaseFlag(chn, TEST_NOTE(xc, NOTE_SAMPLE_RELEASE) !== 0 ? 1 : 0);

  updateVolume(core, chn);
  updateFrequency(core, chn);
  updatePan(core, chn);

  processVolume(core, chn, act);
  processFrequency(core, chn, act);
  processPan(core, chn, act);

  if (hasQuirk(core, Quirk.PROTRACK | Quirk.INVLOOP) && xc.ins < mod.ins) {
    updateInvloop(core, xc);
  }

  if (TEST_NOTE(xc, NOTE_SUSEXIT) !== 0) {
    SET_NOTE(xc, NOTE_ENV_RELEASE);
  }

  xc.info_position = core.virt.getVoicePos(chn);
}

/** IS_VALID_INSTRUMENT_OR_SFX (player.h) for the big-four (no smix). */
/** IS_VALID_INSTRUMENT_OR_SFX (player.h:80). No smix support: smix->ins == 0. */
function isValidInstrumentOrSfx(core: Core, ins: number): boolean {
  const m = core.ctx.m;
  return (
    (ins >>> 0) < m.ins &&
    ins >= 0 &&
    m.instruments[ins] !== undefined &&
    (m.instruments[ins]!.nsm ?? 0) > 0
  );
}

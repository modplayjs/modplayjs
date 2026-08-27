// Shared read-event helpers. Verbatim port of reference/libxmp/src/
// read_event.c:34-246 (get_subinstrument, reset_envelopes,
// set_effect_defaults, set_channel_volume/pan, set_period, set_period_ft2)
// plus the validity macros from player.h:79-82.
//
// Validity macros (player.h:79-82):
//   IS_VALID_NOTE(x)      = (uint32)(x) < XMP_MAX_KEYS (121)
//   IS_VALID_INSTRUMENT(x)= (uint32)(x) < mod->ins && mod->xxi[x].nsm > 0
//   IS_VALID_SAMPLE(x)    = (uint32)(x) < mod->smp && mod->xxs[x].data != NULL
// In the TS port a sample "has data" iff its stored id decodes to a
// non-empty sample buffer (SampleStore.get(id).length > 0).

import type { Core } from '@modplayjs/core';
import { EnvelopeFlags, type ChannelState, type Instrument, type SubInstrument } from '@modplayjs/core';
import {
  SET,
  RESET_NOTE,
  noteToPeriod,
  isValidNote,
} from './helpers.js';
import { Quirk } from '@modplayjs/core';
import { VolSlideFlag } from './state.js';

/** IS_VALID_INSTRUMENT(x) (player.h:79). */
export function isValidInstrument(core: Core, ins: number): boolean {
  const mod = core.module!;
  return ins >= 0 && ins < mod.ins && (mod.instruments[ins]?.nsm ?? 0) > 0;
}

/** IS_VALID_SAMPLE(x) (player.h:80) — "data != NULL" ⇔ stored sample non-empty. */
export function isValidSample(core: Core, smp: number): boolean {
  const mod = core.module!;
  if (smp < 0 || smp >= mod.samples.length) return false;
  return core.getSample(smp).length > 0;
}

/**
 * get_subinstrument (read_event.c:34-54). Returns the sub-instrument for
 * (ins, key): map the key through instrument->map, or sub[0] when the key
 * is out of note range. Null when the instrument is invalid.
 */
export function getSubinstrument(
  core: Core,
  ins: number,
  key: number,
): SubInstrument | null {
  const mod = core.module!;
  if (!isValidInstrument(core, ins)) return null;
  const instrument = mod.instruments[ins]!;
  if (isValidNote(key)) {
    const mapped = instrument.map[key] ?? 0xff;
    if (mapped !== 0xff && mapped >= 0 && mapped < instrument.nsm) {
      return instrument.sub[mapped] ?? null;
    }
  } else {
    if (instrument.nsm > 0) {
      return instrument.sub[0] ?? null;
    }
  }
  return null;
}

/** Instrument lookup for envelope access; null when invalid. */
export function getInstrument(core: Core, ins: number): Instrument | null {
  return isValidInstrument(core, ins) ? core.module!.instruments[ins]! : null;
}

/**
 * reset_envelopes (read_event.c:56-66): clear NOTE_ENV_END and rewind the
 * volume/pitch/filter envelope indices. (The C comment "sets v_idx=0" is
 * actually -1 — envelope positions are -1 = before first point.)
 */
export function resetEnvelopes(core: Core, xc: ChannelState): void {
  if (!isValidInstrument(core, xc.ins)) return;
  RESET_NOTE(xc, NOTE_ENV_END);
  xc.v_idx = -1;
  xc.p_idx = -1;
  xc.f_idx = -1;
}

/** NOTE_ENV_END (helpers.ts:91). */
const NOTE_ENV_END = 1 << 4;

/**
 * set_effect_defaults (read_event.c:118-161).
 */
export function setEffectDefaults(
  core: Core,
  note: number,
  sub: SubInstrument | null,
  xc: ChannelState,
  isToneporta: boolean,
): void {
  if (sub !== null && note >= 0) {
    if ((core.quirks & Quirk.PROTRACK) === 0) {
      xc.finetune = sub.fin;
    }
    xc.gvl = sub.gvl;

    if (sub.ifc & 0x80) {
      xc.filter.cutoff = (sub.ifc - 0x80) * 2;
    }
    xc.filter.envelope = 0x100;

    if (sub.ifr & 0x80) {
      xc.filter.resonance = (sub.ifr - 0x80) * 2;
    }

    /* IT: on a new note without toneporta, allow a computed cutoff of 127
     * with resonance 0 to disable the filter (read_event.c:141-146). */
    xc.filter.can_disable = !isToneporta ? 1 : 0;

    // Instrument vibrato LFO: depth/rate/waveform/sweep (read_event.c:150-154).
    xc.insvib.lfo.depth = sub.vde;
    xc.insvib.lfo.rate = (sub.vra + 2) >> 2;
    xc.insvib.lfo.type = sub.vwf;
    xc.insvib.sweep = sub.vsw;

    // Reset vibrato/tremolo LFO phases.
    xc.vibrato.lfo.phase = 0;
    xc.tremolo.lfo.phase = 0;
  }

  xc.delay = 0;
  xc.tremor.up = 0;
  xc.tremor.down = 0;

  // Reset arpeggio.
  xc.arpeggio.val[0] = 0;
  xc.arpeggio.count = 0;
  xc.arpeggio.size = 1;

  // Reset toneporta — each process_fx may add to the rate.
  if (isToneporta) {
    xc.porta.slide = 0;
  }
}

/** set_channel_volume (read_event.c:163-170). */
export function setChannelVolume(xc: ChannelState, vol: number): void {
  if (vol >= 0) {
    xc.volume = vol;
    SET(xc, VolSlideFlag.NEW_VOL);
  }
}

/** set_channel_pan (read_event.c:179-189). */
export function setChannelPan(xc: ChannelState, pan: number): void {
  if (pan >= 0) {
    xc.pan.val = pan;
    xc.pan.surround = 0;
  }
}

/**
 * Sustain check against a port Envelope (x/y point arrays instead of C's
 * flat data[] pairs): idx equals the sustain point's x value.
 */
export function sustainCheckEnv(
  env: { flags: number; sus: number; x: number[] } | null | undefined,
  idx: number,
): boolean {
  return !!(
    env &&
    env.flags & EnvelopeFlags.ON &&
    env.flags & EnvelopeFlags.SUS &&
    ~env.flags & EnvelopeFlags.LOOP &&
    idx === env.x[env.sus << 1]
  );
}

/**
 * set_period (read_event.c:196-219).
 */
export function setPeriod(
  core: Core,
  note: number,
  sub: SubInstrument | null,
  xc: ChannelState,
  isToneporta: boolean,
): void {
  // Only allow Protracker to update without a subinstrument.
  if (sub === null && (core.quirks & Quirk.PROTRACK) === 0) return;

  if (note >= 0) {
    const per = noteToPeriod(core.module!.periodType, note, xc.finetune, xc.per_adj);

    if ((core.quirks & Quirk.PROTRACK) === 0 || (note > 0 && isToneporta)) {
      xc.porta.target = per;
    }

    if (xc.period < 1 || !isToneporta) {
      xc.period = per;
    }
  }
}

/**
 * set_period_ft2 (read_event.c:233-246).
 */
export function setPeriodFt2(
  core: Core,
  key: number,
  note: number,
  sub: SubInstrument | null,
  xc: ChannelState,
  isToneporta: boolean,
): void {
  const mod = core.module!;
  if (isValidNote(key - 1) && isToneporta) {
    // Toneporta target updates even for invalid instruments, using the
    // default transpose +0 (ft2_invalid_porta_target.xm).
    let n = key - 1;
    if (sub !== null) {
      const ins = isValidInstrument(core, xc.ins) ? mod.instruments[xc.ins]! : null;
      n += ins ? (ins.mapXpo[key - 1] ?? 0) : 0;
      n += sub.xpo;
    }
    xc.porta.target = noteToPeriod(mod.periodType, n, xc.finetune, xc.per_adj);
  }
  if (sub !== null && note >= 0) {
    if (xc.period < 1 || !isToneporta) {
      xc.period = noteToPeriod(mod.periodType, note, xc.finetune, xc.per_adj);
    }
  }
}

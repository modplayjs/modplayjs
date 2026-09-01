// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Bitti09 — modplayjs contributors
// Ported from: libxmp src/read_event.c (READ_EVENT_FT2).
// read_event_ft2 (reference/libxmp/src/read_event.c:475-736).

import type {
  ChannelState,
  Core,
  Envelope,
  Event,
  Instrument,
  SubInstrument,
} from '@modplayjs/core';
import { FX, Quirk, XMP_KEY_OFF } from '@modplayjs/core';
import {
  MSN,
  RESET_NOTE,
  SET,
  SET_NOTE,
  TEST,
  isValidNote,
} from './helpers.js';
import { NoteFlag, VolSlideFlag } from './state.js';
import {
  getSubinstrument,
  getInstrument,
  isValidInstrument,
  isValidSample,
  resetEnvelopes,
  setChannelPan,
  setChannelVolume,
  setEffectDefaults,
  setPeriodFt2,
  sustainCheckEnv,
} from './readevent.js';
import { processFx } from './process.js';
import { TREMOR_SUPPRESS } from './tick.js';
import { isToneportaFx, setPatch } from './readevent.js';

/** FT2 note range (period.h:19-21). */
const FT2_NOTE_BN1 = 11;
const FT2_NOTE_C0 = 12;
const FT2_NOTE_AS9 = 130;

/** EX_DELAY (common.h effects); MSN == 0xd handled via FX.FX_EXTENDED. */
const EX_DELAY = 0x0d;

export function readEventFt2(core: Core, e: Event, chn: number): void {
  const p = core.ctx.p;
  const xc = core.ctx.channelStates[chn] as ChannelState;
  let note = -1;
  let key: number;
  let sub: SubInstrument | null;
  let isToneporta = 0;
  let isDelayed = 0;

  /* From the OpenMPT DelayCombination.xm test case:
   * "Naturally, Fasttracker 2 ignores notes next to an out-of-range note
   *  delay. However, to check whether the delay is out of range, it is
   *  simply compared against the current song speed, not taking any
   *  pattern delays into account." */
  if (p.frame >= p.speed) {
    return;
  }

  // Local mutable copy (memcpy in C).
  const ev: Event = { ...e };

  xc.flags = 0;
  note = -1;
  key = ev.note;
  isToneporta = 0;
  isDelayed = 0;

  /* Delay has a few bizarre hacks that need to be supported. */
  if (ev.fxt === FX.FX_EXTENDED && MSN(ev.fxp) === EX_DELAY && (ev.fxp & 0x0f) !== 0) {
    /* No note + delay -> note memory (ft2_delay_note_memory.xm).
     * Combined with ins# memory, effectively causes a retrigger. */
    key = key !== 0 ? key : xc.key_memory !== 0 ? xc.key_memory : xc.key + 1;

    /* Key off + no ins# + delay + volume column pan -> ignore pan
     * (OpenMPT PanOff.xm) (ft2_delay_volume_column.xm). */
    if (
      (core.quirks & Quirk.FT2BUGS) !== 0 &&
      key === XMP_KEY_OFF &&
      !ev.ins &&
      ev.f2t === FX.FX_SETPAN
    ) {
      ev.f2t = 0;
      ev.f2p = 0;
    }
    isDelayed = 1;
  }

  if (isToneportaFx(ev.fxt) || isToneportaFx(ev.f2t)) {
    isToneporta = 1;
    /* Mx + 3xx/5xy applies toneporta for both commands, but 3xx uses the
     * rate from the volume slot (ft2_double_toneporta.xm). */
    if (
      (core.quirks & Quirk.FT2BUGS) !== 0 &&
      ev.fxt === FX.FX_TONEPORTA &&
      isToneportaFx(ev.f2t)
    ) {
      ev.fxp = 0;
    }
  }

  /* FT2 deletes K00 and, if there is no volume fx toneporta, overwrites
   * the note with keyoff (ft2_k00_is_note_off.xm, OpenMPT key_off.xm). */
  if (ev.fxt === FX.FX_KEYOFF && ev.fxp === 0) {
    ev.fxt = 0;
    if (!isToneporta) {
      key = XMP_KEY_OFF;
    }
  }

  /* Check instrument
   *
   * Only update instrument/sample on new valid note + no toneporta/K00.
   * Lamb/forgotten city.xm relies heavily on quirks here. */
  if (ev.ins) {
    SET(xc, VolSlideFlag.NEW_INS);
    xc.per_flags = 0; /* For posterity; not used by XM */
  }
  if (isValidNote(key - 1) && !isToneporta) {
    /* Note w/o instrument loads the last referenced instrument. */
    const ins = ev.ins ? ev.ins : xc.old_ins;
    let smp = -1;
    let n = key - 1;

    /* Updates on note + !toneporta + !K00 and is unaffected by
     * out-of-range transposition checks (ft2_note_range.xm). */
    xc.key_memory = key;

    /* Unused instruments have fade 0x80, no envelopes, no vibrato.
     * Unused samples have volume 0, pan 0x80, transpose 0, no data.
     * libxmp represents unused/invalid instruments/samples as -1. */
    let xxi: Instrument | null = null;
    if (isValidInstrument(core, ins - 1)) {
      xxi = getInstrument(core, ins - 1);
      sub = getSubinstrument(core, ins - 1, key - 1);
      if (sub) {
        n += xxi?.mapXpo[key - 1] ?? 0;
        n += sub.xpo;
        smp = sub.sid;
      }
    }
    /* TODO(C): out-of-range notes update envelopes, no ins.# req. */

    /* Fade update requires ins.# (ft2_instrument_fade_update.xm). */
    if (ev.ins) {
      xc.ins_fade = xxi ? xxi.rls : 0x80 /* FT2 default */ << 1 /* conv */;
    }

    /* Valid notes update the instrument, sample, key, and note.
     * Note B-(-1) updates key/instrument/sample, but not the note.
     * Notes >A#9, <B-(-1) act as if the key does not exist at all. */
    if (n >= FT2_NOTE_BN1 && n <= FT2_NOTE_AS9) {
      if (n >= FT2_NOTE_C0) {
        xc.note = n;
      }
      xc.key = key - 1;
      xc.ins = isValidInstrument(core, ins - 1) ? ins - 1 : -1;
      xc.smp = isValidSample(core, smp) ? smp : -1;
    } else {
      key = 0;
    }
  }
  /* Get the new instrument. If the instrument/key wasn't updated, this is
   * equivalent to FT2 retaining the previous instrument/sample. */
  sub = getSubinstrument(core, xc.ins, xc.key);

  /* Check note
   *
   * Do not send a new note for toneporta (Quazar/funky stars.xm pos 5
   * ch 9, Mark Birch/comic bakery remix.xm pos 1 ch 3). */
  if (key !== 0) {
    SET(xc, VolSlideFlag.NEW_NOTE);
  }
  if (isValidNote(key - 1) && !isToneporta) {
    RESET_NOTE(xc, NoteFlag.END);

    /* Send note even if the current sample is invalid. Playing with an
     * active invalid sample cuts the channel. */
    setPatch(core, chn, xc.ins, xc.smp, xc.note);
    note = xc.note;
  }

  /* Check key off/envelopes */

  if (key === XMP_KEY_OFF) {
    let env: Envelope | null = null;
    if (isValidInstrument(core, xc.ins)) {
      env = getInstrument(core, xc.ins)!.aei;
    }

    if (env !== undefined && env !== null && (env.flags & 1) /* ON */) {
      if (sustainCheckEnv(env, xc.v_idx)) {
        /* See OpenMPT EnvOff.xm. In certain cases a release event is
         * effective only in the next frame. */
        SET_NOTE(xc, NoteFlag.SUSEXIT);
      } else {
        SET_NOTE(xc, NoteFlag.RELEASE);
      }
    } else {
      /* No volume envelope -> cut volume to 0 (ft2_note_off_fade.xm). */
      setChannelVolume(xc, 0);
    }

    /* Keyoff always begins fadeout (ft2_note_off_fade.xm). */
    SET_NOTE(xc, NoteFlag.FADEOUT);
  }
  if ((ev.ins && key !== XMP_KEY_OFF) || isDelayed) {
    /* Reset release/fadeout for instrument numbers with no keyoff/K00,
     * and on delayed rows. Other cases like note w/o ins# don't reset
     * fadeout (Cave Story - Last Battle.xm pos 11 chn 2). */
    xc.fadeout = 0x10000;
    RESET_NOTE(xc, NoteFlag.FADEOUT);
    RESET_NOTE(xc, NoteFlag.RELEASE | NoteFlag.SUSEXIT);

    if (sub !== null) {
      /* Only reset envelopes with a valid active instrument. */
      resetEnvelopes(core, xc);
    }

    /* Tremor count resets with fadeout (ft2_tremor_reset.xm). */
    xc.tremor.count = TREMOR_SUPPRESS;
  }

  /* TODO(C): this function needs checking, probably split. */
  setEffectDefaults(core, note, sub, xc, isToneporta !== 0);

  if (ev.ins) {
    /* Any ins.#: use active sample for defaults. Invalid samples have
     * volume 0 panning 0x80 (ft2_invalid_ins_defaults.xm). Works on lines
     * with K00 (ft2_k00_defaults.xm). */
    setChannelVolume(xc, sub ? sub.vol : 0);
    setChannelPan(xc, sub ? sub.pan : 0x80);
  }

  /* Process new volume */
  setChannelVolume(xc, ev.vol - 1);

  /* FT2: always reset sample offset */
  xc.offset.val = 0;

  /* Secondary effect handled first */
  processFx(core, xc, chn, ev, 1);
  processFx(core, xc, chn, ev, 0);
  setPeriodFt2(core, key, note, sub, xc, isToneporta !== 0);

  if (TEST(xc, VolSlideFlag.NEW_VOL) !== 0) {
    /* Tremor is reset by ins# without keyoff or by delay rows. Other
     * events that set volume also temporarily override tremor, but don't
     * reset it. (ft2_tremor_reset.xm, OpenMPT TremorRecover.xm) */
    xc.tremor.count |= TREMOR_SUPPRESS;
  }

  if (note >= 0) {
    /* Sample offset requires valid note + 9xx + !toneporta. In FT2, memory
     * is set ONLY in these cases, and offsets past the end of the sample
     * cut. (ft2_offset_memory.xm, OpenMPT 3xx-no-old-samp.xm) */
    if ((core.quirks & Quirk.FT2BUGS) !== 0 && TEST(xc, VolSlideFlag.OFFSET) !== 0) {
      xc.offset.memory = (xc.offset.val & 0xff00) >> 8;

      if (
        !isValidSample(core, xc.smp) ||
        xc.offset.val >= (core.getSample(xc.smp)?.length ?? 0)
      ) {
        core.virt.resetChannel(chn);
      }
    }
    core.virt.voicePos(chn, xc.offset.val);
  }
}

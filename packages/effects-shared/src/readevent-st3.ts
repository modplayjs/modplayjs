// read_event_st3 (reference/libxmp/src/read_event.c:736-933).

import type { ChannelState, Core, Event, SubInstrument } from '@modplayjs/core';
import { Quirk } from '@modplayjs/core';
import { RESET_NOTE, SET, SET_NOTE, TEST, isValidNote } from './helpers.js';
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
  setPeriod,
  isToneportaFx,
  setPatch,
} from './readevent.js';
import { processFx } from './process.js';

export function readEventSt3(core: Core, e: Event, chn: number): void {
  const mod = core.module!;
  const xc = core.ctx.channelStates[chn] as ChannelState;
  let note = -1;
  let sub: SubInstrument | null;
  let notSameIns = 0;
  let isToneporta = 0;

  xc.flags = 0;

  if (isToneportaFx(e.fxt) || isToneportaFx(e.f2t)) {
    isToneporta = 1;
  }

  if (core.virt.mapChannel(chn) < 0 && xc.ins !== e.ins - 1) {
    isToneporta = 0;
  }

  /* Check instrument */

  if (isValidNote(e.note - 1) && !isToneporta) {
    xc.key = e.note - 1;
  }
  if (e.ins) {
    const ins = e.ins - 1;
    SET(xc, VolSlideFlag.NEW_INS);
    xc.fadeout = 0x10000;
    xc.per_flags = 0;
    xc.offset.val = 0;
    RESET_NOTE(xc, NoteFlag.RELEASE | NoteFlag.FADEOUT);

    if (isValidInstrument(core, ins)) {
      if (xc.ins !== ins) {
        notSameIns = 1;
        if (!isToneporta) {
          xc.ins = ins;
          xc.ins_fade = getInstrument(core, ins)?.rls ?? 0;
        }
      }

      /* Get new instrument volume */
      sub = getSubinstrument(core, ins, xc.key);
      if (sub !== null && e.note !== /* XMP_KEY_OFF */ 0x81) {
        setChannelVolume(xc, sub.vol);
        setChannelPan(xc, sub.pan);
      }
    } else {
      /* Ignore invalid instruments */
      xc.flags = 0;
    }
  }

  /* Check note */

  if (e.note !== 0) {
    SET(xc, VolSlideFlag.NEW_NOTE);

    if (e.note === /* XMP_KEY_OFF */ 0x81) {
      SET_NOTE(xc, NoteFlag.RELEASE);
    } else if (isToneporta) {
      /* Always retrig in tone portamento: Fix portamento in 7spirits.s3m,
       * mod.Biomechanoid. */
      if (notSameIns) {
        xc.offset.val = 0;
      }
    } else if (isValidNote(e.note - 1)) {
      RESET_NOTE(xc, NoteFlag.END);

      sub = getSubinstrument(core, xc.ins, xc.key);

      if (sub !== null) {
        const transp = getInstrument(core, xc.ins)?.mapXpo[xc.key] ?? 0;
        let smp: number;

        note = xc.key + sub.xpo + transp;
        smp = sub.sid;

        if (!isValidSample(core, smp)) {
          smp = -1;
        }

        if (smp >= 0 && smp < mod.samples.length) {
          setPatch(core, chn, xc.ins, smp, note);
          xc.smp = smp;
        }
      } else {
        xc.flags = 0;
      }
    }
  }

  /* sub is now the currently playing subinstrument, which may not be
   * related to e.ins if there is active toneporta! */
  sub = getSubinstrument(core, xc.ins, xc.key);

  setEffectDefaults(core, note, sub, xc, isToneporta !== 0);
  if (e.ins && sub !== null) {
    resetEnvelopes(core, xc);
  }

  /* Process new volume */
  setChannelVolume(xc, e.vol - 1);

  /* Secondary effect handled first */
  processFx(core, xc, chn, e, 1);
  processFx(core, xc, chn, e, 0);
  setPeriod(core, note, sub, xc, isToneporta !== 0);

  if (sub === null) {
    return;
  }

  if (note >= 0) {
    xc.note = note;
    core.virt.voicePos(chn, xc.offset.val);
  }

  if ((core.quirks & Quirk.ST3BUGS) !== 0 && TEST(xc, VolSlideFlag.NEW_VOL) !== 0) {
    xc.volume = (xc.volume * core.ctx.p.gvol) / mod.volbase;
  }
}

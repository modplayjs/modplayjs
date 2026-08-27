// Shared event-reader prologue + per-format readers for MOD-family modules.
// Port of reference/libxmp/src/read_event.c libxmp_read_event (:1624-1664)
// and read_event_mod (:267-475). FT2/ST3 readers live in sibling files.

import type {
  ChannelState,
  Core,
  Event,
  ModuleData,
  SubInstrument,
} from '@modplayjs/core';
import { Quirk, ReadEventType, XMP_KEY_OFF } from '@modplayjs/core';
import {
  isToneportaFx,
  isSfxPitch,
  isModRetrig,
  setPatch,
  NoteFlag,
  RESET,
  RESET_NOTE,
  RESET_PER,
  SET,
  SET_NOTE,
  TEST,
  TEST_NOTE,
  VolSlideFlag,
  VOL_SLIDE,
  getSubinstrument,
  getInstrument,
  isValidInstrument,
  isValidNote,
  isValidSample,
  noteToPeriod,
  processFx,
  resetEnvelopes,
  setChannelPan,
  setChannelVolume,
  setEffectDefaults,
  setPeriod,
} from '@modplayjs/effects-shared';

// IS_TONEPORTA/IS_SFX_PITCH/IS_MOD_RETRIG + set_patch moved to
// effects-shared (read_event.c is shared player code, needed by fmt-s3m
// too); re-exported here for the MOD family.
export {
  isToneportaFx,
  isSfxPitch,
  isModRetrig,
  setPatch,
} from '@modplayjs/effects-shared';

/**
 * libxmp_read_event (read_event.c:1624-1664): old_ins update + NOTE_END
 * propagation from NOTE_SAMPLE_END, then per-format dispatch.
 *
 * The `chn >= mod.chn` smix branch is not reachable here: read_row only
 * iterates mod.chn channels and delayed events are only stored for
 * mod.chn channels (play_channel player.c:1619).
 */
export function readEventDispatch(core: Core, chn: number, row: number): void {
  const mod = core.module as ModuleData;
  const xc = core.ctx.channelStates[chn] as ChannelState;
  const e =
    core.readEventScratch(chn) ?? core.readEventAt(mod.xxo[core.ctx.p.ord] ?? 0, chn, row);

  if (e.ins !== 0) xc.old_ins = e.ins;

  if (TEST_NOTE(xc, NoteFlag.SAMPLE_END) !== 0) {
    SET_NOTE(xc, NoteFlag.END);
  }

  switch (mod.readEventType) {
    case ReadEventType.FT2:
      readEventFt2(core, e, chn);
      return;
    case ReadEventType.ST3:
      readEventSt3(core, e, chn);
      return;
    case ReadEventType.MOD:
    default:
      readEventMod(core, e, chn);
      return;
  }
}

export { readEventFt2 } from '@modplayjs/effects-shared';
import { readEventFt2 } from '@modplayjs/effects-shared';
import { readEventSt3 } from '@modplayjs/effects-shared';
/**
 * read_event_mod (read_event.c:267-475).
 */
export function readEventMod(core: Core, e: Event, chn: number): void {
  const mod = core.module as ModuleData;
  const xc = core.ctx.channelStates[chn] as ChannelState;
  let note = -1;
  let sub: SubInstrument | null = null;
  let newInvalidIns = 0;
  let newSwapIns = 0;
  let isToneporta = 0;
  let isRetrig = 0;

  xc.flags = 0;

  if (isToneportaFx(e.fxt) || isToneportaFx(e.f2t)) {
    isToneporta = 1;
  }
  if (isModRetrig(e.fxt, e.fxp) || isModRetrig(e.f2t, e.f2p)) {
    isRetrig = 1;
  }

  /* Check instrument */

  if (isValidNote(e.note - 1) && !isToneporta) {
    xc.key = e.note - 1;
  }
  if (e.ins) {
    const ins = e.ins - 1;
    SET(xc, VolSlideFlag.NEW_INS);
    xc.fadeout = 0x10000; /* for painlace.mod pat 0 ch 3 echo */
    xc.per_flags = 0;
    xc.offset.val = 0;
    RESET_NOTE(xc, NoteFlag.RELEASE | NoteFlag.FADEOUT);

    if (isValidInstrument(core, ins)) {
      sub = getSubinstrument(core, ins, xc.key);

      if (sub !== null) {
        newSwapIns = 1;

        /* Finetune is always loaded, but only applies when the period is
         * updated by a note/porta (OpenMPT finetune.mod, PortaSwapPT.mod). */
        if ((core.quirks & Quirk.PROTRACK) !== 0) {
          xc.finetune = sub.fin;
          xc.ins = ins;
        }

        /* Dennis Lindroos: instrument volume is not used on split channels. */
        if (xc.split === 0 && e.note !== XMP_KEY_OFF) {
          setChannelVolume(xc, sub.vol);
          setChannelPan(xc, sub.pan);
        }
      }

      if (!isToneporta) {
        xc.ins = ins;
        xc.ins_fade = (getInstrument(core, ins)?.rls) ?? 0;
      }
    } else {
      newInvalidIns = 1;

      /* Invalid instruments do not reset the channel in Protracker; they
       * set the current sample to the invalid sample, which stops it at
       * the end of its loop (OpenMPT PTInstrSwap.mod, PTSwapEmpty.mod). */
      if ((core.quirks & Quirk.PROTRACK) === 0 || isRetrig) {
        core.virt.resetChannel(chn);
      } else {
        core.virt.queuePatch(chn, -1, -1, 0);
      }
    }
  }

  /* Check note */

  if (e.note !== 0) {
    SET(xc, VolSlideFlag.NEW_NOTE);
    /* FunkTracker - new notes cancel persistent volume slide.
     * Farandole Composer notes are always paired with volume. */
    RESET_PER(xc, VOL_SLIDE);

    if (e.note === XMP_KEY_OFF) {
      SET_NOTE(xc, NoteFlag.RELEASE);
    } else if (!isToneporta && isValidNote(e.note - 1)) {
      RESET_NOTE(xc, NoteFlag.END);

      sub = getSubinstrument(core, xc.ins, xc.key);

      if (sub !== null) {
        const transp = getInstrument(core, xc.ins)?.mapXpo[xc.key] ?? 0;
        let smp: number;

        note = xc.key + sub.xpo + transp;
        smp = sub.sid;

        if (newInvalidIns || !isValidSample(core, smp)) {
          smp = -1;
        }

        if (smp >= 0 && smp < mod.samples.length) {
          setPatch(core, chn, xc.ins, smp, note);
          newSwapIns = 0;
          xc.smp = smp;
        }
      } else {
        xc.flags = 0;
        note = xc.key;
      }
    }

    if (note >= 0) {
      xc.note = note;
      SET_NOTE(xc, NoteFlag.SET);
    }
  }

  /* Protracker 1/2 sample swap occurs when a sample number is encountered
   * without a note or with a note and toneporta. The new instrument is
   * switched to when the current sample reaches its loop end. A valid note
   * must have been played in this channel before. Empty samples can also
   * be set, which stops the sample at the end of its loop. */
  if (
    newSwapIns !== 0 && sub !== null &&
    (core.quirks & Quirk.PROTRACK) !== 0 &&
    TEST_NOTE(xc, NoteFlag.SET) !== 0
  ) {
    core.virt.queuePatch(chn, e.ins - 1, sub.sid, xc.note);
    xc.smp = sub.sid;
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
  if (e.vol) {
    /* Farandole Composer - volume resets slide to volume. */
    RESET_PER(xc, VOL_SLIDE);
  }

  /* Secondary effect handled first */
  processFx(core, xc, chn, e, 1);
  processFx(core, xc, chn, e, 0);

  if (isSfxPitch(e.fxt)) {
    xc.period = noteToPeriod(mod.periodType, note, xc.finetune, xc.per_adj);
  } else {
    setPeriod(core, note, sub, xc, isToneporta !== 0);
  }

  if (sub === null) {
    return;
  }

  if (note >= 0 && !newInvalidIns) {
    core.virt.voicePos(chn, xc.offset.val);
  } else if (newSwapIns && isRetrig && (core.quirks & Quirk.PROTRACK) !== 0) {
    /* Protracker: an instrument number with no note and retrigger triggers
     * the new sample on tick 0. Other effects that set RETRIG should not.
     * (OpenMPT InstrSwapRetrigger.mod) */
    core.virt.voicePos(chn, 0);
  }

  if (TEST(xc, VolSlideFlag.OFFSET) !== 0) {
    // XMP_FLAGS_FX9BUG is a runtime flag we do not expose; accumulate is
    // PROTRACK-only parity for the non-CORE build without that flag.
    if ((core.quirks & Quirk.PROTRACK) !== 0) {
      xc.offset.val += xc.offset.val2;
    }
    RESET(xc, VolSlideFlag.OFFSET);
  }
}

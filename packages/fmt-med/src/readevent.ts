// SPDX-License-Identifier: BSD-3-Clause
// Copyright (c) 2026 Bitti09 — modplayjs contributors
// Ported from: libxmp src/read_event.c read_event_med (:1368-1519) +
// med_extras.c helpers. MED's own event reader.

import type { ChannelState, Core, Event, ModuleData, SubInstrument } from '@modplayjs/core';
import {
  NoteFlag,
  VolSlideFlag,
  XMP_KEY_CUT,
  XMP_KEY_OFF,
  type MedChannelExtras,
  type MedInstrumentExtras,
} from '@modplayjs/core';
import {
  RESET_NOTE,
  SET,
  SET_NOTE,
  getSubinstrument,
  isValidInstrument,
  isValidNote,
  isValidSample,
  setChannelVolume,
  setEffectDefaults,
  setPeriod,
  resetEnvelopes,
  processFx,
  medCheckHoldSymbol,
} from '@modplayjs/core';
import { MED_VER_OCTAMED_300, MMD3_DEFAULT_NOTE } from './mmdCommon.js';


/** Tracker version of the loaded module (MED_MODULE_EXTRAS). */
function trackerVersion(core: Core): number {
  const extras = core.module!.extras;
  return extras?.kind === 'med' ? extras.trackerVersion : 0;
}

/** libxmp_med_set_default_pitch_note (mmd_common.c:492-504): MED
 *  Soundstudio 2 mix mode default-note event (note 0x01). */
function setDefaultPitchNote(
  core: Core, ins: number, defaultPitch: number, ver: number,
): void {
  if (ver >= 3) {
    let note = MMD3_DEFAULT_NOTE;
    if (defaultPitch) note = defaultPitch - 1;
    const inst = core.module!.instruments[ins]!;
    if (note >= 0 && note < 121) inst.mapXpo[12] = note;
  }
}

/**
 * read_event_med (read_event.c:1368-1519).
 */
export function readEventMed(core: Core, e: Event, chn: number): void {
  const mod = core.module as ModuleData;
  const xc = core.ctx.channelStates[chn] as ChannelState;
  let note = -1;
  let sub: SubInstrument | null = null;
  let newInvalidIns = 0;
  let isToneporta = 0;
  const ce = xc.extras as MedChannelExtras | undefined;
  const trkVer = trackerVersion(core);

  xc.flags = 0;

  if (e.fxt === 0x03 /* FX_TONEPORTA */ || e.fxt === 0x05 /* FX_TONE_VSLIDE */) {
    isToneporta = 1;
  }

  // Check instrument.

  if (e.ins && e.note) {
    const ins = e.ins - 1;
    SET(xc, VolSlideFlag.NEW_INS);
    xc.fadeout = 0x10000;
    xc.offset.val = 0;
    RESET_NOTE(xc, NoteFlag.RELEASE | NoteFlag.FADEOUT);

    if (isValidInstrument(core, ins)) {
      if (!isToneporta) {
        const xxi = mod.instruments[ins]!;
        xc.ins = ins;
        xc.ins_fade = xxi.rls;

        const ie = xxi.extras as MedInstrumentExtras | undefined;
        if (ie && 'hold' in ie) {
          // libxmp_med_set_hold_decay (med_extras.c:140-152).
          if (ce) {
            let hold = ie.hold;
            let decay = ie.decay;
            if (hold <= 0) {
              hold = -1;
              decay = -1;
            }
            ce.hold_active = hold > 0 ? 1 : 0;
            ce.hold_count = hold;
            ce.decay_value = decay;
          }
        }
      }
    } else {
      newInvalidIns = 1;
      core.virt.resetChannel(chn);
    }

    if (ce) {
      ce.arp = 0;
      ce.aidx = 0;
    }
  }

  if (e.ins) {
    // Hold symbols apply default volume from OctaMED 3.00 onward,
    // but they do not in older trackers. All events with a note
    // and an instrument apply default volume.
    if (isValidNote(e.note - 1) || trkVer >= MED_VER_OCTAMED_300) {
      // Get new instrument volume.
      sub = getSubinstrument(core, e.ins - 1, e.note - 1);
      if (sub !== null) {
        setChannelVolume(xc, sub.vol);
      }
    }
  }

  // Check note.

  if (e.note) {
    SET(xc, VolSlideFlag.NEW_NOTE);

    if (e.note === XMP_KEY_OFF) {
      SET_NOTE(xc, NoteFlag.RELEASE);
    } else if (e.note === XMP_KEY_CUT) {
      SET_NOTE(xc, NoteFlag.END);
      xc.period = 0;
      core.virt.resetChannel(chn);
    } else if (!isToneporta && isValidInstrument(core, xc.ins) &&
               isValidNote(e.note - 1)) {
      const xxi = mod.instruments[xc.ins]!;

      xc.key = e.note - 1;
      RESET_NOTE(xc, NoteFlag.END);

      xc.per_adj = 0;
      const ie = xxi.extras as MedInstrumentExtras | undefined;
      if (xxi.nsm > 1 && ie && 'vts' in ie) {
        // synth or iffoct
        if (ie.vts === 0 && ie.wts === 0) {
          // iffoct
          xc.per_adj = 2.0;
        }
      }

      sub = getSubinstrument(core, xc.ins, xc.key);

      if (!newInvalidIns && sub !== null) {
        const transp = xxi.mapXpo[xc.key] ?? 0;
        let smp: number;

        note = xc.key + sub.xpo + transp;
        smp = sub.sid;

        if (!isValidSample(core, smp)) {
          smp = -1;
        }

        if (smp >= 0 && smp < mod.samples.length) {
          core.virt.setPatchSmp(chn, xc.ins, smp, note);
          xc.smp = smp;
        }
      } else {
        xc.flags = 0;
      }
    }
  }

  // sub is now the currently playing subinstrument, which may not be
  // related to e.ins if there is active toneporta!
  sub = getSubinstrument(core, xc.ins, xc.key);

  // Keep effect-set finetune if no instrument set.
  const finetune = xc.finetune;
  setEffectDefaults(core, note, sub, xc, isToneporta !== 0);
  if (!e.ins) {
    xc.finetune = finetune;
  }

  if (e.ins && sub !== null) {
    resetEnvelopes(core, xc);
    const ie = mod.instruments[e.ins - 1]?.extras;
    if (ie && 'default_pitch' in ie) {
      setDefaultPitchNote(core, e.ins - 1, ie.default_pitch, 3);
    }
  }

  // Process new volume.
  setChannelVolume(xc, e.vol - 1);

  // Secondary effect handled first.
  processFx(core, xc, chn, e, 1);
  processFx(core, xc, chn, e, 0);

  setPeriod(core, note, sub, xc, isToneporta !== 0);

  // Test next line for a hold symbol. Hold is set either by the
  // instrument or by command 08 Hold/Decay, so test after effects.
  medCheckHoldSymbol(core, xc, chn);

  if (sub === null) {
    return;
  }

  if (note >= 0) {
    xc.note = note;
    core.virt.voicePos(chn, xc.offset.val);
  }
}

